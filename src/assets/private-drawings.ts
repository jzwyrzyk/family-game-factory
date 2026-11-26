import {artFootprint, checkReservedArtRoom, clearSketchRecord, pendingSketchRecord} from '../drawing/sketch-keep-record';
import {sceneAssetSlots} from '../creation/model';
import { originalFor, normalizeDrawingLabel, validSemanticIdentity } from './art-lineage';
import {retainedPins} from '../game-art/bindings';
import {assertRewardSourceLockHeld,setRewardSourceMaintenance} from '../rewards/write-guard';
/** Private immutable image bytes. Metadata and visibility can change; the image cannot. */
import { ART_LIMITS, artOwner, artRequest, assertArtWrite, checkArtCapacity, deriveArtUsages, withArtTransaction, saveDrawingMetadata, ownerArtRecords, type DrawingMetadata, type ArtGuard, type ArtUsage } from '../drawing/library';
import type { SavedRig } from '../drawing/store';
import { adultStorageKey } from '../adult-pilot/storage';

export type DrawingCategory = 'character' | 'vehicle' | 'prop' | 'world' | 'other';
export const DRAWING_CATEGORIES: readonly DrawingCategory[] = ['character', 'vehicle', 'prop', 'world', 'other'];
export interface Drawing {
  id: string; owner: string; name: string; mime: 'image/png' | 'image/jpeg'; bytes: ArrayBuffer; sha256: string; createdAt: string;
  sourceId?: string; sourceSha256?: string; preview?: ArrayBuffer;
  category?: DrawingCategory; semanticIdentity?: string; archived?: boolean; updatedAt?: string;
}
export const drawingHash = async (bytes: ArrayBuffer) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');

/** Read dimensions before decoding to bound compressed-image allocation. */
export function inspectDrawingBytes(bytes: ArrayBuffer, mime: Drawing['mime']): { width: number; height: number } {
  if (bytes.byteLength < 8 || bytes.byteLength > ART_LIMITS.imageBytes) throw Error('Choose a PNG or JPEG up to 5 MB.');
  const data = new Uint8Array(bytes), view = new DataView(bytes);
  let width = 0, height = 0;
  if (mime === 'image/png') {
    if (bytes.byteLength < 24 || ![137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => data[index] === byte) || String.fromCharCode(...data.slice(12, 16)) !== 'IHDR') throw Error('This file is not a supported drawing.');
    width = view.getUint32(16); height = view.getUint32(20);
  } else if (mime === 'image/jpeg') {
    if (data[0] !== 255 || data[1] !== 216 || data[2] !== 255) throw Error('This file is not a supported drawing.');
    let offset = 2;
    while (offset + 3 < data.length) {
      if (data[offset++] !== 255) throw Error('This file is not a supported drawing.');
      while (offset < data.length && data[offset] === 255) offset++;
      const marker = data[offset++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || marker >= 0xd0 && marker <= 0xd7) continue;
      if (offset + 2 > data.length) break;
      const size = view.getUint16(offset);
      if (size < 2 || offset + size > data.length) throw Error('This JPEG drawing is incomplete.');
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        if (size < 8) throw Error('This JPEG drawing is incomplete.');
        height = view.getUint16(offset + 3); width = view.getUint16(offset + 5); break;
      }
      offset += size;
    }
  } else throw Error('Choose a PNG or JPEG drawing.');
  if (width < 1 || height < 1 || width > ART_LIMITS.imagePixels || height > ART_LIMITS.imagePixels) throw Error('Use a drawing no larger than 4096 × 4096 pixels.');
  return { width, height };
}

