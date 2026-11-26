// The paper, tools and history have no profile, persistence or navigation dependencies.
export const width = 900;
export const height = 560;
export const maxPointsPerMark = 2048;
export const maxPoints = 24576;
export const maxMarks = 256;
const tools = ['pencil', 'crayon', 'brush', 'marker', 'eraser', 'fill', 'line', 'circle', 'rectangle', 'triangle', 'star', 'stamp'] as const;
export type Tool = typeof tools[number] | 'select';
export type Stamp = 'blue' | 'gold' | 'mint';
export interface Point { x: number; y: number; p?: number }
export interface Mark { tool: Exclude<Tool, 'select'>; color: string; size: number; points: Point[]; stamp?: Stamp }
export interface Sheet { version: 1; orientation?: 'portrait'; transparent: boolean; marks: Mark[] }
export function sheetSize(sheet?: Sheet) {
  return sheet?.orientation === 'portrait' ? {width:560,height:800} : {width,height};
}
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(n, b));
const bounded = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const freehand = (tool: Tool) => ['pencil', 'crayon', 'brush', 'marker', 'eraser'].includes(tool);
const colors = /^#[a-f0-9]{6}$/i;

function hasOnly(value: unknown, keys: readonly string[]): boolean {
  return !!value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype
    && Object.keys(value).every(key=>keys.includes(key));
}
export function parseSheet(value: unknown): Sheet {
  const sheet = value as Sheet;
  if (!hasOnly(sheet, ['version','orientation','transparent','marks']) || sheet.version !== 1 || (sheet.orientation !== undefined && sheet.orientation !== 'portrait') || typeof sheet.transparent !== 'boolean' || !Array.isArray(sheet.marks) || sheet.marks.length > maxMarks)
    throw Error('This drawing needs a smaller page.');
  const size = sheetSize(sheet);
  let points = 0, fills = 0;
  for (const mark of sheet.marks) {
    if (!hasOnly(mark, ['tool','color','size','points','stamp']) || !tools.includes(mark.tool) || typeof mark.color !== 'string' || !colors.test(mark.color)
      || !bounded(mark.size, 1, 100) || !Array.isArray(mark.points) || !mark.points.length
      || mark.points.length > (freehand(mark.tool) ? maxPointsPerMark : 2)
      || (mark.tool !== 'stamp' && mark.stamp !== undefined)
      || (mark.tool === 'stamp' && !['blue', 'gold', 'mint'].includes(mark.stamp ?? '')))
      throw Error('This mark could not be opened.');
    points += mark.points.length;
    if (mark.tool === 'fill') fills++;
    if (points > maxPoints || fills > 24) throw Error('Your paper is full. Keep your art to start another drawing.');
    for (const p of mark.points) if (!hasOnly(p, ['x','y','p']) || !bounded(p.x, 0, size.width) || !bounded(p.y, 0, size.height) || (p.p !== undefined && !bounded(p.p, 0, 1)))
      throw Error('This point is outside the drawing.');
  }
  return sheet;
}

/** Each edit replaces its mark or list. Adjacent snapshots share unmodified marks and point arrays. */
export class PaperHistory {
  private steps: Sheet[];
  private cursor = 0;
  constructor(sheet: Sheet = { version: 1, transparent: false, marks: [] }) { this.steps = [parseSheet(sheet)]; }
  get sheet() { return this.steps[this.cursor]; }
  get canUndo() { return this.cursor > 0; }
  get canRedo() { return this.cursor + 1 < this.steps.length; }
  apply(sheet: Sheet) {
    parseSheet(sheet);
    this.steps.splice(this.cursor + 1);
    this.steps.push(sheet);
    if (this.steps.length > 48) this.steps.shift();
    this.cursor = this.steps.length - 1;
  }
  undo() { if (this.canUndo) this.cursor--; }
  redo() { if (this.canRedo) this.cursor++; }
}

export { pointerPoint } from './pointer-input';

const stamps = new Map<Stamp, HTMLImageElement>();
let loading: Promise<void> | undefined;
export function prepareStamps(): Promise<void> {
  if (!loading) loading = Promise.all((['blue', 'gold', 'mint'] as const).map(async id => {
    if (stamps.has(id)) return;
    const image = new Image();
    image.src = './jems-art/gem_' + id + '.webp';
    await image.decode();
    stamps.set(id, image);
  })).then(() => {}).catch(error => { loading = undefined; throw error; });
  return loading;
}

