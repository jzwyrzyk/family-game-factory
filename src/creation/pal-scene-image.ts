/** Compatibility exports for existing scene tests and consumers. One shared
 * implementation owns both scene sprites and interface portrait alpha. */
export { palPaperMask, preparePalArtworkImage as preparePalSceneImage,
  PAL_ARTWORK_MAX_EDGE as PAL_SCENE_IMAGE_MAX_EDGE } from '../pals/presentation-image';
