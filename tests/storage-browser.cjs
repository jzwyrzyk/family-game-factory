/* Real Chromium localStorage restart, Web Locks and IndexedDB tests. Synthetic only. */
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs');
const {build}=require('esbuild'),{chromium}=require('playwright');
(async()=>{
 const bundle=await build({stdin:{contents:`export * from './src/storage/local-journal';export * from './src/storage/project-recovery';export * from './src/storage/indexed-records';export * from './src/rewards/write-guard';export * from './src/studio/notebook';export * from './src/factory/workspace';export * from './src/runtime/manifests';`,resolveDir:process.cwd()},bundle:true,write:false,format:'iife',globalName:'storageTest',platform:'browser'});
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/test.js'?'text/javascript':'text/html');res.end(req.url==='/test.js'?bundle.outputFiles[0].text:'<!doctype html><body><script src="/test.js"></script></body>');}).listen(0,'127.0.0.1');
 await new Promise(resolve=>server.listening?resolve():server.once('listening',resolve));let browser;
 const results=[];
 try{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox']});
  for(const [device,width,height] of [['desktop',1280,800],['tablet',820,1180],['phone',390,844]]){
   const context=await browser.newContext({viewport:{width,height}});let page=await context.newPage();const url=`http://127.0.0.1:${server.address().port}`;
   await page.goto(url);
   for(let boundary=1;boundary<=5;boundary++){
    await page.evaluate(boundary=>{
     localStorage.clear();let step=0;
     const port={getItem:k=>localStorage.getItem(k),setItem:(k,v)=>{localStorage.setItem(k,v);if(++step===boundary)throw Error('Stop renderer');},removeItem:k=>{localStorage.removeItem(k);if(++step===boundary)throw Error('Stop renderer');}};
     const journal=storageTest.localJournal(port,'family',['a','b'],()=>{},()=>{});
     localStorage.setItem('a','original');
     try{journal.commit([{key:'a',before:'original',after:'new-a'},{key:'b',before:null,after:'new-b'}]);}catch{}
    },boundary);
    const cdp=await context.newCDPSession(page);await Promise.race([cdp.send('Page.crash').catch(()=>{}),new Promise(resolve=>setTimeout(resolve,1500))]);await page.close();page=await context.newPage();await page.goto(url);
    const state=await page.evaluate(()=>{const j=storageTest.localJournal(localStorage,'family',['a','b'],()=>{},()=>{});j.recover();return [localStorage.getItem('a'),localStorage.getItem('b'),localStorage.getItem(storageTest.LOCAL_JOURNAL_KEY)];});
    assert.deepEqual(state,boundary>=4?['new-a','new-b',null]:['original',null,null]);
   }
   await page.evaluate(()=>localStorage.clear());
   assert.equal(await page.evaluate(()=>storageTest.installRewardWriteGuard()),true);
   const second=await context.newPage();await second.goto(url);assert.equal(await second.evaluate(()=>storageTest.installRewardWriteGuard()),false);await second.close();
   // Persisted real schema images survive reopening the actual recovery adapter.
   await page.evaluate(()=>{
    localStorage.clear();const ws=new storageTest.RevisionStore(localStorage),p=ws.create('player1','buckets','Exact original');
    const before=localStorage.getItem(storageTest.WORKSPACE_KEY);ws.commit(p.id,'player1',{...storageTest.defaults('buckets'),bucketCount:4},'Experiment');const after=localStorage.getItem(storageTest.WORKSPACE_KEY);localStorage.setItem(storageTest.WORKSPACE_KEY,before);
    const port={getItem:k=>localStorage.getItem(k),setItem:(k,v)=>{localStorage.setItem(k,v);if(k===storageTest.WORKSPACE_KEY)throw Error('Interrupted');},removeItem:k=>localStorage.removeItem(k)};
    try{storageTest.projectJournal(port,'family').commit([{key:storageTest.WORKSPACE_KEY,before,after}]);}catch{}
    window.expected=before;
   });
   const expected=await page.evaluate(()=>window.expected);await page.reload();await page.evaluate(()=>storageTest.installRewardWriteGuard());await page.evaluate(()=>storageTest.recoverLocalProjects(localStorage));assert.equal(await page.evaluate(()=>localStorage.getItem(storageTest.WORKSPACE_KEY)),expected);
   const indexed=await page.evaluate(async()=>{
    const scope={family:'synthetic',profile:'player1'};let allowed=true;const store=await storageTest.IndexedRecords.open(scope,()=>{if(!allowed)throw Error('denied');});
    const op={id:'once',scope,changes:[{id:'g1',collection:'games',expectedVersion:0,value:{title:'Original'}}]};const receipt=await store.commit(op);await store.commit(op);
    const checks=[];try{await store.commit({...op,id:'stale'});}catch{checks.push('stale rejected');}
    const page=await store.page('games');if(page.length!==1||page[0].version!==1)throw Error('duplicate');
    try{await store.commit({...op,id:'partial',changes:[{id:'g2',collection:'games',expectedVersion:0,value:2},...op.changes]});}catch{checks.push('atomic rollback');}
    if((await store.page('games')).length!==1)throw Error('partial write');if((await store.pending()).length!==1)throw Error('missing durable outbox');
    try{await store.acceptRemote([{...page[0],version:2,value:{title:'Remote'}}]);throw Error('overwrote pending');}catch(e){if(e.message!=='STORAGE_CONFLICT')throw e;}
    await store.acknowledge(receipt);if((await store.pending()).length)throw Error('ack not durable');
    await store.acceptRemote([{...page[0],version:2,value:{title:'Remote'}}]);await store.acceptRemote(page);if((await store.page('games'))[0].value.title!=='Remote')throw Error('stale overwrite');
    allowed=false;try{await store.page('games');}catch{checks.push('profile revoked');}allowed=true;store.close();
    const reopened=await storageTest.IndexedRecords.open(scope,()=>{});if((await reopened.page('games'))[0].value.title!=='Remote')throw Error('reopen');reopened.close();return checks;
   });assert.equal(indexed.length,3);results.push({device,rendererBoundaries:5,writerLock:true,indexed});await context.close();
  }
  // Multi-year synthetic metadata: 5 profiles × 5 years × 2,000 records/year.
  const context=await browser.newContext(),page=await context.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
  const benchmark=await page.evaluate(async()=>{
   const scope={family:'benchmark',profile:'player1'},store=await storageTest.IndexedRecords.open(scope,()=>{}),rows=[];
   for(let n=0;n<50000;n+=50){const op={id:'batch'+n,scope,changes:Array.from({length:50},(_,i)=>({id:'record'+String(n+i).padStart(7,'0'),collection:'history',expectedVersion:0,value:{year:2022+Math.floor((n+i)/10000),text:'Synthetic child-authored evidence. '.repeat(8)}}))};await store.commit(op);
    if([950,9950,49950].includes(n)){const times=[];for(let k=0;k<25;k++){const start=performance.now();const values=await store.page('history','record0000200',100);if(values.length!==100)throw Error('pagination');times.push(performance.now()-start);}times.sort((a,b)=>a-b);const start=performance.now();await store.commit({id:'save'+n,scope,changes:[{id:'draft'+n,collection:'drafts',expectedVersion:0,value:{text:'New thought'}}]});rows.push({records:n+50,page100MedianMs:times[12],page100P95Ms:times[23],saveMs:performance.now()-start});}
   }
   store.close();return rows;
  });await context.close();fs.mkdirSync('test-results',{recursive:true});fs.writeFileSync('test-results/storage-browser.json',JSON.stringify({scope:'Synthetic Chromium; renderer termination, not power-loss or physical-device acceptance',results,benchmark},null,2));console.log(JSON.stringify({results,benchmark}));
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
