import {artFootprint, checkReservedArtRoom, clearSketchRecord, pendingSketchRecord} from './sketch-keep-record';
import {assertRewardSourceLockHeld} from '../rewards/write-guard';
/** Portable private art: validate all bytes and references before one additive transaction. */
import { normalizeDrawingLabel, validSemanticIdentity } from '../assets/art-lineage';
import { type Drawing, DRAWING_CATEGORIES, prepareDrawing } from '../assets/private-drawings';
import { type SavedRig, type DrawingDraft } from './store';
import { validateAssembly, type DrawingAssembly } from './model';
import { ART_LIMITS, artOwner, artRequest, saveDrawingMetadata, ownerArtRecords, assertArtWrite, checkArtCapacity, withArtTransaction, type ArtGuard } from './library';

export type PortableDrawing = Omit<Drawing, 'owner' | 'bytes' | 'preview'> & { data: string };
export type PortableRig = Omit<SavedRig, 'owner'>;
export type PortableDraft = Omit<DrawingDraft, 'owner' | 'id'>;
export interface ArtBundle { schema: 'jems.art-bundle.v1'; exportedAt: string; drawings: PortableDrawing[]; rigs: PortableRig[]; drafts?: PortableDraft[] }
export interface ArtImportResult { drawings: Drawing[]; rigs: SavedRig[]; drawingIds: Record<string, string>; rigIds: Record<string, string> }
const object = (value: unknown, keys: string[]): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => keys.includes(key));
const identifier = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value) && !['__proto__', 'constructor', 'prototype'].includes(value);
const date = (value: unknown): value is string => typeof value === 'string' && value.length <= 40 && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value));
const hash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function fail(): never { throw Error('This art backup is incomplete or unsupported. Your saved artwork has not been changed.'); }
const encode = (bytes: ArrayBuffer) => { const data = new Uint8Array(bytes); let binary = ''; for (let i = 0; i < data.length; i += 32768) binary += String.fromCharCode(...data.subarray(i, i + 32768)); return btoa(binary); };
function decode(data: unknown): ArrayBuffer {
  if (typeof data !== 'string' || data.length < 12 || data.length > Math.ceil(ART_LIMITS.imageBytes / 3) * 4 || data.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) fail();
  let binary: string; try { binary = atob(data); } catch { return fail(); }
  const bytes = new Uint8Array(binary.length); for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  if (encode(bytes.buffer) !== data) fail(); return bytes.buffer;
}
function parse(input: unknown): ArtBundle {
  let raw: string;
  try { raw = typeof input === 'string' ? input : JSON.stringify(input); } catch { return fail(); }
  if (!raw || raw.length > ART_LIMITS.bundleBytes || new TextEncoder().encode(raw).byteLength > ART_LIMITS.bundleBytes) throw Error('Choose an art backup smaller than 64 MB.');
  let value: ArtBundle; try { value = JSON.parse(raw); } catch { return fail(); }
  if (!object(value, ['schema', 'exportedAt', 'drawings', 'rigs', 'drafts']) || value.schema !== 'jems.art-bundle.v1' || !date(value.exportedAt) || !Array.isArray(value.drawings) || value.drawings.length > ART_LIMITS.drawingsPerOwner || !Array.isArray(value.rigs) || value.rigs.length > ART_LIMITS.rigsPerOwner || value.drafts !== undefined && (!Array.isArray(value.drafts) || value.drafts.length > ART_LIMITS.drawingsPerOwner)) fail();
  return value;
}
function validateLinks(drawings: Drawing[], rigs: PortableRig[], drafts: PortableDraft[]) {
  const originals = new Map(drawings.map(item => [item.id, item])), versions = new Map(rigs.map(item => [item.id, item]));
  for (const original of drawings) {
    let current = original; const seen = new Set([original.id]);
    while (current.sourceId) {
      const parent = originals.get(current.sourceId);
      if (!parent || seen.has(parent.id) || current.sourceSha256 !== parent.sha256) fail();
      seen.add(parent.id); current = parent;
    }
    if (!original.sourceId && original.sourceSha256) fail();
  }
  const sourceValid = (assembly: DrawingAssembly) => { const source = originals.get(assembly.sourceId); if (!source || source.sha256 !== assembly.sourceSha256) fail(); };
  for (const rig of rigs) {
    sourceValid(rig.assembly); let parentId = rig.parentId; const seen = new Set([rig.id]);
    while (parentId !== null) {
      const parent = versions.get(parentId);
      if (!parent || seen.has(parent.id) || parent.assembly.sourceId !== rig.assembly.sourceId) fail();
      seen.add(parent.id); parentId = parent.parentId;
    }
  }
  for (const draft of drafts) {
    sourceValid(draft.assembly);
    if (draft.sourceId !== draft.assembly.sourceId || draft.parentId !== null && versions.get(draft.parentId)?.assembly.sourceId !== draft.sourceId) fail();
  }
}
async function validateAndPrepare(input: unknown, owner: string) {
  const bundle = parse(input), originals: Drawing[] = [], ids = new Set<string>();
  for (const item of bundle.drawings) {
    if (!object(item, ['id', 'name', 'mime', 'sha256', 'createdAt', 'sourceId', 'sourceSha256', 'category', 'semantic', 'semanticIdentity', 'archived', 'updatedAt', 'data']) || !identifier(item.id) || ids.has(item.id) || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 60 || !['image/png', 'image/jpeg'].includes(item.mime) || !hash(item.sha256) || !date(item.createdAt) || item.sourceId !== undefined && !identifier(item.sourceId) || item.sourceSha256 !== undefined && !hash(item.sourceSha256) || item.semanticIdentity !== undefined && !validSemanticIdentity(item.semanticIdentity) || item.category !== undefined && !DRAWING_CATEGORIES.includes(item.category) || item.archived !== undefined && typeof item.archived !== 'boolean' || item.updatedAt !== undefined && !date(item.updatedAt)) fail();
    ids.add(item.id); const prepared = await prepareDrawing(owner, item.name, new Blob([decode(item.data)], { type: item.mime }));
    if (prepared.sha256 !== item.sha256) throw Error('An image in this backup does not match its saved fingerprint. Nothing was imported.');
    const { data: _data, ...metadata } = item; originals.push(normalizeDrawingLabel({ ...prepared, ...metadata }));
  }
  const rigs: PortableRig[] = []; ids.clear();
  for (const item of bundle.rigs) {
    if (!object(item, ['id', 'parentId', 'assembly', 'savedAt']) || !identifier(item.id) || ids.has(item.id) || item.parentId !== null && !identifier(item.parentId) || !date(item.savedAt)) fail();
    ids.add(item.id); rigs.push({ ...item, assembly: validateAssembly(item.assembly) });
  }
  const drafts: PortableDraft[] = []; ids.clear();
  for (const item of bundle.drafts || []) {
    if (!object(item, ['sourceId', 'parentId', 'assembly', 'updatedAt']) || !identifier(item.sourceId) || ids.has(item.sourceId) || item.parentId !== null && !identifier(item.parentId) || !date(item.updatedAt)) fail();
    ids.add(item.sourceId); drafts.push({ ...item, assembly: validateAssembly(item.assembly) });
  }
  validateLinks(originals, rigs, drafts); checkArtCapacity(originals, rigs.map(item => ({ ...item, owner })));
  if (new TextEncoder().encode(JSON.stringify(drafts)).byteLength > ART_LIMITS.designBytes) fail();
  return { bundle: { ...bundle, rigs, ...(bundle.drafts ? { drafts } : {}) }, originals, rigs, drafts };
}
/** Full byte/schema preflight, with no persistent writes. */
export async function validateArtBundle(input: unknown): Promise<ArtBundle> { return (await validateAndPrepare(input, 'import-validation')).bundle; }

