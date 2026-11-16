import {activeRig} from './store';
import {drawing,drawingBlob} from '../assets/private-drawings';
import {vehicleGeometry,type VehicleDrawingGeometry,type DrawingPiece} from './model';
import {layerCanvas} from './segmentation';

/** Private, reviewed, reconstituted art/physics. Never reads another profile's source. */
export interface DrawnCar {
  rigId:string; geometry:VehicleDrawingGeometry;
  pieces:{body:DrawingPiece;wheels:[DrawingPiece,DrawingPiece]};
  layers:Map<string,HTMLCanvasElement>;
}
export async function loadActiveCar(owner:string):Promise<DrawnCar|null>{
 if(!owner)return null;
 const saved=await activeRig(owner);if(!saved||saved.assembly.kind!=='car')return null;
 const source=await drawing(owner,saved.assembly.sourceId);
 if(source.sha256!==saved.assembly.sourceSha256)throw Error('The original drawing changed. Your ride is safe.');
 const bitmap=await createImageBitmap(drawingBlob(source));
 try{
  const scale=Math.min(1,768/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  canvas.getContext('2d')!.drawImage(bitmap,0,0,canvas.width,canvas.height);
  const parts=saved.assembly.pieces,body=parts.find(p=>p.role==='body'),wheels=parts.filter(p=>p.role==='wheel').sort((a,b)=>a.region.x-b.region.x);
  if(!body||wheels.length!==2)throw Error('This car needs a body and two wheels.');
  const layers=new Map<string,HTMLCanvasElement>();
  for(const p of [body,...wheels])layers.set(p.id,layerCanvas(canvas,canvas.width,canvas.height,p,parts));
  return {rigId:saved.id,geometry:vehicleGeometry(saved.assembly),pieces:{body,wheels:[wheels[0],wheels[1]]},layers};
 }finally{bitmap.close();}
}
