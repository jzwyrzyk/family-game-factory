#!/usr/bin/env node
/** Provision only the named pilot reports. Default execution performs no network requests. */
import { pathToFileURL } from 'node:url';
import { buildDashboard, MANAGED_TAG, selection } from './dashboard.mjs';

const CLOUD_HOSTS = new Set(['https://us.posthog.com', 'https://eu.posthog.com']);

class SetupError extends Error {}
const fail = message => { throw new SetupError(message); };

export function parseArgs(args) {
  const options = { apply: false };
  let dryRun = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--apply') options.apply = true;
    else if (arg === '--dry-run') dryRun = true;
    else if (arg === '--help') options.help = true;
    else if (arg === '--environment' || arg === '--audience') {
      if (!args[i + 1] || args[i + 1].startsWith('--')) fail('A selection option is missing its value.');
      options[arg.slice(2)] = args[++i];
    } else fail('Unknown option. Use --help for supported options.');
  }
  if (dryRun && options.apply) fail('Choose --apply or --dry-run, not both.');
  try { return { ...options, ...selection(options) }; }
  catch { return fail('Use a supported environment and audience. See --help.'); }
}

export function readCredentials(env) {
  const host = env.JEMS_POSTHOG_API_HOST;
  const projectId = env.JEMS_POSTHOG_PROJECT_ID;
  const apiKey = env.JEMS_POSTHOG_PERSONAL_API_KEY;
  if (!CLOUD_HOSTS.has(host)) fail('JEMS_POSTHOG_API_HOST must be the exact US or EU PostHog management origin.');
  if (typeof projectId !== 'string' || !/^[1-9][0-9]{0,15}$/.test(projectId)) {
    fail('Set JEMS_POSTHOG_PROJECT_ID to the intended numeric project ID.');
  }
  if (typeof apiKey !== 'string' || apiKey.length < 16 || /[\s\r\n]/.test(apiKey)) {
    fail('Set JEMS_POSTHOG_PERSONAL_API_KEY through the operator environment.');
  }
  return { host, projectId, apiKey };
}

