import {OBJECTS, type ObjectId} from './bubble-gum-art';

export type {ObjectId} from './bubble-gum-art';
export type SceneKind = 'sky' | 'sea' | 'road' | 'stage';
export type GumId = 'pink' | 'mint' | 'blue' | 'gold';
export const GUM_BUDGET = 10;
export const TOUR_DURATION_MS = 24_000;
export const MAX_COMPLETED = 99_999;
export const GUMS: readonly {id:GumId; name:string; color:string}[] = [
  {id:'pink',name:'Berry',color:'#ef80b0'},
  {id:'mint',name:'Mint',color:'#61d4bc'},
  {id:'blue',name:'Blueberry',color:'#70bcea'},
  {id:'gold',name:'Lemon',color:'#f5cf66'},
];

/** Percentage coordinates on an 800 x 480 stage. A join spans an actual seam. */
export interface Slot {
  id:string; name:string; x:number; y:number; w:number; h:number;
  rotation?:number; accepts:readonly ObjectId[]; parent?:string;
  joint?:{x1:number;y1:number;x2:number;y2:number};
}
export type BuildSlot = Slot;
export interface Blueprint {
  id:string; title:string; world:SceneKind; verb:string; action:string;
  outcome:string; slots:readonly Slot[];
}
export interface BuildState {
  schema:'gum-assembly-v1'; blueprint:string; completed:number;
  placed:Record<string,ObjectId>; bonds:Record<string,GumId>;
  tourCompleted:boolean; reported:boolean;
}

const slot=(id:string,name:string,x:number,y:number,w:number,h:number,
  accepts:readonly ObjectId[],parent?:string,joint?:Slot['joint'],rotation=0):Slot=>
  ({id,name,x,y,w,h,accepts,...(parent?{parent,joint}:{}),...(rotation?{rotation}:{})});
const join=(x1:number,y1:number,x2:number,y2:number):NonNullable<Slot['joint']>=>({x1,y1,x2,y2});