function box(mark: Mark) {
  const a = mark.points[0], b = mark.points.at(-1)!;
  if (Math.hypot(b.x - a.x, b.y - a.y) < 2) {
    const radius = Math.max(12, mark.size * 2);
    return { left: a.x - radius, right: a.x + radius, top: a.y - radius, bottom: a.y + radius };
  }
  return { left: Math.min(a.x,b.x), right: Math.max(a.x,b.x), top: Math.min(a.y,b.y), bottom: Math.max(a.y,b.y) };
}
export function markBounds(mark: Mark) {
  if (!freehand(mark.tool)) return box(mark);
  const pad = mark.size / 2;
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const p of mark.points) { left = Math.min(left,p.x); top = Math.min(top,p.y); right = Math.max(right,p.x); bottom = Math.max(bottom,p.y); }
  return { left: left-pad, right: right+pad, top: top-pad, bottom: bottom+pad };
}
export function hitMark(sheet: Sheet, p: Point): number {
  for (let i = sheet.marks.length - 1; i >= 0; i--) {
    const mark = sheet.marks[i];
    if (mark.tool === 'fill' || mark.tool === 'eraser') continue;
    const b = markBounds(mark);
    if (p.x >= b.left-5 && p.x <= b.right+5 && p.y >= b.top-5 && p.y <= b.bottom+5) return i;
  }
  return -1;
}
export function transformMark(mark: Mark, dx: number, dy: number, scale = 1, sheet?: Sheet): Mark {
  const {width,height} = sheetSize(sheet);
  const b = markBounds(mark), cx = (b.left+b.right)/2, cy = (b.top+b.bottom)/2;
  scale = clamp(scale, 0.1, Math.min(8, width/Math.max(1,b.right-b.left), height/Math.max(1,b.bottom-b.top)));
  const projected = mark.points.map(p => ({ ...p, x: cx + (p.x-cx)*scale, y: cy + (p.y-cy)*scale }));
  const xs = projected.map(p => p.x), ys = projected.map(p => p.y);
  dx = clamp(dx, -Math.min(...xs), width-Math.max(...xs));
  dy = clamp(dy, -Math.min(...ys), height-Math.max(...ys));
  return { ...mark, size: clamp(mark.size*scale, 1, 100), points: projected.map(p => ({...p,
    x: Math.round(clamp(p.x+dx,0,width)*4)/4, y: Math.round(clamp(p.y+dy,0,height)*4)/4 })) };
}

function flood(ctx: CanvasRenderingContext2D, point: Point, color: string) {
  const w = ctx.canvas.width, h = ctx.canvas.height;
  const image = ctx.getImageData(0, 0, w, h);
  const pixels = new Uint32Array(image.data.buffer);
  const seed = clamp(Math.floor(point.y),0,h-1)*w + clamp(Math.floor(point.x),0,w-1);
  // Use RGBA bytes to keep the comparison independent of platform byte order.
  const rgba = new Uint8Array([parseInt(color.slice(1,3),16), parseInt(color.slice(3,5),16), parseInt(color.slice(5,7),16), 255]);
  const paint = new Uint32Array(rgba.buffer)[0], target = pixels[seed];
  if (paint === target) return;
  const stack = new Uint32Array(pixels.length);
  let end = 0;
  const visit = (pos: number) => { if (pixels[pos] === target) { pixels[pos] = paint; stack[end++] = pos; } };
  visit(seed);
  while (end) {
    const pos = stack[--end], x = pos % w;
    if (x > 0) visit(pos-1);
    if (x < w-1) visit(pos+1);
    if (pos >= w) visit(pos-w);
    if (pos < pixels.length-w) visit(pos+w);
  }
  ctx.putImageData(image, 0, 0);
}

