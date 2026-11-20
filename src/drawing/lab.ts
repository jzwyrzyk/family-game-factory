import type {Drawing} from '../assets/private-drawings';
import {drawingBlob} from '../assets/private-drawings';
import {type DrawingAssembly,type DrawingKind,type DrawingPiece,type Role,validateAssembly,vehicleGeometry,assemblyRig} from './model';
import {suggestParts,layerCanvas} from './segmentation';
import {saveRig,listRigs,rigById,loadDrawingDraft,saveDrawingDraft,deleteDrawingDraft,type SavedRig} from './store';
import {createVehicle,TRACKS,type VehicleSnapshot} from '../quality/physics';
import {createDrawingPlayground,type PlayScene} from './playground';
import {createCarArtwork,drawCarBody,drawCarWheel,type CarArtwork} from './rally';
import {createFixedClock} from '../quality/clock';
import {iconMarkup} from '../brand/icons';
import {assertRewardSourceWritable,rewardSourceWritable} from '../rewards/write-guard';
import './style.css';
const roles:Role[]=['body','wheel','wing','limb','propeller','decoration','platform','obstacle','collectible'];
const kindNames:Record<DrawingKind,string>={car:'Car or vehicle',character:'Character or creature',machine:'Invention or machine',scene:'World or level'};
const clamp=(n:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,n));
const q=<T extends HTMLElement>(root:HTMLElement,selector:string)=>root.querySelector(selector)! as T;
const button=(label:string,action:()=>void)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',action);return b;};

