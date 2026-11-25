/* Native IndexedDB operations and existing domain readers, synthetic data only. */
const assert=require('node:assert/strict'),http=require('node:http');
const {build}=require('esbuild'),{chromium,webkit}=require('playwright');
(async()=>{
 const bundle=await build({stdin:{contents:`export * from './src/storage/indexed-native';export * from './src/storage/indexed-records';export * from './src/factory/workspace';export * from './src/runtime/manifests';export * from './src/assets/private-drawings';export * from './src/drawing/library';`,resolveDir:process.cwd()},bundle:true,write:false,format:'iife',globalName:'domainTest',platform:'browser'});
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/test.js'?'text/javascript':'text/html');res.end(req.url==='/test.js'?bundle.outputFiles[0].text:'<!doctype html><body><script src="/test.js"></script></body>');}).listen(0,'127.0.0.1');await new Promise(resolve=>server.listening?resolve():server.once('listening',resolve));
 let browser;try{
  const engine=process.env.STORAGE_BROWSER==='webkit'?webkit:chromium;browser=await engine.launch({...(engine===chromium?{executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']}:{}),headless:true});const context=await browser.newContext(),page=await context.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
  const result=await page.evaluate(async()=>{
   const checks=[];const expect=async(fn,message)=>{let failure=false;try{await fn();}catch{failure=true;}if(!failure)throw Error(message);};
   const scope={family:'synthetic-domain',profile:'player1'},records=await domainTest.IndexedRecords.open(scope,()=>{});
   const operation=(id,version)=>({id,scope,changes:[{collection:'draft',id:'one',expectedVersion:version,value:{text:id}}]});
   await records.commit(operation('z-first',0));await records.commit(operation('a-second',1));
   if((await records.pending()).map(x=>x.id).join()!=='z-first,a-second')throw Error('dependent operations reordered');
   await records.commit({id:'local',scope,changes:[{collection:'local',id:'private',expectedVersion:0,value:{original:'local only'}}]},{enqueue:false});if((await records.pending()).length!==2)throw Error('local data enqueued');
   await records.setSyncCursor('',JSON.stringify({epoch:'one',after:'4'}));await expect(()=>records.setSyncCursor('','bad'),'stale cursor accepted');records.close();checks.push('commit-ordered outbox and cursor CAS');
   const rawStore=new Map(),port={getItem:k=>rawStore.get(k)??null,setItem:(k,v)=>rawStore.set(k,v)},legacy=new domainTest.RevisionStore(port);
   const source=legacy.create('player1','buckets','Splash or Pass');let head=source.headId;
   for(let i=0;i<7;i++)head=legacy.commit(source.id,'player1',domainTest.defaults('buckets'),'Edition '+i,'',undefined,head).id;
   const dragon=legacy.create('player1','dragon','Dragon Island');legacy.keep(source.id,'player1',head);legacy.fork(source.id,'player1','Saved fork');legacy.create('player2','buckets','Other player');
   const raw=port.getItem(domainTest.WORKSPACE_KEY),store=await domainTest.IndexedNativeStore.open(scope,()=>{});
   await expect(()=>store.migrateLegacy(raw,{batchSize:3,onBatch:()=>{throw Error('Synthetic renderer interruption');}}),'interruption missing');
   const pending=await store.migration();if(pending.complete||pending.progress!==3)throw Error('migration progress not durable');await expect(()=>store.page(),'partial library published');
   await store.migrateLegacy(raw,{batchSize:3});await store.migrateLegacy(raw);if(port.getItem(domainTest.WORKSPACE_KEY)!==raw)throw Error('legacy source altered');
   const first=await store.page(null,2),second=await store.page(first.next,2);if(first.items.length!==2||second.items.length!==1)throw Error('project paging or ownership mismatch');
   const before=await store.revision(source.id),config={...before.config,bucketCount:4};
   const competing=await Promise.allSettled([store.commit(source.id,config,'One','',before.id),store.commit(source.id,config,'Two','',before.id)]);if(competing.filter(x=>x.status==='fulfilled').length!==1)throw Error('stale write accepted');
   const edited=await store.revision(source.id);await store.keep(source.id,edited.id);await store.undo(source.id);if((await store.revision(source.id)).id!==before.id)throw Error('undo lost parent');await store.redo(source.id);if((await store.revision(source.id)).id!==edited.id)throw Error('redo lost child');
   const history=await store.history(source.id,null,3);if(history.items.length!==3||!history.next)throw Error('history not bounded');
   const fork=await store.fork(source.id,'Independent copy');if((await store.revision(fork.id)).sourceRevisionId!==edited.id)throw Error('fork provenance lost');
   const configRows=await store.records.page('native-configs');if(configRows.length!==3)throw Error('unchanged mechanics duplicated');
   if((await store.records.pending()).length!==2)throw Error('native migration or editing enqueued private data');
   const capture=await store.snapshot();if(capture.projects.some(p=>p.owner!=='player1')||capture.revisions.length!==12)throw Error('full capture incomplete');
   await expect(()=>store.migrateLegacy(raw+' '),'changed migration accepted');store.close();checks.push('resumable native authority, bounded reads, config reuse, CAS, Keep/Undo/Fork');
   const other=await domainTest.IndexedNativeStore.open({family:'other-family',profile:'player1'},()=>{});await expect(()=>other.project(source.id),'cross-family game read');other.close();
   // Real original records remain byte-for-byte inline; page only lightweight cards.
   await domainTest.withArtTransaction(['drawings'],'readwrite',tx=>{for(let i=0;i<30;i++){const item={id:'art-'+String(i).padStart(3,'0'),owner:'player1',name:'Original '+i,mime:'image/png',bytes:new ArrayBuffer(4096),preview:new ArrayBuffer(24),sha256:'a'.repeat(64),createdAt:new Date(1700000000000+i).toISOString()};tx.objectStore('drawings').put(item);domainTest.saveDrawingMetadata(tx,item);}const other={id:'other-art',owner:'player2',name:'Private other',mime:'image/png',bytes:new ArrayBuffer(4096),sha256:'b'.repeat(64),createdAt:new Date().toISOString()};tx.objectStore('drawings').put(other);domainTest.saveDrawingMetadata(tx,other);});
   const a=await domainTest.drawingPage('player1',{limit:24}),b=await domainTest.drawingPage('player1',{limit:24,after:a.next});if(a.items.length!==24||b.items.length!==6||a.total!==30||a.items.some(i=>'bytes'in i))throw Error('art catalog hydrated originals or leaked owner');
   const original=await domainTest.drawing('player1',a.items[0].id);if(original.bytes.byteLength!==4096)throw Error('original missing');await expect(()=>domainTest.drawing('player2',original.id),'cross-profile original read');
   await domainTest.updateDrawing('player1',original.id,{name:'Changed details'});if((await domainTest.drawingPage('player1',{search:'Changed details'})).items.length!==1)throw Error('catalog update missing');checks.push('24-card artwork paging and exact scoped original retrieval');
   return checks;
  });
  assert.equal(result.length,3);console.log(JSON.stringify({browser:process.env.STORAGE_BROWSER??'chromium',checks:result}));await context.close();
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
