import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cases, caseIdentity, pairedManifest, benchmarkVersion, digest } from '../tools/premium-benchmark-cases';
import { measureJob, summarize, pairedSheet, type BenchmarkJob } from '../tools/premium-quality-benchmark';
import { dryRun } from '../tools/premium-benchmark-dry-run';
import { robotRouteFixture } from '../server/testing/working-game-fixtures';
import { productionFixture, compiledPipelineFixture } from './quality-pipeline-fixtures';
import { bindGameProductionPlan } from '../server/quality/presentation-plan';
import { bindQualityReview } from '../server/quality/game-quality';
import { syntheticQualityEvidence, syntheticPremiumReviewAnswer, syntheticReviewAnswer, fixturePremiumPlanProposal } from '../server/testing/presentation-quality-fixtures';
import { INITIAL_PREMIUM_MODELS, PREMIUM_POLICY_VERSION, premiumModelRates } from '../server/agent/model-policy';

type Attempt = BenchmarkJob['attempts'][number];

function job(lane: BenchmarkJob['lane'], replicate = 1): BenchmarkJob {
  const item = cases.find(c => c.id === 'star-map')!;
  const game = productionFixture(robotRouteFixture, item.request);
  if (lane === 'premium') {
    game.productionPlan = bindGameProductionPlan(fixturePremiumPlanProposal(), {
      gameManifest: { id: 'new', allowedMechanics: ['generated-module-v2'] }, baseRevision: { id: 'new' },
      childIntent: item.request, allowedCapabilities: ['generated-module-v2'], budget: { maxUnits: 1, timeoutMs: 1000 },
      signal: new AbortController().signal,
    }, true);
  }
  const compiled = compiledPipelineFixture(game), evidence = syntheticQualityEvidence(compiled);
  const review = bindQualityReview(compiled, evidence, lane === 'legacy' ? syntheticReviewAnswer() : syntheticPremiumReviewAnswer());
  const calls: Attempt['calls'] = (['planning', 'construction', 'review'] as const).map(stage => ({
    stage, model: lane === 'premium' ? INITIAL_PREMIUM_MODELS[stage] : 'synthetic-legacy', reasoningEffort: lane === 'premium' ? 'high' : 'low',
    inputTokens: 10, cachedInputTokens: 0, outputTokens: 8, reasoningTokens: 5, costMicroUsd: lane === 'legacy' ? 3 :
      10 * premiumModelRates(INITIAL_PREMIUM_MODELS[stage])!.input + 8 * premiumModelRates(INITIAL_PREMIUM_MODELS[stage])!.output,
  }));
  const packet = { game: compiled, evidence, review, human: {
    evidenceHash: review.evidenceHash, scores: { clarity: 2, polish: 3, fidelity: 3, feedback: 2, funPotential: 3 },
    checks: Object.fromEntries(Object.keys(item.checks).map(k => [k, {
      status: 'unobserved' as const, captureIds: [], traces: [],
    }])),
  } };
  return {
    version: benchmarkVersion, origin: 'offline-test', caseId: item.id, lane, replicate, ...caseIdentity(item),
    sharedSetupHash: digest('same configuration'), jobHash: digest(item.id + lane + replicate), sourceSha: 'a'.repeat(40),
    policyVersion: lane === 'legacy' ? 'legacy' : PREMIUM_POLICY_VERSION, durationMs: 1200,
    attempts: [{ outcome: 'accepted', durationMs: 700, usageComplete: true, imageCostMicroUsd: 0, calls, packet }],
  };
}

