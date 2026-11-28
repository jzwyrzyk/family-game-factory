import {pixelsMatchPng} from './png-replay';
import {crc32} from './png-crc';

/** A kept sketch is one ordinary PNG. Its private ancillary chunk travels
 * with the raster through the existing immutable artwork and backup paths. */
export const paperWidth = 900;
export const paperHeight = 560;
export const maxStrokes = 160;
export const maxStrokePoints = 4096;
export const crayons = ['#202b39', '#db5679', '#ffb541', '#268e8c', '#6d61ca', '#7dbc58', '#ffffff'] as const;
const coordinateScale = 64;
export const snapCoordinate = (value: number) => Math.round(value * coordinateScale) / coordinateScale;
export type Stroke = {color: string; size: number; points: {x: number; y: number}[]};
export type CrayonSource = {transparent: boolean; strokes: Stroke[]};
const chunkType = 0x6a654d53; // jeMS: ancillary, private, unsafe to copy after image edits
const endType = 0x49454e44;
function locateSource(bytes: ArrayBuffer) {
  if (bytes.byteLength < 45 || bytes.byteLength > 5 * 1024 * 1024) return;
  const view = new DataView(bytes);
  if (view.getUint32(0) !== 0x89504e47 || view.getUint32(4) !== 0x0d0a1a0a ||
      view.getUint32(12) !== 0x49484452 || view.getUint32(16) !== paperWidth || view.getUint32(20) !== paperHeight) return;
  for (let offset = 8; offset + 12 <= bytes.byteLength;) {
    const size = view.getUint32(offset), next = offset + 12 + size;
    if (next > bytes.byteLength) return;
    if (view.getUint32(offset + 4) === chunkType) {
      if (size < 4 || size > 4 + maxStrokes * (4 + 4 * maxStrokePoints) ||
          next + 12 !== bytes.byteLength || view.getUint32(next) !== 0 || view.getUint32(next + 4) !== endType) return;
      return {offset, size};
    }
    offset = next;
  }
}
export const hasCrayonSource = (bytes: ArrayBuffer) => !!locateSource(bytes);

export function readCrayonSource(bytes: ArrayBuffer, scale: 32 | 64 = coordinateScale): CrayonSource | undefined {
  const chunk = locateSource(bytes);
  if (!chunk) return;
  const {offset, size} = chunk;
  if (crc32(new Uint8Array(bytes, offset + 4, size + 4)) !== new DataView(bytes).getUint32(offset + 8 + size)) return;
  const data = new DataView(bytes, offset + 8, size), count = data.getUint16(2);
  if (data.getUint8(0) !== 1 || data.getUint8(1) > 1 || count < 1 || count > maxStrokes) return;
  const strokes: Stroke[] = [];
  let pos = 4;
  for (let index = 0; index < count; index++) {
    if (pos + 4 > size) return;
    const ink = data.getUint8(pos), width = data.getUint8(pos + 1), length = data.getUint16(pos + 2);
    pos += 4;
    if (ink > crayons.length || width < 3 || width > 24 || length < 1 || length > maxStrokePoints || pos + length * 4 > size) return;
    const stroke: Stroke = {color: crayons[ink] ?? 'erase', size: width, points: []};
    for (let point = 0; point < length; point++) {
      const x = data.getUint16(pos) / scale, y = data.getUint16(pos + 2) / scale;
      if (x > paperWidth || y > paperHeight) return;
      stroke.points.push({x, y});
      pos += 4;
    }
    strokes.push(stroke);
  }
  if (pos === size) return {transparent: !!data.getUint8(1), strokes};
}

export function includeCrayonSource(png: Blob, source: CrayonSource): Blob {
  const size = 4 + source.strokes.reduce((sum, stroke) => sum + 4 + stroke.points.length * 4, 0);
  const chunk = new Uint8Array(size + 12), data = new DataView(chunk.buffer);
  data.setUint32(0, size);
  data.setUint32(4, chunkType);
  data.setUint8(8, 1);
  data.setUint8(9, Number(source.transparent));
  data.setUint16(10, source.strokes.length);
  let pos = 12;
  for (const stroke of source.strokes) {
    const ink = crayons.findIndex(color => color === stroke.color);
    data.setUint8(pos, ink < 0 ? crayons.length : ink);
    data.setUint8(pos + 1, stroke.size);
    data.setUint16(pos + 2, stroke.points.length);
    pos += 4;
    for (const {x, y} of stroke.points) {
      data.setUint16(pos, x * coordinateScale);
      data.setUint16(pos + 2, y * coordinateScale);
      pos += 4;
    }
  }
  data.setUint32(pos, crc32(chunk.subarray(4, pos)));
  return new Blob([png.slice(0, -12), chunk, png.slice(-12)], {type: 'image/png'});
}

export function renderStrokes(ctx: CanvasRenderingContext2D, strokes: Stroke[], transparent: boolean) {
  ctx.clearRect(0, 0, paperWidth, paperHeight);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const stroke of strokes) {
    const first = stroke.points[0];
    ctx.globalCompositeOperation = stroke.color === 'erase' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = ctx.fillStyle = stroke.color === 'erase' ? '#000' : stroke.color;
    ctx.lineWidth = stroke.size;
    ctx.beginPath();
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < stroke.points.length; i++) ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(first.x, first.y, stroke.size / 2, 0, Math.PI * 2);
    ctx.fill();
  }
  if (!transparent) {
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, paperWidth, paperHeight);
  }
  ctx.globalCompositeOperation = 'source-over';
}

/** Imports can carry arbitrary PNG chunks. Only open strokes that reproduce
 * the selected visible image in this renderer. Raster tools always remain available. */
export async function verifiedCrayonSource(bytes: ArrayBuffer): Promise<CrayonSource> {
  try {
    // The two historical encoders used the same format tag. The selected
    // PNG itself determines which coordinate interpretation is admissible.
    for (const scale of [64, 32] as const) {
      const source = readCrayonSource(bytes, scale);
      if (source && await pixelsMatchPng(bytes,paperWidth,paperHeight,ctx=>renderStrokes(ctx,source.strokes,source.transparent))) return source;
    }
  } catch { /* The original PNG remains usable even if its source cannot be replayed. */ }
  throw Error('These strokes could not reopen exactly. Your saved picture is safe. You can still use Picture tools.');
}
