#!/usr/bin/env node
/** Read-only exact-source evidence. A receipt is data, never release authorization.
 * Callers must run this policy from the trusted base, not from an untrusted PR.
 * Production OCI attestations, current-main and transition gates remain separate.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { normalizedReviewRegistry, classifyImpact } from './classify-impact.mjs';
import { expandCommands, verifyCoverage } from './suites.mjs';

export const REPOSITORY = 'jzwyrzyk/family-game-factory';
export const REPOSITORY_ID = 1458033181;
export const WORKFLOW = '.github/workflows/test.yml';
export const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const FIXTURE_CONFIGURATION = 'sha256:' + createHash('sha256').update('jems-ci-fixtures-v1:no-cloud:no-paid-provider:ubuntu-24.04:node22').digest('hex');
const shaPattern = /^[a-f0-9]{40}$/;
const digestPattern = /^sha256:[a-f0-9]{64}$/;
const MAX_ARCHIVE_BYTES = 256 * 1024 * 1024;
// Normative/security documents stay in the identity even when PR impact is
// documentation-only: changed requirements invalidate earlier acceptance.
const evidenceNarrative = new Set(['DELIVERY-STATE.md']);
const operationalRecords = new Set(['ops/release.json', 'ops/compatibility.json']);
const identityKeys = ['applicationSha256', 'testPolicySha256', 'dependenciesSha256', 'operationsSha256', 'validationSha256'];
function requireThat(condition, message) { if (!condition) throw new Error(message); }
export function sha256(bytes) { return `sha256:${createHash('sha256').update(bytes).digest('hex')}`; }
export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
function git(repo, args, options = {}) { return execFileSync('git', ['-C', repo, ...args], { maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], ...options }); }
function category(path) {
  if (/^(package(-lock)?\.json|server\/sandbox\/package(-lock)?\.json)$/.test(path)) return 'dependencies';
  if (path.startsWith('scripts/ops/') || path.startsWith('ops/')) return 'operations';
  if (path.startsWith('tests/') || path.startsWith('.github/') || path.startsWith('scripts/')) return 'testPolicy';
  return 'application';
}
export function computeSourceIdentity(repo, sourceSha) {
  requireThat(shaPattern.test(sourceSha), 'Expected an immutable 40-character source commit');
  requireThat(git(repo, ['rev-parse', `${sourceSha}^{commit}`], { encoding: 'utf8' }).trim() === sourceSha, 'Source is not a commit');
  const entries = git(repo, ['ls-tree', '-rz', '--full-tree', sourceSha]).toString('utf8').split('\0').filter(Boolean);
  const groups = { application: [], testPolicy: [], dependencies: [], operations: [] };
  const excluded = [];
  for (const entry of entries) {
    const match = /^(\d+) (blob|commit) ([a-f0-9]{40})\t([\s\S]+)$/.exec(entry);
    requireThat(match, 'Malformed Git tree entry');
    const [, mode, type, oid, path] = match;
    requireThat(type === 'blob', `Unverified submodule: ${path}`);
    if (mode === '100644' && (evidenceNarrative.has(path) || operationalRecords.has(path))) { excluded.push(path); continue; }
    let bytes = git(repo, ['cat-file', 'blob', oid]);
    if (path === 'docs/context/registry.json' && mode === '100644') bytes = Buffer.from(canonical(normalizedReviewRegistry(JSON.parse(bytes))));
    groups[category(path)].push({ path, mode, sha256: sha256(bytes) });
  }
  const result = { schemaVersion: 1, sourceSha, sourceTree: git(repo, ['rev-parse', `${sourceSha}^{tree}`], { encoding: 'utf8' }).trim() };
  for (const [name, files] of Object.entries(groups)) result[`${name}Sha256`] = sha256(canonical(files));
  result.validationSha256 = sha256(canonical(Object.fromEntries(identityKeys.filter(k => k !== 'validationSha256').map(k => [k, result[k]]))));
  result.excludedPaths = excluded;
  return result;
}
function suiteMap(requiredSuites) {
  requireThat(Array.isArray(requiredSuites) && requiredSuites.length > 0, 'Missing trusted full-suite policy');
  const result = new Map();
  for (const suite of requiredSuites) {
    requireThat(suite && typeof suite.id === 'string' && Array.isArray(suite.commands) && suite.commands.length > 0 && suite.commands.every(c => Array.isArray(c) && c.length > 0 && c.every(a => typeof a === 'string')), 'Invalid trusted suite policy');
    requireThat(!result.has(suite.id), 'Duplicate trusted suite');
    result.set(suite.id, suite.commands);
  }
  return result;
}
function verifySuites(receipt, requiredSuites) {
  const expected = suiteMap(requiredSuites);
  requireThat(Array.isArray(receipt.suites) && receipt.suites.length === expected.size, 'Incomplete full regression evidence');
  const seen = new Set();
  for (const suite of receipt.suites) {
    requireThat(!seen.has(suite.id) && expected.has(suite.id), 'Duplicate or unexpected evidence suite');
    seen.add(suite.id);
    requireThat(suite.status === 'success' && suite.sourceSha === receipt.sourceSha && suite.buildSha256 === receipt.buildSha256, 'Failed or differently sourced suite');
    requireThat(Array.isArray(suite.commands) && canonical(suite.commands.map(c => c.command)) === canonical(expected.get(suite.id)), 'Suite command coverage changed');
    requireThat(suite.commands.every(c => c.exitCode === 0), 'A required command failed');
  }
}
export function createReceipt({ identity, buildSha256, runId, runAttempt, manifestSha256, suites, requiredSuites, generatedAt = new Date().toISOString() }) {
  requireThat(digestPattern.test(buildSha256) && digestPattern.test(manifestSha256), 'Invalid build or manifest digest');
  requireThat(Number.isSafeInteger(runId) && runId > 0 && runAttempt === 1, 'Only first-attempt evidence may be reused');
  const receipt = {
    schemaVersion: 1, scope: 'ci-fixtures-full-regression', repository: REPOSITORY, workflow: WORKFLOW,
    sourceSha: identity.sourceSha, identity, buildSha256, manifestSha256,
    configurationSha256: FIXTURE_CONFIGURATION, runId, runAttempt, generatedAt,
    suites: suites.map(s => ({ id: s.id ?? s.shard, status: s.status, sourceSha: s.sourceSha, buildSha256: s.buildSha256.startsWith('sha256:') ? s.buildSha256 : `sha256:${s.buildSha256}`, commands: s.commands })),
  };
  verifySuites(receipt, requiredSuites);
  return receipt;
}
/** Pure verifier: API objects/bytes must come from the fixed GitHub endpoints in
 * verifyHostedEvidence, never from a PR artifact claiming to be API evidence. */
