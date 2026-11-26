import {validateDrawingMotion, type DrawingMotion as PresetMotion} from '../drawing/animation-path';
import {WORLD_PLATES} from './movement-worlds';
import { ILLUSTRATED_WORLDS, WORLD_PROPS } from './illustrated-art';

/** The local, serializable Creation Lab language. It contains data, never source code. */
export const CREATION_SCHEMA = 'jems.creation.v1' as const;
export const CREATION_TICK_MS = 10;
export const CREATION_LIMITS = {
  actors: 16, programs: 48, blocks: 300, depth: 6, variables: 24,
  repeat: 50, actionDurationMs: 10000, runDurationMs: 120000,
  instructions: 4000, events: 256, trace: 10000,
} as const;

export type CreationOrigin = 'child' | 'starter' | 'assisted';
export type SceneBackground = 'blank' | 'meadow' | 'night' | 'workshop' | 'sky' | typeof ILLUSTRATED_WORLDS[number]['id'];
export type SceneLayer = 'backdrop' | 'back' | 'middle' | 'front';
/** A world version pins its bundled plate and any aligned overlays. */
export interface BundledSceneWorld {
  id: string; label: string; url: string;
  middle?: string; foreground?: string; preview?: string; props?: readonly string[];
}
const previousPlates = [
  {id:'world:jem-gardens:v1', label:'Jem gardens', url:'./jems-journey/background.webp'},
  {id:'world:cloud-islands:v1', label:'Cloud islands', url:'./art/mind-your-jems/scene-sky.webp'},
  {id:'world:gem-factory:v1', label:'Gem Factory', url:'./gem-factory-workshop.webp'},
  WORLD_PLATES.meadow, WORLD_PLATES.sky, WORLD_PLATES.night, WORLD_PLATES.workshop,
];
export const EARLIER_PROPS = [
  {id:'prop:jem-chest:v1', label:'Jem chest', url:'./jems-art/spot_safe_storage.webp'},
  {id:'prop:coral-jem:v1', label:'Coral jem', url:'./jems-art/gem_coral.webp'},
  {id:'prop:mine-cart:v1', label:'Mine cart', url:'./art/mind-your-jems/cart-empty.webp'},
  {id:'world-v1-flowers', label:'Flowers', url:'./assets/original-dragon/flowers.png'},
  {id:'world-v1-castle', label:'Castle', url:'./assets/original-dragon/castle.png'},
  {id:'world-v1-crystal', label:'Mint jem', url:'./jems-art/gem_mint.webp'},
];
const propIds = new Set([...EARLIER_PROPS, ...WORLD_PROPS].map(prop => prop.id));
const classicBackgrounds = {meadow:'world:classic-meadow:v1',night:'world:classic-night:v1',
  workshop:'world:classic-workshop:v1',sky:'world:classic-sky:v1'} as const;
export const SCENE_WORLDS: readonly BundledSceneWorld[] = [
  {id:'world-islands-9b2446de258a', label:'Waterfall islands', url:'./art/mind-your-jems/scene-sky.webp'},
  {id:'world-workshop-b6e81f59ab4d', label:'Gem Factory', url:'./gem-factory-workshop.webp'},
  {id:'world-terrace-1b1460063ff8', label:'Garden terrace', url:'./jems-journey/background.webp'},
  ...previousPlates,
  ...ILLUSTRATED_WORLDS.map(world => ({...world, url: world.background})),
];
export interface PinnedWorld {assetId:string; framing:'fit'|'fill'; scenery?:StageDecoration[]}
interface Decoration {id:string; assetId:string; x:number; y:number; size:number}
interface StageDecoration extends Decoration {label:string; layer:'behind'|'in-front'}
interface PercentageDecoration extends Decoration {name:string; plane:'back'|'front'}
interface StageWorld {edition:'jems.world.v1'; backdrop?:string; framing?:'fit'|'fill'; scenery?:StageDecoration[]; assetId?:never}
export interface PercentageWorld {backdrop:string; fit:'cover'|'contain'; decorations:PercentageDecoration[]; middle?:boolean; foreground?:boolean; assetId?:never}
export type SceneWorld = PinnedWorld | StageWorld | PercentageWorld;

