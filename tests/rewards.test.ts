import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createRewardFact, emptyRewardsSummary, enqueueRewardFact, rewardFactId, validateRewardFact,
  validateRewardOutbox, validateRewardsWorkspace, type RewardFact, type RewardsWorkspace,
} from '../src/rewards/model';
import { RewardsStore, type RewardsPersistence, type RewardsTransaction } from '../src/rewards/store';

const clone = <T>(value: T): T => structuredClone(value);
/** The same serial transaction contract as IndexedDB, with controllable faults. */
class MemoryPersistence implements RewardsPersistence {
  values = new Map<string, unknown>();
  failReads = false; failWrites = false;
  private pending: Promise<unknown> = Promise.resolve();
  async read(namespace: string) {
    await this.pending.catch(() => {});
    if (this.failReads) throw Error('read unavailable');
    return clone(this.values.get(namespace) ?? null);
  }
  update<T>(namespace: string, mutate: (current: unknown | null) => RewardsTransaction<T>): Promise<T> {
    const operation = this.pending.catch(() => {}).then(() => {
      if (this.failReads) throw Error('read unavailable');
      const next = mutate(clone(this.values.get(namespace) ?? null));
      if (this.failWrites) throw Error('write unavailable');
      this.values.set(namespace, clone(next.next));
      return clone(next.result);
    });
    this.pending = operation;
    return operation;
  }
}
const owner = 'player1';
const at = '2026-11-19T14:00:00.000Z';
const fact = (id: string, kind: 'math.completed' | 'language.completed' | 'language.explored' | 'scene.challenge' | 'game.developed' = 'math.completed', who = owner): RewardFact =>
  createRewardFact({ owner: who, kind, sourceId: id, occurredAt: at });
const setup = () => { const memory = new MemoryPersistence(); return { memory, store: new RewardsStore('family', memory) }; };

test('empty snapshot is engagement progress without an invented proficiency or XP level', async () => {
  const { store } = setup();
  assert.deepEqual(await store.summary(owner), emptyRewardsSummary(owner));
  const summary = await store.summary(owner);
  assert.equal(summary.lifetimeGems, 0); assert.equal(summary.nextGemMilestone, 50);
  assert.deepEqual(summary.nextPracticeMilestone, { goal: 10, amount: 10, progress: 0 });
  assert.equal('level' in summary, false); assert.equal('proficiency' in summary, false);
});

test('source facts use the fixed amounts and maker milestone bonuses do not inflate activity counts', async () => {
  const { store } = setup();
  const facts = [fact('answer-1'), fact('answer-1', 'language.completed'), fact('draft-1', 'language.explored'),
    fact('robot-route', 'scene.challenge'), fact('project-1', 'game.developed'),
    ...([1, 2, 3, 4] as const).map(level => createRewardFact({ owner, kind: 'maker.milestone', level, occurredAt: at }))];
  const result = await store.project(owner, facts);
  assert.equal(result.summary.lifetimeGems, 114);
  assert.deepEqual(result.summary.counts, { math: 1, language: 2, coding: 1, making: 1 });
  assert.equal(result.summary.practiceCount, 3); assert.equal(result.newlyGranted.length, 9);
  assert.deepEqual(result.newGemMilestones, [50]);
});

test('retrying the same semantic activity, challenge or developed project cannot award twice', async () => {
  const { store } = setup();
  const facts = [fact('a'), fact('robot-route', 'scene.challenge'), fact('project-1', 'game.developed')];
  const first = await store.project(owner, facts);
  const duplicate = facts.map(value => ({ ...value, occurredAt: '2026-11-20T14:00:00.000Z' }));
  const repeated = await store.project(owner, duplicate);
  assert.equal(repeated.summary.lifetimeGems, first.summary.lifetimeGems);
  assert.deepEqual(repeated.newlyGranted, []); assert.deepEqual(repeated.newGemMilestones, []);
  assert.equal(repeated.summary.totalGrants, 3);
  await store.project(owner, [fact('project-2', 'game.developed')]);
  assert.equal((await store.summary(owner)).counts.making, 2);
});

