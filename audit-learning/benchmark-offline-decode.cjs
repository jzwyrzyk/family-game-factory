const {chromium}=require('./phase-two-a/node_modules/playwright');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const sources={before:'phase-two-exact',after:'fast-decoder-exact'};
const reference=new Map(JSON.parse(fs.readFileSync(path.join(__dirname,'phase-two-exact-assets.json'))).assets.map(row=>[row.path,row.sha256]));
const results=[];
const argv=process.argv[2]||'measure';
async function run(browser,port,side,fallback,round,hashes){
 const context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});
 if(fallback)await context.addInitScript(()=>{Object.defineProperty(Uint8Array,'fromBase64',{value:undefined,configurable:true});});
 const page=await context.newPage(),errors=[],network=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith('http://127.0.0.1:'+port+'/'))network.push(r.url());});
 try{
  const t=performance.now();
  const url='http://127.0.0.1:'+port+'/'+side;
  await page.goto(url,{waitUntil:'commit',timeout:120000});
  const committed=Math.round(performance.now()-t);
  await page.waitForLoadState('domcontentloaded',{timeout:120000});
  const dcl=Math.round(performance.now()-t);
  await page.waitForFunction(()=>document.querySelector('#loading')?.hidden===true,null,{timeout:120000});
  const ready=Math.round(performance.now()-t);
  await page.waitForLoadState('load',{timeout:120000});
  const loaded=Math.round(performance.now()-t);
  const stats=await page.evaluate(()=>({source:__reviewReport().commit,native:typeof Uint8Array.fromBase64==='function',keys:__jemsReview.assetKeys.length}));
  await page.selectOption('#destination','learn:g3-groups');
  const frame=page.frames().find(f=>f.parentFrame()===page.mainFrame());
  await frame.locator('[data-skill-id="g3-groups"]').waitFor();
  if(hashes){
   const receipt=await page.evaluate(async()=>{
    const hashes=[],start=performance.now();
    for(const key of window.__jemsReview.assetKeys){
     const asset=window.__jemsReview.asset(key);
     const bytes=await (await fetch(asset)).arrayBuffer();
     const hashArray=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
     hashes.push([key,Array.from(hashArray,b=>b.toString(16).padStart(2,'0')).join('')]);
    }
    return {hashes,elapsedMs:Math.round(performance.now()-start)};
   });
   assert.equal(receipt.hashes.length,347);for(const [key,digest] of receipt.hashes)assert.equal(digest,reference.get(key),key);
   stats.verified=receipt.hashes.length;stats.fullAssetResolveHashMs=receipt.elapsedMs;
  }
  assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
  return {side,fallback,round,committed,dcl,ready,loaded,...stats};
 }finally{await context.close();}
}
(async()=>{
 const server=http.createServer((req,res)=>{
  if(req.url==='/favicon.ico'){res.writeHead(204);res.end();return;}
  const dir=sources[req.url.slice(1)];
  if(!dir){res.writeHead(404);res.end();return;}
  const file=path.join(__dirname,dir,'jems-ui-review.html');
  res.writeHead(200,{'Content-Type':'text/html','Content-Length':fs.statSync(file).size});fs.createReadStream(file).pipe(res);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 const out='decoder-'+argv+'.json',rounds=argv==='measure'?3:1;
 try{
  for(let i=0;i<rounds;i++){
   const modes=argv==='hash'?[['before',false],['after',false],['after',true]]:(i%2?[['after',false],['before',false]]:[['before',false],['after',false]]);
   for(const [side,fallback] of modes){
    const v=await run(browser,server.address().port,side,fallback,i+1,argv==='hash');
    results.push(v);console.log(JSON.stringify(v));
   }
  }
 }finally{
  fs.writeFileSync(path.join(__dirname,out),JSON.stringify({browser:browser.version(),localOnly:true,results},null,2)+'\n');
  await browser.close();await new Promise(resolve=>server.close(resolve));
 }
})().catch(e=>{console.error(e);process.exitCode=1});
