import type {Drawing} from '../assets/private-drawings';
import {drawingBlob} from '../assets/private-drawings';
import {type DrawingAssembly,type DrawingKind,type DrawingPiece,type Role,validateAssembly,vehicleGeometry,assemblyRig} from './model';
import {suggestParts,layerCanvas} from './segmentation';
import {saveRig,listRigs,selectRig,rigById,type SavedRig} from './store';
import {createVehicle,TRACKS,type VehicleSnapshot} from '../quality/physics';
import {createDrawingPlayground,type PlayScene} from './playground';
import {createFixedClock} from '../quality/clock';
import './style.css';
const roles:Role[]=['body','wheel','wing','limb','propeller','decoration','platform','obstacle','collectible'];
const kindNames:Record<DrawingKind,string>={car:'Car or vehicle',character:'Character or creature',machine:'Invention or machine',scene:'World or level'};
const clamp=(n:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,n));
const q=<T extends HTMLElement>(root:HTMLElement,selector:string)=>root.querySelector(selector)! as T;
const button=(label:string,action:()=>void)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',action);return b;};

/** On-device component editor. No service, model call, upload or hidden asset publishing. */
export async function openDrawingLab(owner:string,source:Drawing,onPlayCar?:()=>void){
 const image=await createImageBitmap(drawingBlob(source));
 const sourceCanvas=document.createElement('canvas');
 const shrink=Math.min(1,768/Math.max(image.width,image.height));
 sourceCanvas.width=Math.max(1,Math.round(image.width*shrink));sourceCanvas.height=Math.max(1,Math.round(image.height*shrink));
 sourceCanvas.getContext('2d')!.drawImage(image,0,0,sourceCanvas.width,sourceCanvas.height);image.close();
 const working=document.createElement('dialog');working.className='drawing-lab';working.setAttribute('aria-label','Bring my drawing to life');
 working.innerHTML=`<div class="dl-shell"><header class="dl-header"><div><span class="dl-kicker">MY DRAWING LAB</span><h2>Make my drawing move!</h2><p>The original stays safe. You decide what each part does.</p></div><button type="button" data-close aria-label="Close drawing designer">✕ Close</button></header>
  <div class="dl-main"><section class="dl-stage"><canvas class="dl-canvas" tabindex="0" aria-label="Drawing editor. Tap a highlighted part, drag to move it, or drag its corner to resize."></canvas>
  <div class="dl-stage-actions"><button type="button" data-mode="edit" aria-pressed="true">✏️ Fix parts</button><button type="button" data-mode="play">▶ Try it!</button><button type="button" data-retry hidden>↶ Try again</button><button type="button" data-go hidden>Hold to move →</button><button type="button" data-jump hidden>Jump ↑</button></div></section>
  <aside class="dl-tools"><label>What did you draw?<select data-kind><option value="car">Car or vehicle</option><option value="character">Character or creature</option><option value="machine">Invention or machine</option><option value="scene">World or level</option></select></label>
  <p data-explanation class="dl-note" aria-live="polite"></p><div data-piece-list class="dl-piece-list" role="group" aria-label="Pieces in this drawing"></div>
  <div class="dl-edit-tools"><button type="button" data-add>＋ Mark another part</button><button type="button" data-undo>↶ Undo</button><button type="button" data-delete>Remove part</button>
  <label>What is this part?<input data-piece-name maxlength="50" placeholder="Name this part"></label>
  <label>What should it do?<select data-role></select></label>
  <label>Outline shape<select data-shape><option value="rect">Square or rectangle</option><option value="ellipse">Round or oval</option></select></label>
  <label>Attached to<select data-parent></select></label>
  <p class="dl-guidance">Tap a part or its name. Drag the outline to move it; drag its corner to resize. To mark a new part, choose “Mark another part,” then drag a box around it.</p></div>
  <div class="dl-version"><button type="button" data-save>💾 Save this test</button><button type="button" data-use disabled>⭐ Use my car in Rally</button><label>Earlier tests<select data-history><option value="">Choose a saved version</option></select></label></div></aside></div>
  <footer class="dl-footer"><span data-status role="status" aria-live="polite">Choose the parts of your drawing. Nothing leaves this device.</span><span>On computer: hold Space to move during a test.</span></footer></div>`;
 document.body.append(working);
 const canvas=q<HTMLCanvasElement>(working,'.dl-canvas'),ctx=canvas.getContext('2d')!;
 const status=q<HTMLElement>(working,'[data-status]'),notice=q<HTMLElement>(working,'[data-explanation]');
 const nameInput=q<HTMLInputElement>(working,'[data-piece-name]'),roleInput=q<HTMLSelectElement>(working,'[data-role]'),
 shapeInput=q<HTMLSelectElement>(working,'[data-shape]'),parentInput=q<HTMLSelectElement>(working,'[data-parent]');
 const historyInput=q<HTMLSelectElement>(working,'[data-history]');
 for(const role of roles){const o=document.createElement('option');o.value=role;o.textContent=role.charAt(0).toUpperCase()+role.slice(1);roleInput.append(o);}
 let kind:DrawingKind='car',assembly:DrawingAssembly,selected='',mode:'edit'|'play'='edit',disposed=false;
 let pendingNew=false,history:SavedRig|null=null,lastStored:SavedRig|null=null;
 let drag:null|{pointer:number;type:'create'|'move'|'resize';id:string;startX:number;startY:number;before:DrawingAssembly} = null;
 const undo:DrawingAssembly[]=[];
 const partsPanel=q<HTMLElement>(working,'[data-piece-list]'),clockHolder:{clock?:ReturnType<typeof createFixedClock>}={};
 let car:ReturnType<typeof createVehicle>|null=null,other:ReturnType<typeof createDrawingPlayground>|null=null;
 let carScene:VehicleSnapshot|null=null,otherScene:PlayScene|null=null;
 let go=false,jump=false,playDistance=0,lastFrame=0;
 const layerCache=new Map<string,HTMLCanvasElement>();
 let imageRect={x:0,y:0,w:1,h:1};
 const contentWidth=()=>canvas.getBoundingClientRect().width||900;
 const message=(value:string)=>{if(!disposed)status.textContent=value;};
 function originalForeground(){
  const img=document.createElement('canvas'),limit=260,ratio=Math.min(1,limit/Math.max(sourceCanvas.width,sourceCanvas.height));
  img.width=Math.max(1,Math.round(sourceCanvas.width*ratio));img.height=Math.max(1,Math.round(sourceCanvas.height*ratio));
  const c=img.getContext('2d')!;c.drawImage(sourceCanvas,0,0,img.width,img.height);
  return c.getImageData(0,0,img.width,img.height);
 }
 function proposals(next:DrawingKind){
  const p=suggestParts(originalForeground(),next);
  assembly={schemaVersion:1,sourceId:source.id,sourceSha256:source.sha256,kind:next,pieces:p.pieces,notes:'',revision:1};
  notice.textContent=p.explanation+' You can change any piece.';
  selected=assembly.pieces[0].id;layerCache.clear();history=null;lastStored=null;
  q<HTMLButtonElement>(working,'[data-use]').disabled=true;
  resetHistory();refresh();
 }
 function resetHistory(){undo.length=0;}
 function remember(before:DrawingAssembly){undo.push(before);if(undo.length>30)undo.shift();lastStored=null;q<HTMLButtonElement>(working,'[data-use]').disabled=true;}
 function getSelected(){return assembly.pieces.find(p=>p.id===selected);}
 function updatePanel(){
  partsPanel.replaceChildren();
  for(const p of assembly.pieces){
   const b=button(p.name+' · '+p.role,()=>{selected=p.id;refresh();});b.className=p.id===selected?'dl-selected':'';
   b.setAttribute('aria-pressed',String(p.id===selected));partsPanel.append(b);
  }
  const piece=getSelected();
  nameInput.value=piece?.name||'';roleInput.value=piece?.role||'body';shapeInput.value=piece?.region.shape||'rect';
  nameInput.disabled=roleInput.disabled=shapeInput.disabled=!piece||mode==='play';
  parentInput.replaceChildren();
  const root=document.createElement('option');root.value='';root.textContent='Nothing (main part)';parentInput.append(root);
  for(const p of assembly.pieces.filter(p=>p.id!==selected)){const o=document.createElement('option');o.value=p.id;o.textContent=p.name;parentInput.append(o);}
  parentInput.value=piece?.parentId||'';parentInput.disabled=!piece||mode==='play';
  q<HTMLButtonElement>(working,'[data-delete]').disabled=!piece||assembly.pieces.length===1||mode==='play';
  q<HTMLButtonElement>(working,'[data-undo]').disabled=!undo.length||mode==='play';
  q<HTMLButtonElement>(working,'[data-add]').disabled=assembly.pieces.length>=24||mode==='play';
 }
 function fit(){
  const w=contentWidth(),h=Math.max(310,Math.min(530,w*.64));
  const dpr=Math.min(2,window.devicePixelRatio||1);
  canvas.style.height=h+'px';canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  return {w,h};
 }
 function layers(){
  if(layerCache.size!==assembly.pieces.length)layerCache.clear();
  for(const p of assembly.pieces){
   if(!layerCache.has(p.id))layerCache.set(p.id,layerCanvas(sourceCanvas,sourceCanvas.width,sourceCanvas.height,p,assembly.pieces));
  }
 }
 function drawEdit(){
  const {w,h}=fit();ctx.clearRect(0,0,w,h);ctx.fillStyle='#eef6ed';ctx.fillRect(0,0,w,h);
  const s=Math.min((w-36)/sourceCanvas.width,(h-36)/sourceCanvas.height);
  imageRect={x:(w-sourceCanvas.width*s)/2,y:(h-sourceCanvas.height*s)/2,w:sourceCanvas.width*s,h:sourceCanvas.height*s};
  ctx.fillStyle='white';ctx.fillRect(imageRect.x-3,imageRect.y-3,imageRect.w+6,imageRect.h+6);
  ctx.drawImage(sourceCanvas,imageRect.x,imageRect.y,imageRect.w,imageRect.h);
  for(const p of assembly.pieces){
   const r=p.region,x=imageRect.x+r.x*imageRect.w,y=imageRect.y+r.y*imageRect.h,pw=r.w*imageRect.w,ph=r.h*imageRect.h;
   ctx.save();ctx.strokeStyle=p.id===selected?'#f5a739':'#238277';ctx.lineWidth=p.id===selected?4:2;
   ctx.setLineDash(p.id===selected?[]:[6,5]);ctx.beginPath();
   if(r.shape==='ellipse')ctx.ellipse(x+pw/2,y+ph/2,Math.max(.1,pw/2),Math.max(.1,ph/2),0,0,2*Math.PI);
   else ctx.roundRect(x,y,pw,ph,4);ctx.stroke();ctx.setLineDash([]);
   const label=p.name.slice(0,21);ctx.font='bold 13px system-ui';ctx.fillStyle=p.id===selected?'#e28c22':'#176f65';
   ctx.fillRect(x,Math.max(2,y-21),Math.min(pw,Math.max(46,ctx.measureText(label).width+12)),20);
   ctx.fillStyle='white';ctx.fillText(label,x+6,Math.max(16,y-6));
   if(p.id===selected){ctx.fillStyle='#f5a739';ctx.fillRect(x+pw-11,y+ph-11,22,22);}
   ctx.restore();
  }
 }
 function drawPartAt(p:DrawingPiece,px:number,py:number,w:number,h:number,angle:number){
  const sprite=layerCache.get(p.id);if(!sprite)return;
  ctx.save();ctx.translate(px,py);ctx.rotate(angle);ctx.drawImage(sprite,-w/2,-h/2,w,h);ctx.restore();
 }
 function drawPlay(){
  const {w,h}=fit();layers();
  ctx.clearRect(0,0,w,h);
  const sky=ctx.createLinearGradient(0,0,0,h);sky.addColorStop(0,'#a9dcf3');sky.addColorStop(1,'#f0fae8');ctx.fillStyle=sky;ctx.fillRect(0,0,w,h);
  const scale=Math.min(w/19,h/12),body=carScene?.bodies[0]||null,cameraX=body?Math.max(0,body.x-6):0,ground=TRACKS.meadow;
  const x=(n:number)=>(n-cameraX)*scale,y=(n:number)=>n*scale;
  if(car){
   ctx.beginPath();ground.points.forEach((p,i)=>i?ctx.lineTo(x(p.x),y(p.y)):ctx.moveTo(x(p.x),y(p.y)));
   ctx.lineTo(w+100,h+50);ctx.lineTo(-50,h+50);ctx.closePath();ctx.fillStyle='#bda477';ctx.fill();
   ctx.strokeStyle='#4a957b';ctx.lineWidth=9;ctx.beginPath();ground.points.forEach((p,i)=>i?ctx.lineTo(x(p.x),y(p.y)):ctx.moveTo(x(p.x),y(p.y)));ctx.stroke();
   const parts=carScene?.bodies||[],bodyPiece=assembly.pieces.find(p=>p.role==='body');
   const wheels=assembly.pieces.filter(p=>p.role==='wheel').sort((a,b)=>a.region.x-b.region.x);
   const base=parts[0];if(base&&bodyPiece)drawPartAt(bodyPiece,x(base.x),y(base.y),base.width*scale,base.height*scale,base.angle);
   for(let i=1;i<parts.length;i++)if(wheels[i-1])drawPartAt(wheels[i-1],x(parts[i].x),y(parts[i].y),parts[i].width*scale,parts[i].height*scale,parts[i].angle);
   ctx.font='bold 17px system-ui';ctx.fillStyle='#204c58';ctx.fillText('Distance: '+Math.floor(carScene?.distance||0)+' m',18,29);
  }else{
   ctx.fillStyle='#a5d394';ctx.fillRect(0,h-48,w,48);
   for(const b of otherScene?.parts||[]){
    const piece=assembly.pieces.find(p=>p.id===b.id);
    if(piece)drawPartAt(piece,x(b.x),y(b.y),b.w*scale,b.h*scale,b.angle);
   }
  }
  if(!carScene&&!otherScene){ctx.fillStyle='#243b48';ctx.fillText('Preparing your moving drawing…',20,30);}
 }
 function refresh(){if(disposed)return;updatePanel();mode==='edit'?drawEdit():drawPlay();}
 function stopPlay(){
  clockHolder.clock?.dispose();clockHolder.clock=undefined;car?.dispose();other?.dispose();
  car=null;other=null;carScene=null;otherScene=null;go=false;jump=false;
  q<HTMLButtonElement>(working,'[data-go]').hidden=true;
  q<HTMLButtonElement>(working,'[data-jump]').hidden=true;
  q<HTMLButtonElement>(working,'[data-retry]').hidden=true;
 }
 function startPlay(){
  stopPlay();
  try{
   if(assembly.kind==='car'){
    const geom=vehicleGeometry(assembly);
    car=createVehicle({},'meadow',geom);carScene=car.snapshot();
   }else{
    assemblyRig(assembly);other=createDrawingPlayground(assembly);otherScene=other.snapshot();
   }
   mode='play';canvas.setAttribute('aria-label','Play with your moving drawing. Hold Space to move; use the buttons on touch.');
   for(const b of working.querySelectorAll<HTMLButtonElement>('[data-mode]'))b.setAttribute('aria-pressed',String(b.dataset.mode==='play'));
   q<HTMLButtonElement>(working,'[data-go]').hidden=false;
   q<HTMLButtonElement>(working,'[data-jump]').hidden=assembly.kind==='car';
   q<HTMLButtonElement>(working,'[data-retry]').hidden=false;
   const update=(dt:number)=>{
    if(car){car.step(dt,{throttle:go?1:0,brake:false});carScene=car.snapshot();if(carScene.status!=='playing'){go=false;clockHolder.clock?.pause('game');message(carScene.reason+' Try again or fix a part.');}}
    else if(other){other.step(dt,{go,jump});otherScene=other.snapshot();}
   };
   clockHolder.clock=createFixedClock({update,render:()=>drawPlay()});clockHolder.clock.start();
   message('It is moving with real physics. Hold Move, then change the parts and compare.');
   canvas.focus({preventScroll:true});
  }catch(e){
   mode='edit';message((e as Error).message);refresh();
  }
 }
 function setMode(next:'edit'|'play'){
  if(next==='play'){startPlay();return;}
  stopPlay();mode='edit';canvas.setAttribute('aria-label','Drawing editor. Tap, move or resize a highlighted part.');
  for(const b of working.querySelectorAll<HTMLButtonElement>('[data-mode]'))b.setAttribute('aria-pressed',String(b.dataset.mode==='edit'));
  message('Move the outlines if we misunderstood your drawing. Your original is unchanged.');refresh();
 }
 function position(e:PointerEvent){
  const rect=canvas.getBoundingClientRect(),x=(e.clientX-rect.left-imageRect.x)/imageRect.w,y=(e.clientY-rect.top-imageRect.y)/imageRect.h;
  return {x:clamp(x,0,1),y:clamp(y,0,1)};
 }
 function includes(p:DrawingPiece,x:number,y:number){
  const r=p.region;return x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h;
 }
 canvas.addEventListener('pointerdown',e=>{
  if(mode!=='edit'||e.button>0||drag)return;
  const point=position(e),before=structuredClone(assembly);
  if(pendingNew){
   const n=assembly.pieces.length+1,id='piece_'+n+'_'+Math.round(performance.now())%10000;
   const piece:DrawingPiece={id,name:'My moving piece',role:'limb',region:{x:point.x,y:point.y,w:.026,h:.026,shape:'rect'},parentId:assembly.pieces[0]?.id||null,physical:true};
   assembly.pieces.push(piece);selected=id;pendingNew=false;
   drag={pointer:e.pointerId,type:'create',id,startX:point.x,startY:point.y,before};canvas.setPointerCapture(e.pointerId);drawEdit();return;
  }
  const hit=assembly.pieces.slice().reverse().find(p=>includes(p,point.x,point.y));
  if(!hit)return;
  selected=hit.id;
  const r=hit.region;
  const resize=Math.abs(point.x-(r.x+r.w))<.035&&Math.abs(point.y-(r.y+r.h))<.035;
  drag={pointer:e.pointerId,type:resize?'resize':'move',id:hit.id,startX:point.x,startY:point.y,before};
  canvas.setPointerCapture(e.pointerId);refresh();e.preventDefault();
 });
 canvas.addEventListener('pointermove',e=>{
  if(!drag||drag.pointer!==e.pointerId)return;
  const point=position(e),p=assembly.pieces.find(p=>p.id===drag!.id),old=drag.before.pieces.find(p=>p.id===drag!.id);
  if(!p||!old)return;
  const dx=point.x-drag.startX,dy=point.y-drag.startY;
  if(drag.type==='create'){
   const x=Math.min(drag.startX,point.x),y=Math.min(drag.startY,point.y);
   p.region={...p.region,x,y,w:clamp(Math.abs(point.x-drag.startX),.025,1-x),h:clamp(Math.abs(point.y-drag.startY),.025,1-y)};
  }else if(drag.type==='resize'){
   p.region={...p.region,w:clamp(old.region.w+dx,.025,1-old.region.x),h:clamp(old.region.h+dy,.025,1-old.region.y)};
  }else{
   p.region={...p.region,x:clamp(old.region.x+dx,0,1-old.region.w),y:clamp(old.region.y+dy,0,1-old.region.h)};
  }
  layerCache.clear();drawEdit();e.preventDefault();
 });
 const finishDrag=(e:PointerEvent)=>{
  if(!drag||drag.pointer!==e.pointerId)return;const prior=drag.before;drag=null;
  if(JSON.stringify(assembly)!==JSON.stringify(prior))remember(prior);
  refresh();message('Piece outline updated. Try it to see whether it moves correctly.');
 };
 canvas.addEventListener('pointerup',finishDrag);
 canvas.addEventListener('pointercancel',e=>{if(!drag||drag.pointer!==e.pointerId)return;assembly=drag.before;drag=null;layerCache.clear();refresh();});
 q<HTMLButtonElement>(working,'[data-close]').addEventListener('click',()=>working.close());
 working.addEventListener('close',()=>{
  disposed=true;stopPlay();imageRect={x:0,y:0,w:1,h:1};working.remove();
 });
 q<HTMLSelectElement>(working,'[data-kind]').addEventListener('change',e=>{
  if(mode==='play')setMode('edit');kind=(e.target as HTMLSelectElement).value as DrawingKind;
  proposals(kind);message('These are suggestions. Mark the pieces that should move.');
 });
 q<HTMLButtonElement>(working,'[data-add]').addEventListener('click',()=>{pendingNew=true;message('Drag a box around the new part on your drawing.');canvas.focus({preventScroll:true});});
 q<HTMLButtonElement>(working,'[data-undo]').addEventListener('click',()=>{const previous=undo.pop();if(!previous)return;assembly=previous;selected=assembly.pieces[0].id;layerCache.clear();refresh();});
 q<HTMLButtonElement>(working,'[data-delete]').addEventListener('click',()=>{
  if(assembly.pieces.length===1)return;
  const before=structuredClone(assembly);assembly.pieces=assembly.pieces.filter(p=>p.id!==selected);
  for(const p of assembly.pieces)if(p.parentId===selected)p.parentId=null;
  selected=assembly.pieces[0].id;remember(before);layerCache.clear();refresh();
 });
 nameInput.addEventListener('change',()=>{
  const p=getSelected();if(!p)return;const before=structuredClone(assembly),n=nameInput.value.trim().slice(0,50);
  if(!n){nameInput.value=p.name;return;}p.name=n;remember(before);refresh();
 });
 roleInput.addEventListener('change',()=>{
  const p=getSelected();if(!p)return;const before=structuredClone(assembly);
  p.role=roleInput.value as Role;p.physical=!['decoration'].includes(p.role);
  if(p.role==='body')p.parentId=null;
  remember(before);layerCache.clear();refresh();
 });
 shapeInput.addEventListener('change',()=>{
  const p=getSelected();if(!p)return;const before=structuredClone(assembly);
  p.region.shape=shapeInput.value as 'rect'|'ellipse';remember(before);layerCache.clear();refresh();
 });
 parentInput.addEventListener('change',()=>{
  const p=getSelected();if(!p)return;const before=structuredClone(assembly);
  p.parentId=parentInput.value||null;
  try{validateAssembly(assembly);remember(before);}catch(e){assembly=before;message((e as Error).message);}
  refresh();
 });
 q<HTMLButtonElement>(working,'[data-mode="edit"]').addEventListener('click',()=>setMode('edit'));
 q<HTMLButtonElement>(working,'[data-mode="play"]').addEventListener('click',()=>setMode('play'));
 q<HTMLButtonElement>(working,'[data-retry]').addEventListener('click',()=>setMode('play'));
 const goButton=q<HTMLButtonElement>(working,'[data-go]'),jumpButton=q<HTMLButtonElement>(working,'[data-jump]');
 for(const [b,key] of [[goButton,'go'],[jumpButton,'jump']] as const){
  const down=(e:PointerEvent)=>{e.preventDefault();if(mode!=='play')return;b.setPointerCapture(e.pointerId);if(key==='go')go=true;else jump=true;};
  const up=(e:PointerEvent)=>{if(key==='go')go=false;else jump=false;};
  b.addEventListener('pointerdown',down);
  for(const name of ['pointerup','pointercancel','lostpointercapture'] as const)b.addEventListener(name,up);
 }
 const abort=new AbortController();
 working.addEventListener('close',()=>abort.abort(),{once:true});
 working.addEventListener('keydown',e=>{
  const target=e.target as HTMLElement;
  if(target.closest('input,select,textarea,button'))return;
  if(mode==='play'&&(e.code==='Space'||e.code==='ArrowRight'||e.code==='KeyD')){e.preventDefault();go=true;}
  if(mode==='play'&&(e.code==='ArrowUp'||e.code==='KeyW')){e.preventDefault();jump=true;}
 },{signal:abort.signal});
 window.addEventListener('keyup',e=>{
  if(['Space','ArrowRight','KeyD'].includes(e.code))go=false;
  if(['ArrowUp','KeyW'].includes(e.code))jump=false;
 },{signal:abort.signal});
 window.addEventListener('blur',()=>{go=jump=false;},{signal:abort.signal});
 const versions=async()=>{
  historyInput.replaceChildren();const o=document.createElement('option');o.value='';o.textContent='Choose a saved version';historyInput.append(o);
  const all=(await listRigs(owner)).filter(x=>x.assembly.sourceId===source.id);
  for(const entry of all){const item=document.createElement('option');item.value=entry.id;item.textContent='Test from '+new Date(entry.savedAt).toLocaleString();historyInput.append(item);}
 };
 historyInput.addEventListener('change',async()=>{
  if(!historyInput.value)return;
  try{const saved=await rigById(owner,historyInput.value);setMode('edit');assembly=saved.assembly;kind=assembly.kind;
   q<HTMLSelectElement>(working,'[data-kind]').value=kind;selected=assembly.pieces[0].id;lastStored=saved;history=saved;
   undo.length=0;layerCache.clear();refresh();q<HTMLButtonElement>(working,'[data-use]').disabled=kind!=='car';
   message('This earlier test is open. You can change it without overwriting any previous version.');
  }catch(e){message((e as Error).message);}
 });
 q<HTMLButtonElement>(working,'[data-save]').addEventListener('click',async()=>{
  try{
   validateAssembly(assembly);assemblyRig(assembly);if(kind==='car')vehicleGeometry(assembly);
   const before=lastStored;
   const copy={...assembly,revision:Math.min(10000,assembly.revision+1)};
   const saved=await saveRig(owner,copy,before?.id||history?.id||null);
   if(disposed)return;lastStored=saved;history=saved;assembly=copy;
   q<HTMLButtonElement>(working,'[data-use]').disabled=kind!=='car';
   message('Saved as a new test. Your drawing and other versions are safe.');await versions();
  }catch(e){message((e as Error).message);}
 });
 q<HTMLButtonElement>(working,'[data-use]').addEventListener('click',async()=>{
  if(!lastStored)return;
  try{await selectRig(owner,lastStored.id);if(disposed)return;message('Your moving car is ready in Rally!');
   working.close();onPlayCar?.();
  }catch(e){message((e as Error).message);}
 });
 proposals(kind);await versions();working.showModal();
 canvas.focus({preventScroll:true});
 return working;
}
