/** Trusted local-art adapter. Private pixels never become a URL or a model input. */
import { drawing, drawingBlob } from '../assets/private-drawings';
import { rigById } from '../drawing/store';
import { assemblyHash } from '../assets/creative-library';
export { assemblyHash, listCreativeAssetChoices as listArtChoices } from '../assets/creative-library';
import { layerCanvas } from '../drawing/segmentation';
import { parsePrivateArtId, privateArtId, validateEditableProject } from './projects';
import { sceneAssetSlots, type CreationProject } from './model';
import {exportArtBundle,validateArtBundle,importArtBundle,type ArtBundle} from '../drawing/transfer';

export interface ArtSelection {drawingId:string;rigId?:string}
export interface ArtChoice extends ArtSelection {assetId:string;label:string;detail:string}
export interface ResolvedPrivateArt extends ArtChoice {image:HTMLCanvasElement;motion?:import('../drawing/motion').DrawingMotion}
const stale=()=>Error('The player or page changed. Reopen your artwork in your own profile.');
const hex=(bytes:ArrayBuffer)=>Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
/** Union cutout masks without repeatedly blending the original's translucent
 * pixels. RGB always comes from the original; alpha cannot exceed its alpha. */
export function unionOriginalArtPixels(original:Uint8ClampedArray,mask:Uint8ClampedArray,accumulated?:Uint8ClampedArray):Uint8ClampedArray {
  if(original.length%4||mask.length!==original.length||accumulated&&accumulated.length!==original.length)throw Error('Cutout masks must match the original artwork.');
  const result=accumulated||new Uint8ClampedArray(original.length);
  for(let index=0;index<original.length;index+=4){
    result[index]=original[index];result[index+1]=original[index+1];result[index+2]=original[index+2];
    result[index+3]=Math.min(original[index+3],Math.max(result[index+3],mask[index+3]));
  }
  return result;
}
export async function artChoice(owner:string,selection:ArtSelection,current:()=>boolean=()=>true):Promise<ArtChoice> {
  if(!current())throw stale();
  const source=await drawing(owner,selection.drawingId);
  if(!current())throw stale();
  if(selection.rigId){
    const rig=await rigById(owner,selection.rigId);
    if(!current())throw stale();
    if(rig.assembly.sourceId!==source.id||rig.assembly.sourceSha256!==source.sha256)throw Error('This design no longer matches its original drawing.');
    const sha256=await assemblyHash(rig.assembly);
    if(!current())throw stale();
    return {drawingId:source.id,rigId:rig.id,assetId:privateArtId({kind:'rig',id:rig.id,sha256}),label:source.name,detail:'Saved cutout design'};
  }
  return {drawingId:source.id,assetId:privateArtId({kind:'image',id:source.id,sha256:source.sha256}),label:source.name,detail:'Original artwork'};
}
export function privateArtReferences(project:CreationProject):string[] {
  return [...new Set(sceneAssetSlots(project).map(slot=>slot.assetId).filter(id=>parsePrivateArtId(id)))];
}
export interface SceneArtBundle {schema:'jems.scene-art.v1';scene:CreationProject;art:ArtBundle}
/** A download includes immutable originals and the exact cutout versions used. */
export async function exportSceneArt(owner:string,input:CreationProject,current:()=>boolean=()=>true):Promise<SceneArtBundle> {
  const scene=validateEditableProject(input),refs=privateArtReferences(scene).map(id=>parsePrivateArtId(id)!);
  if(!current())throw stale();
  const art=await exportArtBundle(owner,{drawingIds:refs.filter(ref=>ref.kind==='image').map(ref=>ref.id),rigIds:refs.filter(ref=>ref.kind==='rig').map(ref=>ref.id)});
  if(!current())throw stale();
  return validateSceneArtBundle({schema:'jems.scene-art.v1',scene,art});
}
/** Reject incomplete private references before importing any image bytes. */
export async function validateSceneArtBundle(input:unknown):Promise<SceneArtBundle> {
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!['schema','scene','art'].includes(key))||(input as SceneArtBundle).schema!=='jems.scene-art.v1')throw Error('Choose a supported scene and art file. Your saved work is unchanged.');
  const raw=input as SceneArtBundle,scene=validateEditableProject(raw.scene),art=await validateArtBundle(raw.art);
  for(const id of privateArtReferences(scene)){
    const ref=parsePrivateArtId(id)!;
    if(ref.kind==='image'){
      if(!art.drawings.some(source=>source.id===ref.id&&source.sha256===ref.sha256))throw Error('The scene file is missing its exact original artwork. Nothing was imported.');
    }else{
      const rig=art.rigs.find(rig=>rig.id===ref.id);
      if(!rig||await assemblyHash(rig.assembly)!==ref.sha256)throw Error('The scene file is missing its exact saved cutout design. Nothing was imported.');
    }
  }
  return {schema:'jems.scene-art.v1',scene,art};
}
/** Art import is additive and atomic. A later scene-save failure cannot erase
 * existing work; the caller reports that the imported art is still available. */
export async function importSceneArt(owner:string,input:unknown,current:()=>boolean=()=>true):Promise<CreationProject> {
  const bundle=await validateSceneArtBundle(input);
  if(!current())throw stale();
  const imported=await importArtBundle(owner,bundle.art,current);
  if(!current())throw stale();
  const references=new Map<string,string>();
  for(const id of privateArtReferences(bundle.scene)){
    const old=parsePrivateArtId(id)!;
    if(old.kind==='image')references.set(id,privateArtId({kind:'image',id:imported.drawingIds[old.id],sha256:old.sha256}));
    else{
      const rig=imported.rigs.find(rig=>rig.id===imported.rigIds[old.id])!;
      references.set(id,privateArtId({kind:'rig',id:rig.id,sha256:await assemblyHash(rig.assembly)}));
    }
  }
  if(!current())throw stale();
  const scene=bundle.scene;
  for(const slot of sceneAssetSlots(scene))slot.assetId=references.get(slot.assetId)||slot.assetId;
  remapArtOrigin(scene, id=>imported.drawingIds[id], id=>imported.rigIds[id]);
  return validateEditableProject(scene);
}

