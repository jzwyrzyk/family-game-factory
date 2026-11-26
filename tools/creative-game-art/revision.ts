/** Exact qualified document and reviewed actor geometry. Owner/art bindings
 * are deliberately absent from the game revision identity. */
export function revisionSource(html: string, slot: {assetId: string; width: number; height: number}) {
  return JSON.stringify([slot.assetId, slot.width, slot.height, html]);
}
