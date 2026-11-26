import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyFamilyRewardBackup, validateFamilyRewardBackup, recoverRewardBackupJournal,
  REWARD_BACKUP_JOURNAL_KEY, REWARD_SOURCE_KEYS, type BackupStorage,
} from '../src/rewards/backup';
import { createRewardFact } from '../src/rewards/model';
import { RewardsStore, REWARDS_DB_NAME, type RewardsPersistence, type RewardsTransaction } from '../src/rewards/store';
import { PalsStore, PALS_DB_NAME, type PalsPersistence } from '../src/pals/store';
import { palSnapshotFromRewards } from '../src/pals/service';

/** Faults are injected at the persistence boundary, after validation. */
class MemoryDatabase implements RewardsPersistence, PalsPersistence {
  values = new Map<string, unknown>();
  failNext = new Set<string>();
  async read(namespace: string) { return structuredClone(this.values.get(namespace) ?? null); }
  async update<T>(namespace: string, mutate: (current: unknown | null) => RewardsTransaction<T>): Promise<T> {
    const change = mutate(await this.read(namespace));
    if (this.failNext.delete(namespace)) throw Error('simulated database write failure');
    this.values.set(namespace, structuredClone(change.next)); return change.result;
  }
}
class MemoryStorage implements BackupStorage {
  values = new Map<string, string>();
  failNext = new Set<string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) {
    if (this.failNext.delete(key)) throw Error('simulated storage quota');
    this.values.set(key, value);
  }
  removeItem(key: string) { this.values.delete(key); }
}
const owner = 'player1', base = { version: 1, profiles: [{ id: owner }], activeProfile: owner };
const time = Date.parse('2026-11-19T16:00:00.000Z');
const validateBase = (raw: string) => JSON.parse(raw);
async function fixture() {
  const database = new MemoryDatabase(), storage = new MemoryStorage();
  const rewards = new RewardsStore(REWARDS_DB_NAME, database), pals = new PalsStore(PALS_DB_NAME, database, () => time);
  await pals.chooseStarter(owner, 'navi', { owner, lifetimeGems: 0, activities: [] });
  await rewards.project(owner, [createRewardFact({ owner, kind: 'game.developed', sourceId: 'original-game', occurredAt: time + 100 })]);
  await pals.sync(owner, palSnapshotFromRewards(await rewards.export(), owner));
  await pals.setPreferences(owner, { encouragement: false });
  for (const key of REWARD_SOURCE_KEYS) storage.setItem(key, `original bytes for ${key}`);
  return { database, storage, rewards, pals };
}
function sourceValues(storage: MemoryStorage) { return REWARD_SOURCE_KEYS.map(key => storage.getItem(key)); }

test('a complete family backup carries Pal history/settings once and validates owners before writes', async () => {
  const { database, rewards, pals } = await fixture();
  const input = { ...base, factoryRewards: await rewards.export(), factoryPals: await pals.export() };
  const plan = validateFamilyRewardBackup(JSON.stringify(input), validateBase, rewards, pals);
  assert.deepEqual(plan.pals, input.factoryPals);
  assert.equal(Object.hasOwn(plan.base, 'factoryPals'), false);
  assert.equal(Object.hasOwn(plan.base, 'factoryRewards'), false);
  const prior = structuredClone(database.values);
  const foreign = structuredClone(input);
  foreign.factoryPals.data.profiles[0].owner = 'outside-family';
  assert.throws(() => validateFamilyRewardBackup(JSON.stringify(foreign), validateBase, rewards, pals), /outside this family/);
  foreign.factoryPals.namespace = `${PALS_DB_NAME}:other`;
  assert.throws(() => validateFamilyRewardBackup(JSON.stringify(foreign), validateBase, rewards, pals), /workspace|unsupported|damaged/i);
  assert.throws(() => validateFamilyRewardBackup(JSON.stringify({ ...input, factoryPalsRecovery: {} }), validateBase, rewards, pals), /recovery/);
  assert.deepEqual(database.values, prior);
});

