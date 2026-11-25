/* Synthetic actual-application benchmark. Never connects to a provider or live gateway.
 * Run after building TARGET: node tools/storage-application-benchmark.cjs TARGET OUTPUT.json
 * Optional STORAGE_BENCHMARK_SAMPLES (default 5). No speed threshold gates correctness. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {buildSync}=require('esbuild');
const {chromium}=require('playwright');
const root=path.resolve(process.argv[2]||'.'),output=path.resolve(process.argv[3]||'test-results/storage-application-benchmark.json');
const samples=Number(process.env.STORAGE_BENCHMARK_SAMPLES||5);
assert.ok(Number.isInteger(samples)&&samples>=1&&samples<=25);
const completeRecovery=fs.existsSync(path.join(root,'src/storage/complete-backup.ts'));
const bridge=buildSync({stdin:{contents:`
 import {RevisionStore,WORKSPACE_KEY} from './src/factory/workspace';
 import {StudioNotebook,STUDIO_KEY} from './src/studio/notebook';
 import {defaults} from './src/runtime/manifests';
 import {saveDrawing,drawings} from './src/assets/private-drawings';
 import {exportArtBundle,restoreArtBundle} from './src/drawing/transfer';
 export {RevisionStore,StudioNotebook,WORKSPACE_KEY,STUDIO_KEY,defaults,saveDrawing,drawings,exportArtBundle,restoreArtBundle};
 ${completeRecovery?"export {RecoveryVault} from './src/storage/recovery-vault';":''}
`,resolveDir:root,loader:'ts'},bundle:true,platform:'browser',format:'iife',globalName:'StorageBenchmark',write:false}).outputFiles[0].text;
const metricsScript=()=>{
 const counter={getCalls:0,getCodeUnits:0,setCalls:0,setCodeUnits:0,parseCalls:0,parseCodeUnits:0,parseMs:0,stringifyCalls:0,stringifyCodeUnits:0,stringifyMs:0};
 const get=Storage.prototype.getItem,set=Storage.prototype.setItem,parse=JSON.parse,stringify=JSON.stringify;
 Storage.prototype.getItem=function(k){const value=get.call(this,k);if(this===localStorage){counter.getCalls++;counter.getCodeUnits+=value?.length||0;}return value;};
 Storage.prototype.setItem=function(k,v){if(this===localStorage){counter.setCalls++;counter.setCodeUnits+=String(v).length;}return set.call(this,k,v);};
 JSON.parse=function(...args){const start=performance.now();try{return parse.apply(this,args);}finally{counter.parseCalls++;counter.parseCodeUnits+=String(args[0]).length;counter.parseMs+=performance.now()-start;}};
 JSON.stringify=function(...args){const start=performance.now(),value=stringify.apply(this,args);counter.stringifyCalls++;counter.stringifyCodeUnits+=value?.length||0;counter.stringifyMs+=performance.now()-start;return value;};
 window.storageBenchmarkMetrics={read:()=>({...counter}),reset:()=>{for(const k of Object.keys(counter))counter[k]=0;}};
};
const summarize=values=>{const sorted=[...values].sort((a,b)=>a-b);return {median:sorted[Math.floor(sorted.length/2)],p95:sorted[Math.ceil(sorted.length*.95)-1],samples:values};};
(async()=>{
 const server=require(path.join(root,'tests/browser-server.cjs')).start(path.join(root,'dist'));
 await new Promise(resolve=>server.listening?resolve():server.once('listening',resolve));
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox']});
 const origin=`http://127.0.0.1:${server.address().port}`,rows=[];
 try{
  for(const [scenario,projects,revisionsPerProject,sessions,messages] of [['small',5,1,5,20],['medium',25,4,25,100],['large',50,9,70,200]]){
   const context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'}),page=await context.newPage();
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
   await page.addInitScript(metricsScript);
   await page.goto(origin+'/arcade/');await page.waitForFunction(()=>window.FG?.studio&&window.FG?.store);
   await page.addScriptTag({content:bridge});
   const seed=await page.evaluate(async({projects,revisionsPerProject,sessions,messages})=>{
    const {RevisionStore,StudioNotebook,defaults,saveDrawing}=StorageBenchmark,store=new RevisionStore(localStorage),book=new StudioNotebook(localStorage),owner=FG.store.current().id;
    const made=[];
    for(let i=0;i<projects;i++){
     const game=i%2?'dragon':'buckets',project=store.create(owner,game,'Synthetic saved game '+i);
     for(let n=1;n<revisionsPerProject;n++)store.commit(project.id,owner,defaults(game),'Saved revision '+n,'Synthetic retained mechanics');
     store.keep(project.id,owner);made.push(store.project(project.id,owner));
    }
    const model=book.create(owner,'new','Synthetic idea'),notebook=book.read();
    notebook.sessions=Array.from({length:sessions},(_,i)=>({...structuredClone(model),id:'synthetic-session-'+i,name:'Synthetic idea '+i,game:i<made.length?made[i].game:'new',projectId:made[i]?.id||null,messages:Array.from({length:messages},(_,j)=>({id:'synthetic-message-'+i+'-'+j,role:'child',text:'Synthetic words about a blue moon adventure. '.repeat(3),at:'2026-11-25T00:00:00Z'})),updated:'2026-11-25T00:00:00Z'}));
    notebook.active[owner]='synthetic-session-0';notebook.avatars={[owner]:'spark'};book.restore(notebook);
    FG.store.changeProfile({rate:1});FG.store.current().mathWindow=[Date.now()];FG.store.save();
    const originalCount=projects===5?2:projects===25?5:8,size=projects===5?256:projects===25?512:640;
    let originalBytes=0,previewBytes=0;
    for(let i=0;i<originalCount;i++){
     const canvas=document.createElement('canvas');canvas.width=canvas.height=size;const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(size,size);let seed=i+17;
     for(let n=0;n<pixels.data.length;n+=4){seed=(Math.imul(seed,1664525)+1013904223)>>>0;pixels.data[n]=seed&255;pixels.data[n+1]=(seed>>>8)&255;pixels.data[n+2]=(seed>>>16)&255;pixels.data[n+3]=255;}ctx.putImageData(pixels,0,0);
     const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png')),drawing=await saveDrawing(owner,'Synthetic original '+i,blob);originalBytes+=drawing.bytes.byteLength;previewBytes+=drawing.preview?.byteLength||0;
    }
    return {owner,firstProject:made[0],workspaceRevisions:store.snapshot().revisions.length,sessionId:'synthetic-session-0',artwork:{originalCount,pixels:size,originalBytes,previewBytes}};
   },{projects,revisionsPerProject,sessions,messages});
   const runs=[];
   for(let run=0;run<samples;run++){
    const nav=performance.now();await page.reload();await page.waitForFunction(()=>window.FG?.studio&&window.FG?.store&&!document.getElementById('jemsWriterNotice'));
    const readyMs=performance.now()-nav;
    const startup=await page.evaluate(()=>({counters:storageBenchmarkMetrics.read(),heapBytes:performance.memory?.usedJSHeapSize??null,domNodes:document.querySelectorAll('*').length}));
    const cdp=await context.newCDPSession(page);await cdp.send('Performance.enable');
    const uiStart=performance.now();await page.evaluate(()=>FG.studio.home());await page.locator('[data-session="synthetic-session-0"] .studio-saved-open').waitFor();
    const libraryMs=performance.now()-uiStart;
    const openStart=performance.now();await page.locator('[data-session="synthetic-session-0"] .studio-saved-open').click();await page.waitForFunction(()=>document.querySelector('#studioTitle')?.textContent?.includes('Synthetic'));
    const openMs=performance.now()-openStart;
    await page.addScriptTag({content:bridge});
    const operations=await page.evaluate(async({seed,run})=>{
     const {RevisionStore,StudioNotebook,exportArtBundle,restoreArtBundle,drawings}=StorageBenchmark,store=new RevisionStore(localStorage),book=new StudioNotebook(localStorage),out={};
     const measure=(name,fn)=>{storageBenchmarkMetrics.reset();const t=performance.now();const result=fn();out[name]={ms:performance.now()-t,counters:storageBenchmarkMetrics.read()};return result;};
     measure('list',()=>{const a=store.list(seed.owner),b=book.list(seed.owner);if(!a.length||!b.length)throw Error('Missing synthetic data');});
     measure('openSavedRecord',()=>store.revision(seed.firstProject.id,seed.owner));
     measure('saveDraft',()=>book.update(seed.sessionId,seed.owner,s=>{s.draft='Synthetic saved thought '+run;}));
     measure('saveRevision',()=>{const p=store.project(seed.firstProject.id,seed.owner),r=store.revision(p.id,seed.owner);return store.commit(p.id,seed.owner,r.config,'Measured revision '+run,'Retain the last working game',undefined,p.headId);});
     const raw=measure('legacyExport',()=>JSON.stringify({profiles:FG.store.data,workspace:store.snapshot(),notebook:book.read()}));
     out.legacyExport.utf8Bytes=new TextEncoder().encode(raw).length;
     measure('legacyRestoreValidation',()=>{const value=JSON.parse(raw);store.restore(JSON.stringify(value.workspace));book.restore(value.notebook);});
     const artStart=performance.now(),artBundle=await exportArtBundle(seed.owner);out.artExport={ms:performance.now()-artStart,utf8Bytes:new TextEncoder().encode(JSON.stringify(artBundle)).length};
     const restoreStart=performance.now();await restoreArtBundle(seed.owner,artBundle);out.artRestore={ms:performance.now()-restoreStart};
     const originals=await drawings(seed.owner);out.artwork={count:originals.length,uniqueHashes:new Set(originals.map(x=>x.sha256)).size,originalBytes:originals.reduce((n,x)=>n+x.bytes.byteLength,0)};
     out.localStorage={keys:localStorage.length,utf8Bytes:Object.keys(localStorage).reduce((sum,key)=>sum+new TextEncoder().encode(localStorage.getItem(key)||'').length,0),codeUnits:Object.keys(localStorage).reduce((sum,key)=>sum+(localStorage.getItem(key)||'').length,0)};
     return out;
    },{seed,run});
    if(completeRecovery){
     const start=performance.now();await page.evaluate(()=>{const button=document.getElementById('recovery-save');if(!button)throw Error('Missing integrated recovery control');button.click();});
     await page.waitForFunction(()=>document.getElementById('jemsRecoveryStatus')?.textContent==='Complete recovery copy saved on this device.');
     operations.completeRecovery={captureAndSaveMs:performance.now()-start,...await page.evaluate(async()=>{
      const scope={origin:location.origin,audience:'family',owners:FG.store.familyProfiles().map(p=>p.id)},vault=new StorageBenchmark.RecoveryVault(scope,()=>{}),start=performance.now(),point=(await vault.list(undefined,1))[0],archive=await vault.read(point.id);
      return {readAndVerifyMs:performance.now()-start,archiveBytes:new TextEncoder().encode(JSON.stringify(archive)).length,parts:point.parts.length,uniqueChunks:Object.keys(archive.chunks).length,logicalPartBytes:point.parts.reduce((n,p)=>n+p.size,0)};
     })};
    }
    const processMetrics=(await cdp.send('Performance.getMetrics')).metrics.filter(m=>['TaskDuration','ScriptDuration','JSHeapUsedSize','JSHeapTotalSize'].includes(m.name));await cdp.detach();
    runs.push({readyMs,libraryMs,openMs,startup,operations,processMetrics});
   }
   assert.deepEqual(errors,[],'application page errors');
   rows.push({scenario,projects,revisionsPerProject,initialRevisions:seed.workspaceRevisions,sessions,messagesPerSession:messages,artwork:seed.artwork,metrics:Object.fromEntries(['readyMs','libraryMs','openMs'].map(key=>[key,summarize(runs.map(r=>r[key]))])),runs});
   await context.close();console.log('Measured '+scenario);
  }
  const report={schema:'jems.storage.application-benchmark.v1',observedAt:new Date().toISOString(),source:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),gitTree:execFileSync('git',['rev-parse','HEAD^{tree}'],{cwd:root,encoding:'utf8'}).trim(),scope:'Synthetic data generated with actual application RevisionStore/StudioNotebook, built Jems UI, real Chromium localStorage/IndexedDB; desktop emulation on one shared Linux host. No network provider or cloud data. Native record operations use the production source classes. Legacy export/restore timing excludes originals, rewards, Pals and cloud; full backup is measured separately.',instrumentation:'Synchronous JSON and localStorage instrumentation adds overhead; byte counters are UTF-16 code units, separately exported UTF-8 bytes. Startup includes browser navigation and readiness wait. Process metrics are CDP observations, not isolated CPU or physical-device memory. Samples share warm HTTP cache and accumulate one retained revision per sample.',browser:await browser.version(),samples,rows};
  fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(output);
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
