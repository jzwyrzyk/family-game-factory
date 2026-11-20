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
 // Hold the input alpha for explicit "bring it back" strokes; do not create
 // pixels not present in the original drawing.
 const originalAlpha=piece.maskStrokes?.length?new Uint8Array(canvas.width*canvas.height):null;
 if(originalAlpha)for(let i=0;i<originalAlpha.length;i++)originalAlpha[i]=d[i*4+3];
 // Find pale paper by sampling the original image BORDER. The original is never altered.
 // Only flood-connected background is removed: enclosed white details remain visible.
 const source=(image as HTMLCanvasElement).getContext?.('2d',{willReadFrequently:true});
 let paper:[number,number,number]=[255,255,255];
 if(source){
  const probes=[[1,1],[w-2,1],[1,h-2],[w-2,h-2],[w*.5,1],[w*.5,h-2],[1,h*.5],[w-2,h*.5]];
  const samples=probes.map(([x,y])=>Array.from(source.getImageData(Math.max(0,Math.min(w-1,Math.floor(x))),Math.max(0,Math.min(h-1,Math.floor(y))),1,1).data).slice(0,3));
  paper=[0,1,2].map(k=>samples.map(s=>s[k]).sort((a,b)=>a-b)[Math.floor(samples.length/2)]) as [number,number,number];
 }
 const eligible=paper.every(c=>c>=105);
 const W=canvas.width,H=canvas.height,seen=new Uint8Array(W*H),queue=new Int32Array(W*H);
 let head=0,tail=0;
 const isPaper=(index:number)=>{const p=index*4;
  return d[p+3]>0&&Math.hypot(d[p]-paper[0],d[p+1]-paper[1],d[p+2]-paper[2])<32;
 };
 const enqueue=(index:number)=>{if(index<0||index>=W*H||seen[index]||!isPaper(index))return;seen[index]=1;queue[tail++]=index;};
 if(eligible){
  for(let x=0;x<W;x++){enqueue(x);enqueue((H-1)*W+x);}
  for(let y=0;y<H;y++){enqueue(y*W);enqueue(y*W+W-1);}
  while(head<tail){
   const i=queue[head++],x=i%W,y=Math.floor(i/W);
   if(x>0)enqueue(i-1);if(x<W-1)enqueue(i+1);
   if(y>0)enqueue(i-W);if(y<H-1)enqueue(i+W);
  }
 }
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const i=y*W+x,p=i*4;
  if(seen[i])d[p+3]=0;
  if(piece.region.shape==='ellipse'){
    const nx=(x+.5)/W*2-1,ny=(y+.5)/H*2-1;
    if(nx*nx+ny*ny>1)d[p+3]=0;
  }
  if(piece.role==='body'){
   const ax=r.x+(x+.5)/W*r.w,ay=r.y+(y+.5)/H*r.h;
   for(const other of pieces)if(other.id!==piece.id&&other.role==='wheel'){
    const q=other.region,nx=(ax-q.x-q.w/2)/(q.w/2),ny=(ay-q.y-q.h/2)/(q.h/2);
    // Match the full selected outline. An inset hole leaves the outer tire
    // pixels on the chassis as well as on the independently moving wheel.
    if(q.shape==='ellipse'?nx*nx+ny*ny<=1:Math.abs(nx)<=1&&Math.abs(ny)<=1)d[p+3]=0;
   }
  }
 }
 if(originalAlpha&&piece.maskStrokes?.length){
  // A small browser canvas rasterizes the child-drawn brush paths. The last
  // matching stroke wins, while all geometry stays inside the selected region.
  const overlay=document.createElement('canvas');overlay.width=W;overlay.height=H;
  const brush=overlay.getContext('2d',{willReadFrequently:true})!;
  brush.lineCap='round';brush.lineJoin='round';
  for(const stroke of piece.maskStrokes){
   const color=stroke.action==='include'?'#00dd00':'#dd0000';
   const points=stroke.points.map(q=>({
     x:(q.x-r.x)/r.w*W,y:(q.y-r.y)/r.h*H
   }));
   brush.strokeStyle=color;brush.fillStyle=color;
   brush.lineWidth=Math.max(1,stroke.radius/r.w*W*2);
   brush.beginPath();brush.moveTo(points[0].x,points[0].y);
   for(const pt of points.slice(1))brush.lineTo(pt.x,pt.y);
   brush.stroke();
   brush.beginPath();brush.arc(points[0].x,points[0].y,brush.lineWidth/2,0,Math.PI*2);brush.fill();
  }
  const edits=brush.getImageData(0,0,W,H).data;
  for(let i=0;i<W*H;i++){
   const off=i*4;
   if(edits[off+3]<100)continue;
   d[off+3]=edits[off+1]>edits[off]?originalAlpha[i]:0;
  }
 }
 ctx.putImageData(pixels,0,0);return canvas;
}
