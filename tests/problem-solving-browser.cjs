/* Production-dist journeys. Explicit fixtures cover storage faults, checkpoint
 * pacing and a mocked narration transport/playback policy; no live provider. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {once}=require('node:events');
const {start}=require('./browser-server.cjs');
const {exploreWelcome,openProfiles}=require('./studio-entry.cjs');
const KEY='family-game-factory-problem-solving-v1';

async function narrationJourney(browser,url){
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,reducedMotion:'reduce'});
 const page=await context.newPage(),requests=[],unexpected=[],errors=[];
 const api='https://aps-narration.test',headers={'Access-Control-Allow-Origin':new URL(url).origin,'Access-Control-Allow-Credentials':'true','Access-Control-Allow-Headers':'Content-Type, X-Factory-Request','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
 let statuses=0;
 page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{
  window.__psAudio=[];window.__psRevoked=[];
  const revoke=URL.revokeObjectURL.bind(URL);URL.revokeObjectURL=url=>{window.__psRevoked.push(url);revoke(url);};
  window.Audio=class {
   preload='';src='';onplaying=null;onended=null;onerror=null;plays=0;paused=false;
   constructor(){window.__psAudio.push(this);}
   async play(){this.plays++;if(this.plays===1)throw new DOMException('Fixture requires another tap','NotAllowedError');}
   pause(){this.paused=true;}
   removeAttribute(){this.src='';}
  };
 });
 await page.route('**/factory-config.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({version:1,mode:'remote',apiBaseUrl:api,previewOrigin:'https://aps-preview.test'})}));
 await page.route(api+'/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname;
  if(request.method()==='OPTIONS'){await route.fulfill({status:204,headers});return;}
  let body={available:false};
  if(path==='/v1/sessions/status')body={connected:true,trusted:true,expiresAt:Date.now()+60000};
  else if(path==='/v1/coach/narration/status'){statuses++;body={available:true,mode:'natural'};}
  else if(path==='/v1/coach/narration'&&request.method()==='POST'){
   requests.push(request.postDataJSON());
   const audio=Buffer.alloc(128);audio.write('ID3');
   await route.fulfill({headers,contentType:'audio/mpeg',body:audio});return;
  }else if(request.method()==='POST')unexpected.push(path);
  await route.fulfill({headers,contentType:'application/json',body:JSON.stringify(body)});
 });
 const tap=selector=>page.locator(selector).tap();
 const draft=()=>page.evaluate(()=>FG.problemSolvingEvidence.backup().factoryProblemSolving.drafts.find(item=>item.episode.owner==='player1'));
 const waiting=()=>page.locator('#psHear').filter({hasText:'Play reading'}).waitFor({state:'visible'});
 try{
  await page.goto(url+'?problem-solving=1');
  await page.waitForFunction(()=>FG.studio?.mode()==='remote'&&FG.problemSolvingEvidence);
  await tap('[data-ps-task="robot-stop-g1-2"]');
  assert.equal((await page.locator('#psHear').textContent()).trim(),'Read this to me');assert.equal(requests.length,0,'installing the reader never synthesizes');
  await tap('#psHear');await waiting();assert.equal(requests.length,1);assert.equal(statuses,1);
  assert.equal((await draft()).episode.observations.length,0,'downloaded audio is not listening evidence');
  await tap('#psHear');
  assert.equal((await page.locator('#psHear').textContent()).trim(),'Stop reading');assert.equal(requests.length,1,'Play reuses the current audio without synthesis');assert.equal(statuses,1);
  assert.equal((await draft()).episode.observations.length,0,'play permission alone is not listening evidence');
  await page.evaluate(()=>window.__psAudio[0].onplaying());
  let support=(await draft()).episode.observations.filter(item=>item.responseId==='narration:predict');
  assert.equal(support.length,1);assert.equal(support[0].support,'access-only');assert.equal(support[0].note,'Read-aloud started during predict.');
  await page.evaluate(()=>window.__psAudio[0].onended());
  assert.equal((await page.locator('#psHear').textContent()).trim(),'Read this to me');assert.equal(await page.locator('#psHear').getAttribute('aria-pressed'),'false');

  await tap('#psHint');const hint=await page.locator('#psHintText').textContent();
  await tap('#psHear');await waiting();assert.equal(requests.length,2);assert.ok(requests[1].text.includes(hint),'the next read includes the visible strategy hint');
  await tap('#psHear');await page.evaluate(()=>window.__psAudio[1].onplaying());await tap('#psHear');
  assert.equal(requests.length,2);assert.equal((await page.locator('#psHear').textContent()).trim(),'Read this to me');
  assert.equal((await draft()).episode.observations.filter(item=>item.responseId==='narration:predict').length,1,'replaying a phase does not duplicate access support');

  await tap('[data-ps-choice="at-gem"]');await tap('#psHear');await waiting();
  assert.equal(requests.length,3);
  await page.evaluate(()=>{window.__psStaleStart=window.__psAudio[2].onplaying;});
  await tap('[data-ps-choice="smaller-steps"]');
  await page.evaluate(()=>window.__psStaleStart());
  assert.equal((await draft()).episode.observations.some(item=>item.responseId==='narration:test'),false,'a changed phase cannot receive late listening support');
  assert.equal(await page.evaluate(()=>window.__psAudio[2].paused&&window.__psAudio[2].src===''),true);

  await tap('#psObserve');await tap('#psHear');await waiting();assert.equal(requests.length,4);
  await page.evaluate(()=>{window.__psStaleStart=window.__psAudio[3].onplaying;});
  await openProfiles(page,target=>target.tap());await page.locator('.profile-choice').nth(1).tap();
  await page.waitForFunction(()=>FG.store.current().id==='player2');await page.evaluate(()=>window.__psStaleStart());
  assert.equal((await draft()).episode.observations.some(item=>item.responseId==='narration:interpret'),false,'waiting audio cannot credit the former profile');
  assert.equal(await page.evaluate(()=>window.__psAudio.every(audio=>audio.paused&&audio.src==='')),true);
  assert.equal(await page.evaluate(()=>window.__psRevoked.length),4,'completion, Stop, phase change and profile change release their audio');
  assert.equal(requests.length,4);assert.equal(statuses,4);assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);
  console.log('PASS APS mocked narration: explicit Read/Play/Stop, one synthesis per read, actual-start evidence, visible hint and phase/profile cleanup');
  return {device:'touch-narration-fixture',status:'passed',syntheticNarrationRequests:requests.length,liveProviderCalls:0};
 }catch(error){await page.screenshot({path:'test-results/problem-solving-narration-failure.png',fullPage:true}).catch(()=>{});throw error;}
 finally{await context.close();}
}

