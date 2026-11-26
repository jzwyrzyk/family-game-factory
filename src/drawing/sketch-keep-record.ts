import type {Drawing} from '../assets/private-drawings';
import {ART_LIMITS,artRequest,type DrawingMetadata} from './library';

export interface KeepRecord { id: string; token: string; image: Drawing }
export const sketchKeepKey = (owner: string) => 'sketch-keep:' + owner;
export const sketchSizeKey = (owner: string) => 'sketch-keep-size:' + owner;
export const sketchUuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
export const sketchSizeRange = () => IDBKeyRange.bound('sketch-keep-size:', 'sketch-keep-size;');
export const invalidSketchKeep = () => Error('This unfinished save needs recovery. Your other artwork is safe.');

export async function pendingSketchRecord(tx: IDBTransaction, owner: string): Promise<KeepRecord | undefined> {
  const record: KeepRecord | undefined = await artRequest(tx.objectStore('meta').get(sketchKeepKey(owner)));
  if (record && (record.id !== sketchKeepKey(owner) || !sketchUuid.test(record.token) || record.image?.owner !== owner ||
      !sketchUuid.test(record.image.id) || !(record.image.bytes instanceof ArrayBuffer) || record.image.bytes.byteLength > ART_LIMITS.imageBytes))
    throw invalidSketchKeep();
  return record;
}
export function clearSketchRecord(tx: IDBTransaction, owner: string) {
  const meta = tx.objectStore('meta');
  meta.delete(sketchKeepKey(owner));
  meta.delete(sketchSizeKey(owner));
}
interface ArtFootprint {id:string;owner:string;size:number}
export function artFootprint(image: Drawing | DrawingMetadata): ArtFootprint {
  return {id:image.id, owner:image.owner, size:('bytes' in image ? image.bytes.byteLength : image.originalBytes) + (image.preview?.byteLength ?? 0)};
}

/** Count unfinished pictures against the same slot and byte ceilings as saved pictures.
 * Small reservation rows let a quota check avoid opening a sibling profile's private PNG. */
export async function checkReservedArtRoom(tx: IDBTransaction, pictures: ArtFootprint[]) {
  const reservations: {owner:string;revisionId:string;size:number}[] = await artRequest(tx.objectStore('meta').getAll(sketchSizeRange()));
  const occupied = new Map(pictures.map(picture => [picture.id,picture]));
  for (const reservation of reservations) {
    if (typeof reservation.owner !== 'string' || !sketchUuid.test(reservation.revisionId) ||
        !Number.isSafeInteger(reservation.size) || reservation.size < 1 || reservation.size > ART_LIMITS.imageBytes)
      throw invalidSketchKeep();
    if (!occupied.has(reservation.revisionId)) occupied.set(reservation.revisionId,{id:reservation.revisionId,owner:reservation.owner,size:reservation.size});
  }
  let total = 0;
  const counts = new Map<string,number>();
  for (const picture of occupied.values()) {
    total += picture.size;
    const count = (counts.get(picture.owner) ?? 0) + 1;
    if (!Number.isSafeInteger(total) || total > ART_LIMITS.storageBytes || count > ART_LIMITS.drawingsPerOwner)
      throw Error('Your art storage is full. Keep a complete backup before adding more pictures.');
    counts.set(picture.owner,count);
  }
}
