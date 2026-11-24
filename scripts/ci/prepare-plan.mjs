import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { readJSON, sha256, verifyCoverage } from './suites.mjs';

export const MAIN_REUSE_POLICY = 'protected-main-equivalence-v1';
const MAIN_WORKFLOW = 'jzwyrzyk/family-game-factory/.github/workflows/test.yml@refs/heads/main';

// The opt-in is literal reviewed workflow source, never a repository variable or
// PR input. Event identity comes from GitHub's push payload and default context.
export function mainReuseContext(env, event, head) {
  if (env.CI_MAIN_REUSE_POLICY !== MAIN_REUSE_POLICY || env.GITHUB_EVENT_NAME !== 'push'
    || env.GITHUB_REF !== 'refs/heads/main' || env.GITHUB_REF_PROTECTED !== 'true'
    || env.GITHUB_REPOSITORY !== 'jzwyrzyk/family-game-factory' || env.GITHUB_WORKFLOW_REF !== MAIN_WORKFLOW
    || !/^[a-f0-9]{40}$/.test(head ?? '') || event?.after !== head || event?.ref !== 'refs/heads/main'
    || event?.repository?.full_name !== env.GITHUB_REPOSITORY
    || !/^[a-f0-9]{40}$/.test(event?.before ?? '') || /^0+$/.test(event.before)
    || event.before === head || event.created === true || event.deleted === true || event.forced === true) return null;
  return { policy: MAIN_REUSE_POLICY, base: event.before, head, eventName: 'push', ref: 'refs/heads/main', workflowRef: MAIN_WORKFLOW };
}

export function readPushContext(env, head) {
  try { return mainReuseContext(env, JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH, 'utf8')), head); }
  catch { return null; }
}