test('semantic identity excludes policy version and date, but unsupported policies cannot mint grants', async () => {
  const { memory, store } = setup(), original = fact('same');
  await store.project(owner, [original]); const before = await store.export();
  const changed = { ...original, policyVersion: 2 };
  assert.equal(rewardFactId(changed as any), rewardFactId(original));
  await assert.rejects(store.project(owner, [changed as any]), /unsupported or damaged/);
  assert.deepEqual(await store.export(), before);
  assert.equal((memory.values.get('family') as RewardsWorkspace).profiles[0].receipts.length, 1);
});

test('an outbox is additive, copied and deduplicated before source persistence', () => {
  assert.deepEqual(validateRewardOutbox(undefined), []);
  const original: RewardFact[] = [], pending = enqueueRewardFact(original, fact('one'));
  assert.equal(original.length, 0); assert.equal(pending.length, 1);
  assert.deepEqual(enqueueRewardFact(pending, { ...fact('one'), occurredAt: '2026-11-20T14:00:00.000Z' }), pending);
  assert.throws(() => validateRewardOutbox([fact('one'), fact('one')]), /unsupported or damaged/);
  assert.equal(enqueueRewardFact(pending, fact('one', 'math.completed', 'player2')).length, 2);
});

test('a mixed-owner projection is rejected before any receipt commits', async () => {
  const { store } = setup(); await store.project(owner, [fact('kept')]); const before = await store.export();
  await assert.rejects(store.project(owner, [fact('mine'), fact('theirs', 'math.completed', 'player2')]), /another player/);
  assert.deepEqual(await store.export(), before);
  await store.project('player2', [fact('kept', 'math.completed', 'player2')]);
  assert.equal((await store.summary(owner)).lifetimeGems, 2);
  assert.equal((await store.summary('player2')).lifetimeGems, 2);
});

test('an aborted ledger write leaves totals unchanged and the same pending fact recovers exactly once', async () => {
  const { memory, store } = setup(); await store.project(owner, [fact('saved')]);
  const before = await store.export(); memory.failWrites = true;
  await assert.rejects(store.project(owner, [fact('pending')]), /write unavailable/);
  memory.failWrites = false; assert.deepEqual(await store.export(), before);
  const recovered = await store.project(owner, [fact('pending')]);
  assert.equal(recovered.summary.lifetimeGems, 4); assert.equal(recovered.newlyGranted.length, 1);
  assert.deepEqual((await store.project(owner, [fact('pending')])).newlyGranted, []);
});

test('two store instances sharing an atomic port retain every concurrent grant and milestone once', async () => {
  const memory = new MemoryPersistence(), left = new RewardsStore('family', memory), right = new RewardsStore('family', memory);
  await Promise.all(Array.from({ length: 40 }, (_, index) => (index % 2 ? left : right).project(owner, [fact(`answer-${index}`)])));
  const summary = await left.summary(owner);
  assert.equal(summary.practiceCount, 40); assert.equal(summary.lifetimeGems, 105);
  assert.equal(summary.totalGrants, 42); assert.deepEqual(await right.summary(owner), summary);
  await Promise.all([left.project(owner, [fact('same-last')]), right.project(owner, [fact('same-last')])]);
  assert.equal((await right.summary(owner)).practiceCount, 41);
});

test('family, captured adult namespace and another adult namespace remain isolated across awaits', async () => {
  const memory = new MemoryPersistence();
  const adult = 'adult:11111111-1111-4111-8111-111111111111', other = 'adult:22222222-2222-4222-8222-222222222222';
  const familyStore = new RewardsStore('family-game-factory-rewards-v1', memory);
  const adultStore = new RewardsStore(`family-game-factory-adult:${adult}:family-game-factory-rewards-v1`, memory);
  const otherStore = new RewardsStore(`family-game-factory-adult:${other}:family-game-factory-rewards-v1`, memory);
  await Promise.all([familyStore.project(owner, [fact('same')]), adultStore.project(adult, [fact('same', 'math.completed', adult)])]);
  assert.equal((await adultStore.summary(adult)).lifetimeGems, 2);
  assert.equal((await otherStore.summary(other)).lifetimeGems, 0);
  await assert.rejects(familyStore.project(adult, [fact('bad', 'math.completed', adult)]), /different player workspace/);
  await assert.rejects(adultStore.summary(owner), /different player workspace/);
  await assert.rejects(adultStore.project(other, [fact('bad', 'math.completed', other)]), /different player workspace/);
  assert.equal((await familyStore.summary(owner)).lifetimeGems, 2);
});

