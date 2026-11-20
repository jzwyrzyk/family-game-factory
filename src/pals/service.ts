import { adultStorageKey } from '../adult-pilot/storage';
import type { RewardsController } from '../rewards/service';
import { summarizeRewards, validateRewardsBackup, type RewardActivityKind } from '../rewards/model';
import { assertRewardSourceWritable, rewardSourceWritable } from '../rewards/write-guard';
import { PalsStore, PALS_DB_NAME } from './store';
import type { PalId } from './catalog';
import type { PalsView, PalPreferences, PalRewardSnapshot, PalsMutation } from './model';

/** Engagement presentation only. Learning/grade evidence stays in its host. */
export interface PalsState {
  owner: string;
  profile: PalsView | null;
  lifetimeGems: number | null;
  loading: boolean;
  saving: boolean;
  error?: string;
}
export interface PalsNotice {
  available: PalId[];
  growth: PalsMutation['growth'];
  activities: RewardActivityKind[];
}
type Listener = (state: PalsState, notice: PalsNotice) => void;
type Context = { owner: string; namespace: string; epoch: number; rewardStore: ReturnType<RewardsController['store']> };
const quiet = (): PalsNotice => ({ available: [], growth: [], activities: [] });
type PalsMaintenance = { maintenance<T>(work: (store: PalsStore) => Promise<T>): Promise<T> };
let activeMaintenance: PalsMaintenance | null = null;

/** Backup controls install before Studio. Resolve the live queue when invoked. */
export function withPalsMaintenance<T>(work: (store: PalsStore) => Promise<T>): Promise<T> {
  return activeMaintenance ? activeMaintenance.maintenance(work) : work(new PalsStore(adultStorageKey(PALS_DB_NAME)));
}

/**
 * The input is a validated export of the one shared reward ledger. DOM events,
 * game messages and animation callbacks never supply a gem amount or activity.
 */
export function palSnapshotFromRewards(input: unknown, owner: string): PalRewardSnapshot {
  const backup = validateRewardsBackup(input);
  const ledger = backup.data.profiles.find(profile => profile.owner === owner) ?? { owner, receipts: [] };
  const summary = summarizeRewards(ledger);
  return {
    owner, lifetimeGems: summary.lifetimeGems,
    activities: ledger.receipts.flatMap(receipt => receipt.type === 'activity' && receipt.fact.kind !== 'maker.milestone'
      ? [{ id: receipt.id, kind: receipt.fact.kind, occurredAt: receipt.fact.occurredAt }]
      : []),
  };
}

