import test from 'node:test';
import assert from 'node:assert/strict';
import { generateItem, legacyFactItem } from '../src/learning/content';
import { SKILLS } from '../src/learning/curriculum';
import { beginAttempt, canAsk, didAsk, ensureLearning, evidenceState, finishAttempt, profileGrade, report,
  selectItem, submitAnswer, useHint, validateLearning } from '../src/learning/engine';
import { createMathAdapter } from '../src/learning/adapter';
import type { Grade, LearnerProfile, MathItem, Representation } from '../src/learning/types';

const DAY = 86_400_000;
const T = Date.UTC(2026, 10, 16, 12);
const learner = (grade: Grade = 3): LearnerProfile => ({ id: 'test-child', grade, age: grade + 6,
  focus: 'adaptive', intensity: 'balanced', rate: 3, hints: true, skills: {} });
const fact = (id = 'mul:8x7', representation: Representation = 'symbolic') => {
  const base = legacyFactItem(id)!;
  return generateItem(base.skillId, { factId: id, representation, random: () => 0.2 });
};
function answer(p: LearnerProfile, item: MathItem, now = T, sessionId = `test-${now}`) {
  const attempt = beginAttempt(p, item, { now, sessionId, gameId: 'dragon', versionId: 'test-a' });
  submitAnswer(p, attempt.id, String(item.answer), now + 500);
  return attempt;
}

