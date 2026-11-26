import {drawing, saveDrawing, type Drawing, type DrawingCategory} from '../assets/private-drawings';
import {iconMarkup} from '../brand/icons';
import {assertRewardSourceWritable, rewardSourceWritable} from '../rewards/write-guard';
import {
  PaperHistory, prepareStamps, renderPaper, renderMark, hitMark, transformMark, pointerPoint,
  markBounds, maxPointsPerMark, sheetSize, type Sheet, type Tool, type Point, type Mark, type Stamp,
} from './workspace-engine';
import {readSketchKeep, verifySketchKeep, stageSketchKeep, finishSketchKeep, discardSketchKeep, type SketchKeep} from './sketch-keep';
import './style.css';

const palette = {
  Charcoal:'#202b39', Berry:'#db5679', Sunshine:'#ffb541', Teal:'#268e8c', Lilac:'#6d61ca', Leaf:'#7dbc58',
  Sky:'#438cdc', White:'#ffffff', Cherry:'#bb293c', Tangerine:'#ef7838', Lemon:'#ffe379', Mint:'#95d6b1',
  Ocean:'#255588', Plum:'#88457d', Rose:'#f3a3bc', Cocoa:'#945e48', Sand:'#dfb78c', Silver:'#b0b4c1',
};
const toolNames: Record<Tool,string> = {
  pencil:'Pencil', crayon:'Crayon', brush:'Brush', marker:'Marker', eraser:'Eraser', fill:'Fill',
  line:'Line', circle:'Circle', rectangle:'Rectangle', triangle:'Triangle', star:'Star', stamp:'Stamp', select:'Select',
};
const freehand: Tool[] = ['pencil','crayon','brush','marker','eraser'];
const toolRow = (tools: Tool[]) => tools.map(tool =>
  `<button type="button" data-tool="${tool}" aria-pressed="false"><i aria-hidden="true" class="dp-tool-icon dp-icon-${tool}"></i>${toolNames[tool]}</button>`).join('');
const invitations: Record<string,{category:DrawingCategory;hint:string}> = {
  Anything:{category:'other',hint:''},
  Character:{category:'character',hint:'Who will be in your story?'},
  Thing:{category:'prop',hint:'What could someone pick up or play with?'},
  World:{category:'world',hint:'Where will your story happen?'},
};
const limit = (n:number, min:number, max:number) => Math.max(min,Math.min(max,n));

async function unfinishedChoice(keep:SketchKeep, isCurrent:()=>boolean):Promise<'keep'|'resume'|'discard'|'close'> {
  const dialog=document.createElement('dialog');
  dialog.className='drawing-lab dp-recovery';
  dialog.setAttribute('aria-labelledby','sketchRecoveryHeading');
  dialog.innerHTML=`<h2 id="sketchRecoveryHeading">Finish saving your art?</h2><p data-name></p>
    <div><button type="button" data-keep>${iconMarkup('save')} Keep this picture</button><button type="button" data-resume>${iconMarkup('edit')} Open my drawing</button>
    <button type="button" data-discard>Discard unfinished save</button>
    <button type="button" data-close>Close</button></div>`;
  dialog.querySelector('[data-name]')!.textContent=keep.name;
  document.body.append(dialog);
  const onChange=()=>{if(!isCurrent())dialog.close('close');};
  window.addEventListener('factory-profile',onChange);window.addEventListener('factory-page',onChange);
  return new Promise(resolve=>{
    dialog.querySelector<HTMLButtonElement>('[data-keep]')!.onclick=()=>dialog.close('keep');
    dialog.querySelector<HTMLButtonElement>('[data-resume]')!.onclick=()=>dialog.close('resume');
    dialog.querySelector<HTMLButtonElement>('[data-close]')!.onclick=()=>dialog.close('close');
    dialog.querySelector<HTMLButtonElement>('[data-discard]')!.onclick=()=>{
      if(isCurrent() && confirm('Discard this unfinished save? Earlier saved art stays in My Art.'))dialog.close('discard');
    };
    dialog.addEventListener('close',()=>{
      const action=dialog.returnValue;
      window.removeEventListener('factory-profile',onChange);window.removeEventListener('factory-page',onChange);
      dialog.remove();resolve(isCurrent() && (action==='keep' || action==='resume' || action==='discard')?action:'close');
    },{once:true});
    dialog.showModal();
  });
}

