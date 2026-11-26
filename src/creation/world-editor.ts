import {createReadAloudControl} from '../speech/read-aloud-control';
import {ILLUSTRATED_WORLDS, WORLD_PROPS} from './illustrated-art';
import {EARLIER_PROPS, SCENE_WORLDS, worldEditorView, type CreationProject, type PercentageWorld as SceneWorld} from './model';
type WorldDecoration=SceneWorld['decorations'][number];
const WORLD_DECORATION_LIMIT=8;
const paintedWorld=(id:string)=>ILLUSTRATED_WORLDS.find(world=>world.id===id);
const PAINTED_BACKDROPS=ILLUSTRATED_WORLDS.map(world=>({...world,url:world.preview}));
const EARLIER_BACKDROPS=SCENE_WORLDS.filter(world=>!paintedWorld(world.id));
const worldAsset=(id:string)=>SCENE_WORLDS.find(world=>world.id===id);
import {CreationStage} from './stage';
import {SceneEngine} from './engine';
import type {PrivateArtResolver} from './private-art';
import './world-editor.css';

type Change = (world:SceneWorld)=>void;
interface Host {
  scene():CreationProject|null;
  mutate(change:Change):Promise<void>;
  privateArt:PrivateArtResolver;
  chooseArt(container:HTMLElement, current:()=>boolean, use:(id:string,label:string)=>Promise<void>):Promise<(()=>void)|undefined>;
  keptScenery():HTMLDetailsElement;
  current():boolean;
}
export function createWorldEditor(host:Host) {
  const dialog=document.createElement('dialog');
  dialog.className='creation-dialog creation-world-dialog';
  dialog.setAttribute('aria-labelledby','creationVisualWorldTitle');
  dialog.innerHTML=`
    <header><h2 id="creationVisualWorldTitle">Make your world</h2><button type="button" class="creation-button" data-done>Done</button></header>
    <div class="world-workbench">
      <div class="world-preview"><canvas role="img" aria-label="World preview"></canvas><p data-hint hidden>Tap the picture to place your decoration.</p></div>
      <div class="world-tools">
        <h3>Backdrop</h3><div class="world-pictures world-backdrops" data-worlds></div>
        <details class="world-earlier"><summary>More backdrops</summary><div class="world-pictures" data-earlier></div></details>
        <fieldset class="world-layers" data-layers hidden><legend>Scenery</legend><label><input type="checkbox" data-layer="middle"> Middle</label><label><input type="checkbox" data-layer="foreground"> In front</label></fieldset>
        <div class="world-actions"><button class="creation-button" data-backdrop>My art</button><button class="creation-button" data-saved>Saved worlds</button>
        <label>Picture fit <select data-fit><option value="cover">Fill the stage</option><option value="contain">Whole picture</option></select></label></div>
        <section data-choices hidden><h3 data-choice-title></h3><div data-library></div></section>
        <h3>Decorations</h3><label>From <select data-prop-collection></select></label><div class="world-pictures" data-props></div><button class="creation-button" data-private-prop>Add my art</button>
        <section data-placement hidden><label>Move <select data-selected></select></label>
          <label>Side to side <input data-field="x" type="range" min="0" max="100"></label>
          <label>Up and down <input data-field="y" type="range" min="0" max="100"></label>
          <label>Size <input data-field="size" type="range" min="5" max="100"></label>
          <label>Layer <select data-plane><option value="back">Behind characters</option><option value="front">In front</option></select></label>
          <button class="creation-button" data-remove>Remove decoration</button>
        </section>
      </div></div><p role="status" aria-live="polite" data-status></p>`;
  const get=<T extends HTMLElement=HTMLElement>(selector:string)=>dialog.querySelector<T>(selector)!;
  const canvas=get<HTMLCanvasElement>('canvas');
  const stage=new CreationStage(canvas,host.privateArt,message=>{get('[data-status]').textContent=message;});
  let selected='', epoch=0, pickerEpoch=0, busy=false, lastBackdrop='';
  const propCollection=get<HTMLSelectElement>('[data-prop-collection]');
  propCollection.replaceChildren(...PAINTED_BACKDROPS.map(world=>new Option(world.label,world.id)),new Option('Jems collection','earlier'));
  function renderProps(){
    const ids=paintedWorld(propCollection.value)?.props;
    const props=ids?WORLD_PROPS.filter(item=>ids.includes(item.id)):EARLIER_PROPS;
    get('[data-props]').replaceChildren(...props.map(asset=>imageButton(asset,false)));
    const current=host.scene();
    const full=current && worldEditorView(current).decorations.length>=WORLD_DECORATION_LIMIT;
    for(const button of get('[data-props]').querySelectorAll('button'))button.disabled=!!full;
  }
  propCollection.onchange=renderProps;
  const speaker=createReadAloudControl({text:()=>['Make your world. Choose a backdrop. Add a decoration, then tap the picture to place it.',get('[data-status]').textContent].filter(Boolean).join(' '),canRead:()=>dialog.open&&host.current()});
  get('header').insertBefore(speaker.element,get('[data-done]'));
  let disposePicker:(()=>void)|undefined;
  function clearPicker() {
    pickerEpoch++;
    disposePicker?.(); disposePicker=undefined;
    get('[data-library]').replaceChildren(); get('[data-choices]').hidden=true;
  }
  function close() {
    epoch++; clearPicker(); dialog.close(); dialog.removeAttribute('aria-busy'); stage.clear(); selected=''; lastBackdrop=''; busy=false; speaker.stop();
    get('[data-selected]').replaceChildren(); canvas.setAttribute('aria-label','World preview');
    get('[data-placement]').hidden=get('[data-hint]').hidden=true;
    get('[data-status]').textContent='';
  }
  dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  dialog.addEventListener('close',()=>{if(!dialog.open && !get('[data-choices]').hidden)clearPicker();});
  get('[data-done]').onclick=close;
  function refresh(){
    const scene=host.scene();if(!dialog.open||!scene)return;
    stage.render(scene,new SceneEngine(scene).snapshot());
    const world=worldEditorView(scene);
    canvas.setAttribute('aria-label',(worldAsset(world?.backdrop??'')?.label??(world.backdrop.startsWith('art:')?'My art backdrop':'Classic world'))+
      '. '+(world?.decorations.map(d=>d.name).join(', ')??''));
    const painted=paintedWorld(world?.backdrop??'');
    get('[data-layers]').hidden=!painted;
    for(const input of dialog.querySelectorAll<HTMLInputElement>('[data-layer]'))input.checked=world?.[input.dataset.layer as 'middle'|'foreground']!==false;
    if(lastBackdrop!==(world?.backdrop??'classic')){
      lastBackdrop=world?.backdrop??'classic';propCollection.value=painted?.id??'earlier';renderProps();
    }
    const objects=world?.decorations??[];
    if(!objects.some(d=>d.id===selected))selected=objects.at(-1)?.id??'';
    const placement=objects.find(d=>d.id===selected);
    get('[data-placement]').hidden=get('[data-hint]').hidden=!placement;
    const select=get<HTMLSelectElement>('[data-selected]');
    select.replaceChildren(...objects.map((d,index)=>new Option(`${index+1}. ${d.name}`,d.id))); select.value=selected;
    for(const button of dialog.querySelectorAll<HTMLButtonElement>('[data-backdrop-id]'))button.setAttribute('aria-pressed',String(button.dataset.backdropId===world?.backdrop));
    const fit=get<HTMLSelectElement>('[data-fit]');fit.value=world?.fit??'cover';fit.disabled=!world;
    for(const button of dialog.querySelectorAll<HTMLButtonElement>('[data-props] button,[data-private-prop]'))button.disabled=objects.length>=WORLD_DECORATION_LIMIT;
    if(!placement)return;
    for(const input of dialog.querySelectorAll<HTMLInputElement>('[data-field]'))input.value=String(placement[input.dataset.field as 'x'|'y'|'size']);
    get<HTMLSelectElement>('[data-plane]').value=placement.plane;
  }
  async function edit(change:Change) {
    if(busy||!dialog.open||!host.current())return;
    const token=epoch; busy=true; dialog.setAttribute('aria-busy','true');speaker.stop();
    try{
      await host.mutate(change);
      if(token===epoch){get('[data-status]').textContent='World saved in this draft.';refresh();}
    }catch(error){if(token===epoch){get('[data-status]').textContent=(error as Error).message;refresh();}}
    finally{if(token===epoch){busy=false;dialog.removeAttribute('aria-busy');}}
  }
  function add(world:SceneWorld,assetId:string,name:string) {
    if(world.decorations.length>=WORLD_DECORATION_LIMIT)throw Error('Remove a decoration to make room.');
    selected=crypto.randomUUID();
    world.decorations.push({id:selected,assetId,name:name.slice(0,60),x:50,y:74,size:24,plane:'back'});
  }
  function imageButton(asset:{id:string;url:string;label:string},backdrop:boolean) {
    const b=document.createElement('button');b.className='world-picture';b.type='button';
    if(backdrop)b.dataset.backdropId=asset.id;else b.dataset.propId=asset.id;
    const img=document.createElement('img');img.src=asset.url;img.alt='';
    const label=document.createElement('span');label.textContent=asset.label;b.append(img,label);
    b.onclick=()=>{clearPicker();void edit(world=>{if(backdrop){world.backdrop=asset.id;world.fit='cover';delete world.middle;delete world.foreground;}else add(world,asset.id,asset.label);});};
    return b;
  }
  get('[data-worlds]').append(...PAINTED_BACKDROPS.map(asset=>imageButton(asset,true)));
  get('[data-earlier]').append(...EARLIER_BACKDROPS.map(asset=>imageButton(asset,true)));
  for(const input of dialog.querySelectorAll<HTMLInputElement>('[data-layer]'))input.onchange=()=>{
    const plane=input.dataset.layer as 'middle'|'foreground', visible=input.checked;
    void edit(world=>{world[plane]=visible;});
  };
  function placement(change:(decoration:WorldDecoration)=>void) {
    const id=selected;return edit(world=>{const d=world.decorations.find(item=>item.id===id);if(d)change(d);});
  }
  get('[data-selected]').onchange=e=>{selected=(e.target as HTMLSelectElement).value;refresh();};
  for(const field of dialog.querySelectorAll<HTMLInputElement>('[data-field]'))field.onchange=()=>{
    const key=field.dataset.field as 'x'|'y'|'size',value=field.valueAsNumber;
    void placement(d=>{d[key]=value;});
  };
  get('[data-plane]').onchange=e=>{const plane=(e.target as HTMLSelectElement).value as WorldDecoration['plane'];void placement(d=>{d.plane=plane;});};
  get('[data-fit]').onchange=e=>{const fit=(e.target as HTMLSelectElement).value as SceneWorld['fit'];void edit(world=>{world.fit=fit;});};
  get('[data-remove]').onclick=()=>{const id=selected;void edit(world=>{world.decorations=world.decorations.filter(item=>item.id!==id);});};
  canvas.onclick=e=>{if(!selected)return;const bounds=canvas.getBoundingClientRect();void placement(d=>{
    d.x=Math.max(0,Math.min(100,Math.round((e.clientX-bounds.left)/bounds.width*100)));
    d.y=Math.max(0,Math.min(100,Math.round((e.clientY-bounds.top)/bounds.height*100)));
  });};
  async function choose(kind:'backdrop'|'decoration'|'saved') {
    clearPicker();
    const ticket=pickerEpoch,current=()=>ticket===pickerEpoch&&dialog.open&&host.current();
    const box=get('[data-library]');
    get('[data-choice-title]').textContent=kind==='saved'?'Use a saved world':kind==='backdrop'?'Choose your backdrop':'Choose a decoration';
    get('[data-choices]').hidden=false;
    const hide=()=>{if(current())clearPicker();};
    try{
      if(kind==='saved') {
        const list=host.keptScenery();
        box.append(list);list.open=true;
      } else {
        const dispose=await host.chooseArt(box,current,async(id,name)=>{
          if(!current())return;
          await edit(world=>{if(kind==='backdrop'){world.backdrop=id;world.fit='contain';delete world.middle;delete world.foreground;}else add(world,id,name);});hide();
        });
        if(current())disposePicker=dispose;
        else dispose?.();
      }
    }catch(error){if(current())get('[data-status]').textContent=(error as Error).message;}
  }
  get('[data-saved]').onclick=()=>void choose('saved');
  get('[data-backdrop]').onclick=()=>void choose('backdrop');
  get('[data-private-prop]').onclick=()=>void choose('decoration');
  return {dialog,close,refresh,open(){if(!dialog.open){clearPicker();dialog.showModal();refresh();}}};
}
