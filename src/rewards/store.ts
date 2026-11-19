import {
  addPracticeMilestones, emptyRewardsWorkspace, isRewardOwner, isRewardsNamespace,
  rewardFactAmount, rewardFactId, rewardGrant, summarizeRewards,
  validateRewardOutbox, validateRewardsBackup, validateRewardsWorkspace,
  type RewardFact, type RewardGrant, type RewardsBackup, type RewardsLedger,
  type RewardsSummary, type RewardsWorkspace,
} from './model';

export const REWARDS_DB_NAME = 'family-game-factory-rewards-v1';
const OBJECT_STORE = 'workspaces';
export interface RewardsTransaction<T> { next: unknown; result: T }
/** update must serialize read + mutation + write, including across browser tabs. */
export interface RewardsPersistence {
  read(namespace: string): Promise<unknown | null>;
  update<T>(namespace: string, mutate: (current: unknown | null) => RewardsTransaction<T>): Promise<T>;
}
export interface RewardProjection {
  summary: RewardsSummary; newlyGranted: RewardGrant[]; newGemMilestones: number[];
}
export interface RewardsRestoreOptions { mode: 'merge' | 'replace'; allowedOwners: readonly string[] }
/** Internal maintenance receipt, not a user-import or reward-grant format. */
export interface RewardsRawSnapshot { namespace: string; raw: unknown | null }

/** One native transaction owns a complete namespace update; no shared localStorage counter. */
export class IndexedDBRewardsPersistence implements RewardsPersistence {
  private opening: Promise<IDBDatabase> | null = null;
  private open(): Promise<IDBDatabase> {
    if (this.opening) return this.opening;
    const pending = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') { reject(Error('Gems could not be saved on this device. Your activity can be retried when local storage is available.')); return; }
      let request: IDBOpenDBRequest, abandoned = false;
      try { request = indexedDB.open(REWARDS_DB_NAME, 1); }
      catch { reject(Error('Gems could not open on this device. Your saved activity has not been removed.')); return; }
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(OBJECT_STORE)) request.result.createObjectStore(OBJECT_STORE);
      };
      request.onerror = () => { abandoned = true; reject(Error('Gems could not open on this device. Your saved activity has not been removed.')); };
      request.onblocked = () => { abandoned = true; reject(Error('Close another older jems tab to open your saved gems, then try again.')); };
      request.onsuccess = () => {
        const database = request.result;
        if (abandoned) { database.close(); return; }
        database.onversionchange = () => { database.close(); this.opening = null; };
        resolve(database);
      };
    });
    this.opening = pending;
    void pending.catch(() => { if (this.opening === pending) this.opening = null; });
    return pending;
  }
  async read(namespace: string): Promise<unknown | null> {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      let transaction: IDBTransaction;
      try { transaction = database.transaction(OBJECT_STORE, 'readonly'); }
      catch { this.opening = null; reject(Error('Saved gems could not be read. Please try again.')); return; }
      let value: unknown = null;
      const request = transaction.objectStore(OBJECT_STORE).get(namespace);
      request.onsuccess = () => { value = request.result ?? null; };
      transaction.oncomplete = () => resolve(value);
      transaction.onabort = transaction.onerror = () => reject(Error('Saved gems could not be read. Existing history has not been replaced.'));
    });
  }
  async update<T>(namespace: string, mutate: (current: unknown | null) => RewardsTransaction<T>): Promise<T> {
    const database = await this.open();
    return new Promise<T>((resolve, reject) => {
      let transaction: IDBTransaction;
      try { transaction = database.transaction(OBJECT_STORE, 'readwrite'); }
      catch { this.opening = null; reject(Error('Gems could not be saved. Please try again.')); return; }
      const store = transaction.objectStore(OBJECT_STORE), request = store.get(namespace);
      let result: T, failure: unknown;
      request.onsuccess = () => {
        try {
          const next = mutate(request.result ?? null);
          result = next.result;
          store.put(next.next, namespace);
        } catch (error) { failure = error; transaction.abort(); }
      };
      transaction.oncomplete = () => resolve(result!);
      transaction.onabort = transaction.onerror = () => reject(failure ?? Error('Gems could not be saved on this device. Your previous gems are safe; the saved activity can be retried.'));
    });
  }
}

const browserPersistence = new IndexedDBRewardsPersistence();
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));

/**
 * Namespace is captured at construction, never resolved from a changing active
 * profile after await. It is local isolation, not a server authorization claim.
 */
