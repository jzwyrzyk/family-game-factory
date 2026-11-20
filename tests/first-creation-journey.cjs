/* The first creation, one real local improvement, and the next visit.
 * Remote responses are explicitly authenticated synthetic transport fixtures;
 * no model, provider budget, production data, or cloud account is exercised.
 */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {start}=require('./browser-server.cjs');
const {exploreWelcome,waitForWelcome,completeWelcome,navigate}=require('./studio-entry.cjs');

const NOTEBOOK='family-game-factory-studio-v1';
const devices=[['desktop',{width:1280,height:900}],['phone',{width:390,height:844}]];
const ready=async page=>{await page.waitForFunction(()=>window.FG?.studio&&window.FG?.learning&&window.FG?.creation);await waitForWelcome(page);};
const notebook=page=>page.evaluate(()=>FG.studio.exportNotebook());
const current=page=>page.evaluate(()=>{
 const n=FG.studio.exportNotebook();return n.sessions.find(s=>s.id===n.active[FG.store.current().id]);
});
const unavailable=route=>route.fulfill({contentType:'application/json',body:JSON.stringify({version:1,mode:'unavailable'})});
const snapshot=page=>page.evaluate(()=>FG.runtime.snapshot());
async function capture(page,name,device){
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true,name+' fits the '+device+' viewport');
 // Keep touch emulation intact during an active journey (Playwright #42607).
 await page.screenshot({path:`test-results/first-creation-${name}-${device}.png`,fullPage:false});
}
async function choosePlayer(page,index){
 const menu=page.locator('#studioProfileMenu');
 if(!await menu.evaluate(node=>node.open))await menu.locator('summary').click();
 await page.locator('#profile-choices .profile-choice').nth(index).click();
 await page.waitForFunction(value=>FG.store.current().id==='player'+(value+1),index);
 await waitForWelcome(page);
}
async function failWrites(page,enabled){
 await page.evaluate(({key,enabled})=>{
  window.firstJourneySetItem??=Storage.prototype.setItem;
  Storage.prototype.setItem=enabled?function(name,value){
   if(this===localStorage&&name===key)throw new DOMException('Synthetic first-journey save fault','QuotaExceededError');
   return window.firstJourneySetItem.call(this,name,value);
  }:window.firstJourneySetItem;
 },{key:NOTEBOOK,enabled});
}
async function prepare(browser,viewport,device){
 const context=await browser.newContext({viewport,hasTouch:device==='phone',isMobile:device==='phone',reducedMotion:'reduce'});
 const page=await context.newPage(),errors=[],posts=[];
 page.setDefaultTimeout(12000);
 page.on('pageerror',error=>errors.push(error.stack||error.message));
 page.on('request',request=>{if(request.method()==='POST')posts.push(request.url());});
 page.on('dialog',dialog=>void dialog.accept());
 return {context,page,errors,posts};
}
async function blockedArtEntry(browser,url){
 const {context,page,errors,posts}=await prepare(browser,devices[0][1],'desktop');
 try{
  // A real older tab can block the v1-to-v2 art database upgrade. Keep that
  // connection open rather than replacing the application's storage result.
  const blocker=await context.newPage();
  await blocker.route('**/art-upgrade-blocker',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Older art tab fixture</title>'}));
  await blocker.goto(url+'art-upgrade-blocker');
  await blocker.evaluate(async()=>{
   window.firstJourneyArtBlocker=await new Promise((resolve,reject)=>{
    const request=indexedDB.open('family-private-drawings-v1',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('drawings',{keyPath:'id'});
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
   });
   window.firstJourneyArtBlocker.onversionchange=()=>{window.firstJourneyArtUpgradeRequested=true;};
  });
  await page.addInitScript(()=>{
   // Observe completion of the original readonly request without changing its
   // result or timing. Migration's separate readwrite transaction is excluded.
   const getAll=IDBObjectStore.prototype.getAll;
   IDBObjectStore.prototype.getAll=function(...args){
    const request=getAll.apply(this,args);
    if(this.name==='drawings'&&this.transaction.db.name==='family-private-drawings-v1'&&this.transaction.mode==='readonly'){
     this.transaction.addEventListener('complete',()=>{window.firstJourneyArtReadComplete=true;});
    }
    return request;
   };
  });
  await page.route('**/factory-config.json',unavailable);
  await page.goto(url);
  await blocker.waitForFunction(()=>window.firstJourneyArtUpgradeRequested===true);
  await page.waitForFunction(()=>window.FG?.studio&&window.FG?.learning&&window.FG?.creation&&document.getElementById('page-studio-library')?.getAttribute('aria-busy')==='false',undefined,{timeout:6000});
  assert.equal(await page.locator('#page-studio-library').isVisible(),true,'a blocked art upgrade cannot prevent usable Studio entry');
  assert.equal(await page.locator('#studioWelcome').isVisible(),false,'unknown saved art conservatively opens ordinary home');
  assert.equal(await page.locator('#studioFavoritesSection').isVisible(),true);
  const before=await notebook(page);assert.equal(before.sessions.length,0);
  assert.equal(await page.evaluate(()=>!!window.firstJourneyArtReadComplete),false,'the real art read is still blocked when home becomes usable');
  await page.locator('#studioNew').focus();
  await blocker.evaluate(()=>window.firstJourneyArtBlocker.close());
  await page.waitForFunction(()=>window.firstJourneyArtReadComplete===true);
  assert.equal(await page.locator('#studioNew').evaluate(node=>document.activeElement===node),true,'a late art read preserves the focused home action');
  assert.equal(await page.locator('#studioWelcome').isVisible(),false,'a losing late read cannot replace the home fallback');
  assert.deepEqual(await notebook(page),before,'fallback and late recovery create no projects, guidance preferences or making evidence');
  await page.keyboard.press('Enter');await page.locator('#page-studio').waitFor({state:'visible'});
  assert.equal((await notebook(page)).sessions.length,1,'the normal home action remains usable after the blocked read settles');
  assert.deepEqual(posts,[]);assert.deepEqual(errors,[]);
  console.log('PASS first creation blocked art: bounded normal-home fallback, real late-read completion, stable focus and no invented progress');
 }catch(error){await page.screenshot({path:'test-results/first-creation-blocked-art-failure.png',fullPage:true}).catch(()=>{});throw error;}
 finally{await context.close();}
}
async function localFirstJourney(browser,url,device,viewport){
 const {context,page,errors,posts}=await prepare(browser,viewport,device);
 try{
  await page.route('**/factory-config.json',unavailable);
  await page.goto(url);await ready(page);
  assert.equal(await page.locator('#studioWelcome').isVisible(),true,'fresh profile has its own creation-first welcome');
  assert.equal(await page.locator('#studioFavoritesSection').isVisible(),false,'the initial invitation does not compete with the full game shelf');
  assert.equal(await page.locator('#studioNavHome').isVisible(),false,'the first invitation has one primary path before ordinary navigation appears');
  assert.equal(await page.locator('#studioNavPals').isVisible(),false,'the companion entrance joins ordinary navigation after the first invitation');
  assert.equal(await page.locator('#studioPalsEntry').isVisible(),false,'the companion widget does not compete with the first creation choice');
  assert.equal(await page.locator('#studioWelcomeExplore').count(),0,'onboarding has no competing play-first invitation');
  assert.equal(await page.locator('#studioWelcomeMake').isDisabled(),true,'choose and durably save a character before continuing');
  for(const selector of ['#studioWelcomeMake','[data-welcome-character="spark"]','[data-welcome-character="nova"]']){
   const box=await page.locator(selector).boundingBox();
   assert.ok(box&&box.height>=44&&box.width>=44,selector+' is a visible touch target');
   if(selector==='#studioWelcomeMake')assert.ok(box.y>=0&&box.y+box.height<=viewport.height,'the first creation action is visible without scrolling');
  }
  assert.equal((await notebook(page)).sessions.length,0,'simply opening welcome does not create a project');
  const character=device==='phone'?'nova':'spark';
  await page.locator(`[data-welcome-character="${character}"]`).click();
  await page.waitForFunction(()=>!document.getElementById('studioWelcomeMake').disabled);
  assert.equal((await notebook(page)).avatars.player1,character,'the actual first choice is saved for this owner');
  assert.equal(await page.locator('#studioWelcome').isVisible(),true,'choosing a character waits for the explicit creation action');
  assert.equal((await notebook(page)).sessions.length,0,'cosmetic choice does not create a project or call a builder');
  await capture(page,'welcome',device);
  await page.locator('#studioWelcomeMake').focus();await page.keyboard.press('Enter');
  await page.locator('#page-studio').waitFor({state:'visible'});
  assert.equal((await notebook(page)).sessions.length,1,'the primary action creates exactly one idea');
  assert.equal((await current(page)).job,null,'a welcome action never submits a build');
  if(device==='phone')for(const selector of ['#studioTalk','#studioSend']){
   const box=await page.locator(selector).boundingBox();
   assert.ok(box&&box.y>=0&&box.y+box.height<=viewport.height,selector+' remains visible in the first phone composer');
  }
  await page.locator('#studioGuideCard').waitFor({state:'visible'});
  await capture(page,'idea',device);
  const beforeHint=await page.evaluate(key=>localStorage.getItem(key),NOTEBOOK);
  await failWrites(page,true);await page.click('#studioGuideCardDismiss');
  assert.equal(await page.locator('#studioGuideCard').isVisible(),true,'a failed preference write leaves the hint available');
  assert.equal(await page.evaluate(key=>localStorage.getItem(key),NOTEBOOK),beforeHint,'a failed hint dismissal changes no durable work');
  await failWrites(page,false);
  await page.click('#studioGuideCardDismiss');
  assert.equal(await page.locator('#studioGuideCard').isVisible(),false,'a contextual hint can be dismissed');
  const draft='Fixture: a purple cat jumps between jelly moons.';
  await page.fill('#studioPrompt',draft);
  await page.waitForFunction(text=>FG.studio.exportNotebook().sessions.some(s=>s.draft===text),draft);
  await page.click('#studioDoneForNow');
  await page.locator('#page-studio-library').waitFor({state:'visible'});
  await page.reload();await ready(page);
  assert.equal(await page.locator('#studioWelcome').isVisible(),false,'returning to a saved idea does not repeat the welcome');
  await page.click('#studioContinuePlaying');
  assert.equal(await page.inputValue('#studioPrompt'),draft,'the next visit resumes the exact idea');
  assert.equal(await page.locator('#studioGuideCard').isVisible(),false,'hint dismissal survives reload');
  await navigate(page,'studioJourneyHelp');
  await page.locator('#studioJourneyMap').waitFor({state:'visible'});
  await page.click('#studioGuideReset');
  await page.locator('#studioGuideCard').waitFor({state:'visible'});
  assert.equal(await page.locator('#studioNavMenu').evaluate(node=>document.activeElement===node),true,'closing journey help returns focus to the visible Menu trigger');
  assert.equal((await current(page)).job,null,'restoring help starts no build');
  assert.equal((await current(page)).keptExperiments?.length||0,0,'help does not invent making evidence');
  assert.equal((await notebook(page)).sessions.length,1,'reading the journey creates no throwaway projects');

  // A normal departure cannot claim that an unwritten draft was saved.
  const durable=await page.evaluate(key=>localStorage.getItem(key),NOTEBOOK);
  await failWrites(page,true);
  const unsaved='Fixture: preserve these new words even when browser storage is full.';
  await page.fill('#studioPrompt',unsaved);
  await page.waitForFunction(()=>document.getElementById('studioDraftStatus').textContent.includes('Could not save'));
  await page.click('#studioDoneForNow');
  assert.equal(await page.locator('#page-studio').isVisible(),true,'Done for now stops when the current draft cannot be saved');
  assert.equal(await page.inputValue('#studioPrompt'),unsaved);
  assert.equal(await page.evaluate(key=>localStorage.getItem(key),NOTEBOOK),durable,'failed departure preserves the last durable notebook');
  await failWrites(page,false);await page.click('#studioDoneForNow');
  await page.locator('#page-studio-library').waitFor({state:'visible'});
  await page.click('#studioContinuePlaying');
  assert.equal(await page.inputValue('#studioPrompt'),unsaved,'a retry saves and resumes the exact newer draft');

  await choosePlayer(page,1);
  assert.equal(await page.locator('#studioWelcome').isVisible(),true,'a sibling has their own first-time invitation');
  assert.equal(await page.locator('#studioContinuePlaying').count(),0,'a sibling does not see another child’s pending idea');
  await exploreWelcome(page);
  await page.reload();await ready(page);
  assert.equal(await page.locator('#studioWelcome').isVisible(),false,'the saved character and intentional Home choice are remembered for this profile');
  await choosePlayer(page,0);
  assert.equal(await page.locator('#studioWelcome').isVisible(),false,'switching back preserves the first child’s progress');
  await page.click('#studioContinuePlaying');
  assert.equal(await page.inputValue('#studioPrompt'),unsaved);
  // Simulate a valid notebook from before optional guidance existed. Actual work,
  // rather than an onboarding flag, must still identify a returning creator.
  await page.click('#studioDoneForNow');
  const previousSessions=(await notebook(page)).sessions;
  await page.evaluate(key=>{const value=JSON.parse(localStorage.getItem(key));delete value.guidance;localStorage.setItem(key,JSON.stringify(value));},NOTEBOOK);
  await page.reload();await ready(page);
  assert.equal(await page.locator('#studioWelcome').isVisible(),false,'existing saved ideas are recognized without any guidance preference');
  assert.deepEqual((await notebook(page)).sessions,previousSessions,'recognizing prior work does not manufacture new creative evidence');
  await page.click('#studioContinuePlaying');
  assert.equal(await page.inputValue('#studioPrompt'),unsaved,'a pre-guidance notebook resumes the exact saved idea');
  assert.deepEqual(posts,[],'the welcome, help and saved ideas never call a model or builder');
  assert.deepEqual(errors,[]);
  console.log(`PASS first creation ${device}: focused welcome, keyboard entry, optional persistent hints, meaningful return, failed-save recovery and profile isolation`);
 }catch(error){await page.screenshot({path:`test-results/first-creation-local-${device}-failure.png`,fullPage:true}).catch(()=>{});throw error;}
 finally{await context.close();}
}
async function firstImprovement(browser,url,device,viewport){
 const {context,page,errors,posts}=await prepare(browser,viewport,device);
 try{
  await page.route('**/factory-config.json',unavailable);
  await page.goto(url);await ready(page);await exploreWelcome(page);
  await page.click('[data-starter="robot"]');await page.waitForSelector('.favorite-robot .favorite-canvas');
  const original=(await snapshot(page)).config.robotSpeed;
  const head=()=>page.evaluate(()=>{
   const n=FG.studio.exportNotebook(),s=n.sessions.find(x=>x.id===n.active[FG.store.current().id]);
   return JSON.parse(localStorage.getItem('family-game-factory-workspace-v2')).projects.find(x=>x.id===s.projectId).headId;
  });
  const before=await head();
  await page.click('#studioChange');await page.fill('#studioPrompt','Make robot faster');await page.click('#studioSend');
  await page.waitForFunction(speed=>FG.runtime.snapshot().config.robotSpeed>speed,original);
  const experiment=(await current(page)).candidate;
  assert.ok(experiment,'the child’s change produces a distinct real local candidate');
  assert.equal(await head(),before,'trying a change does not replace the main game');
  await capture(page,'improvement',device);
  await page.click('#studioKeep');
  await page.waitForFunction(()=>{
   const n=FG.studio.exportNotebook(),s=n.sessions.find(x=>x.id===n.active[FG.store.current().id]);
   return s.candidate===null&&s.keptExperiments?.length===1;
  });
  assert.notEqual(await head(),before,'only explicit Keep chooses the new main version');
  const kept=await head();
  await page.click('#studioDoneForNow');await page.locator('#page-studio-library').waitFor({state:'visible'});
  await capture(page,'return',device);
  await page.reload();await ready(page);await page.click('#studioContinuePlaying');
  await page.waitForSelector('.favorite-robot .favorite-canvas');
  assert.equal(await head(),kept,'returning retains the chosen version');
  assert.ok((await snapshot(page)).config.robotSpeed>original,'the meaningful behavior change survives the next visit');

  // The host owns an ordinary required activity, including its interruption.
  const attempt=await page.evaluate(()=>{
   const host=document.getElementById('stage-overlay'),target=document.createElement('div');
   host.replaceChildren(target);host.classList.remove('hidden');FG.store.current().mathWindow=[];
   const n=FG.studio.exportNotebook(),s=n.sessions.find(x=>x.id===n.active[FG.store.current().id]);
   FG.learning.checkpoint(target,{gameId:'robot',projectId:s.id,versionId:'first-journey-guard'},()=>{},{roundId:'first-journey-guard'});
   return {id:FG.learning.activeAttemptId,owner:FG.store.current().id};
  });
  assert.ok(attempt.id);
  // An explicit queued-control race ensures guidance cannot bypass a host task.
  if(await page.locator('#studioGuideCardAction').count()){
   await page.evaluate(()=>document.getElementById('studioGuideCardAction').click());
   assert.equal(await page.evaluate(()=>FG.learning.activeAttemptId),attempt.id);
   assert.equal(await page.locator('#stage-overlay .math-activity').isVisible(),true,'a guide action cannot hide a required learning activity');
  }
  await page.click('#studioDoneForNow');
  await page.locator('#page-studio-library').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>FG.learning.active),false,'Done leaves through the host lifecycle');
  const outcome=await page.evaluate(({owner,id})=>{
   const record=FG.store.data.profiles.find(p=>p.id===owner).learning.attempts.find(a=>a.id===id);
   return {outcome:record.outcome,answers:record.answers.length,correct:record.correct};
  },attempt);
  assert.deepEqual(outcome,{outcome:'interrupted',answers:0,correct:false},'leaving never invents a completed or correct answer');
  assert.equal((await current(page)).keptExperiments.length,1,'leaving creates no duplicate keep receipt');
  assert.deepEqual(posts,[]);assert.deepEqual(errors,[]);
  console.log(`PASS first improvement ${device}: real native change, explicit Keep, next-visit playback and host-owned learning interruption`);
 }catch(error){await page.screenshot({path:`test-results/first-creation-improve-${device}-failure.png`,fullPage:true}).catch(()=>{});throw error;}
 finally{await context.close();}
}
async function firstRemoteResult(browser,url,device,viewport,focusedGuide){
 const {context,page,errors}=await prepare(browser,viewport,device);
 const variant=focusedGuide?`${device}-${focusedGuide}`:device;
 const api='https://first-creation-api.test',preview='https://first-creation-preview.test';
 const cors={'Access-Control-Allow-Origin':new URL(url).origin,'Access-Control-Allow-Credentials':'true','Access-Control-Allow-Headers':'Content-Type, X-Factory-Request','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
 let phase='testing',submitted=0,opened=0,kept=0;
 try{
  await page.route('**/factory-config.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({version:1,mode:'remote',apiBaseUrl:api,previewOrigin:preview})}));
  await page.route(api+'/**',async route=>{
   const request=route.request(),path=new URL(request.url()).pathname;
   if(request.method()==='OPTIONS'){await route.fulfill({status:204,headers:cors});return;}
   let body;
   if(path==='/v1/sessions/status')body={connected:true,trusted:true,expiresAt:Date.now()+60000};
   else if(path==='/v1/builder/status')body={available:true};
   else if(path==='/v1/coach/status')body={available:false};
   else if(path==='/v1/jobs'&&request.method()==='POST'){submitted++;body={jobId:'first-job',status:'queued',adapter:'mock'};}
   else if(path==='/v1/jobs/first-job')body={jobId:'first-job',status:phase,adapter:'mock',...(phase==='ready'?{revisionId:'first-revision'}:{})};
   else if(path==='/v1/revisions/first-revision/preview'){
    opened++;body={url:preview+'/game?capability=FIRST_JOURNEY_FIXTURE_ONLY',projectId:'first-project',artifactId:'first-artifact',expiresAt:Date.now()+60000,kind:'generated-module-v2',adapter:'mock'};
   }else if(path==='/v1/revisions/first-revision/keep'){kept++;body={ok:true};}
   else body={errorCode:'FIXTURE_ROUTE_NOT_DEFINED'};
   await route.fulfill({status:body.errorCode?404:200,headers:cors,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.route(preview+'/**',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html><body><h1>First creation transport fixture</h1><p>This is a synthetic game response, not an AI output.</p><button>Play fixture</button><script>const channel=new URLSearchParams(location.search).get('channel'),artifactId='first-artifact';addEventListener('message',event=>{if(event.source===parent&&event.data.type==='factory-learning'&&event.data.channel===channel&&event.data.artifactId===artifactId&&event.data.action==='connect')parent.postMessage({type:'factory-preview',channel,artifactId,event:'ready',height:400,learningProtocol:1},'*')});<\/script></body></html>`}));
  await page.goto(url);await ready(page);await page.waitForFunction(()=>FG.studio.mode()==='remote');
  await completeWelcome(page);
  await page.fill('#studioPrompt','Make a game where a purple cat jumps to collect donuts on the moon');await page.click('#studioSend');
  await page.waitForFunction(()=>document.getElementById('designPlan')?.open===true);
  await page.getByRole('button',{name:'You choose the remaining details',exact:true}).click();
  await page.click('#buildGamePlan');
  await page.waitForFunction(()=>FG.studio.exportNotebook().sessions.some(s=>s.job?.status==='testing'));
  const ownId=(await current(page)).id;
  assert.equal(submitted,1,'one explicit build has one durable submission');
  assert.equal(opened,0);assert.equal(kept,0);
  await capture(page,'waiting',variant);
  let waitingGameId=ownId;
  const focusedControl=focusedGuide?`#studioGuideCard${focusedGuide==='action'?'Action':'Dismiss'}`:'#studioChange';
  if(!focusedGuide){
   await page.click('#studioNavHome');await page.click('[data-starter="robot"]');
   await page.waitForSelector('.favorite-robot .favorite-canvas');
   waitingGameId=(await current(page)).id;assert.notEqual(waitingGameId,ownId);
  }
  await page.locator(focusedControl).focus();
  phase='ready';
  await page.waitForFunction(id=>FG.studio.exportNotebook().sessions.find(s=>s.id===id)?.job?.status==='ready',ownId);
  assert.equal((await current(page)).id,waitingGameId,'completion does not take the child away from their chosen activity');
  if(focusedGuide)await page.locator('#studioGuideCard[data-guide-tip="ready"]').waitFor({state:'visible'});
  assert.equal(await page.locator(focusedControl).evaluate(node=>document.activeElement===node),true,'completion preserves keyboard focus on the visible control');
  if(!focusedGuide)assert.equal(await page.locator('.favorite-robot .favorite-canvas').isVisible(),true);
  assert.equal(opened,0,'ready notification never opens the private preview automatically');
  const finished=(await notebook(page)).sessions.find(s=>s.id===ownId);
  assert.equal(finished.candidate,null,'the background result cannot select itself');
  assert.equal(finished.remoteId,null,'a ready result cannot keep itself');
  if(focusedGuide==='action'){
   await capture(page,'ready',variant);
   await page.keyboard.press('Enter');
  }else{
   if(focusedGuide==='dismiss'){
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#studioGuideCard').isVisible(),false,'the focused dismissal acts on the current ready hint');
    const preferences=(await notebook(page)).guidance.player1;
    assert.equal(preferences.dismissedTips.includes('ready'),true);
    assert.equal(preferences.dismissedTips.includes('waiting'),false,'the stale waiting hint is never dismissed by the later keypress');
    assert.equal(opened,0);assert.equal(kept,0);
   }
   await page.click('#studioNavHome');
   await capture(page,'ready',variant);
   await page.click('#studioContinuePlaying');
  }
  await page.waitForSelector('#studioRemoteHost iframe');
  await page.waitForFunction(()=>document.getElementById('studioKeep').disabled===false);
  assert.equal((await current(page)).id,ownId,'the next-step recommendation prioritizes the child’s ready creation over the waiting game');
  assert.equal(opened,1,'one visible Play action directly opens the first ready game');
  assert.equal(kept,0,'playing does not imply Keep');
  assert.equal((await current(page)).remoteId,null);
  assert.equal(await page.locator('#studioRemoteHost iframe').getAttribute('sandbox'),'allow-scripts');
  assert.match(await page.textContent('#studioPlayNote'),/mock/,'fixture provenance remains explicit');
  assert.equal(JSON.stringify(await notebook(page)).includes('FIRST_JOURNEY_FIXTURE_ONLY'),false,'preview capabilities never enter saved work');
  await capture(page,'own-game',variant);
  await page.click('#studioKeep');
  await page.waitForFunction(id=>FG.studio.exportNotebook().sessions.find(s=>s.id===id)?.remoteId==='first-revision',ownId);
  assert.equal(kept,1,'only the explicit keep action selects the generated revision');
  await page.click('#studioDoneForNow');await page.locator('#page-studio-library').waitFor({state:'visible'});
  await page.reload();await ready(page);await page.waitForFunction(()=>FG.studio.mode()==='remote');
  await page.click('#studioContinuePlaying');await page.waitForSelector('#studioRemoteHost iframe');
  assert.equal((await current(page)).id,ownId);assert.equal((await current(page)).remoteId,'first-revision');
  assert.equal(submitted,1,'returning never resubmits the generation request');
  assert.equal(kept,1,'returning never repeats Keep');
  assert.deepEqual(errors,[]);
  console.log(`PASS first remote result ${variant}: durable acknowledged build, ${focusedGuide?'focused guide '+focusedGuide:'optional other play'}, no focus theft, ready-first return, direct preview and explicit Keep (synthetic provider only)`);
 }catch(error){await page.screenshot({path:`test-results/first-creation-remote-${variant}-failure.png`,fullPage:true}).catch(()=>{});throw error;}
 finally{await context.close();}
}
async function welcomeSaveFailure(browser,url){
 const {context,page,errors,posts}=await prepare(browser,{width:1280,height:900},'desktop');
 try{
  await page.route('**/factory-config.json',unavailable);await page.goto(url);await ready(page);
  await failWrites(page,true);await page.click('[data-welcome-character="nova"]');
  await page.waitForFunction(()=>document.getElementById('studioWelcomeStatus').textContent.includes('could not be saved'));
  assert.equal(await page.locator('#studioWelcomeMake').isDisabled(),true,'a failed character save cannot advance onboarding');
  assert.equal((await notebook(page)).avatars?.player1,undefined,'failed selection does not invent a saved character');
  assert.equal((await notebook(page)).sessions.length,0,'failed selection creates no work or achievements');
  await failWrites(page,false);await page.click('[data-welcome-character="nova"]');
  await page.waitForFunction(()=>!document.getElementById('studioWelcomeMake').disabled);
  await failWrites(page,true);await page.click('#studioWelcomeMake');
  await page.waitForFunction(()=>document.getElementById('studioWelcomeStatus').textContent.includes('could not open'));
  assert.equal(await page.locator('#studioWelcome').isVisible(),true,'failed continuation stays recoverable');
  assert.equal((await notebook(page)).sessions.length,0);
  await failWrites(page,false);await page.click('#studioWelcomeMake');
  await page.locator('#page-studio').waitFor({state:'visible'});
  assert.equal((await notebook(page)).sessions.length,1,'one successful continuation creates one idea');
  assert.equal((await notebook(page)).avatars.player1,'nova');
  await page.reload();await ready(page);
  assert.equal(await page.locator('#studioWelcome').isVisible(),false);
  assert.deepEqual(posts,[]);assert.deepEqual(errors,[]);
  console.log('PASS welcome recovery: a failed preference write is recoverable without fake dismissal, work or provider calls');
 }finally{await context.close();}
}
async function hintsAcrossModes(browser,url){
 const {context,page,errors,posts}=await prepare(browser,{width:390,height:844},'phone');
 try{
  await page.route('**/factory-config.json',unavailable);
  await page.goto(url+'?creation=1');await ready(page);
  assert.equal(await page.locator('#page-creation').isVisible(),true,'a direct coding entry retains its intended destination');
  await page.click('#creationChallengeMode');
  await page.locator('#creationPracticeGuide').waitFor({state:'visible'});
  const empty=await page.evaluate(()=>FG.creation.export());
  await page.click('#creationPracticeGuideDismiss');
  assert.deepEqual(await page.evaluate(()=>FG.creation.export()),empty,'dismissing navigation help records no challenge attempt, hint usage or scene');
  await page.click('[data-challenge="robot-route"]');
  assert.equal(await page.locator('#creationGuide').isVisible(),false,'the same practice tip remains dismissed in the editor');
  const sceneBefore=await page.evaluate(()=>FG.creation.export());
  await navigate(page,'studioJourneyHelp');await page.click('#studioGuideReset');
  await page.locator('#creationGuide').waitFor({state:'visible'});
  assert.deepEqual(await page.evaluate(()=>FG.creation.export()),sceneBefore,'Show tips again does not edit the program or claim supported/independent evidence');
  await capture(page,'practice-guide','phone');
  await page.click('#creationHome');await exploreWelcome(page);
  await navigate(page,'studioNavRewards');
  await page.locator('#jemsRewardsExplanation').waitFor({state:'visible'});
  assert.match(await page.textContent('#jemsRewardsExplanation'),/gems are not a skill score/,'progress help preserves the distinction between engagement and demonstrated skill');
  const gemsBefore=await page.evaluate(async()=>await FG.rewards.summary());
  await page.click('#jemsRewardsExplanationDismiss');
  assert.deepEqual(await page.evaluate(async()=>await FG.rewards.summary()),gemsBefore,'reading progress guidance cannot earn gems');
  await page.click('#studioNavHome');await page.reload();await ready(page);
  await navigate(page,'studioNavRewards');
  assert.equal(await page.locator('#jemsRewardsExplanation').isVisible(),false,'progress-tip dismissal survives a new visit');
  await choosePlayer(page,1);await exploreWelcome(page);await navigate(page,'studioNavRewards');
  assert.equal(await page.locator('#jemsRewardsExplanation').isVisible(),true,'another child has their own progress explanation');
  assert.equal((await page.evaluate(async()=>await FG.rewards.summary())).lifetimeGems,0);
  assert.deepEqual(posts,[]);assert.deepEqual(errors,[]);
  console.log('PASS context guidance: direct coding entry, persisted practice/reward tips, reversible help and no learning/economy side effects');
 }catch(error){await page.screenshot({path:'test-results/first-creation-context-failure.png',fullPage:true}).catch(()=>{});throw error;}
 finally{await context.close();}
}

(async()=>{
 fs.mkdirSync('test-results',{recursive:true});
 const server=start();let browser;
 try{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox']});
  const url=`http://127.0.0.1:${server.address().port}/arcade/`;
  for(const [device,viewport] of devices){
   await localFirstJourney(browser,url,device,viewport);
   await firstImprovement(browser,url,device,viewport);
   await firstRemoteResult(browser,url,device,viewport);
  }
  await firstRemoteResult(browser,url,'desktop',devices[0][1],'action');
  await firstRemoteResult(browser,url,'phone',devices[1][1],'dismiss');
  await welcomeSaveFailure(browser,url);
  await hintsAcrossModes(browser,url);
  await blockedArtEntry(browser,url);
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
