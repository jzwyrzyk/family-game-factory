#!/usr/bin/env node
/** Read-only release evidence adapter. Deployment authorization remains separate.
 * Run this from reviewed protected-main policy, never from the candidate archive.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expandCommands, verifyCoverage } from './suites.mjs';
import { MAX_AGE_MS, REPOSITORY, REPOSITORY_ID, WORKFLOW } from './validation-evidence.mjs';

// Finite migration receipt for the already-published cutover candidate. This is
// deliberately not an allowlist of arbitrary historical successful workflows.
export const LEGACY_RECEIPT = Object.freeze({
  sourceSha: 'aa56b60abe152e750f9f0b5e8949bdb44be53196',
  runId: 45250456124,
  workflowSha256: '476119ae5548e34c2b9657c163f161ee8a8509383aa1b0126799a7a6dfcda4ba',
});
export const LEGACY_JOBS = Object.freeze(['browser', 'learning', 'creative', 'notifications', 'private-coach-image']);
const shaPattern = /^[a-f0-9]{40}$/;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const requireThat = (condition, message) => { if (!condition) throw new Error(message); };

// Pure verifier: the adapter supplies the digest of the exact Git blob and
// authenticated API responses. These are not accepted from a receipt file.
export function verifyLegacyReleaseEvidence({ sourceSha, runId, workflowSha256, run, jobs, now = Date.now() }) {
  requireThat(sourceSha === LEGACY_RECEIPT.sourceSha && runId === LEGACY_RECEIPT.runId, 'Historical evidence is not the approved migration receipt');
  requireThat(workflowSha256 === LEGACY_RECEIPT.workflowSha256, 'Historical full-regression policy changed');
  requireThat(run?.id === runId && run.head_sha === sourceSha && run.run_attempt === 1, 'Historical run identity changed');
  requireThat(run.repository?.full_name === REPOSITORY && run.head_repository?.full_name === REPOSITORY
    && run.repository.id === REPOSITORY_ID && run.head_repository.id === REPOSITORY_ID, 'Historical repository mismatch');
  requireThat(run.path === WORKFLOW && run.event === 'push' && run.head_branch === 'main', 'Historical evidence is not a main-push Arcade run');
  requireThat(run.status === 'completed' && run.conclusion === 'success', 'Historical full regression did not succeed');
  // The finite migration exception must not keep pre-policy evidence usable
  // forever. Removing this pinned receipt revokes it immediately; its original
  // authenticated run start also imposes the normal seven-day ceiling.
  const started = Date.parse(run.run_started_at), completed = Date.parse(run.updated_at);
  requireThat(Number.isFinite(started) && Number.isFinite(completed) && started <= completed
    && completed <= now && now - started <= MAX_AGE_MS, 'Historical migration evidence expired or has invalid timestamps');
  requireThat(Array.isArray(jobs) && jobs.length === LEGACY_JOBS.length, 'Historical job set is incomplete or unexpected');
  for (const name of LEGACY_JOBS) {
    const matches = jobs.filter(job => job.name === name);
    requireThat(matches.length === 1, `Historical required job missing or duplicated: ${name}`);
    const job = matches[0];
    requireThat(job.run_id === runId && job.run_attempt === 1 && job.head_sha === sourceSha
      && job.status === 'completed' && job.conclusion === 'success', `Historical required job did not pass: ${name}`);
    requireThat(job.runner_group_name === 'GitHub Actions' && job.labels?.includes('ubuntu-24.04')
      && !job.labels?.includes('self-hosted'), `Historical job was not on the approved hosted runner: ${name}`);
  }
  return { policy: 'explicit-cutover-migration', sourceSha, runId, runAttempt: 1,
    workflowSha256: LEGACY_RECEIPT.workflowSha256, requiredJobs: [...LEGACY_JOBS],
    expiresAt: new Date(started + MAX_AGE_MS).toISOString(), releaseAuthorized: false };
}

export function fullRegressionPolicy(manifest, packageJSON) {
  verifyCoverage(manifest, packageJSON);
  const ids = Object.keys(manifest.shards);
  requireThat(ids.length > 0, 'Missing full regression shards');
  return {
    requiredSuites: ids.map(id => ({ id, commands: expandCommands(manifest.shards[id].commands, packageJSON.scripts) })),
    requiredJobs: ['prepare', ...ids.map(id => `shard (${id})`), 'image-isolation',
      'browser', 'learning', 'creative', 'notifications', 'private-coach-image', 'validation-evidence'],
  };
}

function gitBlob(repoRoot, sourceSha, path) {
  return execFileSync('git', ['-C', repoRoot, 'show', `${sourceSha}:${path}`], { maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}
async function github(path) {
  requireThat(path.startsWith(`repos/${REPOSITORY}/actions/`) && !path.includes('..'), 'Unexpected release evidence endpoint');
  return JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }));
}

export async function verifyReleaseValidation({ repoRoot, sourceSha, runId, api = github, readBlob = gitBlob, discoverEvidence }) {
  requireThat(shaPattern.test(sourceSha), 'Release source must be an immutable commit');
  requireThat(Number.isSafeInteger(runId) && runId > 0, 'Release evidence requires a positive run ID');
  const workflowBytes = readBlob(repoRoot, sourceSha, WORKFLOW);
  if (sourceSha === LEGACY_RECEIPT.sourceSha) {
    const prefix = `repos/${REPOSITORY}/actions/runs/${runId}`;
    const [run, response] = await Promise.all([api(prefix), api(`${prefix}/attempts/1/jobs?per_page=100`)]);
    requireThat(response?.total_count === response.jobs?.length, 'Incomplete historical job response');
    return verifyLegacyReleaseEvidence({ sourceSha, runId, workflowSha256: hash(workflowBytes), run, jobs: response.jobs });
  }
  // Read policy as data from the exact reviewed source. Never execute code from
  // an old workflow artifact or use caller-provided mandatory-suite lists.
  const manifestBytes = readBlob(repoRoot, sourceSha, 'scripts/ci/suites.json');
  const policy = fullRegressionPolicy(JSON.parse(manifestBytes), JSON.parse(readBlob(repoRoot, sourceSha, 'package.json')));
  const verify = discoverEvidence ?? (await import('./validation-evidence.mjs')).discoverExactSourceEvidence;
  requireThat(typeof verify === 'function', 'Exact-source hosted evidence verifier unavailable');
  const result = await verify({ repoRoot, sourceSha, runId, ...policy, manifestSha256: `sha256:${hash(manifestBytes)}` });
  requireThat(result?.reusable === true && result.sourceSha === sourceSha && result.runId === runId
    && result.releaseAuthorized === false, 'Exact-source evidence result mismatch');
  return { policy: 'verified-full-regression-receipt', ...result, releaseAuthorized: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [sourceSha, rawRunId, ...rest] = process.argv.slice(2);
    requireThat(rest.length === 0 && /^[1-9][0-9]*$/.test(rawRunId || ''), 'Usage: node scripts/ci/verify-release-validation.mjs SOURCE_SHA RUN_ID');
    console.log(JSON.stringify(await verifyReleaseValidation({ repoRoot: process.cwd(), sourceSha, runId: Number(rawRunId) }), null, 2));
  } catch (error) {
    console.error(`Release validation rejected: ${error.message}`);
    process.exitCode = 1;
  }
}