export function verifyEvidence(receipt, { identity, sourceIdentity, run, jobs, receiptArtifact, receiptArchive, buildArtifact, buildArchive, buildBytes, requiredSuites, requiredJobs, expectedBuildSha256, manifestSha256, now = Date.now(), revokedRunIds = [] }) {
  requireThat(receipt?.schemaVersion === 1 && receipt.scope === 'ci-fixtures-full-regression', 'Unsupported evidence scope');
  requireThat(receipt.repository === REPOSITORY && receipt.workflow === WORKFLOW, 'Wrong evidence repository or workflow');
  requireThat(run.repository?.full_name === REPOSITORY && run.repository?.id === REPOSITORY_ID && run.head_repository?.full_name === REPOSITORY && run.head_repository?.id === REPOSITORY_ID, 'Untrusted source repository');
  requireThat(run.id === receipt.runId && run.run_attempt === 1 && receipt.runAttempt === 1, 'Wrong run or rerun attempt');
  requireThat(!revokedRunIds.includes(run.id), 'Evidence run revoked');
  requireThat(run.path === WORKFLOW && run.event === 'push' && run.head_branch === 'main', 'Evidence must be the approved main-push workflow');
  requireThat(run.status === 'completed' && run.conclusion === 'success', 'Evidence run did not succeed');
  requireThat(shaPattern.test(receipt.sourceSha) && run.head_sha === receipt.sourceSha, 'Run source mismatch');
  requireThat(receipt.configurationSha256 === FIXTURE_CONFIGURATION, 'Fixture runtime configuration mismatch');
  requireThat(receipt.identity?.sourceSha === receipt.sourceSha && sourceIdentity.sourceSha === receipt.sourceSha, 'Receipt source identity mismatch');
  for (const key of identityKeys) requireThat(digestPattern.test(identity[key]) && receipt.identity[key] === identity[key] && sourceIdentity[key] === identity[key], `${key} changed`);
  requireThat(receipt.identity.sourceTree === sourceIdentity.sourceTree, 'Receipt source tree mismatch');
  requireThat(receipt.manifestSha256 === manifestSha256 && digestPattern.test(manifestSha256), 'Test manifest changed');
  requireThat(receipt.buildSha256 === expectedBuildSha256 && digestPattern.test(expectedBuildSha256), 'Candidate build digest changed');
  const started = Date.parse(run.run_started_at), completed = Date.parse(run.updated_at), created = Date.parse(receipt.generatedAt);
  requireThat([started, completed, created].every(Number.isFinite) && started <= created && created <= completed && completed <= now && now - started <= MAX_AGE_MS, 'Expired or invalid evidence timestamps');
  requireThat(Array.isArray(requiredJobs) && requiredJobs.length > 0 && new Set(requiredJobs).size === requiredJobs.length, 'Missing trusted required-job policy');
  requireThat(Array.isArray(jobs) && jobs.length > 0, 'Missing workflow jobs');
  for (const name of requiredJobs) {
    const matched = jobs.filter(j => j.name === name);
    requireThat(matched.length === 1 && matched[0].run_id === run.id && matched[0].run_attempt === 1 && matched[0].head_sha === run.head_sha && matched[0].status === 'completed' && matched[0].conclusion === 'success' && matched[0].runner_group_name === 'GitHub Actions' && Array.isArray(matched[0].labels) && matched[0].labels.includes('ubuntu-24.04') && !matched[0].labels.includes('self-hosted'), `Required job not successful on approved runner: ${name}`);
  }
  function checkArtifact(artifact, bytes, expectedName) {
    requireThat(artifact && artifact.name === expectedName && Number.isSafeInteger(artifact.id) && !artifact.expired, 'Wrong or expired artifact');
    requireThat(artifact.workflow_run?.id === run.id && artifact.workflow_run?.repository_id === REPOSITORY_ID && artifact.workflow_run?.head_repository_id === REPOSITORY_ID && artifact.workflow_run?.head_sha === run.head_sha && artifact.workflow_run?.head_branch === 'main', 'Artifact belongs to another run');
    requireThat(digestPattern.test(artifact.digest) && artifact.digest === sha256(bytes), 'Artifact digest mismatch');
    requireThat(Date.parse(artifact.expires_at) > now && Date.parse(artifact.created_at) >= started && Date.parse(artifact.created_at) <= completed, 'Invalid artifact lifetime');
  }
  checkArtifact(receiptArtifact, receiptArchive, `arcade-validation-${receipt.sourceSha}-1`);
  checkArtifact(buildArtifact, buildArchive, `arcade-build-${receipt.sourceSha}-1`);
  requireThat(sha256(buildBytes) === receipt.buildSha256, 'Build payload digest mismatch');
  verifySuites(receipt, requiredSuites);
  return { reusable: true, scope: receipt.scope, sourceSha: receipt.sourceSha, candidateSha: identity.sourceSha, runId: run.id, runAttempt: 1, buildSha256: receipt.buildSha256, receiptArtifactId: receiptArtifact.id, buildArtifactId: buildArtifact.id, expiresAt: new Date(Math.min(started + MAX_AGE_MS, Date.parse(receiptArtifact.expires_at), Date.parse(buildArtifact.expires_at))).toISOString(), firstAttemptPassed: true, releaseAuthorized: false };
}