/** Read the earlier editions without rewriting the saved scene or changing its pins. */
export function worldView(scene: Pick<CreationProject,'world'|'background'|'worldLayers'>) {
  const w = scene.world;
  let assetId: string | undefined = scene.background;
  let framing:'fit'|'fill' = 'fill';
  let middle = true, foreground = true;
  if (w && 'edition' in w) {
    assetId = w.backdrop ?? WORLD_PLATES[scene.background as keyof typeof WORLD_PLATES]?.id;
    framing = w.backdrop ? w.framing ?? 'fit' : 'fill';
  } else if (w && 'fit' in w) {
    assetId = w.backdrop; framing = w.fit === 'contain' ? 'fit' : 'fill';
    middle = w.middle !== false; foreground = w.foreground !== false;
  } else if (w) {
    assetId = w.assetId; framing = w.framing;
  }
  const classic = (Object.keys(classicBackgrounds) as (keyof typeof classicBackgrounds)[])
    .find(key => classicBackgrounds[key] === assetId);
  return {assetId, framing, classic, middle:scene.worldLayers?.middle ?? middle,
    foreground:scene.worldLayers?.foreground ?? foreground};
}

export function sceneryPlacements(scene: CreationProject) {
  const w = scene.world;
  if (!w) return [];
  if (!('decorations' in w)) return (w.scenery ?? []).map(p => ({...p,name:p.label,front:p.layer === 'in-front'}));
  if ('decorations' in w) return w.decorations.map(p => ({...p,x:p.x*scene.width/100,
    y:p.y*scene.height/100,size:p.size*scene.height/100,front:p.plane === 'front'}));
  return [];
}
/** Convert a retained world's scenery only upon an explicit edit. Historical
 * versions keep their original encoding and selected immutable image pins. */
export function editWorldPicture(project:CreationProject, picture:PinnedWorld | undefined, background?:SceneBackground) {
  const placements = sceneryPlacements(project);
  if (background) project.background = background;
  if (!placements.length) {
    if (picture) project.world = picture;
    else delete project.world;
    return;
  }
  if (!picture && project.background === 'blank') {
    project.world = {edition:'jems.world.v1',scenery:placements.map(p=>({
      id:p.id,assetId:p.assetId,label:p.name,x:p.x,y:p.y,size:p.size,layer:p.front?'in-front':'behind',
    }))};
    return;
  }
  const classic = classicBackgrounds[project.background as keyof typeof classicBackgrounds];
  project.world = {...(picture ?? {assetId:classic ?? project.background,framing:'fill'}),scenery:placements.map(p => ({
    id:p.id, assetId:p.assetId, label:p.name, x:p.x, y:p.y, size:p.size, layer:p.front?'in-front':'behind',
  }))};
}
/** The visual editor uses percent controls for every supported world edition.
 * This is an editing view. Native stage coordinates stay exact when untouched. */
