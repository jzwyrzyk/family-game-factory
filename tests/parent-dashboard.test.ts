import assert from 'node:assert/strict';
import test from 'node:test';
import { buildParentDashboard, type ParentDashboardInput } from '../src/parent/model';
import { beginAttempt, ensureLearning, finishAttempt, report, submitAnswer, useHint, recordLegacyOutcome } from '../src/learning/engine';
import { generateItem } from '../src/learning/content';
import { beginLanguageAttempt, ensureLanguage, finishLanguageAttempt, recordLanguageReadAloud, reportLanguage, submitLanguageAnswer } from '../src/language/engine';
import { generateLanguageItem } from '../src/language/content';
import { createChallengeStarter } from '../src/creation/challenges';
import type { LearnerProfile } from '../src/learning/types';
import type { CreationWorkspace } from '../src/creation/storage';

const DAY = 86_400_000, NOW = new Date('2026-11-19T15:00:00').getTime();
const learner = (): LearnerProfile => ({ id: 'child-a', grade: 3, skills: {}, focus: 'adaptive', intensity: 'balanced' });
const item = () => generateItem('g3-multiply', { factId: 'mul:8x7', random: () => 0.2 });
const snap = (p: LearnerProfile): ParentDashboardInput => ({ ownerId: String(p.id), now: NOW, range: 30,
  math: { ownerId: String(p.id), report: report(p, NOW), attempts: ensureLearning(p).attempts },
  language: { ownerId: String(p.id), report: reportLanguage(p, NOW), attempts: ensureLanguage(p).attempts },
});
function math(p: LearnerProfile, at: number, mode: 'solo' | 'retry' | 'hint' | 'interrupted' | 'shown' = 'solo') {
  const q = item(), a = beginAttempt(p, q, { now: at, gameId: 'dragon', projectId: 'project-a', versionId: 'version-a' });
  if (mode === 'interrupted' || mode === 'shown') { finishAttempt(p, a.id, mode, at + 2000); return a; }
  if (mode === 'hint') useHint(p, a.id, 1, at + 100);
  if (mode === 'retry') submitAnswer(p, a.id, '0', at + 200);
  submitAnswer(p, a.id, String(q.answer), at + 1000);
  return a;
}
function workspace(): CreationWorkspace {
  const scene = createChallengeStarter('robot-taps'); scene.id = 'scene-a'; scene.title = 'Version that was checked';
  const createdAt = new Date(NOW - DAY).toISOString();
  return { schema: 'jems.creation.workspace.v1', drafts: [],
    projects: [{ id: 'scene-a', owner: 'child-a', title: 'New current name', headId: 'r2', keptId: null, createdAt, updatedAt: createdAt, challengeId: 'robot-taps' },
      { id: 'scene-b', owner: 'sibling', title: 'Private sibling scene', headId: 'rb', keptId: null, createdAt, updatedAt: createdAt, challengeId: 'robot-taps' }],
    revisions: [{ id: 'r1', projectId: 'scene-a', parentId: null, createdAt, label: 'First', scene },
      { id: 'r2', projectId: 'scene-a', parentId: 'r1', createdAt, label: 'Next', scene: { ...scene, title: 'New current name' } },
      { id: 'rb', projectId: 'scene-b', parentId: null, createdAt, label: 'Sibling', scene: { ...scene, id: 'scene-b', title: 'Private sibling scene' } }],
    attempts: [
      { id: 'c1', projectId: 'scene-a', revisionId: 'r1', challengeId: 'robot-taps', passed: true, hintUsed: true, checkedAt: new Date(NOW - 4000).toISOString() },
      { id: 'c2', projectId: 'scene-a', revisionId: 'r1', challengeId: 'robot-taps', passed: true, hintUsed: true, checkedAt: new Date(NOW - 3000).toISOString() },
      { id: 'cb', projectId: 'scene-b', revisionId: 'rb', challengeId: 'robot-taps', passed: true, hintUsed: false, checkedAt: new Date(NOW - 2000).toISOString() },
    ],
  };
}
function episode(id = 'episode-a') {
  return { schema: 'jems.problem-solving.episode.v1', id, owner: 'child-a', sessionId: 'session-a', source: 'practice',
    kind: 'structured-practice', startedAt: new Date(NOW - 5000).toISOString(), completedAt: new Date(NOW - 1000).toISOString(), status: 'completed',
    task: { id: 'test-a', family: 'test-family', version: 'v1', label: 'Choose a useful test', exposure: 'first-seen', firstAttempt: true },
    observations: [{ id: 'decision-a', skill: 'plan_test', outcome: 'demonstrated', authorship: 'learner', support: 'none-observed', elicitation: 'prompted', observedAt: new Date(NOW - 2000).toISOString(), note: 'Changed one variable and kept the route fixed.' }],
  };
}

