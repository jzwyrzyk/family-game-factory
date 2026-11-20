const {exploreWelcome}=require('./studio-entry.cjs');
const assert=require('node:assert/strict');
const path=require('node:path');

exports.createJourney=async (browser,base,device,recordVideo=false)=>{
 const context=await browser.newContext({viewport:device.viewport,deviceScaleFactor:1,
  hasTouch:device.touch,isMobile:device.mobile,reducedMotion:device.motion,
  locale:'en-US',colorScheme:'light',
  ...(recordVideo?{recordVideo:{dir:path.resolve('test-results/mind-your-jems/video'),size:device.viewport}}:{})});
 const page=await context.newPage(),errors=[],assetFailures=[],expectedAssetFailures=[];
 const counters={submitted:0,previewRequests:0,previewPaths:[],jobPolls:0,interruptedPolls:0,blockedArt:0};
 const state={status:'building',artBlocked:!!device.artFailure,networkOffline:false};
 page.setDefaultTimeout(10000);
 page.on('pageerror',error=>errors.push(error.message));
 page.on('response',response=>{
  if(response.status()<400||!new URL(response.url()).pathname.includes('/art/mind-your-jems/'))return;
  if(device.artFailure&&response.status()===503&&response.url().endsWith('/scene-sky.webp'))expectedAssetFailures.push(response.url());
  else assetFailures.push(response.url());
 });
 await page.addInitScript(()=>{
  // Stable random sequence for timings only; unique IDs still use crypto.
  let value=87431;
  Math.random=()=>{value=(value*48271)%2147483647;return value/2147483647;};
 });
 if(!recordVideo)await page.clock.install();
 const api='https://mind-your-jems-api.test',preview='https://mind-your-jems-preview.test';
 const cors={'Access-Control-Allow-Origin':new URL(base).origin,'Access-Control-Allow-Credentials':'true',
  'Access-Control-Allow-Headers':'Content-Type, X-Factory-Request','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
 if(device.artFailure){
  // Bypass this page's offline cache so the injected outage reaches the real
  // image loader. The separate offline-shell suite owns cache acceptance.
  const network=await context.newCDPSession(page);
  await network.send('Network.enable');await network.send('Network.setBypassServiceWorker',{bypass:true});
  await page.route('**/art/mind-your-jems/scene-sky.webp',route=>{
   if(state.artBlocked){counters.blockedArt++;return route.fulfill({status:503,contentType:'text/plain',body:'Deliberate artwork outage fixture'});}
   return route.continue();
  });
 }
 await page.route('**/factory-config.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({version:1,mode:'remote',apiBaseUrl:api,previewOrigin:preview})}));
 await page.route(api+'/**',async route=>{
  const request=route.request(),pathname=new URL(request.url()).pathname;
  if(request.method()==='OPTIONS'){await route.fulfill({status:204,headers:cors});return;}
  let body;
  if(pathname==='/v1/sessions/status'&&request.method()==='GET')body={connected:true,trusted:true,expiresAt:Date.now()+3600000,adultPilot:{enabled:false,eligible:false,active:false}};
  else if(pathname==='/v1/revisions'&&request.method()==='POST')body={revisionId:'jems-base'};
  else if(pathname==='/v1/jobs'&&request.method()==='POST'){counters.submitted++;body={jobId:'myj-job',status:'queued',adapter:'mock'};}
  else if(pathname==='/v1/jobs/myj-job'){
   counters.jobPolls++;
   if(state.networkOffline){counters.interruptedPolls++;await route.abort('internetdisconnected');return;}
   body={jobId:'myj-job',status:state.status,phase:state.status,
    ...(state.status==='ready'?{revisionId:'myj-ready-revision'}:{}),...(state.status==='failed'?{errorCode:'BUILD_FAILED'}:{}),adapter:'mock'};
  }
  else if(pathname.endsWith('/preview')){counters.previewRequests++;counters.previewPaths.push(pathname);body={url:preview+'/game?capability=TEST_ONLY',artifactId:'myj-fixture-artifact',expiresAt:Date.now()+3600000,kind:'generated-module-v2',adapter:'mock'};}
  else body={errorCode:'UNEXPECTED_ENDPOINT'};
  await route.fulfill({status:body.errorCode==='UNEXPECTED_ENDPOINT'?404:200,headers:cors,contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.route(preview+'/**',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html><body><h1>Playable preview fixture</h1><button id="play">Play</button><p id="result"></p><script>
const channel=new URLSearchParams(location.search).get('channel'),artifactId='myj-fixture-artifact';let readySent=false;
window.addEventListener('message',event=>{if(!readySent&&event.source===parent&&event.data.type==='factory-learning'&&event.data.channel===channel&&event.data.artifactId===artifactId&&event.data.action==='connect'){readySent=true;parent.postMessage({type:'factory-preview',channel,artifactId,event:'ready',height:400,learningProtocol:1},'*')}});
document.querySelector('#play').onclick=()=>document.querySelector('#result').textContent='Game started';
</script></body></html>`}));
 await page.goto(base+'?studio=1',{waitUntil:'domcontentloaded',timeout:30000});
 await page.waitForFunction(()=>window.FG?.studio?.mode()==='remote');await exploreWelcome(page);
 assert.equal(await page.locator('dialog.myj-arcade').isVisible(),false,'mini-game is optional');
 await page.locator('[data-starter="gum"]').click();
 if(device.existingRemote){
  // Seed a valid saved, already-generated project in this isolated fixture.
  // Opening it uses the public Studio API and the real preview handshake.
  const id=await page.evaluate(()=>{
   const notebook=FG.studio.exportNotebook(),owner=FG.store.current().id;
   const session=notebook.sessions.find(item=>item.id===notebook.active[owner]);
   session.game='new';session.projectId=null;session.remoteId='myj-existing-revision';session.remoteKind='generated-module-v2';session.playOnly=false;
   localStorage.setItem('family-game-factory-studio-v1',JSON.stringify(notebook));return session.id;
  });
  await page.evaluate(id=>FG.studio.open(id),id);
  await page.frameLocator('#studioRemoteHost iframe').locator('#play').waitFor({state:'visible'});
  assert.equal(counters.previewRequests,1,'existing working preview is loaded once before the new build');
 }
 await page.locator('#studioChange').click();
 await page.locator('#studioPrompt').fill('Make my rocket a bouncing rainbow potato spaceship');
 await page.locator('#coachTry').click();
 await page.waitForFunction(()=>FG.studio.exportNotebook().sessions.some(s=>s.job?.status==='building'));
 assert.equal(counters.submitted,1);
 const launch=page.locator('#studioBuildProgress .studio-wait-arcade-button');
 await launch.waitFor({state:'visible'});
 const project=await page.evaluate(()=>{
  const owner=FG.store.current().id,id=FG.studio.exportNotebook().active[owner];
  return {owner,id,otherOwner:FG.store.familyProfiles().find(profile=>profile.id!==owner).id};
 });
 // Leave ample transport time before pausing; a 20ms margin can already be in
 // the past on a busy CI runner. The arcade has not opened or started timers.
 if(!recordVideo)await page.clock.pauseAt(await page.evaluate(()=>Date.now()+10000));
 // Exercise restoration of an existing style, not just the default empty one.
 const bodyOverflow=await page.evaluate(nonDefault=>{
  if(nonDefault)document.body.style.overflow='auto';
  return document.body.style.overflow;
 },!!device.recoveryTerminal||!!device.profileReset);
 await launch.click();
 const arcade=page.locator('dialog.myj-arcade');
 await arcade.waitFor({state:'visible'});
 const assets=[];
 async function inspectArtwork(){
  await page.evaluate(async()=>{
   await document.fonts.ready;
   await Promise.all([...document.querySelectorAll('dialog.myj-arcade img')].map(image=>image.decode()));
  });
  // Background atlas files must decode too, including poses currently hidden.
  const loaded=await arcade.evaluate(async element=>{
   const urls=new Set([...element.querySelectorAll('img')].map(image=>image.currentSrc||image.src));
   for(const node of [element,...element.querySelectorAll('*')]){
    for(const style of [getComputedStyle(node),getComputedStyle(node,'::before'),getComputedStyle(node,'::after')]){
     for(const match of style.backgroundImage.matchAll(/url\(["']?([^"')]+)["']?\)/g))urls.add(match[1]);
    }
   }
   await Promise.all([...urls].map(url=>new Promise((resolve,reject)=>{const image=new Image();image.onload=resolve;image.onerror=()=>reject(new Error('Missing art '+url));image.src=url;})));
   return [...urls];
  });
  assets.splice(0,assets.length,...loaded);
  assert.ok(assets.filter(url=>url.includes('/art/mind-your-jems/')).length>=3,'real illustrated scene, character and prop assets are loaded');
 }
 if(device.artFailure)await arcade.locator('[data-myj="retry-art"]').waitFor({state:'visible'});
 else await inspectArtwork();
 return {context,page,arcade,launch,project,bodyOverflow,errors,assetFailures,expectedAssetFailures,counters,state,assets,inspectArtwork,
  async advance(milliseconds){if(recordVideo)await page.waitForTimeout(milliseconds);else await page.clock.fastForward(milliseconds);},
  async until(predicate,message,{step=100,limit=20000}={}){
   for(let elapsed=0;elapsed<=limit;elapsed+=step){if(await predicate())return;await this.advance(step);}
   throw new Error(message);
  },
  async phase(phase){await this.until(async()=>await arcade.getAttribute('data-phase')===phase,'Expected game phase '+phase);},
  async activate(locator){
   if(device.motion==='no-preference'){
    // A breathing scene deliberately moves its targets. Locator actions wait
    // for immobility; a player instead taps the current visible hit area.
    // Check that exact point first, then send a real native pointer event.
    await locator.waitFor({state:'visible'});
    assert.equal(await locator.isEnabled(),true,'moving target is enabled');
    const point=await locator.evaluate(element=>{
     const box=element.getBoundingClientRect(),x=box.x+box.width/2,y=box.y+box.height/2;
     const hit=document.elementFromPoint(x,y);
     return {x,y,inViewport:x>=0&&y>=0&&x<innerWidth&&y<innerHeight,reachable:hit===element||element.contains(hit)};
    });
    assert.ok(point.inViewport&&point.reachable,'moving target is inside the viewport and receives the pointer');
    if(device.touch)await page.touchscreen.tap(point.x,point.y);else await page.mouse.click(point.x,point.y);
   }else if(device.touch)await locator.tap();else await locator.click();
  },
  async score(kind){return Number(await arcade.locator('[data-myj="'+kind+'"]').innerText());},
  async finish(){
   assert.deepEqual(assetFailures,[],'all illustrated assets returned successfully');
   if(device.artFailure){
    assert.ok(counters.blockedArt>0&&expectedAssetFailures.length>0,'artwork failure was actually delivered');
    assert.equal(state.artBlocked,false,'artwork recovery fixture was restored');
    assert.ok(assets.length>=3,'retry decoded the real artwork successfully');
   }
   assert.deepEqual(errors,[],'no browser exceptions');
   assert.equal(counters.submitted,1,'mini-game never submits a second build');
   await context.close();
  }
 };
};