/** Imported assets receive new owner-local IDs. Original picture revisions
 * use their immutable content hash, which remains valid across a transfer. */
export function remapArtOrigin(scene:CreationProject, picture:(id:string)=>string|undefined, rig:(id:string)=>string|undefined) {
  const origin=scene.provenance;
  if(origin?.sourceKind!=='art')return;
  if(origin.sourceProjectId)origin.sourceProjectId=picture(origin.sourceProjectId)??origin.sourceProjectId;
  if(origin.sourceRevisionId)origin.sourceRevisionId=rig(origin.sourceRevisionId)??origin.sourceRevisionId;
}

/** Decoding is bounded and checked again after each asynchronous operation.
 * A rig is composited in its saved pose; the scene's blocks move the resulting
 * actor. Independent joints remain in the Drawing Lab and physical games. */
export async function resolvePrivateArt(owner:string,assetId:string,current:()=>boolean=()=>true):Promise<ResolvedPrivateArt> {
  const ref=parsePrivateArtId(assetId);
  if(!ref||!owner)throw Error('Choose available artwork from your own Art Studio.');
  if(!current())throw stale();
  const rig=ref.kind==='rig'?await rigById(owner,ref.id):null;
  if(!current())throw stale();
  if(rig&&await assemblyHash(rig.assembly)!==ref.sha256)throw Error('This saved art version has changed. Choose the exact version again in Art Studio.');
  if(!current())throw stale();
  const source=await drawing(owner,rig?rig.assembly.sourceId:ref.id);
  if(!current())throw stale();
  const expected=rig?rig.assembly.sourceSha256:ref.sha256;
  if(source.sha256!==expected||hex(await crypto.subtle.digest('SHA-256',source.bytes))!==expected)throw Error('The original drawing does not match this saved version.');
  if(!current())throw stale();
  const bitmap=await createImageBitmap(drawingBlob(source));
  try{
    if(!current())throw stale();
    if(bitmap.width<1||bitmap.height<1||bitmap.width>4096||bitmap.height>4096)throw Error('This drawing has unsupported dimensions.');
    const scale=Math.min(1,512/Math.max(bitmap.width,bitmap.height));
    const original=document.createElement('canvas');original.width=Math.max(1,Math.round(bitmap.width*scale));original.height=Math.max(1,Math.round(bitmap.height*scale));
    original.getContext('2d')!.drawImage(bitmap,0,0,original.width,original.height);
    let image=original;
    if(rig && rig.assembly.motion?.sprite!=='original'){
      image=document.createElement('canvas');image.width=original.width;image.height=original.height;
      const context=image.getContext('2d')!,sourcePixels=original.getContext('2d')!.getImageData(0,0,original.width,original.height);
      const mask=document.createElement('canvas');mask.width=original.width;mask.height=original.height;
      const maskContext=mask.getContext('2d',{willReadFrequently:true})!;let pixels:Uint8ClampedArray|undefined;
      for(const piece of rig.assembly.pieces){
        const region=piece.region,layer=layerCanvas(original,original.width,original.height,piece,rig.assembly.pieces);
        maskContext.clearRect(0,0,mask.width,mask.height);
        maskContext.drawImage(layer,region.x*image.width,region.y*image.height,region.w*image.width,region.h*image.height);
        pixels=unionOriginalArtPixels(sourcePixels.data,maskContext.getImageData(0,0,mask.width,mask.height).data,pixels);
      }
      const output=context.createImageData(image.width,image.height);if(pixels)output.data.set(pixels);context.putImageData(output,0,0);
    }
    return {assetId,drawingId:source.id,...(rig?{rigId:rig.id,motion:rig.assembly.motion}:{}),label:source.name,detail:rig?.assembly.motion?'Animation path':rig?'Saved cutout design':'Original artwork',image};
  }finally{bitmap.close();}
}

/** One view-scoped cache; profile/view changes invalidate in-flight decodes. */
export class PrivateArtResolver {
  private owner='';
  private epoch=0;
  private cache=new Map<string,ResolvedPrivateArt>();
  private pending=new Map<string,Promise<ResolvedPrivateArt>>();
  constructor(private currentOwner:()=>string){}
  private sync(){if(this.owner!==this.currentOwner()){this.clear();this.owner=this.currentOwner();}}
  clear(){this.epoch++;this.cache.clear();this.pending.clear();this.owner='';}
  get(id:string){this.sync();return this.cache.get(id);}
  load(id:string):Promise<ResolvedPrivateArt>{
    this.sync();
    const loaded=this.cache.get(id);if(loaded)return Promise.resolve(loaded);
    const existing=this.pending.get(id);if(existing)return existing;
    const owner=this.owner,epoch=this.epoch,current=()=>epoch===this.epoch&&owner===this.currentOwner();
    const pending=resolvePrivateArt(owner,id,current).then(result=>{
      if(!current())throw stale();
      if(this.cache.size>=32)this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(id,result);return result;
    }).finally(()=>{if(current())this.pending.delete(id);});
    this.pending.set(id,pending);return pending;
  }
}