test('first responses, retries, hints and eventual completions remain different', () => {
  const p = learner();
  math(p, NOW - 5 * DAY); math(p, NOW - 4 * DAY, 'retry'); math(p, NOW - 3 * DAY, 'hint');
  math(p, NOW - 2 * DAY, 'interrupted'); math(p, NOW - DAY, 'shown');
  const input = snap(p), before = JSON.stringify(input), result = buildParentDashboard(input);
  const report = result.subjects.find(s => s.id === 'math')!;
  assert.equal(report.period.records, 5); assert.equal(report.period.completed, 3);
  assert.equal(report.period.independent, 1); assert.equal(report.period.supported, 2);
  assert.equal(report.period.firstResponses, 3); assert.equal(report.period.firstCorrect, 2);
  assert.equal(report.period.firstUnaidedResponses, 2); assert.equal(report.period.firstUnaidedCorrect, 1);
  assert.equal(report.period.retries, 1); assert.equal(report.period.withHint, 1);
  assert.equal(report.period.interrupted, 1); assert.equal(report.period.shown, 1); assert.equal(report.period.incorrect, 0);
  const retry = result.evidence.find(e => e.retried)!;
  assert.equal(retry.firstResponse, '0'); assert.equal(retry.finalResponse, '56');
  assert.equal(retry.context.revisionId, 'version-a'); assert.ok(retry.standards.length);
  assert.equal(JSON.stringify(input), before, 'report building must not mutate child records');
});

test('language incorrect outcomes are not completed even when historical assisted totals include them', () => {
  const p = learner(), q = generateLanguageItem('g2-cause-effect', { random: () => 0.3 });
  const a = beginLanguageAttempt(p, q, { now: NOW - DAY });
  finishLanguageAttempt(p, a.id, 'incorrect', NOW - DAY + 1000);
  const b = beginLanguageAttempt(p, q, { now: NOW - 5000 });
  recordLanguageReadAloud(p, b.id, NOW - 4000);
  submitLanguageAnswer(p, b.id, String(q.answer), NOW - 3000);
  finishLanguageAttempt(p, b.id, 'completed', NOW - 2000);
  const input = snap(p); assert.equal(input.language!.report.totals.assisted, 2);
  const result = buildParentDashboard(input), language = result.subjects.find(s => s.id === 'language')!;
  assert.equal(language.period.completed, 1); assert.equal(language.period.supported, 1);
  assert.equal(language.period.incorrect, 1); assert.equal(language.period.readAloud, 1);
  assert.equal(language.period.independent, 0); assert.equal(language.period.firstUnaidedResponses, 0);
  assert.match(result.evidence.find(e => e.readAloud)!.observation, /not independent reading/);
});

test('calendar range uses retained dated records and excludes bad or future timestamps', () => {
  const p = learner(); math(p, NOW - 20 * DAY); math(p, NOW - 3 * DAY);
  const input = snap(p), valid = input.math!.attempts[1];
  input.math!.attempts = [
    ...input.math!.attempts, { ...valid, id: 'future', startedAt: NOW + 1 },
    { ...valid, id: 'nan', completedAt: NaN }, { ...valid, id: 'bad-order', completedAt: valid.startedAt - 1 },
    { ...valid, id: 'future-answer', answers: [{ ...valid.answers[0], at: NOW + 1 }] },
  ];
  const week = buildParentDashboard({ ...input, range: 7 });
  assert.equal(week.subjects[0].period.records, 1);
  assert.equal(buildParentDashboard({ ...input, range: 30 }).subjects[0].period.records, 2);
  assert.equal(buildParentDashboard({ ...input, range: 90 }).subjects[0].period.records, 2);
  assert.equal(buildParentDashboard({ ...input, range: 'all' }).subjects[0].period.records, 2);
  assert.equal(week.subjects[0].skills.find(s => s.id === 'g3-multiply')!.recordedPresentations, 2);
  assert.throws(() => buildParentDashboard({ ...input, now: NaN }), /valid parent report/);
});

