import {validateDrawingRig, type DrawingRig, type Material} from '../quality/parts';

/** Normalized 0–1 rectangles refer to the unmodified original image. */
export type DrawingKind = 'car' | 'character' | 'machine' | 'scene';
export type Role = 'body' | 'wheel' | 'limb' | 'wing' | 'propeller' | 'decoration' | 'platform' | 'obstacle' | 'collectible';
export type Region = {x:number;y:number;w:number;h:number;shape:'rect'|'ellipse'};
export interface DrawingPiece {
  id:string; name:string; role:Role; region:Region; parentId:string|null;
  /** A fixed layer follows its parent; a moving part receives an independent joint. */
  physical:boolean;
}
export interface DrawingAssembly {
  schemaVersion:1; sourceId:string; sourceSha256:string; kind:DrawingKind;
  pieces:DrawingPiece[]; notes:string; revision:number;
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
  if(!a||typeof a!=='object'||!allowed(a,['schemaVersion','sourceId','sourceSha256','kind','pieces','notes','revision'])||
    a.schemaVersion!==1||typeof a.sourceId!=='string'||a.sourceId.length>100||!a.sourceId||
    !/^[a-f0-9]{64}$/.test(a.sourceSha256)||!['car','character','machine','scene'].includes(a.kind)||
    !Array.isArray(a.pieces)||a.pieces.length<1||a.pieces.length>24||
    typeof a.notes!=='string'||a.notes.length>300||!Number.isInteger(a.revision)||a.revision<1||a.revision>10000)
    throw Error('Unsupported drawing design.');
  const ids=new Set<string>();
  for(const p of a.pieces){
    if(!p||typeof p!=='object'||!allowed(p,['id','name','role','region','parentId','physical'])||
      !ident(p.id)||ids.has(p.id)||typeof p.name!=='string'||!p.name||p.name.length>50||
      !roles.includes(p.role)||typeof p.physical!=='boolean'||(p.parentId!==null&&!ident(p.parentId)))
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
export interface VehicleDrawingGeometry {
  chassisWidth:number; chassisHeight:number;
  wheels:[{x:number;y:number;radius:number},{x:number;y:number;radius:number}];
}
/** Geometry is calibrated from the CHILD'S selected regions, not a stock car overlay. */
export function vehicleGeometry(input:DrawingAssembly):VehicleDrawingGeometry {
  const a=validateAssembly(input);
  if(a.kind!=='car')throw Error('This design is not a car.');
  const body=a.pieces.find(p=>p.role==='body'),wheels=a.pieces.filter(p=>p.role==='wheel').sort((l,r)=>center(l.region).x-center(r.region).x);
  if(!body||wheels.length!==2)throw Error('Choose one body and exactly two wheels before driving.');
  const b=center(body.region),scale=2.9/body.region.w;
  const offsets=wheels.map(p=>{
    const q=center(p.region);
    return {x:clamp((q.x-b.x)*scale,-1.75,1.75),y:clamp((q.y-b.y)*scale,-.2,1.4),
      radius:clamp(Math.min(p.region.w,p.region.h)*scale/2,.35,.8)};
  }) as VehicleDrawingGeometry['wheels'];
  if(offsets[1].x-offsets[0].x<.45)throw Error('Move the wheels farther apart to make a stable car.');
  return {chassisWidth:2.9,chassisHeight:clamp(body.region.h*scale,.55,1.75),wheels:offsets};
}
/** Verified game-runtime contract; images remain separate private assets. */
export function assemblyRig(input:DrawingAssembly):DrawingRig {
  const a=validateAssembly(input);
  const first=a.pieces.find(p=>p.role==='body')||a.pieces[0];
  const anchor=center(first.region),scale=2.9/first.region.w;
  const components=a.pieces.map(piece=>{
    const r=piece.region,c=center(r),width=clamp(r.w*scale,.15,8),height=clamp(r.h*scale,.15,8),wheel=piece.role==='wheel';
    const material:Material=wheel?'rubber':piece.role==='wing'?'fabric':piece.role==='platform'?'wood':'plastic';
    const part={
      schemaVersion:1 as const,id:piece.id,name:piece.name,spriteId:piece.id,width,height,
      mass:wheel?.7:piece.role==='decoration'?.5:1.6,material,
      friction:wheel?1.15:.65,restitution:.08,
      collider:wheel?{type:'circle' as const,radius:Math.min(width,height)/2}:{type:'box' as const,width,height},
      pivot:{x:0,y:0},
      attachments:[{id:'center',x:0,y:0,role:'mount' as const},{id:'axle',x:0,y:0,role:'axle' as const}],
    };
    return {id:piece.id,parentId:piece.parentId,part,offset:{x:clamp((c.x-anchor.x)*scale,-8,8),y:clamp((c.y-anchor.y)*scale,-8,8)},angle:0,physical:piece.physical};
  });
  const body=a.pieces.find(p=>p.role==='body');
  const bindings=body?a.pieces.filter(p=>p.role==='wheel'&&p.id!==body.id).map(p=>({
    a:body.id,b:p.id,attachmentA:'center',attachmentB:'axle',kind:'suspension' as const
  })):[];
  return validateDrawingRig({schemaVersion:1,id:'drawing_rig',components,bindings});
}
export function defaultAssembly(source:{id:string;sha256:string},kind:DrawingKind,regions:DrawingPiece[]):DrawingAssembly{
  return validateAssembly({schemaVersion:1,sourceId:source.id,sourceSha256:source.sha256,kind,pieces:regions,notes:'',revision:1});
}
