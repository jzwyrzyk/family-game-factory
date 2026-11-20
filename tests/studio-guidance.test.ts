import assert from 'node:assert/strict';
import test from 'node:test';
import { StudioNotebook, STUDIO_KEY, validateNotebook, type StudioSession, type Candidate } from '../src/studio/notebook';
import { GUIDE_TIP_IDS, GUIDE_TIPS, freshGuidance, hasMeaningfulCreation, readyGuidedExperiment, recommendNext, type GuideTipId } from '../src/studio/guidance';
import { freshDesign, type Experiment } from '../src/studio/design';
import { builderJourney } from '../src/brand/gem-progress';
import { installEvidenceReceiver } from '../src/problem-solving/signals';
import { setRewardSourceMaintenance } from '../src/rewards/write-guard';

const OWNER = 'child-one';
class Memory {
  data = new Map<string, string>(); writes = 0; fail = false;
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) {
    if (this.fail) throw Error('quota');
    this.data.set(key, value); this.writes++;
  }
}
function session(id: string, extra: Partial<StudioSession> = {}): StudioSession {
  return { id, owner: OWNER, name: 'My moon cat', game: 'new', projectId: null, remoteId: null, candidate: null,
    draft: '', messages: [], job: null, updated: '2026-11-19T18:00:00.000Z', hypothesis: '', reflection: false,
    design: freshDesign(), experiments: [], selectedTest: null, ...extra };
}
function experiment(id: string, extra: Partial<Candidate> = {}): Experiment {
  const candidate: Candidate = { id, baseId: null, remoteId: 'remote-' + id, prompt: 'Let the cat jump', summary: 'A new jump', ...extra };
  return { id, label: 'Test A', title: candidate.prompt, baseId: candidate.baseId, parents: [], candidate,
    depth: 'tune', origin: 'child', prediction: '', notes: '', createdAt: '2026-11-19T18:00:00.000Z' };
}
function ready(id: string, extra: Partial<StudioSession> = {}): StudioSession {
  const result = experiment(id + '-test');
  return session(id, { job: { id: 'job-' + id, api: 'https://builder.test', status: 'ready', revisionId: result.candidate.remoteId },
    experiments: [result], ...extra });
}

test('reading guidance is side-effect-free and returns isolated defaults', () => {
  const memory = new Memory(), book = new StudioNotebook(memory);
  const first = book.guidance(OWNER); first.dismissedTips.push('idea'); first.welcomeDismissed = true;
  assert.deepEqual(book.guidance(OWNER), freshGuidance());
  assert.equal(memory.writes, 0); assert.equal(memory.getItem(STUDIO_KEY), null);
});

test('welcome and tips survive reload, remain per profile, and show-tips-again keeps the welcome dismissed', () => {
  const memory = new Memory(), book = new StudioNotebook(memory);
  book.dismissWelcome(OWNER); book.dismissGuideTip(OWNER, 'idea'); book.dismissGuideTip(OWNER, 'idea');
  book.dismissGuideTip('child-two', 'practice');
  const reopened = new StudioNotebook(memory);
  assert.deepEqual(reopened.guidance(OWNER), { welcomeDismissed: true, dismissedTips: ['idea'] });
  assert.deepEqual(reopened.guidance('child-two'), { welcomeDismissed: false, dismissedTips: ['practice'] });
  assert.deepEqual(reopened.resetGuidance(OWNER), { welcomeDismissed: true, dismissedTips: [] });
  assert.deepEqual(reopened.guidance('child-two').dismissedTips, ['practice']);
});

test('preference writes re-read other instances without losing the current draft or other dismissals', () => {
  const memory = new Memory(), first = new StudioNotebook(memory), second = new StudioNotebook(memory);
  const idea = first.create(OWNER, 'new', 'My cat');
  first.dismissGuideTip(OWNER, 'idea');
  second.update(idea.id, OWNER, current => { current.draft = 'Keep my newer idea'; });
  second.dismissGuideTip(OWNER, 'waiting'); first.dismissWelcome(OWNER);
  assert.deepEqual(first.guidance(OWNER).dismissedTips, ['idea', 'waiting']);
  assert.equal(first.get(idea.id, OWNER).draft, 'Keep my newer idea');
});

test('failed preference save leaves both dismissal and creative work intact', () => {
  const memory = new Memory(), book = new StudioNotebook(memory), idea = book.create(OWNER, 'new', 'My cat');
  book.update(idea.id, OWNER, current => { current.draft = 'A cat jumping over the moon'; });
  const before = memory.getItem(STUDIO_KEY); memory.fail = true;
  assert.throws(() => book.dismissWelcome(OWNER), /Could not save/);
  assert.throws(() => book.dismissGuideTip(OWNER, 'ready'), /Could not save/);
  assert.equal(memory.getItem(STUDIO_KEY), before);
  assert.deepEqual(book.guidance(OWNER), freshGuidance());
});

