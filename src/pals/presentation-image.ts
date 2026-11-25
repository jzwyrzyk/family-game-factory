/** Shared presentation-only alpha isolation for approved Pal artwork.
 * Original catalogue bytes, hashes and saved references remain unchanged. */
export const PAL_ARTWORK_MAX_EDGE = 768;
type PaperOpening = readonly [number, number];

/** A few approved compositions have enclosed negative space. Seed only those
 * visually checked holes, keyed to the exact source filename; a different art
 * revision must earn its own review. Never infer holes from pale eye/body color. */
const PAPER_OPENINGS: Readonly<Record<string, readonly PaperOpening[]>> = Object.freeze({
  'jems-pals/brim/mature/celebrate-e89d52cc2c47.webp': [[0.45, 0.42], [0.755, 0.8], [0.626, 0.763], [0.47, 0.8]],
  'jems-pals/brim/mature/encouraging-retry-a9eb000aec87.webp': [[0.45, 0.42], [0.755, 0.8], [0.626, 0.763], [0.47, 0.8]],
  'jems-pals/brim/mature/neutral-e1deceb1c58f.webp': [[0.45, 0.42], [0.755, 0.8], [0.626, 0.763], [0.47, 0.8]],
  'jems-pals/brim/mature/thinking-157025e1f3d1.webp': [[0.45, 0.42], [0.755, 0.8], [0.626, 0.763], [0.47, 0.8]],
  'jems-pals/clasp/base/celebrate-d691bd691f12.webp': [[0.65, 0.35], [0.27, 0.4]],
  'jems-pals/clasp/base/encouraging-retry-277f78551779.webp': [[0.65, 0.35], [0.27, 0.4]],
  'jems-pals/clasp/base/neutral-b0b8aba2bb28.webp': [[0.65, 0.35], [0.27, 0.4]],
  'jems-pals/clasp/base/thinking-058510599c12.webp': [[0.65, 0.35], [0.27, 0.4]],
  'jems-pals/clasp/mature/celebrate-4cf6df7cb7dc.webp': [[0.45, 0.72], [0.65, 0.57]],
  'jems-pals/clasp/mature/encouraging-retry-6ddfcea1f232.webp': [[0.45, 0.72], [0.65, 0.57]],
  'jems-pals/clasp/mature/neutral-a6c9939e3eed.webp': [[0.45, 0.72], [0.65, 0.57]],
  'jems-pals/clasp/mature/thinking-3403d101bfdf.webp': [[0.45, 0.72], [0.65, 0.57]],
  'jems-pals/mizzle/mature/celebrate-09321e479673.webp': [[0.43, 0.72], [0.18, 0.73], [0.69, 0.77]],
  'jems-pals/mizzle/mature/encouraging-retry-e2ec2b967fde.webp': [[0.43, 0.72], [0.18, 0.73], [0.69, 0.77]],
  'jems-pals/mizzle/mature/neutral-e978474ddffa.webp': [[0.43, 0.72], [0.18, 0.73], [0.69, 0.77]],
  'jems-pals/mizzle/mature/thinking-5cf01483c919.webp': [[0.43, 0.72], [0.18, 0.73], [0.69, 0.77]],
  'jems-pals/pleeko/mature/celebrate-4190f74ab563.webp': [[0.5, 0.75], [0.27, 0.8]],
  'jems-pals/pleeko/mature/encouraging-retry-85c03d77033c.webp': [[0.5, 0.75], [0.27, 0.8]],
  'jems-pals/pleeko/mature/neutral-3c0b43f73d21.webp': [[0.5, 0.75], [0.27, 0.8]],
  'jems-pals/pleeko/mature/thinking-574bdf92b047.webp': [[0.5, 0.75], [0.27, 0.8]],
  'jems-pals/poff/mature/celebrate-d0c9266ce26a.webp': [[0.46, 0.79]],
  'jems-pals/poff/mature/encouraging-retry-5622d6661680.webp': [[0.46, 0.79]],
  'jems-pals/poff/mature/neutral-8504050f12e9.webp': [[0.46, 0.79]],
  'jems-pals/poff/mature/thinking-ad7996b5db08.webp': [[0.46, 0.79]],
  'jems-pals/talli/base/celebrate-9cfa5d3017c5.webp': [[0.45, 0.29]],
  'jems-pals/talli/base/encouraging-retry-37dc4829aeb4.webp': [[0.45, 0.29]],
  'jems-pals/talli/base/neutral-e86fa909bb99.webp': [[0.45, 0.29]],
  'jems-pals/talli/base/thinking-8298c76511a8.webp': [[0.45, 0.29]],
  'jems-pals/talli/mature/celebrate-ab39f137f541.webp': [[0.22, 0.59], [0.47, 0.53], [0.35, 0.72]],
  'jems-pals/talli/mature/encouraging-retry-d777cd8fc756.webp': [[0.22, 0.59], [0.47, 0.53], [0.35, 0.72]],
  'jems-pals/talli/mature/neutral-0785af1c21ae.webp': [[0.22, 0.59], [0.47, 0.53], [0.35, 0.72]],
  'jems-pals/talli/mature/thinking-f465f3123489.webp': [[0.22, 0.59], [0.47, 0.53], [0.35, 0.72]],
  'jems-pals/tessit/mature/neutral-a50b4cddf9b2.webp': [[0.766, 0.631], [0.467, 0.648]],
  'jems-pals/tumble/mature/celebrate-7f2d67166e75.webp': [[0.78, 0.5]],
  'jems-pals/tumble/mature/encouraging-retry-299d0c76374c.webp': [[0.78, 0.5]],
  'jems-pals/tumble/mature/neutral-8279cc081987.webp': [[0.78, 0.5]],
  'jems-pals/tumble/mature/thinking-fa71dd898dce.webp': [[0.78, 0.5]],
  'jems-pals/weft/base/celebrate-984d5899320c.webp': [[0.23, 0.44], [0.77, 0.44], [0.36, 0.59], [0.64, 0.59]],
  'jems-pals/weft/base/encouraging-retry-f2d2c41833d3.webp': [[0.23, 0.44], [0.77, 0.44], [0.36, 0.59], [0.64, 0.59]],
  'jems-pals/weft/base/neutral-ce8ebc0adae5.webp': [[0.23, 0.44], [0.77, 0.44], [0.36, 0.59], [0.64, 0.59]],
  'jems-pals/weft/base/thinking-4a93d531d5cc.webp': [[0.23, 0.44], [0.77, 0.44], [0.36, 0.59], [0.64, 0.59]],
  'jems-pals/whorl/base/celebrate-eceaf6d7d827.webp': [[0.48, 0.28], [0.51, 0.54]],
  'jems-pals/whorl/base/encouraging-retry-53fb20bbb17c.webp': [[0.48, 0.28], [0.51, 0.54]],
  'jems-pals/whorl/base/neutral-6c3dfbd80b7c.webp': [[0.48, 0.28], [0.51, 0.54]],
  'jems-pals/whorl/base/thinking-0f1bf3f63a3a.webp': [[0.48, 0.28], [0.51, 0.54]],
  'jems-pals/whorl/mature/celebrate-21aa64920da2.webp': [[0.54, 0.28], [0.52, 0.48]],
  'jems-pals/whorl/mature/encouraging-retry-a7f9ea8bd65b.webp': [[0.54, 0.28], [0.52, 0.48]],
  'jems-pals/whorl/mature/neutral-bcca0e4f1289.webp': [[0.54, 0.28], [0.52, 0.48]],
  'jems-pals/whorl/mature/thinking-646927e41128.webp': [[0.54, 0.28], [0.52, 0.48]],
  'jems-pals/zippa/mature/celebrate-91c568325e4c.webp': [[0.3, 0.5], [0.71, 0.5], [0.48, 0.79]],
  'jems-pals/zippa/mature/encouraging-retry-f2a920aa3c48.webp': [[0.3, 0.5], [0.71, 0.5], [0.48, 0.79]],
  'jems-pals/zippa/mature/neutral-df295181dbce.webp': [[0.3, 0.5], [0.71, 0.5], [0.48, 0.79]],
  'jems-pals/zippa/mature/thinking-3253323605fa.webp': [[0.3, 0.5], [0.71, 0.5], [0.48, 0.79]],
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
    || width * height > PAL_ARTWORK_MAX_EDGE ** 2 || data.length !== width * height * 4) return null;
  const border: number[] = [];
  for (let x = 0; x < width; x++) border.push(x, (height - 1) * width + x);
  for (let y = 1; y < height - 1; y++) border.push(y * width, y * width + width - 1);
  const opaque = border.filter(index => data[index * 4 + 3] >= 240);
  // Already-isolated sources keep their exterior alpha. Only exact-file,
  // reviewed interior seeds may open a remaining paper hole in such a source.
  // Stray opaque edge pixels never authorize keying a character's white material.
  const exteriorPaper = opaque.length >= border.length * .6;
  const seeds = openings.filter(([x,y])=>Number.isFinite(x)&&Number.isFinite(y)&&x>=0&&x<1&&y>=0&&y<1)
    .map(([x,y])=>Math.floor(y*height)*width+Math.floor(x*width));
  const samples = exteriorPaper ? opaque : seeds.filter(index=>data[index*4+3]>=240);
  if (!samples.length) return null;
  const paper = [0, 1, 2].map(channel => {
    const values = samples.map(index => data[index * 4 + channel]).sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)];
  }) as [number, number, number];
  if (Math.min(...paper) < 185 || Math.max(...paper) - Math.min(...paper) > 55) return null;
  const distance = (index: number) => {
    const p = index * 4;
    return (data[p] - paper[0]) ** 2 + (data[p + 1] - paper[1]) ** 2 + (data[p + 2] - paper[2]) ** 2;
  };
  const threshold = 42 ** 2;
  if (exteriorPaper && opaque.filter(index => distance(index) <= threshold).length < opaque.length * .8) return null;
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
  if (exteriorPaper) {
    for (const index of border) enqueue(index);
    flood();
  }
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
 * A failed preparation is an unavailable picture, never an opaque fallback. */
