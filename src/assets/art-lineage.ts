import type { Drawing } from './private-drawings';

type ImageLink = Pick<Drawing, 'id' | 'owner' | 'sha256' | 'sourceId' | 'sourceSha256'>;

/** Follow immutable image links inside one owner's catalog, including archived parents. */
export function originalFor<T extends ImageLink>(image: T, images: ReadonlyMap<string, T>): T {
  const seen = new Set([image.id]);
  let original = image;
  while (original.sourceId) {
    const parent = images.get(original.sourceId);
    if (!parent || parent.owner !== image.owner || parent.sha256 !== original.sourceSha256 || seen.has(parent.id)) {
      throw Error('This picture needs its original. Restore it from your art backup.');
    }
    seen.add(parent.id);
    original = parent;
  }
  return original;
}

export function validSemanticIdentity(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 60 && !/[\u0000-\u001f\u007f]/.test(value);
}
