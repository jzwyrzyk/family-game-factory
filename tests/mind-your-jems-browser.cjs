/* Real Jems Studio + local mini-game in desktop and tablet-sized browsers. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {start}=require('./browser-server.cjs');

(async()=>{
 const server=start();
 const browser=await chromium.launch({
  executablePath:process.env.CHROMIUM_PATH||(!process.env.CI&&fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),
  headless:true,args:['--no-sandbox']
 });
 fs.mkdirSync('test-results',{recursive:true});
 try {
  for(const [device,viewport] of [['desktop',{width:1280,height:900}],['tablet',{width:768,height:1024}],['mobile',{width:390,height:844}]]){
   const ctx=await browser.newContext({
    viewport,hasTouch:device!=='desktop',isMobile:device==='mobile',reducedMotion:'reduce'
   });
   const page=await ctx.newPage(),errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   const url='http://127.0.0.1:'+server.address().port+'/arcade/?studio=1';
   const api='https://mind-your-jems-api.test',preview='https://mind-your-jems-preview.test';
   const cors={'Access-Control-Allow-Origin':new URL(url).origin,'Access-Control-Allow-Credentials':'true',
    'Access-Control-Allow-Headers':'Content-Type, X-Factory-Request','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
   let ready=false,submitted=0,previewRequests=0;
   await page.route('**/factory-config.json',route=>route.fulfill({
    contentType:'application/json',body:JSON.stringify({version:1,mode:'remote',apiBaseUrl:api,previewOrigin:preview})
   }));
   await page.route(api+'/**',async route=>{
    const request=route.request(),path=new URL(request.url()).pathname;
    if(request.method()==='OPTIONS'){await route.fulfill({status:204,headers:cors});return;}
    let body;
    if(path==='/v1/sessions/status'&&request.method()==='GET')
     body={connected:true,trusted:true,expiresAt:Date.now()+60000};
    else if(path==='/v1/revisions'&&request.method()==='POST')body={revisionId:'jems-base'};
    else if(path==='/v1/jobs'&&request.method()==='POST'){submitted++;body={jobId:'myj-job',status:'queued',adapter:'mock'};}
    else if(path==='/v1/jobs/myj-job')body=ready?
     {jobId:'myj-job',status:'ready',revisionId:'myj-ready-revision',adapter:'mock'}:
     {jobId:'myj-job',status:'building',phase:'building',adapter:'mock'};
    else if(path.endsWith('/preview')){previewRequests++;body={errorCode:'PREVIEW_NOT_IN_THIS_TEST'};}
    else body={errorCode:'UNEXPECTED_ENDPOINT'};
    await route.fulfill({status:body.errorCode?404:200,headers:cors,contentType:'application/json',body:JSON.stringify(body)});
   });
   try {
    await page.goto(url);
    await page.waitForFunction(()=>FG.studio&&FG.studio.mode()==='remote');
    assert.equal(await page.locator('dialog.myj-arcade').isVisible(),false,'wait game is not forced on idle kids');
    await page.click('[data-starter="gum"]');
    await page.click('#studioChange');
    await page.fill('#studioPrompt','Make my rocket a bouncing rainbow potato spaceship');
    await page.click('#coachTry');
    await page.waitForFunction(()=>FG.studio.exportNotebook().sessions.some(s=>s.job?.status==='building'));
    assert.equal(submitted,1,'a single build should be submitted');
    const launch=page.locator('#studioBuildProgress .studio-wait-arcade-button');
    await launch.waitFor({state:'visible'});
    await launch.click();
    const arcade=page.locator('dialog.myj-arcade');
    assert.equal(await arcade.isVisible(),true);
    assert.equal(await arcade.locator('.myj-logo').evaluate(img=>img.complete&&img.naturalWidth>0),true,'approved brand logo loads');
    assert.match(await arcade.locator('.myj-build-status').innerText(),/building/i);
    assert.equal(await arcade.locator('[data-myj="ready"]').isVisible(),false,'no fictitious ready state');
    await arcade.locator('[data-crystal="0"]').click();
    await arcade.locator('[data-crystal="3"]').click();
    assert.equal((await arcade.locator('[data-myj="loose"]').innerText()),'4','normal and rare crystals can be mined');
    await arcade.locator('[data-myj="bank"]').click();
    assert.equal(await arcade.locator('[data-myj="banked"]').innerText(),'4');
    assert.equal(await arcade.locator('[data-myj="loose"]').innerText(),'0');
    await arcade.locator('[data-crystal="1"]').focus();
    await page.keyboard.press('Enter');
    assert.equal(await arcade.locator('[data-myj="loose"]').innerText(),'1','keyboard can mine');
    assert.equal(previewRequests,0,'mini-game never requests a private game preview');
    await page.screenshot({path:'test-results/mind-your-jems-'+device+'.png',fullPage:true});
    await arcade.locator('.myj-close').click();
    assert.equal(await arcade.isVisible(),false);
    // A fresh arcade session doesn't retain child scores in browser storage.
    await launch.click();
    assert.equal(await arcade.locator('[data-myj="banked"]').innerText(),'0');
    assert.equal(await arcade.locator('[data-myj="loose"]').innerText(),'0');
    ready=true;
    await page.waitForFunction(()=>FG.studio.exportNotebook().sessions.some(s=>s.job?.status==='ready'),null,{timeout:12000});
    await arcade.locator('[data-myj="play-ready"]').waitFor({state:'visible'});
    assert.equal(previewRequests,0,'ready notification must not auto-open the generated preview');
    assert.match(await arcade.locator('.myj-build-status').innerText(),/ready/i);
    await arcade.locator('[data-myj="play-ready"]').click();
    await page.waitForFunction(()=>document.querySelector('#studioStatus')?.textContent?.includes('PREVIEW_NOT_IN_THIS_TEST'),null,{timeout:12000});
    assert.equal(await arcade.isVisible(),false);
    assert.equal(previewRequests,1,'verified ready CTA routes into the actual Jems preview');
    assert.equal(submitted,1,'mini-game never starts a second builder job');
    assert.deepEqual(errors,[]);
    console.log('PASS '+device+': live build wait arcade, bank, keyboard, reset and verified ready handoff');
   } finally {await ctx.close();}
  }
 } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