export async function exportArtBundle(owner: string, selection?: { drawingIds?: string[]; rigIds?: string[] }): Promise<ArtBundle> {
  artOwner(owner);
  const snapshot = await withArtTransaction(['drawings', 'rigs', 'drafts', 'meta'], 'readonly', async transaction => {
    const [originals, rigs, drafts, pending] = await Promise.all([
      ownerArtRecords<Drawing>(transaction, 'drawings', owner),
      ownerArtRecords<SavedRig>(transaction, 'rigs', owner),
      selection ? [] : ownerArtRecords<DrawingDraft>(transaction, 'drafts', owner),
      selection ? undefined : pendingSketchRecord(transaction, owner),
    ]);
    if (pending) {
      const alreadySaved = originals.find(drawing => drawing.id === pending.image.id);
      if (alreadySaved && !sameImage(alreadySaved,pending.image)) throw Error('The unfinished save conflicts with a saved version.');
      if (!alreadySaved) originals.push(pending.image);
    }
    return { originals: originals.map(normalizeDrawingLabel), rigs, drafts };
  });
  const selectedOriginals = new Set(selection ? selection.drawingIds || [] : snapshot.originals.map(item => item.id));
  const selectedRigs = new Set(selection ? selection.rigIds || [] : snapshot.rigs.map(item => item.id));
  if ([...selectedOriginals].some(id => !snapshot.originals.some(item => item.id === id)) || [...selectedRigs].some(id => !snapshot.rigs.some(item => item.id === id))) throw Error('Choose artwork or movement versions from this profile.');
  // A scene takes the selected versions and the ancestors they need.
  // Drafts and sibling experiments belong only in a full library backup.
  let changed = true;
  while (changed) {
    const before = selectedRigs.size + selectedOriginals.size;
    for (const rig of snapshot.rigs) if (selectedRigs.has(rig.id)) { selectedOriginals.add(rig.assembly.sourceId); if (rig.parentId) selectedRigs.add(rig.parentId); }
    for (const item of snapshot.originals) if (selectedOriginals.has(item.id) && item.sourceId) selectedOriginals.add(item.sourceId);
    changed = before !== selectedRigs.size + selectedOriginals.size;
  }
  const drawings = snapshot.originals.filter(item => selectedOriginals.has(item.id)).map(({ owner: _owner, bytes, preview: _preview, ...metadata }) => ({ ...metadata, data: encode(bytes) }));
  const rigs = snapshot.rigs.filter(item => selectedRigs.has(item.id)).map(({ owner: _owner, ...metadata }) => metadata);
  const drafts = snapshot.drafts.filter(item => selectedOriginals.has(item.sourceId)).map(({ owner: _owner, id: _id, ...metadata }) => metadata);
  const bundle: ArtBundle = { schema: 'jems.art-bundle.v1', exportedAt: new Date().toISOString(), drawings, rigs, ...(drafts.length ? { drafts } : {}) };
  // Export validates too: a corrupt local reference must not look like a complete backup.
  await validateAndPrepare(bundle, owner);
  return bundle;
}

