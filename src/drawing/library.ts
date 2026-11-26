/** One private transaction boundary for original art, physical versions and references. */
import { assertRewardSourceWritable, rewardSourceWritable } from '../rewards/write-guard';
import { validateAssembly } from './model';
import type { Drawing } from '../assets/private-drawings';
import type { SavedRig } from './store';
import { adultStorageKey } from '../adult-pilot/storage';

export const ART_DB_NAME = 'family-private-drawings-v1';
export const ART_DB_VERSION = 3;
export const ART_LIMITS = Object.freeze({ imageBytes: 5 * 1024 * 1024, imagePixels: 4096, storageBytes: 20 * 1024 * 1024, drawingsPerOwner: 100, rigsPerOwner: 200, designBytes: 8 * 1024 * 1024, bundleBytes: 64 * 1024 * 1024 });
export type ArtGuard = () => boolean;
export type ArtStoreName = 'drawings' | 'rigs' | 'active' | 'drafts' | 'usage' | 'meta' | 'drawingMetadata';
import { sceneAssetIds } from '../creation/worlds';

export type ArtUsage = { id: string; owner: string; targetId: string; targetKind: 'scene' | 'game'; drawingId: string; rigId?: string };
const names: ArtStoreName[] = ['drawings', 'rigs', 'active', 'drafts', 'usage', 'meta', 'drawingMetadata'];

export function artOwner(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value || value.length > 120 || /[\u0000-\u001f]/.test(value)) throw Error('Choose a player before opening artwork.');
}
export function assertArtWrite(owner: string, guard?: ArtGuard) {
  artOwner(owner); assertRewardSourceWritable();
  const current = typeof window !== 'undefined' ? (window as any).FG?.store?.current?.()?.id : undefined;
  if (current !== undefined && String(current) !== owner || guard && !guard()) throw Error('The active player changed. Reopen this artwork in its own profile.');
}
export const artRequest = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error || Error('Could not read saved artwork.'));
});
function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error || Error('Artwork was not saved. Your earlier work is safe.'));
    transaction.onerror = () => reject(transaction.error || Error('Could not save artwork.'));
  });
}
let migration: Promise<void> | undefined;

