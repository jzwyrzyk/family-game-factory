import { adultStorageKey, adultWorkspaceId } from '../adult-pilot/storage';
import { StudioNotebook } from '../studio/notebook';
import { CreationStore } from '../creation/storage';
import { emptyRewardsSummary, REWARDS_LIMITS, rewardFactId, type RewardGrant, type RewardsSummary } from './model';
import { REWARDS_DB_NAME, RewardsStore } from './store';
import { assertRewardSourceWritable, rewardSourceWritable, setRewardSourceMaintenance } from './write-guard';
import {hasPendingRewardBackup} from './backup';

export interface RewardState { summary: RewardsSummary; loading: boolean; error?: string }
type Context = { owner: string; adult: string | null; namespace: string; epoch: number };
type Listener = (state: RewardState, grants: readonly RewardGrant[]) => void;
export interface RewardsController {
  readonly state: RewardState;
  subscribe(listener: Listener): () => void;
  refresh(options?: { celebrate?: boolean }): Promise<RewardsSummary>;
  sourceSaved(owner: string): void;
  maintenance<T>(work: (store: RewardsStore) => Promise<T>): Promise<T>;
  store(): RewardsStore;
  setOpen(handler: () => void): void;
  summary(): Promise<RewardsSummary>;
}
let installed: RewardsController | undefined;

/** A trusted host save wakes the projector. It never supplies an award amount. */
export function notifyRewardSourceSaved(owner: string): void { installed?.sourceSaved(owner); }

export function installRewards(): RewardsController {
  if (installed) return installed;
  const FG = (window as any).FG;
  let epoch = 0, suspended = false, queue: Promise<unknown> = Promise.resolve();
  let openPage = () => {};
  const listeners = new Set<Listener>(), stores = new Map<string, RewardsStore>();
  const context = (): Context => ({ owner: String(FG.store.current().id), adult: adultWorkspaceId(), namespace: adultStorageKey(REWARDS_DB_NAME), epoch });
  const current = (captured: Context) => !suspended && captured.epoch === epoch && captured.owner === String(FG.store.current().id) && captured.namespace === adultStorageKey(REWARDS_DB_NAME);
  const storeFor = (captured: Context) => {
    let store = stores.get(captured.namespace);
    if (!store) { store = new RewardsStore(captured.namespace); stores.set(captured.namespace, store); }
    return store;
  };
  const storageFor = (captured: Context): Storage => ({
    length: localStorage.length, clear() { throw Error('Use the family backup controls.'); }, key: index => localStorage.key(index),
    getItem: key => localStorage.getItem(adultStorageKey(key, captured.adult)),
    setItem: (key, value) => localStorage.setItem(adultStorageKey(key, captured.adult), value),
    removeItem: key => localStorage.removeItem(adultStorageKey(key, captured.adult)),
  });
  let state: RewardState = { summary: emptyRewardsSummary(context().owner), loading: true };
  function emit(grants: readonly RewardGrant[] = []) { for (const listener of listeners) listener(state, grants); }

  function refresh(options: { celebrate?: boolean } = {}): Promise<RewardsSummary> {
    const captured = context();
    const task = queue.catch(() => {}).then(async () => {
      if (!current(captured)) return emptyRewardsSummary(captured.owner);
      const ledger = storeFor(captured);
      try {
        let summary = await ledger.summary(captured.owner), grants: RewardGrant[] = [];
        if (!current(captured)) return summary;
        // Read only persisted outboxes. An in-memory attempt whose source save
        // failed cannot become a reward through an unrelated later UI action.
        if (rewardSourceWritable()) {
          const storage = storageFor(captured), notebook = new StudioNotebook(storage), creation = new CreationStore(storage, () => captured.owner);
          const facts = [...FG.store.pendingRewards(captured.owner), ...notebook.pendingRewards(captured.owner), ...creation.pendingRewards(captured.owner)];
          for (let offset=0;offset<facts.length;offset+=REWARDS_LIMITS.outbox) {
            const batch=facts.slice(offset,offset+REWARDS_LIMITS.outbox);
            const result = await ledger.project(captured.owner, batch);
            summary = result.summary; grants.push(...result.newlyGranted);
            if (!current(captured)) return summary;
            const ids = batch.map(rewardFactId);
            // A failed acknowledgement leaves the source receipt available for
            // a quiet retry. The committed ledger will not count it twice.
            FG.store.acknowledgeRewards(captured.owner, ids);
            notebook.acknowledgeRewards(captured.owner, ids);
            creation.acknowledgeRewards(captured.owner, ids);
          }
        }
        if (current(captured)) { state = { summary, loading: false }; emit(options.celebrate ? grants : []); }
        return summary;
      } catch (error) {
        if (current(captured)) {
          state = { ...state, loading: false, error: 'Your rewards could not be updated. Your saved activities are still here. Try again. ' + (error instanceof Error ? error.message : '') };
          emit();
        }
        throw error;
      }
    });
    queue = task.catch(() => {}); return task;
  }

  function sourceSaved(owner: string) {
    if (!suspended && owner === context().owner) void refresh({ celebrate: true }).catch(() => {});
  }
  function changed() {
    epoch++;
    state = { summary: emptyRewardsSummary(context().owner), loading: true }; emit();
    void refresh().catch(() => {});
  }
  async function maintenance<T>(work: (store: RewardsStore) => Promise<T>): Promise<T> {
    assertRewardSourceWritable();
    if (suspended) throw Error('Finish the current backup operation first.');
    const captured = context(); suspended = true; epoch++;
    const elements = Array.from(document.querySelectorAll<HTMLElement>('main,.site-header'));
    const prior = elements.map(element => element.inert); elements.forEach(element => { element.inert = true; });
    try {
      await queue;setRewardSourceMaintenance(true);
      if(captured.namespace!==adultStorageKey(REWARDS_DB_NAME)||captured.owner!==String(FG.store.current().id))throw Error('The player changed while preparing this backup. Try again for the current player.');
      return await work(storeFor(captured));
    }
    finally {
      if(hasPendingRewardBackup()){
        // A committed restore reloads; an interrupted one must recover its
        // journal before any old in-memory source can be written or projected.
        state={...state,loading:false,error:'Saved progress is being restored. Reload Jems to finish recovery.'};emit();
      }else{
        setRewardSourceMaintenance(false);elements.forEach((element,index)=>{element.inert=prior[index];});suspended=false;changed();
      }
    }
  }

  const api = {
    get state() { return state; },
    subscribe(listener: Listener) { listeners.add(listener); listener(state, []); return () => listeners.delete(listener); },
    refresh, sourceSaved, maintenance,
    store: () => storeFor(context()),
    setOpen(handler: () => void) { openPage = handler; },
    summary: () => storeFor(context()).summary(context().owner),
  };
  installed = api;
  // The public host surface offers reading and navigation, never direct grants.
  FG.rewards = { version: 1, summary: api.summary, refresh, open: () => openPage() };
  window.addEventListener('factory-profile', changed);
  window.addEventListener('jems:source-writable', () => { void refresh().catch(() => {}); });
  void refresh().catch(() => {});
  return api;
}
