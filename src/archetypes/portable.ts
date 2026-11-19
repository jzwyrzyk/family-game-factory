/**
 * Portable mechanic registry, research stage ONLY.
 * This intentionally requires semantic role binding and module dependencies
 * before creating even a headless scene. It accepts no executable user code.
 * No current "trusted" or production approval is implied by the word portable.
 */
import {mechanicById} from './catalog';
import {makePrototype,type ActorRole,type PrototypeMechanic,type PrototypeRecipe,type PrototypeState} from './prototype';

export interface PrototypeModuleContract {
 readonly id:PrototypeMechanic;readonly version:'headless-v1';
 readonly requiresRoles:readonly ActorRole[];
 readonly dependsOn:readonly PrototypeMechanic[];
 readonly emits:readonly string[];
 readonly invariant:string;
}
const rule=(id:PrototypeMechanic,requiresRoles:ActorRole[],dependsOn:PrototypeMechanic[],emits:string[],invariant:string):PrototypeModuleContract=>Object.freeze({
 id,version:'headless-v1',requiresRoles:Object.freeze([...requiresRoles]),
 dependsOn:Object.freeze([...dependsOn]),emits:Object.freeze([...emits]),invariant
});
export const portablePrototypeContracts:readonly PrototypeModuleContract[]=Object.freeze([
 rule('reflect-projectile',['shield','projectile','avatar','enemy'],[],['reflected'], 'Reflected projectile reverses direction and changes owner, once per opposing shield hit'),
 rule('health-damage',['projectile','enemy','avatar'],[],['hit','goal:won','goal:lost'],'Projectile can damage a target but does not damage its current owner'),
 rule('collect-item',['avatar','collectible'],[],['collected','goal:won'],'A collectible is consumed only once and increments a score exactly once'),
 rule('grow-on-collect',['avatar','collectible'],['collect-item'],['collected'],'Avatar scale increases after a successful collection and is capped')
]);
export interface PrototypeCompilation {
 readonly schema:'headless-prototype-assembly-v1';readonly recipeId:string;
 readonly state:PrototypeState;readonly modulePins:Readonly<Record<string,'headless-v1'>>;
 readonly approvedForBrowser:false;readonly approvedForProduction:false;
}
export function compilePrototypeRecipe(recipe:PrototypeRecipe):PrototypeCompilation {
 if(!recipe||!Array.isArray(recipe.mechanics)||!Array.isArray(recipe.actors))throw Error('PORTABLE_RECIPE_INVALID');
 const roles=new Set(recipe.actors.map(a=>a.role));
 const versions:Record<string,'headless-v1'>=Object.create(null);
 for(const id of recipe.mechanics){
  const module=portablePrototypeContracts.find(m=>m.id===id);
  if(!module||mechanicById.get(id)?.maturity!=='shared-prototype')throw Error('PORTABLE_COMPONENT_UNVERIFIED');
  if(module.requiresRoles.some(role=>!roles.has(role)))throw Error('PORTABLE_ROLE_MISSING_'+id);
  if(module.dependsOn.some(dep=>!recipe.mechanics.includes(dep)))throw Error('PORTABLE_DEPENDENCY_MISSING_'+id);
  versions[id]=module.version;
 }
 const state=makePrototype(recipe);
 return Object.freeze({
  schema:'headless-prototype-assembly-v1' as const,recipeId:recipe.id,
  state,modulePins:Object.freeze(versions),approvedForBrowser:false as const,approvedForProduction:false as const
 });
}
