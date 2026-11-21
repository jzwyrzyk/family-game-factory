import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PAL_CATALOG, palDefinition, palLine, palArtworkPath, palSceneAssetId, type PalId, type PalLineKind } from '../src/pals/catalog';
import {
  copyPals, emptyPalsWorkspace, validatePalRewardSnapshot, validatePalsWorkspace,
  type PalActivity, type PalRewardSnapshot,
} from '../src/pals/model';
import { PalsStore, PALS_DB_NAME, type PalsPersistence, type PalsTransaction } from '../src/pals/store';

class MemoryPersistence implements PalsPersistence {
  values = new Map<string, unknown>(); fail = false; queue: Promise<unknown> = Promise.resolve();
  async read(namespace: string): Promise<unknown | null> { return copyPals(this.values.get(namespace) ?? null); }
  update<T>(namespace: string, mutate: (current: unknown | null) => PalsTransaction<T>): Promise<T> {
    const task = this.queue.catch(() => {}).then(() => {
      const update = mutate(copyPals(this.values.get(namespace) ?? null));
      if (this.fail) throw Error('quota');
      this.values.set(namespace, copyPals(update.next)); return update.result;
    });
    this.queue = task.catch(() => {}); return task;
  }
}
const owner = 'child-one';
const instant = Date.parse('2026-11-19T15:00:00.000Z');
const time = (offset = 0) => new Date(instant + offset).toISOString();
const activity = (id: string, kind: PalActivity['kind'] = 'math.completed', offset = 100): PalActivity => ({ id, kind, occurredAt: time(offset) });
const snapshot = (activities: PalActivity[] = [], lifetimeGems = 0, profile = owner): PalRewardSnapshot => ({ owner: profile, lifetimeGems, activities });
function fixture() {
  const persistence = new MemoryPersistence(); let clock = instant;
  const store = new PalsStore(PALS_DB_NAME, persistence, () => clock);
  return { persistence, store, clock: (offset: number) => { clock = instant + offset; } };
}
const owned = (view: Awaited<ReturnType<PalsStore['view']>>, id: PalId = 'glim') => view.owned.find(pal => pal.id === id)!;

test('approved roster has real two-form portraits, stable legacy identities and bounded reactions', () => {
  assert.equal(PAL_CATALOG.length, 24);
  assert.deepEqual(PAL_CATALOG.filter(pal => pal.starter).map(pal => [pal.id, pal.name]), [['glim', 'Luma'], ['kip', 'Nook']]);
  assert.equal(palDefinition('riff').name, 'Wink');
  assert.equal(new Set(PAL_CATALOG.map(pal => pal.artwork.characterKey)).size, PAL_CATALOG.length);
  for (const pal of PAL_CATALOG) {
    assert.ok(existsSync(resolve('public', pal.artPath)), `${pal.id} artwork exists`);
    assert.equal(pal.assetId, palSceneAssetId(pal.id, 'base'));
    assert.equal(pal.artwork.status, 'approved');
    assert.equal(pal.artPath, palArtworkPath(pal.id, 'base'));
    assert.notEqual(palArtworkPath(pal.id, 'base'), palArtworkPath(pal.id, 'mature'), `${pal.name} has a distinct approved Grown image`);
    assert.notEqual(palSceneAssetId(pal.id, 'base'), palSceneAssetId(pal.id, 'mature'));
    for (const form of ['base', 'mature'] as const) {
      assert.ok(existsSync(resolve('public', palArtworkPath(pal.id, form))));
      assert.doesNotMatch(palArtworkPath(pal.id, form), /jems-art\/gem_/);
    }
    for (const kind of ['welcome', 'practice', 'making', 'coding', 'growth', 'play', 'rest', 'retry'] as PalLineKind[]) {
      const first = palLine(pal.id, kind, 0), second = palLine(pal.id, kind, 1);
      assert.ok(first.length > 10 && first.length < 180); assert.notEqual(first, second);
      assert.equal(palLine(pal.id, kind, 'receipt-1'), palLine(pal.id, kind, 'receipt-1'));
      assert.doesNotMatch(first + second, /lonely|missed you|feed me|come back every day|streak/i);
    }
  }
  assert.throws(() => palDefinition('foreign'), /Choose a Pal/);
});