test('guidance honors the existing backup writer guard', () => {
  const memory = new Memory(), book = new StudioNotebook(memory);
  setRewardSourceMaintenance(true);
  try { assert.throws(() => book.dismissWelcome(OWNER), /restoring saved progress/); }
  finally { setRewardSourceMaintenance(false); }
  assert.equal(memory.writes, 0);
});

test('old notebooks restore with defaults and new preferences round-trip through the same backup', () => {
  const old = { version: 1, sessions: [], active: {} };
  assert.deepEqual(validateNotebook(old), old);
  const source = new StudioNotebook(new Memory()); source.restore(old);
  source.dismissWelcome(OWNER); source.dismissGuideTip(OWNER, 'scenes');
  const restored = new StudioNotebook(new Memory()); restored.restore(source.read());
  assert.deepEqual(restored.guidance(OWNER), source.guidance(OWNER));
  restored.restore(old); assert.deepEqual(restored.guidance(OWNER), freshGuidance());
});

test('guide preferences reject unknown fields, invalid IDs, duplicates, unsafe owners, and unbounded profiles', () => {
  const base = { version: 1, sessions: [], active: {} };
  const badValues: unknown[] = [null, [], {}, { welcomeDismissed: 'yes', dismissedTips: [] },
    { welcomeDismissed: true, dismissedTips: ['made-up-tip'] }, { welcomeDismissed: true, dismissedTips: ['idea', 'idea'] },
    { welcomeDismissed: true, dismissedTips: [], skillLevel: 100 }, { welcomeDismissed: true, dismissedTips: 'idea' }];
  for (const value of badValues) assert.throws(() => validateNotebook({ ...base, guidance: { [OWNER]: value } }), /guidance/);
  for (const value of [null, [], 'bad']) assert.throws(() => validateNotebook({ ...base, guidance: value }), /guidance/);
  for (const owner of ['__proto__', 'constructor', 'prototype', 'with space'])
    assert.throws(() => validateNotebook({ ...base, guidance: Object.fromEntries([[owner, freshGuidance()]]) }), /guidance/);
  assert.throws(() => validateNotebook({ ...base, guidance: Object.fromEntries(Array.from({ length: 81 }, (_, i) => ['owner-' + i, freshGuidance()])) }), /guidance/);
  const book = new StudioNotebook(new Memory());
  assert.throws(() => book.dismissGuideTip(OWNER, 'bad' as GuideTipId), /guidance/);
  assert.throws(() => book.dismissWelcome('__proto__'), /Invalid player/);
  assert.throws(() => book.guidance('constructor'), /Invalid player/);
});

test('valid owner names cannot resolve inherited object properties as guidance', () => {
  const book = new StudioNotebook(new Memory()); book.dismissWelcome(OWNER);
  assert.deepEqual(book.guidance('toString'), freshGuidance());
  book.dismissGuideTip('toString', 'play');
  assert.deepEqual(book.guidance('toString'), { welcomeDismissed: false, dismissedTips: ['play'] });
});

test('guidance never grants gems, advances maker rank, or publishes creative evidence', () => {
  const memory = new Memory(); let notifications = 0, observations = 0;
  const book = new StudioNotebook(memory, () => { notifications++; });
  const idea = book.create(OWNER, 'new', 'My cat');
  book.update(idea.id, OWNER, current => { current.design!.ideas.push({ id: 'idea-one', text: 'My jumping cat', origin: 'child', adopted: true }); });
  const before = book.read(), rank = builderJourney(book.list(OWNER), OWNER);
  const cleanup = installEvidenceReceiver(() => { observations++; }); notifications = 0;
  try {
    book.dismissWelcome(OWNER);
    for (const id of GUIDE_TIP_IDS) book.dismissGuideTip(OWNER, id);
    book.resetGuidance(OWNER);
  } finally { cleanup(); }
  assert.deepEqual(book.read().sessions, before.sessions);
  assert.deepEqual(book.read().rewardOutbox, before.rewardOutbox);
  assert.deepEqual(builderJourney(book.list(OWNER), OWNER), rank);
  assert.equal(notifications, 0); assert.equal(observations, 0);
});

test('plain starter play and helper text do not hide the first-creation invitation', () => {
  const starter = session('starter', { game: 'moon', projectId: 'starter-project', playOnly: true,
    messages: [{ id: 'helper', role: 'helper', text: 'Play first!', at: '2026-11-19T18:00:00.000Z' }] });
  assert.equal(hasMeaningfulCreation([starter, session('empty')], OWNER), false);
  assert.equal(hasMeaningfulCreation([{ ...starter, draft: 'Try a giant donut' }], OWNER), true);
  assert.equal(hasMeaningfulCreation([{ ...starter, experiments: [experiment('child-test')] }], OWNER), true);
  assert.equal(hasMeaningfulCreation([session('other', { owner: 'child-two', draft: 'An idea' })], OWNER), false);
  assert.equal(hasMeaningfulCreation([session('archived', { archived: true, resumeDismissed: true, draft: 'An idea' })], OWNER), true,
    'Putting away a creation does not make its owner a first-time child again');
});