test('a first correct response is limited evidence, not a declared weakness or mastery', () => {
  const p = learner(); answer(p, fact());
  assert.equal(report(p).skills.find(s => s.id === 'g3-multiply')!.state, 'not-enough-evidence');
  assert.equal(createMathAdapter().review(p).weak.length, 0);
  assert.equal(createMathAdapter().estimate(p.skills['mul:8x7']), null);
});
test('five rapid repetitions never become fourteen-day retention evidence', () => {
  const p = learner();
  for (let i = 0; i < 5; i++) answer(p, fact(), T + i * 1500, 'same-session');
  const s = ensureLearning(p).facts['mul:8x7'];
  assert.equal(s.dueAt, T + 500 + DAY); assert.equal(s.independentDays.length, 1); assert.equal(s.reviewStage, 0);
  assert.equal(evidenceState(s, true), 'not-enough-evidence');
  assert.equal(report(p).support.length, 0);
});
test('review intervals advance only on due, separated independent retrieval', () => {
  const p = learner(); const days = [0, 1, 3, 7, 15], intervals = [1, 2, 4, 8, 14];
  days.forEach((day, i) => {
    answer(p, fact('mul:8x7', i % 2 ? 'visual' : 'symbolic'), T + day * DAY);
    assert.equal(ensureLearning(p).facts['mul:8x7'].dueAt, T + (day + intervals[i]) * DAY + 500);
  });
  assert.equal(evidenceState(ensureLearning(p).facts['mul:8x7'], true), 'remembered-later');
  assert.notEqual(report(p).skills.find(s => s.id === 'g3-multiply')!.state, 'remembered-later');
});
test('success across midnight less than 24 hours apart does not advance spacing', () => {
  const p = learner(), beforeMidnight = Date.UTC(2026, 10, 16, 23, 59);
  answer(p, fact(), beforeMidnight); answer(p, fact(), beforeMidnight + 120_000);
  assert.equal(ensureLearning(p).facts['mul:8x7'].reviewStage, 0);
});
test('early successful practice does not postpone an already scheduled review', () => {
  const p = learner(); answer(p, fact()); answer(p, fact(), T + DAY);
  const due = ensureLearning(p).facts['mul:8x7'].dueAt;
  answer(p, fact(), T + 2 * DAY);
  assert.equal(ensureLearning(p).facts['mul:8x7'].dueAt, due);
  assert.equal(ensureLearning(p).facts['mul:8x7'].reviewStage, 1);
});
test('hints are available before failure and assisted success is separate', () => {
  const p = learner(), item = fact(), a = beginAttempt(p, item, { now: T });
  useHint(p, a.id, 1, T + 1); useHint(p, a.id, 1, T + 2);
  submitAnswer(p, a.id, String(item.answer), T + 1000);
  assert.equal(a.independent, false); assert.equal(a.hintEvents.length, 1);
  const s = ensureLearning(p).facts['mul:8x7'];
  assert.equal(s.independentCorrect, 0); assert.equal(s.assistedCorrect, 1); assert.equal(s.firstAttemptCount, 0);
});
test('hint-only use persists before a later answer or activity exit', () => {
  const p = learner(); let snapshot: LearnerProfile | undefined;
  const adapter = createMathAdapter(() => { snapshot = JSON.parse(JSON.stringify(p)); });
  const a = adapter.beginAttempt(p, fact(), { now: T });
  adapter.useHint(p, a.id, 1, T + 10);
  assert.equal(ensureLearning(snapshot!).attempts[0].hintEvents.length, 1);
  assert.equal(ensureLearning(snapshot!).facts['mul:8x7'].helpRequests, 1);
  assert.equal(ensureLearning(snapshot!).facts['mul:8x7'].incorrectResponses, 0);
});
test('every wrong submission persists immediately, even before successful completion', () => {
  const p = learner(), item = fact(); let saved = 0;
  const adapter = createMathAdapter(() => { saved++; });
  const a = adapter.beginAttempt(p, item, { now: T });
  const result = adapter.submitAnswer(p, a.id, '15', T + 1000);
  assert.equal(result.correct, false); assert.equal(a.outcome, 'open'); assert.equal(a.answers[0].raw, '15');
  assert.equal(ensureLearning(p).facts['mul:8x7'].incorrectResponses, 1); assert.equal(saved, 2);
  adapter.finishAttempt(p, a.id, 'interrupted', T + 2000);
  assert.equal(ensureLearning(p).facts['mul:8x7'].incorrectResponses, 1);
  assert.equal(ensureLearning(p).facts['mul:8x7'].independentCorrect, 0);
});
test('an unanswered skip is not a mathematical failure', () => {
  const p = learner(), a = beginAttempt(p, fact(), { now: T }); finishAttempt(p, a.id, 'skipped', T + 1000);
  const s = ensureLearning(p).facts['mul:8x7'];
  assert.equal(s.incorrectResponses, 0); assert.equal(s.firstAttemptCount, 0);
  assert.equal(s.recent.length, 0); assert.equal(s.skipped, 1); assert.equal(evidenceState(s, true), 'not-enough-evidence');
});
test('a correction after a wrong answer is not independent retrieval', () => {
  const p = learner(), item = fact(), a = beginAttempt(p, item, { now: T });
  submitAnswer(p, a.id, '54', T + 1); submitAnswer(p, a.id, String(item.answer), T + 2);
  assert.equal(a.correct, true); assert.equal(a.independent, false);
  assert.equal(p.skills['mul:8x7'].lastAttempts, 2); assert.equal(ensureLearning(p).facts['mul:8x7'].firstAttemptCorrect, 0);
});
test('invalid text is not counted as an incorrect mathematical response', () => {
  const p = learner(), a = beginAttempt(p, fact(), { now: T });
  for (const raw of ['', 'NaN', 'banana', 'Infinity']) assert.equal(submitAnswer(p, a.id, raw, T).valid, false);
  assert.equal(a.answers.length, 0); assert.equal(ensureLearning(p).totals.submissions, 0);
});
test('completion and double-submit events are idempotent', () => {
  const p = learner(), item = fact(), a = beginAttempt(p, item, { now: T });
  submitAnswer(p, a.id, String(item.answer), T + 1); submitAnswer(p, a.id, String(item.answer), T + 2);
  finishAttempt(p, a.id, 'completed', T + 3);
  assert.equal(ensureLearning(p).totals.completed, 1); assert.equal(ensureLearning(p).totals.independent, 1);
  assert.equal(p.skills['mul:8x7'].tries, 1);
});
test('challenge-ending wrong answers remain wrong when the activity closes', () => {
  const p = learner(), a = beginAttempt(p, fact(), { now: T });
  submitAnswer(p, a.id, '12', T + 1); finishAttempt(p, a.id, 'completed', T + 2);
  assert.equal(a.correct, false); assert.equal(a.independent, false); assert.equal(ensureLearning(p).totals.assisted, 0);
});
test('a new activity preserves and closes unfinished previous responses', () => {
  const p = learner(), a = beginAttempt(p, fact(), { now: T }); submitAnswer(p, a.id, '15', T + 1);
  beginAttempt(p, fact('mul:8x8'), { now: T + 2 });
  assert.equal(a.outcome, 'interrupted'); assert.equal(a.answers[0].raw, '15'); assert.equal(report(p).activeAttempts, 1);
});
test('bounded detailed history retains durable summaries', () => {
  const p = learner(); for (let i = 0; i < 130; i++) answer(p, fact(), T + i * 1000);
  const state = ensureLearning(p);
  assert.equal(state.attempts.length, 120); assert.equal(state.totals.independent, 130);
  assert.equal(state.facts['mul:8x7'].independentCorrect, 130);
  assert.equal(validateLearning(JSON.parse(JSON.stringify(state))), true);
});
test('migration preserves legacy counts without inventing multi-day mastery', () => {
  const p = learner(); p.skills['mul:8x7'] = { tries: 20, right: 20, hints: 0, streak: 20,
    dueAt: new Date(T + 14 * DAY).toISOString(), last: new Date(T).toISOString() };
  const state = ensureLearning(p, T), s = state.facts['mul:8x7'];
  assert.equal(s.independentCorrect, 20); assert.equal(s.independentDays.length, 0);
  assert.equal(s.independentForms.length, 0); assert.equal(s.dueAt, T + DAY);
  assert.equal(evidenceState(s, true), 'not-enough-evidence'); assert.equal(p.skills['mul:8x7'].right, 20);
});
test('future and corrupt state is rejected without silently erasing progress', () => {
  const p = learner(); p.learning = { version: 99, important: 'preserve' };
  assert.equal(validateLearning(p.learning), false); assert.throws(() => ensureLearning(p), /not been reset/);
  assert.equal(p.learning.important, 'preserve');
  const good = learner(); answer(good, fact());
  const corrupt = JSON.parse(JSON.stringify(good.learning)); corrupt.attempts[0].answers[0].at = -1;
  assert.equal(validateLearning(corrupt), false); assert.equal(validateLearning(undefined), true);
});
test('legacy and ongoing counters remain finite, nonnegative and bounded after serialization', () => {
  const p = learner();
  p.skills = {
    'mul:8x7': { tries: 1e12, right: -4, hints: 1e12, dueAt: '1969-01-01' },
    'mul:8x8': { tries: 1e12, right: 1e15, hints: -4 },
  };
  const state = ensureLearning(p, T);
  assert.equal(state.totals.presentations, 1e9);
  assert.equal(state.facts['mul:8x7'].independentCorrect, 0);
  state.nextAttempt = 1e9; state.selectionCount = 1e9; state.targetCursor = 1e9;
  answer(p, fact(), T);
  selectItem(p, { now: T });
  assert.equal(validateLearning(JSON.parse(JSON.stringify(p.learning))), true);
});
test('constructed visual attempts retain the fact and cannot forge a lower grade', () => {
  const p = learner(), q = fact();
  q.id += ':constructed'; q.representation = 'visual';
  answer(p, q);
  assert.deepEqual(ensureLearning(p).facts['mul:8x7'].independentForms, ['visual']);
  const forged = { ...q, grade: 1 as Grade };
  assert.throws(() => beginAttempt(learner(1), forged, { now: T }), /range|invalid/);
});
test('exact targets are emphasized without replacing the whole practice stream', () => {
  const p = learner(); p.factTargets = ['mul:8x7', 'mul:8x8'];
  const items = Array.from({ length: 40 }, (_, i) => selectItem(p, { now: T + i, random: () => 0 }));
  const count = items.filter(q => p.factTargets!.includes(q.factId || '')).length;
  assert.ok(count >= 16 && count <= 26, `target count ${count} must preserve a varied mix`);
  assert.ok(new Set(items.map(q => q.skillId)).size >= 2); assert.equal(items[0].factId, 'mul:8x7');
  assert.ok(items.slice(1).some(q => !p.factTargets!.includes(q.factId || '')));
});
test('a single target cannot produce an endless identical-question drill', () => {
  const p = learner(); p.factTargets = ['mul:8x7'];
  const items = Array.from({ length: 12 }, (_, i) => selectItem(p, { now: T + i, random: () => 0 }));
  assert.ok(items.filter(q => q.factId === 'mul:8x7').length <= 8);
  assert.ok(new Set(items.map(q => q.id)).size > 4);
});
test('Gentle and Stretch alter the support and purpose stream', () => {
  const sequences = ['gentle', 'stretch'].map(intensity => {
    const p = learner(); p.intensity = intensity; p.factTargets = ['mul:8x7'];
    return Array.from({ length: 12 }, (_, i) => { const q = selectItem(p, { now: T + i, random: () => 0.2 }); return `${q.purpose}:${q.tier}:${q.representation}`; });
  });
  assert.notDeepEqual(sequences[0], sequences[1]);
});
test('balanced challenge rises after varied success and falls after repeated difficulty without inflating mastery', () => {
  const p = learner(); p.skillFocus = ['g3-multiply'];
  for (let i = 0; i < 4; i++) answer(p, fact(`mul:8x${i + 2}`), T + i * 1000, 'one-session');
  const state = ensureLearning(p);
  assert.equal(evidenceState(state.skills['g3-multiply']), 'not-enough-evidence');
  assert.equal(selectItem(p, { now: T + 6000, random: () => 0.4 }).tier, 2);
  p.intensity = 'gentle'; state.selectionCount = 0;
  assert.equal(selectItem(p, { now: T + 6000, random: () => 0.4 }).tier, 0);
  p.intensity = 'balanced';
  for (let i = 0; i < 2; i++) {
    const a = beginAttempt(p, fact(`mul:8x${i + 6}`), { now: T + 7000 + i * 1000 });
    submitAnswer(p, a.id, '1', T + 7001 + i * 1000); finishAttempt(p, a.id, 'shown', T + 7002 + i * 1000);
  }
  state.selectionCount = 0;
  const supporting = selectItem(p, { now: T + 10_000, random: () => 0 });
  assert.equal(supporting.purpose, 'prerequisite'); assert.equal(supporting.tier, 0);
  state.selectionCount = 2;
  const returned = selectItem(p, { now: T + 11_000, random: () => 0 });
  assert.equal(returned.skillId, 'g3-multiply'); assert.equal(returned.tier, 0);
});
test('readiness with unestablished prerequisites is a small probe inside the grade scope', () => {
  const p = learner(4); p.intensity = 'stretch'; p.skillFocus = ['g4-multiply'];
  ensureLearning(p).selectionCount = 3;
  const item = selectItem(p, { now: T, random: () => 0 });
  assert.equal(item.purpose, 'readiness'); assert.equal(item.tier, 0); assert.ok(item.grade <= 4);
});
test('old errors do not keep a recovered skill labeled as requiring support', () => {
  const p = learner(), q = fact();
  for (let i = 0; i < 2; i++) {
    const a = beginAttempt(p, q, { now: T + i * 1000 });
    submitAnswer(p, a.id, '1', T + i * 1000 + 10); finishAttempt(p, a.id, 'shown', T + i * 1000 + 20);
  }
  for (let i = 0; i < 8; i++) answer(p, fact(`mul:8x${i + 2}`), T + 10_000 + i * 1000, 'same-session');
  const s = ensureLearning(p).skills['g3-multiply'];
  assert.equal(s.struggledPresentations, 2);
  assert.equal(evidenceState(s), 'not-enough-evidence');
  assert.equal(report(p).support.length, 0);
});
test('due review reappears through the review slot after a delay', () => {
  const p = learner(); answer(p, fact()); ensureLearning(p).selectionCount = 3;
  const item = selectItem(p, { now: T + 2 * DAY, random: () => 0 });
  assert.equal(item.purpose, 'review'); assert.equal(item.factId, 'mul:8x7');
});
test('repeated difficulty prompts a relevant prerequisite instead of more of the same', () => {
  const p = learner(); p.factTargets = ['mul:8x7'];
  for (let i = 0; i < 2; i++) {
    const a = beginAttempt(p, fact(), { now: T + i * 1000 });
    submitAnswer(p, a.id, '15', T + i * 1000 + 1); finishAttempt(p, a.id, 'shown', T + i * 1000 + 2);
  }
  const next = selectItem(p, { now: T + 5000, random: () => 0 });
  assert.equal(next.purpose, 'prerequisite'); assert.equal(next.skillId, 'g3-groups'); assert.deepEqual(p.factTargets, ['mul:8x7']);
});
test('adaptive focus prioritizes an observed weakness below the current grade scope', () => {
  const p = learner(4), q = fact('add:4:3');
  for (let i = 0; i < 2; i++) {
    const attempt = beginAttempt(p, q, { now: T + i * 1000 });
    submitAnswer(p, attempt.id, '6', T + i * 1000 + 10); finishAttempt(p, attempt.id, 'shown', T + i * 1000 + 20);
  }
  const selected = selectItem(p, { now: T + DAY, random: () => 0 });
  assert.equal(selected.skillId, q.skillId);
  assert.equal(selected.purpose, 'focus');
});
test('confidence practice can use a familiar fact without claiming the whole skill is established', () => {
  const p = learner();
  [0, 1, 3, 7].forEach((d, i) => answer(p, fact('mul:8x7', i % 2 ? 'visual' : 'symbolic'), T + d * DAY));
  const state = ensureLearning(p); state.selectionCount = 1; state.recentFacts = ['mul:3x3'];
  assert.equal(evidenceState(state.skills['g3-multiply']), 'not-enough-evidence');
  const selected = selectItem(p, { now: T + 7 * DAY, random: () => 0 });
  assert.equal(selected.factId, 'mul:8x7'); assert.equal(selected.purpose, 'confidence');
});
test('all intensity modes respect the explicit grade ceiling, including exact targets', () => {
  for (const grade of [1, 2, 3, 4] as Grade[]) for (const intensity of ['gentle', 'balanced', 'stretch']) {
    const p = learner(grade); p.intensity = intensity; p.factTargets = ['mul:12x12'];
    for (let i = 0; i < 25; i++) assert.ok(selectItem(p, { now: T + i, random: () => 0.3 }).grade <= grade);
  }
  assert.throws(() => beginAttempt(learner(1), fact()), /outside/);
});
test('game score, elapsed time and version names cannot alter a mathematical result', () => {
  const slow = learner(), fast = learner(), item = fact();
  const a = beginAttempt(slow, item, { now: T, gameId: 'dragon', versionId: 'version-1' });
  const b = beginAttempt(fast, item, { now: T, gameId: 'generated', versionId: 'test-b' });
  submitAnswer(slow, a.id, String(item.answer), T + 120_000); submitAnswer(fast, b.id, String(item.answer), T + 1000);
  assert.equal(a.independent, true); assert.equal(b.independent, true);
  assert.equal(report(slow).skills.find(s => s.id === 'g3-multiply')!.state, report(fast).skills.find(s => s.id === 'g3-multiply')!.state);
});
test('two child profiles remain independent and round-trip complete evidence', () => {
  const first = learner(), second = learner(); first.id = 'one'; second.id = 'two'; answer(first, fact());
  assert.equal(ensureLearning(second).totals.completed, 0);
  const restored = JSON.parse(JSON.stringify(first)); assert.equal(validateLearning(restored.learning), true);
  assert.equal(ensureLearning(restored).attempts[0].context.versionId, 'test-a'); answer(restored, fact('mul:8x8'), T + DAY);
  assert.equal(ensureLearning(restored).totals.completed, 2); assert.equal(ensureLearning(first).totals.completed, 1);
});
test('error hypotheses need multiple different items and remain tentative', () => {
  const p = learner(), a = beginAttempt(p, fact('mul:8x7'), { now: T });
  submitAnswer(p, a.id, '15', T + 1); finishAttempt(p, a.id, 'shown', T + 2);
  assert.equal(report(p).skills.find(s => s.id === 'g3-multiply')!.hypotheses.length, 0);
  const b = beginAttempt(p, fact('mul:8x8'), { now: T + DAY });
  submitAnswer(p, b.id, '16', T + DAY + 1); finishAttempt(p, b.id, 'shown', T + DAY + 2);
  assert.match(report(p).skills.find(s => s.id === 'g3-multiply')!.hypotheses[0], /Possible/);
});
test('math frequency cannot be disabled and the rolling budget is shared per child', () => {
  const p = learner(); p.rate = 0;
  assert.equal(canAsk(p, T), true); didAsk(p, T); assert.equal(canAsk(p, T + 10_000), false);
  assert.equal(canAsk(p, T + 100_000), true); didAsk(p, T + 100_000); didAsk(p, T + 200_000);
  assert.equal(canAsk(p, T + 300_000), false); assert.equal(canAsk(p, T + 600_001), true);
  p.rate = 1; p.mathWindow = []; didAsk(p, 0);
  assert.equal(canAsk(p, 100_000), false); assert.equal(canAsk(p, 600_001), true);
});
test('parent grade overrides age while preserving higher-grade history', () => {
  const p = learner(); answer(p, fact()); p.grade = 1; p.age = 12; assert.equal(profileGrade(p), 1);
  for (let i = 0; i < 8; i++) assert.equal(selectItem(p, { now: T + 10 * DAY, random: () => 0.2 }).grade, 1);
  assert.equal(ensureLearning(p).facts['mul:8x7'].independentCorrect, 1);
});
test('available grade coverage reaches all six declared math domains', () => {
  for (const grade of [1, 2, 3, 4] as Grade[]) assert.equal(report(learner(grade)).skills.filter(s => s.grade === grade).length, SKILLS.filter(s => s.grade === grade).length);
  assert.equal(new Set(SKILLS.map(s => s.domain)).size, 6);
});