test('free starter persists without gems and the other starter is a deterministic collectible', async () => {
  const { store, persistence } = fixture();
  assert.equal((await store.view(owner)).starterId, null);
  const first = await store.chooseStarter(owner, 'glim', snapshot());
  assert.equal(first.profile.activeId, 'glim'); assert.equal(first.profile.owned.length, 1);
  assert.deepEqual(first.profile.availableIds, []);
  assert.equal(owned(await new PalsStore(PALS_DB_NAME, persistence).view(owner)).source, 'starter');
  await assert.rejects(store.chooseStarter(owner, 'kip', snapshot()), /already chose/);
  await assert.rejects(store.collect(owner, 'kip', snapshot([], 49)), /lifetime gems/);
  await assert.rejects(store.chooseStarter('child-two', 'riff', snapshot([], 0, 'child-two')), /Luma or Nook/);
  const ready = await store.sync(owner, snapshot([], 50));
  assert.deepEqual(ready.newlyAvailable, ['kip']);
  const second = await store.collect(owner, 'kip', snapshot([], 50));
  assert.equal(second.profile.owned.length, 2); assert.equal(second.profile.activeId, 'glim');
  assert.deepEqual((await store.sync(owner, snapshot([], 150))).newlyAvailable, ['riff']);
  await store.collect(owner, 'riff', snapshot([], 150));
  assert.equal((await store.collect(owner, 'riff', snapshot([], 150))).profile.owned.length, 3);
  assert.equal((await store.export()).data.profiles[0].owned.length, 3);
  assert.ok(!JSON.stringify(await store.export()).includes('lifetimeGems'), 'no duplicate currency counter');
});

test('the complete roster can be earned, equipped, grown and restored without spending gems', async () => {
  const { store, clock } = fixture();
  await store.chooseStarter(owner, 'glim', snapshot());
  const lifetimeGems = Math.max(...PAL_CATALOG.map(pal => pal.unlockGems));
  const funded = snapshot([], lifetimeGems);
  await store.sync(owner, funded);
  for (const pal of PAL_CATALOG.filter(pal => pal.id !== 'glim')) {
    await store.collect(owner, pal.id, funded);
  }
  assert.equal((await store.view(owner)).owned.length, PAL_CATALOG.length);
  assert.equal((await store.view(owner)).activeId, 'glim', 'welcoming a Pal does not equip it');
  clock(500);
  await store.equip(owner, 'navi', funded);
  const receipts = Array.from({ length: 5 }, (_, i) => activity(`navi-adventure-${i}`, 'scene.challenge', 600 + i));
  const grown = await store.sync(owner, snapshot(receipts, lifetimeGems));
  assert.equal(owned(grown.profile, 'navi').form, 'mature');
  assert.deepEqual(grown.growth, [{ palId: 'navi', from: 1, to: 2 }]);
  const backup = await store.export();
  const restored = new PalsStore(PALS_DB_NAME, new MemoryPersistence());
  await restored.restore(backup, { mode: 'replace', allowedOwners: [owner] });
  assert.deepEqual(await restored.export(), backup);
  const replayed = await restored.sync(owner, snapshot(receipts, lifetimeGems));
  assert.deepEqual(replayed.growth, []);
  assert.deepEqual(replayed.newlyAvailable, []);
  assert.equal(replayed.profile.activeId, 'navi');
  assert.equal(owned(replayed.profile, 'navi').adventures, 5);
  assert.ok(!JSON.stringify(backup).includes('lifetimeGems'));
});

test('learning adventures group five receipts, while one coding or making receipt is one adventure', async () => {
  const { store } = fixture(); await store.chooseStarter(owner, 'glim', snapshot());
  const learning = Array.from({ length: 24 }, (_, i) => activity(`math-${i}`, 'math.completed', i + 100));
  let view = (await store.sync(owner, snapshot(learning, 48))).profile;
  assert.equal(owned(view).adventures, 4); assert.equal(owned(view).stage, 1);
  assert.equal(owned(view).practiceToNextAdventure, 1); assert.equal(owned(view).adventuresToNext, 1);
  learning.push(activity('writing-25', 'language.explored', 200));
  let result = await store.sync(owner, snapshot(learning, 50));
  assert.deepEqual(result.growth, [{ palId: 'glim', from: 1, to: 2 }]);
  assert.equal(owned(result.profile).stageName, 'Grown');
  assert.equal(owned(result.profile).form, 'mature');
  const creation = Array.from({ length: 10 }, (_, i) => activity(`create-${i}`, i % 2 ? 'scene.challenge' : 'game.developed', i + 300));
  result = await store.sync(owner, snapshot([...learning, ...creation], 150));
  assert.equal(owned(result.profile).adventures, 15); assert.equal(owned(result.profile).stage, 2);
  assert.deepEqual(result.growth, [], 'there is no third form or second growth notice');
  assert.equal(owned(result.profile).nextStageAt, null); assert.equal(owned(result.profile).adventuresToNext, 0);
});