test('practice bonuses cross 10, 25, 50, 100 and repeated hundreds without hidden perfection bonuses', async () => {
  const { store } = setup();
  let previous = 0;
  for (const [target, expected] of [[9, 18], [10, 30], [25, 75], [50, 145], [100, 270], [200, 495], [300, 720]]) {
    const pending = Array.from({ length: target - previous }, (_, index) => fact(`practice-${previous + index}`, index % 2 ? 'language.completed' : 'math.completed'));
    const result = await store.project(owner, pending);
    assert.equal(result.summary.practiceCount, target); assert.equal(result.summary.lifetimeGems, expected);
    previous = target;
  }
  const snapshot = await store.export();
  const milestones = snapshot.data.profiles[0].receipts.filter(receipt => receipt.type === 'practice');
  assert.deepEqual(milestones.map(receipt => receipt.goal), [10, 25, 50, 100, 200, 300]);
  assert.deepEqual((await store.project(owner, [])).newlyGranted, []);
});

test('gem milestones are recognition thresholds with truthful progress and no extra gems', async () => {
  const { store } = setup();
  const facts = [fact('project', 'game.developed'), fact('route', 'scene.challenge'),
    ...Array.from({ length: 8 }, (_, index) => fact(`p-${index}`))];
  const before = await store.project(owner, facts);
  assert.equal(before.summary.lifetimeGems, 49); assert.equal(before.summary.gemMilestoneProgress, 49 / 50);
  const next = await store.project(owner, [fact('ninth')]);
  assert.equal(next.summary.lifetimeGems, 51); assert.deepEqual(next.newGemMilestones, [50]);
  assert.equal(next.summary.gemMilestoneFloor, 50); assert.equal(next.summary.nextGemMilestone, 150);
  assert.equal(next.summary.gemMilestoneProgress, 1 / 100); assert.equal(next.newlyGranted.length, 1);
});

test('the display extends beyond the initial gem milestone list', async () => {
  const { store } = setup();
  const result = await store.project(owner, Array.from({ length: 61 }, (_, i) => fact(`game-${i}`, 'game.developed')));
  assert.equal(result.summary.lifetimeGems, 1525); assert.equal(result.summary.nextGemMilestone, 2000);
  assert.deepEqual(result.summary.reachedGemMilestones, [50, 150, 300, 600, 1000, 1500]);
  assert.equal(result.summary.gemMilestoneProgress, 25 / 500);
});

test('maker milestones have a canonical level identity independent of notebook or project aliases', async () => {
  const { store } = setup();
  const milestone = createRewardFact({ owner, kind: 'maker.milestone', level: 3, occurredAt: at });
  assert.equal(milestone.sourceId, 'level:3');
  assert.throws(() => validateRewardFact({ ...milestone, sourceId: 'another-project' }));
  assert.throws(() => validateRewardFact({ ...milestone, level: 5 }));
  await store.project(owner, [milestone]);
  await store.project(owner, [createRewardFact({ owner, kind: 'maker.milestone', level: 3, occurredAt: '2026-11-20T14:00:00.000Z' })]);
  assert.equal((await store.summary(owner)).lifetimeGems, 20);
});

test('retained reward receipts remain complete after the rolling source attempts have disappeared', async () => {
  const { store } = setup();
  await store.project(owner, Array.from({ length: 160 }, (_, i) => fact(`attempt-${i}`)));
  const before = await store.summary(owner), backup = await store.export();
  assert.equal(before.practiceCount, 160); assert.equal(before.lifetimeGems, 390);
  assert.equal(before.recentGrants.length, 12);
  await store.project(owner, [fact('attempt-0')]);
  assert.deepEqual(await store.export(), backup);
});

test('corrupt persisted data is preserved for recovery and cannot be silently replaced by a new award', async () => {
  const { memory, store } = setup();
  const corrupted = { schema: 'jems.rewards.workspace.v999', profiles: [{ owner, gems: 999999 }] };
  memory.values.set('family', clone(corrupted));
  await assert.rejects(store.summary(owner), /unsupported or damaged/);
  await assert.rejects(store.project(owner, [fact('new')]), /unsupported or damaged/);
  assert.deepEqual(memory.values.get('family'), corrupted);
  assert.deepEqual(await store.recovery(), { namespace: 'family', raw: corrupted });
});

