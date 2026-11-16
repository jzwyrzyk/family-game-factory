import {type DrawingPiece,type Region,type DrawingKind} from './model';

/** Conservative, offline suggestions. This is geometry/contrast analysis, not semantic AI recognition. */
export interface Proposal {pieces:DrawingPiece[]; method:'image-contrast'|'layout-guess'|'foreground'; explanation:string}
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const region=(x:number,y:number,w:number,h:number,shape:'rect'|'ellipse'='rect'):Region=>{
 const a=clamp(x,0,.96),b=clamp(y,0,.96);
 return {x:a,y:b,w:clamp(w,.025,1-a),h:clamp(h,.025,1-b),shape};
};
export function sampleInk(data:ImageData){
 const {width:w,height:h}=data,raw=data.data;
 const indexes=[0,4*(w-1),4*w*(h-1),4*(w*h-1)];
 const bg=[0,1,2].map(k=>indexes.reduce((t,i)=>t+raw[i+k],0)/indexes.length);
 const ink=new Uint8Array(w*h);let minX=w,minY=h,maxX=0,maxY=0,count=0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=y*w+x,p=i*4,d=Math.hypot(raw[p]-bg[0],raw[p+1]-bg[1],raw[p+2]-bg[2]);
  if(raw[p+3]>60&&d>46){ink[i]=1;count++;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
 }
 return {ink,bg,bounds:count>40?region(Math.max(0,minX/w-.02),Math.max(0,minY/h-.02),Math.min(1,(maxX-minX+1)/w+.04),Math.min(1,(maxY-minY+1)/h+.04)):region(.07,.1,.86,.8),count};
}
function wheelCandidates(data:ImageData,ink:Uint8Array){
 const {width:w,height:h}=data,raw=data.data,candidates:{x:number;y:number;r:number;score:number}[]=[];
 const stride=Math.max(3,Math.floor(w/64)),radii=[.045,.06,.075,.09,.11].map(v=>Math.max(4,Math.round(v*w)));
 for(const r of radii)for(let y=Math.round(h*.48);y<Math.min(h-r,h*.95);y+=stride){
  for(let x=r;x<w-r;x+=stride){
   let ring=0,filled=0;
   for(let t=0;t<20;t++){const a=2*Math.PI*t/20,xx=Math.round(x+Math.cos(a)*r),yy=Math.round(y+Math.sin(a)*r);
    if(xx>=0&&yy>=0&&xx<w&&yy<h)ring+=ink[yy*w+xx];
   }
   for(let t=0;t<9;t++){const a=2*Math.PI*t/9,xx=Math.round(x+Math.cos(a)*r*.45),yy=Math.round(y+Math.sin(a)*r*.45);
    if(xx>=0&&yy>=0&&xx<w&&yy<h)filled+=ink[yy*w+xx];
   }
   const score=ring/20*.8+filled/9*.2;
   if(score>.53)candidates.push({x,y,r,score});
  }
 }
 candidates.sort((a,b)=>b.score-a.score);
 const selected:typeof candidates=[];
 for(const c of candidates){
   if(selected.every(p=>Math.abs(p.x-c.x)>Math.max(p.r,c.r)*1.7&&Math.abs(p.y-c.y)<h*.22))selected.push(c);
   if(selected.length===2)break;
 }
 if(selected.length===2)selected.sort((a,b)=>a.x-b.x);
 return selected;
}
export function suggestParts(data:ImageData,kind:DrawingKind):Proposal{
 const {bounds,ink}=sampleInk(data);
 if(kind==='car'){
  const wheels=wheelCandidates(data,ink);
  const detected=wheels.length===2&&wheels[1].x-wheels[0].x>data.width*.17;
  const w=detected?wheels.map(c=>region((c.x-c.r*1.12)/data.width,(c.y-c.r*1.12)/data.height,c.r*2.24/data.width,c.r*2.24/data.height,'ellipse')):[
    region(bounds.x+bounds.w*.12,bounds.y+bounds.h*.65,bounds.w*.22,bounds.w*.22*data.width/data.height,'ellipse'),
    region(bounds.x+bounds.w*.66,bounds.y+bounds.h*.65,bounds.w*.22,bounds.w*.22*data.width/data.height,'ellipse')
  ];
  const body=region(bounds.x,bounds.y,bounds.w,Math.max(.1,Math.min(bounds.h*.76,.72)));
  return {method:detected?'image-contrast':'layout-guess',explanation:detected?'I spotted two wheel-like shapes. Please check them.':'I made a starting guess. Move the circles onto your wheels.',
    pieces:[
      {id:'car_body',name:'Car body',role:'body',region:body,parentId:null,physical:true},
      {id:'back_wheel',name:'Back wheel',role:'wheel',region:w[0],parentId:'car_body',physical:true},
      {id:'front_wheel',name:'Front wheel',role:'wheel',region:w[1],parentId:'car_body',physical:true},
    ]};
 }
 return {method:'foreground',explanation:'Here is the whole drawing. Add and name moving parts if it has them.',
   pieces:[{id:'main_body',name:'My drawing',role:'body',region:bounds,parentId:null,physical:true}]};
}
/** Extract pixels belonging to ONE component, leaving everything else transparent.
 * The body is explicitly punched out beneath separately moving wheel layers.
 * Segmentation boundaries are editable proposals; the original is never modified.
 */
export function layerCanvas(image:CanvasImageSource,w:number,h:number,piece:DrawingPiece,pieces:DrawingPiece[]){
 const r=piece.region,canvas=document.createElement('canvas');
 canvas.width=Math.max(1,Math.ceil(r.w*w));canvas.height=Math.max(1,Math.ceil(r.h*h));
 const ctx=canvas.getContext('2d',{willReadFrequently:true})!;
 ctx.drawImage(image,r.x*w,r.y*h,r.w*w,r.h*h,0,0,canvas.width,canvas.height);
 const pixels=ctx.getImageData(0,0,canvas.width,canvas.height),d=pixels.data;
 // Estimate the paper/background from the full source outside the crop at integration.
 // For V1 pale paper near white is removed; complex photo backgrounds need guided correction.
 for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){
  const i=(y*canvas.width+x)*4,rr=d[i],g=d[i+1],b=d[i+2];
  const brightness=Math.min(rr,g,b),spread=Math.max(rr,g,b)-brightness;
  if(brightness>245&&spread<17)d[i+3]=0;
  if(piece.region.shape==='ellipse'){
    const nx=(x+.5)/canvas.width*2-1,ny=(y+.5)/canvas.height*2-1;
    if(nx*nx+ny*ny>1)d[i+3]=0;
  }
  if(piece.role==='body'){
   const ax=(r.x+(x+.5)/canvas.width*r.w),ay=(r.y+(y+.5)/canvas.height*r.h);
   for(const other of pieces)if(other.id!==piece.id&&other.role==='wheel'){
    const q=other.region,nx=(ax-q.x-q.w/2)/(q.w/2),ny=(ay-q.y-q.h/2)/(q.h/2);
    if(nx*nx+ny*ny<.92)d[i+3]=0;
   }
  }
 }
 ctx.putImageData(pixels,0,0);return canvas;
}
