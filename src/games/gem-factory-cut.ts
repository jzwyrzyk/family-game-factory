/** The pictured mint band and the actual cutter share these inclusive bounds. */
export const FACTORY_CUT_ZONE = Object.freeze({
  goodStart: .26, goodEnd: .74, perfectStart: .385, perfectEnd: .615,
});

/** A missed cut recycles one jem; the broad mint band is deliberately forgiving. */
export function factoryCutRating(position: number): 0 | 2 | 3 {
  if (!Number.isFinite(position) || position < FACTORY_CUT_ZONE.goodStart || position > FACTORY_CUT_ZONE.goodEnd) return 0;
  return position >= FACTORY_CUT_ZONE.perfectStart && position <= FACTORY_CUT_ZONE.perfectEnd ? 3 : 2;
}
