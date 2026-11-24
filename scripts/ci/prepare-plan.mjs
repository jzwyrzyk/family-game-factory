import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { readJSON, sha256, verifyCoverage } from './suites.mjs';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

export function preparePlan(env = process.env) {
  const manifestBytes = fs.readFileSync('scripts/ci/suites.json');
  const manifest = JSON.parse(manifestBytes);
  verifyCoverage(manifest, readJSON('package.json'));
  const head = git('rev-parse', 'HEAD').trim();
  if (head !== env.GITHUB_SHA) throw new Error('CI_SOURCE_MISMATCH');
  const base = env.CI_BASE_SHA || head;
  if (!/^[a-f0-9]{40}$/.test(base)) throw new Error('CI_BASE_INVALID');
  let classifier = 'scripts/ci/classify-impact.mjs';
  let authority = 'full-bootstrap';
  let force = env.GITHUB_EVENT_NAME !== 'pull_request' || env.CI_FORCE_FULL === 'true';
  if (env.GITHUB_EVENT_NAME === 'pull_request') {
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
  const args = [classifier, '--base', base, '--head', head, '--event', env.GITHUB_EVENT_NAME || 'workflow_dispatch'];
  if (force) args.push('--force-full');
  let plan = JSON.parse(execFileSync(process.execPath, args, { encoding: 'utf8' }));
  if (plan.requiresEvidenceReuse) {
    // The verifier is also taken from the reviewed base. Any absence, API error,
    // stale/invalid evidence or unavailable artifact makes the plan full again.
    // A PR-supplied historical run ID is never an authority to skip tests.
    let reused = false;
    try {
      const folder = fs.mkdtempSync(path.join(env.RUNNER_TEMP || os.tmpdir(), 'jems-ci-reuse-'));
      for (const file of ['validation-evidence.mjs', 'classify-impact.mjs', 'suites.mjs']) fs.writeFileSync(path.join(folder, file), git('show', `${base}:scripts/ci/${file}`));
      const result = spawnSync(process.execPath, [path.join(folder, 'validation-evidence.mjs'), 'reuse', '--base', base, '--head', head, '--output', 'ci-reuse.json'], { encoding: 'utf8', timeout: 60_000, env });
      if (result.status === 0) {
        const receipt = readJSON('ci-reuse.json');
        if (receipt.reusable === true && receipt.candidateSha === head) { plan.reusedEvidence = receipt; reused = true; }
      }
    } catch { /* Fail closed to executing the complete regression below. */ }
    if (!reused) {
      plan = JSON.parse(execFileSync(process.execPath, [...args.filter(arg => arg !== '--force-full'), '--force-full'], { encoding: 'utf8' }));
      plan.reasons.push({ path: null, reason: 'Exact authenticated application evidence unavailable or invalid; full regression replaces reuse.' });
    }
  }
  plan.selectionAuthority = authority;
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
  if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `### Validation selection: ${plan.mode}\n\nSource \`${head}\`; base \`${base}\`; authority **${authority}**.\n\n| Shard | Selected | Reason |\n| --- | --- | --- |\n${plan.decisions.map(d => `| ${d.id} | ${d.required} | ${d.reason} |`).join('\n')}\n\nReasons:\n${plan.reasons.map(r => `- ${String(r.path || '(policy)').replaceAll('\n', ' ')}: ${r.reason}`).join('\n')}\n`);
  return plan;
}

if (process.argv[1]?.endsWith('/prepare-plan.mjs')) console.log(JSON.stringify(preparePlan(), null, 2));