export function worldEditorView(project:CreationProject):PercentageWorld {
  const {assetId,classic,framing,middle,foreground}=worldView(project);
  const backdrop=classic ? classicBackgrounds[classic] : assetId && Object.hasOwn(classicBackgrounds,assetId)
    ? classicBackgrounds[assetId as keyof typeof classicBackgrounds] : assetId ?? 'blank';
  if(project.world && 'fit' in project.world)return structuredClone({...project.world,middle,foreground});
  return {backdrop,fit:framing==='fit'?'contain':'cover',middle,foreground,
    decorations:sceneryPlacements(project).map(p=>({id:p.id,assetId:p.assetId,name:p.name,
      x:100*p.x/project.width,y:100*p.y/project.height,size:100*p.size/project.height,plane:p.front?'front':'back'}))};
}
export function applyWorldEditorView(project:CreationProject, edited:PercentageWorld) {
  const previous=worldEditorView(project), backdrop=edited.backdrop;
  const illustrated=ILLUSTRATED_WORLDS.find(world=>world.id===backdrop);
  const classic=(Object.keys(classicBackgrounds) as (keyof typeof classicBackgrounds)[]).find(key=>classicBackgrounds[key]===backdrop);
  if (illustrated) project.background=illustrated.id;
  else if(classic)project.background=classic;
  else if(backdrop==='blank')project.background='blank';
  if(backdrop!==previous.backdrop){
    const actor=project.actors.find(a=>a.layer==='backdrop');
    if(actor)actor.visible=false;
  }
  if(illustrated) project.worldLayers={middle:edited.middle!==false,foreground:edited.foreground!==false};
  else {delete project.worldLayers;delete edited.middle;delete edited.foreground;}
  if(project.world && 'decorations' in project.world && backdrop!=='blank'){
    project.world=edited;
    return;
  }
  const originals=new Map(sceneryPlacements(project).map(item=>[item.id,item]));
  const oldValues=new Map(previous.decorations.map(item=>[item.id,item]));
  const scenery=edited.decorations.map(item=>{
    const prior=originals.get(item.id),view=oldValues.get(item.id);
    return {id:item.id,assetId:item.assetId,label:item.name,
      x:prior && view?.x===item.x ? prior.x : item.x*project.width/100,
      y:prior && view?.y===item.y ? prior.y : item.y*project.height/100,
      size:prior && view?.size===item.size ? prior.size : item.size*project.height/100,
      layer:item.plane==='front'?'in-front' as const:'behind' as const};
  });
  if(backdrop==='blank'){
    if(scenery.length)project.world={edition:'jems.world.v1',scenery};
    else delete project.world;
  }else{
    project.world={assetId:backdrop,framing:edited.fit==='contain'?'fit':'fill',...(scenery.length?{scenery}:{})};
  }
}
export function addStaticScenery(project:CreationProject, assetId:string, label:string) {
  const version = worldView(project);
  const picture = version.assetId && !['blank','meadow','night','workshop','sky'].includes(version.assetId)
    ? {assetId:version.assetId,framing:version.framing} : undefined;
  editWorldPicture(project, picture);
  const world = project.world ??= {edition:'jems.world.v1'};
  if ('decorations' in world) throw Error('Choose a world for this decoration.');
  const scenery = world.scenery ??= [];
  if (scenery.length >= 8) throw Error('A world can hold eight fixed decorations.');
  scenery.push({id:crypto.randomUUID(),assetId,label,x:Math.round(project.width/2),
    y:Math.round(project.height*.65),size:100,layer:'behind'});
}
export function starterWorld(place:'islands'|'workshop'|'terrace'):SceneWorld {
  const id = {islands:SCENE_WORLDS[0].id, workshop:SCENE_WORLDS[1].id, terrace:SCENE_WORLDS[2].id}[place];
  return {assetId:id,framing:'fill'};
}
export type ComparisonOperator = 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte';
export type SceneCondition =
  | {type: 'variable'; variable: string; operator: ComparisonOperator; value: number}
  | {type: 'position'; axis: 'x' | 'y'; operator: ComparisonOperator; value: number}
  | {type: 'touching'; actorId: string};
type BlockBase = {id: string; origin?: CreationOrigin};
export type CreationBlock = BlockBase & (
  | {type: 'move'; x?: number; y?: number; dx?: number; dy?: number; durationMs?: number}
  | {type: 'animation'; motion: PresetMotion}
  | {type: 'wait'; durationMs: number}
  | {type: 'say'; text: string; durationMs: number}
  | {type: 'dance'; durationMs: number}
  | {type: 'jump'; height: number; durationMs: number}
  | {type: 'show' | 'hide'}
  | {type: 'repeat'; count: number; actions: CreationBlock[]; pathName?: string}
  | {type: 'if'; condition: SceneCondition; then: CreationBlock[]; else?: CreationBlock[]}
  | {type: 'set'; variable: string; value: number}
  | {type: 'change'; variable: string; amount: number}
  | {type: 'emit'; name: string}
);
export type SceneTrigger = {type: 'start' | 'tap'} | {type: 'event'; name: string};
export const SCENE_ROLES = ['character', 'decoration', 'scenery', 'obstacle', 'collectible', 'player', 'npc', 'vehicle', 'environment', 'background'] as const;
export type SceneRole = typeof SCENE_ROLES[number];
export interface SceneActor {
  /** The child's description of this appearance in this scene. */
  role?: SceneRole;
  id: string; name: string; assetId: string; x: number; y: number;
  creativeRole?: SceneRole;
  size?: number; visible?: boolean; layer?: SceneLayer; stackOrder?: number; angle?: number; backdropFit?: 'contain' | 'cover';
}
export interface SceneProgram {
  id: string; actorId: string; trigger: SceneTrigger; actions: CreationBlock[];
}
export interface CreationProvenance {
  createdBy: CreationOrigin;
  sourceKind?: 'curated' | 'generated' | 'creation' | 'art';
  sourceProjectId?: string; sourceRevisionId?: string;
  sourceSessionId?: string; sourceGameId?: string;
}
export interface CreationProject {
  schema: typeof CREATION_SCHEMA;
  id: string; title: string; width: number; height: number; background: SceneBackground; world?: SceneWorld;
  worldLayers?: {middle:boolean; foreground:boolean};
  actors: SceneActor[]; programs: SceneProgram[]; variables: Record<string, number>;
  provenance?: CreationProvenance;
}
export type SceneProject = CreationProject;

