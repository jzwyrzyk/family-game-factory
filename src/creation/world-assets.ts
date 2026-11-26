import {ILLUSTRATED_WORLDS, WORLD_PROPS} from './illustrated-art';
// IDs pin the illustrated edition used by a saved scene. Keep an older entry
// and its original file when introducing a replacement illustration.
export const EARLIER_BACKDROPS = [
  {id:'world:jem-gardens:v1', label:'Jem gardens', kind:'image', url:'./jems-journey/background.webp'},
  {id:'world:cloud-islands:v1', label:'Cloud islands', kind:'image', url:'./art/mind-your-jems/scene-sky.webp'},
  {id:'world:gem-factory:v1', label:'Gem Factory', kind:'image', url:'./gem-factory-workshop.webp'},
] as const;

export const EARLIER_PROPS = [
  {id:'prop:jem-chest:v1', label:'Jem chest', kind:'image', url:'./jems-art/spot_safe_storage.webp'},
  {id:'prop:coral-jem:v1', label:'Coral jem', kind:'image', url:'./jems-art/gem_coral.webp'},
  {id:'prop:mine-cart:v1', label:'Mine cart', kind:'image', url:'./art/mind-your-jems/cart-empty.webp'},
] as const;

export const PAINTED_BACKDROPS = ILLUSTRATED_WORLDS.map(world => ({
  id:world.id, label:world.label, kind:'image' as const, url:world.preview,
}));
export const WORLD_BACKDROPS = [...PAINTED_BACKDROPS, ...EARLIER_BACKDROPS];
export const WORLD_DECORATIONS = [...WORLD_PROPS.map(prop=>({...prop, kind:'image' as const})), ...EARLIER_PROPS];
export const starterWorldIds = {dragon:'world-forest-v1', robot:'world-workshop-v1', buckets:'world-cloud-v1', blank:'world-moon-v1'} as const;
export const paintedWorld = (id:string) => ILLUSTRATED_WORLDS.find(world=>world.id===id);
const paints = ['background','middle','foreground'] as const;
export type WorldPaint = typeof paints[number];
const layers = ILLUSTRATED_WORLDS.flatMap(world=>paints.map(plane=>({
  id:world.id+':'+plane, label:world.label+' '+plane, kind:'image' as const, url:world[plane],
})));
const artById = new Map([...WORLD_BACKDROPS,...WORLD_DECORATIONS,...layers].map(asset=>[asset.id,asset]));
export const worldAsset = (id:string) => artById.get(id);

/** Scene identity stores the edition. The preview is never used on stage. */
export function worldLayerIds(world:{backdrop:string;middle?:boolean;foreground?:boolean}) {
  if(!paintedWorld(world.backdrop))return [world.backdrop];
  return paints.filter(plane=>plane==='background'||world[plane]!==false).map(plane=>world.backdrop+':'+plane);
}
export const WORLD_DECORATION_LIMIT = 8;

const classicWorlds = {meadow:'world:classic-meadow:v1', night:'world:classic-night:v1', workshop:'world:classic-workshop:v1', sky:'world:classic-sky:v1'} as const;
export const classicWorldId = (background:keyof typeof classicWorlds) => classicWorlds[background];
export function classicBackground(id:unknown) {
  return (Object.keys(classicWorlds) as (keyof typeof classicWorlds)[]).find(name => classicWorlds[name] === id);
}
