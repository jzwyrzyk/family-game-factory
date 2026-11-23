/* Real bundled UI, synthetic authenticated transport. No provider or paid job.
 * Covers the owner's failed-build/reload screenshot and explicit chat recovery. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');
const {start}=require('./browser-server.cjs');
const {exploreWelcome,sendChildMessage,navigate}=require('./studio-entry.cjs');
const {assertTextContrast}=require('./helpers/text-contrast.cjs');

const idea='I want a silly moon cat game. I tap to jump between clouds. Catching a donut makes the cat grow. Missing a cloud sends it back to try again. I win by reaching the moon tower. I want a bright cartoon style.';
const evidence={action:'I tap to jump between clouds.',consequence:'Catching a donut makes the cat grow.',experience:'silly',world:'moon cat game',goal:'I win by reaching the moon tower.',visualStyle:'bright cartoon style',mood:'silly'};
const ready={move:'listen',text:'Your moon cat jumps for donuts and grows when it catches one. You can build your game.',question:null,suggestions:[],proposedChange:null,planSuggestions:[],childDecisions:[],evidenceIds:[],creationReadiness:{ready:true,evidence,unresolved:[]}};
const session=page=>page.evaluate(()=>{const n=FG.studio.exportNotebook();return n.sessions.find(s=>s.id===n.active[FG.store.current().id]);});

(async()=>{
 const server=start(),browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox']});
 const url='http://127.0.0.1:'+server.address().port+'/arcade/';
 fs.mkdirSync('test-results',{recursive:true});
 try{
  for(const [device,viewport] of [['desktop',{width:1280,height:900}],['phone',{width:390,height:844}]]){
   const context=await browser.newContext({viewport,reducedMotion:'reduce'}),page=await context.newPage(),errors=[],requests=[],coachRequests=[];
   page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));
   const api='https://recovery-api.test',preview='https://recovery-preview.test';
   const headers={'Access-Control-Allow-Origin':new URL(url).origin,'Access-Control-Allow-Credentials':'true','Access-Control-Allow-Headers':'Content-Type, X-Factory-Request','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
   let coachFails=true,acceptedRetry=false,firstPosts=0,retryPosts=0;
   await page.route('**/factory-config.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({version:1,mode:'remote',apiBaseUrl:api,previewOrigin:preview})}));
   await page.route(api+'/**',async route=>{
    const request=route.request(),path=new URL(request.url()).pathname,method=request.method();let body,status=200;
    if(method==='OPTIONS'){await route.fulfill({status:204,headers});return;}
    requests.push(method+' '+path);
    if(path==='/v1/sessions/status')body={connected:true,trusted:true,expiresAt:Date.now()+60000};
    else if(path==='/v1/coach/status'||path==='/v1/builder/status')body={available:true};
    else if(path==='/v1/coach/audio/status')body={available:false};
    else if(path==='/v1/coach'){
     coachRequests.push(request.postDataJSON().context);
     if(coachFails){body={errorCode:'COACH_UNAVAILABLE'};status=503;}else body={mode:'model',reply:ready};
    }else if(path==='/v1/jobs'&&method==='POST'){
     firstPosts++;
     if(firstPosts===1)body={jobId:'saved-failed',status:'failed',errorCode:'GAME_RUNTIME_FAILED',adapter:'mock'};
     else{body={errorCode:'RATE_LIMIT'};status=429;}
    }else if(path==='/v1/jobs/saved-failed')body={jobId:'saved-failed',status:'failed',errorCode:'GAME_RUNTIME_FAILED',...(acceptedRetry?{retryJobId:'accepted-retry'}:{})};
    else if(path==='/v1/jobs/saved-failed/retry'){
     retryPosts++;acceptedRetry=true;
     await route.abort('failed');return; // Server accepted it; the response was lost.
    }else if(path==='/v1/jobs/accepted-retry')body={jobId:'accepted-retry',status:'failed',errorCode:'GAME_RUNTIME_FAILED'};
    else if(path==='/v1/jobs/accepted-retry/retry'){retryPosts++;body={errorCode:'RETRY_LIMIT'};status=400;}
    else throw Error('Unexpected recovery fixture request '+method+' '+path);
    await route.fulfill({status,headers,contentType:'application/json',body:JSON.stringify(body)});
   });
   try{
    await page.goto(url);await page.waitForFunction(()=>FG.studio?.mode()==='remote');await exploreWelcome(page);await navigate(page,'studioNavCreate');
    assert.equal(await page.locator('#studioSend').isVisible(),true,'Build remains discoverable');
    assert.equal(await page.locator('#studioSend').isDisabled(),true);
    await assertTextContrast(page,'#studioSend, #studioBuildReason','disabled build guidance',{includeDisabled:true});
    await sendChildMessage(page,idea);
    assert.match(await page.locator('#studioConnectionHint').innerText(),/disconnected|reconnect/i,'health-ready does not claim a real coach reply');
    assert.doesNotMatch(await page.locator('#studioMessages').innerText(),/What does the player do\?|How should it feel\?/,'technical fallback does not pretend to interview the child');
    assert.equal(await page.locator('#studioCheckIdea').innerText(),'Reconnect chat');
    const beforeReconnect=await session(page);
    coachFails=false;await page.click('#studioCheckIdea');
    await page.waitForFunction(()=>document.getElementById('studioSend').disabled===false);
    const connected=await session(page);
    assert.deepEqual(connected.messages.filter(m=>m.role==='child'),beforeReconnect.messages.filter(m=>m.role==='child'),'reconnect reviews saved intent without inventing another child turn');
    assert.equal(coachRequests.length,2);assert.equal(firstPosts,0,'chat reconnection never builds');
    assert.equal(await page.locator('#studioConnectionHint').isVisible(),false);
    await page.click('#studioSend');
    await page.waitForFunction(()=>document.getElementById('studioBuildHandoff').dataset.phase==='failed');
    assert.equal(await page.locator('#studioBuildHandoffRecover').innerText(),'Try build again');
    assert.doesNotMatch(await page.locator('#studioBuildHandoffDescription').innerText(),/might still|did not confirm/,'known failure has accurate recovery copy');
    await page.click('#studioBuildHandoffStay');
    const failedExperiment=(await session(page)).pendingExperiment;
    await sendChildMessage(page,'I also want a little red flag on each cloud.');
    await page.waitForFunction(()=>document.getElementById('studioSend').disabled===false);
    await page.click('#studioSend');
    await page.waitForFunction(()=>document.getElementById('studioBuildHandoff').dataset.phase==='unavailable');
    assert.equal(firstPosts,2);
    assert.deepEqual((await session(page)).pendingExperiment,failedExperiment,'rejected newer request restores the exact saved failed request metadata for retry');
    assert.equal((await session(page)).job.id,'saved-failed');
    await page.click('#studioBuildHandoffStay');
    const draft='Save a blue hat for a different version.';
    await page.fill('#studioPrompt',draft);
    await page.waitForFunction(value=>FG.studio.exportNotebook().sessions.some(s=>s.draft===value),draft);
    const beforeReload=await session(page),transcript=beforeReload.messages;
    await page.reload();await page.waitForFunction(()=>FG.studio?.mode()==='remote');
    await page.locator(`[data-session="${beforeReload.id}"] .studio-saved-open`).click();
    assert.equal(await page.inputValue('#studioPrompt'),draft);
    await page.click('#studioRetry');
    await page.waitForFunction(()=>document.getElementById('studioBuildHandoff').dataset.phase==='uncertain');
    assert.equal(retryPosts,1,'fresh client can retry the saved failed job after reload');
    assert.equal(firstPosts,2,'recovery never recompiles the idea into a new first build');
    assert.equal(await page.locator('#studioBuildHandoffRecover').innerText(),'Check build status');
    await assertTextContrast(page,'#studioBuildHandoff :is(h2,p,button)','build recovery',{includeDisabled:true});
    await page.screenshot({path:`test-results/build-recovery-uncertain-${device}.png`});
    const beforeCheckPosts=retryPosts;
    await page.click('#studioBuildHandoffRecover');
    await page.waitForFunction(()=>document.getElementById('studioBuildHandoff').dataset.phase==='failed');
    assert.equal((await session(page)).job.id,'accepted-retry');
    assert.equal(retryPosts,beforeCheckPosts,'Check build status only reads the already accepted retry');
    assert.deepEqual((await session(page)).messages,transcript,'build recovery adds no lifecycle text or compiled prompt to chat');
    assert.deepEqual((await session(page)).pendingExperiment,failedExperiment,'retry lineage retains the original reviewed request, not the rejected newer request');
    assert.equal(await page.inputValue('#studioPrompt'),draft,'retry does not consume a newer draft');
    assert.equal(await page.locator('#studioBuildHandoffRecover').innerText(),'Try build again');
    await page.click('#studioBuildHandoffRecover');
    await page.waitForFunction(()=>document.getElementById('studioBuildHandoffDescription').textContent.includes('retry limit'));
    assert.equal(await page.locator('#studioBuildHandoff').getAttribute('data-phase'),'failed','definitive rejection is not an uncertain paid outcome');
    assert.equal(await page.locator('#studioBuildHandoffRecover').isVisible(),false,'retry limit has no false retry promise');
    assert.equal(firstPosts,2);assert.equal(retryPosts,2);
    await page.click('#studioBuildHandoffStay');
    assert.equal(await page.inputValue('#studioPrompt'),draft);
    assert.equal(await page.locator('#studioRetry').isDisabled(),true,'a known retry limit also disables the background retry action');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
    assert.deepEqual(errors,[]);
    console.log('PASS '+device+': visible readiness, explicit real-chat reconnect, failed-job reload retry, lost ACK read-only recovery, accurate rejection and untouched intent/draft');
   }catch(error){await page.screenshot({path:`test-results/build-recovery-failure-${device}.png`,fullPage:true}).catch(()=>{});throw error;}
   finally{await context.close();}
  }
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
