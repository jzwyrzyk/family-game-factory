import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PROBLEM_SOLVING_PRACTICE, evaluatePracticeChoice, getPracticeTask, practiceTasksForGrade,
  runPracticeScene, runPracticeTest, runPracticeRevision, validatePracticeDraft, assertPracticeContinuation, type PracticePhase,
} from '../src/problem-solving/practice';
import { PROBLEM_SOLVING_EPISODE_SCHEMA, type ProblemSolvingDraft } from '../src/problem-solving/model';

test('Each grade band gets three bounded scenarios with a usable test and a working revision', () => {
  for (const grade of [1, 2, 3, 4]) {
    const tasks = practiceTasksForGrade(grade);
    assert.equal(tasks.length, 3);
    assert.equal(new Set(tasks.map(task => task.family)).size, 3);
    assert.ok(tasks.every(task => task.band === (grade < 3 ? 'g1-2' : 'g3-4')));
  }
  assert.equal(PROBLEM_SOLVING_PRACTICE.length, 6);
  for (const task of PROBLEM_SOLVING_PRACTICE) {
    assert.ok(task.test.choices.some(choice => choice.useful));
    assert.ok(task.test.choices.some(choice => !choice.useful));
    assert.ok(task.revision.choices.some(choice => runPracticeRevision(task.id, choice.id).reachedGoal));
    assert.ok(task.revision.choices.some(choice => !runPracticeRevision(task.id, choice.id).reachedGoal));
    assert.ok(Object.isFrozen(task.initial));
    for (const choice of task.test.choices) {
      const actual = runPracticeTest(task.id, choice.id);
      const matching = task.interpretation.choices.filter(answer => evaluatePracticeChoice(task.id, 'interpret', answer.id, choice.id).outcome === 'demonstrated');
      assert.equal(matching.length, 1, `${task.id}/${choice.id}: exactly one description must match its actual result`);
      assert.equal(matching[0].id, actual.observation);
      assert.equal(evaluatePracticeChoice(task.id, 'test', choice.id).outcome, choice.useful ? 'demonstrated' : 'not-yet');
    }
  }
});

test('An incorrect initial guess does not prevent useful testing, interpretation, or revision evidence', () => {
  const task = 'robot-stop-g3-4';
  const prediction = evaluatePracticeChoice(task, 'predict', 'at-gem');
  assert.equal(prediction.predictionMatched, false);
  assert.equal(prediction.outcome, 'unobserved');
  assert.equal(evaluatePracticeChoice(task, 'test', 'smaller-steps').outcome, 'demonstrated');
  assert.equal(evaluatePracticeChoice(task, 'interpret', 'at-gem', 'smaller-steps').outcome, 'demonstrated');
  assert.equal(evaluatePracticeChoice(task, 'revise', 'small-steps', 'smaller-steps').outcome, 'demonstrated');
});

test('Equivalent working movement strategies and whole-number gate rules are both accepted', () => {
  const robot = 'robot-stop-g3-4';
  assert.equal(evaluatePracticeChoice(robot, 'test', 'smaller-steps').outcome, 'demonstrated');
  assert.equal(runPracticeTest(robot, 'smaller-steps').reachedGoal, true);
  for (const choice of ['small-steps', 'other-plan']) assert.equal(evaluatePracticeChoice(robot, 'revise', choice, 'smaller-steps').outcome, 'demonstrated');
  const gate = 'ready-gate-g3-4';
  for (const choice of ['at-least-three', 'more-than-two']) {
    assert.deepEqual(runPracticeRevision(gate, choice).outputs, [false, false, true, true]);
    assert.equal(evaluatePracticeChoice(gate, 'revise', choice, 'compare-boundary').outcome, 'demonstrated');
  }
  assert.equal(evaluatePracticeChoice(gate, 'revise', 'exactly-three', 'compare-boundary').outcome, 'not-yet');
});

test('A relevant test can fail the final goal and still support interpretation and revision', () => {
  const task = 'gem-delivery-g3-4';
  assert.equal(evaluatePracticeChoice(task, 'test', 'small-parcel').outcome, 'demonstrated');
  assert.equal(runPracticeTest(task, 'small-parcel').reachedGoal, false);
  assert.equal(evaluatePracticeChoice(task, 'interpret', 'smaller-parcel', 'small-parcel').outcome, 'demonstrated');
  assert.equal(evaluatePracticeChoice(task, 'interpret', 'delivered', 'small-parcel').outcome, 'not-yet');
  assert.equal(evaluatePracticeChoice(task, 'revise', 'whole-bridge', 'small-parcel').outcome, 'demonstrated');
  assert.equal(runPracticeRevision(task, 'small-tunnel').reachedGoal, false);
  for (const [id, choice] of [['robot-stop-g1-2','shorter-trial'],['robot-stop-g3-4','shorter-trial'],['ready-gate-g1-2','add-two'],['ready-gate-g3-4','compare-boundary']] as const) {
    assert.equal(evaluatePracticeChoice(id, 'test', choice).outcome, 'demonstrated', `${id} meaningful failed test`);
    assert.equal(runPracticeTest(id, choice).reachedGoal, false);
  }
  assert.equal(evaluatePracticeChoice('robot-stop-g1-2', 'test', 'new-colour').outcome, 'not-yet');
  assert.equal(evaluatePracticeChoice('robot-stop-g1-2', 'interpret', 'past-gem', 'new-colour').outcome, 'demonstrated');
});

