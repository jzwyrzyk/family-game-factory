/** Scene-only compositing for the approved Pal portraits. The catalogue files
 * and saved artwork references remain unchanged. This is the same kind of
 * local paper isolation used by Art Studio, scoped to bundled Pal art. */
export const PAL_SCENE_IMAGE_MAX_EDGE = 768;
type PaperOpening = readonly [number, number];

/** A few approved compositions have enclosed negative space. Seed only those
 * visually checked holes, keyed to the exact source filename; a different art
 * revision must earn its own review. Never infer holes from pale eye/body color. */
const PAPER_OPENINGS: Readonly<Record<string, readonly PaperOpening[]>> = Object.freeze({
  'jems-pals/mizzle/mature/neutral-e978474ddffa.webp': [[.43, .72], [.18, .73], [.69, .77]],
  'jems-pals/tumble/mature/neutral-8279cc081987.webp': [[.78, .5]],
  'jems-pals/clasp/base/neutral-b0b8aba2bb28.webp': [[.65, .35], [.27, .4]],
  'jems-pals/clasp/mature/neutral-a6c9939e3eed.webp': [[.45, .72], [.65, .57]],
  'jems-pals/weft/base/neutral-ce8ebc0adae5.webp': [[.23, .44], [.77, .44], [.36, .59], [.64, .59]],
  'jems-pals/talli/base/neutral-e86fa909bb99.webp': [[.45, .29]],
  'jems-pals/talli/mature/neutral-0785af1c21ae.webp': [[.22, .59], [.47, .53], [.35, .72]],
  'jems-pals/zippa/mature/neutral-df295181dbce.webp': [[.3, .5], [.71, .5]],
  'jems-pals/whorl/base/neutral-6c3dfbd80b7c.webp': [[.48, .28], [.51, .54]],
  'jems-pals/whorl/mature/neutral-bcca0e4f1289.webp': [[.54, .28], [.52, .48]],
});

export interface PalPaperMask {
  readonly alpha: Uint8ClampedArray;
  readonly paper: readonly [number, number, number];
  readonly removedPixels: number;
}

/** Remove only pale paper connected to the image border. Enclosed light eyes,
 * crystal facets and body details keep their original alpha. Existing fully
 * transparent portraits and non-paper artwork are left untouched. RGB pixels
 * are never changed, so this does not tint a character to match the scene. */
export function palPaperMask(data: Uint8ClampedArray, width: number, height: number,
  openings: readonly PaperOpening[] = []): PalPaperMask | null {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 2 || height < 2
    || width * height > PAL_SCENE_IMAGE_MAX_EDGE ** 2 || data.length !== width * height * 4) return null;
  const border: number[] = [];
  for (let x = 0; x < width; x++) border.push(x, (height - 1) * width + x);
  for (let y = 1; y < height - 1; y++) border.push(y * width, y * width + width - 1);
  const opaque = border.filter(index => data[index * 4 + 3] >= 240);
  // A genuinely transparent source needs no color-keying. A handful of stray
  // opaque edge pixels must not turn the character's light material into paper.
  if (opaque.length < border.length * .6) return null;
  const paper = [0, 1, 2].map(channel => {
    const values = opaque.map(index => data[index * 4 + channel]).sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)];
  }) as [number, number, number];
  if (Math.min(...paper) < 185 || Math.max(...paper) - Math.min(...paper) > 55) return null;
  const distance = (index: number) => {
    const p = index * 4;
    return (data[p] - paper[0]) ** 2 + (data[p + 1] - paper[1]) ** 2 + (data[p + 2] - paper[2]) ** 2;
  };
  const threshold = 42 ** 2;
  if (opaque.filter(index => distance(index) <= threshold).length < opaque.length * .8) return null;
  const count = width * height, seen = new Uint8Array(count), queue = new Int32Array(count);
  let head = 0, tail = 0, removedPixels = 0;
  const enqueue = (index: number, tolerance = threshold) => {
    if (seen[index] || (data[index * 4 + 3] > 0 && distance(index) > tolerance)) return;
    seen[index] = 1; queue[tail++] = index;
  };
  const flood = (tolerance = threshold) => {
    while (head < tail) {
      const index = queue[head++], x = index % width;
      if (x) enqueue(index - 1, tolerance);
      if (x < width - 1) enqueue(index + 1, tolerance);
      if (index >= width) enqueue(index - width, tolerance);
      if (index + width < count) enqueue(index + width, tolerance);
    }
  };
  for (const index of border) enqueue(index);
  flood();
  // Interior openings sit nearer pale material than the outside paper does.
  // Use the stricter threshold here so hands and facial highlights stay solid.
  const openingThreshold = 26 ** 2;
  for (const [x, y] of openings) if (Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x < 1 && y >= 0 && y < 1) {
    enqueue(Math.floor(y * height) * width + Math.floor(x * width), openingThreshold);
  }
  flood(openingThreshold);
  const alpha = new Uint8ClampedArray(count);
  for (let index = 0; index < count; index++) {
    const original = data[index * 4 + 3];
    alpha[index] = seen[index] ? 0 : original;
    if (original && seen[index]) removedPixels++;
  }
  return removedPixels ? { alpha, paper, removedPixels } : null;
}

/** Bounded work at image-load time, never in the animation loop. Preserve the
 * full approved composition (including deliberate beams/props) and aspect.
 * Source pixels stay available if a canvas is unavailable or cannot be read. */
export function preparePalSceneImage(image: HTMLImageElement, assetURL = ''): CanvasImageSource {
  try {
    const scale = Math.min(1, PAL_SCENE_IMAGE_MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return image;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const mask = palPaperMask(pixels.data, canvas.width, canvas.height, PAPER_OPENINGS[assetURL.replace(/^\.\//, '')]);
    if (!mask) return image;
    for (let index = 0; index < mask.alpha.length; index++) pixels.data[index * 4 + 3] = mask.alpha[index];
    context.putImageData(pixels, 0, 0);
    return canvas;
  } catch {
    return image;
  }
}