export interface DrawingLabOptions {
 rigId?:string;
 isCurrent?:()=>boolean;
 onSaved?:(rig:SavedRig)=>void|Promise<void>;
}
/** On-device component editor. Source pixels and every saved version remain immutable. */
export async function openDrawingLab(owner:string,source:Drawing,onPlayCar?:(rigId:string)=>void|Promise<void>,options:DrawingLabOptions={}){
 const stillOwner=()=>String((window as any).FG?.store?.current()?.id||'')===owner;
 const currentPage=()=>options.isCurrent?.()!==false;
 if(!stillOwner()||source.owner!==owner)throw Error('That drawing belongs to another player.');
 if(!currentPage())throw Error('Open this drawing again from your Art Studio.');
 assertRewardSourceWritable();
 const returnFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
 const originPage=document.querySelector<HTMLElement>('.page:not(.hidden)')?.id.replace(/^page-/,'');
 let openingCurrent=true,ownerCurrent=true;
 const openingPage=(event:Event)=>{if(originPage&&(event as CustomEvent).detail!==originPage)openingCurrent=false;};
 const openingProfile=()=>{if(!stillOwner())ownerCurrent=false;};
 window.addEventListener('factory-page',openingPage);window.addEventListener('factory-profile',openingProfile);
 let image:ImageBitmap;
 try{image=await createImageBitmap(drawingBlob(source));}
 finally{window.removeEventListener('factory-page',openingPage);window.removeEventListener('factory-profile',openingProfile);}
 if(!openingCurrent||!ownerCurrent||!stillOwner()||!currentPage()){image.close();throw Error('The drawing editor changed. Open your drawing again.');}
 const sourceCanvas=document.createElement('canvas');
 const sourceAspect=image.width/image.height;
 const shrink=Math.min(1,768/Math.max(image.width,image.height));
 sourceCanvas.width=Math.max(1,Math.round(image.width*shrink));sourceCanvas.height=Math.max(1,Math.round(image.height*shrink));
 sourceCanvas.getContext('2d')!.drawImage(image,0,0,sourceCanvas.width,sourceCanvas.height);image.close();
 const working=document.createElement('dialog');working.className='drawing-lab';working.setAttribute('aria-label','Bring my drawing to life');
 working.innerHTML=`<div class="dl-shell"><header class="dl-header"><div><span class="dl-kicker">ART STUDIO · BRING IT TO LIFE</span><h2>Make my drawing move!</h2><p>The original stays safe. You decide what each part does.</p></div><button type="button" data-close aria-label="Close drawing designer">${iconMarkup('close')} Close</button></header>
  <div class="dl-steps" aria-label="Making steps"><span><b>1</b> Choose pieces</span><span><b>2</b> Try movement</span><span><b>3</b> Save & reuse</span><span data-draft-status role="status"></span></div>
  <div class="dl-main"><section class="dl-stage"><canvas class="dl-canvas" tabindex="0" aria-label="Drawing editor. Tap a highlighted part, drag to move it, or drag its corner to resize."></canvas>
  <div class="dl-stage-actions"><button type="button" data-mode="edit" aria-pressed="true">${iconMarkup('edit')} Edit pieces</button><button type="button" data-mode="play">${iconMarkup('play')} Try it!</button><button type="button" data-cutouts>${iconMarkup('grid')} Check cutouts</button><button type="button" data-retry hidden>${iconMarkup('retry')} Try again</button><button type="button" data-go hidden>Hold to move →</button><button type="button" data-jump hidden>Hold to jump ↑</button></div><p class="dl-canvas-help">Drag a piece or its corner. With a keyboard: arrows move, Shift + arrows resize.</p><div data-cutout-preview class="dl-cutout-preview" aria-label="Separated drawing pieces" hidden></div></section>
  <aside class="dl-tools"><label>What did you draw?<select data-kind><option value="car">Car or vehicle</option><option value="character">Character or creature</option><option value="machine">Invention or machine</option><option value="scene">World or level</option></select></label>
  <p data-explanation class="dl-note" aria-live="polite"></p><div data-piece-list class="dl-piece-list" role="group" aria-label="Pieces in this drawing"></div>
  <div class="dl-edit-tools"><div class="dl-edit-row"><button type="button" data-add>${iconMarkup('add')} Add a piece</button><button type="button" data-delete>${iconMarkup('trash')} Remove</button></div>
  <label>What is this part?<input data-piece-name maxlength="50" placeholder="Name this part"></label>
  <label>What should it do?<select data-role></select></label>
  <div class="dl-edit-row"><button type="button" data-undo>${iconMarkup('undo')} Undo</button><button type="button" data-redo>${iconMarkup('retry')} Redo</button></div>
  <details class="dl-advanced"><summary>Refine cutouts & hinges</summary><div class="dl-advanced-body"><button type="button" data-pivot aria-pressed="false">${iconMarkup('settings')} Place hinge</button><button type="button" data-mask-exclude aria-pressed="false">${iconMarkup('edit')} Erase extra pixels</button><button type="button" data-mask-include aria-pressed="false">${iconMarkup('undo')} Restore pixels</button><label>Brush size<input data-brush-size type="range" min="6" max="34" value="18"></label>
  <label>Outline shape<select data-shape><option value="rect">Square or rectangle</option><option value="ellipse">Round or oval</option></select></label>
  <label>Attached to<select data-parent></select></label>
  <div class="dl-region-fields"><label>Left (%)<input data-region="x" type="number" min="0" max="97.5" step="1"></label><label>Top (%)<input data-region="y" type="number" min="0" max="97.5" step="1"></label><label>Width (%)<input data-region="w" type="number" min="2.5" max="100" step="1"></label><label>Height (%)<input data-region="h" type="number" min="2.5" max="100" step="1"></label></div>
  <div class="dl-region-fields"><label>Hinge across (%)<input data-pivot-axis="x" type="number" min="0" max="100" step="1"></label><label>Hinge down (%)<input data-pivot-axis="y" type="number" min="0" max="100" step="1"></label></div>
  <p class="dl-guidance">For an arm or wing, put the hinge where it connects. Erase and Restore only change the cutout. Your original pixels stay safe.</p></div></details></div>
  <div class="dl-version"><button type="button" data-save>${iconMarkup('save')} Save this version</button><button type="button" data-use disabled>${iconMarkup('play')} Drive this car</button><label>Saved versions<select data-history><option value="">Choose a saved version</option></select></label></div></aside></div>
  <footer class="dl-footer"><span data-status role="status" aria-live="polite">Choose the parts of your drawing. Nothing leaves this device.</span><span>On computer: hold Space to move during a test.</span></footer></div>`;
 document.body.append(working);
 const canvas=q<HTMLCanvasElement>(working,'.dl-canvas'),ctx=canvas.getContext('2d')!;
 const status=q<HTMLElement>(working,'[data-status]'),notice=q<HTMLElement>(working,'[data-explanation]');
 const nameInput=q<HTMLInputElement>(working,'[data-piece-name]'),roleInput=q<HTMLSelectElement>(working,'[data-role]'),
 shapeInput=q<HTMLSelectElement>(working,'[data-shape]'),parentInput=q<HTMLSelectElement>(working,'[data-parent]');
 const historyInput=q<HTMLSelectElement>(working,'[data-history]');
 for(const role of roles){const o=document.createElement('option');o.value=role;o.textContent=role.charAt(0).toUpperCase()+role.slice(1);roleInput.append(o);}
 const initialKind:DrawingKind=source.category==='character'?'character':source.category==='world'?'scene':source.category==='prop'?'machine':'car';
 let kind:DrawingKind=initialKind,assembly!:DrawingAssembly,selected='',mode:'edit'|'play'='edit',disposed=false,leaving=false;
 const onProfile=()=>{if(!stillOwner()){ownerCurrent=false;working.close();}};
 const onPage=(event:Event)=>{
  if(currentPage()&&(!originPage||(event as CustomEvent).detail===originPage))return;
  leaving=true;stopPlay();
  // Finish only edits already made by this owner. A route change cannot create
  // a new version or let a delayed load reopen this editor over another page.
  void flushDraft().then(()=>{if(!disposed)working.close();}).catch(error=>{
   message((error as Error).message+' Your edits remain here. Close retries the draft save.');
  });
 };
 window.addEventListener('factory-profile',onProfile);
 window.addEventListener('factory-page',onPage);
 let pendingNew=false,pendingPivot=false,brushMode:'include'|'exclude'|null=null,history:SavedRig|null=null,lastStored:SavedRig|null=null;
 let drag:null|{pointer:number;type:'create'|'move'|'resize'|'mask';id:string;startX:number;startY:number;before:DrawingAssembly} = null;
 const undo:DrawingAssembly[]=[],redo:DrawingAssembly[]=[];
 let saving=false,dirty=false,draftSequence=0,savedDraftSequence=0,draftError:Error|null=null,draftQueue=Promise.resolve();
 const partsPanel=q<HTMLElement>(working,'[data-piece-list]'),clockHolder:{clock?:ReturnType<typeof createFixedClock>}={};
 const cutoutPreview=q<HTMLElement>(working,'[data-cutout-preview]');
 let showCutouts=false;
 let car:ReturnType<typeof createVehicle>|null=null,other:ReturnType<typeof createDrawingPlayground>|null=null;
 let carArtwork:CarArtwork|null=null;
 let carScene:VehicleSnapshot|null=null,otherScene:PlayScene|null=null;
 let go=false,jump=false;
 const layerCache=new Map<string,HTMLCanvasElement>();
 let imageRect={x:0,y:0,w:1,h:1};
 const contentWidth=()=>canvas.getBoundingClientRect().width||900;
 const message=(value:string)=>{if(!disposed)status.textContent=value;};
 const alive=()=>!disposed&&ownerCurrent&&!leaving&&stillOwner()&&currentPage();
 const draftAlive=()=>!disposed&&ownerCurrent&&stillOwner()&&(currentPage()||leaving);
 const canEdit=()=>{if(!alive())return false;if(saving){message('Finishing your save…');return false;}if(!rewardSourceWritable()){message('Saving is paused. Return to the active Jems tab to continue.');return false;}return true;};
 const draftStatus=q<HTMLElement>(working,'[data-draft-status]');
 function queueDraft(){
  dirty=true;const sequence=++draftSequence,copy=validateAssembly(assembly),parent=history?.id??null;
  draftStatus.textContent='Saving draft…';
  draftQueue=draftQueue.then(async()=>{
   if(!draftAlive()||sequence!==draftSequence)return;
   await saveDrawingDraft(owner,copy,parent,draftAlive);
   if(!draftAlive())return;
   savedDraftSequence=sequence;
   if(sequence===draftSequence){draftError=null;draftStatus.textContent='Draft saved on this device';}
  }).catch(error=>{if(!draftAlive())return;draftError=error instanceof Error?error:Error('Could not save your draft.');draftStatus.textContent='Draft not saved';message(draftError.message+' Keep this editor open and try again.');});
 }
 async function flushDraft(){
  if(dirty&&savedDraftSequence<draftSequence&&draftError)queueDraft();
  await draftQueue;
  if(dirty&&savedDraftSequence<draftSequence)throw draftError??Error('Your draft could not finish saving. Keep this editor open.');
 }
 async function requestClose(){
  if(saving){message('Finishing your save…');return;}
  try{await flushDraft();if(!disposed&&stillOwner())working.close();}catch(error){message((error as Error).message);}
 }
 function originalForeground(){
  const img=document.createElement('canvas'),limit=260,ratio=Math.min(1,limit/Math.max(sourceCanvas.width,sourceCanvas.height));
  img.width=Math.max(1,Math.round(sourceCanvas.width*ratio));img.height=Math.max(1,Math.round(sourceCanvas.height*ratio));
  const c=img.getContext('2d')!;c.drawImage(sourceCanvas,0,0,img.width,img.height);
  return c.getImageData(0,0,img.width,img.height);
 }
 function proposals(next:DrawingKind){
  const before=assembly?structuredClone(assembly):null;
  const p=suggestParts(originalForeground(),next);
  assembly={schemaVersion:1,sourceId:source.id,sourceSha256:source.sha256,kind:next,pieces:p.pieces,notes:before?.notes??'',revision:before?.revision??1};
  kind=next;
  notice.textContent=p.explanation+' You can change any piece.';
  selected=assembly.pieces[0].id;pendingNew=false;pendingPivot=false;brushMode=null;layerCache.clear();lastStored=null;
  q<HTMLButtonElement>(working,'[data-use]').disabled=true;
  if(before)remember(before);else resetHistory();refresh();
 }
 function resetHistory(){undo.length=0;redo.length=0;}
 function remember(before:DrawingAssembly){undo.push(before);if(undo.length>30)undo.shift();redo.length=0;lastStored=null;queueDraft();q<HTMLButtonElement>(working,'[data-use]').disabled=true;}
 function restoreUndo(direction:'undo'|'redo'){
  if(!canEdit()||mode!=='edit')return;
  const from=direction==='undo'?undo:redo,to=direction==='undo'?redo:undo,previous=from.pop();
  if(!previous)return;
  to.push(structuredClone(assembly));assembly=previous;kind=assembly.kind;
  q<HTMLSelectElement>(working,'[data-kind]').value=kind;
  if(!assembly.pieces.some(piece=>piece.id===selected))selected=assembly.pieces[0].id;
  pendingNew=false;pendingPivot=false;brushMode=null;lastStored=null;layerCache.clear();queueDraft();refresh();
 }
 function getSelected(){return assembly.pieces.find(p=>p.id===selected);}
 function updatePanel(){
  const locked=saving||!rewardSourceWritable();
  partsPanel.replaceChildren();
  for(const p of assembly.pieces){
   const b=button(p.name+' · '+p.role,()=>{selected=p.id;refresh();});b.className=p.id===selected?'dl-selected':'';
   b.setAttribute('aria-pressed',String(p.id===selected));b.disabled=locked;partsPanel.append(b);
  }
  const piece=getSelected();
  nameInput.value=piece?.name||'';roleInput.value=piece?.role||'body';shapeInput.value=piece?.region.shape||'rect';
  nameInput.disabled=roleInput.disabled=shapeInput.disabled=!piece||mode==='play'||locked;
  parentInput.replaceChildren();
  const root=document.createElement('option');root.value='';root.textContent='Nothing (main part)';parentInput.append(root);
  for(const p of assembly.pieces.filter(p=>p.id!==selected)){const o=document.createElement('option');o.value=p.id;o.textContent=p.name;parentInput.append(o);}
  parentInput.value=piece?.parentId||'';parentInput.disabled=!piece||mode==='play'||locked;
  q<HTMLButtonElement>(working,'[data-delete]').disabled=!piece||assembly.pieces.length===1||mode==='play'||locked;
  q<HTMLButtonElement>(working,'[data-undo]').disabled=!undo.length||mode==='play'||locked;
  q<HTMLButtonElement>(working,'[data-redo]').disabled=!redo.length||mode==='play'||locked;
  q<HTMLButtonElement>(working,'[data-add]').disabled=assembly.pieces.length>=24||mode==='play'||locked;
  q<HTMLButtonElement>(working,'[data-save]').disabled=locked||!!drag||(!dirty&&!!lastStored);
  q<HTMLButtonElement>(working,'[data-use]').disabled=locked||!lastStored||kind!=='car'||!onPlayCar;
  q<HTMLButtonElement>(working,'[data-use]').hidden=!onPlayCar;
  q<HTMLSelectElement>(working,'[data-kind]').disabled=locked;
  historyInput.disabled=locked;
  for(const input of working.querySelectorAll<HTMLInputElement>('[data-region]')){
   const key=input.dataset.region as 'x'|'y'|'w'|'h';input.value=piece?String(Math.round(piece.region[key]*1000)/10):'';
   input.disabled=locked||!piece||mode==='play';
  }
  const hingeButton=q<HTMLButtonElement>(working,'[data-pivot]');
  hingeButton.disabled=locked||!piece||mode==='play'||piece.role==='body'||piece.role==='decoration'||piece.role==='wheel'||piece.parentId===null;
  hingeButton.setAttribute('aria-pressed',String(pendingPivot));
  for(const input of working.querySelectorAll<HTMLInputElement>('[data-pivot-axis]')){
   input.disabled=hingeButton.disabled;input.value=String(Math.round((piece?.pivot?.[input.dataset.pivotAxis as 'x'|'y']??.5)*100));
  }
  for(const action of ['include','exclude'] as const){
   const brush=q<HTMLButtonElement>(working,'[data-mask-'+action+']');
   brush.disabled=locked||!piece||mode==='play';
   brush.setAttribute('aria-pressed',String(brushMode===action));
  }
 }
 function fit(){
  const w=contentWidth(),h=Math.max(310,Math.min(530,w*.64));
  const dpr=Math.min(2,window.devicePixelRatio||1);
  const pixelWidth=Math.round(w*dpr),pixelHeight=Math.round(h*dpr);
  if(canvas.width!==pixelWidth||canvas.height!==pixelHeight){canvas.style.height=h+'px';canvas.width=pixelWidth;canvas.height=pixelHeight;ctx.setTransform(dpr,0,0,dpr,0,0);}
  return {w,h};
 }
 function layers(){
  if(layerCache.size!==assembly.pieces.length)layerCache.clear();
  for(const p of assembly.pieces){
   if(!layerCache.has(p.id))layerCache.set(p.id,layerCanvas(sourceCanvas,sourceCanvas.width,sourceCanvas.height,p,assembly.pieces));
  }
 }
 function renderCutoutPreview(){
  if(!showCutouts||mode!=='edit'){cutoutPreview.hidden=true;return;}
  layers();cutoutPreview.hidden=false;cutoutPreview.replaceChildren();
  for(const p of assembly.pieces){
   const layer=layerCache.get(p.id)!;
   const figure=document.createElement('figure'),thumbnail=document.createElement('canvas');
   const scale=Math.min(1,140/Math.max(layer.width,layer.height));
   thumbnail.width=Math.max(1,Math.round(layer.width*scale));thumbnail.height=Math.max(1,Math.round(layer.height*scale));
   thumbnail.getContext('2d')!.drawImage(layer,0,0,thumbnail.width,thumbnail.height);
   const caption=document.createElement('figcaption');caption.textContent=p.name;
   figure.append(thumbnail,caption);cutoutPreview.append(figure);
  }
 }
 function drawEdit(){
  const {w,h}=fit();ctx.clearRect(0,0,w,h);ctx.fillStyle='#eef6ed';ctx.fillRect(0,0,w,h);
  const s=Math.min((w-36)/sourceCanvas.width,(h-36)/sourceCanvas.height);
  imageRect={x:(w-sourceCanvas.width*s)/2,y:(h-sourceCanvas.height*s)/2,w:sourceCanvas.width*s,h:sourceCanvas.height*s};
  ctx.fillStyle='white';ctx.fillRect(imageRect.x-3,imageRect.y-3,imageRect.w+6,imageRect.h+6);
  if(brushMode&&getSelected()){
   // In mask mode show the actual extracted layer over a pale source guide,
   // so children see the transparency they are painting rather than a fake mask.
   const step=14;
   for(let cy=imageRect.y;cy<imageRect.y+imageRect.h;cy+=step)
    for(let cx=imageRect.x;cx<imageRect.x+imageRect.w;cx+=step){
     ctx.fillStyle=((Math.floor((cx-imageRect.x)/step)+Math.floor((cy-imageRect.y)/step))%2)?'#e0e6de':'#ffffff';
     ctx.fillRect(cx,cy,Math.min(step,imageRect.x+imageRect.w-cx),Math.min(step,imageRect.y+imageRect.h-cy));
    }
   ctx.save();ctx.globalAlpha=.18;
   ctx.drawImage(sourceCanvas,imageRect.x,imageRect.y,imageRect.w,imageRect.h);ctx.restore();
   const piece=getSelected()!,r=piece.region;
   const layer=layerCanvas(sourceCanvas,sourceCanvas.width,sourceCanvas.height,piece,assembly.pieces);
   ctx.drawImage(layer,imageRect.x+r.x*imageRect.w,imageRect.y+r.y*imageRect.h,r.w*imageRect.w,r.h*imageRect.h);
  }else ctx.drawImage(sourceCanvas,imageRect.x,imageRect.y,imageRect.w,imageRect.h);
  for(const p of assembly.pieces){
   const r=p.region,x=imageRect.x+r.x*imageRect.w,y=imageRect.y+r.y*imageRect.h,pw=r.w*imageRect.w,ph=r.h*imageRect.h;
   ctx.save();ctx.strokeStyle=p.id===selected?'#f5a739':'#238277';ctx.lineWidth=p.id===selected?4:2;
   ctx.setLineDash(p.id===selected?[]:[6,5]);ctx.beginPath();
   if(r.shape==='ellipse')ctx.ellipse(x+pw/2,y+ph/2,Math.max(.1,pw/2),Math.max(.1,ph/2),0,0,2*Math.PI);
   else ctx.roundRect(x,y,pw,ph,4);ctx.stroke();ctx.setLineDash([]);
   const label=p.name.slice(0,21);ctx.font='bold 13px system-ui';ctx.fillStyle=p.id===selected?'#e28c22':'#176f65';
   ctx.fillRect(x,Math.max(2,y-21),Math.min(pw,Math.max(46,ctx.measureText(label).width+12)),20);
   ctx.fillStyle='white';ctx.fillText(label,x+6,Math.max(16,y-6));
   if(p.id===selected){
     ctx.fillStyle='#f5a739';ctx.fillRect(x+pw-11,y+ph-11,22,22);
     if(p.parentId!==null&&p.role!=='decoration'){
       const px=x+pw*(p.pivot?.x??.5),py=y+ph*(p.pivot?.y??.5);
       ctx.beginPath();ctx.arc(px,py,9,0,Math.PI*2);ctx.fillStyle='#ffd259';ctx.fill();
       ctx.strokeStyle='#263a4a';ctx.lineWidth=2.5;ctx.stroke();
       ctx.beginPath();ctx.moveTo(px-13,py);ctx.lineTo(px+13,py);ctx.moveTo(px,py-13);ctx.lineTo(px,py+13);ctx.stroke();
     }
   }
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
   const parts=carScene?.bodies||[],wheels=carArtwork?.pieces.wheels??[];
   const base=parts[0];if(base&&carArtwork){
    ctx.save();ctx.translate(x(base.x),y(base.y));ctx.rotate(base.angle);
    drawCarBody(ctx,carArtwork,base.width*scale,base.height*scale);ctx.restore();
   }
   for(let i=1;i<parts.length;i++)if(wheels[i-1]&&carArtwork){
    ctx.save();ctx.translate(x(parts[i].x),y(parts[i].y));ctx.rotate(parts[i].angle);
    drawCarWheel(ctx,carArtwork,(i-1) as 0|1,parts[i].width*scale);ctx.restore();
   }
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
 function refresh(){if(disposed)return;updatePanel();mode==='edit'?drawEdit():drawPlay();renderCutoutPreview();}
 function stopPlay(){
  clockHolder.clock?.dispose();clockHolder.clock=undefined;car?.dispose();other?.dispose();
  car=null;other=null;carArtwork=null;carScene=null;otherScene=null;go=false;jump=false;
  q<HTMLButtonElement>(working,'[data-go]').hidden=true;
  q<HTMLButtonElement>(working,'[data-jump]').hidden=true;
  q<HTMLButtonElement>(working,'[data-retry]').hidden=true;cutoutPreview.hidden=true;
 }
 function startPlay(){
  stopPlay();
  try{
   if(assembly.kind==='car'){
    carArtwork=createCarArtwork(assembly,sourceCanvas,sourceAspect);
    car=createVehicle({},'meadow',carArtwork.geometry);carScene=car.snapshot();
   }else{
    assemblyRig(assembly,sourceAspect);other=createDrawingPlayground(assembly,sourceAspect);otherScene=other.snapshot();
   }
   mode='play';pendingPivot=false;pendingNew=false;brushMode=null;
    canvas.setAttribute('aria-label','Play with your moving drawing. Hold Space to move; use the buttons on touch.');
    updatePanel();
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
  stopPlay();mode='edit';pendingPivot=false;pendingNew=false;brushMode=null;
  canvas.setAttribute('aria-label','Drawing editor. Tap, move or resize a highlighted part.');
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
  if(mode!=='edit'||e.button>0||drag||!canEdit())return;
  const point=position(e),before=structuredClone(assembly);
  if(brushMode){
   const p=getSelected();
   if(!p||!includes(p,point.x,point.y)){message('Brush inside the selected piece to change its cutout.');return;}
   if((p.maskStrokes?.length||0)>=48){message('This piece has enough brush corrections. Save it and start another test.');return;}
   const radius=clamp(Number(q<HTMLInputElement>(working,'[data-brush-size]').value)/Math.max(1,imageRect.w),.002,.08);
   (p.maskStrokes??=[]).push({action:brushMode,radius,points:[point]});
   drag={pointer:e.pointerId,type:'mask',id:p.id,startX:point.x,startY:point.y,before};
   canvas.setPointerCapture(e.pointerId);layerCache.clear();drawEdit();e.preventDefault();return;
  }
  if(pendingPivot){
   const p=getSelected();
   if(!p||!includes(p,point.x,point.y)){message('Tap inside the selected moving part to place its hinge.');return;}
   const region=p.region;
   p.pivot={x:clamp((point.x-region.x)/region.w,0,1),y:clamp((point.y-region.y)/region.h,0,1)};
   pendingPivot=false;remember(before);refresh();
   message('Hinge placed! Test it to see how this part swings.');e.preventDefault();return;
  }
  if(pendingNew){
   const n=assembly.pieces.length+1,id='piece_'+n+'_'+Math.round(performance.now())%10000;
   const piece:DrawingPiece={id,name:'My moving piece',role:'limb',region:{x:Math.min(point.x,.974),y:Math.min(point.y,.974),w:.026,h:.026,shape:'rect'},parentId:assembly.pieces[0]?.id||null,physical:true};
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
  if(!drag||drag.pointer!==e.pointerId||!alive()||!rewardSourceWritable())return;
  const point=position(e),p=assembly.pieces.find(p=>p.id===drag!.id),old=drag.before.pieces.find(p=>p.id===drag!.id);
  if(!p||(drag.type!=='create'&&!old))return;
  const dx=point.x-drag.startX,dy=point.y-drag.startY;
  if(drag.type==='mask'){
   const stroke=p.maskStrokes?.at(-1),last=stroke?.points.at(-1);
   if(stroke&&last&&stroke.points.length<128&&Math.hypot(point.x-last.x,point.y-last.y)>.002){
     stroke.points.push(point);layerCache.clear();drawEdit();
   }
   e.preventDefault();return;
  }
  if(drag.type==='create'){
   const x=Math.min(.975,drag.startX,point.x),y=Math.min(.975,drag.startY,point.y);
   p.region={...p.region,x,y,w:clamp(Math.abs(point.x-drag.startX),.025,1-x),h:clamp(Math.abs(point.y-drag.startY),.025,1-y)};
  }else if(drag.type==='resize'){
   p.region={...p.region,w:clamp(old!.region.w+dx,.025,1-old!.region.x),h:clamp(old!.region.h+dy,.025,1-old!.region.y)};
  }else{
   p.region={...p.region,x:clamp(old!.region.x+dx,0,1-old!.region.w),y:clamp(old!.region.y+dy,0,1-old!.region.h)};
  }
  layerCache.clear();drawEdit();e.preventDefault();
 });
 const finishDrag=(e:PointerEvent)=>{
  if(!drag||drag.pointer!==e.pointerId)return;const prior=drag.before;drag=null;
  if(!alive()||!rewardSourceWritable()){assembly=prior;layerCache.clear();refresh();return;}
  if(JSON.stringify(assembly)!==JSON.stringify(prior))remember(prior);
  refresh();message('Piece outline updated. Try it to see whether it moves correctly.');
 };
 canvas.addEventListener('pointerup',finishDrag);
 canvas.addEventListener('pointercancel',e=>{if(!drag||drag.pointer!==e.pointerId)return;assembly=drag.before;drag=null;layerCache.clear();refresh();});
 canvas.addEventListener('lostpointercapture',e=>{if(drag?.pointer===e.pointerId){assembly=drag.before;drag=null;layerCache.clear();refresh();}});
 q<HTMLButtonElement>(working,'[data-close]').addEventListener('click',()=>{void requestClose();});
 working.addEventListener('cancel',event=>{event.preventDefault();void requestClose();});
 working.addEventListener('click',event=>{const target=event.target as HTMLElement;if(target.closest('button')&&!target.closest('[data-close]')&&!canEdit()){event.preventDefault();event.stopImmediatePropagation();}},true);
 working.addEventListener('change',event=>{if(!canEdit()){event.preventDefault();event.stopImmediatePropagation();refresh();}},true);
 working.addEventListener('close',()=>{
  disposed=true;stopPlay();window.removeEventListener('factory-profile',onProfile);window.removeEventListener('factory-page',onPage);imageRect={x:0,y:0,w:1,h:1};working.remove();
  if(stillOwner()&&currentPage()&&!leaving&&returnFocus?.isConnected)returnFocus.focus({preventScroll:true});
 });
 q<HTMLSelectElement>(working,'[data-kind]').addEventListener('change',e=>{
  if(mode==='play')setMode('edit');kind=(e.target as HTMLSelectElement).value as DrawingKind;
  proposals(kind);message('These are suggestions. Mark the pieces that should move.');
 });
 q<HTMLButtonElement>(working,'[data-add]').addEventListener('click',()=>{pendingNew=true;pendingPivot=false;brushMode=null;refresh();message('Drag a box around the new piece, or press Enter to add one in the middle.');canvas.focus({preventScroll:true});});
 q<HTMLButtonElement>(working,'[data-pivot]').addEventListener('click',()=>{
   const p=getSelected();if(mode!=='edit'||!p||!p.parentId||p.role==='body'||p.role==='decoration'||p.role==='wheel')return;
   pendingPivot=!pendingPivot;pendingNew=false;brushMode=null;refresh();
   message(pendingPivot?'Tap where this part should attach or bend.':'Hinge placement cancelled.');
   canvas.focus({preventScroll:true});
 });
 for(const action of ['include','exclude'] as const){
  q<HTMLButtonElement>(working,'[data-mask-'+action+']').addEventListener('click',()=>{
   if(mode!=='edit'||!getSelected())return;
   brushMode=brushMode===action?null:action;pendingNew=false;pendingPivot=false;refresh();
   message(brushMode==='exclude'?'Brush over unwanted pixels. Your original picture stays safe.':
    brushMode==='include'?'Brush where pixels should come back. Save when it looks right.':'Back to moving pieces.');
   canvas.focus({preventScroll:true});
  });
 }
 q<HTMLButtonElement>(working,'[data-undo]').addEventListener('click',()=>restoreUndo('undo'));
 q<HTMLButtonElement>(working,'[data-redo]').addEventListener('click',()=>restoreUndo('redo'));
 for(const input of working.querySelectorAll<HTMLInputElement>('[data-region]'))input.addEventListener('change',()=>{
  const piece=getSelected(),value=Number(input.value)/100;if(!piece||!Number.isFinite(value)){refresh();return;}
  const before=structuredClone(assembly),key=input.dataset.region as 'x'|'y'|'w'|'h';
  const max=key==='x'?1-piece.region.w:key==='y'?1-piece.region.h:key==='w'?1-piece.region.x:1-piece.region.y;
  piece.region[key]=clamp(value,(key==='w'||key==='h')?.025:0,max);remember(before);layerCache.clear();refresh();
 });
 for(const input of working.querySelectorAll<HTMLInputElement>('[data-pivot-axis]'))input.addEventListener('change',()=>{
  const piece=getSelected(),value=Number(input.value)/100;if(!piece||!Number.isFinite(value)||input.disabled){refresh();return;}
  const before=structuredClone(assembly);piece.pivot={x:piece.pivot?.x??.5,y:piece.pivot?.y??.5,[input.dataset.pivotAxis!]:clamp(value,0,1)};
  remember(before);layerCache.clear();refresh();
 });
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
  if(p.role==='wing'&&!p.pivot)p.pivot={x:.12,y:.5};
  if(p.role==='limb'&&!p.pivot)p.pivot={x:.5,y:.12};
  pendingPivot=false;brushMode=null;
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
 q<HTMLButtonElement>(working,'[data-cutouts]').addEventListener('click',()=>{
  if(mode!=='edit')setMode('edit');
  showCutouts=!showCutouts;q<HTMLButtonElement>(working,'[data-cutouts]').setAttribute('aria-pressed',String(showCutouts));
  renderCutoutPreview();
 });
 q<HTMLButtonElement>(working,'[data-mode="edit"]').addEventListener('click',()=>setMode('edit'));
 q<HTMLButtonElement>(working,'[data-mode="play"]').addEventListener('click',()=>setMode('play'));
 q<HTMLButtonElement>(working,'[data-retry]').addEventListener('click',()=>setMode('play'));
 const goButton=q<HTMLButtonElement>(working,'[data-go]'),jumpButton=q<HTMLButtonElement>(working,'[data-jump]');
 for(const [b,key] of [[goButton,'go'],[jumpButton,'jump']] as const){
   const down=(e:PointerEvent)=>{e.preventDefault();if(mode!=='play'||!canEdit())return;b.setPointerCapture(e.pointerId);if(key==='go')go=true;else jump=true;};
  const up=(e:PointerEvent)=>{if(key==='go')go=false;else jump=false;};
  b.addEventListener('pointerdown',down);
  for(const name of ['pointerup','pointercancel','lostpointercapture'] as const)b.addEventListener(name,up);
  b.addEventListener('keydown',event=>{if((event.code==='Space'||event.code==='Enter')&&mode==='play'&&canEdit()){event.preventDefault();if(key==='go')go=true;else jump=true;}});
  b.addEventListener('keyup',event=>{if(event.code==='Space'||event.code==='Enter'){event.preventDefault();if(key==='go')go=false;else jump=false;}});
  b.addEventListener('blur',()=>{if(key==='go')go=false;else jump=false;});
 }
 const abort=new AbortController();
 working.addEventListener('close',()=>abort.abort(),{once:true});
 working.addEventListener('keydown',e=>{
  const target=e.target as HTMLElement;
  if(mode==='edit'&&(e.ctrlKey||e.metaKey)&&e.code==='KeyZ'&&!target.closest('input,textarea')){e.preventDefault();restoreUndo(e.shiftKey?'redo':'undo');return;}
  if(target.closest('input,select,textarea,button'))return;
  if(!canEdit())return;
  if(mode==='edit'&&e.code==='Enter'&&pendingNew){
   e.preventDefault();const before=structuredClone(assembly),id='piece_'+crypto.randomUUID().slice(0,8);
   assembly.pieces.push({id,name:'My new piece',role:'limb',region:{x:.4,y:.4,w:.2,h:.2,shape:'rect'},parentId:assembly.pieces[0].id,physical:true});
   selected=id;pendingNew=false;remember(before);refresh();message('Piece added. Use the arrows to move it; Shift + arrows change its size.');return;
  }
  if(mode==='edit'&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.code)){
   const piece=getSelected();if(!piece)return;e.preventDefault();const before=structuredClone(assembly);
   const horizontal=e.code==='ArrowLeft'||e.code==='ArrowRight',amount=(e.code==='ArrowLeft'||e.code==='ArrowUp'?-.01:.01),r=piece.region;
   if(e.shiftKey){if(horizontal)r.w=clamp(r.w+amount,.025,1-r.x);else r.h=clamp(r.h+amount,.025,1-r.y);}
   else {if(horizontal)r.x=clamp(r.x+amount,0,1-r.w);else r.y=clamp(r.y+amount,0,1-r.h);}
   remember(before);layerCache.clear();refresh();return;
  }
  if(mode==='play'&&(e.code==='Space'||e.code==='ArrowRight'||e.code==='KeyD')){e.preventDefault();go=true;}
  if(mode==='play'&&(e.code==='ArrowUp'||e.code==='KeyW')){e.preventDefault();jump=true;}
 },{signal:abort.signal});
 window.addEventListener('keyup',e=>{
  if(['Space','ArrowRight','KeyD'].includes(e.code))go=false;
  if(['ArrowUp','KeyW'].includes(e.code))jump=false;
 },{signal:abort.signal});
 window.addEventListener('blur',()=>{go=jump=false;},{signal:abort.signal});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)go=jump=false;},{signal:abort.signal});
 const observer=new ResizeObserver(()=>{if(!disposed&&assembly){mode==='edit'?drawEdit():drawPlay();}});
 observer.observe(canvas);working.addEventListener('close',()=>observer.disconnect(),{once:true});
 let historyLoad=0;
 const versions=async()=>{
  const all=(await listRigs(owner)).filter(x=>x.assembly.sourceId===source.id);
  if(!alive())return all;
  historyInput.replaceChildren();const o=document.createElement('option');o.value='';o.textContent='Choose a saved version';historyInput.append(o);
  for(const entry of all){const item=document.createElement('option');item.value=entry.id;item.textContent='Version '+entry.assembly.revision+' · '+new Date(entry.savedAt).toLocaleString();historyInput.append(item);}
  historyInput.value=lastStored?.id??'';return all;
 };
 historyInput.addEventListener('change',async()=>{
  if(!historyInput.value)return;
  const token=++historyLoad,requested=historyInput.value;saving=true;updatePanel();
  try{await flushDraft();const saved=await rigById(owner,requested);if(!alive()||token!==historyLoad)return;
   if(saved.assembly.sourceId!==source.id||saved.assembly.sourceSha256!==source.sha256)throw Error('That saved version does not belong to this drawing.');
   const before=structuredClone(assembly);setMode('edit');assembly=saved.assembly;kind=assembly.kind;
   q<HTMLSelectElement>(working,'[data-kind]').value=kind;selected=assembly.pieces[0].id;lastStored=saved;history=saved;
   undo.push(before);redo.length=0;dirty=false;layerCache.clear();queueDraft();dirty=false;
   message('Saved version opened. Undo returns to your previous edit. Changes create a new version.');
  }catch(e){message((e as Error).message);}finally{saving=false;if(alive())refresh();}
 });
 q<HTMLButtonElement>(working,'[data-save]').addEventListener('click',async()=>{
  if(!canEdit())return;saving=true;updatePanel();
  try{
   await flushDraft();if(!alive())return;assertRewardSourceWritable();
   validateAssembly(assembly);assemblyRig(assembly,sourceAspect);if(kind==='car')vehicleGeometry(assembly,sourceAspect);
   const before=lastStored;
   if(assembly.revision>=10000)throw Error('This drawing has reached its version limit. Export it before starting a new drawing.');
   const copy={...assembly,revision:history?Math.max(assembly.revision,history.assembly.revision)+1:assembly.revision};
   if(!alive())throw Error('The drawing editor changed. Open your drawing again.');
   const saved=await saveRig(owner,copy,before?.id||history?.id||null,alive);
   if(!alive())return;lastStored=saved;history=saved;assembly=copy;
   dirty=false;draftStatus.textContent='Version '+saved.assembly.revision+' saved';
   await deleteDrawingDraft(owner,source.id,alive);if(!alive())return;
   savedDraftSequence=draftSequence;draftError=null;
   message('New version saved. Your drawing and earlier versions are safe.');await versions();
   if(alive())await options.onSaved?.(saved);
  }catch(e){message((e as Error).message);}finally{saving=false;if(alive())refresh();}
 });
 q<HTMLButtonElement>(working,'[data-use]').addEventListener('click',async()=>{
  if(!lastStored||!canEdit()||!onPlayCar)return;saving=true;updatePanel();
  try{await flushDraft();if(!alive())return;const selected=lastStored;
   await onPlayCar(selected.id);if(!alive())return;working.close();
  }catch(e){message((e as Error).message);}finally{saving=false;if(alive())refresh();}
 });
 try{
  proposals(kind);
  const all=await versions(),draft=options.rigId?null:await loadDrawingDraft(owner,source.id);
  const saved=options.rigId?await rigById(owner,options.rigId):all[0];
  if(!alive())throw Error('The active player changed.');
  if(saved&&(saved.assembly.sourceId!==source.id||saved.assembly.sourceSha256!==source.sha256))throw Error('This version belongs to a different drawing.');
  if(draft){
   assembly=validateAssembly(draft.assembly);history=draft.parentId?all.find(entry=>entry.id===draft.parentId)??null:null;
   notice.textContent='Your saved pieces are here. Choose what to change, then try the movement.';
   dirty=true;draftStatus.textContent='Recovered draft';message('Your draft is back. Continue editing, or save a version to reuse.');
  }else if(saved){assembly=saved.assembly;history=saved;lastStored=saved;draftStatus.textContent='Version '+saved.assembly.revision;notice.textContent='Your saved pieces are here. Change anything to make a new version.';}
  kind=assembly.kind;selected=assembly.pieces[0].id;q<HTMLSelectElement>(working,'[data-kind]').value=kind;
  historyInput.value=lastStored?.id??'';layerCache.clear();refresh();
  working.showModal();canvas.focus({preventScroll:true});return working;
 }catch(error){
  disposed=true;stopPlay();abort.abort();observer.disconnect();window.removeEventListener('factory-profile',onProfile);window.removeEventListener('factory-page',onPage);working.remove();throw error;
 }
}
