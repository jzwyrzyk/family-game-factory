import {saveDrawing, type Drawing} from '../assets/private-drawings';
import {drawOnTablet} from './paint';
import './picker-dialog.css';

/** Keep the destination mounted while the child works. Every async callback is
 * scoped to the initiating profile and the live destination. */
export function createPickerArtwork(owner:string, current:()=>boolean):Promise<Drawing|null> {
  const dialog=document.createElement('dialog');
  dialog.className='creative-picker-dialog creative-picker-create';
  dialog.setAttribute('aria-label','Add my art');
  dialog.innerHTML='<h2>Add my art</h2><div class="creative-picker-actions"><button type="button" data-draw>Draw here</button><button type="button" data-upload>Upload a drawing</button><button type="button" data-camera>Take a photo</button></div><p role="status"></p><button type="button" data-close>Back</button>';
  const find=(selector:string)=>dialog.querySelector<HTMLButtonElement>(selector)!;
  const status=dialog.querySelector('p')!;
  const allowed=()=>current()&&String((window as any).FG?.store.current().id)===owner;
  if(!allowed())return Promise.resolve(null);
  return new Promise(resolve=>{
    let saved:Drawing|null=null;
    let writing=false;
    const alive=()=>allowed()&&dialog.open;
    const check=()=>{if(!allowed()&&dialog.open)dialog.close();};
    window.addEventListener('factory-profile',check);
    window.addEventListener('factory-page',check);
    dialog.addEventListener('close',()=>{
      window.removeEventListener('factory-profile',check);
      window.removeEventListener('factory-page',check);
      dialog.remove();
      resolve(allowed()?saved:null);
    },{once:true});
    const close=find('[data-close]');
    close.onclick=()=>{if(!writing)dialog.close();};
    dialog.oncancel=e=>{if(writing)e.preventDefault();};
    find('[data-draw]').onclick=async()=>{
      try{
        await drawOnTablet(owner,item=>{if(alive()){saved=item;dialog.close();}},alive);
      }catch(e){if(alive())status.textContent=(e as Error).message;}
    };
    const beta=document.documentElement.dataset.privateBeta==='true';
    for(const action of ['upload','camera']){
      const button=find('[data-'+action+']');
      if(beta){button.hidden=true;continue;}
      const input=document.createElement('input');
      input.type='file';input.accept='image/png,image/jpeg';input.hidden=true;
      if(action==='camera')input.setAttribute('capture','environment');
      dialog.append(input);
      button.onclick=()=>{if(alive()&&!writing)input.click();};
      input.onchange=async()=>{
        const file=input.files?.[0];
        if(!alive()||writing||!file)return;
        writing=true;
        for(const control of dialog.querySelectorAll('button'))control.disabled=true;
        try{
          saved=await saveDrawing(owner,file.name.replace(/\.[^.]+$/,'')||'My drawing',file,undefined,alive);
          if(alive())dialog.close();
        }catch(e){if(alive())status.textContent=(e as Error).message;}
        finally{writing=false;input.value='';for(const control of dialog.querySelectorAll('button'))control.disabled=false;}
      };
    }
    if(beta)status.textContent='A grown-up can add a reviewed photo in Family controls.';
    document.body.append(dialog);dialog.showModal();
  });
}
