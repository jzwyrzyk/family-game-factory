/**
 * Read-only compatibility map between the proposed archetypes and the six
 * existing native Jems games. Never converts a novel idea into a native game.
 */
import {manifests,validateConfig} from '../runtime/manifests';
import type {GameId,Mechanics} from '../runtime/types';
import {archetypeById,mechanicById} from './catalog';

export interface NativeLink {
 readonly game:GameId; readonly archetypeIds:readonly string[];
 /** Names of existing validated config fields that have a related library concept. */
 readonly knobs:Readonly<Record<string,string>>;
 readonly caveat:string;
}
const rawNativeLinks:NativeLink[]=[
 {game:'moon',archetypeIds:['endless-runner'],knobs:{donutGoal:'collect-item',moonGravity:'gravity',meteorRate:'runner-scroll',bouncePads:'bounce'},caveat:'An example runner, not a general platformer constructor.'},
 {game:'robot',archetypeIds:['grid-navigation','route-programming'],knobs:{robotSpeed:'grid-step',showTrail:'route-playback',portalEnabled:'paired-portals'},caveat:'Robot missions are authored, not arbitrary generated levels.'},
 {game:'gum',archetypeIds:['drag-creation','physical-construction'],knobs:{gravity:'gravity',thrust:'launch-force',gumBudget:'joint-attach',jointStrength:'joint-break',highlightMatches:'sticker-decorate',extraDecoys:'sticker-decorate'},caveat:'qualityVersion 2 is a sticker game; version 1 is physical. Never silently change game engines or saved revisions.'},
 {game:'hill',archetypeIds:['side-driving'],knobs:{enginePower:'drive-throttle',suspension:'vehicle-suspension',wheelSize:'rotating-wheel',chassisMass:'load-balance',grip:'vehicle-traction'},caveat:'This native vehicle is not a reusable driving template yet.'},
 {game:'buckets',archetypeIds:['choice-discovery'],knobs:{bucketCount:'reveal-hidden',revealSafe:'hint-reveal',splashMs:'reveal-hidden'},caveat:'The existing game has bounded choices and authored progression.'},
 {game:'dragon',archetypeIds:['projectile-defense'],knobs:{groundResilience:'health-damage',fireballCadence:'fire-projectile',shieldRadius:'shield-window',hearts:'health-damage',breathSpeed:'fire-projectile'},caveat:'Reflected attacks are not an independently installable mechanic in this native game.'}
];
export const nativeLinks:readonly NativeLink[]=Object.freeze(rawNativeLinks.map(x=>Object.freeze({...x,archetypeIds:Object.freeze([...x.archetypeIds]),knobs:Object.freeze({...x.knobs})})));
export function validateNativeLinks():void {
 if(nativeLinks.length!==6||new Set(nativeLinks.map(x=>x.game)).size!==6)throw Error('NATIVE_ARCHETYPE_LINKS_INCOMPLETE');
 for(const link of nativeLinks){
  if(link.archetypeIds.some(id=>!archetypeById.has(id)))throw Error('UNKNOWN_NATIVE_ARCHETYPE_'+link.game);
  for(const [field,mechanic] of Object.entries(link.knobs)){
   if(!manifests[link.game].mechanics.some(x=>x.key===field)||!mechanicById.has(mechanic))throw Error('NATIVE_KNOB_DRIFT_'+link.game+'_'+field);
  }
 }
}
validateNativeLinks();
export function inspectNative(game:GameId,config:Mechanics):{
 readonly game:GameId;readonly archetypeIds:readonly string[];
 readonly adjustableFields:readonly string[];readonly caveat:string;
}{
 const valid=validateConfig(game,config);
 const link=nativeLinks.find(x=>x.game===game);
 if(!link)throw Error('NATIVE_GAME_UNRECOGNIZED');
 // Only advertise knobs associated with this saved game form.
 const ids=game==='gum'?
  Number(valid.qualityVersion)===2?['drag-creation']:Number(valid.qualityVersion)===1?['physical-construction']:[]:
  [...link.archetypeIds];
 const knobs=game==='gum'&&Number(valid.qualityVersion)===2?
  ['highlightMatches','extraDecoys']:game==='gum'&&Number(valid.qualityVersion)===1?
  ['gravity','thrust','gumBudget','jointStrength','highlightMatches','extraDecoys']:
  Object.keys(link.knobs);
 return Object.freeze({game,archetypeIds:Object.freeze(ids),adjustableFields:Object.freeze(knobs),caveat:link.caveat});
}
