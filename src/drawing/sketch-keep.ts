import {DRAWING_CATEGORIES, drawingHash, saveDrawing, type Drawing, type DrawingCategory} from '../assets/private-drawings';
import {ART_LIMITS, artOwner, artRequest, assertArtWrite, withArtTransaction, type ArtGuard, type DrawingMetadata} from './library';
import {readSketch, sketchPng, verifySketchPixels} from './sketch';
import {parseSheet, type Sheet} from './workspace-engine';
import {
  pendingSketchRecord, clearSketchRecord, artFootprint, checkReservedArtRoom, invalidSketchKeep,
  sketchKeepKey, sketchSizeKey, sketchSizeRange, sketchUuid, type KeepRecord,
} from './sketch-keep-record';

export interface SketchKeep {
  token: string;
  name: string;
  category: DrawingCategory;
  sheet: Sheet;
  sourceId?: string;
  sourceSha256?: string;
}
async function currentSketchRecord(owner:string) {
  artOwner(owner);
  const current = () => (window as any).FG?.store?.current?.()?.id === owner;
  if (!current()) throw Error('Open My Art for the explorer who owns this page.');
  const record = await withArtTransaction(['meta'], 'readonly', tx => pendingSketchRecord(tx, owner));
  if (!current()) throw Error('The explorer changed. Open My Art again.');
  return record;
}

async function editableKeep(record:KeepRecord): Promise<SketchKeep> {
  const {image} = record, sheet = readSketch(image.bytes);
  if (!sheet || await drawingHash(image.bytes) !== image.sha256) throw invalidSketchKeep();
  return {token: record.token, name: image.name, category: image.category ?? 'other', sheet,
    ...(image.sourceId ? {sourceId: image.sourceId, sourceSha256: image.sourceSha256} : {})};
}

export async function readSketchKeep(owner: string): Promise<SketchKeep | null> {
  const record = await currentSketchRecord(owner);
  return record ? editableKeep(record) : null;
}

export async function verifySketchKeep(owner:string, token:string):Promise<SketchKeep> {
  const record = await currentSketchRecord(owner);
  if (!record || record.token !== token) throw invalidSketchKeep();
  const keep = await editableKeep(record);
  await verifySketchPixels(record.image.bytes,keep.sheet);
  return keep;
}

export async function stageSketchKeep(owner: string, keep: SketchKeep, guard: ArtGuard, canvas: HTMLCanvasElement): Promise<Blob> {
  assertArtWrite(owner, guard);
  const sheet = parseSheet(keep.sheet);
  if (!sketchUuid.test(keep.token) || !keep.name.trim() || keep.name.trim() !== keep.name || keep.name.length > 60 ||
      !DRAWING_CATEGORIES.includes(keep.category) || !sheet.marks.length || Boolean(keep.sourceId) !== Boolean(keep.sourceSha256))
    throw invalidSketchKeep();
  // Capture once. A later browser/encoder, revised stamp file or export cannot change
  // the original pixels of a Keep that reached the journal.
  const url = canvas.toDataURL('image/png'), prefix = 'data:image/png;base64,';
  if (!url.startsWith(prefix) || url.length > prefix.length + 4 * Math.ceil(ART_LIMITS.imageBytes / 3)) throw invalidSketchKeep();
  const pixels = Uint8Array.from(atob(url.slice(prefix.length)), char => char.charCodeAt(0));
  const file = sketchPng(new Blob([pixels], {type:'image/png'}), sheet);
  const bytes = await file.arrayBuffer(), sha256 = await drawingHash(bytes);
  return withArtTransaction(['meta', 'drawingMetadata'], 'readwrite', async tx => {
    const prior = await pendingSketchRecord(tx, owner);
    if (prior && prior.token !== keep.token) throw Error('Finish or discard your earlier save before keeping another page.');
    const metadata = tx.objectStore('drawingMetadata');
    const source: DrawingMetadata | undefined = keep.sourceId ? await artRequest(metadata.get(keep.sourceId)) : undefined;
    if (keep.sourceId && (source?.owner !== owner || source.sha256 !== keep.sourceSha256))
      throw Error('The original version needs recovery before this page can be kept.');
    if (prior && prior.image.sourceId !== keep.sourceId) throw invalidSketchKeep();
    const sameSheet = prior && JSON.stringify(readSketch(prior.image.bytes)) === JSON.stringify(sheet);
    if (sameSheet && prior.image.name === keep.name && prior.image.category === (source?.category ?? keep.category)) {
      assertArtWrite(owner,guard);
      return new Blob([prior.image.bytes], {type:'image/png'});
    }
    const sameImage = prior?.image.sha256 === sha256;
    const id = sameImage ? prior!.image.id : crypto.randomUUID();
    if (await artRequest(metadata.getKey(id))) throw Error('This version is already in My Art. Open it there.');
    const sizes: {id:string;size:number}[] = await artRequest(tx.objectStore('meta').getAll(sketchSizeRange()));
    const total = sizes.reduce((n,row) => n + (row.id === sketchSizeKey(owner) ? 0 : row.size), bytes.byteLength);
    if (!Number.isSafeInteger(total) || total > ART_LIMITS.designBytes)
      throw Error('There is not enough room to protect this save. Finish or discard an earlier save and try again.');
    assertArtWrite(owner, guard);
    const image: Drawing = {id, owner, name: keep.name, mime:'image/png', bytes, sha256,
      createdAt: sameImage ? prior!.image.createdAt : new Date().toISOString(), category:source?.category ?? keep.category,
      ...(source ? {sourceId: source.id, sourceSha256: source.sha256, ...(source.semanticIdentity ? {semanticIdentity: source.semanticIdentity} : {})} : {})};
    tx.objectStore('meta').put({id:sketchKeepKey(owner), token:keep.token, image} satisfies KeepRecord);
    tx.objectStore('meta').put({id:sketchSizeKey(owner),owner,revisionId:id,size:bytes.byteLength});
    const saved: DrawingMetadata[] = await artRequest(metadata.getAll());
    await checkReservedArtRoom(tx,saved.map(artFootprint));
    assertArtWrite(owner,guard);
    return file;
  });
}

/** Finish a previously requested Keep using its captured pixels, even on a browser
 * whose drawing renderer cannot reproduce the earlier editable source. */
export async function finishSketchKeep(owner:string, token:string, guard:ArtGuard):Promise<Drawing> {
  assertArtWrite(owner,guard);
  const record = await currentSketchRecord(owner);
  if (!record || record.token !== token) throw invalidSketchKeep();
  const {image} = record;
  return saveDrawing(owner,image.name,new Blob([image.bytes],{type:'image/png'}),image.sourceId,guard,image.category,token);
}

export async function discardSketchKeep(owner:string, token:string, guard:ArtGuard) {
  assertArtWrite(owner,guard);
  await withArtTransaction(['meta'], 'readwrite', async tx => {
    const record = await pendingSketchRecord(tx,owner);
    if (record && record.token !== token) throw Error('The unfinished save has changed. Open it again.');
    assertArtWrite(owner,guard);
    clearSketchRecord(tx,owner);
  });
}
