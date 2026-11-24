import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { sha256, computeSourceIdentity, createReceipt, verifyEvidence, MAX_AGE_MS, FIXTURE_CONFIGURATION, findReusableEvidence } from './validation-evidence.mjs';

const A = 'a'.repeat(40), B = 'b'.repeat(40), digest = sha256('unchanged');
const requiredSuites = [{ id: 'game', commands: [['node', 'tests/game.cjs']] }, { id: 'security', commands: [['node', 'tests/security.cjs']] }];
function fixture() {
  const now = Date.parse('2026-11-23T22:00:00Z');
  const start = new Date(now - 60_000).toISOString(), generatedAt = new Date(now - 10_000).toISOString();
  const identity = { sourceSha: A, sourceTree: B, applicationSha256: digest, testPolicySha256: digest, dependenciesSha256: digest, operationsSha256: digest, validationSha256: digest };
  const buildBytes = Buffer.from('immutable build archive');
  const buildSha256 = sha256(buildBytes);
  const suites = requiredSuites.map(s => ({ id: s.id, sourceSha: A, buildSha256, status: 'success', commands: s.commands.map(command => ({ command, exitCode: 0 })) }));
  const receipt = createReceipt({ identity, buildSha256, runId: 123, runAttempt: 1, manifestSha256: digest, suites, requiredSuites, generatedAt });
  const run = { id: 123, repository: { full_name: 'jzwyrzyk/family-game-factory', id: 1458033181 }, head_repository: { full_name: 'jzwyrzyk/family-game-factory', id: 1458033181 }, run_attempt: 1, path: '.github/workflows/test.yml', event: 'push', head_branch: 'main', head_sha: A, status: 'completed', conclusion: 'success', run_started_at: start, updated_at: new Date(now - 1000).toISOString() };
  const receiptArchive = Buffer.from('authenticated receipt zip'), buildArchive = Buffer.from('authenticated build zip');
  function artifact(name, bytes, id) { return { id, name, digest: sha256(bytes), expired: false, created_at: generatedAt, expires_at: new Date(now + 86_400_000).toISOString(), workflow_run: { id: 123, repository_id: 1458033181, head_repository_id: 1458033181, head_sha: A, head_branch: 'main' } }; }
  return { receipt, context: { identity: { ...identity, sourceSha: B }, sourceIdentity: structuredClone(identity), run, jobs: [{ name: 'creative', runner_group_name: 'GitHub Actions', labels: ['ubuntu-24.04'], run_id: 123, run_attempt: 1, head_sha: A, status: 'completed', conclusion: 'success' }], receiptArtifact: artifact(`arcade-validation-${A}-1`, receiptArchive, 11), receiptArchive, buildArtifact: artifact(`arcade-build-${A}-1`, buildArchive, 12), buildArchive, buildBytes, requiredSuites, requiredJobs: ['creative'], expectedBuildSha256: buildSha256, manifestSha256: digest, now } };
}

test('complete authenticated equivalent-source fixture evidence is reusable but never release authorization', () => {
  const { receipt, context } = fixture();
  const result = verifyEvidence(receipt, context);
  assert.equal(result.reusable, true);
  assert.equal(result.firstAttemptPassed, true);
  assert.equal(result.releaseAuthorized, false);
  assert.equal(result.sourceSha, A);
  assert.equal(result.candidateSha, B);
});