// Authentication occurs in the trusted base verifier. Keep its bounded proof
// intact across jobs; booleans alone never constitute reusable evidence.
export function validateReuseSummary(receipt, candidateSha, manifestSha256, currentRunId, now = Date.now()) {
  const digest = value => /^sha256:[a-f0-9]{64}$/.test(value ?? '');
  const id = value => Number.isSafeInteger(value) && value > 0;
  const expires = Date.parse(receipt?.expiresAt);
  if (receipt?.reusable !== true || receipt.scope !== 'ci-fixtures-full-regression'
    || receipt.candidateSha !== candidateSha || !/^[a-f0-9]{40}$/.test(receipt.sourceSha ?? '')
    || !id(receipt.runId) || receipt.runId === Number(currentRunId) || receipt.runAttempt !== 1
    || receipt.firstAttemptPassed !== true || receipt.releaseAuthorized !== false
    || !id(receipt.receiptArtifactId) || !id(receipt.buildArtifactId) || receipt.receiptArtifactId === receipt.buildArtifactId
    || ![receipt.buildSha256, receipt.receiptArchiveSha256, receipt.buildArchiveSha256, receipt.validationSha256].every(digest)
    || receipt.manifestSha256 !== `sha256:${manifestSha256}`
    || !Number.isFinite(expires) || expires <= now || expires > now + 7 * 24 * 60 * 60 * 1000) throw new Error('CI_REUSE_PROOF_INVALID');
  return receipt;
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

export function preparePlan(env = process.env) {
  const manifestBytes = fs.readFileSync('scripts/ci/suites.json');
  const manifest = JSON.parse(manifestBytes);
  verifyCoverage(manifest, readJSON('package.json'));
  const head = git('rev-parse', 'HEAD').trim();
  if (head !== env.GITHUB_SHA) throw new Error('CI_SOURCE_MISMATCH');
  const mainContext = readPushContext(env, head);
  const requestedBase = mainContext?.base || env.CI_BASE_SHA || head;
  const invalidBase = !/^[a-f0-9]{40}$/.test(requestedBase);
  const base = invalidBase ? head : requestedBase;
  let classifier = 'scripts/ci/classify-impact.mjs';
  let authority = 'full-bootstrap';
  let force = invalidBase || (env.GITHUB_EVENT_NAME !== 'pull_request' && !mainContext) || env.CI_FORCE_FULL === 'true';
  if (env.GITHUB_EVENT_NAME === 'pull_request' || mainContext) {
    try {
      const trusted = git('show', `${base}:scripts/ci/classify-impact.mjs`);
      const folder = fs.mkdtempSync(path.join(env.RUNNER_TEMP || os.tmpdir(), 'jems-ci-policy-'));
      classifier = path.join(folder, 'classify-impact.mjs');
      fs.writeFileSync(classifier, trusted);
      authority = 'trusted-base';
    } catch {
      force = true;
    }
  }
  // Reuse the conservative PR tree classifier only after proving protected-main
  // identity. Preserve the actual event separately for every aggregate.
  const classifyEvent = mainContext ? 'pull_request' : env.GITHUB_EVENT_NAME || 'workflow_dispatch';
  const args = [classifier, '--base', base, '--head', head, '--event', classifyEvent];
  if (force) args.push('--force-full');
  let plan = JSON.parse(execFileSync(process.execPath, args, { encoding: 'utf8' }));
  if (mainContext && !['full', 'documentation', 'release-intent'].includes(plan.mode)) {
    plan = JSON.parse(execFileSync(process.execPath, [...args, '--force-full'], { encoding: 'utf8' }));
  }
  if (mainContext && plan.mode !== 'full') {
    plan.requiresEvidenceReuse = true;
    plan.reasons.push({ path: null, reason: 'Protected-main documentation/operation reuse requires authenticated full-source, immutable build and test-policy equivalence; this push is not new gameplay evidence.' });
  }
  if (plan.requiresEvidenceReuse) {
    // The verifier is also taken from the reviewed base. Any absence, API error,
    // stale/invalid evidence or unavailable artifact makes the plan full again.
    // A PR-supplied historical run ID is never an authority to skip tests.
    let reused = false;
    try {
      const folder = fs.mkdtempSync(path.join(env.RUNNER_TEMP || os.tmpdir(), 'jems-ci-reuse-'));
      for (const file of ['validation-evidence.mjs', 'classify-impact.mjs', 'suites.mjs']) fs.writeFileSync(path.join(folder, file), git('show', `${base}:scripts/ci/${file}`));
      fs.rmSync('ci-reuse.json', { force: true });
      const result = spawnSync(process.execPath, [path.join(folder, 'validation-evidence.mjs'), 'reuse', '--base', base, '--head', head, '--output', 'ci-reuse.json'], { encoding: 'utf8', timeout: 60_000, env });
      if (result.status === 0) {
        const receipt = readJSON('ci-reuse.json');
        validateReuseSummary(receipt, head, sha256(manifestBytes), env.GITHUB_RUN_ID);
        plan.reusedEvidence = receipt; reused = true;
      }
    } catch { /* Fail closed to executing the complete regression below. */ }
    if (!reused) {
      plan = JSON.parse(execFileSync(process.execPath, [...args.filter(arg => arg !== '--force-full'), '--force-full'], { encoding: 'utf8' }));
      plan.reasons.push({ path: null, reason: 'Exact authenticated application evidence unavailable or invalid; full regression replaces reuse.' });
    }
  }
  if (invalidBase) plan.reasons.push({ path: null, reason: 'Invalid base identity; validate the entire current source.' });
  plan.selectionAuthority = authority;
  plan.sourceEvent = env.GITHUB_EVENT_NAME || 'workflow_dispatch';
  if (mainContext && plan.mode !== 'full') plan.mainReuse = mainContext;
  if (env.GITHUB_EVENT_NAME === 'push' && !mainContext) plan.reasons.push({ path: null, reason: 'Protected-main reuse opt-in or exact previous-main event context is absent; full regression required.' });
  plan.manifestSha256 = sha256(manifestBytes);
  plan.runId = env.GITHUB_RUN_ID;
  plan.runAttempt = env.GITHUB_RUN_ATTEMPT;
  // A reviewed older base policy may not know a newly added shard. Infrastructure
  // changes already demand full coverage; widen that plan to the checked manifest.
  if (plan.mode === 'full') {
    plan.requiredShards = Object.keys(manifest.shards);
    plan.requiredImage = true;
    plan.requiredGroups = [...Object.keys(manifest.legacyGroups), 'private-coach-image'];
    plan.decisions = plan.requiredShards.map(id => ({ id, required: true, reason: 'Full regression: see classification reasons.' }));
  }
  if (plan.head !== head || plan.requiredShards.some(id => !manifest.shards[id])) throw new Error('CI_CLASSIFIER_MANIFEST_MISMATCH');
  if (plan.mode !== 'full' && (authority !== 'trusted-base' || plan.trustedPolicy !== true)) throw new Error('CI_UNTRUSTED_NARROWING');
  const priority = ['mining', 'browser-generated', 'studio-core', 'browser-storage', 'factory', 'physical', 'child-coach', 'creation-art', 'learning-math', 'browser-core', 'pals-rewards', 'learning-language', 'notifications'];
  plan.requiredShards.sort((a, b) => priority.indexOf(a) - priority.indexOf(b));
  const planBytes = JSON.stringify(plan, null, 2) + '\n';
  fs.writeFileSync('ci-plan.json', planBytes);
  if (env.GITHUB_OUTPUT) fs.appendFileSync(env.GITHUB_OUTPUT, `plan-digest=${sha256(planBytes)}\nmatrix=${JSON.stringify({ shard: plan.requiredShards.length ? plan.requiredShards : ['not-selected'] })}\nhas-shards=${plan.requiredShards.length > 0}\nimage=${plan.requiredImage}\nmode=${plan.mode}\n`);
  if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `### Validation selection: ${plan.mode}\n\nSource \`${head}\`; base \`${base}\`; authority **${authority}**; actual event **${plan.sourceEvent}**.\n\n| Shard | Selected | Reason |\n| --- | --- | --- |\n${plan.decisions.map(d => `| ${d.id} | ${d.required} | ${d.reason} |`).join('\n')}\n\nReasons:\n${plan.reasons.map(r => `- ${String(r.path || '(policy)').replaceAll('\n', ' ')}: ${r.reason}`).join('\n')}\n`);
  return plan;
}

if (process.argv[1]?.endsWith('/prepare-plan.mjs')) console.log(JSON.stringify(preparePlan(), null, 2));