/** Each prefix is a complete, usable invention; later pieces add visible character. */
export const BLUEPRINTS:readonly Blueprint[] = [
  {id:'rocket-pop',title:'Rocket Pop',world:'sky',verb:'BLAST OFF!',action:'Whoosh!',
    outcome:'Your bottle rocket sailed past the stars!',slots:[
      slot('body','Rocket body',50,51,24,55,['bottle','can']),
      slot('nose','Nose',50,19,21,29,['funnel','cup'],'body',join(50,30,50,35)),
      slot('left-wing','Left wing',31,59,25,32,['paper-wing','ruler'],'body',join(39,57,44,57),-25),
      slot('right-wing','Right wing',69,59,25,32,['paper-wing','ruler'],'body',join(56,57,62.75,59.75),25),
      slot('booster','Booster',50,82,18,23,['cup','tube'],'body',join(50,71,50,76),180),
      slot('window','Window',50,49,12,19,['lid','button'],'body',join(43,48,46,48)),
      slot('antenna','Antenna',65,26,13,27,['straw','spring'],'nose',join(53,28,60,29),30),
      slot('flag','Flag',76,22,17,24,['paper-sail','sock'],'antenna',join(68,24,72,24)),
    ]},
  {id:'bubble-sub',title:'Bubble Sub',world:'sea',verb:'DIVE AWAY!',action:'Bubbles!',
    outcome:'Your tin-can submarine cruised through the bubble sea!',slots:[
      slot('body','Sub body',48,55,39,43,['can','bottle']),
      slot('periscope','Periscope',47,23,16,29,['straw','tube'],'body',join(46,34,48,39)),
      slot('tail','Tail',75,54,22,34,['fan','paper-wing'],'body',join(62,54,68.25,56),90),
      slot('window','Window',40,53,14,23,['lid','button'],'body',join(33,52,36,52)),
      slot('paddle','Paddle',50,80,24,22,['spoon','fork'],'body',join(50,68,50,74),90),
      slot('second-window','Little window',57,53,12,20,['button','cork'],'body',join(61,52,64,52)),
      slot('top-light','Top light',55,18,11,18,['cork','button'],'periscope',join(48,17,52,21)),
      slot('side-fin','Side fin',22,59,18,30,['paper-wing','comb'],'body',join(28,56.25,33,56),-25),
    ]},
  {id:'silly-bot',title:'Silly Bot',world:'stage',verb:'DANCE TIME!',action:'Spin!',
    outcome:'Your box-and-spoon robot did a happy dance!',slots:[
      slot('body','Body',50,57,29,42,['box','carton']),
      slot('head','Head',50,23,24,31,['can','bowl'],'body',join(50,35,50,41)),
      slot('left-arm','Left arm',28,53,24,18,['spoon','fork'],'body',join(36,52,41,52),-35),
      slot('right-arm','Right arm',72,53,24,18,['fork','brush'],'body',join(59,52,65,50),35),
      slot('feet','Dancing feet',50,85,29,19,['shoe','comb'],'body',join(50,72,50,79)),
      slot('heart','Heart button',50,55,11,17,['button','lid'],'body',join(44,55,47,55)),
      slot('hat','Hat',50,8,15,15,['funnel','cup'],'head',join(50,13,50,18)),
      slot('hand','Waving hand',84,41,13,20,['comb','sock'],'right-arm',join(76.75,48.25,81,44),-35),
    ]},
  {id:'sneaker-scoot',title:'Sneaker Scoot',world:'road',verb:'LET’S ROLL!',action:'Hop!',
    outcome:'Your sneaker scooter hopped along the candy road!',slots:[
      slot('body','Scooter body',49,54,42,41,['shoe','box']),
      slot('front-wheel','Front wheel',66,77,19,30,['wheel','cd'],'body',join(64,67,65,72)),
      slot('back-wheel','Back wheel',31,77,19,30,['cd','lid'],'body',join(33,67,32,72)),
      slot('handle','Handle',64,27,14,35,['straw','ruler'],'body',join(62,41,61,52),-15),
      slot('spoiler','Spoiler',26,36,22,18,['spoon','paper-wing'],'body',join(31,40,36,44),-15),
      slot('lamp','Headlight',73,48,12,18,['button','cork'],'body',join(64.5,54,70,49)),
      slot('flag','Flag',70,13,18,21,['paper-sail','sock'],'handle',join(64.5,18.5,69,19)),
      slot('bell','Bell',56,17,12,19,['cup','lid'],'handle',join(59,23,62,24)),
    ]},
  {id:'teacup-glider',title:'Teacup Glider',world:'sky',verb:'TAKE OFF!',action:'Swoop!',
    outcome:'Your teacup glider swooped through fluffy clouds!',slots:[
      slot('body','Flying cup',50,54,28,41,['teacup','cup']),
      slot('left-wing','Left wing',27,48,29,28,['paper-wing','ruler'],'body',join(37,49,42,50),-12),
      slot('right-wing','Right wing',73,48,29,28,['paper-wing','ruler'],'body',join(58,50,64,44.5),12),
      slot('propeller','Propeller',50,28,24,27,['fan','comb'],'body',join(50,37,50,43)),
      slot('tail','Tail',50,82,19,24,['spoon','fork'],'body',join(50,69,50,76)),
      slot('pilot','Little pilot',50,45,10,17,['cork','button'],'body',join(46,47,49,48)),
      slot('left-tip','Wing tip',13,45,12,21,['lid','button'],'left-wing',join(17,47,21,47)),
      slot('right-tip','Wing tip',87,45,12,21,['lid','button'],'right-wing',join(79,47,83,47)),
    ]},
  {id:'sponge-sailor',title:'Sponge Sailor',world:'sea',verb:'SAIL AWAY!',action:'Splash!',
    outcome:'Your sponge sailboat bobbed past a friendly island!',slots:[
      slot('body','Boat body',48,70,42,28,['sponge','basket']),
      slot('mast','Mast',48,41,10,42,['craft-stick','ruler'],'body',join(48,58,48,63)),
      slot('sail','Sail',61,35,28,39,['paper-sail','sock'],'mast',join(48,39,52,39)),
      slot('paddle','Paddle',24,67,24,27,['spoon','fork'],'body',join(31,64,36,64),-35),
      slot('flag','Flag',40,18,19,21,['paper-wing','comb'],'mast',join(45,24,48,27)),
      slot('passenger','Passenger seat',61,59,16,22,['cup','teacup'],'body',join(59,67,59,71)),
      slot('buoy','Life ring',75,73,14,23,['lid','cd'],'body',join(66,72,70,72)),
      slot('bow','Front nose',25,80,18,18,['cork','bowl'],'body',join(32,76,36,75)),
    ]},
  {id:'tin-can-taxi',title:'Tin-can Taxi',world:'road',verb:'LET’S ROLL!',action:'Toot!',
    outcome:'Your tin-can taxi rolled through a silly town!',slots:[
      slot('body','Taxi body',49,58,40,38,['can','carton']),
      slot('front-wheel','Front wheel',66,81,18,29,['wheel','button'],'body',join(64,70,65,76)),
      slot('back-wheel','Back wheel',31,81,18,29,['lid','cd'],'body',join(33,70,32,76)),
      slot('roof','Roof',48,29,31,23,['bowl','box'],'body',join(48,39,48,44)),
      slot('horn','Horn',75,48,18,21,['funnel','cup'],'body',join(65,51,70,51),90),
      slot('window','Window',48,55,15,23,['lid','button'],'body',join(40,55,43,55)),
      slot('flag','Taxi sign',47,12,17,15,['paper-sail','comb'],'roof',join(47,18,47,23)),
      slot('tail','Tail pipe',20,57,18,17,['straw','tube'],'body',join(25,57,32,57),90),
    ]},
  {id:'kitchen-drummer',title:'Kitchen Drummer',world:'stage',verb:'PLAY A BEAT!',action:'Drum!',
    outcome:'Your kitchen drummer made the whole stage bounce!',slots:[
      slot('body','Drum body',50,60,32,39,['bowl','can']),
      slot('head','Head',50,25,22,30,['cup','teacup'],'body',join(50,37,50,43)),
      slot('left-stick','Left drumstick',28,49,24,19,['spoon','craft-stick'],'body',join(35.5,50,41,53),-40),
      slot('right-stick','Right drumstick',72,49,24,19,['fork','brush'],'body',join(61,51,66.25,46.75),40),
      slot('feet','Feet',50,86,29,18,['comb','shoe'],'body',join(50,73,49.5,80.75)),
      slot('badge','Drum badge',50,57,12,19,['button','lid'],'body',join(44,57,47,57)),
      slot('hat','Party hat',50,9,14,17,['funnel','paper-sail'],'head',join(50,16,50,21)),
      slot('cymbal','Cymbal',83,35,16,23,['lid','cd'],'right-stick',join(75.5,44,79,39)),
    ]},
  {id:'balloon-buggy',title:'Balloon Buggy',world:'sky',verb:'FLOAT AWAY!',action:'Float!',
    outcome:'Your balloon buggy floated above the treetops!',slots:[
      slot('body','Flying basket',50,68,29,36,['basket','cup']),
      slot('left-rope','Left rope',41,39,8,38,['straw','craft-stick'],'body',join(42,54.5,43,60),-8),
      slot('left-balloon','Left balloon',31,19,25,35,['balloon','paper-wing'],'left-rope',join(34,30.5,39,37)),
      slot('right-rope','Right rope',59,39,8,38,['straw','spring'],'body',join(57,54,56,60),8),
      slot('right-balloon','Right balloon',67,19,25,35,['balloon','fan'],'right-rope',join(58.75,36.75,64,29)),
      slot('pilot','Passenger',50,55,12,20,['cork','button'],'body',join(46,60,49,62)),
      slot('rudder','Rudder',73,68,20,26,['spoon','fork'],'body',join(61,67,67.5,69.5),90),
      slot('banner','Banner',25,70,22,25,['sock','paper-sail'],'body',join(34,68,39,68),-20),
    ]},
  {id:'spoon-fish',title:'Spoon Fish',world:'sea',verb:'SWIM AWAY!',action:'Swish!',
    outcome:'Your spoon fish swished through a coral garden!',slots:[
      slot('body','Fish body',49,53,40,34,['spoon','brush']),
      slot('tail','Tail',76,54,23,35,['fan','paper-wing'],'body',join(63,54,69,56),90),
      slot('top-fin','Top fin',47,29,21,28,['paper-wing','comb'],'body',join(48,38,47,46.25)),
      slot('bottom-fin','Bottom fin',47,78,21,27,['paper-wing','fork'],'body',join(49.25,62,46.5,70.5),180),
      slot('eye','Eye',32,50,12,19,['button','lid'],'body',join(36,51,39,51)),
      slot('mouth','Mouth',21,56,12,18,['cork','cup'],'body',join(26,54,30,54)),
      slot('small-fin','Little fin',59,57,14,20,['sock','paper-sail'],'body',join(53,56,57,56),35),
      slot('crown','Crown',36,14,17,18,['comb','funnel'],'top-fin',join(38.5,22,43,27)),
    ]},
  {id:'ruler-roller',title:'Ruler Roller',world:'road',verb:'LET’S ROLL!',action:'Jump!',
    outcome:'Your ruler roller bounced down the rainbow track!',slots:[
      slot('body','Board',49,61,47,18,['ruler','craft-stick']),
      slot('front-wheel','Front wheel',67,79,20,31,['wheel','cd'],'body',join(65,65,66,71)),
      slot('back-wheel','Back wheel',30,79,20,31,['lid','button'],'body',join(32,65,31,71)),
      slot('seat','Seat',43,41,22,29,['cup','teacup'],'body',join(43,52,43,58)),
      slot('handle','Handle',66,38,12,35,['straw','spring'],'body',join(65,52,65,58)),
      slot('passenger','Passenger',43,24,11,19,['cork','button'],'seat',join(43,31,43,36)),
      slot('bell','Bell',73,24,13,20,['funnel','lid'],'handle',join(66,29,71,28)),
      slot('tail','Silly tail',19,49,19,26,['sock','brush'],'body',join(25,56,30,58),-30),
    ]},
  {id:'basket-boogie',title:'Basket Boogie',world:'stage',verb:'BOOGIE TIME!',action:'Wiggle!',
    outcome:'Your basket buddy wiggled in a shower of stars!',slots:[
      slot('body','Body',50,55,31,37,['basket','box']),
      slot('head','Head',50,24,23,29,['bowl','cup'],'body',join(50,35,50,41)),
      slot('left-arm','Left arm',27,52,26,19,['spring','fork'],'body',join(37,52,41,52),-15),
      slot('right-arm','Right arm',73,52,26,19,['spoon','brush'],'body',join(59,52,64,52),15),
      slot('feet','Feet',50,83,30,24,['sock','shoe'],'body',join(50,69,49.5,76.5)),
      slot('badge','Belly button',50,54,12,19,['button','lid'],'body',join(44,54,47,54)),
      slot('hair','Hair',50,8,23,15,['comb','fan'],'head',join(50,14,50,19)),
      slot('hand','Waving hand',86,38,13,21,['cup','cork'],'right-arm',join(79,46,83,43),-25),
    ]},
];