function inkWidth(mark: Mark, p: Point) {
  const factor = mark.tool === 'pencil' ? 0.38 : mark.tool === 'brush' ? 1.35 : 1;
  return Math.max(1,mark.size * factor * (p.p === undefined ? 1 : 0.34 + p.p));
}
function drawStroke(ctx: CanvasRenderingContext2D, mark: Mark) {
  const pts = mark.points;
  ctx.lineCap = mark.tool === 'marker' ? 'square' : 'round';
  ctx.lineJoin = 'round';
  const dot = (p: Point, r: number) => { ctx.beginPath(); ctx.arc(p.x,p.y,r,0,2*Math.PI); ctx.fill(); };
  if (mark.tool === 'marker') ctx.globalAlpha = 0.58;
  if (mark.tool === 'crayon') ctx.globalAlpha = 0.80;
  const uniform = pts.every(p=>p.p===pts[0].p);
  if (pts.length === 1) dot(pts[0],inkWidth(mark,pts[0])/2);
  else if (uniform) {
    ctx.lineWidth = inkWidth(mark,pts[0]);
    ctx.beginPath(); ctx.moveTo(pts[0].x,pts[0].y);
    for (let i=1;i<pts.length;i++) ctx.lineTo(pts[i].x,pts[i].y);
    ctx.stroke();
  } else {
    for (let i=1;i<pts.length;i++) {
      ctx.lineWidth = (inkWidth(mark,pts[i-1])+inkWidth(mark,pts[i]))/2;
      ctx.beginPath(); ctx.moveTo(pts[i-1].x,pts[i-1].y); ctx.lineTo(pts[i].x,pts[i].y); ctx.stroke();
    }
  }
  if (mark.tool === 'crayon') {
    // Stable flecks follow the hand-drawn path. Reopening never randomizes a mark.
    ctx.globalAlpha = 0.3;
    for (let i=0;i<pts.length;i++) {
      const p=pts[i], offset=inkWidth(mark,p)*0.52;
      dot({x:p.x+Math.cos(i*7.3)*offset,y:p.y+Math.sin(i*7.3)*offset},Math.max(0.6,offset*0.15));
    }
  }
}

export function renderMark(ctx: CanvasRenderingContext2D, mark: Mark, transparent = true) {
  if (mark.tool === 'fill') { flood(ctx, mark.points[0], mark.color); return; }
  ctx.save();
  try {
    ctx.fillStyle = ctx.strokeStyle = mark.color;
    if (mark.tool === 'eraser') {
      if (transparent) ctx.globalCompositeOperation = 'destination-out';
      else ctx.fillStyle = ctx.strokeStyle = '#ffffff';
    }
    if (freehand(mark.tool)) { drawStroke(ctx,mark); return; }
    const a = mark.points[0], b = mark.points.at(-1)!, bounds = box(mark);
    const w = bounds.right-bounds.left, h = bounds.bottom-bounds.top;
    const cx = bounds.left+w/2, cy = bounds.top+h/2;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = mark.size;
    ctx.beginPath();
    switch (mark.tool) {
      case 'line': ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); break;
      case 'circle': ctx.ellipse(cx,cy,w/2,h/2,0,0,Math.PI*2); break;
      case 'rectangle': ctx.rect(bounds.left,bounds.top,w,h); break;
      case 'triangle': ctx.moveTo(cx,bounds.top); ctx.lineTo(bounds.right,bounds.bottom); ctx.lineTo(bounds.left,bounds.bottom); ctx.closePath(); break;
      case 'star':
        for (let i=0;i<10;i++) {
          const angle = -Math.PI/2+i*Math.PI/5, scale = i%2 ? 0.43 : 1;
          const x = cx+Math.cos(angle)*w/2*scale, y = cy+Math.sin(angle)*h/2*scale;
          if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
        }
        ctx.closePath(); break;
      case 'stamp': {
        const stamp = mark.stamp && stamps.get(mark.stamp);
        if (!stamp) throw Error('Open the gem stamps before using this page.');
        const scale = Math.min(w/stamp.naturalWidth, h/stamp.naturalHeight);
        const sw = stamp.naturalWidth*scale, sh = stamp.naturalHeight*scale;
        ctx.drawImage(stamp,cx-sw/2,cy-sh/2,sw,sh); return;
      }
    }
    ctx.stroke();
  } finally { ctx.restore(); }
}
export function renderPaper(ctx: CanvasRenderingContext2D, sheet: Sheet) {
  const {width,height} = sheetSize(sheet);
  ctx.clearRect(0,0,width,height);
  if (!sheet.transparent) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,width,height); }
  for (const mark of sheet.marks) renderMark(ctx,mark,sheet.transparent);
}
