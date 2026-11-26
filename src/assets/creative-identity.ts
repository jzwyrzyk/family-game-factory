// A drawing ID is a particular saved picture. Its oldest verified ancestor is
// the logical asset identity. Both are scoped to the owner by the host.
type ImageLink = {id:string; owner:string; sha256:string; sourceId?:string; sourceSha256?:string};

export function creativeOriginal<T extends ImageLink>(drawing:T, images:ReadonlyMap<string,T>):T {
  const seen = new Set<string>();
  let current = drawing;
  while (current.sourceId) {
    const parent = images.get(current.sourceId);
    if (!parent || parent.owner !== drawing.owner || parent.sha256 !== current.sourceSha256 || seen.has(current.id)) {
      throw Error('This picture needs its original art library. Restore it from My Art.');
    }
    seen.add(current.id);
    current = parent;
  }
  return current;
}

export const validSemanticIdentity = (value:unknown): value is string =>
  typeof value === 'string' && value.length <= 60 && !/[\u0000-\u001f\u007f]/u.test(value);

export function matchesArtSearch(item:{name:string;semanticIdentity?:string},query:string) {
  const term = query.trim().toLowerCase();
  return item.name.toLowerCase().includes(term) || (item.semanticIdentity || '').toLowerCase().includes(term);
}
