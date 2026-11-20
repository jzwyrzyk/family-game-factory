/** Shared reward receipts → trusted companion snapshot → durable Pal progress. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { palSnapshotFromRewards } from '../src/pals/service';
import { PalsStore, PALS_DB_NAME, type PalsPersistence } from '../src/pals/store';
import {
  createRewardFact, rewardFactId,
  type MakerRewardLevel, type RewardActivityKind, type RewardFact, type RewardsBackup,
} from '../src/rewards/model';
import { RewardsStore, REWARDS_DB_NAME, type RewardsPersistence, type RewardsTransaction } from '../src/rewards/store';

const OWNER = 'child-one', OTHER = 'child-two';
const TIME = Date.parse('2026-11-19T15:00:00.000Z');
const at = (offset: number) => new Date(TIME + offset).toISOString();
const activity = (kind: RewardActivityKind, sourceId: string, offset = 100, owner = OWNER) =>
  createRewardFact({ kind, sourceId, owner, occurredAt: at(offset) });
const maker = (level: MakerRewardLevel, offset = 100) =>
  createRewardFact({ kind: 'maker.milestone', level, owner: OWNER, occurredAt: at(offset) });
const learning = (count: number) => Array.from({ length: count }, (_, index) =>
  activity((['math.completed', 'language.completed', 'language.explored'] as const)[index % 3], `practice-${index}`, index + 100));

class AtomicMemory implements RewardsPersistence, PalsPersistence {
  private data = new Map<string, unknown>();
  private queue: Promise<unknown> = Promise.resolve();
  async read(namespace: string): Promise<unknown | null> { return structuredClone(this.data.get(namespace) ?? null); }
  update<T>(namespace: string, mutate: (current: unknown | null) => RewardsTransaction<T>): Promise<T> {
    const pending = this.queue.catch(() => {}).then(() => {
      const transaction = mutate(structuredClone(this.data.get(namespace) ?? null));
      this.data.set(namespace, structuredClone(transaction.next));
      return transaction.result;
    });
    this.queue = pending.catch(() => {});
    return pending;
  }
}

function fixture() {
  const persistence = new AtomicMemory();
  let now = TIME;
  const rewards = new RewardsStore(REWARDS_DB_NAME, persistence);
  const pals = new PalsStore(PALS_DB_NAME, persistence, () => now);
  return {
    persistence, rewards, pals, clock: (offset: number) => { now = TIME + offset; },
    snapshot: async (owner = OWNER) => palSnapshotFromRewards(await rewards.export(), owner),
  };
}

test('the bridge maps all five eligible activity kinds and exposes only their stable identities and times', async () => {
  const { rewards, snapshot } = fixture();
  const facts = (['math.completed', 'language.completed', 'language.explored', 'scene.challenge', 'game.developed'] as const)
    .map((kind, index) => activity(kind, 'shared-source', 100 + index));
  await rewards.project(OWNER, [...facts, maker(1), maker(4)]);
  const backup = await rewards.export(), original = structuredClone(backup);
  const projected = palSnapshotFromRewards(backup, OWNER);
  assert.deepEqual(projected, {
    owner: OWNER, lifetimeGems: 84,
    activities: facts.map(fact => ({ id: rewardFactId(fact), kind: fact.kind, occurredAt: fact.occurredAt })),
  });
  assert.deepEqual(backup, original, 'reading the bridge must not rewrite the rewards export');
  projected.activities[0].occurredAt = at(9000);
  projected.activities.pop();
  assert.deepEqual(await snapshot(), palSnapshotFromRewards(original, OWNER), 'the result must not alias the rewards ledger');
});

test('practice and maker bonuses count toward gem unlocks without creating extra adventures', async () => {
  const { rewards, pals, snapshot } = fixture();
  await pals.chooseStarter(OWNER, 'glim', await snapshot());
  await rewards.project(OWNER, [
    ...learning(10), activity('scene.challenge', 'scene'), activity('game.developed', 'project'),
    ...([1, 2, 3, 4] as const).map(level => maker(level)),
  ]);
  const backup = await rewards.export(), receipts = backup.data.profiles[0].receipts;
  assert.equal(receipts.length, 17, 'sixteen source facts plus the ten-practice bonus');
  assert.equal(receipts.filter(receipt => receipt.type === 'practice').length, 1);
  const projected = palSnapshotFromRewards(backup, OWNER);
  assert.equal(projected.lifetimeGems, 138);
  assert.equal(projected.activities.length, 12);
  assert.ok(projected.activities.every(row => !row.id.startsWith('practice.milestone:') && !row.id.startsWith('maker.milestone:')));
  const result = await pals.sync(OWNER, projected), glim = result.profile.owned[0];
  assert.equal(glim.practiceActivities, 10);
  assert.equal(glim.creationAdventures, 2);
  assert.equal(glim.adventures, 4);
  assert.equal(glim.stage, 1, 'bonuses must not cause a premature Grown form');
  assert.deepEqual(result.profile.availableIds, ['kip'], 'the same lifetime gem total still unlocks the other starter');
});

test('the bridge selects one owner, treats an absent valid owner as empty, and cannot cross-project into another Pal profile', async () => {
  const { rewards, pals, snapshot } = fixture();
  await pals.chooseStarter(OWNER, 'glim', await snapshot());
  await pals.chooseStarter(OTHER, 'kip', await snapshot(OTHER));
  await rewards.project(OWNER, [activity('scene.challenge', 'same-scene', 100)]);
  await rewards.project(OTHER, [activity('scene.challenge', 'same-scene', 200, OTHER), activity('game.developed', 'other-project', 210, OTHER)]);
  const first = await snapshot(), other = await snapshot(OTHER);
  assert.equal(first.owner, OWNER); assert.equal(first.lifetimeGems, 8); assert.equal(first.activities.length, 1);
  assert.equal(other.owner, OTHER); assert.equal(other.lifetimeGems, 33); assert.equal(other.activities.length, 2);
  assert.equal(first.activities[0].id, other.activities[0].id, 'semantic IDs are scoped by owner');
  assert.equal(first.activities[0].occurredAt, at(100)); assert.equal(other.activities[0].occurredAt, at(200));
  assert.deepEqual(await snapshot('child-without-receipts'), { owner: 'child-without-receipts', lifetimeGems: 0, activities: [] });
  await pals.sync(OWNER, first); await pals.sync(OTHER, other);
  assert.equal((await pals.view(OWNER)).owned[0].adventures, 1);
  assert.equal((await pals.view(OTHER)).owned[0].adventures, 2);
  const before = await pals.export();
  await assert.rejects(pals.sync(OWNER, other), /damaged/);
  assert.deepEqual(await pals.export(), before);
});

test('the bridge rejects corrupt, unsupported, duplicate and foreign-owner receipts before projecting any profile', async () => {
  const { rewards } = fixture();
  await rewards.project(OWNER, [activity('scene.challenge', 'scene')]);
  await rewards.project(OTHER, [activity('game.developed', 'other-project', 100, OTHER)]);
  const valid = await rewards.export();
  // These deliberately invalid values model an untrusted import, not a typed source adapter.
  const corruptions: [string, (backup: any) => void][] = [
    ['unsupported envelope', backup => { backup.schema = 'jems.rewards.backup.v2'; }],
    ['forged amount', backup => { backup.data.profiles[0].receipts[0].amount = 999; }],
    ['mismatched identity', backup => { backup.data.profiles[0].receipts[0].id = 'scene.challenge:another-scene'; }],
    ['duplicate receipt', backup => { backup.data.profiles[0].receipts.push(structuredClone(backup.data.profiles[0].receipts[0])); }],
    ['unsupported kind', backup => { backup.data.profiles[0].receipts[0].fact.kind = 'game.score'; }],
    ['unsupported policy', backup => { backup.data.profiles[0].receipts[0].fact.policyVersion = 2; }],
    ['foreign fact owner', backup => { backup.data.profiles[0].receipts[0].fact.owner = OTHER; }],
    ['unearned practice bonus', backup => { backup.data.profiles[0].receipts.push({
      type: 'practice', id: 'practice.milestone:10', goal: 10, policyVersion: 1, amount: 10, occurredAt: at(100),
    }); }],
    ['corruption in another owner', backup => { backup.data.profiles[1].receipts[0].amount = 999; }],
  ];
  assert.throws(() => palSnapshotFromRewards(null, OWNER), /unsupported or damaged/);
  for (const [label, corrupt] of corruptions) {
    const damaged: RewardsBackup = structuredClone(valid); corrupt(damaged);
    assert.throws(() => palSnapshotFromRewards(damaged, OWNER), /unsupported or damaged/, label);
  }
  assert.deepEqual(await rewards.export(), valid, 'failed bridge validation must not modify durable gems');
});

test('historical receipt baselines and repeated reward projection remain stable through Pal reloads', async () => {
  const { persistence, rewards, pals, snapshot } = fixture();
  await rewards.project(OWNER, [activity('game.developed', 'before-starter', -100)]);
  await pals.chooseStarter(OWNER, 'kip', await snapshot());
  assert.equal((await pals.view(OWNER)).owned[0].adventures, 0);
  const facts: RewardFact[] = [...learning(10), activity('scene.challenge', 'scene'), activity('game.developed', 'new-project')];
  await rewards.project(OWNER, facts);
  const first = await snapshot();
  await pals.sync(OWNER, first);
  const saved = await pals.export();
  assert.equal((await pals.view(OWNER)).owned[0].adventures, 4);
  assert.equal(saved.data.profiles[0].assignments.length, 13);
  assert.equal(saved.data.profiles[0].assignments.filter(row => row.palId === null).length, 1);
  assert.deepEqual((await rewards.project(OWNER, facts)).newlyGranted, []);
  assert.deepEqual((await rewards.project(OWNER, facts.map(fact => ({ ...fact, occurredAt: at(9000) })))).newlyGranted, []);
  assert.deepEqual(await snapshot(), first, 'source retries keep the original committed occurrence time');
  for (const store of [pals, new PalsStore(PALS_DB_NAME, persistence, () => TIME + 10_000)]) {
    const repeated = await store.sync(OWNER, await snapshot());
    assert.equal(repeated.profile.owned[0].adventures, 4);
    assert.deepEqual(repeated.growth, []);
    assert.deepEqual(await store.export(), saved);
  }
});

test('late committed reward receipts use the Pal selected at activity time even after another switch', async () => {
  const { rewards, pals, snapshot, clock } = fixture();
  await rewards.project(OWNER, ([1, 2, 3, 4] as const).map(level => maker(level, -100)));
  await pals.chooseStarter(OWNER, 'glim', await snapshot());
  await pals.collect(OWNER, 'kip', await snapshot());
  clock(200); await pals.equip(OWNER, 'kip', await snapshot());
  clock(400); await pals.equip(OWNER, 'glim', await snapshot());
  await rewards.project(OWNER, [activity('scene.challenge', 'while-glim', 100), activity('game.developed', 'while-kip', 300)]);
  const result = await pals.sync(OWNER, await snapshot());
  assert.equal(result.profile.activeId, 'glim');
  assert.equal(result.profile.owned.find(pal => pal.id === 'glim')!.adventures, 1);
  assert.equal(result.profile.owned.find(pal => pal.id === 'kip')!.adventures, 1);
  const assignments = (await pals.export()).data.profiles[0].assignments;
  assert.deepEqual(assignments.map(row => ({ id: row.id, palId: row.palId })), [
    { id: 'scene.challenge:while-glim', palId: 'glim' },
    { id: 'game.developed:while-kip', palId: 'kip' },
  ]);
});