/** The trusted stores, portable files and recovery remappers traverse the same slots. */
export function sceneAssetSlots(scene:CreationProject): {assetId:string}[] {
  const world = scene.world;
  if (!world) return scene.actors;
  if ('edition' in world || 'decorations' in world) {
    const slots: {assetId:string}[] = [...('edition' in world ? world.scenery ?? [] : world.decorations), ...scene.actors];
    if (world.backdrop) slots.push({
      get assetId() { return world.backdrop!; },
      set assetId(value:string) { world.backdrop = value; },
    });
    return slots;
  }
  return [world, ...world.scenery ?? [], ...scene.actors];
}

const forbiddenIds = new Set(['__proto__', 'prototype', 'constructor']);
export const isCreationId = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(value) && !forbiddenIds.has(value);
/** Only private asset references have the additional hash suffix. The source
 * ID bound matches portable art restoration; ordinary creation IDs stay capped at 160. */
export interface PrivateArtReference {kind:'image'|'rig';id:string;sha256:string}
export function parsePrivateArtId(value:unknown):PrivateArtReference|null {
  if(typeof value!=='string')return null;
  const match=/^art:(image|rig):([A-Za-z0-9_-]{1,100}):([a-f0-9]{64})$/.exec(value);
  return match&&!forbiddenIds.has(match[2])?{kind:match[1] as 'image'|'rig',id:match[2],sha256:match[3]}:null;
}
const fail = (message: string): never => { throw new Error(`Creation Lab: ${message}`); };
function record(value: unknown, allowed: readonly string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(`Invalid ${label}.`);
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some(key => !allowed.includes(key))) fail(`Unknown field in ${label}.`);
  return result;
}
function id(value: unknown, label: string): asserts value is string {
  if (!isCreationId(value)) fail(`Invalid ${label}.`);
}
function text(value: unknown, max: number, label: string, allowEmpty = false): asserts value is string {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.trim())
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) fail(`Invalid ${label}.`);
}
function number(value: unknown, min: number, max: number, label: string, integer = false): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max
    || (integer && !Number.isInteger(value))) fail(`Invalid ${label}.`);
}
function list(value: unknown, max: number, label: string): asserts value is unknown[] {
  if (!Array.isArray(value) || value.length > max) fail(`Too many or invalid ${label}.`);
}
const origins = ['child', 'starter', 'assisted'];
const operators = ['eq', 'neq', 'lt', 'lte', 'gt', 'gte'];

function validateStageScenery(scenery:unknown, width:number, height:number, maxSize:number, minSize=16) {
  if (scenery !== undefined) {
    list(scenery, 8, 'decorations');
    const ids = new Set<string>();
    for (const raw of scenery) {
      const piece = record(raw, ['id','assetId','label','x','y','size','layer'], 'decoration');
      id(piece.id, 'decoration ID');
      if (ids.has(piece.id)) fail('Each decoration needs its own ID.');
      ids.add(piece.id);
      if (!propIds.has(String(piece.assetId)) && !parsePrivateArtId(piece.assetId)) fail('Choose available scenery.');
      text(piece.label, 60, 'decoration name');
      number(piece.x, 0, width, 'decoration x');
      number(piece.y, 0, height, 'decoration y');
      number(piece.size, minSize, maxSize, 'decoration size');
      if (piece.layer !== 'behind' && piece.layer !== 'in-front') fail('Choose a decoration layer.');
    }
  }
}

