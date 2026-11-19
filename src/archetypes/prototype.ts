/**
 * Research-only shared logic prototype. The SAME collision primitives are run
 * against different authored scene data. It is NOT an integrated player-facing
 * game, sandbox replacement, asset loader, physics engine or release artifact.
 */
import {archetypeById} from './catalog';
export type PrototypeMechanic='reflect-projectile'|'health-damage'|'collect-item'|'grow-on-collect';
export type ActorRole='avatar'|'enemy'|'shield'|'projectile'|'collectible';
export interface ActorSpec {readonly id:string;readonly role:ActorRole;readonly owner?:string;readonly vx?:number;readonly hp?:number;readonly scale?:number}
export interface PrototypeRecipe {
 readonly id:string;readonly archetypeId:string;readonly mechanics:readonly PrototypeMechanic[];
 readonly actors:readonly ActorSpec[];readonly goal:'defeat-enemy'|'collect-all';
}
export interface ActorState extends ActorSpec {
 readonly active:boolean;readonly hp:number;readonly vx:number;readonly scale:number;readonly score:number;
}
export interface PrototypeState {
 readonly recipeId:string;readonly archetypeId:string;readonly mechanics:readonly PrototypeMechanic[];
 readonly actors:Readonly<Record<string,ActorState>>;
 readonly goal:PrototypeRecipe['goal'];readonly phase:'playing'|'won'|'lost';
 readonly events:readonly string[];
}
const allowed=new Set<PrototypeMechanic>(['reflect-projectile','health-damage','collect-item','grow-on-collect']);
const safeId=(s:unknown):s is string=>typeof s==='string'&&/^[a-z][a-z0-9-]{0,39}$/.test(s);
const finite=(v:number)=>Number.isFinite(v)&&Math.abs(v)<=1000;
const has=(state:PrototypeState,k:PrototypeMechanic)=>state.mechanics.includes(k);
export function makePrototype(recipe:PrototypeRecipe):PrototypeState {
 if(!recipe||!safeId(recipe.id)||!archetypeById.has(recipe.archetypeId)||
  !['collect-all','defeat-enemy'].includes(recipe.goal)||
  !Array.isArray(recipe.mechanics)||recipe.mechanics.length>4||
  recipe.mechanics.length!==new Set(recipe.mechanics).size||recipe.mechanics.some(x=>!allowed.has(x))||
  !Array.isArray(recipe.actors)||recipe.actors.length<2||recipe.actors.length>30)throw Error('PROTOTYPE_RECIPE_INVALID');
 const actors:Record<string,ActorState>=Object.create(null);
 for(const actor of recipe.actors){
  if(!safeId(actor.id)||Object.hasOwn(actors,actor.id)||
   !['avatar','enemy','shield','projectile','collectible'].includes(actor.role)||
   (actor.owner!==undefined&&!safeId(actor.owner))||
   !finite(actor.vx??0)||!finite(actor.hp??1)||!finite(actor.scale??1)||
   (actor.hp??1)<0||(actor.scale??1)<=0||(actor.scale??1)>3)throw Error('PROTOTYPE_ACTOR_INVALID');
  actors[actor.id]={...actor,active:true,vx:actor.vx??0,hp:actor.hp??1,scale:actor.scale??1,score:0};
 }
 if(Object.values(actors).filter(x=>x.role==='avatar').length!==1||
  !Object.values(actors).some(x=>recipe.goal==='collect-all'?x.role==='collectible':x.role==='enemy')||
  Object.values(actors).some(x=>x.owner&&!Object.hasOwn(actors,x.owner))||
  (recipe.goal==='collect-all'&&!recipe.mechanics.includes('collect-item'))||
  (recipe.goal==='defeat-enemy'&&!recipe.mechanics.includes('health-damage'))||
  (recipe.mechanics.includes('grow-on-collect')&&!recipe.mechanics.includes('collect-item')))throw Error('PROTOTYPE_SCENE_INCOMPLETE');
 return {recipeId:recipe.id,archetypeId:recipe.archetypeId,mechanics:Object.freeze([...recipe.mechanics]),actors,goal:recipe.goal,phase:'playing',events:[]};
}
export function collide(state:PrototypeState,firstId:string,secondId:string):PrototypeState {
 if(!Object.hasOwn(state.actors,firstId)||!Object.hasOwn(state.actors,secondId)||firstId===secondId)throw Error('PROTOTYPE_COLLISION_INVALID');
 if(state.phase!=='playing')return state;
 const actors:Record<string,ActorState>={...state.actors};
 const first=actors[firstId],second=actors[secondId];
 if(!first.active||!second.active)return state;
 const findPair=(one:ActorRole,two:ActorRole):[ActorState,ActorState]|null=>
  first.role===one&&second.role===two?[first,second]:first.role===two&&second.role===one?[second,first]:null;
 const events:string[]=[];
 let phase=state.phase;
 const reflected=findPair('shield','projectile');
 if(reflected&&has(state,'reflect-projectile')){
  const [shield,shot]=reflected;
  if(shield.owner&&shot.owner!==shield.owner){
   actors[shot.id]={...shot,owner:shield.owner,vx:shot.vx===0?1:-shot.vx};
   events.push('reflected:'+shot.id);
  }
 }else{
  const pickup=findPair('avatar','collectible');
  const hit=findPair('projectile','enemy')||findPair('projectile','avatar');
  if(pickup&&has(state,'collect-item')){
   const [avatar,item]=pickup;
   actors[item.id]={...item,active:false};
   actors[avatar.id]={...avatar,score:avatar.score+1,scale:has(state,'grow-on-collect')?Math.min(3,Math.round((avatar.scale+0.2)*100)/100):avatar.scale};
   events.push('collected:'+item.id);
   if(state.goal==='collect-all'&&Object.values(actors).filter(x=>x.role==='collectible').every(x=>!x.active)){phase='won';events.push('goal:won');}
  }else if(hit&&has(state,'health-damage')){
   const [shot,target]=hit;
   if(shot.owner!==target.id){
    actors[shot.id]={...shot,active:false};
    actors[target.id]={...target,hp:Math.max(0,target.hp-1)};
    events.push('hit:'+target.id);
    if(target.hp<=1){
     if(target.role==='avatar'){phase='lost';events.push('goal:lost');}
     else if(state.goal==='defeat-enemy'&&Object.values(actors).filter(x=>x.role==='enemy').every(x=>x.id===target.id||x.hp<=0)){
      phase='won';events.push('goal:won');
     }
    }
   }
  }
 }
 return {...state,actors,phase,events};
}
