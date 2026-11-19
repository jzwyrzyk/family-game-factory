// Trusted raster packaging, shared by the private builder, credential-free gate and preview.
// Assets are data, never generated JavaScript, HTML, SVG or network locations.
const {createHash}=require('node:crypto');
const {inflateSync}=require('node:zlib');
const ASSET_LIMITS=Object.freeze({count:8,bytes:2*1024*1024,totalBytes:2*1024*1024,dimension:2048,pixels:8*1024*1024});
const VISUAL_STYLES=Object.freeze(['pixel','flat-2d','illustrated','dimensional','realistic']);
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const CRC_TABLE=Uint32Array.from({length:256},(_,value)=>{let crc=value;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);return crc>>>0;});
function crc32(bytes,start,end){let crc=0xffffffff;for(let i=start;i<end;i++)crc=(crc>>>8)^CRC_TABLE[(crc^bytes[i])&255];return (crc^0xffffffff)>>>0;}
const assetId=value=>typeof value==='string'&&/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/.test(value);
function record(value,keys){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key)))throw Error('ASSET_MANIFEST_REJECTED');
 for(const key of Object.keys(value))if(!Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'))throw Error('ASSET_MANIFEST_REJECTED');
 return value;
}
/** Identify actual raster format/dimensions without decoding unbounded image data. The browser
 * independently decodes and checks dimensions before enabling Play. Animated formats are rejected. */