const blueprintById=new Map(BLUEPRINTS.map(blueprint=>[blueprint.id,blueprint]));
const gumIds=new Set(GUMS.map(gum=>gum.id));
const own=(record:object,key:string)=>Object.prototype.hasOwnProperty.call(record,key);
const copy=<T extends string>(record:Record<string,T>):Record<string,T>=>Object.assign(Object.create(null),record);

export function partCountAt(completed:number):number {
  return 5+Math.min(3,Math.floor(Math.max(0,completed)/3));
}

export function createBuild(completed=0,blueprintId?:string):BuildState {
  if(!Number.isInteger(completed)||completed<0||completed>MAX_COMPLETED)throw Error('Invalid completed build count');
  const blueprint=blueprintId??BLUEPRINTS[completed%BLUEPRINTS.length].id;
  if(!blueprintById.has(blueprint))throw Error('Unknown blueprint');
  return {schema:'gum-assembly-v1',blueprint,completed,placed:Object.create(null),bonds:Object.create(null),tourCompleted:false,reported:false};
}

export function getBlueprint(state:Pick<BuildState,'blueprint'|'completed'>):Blueprint {
  const blueprint=blueprintById.get(state.blueprint);
  if(!blueprint)throw Error('Unknown blueprint');
  return {...blueprint,slots:blueprint.slots.slice(0,partCountAt(state.completed))};
}

