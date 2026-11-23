// Offline reader. It has no provider, job submission, candidate execution or billing path.
import { readFileSync, statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { validateCompiled, validateGenerated, type GeneratedGame } from '../server/agent/generated';
import { INITIAL_PREMIUM_MODELS, PREMIUM_POLICY_VERSION, premiumModelRates, type ModelStage } from '../server/agent/model-policy';
import { validateQualityEvidence, validateQualityReview, type GameQualityEvidence, type GameQualityReview } from '../server/quality/game-quality';
import { blindSheet } from './premium-benchmark-rubric';
import { benchmarkVersion, cases, caseIdentity, pairedManifest, scoreAxes, rubricTable, type BenchmarkCase, type Scores } from './premium-benchmark-cases';

type Lane = 'legacy' | 'premium';
const outcomes = ['accepted', 'technical-failure', 'quality-failure', 'provider-failure', 'budget-denied', 'interrupted'] as const;
type Outcome = typeof outcomes[number];
type Origin = 'operator-provider-export' | 'offline-test';
interface Call {
  stage: ModelStage; model: string; reasoningEffort: string;
  inputTokens: number; cachedInputTokens: number; outputTokens: number; reasoningTokens: number; costMicroUsd: number;
}
interface Observation {
  status: 'observed' | 'missing' | 'unobserved';
  captureIds: string[]; traces: { device: 'desktop' | 'tablet'; index: number }[];
}
interface Assessment {
  evidenceHash: string; scores: Scores; checks: Record<string, Observation>;
}
interface Packet {
  game: GeneratedGame; evidence: GameQualityEvidence; review: GameQualityReview;
  human: Assessment | null;
}
interface Attempt {
  outcome: Outcome; durationMs: number; usageComplete: boolean; imageCostMicroUsd: number | null;
  calls: Call[]; packet: Packet | null;
}
export interface BenchmarkJob {
  version: typeof benchmarkVersion; origin: Origin; caseId: string; lane: Lane; replicate: number;
  requestHash: string; criteriaHash: string; sharedSetupHash: string; jobHash: string; sourceSha: string;
  policyVersion: string; durationMs: number; attempts: Attempt[];
}
function check(ok: unknown, code: string): asserts ok { if (!ok) throw Error('BENCHMARK_' + code); }
const count = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 && n <= 1e12;
const hash = (s: unknown) => typeof s === 'string' && /^[a-f0-9]{64}$/.test(s);
const object = (v: unknown) => v !== null && typeof v === 'object' && !Array.isArray(v);
function exactKeys(v: object, keys: string[]) {
  return object(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
}

function validateHuman(item: BenchmarkCase, evidence: GameQualityEvidence, review: GameQualityReview, human: Assessment) {
  check(object(human) && human.evidenceHash === review.evidenceHash, 'HUMAN_EVIDENCE_BINDING');
  check(exactKeys(human.scores, [...scoreAxes]) && scoreAxes.every(k => Number.isInteger(human.scores[k]) && human.scores[k] >= 1 && human.scores[k] <= 5), 'RUBRIC');
  check(exactKeys(human.checks, Object.keys(item.checks)), 'CHECKS');
  for (const obs of Object.values(human.checks)) {
    check(object(obs) && ['observed', 'missing', 'unobserved'].includes(obs.status), 'OBSERVATION');
    check(Array.isArray(obs.captureIds) && obs.captureIds.length <= evidence.captures.length &&
      obs.captureIds.every(id => evidence.captures.some(c => c.id === id)) && new Set(obs.captureIds).size === obs.captureIds.length, 'CAPTURE_REFERENCE');
    check(Array.isArray(obs.traces) && obs.traces.length <= 32, 'TRACE_REFERENCE');
    for (const trace of obs.traces) {
      const session = evidence.sessions.find(s => s.device === trace.device);
      check(count(trace.index) && session?.actionTrace[trace.index] && obs.captureIds.some(id => evidence.captures.find(c => c.id === id)?.device === trace.device), 'TRACE_REFERENCE');
    }
    if (obs.status !== 'unobserved') {
      const witnessed = obs.traces.some(trace => {
        const receipt = evidence.sessions.find(s => s.device === trace.device)!.actionTrace[trace.index];
        const shots = evidence.captures.filter(c => c.device === trace.device && obs.captureIds.includes(c.id));
        return receipt.action.type !== 'wait' && shots.some(c => c.tick <= receipt.startTick) && shots.some(c => c.tick >= receipt.endTick && c.phase !== 'initial');
      });
      check(obs.captureIds.length >= 2 && witnessed, 'UNGROUNDED_OBSERVATION');
    }
  }
  if (human.scores.fidelity >= 4) {
    check(Object.values(human.checks).every(obs => obs.status === 'observed'), 'UNDOCUMENTED_FIDELITY');
    if (human.scores.fidelity === 5)
      check(Object.values(human.checks).every(obs => new Set(obs.traces.map(t => t.device)).size === 2), 'UNDOCUMENTED_FIDELITY');
  }
}

function checkPacket(item: BenchmarkCase, lane: Lane, pkt: Packet, outcome: Outcome) {
  const { compiled: _compiled, ...candidate } = pkt.game;
  const game = validateCompiled(validateGenerated(candidate), pkt.game);
  check(game.productionPlan?.requestHash === caseIdentity(item).requestHash && game.productionPlan.baseRevisionId === 'new', 'GAME_REQUEST_BINDING');
  check(game.productionPlan.version === (lane === 'premium' ? 'game-production-plan-v2' : 'game-production-plan-v1'), 'LANE_PLAN');
  const evidence = validateQualityEvidence(game, pkt.evidence);
  const review = validateQualityReview(game, evidence, pkt.review);
  check((outcome === 'accepted') === (review.verdict === 'pass') || outcome === 'interrupted', 'VERDICT');
  if (pkt.human !== null) validateHuman(item, evidence, review, pkt.human);
  return {
    artifactHash: review.artifactHash, evidenceHash: review.evidenceHash, axes: review.axes, findings: review.findings,
    sessions: evidence.sessions.map(s => ({ device: s.device, outcome: s.outcome, inputs: s.inputs, traces: s.actionTrace.length, replay: s.replay })),
    captureIds: evidence.captures.map(c => c.id), scores: pkt.human?.scores ?? null,
    checks: pkt.human ? Object.fromEntries(Object.entries(pkt.human.checks).map(([key, obs]) => [key, obs.status])) : null,
  };
}

function checkedAttempt(item: BenchmarkCase, row: BenchmarkJob, attempt: Attempt, index: number) {
  check(object(attempt) && outcomes.includes(attempt.outcome) && count(attempt.durationMs) && typeof attempt.usageComplete === 'boolean', 'ATTEMPT');
  check(attempt.imageCostMicroUsd === null || count(attempt.imageCostMicroUsd), 'IMAGE_USAGE');
  check(Array.isArray(attempt.calls) && attempt.calls.length <= 3, 'CALLS');
  const stages = index === 0 ? ['planning', 'construction', 'review'] : ['planning', 'repair', 'review'];
  let previous = -1;
  for (const call of attempt.calls) {
    check(object(call) && stages.indexOf(call.stage) > previous && typeof call.model === 'string' && /^[a-zA-Z0-9.-]{1,100}$/.test(call.model) &&
      typeof call.reasoningEffort === 'string' && /^[a-z-]{1,16}$/.test(call.reasoningEffort), 'STAGE');
    previous = stages.indexOf(call.stage);
    for (const n of [call.inputTokens, call.cachedInputTokens, call.outputTokens, call.reasoningTokens, call.costMicroUsd]) check(count(n), 'CALL_USAGE');
    check(call.cachedInputTokens <= call.inputTokens && call.reasoningTokens <= call.outputTokens, 'TOKEN_TOTALS');
    if (row.lane === 'premium') {
      check(call.reasoningEffort === 'high', 'PREMIUM_EFFORT');
      const coding = call.stage === 'construction' || call.stage === 'repair';
      const rates = premiumModelRates(call.model);
      check(rates && (!coding || call.model === INITIAL_PREMIUM_MODELS[call.stage]), 'PREMIUM_MODEL');
      check(call.inputTokens <= 64000 && call.outputTokens <= (coding ? 32000 : 16000) && call.cachedInputTokens === 0 &&
        call.costMicroUsd === Math.ceil(call.inputTokens * rates.input + call.outputTokens * rates.output), 'PREMIUM_MEASURED_USAGE');
    }
  }
  if (attempt.outcome === 'accepted') {
    check(attempt.packet, 'ACCEPTANCE_EVIDENCE');
    if (row.lane === 'premium' || attempt.usageComplete) {
      check(attempt.calls.some(c => c.stage === stages[1]) && attempt.calls.some(c => c.stage === 'review'), 'ACCEPTANCE_EVIDENCE');
      if (index === 0) check(attempt.calls.some(c => c.stage === 'planning'), 'ACCEPTANCE_EVIDENCE');
    }
  }
  const packet = attempt.packet === null ? null : checkPacket(item, row.lane, attempt.packet, attempt.outcome);
  const sum = (k: 'inputTokens' | 'outputTokens' | 'reasoningTokens' | 'costMicroUsd') => attempt.calls.reduce((n, c) => n + c[k], 0);
  return {
    outcome: attempt.outcome, durationMs: attempt.durationMs,
    inputTokens: attempt.usageComplete ? sum('inputTokens') : null, outputTokens: attempt.usageComplete ? sum('outputTokens') : null,
    reasoningTokens: attempt.usageComplete ? sum('reasoningTokens') : null,
    costMicroUsd: attempt.usageComplete && attempt.imageCostMicroUsd !== null ? sum('costMicroUsd') + attempt.imageCostMicroUsd : null,
    calls: attempt.calls.map(c => ({ stage: c.stage, model: c.model, reasoningEffort: c.reasoningEffort,
      inputTokens: c.inputTokens, cachedInputTokens: c.cachedInputTokens, outputTokens: c.outputTokens, reasoningTokens: c.reasoningTokens, costMicroUsd: c.costMicroUsd })),
    packet,
  };
}

export function measureJob(value: unknown) {
  const row = value as BenchmarkJob;
  check(object(row) && row.version === benchmarkVersion && ['operator-provider-export', 'offline-test'].includes(row.origin), 'VERSION_OR_ORIGIN');
  const item = cases.find(c => c.id === row.caseId);
  check(item && ['premium', 'legacy'].includes(row.lane) && count(row.replicate) && row.replicate > 0 && row.replicate <= 100, 'CASE');
  const identity = caseIdentity(item);
  check(row.requestHash === identity.requestHash && row.criteriaHash === identity.criteriaHash, 'CASE_BINDING');
  check(hash(row.jobHash) && hash(row.sharedSetupHash) && /^[a-f0-9]{40}$/.test(row.sourceSha) &&
    row.policyVersion === (row.lane === 'premium' ? PREMIUM_POLICY_VERSION : 'legacy'), 'IDENTITY');
  check(count(row.durationMs) && Array.isArray(row.attempts) && row.attempts.length >= 1 && row.attempts.length <= 3, 'JOB');
  const attempts = row.attempts.map((a, i) => checkedAttempt(item, row, a, i));
  check(attempts.slice(0, -1).every(a => a.outcome === 'technical-failure' || a.outcome === 'quality-failure'), 'REPAIR_SEQUENCE');
  check(row.durationMs >= attempts.reduce((n, a) => n + a.durationMs, 0), 'DURATION');
  return {
    origin: row.origin, caseId: item.id, lane: row.lane, replicate: row.replicate, jobHash: row.jobHash, sourceSha: row.sourceSha,
    sharedSetupHash: row.sharedSetupHash, policyVersion: row.policyVersion, durationMs: row.durationMs, attempts,
    accepted: attempts.at(-1)!.outcome === 'accepted',
  };
}
type Measurement = ReturnType<typeof measureJob>;
const totalKnown = (values: (number | null)[]) => values.length && values.every(n => n !== null) ? values.reduce<number>((n, x) => n + x!, 0) : null;

function laneSummary(rows: Measurement[]) {
  const attempts = rows.flatMap(r => r.attempts);
  const accepted = rows.filter(r => r.accepted).length;
  const spend = totalKnown(attempts.map(a => a.costMicroUsd));
  return {
    jobs: rows.length, accepted, rejected: rows.length - accepted, attempts: attempts.length,
    repairs: attempts.length - rows.length, acceptedAfterRepair: rows.filter(r => r.accepted && r.attempts.length > 1).length,
    attemptOutcomes: Object.fromEntries(outcomes.map(s => [s, attempts.filter(a => a.outcome === s).length])),
    inputTokens: totalKnown(attempts.map(a => a.inputTokens)), outputTokens: totalKnown(attempts.map(a => a.outputTokens)),
    reasoningTokensIncludedInOutput: totalKnown(attempts.map(a => a.reasoningTokens)),
    totalMicroUsd: spend, microUsdPerAttempt: spend === null ? null : spend / attempts.length,
    microUsdPerAcceptedGame: spend === null || !accepted ? null : spend / accepted,
    meanJobDurationMs: rows.length ? rows.reduce((n, r) => n + r.durationMs, 0) / rows.length : null,
  };
}

export function summarize(rows: Measurement[]) {
  const origin = rows[0]?.origin;
  check(rows.every(r => r.origin === origin), 'MIXED_ORIGINS');
  check(new Set(rows.map(r => r.jobHash)).size === rows.length, 'DUPLICATE_JOB');
  const key = (r: Measurement) => [r.caseId, r.replicate, r.lane].join('/');
  check(new Set(rows.map(key)).size === rows.length, 'DUPLICATE_TRIAL');
  check(new Set(rows.map(r => r.sharedSetupHash)).size <= 1, 'UNEQUAL_SETUP');
  for (const lane of ['legacy', 'premium']) check(new Set(rows.filter(r => r.lane === lane).map(r => r.sourceSha)).size <= 1, 'MIXED_SOURCE');
  const replicates = [...new Set(rows.map(r => r.replicate))].sort((a, b) => a - b);
  const pairs = cases.flatMap(item => (replicates.length ? replicates : [1]).map(replicate => {
    const find = (lane: Lane) => rows.find(r => r.caseId === item.id && r.replicate === replicate && r.lane === lane) ?? null;
    const legacy = find('legacy'), premium = find('premium');
    const a = legacy?.attempts.at(-1)?.packet?.scores, b = premium?.attempts.at(-1)?.packet?.scores;
    return {
      caseId: item.id, replicate, legacy, premium,
      pairedScoreDelta: a && b ? Object.fromEntries(scoreAxes.map(axis => [axis, b[axis] - a[axis]])) : null,
    };
  }));
  const complete = pairs.every(p => p.legacy && p.premium);
  return {
    version: benchmarkVersion, origin: origin ?? null,
    actualModelComparison: origin !== 'operator-provider-export' ? 'pending' : complete ? 'paired-operator-exports' : 'partial-operator-exports',
    humanRatedPairs: pairs.filter(p => p.pairedScoreDelta).length, pairs,
    legacy: laneSummary(rows.filter(r => r.lane === 'legacy')), premium: laneSummary(rows.filter(r => r.lane === 'premium')),
  };
}
export function pairedSheet(first: BenchmarkJob, second: BenchmarkJob) {
  const rows = [measureJob(first), measureJob(second)];
  check(first.caseId === second.caseId && first.replicate === second.replicate && first.lane !== second.lane, 'NOT_PAIRED');
  summarize(rows);
  return blindSheet(first, second);
}
function readJob(file: string): BenchmarkJob {
  check(statSync(file).size <= 32 * 1024 * 1024, 'FILE_LIMIT');
  return JSON.parse(readFileSync(file, 'utf8'));
}
async function main(args: string[]) {
  if (!args.length) return { ...pairedManifest(), humanRubric: rubricTable() };
  if (args[0] === '--sheet' && args.length === 3) return pairedSheet(readJob(args[1]), readJob(args[2]));
  if (args[0] === '--mock' && args.length === 1) {
    const { dryRun } = await import('./premium-benchmark-dry-run');
    return dryRun();
  }
  if (args[0] === '--summarize' && args.length > 1) return summarize(args.slice(1).map(file => measureJob(readJob(file))));
  if (args[0] === '--fixture' && args.length === 2) {
    const { runAuthoredFixture } = await import('./premium-benchmark-fixture');
    return runAuthoredFixture(args[1]);
  }
  throw Error('Usage: premium-quality-benchmark.ts [--summarize job.json ... | --fixture output-directory]');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(report => console.log(typeof report === 'string' ? report : JSON.stringify(report, null, 2))).catch(error => {
    // Invalid JSON and runtime errors can contain private export text. Show bounded categories only.
    const code = String(error?.message);
    console.error(/^[A-Z][A-Z0-9_]{1,90}$/.test(code) ? code : 'BENCHMARK_INPUT_OR_FIXTURE_FAILED');
    process.exitCode = 1;
  });
}
