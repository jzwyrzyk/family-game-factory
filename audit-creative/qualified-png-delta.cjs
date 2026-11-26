/* Independent, synthetic-only visual and exact-byte fidelity checks of the approved PNG flows. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createHash}=require('node:crypto');
const {crc32,deflateSync,inflateSync}=require('node:zlib');
const {createRequire}=require('node:module');
const resolveApp=createRequire(path.resolve('package.json'));
const {build}=resolveApp('esbuild');
const {chromium}=resolveApp('playwright');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const sig=Buffer.from([137,80,78,71,13,10,26,10]);
const chunk=(kind,bytes)=>{
  const result=Buffer.alloc(12+bytes.length);result.writeUInt32BE(bytes.length); result.write(kind,4);bytes.copy(result,8);result.writeUInt32BE(crc32(result.subarray(4,-4)),result.length-4);return result;
};
function assemble(config) {
  const {width=11,height=7,depth=8,colour=6,interlaced=false,palette=false,transparent=false,filter=0,split=true}=config;
  const channels=({0:1,2:3,3:1,4:2,6:4})[colour];
  const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=depth;header[9]=colour;header[12]=interlaced?1:0;
  const lead=[sig,chunk('IHDR',header),chunk('sRGB',Buffer.of(1))];
  const actualPalette=colour===3; if(actualPalette||palette) {
    const colors=actualPalette?1<<depth:2,table=Buffer.alloc(colors*3);
    for(let n=0;n<table.length;n++)table[n]=(31+n*47)%256;
    lead.push(chunk('PLTE',table));
  }
  if(transparent) {
    const samples=colour===3?Buffer.from([0,130]):Buffer.alloc(colour===2?6:2);
    lead.push(chunk('tRNS',samples));
  }
  const passes=interlaced?[[0,0,8,8],[4,0,8,8],[0,4,4,8],[2,0,4,4],[0,2,2,4],[1,0,2,2],[0,1,1,2]]:[[0,0,1,1]];
  const rows=[];let index=0;for(const [x,y,dx,dy] of passes) {
    if(x>=width || y>=height)continue; const count=Math.ceil((width-x)/dx);
    for(let p=y;p<height;p+=dy){
      const row=Buffer.alloc(1+Math.ceil(count*channels*depth/8));row[0]=filter===-1?index%5:filter;
      for(let i=1;i<row.length;i++)row[i]=(i*23+index*37+1)%256;
      if(colour===6&&depth===8&&row.length>=5&&row[0]===0)row[4]=0;
      if(colour===6&&depth===16&&row.length>=9&&row[0]===0){row[7]=0;row[8]=0;}
      rows.push(row);index++;
    }
  }
  const pixels=Buffer.concat(rows), compressed=deflateSync(pixels,{level:3});
  const parts=split?[compressed.subarray(0,3),compressed.subarray(3)]:[compressed];
  return {source:Buffer.concat([...lead,...parts.map(p=>chunk('IDAT',p)),chunk('IEND',Buffer.alloc(0))]),pixels};
}
function contents(buf) {
  let at=8;const sections=[];while(at<buf.length){const end=at+12+buf.readUInt32BE(at);assert.ok(end<=buf.length);const bytes=buf.subarray(at,end);assert.equal(crc32(bytes.subarray(4,-4)),bytes.readUInt32BE(bytes.length-4));sections.push({kind:bytes.toString('ascii',4,8),bytes});at=end;}return sections;
}
const pad=b=>Buffer.from(b).toString('base64');
(async()=>{
 const app=await build({stdin:{contents:"import './src/family-beta/artwork';export {checkReviewedPng} from './src/family-beta/reviewed-png';export {drawings} from './src/assets/private-drawings';",resolveDir:process.cwd()},bundle:true,platform:'browser',format:'iife',globalName:'auditPng',define:{'import.meta.env.MODE':'"test"'},write:false});
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});const page=await browser.newPage();page.setDefaultTimeout(10000);
 const approved=new Set(),reviews=[];let unlocks=0;
 try{
 const html='<input id="reviewedArtPassphrase"><input type="checkbox" id="prepareReviewedArt"><input type="file" id="betaReviewedArt"><p id="familyExitStatus"></p><script>let who="auditor";window.FG={store:{current:()=>({id:who})}};</script>';
 await page.route('**/*',async route=>{const url=new URL(route.request().url());assert.equal(url.origin,'https://synthetic.invalid');
    switch(url.pathname){
     case '/':return route.fulfill({contentType:'text/html',body:html});
     case '/v1/devices/unlock':unlocks++; assert.deepEqual(Object.keys(route.request().postDataJSON()),['parentPassphrase']);return route.fulfill({status:200});
     case '/entry/review-art':{const body=route.request().postDataJSON();assert.deepEqual(Object.keys(body),['digest']);reviews.push(body.digest);return route.fulfill({status:approved.has(body.digest)?200:403});}
     default:throw Error('Unexpected request route');
    }
 });
 await page.goto('https://synthetic.invalid/');await page.addScriptTag({content:app.outputFiles[0].text});
 async function decoder(source) {
  return page.evaluate(async base64=>{
   const src=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
   const copy=await(await auditPng.checkReviewedPng(src.buffer)).prepareImageOnlyCopy();
   async function visible(blob) {
    const bmp=await createImageBitmap(blob);const canvas=document.createElement('canvas');canvas.width=bmp.width;canvas.height=bmp.height;const ctx=canvas.getContext('2d');ctx.drawImage(bmp,0,0);bmp.close();
    const bytes=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');
   }
   const raw=new Uint8Array(await copy.arrayBuffer());return {copy:btoa(Array.from(raw,x=>String.fromCharCode(x)).join('')),before:await visible(new Blob([src],{type:'image/png'})),after:await visible(copy)};
  },pad(source));
 }
 const configs=[
  ['indexed-1-tRNS',{colour:3,depth:1,transparent:true}],
  ['indexed-2-tRNS',{colour:3,depth:2,transparent:true,filter:-1}],
  ['indexed-4-Adam7',{colour:3,depth:4,transparent:true,interlaced:true}],
  ['indexed-8',{colour:3,depth:8,transparent:true}],
  ['gray-1-Adam7',{colour:0,depth:1,interlaced:true}],
  ['gray-16-tRNS',{colour:0,depth:16,transparent:true}],
  ['rgb-8-tRNS',{colour:2,depth:8,transparent:true,filter:-1}],
  ['gray-alpha-16',{colour:4,depth:16,filter:-1}],
  ['rgba-16-Adam7',{colour:6,depth:16,interlaced:true}],
  ['rgba-8-invisible-rgb',{colour:6,depth:8}],
  ['rgba-8-many-filter-boundaries',{colour:6,depth:8,filter:-1,width:319,height:257}]
 ];
 const matrix=[],specimens={};
 for(const [name,c] of configs) {
  const {source,pixels}=assemble(c);const {copy,before,after}=await decoder(source);const dest=Buffer.from(copy,'base64');
  assert.equal(before,after);const old=contents(source),fresh=contents(dest);assert.deepEqual(old.filter(p=>p.kind!=='IDAT').map(p=>p.bytes),fresh.filter(p=>p.kind!=='IDAT').map(p=>p.bytes));
  const inflated=inflateSync(Buffer.concat(fresh.filter(p=>p.kind==='IDAT').map(p=>p.bytes.subarray(8,-4))));assert.deepEqual(inflated,pixels);
  assert.notEqual(hash(dest),hash(source));matrix.push({fixture:name,original:hash(source),copy:hash(dest),allInflatedScanlines:hash(pixels),visibleRgba:after});specimens[name]={source,dest};
 }
 const file=page.locator('#betaReviewedArt'),opt=page.locator('#prepareReviewedArt'),status=page.locator('#familyExitStatus');
 const choose=async(buf,prepare=false)=>{await opt.setChecked(prepare);await page.locator('#reviewedArtPassphrase').fill('local-audit');await file.setInputFiles({name:'synthetic.png',mimeType:'image/png',buffer:buf});};
 const done=async(text)=>{await page.getByText(text,{exact:false}).first().waitFor();await page.waitForFunction(()=>!document.getElementById('betaReviewedArt').disabled);};
 const rows=()=>page.evaluate(async()=>Object.fromEntries(await Promise.all(['auditor','other'].map(async owner=>[owner,(await auditPng.drawings(owner)).map(entry=>({id:entry.id,digest:entry.sha256,bytes:Array.from(new Uint8Array(entry.bytes))}))]))));
 const noRows=async()=>assert.deepEqual(await rows(),{auditor:[],other:[]});
 const extract=async()=>Buffer.from(await page.getByRole('link').evaluate(async e=>Array.from(new Uint8Array(await (await fetch(e.href)).arrayBuffer()))));
 const reviewed=specimens['indexed-2-tRNS'];await choose(reviewed.source,true);await done('Ask the operator');await noRows();assert.equal(await page.getByRole('link').count(),0);
 approved.add(hash(reviewed.source));await choose(reviewed.source,true);await done('Download your image-only copy');assert.deepEqual(await extract(),reviewed.dest);await noRows();
 await choose(reviewed.dest);await done('Ask the operator');await noRows();approved.add(hash(reviewed.dest));await choose(reviewed.dest);await done('Your reviewed drawing is ready');
 const stored=await rows();assert.deepEqual(Buffer.from(stored.auditor[0].bytes),reviewed.dest);assert.equal(stored.other.length,0);
 await choose(reviewed.source);await done('Your reviewed drawing is ready');assert.deepEqual((await rows()).auditor.map(r=>r.digest).sort(),[hash(reviewed.dest),hash(reviewed.source)].sort());
 const beforePalette=reviews.length, beforeUnlocks=unlocks;
 const strict=assemble({colour:2,palette:true,transparent:true,filter:-1}).source;
 for(const prepare of [false,true]){
  await choose(strict,prepare);await done('contains an unused palette');const raw=await extract();
  const chunks=contents(strict);assert.deepEqual(raw,Buffer.concat([sig,...chunks.filter(p=>p.kind!=='PLTE').map(p=>p.bytes)]));assert.equal(reviews.length,beforePalette);assert.equal(unlocks,beforeUnlocks);assert.equal(await opt.isChecked(),false);
 }
 const broken=assemble({colour:6,palette:true,filter:5}).source;await choose(broken,true);await done('saved without extra file information');assert.equal(await page.getByRole('link').count(),0);assert.equal(reviews.length,beforePalette);
 const beforeCancel=(await rows()).auditor.map(x=>x.id).sort();
 await page.evaluate(()=>{const original=window.createImageBitmap;window.auditHoldDecode=true;window.createImageBitmap=async(...args)=>{
  window.createImageBitmap=original;await new Promise(resolve=>window.auditRelease=resolve);return original(...args);
 };});
 await choose(reviewed.source,true);await page.waitForFunction(()=>!!window.auditRelease);
 await page.evaluate(()=>{who='other';window.dispatchEvent(new Event('factory-profile-changing'));who='auditor';window.dispatchEvent(new Event('factory-profile'));window.auditRelease();});
 await page.waitForTimeout(100);assert.equal(await opt.isChecked(),false);assert.equal(await status.textContent(),'');assert.equal(await page.getByRole('link').count(),0);assert.deepEqual((await rows()).auditor.map(x=>x.id).sort(),beforeCancel);
 await choose(reviewed.source,true);await done('Download your image-only copy');const previous=await page.getByRole('link').getAttribute('href');await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));assert.equal(await page.getByRole('link').count(),0);
 const revoked=await page.evaluate(async url=>{try{await fetch(url);return false;}catch{return true;}},previous);assert.ok(revoked);
 const revisit=await decoder(reviewed.dest);const reCopy=Buffer.from(revisit.copy,'base64');const same=reCopy.equals(reviewed.dest);
 // A second actual explicit preparation of an already normalized one-IDAT file examines reapproval identity.
 await choose(reviewed.dest,true);await done('Download your image-only copy');const fromLink=await extract();assert.deepEqual(fromLink,reCopy);
 await choose(fromLink);const statusAfterReselect=await Promise.race([page.getByText('Your reviewed drawing is ready').waitFor().then(()=>'admitted with existing digest'),page.getByText('Ask the operator').waitFor().then(()=>'separate digest needs approval')]);
 const output={commit:require('node:child_process').execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),engine:browser.version(),matrix,normalExact:true,retainedOriginalBytes:true,strictUnusedPaletteOnly:true,illegalRowStopped:true,reviewsDigestOnly:true,noPrivateTransports:true,pendingCancellation:true,offeredCopyUrlRevoked:true,reprepareApprovedCanonical:{input:hash(reviewed.dest),prepared:hash(reCopy),exactSame:same,statusAfterReselect},fixture4k:hash(fs.readFileSync('tests/fixtures/storage-original-4k.png'))};
 fs.writeFileSync(process.argv[2],JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify({...output,matrix:matrix.length},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