function inspectRaster(value,mime){
 const bytes=Buffer.isBuffer(value)?value:Buffer.from(value);
 if(bytes.length<20||bytes.length>ASSET_LIMITS.bytes)throw Error('ASSET_BYTES_LIMIT');
 let width=0,height=0;
 if(mime==='image/png'){
  if(!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('ASSET_FORMAT_REJECTED');
  let offset=8,header=false,end=false,chunks=0,depth=0,channels=0,interlace=0;const compressed=[];
  while(offset+12<=bytes.length){
   if(++chunks>128)throw Error('ASSET_FORMAT_REJECTED');
   const length=bytes.readUInt32BE(offset),kind=bytes.toString('ascii',offset+4,offset+8);
   if(length>ASSET_LIMITS.bytes||offset+length+12>bytes.length||!/^\w{4}$/.test(kind))throw Error('ASSET_FORMAT_REJECTED');
   if(crc32(bytes,offset+4,offset+8+length)!==bytes.readUInt32BE(offset+8+length))throw Error('ASSET_PNG_INTEGRITY_FAILED');
   if(!header){
    if(kind!=='IHDR'||length!==13)throw Error('ASSET_FORMAT_REJECTED');width=bytes.readUInt32BE(offset+8);height=bytes.readUInt32BE(offset+12);depth=bytes[offset+16];const color=bytes[offset+17];
    const types={0:{channels:1,depths:[1,2,4,8,16]},2:{channels:3,depths:[8,16]},3:{channels:1,depths:[1,2,4,8]},4:{channels:2,depths:[8,16]},6:{channels:4,depths:[8,16]}};
    if(!types[color]||!types[color].depths.includes(depth)||bytes[offset+18]!==0||bytes[offset+19]!==0||bytes[offset+20]>1)throw Error('ASSET_FORMAT_REJECTED');channels=types[color].channels;interlace=bytes[offset+20];header=true;
    if(width<1||height<1||width>ASSET_LIMITS.dimension||height>ASSET_LIMITS.dimension)throw Error('ASSET_DIMENSIONS_REJECTED');
   }
   else if(kind==='IHDR')throw Error('ASSET_FORMAT_REJECTED');
   if(['acTL','fcTL','fdAT'].includes(kind))throw Error('ANIMATED_ASSET_REJECTED');
   if(kind==='IDAT')compressed.push(bytes.subarray(offset+8,offset+8+length));
   offset+=length+12;
   if(kind==='IEND'){if(length!==0||offset!==bytes.length)throw Error('ASSET_FORMAT_REJECTED');end=true;break;}
  }
  if(!header||!end||!compressed.length)throw Error('ASSET_FORMAT_REJECTED');
  // Chromium tolerates some corrupt PNG streams. Validate complete bounded scanlines ourselves,
  // including Adam7 passes, instead of treating header/onload as proof of valid pixels.
  const passes=interlace?[[0,0,8,8],[4,0,8,8],[0,4,4,8],[2,0,4,4],[0,2,2,4],[1,0,2,2],[0,1,1,2]]:[[0,0,1,1]];
  const rows=passes.map(([x,y,dx,dy])=>{const w=Math.max(0,Math.ceil((width-x)/dx)),h=Math.max(0,Math.ceil((height-y)/dy));return {bytes:1+Math.ceil(w*depth*channels/8),height:w?h:0};});
  const expected=rows.reduce((sum,row)=>sum+row.bytes*row.height,0);let raw;
  try{raw=inflateSync(Buffer.concat(compressed),{maxOutputLength:expected});}catch{throw Error('ASSET_PNG_INTEGRITY_FAILED');}
  if(raw.length!==expected)throw Error('ASSET_PNG_INTEGRITY_FAILED');
  let scanline=0;for(const row of rows)for(let i=0;i<row.height;i++){if(raw[scanline]>4)throw Error('ASSET_PNG_INTEGRITY_FAILED');scanline+=row.bytes;}
 }else if(mime==='image/webp'){
  if(bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WEBP'||bytes.readUInt32LE(4)+8!==bytes.length)throw Error('ASSET_FORMAT_REJECTED');
  let offset=12,frames=0,chunks=0,frameWidth=0,frameHeight=0,extended=false;
  while(offset+8<=bytes.length){
   if(++chunks>32)throw Error('ASSET_FORMAT_REJECTED');
   const kind=bytes.toString('ascii',offset,offset+4),length=bytes.readUInt32LE(offset+4),start=offset+8;
   if(length>ASSET_LIMITS.bytes||start+length+(length%2)>bytes.length)throw Error('ASSET_FORMAT_REJECTED');
   if(kind==='ANIM'||kind==='ANMF')throw Error('ANIMATED_ASSET_REJECTED');
   if(kind==='VP8X'){
    if(extended||offset!==12||length!==10)throw Error('ASSET_FORMAT_REJECTED');
    if(bytes[start]&2)throw Error('ANIMATED_ASSET_REJECTED');
    width=bytes.readUIntLE(start+4,3)+1;height=bytes.readUIntLE(start+7,3)+1;extended=true;
   }else if(kind==='VP8L'){
    if(length<5||bytes[start]!==0x2f)throw Error('ASSET_FORMAT_REJECTED');
    const bits=bytes.readUInt32LE(start+1);frameWidth=(bits&0x3fff)+1;frameHeight=((bits>>>14)&0x3fff)+1;frames++;
   }else if(kind==='VP8 '){
    if(length<10||bytes[start+3]!==0x9d||bytes[start+4]!==1||bytes[start+5]!==0x2a)throw Error('ASSET_FORMAT_REJECTED');
    frameWidth=bytes.readUInt16LE(start+6)&0x3fff;frameHeight=bytes.readUInt16LE(start+8)&0x3fff;frames++;
   }else if(!['ALPH','ICCP','EXIF','XMP '].includes(kind))throw Error('ASSET_FORMAT_REJECTED');
   offset=start+length+(length%2);
  }
  if(offset!==bytes.length||frames!==1)throw Error('ASSET_FORMAT_REJECTED');
  if(extended&&(width!==frameWidth||height!==frameHeight))throw Error('ASSET_DIMENSIONS_REJECTED');
  width=frameWidth;height=frameHeight;
 }else throw Error('ASSET_FORMAT_REJECTED');
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>ASSET_LIMITS.dimension||height>ASSET_LIMITS.dimension)throw Error('ASSET_DIMENSIONS_REJECTED');
 return {width,height,bytes:bytes.length,sha256:sha256(bytes)};
}
function validateAssetPack(value){
 const pack=record(value,['version','style','assets']);
 if(pack.version!=='game-assets-v1'||!VISUAL_STYLES.includes(pack.style)||!Array.isArray(pack.assets)||pack.assets.length>ASSET_LIMITS.count)throw Error('ASSET_MANIFEST_REJECTED');
 const ids=new Set();let bytes=0,pixels=0;
 const assets=pack.assets.map(item=>{
  const asset=record(item,['id','role','mime','width','height','sha256','data','sampling','provenance']);
  const provenance=record(asset.provenance,['kind','sourceId']);
  if(!assetId(asset.id)||ids.has(asset.id)||!['background','actor','object','effect'].includes(asset.role)||!['smooth','pixelated'].includes(asset.sampling)||!['approved-library','generated'].includes(provenance.kind)||typeof provenance.sourceId!=='string'||!/^[-a-zA-Z0-9._:]{1,100}$/.test(provenance.sourceId))throw Error('ASSET_MANIFEST_REJECTED');
  if(typeof asset.data!=='string'||asset.data.length<28||asset.data.length>Math.ceil(ASSET_LIMITS.bytes/3)*4||asset.data.length%4!==0||!/^[A-Za-z0-9+/]+={0,2}$/.test(asset.data))throw Error('ASSET_DATA_REJECTED');
  const decoded=Buffer.from(asset.data,'base64');if(decoded.toString('base64')!==asset.data)throw Error('ASSET_DATA_REJECTED');
  const actual=inspectRaster(decoded,asset.mime);
  if(actual.width!==asset.width||actual.height!==asset.height)throw Error('ASSET_DIMENSIONS_REJECTED');
  if(actual.sha256!==asset.sha256)throw Error('ASSET_INTEGRITY_FAILED');
  bytes+=actual.bytes;pixels+=actual.width*actual.height;
  if(bytes>ASSET_LIMITS.totalBytes||pixels>ASSET_LIMITS.pixels)throw Error('ASSET_PACK_LIMIT');
  ids.add(asset.id);
  return {id:asset.id,role:asset.role,mime:asset.mime,width:actual.width,height:actual.height,sha256:actual.sha256,data:asset.data,sampling:asset.sampling,provenance:{kind:provenance.kind,sourceId:provenance.sourceId}};
 });
 return {version:'game-assets-v1',style:pack.style,assets};
}
/** Canonical, order-sensitive identity binds bytes AND their role, style, sampling and provenance. */
function assetPackHash(value){
 if(value===undefined)return undefined;
 const pack=validateAssetPack(value);
 return sha256(JSON.stringify({...pack,assets:pack.assets.map(({data,...asset})=>asset)}));
}
/** Trusted producer helper; callers supply bytes from an approved library or image provider. */
function makeRasterAsset(options){
 const {bytes,...metadata}=options;const info=inspectRaster(bytes,metadata.mime);
 return {id:metadata.id,role:metadata.role,mime:metadata.mime,width:info.width,height:info.height,sha256:info.sha256,data:Buffer.from(bytes).toString('base64'),sampling:metadata.sampling||'smooth',provenance:metadata.provenance};
}
module.exports={ASSET_LIMITS,VISUAL_STYLES,validateAssetPack,assetPackHash,inspectRaster,makeRasterAsset};
