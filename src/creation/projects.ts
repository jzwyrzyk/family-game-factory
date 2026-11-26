/** Trusted assets and explicit adapters into the editable scene model.
 * A scene is a new creation pinned to its source. This does not translate game JavaScript.
 */
import historicalArt from '../pals/historical-scene-art.json';
import { defaults, validateConfig } from '../runtime/manifests';
import type { Mechanics } from '../runtime/types';
import type { Revision } from '../factory/workspace';
import type { StudioSession } from '../studio/notebook';
import { PAL_CATALOG, palArtworkPath, palSceneAssetId, type PalForm, type PalId } from '../pals/catalog';
import { validateCreationProject, parsePrivateArtId, type PrivateArtReference, type CreationProject, type CreationBlock } from './model';
export {parsePrivateArtId};
export type {PrivateArtReference};

export interface CreationAsset {
  readonly id: string;
  readonly label: string;
  readonly kind: 'image' | 'vector' | 'emoji';
  readonly url?: string;
  readonly shape?: 'bucket' | 'robot' | 'gem';
  readonly color?: string;
  readonly emoji?: string;
  readonly sourceGame?: 'dragon' | 'buckets' | 'robot';
  /** A reusable scene asset is not evidence of collection ownership. */
  readonly palId?: PalId;
  /** Only new approved assets carry a form. Legacy token references stay exact. */
  readonly palForm?: PalForm;
}

const PAL_SCENE_ASSETS: CreationAsset[] = PAL_CATALOG.flatMap(pal => (['base', 'mature'] as const).map(form => ({
  id: palSceneAssetId(pal.id, form), label: pal.name, kind: 'image' as const,
  url: './' + palArtworkPath(pal.id, form), palId: pal.id, palForm: form,
})));

/** Generated manifests may address only these bundled resources. Local scenes
 * may also carry the strict private-art references defined below. */
export const CREATION_ASSETS: readonly CreationAsset[] = Object.freeze([
  {id:'dragon', label:'Dragon', kind:'image', url:'./assets/original-dragon/dragon.png', sourceGame:'dragon'},
  {id:'queen', label:'Queen', kind:'image', url:'./assets/original-dragon/queen.png', sourceGame:'dragon'},
  {id:'king', label:'King', kind:'image', url:'./assets/original-dragon/king.png', sourceGame:'dragon'},
  {id:'princess-wand', label:'Princess with wand', kind:'image', url:'./assets/original-dragon/princess_wand.png', sourceGame:'dragon'},
  {id:'princess-bow', label:'Princess with bow', kind:'image', url:'./assets/original-dragon/princess_bow.png', sourceGame:'dragon'},
  {id:'castle', label:'Castle', kind:'image', url:'./assets/original-dragon/castle.png', sourceGame:'dragon'},
  {id:'camper', label:'Camper', kind:'image', url:'./assets/original-dragon/camper.png', sourceGame:'dragon'},
  {id:'bucket-blue', label:'Blue bucket', kind:'vector', shape:'bucket', color:'#8eacce', sourceGame:'buckets'},
  {id:'bucket-pink', label:'Pink bucket', kind:'vector', shape:'bucket', color:'#ff9ddb', sourceGame:'buckets'},
  {id:'bucket-gold', label:'Golden bucket', kind:'vector', shape:'bucket', color:'#ffe6a1', sourceGame:'buckets'},
  {id:'robot', label:'Route robot', kind:'vector', shape:'robot', color:'#f5a67c', sourceGame:'robot'},
  {id:'gem', label:'Gem', kind:'vector', shape:'gem', color:'#37cbb1'},
  {id:'star', label:'Route star', kind:'emoji', emoji:'⭐', sourceGame:'robot'},
  // Existing scene token mappings stay stable. Final Base/Grown artwork must
  // use explicit form/version bindings rather than replace saved references.
  {id:'pal-kip', label:'Kip', kind:'image', url:'./jems-art/gem_mint.webp', palId:'kip'},
  {id:'pal-riff', label:'Riff', kind:'image', url:'./jems-art/gem_coral.webp', palId:'riff'},
  // Newly created actors pin the selected approved character, form and version.
  // These coexist with the retained historical token references.
  ...PAL_SCENE_ASSETS,
].map(asset=>Object.freeze(asset)) as CreationAsset[]);

// Read compatibility for published games and saved revisions. New scenes and
// generation schemas enumerate CREATION_ASSETS exclusively.
const historicalAssets: readonly CreationAsset[] = [
  {id:'pal-glim', label:'Glim', kind:'image', url:'./jems-art/gem_blue.webp'},
  ...historicalArt.map(asset => ({ id: asset.id, label: asset.label, kind: 'image' as const,
    url: './' + asset.url, palForm: asset.form as PalForm })),
];

export function creationAsset(id: string): CreationAsset | undefined {
  return CREATION_ASSETS.find(asset=>asset.id===id) ?? historicalAssets.find(asset=>asset.id===id);
}

/** Opaque local references are data, never paths or fetchable URLs. The browser
 * separately resolves them against the active owner's immutable private art. */