test('new ready games outrank a newer waiting game and never mutate selection', () => {
  const mine = ready('mine'), starter = session('starter', { game: 'moon', projectId: 'starter-project', playOnly: true, updated: '2026-11-19T20:00:00.000Z' });
  const input = [starter, mine], before = JSON.stringify(input);
  assert.deepEqual(recommendNext(input, OWNER, starter.id), { sessionId: mine.id, kind: 'ready', title: 'Your game is ready',
    description: 'My moon cat is ready to try. You choose when to open it.', action: 'Play my game', experimentId: 'mine-test' });
  assert.equal(JSON.stringify(input), before); assert.equal(mine.selectedTest, null); assert.equal(mine.candidate, null);
});

test('a ready job without the matching saved result is not presented as playable', () => {
  const mine = ready('mine'); mine.experiments = [];
  assert.equal(readyGuidedExperiment(mine), undefined);
  assert.equal(recommendNext([mine], OWNER)?.kind, undefined);
  mine.experiments = [experiment('unrelated')];
  assert.equal(readyGuidedExperiment(mine), undefined);
  assert.notEqual(recommendNext([mine], OWNER)?.kind, 'ready');
});

test('already selected, currently kept, or previously kept results are not new ready games', () => {
  const selected = ready('selected'); selected.selectedTest = selected.experiments![0].id;
  assert.equal(readyGuidedExperiment(selected), undefined);
  const current = ready('current'); current.remoteId = current.job!.revisionId!;
  assert.equal(readyGuidedExperiment(current), undefined);
  const kept = ready('kept'); kept.keptExperiments = [{ experimentId: 'kept-test', revisionId: kept.job!.revisionId!, baseId: 'older-version', kind: 'remote', at: kept.updated }];
  assert.equal(readyGuidedExperiment(kept), undefined, 'Undo must not resurrect a previously kept result as newly ready');
});

test('real pending work outranks a recent starter and changing job state updates the recommendation', () => {
  const mine = session('mine', { draft: 'My cat', job: { id: 'my-job', api: 'https://builder.test', status: 'building' } });
  const starter = session('starter', { game: 'moon', projectId: 'starter-project', playOnly: true, updated: '2026-11-19T20:00:00.000Z' });
  assert.equal(recommendNext([starter, mine], OWNER, starter.id)?.kind, 'building');
  mine.job!.status = 'failed';
  assert.equal(recommendNext([starter, mine], OWNER, starter.id)?.kind, 'retry');
  assert.equal(recommendNext([session('unrelated-failure', { job: mine.job })], OWNER), null, 'A contextless failure is not a new creative task');
});

test('unfinished test and draft beat plain play, without reviving kept tests', () => {
  const result = experiment('local', { config: { jump: 5 }, remoteId: undefined, baseId: 'original' });
  const mine = session('mine', { game: 'moon', projectId: 'mine-project', candidate: result.candidate, experiments: [result] });
  const starter = session('starter', { game: 'moon', projectId: 'starter-project', playOnly: true, updated: '2026-11-19T20:00:00.000Z' });
  assert.equal(recommendNext([mine, starter], OWNER, starter.id)?.kind, 'experiment');
  mine.keptExperiments = [{ experimentId: result.id, revisionId: 'kept-local', baseId: 'original', kind: 'local', at: mine.updated }];
  assert.equal(recommendNext([mine, starter], OWNER, starter.id)?.sessionId, starter.id);
  mine.candidate = null; mine.draft = 'Let the cat wait\n  for my tap';
  assert.equal(recommendNext([mine, starter], OWNER, starter.id)?.description, 'Let the cat wait for my tap');
});

test('return suggestions respect owner, archives and dismissal even when ready', () => {
  const archived = ready('archived', { archived: true }), dismissed = ready('dismissed', { resumeDismissed: true }), other = ready('other', { owner: 'child-two' });
  assert.equal(recommendNext([archived, dismissed, other], OWNER, other.id), null);
  const draft = session('draft', { draft: 'A dragon that dances' });
  assert.equal(recommendNext([archived, dismissed, other, draft], OWNER)?.sessionId, draft.id);
  assert.equal(recommendNext([other, draft], 'child-two')?.sessionId, other.id);
});

test('blank active idea resumes without another project, and ties are deterministic', () => {
  const blank = session('blank');
  assert.equal(recommendNext([blank], OWNER), null);
  assert.equal(recommendNext([blank], OWNER, blank.id)?.sessionId, blank.id);
  const a = session('a', { draft: 'A' }), b = session('b', { draft: 'B' });
  assert.deepEqual(recommendNext([a, b], OWNER), recommendNext([b, a], OWNER));
  assert.equal(recommendNext([session('long', { draft: 'A very long idea '.repeat(30) })], OWNER)!.description.length <= 160, true);
  assert.deepEqual(Object.keys(GUIDE_TIPS), [...GUIDE_TIP_IDS]);
});
