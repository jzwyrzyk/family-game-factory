type Point = {x: number; y: number};
type Tool = 'Pencil' | 'Eraser';
type Mark = {tool: Tool; points: Point[]};
type Edit = Mark | 'clear';
const width = 840, height = 560;
const historyLimit = 64, pointLimit = 4096;
const bound = (value: number, max: number) => Math.min(max, Math.max(0, value));

function drawSegment(ctx: CanvasRenderingContext2D, tool: Tool, from: Point, to: Point) {
  ctx.globalCompositeOperation = tool === 'Eraser' ? 'destination-out' : 'source-over';
  ctx.strokeStyle = ctx.fillStyle = '#0B1E3B';
  ctx.lineWidth = tool === 'Eraser' ? 34 : 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (from.x === to.x && from.y === to.y) {
    ctx.arc(to.x, to.y, ctx.lineWidth / 2, 0, 2 * Math.PI);
    ctx.fill();
  } else {
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }
}

function applyEdit(ctx: CanvasRenderingContext2D, edit: Edit) {
  if (edit === 'clear') {
    ctx.clearRect(0, 0, width, height);
    return;
  }
  edit.points.forEach((point, i) => drawSegment(ctx, edit.tool, edit.points[Math.max(0, i - 1)], point));
}

/** An ephemeral sheet. Its baseline bitmap bounds the history without discarding visible marks. */
export function mountPaper(details: HTMLDetailsElement, signal: AbortSignal) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', 'Scratch paper. Use arrow keys to move, Shift and arrows to draw, or Enter to make a dot.');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    const message = document.createElement('p');
    message.textContent = 'Scratch paper is unavailable on this device.';
    details.append(message);
    return;
  }
  const baseline = document.createElement('canvas');
  baseline.width = width;
  baseline.height = height;
  const baseCtx = baseline.getContext('2d')!;
  const paper = document.createElement('div');
  paper.className = 'learning-scratch-paper';
  const cursor = document.createElement('span');
  cursor.className = 'learning-scratch-cursor';
  cursor.hidden = true;
  const tip = document.createElement('p');
  tip.className = 'learning-scratch-key-tip';
  tip.textContent = 'Arrow keys move. Hold Shift to draw. Enter makes a dot.';
  paper.append(canvas, cursor);
  const tools = document.createElement('div');
  tools.className = 'learning-scratch-tools';
  tools.setAttribute('role','group');
  tools.setAttribute('aria-label','Scratchpad tools');
  details.append(tools, paper, tip);

  let tool: Tool = 'Pencil';
  let active: Mark | null = null;
  let pointer: number | null = null;
  let position = {x: width / 2, y: height / 2};
  const history: Edit[] = [];
  let applied = 0, baseHasMarks = false;

  function controls() {
    pencil.setAttribute('aria-pressed', String(tool === 'Pencil'));
    eraser.setAttribute('aria-pressed', String(tool === 'Eraser'));
    undo.disabled = applied === 0;
    redo.disabled = applied === history.length;
    clear.disabled = applied ? history[applied - 1] === 'clear' : !baseHasMarks;
  }
  function redraw() {
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(baseline, 0, 0);
    for (let i = 0; i < applied; i++) applyEdit(ctx, history[i]);
    controls();
  }
  function commit(edit: Edit) {
    history.splice(applied);
    history.push(edit);
    if (history.length > historyLimit) {
      const oldest = history.shift()!;
      applyEdit(baseCtx, oldest);
      baseHasMarks = oldest !== 'clear';
    }
    applied = history.length;
    controls();
  }
  function finish() {
    if (active) commit(active);
    active = null;
    pointer = null;
  }
  function action(label: string, callback: () => void) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', () => {
      finish();
      callback();
    }, {signal});
    tools.append(button);
    return button;
  }
  const pencil = action('Pencil', () => { tool = 'Pencil'; controls(); });
  const eraser = action('Eraser', () => { tool = 'Eraser'; controls(); });
  const undo = action('Undo', () => { if (applied) applied--; redraw(); });
  const redo = action('Redo', () => { if (applied < history.length) applied++; redraw(); });
  const clear = action('Clear paper', () => { commit('clear'); ctx.clearRect(0, 0, width, height); });
  controls();

  function addPoint(point: Point) {
    if (!active || !ctx) return;
    const last = active.points.at(-1);
    if (last && Math.hypot(point.x - last.x, point.y - last.y) < 0.8) return;
    // Keep long strokes responsive and bounded at the Studio's per-stroke point limit.
    if (active.points.length === pointLimit) {
      commit(active);
      active = {tool, points: [last!]};
    }
    active.points.push(point);
    drawSegment(ctx, active.tool, last ?? point, point);
  }
  function pointFor(event: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    return {x: bound((event.clientX - rect.left) / rect.width * width, width),
      y: bound((event.clientY - rect.top) / rect.height * height, height)};
  }
  canvas.addEventListener('pointerdown', event => {
    if (pointer !== null || event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    finish();
    pointer = event.pointerId;
    cursor.hidden = true;
    canvas.setPointerCapture(pointer);
    active = {tool, points: []};
    addPoint(pointFor(event));
  }, {signal});
  canvas.addEventListener('pointermove', event => {
    if (pointer === event.pointerId) addPoint(pointFor(event));
  }, {signal});
  canvas.addEventListener('pointerup', event => {
    if (pointer !== event.pointerId) return;
    addPoint(pointFor(event));
    finish();
  }, {signal});
  function cancel(event: PointerEvent) {
    if (pointer !== event.pointerId) return;
    active = null;
    pointer = null;
    redraw();
  }
  canvas.addEventListener('pointercancel', cancel, {signal});
  canvas.addEventListener('lostpointercapture', cancel, {signal});
  function showCursor() {
    cursor.hidden = false;
    cursor.style.left = (position.x / width * 100) + '%';
    cursor.style.top = (position.y / height * 100) + '%';
  }
  const steps: Record<string, [number, number]> = {ArrowLeft: [-8,0], ArrowRight: [8,0], ArrowUp: [0,-8], ArrowDown: [0,8]};
  canvas.addEventListener('focus', showCursor, {signal});
  canvas.addEventListener('keydown', event => {
    if (pointer !== null || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      if (event.repeat) return;
      finish();
      active = {tool, points: []};
      addPoint(position);
      finish();
      showCursor();
      return;
    }
    const step = steps[event.key];
    if (!step) return;
    event.preventDefault();
    if (event.shiftKey && !active) {
      active = {tool, points: []};
      addPoint(position);
    } else if (!event.shiftKey) finish();
    position = {x: bound(position.x + step[0], width), y: bound(position.y + step[1], height)};
    addPoint(position);
    showCursor();
  }, {signal});
  canvas.addEventListener('keyup', event => { if (event.key === 'Shift' && pointer === null) finish(); }, {signal});
  canvas.addEventListener('blur', () => { if (pointer === null) finish(); cursor.hidden = true; }, {signal});
  details.addEventListener('toggle', () => { if (!details.open) finish(); }, {signal});
  signal.addEventListener('abort', () => {
    if (pointer !== null && canvas.hasPointerCapture(pointer)) canvas.releasePointerCapture(pointer);
    active = null;
    history.length = 0;
    canvas.width = baseline.width = 0;
  }, {once: true});
}
