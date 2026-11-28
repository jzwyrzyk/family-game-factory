/** Host illustrations already used by the merged child experience. This registry
 * supplies presentation paths, never ownership or permission to use private art.
 * Gem Pals stay with pals/catalog + presentation-image (mask/provenance authority);
 * Spark/Nova ranks stay with brand/maker-identity. Do not flatten those registries. */
export const HOST_ARTWORK = {
  firstIdea: {path: './jems-art/spot_first_idea.webp', provenance: 'docs/brand/LIBRARY_V1_2.md'},
  companionWave: {path: './jems-art/character_spark_wave.webp', provenance: 'docs/brand/LIBRARY_V1_2.md'},
  workbench: {path: './jems-workbench.svg', provenance: 'docs/brand/README.md'},
  blocks: {path: './jems-blocks.svg', provenance: 'docs/creation-studio/README.md'},
} as const;
export type HostArtwork = keyof typeof HOST_ARTWORK;
export function hostArtworkPath(key: HostArtwork): string { return HOST_ARTWORK[key].path; }
