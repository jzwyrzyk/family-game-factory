import {validateMotion, type DrawingMotion} from './motion';
import {validateDrawingRig, type DrawingRig, type Material} from '../quality/parts';

/** Normalized 0–1 rectangles refer to the unmodified original image. */
export type DrawingKind = 'picture' | 'car' | 'character' | 'machine' | 'scene';
export type Role = 'body' | 'wheel' | 'limb' | 'wing' | 'propeller' | 'decoration' | 'platform' | 'obstacle' | 'collectible';
export type Region = {x:number;y:number;w:number;h:number;shape:'rect'|'ellipse'};
/** Non-destructive manual alpha correction. Coordinates use the unchanged original. */
export interface MaskStroke {
  action:'include'|'exclude';radius:number;points:{x:number;y:number}[];
}
export interface DrawingPiece {
  id:string; name:string; role:Role; region:Region; parentId:string|null;
  /** A fixed layer follows its parent; a moving part receives an independent joint. */
  physical:boolean;
  /** Optional hinge/pivot location within this piece: fractions 0–1, default center. */
  pivot?:{x:number;y:number};
  /** Explicit finger/mouse mask edits; original source pixels are never altered. */
  maskStrokes?:MaskStroke[];
}
export interface DrawingAssembly {
  schemaVersion:1; sourceId:string; sourceSha256:string; kind:DrawingKind;
  pieces:DrawingPiece[]; notes:string; revision:number; motion?:DrawingMotion;
  cutoutMode?:'selected-parts';
}
const isNumber=(v:unknown)=>typeof v==='number'&&Number.isFinite(v);
const ident=(v:unknown)=>typeof v==='string'&&/^[a-z][a-z0-9_-]{0,39}$/.test(v);
const allowed=(v:object,keys:string[])=>Object.keys(v).every(k=>keys.includes(k));
const roles:Role[]=['body','wheel','limb','wing','propeller','decoration','platform','obstacle','collectible'];
export function validRegion(v:unknown):Region {
  const r=v as Region;
  if(!r||typeof r!=='object'||!allowed(r,['x','y','w','h','shape'])||![r.x,r.y,r.w,r.h].every(isNumber)||
    r.x<0||r.y<0||r.w<.025||r.h<.025||r.x+r.w>1.00001||r.y+r.h>1.00001||
    !['rect','ellipse'].includes(r.shape))throw Error('Invalid drawing piece outline.');
  return {...r};
}
export function validateAssembly(value:unknown):DrawingAssembly {
  const a=value as DrawingAssembly;
  if(!a||typeof a!=='object'||!allowed(a,['schemaVersion','sourceId','sourceSha256','kind','pieces','notes','revision','motion','cutoutMode'])||
    a.schemaVersion!==1||(a.cutoutMode!==undefined&&a.cutoutMode!=='selected-parts')||typeof a.sourceId!=='string'||a.sourceId.length>100||!a.sourceId||
    !/^[a-f0-9]{64}$/.test(a.sourceSha256)||!['picture','car','character','machine','scene'].includes(a.kind)||
    !Array.isArray(a.pieces)||a.pieces.length<1||a.pieces.length>24||
    typeof a.notes!=='string'||a.notes.length>300||!Number.isInteger(a.revision)||a.revision<1||a.revision>10000)
    throw Error('Unsupported drawing design.');
  if(a.motion!==undefined)validateMotion(a.motion);
  const ids=new Set<string>();
  for(const p of a.pieces){
    if(!p||typeof p!=='object'||!allowed(p,['id','name','role','region','parentId','physical','pivot','maskStrokes'])||
      !ident(p.id)||ids.has(p.id)||typeof p.name!=='string'||!p.name||p.name.length>50||
      !roles.includes(p.role)||typeof p.physical!=='boolean'||(p.parentId!==null&&!ident(p.parentId))||
      (p.pivot!==undefined&&(!p.pivot||typeof p.pivot!=='object'||!allowed(p.pivot,['x','y'])||
      !isNumber(p.pivot.x)||!isNumber(p.pivot.y)||p.pivot.x<0||p.pivot.x>1||p.pivot.y<0||p.pivot.y>1))||
      (p.maskStrokes!==undefined&&(!Array.isArray(p.maskStrokes)||p.maskStrokes.length>48||
        p.maskStrokes.some(stroke=>!stroke||typeof stroke!=='object'||!allowed(stroke,['action','radius','points'])||
          !['include','exclude'].includes(stroke.action)||!isNumber(stroke.radius)||stroke.radius<.002||stroke.radius>.08||
          !Array.isArray(stroke.points)||stroke.points.length<1||stroke.points.length>128||
          stroke.points.some(q=>!q||typeof q!=='object'||!allowed(q,['x','y'])||!isNumber(q.x)||!isNumber(q.y)||
            q.x<0||q.x>1||q.y<0||q.y>1)))))
      throw Error('Invalid drawing component.');
    ids.add(p.id);validRegion(p.region);
  }
  for(const p of a.pieces){
    let parent=p.parentId;const seen=new Set([p.id]);
    while(parent!==null){
      if(seen.has(parent))throw Error('Drawing parts cannot parent themselves.');
      seen.add(parent);
      const node=a.pieces.find(q=>q.id===parent);
      if(!node)throw Error('Missing drawing parent.');
      parent=node.parentId;
    }
  }
  return structuredClone(a);
}
const center=(r:Region)=>({x:r.x+r.w/2,y:r.y+r.h/2});
const clamp=(v:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,v));
const precise=(value:number)=>Math.round(value*1e12)/1e12;
function imageAspect(value:number){
  if(!Number.isFinite(value)||value<=0)throw Error('This picture has unsupported dimensions.');
  return value;
}
function faithfulScale(wanted:number,min:number,max:number,message:string){
  if(![wanted,min,max].every(Number.isFinite)||min>max+1e-10)throw Error(message);
  return clamp(wanted,min,max);
}
export interface VehicleDrawingGeometry {
  chassisWidth:number; chassisHeight:number;
  wheels:[{x:number;y:number;radius:number},{x:number;y:number;radius:number}];
}
/** Rally has three physical bodies. Fixed decorations are part of its chassis art. */
export interface VehicleDrawingParts {
  body:DrawingPiece; wheels:[DrawingPiece,DrawingPiece]; decorations:DrawingPiece[];
}
export function vehicleParts(input:DrawingAssembly):VehicleDrawingParts {
  const a=validateAssembly(input);
  if(a.kind!=='car')throw Error('This design is not a car.');
  const bodies=a.pieces.filter(p=>p.role==='body');
  const wheels=a.pieces.filter(p=>p.role==='wheel').sort((l,r)=>center(l.region).x-center(r.region).x);
  if(bodies.length!==1||wheels.length!==2)throw Error('Choose exactly one body and two wheels before driving.');
  const body=bodies[0];
  if(!body.physical||body.parentId!==null||wheels.some(p=>!p.physical||p.parentId!==body.id))
    throw Error('The car body must be the main part, with both moving wheels attached to it.');
  const decorations=a.pieces.filter(p=>p.role!=='body'&&p.role!=='wheel');
  if(decorations.some(p=>p.role!=='decoration'||p.physical||p.parentId!==body.id))
    throw Error('For Rally, extra pieces must be Decorations attached to the body. Use a Character or Machine for extra moving parts.');
  return {body,wheels:[wheels[0],wheels[1]],decorations};
}
/** Pass original image WIDTH / HEIGHT for faithful source geometry. The omitted
 * aspect retains the original normalized calibration for legacy structural callers. */
