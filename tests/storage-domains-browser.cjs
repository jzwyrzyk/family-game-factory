/* Native IndexedDB operations and existing domain readers, synthetic data only. */
const assert=require('node:assert/strict'),http=require('node:http');
const {build}=require('esbuild'),{chromium,webkit}=require('playwright');
(async()=>{
 const bundle=await build({stdin:{contents:`export * from './src/storage/indexed-native';export * from './src/storage/indexed-records';export * from './src/factory/workspace';export * from './src/runtime/manifests';export * from './src/assets/private-drawings';export * from './src/drawing/library';`,resolveDir:process.cwd()},bundle:true,write:false,format:'iife',globalName:'domainTest',platform:'browser'});
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/test.js'?'text/javascript':'text/html');res.end(req.url==='/test.js'?bundle.outputFiles[0].text:'<!doctype html><body><script src="/test.js"></script></body>');}).listen(0,'127.0.0.1');await new Promise(resolve=>server.listening?resolve():server.once('listening',resolve));
 let browser;try{
  const engine=process.env.STORAGE_BROWSER==='webkit'?webkit:chromium;browser=await engine.launch({...(engine===chromium?{executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']}:{}),headless:true});const context=await browser.newContext(),page=await context.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
  const result=await page.evaluate(async png=>{
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
   const exactId=crypto.randomUUID(),exact=await store.commit(dragon.id,domainTest.defaults('dragon'),'Preserve runtime identity','',dragon.headId,exactId);if(exact.id!==exactId)throw Error('caller revision id lost');
   const forkId=crypto.randomUUID(),exactFork=await store.fork(dragon.id,'Exact copy',exact.id,{revisionId:forkId,expectedHeadId:exact.id});if(exactFork.headId!==forkId)throw Error('copy runtime identity lost');
   await store.restoreSnapshot(capture,'reviewed-restore');if((await store.revision(dragon.id)).id!==dragon.headId)throw Error('reviewed pointer not restored');if(!(await store.snapshot()).revisions.some(r=>r.id===exactId))throw Error('restore deleted newer original');
   const corrupt=structuredClone(capture);corrupt.revisions.find(r=>r.projectId===source.id).label='Conflicting immutable identity';const protectedHead=(await store.project(source.id)).headId;await expect(()=>store.restoreSnapshot(corrupt,'conflicting-restore'),'immutable content overwritten');if((await store.project(source.id)).headId!==protectedHead)throw Error('failed restore changed pointer');
   const graph=await store.projectRecords(source.id),target=await domainTest.IndexedNativeStore.open({family:'download-family',profile:'player1'},()=>{});await target.migrateLegacy(JSON.stringify({version:2,projects:[],revisions:[],plays:[]}));
   await expect(()=>target.applyRemoteGraph(graph.filter(row=>row.collection==='native-projects'),'partial-download'),'partial graph published');if((await target.page()).items.length)throw Error('incomplete copy visible');
   const remoteReceipt=await target.applyRemoteGraph(graph,'complete-download'),again=await target.applyRemoteGraph(graph,'complete-download');if(JSON.stringify(remoteReceipt)!==JSON.stringify(again)||remoteReceipt.versions.length!==graph.length+1)throw Error('download receipt not idempotent or incomplete');if((await target.revision(source.id)).config.bucketCount!==4)throw Error('remote mechanics lost');target.close();
   await expect(()=>store.migrateLegacy(raw+' '),'changed migration accepted');store.close();checks.push('resumable native authority, bounded reads, config reuse, CAS, Keep/Undo/Fork');
   const other=await domainTest.IndexedNativeStore.open({family:'other-family',profile:'player1'},()=>{});await expect(()=>other.project(source.id),'cross-family game read');other.close();
   // Prepared native writes are record-scoped and can legitimately exceed the
   // legacy whole-key limits. Recovery must retain every admitted original.
   const empty=JSON.stringify({version:2,projects:[],revisions:[],plays:[]}),large=await domainTest.IndexedNativeStore.open({family:'large-native-source',profile:'player1'},()=>{});await large.migrateLegacy(empty);
   const games=[];for(let i=0;i<51;i++)games.push(await large.create('buckets','Retained game '+i));
   let newest=games[0].headId;for(let i=0;i<500;i++)newest=(await large.commit(games[0].id,domainTest.defaults('buckets'),'Retained edition '+i,'',newest)).id;
   const played=games[1],outcome={game:'buckets',config:domainTest.defaults('buckets'),won:true,level:1,durationMs:100,title:'Retained play',description:'Synthetic recovery evidence',at:'2026-11-25T00:00:00Z'};
   for(let i=0;i<1001;i++)await large.record(played.id,played.headId,outcome);
   const full=await large.snapshot();if(full.projects.length!==51||full.revisions.length!==551||full.plays.length!==1001)throw Error('prepared source did not retain beyond legacy limits');
   const one=await large.snapshotProject(games[0].id);if(one.revisions.length!==501)throw Error('selected prepared history still used legacy cap');
   const roots=full.projects.map(p=>({p,r:full.revisions.find(r=>r.projectId===p.id&&r.parentId===null)})),projectLimit={version:2,projects:roots.map(({p,r})=>({...p,headId:r.id})),revisions:roots.map(({r})=>r),plays:[]},playLimit={version:2,projects:[played],revisions:full.revisions.filter(r=>r.id===played.headId),plays:full.plays};
   for(const source of [projectLimit,one,playLimit]){domainTest.validateIndexedNativeWorkspace(source,'player1');let error;try{domainTest.validateWorkspace(source);}catch(e){error=e;}if(error?.message!=='This workspace backup is not supported.')throw Error('legacy aggregate limits changed');}
   const destination=await domainTest.IndexedNativeStore.open({family:'large-native-target',profile:'player1'},()=>{});await destination.migrateLegacy(empty);await destination.restoreSnapshot(full,'full-large-native-restore');
   if(JSON.stringify(await destination.snapshot())!==JSON.stringify(full))throw Error('large native restore lost original bytes or graph');
   const foreign=structuredClone(full);foreign.projects[0].owner='player2';await expect(()=>destination.restoreSnapshot(foreign,'foreign-large-restore'),'foreign prepared owner accepted');
   const broken=structuredClone(full);broken.revisions.find(r=>r.id===newest).parentId=newest;await expect(()=>destination.restoreSnapshot(broken,'cyclic-large-restore'),'large malformed ancestry accepted');
   if((await destination.project(games[0].id)).headId!==newest)throw Error('rejected large restore changed live pointer');large.close();destination.close();checks.push('owner-scoped atomic recovery beyond legacy game, revision and play limits');
   // Real original records remain byte-for-byte inline; page only lightweight cards.
   const bytes=Uint8Array.from(atob(png), char => char.charCodeAt(0));
   const verified=await domainTest.prepareDrawing('player1','Storage sample',new Blob([bytes],{type:'image/png'}));
   await domainTest.withArtTransaction(['drawings'],'readwrite',tx=>{
    for(let i=0;i<30;i++){
     const item={...verified,id:'art-'+String(i).padStart(3,'0'),name:'Original '+i,createdAt:new Date(1700000000000+i).toISOString()};
     tx.objectStore('drawings').put(item);domainTest.saveDrawingMetadata(tx,item);
    }
    const other={...verified,id:'other-art',owner:'player2',name:'Private other'};
    tx.objectStore('drawings').put(other);domainTest.saveDrawingMetadata(tx,other);
   });
   const a=await domainTest.drawingPage('player1',{limit:24}),b=await domainTest.drawingPage('player1',{limit:24,after:a.next});if(a.items.length!==24||b.items.length!==6||a.total!==30||a.items.some(i=>'bytes'in i))throw Error('art catalog hydrated originals or leaked owner');
   const original=await domainTest.drawing('player1',a.items[0].id);const retained=new Uint8Array(original.bytes);if(retained.length!==4096||!bytes.every((byte,index)=>retained[index]===byte))throw Error('original missing or changed');await expect(()=>domainTest.drawing('player2',original.id),'cross-profile original read');
   await domainTest.updateDrawing('player1',original.id,{name:'Changed details'});if((await domainTest.drawingPage('player1',{search:'Changed details'})).items.length!==1)throw Error('catalog update missing');checks.push('24-card artwork paging and exact scoped original retrieval');
   return checks;
  },require('node:fs').readFileSync(require.resolve('./fixtures/storage-original-4k.png'),'base64'));
  assert.equal(result.length,4);console.log(JSON.stringify({browser:process.env.STORAGE_BROWSER??'chromium',checks:result}));await context.close();
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
