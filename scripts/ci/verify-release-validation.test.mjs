import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MAX_AGE_MS, REPOSITORY, REPOSITORY_ID, WORKFLOW } from './validation-evidence.mjs';
import { LEGACY_RECEIPT, LEGACY_JOBS, verifyLegacyReleaseEvidence, fullRegressionPolicy, verifyReleaseValidation } from './verify-release-validation.mjs';

function legacy() {
  const { sourceSha, runId, workflowSha256 } = LEGACY_RECEIPT;
  const now = Date.UTC(2026, 10, 24, 0, 0, 0);
  return { sourceSha, runId, workflowSha256, now,
    run: { id: runId, head_sha: sourceSha, run_attempt: 1, repository: {full_name: REPOSITORY, id: REPOSITORY_ID},
      head_repository: {full_name: REPOSITORY, id: REPOSITORY_ID}, path: WORKFLOW, event: 'push', head_branch: 'main', status: 'completed', conclusion: 'success',
      run_started_at: new Date(now - 60_000).toISOString(), updated_at: new Date(now - 1000).toISOString() },
    jobs: LEGACY_JOBS.map(name => ({name, run_id: runId, run_attempt: 1, head_sha: sourceSha,
      status: 'completed', conclusion: 'success', runner_group_name: 'GitHub Actions', labels: ['ubuntu-24.04']})),
  };
}

test('the one reviewed legacy cutover receipt preserves full coverage without authorizing a release', () => {
  const result = verifyLegacyReleaseEvidence(legacy());
  assert.equal(result.policy, 'explicit-cutover-migration');
  assert.equal(result.releaseAuthorized, false);
  assert.deepEqual(result.requiredJobs, LEGACY_JOBS);
});

test('legacy migration receipt expires after seven days and cannot claim future or missing timing', () => {
  for (const mutate of [
    x => {x.now += MAX_AGE_MS;},
    x => {delete x.run.run_started_at;},
    x => {x.run.updated_at = new Date(x.now + 1000).toISOString();},
    x => {x.run.run_started_at = new Date(x.now + 2000).toISOString();},
  ]) { const value = legacy(); mutate(value); assert.throws(() => verifyLegacyReleaseEvidence(value), /expired|timestamps/); }
  const value = legacy(), result = verifyLegacyReleaseEvidence(value);
  assert.equal(Date.parse(result.expiresAt), Date.parse(value.run.run_started_at) + MAX_AGE_MS);
});

test('arbitrary old successes, changed source and changed workflow cannot use migration policy', () => {
  for (const mutate of [
    x => {x.runId++;}, x => {x.sourceSha = 'a'.repeat(40);}, x => {x.workflowSha256 = 'b'.repeat(64);},
    x => {x.run.head_sha = 'a'.repeat(40);}, x => {x.run.run_attempt = 2;}, x => {x.run.event = 'pull_request';},
    x => {x.run.head_branch = 'feature';}, x => {x.run.path = '.github/workflows/forged.yml';},
    x => {x.run.head_repository.full_name = 'attacker/fork';}, x => {x.run.repository.full_name = 'attacker/fork';},
    x => {x.run.head_repository.id++;}, x => {x.run.repository.id++;},
    x => {x.run.conclusion = 'failure';}, x => {x.run.status = 'in_progress';},
  ]) { const value = legacy(); mutate(value); assert.throws(() => verifyLegacyReleaseEvidence(value)); }
});

test('failed, missing, skipped, cancelled, duplicated and self-hosted legacy jobs fail closed', () => {
  for (const mutate of [
    x => {x.jobs[0].conclusion = 'failure';}, x => {x.jobs.pop();}, x => {x.jobs[1].conclusion = 'skipped';},
    x => {x.jobs[2].conclusion = 'cancelled';}, x => {x.jobs[1] = {...x.jobs[0]};},
    x => {x.jobs[0].labels.push('self-hosted');}, x => {x.jobs[0].run_attempt = 2;},
    x => {x.jobs[0].head_sha = 'f'.repeat(40);}, x => {x.jobs[0].run_id++;},
  ]) { const value = legacy(); mutate(value); assert.throws(() => verifyLegacyReleaseEvidence(value)); }
});

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const manifestBytes = readFileSync(new URL('./suites.json', import.meta.url));
const packageBytes = readFileSync(new URL('../../package.json', import.meta.url));
test('new policy derives every mandatory shard and stable check from the coverage manifest', () => {
  const manifest = JSON.parse(manifestBytes);
  const policy = fullRegressionPolicy(manifest, JSON.parse(packageBytes));
  assert.equal(policy.requiredSuites.length, Object.keys(manifest.shards).length);
  for (const id of Object.keys(manifest.shards)) assert.ok(policy.requiredJobs.includes(`shard (${id})`));
  assert.ok(policy.requiredJobs.includes('validation-evidence'));
  assert.ok(policy.requiredJobs.includes('image-isolation'));
  assert.ok(policy.requiredSuites.every(suite => suite.commands.every(Array.isArray)));
  delete manifest.shards[Object.keys(manifest.shards)[0]];
  assert.throws(() => fullRegressionPolicy(manifest, JSON.parse(packageBytes)), /COVERAGE/);
});

test('new source delegates only exact-source full policy and refuses mismatched verifier results', async () => {
  const sourceSha = 'a'.repeat(40), runId = 123;
  const readBlob = (_repo, source, path) => {
    assert.equal(source, sourceSha);
    if (path === WORKFLOW) return Buffer.from('new reviewed policy');
    if (path === 'scripts/ci/suites.json') return manifestBytes;
    if (path === 'package.json') return packageBytes;
    throw new Error('unexpected source read');
  };
  const good = {reusable: true, sourceSha, runId, releaseAuthorized: false};
  const discoverEvidence = async request => {
    assert.equal(request.sourceSha, sourceSha);
    assert.ok(request.requiredSuites.length > 0);
    assert.ok(request.requiredJobs.includes('creative'));
    assert.match(request.manifestSha256, /^sha256:[a-f0-9]{64}$/);
    return good;
  };
  const result = await verifyReleaseValidation({repoRoot, sourceSha, runId, readBlob, discoverEvidence});
  assert.equal(result.policy, 'verified-full-regression-receipt');
  for (const bad of [{...good, reusable: false}, {...good, sourceSha: 'b'.repeat(40)}, {...good, runId: 124}, {...good, releaseAuthorized: true}]) {
    await assert.rejects(verifyReleaseValidation({repoRoot, sourceSha, runId, readBlob, discoverEvidence: async () => bad}), /mismatch/);
  }
});

test('new source never falls back to any historical workflow success', async () => {
  await assert.rejects(verifyReleaseValidation({repoRoot, sourceSha: 'a'.repeat(40), runId: LEGACY_RECEIPT.runId,
    readBlob: (_repo, _source, path) => { if (path === WORKFLOW) return Buffer.from('legacy workflow'); throw new Error('No receipt policy'); },
    api: async () => { throw new Error('Historical success must not be queried'); },
  }), /No receipt policy/);
});
