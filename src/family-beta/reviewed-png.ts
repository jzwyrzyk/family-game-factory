import {inspectDrawingBytes} from '../assets/private-drawings';
import {crc32 as pngChecksum} from '../drawing/png-crc';

const refused = () => Error('Ask a grown-up for a reviewed PNG saved without extra file information.');
const formats: Record<number, {channels: number; depths: number[]}> = {
  0: {channels: 1, depths: [1, 2, 4, 8, 16]},
  2: {channels: 3, depths: [8, 16]},
  3: {channels: 1, depths: [1, 2, 4, 8]},
  4: {channels: 2, depths: [8, 16]},
  6: {channels: 4, depths: [8, 16]},
};
const adam7 = [
  [0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4],
  [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2],
];

function rasterBytes(width: number, height: number, bitsPerPixel: number, interlaced: boolean) {
  let total = 0;
  for (const [x, y, dx, dy] of interlaced ? adam7 : [[0, 0, 1, 1]]) {
    if (x >= width || y >= height) continue;
    const columns = Math.ceil((width - x) / dx), rows = Math.ceil((height - y) / dy);
    total += rows * (1 + Math.ceil(columns * bitsPerPixel / 8)); // one filter byte per scanline
  }
  return total;
}

/** A validated truecolor image can retain its compressed pixels verbatim while
 * omitting its unused PLTE chunk. The new file has its own approval identity. */
export class SuggestedPaletteError extends Error {
  constructor(readonly imageOnlyCopy: Blob) {
    super('This truecolor PNG contains an unused palette. Download the image-only copy and have its exact file approved.');
  }
}

/** Accept a still PNG with only image data and its optional standard sRGB
 * intent. The exact file must also pass a separate digest-based family review
 * and a real decode. File names and embedded free-form metadata stay outside. */
export async function checkReviewedPng(bytes: ArrayBuffer): Promise<void> {
  const {width, height} = inspectDrawingBytes(bytes, 'image/png');
  const view = new DataView(bytes);
  const data = new Uint8Array(bytes);
  const depth = data[24], colour = data[25], format = formats[colour];
  if (bytes.byteLength < 45 || pngChecksum(data.subarray(12, 29)) !== view.getUint32(29)
    || view.getUint32(8) !== 13 || !format?.depths.includes(depth)
    || data[26] !== 0 || data[27] !== 0 || data[28] > 1) throw refused();

  const compressed: BlobPart[] = [];
  let unusedPalette: {start:number; end:number} | undefined;
  let ended = false, renderingIntent = false, transparency = false, paletteEntries = 0;
  for (let offset = 33; offset + 12 <= bytes.byteLength;) {
    const length = view.getUint32(offset);
    const end = offset + 12 + length;
    if (end > bytes.byteLength || pngChecksum(data.subarray(offset + 4, end - 4)) !== view.getUint32(end - 4)) throw refused();
    const kind = String.fromCharCode(...data.subarray(offset + 4, offset + 8));
    if (kind === 'IDAT') {
      if (compressed.length === 4096 || (colour === 3 && !paletteEntries)) throw refused();
      compressed.push(data.subarray(offset + 8, end - 4));
    } else if (kind === 'sRGB' && !renderingIntent && !paletteEntries && !compressed.length && length === 1 && data[offset + 8] <= 3) {
      renderingIntent = true;
    } else if (kind === 'PLTE' && !compressed.length && !transparency && !paletteEntries && [2,3,6].includes(colour)) {
      if (colour !== 3) unusedPalette = {start:offset, end};
      paletteEntries = length / 3;
      if (!Number.isInteger(paletteEntries) || paletteEntries < 1 || paletteEntries > (colour === 3 ? 2 ** depth : 256)) throw refused();
    } else if (kind === 'tRNS' && !transparency && !compressed.length) {
      if (colour === 3) {
        if (length < 1 || length > paletteEntries) throw refused();
      } else {
        if (!((colour === 0 && length === 2) || (colour === 2 && length === 6))) throw refused();
        for (let sample = offset + 8; sample < end - 4; sample += 2) {
          if (view.getUint16(sample) >= 2 ** depth) throw refused();
        }
      }
      transparency = true;
    } else if (kind === 'IEND' && length === 0 && end === bytes.byteLength) {
      ended = true;
    } else {
      throw refused();
    }
    offset = end;
  }
  if (!ended || !compressed.length || typeof DecompressionStream === 'undefined') throw refused();

  // Some image decoders ignore trailing data. Bound the inflated pixels and
  // require the deflate decoder to consume the complete input stream.
  const expected = rasterBytes(width, height, format.channels * depth, data[28] === 1);
  const reader = new Blob(compressed).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
  let size = 0;
  try {
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > expected) {
        await reader.cancel();
        throw refused();
      }
    }
  } catch {
    throw refused();
  } finally {
    reader.releaseLock();
  }
  if (size !== expected) throw refused();
  if (unusedPalette) throw new SuggestedPaletteError(new Blob([
    data.subarray(0, unusedPalette.start), data.subarray(unusedPalette.end),
  ], {type:'image/png'}));
}