function sameValue(a: unknown, b: unknown): boolean {
  const canonical = (value: any): any => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}
function sameImage(a: Drawing, b: Drawing): boolean {
  const aBytes = new Uint8Array(a.bytes), bBytes = new Uint8Array(b.bytes);
  return a.owner === b.owner && a.mime === b.mime && a.sha256 === b.sha256 && a.sourceId === b.sourceId && a.sourceSha256 === b.sourceSha256 &&
    a.bytes.byteLength === b.bytes.byteLength && aBytes.every((byte, index) => byte === bBytes[index]);
}
async function transferArt(owner: string, input: unknown, guard: ArtGuard | undefined, restore: boolean): Promise<ArtImportResult> {
  assertArtWrite(owner, guard); const prepared = await validateAndPrepare(input, owner); assertArtWrite(owner, guard);
  const drawingIds: Record<string, string> = Object.create(null), rigIds: Record<string, string> = Object.create(null);
  for (const item of prepared.originals) drawingIds[item.id] = restore ? item.id : crypto.randomUUID();
  for (const item of prepared.rigs) rigIds[item.id] = restore ? item.id : crypto.randomUUID();
  const drawings = prepared.originals.map(item => ({ ...item, id: drawingIds[item.id], owner, ...(item.sourceId ? { sourceId: drawingIds[item.sourceId] } : {}) }));
  const assembly = (value: DrawingAssembly) => validateAssembly({ ...value, sourceId: drawingIds[value.sourceId] });
  const rigs: SavedRig[] = prepared.rigs.map(item => ({ ...item, owner, id: rigIds[item.id], parentId: item.parentId ? rigIds[item.parentId] : null, assembly: assembly(item.assembly) }));
  const drafts: DrawingDraft[] = prepared.drafts.map(item => ({ ...item, owner, id: JSON.stringify([owner, drawingIds[item.sourceId]]), sourceId: drawingIds[item.sourceId], parentId: item.parentId ? rigIds[item.parentId] : null, assembly: assembly(item.assembly) }));
  return withArtTransaction(['drawings', 'rigs', 'drafts', 'meta'], 'readwrite', async transaction => {
    const existingDrawings = await artRequest(transaction.objectStore('drawings').getAll()) as Drawing[];
    const existingRigs = await artRequest(transaction.objectStore('rigs').getAll()) as SavedRig[];
    const existingDrafts = await artRequest(transaction.objectStore('drafts').getAll()) as DrawingDraft[];
    const originalMap = new Map(existingDrawings.map(item => [item.id, item])), rigMap = new Map(existingRigs.map(item => [item.id, item])), draftMap = new Map(existingDrafts.map(item => [item.id, item]));
    const newDrawings: Drawing[] = [], newRigs: SavedRig[] = [], newDrafts: DrawingDraft[] = [];
    for (const item of drawings) {
      const current = originalMap.get(item.id);
      if (current) {
        if (!restore || !sameImage(current, item)) throw Error('An artwork ID in this backup is already used by different art or another profile. Nothing was restored. Open the library as a new copy instead.');
      } else newDrawings.push(item);
    }
    for (const item of rigs) {
      const current = rigMap.get(item.id);
      if (current) {
        if (!restore || current.owner !== owner || current.parentId !== item.parentId || !sameValue(validateAssembly(current.assembly), item.assembly)) throw Error('A movement version ID in this backup has different saved parts or belongs to another profile. Nothing was restored. Open the library as a new copy instead.');
      } else newRigs.push(item);
    }
    // Restoring references must not replace a newer local recovery draft.
    for (const item of drafts) if (!draftMap.has(item.id)) newDrafts.push(item);
    checkArtCapacity([...existingDrawings, ...newDrawings], [...existingRigs, ...newRigs]);
    if (new TextEncoder().encode(JSON.stringify([...existingDrafts, ...newDrafts])).byteLength > ART_LIMITS.designBytes) throw Error('There is not enough room for all the imported drafts. Nothing was imported.');
    const pending = await pendingSketchRecord(transaction,owner);
    const recovered = pending && drawings.find(drawing => drawing.id === pending.image.id);
    if (recovered && !sameImage(recovered,pending!.image)) throw Error('This backup conflicts with an unfinished drawing.');
    assertArtWrite(owner, guard);
    if (recovered) clearSketchRecord(transaction,owner);
    await checkReservedArtRoom(transaction,[...existingDrawings,...newDrawings].map(artFootprint));
    assertArtWrite(owner,guard);
    for (const item of newDrawings) {transaction.objectStore('drawings').add(item);saveDrawingMetadata(transaction,item);}
    for (const item of newRigs) transaction.objectStore('rigs').add(item);
    for (const item of newDrafts) transaction.objectStore('drafts').add(item);
    return { drawings: drawings.map(item => originalMap.get(item.id) || item), rigs: rigs.map(item => rigMap.get(item.id) || item), drawingIds, rigIds };
  });
}
/** Additive by design: import never replaces another saved original or promotes a car. */
export const importArtBundle = (owner: string, input: unknown, guard?: ArtGuard) => transferArt(owner, input, guard, false);
/** Explicit restore preserves immutable references so progress backups reconnect.
 * Identical same-owner entries are reused unchanged; every conflicting ID rejects
 * the whole restore. The caller must explain selecting the original profile. */
