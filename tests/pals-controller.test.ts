/** Deterministic queue boundaries; no browser timers or simulated user delays. */
import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { adultStorageKey, setAdultWorkspace } from '../src/adult-pilot/storage';
import { installPals, type PalsController, type PalsState } from '../src/pals/service';
import { IndexedDBPalsPersistence, PalsStore, PALS_DB_NAME, type PalsPersistence } from '../src/pals/store';
import { emptyRewardsSummary, type RewardGrant } from '../src/rewards/model';
import type { RewardsController, RewardState } from '../src/rewards/service';
import { RewardsStore, REWARDS_DB_NAME, type RewardsPersistence, type RewardsTransaction } from '../src/rewards/store';

const OWNER = 'child-one', OTHER = 'child-two';
const ADULT = 'adult:11111111-2222-3333-4444-555555555555';

function signal() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
type Gate = { entered: ReturnType<typeof signal>; released: ReturnType<typeof signal> };

class AtomicMemory implements PalsPersistence, RewardsPersistence {
  private values = new Map<string, unknown>();
  private queue: Promise<unknown> = Promise.resolve();
  async read(namespace: string): Promise<unknown | null> { return structuredClone(this.values.get(namespace) ?? null); }
  update<T>(namespace: string, mutate: (value: unknown | null) => RewardsTransaction<T>): Promise<T> {
    const pending = this.queue.catch(() => {}).then(() => {
      const transaction = mutate(structuredClone(this.values.get(namespace) ?? null));
      this.values.set(namespace, structuredClone(transaction.next));
      return transaction.result;
    });
    this.queue = pending.catch(() => {});
    return pending;
  }
}

interface ControllerFixture {
  controller: PalsController;
  learning: { active: boolean };
  deferExport(): { entered: Promise<void>; release(): void };
  deferRewardsRefresh(): { entered: Promise<void>; release(): void };
  switchOwner(owner: string): void;
  track<T>(pending: Promise<T>): Promise<T>;
}

/** Each test owns the globals/prototype port and runs serially within this file. */
async function withController(t: TestContext, work: (fixture: ControllerFixture) => Promise<void>): Promise<void> {
  const database = new AtomicMemory();
  t.mock.method(IndexedDBPalsPersistence.prototype, 'read', database.read.bind(database));
  t.mock.method(IndexedDBPalsPersistence.prototype, 'update', database.update.bind(database));
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  let owner = OWNER;
  const learning = { active: false };
  const surface = Object.assign(new EventTarget(), { FG: { store: { current: () => ({ id: owner }) }, learning } });
  Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: surface });
  setAdultWorkspace(null);

  const gates = new Set<Gate>(), exportGates: Gate[] = [], refreshGates: Gate[] = [];
  const defer = (queue: Gate[]) => {
    const gate = { entered: signal(), released: signal() };
    queue.push(gate); gates.add(gate);
    return { entered: gate.entered.promise, release: gate.released.resolve };
  };
  const pause = async (queue: Gate[]) => {
    const gate = queue.shift();
    if (gate) { gate.entered.resolve(); await gate.released.promise; }
  };
  const ledgers = new Map<string, RewardsStore>();
  const ledger = () => {
    const namespace = adultStorageKey(REWARDS_DB_NAME);
    let store = ledgers.get(namespace);
    if (!store) {
      store = new RewardsStore(namespace, database);
      const read = store.export.bind(store);
      store.export = async () => { await pause(exportGates); return read(); };
      ledgers.set(namespace, store);
    }
    return store;
  };
  const listeners = new Set<(state: RewardState, grants: readonly RewardGrant[]) => void>();
  let rewardState: RewardState = { summary: emptyRewardsSummary(owner), loading: true };
  const rewards: RewardsController = {
    get state() { return rewardState; },
    subscribe(listener) { listeners.add(listener); listener(rewardState, []); return () => listeners.delete(listener); },
    async refresh() {
      await pause(refreshGates);
      const summary = await ledger().summary(owner);
      rewardState = { summary, loading: false };
      for (const listener of listeners) listener(rewardState, []);
      return summary;
    },
    store: ledger, summary: () => ledger().summary(owner),
    maintenance: async work => work(ledger()), sourceSaved() {}, setOpen() {},
  };
  const controller = installPals(rewards), pending = new Set<Promise<unknown>>();
  const track = <T>(operation: Promise<T>) => {
    pending.add(operation); void operation.catch(() => {}); return operation;
  };
  try {
    await controller.refresh();
    await work({
      controller, learning, deferExport: () => defer(exportGates), deferRewardsRefresh: () => defer(refreshGates), track,
      switchOwner(next) {
        owner = next;
        setAdultWorkspace(next.startsWith('adult:') ? next : null);
        surface.dispatchEvent(new Event('factory-profile'));
      },
    });
  } finally {
    // Release even on an assertion failure so one test cannot strand later work.
    for (const gate of gates) gate.released.resolve();
    await Promise.allSettled([...pending]);
    await controller.refresh().catch(() => {});
    controller.dispose(); setAdultWorkspace(null);
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
}