/** My Art and the older drawing entry share this editor and private save path. */
export async function drawOnTablet(owner:string, onSaved:(drawing:Drawing)=>Promise<void>|void,
  isCurrent:()=>boolean=()=>true, previous?:{item:Drawing;sketch:Sheet}) {
  const hasEditor=()=>Boolean(document.querySelector('dialog.drawing-paint[open],dialog.dp-recovery[open]'));
  if(hasEditor())return;
  const profile = () => (window as any).FG?.store?.current();
  const checkOwner = () => String(profile()?.id ?? '') === owner;
  if (!checkOwner() || previous && previous.item.owner !== owner) throw Error('Choose the player who owns this drawing.');
  if (!isCurrent()) throw Error('Open a drawing from My Art.');
  assertRewardSourceWritable();
  const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const originPage = document.querySelector<HTMLElement>('.page:not(.hidden)')?.id.replace(/^page-/,'');
  const openingCurrent = () => checkOwner() && isCurrent() && (!originPage || document.getElementById('page-'+originPage)?.classList.contains('hidden')===false);
  let source=previous?.item, initial=previous?.sketch, token:string=crypto.randomUUID();
  let initialName=source?.name??'', initialCategory:DrawingCategory=source?.category ?? 'other', recovered=false;
  const pending=await readSketchKeep(owner);
  if(!openingCurrent() || hasEditor())return;
  if(pending){
    const choice=await unfinishedChoice(pending,openingCurrent);
    if(choice==='close' || !openingCurrent())return;
    if(choice==='keep'){
      const saved=await finishSketchKeep(owner,pending.token,openingCurrent);
      if(openingCurrent())await onSaved(saved);
      return;
    }
    if(choice==='discard'){
      await discardSketchKeep(owner,pending.token,openingCurrent);
    }else{
      const checked=await verifySketchKeep(owner,pending.token);
      if(!openingCurrent())return;
      source=checked.sourceId?await drawing(owner,checked.sourceId):undefined;
      if(checked.sourceId && source?.sha256!==checked.sourceSha256)throw Error('Restore the earlier version to finish this save. Your unfinished page is safe.');
      token=checked.token;initial=checked.sheet;initialName=checked.name;initialCategory=checked.category;recovered=true;
    }
  }
  if(!openingCurrent() || hasEditor())return;
  if(!initial && matchMedia('(max-width: 1024px) and (orientation: portrait)').matches){
    initial={version:1,transparent:false,marks:[],orientation:'portrait'};
  }
  const dialog = document.createElement('dialog');
  dialog.className = 'drawing-lab drawing-paint';
  dialog.setAttribute('aria-label',source || recovered?'Keep drawing':'Draw something new');
  const grade = profile()?.grade ?? 1;
  const basic: Tool[] = grade <= 0 ? ['crayon','eraser','circle'] : ['pencil','crayon','brush','eraser','circle'];
  const extras: Tool[] = ['pencil','brush','marker','fill','line','circle','rectangle','triangle','star','select'];
  dialog.innerHTML = `<header class="dp-head">
    <img src="./jems-art/spot_first_idea.webp" alt="" width="78" height="70">
    <div><h2>${source || recovered?'Keep drawing':'Draw your idea!'}</h2><p data-hint>${source || recovered?'Keep a new version when you’re ready.':invitations.Anything.hint}</p></div>
    <button type="button" data-exit aria-label="Close drawing page">${iconMarkup('close')} Close</button>
  </header>
  <div class="dp-work">
    <section class="dp-desk" aria-label="Drawing page">
      ${source || recovered?'':`<div class="dp-invite" role="group" aria-label="Drawing ideas">${Object.keys(invitations).map((name,i)=>`<button type="button" data-idea="${name}" aria-pressed="${i===0}">${name}</button>`).join('')}</div>`}
      <canvas data-paper width="900" height="560" tabindex="0" aria-label="Drawing page. Arrow keys move. Hold Space and use arrows to draw. Enter makes one mark."></canvas>
      <div class="dp-history"><button data-focus type="button" aria-pressed="false">${iconMarkup('search')} Focus on paper</button><button type="button" data-undo>${iconMarkup('undo')} Undo</button><button type="button" data-redo>${iconMarkup('retry')} Redo</button>
        <details><summary>Keyboard help</summary><p>Arrows move. Hold Space and use arrows to draw. Enter places a mark. With Select, Enter picks a mark and arrows move it.</p></details>
      </div>
    </section>
    <aside class="dp-tools" aria-label="Art supplies">
      <h3>Art supplies</h3><div class="dp-tool-row" role="group" aria-label="Drawing tools">${toolRow(basic)}
        <button type="button" data-stamp="blue" aria-label="Blue Jems stamp" aria-pressed="false"><img class="dp-stamp-icon" src="./jems-art/gem_blue.webp" alt="">Stamp</button></div>
      <div data-colors role="group" aria-label="Colors"></div>
      <details data-extra-colors><summary>More colors</summary><div data-colors data-rest role="group" aria-label="More colors"></div></details>
      <div class="dp-brush-sizes" role="group" aria-label="Choose a size">${[4,10,20].map((s,i)=>`<button type="button" data-size="${s}" aria-label="${['Small','Medium','Large'][i]}" aria-pressed="${i===1}"><i aria-hidden="true" style="width:${s}px;height:${s}px"></i></button>`).join('')}</div>
      <details data-more-tools ${grade>=1?'open':''}><summary>More tools</summary>
        <div class="dp-tool-row" role="group" aria-label="More drawing tools">${toolRow(extras.filter(tool=>!basic.includes(tool)))}</div>
        <label>Brush width<input type="range" min="3" max="24" value="10" data-brush-width></label>
        <div class="dp-stamps" role="group" aria-label="Jems stamps"><span>Jems stamps</span>${(['gold','mint'] as Stamp[]).map(stamp=>`<button type="button" data-stamp="${stamp}" aria-label="${stamp} gem stamp" aria-pressed="false"><img src="./jems-art/gem_${stamp}.webp" alt=""></button>`).join('')}</div>
      </details>
      <div class="dp-selection" hidden><button data-next-mark type="button">Next mark</button><button data-shrink type="button">Smaller</button><button data-grow type="button">Bigger</button></div>
      <details data-options ${grade>=3?'open':''}><summary>Page options</summary>
        <label>Paper<select data-background><option value="white">White paper</option><option value="clear">Clear background</option></select></label>
        <label>Mix a color<input type="color" data-custom value="#202b39"></label>
        <button type="button" data-clear>${iconMarkup('trash')} Clear page</button>
      </details>
    </aside>
  </div>
  <footer class="dp-keep"><button type="button" data-tray aria-expanded="false">${iconMarkup('edit')} Tools</button><label>Name<input data-title maxlength="60" placeholder="My drawing"></label>
    <button type="button" data-save>${iconMarkup('save')} Keep my art</button><p role="status" aria-live="polite" data-message></p></footer>`;
  document.body.append(dialog);
  const find = <T extends HTMLElement>(selector:string) => dialog.querySelector<T>(selector)!;
  const canvas = find<HTMLCanvasElement>('[data-paper]');
  const history = new PaperHistory(initial);
  const extent=sheetSize(history.sheet);
  canvas.width=extent.width;canvas.height=extent.height;
  canvas.style.setProperty('--dp-aspect',String(extent.width/extent.height));
  const ctx = canvas.getContext('2d');
  const committed = document.createElement('canvas');
  committed.width = canvas.width; committed.height = canvas.height;
  const cache = committed.getContext('2d');
  if (!ctx || !cache) { dialog.remove(); throw Error('This device could not open a drawing page. Your pictures are safe.'); }
  const renderer = ctx, backing = cache;
  const title = find<HTMLInputElement>('[data-title]');
  title.value = initialName;
  const status = find('[data-message]'), paper = find<HTMLSelectElement>('[data-background]');
  let tool:Tool='crayon', stamp:Stamp='blue', color:string=palette.Charcoal, size=10, category:DrawingCategory=initialCategory;
  let selected=-1, active:Mark|null=null, start:Point|null=null, drag:Mark|null=null, pointer:number|null=null;
  let keyboard=false, showCursor=false, saving=false, dirty=recovered, disposed=false, pageCurrent=true, pendingFrame=0;
  let stampsReady=false, loadingPrevious=Boolean(initial?.marks.some(mark=>mark.tool==='stamp'));
  const cursor:Point={x:extent.width/2,y:extent.height/2};
  const alive=()=>!disposed && pageCurrent && checkOwner() && isCurrent();
  const canEdit=()=>{
    if(!alive() || saving || loadingPrevious)return false;
    if(!rewardSourceWritable()){status.textContent='Saving is paused. Return to the active Jems tab to continue.';return false;}
    return true;
  };

  function updateControls(){
    const sheet=history.sheet;
    for(const button of dialog.querySelectorAll<HTMLButtonElement>('button[data-tool]'))button.setAttribute('aria-pressed',String(button.dataset.tool===tool));
    for(const button of dialog.querySelectorAll<HTMLButtonElement>('button[data-stamp]')){
      button.setAttribute('aria-pressed',String(tool==='stamp' && stamp===button.dataset.stamp));
      button.disabled=!stampsReady || saving;
    }
    for(const button of dialog.querySelectorAll<HTMLButtonElement>('button[data-color]'))button.setAttribute('aria-pressed',String(button.dataset.color===color));
    for(const button of dialog.querySelectorAll<HTMLButtonElement>('button[data-size]'))button.setAttribute('aria-pressed',String(Number(button.dataset.size)===size));
    find<HTMLInputElement>('[data-brush-width]').value=String(size);
    paper.value=sheet.transparent?'clear':'white';
    canvas.classList.toggle('dp-transparent',sheet.transparent);
    find('[data-undo]').toggleAttribute('disabled',saving || !history.canUndo);
    find('[data-redo]').toggleAttribute('disabled',saving || !history.canRedo);
    find('[data-save]').toggleAttribute('disabled',saving || !sheet.marks.length || !dirty);
    find('[data-clear]').toggleAttribute('disabled',saving || !sheet.marks.length);
    find('.dp-selection').hidden=tool!=='select';
    find('[data-grow]').toggleAttribute('disabled',saving || selected<0);
    find('[data-shrink]').toggleAttribute('disabled',saving || selected<0);
    find('[data-next-mark]').toggleAttribute('disabled',saving || !sheet.marks.length);
  }

  function display(){
    const sheet=history.sheet;
    if(drag && selected>=0){
      const marks=sheet.marks.slice();marks[selected]=drag;
      renderPaper(renderer,{...sheet,marks});
    }else{
      renderer.clearRect(0,0,canvas.width,canvas.height);renderer.drawImage(committed,0,0);
      if(active)renderMark(renderer,active,sheet.transparent);
    }
    renderer.save();
    if(tool==='select' && selected>=0 && sheet.marks[selected]){
      const box=markBounds(drag??sheet.marks[selected]);renderer.strokeStyle='#6135a8';renderer.lineWidth=3;renderer.setLineDash([8,5]);
      renderer.strokeRect(box.left-3,box.top-3,box.right-box.left+6,box.bottom-box.top+6);
    }
    if(showCursor){renderer.strokeStyle='#574475';renderer.lineWidth=2;renderer.setLineDash([3,3]);renderer.beginPath();renderer.arc(cursor.x,cursor.y,Math.max(10,size),0,Math.PI*2);renderer.stroke();}
    renderer.restore();
  }
  function schedule(){
    if(!pendingFrame)pendingFrame=requestAnimationFrame(()=>{pendingFrame=0;if(!disposed)display();});
  }
  function refresh(){renderPaper(backing,history.sheet);updateControls();display();}
  function commit(sheet:Sheet){
    try{history.apply(sheet);dirty=true;status.textContent='';}
    catch(error){status.textContent=(error as Error).message;}
    refresh();
  }
  function discardGesture(){active=null;start=null;drag=null;pointer=null;keyboard=false;}
  function begin(point:Point){
    if(tool==='select'){
      selected=hitMark(history.sheet,point);start=point;updateControls();
    }else{
      active={tool,color,size,points:[point],...(tool==='stamp'?{stamp}:{})};
    }
    schedule();
  }
  function move(point:Point){
    if(tool==='select' && start && selected>=0){
      drag=transformMark(history.sheet.marks[selected],point.x-start.x,point.y-start.y,1,history.sheet);
    }else if(active){
      const last=active.points.at(-1)!;
      if(freehand.includes(active.tool)){
        if(Math.hypot(point.x-last.x,point.y-last.y)>.8 && active.points.length<maxPointsPerMark)active.points.push(point);
      }else if(active.tool!=='fill')active.points[1]=point;
    }
    schedule();
  }
  function finish(){
    const sheet=history.sheet, mark=active, moved=drag;
    discardGesture();
    if(mark)commit({...sheet,marks:[...sheet.marks,mark]});
    else if(moved && selected>=0){const marks=sheet.marks.slice();marks[selected]=moved;commit({...sheet,marks});}
    else display();
  }
  function selectTool(next:Tool){
    discardGesture();tool=next;selected=-1;status.textContent=next==='select'?'Pick a mark to move it.':'';
    updateControls();display();
  }
  canvas.addEventListener('pointerdown',event=>{
    if(!canEdit() || pointer!==null || keyboard || event.button!==0)return;
    event.preventDefault();showCursor=false;pointer=event.pointerId;canvas.setPointerCapture(pointer);begin(pointerPoint(canvas,event));
  });
  canvas.addEventListener('pointermove',event=>{
    if(pointer!==event.pointerId || !canEdit())return;
    event.preventDefault();move(pointerPoint(canvas,event));
  });
  canvas.addEventListener('pointerup',event=>{
    if(pointer!==event.pointerId)return;
    if(!canEdit()){discardGesture();display();return;}
    move(pointerPoint(canvas,event));finish();
  });
  const cancelPointer=(event:PointerEvent)=>{if(pointer===event.pointerId){discardGesture();display();}};
  canvas.addEventListener('pointercancel',cancelPointer);
  canvas.addEventListener('lostpointercapture',cancelPointer);

  function transformSelected(dx:number,dy:number,scale=1){
    if(selected<0)return;
    const sheet=history.sheet, marks=sheet.marks.slice();
    marks[selected]=transformMark(marks[selected],dx,dy,scale,sheet);commit({...sheet,marks});
  }
  canvas.addEventListener('keydown',event=>{
    if(!canEdit() || pointer!==null)return;
    const delta=event.shiftKey?2:10;
    if(event.code==='Space'){
      event.preventDefault();if(!keyboard){keyboard=true;showCursor=true;begin({...cursor});}
    }else if(event.code==='Enter'){
      event.preventDefault();if(keyboard || event.repeat)return;showCursor=true;begin({...cursor});finish();
    }else if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.code)){
      event.preventDefault();showCursor=true;
      const dx=event.code==='ArrowLeft'?-delta:event.code==='ArrowRight'?delta:0;
      const dy=event.code==='ArrowUp'?-delta:event.code==='ArrowDown'?delta:0;
      cursor.x=limit(cursor.x+dx,0,canvas.width);cursor.y=limit(cursor.y+dy,0,canvas.height);
      if(keyboard)move({...cursor});
      else if(tool==='select' && selected>=0)transformSelected(dx,dy);
      else display();
    }else if(event.code==='Escape' && keyboard){event.preventDefault();discardGesture();display();}
  });
  canvas.addEventListener('keyup',event=>{if(event.code==='Space' && keyboard){event.preventDefault();finish();}});
  canvas.addEventListener('blur',()=>{if(keyboard)finish();showCursor=false;display();});

  for(const [name,shade] of Object.entries(palette)){
    const button=document.createElement('button');button.type='button';button.style.backgroundColor=shade;button.dataset.color=shade;
    button.setAttribute('aria-label',name);button.title=name;(Object.keys(palette).indexOf(name)<8?find('[data-colors]'):find('[data-rest]')).append(button);
  }
  dialog.addEventListener('click',event=>{
    const button=(event.target as HTMLElement).closest<HTMLButtonElement>('button');
    if(!button || !canEdit())return;
    if(button.dataset.tool){selectTool(button.dataset.tool as Tool);}
    else if(button.dataset.stamp){stamp=button.dataset.stamp as Stamp;selectTool('stamp');}
    else if(button.dataset.color){color=button.dataset.color;find<HTMLInputElement>('[data-custom]').value=color;updateControls();}
    else if(button.dataset.size){size=Number(button.dataset.size);updateControls();}
    else if(button.dataset.idea){
      const idea=invitations[button.dataset.idea];category=idea.category;find('[data-hint]').textContent=idea.hint;
      for(const other of dialog.querySelectorAll('button[data-idea]'))other.setAttribute('aria-pressed',String(other===button));
    }
  });
  find<HTMLInputElement>('[data-custom]').oninput=event=>{if(canEdit()){color=(event.target as HTMLInputElement).value;updateControls();}};
  find<HTMLInputElement>('[data-brush-width]').oninput=event=>{
    if(canEdit()){size=Number((event.target as HTMLInputElement).value);updateControls();}
  };
  paper.onchange=()=>{if(canEdit())commit({...history.sheet,transparent:paper.value==='clear'});};
  for(const action of ['undo','redo'] as const)find('[data-'+action+']').onclick=()=>{
    if(!canEdit())return;discardGesture();selected=-1;history[action]();dirty=true;refresh();
  };
  const mobile=matchMedia('(max-width:600px) and (orientation:portrait)');
  const basicTools=find<HTMLElement>('[aria-label="Drawing tools"]');
  basicTools.classList.add('dp-basic-tools');
  const quickColors=find<HTMLElement>('[data-colors]');
  function placeBasicTools(){
    if(mobile.matches && !dialog.classList.contains('dp-pocket-open')){
      canvas.before(basicTools,quickColors);
    } else {
      find('.dp-tools h3').after(basicTools,quickColors);
    }
  }
  mobile.addEventListener('change',placeBasicTools);placeBasicTools();
  const tray=find<HTMLButtonElement>('[data-tray]');
  const trayPanel=find<HTMLElement>('.dp-tools');
  trayPanel.id='drawingSupplies';tray.setAttribute('aria-controls',trayPanel.id);
  function closeTray(){
    dialog.classList.remove('dp-pocket-open');tray.setAttribute('aria-expanded','false');
    tray.innerHTML=iconMarkup('edit')+' Tools';placeBasicTools();
  }
  tray.onclick=()=>{
    if(dialog.classList.contains('dp-pocket-open')){closeTray();canvas.focus({preventScroll:true});}
    else{
      dialog.classList.add('dp-pocket-open');tray.setAttribute('aria-expanded','true');tray.innerHTML=iconMarkup('check')+' Done';
      placeBasicTools();trayPanel.scrollTop=0;trayPanel.querySelector('button')?.focus({preventScroll:true});
    }
  };
  const focusMode=find<HTMLButtonElement>('[data-focus]');
  focusMode.onclick=()=>{
    closeTray();const focused=dialog.classList.toggle('dp-focus');
    focusMode.setAttribute('aria-pressed',String(focused));
    focusMode.innerHTML=iconMarkup(focused?'edit':'search')+(focused?' Show tools':' Focus on paper');
    if(focused){dialog.scrollTop=0;canvas.focus({preventScroll:true});}
  };
  find('[data-grow]').onclick=()=>{if(canEdit())transformSelected(0,0,1.2);};
  find('[data-shrink]').onclick=()=>{if(canEdit())transformSelected(0,0,1/1.2);};
  find('[data-next-mark]').onclick=()=>{
    if(!canEdit() || !history.sheet.marks.length)return;
    selected=(selected+1)%history.sheet.marks.length;status.textContent='Selected '+toolNames[history.sheet.marks[selected].tool]+'.';updateControls();canvas.focus();display();
  };
  find('[data-clear]').onclick=()=>{
    if(!canEdit() || !history.sheet.marks.length)return;
    if(confirm('Clear this page? You can undo this.')){discardGesture();selected=-1;commit({...history.sheet,marks:[]});}
  };
  find('[data-save]').onclick=async()=>{
    if(!canEdit() || !history.sheet.marks.length)return;
    discardGesture();saving=true;updateControls();
    try{
      const keep={token,name:title.value.trim() || 'My drawing',category,sheet:history.sheet,
        ...(source?{sourceId:source.id,sourceSha256:source.sha256}:{})};
      const file=await stageSketchKeep(owner,keep,alive,committed);
      if(!alive())return;
      const saved=await saveDrawing(owner,keep.name,file,source?.id,alive,category,token);
      if(!alive())return;
      dirty=false;await onSaved(saved);if(alive())dialog.close();
    }catch(error){if(alive())status.textContent=(error as Error).message;}
    finally{saving=false;if(alive())updateControls();}
  };
  function requestClose(){
    if(saving){status.textContent='Finishing your save…';return;}
    if(dirty && !confirm('Leave without saving your changes?'))return;
    dialog.close();
  }
  find('[data-exit]').onclick=requestClose;
  dialog.addEventListener('cancel',event=>{event.preventDefault();requestClose();});
  const onProfile=()=>{if(!checkOwner()){disposed=true;pageCurrent=false;dialog.close();}};
  const onPage=(event:Event)=>{
    pageCurrent=(!originPage || (event as CustomEvent).detail===originPage) && isCurrent();
    if(pageCurrent){refresh();return;}
    discardGesture();
    if(!dirty){dialog.close();return;}
    status.textContent='Your drawing is open. Return to My Art to keep it.';
  };
  window.addEventListener('factory-profile',onProfile);
  window.addEventListener('factory-page',onPage);
  dialog.addEventListener('close',()=>{
    disposed=true;cancelAnimationFrame(pendingFrame);discardGesture();mobile.removeEventListener('change',placeBasicTools);
    window.removeEventListener('factory-profile',onProfile);window.removeEventListener('factory-page',onPage);
    dialog.remove();committed.width=canvas.width=1;
    if(checkOwner() && pageCurrent && isCurrent() && returnFocus?.isConnected)returnFocus.focus({preventScroll:true});
  },{once:true});
  const needsStamps=history.sheet.marks.some(mark=>mark.tool==='stamp');
  dialog.showModal();
  updateControls();
  if(!needsStamps)refresh();
  try{await prepareStamps();if(alive()){stampsReady=true;loadingPrevious=false;refresh();}}
  catch{if(alive()){
    if(needsStamps){dialog.close();throw Error('The gem stamps could not open. Try again to edit your saved drawing.');}
    status.textContent='Gem stamps are unavailable. You can still draw.';updateControls();
  }}
  return dialog;
}
