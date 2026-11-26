import assert from 'node:assert/strict';
import { test } from 'node:test';
import { palPaperMask, preparePalSceneImage, PAL_SCENE_IMAGE_MAX_EDGE } from '../src/creation/pal-scene-image';

const paper = [253, 240, 227, 255] as const;
function pixels(width: number, height: number, color: readonly number[] = paper) {
  const result = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) result.set(color, i * 4);
  return result;
}
function paint(data: Uint8ClampedArray, width: number, x: number, y: number, color: readonly number[]) {
  data.set(color, (y * width + x) * 4);
}

test('Pal scene paper isolation preserves closed highlights, colored beams, props and all source RGB', () => {
  const width = 11, height = 9, data = pixels(width, height);
  for (let y = 2; y <= 6; y++) for (let x = 4; x <= 8; x++) paint(data, width, x, y, [166, 98, 215, 255]);
  // The same pale color inside a creature is a highlight, not background.
  paint(data, width, 6, 4, paper);
  // A deliberate detached prop and beam must survive just like anatomy.
  paint(data, width, 1, 7, [64, 74, 93, 255]);
  paint(data, width, 2, 6, [100, 225, 250, 180]);
  const before = data.slice(), mask = palPaperMask(data, width, height)!;
  assert.ok(mask.removedPixels > 50);
  assert.equal(mask.alpha[0], 0);
  assert.equal(mask.alpha[4 * width + 6], 255);
  assert.equal(mask.alpha[7 * width + 1], 255);
  assert.equal(mask.alpha[6 * width + 2], 180);
  assert.deepEqual(data, before, 'No source pixel or original alpha is changed by mask analysis.');
});

test('existing isolated alpha portraits, dark scenes and colored borders are not keyed', () => {
  const transparent = pixels(7, 7, [0, 0, 0, 0]);
  paint(transparent, 7, 3, 3, paper);
  assert.equal(palPaperMask(transparent, 7, 7), null);
  assert.equal(palPaperMask(pixels(7, 7, [37, 42, 78, 255]), 7, 7), null);
  assert.equal(palPaperMask(pixels(7, 7, [240, 190, 90, 255]), 7, 7), null);
});

test('an explicitly reviewed enclosed opening removes its paper while another closed highlight stays intact', () => {
  const width = 11, data = pixels(width, 9);
  for (let y = 1; y < 8; y++) for (let x = 1; x < 10; x++) paint(data, width, x, y, [70, 130, 180, 255]);
  paint(data, width, 3, 4, paper);
  paint(data, width, 7, 4, paper);
  const mask = palPaperMask(data, width, 9, [[3.5 / width, 4.5 / 9], [Number.NaN, .5], [-1, .5]])!;
  assert.equal(mask.alpha[4 * width + 3], 0);
  assert.equal(mask.alpha[4 * width + 7], 255);
  assert.equal(mask.alpha[4 * width + 6], 255);
});

test('partial-alpha paper portraits still lose the opaque border without changing interior alpha', () => {
  const data = pixels(7, 7);
  paint(data, 7, 0, 0, [0, 0, 0, 0]);
  paint(data, 7, 3, 3, [26, 99, 220, 128]);
  const mask = palPaperMask(data, 7, 7)!;
  assert.equal(mask.alpha[0], 0);
  assert.equal(mask.alpha[6], 0);
  assert.equal(mask.alpha[3 * 7 + 3], 128);
  assert.equal(mask.removedPixels, 47);
});

test('inconsistent borders and invalid or oversized buffers cannot trigger scene isolation', () => {
  const data = pixels(7, 7);
  for (let x = 0; x < 7; x++) paint(data, 7, x, 0, [30, 50, 80, 255]);
  assert.equal(palPaperMask(data, 7, 7), null);
  assert.equal(palPaperMask(data, 8, 7), null);
  assert.equal(palPaperMask(data, 0, 7), null);
  assert.equal(palPaperMask(data, PAL_SCENE_IMAGE_MAX_EDGE + 1, PAL_SCENE_IMAGE_MAX_EDGE + 1), null);
});

test('scene preparation bounds the transient canvas, leaves RGB intact and preserves the full source aspect', t => {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  t.after(() => {
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
    else delete (globalThis as any).document;
  });
  let before: Uint8ClampedArray | null = null, after: Uint8ClampedArray | null = null;
  const canvas = { width: 0, height: 0, getContext: () => ({
    drawImage() {},
    getImageData() {
      const data = pixels(canvas.width, canvas.height);
      paint(data, canvas.width, Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), [72, 120, 215, 255]);
      before = data.slice();
      return { data };
    },
    putImageData(value: { data: Uint8ClampedArray }) { after = value.data; },
  }) };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => canvas } });
  const source = { naturalWidth: 1600, naturalHeight: 900 } as HTMLImageElement;
  assert.equal(preparePalSceneImage(source), canvas);
  assert.equal(canvas.width, PAL_SCENE_IMAGE_MAX_EDGE);
  assert.equal(canvas.width / canvas.height, 1600 / 900);
  assert.ok(before && after);
  for (let index = 0; index < (before as Uint8ClampedArray).length; index++) if (index % 4 !== 3) {
    assert.equal((after as Uint8ClampedArray)[index], (before as Uint8ClampedArray)[index]);
  }
  assert.equal((after as Uint8ClampedArray)[3], 0);
});

test('an unavailable canvas reports failure rather than exposing opaque paper or another character', t => {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  t.after(() => {
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
    else delete (globalThis as any).document;
  });
  const source = { naturalWidth: 800, naturalHeight: 450 } as HTMLImageElement;
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => { throw Error('Canvas unavailable'); } } });
  assert.throws(()=>preparePalSceneImage(source), /could not be prepared/);
});

test('exact reviewed holes also work inside an already transparent expression without erasing white anatomy', () => {
  const width = 11, height = 9, data = pixels(width, height, [0, 0, 0, 0]);
  for (let y = 1; y < 8; y++) for (let x = 1; x < 10; x++) paint(data, width, x, y, [100, 70, 170, 255]);
  paint(data, width, 3, 4, paper); // enclosed negative space
  paint(data, width, 7, 4, paper); // equally pale intentional eye
  const before = data.slice();
  assert.equal(palPaperMask(data, width, height), null);
  const mask = palPaperMask(data, width, height, [[3.5 / width, 4.5 / height]])!;
  assert.equal(mask.alpha[4 * width + 3], 0);
  assert.equal(mask.alpha[4 * width + 7], 255);
  assert.equal(mask.alpha[0], 0);
  assert.deepEqual(data, before);
});
