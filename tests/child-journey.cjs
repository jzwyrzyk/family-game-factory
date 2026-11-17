/* Production child journeys. Network responses and storage faults are explicit
 * fixtures; no paid model, credentials, or experimental UI harness is used. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {start}=require('./browser-server.cjs');
const {renderGenerated}=require('../server/sandbox/preview.cjs');

const NOTEBOOK='family-game-factory-studio-v1';
const devices=[['desktop',{width:1400,height:960}],['mobile',{width:390,height:844}]];
const unavailable=route=>route.fulfill({contentType:'application/json',body:JSON.stringify({version:1,mode:'unavailable'})});
const currentSession=page=>page.evaluate(()=>{
 const notebook=FG.studio.exportNotebook(),owner=FG.store.current().id;
 return notebook.sessions.find(session=>session.id===notebook.active[owner]);
});
const runtime=page=>page.evaluate(()=>FG.runtime.snapshot());
const mainId=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('family-game-factory-workspace-v2')).projects[0].headId);
async function more(page){if(!await page.locator('#studioMore').evaluate(node=>node.open))await page.locator('#studioMore > summary').click();}
async function player(page,index){if(!await page.locator('#studioProfileMenu').evaluate(node=>node.open))await page.locator('#studioProfileMenu > summary').click();await page.locator('.profile-choice').nth(index).click();}
async function assertTargets(page,selectors){
 for(const selector of selectors){const box=await page.locator(selector).boundingBox();assert.ok(box&&box.width>=44&&box.height>=44,`${selector} is a visible target of at least 44 × 44 CSS pixels`);}
}
async function expectBudget(page,value){await page.waitForFunction(expected=>FG.runtime.snapshot().config.gumBudget===expected,value);}
async function localTest(page){await page.click('#studioChange');await page.fill('#studioPrompt','Give me 15 gum sticks');await page.click('#studioSend');await expectBudget(page,15);}
async function returnToViewed(page,device){
 if(device==='mobile')await page.click('[data-studio-tab="game"]');else await page.click('#studioReturnToPlay');
 await page.waitForSelector('.quality-builder');
}
async function failureScreenshot(page,name){try{await page.screenshot({path:`test-results/child-${name}-failure.png`,fullPage:true});}catch{}}
async function assertTouchDevice(page,device,phase){
 const capability=await page.evaluate(()=>({maxTouchPoints:navigator.maxTouchPoints,coarsePointer:matchMedia('(pointer:coarse)').matches,viewportWidth:innerWidth}));
 if(device==='mobile')assert.ok(capability.maxTouchPoints>0&&capability.coarsePointer,`${phase}: mobile touch emulation must remain active: ${JSON.stringify(capability)}`);
 return capability;
}
async function journeyScreenshot(page,device,name){
 // Chromium beyond-viewport captures reset touch emulation in this Playwright
 // version: https://github.com/microsoft/playwright/issues/42607 . Only a
 // terminal failure capture may use fullPage; active journeys keep real touch.
 await assertTouchDevice(page,device,`before ${name} screenshot`);
 await page.screenshot({path:`test-results/child-${name}-${device}.png`,fullPage:false});
 await assertTouchDevice(page,device,`after ${name} screenshot`);
}
async function prepare(browser,viewport,device){
 const context=await browser.newContext({viewport,isMobile:device==='mobile',hasTouch:device==='mobile',reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
 page.setDefaultTimeout(8000);page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
 return {context,page,errors};
}

async function localJourney(browser,url,device,viewport){
 const {context,page,errors}=await prepare(browser,viewport,device);
 try{
  await page.route('**/factory-config.json',unavailable);await page.clock.install();
  await page.goto(url);await page.waitForFunction(()=>window.FG?.studio&&window.FG?.learning);
  await assertTouchDevice(page,device,'after initial navigation');
  const first=await page.locator('#studioStarters [data-starter]').first().boundingBox();
  assert.ok(first&&first.y>=0&&first.y+first.height<=viewport.height,'a complete playable game choice is in the first viewport');
  await assertTargets(page,['#studioNavHome','#studioNavCreate','#studioNavPowers','#studioProfileSummary','#studioNew']);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  await journeyScreenshot(page,device,'first-screen');

  await page.click('[data-starter="gum"]');await page.waitForSelector('.quality-builder');
  await assertTargets(page,['#studioPlay','#studioChange','#studioHelp','#studioMore > summary']);
  const originalMain=await mainId(page);
  await page.getByRole('button',{name:'Add Bottle',exact:true}).click();await localTest(page);
  const candidate=(await currentSession(page)).candidate.id;
  assert.equal(await mainId(page),originalMain);
  const touchCapabilities=await assertTouchDevice(page,device,'before Help');
  if(device==='mobile')await page.locator('#studioHelp').tap();else await page.click('#studioHelp');
  await page.waitForSelector('#studioHelpPanel');
  assert.equal((await runtime(page)).disposed,true,'help pauses the mounted game');
  assert.equal(await page.locator('#studioHelpTitle').evaluate(node=>document.activeElement===node),true);
  if(device==='mobile')assert.match(await page.textContent('#studioHelpControls'),/Tap a part/,`Help must describe touch controls on this device: ${JSON.stringify(touchCapabilities)}`);
  await journeyScreenshot(page,device,'help');
  await page.click('#studioCloseHelp');await returnToViewed(page,device);await expectBudget(page,15);
  assert.equal((await currentSession(page)).candidate.id,candidate,'returning from help resumes the selected test');
  assert.equal((await runtime(page)).state.parts.filter(part=>part.kind==='bottle').length,1);
  assert.equal(await mainId(page),originalMain);

  // A deliberately promoted test creates history. Trying history must survive
  // help and Versions without silently switching to the current main edition.
  await page.click('#studioKeep');await expectBudget(page,15);const promotedMain=await mainId(page);assert.notEqual(promotedMain,originalMain);
  await more(page);await page.click('#studioCompare');
  await page.locator('#studioVersionCards .studio-version-card').first().getByRole('button',{name:'Play this version',exact:true}).click();await expectBudget(page,10);
  assert.match(await page.textContent('#studioVersion'),/earlier version/);
  await page.click('#studioHelp');await page.click('#studioCloseHelp');await returnToViewed(page,device);await expectBudget(page,10);
  await more(page);await page.click('#studioCompare');await page.click('#studioCloseVersions');
  assert.equal(await page.locator('#studioPausedPreview').isVisible(),true);
  await page.click('#studioReturnToPlay');await expectBudget(page,10);
  assert.equal(await mainId(page),promotedMain,'only the earlier play view changes; the main pointer remains promoted');

  // The real checkpoint closes secondary tools. The child cannot reopen them
  // over math; visible Help/mobile panel actions must also preserve this task.
  await more(page);await page.clock.runFor(91_000);await page.waitForSelector('#stage-overlay .math-activity');
  const attempt=await page.evaluate(()=>({id:FG.learning.activeAttemptId,owner:FG.store.current().id}));assert.ok(attempt.id);
  assert.equal(await page.locator('#studioMore').evaluate(node=>node.open),false);
  await page.locator('#studioMore > summary').click();assert.equal(await page.locator('#studioMore').evaluate(node=>node.open),false,'More game tools cannot reopen over required math');
  assert.equal(await page.evaluate(()=>FG.learning.activeAttemptId),attempt.id);
  const guarded=['#studioHelp',...(device==='mobile'?['[data-studio-tab="versions"]','[data-studio-tab="talk"]']:[])];
  for(const selector of guarded){
   await page.click(selector);
   assert.equal(await page.evaluate(()=>FG.learning.activeAttemptId),attempt.id,`${selector} preserves the same attempt`);
   assert.equal(await page.locator('#stage-overlay .math-activity').isVisible(),true,`${selector} cannot hide required math`);
   assert.equal(await page.locator('#studioCopyDialog').evaluate(node=>node.open),false);
   assert.equal(await page.locator('#studioHelpPanel').isVisible(),false);
  }
  // Explicit stale-control race fixture: a previously queued activation reaches
  // a now-hidden control. This is not presented as an ordinary child click.
  for(const id of ['studioCompare','studioCopy']){
   await page.evaluate(id=>document.getElementById(id).click(),id);
   assert.equal(await page.evaluate(()=>FG.learning.activeAttemptId),attempt.id);
   assert.equal(await page.locator('#stage-overlay .math-activity').isVisible(),true);
   assert.equal(await page.locator('#studioCopyDialog').evaluate(node=>node.open),false);
  }
  const question=await page.locator('#stage-overlay .math-activity h2').evaluate(node=>{const box=node.getBoundingClientRect();return {focused:document.activeElement===node,visible:box.top>=0&&box.bottom<=innerHeight};});
  assert.deepEqual(question,{focused:true,visible:true});
  await journeyScreenshot(page,device,'required-math');
  await player(page,1);assert.equal(await page.evaluate(()=>FG.learning.active),false);
  const abandoned=await page.evaluate(({owner,id})=>{
   const record=FG.store.data.profiles.find(profile=>profile.id===owner).learning.attempts.find(item=>item.id===id);
   return {outcome:record.outcome,answers:record.answers.length,correct:record.correct,independent:record.independent,ownerChanged:FG.store.current().id!==owner};
  },attempt);
  assert.deepEqual(abandoned,{outcome:'interrupted',answers:0,correct:false,independent:false,ownerChanged:true});
  assert.equal(await page.locator('#page-studio-library').isVisible(),true);assert.deepEqual(errors,[]);
  console.log(`PASS child ${device}: first-screen play, touch targets, help/history return, real required-math guards, profile interruption`);
 }catch(error){await failureScreenshot(page,`local-${device}`);throw error;}finally{await context.close();}
}