test('owner-labelled snapshots fail closed and sibling creation data never joins', () => {
  const p = learner(), input = snap(p);
  assert.throws(() => buildParentDashboard({ ...input, ownerId: 'sibling' }), /Player changed/);
  assert.throws(() => buildParentDashboard({ ownerId: 'child-a', now: NOW, problemSolving: { ownerId: 'sibling', episodes: [] } }), /Player changed/);
  const creation = workspace();
  creation.attempts.push({ ...creation.attempts[0], id: 'forged-join', revisionId: 'rb' });
  const result = buildParentDashboard({ ownerId: 'child-a', now: NOW, creation });
  assert.equal(result.evidence.length, 2);
  assert.ok(result.evidence.every(e => e.context.projectId === 'scene-a'));
  assert.ok(result.evidence.every(e => e.finalResponse === 'Version that was checked'));
});

test('scene summaries collapse repeated checks without hiding supporting history or claiming independence', () => {
  const result = buildParentDashboard({ ownerId: 'child-a', now: NOW, creation: workspace() });
  const creation = result.subjects.find(s => s.id === 'creation')!;
  assert.equal(creation.historyRecords, 2); assert.equal(creation.period.records, 1);
  assert.equal(creation.collapsedChecks, 1); assert.equal(creation.period.completed, 1);
  assert.equal(creation.period.independent, 0); assert.equal(creation.period.withHint, 1);
  assert.equal(creation.period.matchedWithHint, 1); assert.equal(creation.period.matchedWithoutHint, 0);
  assert.equal(result.evidence.length, 2); assert.ok(result.evidence.every(e => !e.independent));
});

test('missing opportunities remain unobserved and do not create deficit recommendations', () => {
  const result = buildParentDashboard(snap(learner()));
  assert.equal(result.opportunities.length, 0);
  assert.ok(result.subjects[0].skills.every(s => s.state === 'not-observed'));
  assert.equal(result.subjects.find(s => s.id === 'problem-solving')!.available, false);
  assert.match(result.subjects[0].skills[0].note, /not an area of weakness/);
});

test('older math summaries do not fabricate original answer evidence', () => {
  const p = learner(); recordLegacyOutcome(p, item(), true, false, NOW - 1000);
  const result = buildParentDashboard(snap(p)), math = result.subjects[0];
  assert.equal(math.period.completed, 1); assert.equal(math.period.firstResponses, 0);
  assert.equal(result.evidence[0].firstResponse, null); assert.equal(result.evidence[0].finalResponse, null);
  assert.match(result.evidence[0].observation, /original responses are unavailable/);
});

test('optional problem-solving adapter is versioned, owner-scoped, unscored for context, and keeps first decision', () => {
  const first = episode(), supported = episode('supported'), unknown = episode('unknown');
  supported.observations[0].support = 'strategy'; unknown.observations[0].authorship = 'unknown';
  first.observations[0].outcome = 'not-yet';
  first.observations.push({ ...first.observations[0], id: 'second-response', outcome: 'demonstrated' });
  const context = { ...episode('context'), kind: 'context-only' };
  const technical = { ...episode('technical'), status: 'technical-invalid' };
  const interrupted = { ...episode('interrupted'), status: 'interrupted' };
  const sibling = { ...episode('sibling'), owner: 'sibling' };
  const future = { ...episode('future'), completedAt: new Date(NOW + DAY).toISOString() };
  const wrongSchema = { ...episode('new-schema'), schema: 'jems.problem-solving.episode.v2' };
  const result = buildParentDashboard({ ownerId: 'child-a', now: NOW, problemSolving: {
    ownerId: 'child-a', episodes: [first, supported, unknown, context, technical, interrupted, sibling, future, wrongSchema], discarded: 7,
  } });
  const ps = result.subjects.find(s => s.id === 'problem-solving')!;
  assert.equal(ps.available, true); assert.equal(ps.period.records, 3); assert.equal(ps.period.completed, 2);
  assert.equal(ps.period.noContentHelp, 1); assert.equal(ps.period.withContentHelp, 1); assert.equal(ps.period.unknownAttribution, 1);
  assert.equal(ps.period.independent, 0); assert.equal(ps.period.incorrect, 0);
  assert.equal(result.evidence.filter(e => e.contextOnly).length, 3);
  assert.equal(result.evidence.find(e => e.id.endsWith('episode-a:plan_test'))!.outcome, 'not-yet');
  assert.ok(!result.evidence.some(e => /sibling|future|new-schema/.test(e.id)));
  assert.match(ps.notices.at(-1)!, /7 older middle/);
});