/** Preserve the draft PR's separate rig database without mutating its originals. */
async function migrateLegacy(database: IDBDatabase) {
  if (!rewardSourceWritable()) return;
  const marker = await artRequest(database.transaction('meta').objectStore('meta').get('legacy-rigs-v1'));
  if (marker) return;
  // Opening an absent database is a creation attempt even if its upgrade is
  // aborted. Use a read-only inventory where supported so ordinary art startup
  // cannot leave an uncommitted legacy catalog entry behind in the browser.
  const legacyName='family-drawing-rigs-v1';
  const exists=!indexedDB.databases||(await indexedDB.databases()).some(row=>row.name===legacyName);
  const legacy = exists?await new Promise<IDBDatabase | null>((resolve, reject) => {
    const request = indexedDB.open(legacyName);
    let missing = false;
    request.onupgradeneeded = () => { missing = true; request.transaction!.abort(); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => missing ? resolve(null) : reject(request.error);
  }):null;
  let rigs: SavedRig[] = [], active: { owner: string; id: string }[] = [];
  if (legacy) {
    try {
      if (legacy.objectStoreNames.contains('rigs')) rigs = await artRequest(legacy.transaction('rigs').objectStore('rigs').getAll());
      if (legacy.objectStoreNames.contains('active')) active = await artRequest(legacy.transaction('active').objectStore('active').getAll());
    } finally { legacy.close(); }
  }
  assertRewardSourceWritable();
  const transaction = database.transaction(['drawings', 'rigs', 'active', 'meta'], 'readwrite'), done = transactionDone(transaction); void done.catch(() => {});
  try {
    const originals = await artRequest(transaction.objectStore('drawings').getAll()) as Drawing[];
    const existing = await artRequest(transaction.objectStore('rigs').getAll()) as SavedRig[];
    const imported = new Map(existing.map(rig => [rig.id, rig]));
    const pending = new Map<string, SavedRig>();
    // Invalid legacy entries stay in their original database for recovery. They
    // do not replace or poison valid entries in the current art library.
    for (const rig of rigs.slice(0, 1000)) {
      try {
        artOwner(rig.owner); const assembly = validateAssembly(rig.assembly);
        if (typeof rig.id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(rig.id) || !Number.isFinite(Date.parse(rig.savedAt)) ||
          rig.parentId !== null && (typeof rig.parentId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(rig.parentId)) ||
          !originals.some(original => original.owner === rig.owner && original.id === assembly.sourceId && original.sha256 === assembly.sourceSha256) || imported.has(rig.id)) continue;
        pending.set(rig.id, { id: rig.id, owner: rig.owner, parentId: rig.parentId, assembly, savedAt: rig.savedAt });
      } catch { /* Retain the legacy record untouched for explicit recovery. */ }
    }
    // Import parents first. Missing parents and cycles remain in the old store.
    let progress = true;
    while (progress) {
      progress = false;
      for (const [id, rig] of pending) {
        const parent = rig.parentId ? imported.get(rig.parentId) : null;
        if (rig.parentId && (!parent || parent.owner !== rig.owner || parent.assembly.sourceId !== rig.assembly.sourceId)) continue;
        try { checkArtCapacity(originals, [...imported.values(), rig]); } catch { continue; }
        transaction.objectStore('rigs').add(rig); imported.set(id, rig); pending.delete(id); progress = true;
      }
    }
    for (const choice of active) {
      const rig = imported.get(choice.id);
      if (rig && rig.owner === choice.owner && rig.assembly.kind === 'car') transaction.objectStore('active').put({ owner: choice.owner, id: choice.id });
    }
    transaction.objectStore('meta').put({ id: 'legacy-rigs-v1', migratedAt: new Date().toISOString() }); await done;
  } catch (error) { try { transaction.abort(); } catch {} await done.catch(() => {}); throw error; }
}

export async function artDatabase(): Promise<IDBDatabase> {
  const request = indexedDB.open(ART_DB_NAME, ART_DB_VERSION);
  request.onupgradeneeded = () => {
    for (const name of names) {
      const store=request.result.objectStoreNames.contains(name)?request.transaction!.objectStore(name):request.result.createObjectStore(name,{keyPath:name==='active'?'owner':'id'});
      if(!['active','meta'].includes(name)&&!store.indexNames.contains('owner'))store.createIndex('owner','owner');
      if(name==='drawingMetadata'&&!store.indexNames.contains('ownerCreated'))store.createIndex('ownerCreated',['owner','createdAt','id']);
    }
    // Add only a regenerable bounded catalog. Never rewrite original images.
    const cursor=request.transaction!.objectStore('drawings').openCursor();
    cursor.onsuccess=()=>{if(cursor.result){saveDrawingMetadata(request.transaction!,cursor.result.value);cursor.result.continue();}};
  };
  const database = await new Promise<IDBDatabase>((resolve,reject)=>{
    let blocked=false;request.onblocked=()=>{blocked=true;reject(Error('Close another open Jems tab, then reopen your artwork. Your original pictures are safe.'));};
    request.onerror=()=>reject(request.error);request.onsuccess=()=>{if(blocked)request.result.close();else resolve(request.result);};
  });
  database.onversionchange = () => database.close();
  try {
    if (!migration) migration = migrateLegacy(database).catch(error => { migration = undefined; throw error; });
    await migration; return database;
  } catch (error) { database.close(); throw error; }
}

export async function withArtTransaction<T>(stores: ArtStoreName[], mode: IDBTransactionMode, action: (transaction: IDBTransaction) => Promise<T> | T): Promise<T> {
  const database = await artDatabase();
  const transaction = database.transaction(mode==='readwrite'&&stores.includes('drawings')?[...new Set([...stores,'drawingMetadata'])]:stores, mode), done = transactionDone(transaction); void done.catch(() => {});
  try { const result = await action(transaction); await done; return result; }
  catch (error) { try { transaction.abort(); } catch {} await done.catch(() => {}); throw error; }
  finally { database.close(); }
}

export function checkArtCapacity(drawings: Drawing[], rigs: SavedRig[] = []) {
  if (drawings.reduce((total, item) => total + item.bytes.byteLength + (item.preview?.byteLength || 0), 0) > ART_LIMITS.storageBytes ||
    [...new Set(drawings.map(item => item.owner))].some(owner => drawings.filter(item => item.owner === owner).length > ART_LIMITS.drawingsPerOwner)) throw Error('Your art storage is full. Download an art backup and remove unused artwork before adding more. Archiving keeps its storage.');
  if (new TextEncoder().encode(JSON.stringify(rigs)).byteLength > ART_LIMITS.designBytes ||
    [...new Set(rigs.map(item => item.owner))].some(owner => rigs.filter(item => item.owner === owner).length > ART_LIMITS.rigsPerOwner)) throw Error('Your saved movement versions are full. Download an art backup before removing unused artwork.');
}

export async function registerArtUsage(owner: string, input: Omit<ArtUsage, 'id' | 'owner'>, guard?: ArtGuard) {
  assertArtWrite(owner, guard);
  if (typeof input.targetId !== 'string' || !input.targetId || input.targetId.length > 160 || typeof input.drawingId !== 'string' || !input.drawingId || input.rigId !== undefined && (typeof input.rigId !== 'string' || !input.rigId) || !['scene', 'game'].includes(input.targetKind)) throw Error('Choose a saved game or scene.');
  return withArtTransaction(['drawings', 'rigs', 'usage'], 'readwrite', async transaction => {
    const original = await artRequest(transaction.objectStore('drawings').get(input.drawingId)) as Drawing | undefined;
    if (!original || original.owner !== owner) throw Error('This artwork is not available in this profile.');
    if (input.rigId) {
      const rig = await artRequest(transaction.objectStore('rigs').get(input.rigId)) as SavedRig | undefined;
      if (!rig || rig.owner !== owner || rig.assembly.sourceId !== original.id || rig.assembly.sourceSha256 !== original.sha256) throw Error('Choose a saved movement version from this artwork.');
    }
    assertArtWrite(owner, guard);
    const record: ArtUsage = { ...input, owner, id: JSON.stringify([owner, input.targetKind, input.targetId, input.drawingId, input.rigId || '']) };
    transaction.objectStore('usage').put(record); return record;
  });
}
export async function releaseArtUsage(owner: string, targetId: string, guard?: ArtGuard) {
  assertArtWrite(owner, guard);
  return withArtTransaction(['usage'], 'readwrite', async transaction => {
    const store = transaction.objectStore('usage'), all = await ownerArtRecords<ArtUsage>(transaction,'usage',owner);
    assertArtWrite(owner, guard); for (const item of all) if (item.owner === owner && item.targetId === targetId) store.delete(item.id);
  });
}
/** Read the source histories as authority. A valid workspace can disprove an
 * obsolete index receipt; unavailable/corrupt source evidence cannot do so. */
export function deriveArtUsages(owner: string, originals: Pick<Drawing,'id'|'owner'|'sha256'>[], rigs: SavedRig[], indexed: ArtUsage[]): ArtUsage[] {
  const result = new Map<string, ArtUsage>(), known = new Set<ArtUsage['targetKind']>();
  const images = new Map(originals.filter(item => item.owner === owner).map(item => [item.id, item]));
  const versions = new Map(rigs.filter(item => item.owner === owner).map(item => [item.id, item]));
  const add = (targetId: string, targetKind: ArtUsage['targetKind'], drawingId: string, rigId?: string) => {
    const item: ArtUsage = { id: JSON.stringify([owner, targetKind, targetId, drawingId, rigId || '']), owner, targetId, targetKind, drawingId, ...(rigId ? { rigId } : {}) };
    result.set(item.id, item);
  };
  if (typeof localStorage !== 'undefined') for (const [kind, key] of [['scene', 'family-game-factory-creation-v1'], ['game', 'family-game-factory-workspace-v2']] as const) {
    try {
      const raw = localStorage.getItem(adultStorageKey(key, owner.startsWith('adult:') ? owner : null));
      if (!raw) continue;
      const workspace = JSON.parse(raw);
      if (!workspace || !Array.isArray(workspace.projects) || !Array.isArray(workspace.revisions) || kind === 'scene' && !Array.isArray(workspace.drafts)) continue;
      const owned = new Set(workspace.projects.filter((project: any) => project?.owner === owner && typeof project.id === 'string').map((project: any) => project.id));
      const allProjects = new Set(workspace.projects.map((project: any) => project?.id));
      let complete = workspace.projects.every((project: any) => project && typeof project.id === 'string' && typeof project.owner === 'string') && allProjects.size === workspace.projects.length;
      for (const revision of [...workspace.revisions, ...(kind === 'scene' ? workspace.drafts : [])]) {
        if (!revision || typeof revision.projectId !== 'string' || !allProjects.has(revision.projectId)) { complete = false; continue; }
        if (!owned.has(revision.projectId)) continue;
        if (kind === 'scene') {
          if (!revision.scene || !Array.isArray(revision.scene.actors)) { complete = false; continue; }
          for (const assetId of sceneAssetIds(revision.scene)) {
            if (typeof assetId !== 'string') { complete = false; continue; }
            const match = /^art:(image|rig):([A-Za-z0-9_-]{1,100}):([a-f0-9]{64})$/.exec(assetId);
            if (!match) continue;
            if (match[1] === 'image') { const image = images.get(match[2]); if (image?.sha256 === match[3]) add(revision.projectId, kind, image.id); }
            else { const rig = versions.get(match[2]); if (rig && images.get(rig.assembly.sourceId)?.sha256 === rig.assembly.sourceSha256) add(revision.projectId, kind, rig.assembly.sourceId, rig.id); }
          }
        } else if (typeof revision.drawingRigId === 'string') {
          const rig = versions.get(revision.drawingRigId); if (rig && images.get(rig.assembly.sourceId)?.sha256 === rig.assembly.sourceSha256) add(revision.projectId, kind, rig.assembly.sourceId, rig.id);
        }
      }
      if (complete) known.add(kind);
    } catch { /* Preserve indexed protection until the source is recoverable. */ }
  }
  for (const item of indexed) if (item.owner === owner && !known.has(item.targetKind)) result.set(item.id, item);
  return [...result.values()];
}
export async function artUsages(owner: string, drawingId?: string): Promise<ArtUsage[]> {
  artOwner(owner);
  return withArtTransaction(['usage', 'drawingMetadata', 'rigs'], 'readonly', async transaction => {
    const indexed = await ownerArtRecords<ArtUsage>(transaction,'usage',owner);
    const originals = await ownerArtRecords<DrawingMetadata>(transaction,'drawingMetadata',owner);
    const rigs = await ownerArtRecords<SavedRig>(transaction,'rigs',owner);
    return deriveArtUsages(owner, originals, rigs, indexed).filter(item => !drawingId || item.drawingId === drawingId);
  });
}

/** Lightweight cards never hydrate full original image collections. */
export type DrawingMetadata = Omit<Drawing,'bytes'> & {originalBytes:number};
export function saveDrawingMetadata(transaction:IDBTransaction,item:Drawing):void {
 const {bytes,...metadata}=item;
 transaction.objectStore('drawingMetadata').put({...metadata,originalBytes:bytes.byteLength});
}
export function ownerArtRecords<T>(transaction:IDBTransaction,store:ArtStoreName,owner:string):Promise<T[]>{
 artOwner(owner);return artRequest(transaction.objectStore(store).index('owner').getAll(IDBKeyRange.only(owner)));
}