export function installPals(rewards: RewardsController) {
  const FG = (window as any).FG;
  let epoch = 0, suspended = false, queue: Promise<unknown> = Promise.resolve();
  let pendingChange: { token: symbol; epoch: number } | null = null;
  const saving = () => pendingChange?.epoch === epoch;
  const listeners = new Set<Listener>(), stores = new Map<string, PalsStore>();
  const owner = () => String(FG.store.current().id);
  const context = (): Context => ({ owner: owner(), namespace: adultStorageKey(PALS_DB_NAME), epoch, rewardStore: rewards.store() });
  const current = (captured: Context) => !suspended && captured.epoch === epoch && captured.owner === owner() && captured.namespace === adultStorageKey(PALS_DB_NAME);
  const storeFor = (captured: Context): PalsStore => {
    let store = stores.get(captured.namespace);
    if (!store) { store = new PalsStore(captured.namespace); stores.set(captured.namespace, store); }
    return store;
  };
  let state: PalsState = { owner: owner(), profile: null, lifetimeGems: null, loading: true, saving: false };
  const emit = (notice = quiet()) => { for (const listener of listeners) listener(state, notice); };
  const enqueue = <T>(work: () => Promise<T>): Promise<T> => {
    const task = queue.catch(() => {}).then(work); queue = task.catch(() => {}); return task;
  };
  const snapshot = async (captured: Context) => palSnapshotFromRewards(await captured.rewardStore.export(), captured.owner);
  function failed(captured: Context, error: unknown) {
    if (current(captured)) {
      state = { ...state, loading: false, saving: saving(),
        error: error instanceof Error ? error.message : 'Your Pals could not be saved. Try again; your last saved collection is safe.' };
      emit();
    }
  }

  function refresh(options: { celebrate?: boolean; activities?: RewardActivityKind[] } = {}): Promise<void> {
    const captured = context();
    return enqueue(async () => {
      if (!current(captured)) return;
      try {
        const facts = await snapshot(captured);
        if (!current(captured)) return;
        const result = rewardSourceWritable()
          ? await storeFor(captured).sync(captured.owner, facts)
          : { profile: await storeFor(captured).view(captured.owner), newlyAvailable: [], growth: [] };
        if (!current(captured)) return;
        state = { owner: captured.owner, profile: result.profile, lifetimeGems: facts.lifetimeGems, loading: false, saving: saving() };
        emit(options.celebrate ? { available: result.newlyAvailable, growth: result.growth, activities: options.activities ?? [] } : quiet());
      } catch (error) { failed(captured, error); throw error; }
    });
  }

  function change(work: (store: PalsStore, captured: Context, facts: PalRewardSnapshot) => Promise<PalsMutation>): Promise<void> {
    const captured = context();
    // Mark busy before queueing to prevent an ordinary double tap from enqueuing
    // two conflicting choices. The database also rechecks ownership atomically.
    try {
      if (suspended || saving() || state.loading || !current(captured)) throw Error('Your Pals are still opening or saving. Try again in a moment.');
      assertRewardSourceWritable();
      if (FG.learning.active) throw Error('Finish the open learning activity before changing your Pal.');
    } catch (error) { failed(captured, error); return Promise.reject(error); }
    const token = Symbol('Pal choice'); pendingChange = { token, epoch };
    const release = () => { if (pendingChange?.token === token) pendingChange = null; };
    state = { ...state, saving: true, error: undefined }; emit();
    return enqueue(async () => {
      if (!current(captured)) return;
      try {
        await rewards.refresh();
        if (!current(captured)) return;
        const facts = await snapshot(captured);
        if (!current(captured)) return;
        assertRewardSourceWritable();
        if (FG.learning.active) throw Error('Finish the open learning activity before changing your Pal.');
        const result = await work(storeFor(captured), captured, facts);
        if (!current(captured)) return;
        release();
        state = { owner: captured.owner, profile: result.profile, lifetimeGems: facts.lifetimeGems, loading: false, saving: false };
        emit({ available: result.newlyAvailable, growth: result.growth, activities: [] });
      } catch (error) { release(); failed(captured, error); throw error; }
      finally { release(); }
    });
  }

  function changed() {
    epoch++;
    pendingChange = null;
    state = { owner: owner(), profile: null, lifetimeGems: null, loading: true, saving: false }; emit();
    void refresh().catch(() => {});
  }
  const unsubscribe = rewards.subscribe((rewardState, grants) => {
    if (suspended || rewardState.loading || rewardState.summary.owner !== owner()) return;
    if (rewardState.error) {
      state = { ...state, loading: false, saving: saving(), error: 'Your saved gems could not be read. Retry before collecting or growing a Pal.' }; emit(); return;
    }
    void refresh({ celebrate: grants.length > 0,
      activities: grants.flatMap(grant => ['math.completed', 'language.completed', 'language.explored', 'scene.challenge', 'game.developed'].includes(grant.kind) ? [grant.kind as RewardActivityKind] : []) }).catch(() => {});
  });
  window.addEventListener('factory-profile', changed);

  const controller = {
    get state() { return state; },
    subscribe(listener: Listener) { listeners.add(listener); listener(state, quiet()); return () => listeners.delete(listener); },
    refresh,
    chooseStarter: (id: PalId) => change((store, captured, facts) => store.chooseStarter(captured.owner, id, facts)),
    collect: (id: PalId) => change((store, captured, facts) => store.collect(captured.owner, id, facts)),
    equip: (id: PalId) => change((store, captured, facts) => store.equip(captured.owner, id, facts)),
    setPreferences: (patch: Partial<PalPreferences>) => change((store, captured) => store.setPreferences(captured.owner, patch)),
    store: () => storeFor(context()),
    /** Caller coordinates this with the existing family backup journal. */
    async maintenance<T>(work: (store: PalsStore) => Promise<T>): Promise<T> {
      if (suspended) throw Error('Finish the current collection backup first.');
      assertRewardSourceWritable();
      const captured = context(); suspended = true; epoch++;
      try {
        await queue;
        if (captured.owner !== owner() || captured.namespace !== adultStorageKey(PALS_DB_NAME))
          throw Error('The player changed while preparing this backup. Try again for the current player.');
        return await work(storeFor(captured));
      }
      finally { suspended = false; changed(); }
    },
    dispose() { suspended = true; epoch++; pendingChange = null; unsubscribe(); listeners.clear(); window.removeEventListener('factory-profile', changed); if (activeMaintenance === controller) activeMaintenance = null; },
  };
  activeMaintenance = controller;
  return controller;
}
export type PalsController = ReturnType<typeof installPals>;
