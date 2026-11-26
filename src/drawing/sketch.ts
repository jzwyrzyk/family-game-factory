import {pngChecksum as checksum} from '../assets/png-checksum';

// A private ancillary PNG chunk keeps editable strokes and the finished pixels in
// one immutable My Art revision. Ordinary PNG readers ignore the ancillary data.
export const sketchWidth = 900;
export const sketchHeight = 560;
export const maxStrokes = 160;
export const maxStrokePoints = 4096;
export const crayons = ['#202b39', '#db5679', '#ffb541', '#268e8c', '#6d61ca', '#7dbc58', '#ffffff'] as const;
export type SketchPoint = { x: number; y: number };
export type SketchStroke = { ink: number; size: number; points: SketchPoint[] };
export type Sketch = { transparent: boolean; strokes: SketchStroke[] };
export const eraserInk = crayons.length;

const precision = 32;
const signature = [137, 80, 78, 71, 13, 10, 26, 10];
const sketchChunk = 0x6a654d53; // jeMS: ancillary, private, unsafe to copy after image edits
const endChunk = 0x49454e44;
const maxPayload = 4 + maxStrokes * (4 + 4 * maxStrokePoints);

function locate(bytes: Uint8Array) {
  if (bytes.length < 57 || !signature.every((v, i) => bytes[i] === v)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(12) !== 0x49484452 || view.getUint32(16) !== sketchWidth || view.getUint32(20) !== sketchHeight) return null;
  let source = -1;
  for (let pos = 8; pos + 12 <= bytes.length;) {
    const length = view.getUint32(pos), kind = view.getUint32(pos + 4);
    if (length > bytes.length - pos - 12) return null;
    if (kind === sketchChunk) {
      if (source !== -1 || length < 4 || length > maxPayload) return null;
      source = pos;
    }
    if (kind === endChunk) return length === 0 && pos + 12 === bytes.length ? { end: pos, source } : null;
    pos += length + 12;
  }
  return null;
}

export function hasSketchSource(buffer: ArrayBuffer): boolean {
  const location = locate(new Uint8Array(buffer));
  return !!location && location.source !== -1;
}

export function readSketch(buffer: ArrayBuffer): Sketch | null {
  const bytes = new Uint8Array(buffer), source = locate(bytes)?.source;
  if (source === undefined || source < 0) return null;
  const view = new DataView(buffer), end = source + 8 + view.getUint32(source);
  if (view.getUint32(end) !== checksum(bytes.subarray(source + 4, end))) return null;
  let pos = source + 8;
  if (bytes[pos++] !== 1) return null;
  const paper = bytes[pos++], count = view.getUint16(pos);
  pos += 2;
  if (paper > 1 || count < 1 || count > maxStrokes) return null;
  const strokes: SketchStroke[] = [];
  for (let i = 0; i < count; i++) {
    if (pos + 4 > end) return null;
    const ink = bytes[pos++], size = bytes[pos++], length = view.getUint16(pos);
    pos += 2;
    if (ink > eraserInk || size < 3 || size > 24 || !length || length > maxStrokePoints || pos + length * 4 > end) return null;
    const points: SketchPoint[] = [];
    for (let j = 0; j < length; j++) {
      const x = view.getUint16(pos) / precision, y = view.getUint16(pos + 2) / precision;
      if (x > sketchWidth || y > sketchHeight) return null;
      points.push({ x, y });
      pos += 4;
    }
    strokes.push({ ink, size, points });
  }
  return pos === end ? { transparent: Boolean(paper), strokes } : null;
}

export function sketchPoint(x: number, y: number): SketchPoint {
  return {
    x: Math.round(Math.max(0, Math.min(sketchWidth, x)) * precision) / precision,
    y: Math.round(Math.max(0, Math.min(sketchHeight, y)) * precision) / precision
  };
}

/** Input comes from the bounded crayon editor. Preserve the browser's IDAT pixels exactly. */
export async function saveSketchPng(raster: Blob, sketch: Sketch): Promise<Blob> {
  const bytes = new Uint8Array(await raster.arrayBuffer()), location = locate(bytes);
  if (!location || location.source !== -1) throw Error('Your drawing could not be saved as a PNG.');
  const payloadSize = sketch.strokes.reduce((n, s) => n + 4 + s.points.length * 4, 4);
  if (!sketch.strokes.length || sketch.strokes.length > maxStrokes || payloadSize > maxPayload) throw Error('That page is full.');
  const chunk = new Uint8Array(12 + payloadSize), view = new DataView(chunk.buffer);
  view.setUint32(0, payloadSize);
  view.setUint32(4, sketchChunk);
  chunk[8] = 1;
  chunk[9] = Number(sketch.transparent);
  view.setUint16(10, sketch.strokes.length);
  let pos = 12;
  for (const stroke of sketch.strokes) {
    chunk[pos++] = stroke.ink;
    chunk[pos++] = stroke.size;
    view.setUint16(pos, stroke.points.length);
    pos += 2;
    for (const p of stroke.points) {
      view.setUint16(pos, p.x * precision);
      view.setUint16(pos + 2, p.y * precision);
      pos += 4;
    }
  }
  view.setUint32(pos, checksum(chunk.subarray(4, pos)));
  return new Blob([bytes.subarray(0, location.end), chunk, bytes.subarray(location.end)], { type: 'image/png' });
}
