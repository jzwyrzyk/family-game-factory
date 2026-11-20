import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { buildDashboard, EVENTS, selection } from './dashboard.mjs';
import { main, makeClient, parseArgs } from './bootstrap.mjs';

const env = {
  JEMS_POSTHOG_API_HOST: 'https://us.posthog.com',
  JEMS_POSTHOG_PROJECT_ID: '123',
  JEMS_POSTHOG_PERSONAL_API_KEY: 'synthetic-secret-do-not-print',
};
const jsonResponse = data => new Response(JSON.stringify(data), { status: 200 });

function fakeProject() {
  const state = { dashboards: [], insights: [], calls: [], nextId: 100, rejectQuery: false, failCreate: 0 };
  const fetcher = async (url, options) => {
    state.calls.push({ url, method: options.method, body: options.body ? JSON.parse(options.body) : null });
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, `Bearer ${env.JEMS_POSTHOG_PERSONAL_API_KEY}`);
    const path = new URL(url).pathname;
    if (path.endsWith('/query/')) return jsonResponse(state.rejectQuery ? { error: 'synthetic-query-failure' } : { results: [], columns: [] });
    const match = path.match(/^\/api\/projects\/123\/(dashboards|insights)\/(\d+\/)?$/);
    assert.ok(match, 'only approved project resources are requested');
    const resource = match[1];
    const records = state[resource];
    if (options.method === 'GET') {
      const results = structuredClone(records);
      if (resource === 'insights' && new URL(url).searchParams.get('include_dashboards') !== 'true') {
        results.forEach(record => { delete record.dashboards; });
      }
      return jsonResponse({ results, next: null });
    }
    const body = JSON.parse(options.body);
    if (options.method === 'POST') {
      const value = { ...body, id: state.nextId++, is_shared: false };
      records.push(value);
      if (resource === 'insights' && state.failCreate && records.length === state.failCreate) throw new Error('ambiguous network failure');
      return jsonResponse(value);
    }
    assert.equal(options.method, 'PATCH');
    const existing = records.find(record => record.id === Number(match[2].slice(0, -1)));
    assert.ok(existing);
    Object.assign(existing, body);
    return jsonResponse(existing);
  };
  return { state, fetcher };
}

test('default dry-run has no network or credential requirement and contains five aggregate reports', async () => {
  const output = [];
  let calls = 0;
  assert.equal(await main([], env, () => { calls++; throw Error('network forbidden'); }, value => output.push(value)), 0);
  assert.equal(calls, 0);
  const plan = JSON.parse(output[0]);
  assert.equal(plan.mode, 'offline-dry-run');
  assert.deepEqual(plan.selection, { environment: 'staging', audience: 'adult' });
  assert.equal(plan.insights.length, 5);
  assert.ok(!output.join('').includes(env.JEMS_POSTHOG_PERSONAL_API_KEY));
  assert.throws(() => selection({ audience: "adult' OR 1=1" }));
  assert.throws(() => parseArgs(['--apply', '--dry-run']));
});

test('apply validates every query before writes and reapplication updates the same resources', async () => {
  const { state, fetcher } = fakeProject();
  const output = [];
  assert.equal(await main(['--apply'], env, fetcher, value => output.push(value)), 0);
  assert.equal(state.dashboards.length, 1);
  assert.equal(state.insights.length, 5);
  const firstWrite = state.calls.findIndex(call => call.method === 'POST' && !call.url.endsWith('/query/'));
  assert.equal(state.calls.slice(0, firstWrite).filter(call => call.url.endsWith('/query/')).length, 5);
  state.insights[0].tags.push('human-added-tag');
  state.insights[0].dashboards.push(999);
  state.insights.push({ id: 900, name: 'Unrelated report', tags: [], query: { kind: 'HogQLQuery', query: 'SELECT 1' } });
  const before = structuredClone(state.insights[5]);
  assert.equal(await main(['--apply'], env, fetcher, value => output.push(value)), 0);
  assert.equal(state.dashboards.length, 1);
  assert.equal(state.insights.length, 6);
  assert.deepEqual(state.insights[5], before);
  assert.ok(state.insights[0].tags.includes('human-added-tag'));
  assert.ok(state.insights[0].dashboards.includes(999));
  assert.ok(!output.join('').includes(env.JEMS_POSTHOG_PERSONAL_API_KEY));
});

