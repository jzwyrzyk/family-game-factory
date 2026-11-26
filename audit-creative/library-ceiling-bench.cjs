const fs = require('node:fs'),path = require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {once} =require('node:events'),{execFileSync}=require('node:child_process');
const {buildSync}=require('../creative/node_modules/esbuild');
const {chromium}=require('../creative/node_modules/playwright');
const repo = path.resolve(process.argv[2]);const dest=path.resolve(process.argv[3]);
const {start}=require(path.join(repo,'tests/browser-server.cjs'));
const library = fs.existsSync(path.join(repo,'src/assets/creative-library.ts')) ? "export {listCreativeAssetChoices as catalog} from './assets/creative-library'" : "export {listCreativeAssets as catalog} from './drawing/creative-assets'";
const fixture=buildSync({stdin:{contents:"export {saveRig} from './drawing/store';export {defaultAssembly} from './drawing/model';export {saveDrawing,updateDrawing,drawingPage} from './assets/private-drawings';export {CreationStore} from './creation/storage'; export {createStarterProject} from './creation/projects'; export {profileStorage} from './adult-pilot/storage';"+library,resolveDir:path.join(repo,'src')},format:'iife',globalName:'benchmark',bundle:true,write:false,define:{'import.meta.env.MODE':'"production"'}}).outputFiles[0].text;
(async()=>{
 const system=()=>({loadAverage:require('node:os').loadavg(),cpuPressure:fs.existsSync('/proc/pressure/cpu')?fs.readFileSync('/proc/pressure/cpu','utf8'):null,utc:new Date().toISOString()});const hostBefore=system();
 const server=start(path.join(repo,'dist'));if(!server.listening)await once(server,'listening');let browser;
 try {
  browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--enable-precise-memory-info']});
  const origin='http://127.0.0.1:'+server.address().port;const ctx=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'}),page=await ctx.newPage();const remote=[];
  await ctx.route('**/*',async route=>{const request=route.request(),url=request.url();if(url===origin+'/arcade/factory-config.json')return route.fulfill({json:{version:1,mode:'unavailable'}});if(url.startsWith(origin+'/')||url.startsWith('blob:')||url.startsWith('data:'))return route.continue();remote.push(url);return route.abort();});
  const target=origin+'/arcade/?art=1';const start=performance.now();await page.goto(target,{waitUntil:'domcontentloaded'});await page.locator('#artEmpty:visible').waitFor();await page.waitForFunction(()=>window.FG?.artStudio);const firstOpen=performance.now()-start;
  await page.addScriptTag({content:fixture});
  const setup=await page.evaluate(async(source215)=>{const owner=FG.store.current().id,originals=[],pins=[]; FG.store.changeProfile({rate:1});FG.store.current().mathWindow=[Date.now()];FG.store.save();let bytes=0; const canvas=document.createElement('canvas');canvas.width=768;canvas.height=512;const ctx=canvas.getContext('2d');let s=123;const random=()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296};
   for(let index=0;index<100;index++){
    ctx.clearRect(0,0,768,512);for(let a=0;a<15;a++){ctx.strokeStyle=`hsl(${(a*47+index*19)%360},65%,48%)`;ctx.lineWidth=3+random()*9;ctx.beginPath();ctx.moveTo(random()*768,random()*512);ctx.bezierCurveTo(random()*768,random()*512,random()*768,random()*512,random()*768,random()*512);ctx.stroke();}const blob=await new Promise(r=>canvas.toBlob(r));const item=await benchmark.saveDrawing(owner,'Synthetic art '+String(index).padStart(2,'0'),blob,index<80?undefined:originals[index-80]);originals.push(item.id);pins.push('art:image:'+item.id+':'+item.sha256);bytes+=item.bytes.byteLength;if(index===0)await benchmark.updateDrawing(owner,item.id,{[source215?'semantic':'semanticIdentity']:'North comet'});
   }
   const currentRig = [], errors = {};
   const pieces=[{id:'whole',name:'Original artwork',role:'body',region:{x:0,y:0,w:1,h:1,shape:'rect'},parentId:null,physical:true}];
   for(let i=0;i<200;i++){
     const n=i%80;
     const assembly=benchmark.defaultAssembly({id:originals[n],sha256:pins[n].split(':')[3]},'character',pieces);
     assembly.revision=1+Math.floor(i/80);
     assembly.motion={move:i%2?'float':'bounce',durationMs:1000,world:'world-forest-v1',sprite:'original'};
     const rig=await benchmark.saveRig(owner,assembly,currentRig[n]||null);
     currentRig[n]=rig.id;
     if(i===199) {
       try {await benchmark.saveRig(owner,assembly,rig.id);} catch(error) {errors.movement201=error.message;}
     }
   }
   try {const extra=await new Promise(resolve=>canvas.toBlob(resolve));await benchmark.saveDrawing(owner,'Synthetic attempted 101',extra);} catch(error){errors.artwork101=error.message;}
   const world=benchmark.createStarterProject('blank','Synthetic benchmark world');world.background='sky';world.world=source215 ? {backdrop:'world-forest-v1',fit:'cover',decorations:[]} : {assetId:'world-forest-v1',framing:'fill'};
   world.actors=pins.slice(0,5).map((pin,i)=>({id:'actor'+i,name:'Original '+i,assetId:pin,x:80+i*140,y:180+i*15,size:78}));world.programs=[{id:'move1',actorId:'actor0',trigger:{type:'start'},actions:[{id:'move2',type:'jump',height:90,durationMs:1200,origin:'child'}]}];
   const store=new benchmark.CreationStore(benchmark.profileStorage(localStorage),()=>owner);const entry=store.create(owner,world);store.keep(entry.id,owner,entry.headId);
   return {items:100,roots:80,revisions:20,rigs:200,capacityRejections:errors,fixtureStrokesPerImage:15,width:768,height:512,sourceBytes:bytes,world:entry.id,pins:pins.slice(0,5)};},library.includes('listCreativeAssets as'));
  assert.match(setup.capacityRejections.artwork101,/storage is full/);
  assert.match(setup.capacityRejections.movement201,/movement versions are full/);
  const samples=[];for(let run=0;run<5;run++){
    const reload=performance.now();await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.getElementById('artCount')?.textContent==='100'&&document.querySelectorAll('#artGrid [data-art-id]').length===24&&document.querySelector('#artGrid img')?.naturalWidth>0);const time=performance.now()-reload;await page.addScriptTag({content:fixture});
    const measured=await page.evaluate(async()=>{const now=performance.now(),owner=FG.store.current().id;const page=await benchmark.drawingPage(owner,{limit:24}),first=performance.now();const seen=await benchmark.catalog(owner),last=performance.now();const estimate=await navigator.storage.estimate();return {metadataPageMs:first-now,catalogMs:last-first,pageItems:page.items.length,catalogItems:seen.length,usedJsHeap:performance.memory?.usedJSHeapSize,indexedDbBytes:estimate.usageDetails?.indexedDB,originStorageBytes:estimate.usage,firstThumbnailWidth:document.querySelector('#artGrid img')?.naturalWidth,navigation:{domContentLoadedMs:performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd}};});assert.equal(measured.catalogItems,300);samples.push({populatedReloadToShelfMs:time,...measured});
  }
  const interaction=[];
  for(let i=0;i<3;i++){
    await page.goto(target,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.getElementById('artCount')?.textContent==='100');
    const started=performance.now();await page.locator('#artSearch').fill('North comet');await page.waitForFunction(()=>document.querySelectorAll('#artGrid [data-art-id]').length===2);const found=performance.now();
    const ids=await page.evaluate(()=>Array.from(document.querySelectorAll('#artGrid [data-art-id]'),button=>button.dataset.artId));assert.equal(ids.length,2);
    const reopened=performance.now();await page.evaluate(id=>FG.creation.open(id),setup.world);await page.locator('#creationWorkspace').waitFor({state:'visible'});await page.waitForFunction(id=>FG.creation.scene()?.id===id,setup.world);const visible=performance.now();
    const chosen=await page.evaluate(()=>FG.creation.scene().actors.map(x=>x.assetId));assert.deepEqual(chosen,setup.pins);
    await page.evaluate(()=>document.querySelector('#creationRun').click());await page.waitForFunction(()=>['completed','running'].includes(FG.creation.snapshot()?.status));const playable=performance.now();
    const frames=await page.evaluate(()=>new Promise(resolve=>{const gaps=[];let prev=0;function frame(t){if(prev)gaps.push(t-prev);prev=t;if(gaps.length>=30)return resolve(gaps);requestAnimationFrame(frame)}requestAnimationFrame(frame)}));
    const choose=performance.now();await page.evaluate(()=>document.querySelector('#creationAddActor').click());await page.waitForFunction(()=>document.querySelectorAll('#creationPrivateActorChoices [data-private-art]').length>0);const pickerMs=performance.now()-choose;
    const ready = async all => page.waitForFunction(all=>{const cards=Array.from(document.querySelectorAll('#creationPrivateActorChoices [data-private-art]'));const painted=card=> {const picture=card.querySelector('img, canvas');if(!picture)return false;if(picture.tagName==='IMG')return picture.naturalWidth>0;const rgba=picture.getContext('2d').getImageData(0,0,picture.width,picture.height).data;return rgba.some((n,i)=>i%4===3 && n>0);};return cards.length>0&&(all?cards.every(painted):cards.some(painted));},all);
    await ready(false);const firstPaint=performance.now()-choose;await ready(true);const allPaint=performance.now()-choose;
    const observed=await page.evaluate(()=>({rows:document.querySelectorAll('#creationPrivateActorChoices [data-private-art]').length,thumbnailCount:document.querySelectorAll('#creationPrivateActorChoices img, #creationPrivateActorChoices canvas').length,canvasVisible:!!document.querySelector('#creationCanvas')?.getBoundingClientRect().width,stageSize:[document.querySelector('#creationCanvas').width,document.querySelector('#creationCanvas').height]}));
    interaction.push({semanticSearchToTwoResultsMs:found-started,keptOpenToSceneMs:visible-reopened,keptOpenToPlayableMs:playable-reopened,pickerToFirstChoiceMs:pickerMs,pickerToFirstPaintedThumbMs:firstPaint,pickerToAllPaintedThumbsMs:allPaint,frameIntervalsMs:frames,...observed});
  }
  const sizes={};for(const f of fs.readdirSync(path.join(repo,'dist/assets')).filter(f=>/^index-.*\.(css|js)$/.test(f))){const bytes=fs.readFileSync(path.join(repo,'dist/assets',f));sizes[f]={bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};}
  const median=k=>[...samples.map(r=>r[k])].sort((a,b)=>a-b)[2];const medians={};for(const k of ['populatedReloadToShelfMs','metadataPageMs','catalogMs','usedJsHeap','indexedDbBytes','originStorageBytes'])medians[k]=median(k);
  const receipt={hostBefore,hostAfter:system(),head:execFileSync('git',['-C',repo,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),tree:execFileSync('git',['-C',repo,'rev-parse','HEAD^{tree}'],{encoding:'utf8'}).trim(),browser:browser.version(),fixture:setup,viewport:[1280,900],serviceWorkers:'blocked',entryURL:'/arcade/?art=1',coldEmptyProfileOpenMs:firstOpen,medians,samples,interaction,externalRequests:remote,entryBundles:sizes};fs.writeFileSync(dest,JSON.stringify(receipt,null,2)+'\n');assert.deepEqual(remote,[]);console.log(medians);
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
