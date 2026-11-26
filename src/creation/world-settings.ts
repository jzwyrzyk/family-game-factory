import {listCreativeAssetChoices} from '../assets/creative-library';
import {renderCreativePicker} from '../assets/creative-picker';
import {SCENE_WORLDS, type CreationProject, type SceneWorld} from './model';

/** A world is a picture behind the stage. It never receives an actor or a program. */
export function worldSettings(host:HTMLElement, dialog:HTMLDialogElement, actions:{
  owner():string;
  isCurrent():boolean;
  picture(id:string):HTMLElement;
  choose(world:SceneWorld | undefined, background?:CreationProject['background'], current?:()=>boolean, asPlacement?:boolean):Promise<boolean>;
}) {
  host.innerHTML = `<label>World <select id="creationBackground" aria-label="World"></select></label>
    <img id="creationWorldPreview" width="112" height="63" alt="" hidden>
    <button type="button" id="creationWorldFromArt" class="creation-button">Use my artwork</button>
    <label id="creationWorldFramingLabel">Picture size <select id="creationWorldFraming"><option value="fit">Show whole picture</option><option value="fill">Fill the stage</option></select></label>`;
  const select = host.querySelector<HTMLSelectElement>('#creationBackground')!;
  const preview = host.querySelector<HTMLImageElement>('#creationWorldPreview')!;
  const frame = host.querySelector<HTMLSelectElement>('#creationWorldFraming')!;
  const frameLabel = frame.closest('label')!;
  for (const world of SCENE_WORLDS) select.add(new Option(world.label,world.id));
  const classic = document.createElement('optgroup');
  classic.label = 'Classic worlds';
  for (const [id,label] of Object.entries({meadow:'Sunny meadow',sky:'Cloud country',night:'Starry night',workshop:'Dream workshop'})) {
    classic.append(new Option(label,id));
  }
  select.append(classic);
  const privateOption = new Option('My picture','private');
  const useArt = host.querySelector<HTMLButtonElement>('#creationWorldFromArt')!;
  const controls = dialog.querySelector<HTMLElement>('[data-world-filters]')!;
  const grid = dialog.querySelector<HTMLElement>('[data-world-choices]')!;
  const message = dialog.querySelector<HTMLElement>('[role=status]')!;
  let epoch = 0, scene:CreationProject | undefined;
  function close(){
    epoch++;
    if (dialog.open) dialog.close();
    controls.replaceChildren(); grid.replaceChildren(); message.textContent='';
  }
  dialog.querySelector('button')!.onclick = close;
  dialog.addEventListener('close',()=>{controls.replaceChildren(); grid.replaceChildren(); message.textContent='';});
  async function open(asPlacement = false) {
    if (!actions.isCurrent() || !scene) return;
    const token = ++epoch, owner = actions.owner(), projectId = scene.id;
    const current = () => token === epoch && dialog.open && owner === actions.owner() && actions.isCurrent() && scene?.id === projectId;
    dialog.showModal();
    message.textContent = 'Opening My Art…';
    try {
      const choices = (await listCreativeAssetChoices(owner,current)).filter(choice=>choice.representation==='image');
      if (!current()) return;
      if (!choices.length) {message.textContent='Draw a picture in My Art to use it here.'; return;}
      renderCreativePicker(controls,grid,message,choices,choice=>{
        const button = document.createElement('button');
        button.type='button'; button.className='creation-character-choice';
        button.dataset.worldArt=choice.assetId;
        const label=document.createElement('strong'); label.textContent=choice.label;
        button.append(actions.picture(choice.assetId),label);
        button.onclick=async()=>{
          if(!current()) return;
          const applied=await actions.choose({assetId:choice.assetId,framing:'fit'},undefined,current,asPlacement);
          if(current() && applied) close();
          else if(current()) message.textContent='Could not open that picture. Choose another or restore it in My Art.';
        };
        return button;
      });
    } catch(error){if(current())message.textContent=(error as Error).message;}
  };
  useArt.onclick = () => open();
  select.onchange = async () => {
    const assetId = select.value;
    if(SCENE_WORLDS.some(world=>world.id===assetId)) await actions.choose({assetId,framing:'fill'});
    else if(assetId!=='private') await actions.choose(undefined,assetId as CreationProject['background']);
  };
  frame.onchange = async () => {
    if(scene?.world) await actions.choose({...scene.world,framing:frame.value==='fill'?'fill':'fit'});
  };
  return {
    close, open,
    render(project:CreationProject){
      scene=project;
      const world=project.world;
      const bundled = SCENE_WORLDS.find(item => item.id === (world?.assetId ?? project.background));
      const own = world && !bundled;
      preview.hidden = !bundled?.preview;
      if (bundled?.preview) {
        if (preview.getAttribute('src') !== bundled.preview) preview.src = bundled.preview;
      } else preview.removeAttribute('src');
      if(own) select.append(privateOption); else privateOption.remove();
      select.value=own?'private':world?.assetId??project.background;
      frameLabel.hidden=!world;
      frame.value=world?.framing??'fit';
    },
  };
}