test('older receipt-only profiles keep earned growth through reload and backup without a new celebration', async () => {
  for (const adventures of [0, 4, 5, 14, 15, 25]) {
    const { store, persistence } = fixture();
    await store.chooseStarter(owner, 'glim', snapshot());
    const receipts = snapshot(Array.from({ length: adventures }, (_, index) => activity(`old-${index}`, 'scene.challenge', index + 100)), 150);
    await store.sync(owner, receipts);
    const saved = await store.export();
    assert.equal(saved.data.profiles[0].policyVersion, 1);
    assert.equal(Object.hasOwn(saved.data.profiles[0], 'stage'), false);
    const reloaded = new PalsStore(PALS_DB_NAME, persistence);
    const projected = await reloaded.sync(owner, receipts);
    assert.deepEqual(projected.growth, [], 'loading earned history is not a new growth event');
    assert.deepEqual(await reloaded.export(), saved, 'the v1 receipt and inventory bytes remain unchanged');
    const pal = owned(projected.profile);
    assert.equal(pal.adventures, adventures);
    assert.equal(pal.form, adventures >= 5 ? 'mature' : 'base');
    assert.equal(pal.stageName, adventures >= 5 ? 'Grown' : 'Base');
    assert.equal(pal.nextStageAt, adventures >= 5 ? null : 5);
    await reloaded.restore(saved, { mode: 'replace', allowedOwners: [owner] });
    assert.deepEqual((await reloaded.sync(owner, receipts)).growth, []);
    assert.deepEqual(await reloaded.export(), saved);
  }
});

test('duplicate projection, retry, reload and removed source detail cannot multiply or erase growth', async () => {
  const { store, persistence } = fixture(); await store.chooseStarter(owner, 'kip', snapshot());
  const completed = snapshot([activity('kept-game', 'game.developed')], 25);
  await store.sync(owner, completed); const before = await store.export();
  for (const existing of [store, new PalsStore(PALS_DB_NAME, persistence)]) {
    const repeated = await existing.sync(owner, completed);
    assert.equal(owned(repeated.profile, 'kip').adventures, 1); assert.deepEqual(repeated.growth, []);
    assert.deepEqual(await existing.export(), before);
  }
  assert.equal(owned((await store.sync(owner, snapshot([], 0))).profile, 'kip').adventures, 1);
});

test('old receipts including unusual future timestamps are baselined before choosing a starter', async () => {
  const { store } = fixture();
  const old = snapshot([activity('old-game', 'game.developed', -1000), activity('old-clock', 'scene.challenge', 100_000)], 150);
  const chosen = await store.chooseStarter(owner, 'glim', old);
  assert.equal(owned(chosen.profile).adventures, 0); assert.deepEqual(chosen.profile.availableIds, ['kip', 'riff']);
  const delayedOld = activity('late-old', 'scene.challenge', -1);
  const next = await store.sync(owner, snapshot([...old.activities, delayedOld, activity('new', 'scene.challenge')], 158));
  assert.equal(owned(next.profile).adventures, 1);
  assert.equal((await store.export()).data.profiles[0].assignments.filter(row => row.palId === null).length, 3);
});

test('delayed work belongs to the Pal active at its occurrence, including after re-equipping', async () => {
  const { store, clock } = fixture(); await store.chooseStarter(owner, 'glim', snapshot());
  clock(10); await store.collect(owner, 'kip', snapshot([], 50));
  clock(200); await store.equip(owner, 'kip', snapshot([], 50));
  clock(400); await store.equip(owner, 'glim', snapshot([], 50));
  const pending = snapshot([
    activity('first', 'game.developed', 100), activity('second', 'scene.challenge', 300), activity('third', 'scene.challenge', 500),
  ], 100);
  const view = (await store.sync(owner, pending)).profile;
  assert.equal(owned(view).adventures, 2); assert.equal(owned(view, 'kip').adventures, 1);
  clock(600); await store.equip(owner, 'kip', pending);
  const repeated = (await store.sync(owner, pending)).profile;
  assert.equal(owned(repeated).adventures, 2); assert.equal(owned(repeated, 'kip').adventures, 1);
});

