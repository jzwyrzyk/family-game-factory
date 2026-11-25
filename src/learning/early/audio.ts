import {createReadAloudControl} from '../../speech/read-aloud-control';
import {setIconLabel} from '../../brand/icons';

const mutedProfiles=new Set<string>();
export const earlySoundMuted=(owner:string)=>mutedProfiles.has(owner);
/** Start after browser activation. Cancel, error and blocked playback cannot unlock a scored answer. */
export function earlyInstruction(text:()=>string,owner:string,canRead:()=>boolean,delivered:((mode:'audio'|'grown-up')=>void)|undefined) {
 let heard=false;
 const row=createReadAloudControl({text,canRead,label:'Hear it again',deviceOnly:true,
  onDelivered:()=>{heard=true;delivered?.('audio');},
  onUnavailable:()=>{helper.hidden=false;}});
 const helper=document.createElement('button');helper.type='button';helper.hidden=true;
 setIconLabel(helper,'parent','A grown-up read the instruction');
 helper.onclick=()=>{if(!canRead())return;row.stop();heard=true;delivered?.('grown-up');helper.hidden=true;row.notice.textContent='Ready to try.';};
 const mute=document.createElement('button');mute.type='button';
 function refresh(){
  const muted=mutedProfiles.has(owner);setIconLabel(mute,muted?'volume':'pause',muted?'Turn sound on':'Mute');
  mute.setAttribute('aria-pressed',String(muted));helper.hidden=!muted;
 }
 mute.onclick=()=>{if(mutedProfiles.delete(owner)){refresh();row.button.click();}else{mutedProfiles.add(owner);row.stop();refresh();}};
 refresh();row.element.append(mute);if(delivered)row.element.append(helper);
 queueMicrotask(()=>{if(canRead()&&row.element.isConnected&&!mutedProfiles.has(owner)&&navigator.userActivation?.hasBeenActive)row.button.click();});
 return {...row,ready:()=>{if(heard)return true;row.notice.textContent='Listen first, or ask a grown-up to read the instruction.';helper.hidden=false;return false;}};
}
