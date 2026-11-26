import {saveDrawing, updateDrawing, type Drawing} from '../../src/assets/private-drawings';
import {artChoice} from '../../src/creation/private-art';
import {createArtAdventure} from '../../src/creation/art-game';
import {createIllustratedStarter} from '../../src/creation/projects';
import {CreationStore} from '../../src/creation/storage';
import {defaultAssembly} from '../../src/drawing/model';
import {applyArtMotion} from '../../src/drawing/motion';
import {saveRig} from '../../src/drawing/store';
import {renderPaper, sheetSize, type Mark, type Sheet} from '../../src/drawing/workspace-engine';
import {sketchPng} from '../../src/drawing/sketch';

const stroke=(color:string,size:number,coords:number[][]):Mark=>({
  tool:'crayon',color,size,points:coords.map(([x,y])=>({x,y})),
});
const charcoal='#202b39';
const rock:Sheet={version:1,transparent:true,marks:[
  stroke('#6d61ca',22,[[244,352],[220,284],[287,191],[442,155],[538,180],[668,299],[648,372],[523,388],[349,388],[243,352]]),
  stroke('#268e8c',13,[[240,280],[340,290],[391,229],[459,245]]),
  stroke(charcoal,12,[[370,292],[370,307]]),stroke(charcoal,12,[[514,284],[514,299]]),
  stroke(charcoal,10,[[412,328],[450,341],[478,326]]),
]};
const dragon:Sheet={version:1,transparent:true,marks:[
  stroke('#7dbc58',22,[[175,367],[237,287],[324,254],[389,211],[450,250],[520,205],[552,134],[578,167],[617,116],[650,163],[713,198],[677,236],[602,237],[572,280],[533,323],[545,392],[496,398],[469,343],[372,353],[344,408],[312,405],[311,351],[228,372],[175,367]]),
  stroke('#db5679',15,[[335,249],[233,100],[298,136],[327,95],[346,152],[399,216],[335,249]]),
  stroke(charcoal,12,[[622,177],[624,184]]),stroke(charcoal,9,[[643,211],[661,216],[676,207]]),
]};
type Sample={rock:string;revision:string;dragon:string;movement:string;parts:string;world:string;hunt:string};
const pending=new Map<string,Promise<Sample>>();
async function picture(owner:string,name:string,sheet:Sheet,category:'character'|'prop',source?:Drawing){
  const canvas=document.createElement('canvas');Object.assign(canvas,sheetSize(sheet));
  renderPaper(canvas.getContext('2d')!,sheet);
  const pixels=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Review canvas is unavailable.')),'image/png'));
  return saveDrawing(owner,name,sketchPng(pixels,sheet),source?.id,undefined,category);
}
async function seed(owner:string):Promise<Sample>{
  const key='jems-review-connected-samples:'+owner;
  const previous=localStorage.getItem(key);
  if(previous)return JSON.parse(previous);
  const first=await picture(owner,'My Rock',rock,'prop');
  await updateDrawing(owner,first.id,{semanticIdentity:'Rock'});
  const later=await picture(owner,'My Rock with a gem',{...rock,marks:[...rock.marks,
    stroke('#ffb541',14,[[470,195],[497,220],[475,247],[448,220],[470,195]])]},'prop',first);
  const animal=await picture(owner,'My Dragon',dragon,'character');
  const parts=defaultAssembly(animal,'character',[
    {id:'body',name:'Dragon body',role:'body',parentId:null,physical:true,region:{x:.18,y:.30,w:.62,h:.45,shape:'rect'}},
    {id:'wing',name:'Pink wing',role:'wing',parentId:'body',physical:true,pivot:{x:.9,y:.9},region:{x:.23,y:.15,w:.23,h:.30,shape:'rect'}},
  ]);
  const rig=await saveRig(owner,parts);
  const animation=defaultAssembly(animal,'character',[{id:'whole',name:'Original dragon',role:'body',parentId:null,physical:true,region:{x:0,y:0,w:1,h:1,shape:'rect'}}]);
  animation.motion={move:'float',sprite:'original',durationMs:1200,world:'world-forest-v1'};
  const movement=await saveRig(owner,animation);
  const store=new CreationStore(localStorage,()=>owner);
  const rockChoice=await artChoice(owner,{drawingId:first.id});
  const dragonChoice=await artChoice(owner,{drawingId:animal.id,rigId:movement.id});
  const world=createIllustratedStarter('blank','world-forest-v1');
  world.title='My World · Rock and Dragon';
  world.actors.push({id:'my-rock',assetId:rockChoice.assetId,name:'My Rock',role:'scenery',x:205,y:333,size:148,angle:12,layer:'back'});
  const actor={id:'my-dragon',name:'My Dragon',assetId:dragonChoice.assetId,x:500,y:240,size:180};
  world.actors.push(actor);
  applyArtMotion(world,actor,animation.motion);
  const existing=store.create(owner,world);store.keep(existing.id,owner,existing.headId);
  const hunt=createArtAdventure(rockChoice,'picture-hunt');const playable=store.create(owner,hunt);store.keep(playable.id,owner,playable.headId);
  const result={rock:first.id,revision:later.id,dragon:animal.id,movement:movement.id,parts:rig.id,world:world.id,hunt:hunt.id};
  localStorage.setItem(key,JSON.stringify(result));return result;
}
export function seedCreativeReview(owner:string) {
  if(!pending.has(owner))pending.set(owner,seed(owner).catch(error=>{pending.delete(owner);throw error;}));
  return pending.get(owner)!;
}
async function element(selector:string):Promise<HTMLElement>{
  for(let i=0;i<150;i++){
    const el=document.querySelector<HTMLElement>(selector);
    if(el && el.getClientRects().length)return el;
    await new Promise(resolve=>setTimeout(resolve,40));
  }
  throw Error('The review could not open '+selector);
}
export async function creativeDestination(action:string){
  const fg=(window as any).FG;
  const owner=fg.store.current().id;
  if(action.startsWith('world-plate-')){
    await fg.creation.openMake();
    (await element('[data-world="world-'+action.slice(12)+'-v1"]')).click();return;
  }
  const sample=await seedCreativeReview(owner);
  if(action==='kept-world'||action==='fork-world'||action==='hunt'||action==='picker'){
    await fg.creation.openMake();
    const fork=action==='fork-world',id=action==='hunt'?sample.hunt:sample.world;
    (await element('['+(fork?'data-use-world':'data-scene')+'="'+id+'"]')).click();
    if(action==='picker')(await element('#creationAddActor')).click();
    return;
  }
  await fg.artStudio.open();
  const id=action==='revision'?sample.revision:action==='original'?sample.rock:sample.dragon;
  (await element('[data-art-id="'+id+'"]')).click();
  const version=await element('#artVersion') as HTMLSelectElement;
  if(action==='animation'||action==='parts'){
    version.value=action==='parts'?sample.parts:sample.movement;
    version.dispatchEvent(new Event('change'));
    (await element(action==='parts'?'#artEditMovement':'#artAnimatePath')).click();
  }
}
