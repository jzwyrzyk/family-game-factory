import assert from 'node:assert/strict';
import { test, afterEach } from 'node:test';
import { profileStorage, setAdultWorkspace } from '../src/adult-pilot/storage';
import { ProblemSolvingStore } from '../src/problem-solving/storage';
import {
  PROBLEM_SOLVING_EPISODE_SCHEMA, PROBLEM_SOLVING_KEY, PROBLEM_SOLVING_LIMITS,
  copyEvidence, emptyProblemSolvingWorkspace, validateProblemSolvingWorkspace,
  type ProblemSolvingEpisode, type ProblemSolvingObservation,
} from '../src/problem-solving/model';

class MemoryStorage implements Storage {
  data = new Map<string, string>(); fail = false;
  get length() { return this.data.size; }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { if (this.fail) throw Error('quota'); this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
  clear() { this.data.clear(); }
}
const start = '2026-11-19T12:00:00.000Z';
function observation(id = 'test-choice'): ProblemSolvingObservation {
  return {id, skill: 'plan_test', outcome: 'not-yet', authorship: 'learner', support: 'none-observed', elicitation: 'prompted', observedAt: start};
}
function episode(id = 'one', owner = 'child-one'): ProblemSolvingEpisode {
  return {schema: PROBLEM_SOLVING_EPISODE_SCHEMA, id, owner, sessionId: 'session-one', source: 'practice', kind: 'structured-practice',
    task: {id: 'ramp-a', family: 'ramps', version: 'v1', label: 'A useful ramp test', exposure: 'first-seen', firstAttempt: true},
    startedAt: start, completedAt: '2026-11-19T12:01:00.000Z', observations: [observation()]};
}
function draft(id = 'one', owner = 'child-one') { const input = episode(id, owner); delete input.completedAt; return {episode: input, stepIndex: 1}; }
afterEach(() => setAdultWorkspace(null));

test('an unchanged recheck is idempotent, while conflicting replacement cannot erase first evidence', () => {
  const storage = new MemoryStorage(), store = new ProblemSolvingStore(storage), first = episode();
  store.record(first); const saved = storage.getItem(PROBLEM_SOLVING_KEY);
  const reordered = Object.fromEntries(Object.entries(first).reverse()) as unknown as ProblemSolvingEpisode; store.record(reordered);
  assert.equal(storage.getItem(PROBLEM_SOLVING_KEY), saved); assert.equal(store.list('child-one').length, 1);
  first.observations[0].outcome = 'demonstrated';
  assert.throws(() => store.record(first), /already saved/); assert.equal(storage.getItem(PROBLEM_SOLVING_KEY), saved);
  const read = store.list('child-one'); read[0].observations[0].note = 'Changed outside the store';
  assert.equal(store.list('child-one')[0].observations[0].note, undefined);
  const other = new ProblemSolvingStore(storage); other.record(episode('two'));
  assert.equal(store.list('child-one').length, 2);
});

test('resumed drafts retain first responses and help; stale prefixes cannot replace later work', () => {
  const storage = new MemoryStorage(), store = new ProblemSolvingStore(storage), first = draft();
  store.saveDraft(first);
  const resumed = new ProblemSolvingStore(storage).draft('child-one', 'ramp-a')!;
  assert.deepEqual(resumed, first);
  const next = copyEvidence(resumed); next.stepIndex = 2;
  next.episode.observations.push({...observation('hint'), outcome: 'unobserved', support: 'strategy', responseId: 'hint:test'});
  store.saveDraft(next); const saved = storage.getItem(PROBLEM_SOLVING_KEY);
  assert.throws(() => store.saveDraft(first), /changed elsewhere/);
  const changed = copyEvidence(next); changed.episode.observations[0].outcome = 'demonstrated';
  assert.throws(() => store.saveDraft(changed), /changed elsewhere/); assert.equal(storage.getItem(PROBLEM_SOLVING_KEY), saved);
  const completed = {...next.episode, completedAt: '2026-11-19T12:02:00.000Z'};
  store.record(completed); assert.equal(store.draft('child-one'), null);
  assert.equal(store.list('child-one')[0].observations[0].outcome, 'not-yet');
  assert.equal(store.list('child-one')[0].observations[1].support, 'strategy');
  assert.throws(() => store.saveDraft(first), /already complete/);
  assert.throws(() => store.record(draft('incomplete').episode), /unsupported or damaged/);
});

test('active owner guards late writes and reads, with the existing adult namespace preserved', () => {
  const storage = new MemoryStorage(); let owner = 'child-one';
  const store = new ProblemSolvingStore(profileStorage(storage), () => owner);
  store.record(episode()); const original = storage.getItem(PROBLEM_SOLVING_KEY);
  owner = 'child-two';
  for (const operation of [() => store.record(episode('late')), () => store.list('child-one'),
    () => store.saveDraft(draft('late-draft')), () => store.removeOwner('child-one'), () => store.draft('child-one')]) {
    assert.throws(operation, /Player changed/);
  }
  assert.equal(storage.getItem(PROBLEM_SOLVING_KEY), original); assert.deepEqual(store.list(owner), []);
  store.record(episode('second', owner));
  const adult = 'adult:11111111-2222-3333-4444-555555555555'; setAdultWorkspace(adult); owner = adult;
  assert.deepEqual(store.list(owner), []); store.record(episode('adult', adult));
  assert.ok(storage.getItem(`family-game-factory-adult:${adult}:${PROBLEM_SOLVING_KEY}`));
  setAdultWorkspace(null); owner = 'child-one'; assert.equal(store.list(owner).length, 1);
});

test('failed saves preserve exact last bytes and do not consume a resumable draft', () => {
  const storage = new MemoryStorage(), store = new ProblemSolvingStore(storage);
  store.record(episode('saved')); store.saveDraft(draft('pending')); const before = store.rawSnapshot(); storage.fail = true;
  assert.throws(() => store.record(episode('pending')), /Could not save/);
  assert.throws(() => store.saveDraft(draft('new')), /Could not save/);
  assert.equal(storage.getItem(PROBLEM_SOLVING_KEY), before); assert.ok(store.draft('child-one', 'ramp-a'));
  assert.equal(store.list('child-one').length, 1);
  // An idempotent retry does not need a second write or fail because storage is now full.
  assert.doesNotThrow(() => store.record(episode('saved')));
});

test('corrupt and future data remain recoverable; explicit validated restore can replace it and rollback preserves it', () => {
  for (const raw of ['{unfinished', '{"schema":"jems.problem-solving.workspace.v99"}', 'x'.repeat(PROBLEM_SOLVING_LIMITS.characters + 1)]) {
    const storage = new MemoryStorage(); storage.setItem(PROBLEM_SOLVING_KEY, raw);
    const store = new ProblemSolvingStore(storage), snapshot = store.rawSnapshot();
    assert.equal(store.recoveryRaw, raw);
    assert.throws(() => store.read(), /cannot be opened/); assert.throws(() => store.reset(), /cannot be opened/);
    assert.throws(() => store.record(episode()), /cannot be opened/); assert.equal(storage.getItem(PROBLEM_SOLVING_KEY), raw);
    store.restore(emptyProblemSolvingWorkspace()); assert.equal(store.recoveryRaw, null);
    store.restoreRawSnapshot(snapshot); assert.equal(storage.getItem(PROBLEM_SOLVING_KEY), raw);
  }
});

test('strict restore rejects unsupported fields, impossible provenance, duplicate observations and overlong data before writing', () => {
  const storage = new MemoryStorage(), store = new ProblemSolvingStore(storage); store.record(episode());
  const original = storage.getItem(PROBLEM_SOLVING_KEY);
  const mutations: ((value: any) => void)[] = [
    value => { value.schema = 'jems.problem-solving.workspace.v2'; },
    value => { value.globalScore = 36; },
    value => { value.episodes[0].independent = true; },
    value => { value.episodes[0].observations[0].authorship = 'ai-verified-child'; },
    value => { value.episodes[0].observations[0].support = null; },
    value => { value.episodes[0].observations.push(value.episodes[0].observations[0]); },
    value => { value.episodes[0].observations[0].observedAt = '2026-11-19T11:00:00.000Z'; },
    value => { value.episodes[0].completedAt = '2026-02-30T12:00:00.000Z'; },
    value => { value.episodes[0].context = 'x'.repeat(1201); },
    value => { value.episodes[0].task.firstAttempt = 'yes'; },
    value => { value.discardedByOwner['child-one'] = -1; },
  ];
  for (const mutate of mutations) {
    const candidate = store.export(); mutate(candidate);
    assert.throws(() => store.restore(candidate), /unsupported or damaged/);
    assert.equal(storage.getItem(PROBLEM_SOLVING_KEY), original);
  }
  assert.throws(() => validateProblemSolvingWorkspace(Object.assign(Object.create({unexpected: true}), store.export())), /unsupported or damaged/);
});

test('bounded retention preserves first observations plus a recent window and discloses omitted middle history', () => {
  const storage = new MemoryStorage(), store = new ProblemSolvingStore(storage), data = emptyProblemSolvingWorkspace();
  const dated = (i: number) => {
    const e = episode(`episode-${i.toString().padStart(3, '0')}`), at = new Date(Date.parse(start) + i * 1000).toISOString();
    e.startedAt = at; e.completedAt = at; e.observations[0].observedAt = at; return e;
  };
  for (let i = 0; i < PROBLEM_SOLVING_LIMITS.episodesPerOwner; i++) data.episodes.push(dated(i));
  store.restore(data);
  for (let i = 200; i < 203; i++) store.record(dated(i));
  const kept = store.list('child-one'); assert.equal(kept.length, 200);
  assert.deepEqual(kept.slice(0, 12).map(e => e.id), data.episodes.slice(0, 12).map(e => e.id));
  assert.equal(kept[12].id, 'episode-015'); assert.equal(kept.at(-1)!.id, 'episode-202');
  assert.deepEqual(store.retention('child-one'), {retained: 200, discarded: 3, firstRetained: 12,
    earliestAt: start, latestAt: dated(202).completedAt});
  const beforeReplay = storage.getItem(PROBLEM_SOLVING_KEY);
  assert.throws(() => store.record(dated(12)), /outside the retained history/);
  assert.equal(storage.getItem(PROBLEM_SOLVING_KEY), beforeReplay);
  assert.doesNotThrow(() => store.record(dated(0)));
  const copy = new ProblemSolvingStore(new MemoryStorage()); copy.restore(store.export());
  assert.deepEqual(copy.export(), store.export());
});

test('source deletion and profile deletion remove retained derived evidence without touching other children or sessions', () => {
  const storage = new MemoryStorage(), store = new ProblemSolvingStore(storage);
  const sourced = (id: string, source: 'creation' | 'studio', sessionId: string, owner = 'child-one') => ({
    ...episode(id, owner), source, sessionId, kind: 'context-only' as const, observations: [],
  });
  store.record(sourced('studio-one', 'studio', 'session-one'));
  store.record(sourced('studio-two', 'studio', 'session-two'));
  store.record(sourced('creation-one', 'creation', 'session-one'));
  store.record(sourced('other-child', 'studio', 'session-one', 'child-two'));
  store.saveDraft(draft());
  store.removeSource('child-one', 'studio', 'session-one');
  assert.deepEqual(store.list('child-one').map(e => e.id).sort(), ['creation-one','studio-two']);
  assert.equal(store.list('child-two').length, 1); assert.ok(store.draft('child-one'));
  const data = store.export(); data.discardedByOwner['child-one'] = 2; store.restore(data);
  store.removeOwner('child-one'); assert.deepEqual(store.list('child-one'), []); assert.equal(store.draft('child-one'), null);
  assert.equal(store.retention('child-one').discarded, 0); assert.equal(store.list('child-two').length, 1);
});

test('parent rollback restores key absence and rejects uncaptured or cross-profile snapshots', () => {
  const storage = new MemoryStorage(); let owner = 'child-one'; const store = new ProblemSolvingStore(storage, () => owner);
  const absent = store.rawSnapshot(); store.record(episode()); store.restoreRawSnapshot(absent);
  assert.equal(storage.getItem(PROBLEM_SOLVING_KEY), null);
  assert.throws(() => store.restoreRawSnapshot('{fake backup}'), /original.*snapshot/);
  store.record(episode()); const before = store.rawSnapshot(); owner = 'child-two';
  assert.throws(() => store.restoreRawSnapshot(before), /original.*snapshot/);
  owner = 'child-one'; store.reset(); store.restoreRawSnapshot(before);
  assert.equal(storage.getItem(PROBLEM_SOLVING_KEY), before);
});