test('learning remainder stays with its own Pal when the active companion changes', async () => {
  const { store, clock } = fixture(); await store.chooseStarter(owner, 'glim', snapshot());
  const first = [activity('a', 'math.completed', 10), activity('b', 'language.completed', 11), activity('c', 'language.explored', 12)];
  clock(20); await store.collect(owner, 'kip', snapshot(first, 50));
  clock(30); await store.equip(owner, 'kip', snapshot(first, 50));
  const kip = Array.from({ length: 5 }, (_, i) => activity(`kip-${i}`, 'math.completed', 40 + i));
  let view = (await store.sync(owner, snapshot([...first, ...kip], 60))).profile;
  assert.equal(owned(view).adventures, 0); assert.equal(owned(view).practiceToNextAdventure, 2);
  assert.equal(owned(view, 'kip').adventures, 1);
  clock(60); await store.equip(owner, 'glim', snapshot([...first, ...kip], 60));
  view = (await store.sync(owner, snapshot([...first, ...kip, activity('d', 'math.completed', 70), activity('e', 'math.completed', 71)], 64))).profile;
  assert.equal(owned(view).adventures, 1);
});

test('source timestamps cannot be changed behind an existing receipt identity', async () => {
  const { store } = fixture(); await store.chooseStarter(owner, 'glim', snapshot());
  const saved = activity('same', 'scene.challenge', 100); await store.sync(owner, snapshot([saved]));
  const before = await store.export();
  await assert.rejects(store.sync(owner, snapshot([{ ...saved, occurredAt: time(200) }])), /changed identity/);
  await assert.rejects(store.sync(owner, snapshot([{ ...saved, kind: 'game.developed' }])), /changed identity/);
  assert.deepEqual(await store.export(), before);
});

test('profile switching, foreign snapshots and adult namespaces cannot cross ownership', async () => {
  const { store, persistence } = fixture(); await store.chooseStarter(owner, 'glim', snapshot());
  const other = 'child-two'; await store.chooseStarter(other, 'kip', snapshot([], 0, other));
  await store.sync(owner, snapshot([activity('game', 'game.developed')], 25));
  assert.equal(owned(await store.view(other), 'kip').adventures, 0);
  await assert.rejects(store.sync(other, snapshot()), /damaged/);
  const adultId = 'adult:11111111-2222-3333-4444-555555555555';
  const adult = new PalsStore(`family-game-factory-adult:${adultId}:${PALS_DB_NAME}`, persistence, () => instant);
  await adult.chooseStarter(adultId, 'kip', snapshot([], 0, adultId));
  await assert.rejects(adult.view(owner), /different player/);
  await assert.rejects(store.view(adultId), /different player/);
  assert.equal((await store.view(owner)).activeId, 'glim');
});

test('failed writes show no false starter, collection, growth, preference or selection', async () => {
  const { store, persistence, clock } = fixture(); persistence.fail = true;
  await assert.rejects(store.chooseStarter(owner, 'glim', snapshot()), /quota/);
  assert.equal((await store.view(owner)).starterId, null);
  persistence.fail = false; await store.chooseStarter(owner, 'glim', snapshot());
  const before = await store.export(); persistence.fail = true;
  await assert.rejects(store.collect(owner, 'kip', snapshot([], 150)), /quota/);
  await assert.rejects(store.sync(owner, snapshot([activity('game', 'game.developed')], 150)), /quota/);
  await assert.rejects(store.setPreferences(owner, { encouragement: false }), /quota/);
  assert.deepEqual(await store.export(), before);
  persistence.fail = false; clock(10); await store.collect(owner, 'kip', snapshot([], 50));
  persistence.fail = true; clock(20); await assert.rejects(store.equip(owner, 'kip', snapshot([], 50)), /quota/);
  assert.equal((await store.view(owner)).activeId, 'glim');
  persistence.fail = false; await store.sync(owner, snapshot([activity('game', 'game.developed')], 150));
  assert.equal(owned(await store.view(owner)).adventures, 1);
});

test('concurrent stores serialize receipt assignments and starter choice', async () => {
  const { store, persistence } = fixture(); const second = new PalsStore(PALS_DB_NAME, persistence, () => instant);
  const starters = await Promise.allSettled([store.chooseStarter(owner, 'glim', snapshot()), second.chooseStarter(owner, 'kip', snapshot())]);
  assert.equal(starters.filter(result => result.status === 'fulfilled').length, 1);
  const receipts = snapshot([activity('one', 'scene.challenge')], 50);
  await Promise.all([store.sync(owner, receipts), second.sync(owner, receipts), store.sync(owner, receipts)]);
  const view = await store.view(owner); assert.equal(view.owned[0].adventures, 1);
  assert.equal((await store.export()).data.profiles[0].assignments.length, 1);
});

test('hidden or quiet companions keep the same progress and can return without penalties', async () => {
  const { store } = fixture(); await store.chooseStarter(owner, 'glim', snapshot());
  await store.setPreferences(owner, { showCompanion: false, encouragement: false });
  await store.sync(owner, snapshot([activity('game', 'game.developed')], 25));
  assert.equal(owned(await store.view(owner)).adventures, 1);
  assert.deepEqual((await store.view(owner)).preferences, { showCompanion: false, encouragement: false });
  await store.setPreferences(owner, { showCompanion: true });
  assert.equal((await store.view(owner)).preferences.encouragement, false);
  await assert.rejects(store.setPreferences(owner, { showCompanion: 'yes' } as never), /valid companion/);
});

