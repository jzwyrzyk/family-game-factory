import {artChoice,resolvePrivateArt} from '../creation/private-art';
import type {SceneBackground} from '../creation/model';
import {WORLD_PLATES} from '../creation/worlds';
import {iconMarkup} from '../brand/icons';
import type {Drawing} from '../assets/private-drawings';
import {defaultAssembly} from './model';
import {saveRig,type SavedRig} from './store';
import {MAX_PATH_POINTS,MOTION_LABELS,motionPose,validateDrawingMotion,type DrawingMotion,type MotionMove,type MotionPoint} from './animation-path';
import './animation-editor.css';

/** Static direction and trail cues keep the picker readable before motion is requested. */
const MOTION_TRAILS: Record<MotionMove,string> = {
  jump:'M3 18 Q10 -4 19 12 M15 11 L19 13 L20 8',
  bounce:'M2 7 Q5 8 8 19 Q12 1 17 16 Q19 9 22 11',
  spin:'M19 8 A8 8 0 1 0 20 15 M20 4 L20 9 L15 9',
  dance:'M8 17 V7 L19 4 V14 M8 10 L19 7 M8 17 Q4 15 3 18 Q3 21 6 20 Q8 20 8 17 M19 14 Q15 12 14 15 Q14 18 17 17 Q19 17 19 14',
  left:'M21 12 H4 M11 5 L4 12 L11 19',
  right:'M3 12 H20 M13 5 L20 12 L13 19',
  float:'M2 15 Q6 7 11 12 T21 8 M16 9 L21 7 L22 12',
  shake:'M2 6 L5 10 L2 14 L5 18 M9 15 L11 7 L16 9 L14 17 Z M19 5 L22 9 L19 13 L22 17',
  path:'M3 18 C3 12 20 17 16 11 S8 7 12 5 Q15 3 20 5 M17 2 L21 5 L18 8',
};
function motionCue(move:MotionMove) {
  const cue=document.createElement('canvas');
  cue.width=cue.height=72;cue.className='art-motion-cue';
  cue.setAttribute('aria-hidden','true');
  const ink=cue.getContext('2d')!;
  ink.scale(3,3);ink.strokeStyle='#4f3978';ink.lineWidth=1.9;
  ink.lineJoin='round';ink.lineCap='round';ink.stroke(new Path2D(MOTION_TRAILS[move]));
  return cue;
}