test('seven paired adapter dry runs transmit the exact manifest prompts and exercise both plan and coding routes', async () => {
  const manifest = pairedManifest(), dry = await dryRun();
  assert.equal(manifest.cases.length, 7);
  assert.equal(new Set(manifest.cases.map(c => c.requestHash)).size, 7);
  assert.equal(dry.trials.length, 14); assert.equal(dry.paidCalls, 0);
  assert.equal(dry.actualModelComparison, 'pending');
  const fox = manifest.cases.find(c => c.id === 'fox-and-leaves')!;
  assert.match(fox.request, /jump.*duck.*100.*celebration/);
  assert.deepEqual(Object.keys(fox.checks), ['world', 'jump', 'duck', 'progression', 'finish', 'celebration']);
  for (const item of manifest.cases) {
    const [legacy, premium] = dry.trials.filter(t => t.caseId === item.id);
    assert.equal(legacy.requestHash, item.requestHash); assert.equal(premium.requestHash, item.requestHash);
    assert.equal(legacy.plan, 'game-production-plan-v1'); assert.equal(premium.plan, 'game-production-plan-v2');
    assert.deepEqual(premium.calls.map(c => [c.model, c.effort]), [['gpt-6.2-sol', 'high'], ['gpt-6.2-astra', 'high']]);
  }
});

test('import reconciles failed attempts, a successful repair, rejected jobs, total spend, timing and paired human scores', () => {
  const legacy = job('legacy'), premium = job('premium'), rejected = job('premium', 2);
  const repaired = premium.attempts[0];
  premium.attempts = [
    { ...repaired, outcome: 'technical-failure', durationMs: 200, calls: repaired.calls.slice(0, 2), packet: null },
    { ...repaired, calls: [{ ...repaired.calls[1], stage: 'repair' }, repaired.calls[2]] },
  ];
  repaired.packet!.human!.scores.clarity = 4;
  rejected.attempts[0] = { ...rejected.attempts[0], outcome: 'provider-failure', calls: rejected.attempts[0].calls.slice(0, 1), packet: null };
  const report = summarize([legacy, premium, rejected].map(measureJob));
  assert.equal(report.actualModelComparison, 'pending');
  assert.equal(report.humanRatedPairs, 1);
  assert.equal(report.premium.jobs, 2); assert.equal(report.premium.attempts, 3);
  assert.equal(report.premium.acceptedAfterRepair, 1); assert.equal(report.premium.rejected, 1);
  assert.equal(report.premium.attemptOutcomes['technical-failure'], 1);
  assert.equal(report.premium.totalMicroUsd, 1100); assert.equal(report.premium.microUsdPerAttempt, 1100 / 3);
  assert.equal(report.premium.microUsdPerAcceptedGame, 1100);
  assert.equal(report.premium.outputTokens, 40); assert.equal(report.premium.reasoningTokensIncludedInOutput, 25);
  assert.equal(report.premium.meanJobDurationMs, 1200);
  const pair = report.pairs.find(p => p.caseId === 'star-map' && p.replicate === 1)!;
  assert.equal(pair.pairedScoreDelta?.clarity, 2);
  assert.equal(pair.premium?.attempts[1].packet?.checks?.wall, 'unobserved');
  assert.ok(!JSON.stringify(report).includes('createGame('));
  assert.ok(!JSON.stringify(report).includes('base64'));
});

test('unknown charges suppress cost means, missing lane stays pending and fixture results cannot be pooled with provider exports', () => {
  const uncertain = job('legacy');
  uncertain.attempts = [{ calls: [], packet: null, durationMs: 10, usageComplete: false, imageCostMicroUsd: null, outcome: 'interrupted' }];
  const measured = measureJob(uncertain);
  const r = summarize([measured]);
  assert.equal(r.legacy.totalMicroUsd, null); assert.equal(r.legacy.microUsdPerAttempt, null); assert.equal(r.legacy.outputTokens, null);
  assert.equal(r.premium.totalMicroUsd, null); assert.equal(r.humanRatedPairs, 0);
  const provider = measureJob({ ...job('premium'), origin: 'operator-provider-export' });
  assert.equal(summarize([provider]).actualModelComparison, 'partial-operator-exports');
  assert.throws(() => summarize([measured, provider]), /MIXED_ORIGINS/);
});