/** Strictly validates before cloning: unsupported executable/asset payloads are never retained. */
export function validateCreationProject(input: unknown, options: {allowSavedMotion?:boolean} = {}): CreationProject {
  const p = record(input, ['schema','id','title','width','height','background','world','worldLayers','actors','programs','variables','provenance'], 'project');
  if (p.schema !== CREATION_SCHEMA) fail('Unsupported saved project version.');
  id(p.id, 'project ID'); text(p.title, 80, 'project title');
  number(p.width, 200, 1600, 'stage width', true); number(p.height, 160, 1200, 'stage height', true);
  if (!['blank','meadow','night','workshop','sky'].includes(p.background as string) && !ILLUSTRATED_WORLDS.some(world => world.id === p.background)) fail('Choose a supported background.');
  if (p.worldLayers !== undefined) {
    const layers = record(p.worldLayers, ['middle','foreground'], 'world layers');
    if (typeof layers.middle !== 'boolean' || typeof layers.foreground !== 'boolean') fail('Choose visible world layers.');
  }
  if (p.world !== undefined) {
    const inputWorld = p.world;
    if (!inputWorld || typeof inputWorld !== 'object') throw Error('Choose a saved world.');
    if ('edition' in inputWorld) {
      const world = record(p.world, ['edition', 'backdrop', 'framing', 'scenery'], 'world');
      if (world.edition !== 'jems.world.v1') fail('Choose an available world edition.');
      if (world.backdrop !== undefined && !parsePrivateArtId(world.backdrop)) fail('Choose your own saved backdrop.');
      if (world.framing !== undefined && !['fit','fill'].includes(world.framing as string)) fail('Choose how your backdrop fits.');
      validateStageScenery(world.scenery, p.width, p.height, 400);
    } else if ('decorations' in inputWorld || 'backdrop' in inputWorld) {
      const world = record(p.world, ['backdrop','fit','decorations','middle','foreground'], 'world');
      if (!Object.values(classicBackgrounds).some(id=>id===world.backdrop) && !SCENE_WORLDS.some(asset => asset.id === world.backdrop) && !parsePrivateArtId(world.backdrop)) fail('Choose a saved world picture.');
      if (world.fit !== 'cover' && world.fit !== 'contain') fail('Choose how the picture fits.');
      for(const field of ['middle','foreground'])if(world[field]!==undefined&&
        (typeof world[field]!=='boolean'||!ILLUSTRATED_WORLDS.some(item=>item.id===world.backdrop)))fail('Choose a layer from this illustrated world.');
      list(world.decorations, 8, 'world decorations');
      const ids = new Set<string>();
      for (const raw of world.decorations) {
        const d = record(raw, ['id','assetId','name','x','y','size','plane'], 'decoration');
        id(d.id, 'decoration ID'); text(d.name, 60, 'decoration name');
        if (ids.has(d.id)) fail('Each decoration needs its own placement.');
        ids.add(d.id);
        if (!propIds.has(String(d.assetId)) && !parsePrivateArtId(d.assetId)) fail('Choose a saved decoration.');
        number(d.x, 0, 100, 'decoration position'); number(d.y, 0, 100, 'decoration position');
        number(d.size, 5, 100, 'decoration size');
        if (d.plane !== 'back' && d.plane !== 'front') fail('Choose a decoration layer.');
      }
    } else {
      const world = record(p.world,['assetId','framing','scenery'],'world');
      if (!Object.values(classicBackgrounds).some(id=>id===world.assetId) && !SCENE_WORLDS.some(item=>item.id===world.assetId) && parsePrivateArtId(world.assetId)?.kind!=='image') fail('Choose an available world picture.');
      if (world.framing!=='fit' && world.framing!=='fill') fail('Choose how the world picture fits.');
      validateStageScenery(world.scenery, p.width, p.height, Math.max(400,p.height), 1);
    }
  }
  list(p.actors, CREATION_LIMITS.actors, 'characters');
  if (!p.actors.length) fail('Add at least one character.');
  const actorIds = new Set<string>();
  for (const raw of p.actors) {
    const a = record(raw, ['id','name','assetId','x','y','size','visible','role','creativeRole','layer','angle','stackOrder','backdropFit'], 'character');
    id(a.id, 'character ID');
    if (a.role !== undefined && !SCENE_ROLES.includes(a.role as SceneRole)) fail('Choose a supported scene role.');
    if(!isCreationId(a.assetId)&&!parsePrivateArtId(a.assetId))fail('Invalid asset reference.');
    text(a.name, 60, 'character name');
    if (actorIds.has(a.id)) fail('Character IDs must be unique.');
    actorIds.add(a.id);
    number(a.x, 0, p.width, 'character x'); number(a.y, 0, p.height, 'character y');
    if (a.size !== undefined) number(a.size, 16, 240, 'character size');
    if (a.stackOrder !== undefined) number(a.stackOrder, 0, CREATION_LIMITS.actors - 1, 'stack position', true);
    if (a.angle !== undefined) number(a.angle, -180, 180, 'picture angle');
    if (a.backdropFit !== undefined && (a.layer !== 'backdrop' || !['contain','cover'].includes(a.backdropFit as string))) fail('Choose a supported backdrop fit.');
    if (a.layer !== undefined && !['backdrop','back','middle','front'].includes(a.layer as string)) fail('Choose a supported scene layer.');
    if (a.layer === 'backdrop' && parsePrivateArtId(a.assetId)?.kind !== 'image') fail('Choose an original drawing for your backdrop.');
    if (a.creativeRole !== undefined && !SCENE_ROLES.includes(a.creativeRole as SceneRole)) fail('Choose a supported role for this scene.');
    if (a.visible !== undefined && typeof a.visible !== 'boolean') fail('Invalid character visibility.');
  }
  if (p.actors.filter(raw => (raw as SceneActor).layer === 'backdrop').length > 1) fail('Choose one drawing for your backdrop.');
  if (!p.variables || typeof p.variables !== 'object' || Array.isArray(p.variables)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(p.variables))) fail('Invalid variables.');
  const variables = p.variables as Record<string, unknown>;
  if (Object.keys(variables).length > CREATION_LIMITS.variables) fail('Too many variables.');
  for (const [key,value] of Object.entries(variables)) {
    id(key, 'variable name'); number(value, -1000000, 1000000, 'variable value');
  }
  const variable = (name: unknown) => {
    id(name, 'variable name');
    if (!Object.hasOwn(variables, name)) fail(`Add the variable ${name} before using it.`);
  };
  const condition = (raw: unknown) => {
    const c = record(raw, ['type','variable','operator','value','axis','actorId'], 'condition');
    if (c.type === 'touching') {
      record(c, ['type','actorId'], 'touching condition');
      id(c.actorId, 'touching character');
      if (!actorIds.has(c.actorId)) fail('The touching character is missing.');
    } else if (c.type === 'variable' || c.type === 'position') {
      record(c, c.type === 'variable' ? ['type','variable','operator','value'] : ['type','axis','operator','value'], 'comparison');
      if (c.type === 'variable') variable(c.variable);
      else if (c.axis !== 'x' && c.axis !== 'y') fail('Choose x or y for a position comparison.');
      if (!operators.includes(c.operator as string)) fail('Invalid comparison.');
      number(c.value, -1000000, 1000000, 'comparison value');
    } else fail('Unsupported condition.');
  };
  const blockIds = new Set<string>();
  let blockCount = 0;
  function blocks(raw: unknown, depth: number): void {
    if (depth > CREATION_LIMITS.depth) fail('Blocks are nested too deeply.');
    list(raw, CREATION_LIMITS.blocks, 'blocks');
    for (const value of raw) {
      if (++blockCount > CREATION_LIMITS.blocks) fail('This project has too many blocks.');
      const b = record(value, ['id','origin','type','x','y','dx','dy','durationMs','text','height','count','actions','condition','then','else','variable','value','amount','name','motion','pathName'], 'block');
      id(b.id, 'block ID');
      if (blockIds.has(b.id)) fail('Block IDs must be unique throughout a project.');
      blockIds.add(b.id);
      if (b.origin !== undefined && !origins.includes(b.origin as string)) fail('Invalid block authorship.');
      const fields = (specific: string[]) => record(b, ['id','origin','type',...specific], 'block');
      const duration = (optional = false) => {
        if (!optional || b.durationMs !== undefined) number(b.durationMs, 0, CREATION_LIMITS.actionDurationMs, 'action duration', true);
      };
      switch (b.type) {
        case 'move': {
          fields(['x','y','dx','dy','durationMs']);
          const absolute = b.x !== undefined || b.y !== undefined;
          const relative = b.dx !== undefined || b.dy !== undefined;
          if (absolute === relative) fail('Move needs either a destination or a relative distance.');
          for (const field of ['x','y','dx','dy']) if (b[field] !== undefined) number(b[field], -4096, 4096, 'move distance');
          duration(true); break;
        }
        case 'animation':
          fields(['motion']);
          if (options.allowSavedMotion === false) fail('Private saved movement belongs in the local editor.');
          validateDrawingMotion(b.motion);
          break;
        case 'wait': case 'dance': fields(['durationMs']); duration(); break;
        case 'say': fields(['text','durationMs']); text(b.text, 160, 'speech', true); duration(); break;
        case 'jump': fields(['height','durationMs']); number(b.height, 0, 300, 'jump height'); duration(); break;
        case 'show': case 'hide': fields([]); break;
        case 'repeat': fields(['count','actions','pathName']); if (b.pathName !== undefined) {
          if (options.allowSavedMotion === false) fail('Private path names belong in the local editor.');
          text(b.pathName, 40, 'path name');
        } number(b.count, 0, CREATION_LIMITS.repeat, 'repeat count', true); blocks(b.actions, depth + 1); break;
        case 'if': fields(['condition','then','else']); condition(b.condition); blocks(b.then, depth + 1); if (b.else !== undefined) blocks(b.else, depth + 1); break;
        case 'set': fields(['variable','value']); variable(b.variable); number(b.value, -1000000, 1000000, 'variable value'); break;
        case 'change': fields(['variable','amount']); variable(b.variable); number(b.amount, -1000000, 1000000, 'variable change'); break;
        case 'emit': fields(['name']); id(b.name, 'event name'); break;
        default: fail('Unsupported block.');
      }
    }
  }
  list(p.programs, CREATION_LIMITS.programs, 'programs');
  const programIds = new Set<string>();
  const triggerKeys = new Set<string>();
  for (const raw of p.programs) {
    const program = record(raw, ['id','actorId','trigger','actions'], 'program');
    id(program.id, 'program ID'); id(program.actorId, 'program character');
    if (programIds.has(program.id)) fail('Program IDs must be unique.');
    programIds.add(program.id);
    if (!actorIds.has(program.actorId)) fail('A program references a missing character.');
    const t = record(program.trigger, ['type','name'], 'trigger');
    if (t.type === 'event') id(t.name, 'event name');
    else if (t.type === 'start' || t.type === 'tap') record(t, ['type'], 'trigger');
    else fail('Unsupported trigger.');
    const triggerKey = `${program.actorId}/${t.type}/${t.name ?? ''}`;
    if (triggerKeys.has(triggerKey)) fail('Combine blocks under one matching character trigger.');
    triggerKeys.add(triggerKey);
    blocks(program.actions, 0);
  }
  if (p.provenance !== undefined) {
    const source = record(p.provenance, ['createdBy','sourceKind','sourceProjectId','sourceRevisionId','sourceSessionId','sourceGameId'], 'source history');
    if (!origins.includes(source.createdBy as string)) fail('Invalid project authorship.');
    if (source.sourceKind !== undefined && !['curated','generated','creation','art'].includes(source.sourceKind as string)) fail('Invalid source kind.');
    for (const field of ['sourceProjectId','sourceRevisionId','sourceSessionId','sourceGameId']) if (source[field] !== undefined) id(source[field], 'source reference');
  }
  const project = JSON.parse(JSON.stringify(input)) as CreationProject;
  for (const actor of project.actors) {
    if (!actor.creativeRole) continue;
    const canonical = actor.creativeRole === 'scenery' ? 'environment' : actor.creativeRole;
    if (actor.role && actor.role !== canonical) fail('This actor has conflicting roles.');
    actor.role = canonical;
    delete actor.creativeRole;
  }
  return project;
}