const invalidCases = {
  'arbitrary historical workflow success': (r, c) => { c.run.path = '.github/workflows/unrelated.yml'; },
  'repository identity replacement': (r, c) => { c.run.repository.id = 99; },
  'fork source': (r, c) => { c.run.head_repository.full_name = 'attacker/family-game-factory'; },
  'PR run cannot seed trusted evidence': (r, c) => { c.run.event = 'pull_request'; },
  'branch run cannot seed trusted evidence': (r, c) => { c.run.head_branch = 'feature'; },
  'failed workflow': (r, c) => { c.run.conclusion = 'failure'; },
  'pending workflow': (r, c) => { c.run.status = 'in_progress'; },
  'rerun cannot hide first-attempt failure': (r, c) => { c.run.run_attempt = 2; },
  'wrong source SHA': (r, c) => { c.run.head_sha = B; },
  'runtime environment mismatch': r => { r.configurationSha256 = sha256('production'); },
  'expiry': (r, c) => { c.now += MAX_AGE_MS; },
  'revocation': (r, c) => { c.revokedRunIds = [123]; },
  'future timestamp': r => { r.generatedAt = '2099-01-01T00:00:00Z'; },
  'changed source': (r, c) => { c.identity.applicationSha256 = sha256('change'); },
  'changed tests or workflow': (r, c) => { c.identity.testPolicySha256 = sha256('change'); },
  'changed dependencies': (r, c) => { c.identity.dependenciesSha256 = sha256('change'); },
  'changed controller': (r, c) => { c.identity.operationsSha256 = sha256('change'); },
  'receipt source identity forgery': r => { r.identity.sourceSha = B; },
  'source-tree mismatch': r => { r.identity.sourceTree = A; },
  'changed build identity': (r, c) => { c.expectedBuildSha256 = sha256('different build'); },
  'changed full-suite manifest': (r, c) => { c.manifestSha256 = sha256('different tests'); },
  'missing required shard': r => { r.suites.pop(); },
  'duplicate shard': r => { r.suites[1] = structuredClone(r.suites[0]); },
  'cancelled required shard': r => { r.suites[0].status = 'cancelled'; },
  'skipped required shard': r => { r.suites[0].status = 'skipped'; },
  'deliberately failed command': r => { r.suites[0].commands[0].exitCode = 1; },
  'omitted assertion command': r => { r.suites[0].commands = []; },
  'replaced command': r => { r.suites[0].commands[0].command = ['true']; },
  'missing aggregate job': (r, c) => { c.jobs = []; },
  'cancelled aggregate job': (r, c) => { c.jobs[0].conclusion = 'cancelled'; },
  'unexpectedly skipped aggregate': (r, c) => { c.jobs[0].conclusion = 'skipped'; },
  'job of different run': (r, c) => { c.jobs[0].run_id = 999; },
  'duplicate aggregate': (r, c) => { c.jobs.push(structuredClone(c.jobs[0])); },
  'unapproved runner': (r, c) => { c.jobs[0].runner_group_name = 'custom'; },
  'self-hosted runner': (r, c) => { c.jobs[0].labels.push('self-hosted'); },
  'expired artifact': (r, c) => { c.receiptArtifact.expired = true; },
  'artifact from different run': (r, c) => { c.buildArtifact.workflow_run.id = 999; },
  'receipt archive tampering': (r, c) => { c.receiptArchive = Buffer.from('tamper'); },
  'build archive tampering': (r, c) => { c.buildArchive = Buffer.from('tamper'); },
  'build payload tampering': (r, c) => { c.buildBytes = Buffer.from('tamper'); },
  'missing GitHub digest fails closed': (r, c) => { delete c.buildArtifact.digest; },
  'artifact name collision': (r, c) => { c.buildArtifact.name = 'some-other-build'; },
};
for (const [name, mutate] of Object.entries(invalidCases)) test(`reject ${name}`, () => {
  const { receipt, context } = fixture(); mutate(receipt, context);
  assert.throws(() => verifyEvidence(receipt, context));
});

test('receipt creation rejects partial and rerun evidence before publishing', () => {
  const { receipt } = fixture();
  assert.throws(() => createReceipt({ ...receipt, identity: receipt.identity, suites: receipt.suites.slice(0, 1), requiredSuites }));
  assert.throws(() => createReceipt({ ...receipt, identity: receipt.identity, runAttempt: 2, suites: receipt.suites, requiredSuites }));
});

