import { inspectDrawingBytes } from '../assets/private-drawings';

/** Reviewed workshop files may contain raster data, a palette, transparency
 * and a standard sRGB rendering intent. Reject metadata-bearing containers
 * before authorization or persistence. saveDrawing separately decodes the
 * bounded image and keeps the exact bytes covered by the operator's digest. */
export async function checkReviewedPng(bytes: ArrayBuffer): Promise<void> {
  const {width, height} = inspectDrawingBytes(bytes, 'image/png');
  const data = new Uint8Array(bytes);
  const view = new DataView(bytes);
  const depth = data[24], colorType = data[25];
  const depths: Record<number, number[]> = {0:[1,2,4,8,16], 2:[8,16], 3:[1,2,4,8], 4:[8,16], 6:[8,16]};
  if (!depths[colorType]?.includes(depth) || data[26] || data[27] || data[28] > 1) throw Error('Choose a supported reviewed PNG.');
  const compressed = new Uint8Array(bytes.byteLength);
  const seen = new Set<string>();
  let compressedSize = 0, paletteSize = 0;
  let offset = 8;
  let hasPixels = false;
  while (offset + 12 <= data.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...data.subarray(offset + 4, offset + 8));
    const end = offset + 12 + length;
    if (end > data.length) break;
    if (type !== 'IDAT' && seen.has(type)) throw Error('Choose a complete reviewed PNG.');
    seen.add(type);
    switch (type) {
      case 'IHDR':
        if (offset !== 8 || length !== 13) throw Error('Choose a complete reviewed PNG.');
        break;
      case 'sRGB':
        if (length !== 1 || data[offset + 8] > 3 || hasPixels) throw Error('Choose a standard color PNG.');
        break;
      case 'PLTE':
        paletteSize = length / 3;
        if (colorType !== 3 || !paletteSize || !Number.isInteger(paletteSize) || paletteSize > 2 ** depth || hasPixels) throw Error('Choose a valid PNG palette.');
        break;
      case 'tRNS':
        if (hasPixels || !(colorType === 0 && length === 2 || colorType === 2 && length === 6 || colorType === 3 && length > 0 && length <= paletteSize)) throw Error('Choose a valid transparent PNG.');
        break;
      case 'IDAT':
        compressed.set(data.subarray(offset + 8, end - 4), compressedSize);
        compressedSize += length;
        hasPixels ||= length > 0;
        break;
      case 'IEND':
        if (!hasPixels || length || end !== data.length) throw Error('Choose a reviewed PNG without extra file data.');
        if (colorType === 3 && !paletteSize) throw Error('Choose a valid PNG palette.');
        return checkScanlines(compressed.subarray(0, compressedSize), width, height, depth, colorType, data[28] === 1);
      default: throw Error('Ask a grown-up for a reviewed PNG without embedded file details.');
    }
    offset = end;
  }
  throw Error('Choose a complete reviewed PNG.');
}

// The PNG dimensions include a filter byte on every scanline of each nonempty
// Adam7 pass. Count streamed output so highly compressed files cannot retain
// an unbounded second copy of the image before the normal browser decode.
async function checkScanlines(compressed: Uint8Array<ArrayBuffer>, width: number, height: number, depth: number, colorType: number, interlaced: boolean) {
  const channels: Record<number, number> = {0:1, 2:3, 3:1, 4:2, 6:4};
  const passes = interlaced ? [[0,0,8,8], [4,0,8,8], [0,4,4,8], [2,0,4,4], [0,2,2,4], [1,0,2,2], [0,1,1,2]] : [[0,0,1,1]];
  let expected = 0;
  for (const [x, y, dx, dy] of passes) {
    const columns = Math.ceil((width - x) / dx), rows = Math.ceil((height - y) / dy);
    if (columns > 0 && rows > 0) expected += rows * (1 + Math.ceil(columns * channels[colorType] * depth / 8));
  }
  if (typeof DecompressionStream === 'undefined') throw Error('Open this reviewed picture in a current browser.');
  const reader = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
  try {
    let actual = 0;
    for (;;) {
      const {done, value} = await reader.read();
      if (done) {
        if (actual === expected) return;
        break;
      }
      actual += value.byteLength;
      if (actual > expected) {
        await reader.cancel();
        break;
      }
    }
  } catch {
    // Invalid or incomplete zlib stream.
  } finally {
    reader.releaseLock();
  }
  throw Error('Choose a PNG with complete picture data.');
}
