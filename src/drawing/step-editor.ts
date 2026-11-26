import { createFixedClock } from '../quality/clock';
import { MAX_MOTION_STOPS, MOTION_START, motionPosition, sampleMotion, type DrawingMotion, type MotionPoint } from './relative-stops';
import './step-editor.css';

interface EditorActions {
  read(): DrawingMotion | undefined;
  change(motion?: DrawingMotion): void;
  canEdit(): boolean;
  save(): void;
  close(): void;
}

function createMotionEditor(source: HTMLCanvasElement, name: string, actions: EditorActions) {
  const panel = document.createElement('section');
  panel.className = 'dl-motion';
  panel.hidden = true;
  panel.setAttribute('aria-label', 'Picture animation');
  panel.innerHTML = `<div class="dl-motion-stage"><h3>Draw a path</h3>
    <p>Tap where your picture should go next. You can also use the arrows.</p>
    <canvas width="800" height="450" aria-label="Animation page"></canvas></div>
    <div class="dl-motion-controls"><div data-directions role="group" aria-label="Add a step"></div>
    <p data-count role="status"></p><label>Speed <select><option value="1200">Slow</option><option value="700" selected>Medium</option><option value="350">Fast</option></select></label>
    <button type="button" data-back>Take back a step</button><button type="button" data-play>Play my path</button>
    <button type="button" data-save-motion>Save animation</button><button type="button" data-pieces>Edit pieces</button></div>`;
  const canvas = panel.querySelector('canvas')!;
  const context = canvas.getContext('2d')!;
  const field = <T extends HTMLElement>(key: string) => panel.querySelector<T>(key)!;
  const speed = field<HTMLSelectElement>('select');
  const count = field('[data-count]');
  const play = field<HTMLButtonElement>('[data-play]');
  const save = field<HTMLButtonElement>('[data-save-motion]');
  const back = field<HTMLButtonElement>('[data-back]');
  const width = canvas.width, height = canvas.height, size = 140;
  let clock: ReturnType<typeof createFixedClock> | undefined;
  const directions = [
    { label: 'Left', symbol: '←', x: -.2, y: 0 }, { label: 'Up', symbol: '↑', x: 0, y: -.2 },
    { label: 'Down', symbol: '↓', x: 0, y: .2 }, { label: 'Right', symbol: '→', x: .2, y: 0 },
  ];
  for (const d of directions) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = d.symbol;
    b.setAttribute('aria-label', 'Step ' + d.label.toLowerCase());
    b.onclick = () => {
      const last = actions.read()?.stops.at(-1) ?? MOTION_START;
      append({ x: last.x + d.x, y: last.y + d.y });
    };
    field('[data-directions]').append(b);
  }

  function stop() {
    clock?.dispose(); clock = undefined;
    play.textContent = 'Play my path';
  }
  function paint(position?: MotionPoint) {
    const motion = actions.read();
    context.clearRect(0, 0, width, height);
    const place = (p: MotionPoint) => motionPosition(p, width, height, size);
    if (!position) {
      const stops = [MOTION_START, ...(motion?.stops ?? [])].map(place);
      context.beginPath();
      for (const [i, p] of stops.entries()) {
        if (!i) context.moveTo(p.x, p.y); else context.lineTo(p.x, p.y);
      }
      context.strokeStyle = '#655086'; context.lineWidth = 4; context.setLineDash([7, 8]); context.stroke(); context.setLineDash([]);
      for (const p of stops) {
        context.beginPath(); context.arc(p.x, p.y, 7, 0, 2 * Math.PI);
        context.fillStyle = '#563777'; context.fill();
      }
    }
    const point = place(position ?? motion?.stops.at(-1) ?? MOTION_START);
    const scale = size / Math.max(source.width, source.height);
    const w = source.width * scale, h = source.height * scale;
    context.drawImage(source, point.x - w / 2, point.y - h / 2, w, h);
  }
  function append(point: MotionPoint) {
    if (!actions.canEdit()) return;
    const stops = actions.read()?.stops ?? [];
    if (stops.length === MAX_MOTION_STOPS) return;
    const bound = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 1000) / 1000;
    stop();
    actions.change({ stepMs: Number(speed.value), stops: [...stops, { x: bound(point.x), y: bound(point.y) }] });
  }
  canvas.addEventListener('click', event => {
    const box = canvas.getBoundingClientRect();
    append({ x: ((event.clientX - box.left) / box.width * width - size / 2) / (width - size),
      y: ((event.clientY - box.top) / box.height * height - size / 2) / (height - size) });
  });
  back.onclick = () => {
    if (!actions.canEdit()) return;
    const motion = actions.read(); if (!motion) return;
    stop(); actions.change(motion.stops.length > 1 ? { ...motion, stops: motion.stops.slice(0, -1) } : undefined);
  };
  speed.onchange = () => {
    if (!actions.canEdit()) return;
    const motion = actions.read(); stop();
    if (motion) actions.change({ ...motion, stepMs: Number(speed.value) });
  };
  play.onclick = () => {
    if (clock) { stop(); paint(); return; }
    const motion = actions.read();
    if (!actions.canEdit() || !motion) return;
    let elapsed = 0;
    clock = createFixedClock({
      update(dt) { elapsed += dt * 1000; },
      render() {
        paint(sampleMotion(motion, elapsed));
        if (elapsed >= motion.stops.length * motion.stepMs) stop();
      },
    });
    play.textContent = 'Stop playing'; clock.start();
  };
  save.onclick = () => { stop(); actions.save(); };
  field('[data-pieces]').onclick = () => { stop(); actions.close(); };
  return {
    panel, stop,
    refresh(locked: boolean, saved: boolean) {
      const motion = actions.read();
      if (motion) speed.value = String(motion.stepMs);
      const n = motion?.stops.length ?? 0;
      count.textContent = n === MAX_MOTION_STOPS ? 'All twelve steps are ready.' : n + (n === 1 ? ' step' : ' steps');
      canvas.setAttribute('aria-label', name + ' animation page, ' + count.textContent);
      for (const b of panel.querySelectorAll<HTMLButtonElement>('[data-directions] button')) b.disabled = locked || n === MAX_MOTION_STOPS;
      back.disabled = play.disabled = !n || locked;
      save.disabled = !n || locked || saved;
      speed.disabled = locked;
      if (!clock) paint();
    },
  };
}