test('tree identities ignore only inert text/operation records/review metadata and invalidate all executable inputs', t => {
  const repo = mkdtempSync(join(tmpdir(), 'jems-identity-test-'));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '--quiet'); git('config', 'user.email', 'ci@example.invalid'); git('config', 'user.name', 'CI');
  const write = (path, content) => { mkdirSync(join(repo, path, '..'), { recursive: true }); writeFileSync(join(repo, path), content); };
  const registry = { areas: [{ id: 'validation', sources: ['tests/**'], reviewedAt: 'old', sourceDigest: 'old', reviewOutcome: 'updated', reviewReason: 'reviewed', reviewHistory: [] }] };
  write('src/main.ts', 'export const value = 1;'); write('DELIVERY-STATE.md', 'Documentation');
  write('ops/release.json', '{"operation":"canary"}'); write('ops/compatibility.json', '{}');
  write('docs/context/registry.json', JSON.stringify(registry)); write('package-lock.json', '{}');
  write('tests/game.cjs', 'assert(true)'); write('scripts/ops/release.py', 'print("plan")'); write('.github/workflows/test.yml', 'jobs: {}');
  const commit = () => { git('add', '.'); git('commit', '--quiet', '-m', 'fixture'); return git('rev-parse', 'HEAD'); };
  let previous = computeSourceIdentity(repo, commit());
  for (const [path, text] of [['DELIVERY-STATE.md', 'Updated documentation'], ['ops/release.json', '{"operation":"promote"}'], ['ops/compatibility.json', '{"source":"different"}'], ['docs/context/registry.json', JSON.stringify({ areas: [{ ...registry.areas[0], reviewedAt: 'new', sourceDigest: 'new' }] })]]) {
    write(path, text); const identity = computeSourceIdentity(repo, commit());
    assert.equal(identity.validationSha256, previous.validationSha256, path); previous = identity;
  }
  // Exempt identity is not an authorization: strict classifier separately rejects
  // source/image/config changes in these intent records before any PR omission.
  for (const [path, text, category] of [
    ['src/main.ts', 'export const value = 2;', 'application'],
    ['PRODUCT-DOCTRINE.md', 'Changed security requirements', 'application'],
    ['docs/operations/PRODUCTION_ACTIVATION.md', 'Changed release requirements', 'application'],
    ['package-lock.json', '{"changed":true}', 'dependencies'],
    ['tests/game.cjs', 'assert(false)', 'testPolicy'],
    ['.github/workflows/test.yml', 'jobs: {changed: true}', 'testPolicy'],
    ['scripts/ops/release.py', 'print("changed")', 'operations'],
    ['docs/new-executable.md', 'unknown document', 'application'],
    ['docs/pals/art/character-references.json', '{"changed":true}', 'application'],
    ['docs/context/registry.json', JSON.stringify({ areas: [{ ...registry.areas[0], sources: [] }] }), 'application'],
  ]) {
    write(path, text); const identity = computeSourceIdentity(repo, commit());
    assert.notEqual(identity[`${category}Sha256`], previous[`${category}Sha256`], path);
    assert.notEqual(identity.validationSha256, previous.validationSha256, path); previous = identity;
  }
  rmSync(join(repo, 'DELIVERY-STATE.md')); symlinkSync('src/main.ts', join(repo, 'DELIVERY-STATE.md'));
  const symlink = computeSourceIdentity(repo, commit());
  assert.notEqual(symlink.validationSha256, previous.validationSha256, 'symlink is never inert');
});

test('missing trusted base cannot approve evidence reuse', async () => {
  await assert.rejects(findReusableEvidence({ repoRoot: '/nonexistent', base: A, head: B, token: 'unused' }));
  assert.match(FIXTURE_CONFIGURATION, /^sha256:[a-f0-9]{64}$/);
});