test('explicit replacement restores gems, Pal ownership/growth and preferences together', async () => {
  const source = await fixture(), destination = await fixture();
  await source.pals.setPreferences(owner, { showCompanion: false });
  const backup = { ...base, factoryRewards: await source.rewards.export(), factoryPals: await source.pals.export() };
  const plan = validateFamilyRewardBackup(JSON.stringify(backup), validateBase, destination.rewards, destination.pals);
  await applyFamilyRewardBackup(plan, destination.storage, destination.rewards, 'restore', destination.pals);
  assert.deepEqual(await destination.rewards.export(), backup.factoryRewards);
  assert.deepEqual(await destination.pals.export(), backup.factoryPals);
  assert.equal((await destination.pals.view(owner)).owned[0].adventures, 1);
  assert.equal(JSON.parse(destination.storage.getItem(REWARD_BACKUP_JOURNAL_KEY)!).phase, 'committed');
  assert.equal(await recoverRewardBackupJournal(destination.storage, destination.rewards, destination.pals), 'cleaned');
  assert.equal(destination.storage.getItem(REWARD_BACKUP_JOURNAL_KEY), null);
});

test('legacy replacement and reset clear missing Pal history alongside the replaced reward ledger', async () => {
  for (const operation of ['restore', 'reset'] as const) {
    const { storage, rewards, pals } = await fixture();
    const plan = validateFamilyRewardBackup(JSON.stringify(base), validateBase, rewards, pals);
    await applyFamilyRewardBackup(plan, storage, rewards, operation, pals);
    assert.equal((await rewards.summary(owner)).lifetimeGems, 0);
    assert.equal((await pals.view(owner)).starterId, null);
    assert.deepEqual((await pals.export()).data.profiles, []);
    assert.equal(JSON.parse(storage.getItem(REWARD_BACKUP_JOURNAL_KEY)!).operation, operation);
  }
});

test('a Pal database write failure rolls back previously replaced rewards and every source byte', async () => {
  const { database, storage, rewards, pals } = await fixture();
  const priorDatabase = structuredClone(database.values), priorSources = sourceValues(storage);
  const plan = validateFamilyRewardBackup(JSON.stringify(base), validateBase, rewards, pals);
  database.failNext.add(PALS_DB_NAME);
  await assert.rejects(applyFamilyRewardBackup(plan, storage, rewards, 'restore', pals), /original progress was restored/);
  assert.deepEqual(database.values, priorDatabase); assert.deepEqual(sourceValues(storage), priorSources);
  assert.equal(JSON.parse(storage.getItem(REWARD_BACKUP_JOURNAL_KEY)!).phase, 'rolled-back');
  assert.equal(await recoverRewardBackupJournal(storage, rewards, pals), 'cleaned');
});

test('rollback preserves even damaged prior Pal data without interpreting it as a backup', async () => {
  const { database, storage, rewards, pals } = await fixture();
  const raw = { schema: 'unknown-future-pals', nested: { keep: ['these', 'bytes'] }, broken: true };
  database.values.set(PALS_DB_NAME, raw);
  const priorSources = sourceValues(storage), priorRewards = await rewards.export();
  const plan = validateFamilyRewardBackup(JSON.stringify(base), validateBase, rewards, pals);
  database.failNext.add(REWARDS_DB_NAME);
  await assert.rejects(applyFamilyRewardBackup(plan, storage, rewards, 'restore', pals), /original progress was restored/);
  assert.deepEqual(database.values.get(PALS_DB_NAME), raw);
  assert.deepEqual(await rewards.export(), priorRewards); assert.deepEqual(sourceValues(storage), priorSources);
  assert.deepEqual((await pals.recovery())?.raw, raw);
});

