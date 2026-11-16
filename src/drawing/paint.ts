import {saveDrawing} from '../assets/private-drawings';
import './style.css';

type Stroke={color:string;size:number;points:{x:number;y:number}[]};
const colors=['#202b39','#db5679','#ffb541','#268e8c','#6d61ca','#7dbc58','#f2f1e9'];
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
/** Optional draw-here mode. A local sketch becomes the same owner-scoped PNG as a photo. */
export async function drawOnTablet(owner:string,onSaved:()=>Promise<void>){
 const checkOwner=()=>String((window as any).FG?.store?.current()?.id||'')===owner;
 if(!checkOwner())throw Error('Choose the player who owns this drawing.');
 const dialog=document.createElement('dialog');dialog.className='drawing-lab drawing-paint';
 dialog.setAttribute('aria-label','Draw something new');
 dialog.innerHTML=`<div class="dl-shell"><header class="dl-header"><div><span class="dl-kicker">MAKE SOMETHING YOURS</span><h2>Draw your idea!</h2><p>You can turn it into moving parts next.</p></div><button type="button" data-exit aria-label="Close drawing page">✕ Close</button></header><div class="dp-work"><canvas data-paper aria-label="Blank drawing canvas. Use your finger or mouse to draw." tabindex="0"></canvas><div class="dp-tools"><div data-colors role="group" aria-label="Choose a crayon color"></div><label>Crayon size<input data-size type="range" min="3" max="24" value="8"></label><label>My drawing is called<input data-title maxlength="60" value="My new invention"></label><button type="button" data-undo>↶ Undo a stroke</button><button type="button" data-clear>Start over</button><button type="button" data-save>💾 Keep my drawing</button><p role="status" data-message></p></div></div></div>`;
 document.body.append(dialog);const canvas=dialog.querySelector<HTMLCanvasElement>('[data-paper]')!;
 const ctx=canvas.getContext('2d')!,colorsPanel=dialog.querySelector<HTMLElement>('[data-colors]')!;
 const status=dialog.querySelector<HTMLElement>('[data-message]')!;
 let color=colors[0],size=8,strokes:Stroke[]=[],active:Stroke|null=null,disposed=false,saving=false;
 const cw=900,ch=560;canvas.width=cw;canvas.height=ch;
 const draw=()=>{
  ctx.fillStyle='white';ctx.fillRect(0,0,cw,ch);
  for(const stroke of [...strokes,...(active?[active]:[])]){
   if(!stroke.points.length)continue;
   ctx.strokeStyle=stroke.color;ctx.fillStyle=stroke.color;ctx.lineWidth=stroke.size;ctx.lineCap='round';ctx.lineJoin='round';
   ctx.beginPath();const p=stroke.points[0];ctx.moveTo(p.x,p.y);
   for(const q of stroke.points.slice(1))ctx.lineTo(q.x,q.y);
   ctx.stroke();ctx.beginPath();ctx.arc(p.x,p.y,stroke.size/2,0,Math.PI*2);ctx.fill();
  }
 };
 const point=(e:PointerEvent)=>{
  const r=canvas.getBoundingClientRect();
  return {x:clamp((e.clientX-r.left)*cw/Math.max(1,r.width),0,cw),
    y:clamp((e.clientY-r.top)*ch/Math.max(1,r.height),0,ch)};
 };
 canvas.addEventListener('pointerdown',e=>{
  if(!checkOwner()||e.button>0||active)return;
  e.preventDefault();canvas.setPointerCapture(e.pointerId);
  active={color,size,points:[point(e)]};draw();
 });
 canvas.addEventListener('pointermove',e=>{
  if(!active||!canvas.hasPointerCapture(e.pointerId))return;
  if(active.points.length>=4096)return;
  const p=point(e),last=active.points.at(-1)!;
  if(Math.hypot(p.x-last.x,p.y-last.y)>.9)active.points.push(p);
  draw();e.preventDefault();
 });
 const finish=(e:PointerEvent)=>{
  if(!active||!canvas.hasPointerCapture(e.pointerId))return;
  if(strokes.length>=160){status.textContent='That is a full page! Save it to start another.';active=null;draw();return;}
  strokes.push(active);active=null;draw();
 };
 canvas.addEventListener('pointerup',finish);
 canvas.addEventListener('pointercancel',()=>{active=null;draw();});
 for(const shade of colors){
  const b=document.createElement('button');b.type='button';b.style.background=shade;b.style.borderColor='#556b67';
  b.setAttribute('aria-label','Use crayon '+shade);b.title='Crayon '+shade;b.setAttribute('aria-pressed',String(color===shade));
  b.onclick=()=>{color=shade;colorsPanel.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));};
  colorsPanel.append(b);
 }
 dialog.querySelector<HTMLInputElement>('[data-size]')!.oninput=e=>{size=Number((e.target as HTMLInputElement).value)};
 dialog.querySelector<HTMLButtonElement>('[data-undo]')!.onclick=()=>{strokes.pop();draw();};
 dialog.querySelector<HTMLButtonElement>('[data-clear]')!.onclick=()=>{
  if(!strokes.length)return;
  if(!confirm('Start over? Your drawing has not been saved yet.'))return;
  strokes=[];draw();
 };
 dialog.querySelector<HTMLButtonElement>('[data-save]')!.onclick=async()=>{
  if(saving||!checkOwner())return;
  if(!strokes.length){status.textContent='Draw something first!';return;}
  saving=true;try{
   const file=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Could not save your drawing.')),'image/png'));
   if(!checkOwner())return;
   const name=dialog.querySelector<HTMLInputElement>('[data-title]')!.value.trim()||'My drawing';
   await saveDrawing(owner,name,file);
   if(!checkOwner())return;status.textContent='Saved in My Drawings!';await onSaved();dialog.close();
  }catch(e){status.textContent=(e as Error).message;}finally{saving=false;}
 };
 dialog.querySelector<HTMLButtonElement>('[data-exit]')!.onclick=()=>dialog.close();
 const onProfile=()=>{if(!checkOwner())dialog.close();};
 window.addEventListener('factory-profile',onProfile);
 dialog.addEventListener('close',()=>{disposed=true;active=null;window.removeEventListener('factory-profile',onProfile);dialog.remove();},{once:true});
 draw();dialog.showModal();
}
