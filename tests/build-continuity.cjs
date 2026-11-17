/* Background job survives reload, profile switches and play in another favorite. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {start}=require('./browser-server.cjs');
async function switchProfile(page,index){
 if(!await page.locator('#studioProfileMenu').evaluate(node=>node.open))await page.click('#studioProfileMenu summary');
 await page.locator('.profile-choice').nth(index).click();
}
(async()=>{
 const server=start(),browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(!process.env.CI&&fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']});
 const url='http://127.0.0.1:'+server.address().port+'/arcade/?studio=1';
 try{
  for(const [device,viewport] of [['desktop',{width:1280,height:900}],['mobile',{width:390,height:844}]]){
   const context=await browser.newContext({viewport,hasTouch:device==='mobile',isMobile:device==='mobile',reducedMotion:'reduce'});
   const page=await context.newPage(),errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   const api='https://continuity-api.test',preview='https://continuity-preview.test';
   const cors={'Access-Control-Allow-Origin':new URL(url).origin,'Access-Control-Allow-Credentials':'true','Access-Control-Allow-Headers':'Content-Type, X-Factory-Request','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
   let ready=false,submitted=0,previewRequests=0;
   await page.route('**/factory-config.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({version:1,mode:'remote',apiBaseUrl:api,previewOrigin:preview})}));
   await page.route(api+'/**',async route=>{
    const request=route.request(),path=new URL(request.url()).pathname;
    if(request.method()==='OPTIONS'){await route.fulfill({status:204,headers:cors});return;}
    let body;
    if(path==='/v1/revisions'&&request.method()==='POST')body={revisionId:'continuity-base'};
    else if(path==='/v1/jobs'&&request.method()==='POST'){submitted++;body={jobId:'continuity-job',status:'queued',adapter:'mock'};}
    else if(path==='/v1/jobs/continuity-job')body=ready?{jobId:'continuity-job',status:'ready',revisionId:'continuity-ready',adapter:'mock'}:{jobId:'continuity-job',status:'testing',phase:'testing',adapter:'mock'};
    else if(path.endsWith('/preview')){previewRequests++;body={errorCode:'UNEXPECTED_PREVIEW'};}
    else body={errorCode:'UNEXPECTED_ENDPOINT'};
    await route.fulfill({status:body.errorCode?404:200,headers:cors,contentType:'application/json',body:JSON.stringify(body)});
   });
   try{
    await page.goto(url);await page.waitForFunction(()=>FG.studio&&FG.studio.mode()==='remote');
    await page.click('[data-starter="gum"]');
    const owner=await page.evaluate(()=>FG.store.current().id);
    const initial=await page.evaluate(()=>FG.studio.exportNotebook().active[FG.store.current().id]);
    await page.click('#studioChange');await page.fill('#studioPrompt','Replace the rocket with a flying doughnut spaceship');
    await page.click('#coachTry');
    await page.waitForFunction(()=>FG.studio.exportNotebook().sessions.some(s=>s.job?.status==='testing'));
    assert.equal(submitted,1);
    assert.equal(await page.locator('#studioBuildShelf').isVisible(),true);
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
    ready=true;
    await page.waitForFunction(id=>FG.studio.exportNotebook().sessions.find(s=>s.id===id)?.job?.status==='ready',initial,{timeout:10000});
    assert.equal(await page.locator('.favorite-robot .favorite-canvas').isVisible(),true,'completion did not replace the game being played');
    assert.equal(await page.locator('#studioRemoteHost iframe').count(),0,'no preview automatically opened');
    assert.equal(previewRequests,0);
    await page.locator('#studioBuildShelf').getByRole('button',{name:'Try test'}).click();
    await page.waitForSelector('#studioReady');
    const returned=await page.evaluate(()=>FG.studio.exportNotebook().active[FG.store.current().id]);
    assert.equal(returned,initial,'the child can find the saved original project');
    assert.equal(await page.locator('#studioRemoteHost iframe').count(),0,'even returning does not open the new test without consent');
    assert.equal(submitted,1,'reload and navigation do not resubmit a paid job');
    assert.deepEqual(errors,[]);
    console.log('PASS '+device+': durable build, isolated profile, another playable game, explicit ready test');
   }finally{await context.close();}
  }
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
