import {activeRig,rigById} from './store';
import {drawing,drawingBlob,drawingHash} from '../assets/private-drawings';
import {vehicleGeometry,vehicleParts,type DrawingAssembly,type VehicleDrawingGeometry,type VehicleDrawingParts,type Region} from './model';
import {assemblyLayers} from './segmentation';

/** Private, reviewed, reconstituted art/physics. Never reads another profile's source. */
export interface CarArtwork {
  geometry:VehicleDrawingGeometry;
  sourceAspect:number;
  pieces:VehicleDrawingParts;
  layers:Map<string,HTMLCanvasElement>;
  chassis:{canvas:HTMLCanvasElement;region:Region};
}
export interface DrawnCar extends CarArtwork {rigId:string}

/** Union the selected original pixels; overlapping translucent decorations never darken. */
export function createCarArtwork(assembly:DrawingAssembly,source:HTMLCanvasElement,sourceAspect=source.width/source.height):CarArtwork {
 const geometry=vehicleGeometry(assembly,sourceAspect),pieces=vehicleParts(assembly),layers=assemblyLayers(source,assembly);
 const body=pieces.body;
 if(!pieces.decorations.length)return {geometry,sourceAspect,pieces,layers,chassis:{canvas:layers.get(body.id)!,region:body.region}};
 const fixed=[body,...pieces.decorations],W=source.width,H=source.height;
 const x=Math.max(0,Math.floor(Math.min(...fixed.map(p=>p.region.x))*W));
 const y=Math.max(0,Math.floor(Math.min(...fixed.map(p=>p.region.y))*H));
 const right=Math.min(W,Math.ceil(Math.max(...fixed.map(p=>p.region.x+p.region.w))*W));
 const bottom=Math.min(H,Math.ceil(Math.max(...fixed.map(p=>p.region.y+p.region.h))*H));
 const canvas=document.createElement('canvas'),mask=document.createElement('canvas');
 canvas.width=mask.width=right-x;canvas.height=mask.height=bottom-y;
 const out=canvas.getContext('2d',{willReadFrequently:true})!,scratch=mask.getContext('2d',{willReadFrequently:true})!;
 out.drawImage(source,x,y,canvas.width,canvas.height,0,0,canvas.width,canvas.height);
 const pixels=out.getImageData(0,0,canvas.width,canvas.height),alpha=new Uint8ClampedArray(canvas.width*canvas.height);
 for(const piece of fixed){
  const r=piece.region;scratch.clearRect(0,0,mask.width,mask.height);
  scratch.drawImage(layers.get(piece.id)!,r.x*W-x,r.y*H-y,r.w*W,r.h*H);
  const cutout=scratch.getImageData(0,0,mask.width,mask.height).data;
  for(let i=0;i<alpha.length;i++)alpha[i]=Math.max(alpha[i],cutout[i*4+3]);
 }
 for(let i=0;i<alpha.length;i++)pixels.data[i*4+3]=Math.min(pixels.data[i*4+3],alpha[i]);
 out.putImageData(pixels,0,0);
 return {geometry,sourceAspect,pieces,layers,chassis:{canvas,region:{x:x/W,y:y/H,w:canvas.width/W,h:canvas.height/H,shape:'rect'}}};
}

/** The caller supplies the physical chassis pose. Decorations share its transform. */
export function drawCarBody(ctx:CanvasRenderingContext2D,art:CarArtwork,width:number,height:number){
 const b=art.pieces.body.region,r=art.chassis.region;
 ctx.drawImage(art.chassis.canvas,(r.x-b.x-b.w/2)/b.w*width,(r.y-b.y-b.h/2)/b.h*height,
   r.w/b.w*width,r.h/b.h*height);
}
/** The round collider fits inside the selected wheel. Its artwork keeps the
 * source proportions, including an oval or rectangular selected outline. */
export function drawCarWheel(ctx:CanvasRenderingContext2D,art:CarArtwork,index:0|1,diameter:number){
 const piece=art.pieces.wheels[index],sprite=art.layers.get(piece.id)!;
 const scale=art.geometry.chassisWidth/art.pieces.body.region.w;
 const ratio=diameter/(art.geometry.wheels[index].radius*2);
 const width=piece.region.w*scale*ratio,height=piece.region.h/art.sourceAspect*scale*ratio;
 ctx.drawImage(sprite,-width/2,-height/2,width,height);
}
export async function loadDrawnCar(owner:string,rigId:string):Promise<DrawnCar>{
 if(!owner||!rigId)throw Error('Choose a saved car from this profile.');
 const saved=await rigById(owner,rigId);if(saved.assembly.kind!=='car')throw Error('This saved drawing is not a car.');
 const source=await drawing(owner,saved.assembly.sourceId);
 if(source.sha256!==saved.assembly.sourceSha256 || await drawingHash(source.bytes)!==source.sha256)throw Error('The original drawing changed. Your ride is safe.');
 const bitmap=await createImageBitmap(drawingBlob(source));
 try{
  const scale=Math.min(1,768/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  canvas.getContext('2d')!.drawImage(bitmap,0,0,canvas.width,canvas.height);
  return {rigId:saved.id,...createCarArtwork(saved.assembly,canvas,bitmap.width/bitmap.height)};
 }finally{bitmap.close();}
}

/** Legacy picker convenience only. A saved game must call loadDrawnCar with its pinned ID. */
export async function loadActiveCar(owner:string):Promise<DrawnCar|null>{
 if(!owner)return null;
 const saved=await activeRig(owner);return saved?loadDrawnCar(owner,saved.id):null;
}