export class RewardsStore {
  constructor(readonly namespace: string, private persistence: RewardsPersistence = browserPersistence) {
    if (!isRewardsNamespace(namespace)) throw Error('Invalid rewards workspace.');
  }
  private owner(owner: string): void {
    if (!isRewardOwner(owner)) throw Error('Choose a valid player for these gems.');
    const adult = this.namespace.match(/(?:^|:)adult:([a-f0-9-]{36})(?::|$)/i);
    if (adult ? owner !== `adult:${adult[1]}` : owner.startsWith('adult:')) throw Error('These gems belong to a different player workspace.');
  }
  private workspace(value: unknown | null): RewardsWorkspace {
    const data = value === null ? emptyRewardsWorkspace() : validateRewardsWorkspace(value);
    for (const ledger of data.profiles) this.owner(ledger.owner);
    return data;
  }
  private ledger(data: RewardsWorkspace, owner: string): RewardsLedger {
    let ledger = data.profiles.find(profile => profile.owner === owner);
    if (!ledger) { ledger = { owner, receipts: [] }; data.profiles.push(ledger); }
    return ledger;
  }
  async summary(owner: string): Promise<RewardsSummary> {
    this.owner(owner);
    const data = this.workspace(await this.persistence.read(this.namespace));
    return summarizeRewards(data.profiles.find(profile => profile.owner === owner) ?? { owner, receipts: [] });
  }
  /** Only trusted source adapters call this after their durable source/outbox save. */
  async project(owner: string, input: readonly RewardFact[]): Promise<RewardProjection> {
    this.owner(owner);
    const facts = validateRewardOutbox(input);
    if (facts.some(fact => fact.owner !== owner)) throw Error('These reward activities belong to another player.');
    return this.persistence.update(this.namespace, current => {
      const data = this.workspace(current), ledger = this.ledger(data, owner), before = summarizeRewards(ledger);
      const existing = new Set(ledger.receipts.map(receipt => receipt.id)), newlyGranted: RewardGrant[] = [];
      for (const fact of facts) {
        const id = rewardFactId(fact);
        if (existing.has(id)) continue;
        const receipt = { type: 'activity' as const, id, fact: copy(fact), amount: rewardFactAmount(fact) };
        ledger.receipts.push(receipt); existing.add(id); newlyGranted.push(rewardGrant(receipt));
      }
      newlyGranted.push(...addPracticeMilestones(ledger).map(rewardGrant));
      const next = validateRewardsWorkspace(data), summary = summarizeRewards(ledger);
      return { next, result: { summary, newlyGranted,
        newGemMilestones: summary.reachedGemMilestones.filter(goal => !before.reachedGemMilestones.includes(goal)) } };
    });
  }
  async export(): Promise<RewardsBackup> {
    return { schema: 'jems.rewards.backup.v1', namespace: this.namespace,
      data: this.workspace(await this.persistence.read(this.namespace)) };
  }
  /**
   * Capture before a coordinated family restore. Unlike export(), this preserves
   * an unsupported/corrupt original so failed recovery never destroys the bytes.
   */
  async snapshotRawForRecovery(): Promise<RewardsRawSnapshot> {
    return { namespace: this.namespace, raw: structuredClone(await this.persistence.read(this.namespace)) };
  }
  /**
   * Only the host maintenance journal may call this with its captured rollback
   * snapshot. Never use for user imports: restore() validates those separately.
   * It does not project facts, reprice receipts or emit award notifications.
   */
  async restoreRawRecovery(snapshot: RewardsRawSnapshot): Promise<void> {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot) ||
        Object.keys(snapshot).some(key => !['namespace', 'raw'].includes(key)) ||
        snapshot.namespace !== this.namespace || !Object.hasOwn(snapshot, 'raw') || snapshot.raw === undefined)
      throw Error('This recovery snapshot belongs to another rewards workspace or is incomplete.');
    const raw = structuredClone(snapshot.raw);
    await this.persistence.update(this.namespace, () => ({ next: raw, result: undefined }));
  }
  /** Raw corrupted state is available for explicit recovery; never silently reset. */
  async recovery(): Promise<{ namespace: string; raw: unknown } | null> {
    const raw = await this.persistence.read(this.namespace);
    try { this.workspace(raw); return null; }
    catch { return { namespace: this.namespace, raw: structuredClone(raw) }; }
  }
  validateBackup(input: unknown, allowedOwners: readonly string[]): RewardsBackup {
    const backup = validateRewardsBackup(input, this.namespace), allowed = new Set(allowedOwners);
    for (const owner of allowedOwners) this.owner(owner);
    for (const ledger of backup.data.profiles) {
      this.owner(ledger.owner);
      if (!allowed.has(ledger.owner)) throw Error('This rewards backup contains a player outside this family backup.');
    }
    return backup;
  }
  /**
   * Replace is an explicit backup restore, and may recover damaged local state.
   * Merge unions semantic identities; imports never replay award celebrations.
   */
  async restore(input: unknown, options: RewardsRestoreOptions): Promise<void> {
    if (!options || !['merge', 'replace'].includes(options.mode) || !Array.isArray(options.allowedOwners)) throw Error('Choose how to restore this rewards backup.');
    const backup = this.validateBackup(input, options.allowedOwners);
    await this.persistence.update(this.namespace, current => {
      if (options.mode === 'replace') return { next: copy(backup.data), result: undefined };
      const data = this.workspace(current);
      for (const imported of backup.data.profiles) {
        const ledger = this.ledger(data, imported.owner), existing = new Set(ledger.receipts.map(receipt => receipt.id));
        for (const receipt of imported.receipts) if (!existing.has(receipt.id)) { ledger.receipts.push(copy(receipt)); existing.add(receipt.id); }
        addPracticeMilestones(ledger);
      }
      return { next: validateRewardsWorkspace(data), result: undefined };
    });
  }
  async removeOwner(owner: string): Promise<void> {
    this.owner(owner);
    await this.persistence.update(this.namespace, current => {
      const data = this.workspace(current);
      data.profiles = data.profiles.filter(profile => profile.owner !== owner);
      return { next: validateRewardsWorkspace(data), result: undefined };
    });
  }
}
