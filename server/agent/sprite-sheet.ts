import {createHash} from 'node:crypto';
import {deflateSync,inflateSync} from 'node:zlib';
import {inspectRaster,makeRasterAsset,type RasterAsset} from './game-assets';
import {readArtDirection,type ArtDirection} from '../quality/art-direction';
import {crc32} from './game-assets.cjs';

function chunk(name:string,data:Buffer){
 const out=Buffer.alloc(12+data.length);
 out.writeUInt32BE(data.length);out.write(name,4,'ascii');data.copy(out,8);
 out.writeUInt32BE(crc32(out,4,out.length-4),out.length-4);return out;
}
export function rgbaPng(width:number,height:number,rgba:Buffer){
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width>2048||height>2048||
   rgba.length!==width*height*4)throw Error('SHEET_DIMENSIONS');
 const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
 const stride=width*4,scan=Buffer.alloc((stride+1)*height);
 for(let y=0;y<height;y++)rgba.copy(scan,y*(stride+1)+1,y*stride,(y+1)*stride);
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(scan)),chunk('IEND',Buffer.alloc(0))]);
}
function paeth(a:number,b:number,c:number){
 const p=a+b-c,da=Math.abs(p-a),db=Math.abs(p-b),dc=Math.abs(p-c);
 return da<=db&&da<=dc?a:db<=dc?b:c;
}
function decode(bytes:Buffer,width:number,height:number){
 if(bytes[24]!==8||bytes[25]!==6||bytes[28]!==0)throw Error('SHEET_RGBA8_REQUIRED');
 const compressed=[];
 for(let pos=8;pos<bytes.length;){
  const size=bytes.readUInt32BE(pos),kind=bytes.toString('ascii',pos+4,pos+8);
  if(kind==='IDAT')compressed.push(bytes.subarray(pos+8,pos+8+size));
  else if(!['IHDR','IEND','sRGB','pHYs','gAMA','cHRM'].includes(kind))throw Error('SHEET_CHUNK_UNSUPPORTED');
  pos+=12+size;
 }
 const stride=width*4,stream=Buffer.concat(compressed);
 const result=inflateSync(stream,{maxOutputLength:(stride+1)*height,info:true}) as unknown as {buffer:Buffer;engine:{bytesWritten:number}};
 if(result.engine.bytesWritten!==stream.length)throw Error('SHEET_CHUNK_UNSUPPORTED');
 const raw=result.buffer;
 const pixels=Buffer.alloc(stride*height);
 for(let y=0;y<height;y++){
  const start=y*(stride+1),filter=raw[start];
  if(filter===0){raw.copy(pixels,y*stride,start+1,start+stride+1);continue;}
  for(let x=0;x<stride;x++){
   const i=y*stride+x,left=x>=4?pixels[i-4]:0,up=y?pixels[i-stride]:0,corner=x>=4&&y?pixels[i-stride-4]:0;
   const prediction=filter===1?left:filter===2?up:filter===3?Math.floor((left+up)/2):paeth(left,up,corner);
   pixels[i]=raw[start+1+x]+prediction;
  }
 }
 return pixels;
}
// A sheet cell must contain a single connected alpha silhouette with a clear gutter.
// Decorative detached particles belong to their own cell or to renderer effects.
function checkSilhouette(cell:Buffer,w:number,h:number){
 let count=0,start=-1,solid=0;
 for(let i=0;i<w*h;i++)if(cell[i*4+3]){
  const x=i%w,y=Math.floor(i/w);
  if(x===0||x===w-1||y===0||y===h-1)throw Error('SHEET_CLIPPED');
  count++;start=i;if(cell[i*4+3]>=128)solid++;
 }
 if(solid<Math.max(4,Math.ceil(w*h/256)))throw Error('SHEET_EMPTY');
 const seen=new Uint8Array(w*h),queue=new Int32Array(count);queue[0]=start;seen[start]=1;
 let size=1;
 for(let head=0;head<size;head++){
  const i=queue[head];
  for(const n of [i-1,i+1,i-w,i+w])if(!seen[n]&&cell[n*4+3]){seen[n]=1;queue[size++]=n;}
 }
 if(size!==count)throw Error('SHEET_AMBIGUOUS');
}
// Both SHA-256s fit the v1 sourceId field without truncation. The first binds the
// request, layout and cell ID. The second identifies the original sheet bytes.
function cellPrefix(source:string,direction:ArtDirection,id:string){
 return 'atlas1.'+createHash('sha256').update(JSON.stringify([source,direction,id])).digest('base64url')+'.';
}
export function reusableSheet(assets:RasterAsset[],direction:ArtDirection,source:string,sampling:RasterAsset['sampling']){
 let parent:string|undefined;
 return direction.subjects.filter(s=>s.supply==='sheet').every(s=>{
  const existing=assets.find(a=>a.id===s.id),prefix=cellPrefix(source,direction,s.id);
  if(!existing||existing.role!==s.role||existing.sampling!==sampling||existing.mime!=='image/png'||
    existing.width!==1024/direction.columns||existing.height!==1024/direction.rows||
    existing.provenance.kind!=='generated'||!existing.provenance.sourceId.startsWith(prefix))return false;
  const digest=existing.provenance.sourceId.slice(prefix.length);
  if(!/^[A-Za-z0-9_-]{43}$/.test(digest)||parent!==undefined&&parent!==digest)return false;
  parent=digest;return true;
 });
}
export function extractSheet(bytes:Buffer,direction:ArtDirection,provenance:RasterAsset['provenance'],sampling:RasterAsset['sampling']){
 const d=readArtDirection(direction),info=inspectRaster(bytes,'image/png');
 if(!d.sheetId||info.width%d.columns||info.height%d.rows)throw Error('SHEET_GRID_MISMATCH');
 const w=info.width/d.columns,h=info.height/d.rows;
 if(w<4||h<4)throw Error('SHEET_DIMENSIONS');
 const pixels=decode(bytes,info.width,info.height);
 return d.subjects.filter(s=>s.supply==='sheet').map((s,index)=>{
  const cell=Buffer.alloc(w*h*4),left=(index%d.columns)*w,top=Math.floor(index/d.columns)*h;
  for(let y=0;y<h;y++){
   const start=((top+y)*info.width+left)*4;pixels.copy(cell,y*w*4,start,start+w*4);
  }
  checkSilhouette(cell,w,h);
  return makeRasterAsset({id:s.id,role:s.role,mime:'image/png',bytes:rgbaPng(w,h,cell),sampling,
   provenance:{kind:provenance.kind,sourceId:cellPrefix(provenance.sourceId,d,s.id)+Buffer.from(info.sha256,'hex').toString('base64url')}});
 });
}