test('unobserved or invalid problem-solving observations do not become failed opportunities', () => {
  const a = episode(); a.observations[0].outcome = 'unobserved';
  const b = episode('bad-support'); b.observations[0].support = 'invented';
  const result = buildParentDashboard({ ownerId: 'child-a', now: NOW, problemSolving: { ownerId: 'child-a', episodes: [a, b] } });
  const ps = result.subjects.find(s => s.id === 'problem-solving')!;
  assert.equal(ps.period.records, 0); assert.ok(ps.skills.every(s => s.state === 'not-observed'));
});

test('recommendations link the evidence that caused them, not an unrelated recent success', () => {
  const p = learner(); math(p, NOW - 8000); const supported = math(p, NOW - 5000, 'hint'); math(p, NOW - 2000);
  const result = buildParentDashboard(snap(p)), opportunity = result.opportunities.find(o => o.basis === 'recorded-support')!;
  assert.ok(opportunity); assert.deepEqual(opportunity.evidenceIds, [`math:${supported.id}`]);
  const ps = episode(); ps.observations[0].outcome = 'not-yet'; ps.task.exposure = 'repeat'; ps.task.firstAttempt = false;
  const reasoning = buildParentDashboard({ ownerId: 'child-a', now: NOW, problemSolving: { ownerId: 'child-a', episodes: [ps] } });
  assert.equal(reasoning.opportunities.length, 1);
  assert.deepEqual(reasoning.opportunities[0].evidenceIds, ['problem-solving:episode-a:plan_test']);
  assert.equal(reasoning.evidence[0].context.exposure, 'repeat'); assert.equal(reasoning.evidence[0].context.firstAttempt, false);
  assert.equal(reasoning.evidence[0].context.taskFamily, 'test-family'); assert.equal(reasoning.evidence[0].context.source, 'practice');
});

test('known reasoning help stays visible when authorship or another support field is unknown', () => {
  const a = episode(), b = episode('shared');
  a.observations[0].authorship = 'unknown'; a.observations[0].support = 'strategy';
  b.observations[0].authorship = 'shared'; b.observations[0].support = 'unknown';
  const result = buildParentDashboard({ ownerId: 'child-a', now: NOW, problemSolving: { ownerId: 'child-a', episodes: [a, b] } });
  const ps = result.subjects.find(s => s.id === 'problem-solving')!;
  assert.equal(ps.period.withContentHelp, 2); assert.equal(ps.period.unknownAttribution, 0);
  assert.ok(result.evidence.find(e => e.id.includes('episode-a'))!.support.includes('Authorship unknown'));
  assert.ok(result.evidence.find(e => e.id.includes('shared'))!.support.includes('Help not fully recorded'));
});

test('matched examples use the newest actual result, including an unsuccessful response, without a growth score', () => {
  const p = learner(); const earlier = math(p, NOW - 10 * DAY); math(p, NOW - 7 * DAY);
  const q = item(), later = beginAttempt(p, q, { now: NOW - DAY });
  submitAnswer(p, later.id, '0', NOW - DAY + 100); finishAttempt(p, later.id, 'shown', NOW - DAY + 200);
  const result = buildParentDashboard(snap(p)), pair = result.comparisons[0];
  assert.ok(pair); assert.equal(pair.earlierId, `math:${earlier.id}`); assert.equal(pair.laterId, `math:${later.id}`);
  assert.equal(result.evidence.find(e => e.id === pair.laterId)!.firstCorrect, false);
  assert.match(pair.conditionNote, /not equated test forms/); assert.ok(!Object.hasOwn(pair, 'gain'));
});

test('same-day repetition and a different latest format do not manufacture comparable growth examples', () => {
  const p = learner(); math(p, NOW - 7000); math(p, NOW - 3000);
  assert.equal(buildParentDashboard(snap(p)).comparisons.length, 0);
  math(p, NOW - 5 * DAY);
  const visual = generateItem('g3-multiply', { factId: 'mul:8x7', representation: 'visual', random: () => 0.2 });
  const a = beginAttempt(p, visual, { now: NOW - 1500 }); submitAnswer(p, a.id, String(visual.answer), NOW - 1000);
  assert.equal(buildParentDashboard(snap(p)).comparisons.length, 0, 'do not pick an older favorable latest result just to create a pair');
});
