import type { Drawing } from '../assets/private-drawings';
import { artChoice, resolvePrivateArt } from '../creation/private-art';
import { assertRewardSourceWritable } from '../rewards/write-guard';
import { defaultAssembly } from './model';
import { MAX_PATH_POINTS, type DrawingMotion, type PathPoint } from './motion';
import { rigById, saveRig, type SavedRig } from './store';
import './motion.css';

const unit = (value: number) => Math.max(0, Math.min(1, value));

/** A path is another immutable movement version in the same private art store. */
export async function editMotionPath(owner: string, source: Drawing, rigId: string | undefined,
  current: () => boolean, onSaved: (saved: SavedRig) => Promise<void>) {
  const sameView = () => current() && String((window as any).FG.store.current().id) === owner;
  assertRewardSourceWritable();
  if (!sameView() || source.owner !== owner) throw Error('Open a drawing from your own art.');
  const choice = await artChoice(owner, {drawingId: source.id, rigId}, sameView);
  const resolved = await resolvePrivateArt(owner, choice.assetId, sameView);
  const parent = rigId ? await rigById(owner, rigId) : null;
  if (!sameView()) return;
  const assembly = parent?.assembly ?? defaultAssembly(source, 'character', [{
    id:'picture', name:'My picture', role:'body', physical:true, parentId:null,
    region:{x:0, y:0, w:1, h:1, shape:'rect'},
  }]);
  const motion: DrawingMotion = structuredClone(assembly.motion ?? {points:[], stepMs:600, sprite:parent ? 'cutout' : 'original'});
  const dialog = document.createElement('dialog');
  dialog.className = 'motion-path';
  dialog.setAttribute('aria-labelledby', 'motionPathTitle');
  dialog.innerHTML = `<header><h2 id="motionPathTitle">Draw a path</h2><button type="button" data-close class="art-button">Close</button></header>
    <p id="motionPathHelp">Tap the stops or draw the path your art will follow.</p>
    <canvas width="800" height="450" tabindex="0" role="group" aria-label="Path for your art" aria-describedby="motionPathHelp motionPathKeys"></canvas>
    <div class="motion-path-controls">
      <button type="button" class="art-button" data-undo>Undo</button>
      <label>Speed <select data-speed><option value="1000">Slow</option><option value="600">Medium</option><option value="300">Fast</option></select></label>
      <button type="button" class="art-button" data-preview>Play path</button>
      <button type="button" class="art-button art-primary" data-save>Save path</button>
    </div>
    <p data-status role="status" aria-live="polite"></p>
    <p id="motionPathKeys" class="motion-path-keys">Use the arrow keys to aim. Press Enter to add a stop.</p>`;
  const canvas = dialog.querySelector('canvas')!;
  const ctx = canvas.getContext('2d')!;
  const close = dialog.querySelector<HTMLButtonElement>('[data-close]')!;
  const undo = dialog.querySelector<HTMLButtonElement>('[data-undo]')!;
  const play = dialog.querySelector<HTMLButtonElement>('[data-preview]')!;
  const save = dialog.querySelector<HTMLButtonElement>('[data-save]')!;
  const speed = dialog.querySelector<HTMLSelectElement>('[data-speed]')!;
  const status = dialog.querySelector<HTMLElement>('[data-status]')!;
  speed.value = String(motion.stepMs);
  const previous = document.activeElement as HTMLElement | null;
  const history: PathPoint[][] = [];
  let cursor: PathPoint = motion.points.at(-1) ?? {x:.5,y:.5};
  let dragging: {id:number; before:PathPoint[]} | null = null;
  let frame = 0, busy = false, saved = false, keyboard = false;
  const alive = () => dialog.open && sameView();
  const changed = () => JSON.stringify(motion) !== JSON.stringify(assembly.motion ?? {points:[],stepMs:600,sprite:motion.sprite});
  const paint = (sprite: PathPoint = motion.points.at(-1) ?? cursor) => {
    const {width:w,height:h} = canvas;
    ctx.clearRect(0,0,w,h);
    ctx.beginPath();
    for (const [i,point] of motion.points.entries()) {
      if (i === 0) ctx.moveTo(point.x*w,point.y*h);
      else ctx.lineTo(point.x*w,point.y*h);
    }
    ctx.lineCap='round'; ctx.lineJoin='round'; ctx.strokeStyle='#fff'; ctx.lineWidth=8; ctx.stroke();
    ctx.strokeStyle='#45286e'; ctx.lineWidth=4; ctx.stroke();
    motion.points.forEach(({x,y}) => {
      ctx.beginPath(); ctx.arc(x*w,y*h,6,0,2*Math.PI); ctx.fillStyle='#fff'; ctx.fill(); ctx.stroke();
    });
    const image = resolved.image, scale = 140 / Math.max(image.width,image.height);
    ctx.drawImage(image,sprite.x*w-image.width*scale/2,sprite.y*h-image.height*scale/2,image.width*scale,image.height*scale);
    if (keyboard) {
      ctx.beginPath(); ctx.arc(cursor.x*w,cursor.y*h,13,0,2*Math.PI);
      ctx.strokeStyle='#fff'; ctx.lineWidth=7; ctx.stroke(); ctx.strokeStyle='#3b1d64'; ctx.lineWidth=3; ctx.stroke();
    }
  };
  const controls = () => {
    const ready = motion.points.length >= 2;
    save.disabled = busy || saved || dragging !== null || !ready || !changed();
    undo.disabled = busy || saved || dragging !== null || !(history.length || motion.points.length);
    play.disabled = busy || saved || dragging !== null || !ready;
    play.textContent = frame ? 'Stop' : 'Play path';
    speed.disabled = busy || saved;
  };
  const stop = () => { cancelAnimationFrame(frame); frame=0; paint(); controls(); };
  const showCount = () => {
    status.textContent = motion.points.length === MAX_PATH_POINTS ? 'Your path is full. Play it or undo a stop.'
      : motion.points.length ? motion.points.length + (motion.points.length === 1 ? ' stop. Add one more.' : ' stops.') : 'Choose a starting spot.';
    paint(); controls();
  };
  const add = (point: PathPoint) => {
    if (motion.points.length < MAX_PATH_POINTS) motion.points.push(point);
    cursor=point;
  };
  const position = (event: PointerEvent): PathPoint => {
    const rect=canvas.getBoundingClientRect();
    return {x:unit((event.clientX-rect.left)/rect.width),y:unit((event.clientY-rect.top)/rect.height)};
  };
  canvas.onpointerdown = event => {
    if (!alive() || busy || saved || dragging || event.button !== 0 || motion.points.length >= MAX_PATH_POINTS) return;
    stop(); keyboard=false;
    dragging={id:event.pointerId, before:[...motion.points]};
    canvas.setPointerCapture(event.pointerId); add(position(event)); paint(); controls();
  };
  canvas.onpointermove = event => {
    if (dragging?.id !== event.pointerId || !alive()) return;
    const point=position(event), last=motion.points.at(-1)!;
    if (Math.hypot(point.x-last.x,(point.y-last.y)*canvas.height/canvas.width) >= .09) { add(point); paint(); }
  };
  canvas.onpointerup = event => {
    if (dragging?.id !== event.pointerId) return;
    const end=position(event), last=motion.points.at(-1)!;
    if (Math.hypot(end.x-last.x,end.y-last.y) > .025) add(end);
    history.push(dragging.before); dragging=null; showCount();
  };
  canvas.onpointercancel = canvas.onlostpointercapture = event => {
    if (dragging?.id !== event.pointerId) return;
    motion.points=dragging.before; dragging=null; showCount();
  };
  canvas.onkeydown = event => {
    if (!alive() || busy || saved || dragging) return;
    if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter',' '].includes(event.key)) return;
    event.preventDefault(); stop(); keyboard=true;
    if (event.key === 'Enter' || event.key === ' ') {
      if (motion.points.length < MAX_PATH_POINTS) { history.push([...motion.points]); add({...cursor}); }
    } else {
      cursor={x:unit(cursor.x+(event.key==='ArrowRight'?.05:event.key==='ArrowLeft'?-.05:0)),
        y:unit(cursor.y+(event.key==='ArrowDown'?.05:event.key==='ArrowUp'?-.05:0))};
    }
    showCount();
    if(event.key.startsWith('Arrow')) status.textContent='Across '+Math.round(cursor.x*100)+'%, down '+Math.round(cursor.y*100)+'%.';
  };
  undo.onclick = () => { stop(); motion.points=history.pop() ?? motion.points.slice(0,-1); showCount(); };
  speed.onchange = () => { stop(); motion.stepMs=Number(speed.value); controls(); };
  play.onclick = () => {
    if (frame) { stop(); return; }
    const start=performance.now();
    const tick = (now: number) => {
      if (!alive()) { stop(); return; }
      const step=Math.max(0,now-start)/motion.stepMs, index=Math.floor(step);
      if (index >= motion.points.length-1) { stop(); return; }
      const a=motion.points[index], b=motion.points[index+1], fraction=step-index;
      paint({x:a.x+(b.x-a.x)*fraction, y:a.y+(b.y-a.y)*fraction});
      frame=requestAnimationFrame(tick);
    };
    keyboard=false; frame=requestAnimationFrame(tick); controls();
  };
  save.onclick = async () => {
    if (busy || saved || !alive() || dragging) return;
    busy=true; stop();
    try {
      const result=await saveRig(owner,{...assembly, motion, revision:parent ? assembly.revision+1 : 1}, parent?.id ?? null, alive);
      saved=true;
      if (alive()) { await onSaved(result); dialog.close(); }
    } catch(error) {
      if (alive()) status.textContent=saved ? 'Path saved. Reopen My Art to find it.' : (error as Error).message;
    } finally { busy=false; if(alive()) controls(); }
  };
  const requestClose = () => {
    if (!busy && (saved || !changed() || confirm('Leave this path without saving?'))) dialog.close();
  };
  close.onclick=requestClose;
  dialog.oncancel=event=>{event.preventDefault();requestClose();};
  const pageChange=()=>{if(!sameView())dialog.close();};
  const hidden=()=>{if(document.hidden)stop();};
  window.addEventListener('factory-page',pageChange); window.addEventListener('factory-profile',pageChange);
  document.addEventListener('visibilitychange',hidden);
  dialog.onclose=()=>{
    cancelAnimationFrame(frame); resolved.image.width=resolved.image.height=canvas.width=canvas.height=1;
    dialog.remove(); window.removeEventListener('factory-page',pageChange); window.removeEventListener('factory-profile',pageChange);
    document.removeEventListener('visibilitychange',hidden);
    if(sameView() && previous?.isConnected)previous.focus();
  };
  document.body.append(dialog); dialog.showModal(); showCount(); canvas.focus();
}