test('different audience and environment create separate managed dashboards', async () => {
  const { state, fetcher } = fakeProject();
  assert.equal(await main(['--apply'], env, fetcher, () => {}), 0);
  assert.equal(await main(['--apply', '--audience', 'child', '--environment', 'test'], env, fetcher, () => {}), 0);
  assert.equal(state.dashboards.length, 2);
  assert.equal(state.insights.length, 10);
  assert.notEqual(state.insights[0].name, state.insights[5].name);
});

test('duplicate managed metadata and failed query validation cause zero definition writes', async () => {
  const { state, fetcher } = fakeProject();
  const plan = buildDashboard();
  state.dashboards.push({ id: 1, ...plan.dashboard }, { id: 2, ...plan.dashboard });
  assert.equal(await main(['--apply'], env, fetcher, () => {}), 1);
  assert.equal(state.calls.filter(call => call.method !== 'GET').length, 0);
  state.dashboards = [];
  state.rejectQuery = true;
  assert.equal(await main(['--apply'], env, fetcher, () => {}), 1);
  assert.equal(state.dashboards.length, 0);
  assert.equal(state.insights.length, 0);
});

test('missing membership metadata stops an update before it can detach a managed insight', async () => {
  const { state, fetcher } = fakeProject();
  const plan = buildDashboard();
  state.insights.push({ id: 1, ...plan.insights[0] });
  const output = [];
  assert.equal(await main(['--apply'], env, fetcher, value => output.push(value)), 1);
  assert.match(output.join(''), /omitted existing insight dashboard memberships/);
  assert.equal(state.calls.filter(call => call.method !== 'GET').length, 0);
});

test('ambiguous create is not retried, and a later explicit run recovers without duplicate reports', async () => {
  const { state, fetcher } = fakeProject();
  state.failCreate = 2;
  assert.equal(await main(['--apply'], env, fetcher, () => {}), 1);
  assert.equal(state.insights.length, 2);
  assert.equal(state.calls.filter(call => call.method === 'POST' && call.url.endsWith('/insights/')).length, 2);
  state.failCreate = 0;
  assert.equal(await main(['--apply'], env, fetcher, () => {}), 0);
  assert.equal(state.insights.length, 5);
  assert.equal(state.dashboards.length, 1);
});

test('unsafe hosts, cross-origin pagination, redirects and response bodies cannot disclose credentials', async () => {
  let calls = 0;
  const output = [];
  assert.equal(await main(['--apply'], { ...env, JEMS_POSTHOG_API_HOST: 'https://us.posthog.com.evil.invalid' }, () => { calls++; }, value => output.push(value)), 1);
  assert.equal(calls, 0);
  const client = makeClient({ host: env.JEMS_POSTHOG_API_HOST, projectId: '123', apiKey: env.JEMS_POSTHOG_PERSONAL_API_KEY }, async () => {
    calls++;
    return jsonResponse({ results: [], next: 'https://evil.invalid/steal' });
  });
  await assert.rejects(client.list('dashboards'), /outside the selected project/);
  assert.equal(calls, 1);
  assert.equal(await main(['--apply'], env, async () => new Response(env.JEMS_POSTHOG_PERSONAL_API_KEY, { status: 403 }), value => output.push(value)), 1);
  assert.ok(!output.join('').includes(env.JEMS_POSTHOG_PERSONAL_API_KEY));
});

