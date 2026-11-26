import {parseSheet, type Sheet} from './workspace-engine';
import {ART_LIMITS} from './library';

// Place our private, ancillary, unsafe-to-copy PNG chunk immediately after IHDR.
// Ordinary PNG readers skip it. The existing original hash, quota, archive and
// backup contracts then cover the complete editable file in one transaction.
const type = 0x6a654d53; // jeMS
const headerEnd = 33;
function checksum(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function sketchPng(pixels: Blob, sheet: Sheet): Blob {
  const data = new TextEncoder().encode(JSON.stringify(sheet));
  if (pixels.size + data.length + 12 > ART_LIMITS.imageBytes) throw Error('This page is full. Undo a mark and try saving again.');
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  view.setUint32(4, type);
  chunk.set(data, 8);
  view.setUint32(8 + data.length, checksum(chunk.subarray(4, 8 + data.length)));
  return new Blob([pixels.slice(0, headerEnd), chunk, pixels.slice(headerEnd)], {type: 'image/png'});
}

/** Unknown and malformed source extensions leave the exact raster accessible. */
export function readSketch(bytes: ArrayBuffer): Sheet | null {
  const view = new DataView(bytes);
  if (bytes.byteLength < headerEnd + 12 || bytes.byteLength > ART_LIMITS.imageBytes ||
      view.getUint32(0) !== 0x89504e47 || view.getUint32(12) !== 0x49484452 ||
      view.getUint32(headerEnd + 4) !== type) return null;
  const length = view.getUint32(headerEnd), start = headerEnd + 8;
  if (start + length + 4 > bytes.byteLength ||
      view.getUint32(start + length) !== checksum(new Uint8Array(bytes, start - 4, length + 4))) return null;
  try {
    return parseSheet(JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(new Uint8Array(bytes, start, length))));
  } catch {
    return null;
  }
}
