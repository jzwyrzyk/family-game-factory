import {inspectDrawingBytes} from '../assets/private-drawings';
import {pngChecksum} from '../assets/png-checksum';

const refused = () => Error('Ask a grown-up for a reviewed RGB or RGBA PNG saved without extra file information.');

/** The optional beta intake admits only a static, 8-bit, non-interlaced RGB(A)
 * raster. Its only variable payload is the zlib pixel stream. The original
 * file is retained unchanged, so there is no permissive metadata fallback. */
export async function checkReviewedPng(bytes: ArrayBuffer): Promise<void> {
  const {width, height} = inspectDrawingBytes(bytes, 'image/png');
  const view = new DataView(bytes);
  const data = new Uint8Array(bytes);
  const colour = data[25];
  if (bytes.byteLength < 45 || pngChecksum(data.subarray(12, 29)) !== view.getUint32(29)
    || view.getUint32(8) !== 13 || data[24] !== 8 || ![2, 6].includes(colour)
    || data[26] !== 0 || data[27] !== 0 || data[28] !== 0) throw refused();

  const compressed: BlobPart[] = [];
  let ended = false;
  let renderingIntent = false;
  for (let offset = 33; offset + 12 <= bytes.byteLength;) {
    const length = view.getUint32(offset);
    const end = offset + 12 + length;
    if (end > bytes.byteLength || pngChecksum(data.subarray(offset + 4, end - 4)) !== view.getUint32(end - 4)) throw refused();
    const kind = String.fromCharCode(...data.subarray(offset + 4, offset + 8));
    if (kind === 'IDAT') {
      if (compressed.length === 4096) throw refused();
      compressed.push(data.subarray(offset + 8, end - 4));
    } else if (kind === 'sRGB' && !renderingIntent && !compressed.length && length === 1 && data[offset + 8] <= 3) {
      renderingIntent = true;
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
  const expected = height * (1 + width * (colour === 6 ? 4 : 3));
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
}
