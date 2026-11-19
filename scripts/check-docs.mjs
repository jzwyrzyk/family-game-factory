#!/usr/bin/env node
// Read-only by default. Review stamps require an explicit area, outcome and reason.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, readlinkSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REGISTRY = 'docs/context/registry.json';
export const POLICY_AREA = 'context';
const outcomes = new Set(['updated', 'unchanged']);
const SHA256 = /^[a-f0-9]{64}$/;

export function matches(path, pattern) {
  let expression = '';
  for (let index = 0; index < pattern.length; index++) {
    if (pattern[index] === '*' && pattern[index + 1] === '*') {
      if (pattern[index + 2] === '/') { expression += '(?:.*/)?'; index += 2; }
      else { expression += '.*'; index++; }
    } else if (pattern[index] === '*') expression += '[^/]*';
    else expression += pattern[index].replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${expression}$`).test(path);
}

function git(root, ...args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 }).trim();
}

function trackedPaths(root) {
  return [...new Set(git(root, 'ls-files', '--cached', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean))]
    .filter(path => existsSync(resolve(root, path))).sort();
}

function validPath(path) {
  return typeof path === 'string' && path.length > 0 && !isAbsolute(path) && !path.split('/').includes('..') && !path.includes('\\');
}

export function specificReason(reason) {
  return typeof reason === 'string' && reason.trim().length >= 35 &&
    !/\b(?:TODO|TBD|PLACEHOLDER|EXPLAIN HERE|YOUR REASON)\b/i.test(reason) &&
    new Set(reason.toLowerCase().match(/[a-z]{2,}/g) || []).size >= 6;
}

function readRegistry(root) {
  return JSON.parse(readFileSync(resolve(root, REGISTRY), 'utf8'));
}

function normalizedPolicy(registry) {
  const sorted = array => [...new Set(array)].sort();
  return {
    version: registry.version,
    policyArea: POLICY_AREA,
    coverageExcludes: sorted(registry.coverageExcludes),
    requiredDocuments: sorted(registry.requiredDocuments),
    linkCheckPatterns: sorted(registry.linkCheckPatterns),
    areas: registry.areas.map(area => ({ id: area.id, sources: sorted(area.sources), documents: sorted(area.documents), reviewAfterDays: area.reviewAfterDays }))
      .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
  };
}

export function sourceDigest(root, area, paths = trackedPaths(root), registry = readRegistry(root)) {
  if (area.id !== POLICY_AREA && area.sources.some(pattern => matches(REGISTRY, pattern))) throw new Error(`${area.id}: source routes must not include ${REGISTRY}; registry policy belongs to ${POLICY_AREA}.`);
  const hash = createHash('sha256');
  hash.update(JSON.stringify({ sources: [...new Set(area.sources)].sort(), documents: [...new Set(area.documents)].sort() }));
  // Review fields are deliberately excluded, preventing a self-changing digest.
  // All global policy and area definitions belong to the mandatory context area.
  if (area.id === POLICY_AREA) hash.update(JSON.stringify(normalizedPolicy(registry)));
  const selected = paths.filter(path => path !== REGISTRY && area.sources.some(pattern => matches(path, pattern)));
  for (const path of selected) {
    const full = resolve(root, path);
    const contents = lstatSync(full).isSymbolicLink() ? Buffer.from(`symlink:${readlinkSync(full)}`) : readFileSync(full);
    hash.update(`\0${path}\0${contents.length}\0`);
    hash.update(contents);
  }
  return hash.digest('hex');
}

function registryErrors(registry) {
  const errors = [];
  if (registry.version !== 1) errors.push('Registry version must be 1.');
  for (const name of ['coverageExcludes', 'requiredDocuments', 'linkCheckPatterns']) {
    if (!Array.isArray(registry[name]) || !registry[name].every(validPath)) errors.push(`${name} must contain repository-relative paths or glob patterns.`);
  }
  if (!Array.isArray(registry.areas) || !registry.areas.length) return [...errors, 'Registry needs at least one area.'];
  const ids = new Set();
  for (const area of registry.areas) {
    if (!/^[a-z][a-z0-9-]*$/.test(area.id || '') || ids.has(area.id)) errors.push(`Invalid or duplicate area id: ${area.id}.`);
    ids.add(area.id);
    for (const name of ['documents', 'sources']) {
      if (!Array.isArray(area[name]) || !area[name].length || !area[name].every(validPath)) errors.push(`${area.id}: ${name} needs relative paths or globs.`);
    }
    if (area.id !== POLICY_AREA && Array.isArray(area.sources) && area.sources.some(pattern => matches(REGISTRY, pattern))) errors.push(`${area.id}: source routes must not include ${REGISTRY}; registry policy belongs to ${POLICY_AREA}.`);
    if (!Number.isInteger(area.reviewAfterDays) || area.reviewAfterDays < 1 || area.reviewAfterDays > 365) errors.push(`${area.id}: reviewAfterDays must be 1–365.`);
    if (!SHA256.test(area.sourceDigest || '')) errors.push(`${area.id}: missing valid sourceDigest; explicitly review this area.`);
    if (!/^\d{4}-\d{2}-\d{2}T/.test(area.reviewedAt || '') || !Number.isFinite(Date.parse(area.reviewedAt))) errors.push(`${area.id}: reviewedAt needs an ISO timestamp.`);
    if (!outcomes.has(area.reviewOutcome)) errors.push(`${area.id}: reviewOutcome must be updated or unchanged.`);
    if (!specificReason(area.reviewReason)) errors.push(`${area.id}: reviewReason needs a specific explanation (35+ characters, no placeholder).`);
  }
  if (!ids.has(POLICY_AREA)) errors.push(`The ${POLICY_AREA} area is required to review the registry policy; it cannot be removed.`);
  return errors;
}

function localLinks(text) {
  // This intentionally checks local file targets, not remote URLs or heading anchors.
  const prose = text.replace(/^\s*(```|~~~)[\s\S]*?^\s*\1\s*$/gm, '').replace(/`[^`\n]+`/g, '');
  const inline = [...prose.matchAll(/!?\[[^\]\n]*\]\((<[^>\n]+>|[^\s)]+)(?:\s+["'][^\n]*["'])?\)/g)].map(m => m[1]);
  const definitions = [...prose.matchAll(/^\s{0,3}\[[^\]\n]+\]:\s*(<[^>\n]+>|\S+)/gm)].map(m => m[1]);
  return [...inline, ...definitions].map(s => s.replace(/^<|>$/g, ''));
}

function checkLinks(root, path) {
  const errors = [];
  for (const target of localLinks(readFileSync(resolve(root, path), 'utf8'))) {
    if (/^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(target)) continue;
    let file;
    try { file = decodeURIComponent(target.split('#')[0].split('?')[0]); }
    catch { errors.push(`${path}: invalid encoded link ${target}`); continue; }
    if (!file) continue;
    const resolved = resolve(dirname(resolve(root, path)), file);
    const within = relative(root, resolved);
    if (within === '..' || within.startsWith(`..${sep}`) || isAbsolute(within) || !existsSync(resolved)) errors.push(`${path}: missing or out-of-repository local target ${target}`);
  }
  return errors;
}

function changedPaths(root, base, head) {
  if (!base || !head || /^0+$/.test(base)) return [];
  if (!/^[a-f0-9]{7,40}$/.test(base) || !/^[a-f0-9]{7,40}$/.test(head)) throw new Error('Diff refs must be commit SHAs, not expressions or options.');
  return git(root, 'diff', '--name-only', '--no-renames', '-z', `${base}...${head}`).split('\0').filter(Boolean);
}

function policyChanged(root, base, head) {
  // The first introduction of the registry has no baseline policy.
  const mergeBase = git(root, 'merge-base', base, head);
  let previous;
  try { previous = JSON.parse(git(root, 'show', `${mergeBase}:${REGISTRY}`)); } catch { return true; }
  const next = JSON.parse(git(root, 'show', `${head}:${REGISTRY}`));
  return JSON.stringify(normalizedPolicy(previous)) !== JSON.stringify(normalizedPolicy(next));
}

export function check(root, { base, head, now = new Date() } = {}) {
  const result = { errors: [], warnings: [], areas: [], checkedLinks: [], changedPaths: [] };
  let registry;
  try { registry = readRegistry(root); } catch (error) { result.errors.push(`Cannot read ${REGISTRY}: ${error.message}`); return result; }
  result.errors.push(...registryErrors(registry));
  if (result.errors.length) return result;
  if (Boolean(base) !== Boolean(head)) result.errors.push('Supply both --base and --head to validate a change range.');
  const paths = trackedPaths(root);
  try { result.changedPaths = changedPaths(root, base, head); } catch (error) { result.errors.push(`Cannot inspect change range: ${error.message}`); }
  let changedPolicy = false;
  if (base && head && result.changedPaths.includes(REGISTRY)) {
    try { changedPolicy = policyChanged(root, base, head); } catch (error) { result.errors.push(`Cannot inspect registry policy change: ${error.message}`); }
  }
  for (const path of registry.requiredDocuments) if (!existsSync(resolve(root, path))) result.errors.push(`Required context document is missing: ${path}`);
  for (const path of paths) {
    if (registry.coverageExcludes.some(pattern => matches(path, pattern))) continue;
    if (!registry.areas.some(area => area.sources.some(pattern => matches(path, pattern)))) result.errors.push(`Unmapped source path: ${path}. Add an appropriate registry area/source route and review its documentation.`);
  }
  result.checkedLinks = paths.filter(path => registry.linkCheckPatterns.some(pattern => matches(path, pattern)));
  for (const path of result.checkedLinks) result.errors.push(...checkLinks(root, path));
  for (const area of registry.areas) {
    const sources = paths.filter(path => path !== REGISTRY && area.sources.some(pattern => matches(path, pattern)));
    if (!sources.length) result.errors.push(`${area.id}: no source files match the registered routes.`);
    for (const pattern of area.documents) if (!paths.some(path => matches(path, pattern))) result.errors.push(`${area.id}: no document matches ${pattern}.`);
    const digest = sourceDigest(root, area, paths, registry);
    const current = digest === area.sourceDigest;
    if (!current) result.errors.push(`${area.id}: source content or routing changed since documentation review. Current digest: ${digest}. Inspect the affected docs, then run docs:review for this area.`);
    const ageDays = (now.getTime() - Date.parse(area.reviewedAt)) / 86400000;
    if (ageDays < -1) result.errors.push(`${area.id}: review timestamp is more than one day in the future.`);
    if (ageDays > area.reviewAfterDays) result.warnings.push(`${area.id}: last reviewed ${Math.floor(ageDays)} days ago (review interval ${area.reviewAfterDays} days). Recheck intent, external evidence and linked decisions; do not just advance the date.`);
    const changedSources = result.changedPaths.filter(path => path !== REGISTRY && area.sources.some(pattern => matches(path, pattern)));
    if (area.id === POLICY_AREA && changedPolicy) changedSources.push(REGISTRY);
    const changedDocuments = result.changedPaths.filter(path => area.documents.some(pattern => matches(path, pattern)));
    if (changedSources.length && area.reviewOutcome === 'updated' && !changedDocuments.length) result.errors.push(`${area.id}: review says updated, but no routed document changed in this PR/range. Update the relevant document or record an honest unchanged review with a specific reason.`);
    result.areas.push({ id: area.id, current, sourceFiles: sources.length, reviewedAt: area.reviewedAt, reviewOutcome: area.reviewOutcome, changedSources, changedDocuments });
  }
  return result;
}

export function refresh(root, id, outcome, reason, now = new Date()) {
  if (!outcomes.has(outcome)) throw new Error('Supply --outcome updated or --outcome unchanged.');
  if (!specificReason(reason)) throw new Error('Supply --reason with a specific review explanation (35+ characters, at least six distinct words, no placeholder).');
  const registry = readRegistry(root);
  const area = registry.areas.find(candidate => candidate.id === id);
  if (!area) throw new Error(`Unknown area ${id}. Choose one of: ${registry.areas.map(a => a.id).join(', ')}.`);
  // No broad/all mode: every area requires its own explicit review decision.
  area.sourceDigest = sourceDigest(root, area);
  area.reviewedAt = now.toISOString();
  area.reviewOutcome = outcome;
  area.reviewReason = reason.trim();
  writeFileSync(resolve(root, REGISTRY), `${JSON.stringify(registry, null, 2)}\n`);
  return area;
}

export function markdownReport(result) {
  return ['# Documentation context check', '', `Result: ${result.errors.length ? 'FAILED' : 'PASSED'}; ${result.errors.length} error(s), ${result.warnings.length} review reminder(s).`, '',
    'This checks source fingerprints, review records, routing and local file links. It does not prove prose accuracy, external service state, deployment, learning efficacy or human approval.', '',
    '| Area | Source review current | Review outcome | Reviewed at (UTC) |', '| --- | --- | --- | --- |',
    ...result.areas.map(area => `| ${area.id} | ${area.current ? 'yes' : 'NO'} | ${area.reviewOutcome} | ${area.reviewedAt} |`), '',
    '## Errors', '', ...(result.errors.length ? result.errors.map(s => `- ${s}`) : ['None.']), '', '## Review reminders', '',
    ...(result.warnings.length ? result.warnings.map(s => `- ${s}`) : ['None.']), '',
    `Local file links checked in ${result.checkedLinks.length} registered documents; external URLs and heading anchors are outside this check.`, ''].join('\n');
}

function argumentsFor(argv) {
  const args = { command: argv[0] || 'check' };
  let index = 1;
  if (args.command === 'refresh') args.id = argv[index++];
  for (; index < argv.length; index += 2) {
    if (!['--base', '--head', '--reason', '--outcome', '--report'].includes(argv[index]) || !argv[index + 1]) throw new Error(`Unknown or incomplete argument ${argv[index]}.`);
    args[argv[index].slice(2)] = argv[index + 1];
  }
  return args;
}

function eventRange() {
  if (!process.env.GITHUB_EVENT_PATH) return {};
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  if (process.env.GITHUB_EVENT_NAME === 'pull_request') return { base: event.pull_request.base.sha, head: event.pull_request.head.sha };
  if (process.env.GITHUB_EVENT_NAME === 'push') return { base: event.before, head: event.after };
  return {};
}

function main() {
  try {
    const args = argumentsFor(process.argv.slice(2));
    const root = git(process.cwd(), 'rev-parse', '--show-toplevel');
    if (args.command === 'refresh') {
      const area = refresh(root, args.id, args.outcome, args.reason);
      console.log(`Recorded ${area.id} review (${area.reviewOutcome}). Commit ${REGISTRY} with the related change; this command does not verify the truth of the review.`);
      return;
    }
    if (args.command !== 'check') throw new Error('Use check or refresh <area>.');
    const result = check(root, { ...eventRange(), ...(args.base ? { base: args.base } : {}), ...(args.head ? { head: args.head } : {}) });
    const report = markdownReport(result);
    console.log(report);
    if (args.report) { mkdirSync(dirname(resolve(args.report)), { recursive: true }); writeFileSync(resolve(args.report), report); }
    if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, report, { flag: 'a' });
    process.exitCode = result.errors.length ? 1 : 0;
  } catch (error) { console.error(`Documentation check failed: ${error.message}`); process.exitCode = 1; }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