export function preparePalArtworkImage(image: HTMLImageElement, assetURL = ''): CanvasImageSource {
  try {
    const scale = Math.min(1, PAL_ARTWORK_MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw Error('Pal picture canvas unavailable.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const mask = palPaperMask(pixels.data, canvas.width, canvas.height, PAPER_OPENINGS[assetURL.replace(/^\.\//, '')]);
    if (!mask) return image;
    for (let index = 0; index < mask.alpha.length; index++) pixels.data[index * 4 + 3] = mask.alpha[index];
    context.putImageData(pixels, 0, 0);
    return canvas;
  } catch {
    throw Error('Pal picture could not be prepared.');
  }
}

/** Apply that exact alpha to a DOM image while retaining its approved source URL
 * and natural resolution. Contain-sized masks preserve the complete composition;
 * this is pixel alpha isolation, not color blending or background matching. */
export function applyPalArtworkMask(image: HTMLImageElement, assetURL: string): void {
  const prepared = preparePalArtworkImage(image, assetURL);
  image.style.maskImage = prepared === image ? 'none' : `url("${(prepared as HTMLCanvasElement).toDataURL('image/png')}")`;
  image.style.maskSize = 'contain';
  image.style.maskRepeat = 'no-repeat';
  image.style.maskPosition = getComputedStyle(image).objectPosition || '50% 50%';
  image.dataset.palPresentation = prepared === image ? 'source-alpha' : 'paper-isolated';
}
