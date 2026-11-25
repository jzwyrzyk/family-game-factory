import {earlySoundMuted} from '../learning/early/audio';
import {setIconLabel} from '../brand/icons';
import {createReadAloudControl} from '../speech/read-aloud-control';
import {createPalPortrait,type PalsViewState} from '../pals/ui';

export const FAMILY_CREATION_LABEL='Make a game with a grown-up';
export function createEarlyHandoff(parent:()=>void,play:()=>void,code:()=>void,pals:()=>PalsViewState,owner:()=>string){
 const dialog=document.createElement('dialog');dialog.id='earlyCreationHandoff';dialog.className='early-handoff';
 dialog.setAttribute('aria-labelledby','earlyCreationTitle');
 const art=document.createElement('div'),heading=document.createElement('h2'),message=document.createElement('p');
 heading.id='earlyCreationTitle';heading.textContent=FAMILY_CREATION_LABEL;
 message.textContent='Ask your grown-up to join you. You can play or make a scene today.';
 const reader=createReadAloudControl({text:()=>heading.textContent+'. '+message.textContent,deviceOnly:true,canRead:()=>dialog.open});
 function action(label:string,icon:Parameters<typeof setIconLabel>[1],next:()=>void){
  const button=document.createElement('button');button.type='button';setIconLabel(button,icon,label);
  button.onclick=()=>{dialog.close();next();};return button;
 }
 const actions=document.createElement('div');actions.append(action('Grown-ups','parent',parent),action('Play games','play',play),action('Create a scene','grid',code));
 dialog.append(art,heading,message,reader.element,actions);document.body.append(dialog);
 dialog.addEventListener('close',()=>reader.stop());
 window.addEventListener('factory-profile-changing',()=>{if(dialog.open)dialog.close();});
 return ()=>{
  const state=pals(),profile=state.owner===owner()?state.profile:null;
  const active=profile?.preferences.showCompanion&&profile.owned.find(p=>p.id===profile.activeId);
  if(active)art.replaceChildren(createPalPortrait(active.id,active.stage,'','neutral',true));
  else {const image=document.createElement('img');image.src=new URL('jems-art/character_spark_wave.webp',document.baseURI).href;image.alt='';art.replaceChildren(image);}
  if(!dialog.open)dialog.showModal();
  if(!earlySoundMuted(owner())&&navigator.userActivation?.hasBeenActive)reader.button.click();
 };
}
