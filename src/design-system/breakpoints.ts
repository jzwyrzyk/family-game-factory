/** Existing responsive contracts, in CSS pixels. CSS media queries use these literal
 * values because custom properties cannot be used in media query conditions.
 * Component contract checks keep the migrated implementations in agreement. */
export const BREAKPOINTS = {progress: 580, destination: 640, dashboard: 680, destinationWrap: 1000} as const;
export const REVIEW_VIEWPORTS = {
  desktop: {width: 1440, height: 1000}, landscape: {width: 1180, height: 820},
  portrait: {width: 820, height: 1180}, phone: {width: 390, height: 844},
} as const;
