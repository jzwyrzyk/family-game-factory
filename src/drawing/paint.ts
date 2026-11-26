import {drawingBlob, saveDrawing, type Drawing} from '../assets/private-drawings';
import {iconMarkup} from '../brand/icons';
import {assertRewardSourceWritable, rewardSourceWritable} from '../rewards/write-guard';
import {
  crayons, eraserInk, maxStrokePoints, maxStrokes, readSketch, saveSketchPng,
  sketchHeight, sketchPoint, sketchWidth, type Sketch, type SketchStroke
} from './sketch';
import './style.css';

const colorNames = ['Charcoal','Berry','Sunshine','Teal','Lilac','Leaf','White'];

function paintStroke(ctx: CanvasRenderingContext2D, stroke: SketchStroke) {
  ctx.globalCompositeOperation = stroke.ink === eraserInk ? 'destination-out' : 'source-over';
  ctx.strokeStyle = ctx.fillStyle = crayons[stroke.ink] ?? '#000';
  ctx.lineWidth = stroke.size;
  ctx.lineCap = ctx.lineJoin = 'round';
  const [first] = stroke.points;
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < stroke.points.length; i++) ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(first.x, first.y, stroke.size / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
}

/** Each explicit Keep appends an immutable PNG containing the editable crayon source. */
export async function drawOnTablet(owner: string, onSaved: (drawing: Drawing) => Promise<void> | void, isCurrent: () => boolean = () => true, source?: Drawing) {
  const checkOwner = () => String((window as any).FG?.store?.current()?.id || '') === owner;
  if (!checkOwner() || (source && source.owner !== owner)) throw Error('Choose the player who owns this drawing.');
  if (!isCurrent()) throw Error('Open a drawing from your Art Studio.');
  assertRewardSourceWritable();
  const original: Sketch | null = source ? readSketch(source.bytes) : { strokes: [], transparent: false };
  if (!original) throw Error('The crayon steps could not be opened. Your saved picture is still on the shelf.');
  const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const originPage = document.querySelector<HTMLElement>('.page:not(.hidden)')?.id.replace(/^page-/, '');
  const dialog = document.createElement('dialog');
  dialog.className = 'drawing-lab drawing-paint';
  dialog.setAttribute('aria-labelledby', 'dpTitle');
  dialog.innerHTML = `<div class="dl-shell"><header class="dl-header"><div>
    <h2 id="dpTitle">${source ? 'Keep drawing' : 'Draw your idea'}</h2>
    <p>${source ? 'Your earlier picture stays on your shelf.' : 'Pick a crayon and make your first mark.'}</p>
    </div><button type="button" data-exit aria-label="Close drawing page">${iconMarkup('close')} Close</button></header>
    <div class="dp-work"><div class="dp-page"><canvas data-paper aria-label="Drawing canvas. Arrows move, Space and arrows draw, Enter makes a dot." tabindex="0"></canvas>
    <details class="dp-help"><summary>Keyboard tools</summary><p>Use the arrows to move. Hold Space and use the arrows to draw. Press Enter for a dot.</p></details></div>
    <div class="dp-tools"><h3>Your crayons</h3><div data-colors role="group" aria-label="Choose a crayon or eraser"></div>
    <label>Size<input data-size type="range" min="3" max="24" value="8"></label>
    <label class="dp-toggle"><input type="checkbox" data-transparent> Clear background</label>
    <div class="dl-edit-row"><button type="button" data-undo>${iconMarkup('undo')} Undo</button><button type="button" data-redo>${iconMarkup('retry')} Redo</button></div>
    <button type="button" data-clear>${iconMarkup('trash')} Start over</button><p role="status" data-message></p></div></div>
    <footer class="dp-foot"><label>Picture name<input data-title maxlength="60" placeholder="My drawing"></label><button type="button" data-save>${iconMarkup('save')} ${source ? 'Keep new version' : 'Keep my drawing'}</button></footer></div>`;
  const $ = <T extends HTMLElement>(selector: string) => dialog.querySelector<T>(selector)!;
  const canvas = $<HTMLCanvasElement>('[data-paper]'), layer = document.createElement('canvas');
  canvas.width = layer.width = sketchWidth;
  canvas.height = layer.height = sketchHeight;
  const ctx = canvas.getContext('2d'), inkLayer = layer.getContext('2d');
  if (!ctx || !inkLayer) throw Error('Drawing tools are unavailable on this device.');
  const title = $<HTMLInputElement>('[data-title]'), paper = $<HTMLInputElement>('[data-transparent]');
  const undo = $<HTMLButtonElement>('[data-undo]'), redo = $<HTMLButtonElement>('[data-redo]');
  const keep = $<HTMLButtonElement>('[data-save]'), clear = $<HTMLButtonElement>('[data-clear]');
  const message = $<HTMLElement>('[data-message]'), colors = $<HTMLElement>('[data-colors]');
  const size = $<HTMLInputElement>('[data-size]');
  title.value = source?.name ?? '';
  let state = original;
  // Share immutable strokes between undo states; the last saved strokes can
  // be undone individually, including after a browser reload or bundle restore.
  const history: Sketch[] = state.strokes.map((_, i) => ({transparent: state.transparent, strokes: state.strokes.slice(0, i)}));
  const future: Sketch[] = [];
  let ink = 0, active: SketchStroke | null = null, pointer: number | null = null;
  let cursor = sketchPoint(sketchWidth / 2, sketchHeight / 2), keyboardCursor = false;
  let closed = false, saving = false, saved = false, pageCurrent = true;
  const dirty = () => state !== original || title.value.trim() !== (source?.name ?? '');
  const alive = () => !closed && checkOwner() && pageCurrent && isCurrent();
  const canEdit = () => {
    if (!alive() || saving || saved) return false;
    if (rewardSourceWritable()) return true;
    message.textContent = 'Return to the active Jems tab to keep drawing.';
    return false;
  };
  const controls = () => {
    const locked = saving || saved || !pageCurrent || !!active;
    undo.disabled = locked || !history.length;
    redo.disabled = locked || !future.length;
    keep.disabled = locked || !state.strokes.length || !dirty();
    clear.disabled = locked || !state.strokes.length;
    for (const control of dialog.querySelectorAll<HTMLInputElement | HTMLButtonElement>('[data-colors] button,input')) control.disabled = locked;
    paper.checked = state.transparent;
    canvas.classList.toggle('dp-transparent', state.transparent);
  };
  const render = (showCursor = true) => {
    ctx.clearRect(0, 0, sketchWidth, sketchHeight);
    ctx.drawImage(layer, 0, 0);
    if (active) paintStroke(ctx, active);
    if (!state.transparent) {
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, sketchWidth, sketchHeight);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (showCursor && keyboardCursor) {
      ctx.save();
      ctx.strokeStyle = '#7142ae';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.arc(cursor.x, cursor.y, Math.max(10, Number(size.value)), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  };
  const rebuild = () => {
    inkLayer.clearRect(0, 0, sketchWidth, sketchHeight);
    for (const stroke of state.strokes) paintStroke(inkLayer, stroke);
    render();
    controls();
  };
  const remember = (next: Sketch) => {
    history.push(state);
    if (history.length > maxStrokes + 1) history.shift();
    future.length = 0;
    state = next;
  };
  const beginStroke = (point: typeof cursor) => {
    if (active || !canEdit()) return false;
    if (state.strokes.length >= maxStrokes) {
      message.textContent = 'This page is full. Undo a mark or keep your drawing.';
      return false;
    }
    active = { ink, size: Number(size.value), points: [point] };
    controls();
    render();
    return true;
  };
  const finish = (commit: boolean) => {
    if (active && commit && canEdit()) {
      remember({...state, strokes: [...state.strokes, active]});
      paintStroke(inkLayer, active);
    }
    active = null;
    pointer = null;
    render();
    controls();
  };
  const position = (event: PointerEvent) => {
    const bounds = canvas.getBoundingClientRect();
    return sketchPoint((event.clientX - bounds.left) * sketchWidth / bounds.width,
      (event.clientY - bounds.top) * sketchHeight / bounds.height);
  };
  canvas.onpointerdown = event => {
    if (event.button !== 0 || !event.isPrimary) return;
    keyboardCursor = false;
    if (!beginStroke(position(event))) return;
    event.preventDefault();
    pointer = event.pointerId;
    canvas.setPointerCapture(pointer);
  };
  canvas.onpointermove = event => {
    if (!active || pointer !== event.pointerId || !canEdit() || active.points.length >= maxStrokePoints) return;
    const p = position(event), last = active.points[active.points.length - 1];
    if (Math.hypot(p.x - last.x, p.y - last.y) <= .9) return;
    active.points.push(p);
    render();
    event.preventDefault();
  };
  canvas.onpointerup = event => { if (event.pointerId === pointer) finish(true); };
  canvas.onpointercancel = canvas.onlostpointercapture = event => { if (event.pointerId === pointer) finish(false); };
  canvas.onkeydown = event => {
    if (!canEdit() || pointer !== null) return;
    keyboardCursor = true;
    if (event.code === 'Space' || event.code === 'Enter') {
      event.preventDefault();
      if (!event.repeat && beginStroke(cursor) && event.code === 'Enter') finish(true);
      return;
    }
    const directions: Record<string, [number, number]> = {ArrowLeft: [-1,0], ArrowRight: [1,0], ArrowUp: [0,-1], ArrowDown: [0,1]};
    const delta = directions[event.code];
    if (!delta) return;
    event.preventDefault();
    const step = event.shiftKey ? 2 : 10;
    cursor = sketchPoint(cursor.x + step * delta[0], cursor.y + step * delta[1]);
    if (active && active.points.length < maxStrokePoints) active.points.push(cursor);
    render();
  };
  canvas.onkeyup = event => { if (event.code === 'Space' && pointer === null) { event.preventDefault(); finish(true); } };
  canvas.onblur = () => { keyboardCursor = false; if (pointer === null) finish(true); else render(); };
  for (const [i, name] of [...colorNames, 'Eraser'].entries()) {
    const b = document.createElement('button');
    b.type = 'button';
    if (i === eraserInk) {
      b.className = 'dp-eraser';
      b.textContent = name;
    } else b.style.background = crayons[i];
    b.setAttribute('aria-label', i === eraserInk ? name : 'Use ' + name + ' crayon');
    b.title = name;
    b.setAttribute('aria-pressed', String(i === ink));
    b.onclick = () => {
      if (!canEdit()) return;
      ink = i;
      for (const choice of colors.querySelectorAll('button')) choice.setAttribute('aria-pressed', String(choice === b));
    };
    colors.append(b);
  }
  title.oninput = controls;
  paper.onchange = () => {
    if (canEdit()) remember({...state, transparent: paper.checked});
    render();
    controls();
  };
  undo.onclick = () => { if (canEdit() && history.length) { future.push(state); state = history.pop()!; rebuild(); } };
  redo.onclick = () => { if (canEdit() && future.length) { history.push(state); state = future.pop()!; rebuild(); } };
  clear.onclick = () => {
    if (canEdit() && state.strokes.length && confirm('Clear the page? Undo can bring it back.')) {
      remember({...state, strokes: []});
      rebuild();
    }
  };
  keep.onclick = async () => {
    if (!canEdit() || active || !state.strokes.length || !dirty()) return;
    saving = true;
    controls();
    render(false);
    try {
      const raster = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(Error('Could not save your drawing.')), 'image/png'));
      const file = await saveSketchPng(raster, state);
      if (!alive()) return;
      const result = await saveDrawing(owner, title.value.trim() || 'My drawing', file, source?.id, alive);
      saved = true;
      if (alive()) { await onSaved(result); if (alive()) dialog.close(); }
    } catch (error) {
      if (alive()) message.textContent = saved ? 'Your drawing is saved. Reopen My Art to see it.' : (error as Error).message;
    } finally { saving = false; if (alive()) { render(); controls(); } }
  };
  const requestClose = () => {
    if (saving) { message.textContent = 'Finishing your save…'; return; }
    if (!saved && (dirty() || active) && !confirm('Leave without keeping these changes?')) return;
    dialog.close();
  };
  $<HTMLButtonElement>('[data-exit]').onclick = requestClose;
  dialog.addEventListener('cancel', event => { event.preventDefault(); requestClose(); });
  const onProfile = () => { if (!checkOwner()) { closed = true; dialog.close(); } };
  const onPage = (event: Event) => {
    pageCurrent = (!originPage || (event as CustomEvent).detail === originPage) && isCurrent();
    finish(false);
    if (pageCurrent) return;
    if (!dirty() || saved) dialog.close();
    else message.textContent = 'Return to My Art to keep these changes, or close to leave them.';
  };
  rebuild();
  if (source) {
    // A portable PNG may have been edited by a tool that incorrectly copied
    // its private chunk. Only reopen strokes that reproduce the saved picture.
    const bitmap = await createImageBitmap(drawingBlob(source));
    try {
      if (!checkOwner() || !isCurrent()) return;
      const reference = document.createElement('canvas');
      reference.width = sketchWidth;
      reference.height = sketchHeight;
      const sample = reference.getContext('2d')!;
      sample.drawImage(bitmap, 0, 0);
      const pixels = sample.getImageData(0, 0, sketchWidth, sketchHeight).data;
      const rendered = ctx.getImageData(0, 0, sketchWidth, sketchHeight).data;
      if (!pixels.every((value, i) => value === rendered[i])) {
        throw Error('These crayon steps look different from your saved picture on this device. Your original is still on the shelf.');
      }
    } finally { bitmap.close(); }
  }
  window.addEventListener('factory-profile', onProfile);
  window.addEventListener('factory-page', onPage);
  dialog.addEventListener('close', () => {
    closed = true;
    active = null;
    window.removeEventListener('factory-profile', onProfile);
    window.removeEventListener('factory-page', onPage);
    canvas.width = layer.width = 1;
    dialog.remove();
    if (checkOwner() && pageCurrent && isCurrent() && returnFocus?.isConnected) returnFocus.focus({preventScroll:true});
  }, {once:true});
  document.body.append(dialog);
  dialog.showModal();
}