/** Validates/decodes without changing storage. Also used by all-or-nothing imports. */
export async function prepareDrawing(owner: string, name: string, file: Blob): Promise<Drawing> {
  artOwner(owner);
  if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > ART_LIMITS.imageBytes) throw Error('Choose a PNG or JPEG up to 5 MB.');
  const bytes = await file.arrayBuffer(), mime = file.type as Drawing['mime']; inspectDrawingBytes(bytes, mime);
  let image: ImageBitmap;
  try { image = await createImageBitmap(file); } catch { throw Error('This drawing could not be opened. Try another PNG or JPEG.'); }
  let preview: ArrayBuffer;
  try {
    if (!image.width || !image.height || image.width > ART_LIMITS.imagePixels || image.height > ART_LIMITS.imagePixels) throw Error('Use a drawing no larger than 4096 × 4096 pixels.');
    const scale = Math.min(1, 256 / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale)), height = Math.max(1, Math.round(image.height * scale));
    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(width, height); canvas.getContext('2d')!.drawImage(image, 0, 0, width, height);
      preview = await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer();
    } else {
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      canvas.getContext('2d')!.drawImage(image, 0, 0, width, height);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(Error('Could not preview this drawing.')), 'image/png'));
      preview = await blob.arrayBuffer();
    }
  } finally { image.close(); }
  return { id: crypto.randomUUID(), owner, name: String(name).trim().slice(0, 60) || 'My drawing', mime, bytes, preview, sha256: await drawingHash(bytes), createdAt: new Date().toISOString(), category: 'other' };
}

export async function drawings(owner: string): Promise<Drawing[]> {
  artOwner(owner); return withArtTransaction(['drawings'], 'readonly', async transaction => (await ownerArtRecords<Drawing>(transaction,'drawings',owner)).map(normalizeDrawingLabel));
}
export async function drawing(owner: string, id: string): Promise<Drawing> {
  artOwner(owner);
  const result = await withArtTransaction(['drawings'], 'readonly', async transaction => {
    const item = await artRequest(transaction.objectStore('drawings').get(id)) as Drawing | undefined;
    if (!item || item.owner !== owner) throw Error('Choose a drawing from this profile.'); return item;
  });
  if (await drawingHash(result.bytes) !== result.sha256) throw Error('The original drawing does not match its saved fingerprint. Open your art backup to recover a copy.');
  return normalizeDrawingLabel(result);
}
export async function saveDrawing(owner: string, name: string, file: Blob, sourceId?: string, guard?: ArtGuard, category?: DrawingCategory, keepToken?: string): Promise<Drawing> {
  assertArtWrite(owner, guard); const item = await prepareDrawing(owner, name, file); assertArtWrite(owner, guard);
  if (category !== undefined) {
    if (!DRAWING_CATEGORIES.includes(category)) throw Error('Choose an available art collection.');
    item.category = category;
  }
  return withArtTransaction(['drawings','meta'], 'readwrite', async transaction => {
    const store = transaction.objectStore('drawings'), metadata=await artRequest(transaction.objectStore('drawingMetadata').getAll()) as DrawingMetadata[];
    if (sourceId) {
      const source = metadata.find(original => original.owner === owner && original.id === sourceId);
      if (!source) throw Error('Original drawing not found in this profile.');
      item.sourceId = sourceId; item.sourceSha256 = source.sha256; item.category = source.category || 'other';
      const meaning = normalizeDrawingLabel(source).semanticIdentity;
      if (meaning) item.semanticIdentity = meaning;
    }
    if (keepToken) {
      const pending = await pendingSketchRecord(transaction,owner);
      if (!pending || pending.token !== keepToken || pending.image.sha256 !== item.sha256 ||
          pending.image.name !== item.name || pending.image.sourceId !== sourceId || pending.image.sourceSha256 !== item.sourceSha256)
        throw Error('This unfinished save has changed. Open it again from My Art.');
      item.id = pending.image.id;
      item.createdAt = pending.image.createdAt;
      clearSketchRecord(transaction,owner);
    }
    await checkReservedArtRoom(transaction,[...metadata.map(artFootprint),artFootprint(item)]);
    assertArtWrite(owner,guard);
    store.add(item);
    saveDrawingMetadata(transaction,item);
    return item;
  });
}
export async function updateDrawing(owner: string, id: string, changes: { name?: string; category?: DrawingCategory; semanticIdentity?: string; archived?: boolean }, guard?: ArtGuard): Promise<Drawing> {
  assertArtWrite(owner, guard);
  if (!changes || Object.keys(changes).some(key => !['name', 'category', 'semanticIdentity', 'archived'].includes(key)) ||
    changes.name !== undefined && (typeof changes.name !== 'string' || !changes.name.trim() || changes.name.trim().length > 60) ||
    changes.semanticIdentity !== undefined && !validSemanticIdentity(changes.semanticIdentity) ||
    changes.category !== undefined && !DRAWING_CATEGORIES.includes(changes.category) || changes.archived !== undefined && typeof changes.archived !== 'boolean') throw Error('Choose a short name and an available art category.');
  return withArtTransaction(['drawings'], 'readwrite', async transaction => {
    const store = transaction.objectStore('drawings'), item = await artRequest(store.get(id)) as Drawing | undefined;
    if (!item || item.owner !== owner) throw Error('Choose artwork from this profile.');
    const label = normalizeDrawingLabel(item);
    const updated = { ...label, ...changes, ...(changes.name !== undefined ? { name: changes.name.trim() } : {}), updatedAt: new Date().toISOString() };
    if (changes.semanticIdentity !== undefined) {
      const meaning = changes.semanticIdentity.trim();
      if (meaning) updated.semanticIdentity = meaning;
      else delete updated.semanticIdentity;
      if (meaning !== (label.semanticIdentity ?? '')) {
        const records = await ownerArtRecords<DrawingMetadata>(transaction, 'drawingMetadata', owner);
        const byId = new Map(records.map(row => [row.id, row]));
        const root = originalFor(byId.get(id)!, byId);
        for (const row of records) {
          if (row.id === id || originalFor(row, byId).id !== root.id) continue;
          const version = normalizeDrawingLabel(await artRequest(store.get(row.id)) as Drawing);
          if (meaning) version.semanticIdentity = meaning;
          else delete version.semanticIdentity;
          assertArtWrite(owner, guard);
          store.put(version);
          saveDrawingMetadata(transaction, version);
        }
      }
    }
    assertArtWrite(owner, guard); store.put(updated); saveDrawingMetadata(transaction,updated); return updated;
  });
}