export function makeClient(credentials, fetcher = globalThis.fetch) {
  const prefix = `/api/projects/${credentials.projectId}/`;
  function checkedUrl(path) {
    let url;
    try { url = new URL(path, credentials.host); } catch { return fail('PostHog returned an invalid resource URL.'); }
    if (url.origin !== credentials.host || !url.pathname.startsWith(prefix) || url.username || url.password || url.hash) {
      fail('PostHog returned a resource outside the selected project.');
    }
    return url;
  }
  async function request(method, path, body) {
    const url = checkedUrl(path);
    let response;
    try {
      response = await fetcher(url.href, {
        method, redirect: 'error', signal: AbortSignal.timeout(30_000),
        headers: { Authorization: `Bearer ${credentials.apiKey}`, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch { return fail('PostHog request did not complete. No automatic retry was attempted; inspect the project before rerunning.'); }
    if (!response.ok) {
      const status = Number.isInteger(response.status) ? response.status : 'unknown';
      // Never print a response body: it can echo credentials, query values or user data.
      fail(`PostHog rejected a ${method} request (HTTP ${status}). Inspect permissions and the reviewed payload; response content was withheld.`);
    }
    try {
      const text = await response.text();
      if (text.length > 5_000_000) fail('PostHog response exceeded the setup metadata limit.');
      return text ? JSON.parse(text) : null;
    } catch (error) {
      if (error instanceof SetupError) throw error;
      return fail('PostHog returned an unreadable response. Inspect the project before rerunning.');
    }
  }
  async function list(resource) {
    const pathname = `${prefix}${resource}/`;
    // Insight membership is optional in list responses. Request it explicitly
    // so applying managed definitions cannot detach a manually added dashboard.
    let next = `${pathname}?limit=100${resource === 'insights' ? '&include_dashboards=true' : ''}`;
    const seen = new Set();
    const results = [];
    for (let page = 0; next && page < 100; page++) {
      const url = checkedUrl(next);
      if (url.pathname !== pathname || seen.has(url.href)) fail('PostHog pagination is not a safe continuation.');
      seen.add(url.href);
      const data = await request('GET', url.href);
      if (!data || !Array.isArray(data.results)) fail('PostHog returned an unexpected list response.');
      results.push(...data.results);
      if (data.next != null && typeof data.next !== 'string') fail('PostHog returned an invalid pagination value.');
      next = data.next;
    }
    if (next) fail('PostHog has more metadata pages than this bounded setup supports. Nothing was changed.');
    return results;
  }
  return { prefix, request, list };
}

function tagsOf(resource) {
  return Array.isArray(resource?.tags) ? resource.tags.filter(tag => typeof tag === 'string') : [];
}
function idOf(resource) {
  if (!Number.isSafeInteger(resource?.id) || resource.id <= 0) fail('PostHog returned an invalid resource ID.');
  return resource.id;
}
function ownedResource(resources, marker, name) {
  const active = resources.filter(resource => !resource?.deleted);
  const matches = active.filter(resource => tagsOf(resource).includes(MANAGED_TAG) && tagsOf(resource).includes(marker));
  if (matches.length > 1) fail('More than one resource has the same pilot marker. Resolve the duplicate before setup. Nothing was changed.');
  if (!matches.length && active.some(resource => resource.name === name)) {
    fail('A resource with the intended name exists without this pilot marker. Review it explicitly; setup will not overwrite it.');
  }
  if (matches[0]) idOf(matches[0]);
  return matches[0];
}

/**
 * All checks and SQL validation precede writes. Reapplication updates only
 * resources with exact managed tags; unrelated tags and dashboard memberships
 * survive. A failed POST is never blindly replayed.
 */
export async function provision(plan, client) {
  const [dashboards, insights] = await Promise.all([client.list('dashboards'), client.list('insights')]);
  const dashboardMarker = plan.dashboard.tags[1];
  const existingDashboard = ownedResource(dashboards, dashboardMarker, plan.dashboard.name);
  const existingInsights = plan.insights.map(insight => ownedResource(insights, insight.key, insight.name));
  if (existingDashboard?.is_shared === true) fail('The managed dashboard is publicly shared. Review sharing before this setup can update it.');
  if (existingInsights.some(insight => insight && !Array.isArray(insight.dashboards))) {
    fail('PostHog omitted existing insight dashboard memberships. Setup stopped before changing definitions.');
  }

  // Validate aggregate SQL against the actual project dialect before mutation.
  // Query results stay in memory and are never printed or written to disk.
  for (const insight of plan.insights) {
    const result = await client.request('POST', `${client.prefix}query/`, {
      query: insight.query.source, refresh: 'blocking',
    });
    if (!result || result.error || result.exception || result.hasMore === true || !Array.isArray(result.results) ||
        (result.query_status && result.query_status.complete !== true)) {
      fail('A report could not be validated synchronously. No dashboard definitions were changed.');
    }
  }

  const dashboardBody = {
    ...plan.dashboard,
    tags: [...new Set([...tagsOf(existingDashboard), ...plan.dashboard.tags])],
  };
  const dashboard = await client.request(existingDashboard ? 'PATCH' : 'POST',
    `${client.prefix}dashboards/${existingDashboard ? `${idOf(existingDashboard)}/` : ''}`, dashboardBody);
  const dashboardId = idOf(dashboard);
  if (dashboard.is_shared === true) fail('PostHog returned a shared dashboard. Stop and review its sharing configuration.');

  let created = 0;
  let updated = 0;
  for (let i = 0; i < plan.insights.length; i++) {
    const { key: _key, ...definition } = plan.insights[i];
    const existing = existingInsights[i];
    const memberships = Array.isArray(existing?.dashboards)
      ? existing.dashboards.filter(id => Number.isSafeInteger(id) && id > 0) : [];
    const body = {
      ...definition,
      tags: [...new Set([...tagsOf(existing), ...definition.tags])],
      dashboards: [...new Set([...memberships, dashboardId])],
    };
    const saved = await client.request(existing ? 'PATCH' : 'POST',
      `${client.prefix}insights/${existing ? `${idOf(existing)}/` : ''}`, body);
    idOf(saved);
    if (existing) updated++; else created++;
  }
  return { dashboardId, dashboardCreated: !existingDashboard, insightsCreated: created, insightsUpdated: updated };
}

export async function main(args = process.argv.slice(2), env = process.env, fetcher = globalThis.fetch, output = console.log) {
  try {
    const options = parseArgs(args);
    if (options.help) {
      output('Jems PostHog pilot\n\nDefault: offline dry-run, staging/adult, no credentials needed.\n\nnode scripts/analytics/bootstrap.mjs [--dry-run | --apply] [--environment development|staging|test|production] [--audience adult|child]\n\n--apply validates report queries and writes only this selection\'s tagged dashboard/insights. Required environment: JEMS_POSTHOG_API_HOST, JEMS_POSTHOG_PROJECT_ID, JEMS_POSTHOG_PERSONAL_API_KEY. Required API scopes: query:read, dashboard:write, insight:write.');
      return 0;
    }
    const plan = buildDashboard(options);
    if (!options.apply) {
      output(JSON.stringify({ mode: 'offline-dry-run', ...plan }, null, 2));
      return 0;
    }
    const credentials = readCredentials(env);
    const result = await provision(plan, makeClient(credentials, fetcher));
    output(`Jems pilot dashboard ${result.dashboardCreated ? 'created' : 'updated'}; ${result.insightsCreated} reports created, ${result.insightsUpdated} reports updated. No event capture or public sharing was enabled.`);
    output(`${credentials.host}/project/${credentials.projectId}/dashboard/${result.dashboardId}`);
    return 0;
  } catch (error) {
    output(error instanceof SetupError ? error.message : 'PostHog setup stopped. Details were withheld to keep credentials and project data out of logs.');
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
