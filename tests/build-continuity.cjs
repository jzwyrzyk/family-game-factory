/* Background job survives reload, profile switches and play in another favorite. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {start}=require('./browser-server.cjs');
const {exploreWelcome}=require('./studio-entry.cjs');
async function switchProfile(page,index){
 if(!await page.locator('#studioProfileMenu').evaluate(node=>node.open))await page.click('#studioProfileMenu summary');
 await page.locator('.profile-choice').nth(index).click();
}
(async()=>{
 const server=start(),browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(!process.env.CI&&fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']});
 const url='http://127.0.0.1:'+server.address().port+'/arcade/?studio=1';
 fs.mkdirSync('test-results',{recursive:true});
 try{
  for(const [device,viewport] of [['desktop',{width:1280,height:900}],['mobile',{width:390,height:844}]]){
   const context=await browser.newContext({viewport,hasTouch:device==='mobile',isMobile:device==='mobile',reducedMotion:'reduce'});
   const page=await context.newPage(),errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   const api='https://continuity-api.test',preview='https://continuity-preview.test';
   const cors={'Access-Control-Allow-Origin':new URL(url).origin,'Access-Control-Allow-Credentials':'true','Access-Control-Allow-Headers':'Content-Type, X-Factory-Request','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
   let state='queued',statusUnavailable=false,submitted=0,previewRequests=0,activeJobId='';
   let acceptBuild,finishCoach;
   const acceptance=new Promise(resolve=>{acceptBuild=resolve;});
   const coachResponse=new Promise(resolve=>{finishCoach=resolve;});
   const progress=async(phase,asset)=>{
    await page.waitForFunction(value=>document.getElementById('studioBuildProgress')?.dataset.phase===value,phase,{timeout:10000});
    assert.equal(await page.locator('#studioBuildProgress').isVisible(),true);
    const art=await page.locator('#studioBuildProgress').evaluate(element=>getComputedStyle(element,'::after').backgroundImage);
    assert.ok(art.includes(new URL('jems-art/'+asset+'.webp',url).href),phase+' uses approved artwork for the actual observed state');
    if(phase==='uncertain'||phase==='cancelled'){
     await page.evaluate(async src=>{const image=new Image();image.src=src;await image.decode();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));},new URL('jems-art/'+asset+'.webp',url).href);
     await page.locator('#studioBuildProgress').screenshot({path:`test-results/brand-progress-${phase}-${device}.png`});
    }
   };
   await page.route('**/factory-config.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({version:1,mode:'remote',apiBaseUrl:api,previewOrigin:preview})}));
   await page.route(api+'/**',async route=>{
    const request=route.request(),path=new URL(request.url()).pathname;
    if(request.method()==='OPTIONS'){await route.fulfill({status:204,headers:cors});return;}
    let body;
    // Explicit authenticated fixture; a missing endpoint must fail closed.
    if(path==='/v1/sessions/status'&&request.method()==='GET')
     body={connected:true,trusted:true,expiresAt:Date.now()+60000};
    else if(path==='/v1/revisions'&&request.method()==='POST')body={revisionId:'continuity-base'};
    else if(path==='/v1/coach'){
     await coachResponse;
     await route.fulfill({status:503,headers:cors,contentType:'application/json',body:JSON.stringify({errorCode:'COACH_UNAVAILABLE'})});return;
    }
    else if(path==='/v1/jobs'&&request.method()==='POST'){submitted++;activeJobId='continuity-job-'+submitted;await acceptance;body={jobId:activeJobId,status:'queued',adapter:'mock'};}
    else if(path==='/v1/jobs/'+activeJobId+'/cancel'){state='cancelled';body={jobId:activeJobId,status:'cancelled',adapter:'mock'};}
    else if(path==='/v1/jobs/'+activeJobId){
     if(statusUnavailable){await route.fulfill({status:503,headers:cors,contentType:'application/json',body:JSON.stringify({errorCode:'STATUS_UNAVAILABLE'})});return;}
     body={jobId:activeJobId,status:state,phase:state,adapter:'mock',...(state==='ready'?{revisionId:'continuity-ready'}:{})};
    }
    else if(path.endsWith('/preview')){previewRequests++;body={errorCode:'UNEXPECTED_PREVIEW'};}
    else body={errorCode:'UNEXPECTED_ENDPOINT'};
    await route.fulfill({status:body.errorCode?404:200,headers:cors,contentType:'application/json',body:JSON.stringify(body)});
   });
   try{
    await page.goto(url);await page.waitForFunction(()=>FG.studio&&FG.studio.mode()==='remote');
    await exploreWelcome(page);
    await page.click('[data-starter="gum"]');
    const owner=await page.evaluate(()=>FG.store.current().id);
    const initial=await page.evaluate(()=>FG.studio.exportNotebook().active[FG.store.current().id]);
    await page.click('#studioChange');await page.fill('#studioPrompt','Could a rocket collect doughnuts?');
    await page.click('#studioTalk');
    await page.waitForFunction(()=>document.getElementById('coachModeStatus')?.classList.contains('is-thinking'));
    assert.equal(await page.locator('.jems-helper-mark:visible').getAttribute('data-helper-pose'),'think','the helper thinks only while the actual coach request is pending');
    finishCoach();
    await page.waitForFunction(()=>!document.getElementById('coachModeStatus')?.classList.contains('is-thinking'));
    assert.equal(await page.locator('.jems-helper-mark:visible').getAttribute('data-helper-pose'),'wave','the helper returns to idle after the reply or truthful fallback');
    assert.equal(submitted,0,'conversation artwork never implies a submitted game build');
    await page.fill('#studioPrompt','Replace the rocket with a flying doughnut spaceship');
    await page.click('#coachTry');
    await progress('sending','character_spark_think');
    assert.match(await page.locator('#studioBuildProgress').textContent(),/No build is confirmed yet/);
    acceptBuild();
    await progress('queued','spot_work_in_progress');
    state='building';await progress('building','spot_work_in_progress');
    state='testing';await progress('testing','spot_work_in_progress');
    await page.waitForFunction(()=>FG.studio.exportNotebook().sessions.some(s=>s.job?.status==='testing'));
    assert.equal(submitted,1);
    assert.equal(await page.locator('#studioBuildShelf').isVisible(),true);
    statusUnavailable=true;await progress('uncertain','spot_reconnect');
    assert.equal(await page.evaluate(()=>navigator.onLine),true,'an unavailable status endpoint does not prove the browser is offline');
    assert.match(await page.locator('#studioBuildProgress').textContent(),/not confirmed its latest state/);
    statusUnavailable=false;
    // A background-build shortcut must stop on-device recording before leaving Studio.
    await page.evaluate(()=>{
     class LocalSpeech {
      static async available(options){if(options.processLocally!==true)throw Error('Remote speech forbidden');return 'available';}
      processLocally=false;lang='';continuous=false;interimResults=false;onresult=null;onerror=null;onend=null;aborted=false;
      start(){window.__continuityMic=this;}
      abort(){this.aborted=true;this.onend?.();}
     }
     Object.defineProperty(window,'SpeechRecognition',{configurable:true,value:LocalSpeech});
    });
    await page.click('#studioMic');
    await page.waitForFunction(()=>window.__continuityMic?.processLocally===true);
    await page.locator('#studioBuildShelf').getByRole('button',{name:/Extra practice/}).click();
    assert.equal(await page.evaluate(()=>window.__continuityMic.aborted),true,'extra-practice navigation must release microphone');
    await page.reload();await page.waitForFunction(()=>FG.studio&&FG.studio.mode()==='remote');
    await page.waitForSelector('#studioBuildShelf:not([hidden])');
    assert.match(await page.textContent('#studioBuildShelf'),/Testing your game/);
    // A sibling must not see another child\'s private job or test.
    await switchProfile(page,1);
    assert.equal(await page.locator('#studioBuildShelf').isVisible(),false);
    await switchProfile(page,0);
    assert.equal(await page.evaluate(()=>FG.store.current().id),owner);
    await page.waitForSelector('#studioBuildShelf:not([hidden])');
    await page.click('[data-starter="robot"]');await page.waitForSelector('.favorite-robot');
    const current=await page.evaluate(()=>FG.studio.exportNotebook().active[FG.store.current().id]);
    assert.notEqual(current,initial);
    state='ready';
    await page.waitForFunction(id=>FG.studio.exportNotebook().sessions.find(s=>s.id===id)?.job?.status==='ready',initial,{timeout:10000});
    assert.equal(await page.locator('.favorite-robot .favorite-canvas').isVisible(),true,'completion did not replace the game being played');
    assert.equal(await page.locator('#studioRemoteHost iframe').count(),0,'no preview automatically opened');
    assert.equal(previewRequests,0);
    await page.locator('#studioBuildShelf').getByRole('button',{name:'Try ready test'}).click();
    await page.waitForFunction(()=>document.querySelector('#studioStatus')?.textContent?.includes('UNEXPECTED_PREVIEW'));
    const returned=await page.evaluate(()=>FG.studio.exportNotebook().active[FG.store.current().id]);
    assert.equal(returned,initial,'the child can find the saved original project');
    assert.equal(previewRequests,1,'only the explicit child click asks for a private preview');
    assert.equal(await page.locator('#studioRemoteHost iframe').count(),0,'a failed preview never becomes an unverified playable game');
    assert.equal(await page.locator('#studioReady').isVisible(),true,'the ready test is still accessible for another try');
    await progress('ready','character_spark_celebrate');
    assert.equal(submitted,1,'reload and navigation do not resubmit a paid job');
    // New, explicit experiments exercise real terminal responses, not DOM-only fixtures.
    if(!await page.locator('#coachTry').isVisible())await page.click('#studioChange');
    state='failed';await page.fill('#studioPrompt','Replace the spaceship with a dancing teapot');await page.click('#coachTry');
    await progress('failed','character_spark_recover');
    assert.equal(submitted,2);
    state='testing';await page.fill('#studioPrompt','Replace the spaceship with a flying paintbrush');await page.click('#coachTry');
    await progress('testing','spot_work_in_progress');
    await page.click('#studioCancel');await progress('cancelled','character_spark_rest');
    assert.equal(await page.locator('.jems-helper-mark:visible').getAttribute('data-helper-pose'),'rest','confirmed cancellation uses the quiet helper pose');
    assert.equal(submitted,3,'only the three explicit build choices were submitted');
    assert.deepEqual(errors,[]);
    console.log('PASS '+device+': truthful coach/build artwork, durable build, isolated profile, another playable game, explicit ready test and terminal recovery states');
   }finally{await context.close();}
  }
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