async function github(path, token, binary = false) {
  requireThat(path.startsWith(`/repos/${REPOSITORY}/`) && !path.includes('..'), 'Unexpected GitHub endpoint');
  const response = await fetch(`https://api.github.com${path}`, { headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' }, signal: AbortSignal.timeout(60_000) });
  requireThat(response.ok, `GitHub evidence read failed (${response.status})`);
  if (!binary) return response.json();
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    requireThat(size <= MAX_ARCHIVE_BYTES, 'Artifact exceeds evidence size limit');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
async function allJobs(runId, token) {
  const result = [];
  for (let page = 1; page <= 20; page++) {
    const response = await github(`/repos/${REPOSITORY}/actions/runs/${runId}/attempts/1/jobs?per_page=100&page=${page}`, token);
    requireThat(Array.isArray(response.jobs), 'Invalid jobs response');
    result.push(...response.jobs);
    if (result.length === response.total_count) return result;
    requireThat(response.jobs.length > 0, 'Incomplete job pagination');
  }
  throw new Error('Workflow jobs exceed evidence limit');
}
function unzipMember(archivePath, member, maxBuffer) {
  const names = execFileSync('unzip', ['-Z1', archivePath], { encoding: 'utf8', maxBuffer: 1024 * 1024 }).trim().split('\n');
  requireThat(names.filter(name => name === member).length === 1, `Missing or duplicate artifact member: ${member}`);
  return execFileSync('unzip', ['-p', archivePath, member], { maxBuffer });
}
export async function verifyHostedEvidence({ repoRoot, candidateSha, runId, receiptArtifactId, buildArtifactId, expectedBuildSha256, requiredSuites, requiredJobs, manifestSha256, revokedRunIds = [], token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN }) {
  requireThat(token, 'Read-only GitHub token is required');
  for (const id of [runId, receiptArtifactId, buildArtifactId]) requireThat(Number.isSafeInteger(id) && id > 0, 'Invalid evidence identifier');
  requireThat(shaPattern.test(candidateSha), 'Candidate must be an exact commit');
  const prefix = `/repos/${REPOSITORY}/actions`;
  const [run, jobs, receiptArtifact, buildArtifact] = await Promise.all([
    github(`${prefix}/runs/${runId}`, token), allJobs(runId, token),
    github(`${prefix}/artifacts/${receiptArtifactId}`, token), github(`${prefix}/artifacts/${buildArtifactId}`, token),
  ]);
  requireThat(run.repository?.full_name === REPOSITORY && run.event === 'push' && run.head_branch === 'main' && run.path === WORKFLOW && run.status === 'completed' && run.conclusion === 'success' && run.run_attempt === 1 && shaPattern.test(run.head_sha), 'Run is not eligible for reuse');
  git(repoRoot, ['merge-base', '--is-ancestor', run.head_sha, candidateSha]);
  const identity = computeSourceIdentity(repoRoot, candidateSha), sourceIdentity = computeSourceIdentity(repoRoot, run.head_sha);
  for (const key of identityKeys) requireThat(identity[key] === sourceIdentity[key], `${key} differs from validated source`);
  // Fetch only artifact endpoints validated against the selected run; never use a supplied download URL.
  for (const artifact of [receiptArtifact, buildArtifact]) requireThat(artifact.workflow_run?.id === runId && !artifact.expired && digestPattern.test(artifact.digest) && artifact.size_in_bytes > 0 && artifact.size_in_bytes <= MAX_ARCHIVE_BYTES, 'Artifact not bound to selected run');
  const [receiptArchive, buildArchive] = await Promise.all([github(`${prefix}/artifacts/${receiptArtifactId}/zip`, token, true), github(`${prefix}/artifacts/${buildArtifactId}/zip`, token, true)]);
  requireThat(sha256(receiptArchive) === receiptArtifact.digest && sha256(buildArchive) === buildArtifact.digest, 'Downloaded artifact failed integrity check');
  const temp = mkdtempSync(join(tmpdir(), 'jems-evidence-'));
  try {
    writeFileSync(join(temp, 'receipt.zip'), receiptArchive);
    writeFileSync(join(temp, 'build.zip'), buildArchive);
    const receipt = JSON.parse(unzipMember(join(temp, 'receipt.zip'), 'validation-evidence.json', 4 * 1024 * 1024));
    const buildBytes = unzipMember(join(temp, 'build.zip'), 'ci-build.tar', 256 * 1024 * 1024);
    return verifyEvidence(receipt, { identity, sourceIdentity, run, jobs, receiptArtifact, receiptArchive, buildArtifact, buildArchive, buildBytes, requiredSuites, requiredJobs, expectedBuildSha256, manifestSha256, revokedRunIds });
  } finally { rmSync(temp, { recursive: true, force: true }); }
}

export function loadSuitePolicy(repoRoot) {
  const manifestBytes = readFileSync(join(repoRoot, 'scripts/ci/suites.json'));
  const manifest = JSON.parse(manifestBytes), pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json')));
  verifyCoverage(manifest, pkg);
  return {
    requiredSuites: Object.entries(manifest.shards).map(([id, shard]) => ({ id, commands: expandCommands(shard.commands, pkg.scripts) })),
    requiredJobs: ['prepare', 'image-isolation', 'validation-evidence', 'browser', 'learning', 'creative', 'notifications', 'private-coach-image', ...Object.keys(manifest.shards).map(id => `shard (${id})`)],
    manifestSha256: sha256(manifestBytes),
  };
}
function receiptFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? receiptFiles(join(directory, entry.name)) : entry.name.endsWith('.json') ? [join(directory, entry.name)] : []);
}
export function createReceiptFromDirectory(repoRoot, directory, env = process.env) {
  const identity = computeSourceIdentity(repoRoot, git(repoRoot, ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim());
  const build = JSON.parse(readFileSync(join(repoRoot, 'ci-build.json')));
  requireThat(build.sourceSha === identity.sourceSha && build.sourceTree === identity.sourceTree, 'Build source does not match checkout');
  const policy = loadSuitePolicy(repoRoot);
  const suites = receiptFiles(directory).map(path => JSON.parse(readFileSync(path))).filter(value => value.shard);
  for (const suite of suites) requireThat(String(suite.runId) === env.GITHUB_RUN_ID && String(suite.runAttempt) === env.GITHUB_RUN_ATTEMPT && suite.manifestSha256 === policy.manifestSha256.slice(7), 'Suite run or policy mismatch');
  return createReceipt({ identity, buildSha256: `sha256:${build.archiveSha256}`, runId: Number(env.GITHUB_RUN_ID), runAttempt: Number(env.GITHUB_RUN_ATTEMPT), manifestSha256: policy.manifestSha256, suites, requiredSuites: policy.requiredSuites });
}
/** Exact-source release adapter: discover only authenticated artifacts of the
 * selected exact-S run. This establishes fixture validation, not OCI provenance. */
export async function discoverExactSourceEvidence({ repoRoot, sourceSha, candidateSha = sourceSha, runId, token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN, ...policy }) {
  requireThat(token && shaPattern.test(sourceSha) && Number.isSafeInteger(runId) && runId > 0, 'Invalid exact-source evidence request');
  const prefix = `/repos/${REPOSITORY}/actions`;
  const run = await github(`${prefix}/runs/${runId}`, token);
  requireThat(run.head_sha === sourceSha && run.run_attempt === 1 && run.repository?.full_name === REPOSITORY && run.path === WORKFLOW && run.event === 'push' && run.head_branch === 'main' && run.status === 'completed' && run.conclusion === 'success', 'Run is not successful exact-source evidence');
  const listing = await github(`${prefix}/runs/${runId}/artifacts?per_page=100`, token);
  requireThat(Array.isArray(listing.artifacts) && listing.total_count === listing.artifacts.length, 'Incomplete artifact inventory');
  const find = name => {
    const found = listing.artifacts.filter(a => a.name === name);
    requireThat(found.length === 1 && !found[0].expired, 'Missing or ambiguous evidence artifact');
    return found[0];
  };
  const receiptArtifact = find(`arcade-validation-${sourceSha}-1`), buildArtifact = find(`arcade-build-${sourceSha}-1`);
  requireThat(receiptArtifact.size_in_bytes > 0 && receiptArtifact.size_in_bytes <= 4 * 1024 * 1024, 'Receipt artifact exceeds size limit');
  const archive = await github(`${prefix}/artifacts/${receiptArtifact.id}/zip`, token, true);
  requireThat(sha256(archive) === receiptArtifact.digest, 'Receipt archive integrity mismatch');
  const temp = mkdtempSync(join(tmpdir(), 'jems-exact-evidence-'));
  try {
    writeFileSync(join(temp, 'receipt.zip'), archive);
    const receipt = JSON.parse(unzipMember(join(temp, 'receipt.zip'), 'validation-evidence.json', 4 * 1024 * 1024));
    return await verifyHostedEvidence({ ...policy, repoRoot, candidateSha, runId, receiptArtifactId: receiptArtifact.id, buildArtifactId: buildArtifact.id, expectedBuildSha256: receipt.buildSha256, token });
  } finally { rmSync(temp, { recursive: true, force: true }); }
}

export async function findReusableEvidence({ repoRoot, base, head, token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN }) {
  requireThat(shaPattern.test(base) && shaPattern.test(head), 'Exact base and head required');
  const running = readFileSync(fileURLToPath(import.meta.url));
  requireThat(sha256(running) === sha256(git(repoRoot, ['show', `${base}:scripts/ci/validation-evidence.mjs`])), 'Evidence policy is not the trusted base version');
  const classification = classifyImpact({ cwd: repoRoot, base, head, event: 'pull_request' });
  requireThat(classification.mode === 'release-intent' && classification.trustedPolicy && classification.requiresEvidenceReuse, 'Only strictly equivalent operational transitions may reuse application evidence');
  requireThat(token, 'GitHub read token unavailable');
  const policy = loadSuitePolicy(repoRoot);
  const listing = await github(`/repos/${REPOSITORY}/actions/workflows/test.yml/runs?branch=main&event=push&status=success&per_page=5`, token);
  requireThat(Array.isArray(listing.workflow_runs), 'Invalid evidence candidate inventory');
  const failures = [];
  for (const run of listing.workflow_runs) {
    if (run.run_attempt !== 1 || Date.now() - Date.parse(run.run_started_at) > MAX_AGE_MS) continue;
    try { return await discoverExactSourceEvidence({ ...policy, repoRoot, sourceSha: run.head_sha, candidateSha: head, runId: run.id, token }); }
    catch (error) { failures.push({ runId: run.id, reason: error.message }); }
  }
  return { reusable: false, releaseAuthorized: false, reason: 'No recent complete authenticated equivalent full regression; run full.', candidates: failures };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [command, ...args] = process.argv.slice(2);
    if (command === 'reuse') {
      const values = {};
      for (let i = 0; i < args.length; i += 2) {
        requireThat(['--base', '--head', '--output'].includes(args[i]) && args[i + 1], 'Invalid reuse argument');
        values[args[i].slice(2)] = args[i + 1];
      }
      let result;
      try { result = await findReusableEvidence({ repoRoot: process.cwd(), base: values.base, head: values.head }); }
      catch (error) { result = { reusable: false, releaseAuthorized: false, reason: error.message }; }
      if (values.output) writeFileSync(values.output, JSON.stringify(result, null, 2) + '\n');
      console.log(JSON.stringify(result, null, 2));
      if (!result.reusable) process.exitCode = 1;
    }
    else if (command === 'identity' && args.length === 1) console.log(JSON.stringify(computeSourceIdentity(process.cwd(), args[0]), null, 2));
    else if (command === 'create' && args.length === 1) writeFileSync('validation-evidence.json', JSON.stringify(createReceiptFromDirectory(process.cwd(), args[0]), null, 2) + '\n');
    else if (command === 'verify' && args.length === 1) {
      // This request file is generated by a trusted caller; it cannot supply API results,
      // token, time or replacement verifier code. No production mutation is implemented.
      const request = JSON.parse(readFileSync(args[0], 'utf8'));
      console.log(JSON.stringify(await verifyHostedEvidence({ ...request, repoRoot: process.cwd(), token: process.env.GITHUB_TOKEN || process.env.GH_TOKEN }), null, 2));
    } else throw new Error('Usage: node scripts/ci/validation-evidence.mjs identity COMMIT | create RECEIPTS_DIRECTORY | verify TRUSTED_REQUEST.json');
  } catch (error) { console.error(`Evidence rejected: ${error.message}`); process.exitCode = 1; }
}
