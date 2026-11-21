import { isPalId, palDefinition, type PalId } from './catalog';
import {
  copyPals, emptyPalProfile, emptyPalsWorkspace, isPalOwner, isPalsNamespace,
  projectPalSnapshot, summarizePals, validatePalPreferences, validatePalRewardSnapshot,
  validatePalsBackup, validatePalsWorkspace, type PalPreferences, type PalProfile,
  type PalRewardSnapshot, type PalsBackup, type PalsMutation, type PalsView, type PalsWorkspace,
} from './model';

export const PALS_DB_NAME = 'family-game-factory-pals-v1';
const OBJECT_STORE = 'workspaces';
export interface PalsTransaction<T> { next: unknown; result: T }
/** A persistence port must serialize the entire read + mutate + write operation. */
export interface PalsPersistence {
  read(namespace: string): Promise<unknown | null>;
  update<T>(namespace: string, mutate: (current: unknown | null) => PalsTransaction<T>): Promise<T>;
}
export interface PalsRestoreOptions { mode: 'replace'; allowedOwners: readonly string[] }
/** Host-only maintenance journal snapshot, never a user import format. */
export interface PalsRawSnapshot { namespace: string; raw: unknown | null }

export class IndexedDBPalsPersistence implements PalsPersistence {
  private opening: Promise<IDBDatabase> | null = null;
  private open(): Promise<IDBDatabase> {
    if (this.opening) return this.opening;
    const pending = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') { reject(Error('Your Pals could not open on this device. Try again when local storage is available.')); return; }
      let request: IDBOpenDBRequest, abandoned = false;
      try { request = indexedDB.open(PALS_DB_NAME, 1); }
      catch { reject(Error('Your Pals could not open. The saved collection has not been removed.')); return; }
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(OBJECT_STORE)) request.result.createObjectStore(OBJECT_STORE);
      };
      request.onerror = () => { abandoned = true; reject(Error('Your Pals could not open. The saved collection has not been removed.')); };
      request.onblocked = () => { abandoned = true; reject(Error('Close an older jems tab, then try opening your Pals again.')); };
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
      catch { this.opening = null; reject(Error('Your saved Pals could not be read. Please try again.')); return; }
      let value: unknown = null;
      const request = transaction.objectStore(OBJECT_STORE).get(namespace);
      request.onsuccess = () => { value = request.result ?? null; };
      transaction.oncomplete = () => resolve(value);
      transaction.onabort = transaction.onerror = () => reject(Error('Your saved Pals could not be read. The collection has not been replaced.'));
    });
  }
  async update<T>(namespace: string, mutate: (current: unknown | null) => PalsTransaction<T>): Promise<T> {
    const database = await this.open();
    return new Promise<T>((resolve, reject) => {
      let transaction: IDBTransaction;
      try { transaction = database.transaction(OBJECT_STORE, 'readwrite'); }
      catch { this.opening = null; reject(Error('Your Pals could not be saved. Please try again.')); return; }
      const store = transaction.objectStore(OBJECT_STORE), request = store.get(namespace);
      let result: T, failure: unknown;
      request.onsuccess = () => {
        try {
          const next = mutate(request.result ?? null);
          result = next.result; store.put(next.next, namespace);
        } catch (error) { failure = error; transaction.abort(); }
      };
      transaction.oncomplete = () => resolve(result!);
      transaction.onabort = transaction.onerror = () => reject(failure ?? Error('Your Pals could not be saved. Your previous collection is safe; try again.'));
    });
  }
}
const browserPersistence = new IndexedDBPalsPersistence();

/**
 * Captured namespace/owner, transactional state, and immutable activity
 * assignments. This is companion progress, not a currency or grading engine.
 */