test('a queued refresh preserves the mutation lock and rejects a second starter choice', { concurrency: false }, async t => {
  await withController(t, async ({ controller, deferExport, deferRewardsRefresh, track }) => {
    const choose = t.mock.method(PalsStore.prototype, 'chooseStarter');
    const seen: PalsState[] = [];
    controller.subscribe(state => { seen.push(structuredClone(state)); });
    const exportGate = deferExport(), refreshing = track(controller.refresh());
    await exportGate.entered;
    const rewardGate = deferRewardsRefresh(), choosing = track(controller.chooseStarter('navi'));
    assert.equal(controller.state.saving, true);
    exportGate.release(); await refreshing; await rewardGate.entered;
    assert.equal(controller.state.saving, true, 'the older refresh must preserve the queued choice lock');
    assert.equal(seen.at(-1)!.saving, true, 'subscribers must still show a pending save');
    await assert.rejects(controller.chooseStarter('kip'), /opening or saving/);
    assert.equal(choose.mock.callCount(), 0, 'neither choice has reached persistence while rewards are pending');
    rewardGate.release(); await choosing; await controller.refresh();
    assert.equal(choose.mock.callCount(), 1);
    assert.equal(controller.state.saving, false);
    assert.equal(controller.state.profile!.starterId, 'navi');
    assert.deepEqual(controller.state.profile!.owned.map(pal => pal.id), ['navi']);
  });
});

test('a learning checkpoint opened during the rewards await prevents the Pal mutation', { concurrency: false }, async t => {
  await withController(t, async ({ controller, learning, deferRewardsRefresh, track }) => {
    const choose = t.mock.method(PalsStore.prototype, 'chooseStarter');
    const before = await controller.store().export();
    const rewardGate = deferRewardsRefresh(), choosing = track(controller.chooseStarter('navi'));
    await rewardGate.entered;
    learning.active = true;
    rewardGate.release();
    await assert.rejects(choosing, /Finish the open learning activity/);
    await controller.refresh();
    assert.equal(choose.mock.callCount(), 0);
    assert.deepEqual(await controller.store().export(), before);
    assert.equal(controller.state.profile!.starterId, null);
    assert.equal(controller.state.saving, false);
    learning.active = false;
    await controller.chooseStarter('navi');
    assert.equal(controller.state.profile!.starterId, 'navi', 'the rejected action must release its lock');
  });
});

for (const [label, nextOwner] of [['another child', OTHER], ['the adult workspace', ADULT]] as const) {
  test(`switching to ${label} while maintenance drains aborts before the backup callback`, { concurrency: false }, async t => {
    await withController(t, async ({ controller, deferExport, switchOwner, track }) => {
      const exportGate = deferExport(), draining = track(controller.refresh());
      await exportGate.entered;
      let calls = 0;
      const maintenance = track(controller.maintenance(async store => { calls++; return store.namespace; }));
      switchOwner(nextOwner);
      exportGate.release(); await draining;
      await assert.rejects(maintenance, /player changed while preparing this backup/);
      assert.equal(calls, 0, 'a captured Pal store must not enter a new player’s backup');
      await controller.refresh();
      assert.equal(controller.state.owner, nextOwner);
      assert.equal(controller.state.profile!.owner, nextOwner);
      assert.equal(controller.state.loading, false);
      assert.equal(controller.store().namespace, adultStorageKey(PALS_DB_NAME));
    });
  });
}

test('an early rejected preference change emits the saved settings and an error for the parent controls', { concurrency: false }, async t => {
  await withController(t, async ({ controller, learning }) => {
    await controller.chooseStarter('navi'); await controller.refresh();
    const preferenceWrite = t.mock.method(PalsStore.prototype, 'setPreferences');
    const before = await controller.store().export(), saved = structuredClone(controller.state.profile);
    const seen: PalsState[] = [];
    controller.subscribe(state => { seen.push(structuredClone(state)); }); seen.length = 0;
    learning.active = true;
    await assert.rejects(controller.setPreferences({ showCompanion: false, encouragement: false }), /Finish the open learning activity/);
    assert.equal(preferenceWrite.mock.callCount(), 0);
    assert.equal(seen.length, 1, 'the rejected action must notify controls instead of silently leaving an optimistic checkbox');
    assert.deepEqual(seen[0].profile, saved);
    assert.deepEqual(seen[0].profile!.preferences, { showCompanion: true, encouragement: true });
    assert.equal(seen[0].saving, false);
    assert.match(seen[0].error!, /Finish the open learning activity/);
    assert.deepEqual(await controller.store().export(), before);
  });
});
