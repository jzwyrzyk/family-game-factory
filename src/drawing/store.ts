import { validateAssembly, vehicleGeometry, type DrawingAssembly } from './model';
import type { Drawing } from '../assets/private-drawings';
import { artOwner, artRequest,ownerArtRecords, assertArtWrite, checkArtCapacity, withArtTransaction, type ArtGuard } from './library';
export interface SavedRig { id: string; owner: string; parentId: string | null; assembly: DrawingAssembly; savedAt: string }
export interface DrawingDraft { id: string; owner: string; sourceId: string; parentId: string | null; assembly: DrawingAssembly; updatedAt: string }
const draftKey = (owner: string, sourceId: string) => JSON.stringify([owner, sourceId]);
function validateParentId(parentId: string | null) { if (parentId !== null && (typeof parentId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(parentId))) throw Error('Choose a saved movement version to continue.'); }
const sameDesign = (a: DrawingAssembly, b: DrawingAssembly) => JSON.stringify({ ...a, revision: 0 }) === JSON.stringify({ ...b, revision: 0 });
function validSource(original: Drawing | undefined, owner: string, assembly: DrawingAssembly) {
  if (!original || original.owner !== owner || original.sha256 !== assembly.sourceSha256) throw Error('This original is unavailable in your profile. Your earlier saved design is safe.');
}
export async function listRigs(owner: string): Promise<SavedRig[]> {
  artOwner(owner); return withArtTransaction(['rigs'], 'readonly', async transaction => (await ownerArtRecords<SavedRig>(transaction,'rigs',owner)).sort((a, b) => b.savedAt.localeCompare(a.savedAt)));
}
export async function rigById(owner: string, id: string): Promise<SavedRig> {
  artOwner(owner);
  return withArtTransaction(['drawings', 'rigs'], 'readonly', async transaction => {
    const rig = await artRequest(transaction.objectStore('rigs').get(id)) as SavedRig | undefined;
    if (!rig || rig.owner !== owner) throw Error('This movement version belongs to another player or is unavailable.');
    const assembly = validateAssembly(rig.assembly), original = await artRequest(transaction.objectStore('drawings').get(assembly.sourceId)) as Drawing | undefined;
    validSource(original, owner, assembly); return { ...rig, assembly };
  });
}
export async function saveRig(owner: string, input: DrawingAssembly, parentId: string | null = null, guard?: ArtGuard): Promise<SavedRig> {
  assertArtWrite(owner, guard); validateParentId(parentId); const assembly = validateAssembly(input);
  return withArtTransaction(['drawings', 'rigs', 'drafts'], 'readwrite', async transaction => {
    const original = await artRequest(transaction.objectStore('drawings').get(assembly.sourceId)) as Drawing | undefined; validSource(original, owner, assembly);
    const store = transaction.objectStore('rigs'), all = await artRequest(store.getAll()) as SavedRig[];
    if (parentId && !all.some(rig => rig.id === parentId && rig.owner === owner && rig.assembly.sourceId === assembly.sourceId)) throw Error('Cannot continue that movement version.');
    const entry: SavedRig = { id: crypto.randomUUID(), owner, parentId, assembly, savedAt: new Date().toISOString() };
    checkArtCapacity([], [...all, entry]);
    const key = draftKey(owner, assembly.sourceId), draft = await artRequest(transaction.objectStore('drafts').get(key)) as DrawingDraft | undefined;
    assertArtWrite(owner, guard); store.add(entry);
    if (draft && sameDesign(draft.assembly, assembly)) transaction.objectStore('drafts').delete(key);
    return entry;
  });
}
export async function selectRig(owner: string, id: string, guard?: ArtGuard) {
  assertArtWrite(owner, guard);
  return withArtTransaction(['drawings', 'rigs', 'active'], 'readwrite', async transaction => {
    const rig = await artRequest(transaction.objectStore('rigs').get(id)) as SavedRig | undefined;
    if (!rig || rig.owner !== owner) throw Error('Choose a saved movement version in this profile.');
    const assembly = validateAssembly(rig.assembly); vehicleGeometry(assembly);
    const original = await artRequest(transaction.objectStore('drawings').get(assembly.sourceId)) as Drawing | undefined; validSource(original, owner, assembly);
    assertArtWrite(owner, guard); transaction.objectStore('active').put({ owner, id });
  });
}
export async function activeRig(owner: string): Promise<SavedRig | null> {
  if (!owner) return null;
  const choice = await withArtTransaction(['active'], 'readonly', transaction => artRequest(transaction.objectStore('active').get(owner))) as { id: string } | undefined;
  if (!choice) return null;
  try { return await rigById(owner, choice.id); } catch { return null; }
}
export async function clearRig(owner: string, guard?: ArtGuard) {
  assertArtWrite(owner, guard); return withArtTransaction(['active'], 'readwrite', transaction => { assertArtWrite(owner, guard); transaction.objectStore('active').delete(owner); });
}
export async function loadDrawingDraft(owner: string, sourceId: string): Promise<DrawingDraft | null> {
  artOwner(owner);
  return withArtTransaction(['drawings', 'rigs', 'drafts'], 'readonly', async transaction => {
    const draft = await artRequest(transaction.objectStore('drafts').get(draftKey(owner, sourceId))) as DrawingDraft | undefined;
    if (!draft) return null;
    if (draft.owner !== owner || draft.sourceId !== sourceId) throw Error('This draft belongs to another artwork.');
    const assembly = validateAssembly(draft.assembly), original = await artRequest(transaction.objectStore('drawings').get(sourceId)) as Drawing | undefined;
    validSource(original, owner, assembly);
    if (draft.parentId) {
      const parent = await artRequest(transaction.objectStore('rigs').get(draft.parentId)) as SavedRig | undefined;
      if (!parent || parent.owner !== owner || parent.assembly.sourceId !== sourceId) throw Error('The saved version for this draft is unavailable.');
    }
    return { ...draft, assembly };
  });
}
export async function saveDrawingDraft(owner: string, input: DrawingAssembly, parentId: string | null = null, guard?: ArtGuard): Promise<DrawingDraft> {
  assertArtWrite(owner, guard); validateParentId(parentId); const assembly = validateAssembly(input);
  return withArtTransaction(['drawings', 'rigs', 'drafts'], 'readwrite', async transaction => {
    const original = await artRequest(transaction.objectStore('drawings').get(assembly.sourceId)) as Drawing | undefined; validSource(original, owner, assembly);
    if (parentId) {
      const parent = await artRequest(transaction.objectStore('rigs').get(parentId)) as SavedRig | undefined;
      if (!parent || parent.owner !== owner || parent.assembly.sourceId !== assembly.sourceId) throw Error('Cannot continue that saved movement version.');
    }
    const draft: DrawingDraft = { id: draftKey(owner, assembly.sourceId), owner, sourceId: assembly.sourceId, parentId, assembly, updatedAt: new Date().toISOString() };
    const store = transaction.objectStore('drafts'), all = await artRequest(store.getAll()) as DrawingDraft[];
    if (new TextEncoder().encode(JSON.stringify([...all.filter(item => item.id !== draft.id), draft])).byteLength > 8 * 1024 * 1024) throw Error('Draft storage is full. Save a movement version before starting more drafts.');
    assertArtWrite(owner, guard); store.put(draft); return draft;
  });
}
export async function deleteDrawingDraft(owner: string, sourceId: string, guard?: ArtGuard) {
  assertArtWrite(owner, guard); return withArtTransaction(['drafts'], 'readwrite', transaction => { assertArtWrite(owner, guard); transaction.objectStore('drafts').delete(draftKey(owner, sourceId)); });
}