test('malformed or foreign backup content cannot replace a valid ledger', async () => {
  const { store } = setup(); await store.project(owner, [fact('kept')]); const before = await store.export();
  const mutations: ((snapshot: any) => void)[] = [
    snapshot => { snapshot.namespace = 'another-family'; },
    snapshot => { snapshot.data.profiles[0].receipts[0].amount = 999; },
    snapshot => { snapshot.data.profiles[0].receipts[0].id = 'arbitrary'; },
    snapshot => { snapshot.data.profiles[0].receipts.push(clone(snapshot.data.profiles[0].receipts[0])); },
    snapshot => { snapshot.data.profiles[0].receipts[0].fact.owner = 'player2'; },
    snapshot => { snapshot.data.profiles[0].receipts[0].fact.answer = 'secret raw answer'; },
    snapshot => { snapshot.data.profiles[0].receipts.push({ type: 'practice', id: 'practice.milestone:10', goal: 10, policyVersion: 1, amount: 10, occurredAt: at }); },
    snapshot => { snapshot.data.profiles.push({ owner: 'foreign-player', receipts: [] }); },
  ];
  for (const mutate of mutations) {
    const invalid = clone(before); mutate(invalid);
    await assert.rejects(store.restore(invalid, { mode: 'replace', allowedOwners: [owner] }));
    assert.deepEqual(await store.export(), before);
  }
});

test('a backup missing an earned practice receipt is rejected rather than silently changing totals', async () => {
  const { store } = setup(); await store.project(owner, Array.from({ length: 10 }, (_, i) => fact(`p-${i}`)));
  const before = await store.export(), invalid = clone(before);
  invalid.data.profiles[0].receipts = invalid.data.profiles[0].receipts.filter(receipt => receipt.type !== 'practice');
  assert.throws(() => validateRewardsWorkspace(invalid.data));
  await assert.rejects(store.restore(invalid, { mode: 'replace', allowedOwners: [owner] }));
  assert.deepEqual(await store.export(), before);
});

test('backup restore is atomic under write failure and explicit replacement can recover corrupt storage', async () => {
  const left = setup(), right = setup();
  await left.store.project(owner, [fact('old')]); await right.store.project(owner, [fact('new', 'game.developed')]);
  const before = await left.store.export(), incoming = await right.store.export();
  left.memory.failWrites = true;
  await assert.rejects(left.store.restore(incoming, { mode: 'replace', allowedOwners: [owner] }), /write unavailable/);
  left.memory.failWrites = false; assert.deepEqual(await left.store.export(), before);
  left.memory.values.set('family', { invalid: true });
  await left.store.restore(incoming, { mode: 'replace', allowedOwners: [owner] });
  assert.equal((await left.store.summary(owner)).lifetimeGems, 25); assert.equal(await left.store.recovery(), null);
});

test('merging distinct backups unions stable facts and grants newly reached aggregate milestones once', async () => {
  const left = setup(), right = setup();
  await left.store.project(owner, Array.from({ length: 6 }, (_, i) => fact(`left-${i}`)));
  await right.store.project(owner, Array.from({ length: 6 }, (_, i) => fact(`right-${i}`)));
  const incoming = await right.store.export();
  assert.equal(await left.store.restore(incoming, { mode: 'merge', allowedOwners: [owner] }), undefined);
  const merged = await left.store.export(), summary = await left.store.summary(owner);
  assert.equal(summary.practiceCount, 12); assert.equal(summary.lifetimeGems, 34);
  await left.store.restore(incoming, { mode: 'merge', allowedOwners: [owner] });
  assert.deepEqual(await left.store.export(), merged);
});

test('explicit replace restores the selected history instead of mixing it with later awards', async () => {
  const { store } = setup(); await store.project(owner, [fact('old')]); const backup = await store.export();
  await store.project(owner, [fact('later', 'game.developed')]);
  await store.restore(backup, { mode: 'replace', allowedOwners: [owner] });
  assert.equal((await store.summary(owner)).lifetimeGems, 2);
  assert.deepEqual((await store.project(owner, [fact('old')])).newlyGranted, []);
});

test('profile erasure removes that owner while preserving another profile and namespace', async () => {
  const { store, memory } = setup(), another = new RewardsStore('other-family', memory);
  await store.project(owner, [fact('one')]); await store.project('player2', [fact('two', 'math.completed', 'player2')]);
  await another.project(owner, [fact('three')]); await store.removeOwner(owner);
  assert.equal((await store.summary(owner)).lifetimeGems, 0);
  assert.equal((await store.summary('player2')).lifetimeGems, 2);
  assert.equal((await another.summary(owner)).lifetimeGems, 2);
  await store.removeOwner(owner); assert.equal((await store.export()).data.profiles.length, 1);
});

