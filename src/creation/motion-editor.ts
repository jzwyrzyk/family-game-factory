import { MAX_PATH_STEPS, pathFromPoints, type PathPoint, type MotionPath } from './motion-path';
import type { CreationProject, SceneActor } from './model';
import './motion-editor.css';

type PathEditorOptions = {
  scene: CreationProject; actor: SceneActor; image: HTMLCanvasElement;
  listScenes(): Promise<{id:string; title:string}[]>;
  loadPaths(id:string): Promise<MotionPath[]>;
  current(): boolean;
  apply(path:MotionPath): Promise<void>;
};

/** View-scoped input only. Persistence, undo and playback belong to Creative Studio. */
export function openMotionEditor(parent: HTMLElement, options: PathEditorOptions) {
  const {scene, actor, image} = options;
  const dialog = document.createElement('dialog');
  dialog.className = 'creation-dialog creation-path-editor';
  dialog.setAttribute('aria-labelledby','creationPathHeading');
  dialog.innerHTML = `<div class="creation-shelf-heading"><h2 id="creationPathHeading">Draw a path</h2>
    <button type="button" class="creation-button" data-close>Close</button></div>
    <p>Draw where your art should go, or use the arrows.</p>
    <canvas role="img" aria-label="Movement path on the stage"></canvas>
    <div class="path-controls" role="group" aria-label="Add a step">
      <button type="button" aria-label="Move left" data-dx="-40">←</button>
      <button type="button" aria-label="Move up" data-dy="-40">↑</button>
      <button type="button" aria-label="Move down" data-dy="40">↓</button>
      <button type="button" aria-label="Move right" data-dx="40">→</button>
      <button type="button" data-undo>Undo step</button>
    </div>
    <div class="path-fields"><label>Path name<input data-name maxlength="40" placeholder="My path"></label>
      <label>Speed<select data-speed><option value="100">Slow</option><option value="200" selected>Steady</option><option value="360">Quick</option></select></label></div>
    <details><summary>Paths from my kept scenes</summary>
      <label>Choose a scene<select data-scenes><option value="">Choose a scene</option></select></label>
      <div data-paths></div></details>
    <p data-status role="status"></p>
    <button type="button" class="creation-button creation-primary" data-use>Add path to my blocks</button>`;
  const get = <T extends HTMLElement>(selector:string) => dialog.querySelector<T>(selector)!;
  const canvas = get<HTMLCanvasElement>('canvas'), context = canvas.getContext('2d')!;
  canvas.width = scene.width; canvas.height = scene.height;
  canvas.style.maxWidth = (32 * scene.width / scene.height) + 'dvh';
  const points: PathPoint[] = [{x:actor.x, y:actor.y}];
  const message = get('[data-status]'), use = get<HTMLButtonElement>('[data-use]'), undo = get<HTMLButtonElement>('[data-undo]');
  const name = get<HTMLInputElement>('[data-name]'), speed = get<HTMLSelectElement>('[data-speed]');
  let activePointer: number | null = null, beforeStroke = 0, submitting = false, lookup = 0;
  const current = () => dialog.open && options.current();
  const disableDuringSave = (disabled:boolean) => { dialog.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>('button,input,select').forEach(el=>el.disabled=disabled); };
  function renderPath() {
    context.clearRect(0,0,canvas.width,canvas.height);
    const last = points.at(-1)!;
    context.strokeStyle='#654799';context.lineWidth=5;context.lineJoin='round';context.lineCap='round';
    context.beginPath();
    points.forEach((p,i)=>i ? context.lineTo(p.x,p.y) : context.moveTo(p.x,p.y));
    context.stroke();
    context.fillStyle='#3e2862';context.beginPath();context.arc(points[0].x,points[0].y,7,0,Math.PI*2);context.fill();
    const scale = (actor.size ?? 72) / Math.max(image.width,image.height);
    context.drawImage(image,last.x-image.width*scale/2,last.y-image.height*scale/2,image.width*scale,image.height*scale);
    const count = points.length-1;
    use.disabled = undo.disabled = !count || submitting;
    message.textContent = count===MAX_PATH_STEPS ? 'Path full. Use it or undo a step.' : count ? count+(count===1?' step':' steps')+' in your path.' : 'Start at your artwork.';
  }
  function add(x:number,y:number, threshold=0) {
    if (submitting || points.length>MAX_PATH_STEPS) return;
    const previous = points.at(-1)!;
    const next = {x:Math.round(Math.max(0, Math.min(scene.width,x))),y:Math.round(Math.max(0, Math.min(scene.height,y)))};
    if(Math.hypot(next.x-previous.x,next.y-previous.y)<=threshold)return;
    points.push(next);renderPath();
  }
  function pointer(event:PointerEvent,threshold=0) {
    const box = canvas.getBoundingClientRect();
    add((event.clientX-box.left)*scene.width/box.width,(event.clientY-box.top)*scene.height/box.height,threshold);
  }
  canvas.onpointerdown=event=>{
    if(!event.isPrimary||event.button!==0||activePointer!==null||submitting)return;
    beforeStroke=points.length;activePointer=event.pointerId;canvas.setPointerCapture(event.pointerId);pointer(event,6);
  };
  canvas.onpointermove=event=>{if(event.pointerId===activePointer)pointer(event,Math.max(12,scene.width/28));};
  canvas.onpointerup=event=>{if(event.pointerId===activePointer){pointer(event,4);activePointer=null;}};
  canvas.onlostpointercapture=canvas.onpointercancel=event=>{
    if(event.pointerId!==activePointer)return;
    activePointer=null;points.length=beforeStroke;renderPath();
  };
  for(const button of dialog.querySelectorAll<HTMLButtonElement>('[data-dx],[data-dy]')){
    button.onclick=()=>{const last=points.at(-1)!;add(last.x+Number(button.dataset.dx||0),last.y+Number(button.dataset.dy||0));};
  }
  undo.onclick=()=>{if(points.length>1){points.pop();renderPath();}};
  get('[data-close]').onclick=()=>dialog.close();
  dialog.onclose=()=>{lookup++;dialog.remove();};
  async function apply(path:MotionPath) {
    if(!current()||submitting)return;
    submitting=true;disableDuringSave(true);
    try{await options.apply(path);if(dialog.open)dialog.close();}
    catch(error){if(current()){submitting=false;disableDuringSave(false);renderPath();message.textContent=(error as Error).message;}}
  }
  use.onclick=()=>void apply(pathFromPoints(name.value,points,Number(speed.value)));
  const choices=get<HTMLSelectElement>('[data-scenes]'), paths=get('[data-paths]');
  let listed=false;
  get<HTMLDetailsElement>('details').ontoggle=async event=>{
    if(!(event.target as HTMLDetailsElement).open||listed)return;
    listed=true;
    try{
      const scenes=await options.listScenes();
      if(!current())return;
      for(const scene of scenes)choices.add(new Option(scene.title,scene.id));
      if(!scenes.length)paths.textContent='Keep a scene with a path to find it here.';
    }catch(error){if(current()){listed=false;paths.textContent=(error as Error).message;}}
  };
  choices.onchange=async()=>{
    const request=++lookup;paths.replaceChildren();
    if(!choices.value)return;
    try{
      const entries=await options.loadPaths(choices.value);
      if(!current()||request!==lookup)return;
      if(!entries.length)paths.textContent='This scene has no saved paths.';
      for(const path of entries){
        const b=document.createElement('button');b.type='button';b.className='creation-button';b.textContent='Use '+path.name;
        b.onclick=()=>void apply(path);paths.append(b);
      }
    }catch(error){if(current()&&request===lookup)paths.textContent=(error as Error).message;}
  };
  parent.append(dialog);dialog.showModal();renderPath();
  return ()=>{if(dialog.open)dialog.close();dialog.remove();};
}
