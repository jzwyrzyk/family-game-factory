import {creativeOriginal} from './creative-identity';
import type {DrawingCategory} from './private-drawings';
import {withArtTransaction, ownerArtRecords, type DrawingMetadata} from '../drawing/library';
import {validateAssembly, type DrawingKind, type DrawingAssembly} from '../drawing/model';
import type {SavedRig} from '../drawing/store';
import {privateArtId} from '../creation/projects';

export interface CreativeAssetChoice {
  /** Host-only logical identity. The runtime receives the pinned assetId. */
  identityId:string;
  identityName:string;
  originalSha256:string;
  drawingId:string;
  drawingSha256:string;
  parentDrawingId?:string;
  rigId?:string;
  rigKind?:DrawingKind;
  assetId:string;
  label:string;
  detail:string;
  category:DrawingCategory;
  semanticIdentity:string;
  preview?:ArrayBuffer;
}

export async function assemblyHash(assembly:DrawingAssembly) {
  const bytes = new TextEncoder().encode(JSON.stringify(validateAssembly(assembly)));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2,'0')).join('');
}

/** One bounded, owner-scoped snapshot. Include archived ancestors solely to
 * resolve identity. Existing consumers may still resolve archived pinned IDs. */
export async function creativeAssetChoices(owner:string, current:()=>boolean, relatedToDrawingId?:string):Promise<CreativeAssetChoice[]> {
  function check() {
    const activeOwner = typeof window !== 'undefined' ? (window as any).FG?.store?.current?.()?.id : undefined;
    if (!current() || activeOwner !== undefined && String(activeOwner) !== owner)
      throw Error('The player changed. Reopen My Art.');
  }
  check();
  const [images, rigs] = await withArtTransaction(['drawingMetadata','rigs'],'readonly', transaction =>
    Promise.all([ownerArtRecords<DrawingMetadata>(transaction,'drawingMetadata',owner), ownerArtRecords<SavedRig>(transaction,'rigs',owner)]));
  check();
  const byId = new Map(images.map(image => [image.id,image]));
  const selected = relatedToDrawingId === undefined ? undefined : byId.get(relatedToDrawingId);
  if (relatedToDrawingId !== undefined && !selected) throw Error('Restore this picture in My Art to choose another version.');
  const family = selected && creativeOriginal(selected,byId);
  images.sort((a,b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
  rigs.sort((a,b) => b.savedAt.localeCompare(a.savedAt) || a.id.localeCompare(b.id));
  const choices:CreativeAssetChoice[] = [];
  for (const image of images) {
    if (image.archived) continue;
    const root = creativeOriginal(image, byId);
    if (family && root.id !== family.id) continue;
    const picture:CreativeAssetChoice = {
      identityId:root.id, identityName:root.name, originalSha256:root.sha256,
      drawingId:image.id, drawingSha256:image.sha256, parentDrawingId:image.sourceId,
      label:image.name, category:image.category || 'other', semanticIdentity:root.semanticIdentity || '',
      detail:image.sourceId ? 'Edited picture' : 'Original artwork', preview:image.preview,
      assetId:privateArtId({kind:'image',id:image.id,sha256:image.sha256})
    };
    choices.push(picture);
    const versions = rigs.filter(rig => rig.assembly.sourceId === image.id && rig.assembly.sourceSha256 === image.sha256);
    for (const [index,rig] of versions.entries()) {
      const sha256 = await assemblyHash(rig.assembly);
      check();
      const version = versions.length - index;
      const detail = index === 0 ? 'Latest saved cutout design' : 'Saved cutout design';
      choices.push({...picture, rigId:rig.id, rigKind:rig.assembly.kind, detail:detail+' · '+version,
        assetId:privateArtId({kind:'rig',id:rig.id,sha256})});
    }
  }
  return choices;
}
