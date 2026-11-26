import {saveDrawing,type Drawing} from '../assets/private-drawings';
import {iconMarkup} from '../brand/icons';
import {assertRewardSourceWritable,rewardSourceWritable} from '../rewards/write-guard';
import {crayons as colors, paperWidth, paperHeight, maxStrokes, maxStrokePoints, renderStrokes, includeCrayonSource, verifiedCrayonSource, snapCoordinate, type Stroke} from './crayon-source';
import './style.css';

const colorNames=['Charcoal','Berry','Sunshine','Teal','Lilac','Leaf','White'];
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
/** Optional draw-here mode. A local sketch becomes the same owner-scoped PNG as a photo. */
export async function drawOnTablet(owner:string,onSaved:(drawing:Drawing)=>Promise<void>|void,isCurrent:()=>boolean=()=>true,source?:Drawing){
 const checkOwner=()=>String((window as any).FG?.store?.current()?.id||'')===owner;
 if(!checkOwner())throw Error('Choose the player who owns this drawing.');
 if(!isCurrent())throw Error('Open a new drawing from your Art Studio.');
 assertRewardSourceWritable();
 if(source&&source.owner!==owner)throw Error('Choose a drawing from your own profile.');
 const reopened=source?await verifiedCrayonSource(source.bytes):undefined;
 if(!isCurrent()||!checkOwner())return;
 const returnFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
 const originPage=document.querySelector<HTMLElement>('.page:not(.hidden)')?.id.replace(/^page-/,'');
 const dialog=document.createElement('dialog');dialog.className='drawing-lab drawing-paint';
 dialog.setAttribute('aria-label',source?'Keep drawing':'Draw something new');
 dialog.innerHTML=`<div class="dl-shell"><header class="dl-header"><div><h2>${source?'Keep drawing':'Draw your idea!'}</h2><p>${source?'Keep a new version when you’re ready.':'Choose a crayon and draw on the page.'}</p></div><button type="button" data-exit aria-label="Close drawing page">${iconMarkup('close')} Close</button></header><div class="dp-work"><div><canvas data-paper aria-label="Drawing canvas. Draw with a finger or mouse. Keyboard: arrows move the crayon, hold Space while moving to draw, Enter makes a dot." tabindex="0"></canvas><p class="dl-canvas-help">Finger, mouse or keyboard. Arrows move the crayon; hold Space to draw.</p></div><div class="dp-tools"><h3>Your crayons</h3><div data-colors role="group" aria-label="Choose a crayon color"></div><button type="button" data-eraser aria-pressed="false">Eraser</button><label>Brush size<input data-size type="range" min="3" max="24" value="8"></label><label class="dp-paper-toggle"><input type="checkbox" data-transparent> Clear background</label><label>My drawing is called<input data-title maxlength="60" value="My new invention"></label><div class="dl-edit-row"><button type="button" data-undo>${iconMarkup('undo')} Undo a stroke</button><button type="button" data-redo>${iconMarkup('retry')} Redo</button></div><button type="button" data-clear>${iconMarkup('trash')} Start over</button><button type="button" data-save>${iconMarkup('save')} Keep my drawing</button><p role="status" data-message></p></div></div></div>`;
 document.body.append(dialog);const canvas=dialog.querySelector<HTMLCanvasElement>('[data-paper]')!;
 const ctx=canvas.getContext('2d')!,colorsPanel=dialog.querySelector<HTMLElement>('[data-colors]')!;
 const status=dialog.querySelector<HTMLElement>('[data-message]')!;
 let color:string=colors[0],size=8,strokes:Stroke[]=reopened?.strokes??[],redo:Stroke[]=[],active:Stroke|null=null,disposed=false,saving=false,dirty=false,keyboardDrawing=false,keyboardCursor=false,pageCurrent=true;
 let transparent=reopened?.transparent??false,committed=false;
 const eraser=dialog.querySelector<HTMLButtonElement>('[data-eraser]')!;
 const paperToggle=dialog.querySelector<HTMLInputElement>('[data-transparent]')!;
 paperToggle.checked=transparent;
 if(source)dialog.querySelector<HTMLInputElement>('[data-title]')!.value=source.name;
 const cursor={x:450,y:280};
 const alive=()=>!disposed&&checkOwner()&&pageCurrent&&isCurrent();
 const canEdit=()=>{if(!alive()||saving||committed)return false;if(!rewardSourceWritable()){status.textContent='Saving is paused. Return to the active Jems tab to continue.';return false;}return true;};
 const cw=paperWidth,ch=paperHeight;canvas.width=cw;canvas.height=ch;
 const draw=(showCursor=true)=>{
  renderStrokes(ctx,active?[...strokes,active]:strokes,transparent);
  canvas.classList.toggle('dp-transparent',transparent);
  if(showCursor&&keyboardCursor){ctx.save();ctx.strokeStyle='#7160a8';ctx.lineWidth=2;ctx.setLineDash([5,4]);ctx.beginPath();ctx.arc(cursor.x,cursor.y,Math.max(10,size),0,Math.PI*2);ctx.stroke();ctx.restore();}
  dialog.querySelector<HTMLButtonElement>('[data-undo]')!.disabled=saving||committed||!strokes.length;
  dialog.querySelector<HTMLButtonElement>('[data-redo]')!.disabled=saving||committed||!redo.length;
  dialog.querySelector<HTMLButtonElement>('[data-save]')!.disabled=saving||committed||!!active||!strokes.length||!dirty;
  dialog.querySelector<HTMLButtonElement>('[data-clear]')!.disabled=saving||committed||!strokes.length;
  for(const control of dialog.querySelectorAll<HTMLInputElement|HTMLButtonElement>('[data-colors] button,input,[data-eraser]'))control.disabled=saving||committed;
 };
 const point=(e:PointerEvent)=>{
  const r=canvas.getBoundingClientRect();
  return {x:snapCoordinate(clamp((e.clientX-r.left)*cw/Math.max(1,r.width),0,cw)),
    y:snapCoordinate(clamp((e.clientY-r.top)*ch/Math.max(1,r.height),0,ch))};
 };
 canvas.addEventListener('pointerdown',e=>{
  if(!canEdit()||e.button>0||active)return;keyboardCursor=false;
  e.preventDefault();canvas.setPointerCapture(e.pointerId);
  active={color,size,points:[point(e)]};draw();
 });
 canvas.addEventListener('pointermove',e=>{
  if(!active||!canvas.hasPointerCapture(e.pointerId)||!canEdit())return;
  if(active.points.length>=maxStrokePoints)return;
  const p=point(e),last=active.points.at(-1)!;
  if(Math.hypot(p.x-last.x,p.y-last.y)>.9)active.points.push(p);
  draw();e.preventDefault();
 });
 const finish=(e:PointerEvent)=>{
  if(!active||!canvas.hasPointerCapture(e.pointerId))return;
  if(strokes.length>=maxStrokes){status.textContent='That is a full page! Save it to start another.';active=null;draw();return;}
  strokes.push(active);active=null;redo=[];dirty=true;draw();
 };
 canvas.addEventListener('pointerup',finish);
 canvas.addEventListener('pointercancel',()=>{active=null;draw();});
 canvas.addEventListener('lostpointercapture',()=>{if(active){active=null;draw();}});
 const finishKeyboard=()=>{if(keyboardDrawing&&active){if(strokes.length<maxStrokes){strokes.push(active);redo=[];dirty=true;}else status.textContent='That is a full page! Save it to start another.';active=null;}keyboardDrawing=false;draw();};
 canvas.addEventListener('keydown',event=>{
  if(!canEdit())return;
  if(event.code==='Space'){event.preventDefault();if(!active){keyboardCursor=true;keyboardDrawing=true;active={color,size,points:[{...cursor}]};draw();}return;}
  if(event.code==='Enter'){event.preventDefault();if(strokes.length<maxStrokes){strokes.push({color,size,points:[{...cursor}]});redo=[];dirty=true;keyboardCursor=true;draw();}return;}
  if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.code))return;
  event.preventDefault();keyboardCursor=true;const delta=event.shiftKey?2:10;
  if(event.code==='ArrowLeft')cursor.x=clamp(cursor.x-delta,0,cw);if(event.code==='ArrowRight')cursor.x=clamp(cursor.x+delta,0,cw);
  if(event.code==='ArrowUp')cursor.y=clamp(cursor.y-delta,0,ch);if(event.code==='ArrowDown')cursor.y=clamp(cursor.y+delta,0,ch);
  if(keyboardDrawing&&active&&active.points.length<maxStrokePoints)active.points.push({...cursor});draw();
 });
 canvas.addEventListener('keyup',event=>{if(event.code==='Space'){event.preventDefault();finishKeyboard();}});
 canvas.addEventListener('blur',()=>{finishKeyboard();keyboardCursor=false;draw();});
 for(const shade of colors){
  const b=document.createElement('button');b.type='button';b.style.background=shade;b.style.borderColor='#556b67';
  const name=colorNames[colors.indexOf(shade)];b.setAttribute('aria-label','Use '+name+' crayon');b.title=name;b.setAttribute('aria-pressed',String(color===shade));
  b.onclick=()=>{if(!canEdit())return;color=shade;eraser.setAttribute('aria-pressed','false');colorsPanel.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));};
  colorsPanel.append(b);
 }
 eraser.onclick=()=>{if(!canEdit())return;color='erase';eraser.setAttribute('aria-pressed','true');colorsPanel.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed','false'));};
 paperToggle.onchange=()=>{if(!canEdit())return;transparent=paperToggle.checked;dirty=true;draw();};
 dialog.querySelector<HTMLInputElement>('[data-size]')!.oninput=e=>{size=Number((e.target as HTMLInputElement).value)};
 dialog.querySelector<HTMLButtonElement>('[data-undo]')!.onclick=()=>{if(!canEdit())return;const stroke=strokes.pop();if(stroke){redo.push(stroke);dirty=true;}draw();};
 dialog.querySelector<HTMLButtonElement>('[data-redo]')!.onclick=()=>{if(!canEdit())return;const stroke=redo.pop();if(stroke){strokes.push(stroke);dirty=true;}draw();};
 dialog.querySelector<HTMLButtonElement>('[data-clear]')!.onclick=()=>{
  if(!canEdit()||!strokes.length)return;
  if(!confirm('Start over? Your drawing has not been saved yet.'))return;
  strokes=[];redo=[];dirty=false;draw();
 };
 dialog.querySelector<HTMLButtonElement>('[data-save]')!.onclick=async()=>{
  if(!canEdit()||active)return;
  if(!strokes.length){status.textContent='Draw something first!';return;}
  saving=true;draw(false);try{
   const file=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Could not save your drawing.')),'image/png'));
   if(!alive())return;assertRewardSourceWritable();
   const name=dialog.querySelector<HTMLInputElement>('[data-title]')!.value.trim()||'My drawing';
   const saved=await saveDrawing(owner,name,includeCrayonSource(file,{transparent,strokes}),source?.id,alive);
   committed=true;
   if(!alive())return;dirty=false;status.textContent='Saved in Art Studio!';await onSaved(saved);if(dialog.open)dialog.close();
  }catch(e){if(alive())status.textContent=committed?'Your drawing is saved. Close this page and reopen My Art to see it.':(e as Error).message;}finally{saving=false;if(alive())draw();}
 };
 const requestClose=()=>{if(saving){status.textContent='Finishing your save…';return;}if(dirty&&!confirm('Leave this drawing without saving? Choose Keep my drawing to return to it later.'))return;dialog.close();};
 dialog.querySelector<HTMLButtonElement>('[data-exit]')!.onclick=requestClose;
 dialog.addEventListener('cancel',event=>{event.preventDefault();requestClose();});
 const onProfile=()=>{if(!checkOwner()){disposed=true;pageCurrent=false;dialog.close();}};
 const onPage=(event:Event)=>{
  pageCurrent=(!originPage||(event as CustomEvent).detail===originPage)&&isCurrent();
  if(pageCurrent){draw();return;}
  active=null;keyboardDrawing=false;
  if(!dirty){dialog.close();return;}
  // A sketch has no durable stroke draft. Keep unsaved pixels visible until the
  // child explicitly discards them; an invalid route can never finish a save.
  status.textContent='Your sketch has not been saved. Return to Art Studio to keep it, or close to discard it.';
 };
 window.addEventListener('factory-profile',onProfile);
 window.addEventListener('factory-page',onPage);
 dialog.addEventListener('close',()=>{disposed=true;active=null;window.removeEventListener('factory-profile',onProfile);window.removeEventListener('factory-page',onPage);strokes=[];redo=[];canvas.width=canvas.height=1;dialog.remove();if(checkOwner()&&pageCurrent&&isCurrent()&&returnFocus?.isConnected)returnFocus.focus({preventScroll:true});},{once:true});
 draw();dialog.showModal();return dialog;
}