test('failure to save the journal changes nothing; a later source failure restores everything', async () => {
  for (const failingKey of [REWARD_BACKUP_JOURNAL_KEY, REWARD_SOURCE_KEYS[2]]) {
    const { database, storage, rewards, pals } = await fixture();
    const priorDatabase = structuredClone(database.values), priorSources = sourceValues(storage);
    const plan = validateFamilyRewardBackup(JSON.stringify(base), validateBase, rewards, pals);
    storage.failNext.add(failingKey);
    await assert.rejects(applyFamilyRewardBackup(plan, storage, rewards, 'restore', pals), /Nothing was replaced|original progress was restored/);
    assert.deepEqual(database.values, priorDatabase); assert.deepEqual(sourceValues(storage), priorSources);
  }
});

test('crash recovery restores both databases and sources before allowing new progress', async () => {
  const { database, storage, rewards, pals } = await fixture();
  const priorDatabase = structuredClone(database.values), priorSources = sourceValues(storage);
  const journal = {
    schema: 'jems.reward.backup.journal.v1', phase: 'pending', operation: 'restore',
    sources: Object.fromEntries(REWARD_SOURCE_KEYS.map(key => [key, storage.getItem(key)])),
    rewards: await rewards.snapshotRawForRecovery(), pals: await pals.snapshotRawForRecovery(),
  };
  storage.setItem(REWARD_BACKUP_JOURNAL_KEY, JSON.stringify(journal));
  database.values.set(REWARDS_DB_NAME, null); database.values.set(PALS_DB_NAME, null);
  for (const key of REWARD_SOURCE_KEYS) storage.setItem(key, 'partial replacement');
  assert.equal(await recoverRewardBackupJournal(storage, rewards, pals), 'reload');
  assert.deepEqual(database.values, priorDatabase); assert.deepEqual(sourceValues(storage), priorSources);
  assert.equal(await recoverRewardBackupJournal(storage, rewards, pals), 'cleaned');
  assert.equal(await recoverRewardBackupJournal(storage, rewards, pals), 'none');
});

test('recovering an older rewards-only journal leaves existing Pal history untouched', async () => {
  const { storage, rewards, pals } = await fixture();
  const priorPals = await pals.export();
  storage.setItem(REWARD_BACKUP_JOURNAL_KEY, JSON.stringify({
    schema: 'jems.reward.backup.journal.v1', phase: 'pending', operation: 'restore',
    sources: Object.fromEntries(REWARD_SOURCE_KEYS.map(key => [key, storage.getItem(key)])),
    rewards: { namespace: REWARDS_DB_NAME, raw: null },
  }));
  assert.equal(await recoverRewardBackupJournal(storage, rewards, pals), 'reload');
  assert.deepEqual(await pals.export(), priorPals);
  assert.equal((await rewards.summary(owner)).lifetimeGems, 0);
});

test('unpreservable prior Pal values and foreign recovery namespaces fail before writes', async () => {
  const { database, storage, rewards, pals } = await fixture();
  database.values.set(PALS_DB_NAME, { lostByJSON: new Map([['a', 1]]) });
  const priorSources = sourceValues(storage), priorRewards = await rewards.export();
  const plan = validateFamilyRewardBackup(JSON.stringify(base), validateBase, rewards, pals);
  await assert.rejects(applyFamilyRewardBackup(plan, storage, rewards, 'restore', pals), /recovery/);
  assert.equal(storage.getItem(REWARD_BACKUP_JOURNAL_KEY), null);
  assert.deepEqual(sourceValues(storage), priorSources); assert.deepEqual(await rewards.export(), priorRewards);
  storage.setItem(REWARD_BACKUP_JOURNAL_KEY, JSON.stringify({
    schema: 'jems.reward.backup.journal.v1', phase: 'pending', operation: 'restore',
    sources: Object.fromEntries(REWARD_SOURCE_KEYS.map(key => [key, storage.getItem(key)])),
    rewards: { namespace: REWARDS_DB_NAME, raw: null }, pals: { namespace: `${PALS_DB_NAME}:foreign`, raw: null },
  }));
  await assert.rejects(recoverRewardBackupJournal(storage, rewards, pals), /unsupported/);
  assert.deepEqual(sourceValues(storage), priorSources); assert.deepEqual(await rewards.export(), priorRewards);
});