test('backup replacement retains ownership, growth and settings without award replay', async () => {
  const { store } = fixture(); await store.chooseStarter(owner, 'glim', snapshot());
  const completed = snapshot([activity('game', 'game.developed')], 50);
  await store.sync(owner, completed); await store.collect(owner, 'kip', completed);
  await store.setPreferences(owner, { encouragement: false });
  const backup = await store.export(), restored = new PalsStore(PALS_DB_NAME, new MemoryPersistence());
  await restored.restore(backup, { mode: 'replace', allowedOwners: [owner] });
  assert.deepEqual(await restored.export(), backup);
  const projected = await restored.sync(owner, completed);
  assert.deepEqual(projected.growth, []); assert.deepEqual(projected.newlyAvailable, []);
  assert.equal(owned(projected.profile).adventures, 1);
  await assert.rejects(restored.restore(backup, { mode: 'replace', allowedOwners: ['child-two'] }), /outside this family/);
  const foreign = copyPals(backup); foreign.namespace = 'other-workspace';
  await assert.rejects(restored.restore(foreign, { mode: 'replace', allowedOwners: [owner] }), /damaged/);
});

test('corrupt and future data remain recoverable and failed maintenance can restore exact raw state', async () => {
  const { store, persistence } = fixture();
  const broken = { schema: 'jems.pals.workspace.v99', unexpected: ['original'] };
  persistence.values.set(PALS_DB_NAME, broken);
  await assert.rejects(store.view(owner), /damaged/);
  await assert.rejects(store.sync(owner, snapshot()), /damaged/);
  assert.deepEqual((await store.recovery())?.raw, broken);
  const raw = await store.snapshotRawForRecovery();
  await store.restore({ schema: 'jems.pals.backup.v1', namespace: PALS_DB_NAME, data: emptyPalsWorkspace() }, { mode: 'replace', allowedOwners: [owner] });
  assert.equal((await store.view(owner)).starterId, null);
  await store.restoreRawRecovery(raw);
  assert.deepEqual(await persistence.read(PALS_DB_NAME), broken);
  await assert.rejects(store.restoreRawRecovery({ namespace: 'foreign', raw: null }), /another Pal workspace/);
});

test('schema rejects duplicate identities, unknown state and malformed unlock or selection records', async () => {
  const { store } = fixture(); await store.chooseStarter(owner, 'glim', snapshot());
  const workspace = (await store.export()).data;
  const cases: Array<(value: any) => void> = [
    value => value.profiles.push(copyPals(value.profiles[0])),
    value => value.profiles[0].owned.push(copyPals(value.profiles[0].owned[0])),
    value => value.profiles[0].unlockedIds.push('unknown'),
    value => value.profiles[0].activeId = 'kip',
    value => value.profiles[0].starterId = 'riff',
    value => value.profiles[0].selections[0].from = 'tomorrow',
    value => value.profiles[0].selections[0].palId = 'kip',
    value => value.profiles[0].preferences.showCompanion = 'yes',
    value => value.profiles[0].policyVersion = 99,
    value => value.profiles[0].answer = 'private-content',
  ];
  for (const damage of cases) { const value = copyPals(workspace); damage(value); assert.throws(() => validatePalsWorkspace(value), /damaged/); }
  assert.throws(() => validatePalRewardSnapshot(snapshot([activity('duplicate'), activity('duplicate')])), /damaged/);
  assert.throws(() => validatePalRewardSnapshot({ ...snapshot(), lifetimeGems: -1 }), /damaged/);
  assert.throws(() => validatePalRewardSnapshot(snapshot([{ ...activity('unknown'), kind: 'maker.milestone' } as never])), /damaged/);
  assert.deepEqual((await store.export()).data, workspace);
});

test('profile erasure removes only that player’s companions and preferences', async () => {
  const { store } = fixture(); await store.chooseStarter(owner, 'glim', snapshot());
  await store.chooseStarter('child-two', 'kip', snapshot([], 0, 'child-two'));
  await store.sync(owner, snapshot([activity('game', 'game.developed')], 150));
  await store.removeOwner(owner);
  assert.equal((await store.view(owner)).starterId, null);
  assert.equal((await store.view('child-two')).activeId, 'kip');
  assert.equal((await store.export()).data.profiles.length, 1);
});