(async()=>{
 const server=start();if(!server.listening)await once(server,'listening');
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(!process.env.CI&&fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']})
  .catch(async error=>{await new Promise(resolve=>server.close(resolve));throw error;});
 fs.mkdirSync('test-results',{recursive:true});const results=[];
 try{
  results.push(await narrationJourney(browser,`http://127.0.0.1:${server.address().port}/arcade/`));
  for(const [device,viewport] of [['desktop',{width:1440,height:1080}],['touch',{width:390,height:844}]]){
   const context=await browser.newContext({viewport,hasTouch:device==='touch',reducedMotion:'reduce',acceptDownloads:true});
   const page=await context.newPage(),errors=[],paid=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
   page.on('request',r=>{if(r.method()==='POST'&&/\/v1\/(jobs|coach)(\/|$)|api\.openai\.com/.test(r.url()))paid.push(r.url());});
   await page.route('**/factory-config.json',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({version:1,mode:'unavailable'})}));
   const activate=async s=>{
    const l=typeof s==='string'?page.locator(s):s;
    if(typeof s==='string'&&/^#(?:studioNav(?:Scenes|Journey|Rewards|Pals|Powers|ProblemSolving)|jemsRewardsWidget|studioJourneyHelp)$/.test(s)&&!await l.isVisible())await activate('#studioNavMenu');
    device==='touch'?await l.tap():await l.click();
   };
   const phase=()=>page.locator('#page-problem-solving').getAttribute('data-phase');
   const saved=()=>page.evaluate(()=>FG.problemSolvingEvidence.list());
   const overflow=async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,device+': no page overflow');
   const onlyPage=async id=>assert.deepEqual(await page.locator('main > .page:visible').evaluateAll(nodes=>nodes.map(node=>node.id)),[id],device+': one active destination');
   const pick=async i=>{await openProfiles(page);await activate(page.locator('.profile-choice').nth(i));await exploreWelcome(page);};
   const parent=()=>activate(page.getByRole('button',{name:'Grown-ups',exact:true}));
   const fault=()=>page.evaluate(()=>{window.psSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.endsWith('family-game-factory-problem-solving-v1'))throw new DOMException('Fixture quota','QuotaExceededError');return window.psSetItem.call(this,k,v);};});
   const unfault=()=>page.evaluate(()=>{Storage.prototype.setItem=window.psSetItem;delete window.psSetItem;});
   try{
    await page.goto(`http://127.0.0.1:${server.address().port}/arcade/?problem-solving=1`);
    await page.waitForSelector('#page-problem-solving:not(.hidden)');
    assert.equal(await page.locator('[data-ps-task]').count(),3);await overflow();
    const rewardsBefore=await page.evaluate(async()=>(await FG.rewards.summary()).lifetimeGems);
    // Journey and practice share the approved shell without retaining a hidden
    // native modal or awarding cosmetic progress for navigation.
    const notebookBefore=await page.evaluate(()=>JSON.stringify(FG.studio.exportNotebook()));
    await activate('#studioNavJourney');await onlyPage('page-jems-journey');
    await activate('#jemsChangeCharacter');assert.equal(await page.locator('#jemsCharacterDialog').evaluate(dialog=>dialog.open),true);
    // A native modal correctly blocks outside clicks. Exercise the public route
    // API to verify that an external destination request closes that top layer.
    await page.evaluate(()=>FG.problemSolving.open());await onlyPage('page-problem-solving');
    assert.equal(await page.locator('#jemsCharacterDialog').evaluate(dialog=>dialog.open),false);
    assert.equal(await page.locator('#studioNavProblemSolving').getAttribute('aria-current'),'page');
    await activate('#studioNavRewards');await onlyPage('page-jems-rewards');
    assert.equal(await page.locator('#studioNavRewards').getAttribute('aria-current'),'page');
    await activate('#studioNavJourney');await onlyPage('page-jems-journey');
    await activate('#studioNavScenes');await onlyPage('page-creation');
    await activate('#studioNavProblemSolving');await onlyPage('page-problem-solving');
    assert.equal(await page.evaluate(()=>document.body.classList.contains('creation-open')),false);
    assert.equal(await page.evaluate(()=>JSON.stringify(FG.studio.exportNotebook())),notebookBefore,'navigation cannot earn or rewrite making evidence');
    if(device==='touch'){
      await page.setViewportSize({width:320,height:740});await overflow();
      const buttons=await page.locator('.studio-nav > button').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};}));
      assert.equal(buttons.length,3);assert.equal(new Set(buttons.map(button=>Math.round(button.y))).size,1,'three primary actions use one mobile row; secondary routes remain in Menu');
      assert.ok(buttons.every(button=>button.width>=44&&button.height>=44&&button.x>=0&&button.x+button.width<=320),'mobile navigation keeps complete touch targets');
      await page.screenshot({path:'test-results/problem-solving-navigation-320.png',fullPage:true});
      await page.setViewportSize(viewport);await overflow();
    }
    await page.screenshot({path:`test-results/problem-solving-shelf-${device}.png`,fullPage:true});
    await activate('[data-ps-task="robot-stop-g1-2"]');assert.equal(await phase(),'predict');
    const beforeFault=await page.evaluate(key=>localStorage.getItem(key),KEY);await fault();
    await activate('[data-ps-choice="at-gem"]');assert.equal(await phase(),'predict');assert.match(await page.locator('#psStatus').textContent(),/Could not save/);
    assert.equal(await page.evaluate(key=>localStorage.getItem(key),KEY),beforeFault);await unfault();
    // An incorrect guess is retained as context, without denying later reasoning opportunities.
    await activate('[data-ps-choice="at-gem"]');assert.equal(await phase(),'test');
    await activate('#studioNavRewards');await onlyPage('page-jems-rewards');
    await activate('#studioNavProblemSolving');await activate('[data-ps-task="robot-stop-g1-2"]');assert.equal(await phase(),'test','Rewards navigation preserves the saved experiment');
    await page.reload();await page.waitForSelector('[data-ps-task="robot-stop-g1-2"]');
    assert.match(await page.locator('[data-ps-task="robot-stop-g1-2"]').textContent(),/Continue/);
    await activate('[data-ps-task="robot-stop-g1-2"]');assert.equal(await phase(),'test');
    // Set the older sibling's grade deliberately; fresh profiles now all start
    // at Grade 1. Leaving must still preserve the first learner's unfinished work.
    await pick(1);await parent();await activate('[data-parent-tab="settings"]');
    await page.selectOption('#parentGrade','3');await activate('#saveParent');
    assert.equal(await page.evaluate(()=>FG.store.current().grade),3);
    await activate('#studioNavProblemSolving');assert.equal(await page.locator('[data-ps-task="robot-stop-g3-4"]').count(),1);assert.equal((await saved()).length,0);
    await pick(0);await activate('#studioNavProblemSolving');await activate('[data-ps-task="robot-stop-g1-2"]');assert.equal(await phase(),'test');
    await activate('[data-ps-choice="smaller-steps"]');assert.equal(await phase(),'result');await overflow();
    const rover=await page.locator('.ps-rover svg').boundingBox(),gem=await page.locator('.ps-track-gem').boundingBox(),goal=await page.locator('.ps-track-spot.is-goal').boundingBox(),world=await page.locator('.ps-robot-world').boundingBox();
    assert.ok(rover&&rover.width>=40&&rover.height>=50,device+': visible robot character');
    assert.ok(gem&&goal&&world&&gem.y>=goal.y+goal.height-1&&gem.y+gem.height<=world.y+world.height+1,device+': goal gem remains visible below its tile');
    await page.screenshot({path:`test-results/problem-solving-result-${device}.png`,fullPage:true});
    await activate('#psObserve');await activate('[data-ps-choice="at-gem"]');
    await activate('[data-ps-choice="old-plan"]');assert.equal(await phase(),'finished');
    await activate('#psReviseAgain');await activate('#psHint');await activate('[data-ps-choice="small-steps"]');await activate('#psFinish');
    const records=await saved();assert.equal(records.length,1);const first=records[0];
    assert.equal(first.observations.find(o=>o.responseId==='predict:at-gem').outcome,'unobserved');
    assert.equal(first.observations.find(o=>o.skill==='plan_test'&&o.outcome!=='unobserved').outcome,'demonstrated');
    const revisions=first.observations.filter(o=>o.skill==='revise'&&o.outcome!=='unobserved');assert.deepEqual(revisions.map(o=>o.outcome),['not-yet','demonstrated']);assert.deepEqual(revisions.map(o=>o.support),['none-observed','strategy']);
    assert.equal(first.task.exposure,'first-seen');
    await activate('[data-ps-task="robot-stop-g1-2"]');await activate('[data-ps-choice="past-gem"]');await activate('#psHint');await activate('[data-ps-choice="smaller-steps"]');await activate('#psObserve');await activate('[data-ps-choice="at-gem"]');await activate('[data-ps-choice="small-steps"]');await activate('#psFinish');
    assert.equal((await saved())[1].task.exposure,'repeat');
    assert.equal(await page.evaluate(async()=>(await FG.rewards.refresh()).lifetimeGems),rewardsBefore,'formative observations do not silently create a new reward policy');
    await parent();await page.waitForSelector('#parentDashboard');
    await activate('#parentTab-skills');await page.getByRole('combobox',{name:'Filter skills by learning area',exact:true}).selectOption('problem-solving');
    await page.getByRole('combobox',{name:'Filter skills by evidence',exact:true}).selectOption('all');
    assert.equal(await page.locator('#parentPanel-skills [data-parent-skill]').count(),6,'the native report keeps all six problem-solving dimensions');
    for(const skill of ['define_problem','compare_options','transfer'])assert.match(await page.locator(`[data-parent-skill="${skill}"]`).textContent(),/Not observed in this period/,'an unsampled dimension is not a failure');
    assert.match(await page.locator('#parentPanel-skills').textContent(),/not aptitude or mastery scores/);
    await activate('#parentTab-evidence');await page.getByRole('combobox',{name:'Filter evidence by learning area',exact:true}).selectOption('problem-solving');
    assert.match(await page.locator('#problemSolvingEvidenceNote').textContent(),/not standardized scores/);
    assert.equal(await page.locator('#parentPanel-evidence .pd-evidence').count(),6,'the journal retains the first scored decision per skill and episode');
    const firstRevision=page.locator(`[data-evidence-id="problem-solving:${first.id}:revise"]`);
    await activate(firstRevision.locator('summary'));assert.match(await firstRevision.innerText(),/Another approach to explore/);
    const provenance=await firstRevision.locator('.pd-provenance').evaluate(list=>Object.fromEntries([...list.querySelectorAll('dt')].map(label=>[label.textContent,label.nextElementSibling.textContent])));
    assert.equal(provenance.Authorship,'learner');assert.equal(provenance['Help type'],'none-observed','later hinted revision does not rewrite the earlier observation');
    assert.match(await page.locator('#parentPanel-evidence').textContent(),/Strategy help recorded/);
    await overflow();await page.screenshot({path:`test-results/problem-solving-parent-${device}.png`,fullPage:true});

    // Existing learning controls still own their source score, and the new route cannot skip an open question.
    await activate('#studioNavPowers');if(await page.locator('#lab-next').isVisible())await activate('#lab-next');
    await page.waitForSelector('.math-activity');assert.equal(await page.evaluate(()=>FG.learning.active),true);
    const attemptId=await page.evaluate(()=>FG.learning.activeAttemptId);
    for(const destination of ['#studioNavJourney','#studioNavRewards','#jemsRewardsWidget','#studioNavProblemSolving','#studioNavScenes','#studioNavCreate','#studioNavPowers']){
      await activate(destination);await onlyPage('page-lab');
      assert.equal(await page.evaluate(()=>FG.learning.active),true,destination+': keeps the active learning activity');
      assert.equal(await page.evaluate(()=>FG.learning.activeAttemptId),attemptId,destination+': preserves the same answer opportunity');
    }
    const item=await page.evaluate(()=>FG.learning.activeItem);
    if(item.answerKind==='choice'){
      const choices=page.locator('.math-activity:visible [data-value]'),values=await choices.evaluateAll(nodes=>nodes.map(n=>n.dataset.value));
      const index=values.indexOf(String(item.answer));assert.ok(index>=0);await activate(choices.nth(index));
    }
    else{
      const activity=page.locator('.math-activity:visible'),write=activity.getByRole('button',{name:'Write an answer',exact:true});
      if(await write.isVisible())await activate(write);
      await activity.locator('.math-answer-input').fill(String(item.answer));await activate(activity.getByRole('button',{name:'Check answer',exact:true}));
    }
    await page.waitForFunction(()=>!FG.learning.active);
    assert.equal((await saved()).filter(e=>e.source==='math').length,1);
    assert.ok((await saved()).filter(e=>e.source==='math').every(e=>e.kind==='context-only'&&e.observations.length===0));

    // Scene result capture is context-only and rechecking the same saved version is idempotent.
    await page.evaluate(()=>{FG.store.changeProfile({rate:1});FG.store.current().mathWindow=[Date.now()];FG.store.save();});
    await activate('#studioNavScenes');await activate('#creationChallengeMode');await activate('[data-challenge="robot-route"]');await activate('#creationCheck');
    const sceneRecords=(await saved()).filter(e=>e.source==='creation');assert.equal(sceneRecords.length,1);assert.equal(sceneRecords[0].kind,'context-only');
    await activate('#creationCheck');assert.equal((await saved()).filter(e=>e.source==='creation').length,1);

    // Existing family backup includes the evidence key and restores it transactionally.
    await parent();await activate('#parentTab-settings');const downloadWait=page.waitForEvent('download');await activate('#exportData');const download=await downloadWait,backup=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
    assert.equal(backup.factoryProblemSolving.schema,'jems.problem-solving.workspace.v1');
    assert.equal(backup.factoryRewards.schema,'jems.rewards.backup.v1','one family backup preserves both observations and shared rewards');
    const backedUpGems=await page.evaluate(async()=>(await FG.rewards.summary()).lifetimeGems);
    const beforeRestore=await page.evaluate(key=>localStorage.getItem(key),KEY);
    const corrupt={...backup,factoryProblemSolving:{schema:'future'}};
    await page.locator('#importData').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(corrupt))});
    await page.waitForFunction(()=>!document.getElementById('importData').value);assert.equal(await page.evaluate(key=>localStorage.getItem(key),KEY),beforeRestore);
    await activate('#clearProblemSolving');assert.equal((await saved()).length,0);
    assert.equal(await page.evaluate(async()=>(await FG.rewards.summary()).lifetimeGems),backedUpGems,'clearing observations does not erase engagement rewards');
    const navigation=page.waitForNavigation();await page.locator('#importData').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});await navigation;
    await page.waitForFunction(()=>FG.problemSolvingEvidence&&FG.studio);assert.equal((await saved()).length,backup.factoryProblemSolving.episodes.length);
    assert.equal(await page.evaluate(async()=>(await FG.rewards.summary()).lifetimeGems),backedUpGems);
    assert.equal(await page.evaluate(()=>Object.hasOwn(FG.store.data,'factoryProblemSolving')),false,'no duplicated ledger in profile blob');
    await pick(1);await parent();assert.equal((await saved()).length,0);
    await activate('#parentTab-evidence');await page.getByRole('combobox',{name:'Filter evidence by learning area',exact:true}).selectOption('problem-solving');
    assert.equal(await page.locator('#parentPanel-evidence .pd-evidence').count(),0,'the native journal never shows another learner’s observations');
    assert.match(await page.locator('#parentPanel-evidence').textContent(),/No examples in this view yet/);
    assert.deepEqual(errors,[]);assert.deepEqual(paid,[]);results.push({device,status:'passed',episodes:backup.factoryProblemSolving.episodes.length});
   }finally{await context.close();}
  }
  fs.writeFileSync('test-results/problem-solving-browser.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1;});