export function isConnected(state:BuildState,slotId:string):boolean {
  const slots=getBlueprint(state).slots;
  let current=slots.find(slot=>slot.id===slotId);
  const visited=new Set<string>();
  while(current){
    if(visited.has(current.id)||!own(state.placed,current.id))return false;
    visited.add(current.id);
    if(!current.parent)return true;
    if(!own(state.bonds,current.id))return false;
    current=slots.find(slot=>slot.id===current!.parent);
  }
  return false;
}

export function nextSlot(state:BuildState):Slot|undefined {
  return getBlueprint(state).slots.find(slot=>!own(state.placed,slot.id)||(!!slot.parent&&!own(state.bonds,slot.id)));
}

export function canPlace(state:BuildState,slotId:string,objectId:ObjectId):boolean {
  const slot=nextSlot(state);
  return !state.tourCompleted&&!state.reported&&slot?.id===slotId&&!own(state.placed,slotId)&&
    slot.accepts.includes(objectId)&&(!slot.parent||isConnected(state,slot.parent));
}

export function placePart(state:BuildState,slotId:string,objectId:ObjectId):BuildState {
  if(!canPlace(state,slotId,objectId))return state;
  const placed=copy(state.placed);placed[slotId]=objectId;
  return {...state,placed};
}

export function gumRemaining(state:BuildState):number {
  return GUM_BUDGET-Object.keys(state.bonds).length;
}

