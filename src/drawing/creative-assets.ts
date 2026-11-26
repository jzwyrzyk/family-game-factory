import { type DrawingCategory } from '../assets/private-drawings';
import {semanticWord} from './semantic-identity';
import { ownerArtRecords, withArtTransaction, type DrawingMetadata } from './library';

/** Owner-local identity joins exact stored revisions without assigning scene or game mechanics. */
export interface CreativeAssetRevision {
  owner: string;
  assetId: string;
  revisionId: string;
  sha256: string;
  parentRevisionId?: string;
  name: string;
  assetName: string;
  category: DrawingCategory;
  semanticName?: string;
  archived: boolean;
  createdAt: string;
}

type LineageNode = Pick<DrawingMetadata, 'id' | 'owner' | 'sourceId' | 'sha256' | 'sourceSha256'>;

export function originalOf<T extends LineageNode>(revision: T, revisions: ReadonlyMap<string, T>): T {
  let current = revision;
  const seen = new Set([current.id]);
  while (current.sourceId) {
    const parent = revisions.get(current.sourceId);
    if (!parent || parent.owner !== revision.owner || parent.sha256 !== current.sourceSha256 || seen.has(parent.id)) {
      throw Error('Restore the original picture to use this version.');
    }
    seen.add(parent.id);
    current = parent;
  }
  return current;
}

export async function listCreativeAssets(owner: string): Promise<CreativeAssetRevision[]> {
  const rows = await withArtTransaction(['drawingMetadata'], 'readonly',
    transaction => ownerArtRecords<DrawingMetadata>(transaction, 'drawingMetadata', owner));
  const byId = new Map(rows.map(row => [row.id, row]));
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)).map(row => {
    const original = originalOf(row, byId);
    return {
      owner, assetId: original.id, revisionId: row.id, sha256: row.sha256,
      name: row.name, assetName: original.name, category: row.category ?? 'other',
      semanticName: semanticWord(original), parentRevisionId: row.sourceId, archived: !!row.archived,
      createdAt: row.createdAt,
    };
  });
}