export function vehicleGeometry(input:DrawingAssembly,sourceAspect?:number):VehicleDrawingGeometry {
  const {body,wheels}=vehicleParts(input);
  if(sourceAspect!==undefined){
    const aspect=imageAspect(sourceAspect),b=center(body.region),height=body.region.h/aspect;
    const outlines=wheels.map(piece=>{
      const c=center(piece.region);
      return {x:c.x-b.x,y:(c.y-b.y)/aspect,radius:Math.min(piece.region.w,piece.region.h/aspect)/2};
    });
    const separation=outlines[1].x-outlines[0].x;
    if(separation<=0)throw Error('Move the wheels farther apart to make a stable car.');
    let min=Math.max(1/body.region.w,.5/height,.45/separation);
    let max=Math.min(4/body.region.w,2/height);
    for(const wheel of outlines){
      min=Math.max(min,.35/wheel.radius);max=Math.min(max,.8/wheel.radius);
      if(wheel.x)max=Math.min(max,1.75/Math.abs(wheel.x));
      if(wheel.y<0)max=Math.min(max,.2/-wheel.y);
      else if(wheel.y>0)max=Math.min(max,1.4/wheel.y);
    }
    const wanted=clamp(body.region.w/.72*2.9,1.65,3.7)/body.region.w;
    const scale=faithfulScale(wanted,min,max,'These outlines cannot keep their proportions in Rally yet. Check the body and wheel outlines, or use a Machine for this design.');
    return {chassisWidth:precise(body.region.w*scale),chassisHeight:precise(height*scale),
      wheels:outlines.map(wheel=>({x:precise(wheel.x*scale),y:precise(wheel.y*scale),radius:precise(wheel.radius*scale)})) as VehicleDrawingGeometry['wheels']};
  }
  // Both the body's visible shape and its selected wheel regions govern physics.
  // Normalize against the reviewed starter's body coverage, then bound the size.
  const chassisWidth=clamp(body.region.w/.72*2.9,1.65,3.7);
  const b=center(body.region),scale=chassisWidth/body.region.w;
  const offsets=wheels.map(p=>{
    const q=center(p.region);
    return {x:clamp((q.x-b.x)*scale,-1.75,1.75),y:clamp((q.y-b.y)*scale,-.2,1.4),
      radius:clamp(Math.min(p.region.w,p.region.h)*scale/2,.35,.8)};
  }) as VehicleDrawingGeometry['wheels'];
  if(offsets[1].x-offsets[0].x<.45)throw Error('Move the wheels farther apart to make a stable car.');
  return {chassisWidth,chassisHeight:clamp(body.region.h*scale,.55,1.75),wheels:offsets};
}
/** Verified game-runtime contract; images remain separate private assets. */
export function assemblyRig(input:DrawingAssembly,sourceAspect?:number):DrawingRig {
  const a=validateAssembly(input);
  if(a.cutoutMode==='selected-parts'){
    if(!a.pieces.some(piece=>piece.physical))throw Error('Choose one main body to try the parts.');
    for(const piece of a.pieces){
      if(!['wheel','wing','limb','propeller'].includes(piece.role))continue;
      let parent=a.pieces.find(candidate=>candidate.id===piece.parentId);
      while(parent&&!parent.physical)parent=a.pieces.find(candidate=>candidate.id===parent!.parentId);
      if(!parent||!piece.physical)throw Error('Attach the moving piece to a body in Refine cutouts & hinges.');
    }
  }
  const first=a.pieces.find(p=>p.role==='body')||a.pieces[0];
  const anchor=center(first.region),aspect=sourceAspect===undefined?1:imageAspect(sourceAspect);
  let scale=2.9/first.region.w;
  if(sourceAspect!==undefined){
    let min=0,max=Infinity;
    for(const piece of a.pieces){
      const r=piece.region,c=center(r),height=r.h/aspect,dx=c.x-anchor.x,dy=(c.y-anchor.y)/aspect;
      min=Math.max(min,.15/r.w,.15/height);max=Math.min(max,8/r.w,8/height);
      if(dx)max=Math.min(max,8/Math.abs(dx));if(dy)max=Math.min(max,8/Math.abs(dy));
    }
    scale=faithfulScale(scale,min,max,'These outlines have very different sizes. Make the tiny pieces larger or split this drawing into two designs.');
  }
  const components=a.pieces.map(piece=>{
    const r=piece.region,c=center(r),width=sourceAspect===undefined?clamp(r.w*scale,.15,8):precise(r.w*scale),
      height=sourceAspect===undefined?clamp(r.h*scale,.15,8):precise(r.h/aspect*scale),wheel=piece.role==='wheel';
    const material:Material=wheel?'rubber':piece.role==='wing'?'fabric':piece.role==='platform'?'wood':'plastic';
    const pivot={x:((piece.pivot?.x??.5)-.5)*width,y:((piece.pivot?.y??.5)-.5)*height};
    const part={
      schemaVersion:1 as const,id:piece.id,name:piece.name,spriteId:piece.id,width,height,
      mass:wheel?.7:piece.role==='decoration'?.5:1.6,material,
      friction:wheel?1.15:.65,restitution:.08,
      collider:wheel?{type:'circle' as const,radius:Math.min(width,height)/2}:{type:'box' as const,width,height},
      pivot,
      attachments:[{id:'center',x:0,y:0,role:'mount' as const},{id:'axle',x:0,y:0,role:'axle' as const},
        {id:'pivot',x:pivot.x,y:pivot.y,role:'axle' as const}],
    };
    return {id:piece.id,parentId:piece.parentId,part,offset:{
      x:sourceAspect===undefined?clamp((c.x-anchor.x)*scale,-8,8):precise((c.x-anchor.x)*scale),
      y:sourceAspect===undefined?clamp((c.y-anchor.y)*scale,-8,8):precise((c.y-anchor.y)/aspect*scale)},angle:0,physical:piece.physical};
  });
  const body=a.pieces.find(p=>p.role==='body');
  const bindings=a.pieces.filter(p=>p.parentId!==null).map(p=>({
    a:p.parentId!,b:p.id,attachmentA:'center',attachmentB:p.role==='wheel'?'axle':'pivot',
    kind:(p.role==='wheel'?'suspension':p.role==='limb'||p.role==='wing'||p.role==='propeller'?'axle':'fixed') as 'fixed'|'axle'|'suspension'
  }));
  return validateDrawingRig({schemaVersion:1,id:'drawing_rig',components,bindings});
}
export function defaultAssembly(source:{id:string;sha256:string},kind:DrawingKind,regions:DrawingPiece[]):DrawingAssembly{
  return validateAssembly({schemaVersion:1,sourceId:source.id,sourceSha256:source.sha256,kind,pieces:regions,notes:'',revision:1});
}
