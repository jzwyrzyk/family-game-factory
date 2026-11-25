import {isEarlyGrade} from '../grades';
import {earlyInstruction} from './audio';

const firstActions:Record<string,string>={
 factory:'Look at the gem. Tap the basket where it belongs.',
 mining:'Move to a gem. Bring it back to the bucket.',
 dragon:'Tap Start Game. Help the dragon protect the island.',
 buckets:'Tap the arrow to begin. Choose a bucket for your hero.',
 hill:'Tap Let’s drive. Hold the pedal to move.',
 moon:'Move toward a donut. Tap Jump to reach it.',
 robot:'Tap an arrow to give the robot a step. Tap Run to try it.'
};

let guide:ReturnType<typeof earlyInstruction>|null=null;
export function closeGameDirections(){guide?.dispose();guide=null;}
export function openGameDirections(id:string,config:Record<string,unknown>|undefined,studio:boolean){
 closeGameDirections();
 const FG=(window as any).FG,profile=FG.store.current();
 if(!isEarlyGrade(profile.grade))return;
 const message=id==='gum'?(config?.originalRules?'Tap a piece to add it to your build.':'Tap a part. Then tap the place where it fits.'):firstActions[id];
 if(!message)return;
 const destination=studio?document.querySelector('#studioMore .studio-more-actions'):document.querySelector('#game-control-hint')?.parentElement;
 if(!destination)return;
 const read:ReturnType<typeof earlyInstruction>=earlyInstruction(()=>message,String(profile.id),()=>guide===read&&FG.store.current()===profile&&!FG.learning.active,undefined);
 guide=read;read.element.dataset.earlyGameDirections=id;destination.prepend(read.element);
}
window.addEventListener('factory-learning-active',event=>{if((event as CustomEvent).detail===true)guide?.stop();});
window.addEventListener('factory-profile-changing',closeGameDirections);
window.addEventListener('pagehide',closeGameDirections);
