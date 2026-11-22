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
  // Stable scene seed and timing inputs; unique project IDs still use crypto.
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
 assert.equal(await page.locator('dialog.myj-arcade[open]').count(),0,'mining never opens a separate dialog');
 // Isolate long gameplay with a current satisfied pacing receipt, as in the
 // shared play-view suite. A separate native checkpoint case below verifies
 // that mining still pauses and exits through the real learning host.
 await page.evaluate(()=>{FG.store.current().mathWindow=[Date.now()];FG.store.current().rate=1;FG.store.save();});
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
 // Capture the style before the build handoff and fitted native game own
 // scrolling. The visible My Games exit must restore this exact value.
 const bodyOverflow=await page.evaluate(nonDefault=>{
  if(nonDefault)document.body.style.overflow='auto';
  return document.body.style.overflow;
 },!!device.recoveryTerminal||!!device.profileReset);
 await page.locator('#studioSend').click();
 await page.waitForFunction(()=>FG.studio.exportNotebook().sessions.some(s=>s.job?.status==='building'));
 assert.equal(counters.submitted,1);
 await page.waitForFunction(()=>document.getElementById('studioBuildHandoff')?.open&&document.getElementById('studioBuildHandoff')?.dataset.phase==='building');
 assert.equal(await page.locator('#studioBuildHandoffPlay').isEnabled(),true,'the acknowledged build offers explicit play');
 assert.equal(await page.locator('.native-mining').count(),0,'the build handoff never starts mining without a choice');
 // First entry exercises the acknowledged Build handoff. Re-entry uses the
 // same original project's background-build shelf, through ordinary play.
 const project=await page.evaluate(()=>{
  const owner=FG.store.current().id,id=FG.studio.exportNotebook().active[owner];
  return {owner,id,name:FG.studio.exportNotebook().sessions.find(session=>session.id===id).name,otherOwner:FG.store.familyProfiles().find(profile=>profile.id!==owner).id};
 });
 // Leave ample transport time before pausing; a 20ms margin can already be in
 // the past on a busy CI runner. The arcade has not opened or started timers.
 if(!recordVideo)await page.clock.pauseAt(await page.evaluate(()=>Date.now()+10000));
 await page.locator('#studioBuildHandoffPlay').click();
 assert.equal(await page.locator('#studioBuildHandoff').isVisible(),false,'the handoff closes before the arcade opens');
 const arcade=page.locator('.native-mining');
 await arcade.waitFor({state:'visible'});
 assert.equal(await page.locator('#page-studio').evaluate(node=>node.classList.contains('studio-play-mode')),true,'wait play uses the ordinary native game frame');
 assert.equal(await page.locator('dialog.myj-arcade[open]').count(),0);
 const buildItem=page.locator('#studioBuildShelf .studio-build-item').filter({has:page.getByText(project.name,{exact:true})});
 const readyButton=buildItem.getByRole('button',{name:/^(Play my game|Try ready test)$/,includeHidden:true});
 const launch={async click(){
  const more=page.locator('#studioMore');
  if(await more.isVisible()&&!await more.evaluate(node=>node.open))await more.locator(':scope > summary').click();
  const button=buildItem.locator('.studio-wait-arcade-button');
  await button.scrollIntoViewIfNeeded();await button.click();
  await arcade.waitFor({state:'visible'});
 }};
 const assets=[];
 async function inspectArtwork(){
  await page.evaluate(async()=>{
   await document.fonts.ready;
   await Promise.all([...document.querySelectorAll('.native-mining img')].map(image=>image.decode()));
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
 const touches=new Map(),keyInputs=new Set();
 const touchSession=device.touch?await context.newCDPSession(page):null;
 const inputKeys={left:'ArrowLeft',right:'ArrowRight',grab:'Space'};
 const touchIds={left:1,right:2,grab:3};
 async function touchPoints(){return [...touches.values()];}
 const journey={context,page,arcade,launch,project,buildItem,readyButton,bodyOverflow,errors,assetFailures,expectedAssetFailures,counters,state,assets,inspectArtwork,recordVideo,
  async leave(){await this.releaseInputs();await this.activate(page.locator('#studioHome'));await arcade.waitFor({state:'hidden'});},
  async openBuilds(){
   const more=page.locator('#studioMore');
   if(await more.isVisible()&&!await more.evaluate(node=>node.open)){await this.activate(more.locator(':scope > summary'));await this.advance(32);}
  },
  async closeBuilds(){
   const more=page.locator('#studioMore');
   if(await more.isVisible()&&await more.evaluate(node=>node.open)){await this.activate(more.locator(':scope > summary'));await this.advance(32);}
   // Returning from host tools gives movement keys to the actual game surface.
   if(await arcade.isVisible())await arcade.locator('[data-myj="left"]').focus();
  },
  async playReady(){await this.openBuilds();await readyButton.scrollIntoViewIfNeeded();await this.activate(readyButton);},
  async openBuildProject(){
   await this.openBuilds();const button=buildItem.getByRole('button',{name:'Open game',exact:true});
   await button.scrollIntoViewIfNeeded();await this.activate(button);
  },
  async buildText(){return await buildItem.textContent()||'';},
  async ready(){return await readyButton.count()===1;},
  async snapshot(){return arcade.evaluate(element=>({
   phase:element.dataset.phase,x:Number(element.dataset.playerX),level:Number(element.dataset.level),
   phaseMs:Number(element.dataset.phaseMs),holding:element.dataset.holding==='true',safe:element.dataset.safe==='true',
   banked:Number(element.querySelector('[data-myj="banked"]').textContent),
   loose:Number(element.querySelector('[data-myj="loose"]').textContent),
   gems:[...element.querySelectorAll('[data-crystal]')].map(gem=>({id:gem.dataset.crystal,x:Number(gem.dataset.x)}))
  }));},
  async input(action,pressed,mode=device.touch?'touch':'keyboard'){
   // Reopening mounts fresh image elements. Advancing a virtual clock is not
   // evidence that their asynchronous decode has made controls playable.
   if(pressed)await arcade.locator('.myj-loading').waitFor({state:'hidden'});
   if(mode==='keyboard'){
    const key=inputKeys[action];
    if(pressed&&!keyInputs.has(key)){await page.keyboard.down(key);keyInputs.add(key);}
    else if(!pressed&&keyInputs.has(key)){await page.keyboard.up(key);keyInputs.delete(key);}
    return;
   }
   assert.ok(touchSession,'touch input needs a touch-enabled fixture');
   if(pressed&&!touches.has(action)){
    const target=arcade.locator('[data-myj="'+action+'"]');
    await target.waitFor({state:'visible'});
    assert.equal(await target.isEnabled(),true,'held control is enabled: '+action);
    const point=await target.evaluate(element=>{
     const box=element.getBoundingClientRect(),x=box.x+box.width/2,y=box.y+box.height/2,hit=document.elementFromPoint(x,y);
     return {x,y,reachable:hit===element||element.contains(hit)};
    });
    assert.ok(point.reachable,'native touch reaches '+action);
    touches.set(action,{id:touchIds[action],x:point.x,y:point.y,radiusX:4,radiusY:4,force:1});
    await touchSession.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:await touchPoints()});
   }else if(!pressed&&touches.has(action)){
    // Chromium's native touchEnd list names the contacts being released.
    // Sending the survivors would release Left while leaving Hold pressed.
    const released=touches.get(action);
    await touchSession.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:touches.size>1?[released]:[]});
    touches.delete(action);
   }
  },
  async releaseInputs(){
   if(touches.size){touches.clear();await touchSession.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});}
   for(const key of keyInputs)await page.keyboard.up(key);
   keyInputs.clear();
  },
  async walkTo(target,{mode=device.touch?'touch':'keyboard'}={}){
   const start=await this.snapshot(),direction=target<start.x?'left':'right';
   if(Math.abs(start.x-target)<1)return;
   await this.input(direction,true,mode);
   try{
    await this.until(async()=>{
     const current=await this.snapshot();
     assert.ok(!['falling','retry'].includes(current.phase),'walking cannot silently recover a fall: '+JSON.stringify(current));
     return (current.phase==='level-complete'&&direction==='right'&&target>=94)||
      (direction==='left'?current.x<=target:current.x>=target);
    },'miner reaches '+target,{step:32,limit:6500});
   }finally{await this.input(direction,false,mode);}
   await this.advance(32);
  },
  async freshCalm(){
   const current=await this.snapshot();
   assert.ok(current.safe,'wait for a fresh calm period only from the platform');
   if(current.phase==='mining'&&current.phaseMs>=6500)return;
   await this.until(async()=>{const next=await this.snapshot();return next.phase==='mining'&&next.phaseMs>=6500;},'a fresh calm period on the safe platform',{step:100,limit:20000});
  },
  async collect(minimum=1){
   // Ordinary inputs only. Stay in the reachable right-hand half so even a
   // warning permits a real run back to the platform; do not teleport or bank.
   assert.ok(minimum>=1&&minimum<=8);
   const initial=await this.snapshot();
   if(initial.safe)await this.until(async()=>{
    const current=await this.snapshot();
    return current.phase==='mining'&&current.phaseMs>=6500&&current.gems.some(gem=>gem.x>=42&&gem.x<=76);
   },'a reachable jem appears with time for a real round trip',{step:100,limit:60000});
   await this.input('left',true);
   try{
    await this.until(async()=>{
     const current=await this.snapshot();
     assert.ok(!['falling','retry'].includes(current.phase),'collection never substitutes a state reset');
     return current.loose>=minimum||current.x<=38||current.phase==='warning';
    },'walk reaches a jem or the safe return point',{step:32,limit:6000});
   }finally{await this.input('left',false);}
   await this.advance(32);
   return (await this.snapshot()).loose;
  },
  async collectAndBank(){
   if((await this.snapshot()).phase==='level-complete')return 0;
   await this.walkTo(96);await this.freshCalm();
   const before=await this.score('banked');
   await this.collect(8);
   assert.ok(await this.score('loose')>0,'the outward run physically collects a jem');
   // The return run may collect another jem. Sample after reaching the safe
   // platform, before the bucket, so the exact deposit accounts for that jem.
   await this.walkTo(90);
   const carried=await this.score('loose');
   assert.ok(carried>0,'a mining trip must physically collect a jem');
   await this.walkTo(96);
   assert.equal(await this.score('loose'),0,'reaching the bucket deposits the carried jems');
   assert.equal(await this.score('banked'),before+carried,'every carried jem reaches the bucket once');
   return carried;
  },
  async advance(milliseconds){if(recordVideo)await page.waitForTimeout(milliseconds);else await page.clock.runFor(milliseconds);},
  async until(predicate,message,{step=100,limit=20000}={}){
   for(let elapsed=0;elapsed<=limit;elapsed+=step){if(await predicate())return;await this.advance(step);}
   const diagnostic=await arcade.evaluate(element=>({
    phase:element.dataset.phase,assets:element.dataset.assets,paused:element.dataset.paused,
    playerX:element.dataset.playerX,holding:element.dataset.holding,
    focused:document.activeElement?.tagName+':'+document.activeElement?.className,
   }));
   throw new Error(message+' '+JSON.stringify(diagnostic));
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
   await this.releaseInputs();
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
 return journey;
};
