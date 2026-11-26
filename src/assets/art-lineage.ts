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

/** Earlier art libraries called this field semantic. Normalize only metadata,
 * preserving the original bytes, image hash, version IDs and owner. */
export function normalizeDrawingLabel<T extends {semantic?: string; semanticIdentity?: string}>(row: T): T {
  const {semantic, semanticIdentity} = row;
  if (semanticIdentity !== undefined && !validSemanticIdentity(semanticIdentity) ||
      semantic !== undefined && (!validSemanticIdentity(semantic) || semanticIdentity !== undefined && semantic !== semanticIdentity)) {
    throw Error('The saved drawing has an invalid or conflicting description.');
  }
  if (semantic === undefined) return row;
  const copy = {...row, semanticIdentity: semantic};
  delete copy.semantic;
  return copy;
}

/** UI selection can finish after a profile switch. Check the live owner on each
 * asynchronous boundary in addition to the caller's view-generation guard. */
export function activeArtView(owner:string, current:()=>boolean) {
  return () => {
    const active = typeof window === 'undefined' ? undefined : window.FG?.store?.current?.()?.id;
    return current() && (active === undefined || active === owner);
  };
}
