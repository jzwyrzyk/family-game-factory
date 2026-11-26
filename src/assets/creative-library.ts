import { originalFor } from './art-lineage';
import { type DrawingCategory, drawingHash } from './private-drawings';
import { type DrawingMetadata, artOwner, ownerArtRecords, withArtTransaction } from '../drawing/library';
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
  assetId: string;
  sha256: string;
  archived: boolean;
  representation: 'image' | 'cutout' | 'animation';
  label: string;
  detail: string;
  category: DrawingCategory;
  semanticIdentity?: string;
}

export async function assemblyHash(input: DrawingAssembly): Promise<string> {
  return drawingHash(new TextEncoder().encode(JSON.stringify(validateAssembly(input))).buffer);
}

export async function listCreativeAssetChoices(owner: string, current: () => boolean = () => true, includeArchived = false): Promise<CreativeAssetChoice[]> {
  artOwner(owner);
  const check = () => { if (!current()) throw Error('The player or page changed. Reopen your artwork.'); };
  check();
  const [images, rigs] = await withArtTransaction(['drawingMetadata', 'rigs'], 'readonly', tx => Promise.all([
    ownerArtRecords<DrawingMetadata>(tx, 'drawingMetadata', owner),
    ownerArtRecords<SavedRig>(tx, 'rigs', owner),
  ]));
  check();
  const byId = new Map(images.map(image => [image.id, image]));
  const result: CreativeAssetChoice[] = [];
  rigs.sort((a, b) => b.savedAt.localeCompare(a.savedAt) || b.id.localeCompare(a.id));
  images.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  for (const image of images) {
    if (image.archived && !includeArchived) continue;
    const root = originalFor(image, byId);
    const common = {
      archived: Boolean(image.archived), logicalId: root.id, originalId: root.id, originalSha256: root.sha256, logicalName: root.name,
      drawingId: image.id, sourceSha256: image.sha256, label: image.name, category: image.category ?? 'other',
      semanticIdentity: image.semanticIdentity,
    };
    result.push({
      ...common, assetId: privateArtId({ kind: 'image', id: image.id, sha256: image.sha256 }),
      sha256: image.sha256, representation: 'image', detail: image.sourceId ? 'Edited picture' : 'Original artwork',
    });
    const versions = rigs.filter(rig => rig.assembly.sourceId === image.id && rig.assembly.sourceSha256 === image.sha256);
    for (const [index, rig] of versions.entries()) {
      const sha256 = await assemblyHash(rig.assembly);
      check();
      const animated = 'motion' in rig.assembly && Boolean(rig.assembly.motion);
      result.push({
        ...common, rigId: rig.id, sha256, representation: animated ? 'animation' : 'cutout',
        assetId: privateArtId({ kind: 'rig', id: rig.id, sha256 }),
        detail: (animated ? 'Animation path' : index === 0 ? 'Latest saved cutout design' : 'Saved cutout design')
          + (versions.length > 1 ? ' · ' + (versions.length - index) : ''),
      });
    }
  }
  return result;
}