test('Slow movement does not secretly change destination and empty/threshold tests report distinct facts', () => {
  assert.equal(runPracticeScene({ kind: 'robot', steps: 6, stride: 1, target: 4, slow: true }).observation, 'past-gem');
  assert.deepEqual(runPracticeTest('ready-gate-g3-4', 'compare-boundary').outputs, [true, false]);
  assert.equal(runPracticeTest('ready-gate-g3-4', 'three-only').observation, 'only-three');
  assert.equal(runPracticeTest('ready-gate-g3-4', 'empty-only').observation, 'only-empty');
  const early = getPracticeTask('ready-gate-g1-2');
  assert.equal(runPracticeScene(early.initial).observation, 'closed');
  assert.equal(runPracticeTest(early.id, 'add-one').observation, 'opened');
});

test('Unknown tasks/choices and attempts to interpret or revise without a test fail explicitly', () => {
  assert.throws(() => getPracticeTask('__proto__'));
  assert.throws(() => runPracticeTest('robot-stop-g1-2', 'invented-test'));
  assert.throws(() => evaluatePracticeChoice('robot-stop-g1-2', 'predict', 'invented-answer'));
  assert.throws(() => evaluatePracticeChoice('robot-stop-g1-2', 'interpret', 'at-gem'));
  assert.throws(() => evaluatePracticeChoice('robot-stop-g1-2', 'revise', 'small-steps'));
  assert.throws(() => evaluatePracticeChoice('robot-stop-g1-2', 'revise', 'small-steps', 'unknown'));
});

test('Resume checks the authored version, first-response order, and each saved choice against its oracle', () => {
  const task = getPracticeTask('robot-stop-g1-2'), at = '2026-11-19T13:00:00.000Z';
  const draft: ProblemSolvingDraft = { stepIndex: 0, episode: {
    schema: PROBLEM_SOLVING_EPISODE_SCHEMA, id: 'episode-1', sessionId: 'session-1', owner: 'player1', source: 'practice', kind: 'structured-practice',
    task: { id: task.id, family: task.family, version: task.version, label: task.title, demand: task.band, variant: task.band, exposure: 'first-seen', firstAttempt: true },
    startedAt: at, observations: [],
  } };
  validatePracticeDraft(draft);
  for (const [phase, choice, step] of [['predict','at-gem',1],['test','smaller-steps',2],['interpret','at-gem',4],['revise','small-steps',5]] as const) {
    const result = evaluatePracticeChoice(task.id, phase, choice, 'smaller-steps');
    draft.episode.observations.push({ id: phase + '-1', skill: result.skill, outcome: result.outcome, authorship: 'learner', support: 'none-observed', elicitation: 'prompted', observedAt: at, responseId: phase + ':' + choice });
    draft.stepIndex = step; validatePracticeDraft(draft);
    if (step === 2) { draft.stepIndex = 3; validatePracticeDraft(draft); }
  }
  const wrongVersion = structuredClone(draft); wrongVersion.episode.task.version = '99'; assert.throws(() => validatePracticeDraft(wrongVersion));
  const changedAnswer = structuredClone(draft); changedAnswer.episode.observations[2].responseId = 'interpret:past-gem'; assert.throws(() => validatePracticeDraft(changedAnswer));
  const missingTest = structuredClone(draft); missingTest.episode.observations.splice(1, 1); assert.throws(() => validatePracticeDraft(missingTest));
  const impossibleStep = structuredClone(draft); impossibleStep.stepIndex = 32; assert.throws(() => validatePracticeDraft(impossibleStep));
  assert.throws(() => evaluatePracticeChoice(task.id, 'invented' as PracticePhase, 'small-steps', 'smaller-steps'));
  assertPracticeContinuation(draft, structuredClone(draft));
  assert.throws(() => assertPracticeContinuation(draft, null), /cleared or changed/);
  const restoredOlder = structuredClone(draft); restoredOlder.stepIndex = 4; restoredOlder.episode.observations.pop();
  assert.throws(() => assertPracticeContinuation(draft, restoredOlder), /cleared or changed/);
  const anotherProfile = structuredClone(draft); anotherProfile.episode.owner = 'player2';
  assert.throws(() => assertPracticeContinuation(draft, anotherProfile), /cleared or changed/);
  const laterResponse = structuredClone(draft); laterResponse.episode.observations[2].responseId = 'interpret:past-gem';
  assert.throws(() => assertPracticeContinuation(draft, laterResponse), /cleared or changed/);
});