export function canBond(state:BuildState,slotId:string):boolean {
  const slot=nextSlot(state);
  return !state.tourCompleted&&!state.reported&&slot?.id===slotId&&!!slot.parent&&
    own(state.placed,slotId)&&!own(state.bonds,slotId)&&isConnected(state,slot.parent)&&gumRemaining(state)>0;
}

export function bondPart(state:BuildState,slotId:string,gumId:GumId):BuildState {
  if(!gumIds.has(gumId)||!canBond(state,slotId))return state;
  const bonds=copy(state.bonds);bonds[slotId]=gumId;
  return {...state,bonds};
}

/** Removing a part also removes everything attached through it, returning that gum. */
export function removePart(state:BuildState,slotId:string):BuildState {
  if(state.reported||!own(state.placed,slotId))return state;
  const removed=new Set([slotId]);
  for(const slot of getBlueprint(state).slots)if(slot.parent&&removed.has(slot.parent))removed.add(slot.id);
  const placed=copy(state.placed),bonds=copy(state.bonds);
  for(const id of removed){delete placed[id];delete bonds[id];}
  return {...state,placed,bonds,tourCompleted:false};
}

export function isReady(state:BuildState):boolean {
  return getBlueprint(state).slots.every(slot=>isConnected(state,slot.id));
}

/** Stable, saved-build-specific choices; the first card is not always the answer. */
export function partChoices(state:BuildState,slotId:string,extraDecoys=1):ObjectId[] {
  const slot=getBlueprint(state).slots.find(slot=>slot.id===slotId);
  if(!slot)return [];
  let seed=2166136261;
  for(const c of `${state.blueprint}/${state.completed}/${slot.id}`)seed=Math.imul(seed^c.charCodeAt(0),16777619)>>>0;
  const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;};
  const shuffle=(items:ObjectId[])=>{
    for(let i=items.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[items[i],items[j]]=[items[j],items[i]];}
    return items;
  };
  const decoys=shuffle((Object.keys(OBJECTS) as ObjectId[]).filter(id=>!slot.accepts.includes(id)));
  const count=Number.isFinite(extraDecoys)?Math.min(6,Math.max(0,Math.floor(extraDecoys))):0;
  return shuffle([...slot.accepts,...decoys.slice(0,count)]);
}