export function editRelativeSteps(source:HTMLCanvasElement, name:string, previous:DrawingMotion | undefined,
  current:()=>boolean, keep:(motion:DrawingMotion)=>Promise<void>, editParts:()=>void) {
  const dialog = document.createElement('dialog');
  dialog.className = 'motion-path';
  dialog.setAttribute('aria-label','Plot a path with arrows');
  const close = document.createElement('button');
  close.type = 'button'; close.className = 'art-button'; close.textContent = 'Close';
  close.onclick = () => dialog.close();
  const status = document.createElement('p'); status.setAttribute('role','status');
  let motion = previous && structuredClone(previous), busy = false;
  const alive = () => current() && dialog.open;
  const editor = createMotionEditor(source,name,{
    read:()=>motion, canEdit:()=>alive() && !busy,
    change:value=>{ if (alive() && !busy) {motion = value; editor.refresh(false,false);} },
    async save() {
      if (!alive() || busy || !motion) return;
      busy = true; editor.refresh(true,false);
      try { await keep(motion); if (dialog.open) dialog.close(); }
      catch (error) {if(alive()) status.textContent = (error as Error).message;}
      finally {busy=false;if(alive()) editor.refresh(false,false);}
    },
    close:()=>{ if (!alive() || busy) return; dialog.close(); editParts(); },
  });
  const changedOwner = () => {if(dialog.open) dialog.close();};
  window.addEventListener('factory-profile-changing', changedOwner);
  window.addEventListener('factory-page', changedOwner);
  dialog.addEventListener('close',()=>{editor.stop();dialog.remove();
    window.removeEventListener('factory-profile-changing',changedOwner);
    window.removeEventListener('factory-page',changedOwner);},{once:true});
  dialog.append(close,editor.panel,status);document.body.append(dialog);
  dialog.showModal(); editor.panel.hidden=false; editor.refresh(false,false);
}
