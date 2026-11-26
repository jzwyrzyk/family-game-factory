/* Built-app copy recovery. Every service reply is synthetic; no live mutation. */
const assert=require('node:assert/strict');
const {start}=require('./browser-server.cjs');
const {assertTextContrast}=require('./helpers/text-contrast.cjs');
module.exports=async function copyRecovery(browser){
 const server=start();await new Promise(resolve=>server.listening?resolve():server.once('listening',resolve));
 const url='http://127.0.0.1:'+server.address().port+'/arcade/',api='https://copy-recovery.test';
 const key='family-game-factory-studio-v1';
 try{for(const [device,width,height] of [['desktop',1280,900],['tablet',820,1180],['phone',390,844]]){
  const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'}),page=await context.newPage();
  page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const headers={'Access-Control-Allow-Origin':new URL(url).origin,'Access-Control-Allow-Credentials':'true','Access-Control-Allow-Headers':'Content-Type, X-Factory-Request','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
  let posts=0,gets=0,accepted=false,requestId;
  await page.addInitScript(({key})=>{
   if(window!==window.top||localStorage.getItem(key))return;
   localStorage.setItem(key,JSON.stringify({version:1,active:{player1:'original'},avatars:{player1:'spark'},sessions:[{
    id:'original',owner:'player1',name:'My saved moon',game:'new',projectId:null,remoteId:'remote-original',candidate:null,draft:'Keep my moon blue.',
    messages:[{id:'child-message',role:'child',text:'My moon is blue.',at:'2026-11-24T00:00:00Z'}],job:null,updated:'2026-11-24T00:00:00Z',hypothesis:'',reflection:false,experiments:[],selectedTest:null,
   }]}));
  },{key});
  await page.route('**/factory-config.json',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({version:1,mode:'remote',apiBaseUrl:api,previewOrigin:'https://copy-preview.test'})}));
  await page.route(api+'/**',async route=>{
   const req=route.request(),path=new URL(req.url()).pathname,method=req.method();let data;
   if(method==='OPTIONS')return route.fulfill({status:204,headers});
   if(path==='/v1/sessions/status')data={connected:true,trusted:true,expiresAt:Date.now()+60000};
   else if(path.endsWith('/status'))data={available:false};
   else if(path==='/v1/revisions/remote-original/fork'&&method==='POST'){
    posts++;requestId=req.postDataJSON().clientRequestId;
    assert.equal(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).sessions[0].pendingCopy.requestId,key),requestId,'intent is durable before POST');
    return route.abort('failed');
   }else if(path==='/v1/revisions/remote-original/fork/'+requestId){
    assert.equal(method,'GET');gets++;data=accepted?{revisionId:'copied-revision'}:null;
   }else if(path.endsWith('/preview'))return route.fulfill({status:503,headers,contentType:'application/json',body:JSON.stringify({errorCode:'FIXTURE_PREVIEW_UNAVAILABLE'})});
   else throw Error('Unexpected copy request '+method+' '+path);
   return route.fulfill({headers,contentType:'application/json',body:JSON.stringify(data)});
  });
  const open=async()=>{await page.waitForFunction(()=>FG.studio?.mode()==='remote');await page.locator('[data-session="original"] .studio-saved-open').click();};
  try{
   await page.goto(url);await open();await page.locator('#studioMore > summary').click();await page.click('#studioCopy');
   await page.fill('#studioCopyName','My separate moon');await page.click('#studioCopyForm button[type=submit]');
   await page.waitForFunction(()=>!document.getElementById('studioCheckCopy').disabled&&!document.getElementById('studioCopyRecovery').hidden);
   await page.click('#studioCopyCancel');assert.equal(posts,1);
   await page.reload();await open();await page.locator('#studioCopyRecovery').waitFor({state:'visible'});
   await assertTextContrast(page,'#studioCopyRecovery :is(p,button)','saved copy recovery');
   await page.locator('#studioCheckCopy').scrollIntoViewIfNeeded();await page.mouse.move(0,0);
   await page.waitForFunction(()=>document.getElementById('studioCheckCopy').getBoundingClientRect().height>=48);
   const box=await page.locator('#studioCheckCopy').evaluate(n=>{const b=n.getBoundingClientRect();return {height:b.height,font:parseFloat(getComputedStyle(n).fontSize),left:b.left,right:b.right,width:innerWidth};});
   assert.ok(box.height>=48&&box.font>=18&&box.left>=0&&box.right<=box.width+1,JSON.stringify(box));
   await page.screenshot({path:`test-results/storage-copy-${device}.png`});
   await page.click('#studioCheckCopy');await page.waitForFunction(()=>!document.getElementById('studioCheckCopy').disabled);
   assert.equal(posts,1);assert.ok(gets>=1);
   assert.ok(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).sessions[0].pendingCopy,key));
   accepted=true;
   await page.evaluate(key=>{const original=Storage.prototype.setItem;window.unblockCopy=()=>{Storage.prototype.setItem=original;};Storage.prototype.setItem=function(k,v){if(k===key&&JSON.parse(v).sessions.some(s=>s.id.startsWith('copy:')))throw new DOMException('Synthetic quota','QuotaExceededError');return original.call(this,k,v);};},key);
   await page.click('#studioCheckCopy');await page.waitForFunction(()=>!document.getElementById('studioCheckCopy').disabled);
   assert.equal(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).sessions.length,key),1,'failed local completion preserves original and pending receipt');
   await page.evaluate(()=>window.unblockCopy());await page.click('#studioCheckCopy');
   await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).sessions.length===2,key);
   const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).sessions,key);
   assert.equal(saved[0].pendingCopy,null);assert.equal(saved[0].remoteId,'remote-original');
   assert.equal(saved[1].id,'copy:'+requestId);assert.equal(saved[1].remoteId,'copied-revision');assert.deepEqual(saved[1].messages,saved[0].messages);
   assert.equal(posts,1);assert.deepEqual(errors,[]);console.log('PASS copy recovery '+device+': durable POST identity, reload, lookup-only unknown/accepted, quota rollback, exact transcript');
  }finally{await context.close();}
 }}finally{await new Promise(resolve=>server.close(resolve));}
};