function transportFixture(){
 return {kind:'generated-module-v1',title:'Journey transport fixture',instructions:'An explicit local test fixture. No AI model created this game.',controls:['left','right','action'],compiled:{code:'var GameModule={createGame(){return {init(){return {x:100};},step(state,input){return {x:Math.max(20,Math.min(680,state.x+(input.pressed.includes("right")?4:0)-(input.pressed.includes("left")?4:0)))};},draw(state){return [{type:"rect",x:0,y:0,width:720,height:400,color:"#233254"},{type:"circle",x:state.x,y:180,radius:28,color:"#ffe28a"}];},outcome(){return {status:"playing",score:0};}};}};'}};
}
async function remoteJourney(browser,url,device,viewport){
 const {context,page,errors}=await prepare(browser,viewport,device);
 const api='https://child-journey-api.test',preview='https://child-journey-preview.test';let ready=false;const requests=[],previewRequests=[];
 let releasePreview;
 const previewGate=new Promise(resolve=>{releasePreview=resolve;});
 const headers={'Access-Control-Allow-Origin':new URL(url).origin,'Access-Control-Allow-Credentials':'true','Access-Control-Allow-Headers':'Content-Type, X-Factory-Request','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
 try{
  await page.route('**/factory-config.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({version:1,mode:'remote',apiBaseUrl:api,previewOrigin:preview})}));
  await page.route(api+'/**',async route=>{
   const request=route.request(),path=new URL(request.url()).pathname;let body;
   if(request.method()==='OPTIONS'){await route.fulfill({status:204,headers});return;}
   if(path==='/v1/revisions'&&request.method()==='POST')body={revisionId:'journey-base'};
   else if(path==='/v1/jobs'&&request.method()==='POST'){requests.push(request.postDataJSON());body={jobId:'journey-job',status:'queued',adapter:'mock'};}
   else if(path==='/v1/jobs/journey-job')body=ready?{jobId:'journey-job',status:'ready',revisionId:'journey-ready',adapter:'mock'}:{jobId:'journey-job',status:'testing',adapter:'mock'};
   else if(path==='/v1/revisions/journey-ready/preview'){
    previewRequests.push(path);if(previewRequests.length===1)await previewGate;
    body={url:preview+'/game?capability=JOURNEY_TEST_ONLY',projectId:'journey-project',artifactId:'journey-artifact',expiresAt:Date.now()+60000,kind:'generated-module-v1',adapter:'mock'};
   }
   else body={errorCode:'FIXTURE_ROUTE_NOT_DEFINED'};
   await route.fulfill({status:body.errorCode?404:200,headers,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.route(preview+'/**',route=>{
   const channel=new URL(route.request().url()).searchParams.get('channel');
   const rendered=renderGenerated(transportFixture(),'journey-artifact',channel);
   return route.fulfill({headers:{'Content-Security-Policy':rendered.csp},contentType:'text/html',body:rendered.html});
  });
  await page.goto(url);await page.waitForFunction(()=>window.FG?.studio&&FG.studio.mode()==='remote');
  await page.click('[data-starter="gum"]');await localTest(page);
  const originalCandidate=(await currentSession(page)).candidate.id,originalMain=await mainId(page);
  await page.click('#studioChange');await page.fill('#studioPrompt','Replace the rocket with a bouncing banana maze');await page.click('#coachTry');
  await page.waitForFunction(()=>FG.studio.exportNotebook().sessions.some(session=>session.job?.status==='testing'));
  assert.equal(requests.length,1);assert.equal(await page.inputValue('#studioPrompt'),'','the submitted idea clears only after the durable acknowledgement');
   assert.equal(await page.locator('#studioBuildShelf').isVisible(),true,'the child can see a build while continuing to play');
   // A slow AI test cannot block a second, instant local experiment.
   await page.click('#studioChange');await page.fill('#studioPrompt','Give me 12 gum sticks');await page.click('#studioSend');
   await expectBudget(page,12);
   const concurrentCandidate=(await currentSession(page)).candidate.id;
   assert.notEqual(concurrentCandidate,originalCandidate,'the quick edit is an independent recoverable experiment');
   assert.equal((await currentSession(page)).job.status,'testing','the pending AI build survives the local edit');
   assert.equal(requests.length,1,'the quick edit makes no second AI request');
  // Switching back to gameplay correctly hides the design panel. Reopen it before entering the next idea.
   await page.click('#studioChange');
   const laterDraft='My next idea is a tiny moon elevator. Keep this thought for later.';
  await page.fill('#studioPrompt',laterDraft);await page.click('#studioPlay');await expectBudget(page,12);
  ready=true;await page.waitForFunction(()=>FG.studio.exportNotebook().sessions.some(session=>session.job?.status==='ready'));
  await page.waitForSelector('#studioReady');
  const completed=await currentSession(page);
  assert.equal(completed.draft,laterDraft,'the later draft survives job completion');assert.equal(await page.inputValue('#studioPrompt'),laterDraft);
  assert.equal(completed.candidate.id,concurrentCandidate,'a background build cannot select itself');assert.equal(completed.selectedTest,concurrentCandidate);
  assert.equal(completed.experiments.length,3);assert.equal(completed.experiments.at(-1).candidate.remoteId,'journey-ready');
  assert.equal(await mainId(page),originalMain);assert.equal((await runtime(page)).disposed,false);assert.equal((await runtime(page)).config.gumBudget,12);
  assert.equal(await page.locator('#studioRemoteHost iframe').count(),0);assert.deepEqual(previewRequests,[],'no preview is requested before the child chooses it');
  await journeyScreenshot(page,device,'background-ready');

  // Hold the real preview endpoint after an explicit child choice. A newer
  // decision to think/type must win over that in-flight network response.
  const heldRequest=page.waitForRequest(request=>request.url()===api+'/v1/revisions/journey-ready/preview');heldRequest.catch(()=>{});
  await page.click('#studioReady');await heldRequest;
  assert.equal((await runtime(page)).disposed,false,'fetching a preview keeps the currently playable game available');
  assert.equal((await currentSession(page)).candidate.id,concurrentCandidate,'selection waits for an accepted preview response');
  if(device==='mobile')await page.click('[data-studio-tab="talk"]');else await page.click('#studioChange');
  const raceDraft=laterDraft+' I am still thinking about the controls.';await page.fill('#studioPrompt',raceDraft);
  const heldResponse=page.waitForResponse(response=>response.url()===api+'/v1/revisions/journey-ready/preview');
  releasePreview();await(await heldResponse).finished();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(await page.locator('.studio-workspace').getAttribute('data-mobile-panel'),'talk','a late preview cannot switch the chosen task');
  assert.equal(await page.locator('#studioPrompt').evaluate(node=>document.activeElement===node),true,'a late open cannot steal typing focus');
  assert.equal(await page.inputValue('#studioPrompt'),raceDraft);assert.equal(await page.locator('#studioRemoteHost iframe').count(),0);
  assert.equal((await runtime(page)).disposed,true,'the earlier game remains intentionally paused for ideas');
  assert.equal((await runtime(page)).config.gumBudget,12);assert.equal((await currentSession(page)).candidate.id,concurrentCandidate);
  await page.waitForFunction(text=>FG.studio.exportNotebook().sessions.some(session=>session.draft===text),raceDraft);
  assert.equal(await page.locator('#studioReady').isVisible(),true,'the saved test remains available for an explicit retry');
  await journeyScreenshot(page,device,'preview-race');
  await page.click('#studioReady');await page.waitForSelector('#studioRemoteHost iframe');
  const frame=page.frameLocator('#studioRemoteHost iframe');await frame.getByRole('heading',{name:'Journey transport fixture',exact:true}).waitFor();
  await page.waitForFunction(()=>document.querySelector('#studioRemoteHost iframe').inert===false);
  assert.equal(await page.locator('.learning-preview-cover').count(),0,'the trusted renderer advertises the required learning protocol');
  assert.equal(await page.locator('#studioRemoteHost iframe').getAttribute('sandbox'),'allow-scripts');
  assert.match(await page.textContent('#studioPlayNote'),/mock/);assert.equal((await currentSession(page)).candidate.remoteId,'journey-ready');
  assert.equal((await currentSession(page)).draft,raceDraft);assert.equal(await mainId(page),originalMain);assert.equal(previewRequests.length,2);
  assert.equal(await page.evaluate(()=>JSON.stringify(FG.studio.exportNotebook()).includes('JOURNEY_TEST_ONLY')),false);
  assert.deepEqual(errors,[]);
  console.log(`PASS child ${device}: delayed mock build preserves draft/test/main; late preview preserves chosen task and focus; explicit retry opens trusted preview`);
 }catch(error){await failureScreenshot(page,`remote-${device}`);throw error;}finally{releasePreview();await context.close();}
}

async function storageFailure(page,enabled){
 await page.evaluate(({key,enabled})=>{
  if(!window.journeyStorageWrite)window.journeyStorageWrite=Storage.prototype.setItem;
  Storage.prototype.setItem=enabled?function(name,value){if(name===key)throw new DOMException('Explicit journey quota fixture','QuotaExceededError');return window.journeyStorageWrite.call(this,name,value);}:window.journeyStorageWrite;
 },{key:NOTEBOOK,enabled});
}
async function recoveryJourney(browser,url,device,viewport){
 const {context,page,errors}=await prepare(browser,viewport,device);
 try{
  await page.route('**/factory-config.json',unavailable);await page.goto(url);await page.waitForFunction(()=>window.FG?.studio);
  const original=await page.evaluate(key=>localStorage.getItem(key),NOTEBOOK);
  await storageFailure(page,true);await page.click('#studioNavCreate');
  assert.equal(await page.locator('#page-studio-library').isVisible(),true);
  await page.waitForFunction(()=>document.getElementById('studioGlobalStatus').textContent.includes('Could not save'));
  assert.equal(await page.locator('#studioGlobalStatus').getAttribute('role'),'alert');assert.equal(await page.evaluate(key=>localStorage.getItem(key),NOTEBOOK),original);
  await storageFailure(page,false);await page.click('#studioNavCreate');
  const before='A saved idea for a tiny moon elevator.';await page.fill('#studioPrompt',before);
  await page.waitForFunction(text=>FG.studio.exportNotebook().sessions.some(session=>session.draft===text),before);
  const durable=await page.evaluate(key=>localStorage.getItem(key),NOTEBOOK),owner=await page.evaluate(()=>FG.store.current().id);
  await storageFailure(page,true);const unsaved='Keep this new sentence even when this device cannot save.';await page.fill('#studioPrompt',unsaved);
  await page.waitForFunction(()=>document.getElementById('studioDraftStatus').textContent.includes('Could not save'));
  assert.equal(await page.locator('#studioStatus').getAttribute('role'),'alert');assert.match(await page.textContent('#studioStatus'),/Could not save/);
  assert.equal(await page.inputValue('#studioPrompt'),unsaved);assert.equal(await page.evaluate(key=>localStorage.getItem(key),NOTEBOOK),durable);
  await page.click('#studioNavHome');assert.equal(await page.locator('#page-studio').isVisible(),true,'a failed draft save does not navigate away from the typed work');
  await player(page,1);assert.equal(await page.evaluate(()=>FG.store.current().id),owner,'a failed draft save does not switch away from this child');
  assert.equal(await page.inputValue('#studioPrompt'),unsaved);
  await journeyScreenshot(page,device,'save-recovery');
  await storageFailure(page,false);await page.click('#studioNavHome');await page.reload();await page.waitForFunction(()=>window.FG?.studio);
  await page.click('#studioContinuePlaying');assert.equal(await page.inputValue('#studioPrompt'),unsaved,'retrying persistence recovers the exact typed draft across reload');
  assert.deepEqual(errors,[]);
  console.log(`PASS child ${device}: library and Studio save faults are visible, navigation preserves typed work, recovery survives reload`);
 }catch(error){await failureScreenshot(page,`recovery-${device}`);throw error;}finally{await context.close();}
}

(async()=>{
 const server=start(),browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(!process.env.CI&&fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']});
 fs.mkdirSync('test-results',{recursive:true});const failures=[],url=`http://127.0.0.1:${server.address().port}/arcade/?studio=1`;
 try{
  for(const [device,viewport] of devices)for(const [name,journey] of [['local',localJourney],['remote',remoteJourney],['recovery',recoveryJourney]]){
   try{await journey(browser,url,device,viewport);}catch(error){console.error(`FAIL child ${name} ${device}:`,error);failures.push(error);}
  }
  if(failures.length)throw new AggregateError(failures,'Child journey acceptance failed');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