export async function openAnimationEditor(owner: string, source: Drawing, parent: SavedRig | undefined,
  current: () => boolean, onSaved: (id: string) => Promise<void>, openParts: () => Promise<void>) {
  const exact = await artChoice(owner,{drawingId:source.id,rigId:parent?.id},current);
  const art = await resolvePrivateArt(owner,exact.assetId,current);
  if (!current()) return;
  const prior = parent?.assembly.motion;
  let move: MotionMove = prior?.move || 'jump';
  let world: SceneBackground = prior?.world || 'world-forest-v1';
  let points: MotionPoint[] = structuredClone(prior?.points || []);
  let duration = prior?.durationMs || 1600, elapsed = 0, startedAt = 0, frame = 0;
  let mode: 'ready'|'playing'|'paused'|'done' = 'ready', saving = false;
  const dialog = document.createElement('dialog');
  dialog.id = 'artAnimationPath';
  dialog.setAttribute('aria-labelledby','artAnimationTitle');
  dialog.innerHTML = `<header><h2 id="artAnimationTitle">Make it move</h2><button class="art-button" data-close aria-label="Close animation">${iconMarkup('close')}</button></header>
    <div class="art-motion-layout"><section><div class="art-motion-stage" data-stage>
      <img class="art-motion-world" alt=""><img class="art-motion-plane" data-middle alt="" hidden><img class="art-motion-plane" data-foreground alt="" hidden><canvas class="art-motion-trail" width="800" height="450" aria-hidden="true"></canvas>
    </div><div class="art-motion-toolbar"><button class="art-button" data-play>${iconMarkup('play')} Preview</button>
    <button class="art-button" data-pause>Pause</button><label><span class="art-motion-pace-label">Pace </span><select data-pace aria-label="Pace"><option value="2400">Slow</option><option value="1600">Steady</option><option value="800">Fast</option></select></label></div>
    <p class="art-motion-status" role="status"></p></section><section><h3>Pick a move</h3><div class="art-motion-choices" data-moves></div>
    <div class="art-motion-path-tools" hidden><p>Draw a path, or tap two spots.</p><details><summary>Choose spots with buttons</summary><div class="art-motion-spots"></div></details>
      <button class="art-button" data-undo>${iconMarkup('undo')} Undo path</button></div>
    <label class="art-motion-world-label">World <select data-world></select></label></section></div>
    <footer><button class="art-button" data-parts>Bring its parts to life</button>
    <button class="art-button art-primary" data-save>${iconMarkup('save')} Save animation</button></footer>`;
  const q = <T extends HTMLElement = HTMLElement>(selector: string) => dialog.querySelector<T>(selector)!;
  const stage = q('[data-stage]'), backdrop = q<HTMLImageElement>('.art-motion-world');
  const middle=q<HTMLImageElement>('[data-middle]'),foreground=q<HTMLImageElement>('[data-foreground]');
  function showPlane(image:HTMLImageElement,url?:string) {
    image.hidden=!url;
    if(url && image.getAttribute('src')!==url)image.setAttribute('src',url);
    if(!url)image.removeAttribute('src');
  }
  const sprite = art.image; sprite.className = 'art-motion-sprite';
  sprite.setAttribute('role','img'); sprite.setAttribute('aria-label',source.name);
  stage.append(sprite);
  const controls = q('[data-moves]'), pathTools = q('.art-motion-path-tools');
  const pause = q<HTMLButtonElement>('[data-pause]'), play = q<HTMLButtonElement>('[data-play]');
  const save = q<HTMLButtonElement>('[data-save]'), undo = q<HTMLButtonElement>('[data-undo]');
  const state = q('.art-motion-status'), trail = q<HTMLCanvasElement>('.art-motion-trail');
  const pace = q<HTMLSelectElement>('[data-pace]'), worlds = q<HTMLSelectElement>('[data-world]');
  const history: MotionPoint[][] = [];
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const active = () => current() && dialog.open;
  const snapshot = ():DrawingMotion => ({move,durationMs:duration,world,sprite:prior?.sprite || (parent?'cutout':'original'),...(move==='path'?{points}: {})});
  function hasPath() {return points.length>=2 && points.some(p=>p.x!==points[0].x || p.y!==points[0].y);}
  function paint(phase: number) {
    const pose = motionPose(snapshot(),phase);
    sprite.style.left = pose.x*100+'%'; sprite.style.top = pose.y*100+'%';
    sprite.style.transform = 'translate(-50%, -50%) rotate('+pose.rotation+'deg)';
  }
  function redraw() {
    const plate = WORLD_PLATES[world];
    showPlane(backdrop,plate.url);showPlane(middle,plate.middle);showPlane(foreground,plate.foreground);
    worlds.value = world; pace.value = String(duration);
    pathTools.hidden = move!=='path'; stage.classList.toggle('is-path',move==='path');
    for (const button of controls.querySelectorAll('button')) button.setAttribute('aria-pressed',String(button.dataset.move===move));
    const valid = move!=='path' || hasPath();
    play.disabled = !valid || saving; save.disabled = !valid || saving;
    pause.disabled = saving || (mode!=='playing' && mode!=='paused');
    pause.textContent = mode==='paused'?'Resume':'Pause'; undo.disabled = !history.length || saving;
    const ctx = trail.getContext('2d')!; ctx.clearRect(0,0,800,450);
    if (move==='path' && points.length) {
      ctx.beginPath(); points.forEach((p,i)=>i?ctx.lineTo(p.x*800,p.y*450):ctx.moveTo(p.x*800,p.y*450));
      ctx.lineWidth=7;ctx.strokeStyle='#fff';ctx.stroke();ctx.lineWidth=3;ctx.strokeStyle='#482762';ctx.stroke();
      for(const p of points){ctx.beginPath();ctx.arc(p.x*800,p.y*450,4,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();ctx.stroke();}
    }
    paint(elapsed/duration);
  }
  function reset() { cancelAnimationFrame(frame); elapsed=0; mode='ready'; }
  function tick(now: number) {
    if (!active()) { dialog.close(); return; }
    elapsed=Math.min(duration,now-startedAt); paint(elapsed/duration);
    if(elapsed>=duration){mode='done';redraw();state.textContent='Ready to play again.';}
    else frame=requestAnimationFrame(tick);
  }
  function preview(resume=false) {
    if(!active() || saving || (move==='path'&&!hasPath())) return;
    cancelAnimationFrame(frame);
    if(!resume)elapsed=0;
    startedAt=performance.now()-elapsed;mode='playing';
    redraw();state.textContent=MOTION_LABELS[move]+' is playing.';frame=requestAnimationFrame(tick);
  }
  function remember(previous: MotionPoint[]) {
    history.push(previous);if(history.length>32)history.shift();
    state.textContent=points.length+' path spots.';redraw();
  }
  for (const [key,label] of Object.entries(MOTION_LABELS)) {
    const button=document.createElement('button');button.className='art-button';button.append(motionCue(key as MotionMove),document.createTextNode(label));button.dataset.move=key;
    button.onclick=()=>{if(saving)return;reset();move=key as MotionMove;redraw();
      if(move==='path'&&!hasPath())state.textContent='Choose your first spot.';
      else preview();};controls.append(button);
  }
  for(const [key,plate] of Object.entries(WORLD_PLATES))worlds.add(new Option(plate.label,key));
  if(![800,1600,2400].includes(duration))pace.add(new Option('Saved pace',String(duration)));
  worlds.onchange=()=>{if(saving)return;world=worlds.value as SceneBackground;redraw();};
  pace.onchange=()=>{
    if(saving)return;
    const playing=mode==='playing',phase=elapsed/duration;
    duration=Number(pace.value);elapsed=phase*duration;
    if(playing)preview(true);else redraw();
  };
  pause.onclick=()=>{if(mode==='paused'){preview(true);return;}if(mode!=='playing')return;
    elapsed=Math.min(duration,performance.now()-startedAt);cancelAnimationFrame(frame);mode='paused';redraw();state.textContent='Paused.';};
  play.onclick=()=>preview();
  const names=['Top left','Top middle','Top right','Middle left','Middle','Middle right','Bottom left','Bottom middle','Bottom right'];
  names.forEach((name,i)=>{
    const b=document.createElement('button');b.textContent=name;b.className='art-button';b.type='button';
    b.onclick=()=>{if(saving)return;if(points.length>=MAX_PATH_POINTS){state.textContent='Your path is full. Undo a spot to change it.';return;}
      reset();const previous=points; points=[...points,{x:[.17,.5,.83][i%3],y:[.22,.5,.78][Math.floor(i/3)]}];remember(previous);};
    q('.art-motion-spots').append(b);
  });
  let drag: {id:number;before:MotionPoint[];samples:MotionPoint[]} | null = null;
  const point=(event:PointerEvent):MotionPoint=>{const r=stage.getBoundingClientRect();
    return {x:Math.max(.02,Math.min(.98,(event.clientX-r.left)/r.width)),y:Math.max(.02,Math.min(.98,(event.clientY-r.top)/r.height))};};
  function sample(event:PointerEvent) {
    if(!drag||event.pointerId!==drag.id)return;
    const at=point(event),previous=drag.samples.at(-1)!;
    if(Math.hypot(at.x-previous.x,at.y-previous.y)<.022)return;
    drag.samples.push(at);
    if(drag.samples.length>128)drag.samples=drag.samples.filter((_,i)=>i%2===0);
    const count=Math.min(MAX_PATH_POINTS,drag.samples.length);
    points=Array.from({length:count},(_,i)=>drag!.samples[Math.round(i*(drag!.samples.length-1)/(count-1))]);redraw();
  }
  function cancelStroke(){if(!drag)return;points=drag.before;drag=null;redraw();}
  stage.onpointerdown=event=>{
    if(saving||move!=='path'||drag||event.button!==0)return;event.preventDefault();reset();
    drag={id:event.pointerId,before:points,samples:[point(event)]};stage.setPointerCapture(event.pointerId);
  };
  stage.onpointermove=sample;
  stage.onpointerup=event=>{
    if(!drag||event.pointerId!==drag.id)return;
    sample(event);const {samples,before}=drag;drag=null;
    if(samples.length===1){
      if(before.length>=MAX_PATH_POINTS){points=before;state.textContent='Your path is full. Undo a spot to change it.';redraw();return;}
      points=[...before,samples[0]];
    }
    remember(before);
  };
  stage.onpointercancel=event=>{if(drag?.id===event.pointerId)cancelStroke();};
  stage.onlostpointercapture=event=>{if(drag?.id===event.pointerId)cancelStroke();};
  undo.onclick=()=>{if(!history.length||saving)return;reset();points=history.pop()!;redraw();state.textContent='Last path change undone.';};
  q('[data-close]').onclick=()=>{if(!saving)dialog.close();};
  dialog.oncancel=event=>{if(saving)event.preventDefault();};
  q('[data-parts]').onclick=async()=>{if(saving||!active())return;dialog.close();await openParts();};
  save.onclick=async()=>{
    if(!active()||saving||drag)return;
    reset();saving=true;redraw();state.textContent='Saving your animation…';
    try{
      const motion=validateDrawingMotion(snapshot());
      const assembly=parent?.assembly || defaultAssembly(source,'character',[{
        id:'picture',name:'My drawing',role:'decoration',physical:false,parentId:null,
        region:{x:0,y:0,w:1,h:1,shape:'rect'},
      }]);
      const saved=await saveRig(owner,{...assembly,motion,revision:parent?assembly.revision+1:1},parent?.id??null,active);
      if(active()){dialog.close();await onSaved(saved.id);}
    }catch(error){if(active())state.textContent=(error as Error).message;}
    finally{saving=false;if(active())redraw();}
  };
  const departed=()=>{if(!active())dialog.close();};
  const route=(event:Event)=>{if((event as CustomEvent).detail!=='art-studio')dialog.close();};
  dialog.addEventListener('close',()=>{
    cancelAnimationFrame(frame);window.removeEventListener('factory-profile',departed);
    window.removeEventListener('factory-page',route);dialog.remove();if(current()&&opener?.isConnected)opener.focus({preventScroll:true});
  },{once:true});
  window.addEventListener('factory-profile',departed);window.addEventListener('factory-page',route);
  document.body.append(dialog);redraw();dialog.showModal();
}
