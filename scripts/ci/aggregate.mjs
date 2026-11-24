import fs from 'node:fs';
import path from 'node:path';
import { expandCommands, readJSON, sha256, verifyCoverage } from './suites.mjs';

export function validatePlan(plan, manifest, identity) {
  if (plan.schemaVersion !== 1 || plan.head !== identity.sourceSha || plan.runId !== identity.runId || plan.runAttempt !== identity.runAttempt || plan.manifestSha256 !== identity.manifestSha256) throw new Error('CI_PLAN_IDENTITY_MISMATCH');
  if (!plan.requiredOperations || !plan.requiredDocumentation) throw new Error('CI_REQUIRED_PREPARATION_MISSING');
  if (!['full', 'documentation', 'release-intent', 'targeted'].includes(plan.mode) || !Array.isArray(plan.requiredShards) || new Set(plan.requiredShards).size !== plan.requiredShards.length || plan.requiredShards.some(id => !manifest.shards[id]) || typeof plan.requiredImage !== 'boolean') throw new Error('CI_PLAN_INVALID');
  if (plan.mode === 'full' && (plan.requiredShards.length !== Object.keys(manifest.shards).length || !plan.requiredImage)) throw new Error('CI_FULL_PLAN_INCOMPLETE');
  if (plan.mode !== 'full' && plan.selectionAuthority !== 'trusted-base') throw new Error('CI_UNTRUSTED_NARROWING');
  if (plan.mode === 'release-intent' && (plan.reusedEvidence?.reusable !== true || plan.reusedEvidence.candidateSha !== identity.sourceSha)) throw new Error('CI_REUSE_NOT_VERIFIED');
  if (identity.eventName !== 'pull_request' && plan.mode !== 'full') throw new Error('CI_NON_PR_MUST_RUN_FULL');
  return plan;
}

export function verifyAggregate({ group, plan, manifest, packageJSON, receipts, identity, prepareResult, shardsResult, imageResult }) {
  validatePlan(plan, manifest, identity);
  verifyCoverage(manifest, packageJSON);
  if (prepareResult !== 'success') throw new Error('CI_PREPARATION_NOT_SUCCESSFUL');
  if (group === 'private-coach-image') {
    if (imageResult !== (plan.requiredImage ? 'success' : 'skipped')) throw new Error('CI_IMAGE_RESULT_INVALID');
    return { group, required: plan.requiredImage, reason: plan.requiredImage ? 'Image isolation passed' : plan.mode };
  }
  if (!manifest.legacyGroups[group]) throw new Error('CI_UNKNOWN_GROUP');
  const expected = plan.requiredShards.filter(id => manifest.shards[id].group === group);
  if (shardsResult !== (plan.requiredShards.length ? 'success' : 'skipped')) throw new Error('CI_MATRIX_NOT_SUCCESSFUL');
  const groupReceipts = receipts.filter(receipt => receipt.group === group);
  if (groupReceipts.length !== expected.length || new Set(groupReceipts.map(r => r.shard)).size !== expected.length || groupReceipts.some(r => !expected.includes(r.shard))) throw new Error('CI_RECEIPT_SET_MISMATCH');
  for (const id of expected) {
    const receipt = groupReceipts.find(r => r.shard === id);
    if (!receipt || receipt.schemaVersion !== 1 || receipt.status !== 'success' || receipt.sourceSha !== identity.sourceSha || receipt.runId !== identity.runId || receipt.runAttempt !== identity.runAttempt || receipt.manifestSha256 !== identity.manifestSha256 || receipt.buildSha256 !== identity.buildSha256) throw new Error(`CI_RECEIPT_INVALID:${id}`);
    const commands = expandCommands(manifest.shards[id].commands, packageJSON.scripts);
    if (JSON.stringify(receipt.commands?.map(c => c.command)) !== JSON.stringify(commands) || receipt.commands.some(c => c.exitCode !== 0 || !Number.isFinite(c.seconds) || c.seconds < 0)) throw new Error(`CI_COMMAND_RESULT_INVALID:${id}`);
  }
  return { group, requiredShards: expected, reason: expected.length ? 'Every selected shard and command succeeded' : `Explicit ${plan.mode} plan; documentation and operations passed` };
}

function files(folder) {
  if (!fs.existsSync(folder)) return [];
  return fs.readdirSync(folder, { withFileTypes: true }).flatMap(file => file.isDirectory() ? files(path.join(folder, file.name)) : [path.join(folder, file.name)]);
}

export function main(group) {
  const manifestBytes = fs.readFileSync('scripts/ci/suites.json');
  const result = verifyAggregate({ group, plan: readJSON('ci-plan.json'), manifest: JSON.parse(manifestBytes), packageJSON: readJSON('package.json'), receipts: files('ci-receipts').filter(file => file.endsWith('.json')).map(readJSON), identity: { sourceSha: process.env.GITHUB_SHA, manifestSha256: sha256(manifestBytes), buildSha256: process.env.CI_BUILD_DIGEST, runId: process.env.GITHUB_RUN_ID, runAttempt: process.env.GITHUB_RUN_ATTEMPT, eventName: process.env.GITHUB_EVENT_NAME }, prepareResult: process.env.CI_PREPARE_RESULT, shardsResult: process.env.CI_SHARDS_RESULT, imageResult: process.env.CI_IMAGE_RESULT });
  console.log(JSON.stringify(result, null, 2));
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### ${group}\n\n${result.reason}.\n\n${JSON.stringify(result.requiredShards || [])}\n`);
}

if (process.argv[1]?.endsWith('/aggregate.mjs')) main(process.argv[2]);