test('read failures do not fabricate an empty account, and returned snapshots cannot mutate storage', async () => {
  const { store, memory } = setup(); await store.project(owner, [fact('one')]); const before = await store.export();
  const summary = await store.summary(owner); summary.recentGrants[0].amount = 999;
  const exported = await store.export(); exported.data.profiles[0].receipts.length = 0;
  assert.deepEqual(await store.export(), before);
  memory.failReads = true; await assert.rejects(store.summary(owner), /read unavailable/);
  memory.failReads = false; assert.equal((await store.summary(owner)).lifetimeGems, 2);
});

test('fact schemas reject unknown data, unsafe identities, noncanonical dates and invalid levels', () => {
  const valid = fact('a');
  for (const value of [null, [], { ...valid, owner: '__proto__' }, { ...valid, sourceId: 'answer with spaces' },
    { ...valid, occurredAt: 'yesterday' }, { ...valid, occurredAt: '2026-11-19' }, { ...valid, level: 1 },
    { ...valid, transcript: 'private text' }, { ...valid, kind: 'window.event' }, { ...valid, policyVersion: 0 }]) {
    assert.throws(() => validateRewardFact(value));
  }
  assert.throws(() => createRewardFact({ owner, kind: 'math.completed', sourceId: 'a', occurredAt: NaN }));
});

test('maintenance snapshots preserve a corrupt ledger exactly through successful recovery then rollback', async () => {
  const { store, memory } = setup();
  const original = { schema: 'unknown-future-format', note: 'preserve this original', detail: new Uint8Array([3, 4, 5]) };
  memory.values.set('family', clone(original));
  const snapshot = await store.snapshotRawForRecovery();
  assert.deepEqual(snapshot, { namespace: 'family', raw: original });
  const replacement = setup(); await replacement.store.project(owner, [fact('replacement', 'game.developed')]);
  await store.restore(await replacement.store.export(), { mode: 'replace', allowedOwners: [owner] });
  assert.equal((await store.summary(owner)).lifetimeGems, 25);
  await store.restoreRawRecovery(snapshot);
  assert.deepEqual(memory.values.get('family'), original);
  await assert.rejects(store.summary(owner), /unsupported or damaged/);
  assert.deepEqual(await store.recovery(), { namespace: 'family', raw: original });
});

test('maintenance rollback rejects foreign/incomplete snapshots and aborted writes preserve the current ledger', async () => {
  const { store, memory } = setup(); await store.project(owner, [fact('original')]);
  const snapshot = await store.snapshotRawForRecovery();
  await store.project(owner, [fact('newer')]); const before = await store.export();
  for (const invalid of [null, { namespace: 'foreign', raw: null }, { namespace: 'family' },
    { namespace: 'family', raw: undefined }, { namespace: 'family', raw: null, extra: true }]) {
    await assert.rejects(store.restoreRawRecovery(invalid as any), /recovery snapshot/);
    assert.deepEqual(await store.export(), before);
  }
  memory.failWrites = true; await assert.rejects(store.restoreRawRecovery(snapshot), /write unavailable/);
  memory.failWrites = false; assert.deepEqual(await store.export(), before);
  await store.restoreRawRecovery(snapshot); assert.equal((await store.summary(owner)).lifetimeGems, 2);
  assert.deepEqual((await store.project(owner, [fact('original')])).newlyGranted, []);
});

test('maintenance rollback preserves an originally absent namespace and captures detached snapshots', async () => {
  const { store, memory } = setup(), empty = await store.snapshotRawForRecovery();
  assert.deepEqual(empty, { namespace: 'family', raw: null });
  await store.project(owner, [fact('one')]);
  const captured = await store.snapshotRawForRecovery();
  (captured.raw as RewardsWorkspace).profiles[0].receipts.length = 0;
  assert.equal((await store.summary(owner)).lifetimeGems, 2);
  await store.restoreRawRecovery(empty);
  assert.equal(memory.values.get('family'), null); assert.equal((await store.summary(owner)).lifetimeGems, 0);
});
