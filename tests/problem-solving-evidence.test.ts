import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evidenceAttribution, summarizeProblemSolving } from '../src/problem-solving/evidence';
import {
  APS_SKILLS, PROBLEM_SOLVING_EPISODE_SCHEMA, validateProblemSolvingEpisode,
  type ProblemSolvingEpisode, type ProblemSolvingObservation,
} from '../src/problem-solving/model';

const start = '2026-11-19T12:00:00.000Z', finish = '2026-11-19T12:01:00.000Z';
function observation(changes: Partial<ProblemSolvingObservation> = {}): ProblemSolvingObservation {
  return {id: 'test-choice', skill: 'plan_test', outcome: 'demonstrated', authorship: 'learner',
    support: 'none-observed', elicitation: 'prompted', observedAt: start, ...changes};
}
function episode(id = 'one', changes: Partial<ProblemSolvingEpisode> = {}): ProblemSolvingEpisode {
  return {schema: PROBLEM_SOLVING_EPISODE_SCHEMA, id, owner: 'child-one', sessionId: 'session-one',
    source: 'practice', kind: 'structured-practice',
    task: {id: 'ramp-a', family: 'ramps', version: 'v1', label: 'A useful ramp test', exposure: 'first-seen', firstAttempt: true},
    startedAt: start, completedAt: finish, observations: [observation()], ...changes};
}

test('ordinary subject, creation, and conversation facts never become problem-solving scores', () => {
  const input = (['math','language','creation','studio'] as const).map(source => episode(source, {
    source, kind: 'context-only', context: 'An existing activity recorded its own result.',
    observations: source === 'studio' ? [observation({outcome: 'unobserved', authorship: 'unknown', support: 'unknown'})] : [],
  }));
  const summary = summarizeProblemSolving(input);
  assert.equal(summary.contextEpisodes, 4); assert.equal(summary.structuredEpisodes, 0);
  for (const skill of APS_SKILLS) {
    assert.equal(summary.bySkill[skill].opportunities, 0); assert.equal(summary.bySkill[skill].notYet, 0);
  }
  assert.deepEqual(summary.contextBySource, {math: 1, language: 1, creation: 1, studio: 1, practice: 0});
  assert.equal(summary.recentContext.length, 3);
  assert.deepEqual(summarizeProblemSolving(input, {sampleLimit: 0}).recentContext, []);
  assert.throws(() => validateProblemSolvingEpisode({...input[0], observations: [observation()]}), /unsupported or damaged/);
  assert.throws(() => validateProblemSolvingEpisode(episode('forged-source', {source:'math'})), /unsupported or damaged/);
});

test('a prediction or hint marker does not consume a scored opportunity, and correction does not replace first evidence', () => {
  const input = episode('revision', {observations: [
    observation({id: 'prediction', outcome: 'unobserved', responseId: 'predict:same'}),
    observation({id: 'first-test', outcome: 'not-yet', responseId: 'test:both'}),
    observation({id: 'help', outcome: 'unobserved', support: 'strategy', responseId: 'hint:test'}),
    observation({id: 'later-test', outcome: 'demonstrated', support: 'strategy', responseId: 'test:one'}),
    observation({id: 'revision', skill: 'revise', outcome: 'demonstrated', support: 'strategy'}),
  ]});
  const summary = summarizeProblemSolving([input]);
  assert.equal(summary.bySkill.plan_test.opportunities, 1);
  assert.equal(summary.bySkill.plan_test.notYet, 1); assert.equal(summary.bySkill.plan_test.demonstrated, 0);
  assert.equal(summary.bySkill.plan_test.unobserved, 0);
  assert.equal(summary.bySkill.revise.demonstrated, 1); assert.equal(summary.bySkill.revise.supported, 1);
  assert.equal(summary.bySkill.plan_test.samples[0].responseId, 'test:both');
});