test('changing the request, setup, policy lane or human/quality evidence invalidates comparison', () => {
  const required = job('legacy'), packet = required.attempts[0].packet!;
  assert.throws(() => measureJob({ ...required, caseId: 'echo-garden' }), /CASE_BINDING/);
  assert.throws(() => measureJob({ ...required, criteriaHash: digest('changed') }), /CASE_BINDING/);
  assert.throws(() => summarize([measureJob(required), measureJob(required)]), /DUPLICATE_JOB/);
  assert.throws(() => summarize([measureJob(required), measureJob({ ...job('premium'), sharedSetupHash: digest('different budget') })]), /UNEQUAL_SETUP/);
  const wrongLane = job('premium');
  wrongLane.attempts[0].packet = packet;
  assert.throws(() => measureJob(wrongLane), /LANE_PLAN/);
  packet.human!.evidenceHash = digest('stale evidence');
  assert.throws(() => measureJob(required), /HUMAN_EVIDENCE_BINDING/);
  packet.human!.evidenceHash = packet.review.evidenceHash;
  packet.human!.checks.wall = { status: 'observed', captureIds: ['desktop-initial', 'tablet-progress'], traces: [{ device: 'desktop', index: 0 }] };
  assert.throws(() => measureJob(required), /UNGROUNDED_OBSERVATION/);
  packet.human!.checks.wall.captureIds = ['desktop-initial', 'desktop-progress'];
  assert.equal(measureJob(required).attempts[0].packet!.checks!.wall, 'observed');
  packet.human!.checks.wall.traces[0].index = 9;
  assert.throws(() => measureJob(required), /TRACE_REFERENCE/);
  packet.evidence.captures[0].sha256 = digest('wrong screenshot');
  assert.throws(() => measureJob(required), /IMAGE_MISMATCH/);
});

test('refuses downgrade receipts, double-counted reasoning, optimistic fidelity and a repair after uncertain failure', () => {
  const r = job('premium');
  r.attempts[0].calls[1].model = 'gpt-6.2-sol'; assert.throws(() => measureJob(r), /PREMIUM_MODEL/);
  r.attempts[0].calls[1].model = 'gpt-6.2-astra';
  const planning = r.attempts[0].calls[0];
  planning.model = 'synthetic-mini';
  assert.throws(() => measureJob(r), /PREMIUM_MODEL/);
  planning.model = INITIAL_PREMIUM_MODELS.planning;
  planning.cachedInputTokens = 1;
  assert.throws(() => measureJob(r), /PREMIUM_MEASURED_USAGE/);
  planning.cachedInputTokens = 0;
  planning.costMicroUsd++;
  assert.throws(() => measureJob(r), /PREMIUM_MEASURED_USAGE/);
  planning.costMicroUsd--;
  r.attempts[0].calls[0].reasoningTokens = 100;
  assert.throws(() => measureJob(r), /TOKEN_TOTALS/);
  r.attempts[0].calls[0].reasoningTokens = 4;
  r.attempts[0].packet!.human!.scores.fidelity = 5;
  assert.throws(() => measureJob(r), /UNDOCUMENTED_FIDELITY/);
  r.attempts = ['interrupted', 'budget-denied'].map(outcome => ({
    outcome: outcome as Attempt['outcome'], calls: [], packet: null, durationMs: 1, usageComplete: false, imageCostMicroUsd: null,
  }));
  assert.throws(() => measureJob(r), /REPAIR_SEQUENCE/);
});

test('review sheet places scores beside identical anchored criteria and withholds policy and pipeline verdict from the reviewer', () => {
  const a = job('legacy'), b = job('premium');
  const sheet = pairedSheet(a, b);
  assert.equal(sheet, pairedSheet(b, a));
  for (const token of ['Game A', 'Game B', 'data:image/png;base64,', 'desktop-progress', 'funPotential', a.attempts[0].packet!.review.evidenceHash])
    assert.ok(sheet.includes(token));
  for (const token of ['gpt-6.', 'synthetic-legacy', 'synthetic-before', 'quality-review-v1', 'createGame(']) assert.ok(!sheet.includes(token));
  assert.throws(() => pairedSheet(a, job('premium', 2)), /NOT_PAIRED/);
});
