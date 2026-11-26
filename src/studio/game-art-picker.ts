import {listCreativeAssets, mountCreativeAssetPicker, type CreativeAssetChoice} from '../drawing/creative-assets';
import {createPickerArtwork} from '../drawing/picker-create';

interface Options {
  owner:string;
  current:()=>boolean;
  rally:boolean;
  existing:boolean;
}

/** Selecting a thumbnail previews the choice. Opening a new game or keeping
 * a replacement vehicle requires an explicit second action. */
export async function chooseGameArtwork({owner,current,rally,existing}:Options):Promise<CreativeAssetChoice|'library'|null>{
  let choices=await listCreativeAssets(owner,current);
  if(!current())return null;
  const dialog=document.createElement('dialog');
  dialog.className='creative-picker-dialog';dialog.setAttribute('aria-label','Choose game artwork');
  dialog.innerHTML='<h2></h2><p data-hint></p><div data-picker></div><p role="status"></p><div class="creative-picker-actions"><button type="button" data-confirm hidden></button><button type="button" data-library>Open My Art</button><button type="button" data-close>Back</button></div>';
  dialog.querySelector('h2')!.textContent=rally?'Choose your Rally car':'Make a picture hunt';
  dialog.querySelector('[data-hint]')!.textContent=rally?'Choose a saved car with wheels.':existing?'Your picture can star in a separate local game.':'Find your drawing in a new game. Your idea stays here.';
  const status=dialog.querySelector<HTMLElement>('[role=status]')!,confirm=dialog.querySelector<HTMLButtonElement>('[data-confirm]')!;
  let selected:CreativeAssetChoice|null=null;
  let cleanup:(()=>void)|undefined;
  const choose=(choice:CreativeAssetChoice)=>{
    selected=choice;status.textContent='Selected '+choice.label+'.';
    confirm.hidden=false;confirm.textContent=rally?'Keep this car version':'Start my picture hunt';
    confirm.focus();
  };
  const reason=(choice:CreativeAssetChoice)=>rally&&choice.rigKind!=='car'?'Needs a saved car design':undefined;
  const alive=()=>dialog.open&&current();
  const render=()=>{
    cleanup?.();
    cleanup=mountCreativeAssetPicker(dialog.querySelector('[data-picker]')!,choices,{
      onChoose:choose,compatibility:reason,onCreate:async()=>{
        try{
          const saved=await createPickerArtwork(owner,alive);
          if(!saved||!alive())return;
          choices=await listCreativeAssets(owner,alive);
          if(!alive())return;
          render();
          const created=choices.find(choice=>choice.drawingId===saved.id&&!choice.rigId);
          if(created&&!reason(created))choose(created);
          else {selected=null;confirm.hidden=true;status.textContent='Picture saved. Add wheels in My Art to use it in Rally.';}
        }catch(e){if(alive())status.textContent=(e as Error).message;}
      },
    });
  };
  return new Promise(resolve=>{
    let result:CreativeAssetChoice|'library'|null=null;
    confirm.onclick=()=>{if(alive()&&selected){result=selected;dialog.close();}};
    dialog.querySelector<HTMLButtonElement>('[data-library]')!.onclick=()=>{if(alive()){result='library';dialog.close();}};
    dialog.querySelector<HTMLButtonElement>('[data-close]')!.onclick=()=>dialog.close();
    const check=()=>{if(dialog.open&&!current())dialog.close();};
    for(const ev of ['factory-page','factory-profile','factory-learning-active'])window.addEventListener(ev,check);
    dialog.addEventListener('close',()=>{
      cleanup?.();dialog.remove();
      for(const ev of ['factory-page','factory-profile','factory-learning-active'])window.removeEventListener(ev,check);
      resolve(current()?result:null);
    },{once:true});
    document.body.append(dialog);dialog.showModal();render();
  });
}