test('authorship, solution support, accessibility support and uncertainty remain separate', () => {
  const cases: [Partial<ProblemSolvingObservation>, ReturnType<typeof evidenceAttribution>][] = [
    [{authorship: 'learner', support: 'none-observed'}, 'learner-no-solution-help-observed'],
    [{authorship: 'learner', support: 'access-only'}, 'learner-no-solution-help-observed'],
    [{authorship: 'learner', support: 'strategy'}, 'supported'],
    [{authorship: 'helper', support: 'none-observed'}, 'supported'],
    [{authorship: 'shared', support: 'unknown'}, 'supported'],
    [{authorship: 'unknown', support: 'none-observed'}, 'unknown'],
    [{authorship: 'learner', support: 'unknown'}, 'unknown'],
  ];
  for (const [changes, expected] of cases) assert.equal(evidenceAttribution(observation(changes)), expected);
  const result = summarizeProblemSolving(cases.map(([changes], index) => episode(`attribution-${index}`, {observations: [observation(changes)]}))).bySkill.plan_test;
  assert.equal(result.opportunities, 7); assert.equal(result.learnerNoSolutionHelpObserved, 2);
  assert.equal(result.supported, 3); assert.equal(result.unknownAttribution, 2);
  assert.equal(result.unknownSupport, 2); assert.equal(result.unknownAuthorship, 1);
  assert.equal(result.attribution['learner-no-solution-help-observed'].demonstrated, 2);
  assert.equal('independent' in result, false); assert.equal('mastery' in result, false);
});

test('missing evidence, interruptions and runtime defects are not child failures', () => {
  const summary = summarizeProblemSolving([
    episode('unknown', {observations: [observation({outcome: 'unobserved'})]}),
    episode('skip', {observations: []}),
    episode('interrupted', {status: 'interrupted', observations: [observation({outcome: 'not-yet'})]}),
    episode('broken', {status: 'technical-invalid', observations: [observation({outcome: 'demonstrated'})]}),
  ]);
  assert.equal(summary.bySkill.plan_test.opportunities, 0);
  assert.equal(summary.bySkill.plan_test.unobserved, 1); assert.equal(summary.bySkill.plan_test.notYet, 0);
  assert.equal(summary.interruptedEpisodes, 1); assert.equal(summary.technicalInvalidEpisodes, 1);
  assert.equal(summary.structuredEpisodes, 2);
});

test('coverage and repeat exposure are explicit and do not become a pooled growth or aptitude estimate', () => {
  const laterStart = '2026-11-20T12:00:00.000Z', laterFinish = '2026-11-20T12:01:00.000Z';
  const first = episode();
  const second = episode('two', {task: {...first.task, exposure: 'repeat', firstAttempt: false}, observations: [observation({elicitation: 'spontaneous'})]});
  const third = episode('three', {sessionId: 'session-two', startedAt: laterStart, completedAt: laterFinish,
    task: {...first.task, id: 'signal-b', family: 'signals', variant: 'new-context', demand: 'two conditions', exposure: 'unknown'},
    observations: [observation({observedAt: laterStart, elicitation: 'unknown', authorship: 'unknown', support: 'unknown'})]});
  const summary = summarizeProblemSolving([third, first, second], {discarded: 14, sampleLimit: 2}), result = summary.bySkill.plan_test;
  assert.equal(result.distinctSessions, 2); assert.equal(result.distinctDates, 2);
  assert.equal(result.distinctTaskFamilies, 2); assert.equal(result.distinctTasks, 2);
  assert.equal(result.firstAttempts, 2); assert.equal(result.repeatEpisodes, 1); assert.equal(result.unknownExposure, 1);
  assert.equal(result.prompted, 1); assert.equal(result.spontaneous, 1); assert.equal(result.unknownElicitation, 1);
  assert.equal(result.samples.length, 2); assert.equal(result.samples[0].episodeId, 'three');
  assert.equal(summary.discarded, 14); assert.equal(summary.historyTruncated, true);
  assert.equal('growth' in summary, false); assert.equal('score' in summary, false);
  assert.equal(summary.bySkill.transfer.opportunities, 0);
});

test('duplicate episodes and accidental cross-profile summaries are rejected', () => {
  const first = episode();
  assert.throws(() => summarizeProblemSolving([first, first]), /repeated episode/);
  assert.throws(() => summarizeProblemSolving([first, episode('two', {owner: 'child-two'})]), /one player/);
  assert.throws(() => summarizeProblemSolving([first], {discarded: -1}), /summary limits/);
});