/** A restored/copy scene can predate the usage index. Retained scene history is
 * authoritative; do not erase a byte source merely because it has not reopened. */
function usedByRetainedScene(owner: string, original: Drawing, rigs: SavedRig[]): boolean {
  if (typeof localStorage === 'undefined') return false;
  const key = adultStorageKey('family-game-factory-creation-v1', owner.startsWith('adult:') ? owner : null);
  const raw = localStorage.getItem(key); if (!raw) return false;
  let workspace: any;
  try { workspace = JSON.parse(raw); } catch { throw Error('A saved scene needs recovery. Archive this artwork until its saved references can be checked.'); }
  if (!workspace || !Array.isArray(workspace.projects) || !Array.isArray(workspace.revisions) || !Array.isArray(workspace.drafts)) throw Error('A saved scene needs recovery. Archive this artwork while its references are unavailable.');
  if (workspace.projects.some((entry: any) => !entry || typeof entry.id !== 'string' || typeof entry.owner !== 'string')) throw Error('A saved project needs recovery before its artwork can be erased.');
  const projectIds = new Set(workspace.projects.map((entry: any) => entry.id));
  const retained = [...workspace.revisions, ...(Array.isArray(workspace.drafts) ? workspace.drafts : [])];
  if (projectIds.size !== workspace.projects.length || retained.some((entry: any) => !entry || !projectIds.has(entry.projectId))) throw Error('Saved project references need recovery before their artwork can be erased.');
  const ownedProjects = new Set(workspace.projects.filter((entry: any) => entry?.owner === owner).map((entry: any) => entry.id));
  const refs = new Set([`art:image:${original.id}:${original.sha256}`]);
  const rigPrefixes = rigs.map(rig => `art:rig:${rig.id}:`);
  for (const record of [...workspace.revisions, ...workspace.drafts]) {
    if (!ownedProjects.has(record?.projectId)) continue;
    if (!record.scene || !Array.isArray(record.scene.actors)) throw Error('A saved scene needs recovery before its artwork can be erased.');
    if (sceneAssetSlots(record.scene).some((actor: any) => typeof actor?.assetId === 'string' && (refs.has(actor.assetId) || rigPrefixes.some(prefix => actor.assetId.startsWith(prefix))))) return true;
  }
  return false;
}