export const restoreArtBundle = (owner: string, input: unknown, guard?: ArtGuard) => transferArt(owner, input, guard, true);

/** Full-family recovery runs under the host maintenance lock, never the active
 * child editor. Original image and rig identities remain additive and immutable. */
export async function restoreFamilyArtBundles(bundles:{owner:string;bundle:ArtBundle;activeRigId?:string|null}[],allowedOwners:string[],assertAuthorized:()=>void):Promise<void> {
  assertRewardSourceLockHeld();assertAuthorized();
  if(new Set(allowedOwners).size!==allowedOwners.length||allowedOwners.length<1||allowedOwners.length>6||new Set(bundles.map(x=>x.owner)).size!==bundles.length||bundles.some(x=>!allowedOwners.includes(x.owner)))throw Error('Choose artwork belonging to this recovery point.');
  const prepared=await Promise.all(bundles.map(async item=>({owner:item.owner,activeRigId:item.activeRigId,...await validateAndPrepare(item.bundle,item.owner)})));
  assertAuthorized();
  await withArtTransaction(['drawings','rigs','drafts','active','meta'],'readwrite',async tx=>{
    const drawings=await artRequest(tx.objectStore('drawings').getAll()) as Drawing[],rigs=await artRequest(tx.objectStore('rigs').getAll()) as SavedRig[],drafts=await artRequest(tx.objectStore('drafts').getAll()) as DrawingDraft[];
    const images=new Map(drawings.map(x=>[x.id,x])),versions=new Map(rigs.map(x=>[x.id,x])),draftIds=new Set(drafts.map(x=>x.id));
    const addImages:Drawing[]=[],addVersions:SavedRig[]=[],addDrafts:DrawingDraft[]=[];
    for(const source of prepared){
      const pending = await pendingSketchRecord(tx,source.owner);
      const recovered = pending && source.originals.find(drawing => drawing.id === pending.image.id);
      if (recovered && !sameImage(recovered,pending!.image)) throw Error('This recovery point conflicts with an unfinished drawing.');
      if (recovered) clearSketchRecord(tx,source.owner);
      if(source.activeRigId!==undefined&&source.activeRigId!==null&&!source.rigs.some(rig=>rig.id===source.activeRigId))throw Error('A selected movement version is unavailable in this recovery point.');
      for(const image of source.originals){const prior=images.get(image.id);if(prior&&!sameImage(prior,image))throw Error('A saved picture conflicts with this recovery point. Your originals were not replaced.');if(!prior){images.set(image.id,image);addImages.push(image);}}
      for(const item of source.rigs){const rig={...item,owner:source.owner},prior=versions.get(rig.id);if(prior&&(prior.owner!==rig.owner||prior.parentId!==rig.parentId||!sameValue(prior.assembly,rig.assembly)))throw Error('A saved movement version conflicts with this recovery point.');if(!prior){versions.set(rig.id,rig);addVersions.push(rig);}}
      for(const item of source.drafts){const draft={...item,owner:source.owner,id:JSON.stringify([source.owner,item.sourceId])};if(!draftIds.has(draft.id)){draftIds.add(draft.id);addDrafts.push(draft);}}
    }
    await checkReservedArtRoom(tx,[...drawings,...addImages].map(artFootprint));
    checkArtCapacity([...drawings,...addImages],[...rigs,...addVersions]);if(new TextEncoder().encode(JSON.stringify([...drafts,...addDrafts])).byteLength>ART_LIMITS.designBytes)throw Error('There is not enough room for the recovered artwork drafts.');
    assertRewardSourceLockHeld();assertAuthorized();for(const item of addImages){tx.objectStore('drawings').add(item);saveDrawingMetadata(tx,item);}for(const item of addVersions)tx.objectStore('rigs').add(item);for(const item of addDrafts)tx.objectStore('drafts').add(item);for(const source of prepared){if(source.activeRigId===null)tx.objectStore('active').delete(source.owner);else if(source.activeRigId!==undefined)tx.objectStore('active').put({owner:source.owner,id:source.activeRigId});}
  });
}
