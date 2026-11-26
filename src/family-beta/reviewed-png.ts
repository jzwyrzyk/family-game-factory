import { inspectDrawingBytes } from '../assets/private-drawings';

/** Reviewed workshop files may contain raster data, a palette, transparency
 * and a standard sRGB rendering intent. Reject metadata-bearing containers
 * before authorization or persistence. saveDrawing separately decodes the
 * bounded image and keeps the exact bytes covered by the operator's digest. */
export function checkReviewedPng(bytes: ArrayBuffer): void {
  inspectDrawingBytes(bytes, 'image/png');
  const data = new Uint8Array(bytes);
  const view = new DataView(bytes);
  let offset = 8;
  let hasPixels = false;
  while (offset + 12 <= data.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...data.subarray(offset + 4, offset + 8));
    const end = offset + 12 + length;
    if (end > data.length) break;
    switch (type) {
      case 'IHDR':
        if (offset !== 8 || length !== 13) throw Error('Choose a complete reviewed PNG.');
        break;
      case 'sRGB':
        if (length !== 1 || data[offset + 8] > 3 || hasPixels) throw Error('Choose a standard color PNG.');
        break;
      case 'PLTE':
        if (!length || length % 3 || length > 768 || hasPixels) throw Error('Choose a valid PNG palette.');
        break;
      case 'tRNS':
        if (!length || length > 256 || hasPixels) throw Error('Choose a valid transparent PNG.');
        break;
      case 'IDAT': hasPixels ||= length > 0; break;
      case 'IEND':
        if (hasPixels && length === 0 && end === data.length) return;
        throw Error('Choose a reviewed PNG without extra file data.');
      default: throw Error('Ask a grown-up for a reviewed PNG without embedded file details.');
    }
    offset = end;
  }
  throw Error('Choose a complete reviewed PNG.');
}