function usedByRetainedGame(owner: string, rigs: SavedRig[]): boolean {
  if (!rigs.length || typeof localStorage === 'undefined') return false;
  const key = adultStorageKey('family-game-factory-workspace-v2', owner.startsWith('adult:') ? owner : null);
  const raw = localStorage.getItem(key); if (!raw) return false;
  let workspace: any;
  try { workspace = JSON.parse(raw); } catch { throw Error('A saved game needs recovery. Archive its artwork while saved references are unavailable.'); }
  if (!workspace || !Array.isArray(workspace.projects) || !Array.isArray(workspace.revisions)) throw Error('A saved game needs recovery before its artwork can be erased.');
  if (workspace.projects.some((entry: any) => !entry || typeof entry.id !== 'string' || typeof entry.owner !== 'string')) throw Error('A saved project needs recovery before its artwork can be erased.');
  const projectIds = new Set(workspace.projects.map((entry: any) => entry.id));
  const retained = [...workspace.revisions, ...(Array.isArray(workspace.drafts) ? workspace.drafts : [])];
  if (projectIds.size !== workspace.projects.length || retained.some((entry: any) => !entry || !projectIds.has(entry.projectId))) throw Error('Saved project references need recovery before their artwork can be erased.');
  const ownedProjects = new Set(workspace.projects.filter((entry: any) => entry?.owner === owner).map((entry: any) => entry.id));
  const ids = new Set(rigs.map(rig => rig.id));
  return workspace.revisions.some((revision: any) => ownedProjects.has(revision?.projectId) && ids.has(revision.drawingRigId));
}

