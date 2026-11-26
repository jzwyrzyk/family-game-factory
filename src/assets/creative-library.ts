import { activeArtView, normalizeDrawingLabel, originalFor } from './art-lineage';
import { type DrawingCategory, drawingHash } from './private-drawings';
import { type DrawingMetadata, ART_LIMITS, artOwner, artRequest, ownerArtRecords, withArtTransaction } from '../drawing/library';
import { validateAssembly, type DrawingAssembly } from '../drawing/model';
import type { SavedRig } from '../drawing/store';
import { privateArtId } from '../creation/projects';

/** Host-only catalog. A selection always carries an exact revision pin. */
export interface CreativeAssetChoice {
  logicalId: string;
  originalId: string;
  originalSha256: string;
  logicalName: string;
  drawingId: string;
  sourceSha256: string;
  rigId?: string;
  rigKind?:DrawingAssembly['kind'];
  assetId: string;
  sha256: string;
  archived: boolean;
  representation: 'image' | 'cutout' | 'animation';
  label: string;
  detail: string;
  category: DrawingCategory;
  semanticIdentity?: string;
  preview?: ArrayBuffer;
  savedAt:string;
  revisionNumber:number;
}

export async function assemblyHash(input: DrawingAssembly): Promise<string> {
  return drawingHash(new TextEncoder().encode(JSON.stringify(validateAssembly(input))).buffer);
}

function imageChoice(image: DrawingMetadata, root: DrawingMetadata): CreativeAssetChoice {
  return {
    archived: Boolean(image.archived), logicalId: root.id, originalId: root.id, originalSha256: root.sha256, logicalName: root.name,
    drawingId: image.id, sourceSha256: image.sha256, label: image.name, category: image.category ?? 'other',
    savedAt:image.createdAt,revisionNumber:1,preview:image.preview,semanticIdentity: normalizeDrawingLabel(image).semanticIdentity, assetId: privateArtId({kind:'image',id:image.id,sha256:image.sha256}),
    sha256: image.sha256, representation:'image',detail:image.sourceId?'Edited picture':'Original artwork',
  };
}

/** A selected revision needs only its ancestry. The game never receives the catalog. */
export async function selectedCreativeImage(owner:string, drawingId:string) {
  artOwner(owner);
  return withArtTransaction(['drawingMetadata'],'readonly',async tx=>{
    const chain=new Map<string,DrawingMetadata>();
    let key:string|undefined=drawingId;
    while(key && !chain.has(key) && chain.size<ART_LIMITS.drawingsPerOwner){
      const row:DrawingMetadata|undefined=await artRequest(tx.objectStore('drawingMetadata').get(key));
      if(!row || row.owner!==owner)throw Error('Restore the original picture in My Art.');
      chain.set(key,row);
      key=row.sourceId;
    }
    const selected=chain.get(drawingId);
    if(!selected)throw Error('Choose a picture in My Art.');
    return imageChoice(selected,originalFor(selected,chain));
  });
}

export async function listCreativeAssetChoices(owner: string, current: () => boolean = () => true, includeArchived = false): Promise<CreativeAssetChoice[]> {
  artOwner(owner);
  const visible = activeArtView(owner,current);
  const check = () => { if (!visible()) throw Error('The player changed. Reopen your artwork.'); };
  check();
  const [images, rigs] = await withArtTransaction(['drawingMetadata', 'rigs'], 'readonly', tx => Promise.all([
    ownerArtRecords<DrawingMetadata>(tx, 'drawingMetadata', owner),
    ownerArtRecords<SavedRig>(tx, 'rigs', owner),
  ]));
  check();
  const byId = new Map(images.map(image => [image.id, image]));
  const result: CreativeAssetChoice[] = [];
  const indexes=new Map<string,number>();
  const revisions=new Map<string,number>();
  for(const image of [...images].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id))){
    const root=originalFor(image,byId);
    revisions.set(root.id,(revisions.get(root.id)??0)+1);
    indexes.set(image.id,revisions.get(root.id)!);
  }
  rigs.sort((a, b) => b.savedAt.localeCompare(a.savedAt) || b.id.localeCompare(a.id));
  images.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  for (const image of images) {
    if (image.archived && !includeArchived) continue;
    const root = originalFor(image, byId);
    const common = imageChoice(image,root);
    common.revisionNumber=indexes.get(image.id)!;result.push(common);
    const versions = rigs.filter(rig => rig.assembly.sourceId === image.id && rig.assembly.sourceSha256 === image.sha256);
    for (const [index, rig] of versions.entries()) {
      const sha256 = await assemblyHash(rig.assembly);
      check();
      const animated = 'motion' in rig.assembly && Boolean(rig.assembly.motion);
      result.push({
        ...common, savedAt:rig.savedAt, rigId: rig.id, rigKind:rig.assembly.kind, sha256, representation: animated ? 'animation' : 'cutout',
        assetId: privateArtId({ kind: 'rig', id: rig.id, sha256 }),
        detail: (animated ? 'Animation path' : index === 0 ? 'Latest saved cutout design' : 'Saved cutout design')
          + (versions.length > 1 ? ' · ' + (versions.length - index) : ''),
      });
    }
  }
  return result;
}