test('hosted reader authenticates API metadata and both ZIP payloads end to end without live services', async t => {
  const { readFileSync } = await import('node:fs');
  const { verifyHostedEvidence, discoverExactSourceEvidence } = await import('./validation-evidence.mjs');
  const repo = mkdtempSync(join(tmpdir(), 'jems-hosted-evidence-'));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '--quiet'); git('config', 'user.email', 'ci@example.invalid'); git('config', 'user.name', 'CI');
  writeFileSync(join(repo, 'app.js'), 'immutable fixture'); git('add', '.'); git('commit', '--quiet', '-m', 'fixture');
  const sourceSha = git('rev-parse', 'HEAD'), identity = computeSourceIdentity(repo, sourceSha);
  const { receipt, context } = fixture();
  const now = Date.now();
  receipt.sourceSha = sourceSha; receipt.identity = identity;
  receipt.generatedAt = new Date(now - 10_000).toISOString();
  receipt.suites.forEach(s => { s.sourceSha = sourceSha; });
  context.run.head_sha = sourceSha; context.run.run_started_at = new Date(now - 60_000).toISOString(); context.run.updated_at = new Date(now - 1000).toISOString();
  context.jobs[0].head_sha = sourceSha;
  writeFileSync(join(repo, 'validation-evidence.json'), JSON.stringify(receipt));
  writeFileSync(join(repo, 'ci-build.tar'), context.buildBytes);
  execFileSync('zip', ['-q', 'receipt.zip', 'validation-evidence.json'], { cwd: repo });
  execFileSync('zip', ['-q', 'build.zip', 'ci-build.tar'], { cwd: repo });
  const receiptArchive = readFileSync(join(repo, 'receipt.zip')), buildArchive = readFileSync(join(repo, 'build.zip'));
  for (const [artifact, archive, prefix] of [[context.receiptArtifact, receiptArchive, 'arcade-validation'], [context.buildArtifact, buildArchive, 'arcade-build']]) {
    artifact.name = `${prefix}-${sourceSha}-1`; artifact.workflow_run.head_sha = sourceSha;
    artifact.digest = sha256(archive); artifact.size_in_bytes = archive.length;
    artifact.created_at = receipt.generatedAt; artifact.expires_at = new Date(now + 86_400_000).toISOString();
  }
  const originalFetch = globalThis.fetch, requests = [];
  t.after(() => { globalThis.fetch = originalFetch; });
  let corruptDownload = false;
  globalThis.fetch = async (url, options) => {
    const parsed = new URL(url); requests.push(parsed.pathname);
    assert.equal(parsed.origin, 'https://api.github.com');
    assert.equal(options.headers.Authorization, 'Bearer synthetic-read-token');
    const endpoint = parsed.pathname.replace('/repos/jzwyrzyk/family-game-factory/actions', '');
    const json = data => new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (endpoint === '/runs/123') return json(context.run);
    if (endpoint === '/runs/123/attempts/1/jobs') return json({ jobs: context.jobs, total_count: 1 });
    if (endpoint === '/runs/123/artifacts') return json({ artifacts: [context.receiptArtifact, context.buildArtifact], total_count: 2 });
    if (endpoint === '/artifacts/11') return json(context.receiptArtifact);
    if (endpoint === '/artifacts/12') return json(context.buildArtifact);
    if (endpoint === '/artifacts/11/zip') return new Response(receiptArchive);
    if (endpoint === '/artifacts/12/zip') return new Response(corruptDownload ? Buffer.from('tampered transport') : buildArchive);
    throw new Error(`Unexpected endpoint ${endpoint}`);
  };
  const request = { repoRoot: repo, candidateSha: sourceSha, runId: 123, receiptArtifactId: 11, buildArtifactId: 12, expectedBuildSha256: receipt.buildSha256, requiredSuites, requiredJobs: ['creative'], manifestSha256: digest, token: 'synthetic-read-token' };
  const result = await verifyHostedEvidence(request);
  assert.equal(result.reusable, true);
  assert.equal(result.releaseAuthorized, false);
  const discovered = await discoverExactSourceEvidence({ ...request, sourceSha });
  assert.equal(discovered.receiptArtifactId, 11);
  corruptDownload = true;
  await assert.rejects(verifyHostedEvidence(request), /integrity/);
  assert.ok(requests.length > 10);
});