async function removeDrawing(owner: string, id: string, includeRigs: boolean, guard?: ArtGuard) {
  assertArtWrite(owner, guard);
  // Erasure spans two local databases. Hold the existing source maintenance
  // gate through the reference check and art commit; ordinary migration/scene
  // writes cannot publish new references while this original is removed.
  setRewardSourceMaintenance(true);
  const check=()=>{assertRewardSourceLockHeld();const current=(window as any).FG?.store?.current?.()?.id;if(current!==undefined&&String(current)!==owner||guard&&!guard())throw Error('The player changed. Reopen this artwork.');};
  try{
    const [{IndexedRecords},{nativeScope}]=await Promise.all([import('../storage/indexed-records'),import('../storage/native-workspace')]);
    const records=await IndexedRecords.open(await nativeScope(owner),check);
    try{
      if(await records.get('notebook-control','head')){
        const {IndexedNotebook}=await import('../storage/indexed-notebook');
        const notebook=await IndexedNotebook.open(await nativeScope(owner),check);
        try{
          if((await notebook.snapshot()).sessions.some(s=>s.gameArt && retainedPins(s.gameArt).some(p=>p.drawingId===id)))
            throw Error('A saved game idea uses this picture. Archive it to keep that version safe.');
        }finally{notebook.close();}
      }
      if(await records.get('native-control','migration')||await records.get('creation-control','migration'))throw Error('This player has a prepared game or scene library. Archive this artwork to keep every retained creation safe. Original erasure is unavailable for prepared libraries.');}finally{records.close();}
  return await withArtTransaction(['drawings', 'rigs', 'active', 'drafts', 'usage', 'meta'], 'readwrite', async transaction => {
    const store = transaction.objectStore('drawings'), all = await artRequest(store.getAll()) as Drawing[];
    const item = all.find(original => original.id === id && original.owner === owner);
    if (!item) throw Error('Choose a drawing from this profile.');
    const rigs = (await artRequest(transaction.objectStore('rigs').getAll()) as SavedRig[]).filter(rig => rig.owner === owner && rig.assembly.sourceId === id);
    const indexed = await artRequest(transaction.objectStore('usage').getAll()) as ArtUsage[];
    const usage = deriveArtUsages(owner, all, rigs, indexed).filter(use => use.drawingId === id);
    const pending = await pendingSketchRecord(transaction, owner);
    if (pending?.image.sourceId === id) throw Error('Finish or discard the unfinished save that uses this picture before erasing it.');
    if (all.some(original => original.owner === owner && original.sourceId === id) || usage.length || usedByRetainedScene(owner, item, rigs) || usedByRetainedGame(owner, rigs) || !includeRigs && rigs.length) throw Error('A saved version, game or scene still uses this artwork. Archive it to hide it while keeping those creations safe.');
    check();
    store.delete(id); transaction.objectStore('drawingMetadata').delete(id); for (const use of indexed) if (use.owner === owner && use.drawingId === id) transaction.objectStore('usage').delete(use.id);
    for (const rig of rigs) transaction.objectStore('rigs').delete(rig.id);
    transaction.objectStore('drafts').delete(JSON.stringify([owner, id]));
    const active = await artRequest(transaction.objectStore('active').get(owner)) as { id: string } | undefined;
    if (active && rigs.some(rig => rig.id === active.id)) transaction.objectStore('active').delete(owner);
  });
  }finally{setRewardSourceMaintenance(false);}
}
/** Legacy image action never removes physical revisions as an incidental effect. */
export const deleteDrawing = (owner: string, id: string, guard?: ArtGuard) => removeDrawing(owner, id, false, guard);
/** The Art Studio's explicit erase action removes unused art and all its movement versions. */
export const deleteArtwork = (owner: string, id: string, guard?: ArtGuard) => removeDrawing(owner, id, true, guard);
export function drawingBlob(item: Drawing) { return new Blob([item.bytes], { type: item.mime }); }

export interface DrawingPageQuery {after?:[string,string];limit?:number;search?:string;category?:DrawingCategory;archived?:boolean}
export async function drawingPage(owner:string,query:DrawingPageQuery={}):Promise<{items:DrawingMetadata[];next:[string,string]|null;total:number}>{
 artOwner(owner);const limit=query.limit??24;
 if(!Number.isInteger(limit)||limit<1||limit>100||query.after&&(!Array.isArray(query.after)||query.after.length!==2||query.after.some(x=>typeof x!=='string'))||query.search!==undefined&&typeof query.search!=='string'||query.category!==undefined&&!DRAWING_CATEGORIES.includes(query.category))throw Error('Choose an available art page.');
 return withArtTransaction(['drawingMetadata'],'readonly',async transaction=>{
  const store=transaction.objectStore('drawingMetadata'),total=await artRequest(store.index('owner').count(IDBKeyRange.only(owner)));
  const range=IDBKeyRange.bound([owner,'',''],[owner,...(query.after??['\uffff','\uffff'])],false,!!query.after);
  const items:DrawingMetadata[]=[],search=(query.search??'').trim().toLowerCase();
  await new Promise<void>((resolve,reject)=>{const request=store.index('ownerCreated').openCursor(range,'prev');request.onerror=()=>reject(request.error);request.onsuccess=()=>{const cursor=request.result;if(!cursor||items.length>limit){resolve();return;}let item: DrawingMetadata;
    try { item = normalizeDrawingLabel(cursor.value as DrawingMetadata); }
    catch (error) { reject(error); return; }
    if((query.archived===undefined||Boolean(item.archived)===query.archived)&&(!query.category||(item.category??'other')===query.category)&&(!search||item.name.toLowerCase().includes(search)||item.semanticIdentity?.toLowerCase().includes(search)))items.push(item);cursor.continue();};});
  const hasMore=items.length>limit;if(hasMore)items.pop();const last=items.at(-1);return {items,next:hasMore&&last?[last.createdAt,last.id]:null,total};
 });
}