export function privateArtId(reference:PrivateArtReference):string {
  const id=`art:${reference.kind}:${reference.id}:${reference.sha256}`;
  if(!parsePrivateArtId(id))throw Error('This private artwork reference is invalid.');
  return id;
}

/** Local persistence allows opaque private references; remote model output is
 * deliberately restricted to the bundled catalogue by its own entry point. */
export function validateEditableProject(input: unknown,options:{allowPrivateArt?:boolean}={}): CreationProject {
  const project=validateCreationProject(input);
  if(project.actors.some(actor=>!creationAsset(actor.assetId)&&!(options.allowPrivateArt!==false&&parsePrivateArtId(actor.assetId)))) {
    throw Error('This scene uses artwork that is not available in this version of jems. Your saved work was not replaced.');
  }
  return project;
}

/** Model output cannot attest that the child authored its blocks or its provenance. */
export function validateGeneratedCreationManifest(input:unknown):CreationProject {
  const scene = validateSavedCreationManifest(input);
  if (scene.actors.some(actor => !CREATION_ASSETS.some(asset => asset.id === actor.assetId)))
    throw Error('Choose currently available artwork for a new scene.');
  return scene;
}

export function validateSavedCreationManifest(input:unknown):CreationProject {
  const scene=validateEditableProject(input,{allowPrivateArt:false});
  const mark=(blocks:CreationBlock[])=>{for(const block of blocks){block.origin='assisted';if(block.type==='repeat')mark(block.actions);if(block.type==='if'){mark(block.then);if(block.else)mark(block.else);}}};
  for(const program of scene.programs)mark(program.actions);
  scene.provenance={createdBy:'assisted'};
  // Bound the normalized wire representation, including attribution, so a
  // returned scene is safe to validate again at publication and import.
  if(new TextEncoder().encode(JSON.stringify(scene)).byteLength>32_000)throw Error('The editable companion scene is too large.');
  return scene;
}

export type CreationStarter = 'dragon' | 'buckets' | 'robot' | 'blank';
const uid=()=>crypto.randomUUID();
const titleFor:Record<CreationStarter,string>={dragon:'My dragon scene',buckets:'My bucket scene',robot:'My robot scene',blank:'My new scene'};
function starter(kind:CreationStarter,title:string,config?:Mechanics):CreationProject {
  const scene:CreationProject={schema:'jems.creation.v1',id:uid(),title:title.trim().slice(0,60)||titleFor[kind],width:800,height:450,
    background:kind==='robot'?'workshop':kind==='buckets'?'sky':'meadow',actors:[],programs:[],variables:{},provenance:{createdBy:'starter'}};
  const action=(block:Omit<CreationBlock,'id'>):CreationBlock=>({id:uid(),...block,origin:'starter'} as CreationBlock);
  if(kind==='dragon'){
    const c=config??defaults('dragon');
    // Cadence controls the pause between appearances; it does not pretend to import combat.
    const pause=Math.round(800/Number(c.originalRules?c.fireballCadence:c.breathSpeed));
    scene.actors=[{id:'dragon',name:'Dragon',assetId:'dragon',x:560,y:180,size:150},{id:'hero',name:'Queen',assetId:'queen',x:200,y:320,size:110}];
    scene.programs=[{id:uid(),actorId:'dragon',trigger:{type:'start'},actions:[
      action({type:'move',dx:-100,durationMs:1000} as Omit<CreationBlock,'id'>),
      action({type:'wait',durationMs:pause} as Omit<CreationBlock,'id'>),
      action({type:'say',text:'What happens next?',durationMs:1600} as Omit<CreationBlock,'id'>),
    ]},{id:uid(),actorId:'hero',trigger:{type:'tap'},actions:[action({type:'jump',height:60,durationMs:700} as Omit<CreationBlock,'id'>)]}];
  }else if(kind==='buckets'){
    const c=config??defaults('buckets'),count=Number(c.bucketCount);
    scene.variables={bucket_count:count};
    scene.actors=Array.from({length:count},(_,i)=>({id:`bucket-${i+1}`,name:`Bucket ${i+1}`,assetId:['bucket-blue','bucket-pink','bucket-gold'][i%3],x:120+i*560/Math.max(1,count-1),y:230,size:92}));
    scene.programs=scene.actors.map(actor=>({id:uid(),actorId:actor.id,trigger:{type:'tap'},actions:[
      action({type:'dance',durationMs:Number(c.splashMs)} as Omit<CreationBlock,'id'>),
      action({type:'say',text:'My turn!',durationMs:1100} as Omit<CreationBlock,'id'>),
    ]}));
  }else if(kind==='robot'){
    const c=config??defaults('robot'),duration=Math.round(440/Number(c.robotSpeed));
    scene.actors=[{id:'robot',name:'Robot',assetId:'robot',x:180,y:300,size:76},{id:'star',name:'Star',assetId:'star',x:420,y:180,size:58}];
    scene.programs=[{id:uid(),actorId:'robot',trigger:{type:'start'},actions:[
      action({type:'move',dx:120,durationMs:duration} as Omit<CreationBlock,'id'>),
      action({type:'move',dy:-120,durationMs:duration} as Omit<CreationBlock,'id'>),
      action({type:'move',dx:120,durationMs:duration} as Omit<CreationBlock,'id'>),
    ]}];
  }else{
    scene.actors=[{id:'gem',name:'My jem',assetId:'gem',x:400,y:225,size:90}];
    scene.programs=[{id:uid(),actorId:'gem',trigger:{type:'start'},actions:[]}];
  }
  return validateEditableProject(scene);
}

