/* Synthetic actual-application benchmark. Never connects to a provider or live gateway.
 * Build TARGET first: node tools/storage-application-benchmark.cjs TARGET OUTPUT.json
 * Optional STORAGE_BENCHMARK_SAMPLES (default 5). No speed threshold gates correctness. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {createHash}=require('node:crypto');
const {buildSync}=require('esbuild');
const {chromium}=require('playwright');
const root=path.resolve(process.argv[2]||'.'),output=path.resolve(process.argv[3]||'test-results/storage-application-benchmark.json');
const selectedScenarios=process.env.STORAGE_BENCHMARK_SCENARIOS?.split(',');
const samples=Number(process.env.STORAGE_BENCHMARK_SAMPLES||5),indexedMode=process.env.STORAGE_BENCHMARK_AUTHORITY==='indexed';
assert.ok(Number.isInteger(samples)&&samples>=1&&samples<=25);
const trackedChanges=execFileSync('git',['diff','--name-only','HEAD'],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(Boolean);
const untracked=execFileSync('git',['ls-files','--others','--exclude-standard'],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(Boolean);
assert.ok(![...trackedChanges,...untracked].some(name=>/^(src\/|public\/|index\.html$|vite\.config|package(?:-lock)?\.json$)/.test(name)),'Commit application changes before measuring exact-source evidence.');
const bundleFiles=[];
function inventory(directory){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);if(entry.isDirectory())inventory(file);else{const bytes=fs.readFileSync(file);bundleFiles.push({path:path.relative(path.join(root,'dist'),file),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}}}
inventory(path.join(root,'dist'));bundleFiles.sort((a,b)=>a.path.localeCompare(b.path));
const builtFilesSha256=createHash('sha256').update(JSON.stringify(bundleFiles)).digest('hex');
const completeRecovery=fs.existsSync(path.join(root,'src/storage/complete-backup.ts'));
const bridge=buildSync({stdin:{contents:`
 import {RevisionStore,WORKSPACE_KEY} from './src/factory/workspace';
 import {StudioNotebook,STUDIO_KEY} from './src/studio/notebook';
 import {defaults} from './src/runtime/manifests';
 import {saveDrawing,drawings} from './src/assets/private-drawings';
 import {exportArtBundle,restoreArtBundle} from './src/drawing/transfer';
 export {RevisionStore,StudioNotebook,WORKSPACE_KEY,STUDIO_KEY,defaults,saveDrawing,drawings,exportArtBundle,restoreArtBundle};
 ${completeRecovery?"export {RecoveryVault} from './src/storage/recovery-vault';":''}
 ${indexedMode?"export {NativeWorkspace} from './src/storage/native-workspace';export {NotebookWorkspace} from './src/storage/notebook-workspace';export {CreationWorkspace} from './src/storage/creation-workspace';":''}
`,resolveDir:root,loader:'ts'},bundle:true,platform:'browser',format:'iife',globalName:'StorageBenchmark',write:false,define:{'import.meta.env.MODE':JSON.stringify(indexedMode?'storage-preview':'production')}}).outputFiles[0].text;
const metricsScript=()=>{
 const counter={getCalls:0,getCodeUnits:0,setCalls:0,setCodeUnits:0,parseCalls:0,parseCodeUnits:0,parseMs:0,stringifyCalls:0,stringifyCodeUnits:0,stringifyMs:0,idbGetCalls:0,idbCursorSteps:0,idbPutCalls:0,idbReadPayloadBytes:0,idbWritePayloadBytes:0};
 const get=Storage.prototype.getItem,set=Storage.prototype.setItem,parse=JSON.parse,stringify=JSON.stringify;
 Storage.prototype.getItem=function(k){const value=get.call(this,k);if(this===localStorage){counter.getCalls++;counter.getCodeUnits+=value?.length||0;}return value;};
 Storage.prototype.setItem=function(k,v){if(this===localStorage){counter.setCalls++;counter.setCodeUnits+=String(v).length;}return set.call(this,k,v);};
 JSON.parse=function(...args){const start=performance.now();try{return parse.apply(this,args);}finally{counter.parseCalls++;counter.parseCodeUnits+=String(args[0]).length;counter.parseMs+=performance.now()-start;}};
 JSON.stringify=function(...args){const start=performance.now(),value=stringify.apply(this,args);counter.stringifyCalls++;counter.stringifyCodeUnits+=value?.length||0;counter.stringifyMs+=performance.now()-start;return value;};
 // Logical serialized metadata plus original binary lengths. These are host
 // payload observations, not browser page/index overhead or billed I/O bytes.
 const payloadBytes=value=>{const seen=new Set();let binary=0;const visit=x=>{if(x&&typeof x==='object'&&!seen.has(x)){seen.add(x);if(x instanceof ArrayBuffer||ArrayBuffer.isView(x)){binary+=x.byteLength;return;}if(x instanceof Blob){binary+=x.size;return;}for(const v of Object.values(x))visit(v);}};visit(value);try{return new TextEncoder().encode(stringify(value)??'').length+binary;}catch{return binary;}};
 for(const method of ['get','getAll','openCursor']){const original=IDBObjectStore.prototype[method];IDBObjectStore.prototype[method]=function(...args){counter.idbGetCalls++;const request=original.apply(this,args);request.addEventListener('success',()=>{if(method==='openCursor'){if(request.result){counter.idbCursorSteps++;counter.idbReadPayloadBytes+=payloadBytes(request.result.value);}}else counter.idbReadPayloadBytes+=payloadBytes(request.result);});return request;};}
 for(const method of ['put','add']){const original=IDBObjectStore.prototype[method];IDBObjectStore.prototype[method]=function(value,...args){counter.idbPutCalls++;counter.idbWritePayloadBytes+=payloadBytes(value);return original.call(this,value,...args);};}
 window.storageBenchmarkMetrics={read:()=>({...counter}),reset:()=>{for(const k of Object.keys(counter))counter[k]=0;},payloadBytes};
};
const summarize=values=>{const sorted=[...values].sort((a,b)=>a-b);return {median:sorted[Math.floor(sorted.length/2)],p95:sorted[Math.ceil(sorted.length*.95)-1],samples:values};};
(async()=>{
 const server=require(path.join(root,'tests/browser-server.cjs')).start(path.join(root,'dist'));
 await new Promise(resolve=>server.listening?resolve():server.once('listening',resolve));
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox']});
 const origin=`http://127.0.0.1:${server.address().port}`,rows=[],recoveryStatuses=[];
 const checkpoint=inProgress=>{fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output+'.partial.json',JSON.stringify({status:'in-progress',source:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),builtFilesSha256,authority:indexedMode?'indexed':'legacy',samples,rows,inProgress},null,2)+'\n');};
 try{
  for(const [scenario,projects,revisionsPerProject,sessions,messages] of [['small',5,1,5,20],['medium',25,4,25,100],['large',50,9,70,200]].filter(([name])=>!selectedScenarios||selectedScenarios.includes(name))){
   const context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'}),page=await context.newPage();
   const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',message=>{if(message.text().startsWith('STORAGE_BENCHMARK_RECOVERY_STATUS '))recoveryStatuses.push(message.text().slice(34));});
   await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
   await page.addInitScript(metricsScript);
   await page.goto(origin+'/arcade/');await page.waitForFunction(()=>window.FG?.studio&&window.FG?.store);
   assert.equal(await page.evaluate(()=>FG.factory?.indexedStoragePreview===true),indexedMode,'Delivered build authority mode differs from benchmark selection');
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
    let originalBytes=0,previewBytes=0;const originalHashes=[];
    for(let i=0;i<originalCount;i++){
     const canvas=document.createElement('canvas');canvas.width=canvas.height=size;const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(size,size);let seed=i+17;
     for(let n=0;n<pixels.data.length;n+=4){seed=(Math.imul(seed,1664525)+1013904223)>>>0;pixels.data[n]=seed&255;pixels.data[n+1]=(seed>>>8)&255;pixels.data[n+2]=(seed>>>16)&255;pixels.data[n+3]=255;}ctx.putImageData(pixels,0,0);
     const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png')),drawing=await saveDrawing(owner,'Synthetic original '+i,blob);originalBytes+=drawing.bytes.byteLength;previewBytes+=drawing.preview?.byteLength||0;originalHashes.push(drawing.sha256);
    }
    const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v),digest=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(value))))].map(x=>x.toString(16).padStart(2,'0')).join('');
    const originalRevisions=store.snapshot().revisions.sort((a,b)=>a.id.localeCompare(b.id)),originalWords=notebook.sessions.map(s=>({id:s.id,messages:s.messages})).sort((a,b)=>a.id.localeCompare(b.id));
    return {owner,firstProject:made[0],workspaceRevisions:originalRevisions.length,originalRevisionIds:originalRevisions.map(r=>r.id),originalRevisionsHash:await digest(originalRevisions),originalWordsHash:await digest(originalWords),sessionId:'synthetic-session-0',artwork:{originalCount,pixels:size,originalBytes,previewBytes,originalHashes:originalHashes.sort()}};
   },{projects,revisionsPerProject,sessions,messages});
   let migration=null;
   if(indexedMode){
    const start=performance.now(),reloaded=page.waitForEvent('domcontentloaded',{timeout:120000});
    await page.evaluate(()=>{const button=document.getElementById('recovery-prepare-indexed');if(!button)throw Error('The actual Parent preparation control is missing');button.click();});await reloaded;await page.waitForFunction(()=>window.FG?.studio&&window.FG?.creation&&window.FG?.factory);
    await page.addScriptTag({content:bridge});await page.evaluate(async()=>{const owner=()=>FG.store.current().id,native=await StorageBenchmark.NativeWorkspace.open(localStorage,owner),notebook=await StorageBenchmark.NotebookWorkspace.open(localStorage,owner),creation=await StorageBenchmark.CreationWorkspace.open(localStorage,owner);if(!native.indexed||!notebook.indexed||!creation.indexed)throw Error('Parent preparation did not activate all three domains');native.close();notebook.close();creation.close();});migration={allDomainsViaParentAndReloadMs:performance.now()-start};
   }
   const runs=[];
   for(let run=0;run<samples;run++){
    const cdp=await context.newCDPSession(page);await cdp.send('Performance.enable');
    const nav=performance.now();await page.reload();await page.waitForFunction(()=>window.FG?.studio&&window.FG?.store&&!document.getElementById('jemsWriterNotice'));
    const readyMs=performance.now()-nav;
    const startup=await page.evaluate(()=>({counters:storageBenchmarkMetrics.read(),heapBytes:performance.memory?.usedJSHeapSize??null,domNodes:document.querySelectorAll('*').length}));
    startup.processMetrics=(await cdp.send('Performance.getMetrics')).metrics.filter(m=>['TaskDuration','ScriptDuration','JSHeapUsedSize','JSHeapTotalSize'].includes(m.name));
    const uiStart=performance.now();await page.evaluate(()=>FG.studio.home());await page.locator('[data-session="synthetic-session-0"] .studio-saved-open').waitFor();
    const libraryMs=performance.now()-uiStart;
    const openStart=performance.now();await page.locator('[data-session="synthetic-session-0"] .studio-saved-open').click();await page.waitForFunction(()=>document.querySelector('#studioTitle')?.textContent?.includes('Synthetic'));
    const openMs=performance.now()-openStart;
    await page.locator('#studioChange').click();await page.locator('#studioPrompt').waitFor({state:'visible'});
    await page.evaluate(()=>{storageBenchmarkMetrics.reset();document.getElementById('studioDraftStatus').textContent='';});
    const uiSaveStart=performance.now();await page.locator('#studioPrompt').fill('Synthetic actual UI thought '+run);await page.locator('#studioPrompt').blur();await page.evaluate(()=>FG.studio.flushDraft());await page.waitForFunction(()=>/saved on this device/i.test(document.getElementById('studioDraftStatus')?.textContent||''));
    const uiSaveDraft={ms:performance.now()-uiSaveStart,counters:await page.evaluate(()=>storageBenchmarkMetrics.read())};
    await page.addScriptTag({content:bridge});
    const operations=await page.evaluate(async({seed,run,indexedMode})=>{
     const {RevisionStore,StudioNotebook,NativeWorkspace,NotebookWorkspace,exportArtBundle,restoreArtBundle,drawings}=StorageBenchmark,out={};let store,book;
     const measure=async(name,fn)=>{storageBenchmarkMetrics.reset();const t=performance.now();const result=await fn();out[name]={ms:performance.now()-t,counters:storageBenchmarkMetrics.read()};return result;};
     await measure('openDomainAdapters',async()=>{store=indexedMode?await NativeWorkspace.open(localStorage,()=>FG.store.current().id):new RevisionStore(localStorage);book=indexedMode?await NotebookWorkspace.open(localStorage,()=>FG.store.current().id):new StudioNotebook(localStorage);if(indexedMode&&(!store.indexed||!book.indexed))throw Error('Actual indexed authority was not activated');});
     await measure('list',async()=>{const a=indexedMode?(await store.page(seed.owner,null,24)).items:store.list(seed.owner),b=book.list(seed.owner);if(!a.length||!b.length)throw Error('Missing synthetic data');});
     await measure('openSavedRecord',()=>store.revision(seed.firstProject.id,seed.owner));
     await measure('saveDraft',()=>book.update(seed.sessionId,seed.owner,s=>{s.draft='Synthetic saved thought '+run;}));
     await measure('saveRevision',async()=>{const p=await store.project(seed.firstProject.id,seed.owner),r=await store.revision(p.id,seed.owner);return store.commit(p.id,seed.owner,r.config,'Measured revision '+run,'Retain the last working game',undefined,p.headId);});
     await measure('profileSave',()=>FG.store.save());
     const raw=await measure('legacyExport',async()=>JSON.stringify({profiles:FG.store.data,workspace:await store.snapshot(),notebook:indexedMode?await book.snapshot():book.read()}));
     out.legacyExport.utf8Bytes=new TextEncoder().encode(raw).length;
     await measure('legacyRestoreValidation',async()=>{const value=JSON.parse(raw);if(indexedMode)await store.indexed.restoreSnapshot(value.workspace,'benchmark-restore-native-'+run);else store.restore(JSON.stringify(value.workspace));await book.restore(value.notebook,'benchmark-restore-notebook-'+run);});
     const artStart=performance.now(),artBundle=await exportArtBundle(seed.owner);out.artExport={ms:performance.now()-artStart,utf8Bytes:new TextEncoder().encode(JSON.stringify(artBundle)).length};
     const restoreStart=performance.now();await restoreArtBundle(seed.owner,artBundle);out.artRestore={ms:performance.now()-restoreStart};
     const originals=await drawings(seed.owner);out.artwork={count:originals.length,uniqueHashes:new Set(originals.map(x=>x.sha256)).size,originalBytes:originals.reduce((n,x)=>n+x.bytes.byteLength,0)};
     out.localStorage={keys:localStorage.length,byKey:Object.fromEntries(Object.keys(localStorage).sort().map(key=>[key,new TextEncoder().encode(localStorage.getItem(key)||'').length])),utf8Bytes:Object.keys(localStorage).reduce((sum,key)=>sum+new TextEncoder().encode(localStorage.getItem(key)||'').length,0),codeUnits:Object.keys(localStorage).reduce((sum,key)=>sum+(localStorage.getItem(key)||'').length,0)};
     if(indexedMode){store.close();book.close();}return out;
    },{seed,run,indexedMode});
    operations.uiSaveDraft=uiSaveDraft;
    if(completeRecovery){
     const start=performance.now();await page.evaluate(()=>{const button=document.getElementById('recovery-save');if(!button)throw Error('Missing integrated recovery control');document.getElementById('jemsRecoveryStatus').textContent='';button.click();});
     await page.waitForFunction(()=>document.getElementById('jemsRecoveryStatus')?.textContent==='Complete recovery copy saved on this device.');
     operations.completeRecovery={captureAndSaveMs:performance.now()-start,...await page.evaluate(async()=>{
      const scope={origin:location.origin,audience:'family',owners:FG.store.familyProfiles().map(p=>p.id)},vault=new StorageBenchmark.RecoveryVault(scope,()=>{}),start=performance.now(),point=(await vault.list(undefined,1))[0],archive=await vault.read(point.id);
      return {pointId:point.id,readAndVerifyMs:performance.now()-start,archiveBytes:new TextEncoder().encode(JSON.stringify(archive)).length,parts:point.parts.length,uniqueChunks:Object.keys(archive.chunks).length,logicalPartBytes:point.parts.reduce((n,p)=>n+p.size,0)};
     })};
    }
    operations.indexedFootprint=await page.evaluate(async()=>{const rows=[];for(const info of await indexedDB.databases()){if(!info.name)continue;const db=await new Promise((resolve,reject)=>{const request=indexedDB.open(info.name);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});for(const name of db.objectStoreNames){const row={database:info.name,store:name,records:0,logicalPayloadBytes:0};await new Promise((resolve,reject)=>{const tx=db.transaction(name),cursor=tx.objectStore(name).openCursor();cursor.onsuccess=()=>{if(cursor.result){row.records++;row.logicalPayloadBytes+=storageBenchmarkMetrics.payloadBytes(cursor.result.value);cursor.result.continue();}};tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});rows.push(row);}db.close();}return {stores:rows,logicalPayloadBytes:rows.reduce((n,r)=>n+r.logicalPayloadBytes,0),browserEstimate:await navigator.storage.estimate()};});
    const processMetrics=(await cdp.send('Performance.getMetrics')).metrics.filter(m=>['TaskDuration','ScriptDuration','JSHeapUsedSize','JSHeapTotalSize'].includes(m.name));await cdp.detach();
    runs.push({readyMs,libraryMs,openMs,startup,operations,processMetrics});checkpoint({scenario,seed,runs});console.log('Captured '+scenario+' sample '+(run+1));
   }
   let completeRestore=null;
   if(completeRecovery){
    const pointId=runs.at(-1).operations.completeRecovery.pointId;await page.waitForFunction(id=>!!document.getElementById('recovery-preview-'+id),pointId);await page.evaluate(id=>document.getElementById('recovery-preview-'+id).click(),pointId);await page.waitForFunction(()=>!!document.getElementById('recovery-restore'));
    await page.evaluate(()=>window.addEventListener('pagehide',()=>console.log('STORAGE_BENCHMARK_RECOVERY_STATUS '+document.getElementById('jemsRecoveryStatus')?.textContent),{once:true}));
    const start=performance.now(),navigation=page.waitForEvent('domcontentloaded',{timeout:120000}).then(()=>({outcome:'restored'}));
    const refused=page.waitForFunction(()=>document.getElementById('jemsRecoveryStatus')?.getAttribute('role')==='alert',null,{timeout:120000}).then(async()=>({outcome:'refused',message:await page.locator('#jemsRecoveryStatus').innerText()})).catch(error=>{if(/Execution context was destroyed|navigation|closed/.test(error.message))return navigation;throw error;});
    await page.evaluate(()=>document.getElementById('recovery-restore').click());const outcome=await Promise.race([navigation,refused]);if(outcome.outcome==='restored')await page.waitForFunction(()=>window.FG?.studio&&window.FG?.store&&!document.getElementById('jemsWriterNotice'));completeRestore={...outcome,handlerAndReloadMs:performance.now()-start,samples:1,pointId};
    if(outcome.outcome==='restored'){
     await page.addScriptTag({content:bridge});completeRestore.verified=await page.evaluate(async({pointId,seed})=>{
      const scope={origin:location.origin,audience:'family',owners:FG.store.familyProfiles().map(p=>p.id)},receipt=await new StorageBenchmark.RecoveryVault(scope,()=>{}).receipt(pointId),art=await StorageBenchmark.drawings(seed.owner),book=FG.studio.captureNotebook?await FG.studio.captureNotebook():FG.studio.exportNotebook(),native=FG.factory.captureWorkspace?await FG.factory.captureWorkspace():FG.factory.exportWorkspace();
      const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v),digest=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(value))))].map(x=>x.toString(16).padStart(2,'0')).join('');
      return {committedReceipt:receipt?.phase==='complete',receiptPhase:receipt?.phase??null,originalImageHashes:JSON.stringify(art.map(x=>x.sha256).sort())===JSON.stringify(seed.artwork.originalHashes),originalCount:art.length,expectedOriginalCount:seed.artwork.originalCount,sessionId:book.sessions.some(s=>s.id===seed.sessionId),sessionCount:book.sessions.length,allOriginalWords:await digest(book.sessions.map(s=>({id:s.id,messages:s.messages})).sort((a,b)=>a.id.localeCompare(b.id)))===seed.originalWordsHash,allOriginalRevisionDefinitions:await digest(native.revisions.filter(r=>seed.originalRevisionIds.includes(r.id)).sort((a,b)=>a.id.localeCompare(b.id)))===seed.originalRevisionsHash,originalNativeRevision:native.revisions.some(r=>r.id===seed.firstProject.headId),revisionCount:native.revisions.length,expectedOriginalRevision:seed.firstProject.headId,pendingJournal:localStorage.getItem('jems-complete-restore-pending-v1')};
     },{pointId,seed});completeRestore.statusBeforeReload=recoveryStatuses.at(-1);if(!completeRestore.verified.committedReceipt)completeRestore.outcome='not-committed';checkpoint({scenario,seed,runs,completeRestore});if(!['committedReceipt','originalImageHashes','allOriginalWords','allOriginalRevisionDefinitions','sessionId','originalNativeRevision'].every(key=>completeRestore.verified[key]))throw Error('Complete restored source verification failed: '+JSON.stringify(completeRestore));
    }
   }
   assert.deepEqual(errors,[],'application page errors');
   rows.push({scenario,projects,revisionsPerProject,initialRevisions:seed.workspaceRevisions,sessions,messagesPerSession:messages,artwork:seed.artwork,migration,completeRestore,metrics:Object.fromEntries(['readyMs','libraryMs','openMs'].map(key=>[key,summarize(runs.map(r=>r[key]))])),runs});
   await context.close();console.log('Measured '+scenario);
  }
  const report={schema:'jems.storage.application-benchmark.v2',harnessSha256:createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),selectedScenarios:selectedScenarios??['small','medium','large'],authority:indexedMode?'explicit-storage-preview-indexed':'default-legacy',observedAt:new Date().toISOString(),source:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),gitTree:execFileSync('git',['rev-parse','HEAD^{tree}'],{cwd:root,encoding:'utf8'}).trim(),trackedNonApplicationChanges:trackedChanges,build:{directory:'dist',fileCount:bundleFiles.length,bytes:bundleFiles.reduce((n,x)=>n+x.bytes,0),builtFilesSha256,provenance:'Build TARGET from this committed source before running; this digest identifies measured delivered bytes, not a hosted build attestation.'},scope:'Synthetic data generated with actual application RevisionStore/StudioNotebook, built Jems UI, real Chromium localStorage/IndexedDB; desktop emulation on one shared Linux host. No network provider or cloud data. Native/notebook record operations use the actual selected authority. The legacyExport/legacyRestoreValidation key names retain comparison compatibility; indexed runs snapshot/restore the active indexed sources. They exclude originals, rewards, Pals and cloud; full backup is measured separately; one complete restore handler/reload per size records success or explicit refusal rather than hiding a capacity limit.',instrumentation:'Synchronous JSON and localStorage instrumentation adds overhead; byte counters are UTF-16 code units, separately exported UTF-8 bytes. Startup includes browser navigation and readiness wait. IDB counters instrument object-store get/getAll/openCursor/add/put methods (not every index-cursor, key-read or browser disk operation) and include estimated logical JSON plus binary payloads; footprint includes immutable history and retained original migration sources separately from localStorage, but omits browser index/page overhead. Original baseline v1 lacked these IDB counters and UI draft timing; compare v2 only. Process metrics are CDP observations of startup and the complete measured page lifetime (including explicit footprint traversal), not isolated CPU or physical-device memory. Samples share warm HTTP cache and accumulate one retained revision per sample.',browser:await browser.version(),samples,rows};
  fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(output);
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