const NOW = 1_800_000_000;
const DAY = 86400;
function event(name, person, age, properties = {}) {
  return { event: `jems_${name}`, distinct_id: person, timestamp: NOW - age,
    properties: { schema_version: 1, environment: 'staging', audience: 'adult', release: 'release-a', source: 'client', ...properties } };
}
function runQueries(events, scope = {}) {
  const plan = buildDashboard(scope);
  const queries = Object.fromEntries(plan.insights.map(insight => [insight.key.split(':').at(-1), insight.query.source.query]));
  const result = spawnSync('python3', [fileURLToPath(new URL('./sql-fixture-runner.py', import.meta.url))], {
    input: JSON.stringify({ now: NOW, events, queries }), encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('creation SQL correlates the same person/creation/job, allows retries, and excludes immature/local/mock journeys', () => {
  const events = [];
  const start = (person, creation, age, extra = {}) => events.push(event('journey_started', person, age, { creation_id: creation, creation_mode: 'generated', ...extra }));
  const stage = (name, person, creation, job, age, extra = {}) => events.push(event(name, person, age, {
    creation_id: creation, job_id: job, source: name === 'game_play_started' ? 'client' : 'server',
    build_adapter: 'metered-api', game_id: `game-${creation}`, revision_id: `revision-${job}`, ...extra,
  }));
  start('a', 'a1', 3 * DAY);
  stage('creation_submitted', 'a', 'a1', 'failed-attempt', 3 * DAY - 10);
  stage('creation_failed', 'a', 'a1', 'failed-attempt', 3 * DAY - 20);
  stage('creation_submitted', 'a', 'a1', 'good-attempt', 3 * DAY - 30);
  stage('creation_completed', 'a', 'a1', 'good-attempt', 3 * DAY - 90);
  stage('game_play_started', 'a', 'a1', 'good-attempt', 3 * DAY - 91, { game_id: 'unrelated-game' });
  stage('game_play_started', 'a', 'a1', 'good-attempt', 3 * DAY - 92, { revision_id: 'unrelated-revision' });
  stage('game_play_started', 'a', 'a1', 'good-attempt', 3 * DAY - 100);
  events.push(structuredClone(events.at(-1))); // Duplicate play does not create another conversion.
  start('b', 'b1', 3 * DAY);
  stage('creation_submitted', 'b', 'b1', 'no-result', 3 * DAY - 10);
  stage('creation_completed', 'b', 'unrelated-creation', 'other-job', 3 * DAY - 30);
  stage('game_play_started', 'b', 'unrelated-creation', 'other-job', 3 * DAY - 40);
  // A browser-made ready claim must not credit completion.
  stage('creation_completed', 'b', 'b1', 'no-result', 3 * DAY - 50, { source: 'client' });
  start('young', 'new', 3600);
  start('local', 'scene', 3 * DAY, { creation_mode: 'scene' });
  start('mock', 'mock-create', 3 * DAY);
  stage('creation_submitted', 'mock', 'mock-create', 'mock-job', 3 * DAY - 10, { build_adapter: 'mock' });
  const results = runQueries(events);
  const funnel = results['first-creation'][0];
  assert.equal(funnel.mature_first_journeys, 2);
  assert.equal(funnel.submitted_within_24h, 2);
  assert.equal(funnel.server_ready_within_24h, 1);
  assert.equal(funnel.same_result_played_within_24h, 1);
  assert.equal(funnel.journey_to_play_percent, 50);
  assert.equal(results['generation-outcomes'][0].submitted_attempts_with_24h_followup, 3);
  assert.equal(results['generation-outcomes'][0].no_recorded_terminal_24h, 1);
  assert.equal(results['time-to-play'][0].median_seconds_to_ready, 60);
  assert.equal(results['time-to-play'][0].median_seconds_to_first_play, 70);
  assert.equal(results['capture-quality'].find(row => row.event === 'jems_creation_completed' && row.source === 'client').incomplete_or_untrusted_correlations, 1);
});

test('art SQL requires original asset and same owner/game/revision with later play; revisions are not different-game reuse', () => {
  const events = [
    event('art_saved', 'a', 9 * DAY, { asset_id: 'one' }),
    event('art_saved', 'a', 8 * DAY, { asset_id: 'one' }),
    event('asset_added_to_game', 'a', 8 * DAY, { asset_id: 'one', game_id: 'game-1', revision_id: 'r1' }),
    event('game_play_started', 'a', 8 * DAY - 10, { game_id: 'game-1', revision_id: 'r1' }),
    event('asset_added_to_game', 'a', 7 * DAY, { asset_id: 'one', game_id: 'game-1', revision_id: 'r2' }),
    event('game_revision_played', 'a', 7 * DAY - 10, { game_id: 'game-1', revision_id: 'r2' }),
    event('art_saved', 'a', 9 * DAY, { asset_id: 'two' }),
    event('asset_added_to_game', 'a', 8 * DAY, { asset_id: 'two', game_id: 'game-1', revision_id: 'r1' }),
    event('game_play_started', 'a', 8 * DAY + 10, { game_id: 'game-2', revision_id: 'r3' }), // Earlier play cannot credit the later use.
    event('asset_added_to_game', 'a', 7 * DAY, { asset_id: 'two', game_id: 'game-2', revision_id: 'r3' }),
    event('game_play_started', 'different-owner', 7 * DAY - 10, { game_id: 'game-2', revision_id: 'r3' }),
    event('game_play_started', 'a', 7 * DAY - 10, { game_id: 'game-2', revision_id: 'r4' }), // Later revision does not prove this art was retained.
    event('art_saved', 'a', DAY, { asset_id: 'too-young' }),
    event('asset_added_to_game', 'a', DAY - 10, { asset_id: 'too-young', game_id: 'game-3' }),
    event('art_saved', 'child', 9 * DAY, { asset_id: 'excluded-child', audience: 'child' }),
    event('art_saved', 'production', 9 * DAY, { asset_id: 'excluded-env', environment: 'production' }),
  ];
  const result = runQueries(events)['art-reuse'][0];
  assert.equal(result.saved_assets_with_7d_followup, 2);
  assert.equal(result.used_in_a_game_7d, 2);
  assert.equal(result.used_and_game_played_7d, 2);
  assert.equal(result.reused_in_different_game_7d, 1);
  assert.equal(result.different_games_played_7d, 0);
  assert.equal(result.reuse_percent, 50);
  const withExactPlay = runQueries([...events,
    event('game_revision_played', 'a', 7 * DAY - 20, { game_id: 'game-2', revision_id: 'r3' }),
  ])['art-reuse'][0];
  assert.equal(withExactPlay.different_games_played_7d, 1);
});

test('empty reports remain empty, schema versions do not blend, and explicit test scope permits mock outcomes', () => {
  assert.ok(Object.values(runQueries([])).every(rows => rows.length === 0));
  const properties = { creation_id: 'c', job_id: 'j', game_id: 'game', revision_id: 'r1', build_adapter: 'mock', environment: 'test', source: 'server' };
  const events = [
    event('journey_started', 'a', 3 * DAY, { ...properties, source: 'client', creation_mode: 'generated' }),
    event('creation_submitted', 'a', 3 * DAY - 10, properties),
    event('creation_completed', 'a', 3 * DAY - 20, properties),
    event('game_play_started', 'a', 3 * DAY - 30, { ...properties, source: 'client', game_id: 'game' }),
    event('journey_started', 'excluded', 3 * DAY, { ...properties, source: 'client', schema_version: 2 }),
  ];
  assert.equal(runQueries(events, { environment: 'test' })['first-creation'][0].same_result_played_within_24h, 1);
});

test('report event allowlist agrees with the application capture contract', () => {
  const contract = readFileSync(new URL('../../src/analytics/contract.ts', import.meta.url), 'utf8');
  const array = contract.match(/ANALYTICS_EVENTS = \[([\s\S]*?)\] as const/);
  assert.ok(array, 'shared contract exports the expected explicit event list');
  assert.deepEqual(EVENTS, [...array[1].matchAll(/'([^']+)'/g)].map(match => match[1]));
});