export class PalsStore {
  constructor(readonly namespace: string, private persistence: PalsPersistence = browserPersistence, private now: () => number = Date.now) {
    if (!isPalsNamespace(namespace)) throw Error('Invalid Pal workspace.');
  }
  private owner(owner: string): void {
    if (!isPalOwner(owner)) throw Error('Choose a valid player for these Pals.');
    const adult = this.namespace.match(/(?:^|:)adult:([a-f0-9-]{36})(?::|$)/i);
    if (adult ? owner !== `adult:${adult[1]}` : owner.startsWith('adult:')) throw Error('These Pals belong to a different player workspace.');
  }
  private workspace(value: unknown | null): PalsWorkspace {
    const data = value === null ? emptyPalsWorkspace() : validatePalsWorkspace(value);
    for (const profile of data.profiles) this.owner(profile.owner);
    return data;
  }
  private profile(data: PalsWorkspace, owner: string): PalProfile {
    let profile = data.profiles.find(entry => entry.owner === owner);
    if (!profile) { profile = emptyPalProfile(owner); data.profiles.push(profile); }
    return profile;
  }
  private time(profile: PalProfile): string {
    const value = this.now();
    if (!Number.isFinite(value)) throw Error('The device clock is unavailable. Your Pals have not changed.');
    // Distinct ordered boundaries stop same-tick equip operations from moving
    // already observed work between Pals. A backward device clock never rewinds
    // the selection history or removes an earned companion.
    const prior = profile.selections.at(-1)?.from;
    return new Date(Math.max(value, prior ? Date.parse(prior) + 1 : value)).toISOString();
  }
  private update(owner: string, mutate: (profile: PalProfile) => PalsMutation): Promise<PalsMutation> {
    this.owner(owner);
    return this.persistence.update(this.namespace, current => {
      const data = this.workspace(current), profile = this.profile(data, owner);
      const result = mutate(profile), next = validatePalsWorkspace(data);
      return { next, result: { ...result, profile: summarizePals(profile) } };
    });
  }
  async view(owner: string): Promise<PalsView> {
    this.owner(owner);
    const data = this.workspace(await this.persistence.read(this.namespace));
    return summarizePals(data.profiles.find(profile => profile.owner === owner) ?? emptyPalProfile(owner));
  }
  /** Called only after the trusted shared-rewards bridge reads committed receipts. */
  async sync(owner: string, input: PalRewardSnapshot): Promise<PalsMutation> {
    this.owner(owner); const snapshot = validatePalRewardSnapshot(input, owner);
    return this.update(owner, profile => projectPalSnapshot(profile, snapshot));
  }
  async chooseStarter(owner: string, id: PalId, input: PalRewardSnapshot): Promise<PalsMutation> {
    this.owner(owner); const snapshot = validatePalRewardSnapshot(input, owner);
    if (!isPalId(id) || !palDefinition(id).starter) throw Error('Choose Luma or Nook as your first Pal.');
    return this.update(owner, profile => {
      if (profile.starterId !== null) throw Error('You already chose a starter. Take along a Pal from your collection.');
      // Baseline every older receipt before the first selection, including a
      // pre-existing receipt whose device timestamp is unusually far ahead.
      projectPalSnapshot(profile, snapshot);
      const from = this.time(profile);
      profile.starterId = id; profile.activeId = id;
      profile.owned.push({ id, joinedAt: from, source: 'starter' });
      profile.unlockedIds.push(id); profile.selections.push({ palId: id, from });
      return projectPalSnapshot(profile, snapshot);
    });
  }
  async collect(owner: string, id: PalId, input: PalRewardSnapshot): Promise<PalsMutation> {
    this.owner(owner); const snapshot = validatePalRewardSnapshot(input, owner);
    if (!isPalId(id)) throw Error('Choose a Pal from the collection.');
    return this.update(owner, profile => {
      if (profile.starterId === null) throw Error('Choose your first Pal to begin your collection.');
      const projection = projectPalSnapshot(profile, snapshot);
      if (profile.owned.some(pal => pal.id === id)) return projection;
      if (!profile.unlockedIds.includes(id)) throw Error(`Keep collecting lifetime gems to welcome ${palDefinition(id).name}.`);
      profile.owned.push({ id, joinedAt: this.time(profile), source: 'gems' });
      return { ...projection, newlyAvailable: projection.newlyAvailable.filter(palId => palId !== id) };
    });
  }
  async equip(owner: string, id: PalId, input: PalRewardSnapshot): Promise<PalsMutation> {
    this.owner(owner); const snapshot = validatePalRewardSnapshot(input, owner);
    if (!isPalId(id)) throw Error('Choose a Pal from your collection.');
    return this.update(owner, profile => {
      const projection = projectPalSnapshot(profile, snapshot);
      if (!profile.owned.some(pal => pal.id === id)) throw Error('Welcome this Pal to your collection before taking it along.');
      if (profile.activeId !== id) {
        const from = this.time(profile);
        // A collection and equip may occur in one clock tick. The selection
        // still starts no earlier than that Pal's persisted ownership.
        const joinedAt = profile.owned.find(pal => pal.id === id)!.joinedAt;
        profile.selections.push({ palId: id, from: from < joinedAt ? joinedAt : from });
        profile.activeId = id;
      }
      return projection;
    });
  }
  async setPreferences(owner: string, patch: Partial<PalPreferences>): Promise<PalsMutation> {
    this.owner(owner);
    if (!patch || typeof patch !== 'object' || Array.isArray(patch) ||
        Object.keys(patch).some(key => !['showCompanion', 'encouragement'].includes(key)) ||
        Object.values(patch).some(value => typeof value !== 'boolean')) throw Error('Choose valid companion settings.');
    return this.update(owner, profile => {
      profile.preferences = validatePalPreferences({ ...profile.preferences, ...patch });
      return { profile: summarizePals(profile), newlyAvailable: [], growth: [] };
    });
  }
  async export(): Promise<PalsBackup> {
    return { schema: 'jems.pals.backup.v1', namespace: this.namespace,
      data: this.workspace(await this.persistence.read(this.namespace)) };
  }
  validateBackup(input: unknown, allowedOwners: readonly string[]): PalsBackup {
    if (!Array.isArray(allowedOwners)) throw Error('Choose the players in this family backup.');
    const backup = validatePalsBackup(input, this.namespace), allowed = new Set(allowedOwners);
    for (const owner of allowedOwners) this.owner(owner);
    for (const profile of backup.data.profiles) {
      this.owner(profile.owner);
      if (!allowed.has(profile.owner)) throw Error('This Pal backup contains a player outside this family backup.');
    }
    return backup;
  }
  /** Restore replaces one explicitly selected backup; it never replays rewards. */
  async restore(input: unknown, options: PalsRestoreOptions): Promise<void> {
    if (!options || options.mode !== 'replace' || !Array.isArray(options.allowedOwners)) throw Error('Choose a valid Pal backup replacement.');
    const backup = this.validateBackup(input, options.allowedOwners);
    await this.persistence.update(this.namespace, () => ({ next: copyPals(backup.data), result: undefined }));
  }
  async snapshotRawForRecovery(): Promise<PalsRawSnapshot> {
    return { namespace: this.namespace, raw: structuredClone(await this.persistence.read(this.namespace)) };
  }
  async restoreRawRecovery(snapshot: PalsRawSnapshot): Promise<void> {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot) ||
        Object.keys(snapshot).some(key => !['namespace', 'raw'].includes(key)) ||
        snapshot.namespace !== this.namespace || !Object.hasOwn(snapshot, 'raw') || snapshot.raw === undefined)
      throw Error('This recovery snapshot belongs to another Pal workspace or is incomplete.');
    const raw = structuredClone(snapshot.raw);
    await this.persistence.update(this.namespace, () => ({ next: raw, result: undefined }));
  }
  async recovery(): Promise<{ namespace: string; raw: unknown } | null> {
    const raw = await this.persistence.read(this.namespace);
    try { this.workspace(raw); return null; }
    catch { return { namespace: this.namespace, raw: structuredClone(raw) }; }
  }
  async removeOwner(owner: string): Promise<void> {
    this.owner(owner);
    await this.persistence.update(this.namespace, current => {
      const data = this.workspace(current);
      data.profiles = data.profiles.filter(profile => profile.owner !== owner);
      return { next: validatePalsWorkspace(data), result: undefined };
    });
  }
}