export function createStarterProject(kind:CreationStarter,title=titleFor[kind]):CreationProject {
  if(!Object.hasOwn(titleFor,kind))throw Error('Choose an available scene starter.');
  return starter(kind,title);
}

export class CreationSourceUnavailableError extends Error {
  readonly code='CREATION_SOURCE_UNAVAILABLE';
  constructor(){super('This game does not include an editable scene yet. Its saved game is unchanged. You can start a separate scene with available characters.');}
}

/** Only an explicitly supplied, validated manifest can bring a generated game into the lab. */
export function createProjectFromStudio(
  session:StudioSession,
  revision?:Pick<Revision,'id'|'projectId'|'config'>,
  manifest?:unknown,
):CreationProject {
  if(manifest!==undefined){
    const scene=validateSavedCreationManifest(manifest);
    return validateEditableProject({...scene,id:uid(),title:`${session.name} scene`.slice(0,60),provenance:{
      createdBy:'assisted',sourceKind:'generated',sourceSessionId:session.id,
      sourceProjectId:session.projectId??session.id,...(session.remoteId?{sourceRevisionId:session.remoteId}:{}),
    }});
  }
  if(session.remoteId||session.game==='new'||!['dragon','buckets','robot'].includes(session.game))throw new CreationSourceUnavailableError();
  if(!revision||!session.projectId||revision.projectId!==session.projectId)throw Error('Open a saved version of this game before making its scene.');
  const game=session.game as Exclude<CreationStarter,'blank'>;
  const scene=starter(game,`${session.name} scene`,validateConfig(game,revision.config));
  return validateEditableProject({...scene,provenance:{createdBy:'starter',sourceKind:'curated',sourceSessionId:session.id,
    sourceGameId:game,sourceProjectId:revision.projectId,sourceRevisionId:revision.id}});
}

/** Portable versions of the real curated Canvas actors; image actors use the bundled PNGs. */
export function drawCreationVector(ctx:CanvasRenderingContext2D,assetId:string,x:number,y:number,size:number):boolean {
  const asset=creationAsset(assetId);if(!asset||asset.kind!=='vector')return false;
  ctx.save();ctx.translate(x,y);ctx.scale(size/100,size/100);
  if(asset.shape==='robot'){
    // Robot Route Lab uses the same rounded peach body, dark eyes and pale antenna.
    ctx.fillStyle='#f5a67c';ctx.beginPath();ctx.roundRect(-32,-25,64,61,13);ctx.fill();
    ctx.fillStyle='#23384f';for(const ex of [-14,14]){ctx.beginPath();ctx.arc(ex,0,6.4,0,Math.PI*2);ctx.fill();}
    ctx.strokeStyle='#e1d0a7';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(0,-25);ctx.lineTo(0,-39);ctx.stroke();
  }else if(asset.shape==='bucket'){
    // Body, handle, rim and highlight derive from original-buckets.js drawBucket.
    ctx.scale(.6,.6);ctx.translate(0,-60);
    ctx.strokeStyle='#d1e2f3';ctx.lineWidth=10;ctx.beginPath();ctx.arc(0,14,56,Math.PI,Math.PI*2);ctx.stroke();
    const gradient=ctx.createLinearGradient(0,14,0,123);gradient.addColorStop(0,asset.color??'#8eacce');gradient.addColorStop(1,'#47668e');
    ctx.fillStyle=gradient;ctx.strokeStyle='#e9f4ff';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-66,17);ctx.lineTo(-51,120);ctx.quadraticCurveTo(0,137,51,120);ctx.lineTo(66,17);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.globalAlpha=.44;ctx.fillStyle='#e0f1ff';ctx.beginPath();ctx.roundRect(-48,38,15,71,6);ctx.fill();ctx.globalAlpha=1;
    ctx.strokeStyle='#a8c6e6';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-49,104);ctx.lineTo(49,104);ctx.stroke();
    ctx.fillStyle='#c6dced';ctx.beginPath();ctx.roundRect(-74,6,148,24,9);ctx.fill();ctx.stroke();
    ctx.fillStyle='#f9fcff';ctx.font='900 43px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('?',0,79);
  }else{
    ctx.fillStyle=asset.color??'#37cbb1';ctx.strokeStyle='#136c69';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-36,-25);ctx.lineTo(30,-25);ctx.lineTo(47,0);ctx.lineTo(0,42);ctx.lineTo(-47,0);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.strokeStyle='#d4fff4';ctx.beginPath();ctx.moveTo(-47,0);ctx.lineTo(47,0);ctx.moveTo(-16,-25);ctx.lineTo(-22,0);ctx.lineTo(0,42);ctx.lineTo(21,0);ctx.lineTo(12,-25);ctx.stroke();
  }
  ctx.restore();return true;
}
