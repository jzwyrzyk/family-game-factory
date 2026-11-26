import {parseSheet, prepareStamps, renderPaper, sheetSize, type Sheet} from './workspace-engine';
import {pixelsMatchPng} from './png-replay';
import {crc32} from './png-crc';
import {ART_LIMITS} from './library';

// Place our private, ancillary, unsafe-to-copy PNG chunk immediately after IHDR.
// Ordinary PNG readers skip it. The existing original hash, quota, archive and
// backup contracts then cover the complete editable file in one transaction.
const type = 0x6a654d53; // jeMS
const headerEnd = 33;
export function sketchPng(pixels: Blob, sheet: Sheet): Blob {
  const data = new TextEncoder().encode(JSON.stringify(sheet));
  if (pixels.size + data.length + 12 > ART_LIMITS.imageBytes) throw Error('This page is full. Undo a mark and try saving again.');
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  view.setUint32(4, type);
  chunk.set(data, 8);
  view.setUint32(8 + data.length, crc32(chunk.subarray(4, 8 + data.length)));
  return new Blob([pixels.slice(0, headerEnd), chunk, pixels.slice(headerEnd)], {type: 'image/png'});
}

/** Unknown and malformed source extensions leave the exact raster accessible. */
export function readSketch(bytes: ArrayBuffer): Sheet | null {
  const view = new DataView(bytes);
  if (bytes.byteLength < headerEnd + 12 || bytes.byteLength > ART_LIMITS.imageBytes ||
      view.getUint32(0) !== 0x89504e47 || view.getUint32(4) !== 0x0d0a1a0a ||
      view.getUint32(8) !== 13 || view.getUint32(12) !== 0x49484452 ||
      view.getUint32(headerEnd + 4) !== type) return null;
  const length = view.getUint32(headerEnd), start = headerEnd + 8;
  if (start + length + 4 > bytes.byteLength ||
      view.getUint32(start + length) !== crc32(new Uint8Array(bytes, start - 4, length + 4))) return null;
  try {
    const sheet = parseSheet(JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(new Uint8Array(bytes, start, length))));
    const {width,height} = sheetSize(sheet);
    return width===view.getUint32(16) && height===view.getUint32(20) ? sheet : null;
  } catch {
    return null;
  }
}

/** A valid chunk checksum covers only the source instructions. Before editing,
 * reproduce the selected original with the same renderer that opens the sheet. */
export async function verifySketchPixels(bytes:ArrayBuffer, sheet:Sheet):Promise<void> {
  const mismatch = 'These marks could not reopen exactly. Your picture is safe. You can still use Picture tools.';
  const {width,height}=sheetSize(sheet);
  try {
    if (sheet.marks.some(mark=>mark.tool==='stamp')) await prepareStamps();
    if(await pixelsMatchPng(bytes,width,height,ctx=>renderPaper(ctx,sheet))) return;
  } catch { /* Report the same recoverable raster-only state on decode failures. */ }
  throw Error(mismatch);
}