export function completeTour(state:BuildState):BuildState {
  return !state.tourCompleted&&isReady(state)?{...state,tourCompleted:true}:state;
}

export function markReported(state:BuildState):BuildState {
  return state.tourCompleted&&!state.reported?{...state,reported:true}:state;
}

export function nextBuild(state:BuildState):BuildState {
  if(!state.tourCompleted)return state;
  const index=BLUEPRINTS.findIndex(blueprint=>blueprint.id===state.blueprint);
  return createBuild(Math.min(MAX_COMPLETED,state.completed+1),BLUEPRINTS[(index+1)%BLUEPRINTS.length].id);
}

function dataRecord(value:unknown,label:string):Record<string,unknown> {
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error(`Invalid ${label}`);
  const proto=Object.getPrototypeOf(value);
  if(proto!==Object.prototype&&proto!==null)throw Error(`Invalid ${label} prototype`);
  if(Object.getOwnPropertySymbols(value).length)throw Error(`Invalid ${label} keys`);
  for(const descriptor of Object.values(Object.getOwnPropertyDescriptors(value)))
    if(!own(descriptor,'value')||!descriptor.enumerable)throw Error(`Invalid ${label} property`);
  return value as Record<string,unknown>;
}

/** Saved data is untrusted. Reject unsupported state without mutating its source. */
export function readBuild(raw:unknown):BuildState {
  const record=dataRecord(raw,'build');
  const keys=['schema','blueprint','completed','placed','bonds','tourCompleted','reported'];
  if(Object.keys(record).length!==keys.length||keys.some(key=>!own(record,key))||
    record.schema!=='gum-assembly-v1'||typeof record.blueprint!=='string'||
    typeof record.completed!=='number'||typeof record.tourCompleted!=='boolean'||typeof record.reported!=='boolean')
    throw Error('Unsupported gum assembly save');
  const state=createBuild(record.completed,record.blueprint);
  const placed=dataRecord(record.placed,'parts'),bonds=dataRecord(record.bonds,'gum');
  const slots=getBlueprint(state).slots;
  if(Object.keys(placed).length>slots.length||Object.keys(bonds).length>=slots.length)throw Error('Too many saved parts or joins');
  for(const [id,objectId] of Object.entries(placed)){
    const slot=slots.find(slot=>slot.id===id);
    if(!slot||typeof objectId!=='string'||!slot.accepts.includes(objectId as ObjectId))throw Error('Invalid saved part');
    state.placed[id]=objectId as ObjectId;
  }
  for(const [id,gumId] of Object.entries(bonds)){
    const slot=slots.find(slot=>slot.id===id);
    if(!slot?.parent||!own(state.placed,id)||typeof gumId!=='string'||!gumIds.has(gumId as GumId))throw Error('Invalid saved join');
    state.bonds[id]=gumId as GumId;
  }
  for(const slot of slots){
    if(own(state.placed,slot.id)&&slot.parent&&!isConnected(state,slot.parent))throw Error('Part has no connected parent');
    if(own(state.bonds,slot.id)&&!isConnected(state,slot.id))throw Error('Disconnected saved join');
  }
  if(record.tourCompleted&&!isReady(state))throw Error('Unfinished invention cannot complete a tour');
  if(record.reported&&!record.tourCompleted)throw Error('An unfinished tour cannot be reported');
  state.tourCompleted=record.tourCompleted;state.reported=record.reported;
  return state;
}

/** A plain JSON-compatible copy for the host's existing persistence contract. */
export function serializeBuild(state:BuildState):BuildState {
  const checked=readBuild(state);
  return {...checked,placed:{...checked.placed},bonds:{...checked.bonds}};
}
