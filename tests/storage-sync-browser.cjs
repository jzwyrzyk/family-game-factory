const assert=require('node:assert/strict'),http=require('node:http');
const {build}=require('esbuild'),{chromium,webkit}=require('playwright');
(async()=>{
 const bundle=await build({stdin:{contents:`export * from './src/storage/private-copy-ui';export * from './src/storage/indexed-native';export * from './src/factory/workspace';export * from './src/runtime/manifests';export * from './src/storage/indexed-records';export * from './src/storage/sync-journal';export * from './src/storage/synchronizer';export * from './src/storage/record-contract';`,resolveDir:process.cwd()},bundle:true,write:false,format:'iife',globalName:'syncTest',platform:'browser'});
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/test.js'?'text/javascript':'text/html');res.end(req.url==='/test.js'?bundle.outputFiles[0].text:'<!doctype html><body><script src="/test.js"></script></body>');}).listen(0,'127.0.0.1');await new Promise(r=>server.listening?r():server.once('listening',r));
 let browser;try{
  const engine=process.env.STORAGE_BROWSER==='webkit'?webkit:chromium;browser=await engine.launch({...(engine===chromium?{executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']}:{}),headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
  const result=await page.evaluate(async()=>{
   const localScope={family:'origin-local',profile:'child'},remoteScope={family:'server-family',profile:'child'},records=await syncTest.IndexedRecords.open(localScope,()=>{});
   const op=(id,version,value)=>({id,scope:localScope,changes:[{collection:'games',id:'game',expectedVersion:version,value}]});
   for(let i=0;i<5;i++)await records.commit(op('offline-'+i,i,{title:'Local '+i}),{enqueue:false});
   await records.commit(op('z-first',5,{title:'Chosen original'}));await records.commit(op('a-second',6,{title:'Chosen edit'}));
   let mapped=await syncTest.MappedSyncStore.open(records,localScope,remoteScope,()=>{}),state=new Map(),receipts=new Map(),feed=[],writes=0,lose=true;
   const remote={status:async()=>({version:1,epoch:'scope-one',domains:['games','artwork','conversation'],...remoteScope}),lookup:async id=>receipts.get(id)??null,read:async(c,id)=>state.get(c+':'+id)??null,
    commit:async op=>{if(op.scope.family!==remoteScope.family)throw Error('Wrong authority');const fingerprint=await syncTest.operationFingerprint(op);if(receipts.has(op.id))return receipts.get(op.id);
     if(op.changes.some(c=>(state.get(c.collection+':'+c.id)?.version??0)!==c.expectedVersion))throw Error('STORAGE_CONFLICT');writes++;const receipt={operation:op.id,fingerprint,versions:[]};for(const c of op.changes){const row={id:c.id,collection:c.collection,version:c.expectedVersion+1,value:c.value,deleted:c.deleted??false};state.set(c.collection+':'+c.id,row);feed.push(row);receipt.versions.push({id:c.id,collection:c.collection,version:row.version});}receipts.set(op.id,receipt);if(lose){lose=false;throw Error('Interrupted after accepted write');}return receipt;},
    changes:async(after,limit)=>({version:1,after,through:String(Math.min(Number(after)+limit,feed.length)),records:feed.slice(Number(after),Number(after)+limit),hasMore:Number(after)+limit<feed.length})};
   const pump=()=>new syncTest.ContinuityPump(mapped,remote,localScope,()=>{},async(_,fn)=>fn());
   if((await pump().runOnce()).state!=='offline'||writes!==1)throw Error('uncertain acknowledgment not preserved');mapped.close();mapped=await syncTest.MappedSyncStore.open(records,localScope,remoteScope,()=>{});
   if((await pump().runOnce()).state!=='current'||writes!==2||(await records.pending()).length)throw Error('mapped restart/dependency failed');
   if(state.get('games:game').version!==2||(await records.get('games','game')).version!==7)throw Error('local and remote versions conflated');
   const external={id:'game',collection:'games',version:3,value:{title:'Other device'},deleted:false};state.set('games:game',external);feed.push(external);
   if((await pump().runOnce()).state!=='current'||(await records.get('games','game')).version!==8||(await records.get('games','game')).value.title!=='Other device')throw Error('remote history not preserved as new local version');
   await records.commit(op('local-edit',8,{title:'This device'}));const other={...external,version:4,value:{title:'Concurrent device'}};state.set('games:game',other);feed.push(other);
   const conflict=await pump().runOnce();if(conflict.state!=='conflict'||(await records.pending()).length!==1)throw Error('conflict overwritten');
   await mapped.keepLocal(conflict.operation,conflict.remote);if((await pump().runOnce()).state!=='current'||state.get('games:game').version!==5||state.get('games:game').value.title!=='This device')throw Error('explicit resolution failed');
   if(!feed.some(r=>r.version===4&&r.value.title==='Concurrent device'))throw Error('remote previous version deleted');
   mapped.close();records.close();
   // A second device receives a complete graph through durable staging. Closing
   // between pages and losing the local publication response cannot expose a
   // half game or overwrite a newer unsent local revision.
   state=new Map();receipts=new Map();feed=[];writes=0;lose=false;
   remote.changes=async after=>({version:1,after,through:String(Math.min(Number(after)+2,feed.length)),records:feed.slice(Number(after),Number(after)+2),hasMore:Number(after)+2<feed.length});
   const memory=new Map(),port={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)},legacy=new syncTest.RevisionStore(port),project=legacy.create('child','buckets','Splash or Pass');
   const a=await syncTest.IndexedNativeStore.open({family:'local-A',profile:'child'},()=>{}),b=await syncTest.IndexedNativeStore.open({family:'local-B',profile:'child'},()=>{});
   await a.migrateLegacy(port.getItem(syncTest.WORKSPACE_KEY));await b.migrateLegacy(JSON.stringify({version:2,projects:[],revisions:[],plays:[]}));await a.queueSelectedCopy(project.id,()=>true);
   const mapA=await syncTest.MappedSyncStore.open(a.records,a.scope,remoteScope,()=>{},(rows,id)=>a.applyRemoteGraph(rows,id)),pumpA=new syncTest.ContinuityPump(mapA,remote,a.scope,()=>{},async(_,fn)=>fn());
   if((await pumpA.runOnce()).state!=='current')throw Error('first complete graph upload failed');
   let losePublication=true,mapB=await syncTest.MappedSyncStore.open(b.records,b.scope,remoteScope,()=>{},async(rows,id)=>{const receipt=await b.applyRemoteGraph(rows,id);if(losePublication){losePublication=false;throw Error('Lost local publication response');}return receipt;});
   const pumpB=()=>new syncTest.ContinuityPump(mapB,remote,b.scope,()=>{},async(_,fn)=>fn());
   if((await pumpB().runOnce(32,1)).state!=='pending'||(await b.page()).items.length!==0)throw Error('partial graph published');
   mapB.close();mapB=await syncTest.MappedSyncStore.open(b.records,b.scope,remoteScope,()=>{},async(rows,id)=>{const receipt=await b.applyRemoteGraph(rows,id);if(losePublication){losePublication=false;throw Error('Lost local publication response');}return receipt;});
   if((await pumpB().runOnce()).state!=='offline')throw Error('publication interruption not exercised');
   if((await pumpB().runOnce()).state!=='current'||(await b.project(project.id)).headId!==project.headId)throw Error('publication receipt recovery failed');
   const original=await b.revision(project.id),localEdit=await b.commit(project.id,{...original.config,bucketCount:4},'Unsent local choice','',original.id);
   await a.commit(project.id,{...original.config,bucketCount:5},'Other device choice','',original.id);if((await pumpA.runOnce()).state!=='current')throw Error('selected automatic enqueue failed');
   if((await pumpB().runOnce()).state!=='review'||(await b.project(project.id)).headId!==localEdit.id)throw Error('unsubmitted local work overwritten');
   mapA.close();mapB.close();a.close();b.close();
   const ui=await syncTest.IndexedNativeStore.open({family:'local-ui',profile:'child'},()=>{});await ui.migrateLegacy(JSON.stringify({version:2,projects:[],revisions:[],plays:[]}));
   document.body.innerHTML='<section><h2>Parent storage controls</h2><button id="exportData">Export family backup</button></section>';
   let selectedProfile='child';window.FG={store:{current:()=>({id:selectedProfile})},factory:{privateCopyStore:()=>ui,refreshPrivateCopies:async()=>{}}};let requests=0,deferAction='',releaseResponse,enteredResponse;
   window.fetch=async(path,options)=>{requests++;const body=JSON.parse(options.body),action=path.split('/').at(-1);let result;
    if(action==='status')result={...await remote.status(),family:remoteScope.family,profile:'child',guardian:true,guardianUntil:Date.now()+600000};
    else if(action==='lookup')result=await remote.lookup(body.operation);
    else if(action==='commit')result=await remote.commit(body.operation);
    else if(action==='read')result=await remote.read(body.collection,body.id);
    else if(action==='changes')result=await remote.changes(body.after,body.limit,body.epoch);else throw Error('Unexpected transport');
    if(action===deferAction){deferAction='';enteredResponse?.();await new Promise(resolve=>releaseResponse=resolve);}
    return new Response(JSON.stringify(result),{headers:{'Content-Type':'application/json'}});
   };
   syncTest.installPrivateCopyControls();if(requests!==0)throw Error('UI started a transfer on load');
   const find=text=>[...document.querySelectorAll('#jemsPrivateCopies button')].find(b=>b.textContent===text),wait=async b=>{for(let i=0;i<1000&&b.disabled;i++)await new Promise(r=>setTimeout(r,5));if(b.disabled)throw Error('UI did not settle');};
   const beforeWrites=writes,check=find('Check private copies');check.click();await wait(check);if(writes!==beforeWrites||document.querySelector('#jemsPrivateCopies select').hidden)throw Error('UI check uploaded unselected work or lost library');
   const selected=find('Copy the selected game');selected.click();await wait(selected);if(writes<=beforeWrites||!document.querySelector('#jemsPrivateCopies [role=status]').textContent.includes('up to date'))throw Error('selected UI copy did not complete');
   // Responses finishing after a profile change cannot reopen prior game names
   // or conflict details, including an owner switching away and back again.
   for(const action of ['status','changes']){
    deferAction=action;const entered=new Promise(resolve=>enteredResponse=resolve);check.click();await entered;
    dispatchEvent(new Event('factory-profile-changing'));selectedProfile='sibling';dispatchEvent(new Event('factory-profile-changing'));selectedProfile='child';releaseResponse();
    await new Promise(resolve=>setTimeout(resolve,30));
    const section=document.querySelector('#jemsPrivateCopies');if(!section.querySelector('select').hidden||section.textContent.includes('Splash or Pass')||section.textContent.includes('up to date')||section.textContent.includes('Review the changed records'))throw Error('late response exposed previous profile details');
   }
   ui.close();return {checks:13,writes,localVersion:9,serverVersion:5};
  });assert.equal(result.checks,13);console.log(JSON.stringify({browser:engine===webkit?'webkit':'chromium',...result}));
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
