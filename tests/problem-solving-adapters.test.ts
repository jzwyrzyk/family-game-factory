import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { adaptSourceEvidence } from '../src/problem-solving/adapters';
import { installProblemSolvingEvidence } from '../src/problem-solving/bridge';
import { installEvidenceReceiver, publishSourceEvidence, type SourceEvidenceSignal } from '../src/problem-solving/signals';
import { validateProblemSolvingEpisode, type ProblemSolvingEpisode } from '../src/problem-solving/model';
import { summarizeProblemSolving } from '../src/problem-solving/evidence';
import { generateItem } from '../src/learning/content';
import { beginAttempt, submitAnswer, useHint, finishAttempt } from '../src/learning/engine';
import { generateLanguageItem } from '../src/language/content';
import { beginLanguageAttempt, submitLanguageAnswer, useLanguageHint, recordLanguageReadAloud, finishLanguageAttempt } from '../src/language/engine';
import type { LearnerProfile } from '../src/learning/types';
import { CreationStore } from '../src/creation/storage';
import { createChallengeStarter, evaluateChallenge } from '../src/creation/challenges';
import { StudioNotebook, validateNotebook } from '../src/studio/notebook';
import { builderJourney, gemStage } from '../src/brand/gem-progress';
import { setAdultWorkspace } from '../src/adult-pilot/storage';

class MemoryStorage implements Storage {
  data = new Map<string, string>(); fail = false;
  get length() { return this.data.size; }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { if (this.fail) throw Error('quota'); this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
  clear() { this.data.clear(); }
}
const at = Date.parse('2026-11-19T12:00:00.000Z');
const profile = (): LearnerProfile => ({id: 'child-one', grade: 4, skills: {}});
afterEach(() => { installEvidenceReceiver(() => {})(); setAdultWorkspace(null); });
function contextualOnly(records: ProblemSolvingEpisode[]) {
  for (const record of records) {
    validateProblemSolvingEpisode(record); assert.equal(record.kind, 'context-only');
    assert.ok(record.observations.every(o => o.outcome === 'unobserved'));
    assert.equal(record.task.exposure, 'unknown'); assert.equal(record.task.firstAttempt, false);
  }
  const summary = summarizeProblemSolving(records);
  assert.ok(Object.values(summary.bySkill).every(s => s.opportunities === 0));
}
function forbiddenPayloadKeys(value: unknown): string[] {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap(forbiddenPayloadKeys);
  const forbidden = new Set(['raw','normalized','messages','draft','hypothesis','question','passage','candidate','plan']);
  return Object.entries(value).flatMap(([key, item]) => [...(forbidden.has(key) ? [key] : []), ...forbiddenPayloadKeys(item)]);
}

test('actual Math attempts contribute compact context after closure without copying subject scores or response content', () => {
  const p = profile(), item = generateItem('g3-multiply', {factId: 'mul:8x7', representation: 'symbolic', random: () => 0});
  const attempt = beginAttempt(p, item, {now: at, sessionId: 'real-math-session', gameId: 'robot'});
  assert.deepEqual(adaptSourceEvidence({kind: 'math', owner: p.id!, attempt}), []);
  submitAnswer(p, attempt.id, '55', at + 1000); useHint(p, attempt.id, 1, at + 2000);
  submitAnswer(p, attempt.id, '56', at + 3000);
  assert.equal(attempt.outcome, 'completed'); assert.equal(attempt.answers.length, 2);
  const records = adaptSourceEvidence({kind: 'math', owner: p.id!, attempt}); contextualOnly(records);
  assert.equal(records.length, 1); assert.equal(records[0].observations.length, 0);
  assert.match(records[0].context!, /Responses: 2/); assert.match(records[0].context!, /hint depth recorded: 1/);
  assert.equal(records[0].startedAt, new Date(at).toISOString());
  assert.equal(records[0].completedAt, new Date(at + 3000).toISOString());
  assert.deepEqual(forbiddenPayloadKeys(records), []);
  assert.equal(JSON.stringify(records).includes(item.question), false);
  assert.deepEqual(adaptSourceEvidence({kind: 'math', owner: p.id!, attempt}), records);
  const second = beginAttempt(p, item, {now: at + 4000, sessionId: 'real-math-session'});
  finishAttempt(p, second.id, 'interrupted', at + 5000);
  assert.equal(adaptSourceEvidence({kind: 'math', owner: p.id!, attempt: second})[0].status, 'interrupted');
});

test('actual English hint/read-aloud outcomes remain English evidence, with no raw text or inferred APS success', () => {
  const p = profile(), item = generateLanguageItem('g3-inference', {tier: 0, random: () => 0});
  const attempt = beginLanguageAttempt(p, item, {now: at, sessionId: 'english-session', gameId: 'language-lab'});
  assert.deepEqual(adaptSourceEvidence({kind: 'language', owner: p.id!, attempt}), []);
  useLanguageHint(p, attempt.id, 1, at + 1000); recordLanguageReadAloud(p, attempt.id, at + 1500);
  submitLanguageAnswer(p, attempt.id, item.answer!, at + 2000);
  finishLanguageAttempt(p, attempt.id, 'completed', at + 2500);
  assert.equal(attempt.independent, false);
  const records = adaptSourceEvidence({kind: 'language', owner: p.id!, attempt}); contextualOnly(records);
  assert.equal(records[0].observations.length, 0); assert.equal(records[0].source, 'language');
  assert.match(records[0].context!, /hint depth recorded: 1/);
  assert.deepEqual(forbiddenPayloadKeys(records), []);
  assert.equal(JSON.stringify(records).includes(item.question), false);
  if (item.passage) assert.equal(JSON.stringify(records).includes(item.passage), false);
  const skipped = beginLanguageAttempt(p, item, {now: at + 3000});
  finishLanguageAttempt(p, skipped.id, 'skipped', at + 4000);
  assert.equal(adaptSourceEvidence({kind: 'language', owner: p.id!, attempt: skipped})[0].status, 'interrupted');
});

test('Creation rechecks share an evidence identity until the checked saved version changes', () => {
  const storage = new MemoryStorage(), creations = new CreationStore(storage), scene = createChallengeStarter('robot-route');
  const entry = creations.create('child-one', scene, {challengeId: 'robot-route'});
  const result = evaluateChallenge('robot-route', scene);
  const first = creations.recordAttempt(entry.id, entry.owner, entry.headId, {challengeId: 'robot-route', passed: result.passed, hintUsed: false});
  const again = creations.recordAttempt(entry.id, entry.owner, entry.headId, {challengeId: 'robot-route', passed: result.passed, hintUsed: false});
  assert.notEqual(first.id, again.id);
  const [a] = adaptSourceEvidence({kind: 'creation', owner: entry.owner, attempt: first, result});
  const [b] = adaptSourceEvidence({kind: 'creation', owner: entry.owner, attempt: again, result});
  contextualOnly([a]); assert.equal(a.id, b.id); assert.equal(a.sessionId, entry.id);
  assert.equal(a.observations[0].authorship, 'unknown'); assert.equal(a.observations[0].support, 'unknown');
  const revised = creations.save(entry.id, entry.owner, {...scene, title: 'Another saved version'}, entry.headId);
  const newer = creations.recordAttempt(entry.id, entry.owner, revised.id, {challengeId: 'robot-route', passed: result.passed, hintUsed: true});
  const [c] = adaptSourceEvidence({kind: 'creation', owner: entry.owner, attempt: newer, result});
  assert.notEqual(c.id, a.id); assert.match(c.context!, /Hint.*yes/);
  const [broken] = adaptSourceEvidence({kind: 'creation', owner: entry.owner, attempt: newer, result: {...result, status: 'invalid', passed: false}});
  assert.equal(broken.status, 'technical-invalid'); contextualOnly([broken]);
});

test('new Studio facts preserve recorded helper/child origins without copying text or inventing reasoning quality', () => {
  const notebook = new StudioNotebook(new MemoryStorage()), before = notebook.create('child-one', 'robot', 'Private project');
  notebook.update(before.id, before.owner, s => {
    s.draft = 'PRIVATE_DRAFT_TEXT'; s.hypothesis = 'PRIVATE_PREDICTION_TEXT';
    s.messages.push({id: 'private-message', role: 'child', text: 'PRIVATE_MESSAGE_TEXT', at: new Date(at).toISOString()});
    s.design!.plan.goal = {value: 'PRIVATE_GOAL_TEXT', origin: 'helper', accepted: true, delegated: false};
  });
  notebook.saveExperiment(before.id, before.owner, {id: 'helper-test', baseId: null, config: {speed: 1}, prompt: 'PRIVATE_HELPER_REQUEST', summary: 'PRIVATE_BUILD_SUMMARY'}, [], 'redesign', 'helper');
  notebook.saveExperiment(before.id, before.owner, {id: 'child-test', baseId: null, config: {speed: 2}, prompt: 'PRIVATE_CHILD_REQUEST', summary: 'PRIVATE_BUILD_SUMMARY'}, [], 'tune', 'child');
  notebook.observe(before.id, before.owner, 'PRIVATE_OBSERVATION_TEXT', 'child', 'child-test');
  const after = notebook.get(before.id, before.owner);
  const records = adaptSourceEvidence({kind: 'studio', before, after}); contextualOnly(records);
  assert.equal(records.length, 4);
  assert.equal(records.filter(r => r.observations[0].authorship === 'helper').length, 2);
  assert.equal(records.filter(r => r.observations[0].authorship === 'learner').length, 2);
  assert.ok(records.every(r => r.observations[0].support === 'unknown'));
  assert.equal(JSON.stringify(records).includes('PRIVATE_'), false); assert.deepEqual(forbiddenPayloadKeys(records), []);
  assert.deepEqual(adaptSourceEvidence({kind: 'studio', before: after, after}), []);
  assert.deepEqual(adaptSourceEvidence({kind: 'studio', before, after: {...after, owner: 'child-two'}}), []);
});

test('reading, restoring and ordinary chat do not backfill events; failed observers cannot break original saves', () => {
  const storage = new MemoryStorage(), notebook = new StudioNotebook(storage), signals: SourceEvidenceSignal[] = [];
  const session = notebook.create('child-one', 'robot', 'A game');
  const stop = installEvidenceReceiver(signal => signals.push(signal));
  const before = notebook.get(session.id, session.owner);
  notebook.message(session.id, session.owner, 'child', 'PRIVATE_UNSCORED_CHAT');
  const after = notebook.get(session.id, session.owner);
  assert.equal(signals.length, 1); assert.deepEqual(adaptSourceEvidence({kind: 'studio', before, after}), []);
  notebook.list(session.owner); notebook.get(session.id, session.owner); notebook.restore(notebook.read());
  assert.equal(signals.length, 1); stop();
  installEvidenceReceiver(() => { throw Error('Evidence storage failed'); });
  assert.doesNotThrow(() => notebook.update(session.id, session.owner, s => {s.design!.plan.goal = {value: 'Keep the key safe', origin: 'child', accepted: true, delegated: false};}));
  assert.equal(notebook.get(session.id, session.owner).design!.plan.goal!.value, 'Keep the key safe');
  assert.doesNotThrow(() => notebook.clearConversation(session.id, session.owner));
  assert.equal(notebook.get(session.id, session.owner).messages.length, 0);
  let delivered = 0; installEvidenceReceiver(() => delivered++); storage.fail = true;
  assert.throws(() => notebook.message(session.id, session.owner, 'child', 'A failed source save'), /Could not save/);
  assert.equal(delivered, 0);
});

test('host bridge deduplicates unchanged scene versions and keeps evidence save failure separate from original work', () => {
  const priorWindow = Object.getOwnPropertyDescriptor(globalThis, 'window'), priorStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const storage = new MemoryStorage(); let owner = 'child-one'; const bus = new EventTarget();
  const host = {FG: {store: {current: () => ({id: owner})}}, dispatchEvent: bus.dispatchEvent.bind(bus)};
  Object.defineProperty(globalThis, 'window', {configurable: true, writable: true, value: host});
  Object.defineProperty(globalThis, 'localStorage', {configurable: true, writable: true, value: storage});
  try {
    const api = installProblemSolvingEvidence();
    const creations = new CreationStore(new MemoryStorage()), scene = createChallengeStarter('robot-route');
    const entry = creations.create(owner, scene, {challengeId: 'robot-route'}), result = evaluateChallenge('robot-route', scene);
    const attempt = creations.recordAttempt(entry.id, owner, entry.headId, {challengeId: 'robot-route', passed: result.passed, hintUsed: false});
    publishSourceEvidence({kind: 'creation', owner, attempt, result});
    publishSourceEvidence({kind: 'creation', owner, attempt: {...attempt, id: 'different-check', checkedAt: new Date(Date.parse(attempt.checkedAt) + 1000).toISOString()}, result});
    assert.equal(api.list().length, 1); assert.equal(api.warning(), null);
    storage.fail = true;
    const actualSavedAttempt = creations.recordAttempt(entry.id, owner, entry.headId, {challengeId: 'robot-route', passed: result.passed, hintUsed: false});
    assert.doesNotThrow(() => publishSourceEvidence({kind: 'creation', owner, attempt: {...actualSavedAttempt, revisionId: 'different-version'}, result}));
    assert.equal(creations.attempts(entry.id, owner).length, 2); assert.match(api.warning(), /observation.*not/i);
    assert.equal(api.list().length, 1); storage.fail = false;
    owner = 'child-two'; assert.deepEqual(api.list(), []);
    publishSourceEvidence({kind: 'creation', owner: 'child-one', attempt, result}); assert.deepEqual(api.list(), []);
    owner = 'child-one'; publishSourceEvidence({kind: 'clear-creation', owner, projectId: entry.id}); assert.deepEqual(api.list(), []);
  } finally {
    installEvidenceReceiver(() => {})();
    if (priorWindow) Object.defineProperty(globalThis, 'window', priorWindow); else delete (globalThis as any).window;
    if (priorStorage) Object.defineProperty(globalThis, 'localStorage', priorStorage); else delete (globalThis as any).localStorage;
  }
});

test('cosmetic journey, avatar, verified keep and backup paths never manufacture APS evidence', () => {
  const priorWindow = Object.getOwnPropertyDescriptor(globalThis, 'window'), priorStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const storage = new MemoryStorage(), sourceStorage = new MemoryStorage(), owner = 'child-one';
  const bus = new EventTarget(), host = {FG: {store: {current: () => ({id: owner})}}, dispatchEvent: bus.dispatchEvent.bind(bus)};
  Object.defineProperty(globalThis, 'window', {configurable: true, writable: true, value: host});
  Object.defineProperty(globalThis, 'localStorage', {configurable: true, writable: true, value: storage});
  try {
    const api = installProblemSolvingEvidence(), notebook = new StudioNotebook(sourceStorage);
    const local = notebook.create(owner, 'buckets', 'Local idea', 'local-project');
    notebook.setAvatar(owner, 'spark');
    assert.deepEqual(api.list(), []);
    const localTest = notebook.saveExperiment(local.id, owner, {id: 'local-test', baseId: 'local-base', config: {bucketCount: 4}, prompt: 'PRIVATE_LOCAL_PROMPT', summary: 'A saved test'});
    notebook.observe(local.id, owner, 'PRIVATE_LOCAL_REFLECTION', 'child', localTest.id);
    assert.equal(api.list().length, 2);
    const beforeKeep = api.list();
    notebook.keepExperiment(local.id, owner, localTest.id, {kind: 'local', baseId: 'local-base', revisionId: 'local-kept'});
    assert.equal(gemStage(notebook.get(local.id, owner)), 'polished');
    assert.deepEqual(api.list(), beforeKeep, 'A cosmetic making milestone cannot add a reasoning observation');

    const remote = notebook.create(owner, 'new', 'Remote idea');
    const remoteTest = notebook.saveExperiment(remote.id, owner, {id: 'remote-test', baseId: 'remote-base', remoteId: 'remote-kept', prompt: 'PRIVATE_REMOTE_PROMPT', summary: 'A remote test'});
    notebook.observe(remote.id, owner, 'PRIVATE_REMOTE_REFLECTION', 'child', remoteTest.id);
    assert.equal(gemStage(notebook.get(remote.id, owner)), 'rough');
    const beforeVerify = api.list();
    notebook.verifyRemoteExperiment(remote.id, owner, remoteTest.id);
    assert.equal(gemStage(notebook.get(remote.id, owner)), 'cut');
    notebook.keepExperiment(remote.id, owner, remoteTest.id, {kind: 'remote', baseId: 'remote-base', revisionId: 'remote-kept'});
    assert.equal(gemStage(notebook.get(remote.id, owner)), 'polished');
    assert.deepEqual(api.list(), beforeVerify, 'Real-playability verification and Keep do not establish reasoning quality');

    notebook.verifyRemoteExperiment(remote.id, owner, remoteTest.id);
    notebook.keepExperiment(remote.id, owner, remoteTest.id, {kind: 'remote', baseId: 'remote-base', revisionId: 'remote-kept'});
    notebook.setAvatar(owner, 'nova');
    notebook.archive(local.id, owner);
    for (let i = 0; i < 3; i++) assert.equal(builderJourney(notebook.list(owner), owner).polishedCount, 2);
    assert.deepEqual(api.list(), beforeVerify, 'Reload, rendering, archives and repeated callbacks cannot award more evidence');
    contextualOnly(api.list());
    assert.equal(JSON.stringify(api.list()).includes('PRIVATE_'), false);

    const backup = {factoryStudio: notebook.read(), ...api.backup()};
    validateNotebook(backup.factoryStudio); api.validate(backup.factoryProblemSolving);
    const restored = new StudioNotebook(new MemoryStorage()); restored.restore(backup.factoryStudio);
    assert.equal(restored.avatar(owner), 'nova');
    assert.equal(builderJourney(restored.list(owner), owner).polishedCount, 2);
    assert.deepEqual(api.list(), beforeVerify, 'Restoring notebook history does not replay source events');
    api.restore(backup.factoryProblemSolving);
    assert.deepEqual(api.list(), beforeVerify, 'Evidence backup restores original records without deriving scores from the notebook');

    sourceStorage.fail = true;
    assert.throws(() => notebook.clearConversation(local.id, owner), /Could not save/);
    assert.deepEqual(api.list(), beforeVerify, 'A failed source clear cannot erase its observation records');
    assert.equal(gemStage(notebook.get(local.id, owner)), 'polished');
    sourceStorage.fail = false;
    notebook.clearConversation(local.id, owner);
    assert.equal(api.list().length, 2);
    assert.ok(api.list().every((record: ProblemSolvingEpisode) => record.sessionId === remote.id));
    assert.equal(builderJourney(notebook.list(owner), owner).polishedCount, 1);
    notebook.clearConversation(remote.id, owner);
    assert.deepEqual(api.list(), []);
    assert.equal(builderJourney(notebook.list(owner), owner).polishedCount, 0);
    assert.equal(notebook.avatar(owner), 'nova', 'Clearing source evidence does not delete the cosmetic choice');
    assert.equal(api.warning(), null);
  } finally {
    installEvidenceReceiver(() => {})();
    if (priorWindow) Object.defineProperty(globalThis, 'window', priorWindow); else delete (globalThis as any).window;
    if (priorStorage) Object.defineProperty(globalThis, 'localStorage', priorStorage); else delete (globalThis as any).localStorage;
  }
});
