const { chromium }=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {start}=require('./browser-server.cjs');
(async()=>{
 const server=start(),browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(!process.env.CI&&fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']});
 fs.mkdirSync('test-results',{recursive:true});
 try{
 for(const [device,viewport] of [['desktop',{width:1280,height:900}],['mobile',{width:375,height:812}]]){
  const context=await browser.newContext({viewport,hasTouch:device==='mobile',reducedMotion:'reduce'}),page=await context.newPage(),errors=[],jobRequests=[];page.on('request',r=>{if(r.url().includes('/v1/jobs'))jobRequests.push(r.url())});
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',dialog=>dialog.accept());
  await page.goto(`http://127.0.0.1:${server.address().port}/arcade/?arcade=1`);await page.waitForFunction(()=>window.FG?.factory&&window.FG?.builder);
  const nav=async(name)=>page.getByRole('navigation').getByRole('button',{name,exact:true}).click();
  // Seed real legacy progress before remixing. A recent-question budget isolates
  // editor/history behavior while mandatory math remains enabled at rate 1.
  const original=await page.evaluate(()=>{FG.store.current().skills['mul:8x4']={tries:3,right:2,hints:1,streak:1,last:'2026-11-14T00:00:00Z'};FG.store.changeProfile({rate:1});FG.store.current().mathWindow=[Date.now()];FG.store.save();return JSON.stringify({skills:FG.store.current().skills,focus:FG.store.current().focus,age:FG.store.current().age,intensity:FG.store.current().intensity})});
  await nav('Remix');await page.click('#newLiveGame');
  const snapshot=()=>page.evaluate(()=>FG.runtime.snapshot());
  const ready=async()=>{for(let i=0;i<3;i++)await page.locator('#go').click()};
  const round=async()=>{if((await snapshot()).state.mode==='title')await ready();await page.locator('#go').click();await page.waitForFunction(()=>FG.runtime.snapshot().state.mode==='result');await page.locator('#go').click();await page.waitForSelector('#resultNext');await page.click('#returnLive');};
  await page.click('#livePlay');assert.equal((await snapshot()).state.bucketCount,3);await round();assert.match(await page.textContent('#coachEvidence'),/level 1 after/);assert.match(await page.textContent('#coachQuestion'),/notice/);
  await page.fill('#coachAnswer','I got splashed');await page.click('#coachForm button[type=submit]');assert.match(await page.textContent('#coachQuestion'),/next change/);await page.fill('#coachAnswer','More buckets might be harder');await page.click('#coachForm button[type=submit]');
  const changes=[['Give me four buckets','bucketCount',4],['Show the safe bucket','revealSafe',true],['Make the splash last 0.4 seconds','splashMs',400],['Hide the safe bucket','revealSafe',false],['Give me two buckets','bucketCount',2]];
  for(const [i,[prompt,key,expected]] of changes.entries()){
    await page.fill('#livePrompt',prompt);await page.click('#livePromptForm button[type=submit]');await page.waitForSelector('#page-game:not(.hidden)');
    const state=await snapshot();assert.equal(state.config[key],expected);assert.equal(state.state[key],expected);assert.equal(state.state.bucketCount,state.config.bucketCount);

    await round(); // The configured splash animation is timed deterministically below.
    if(i===0)assert.match(await page.textContent('#coachEvidence'),/More buckets might be harder.*not proof/);
    await page.click('#coachSkip');assert.equal(await page.locator('#coachForm').isVisible(),false);
  }
  assert.equal(await page.locator('#compareVersion option').count(),6);await page.click('#liveKeep');assert.match(await page.textContent('#liveStatus'),/pinned/);
  // Compare and play an earlier version without modifying current head.
  await page.locator('#versionTools').evaluate(el=>el.open=true);
  const options=await page.locator('#compareVersion option').evaluateAll(os=>os.map(o=>o.value));await page.selectOption('#compareVersion',options[1]);assert.match(await page.textContent('#liveCompare tbody'),/Number of buckets42/);
  await page.click('#playCompare');assert.equal((await snapshot()).state.bucketCount,4);await page.click('#returnLive');
  await page.click('#liveUndo');assert.match(await page.textContent('#liveMechanics'),/Number of buckets: 4/);
  // New alternate future after undo, old fifth change retained.
  await page.fill('#livePrompt','Give me five buckets');await page.click('#livePromptForm button[type=submit]');assert.equal((await snapshot()).state.bucketCount,5);await page.click('#returnLive');assert.equal(await page.locator('#compareVersion option').count(),7);
  // Unsupported text is never run, never interpreted as partial success.
  for(const prompt of ['Give me four buckets and add flying unicorns','Build a new skateboard game','<script>alert(1)</script>','Give me 99 buckets']){
    await page.fill('#livePrompt',prompt);await page.click('#livePromptForm button[type=submit]');assert.equal(await page.locator('#liveTry').isVisible(),false);assert.match(await page.textContent('#liveMechanics'),/Number of buckets: 5/);
  }
  assert.match(await page.textContent('#builderStatus'),/Needs builder.*No job was queued/);assert.deepEqual(jobRequests,[]);
  await page.fill('#forkName',`Donut Splash ${device}`);await page.click('#liveForkForm button[type=submit]');await page.reload();await page.waitForFunction(()=>window.FG?.factory&&window.FG?.builder);await nav('My Creations');await page.getByRole('button',{name:`Donut Splash ${device}`,exact:true}).click();assert.match(await page.textContent('#liveMechanics'),/Number of buckets: 5/);await page.click('#livePlay');assert.equal((await snapshot()).state.bucketCount,5);await page.click('#returnLive');
  const after=await page.evaluate(()=>JSON.stringify({skills:FG.store.current().skills,focus:FG.store.current().focus,age:FG.store.current().age,intensity:FG.store.current().intensity}));assert.equal(after,original);
  // Full backups round-trip exactly. A missing optional domain replaces it with
  // an empty workspace, and restores finish by reloading fresh in-memory state.
  await page.getByRole('button',{name:'Grown-ups',exact:true}).click();await page.locator('[data-parent-tab="settings"]').click();const downloadPromise=page.waitForEvent('download');await page.click('#exportData');const download=await downloadPromise,backup=JSON.parse(fs.readFileSync(await download.path(),'utf8'));assert.equal(backup.factoryWorkspace.version,2);const workspaceBefore=JSON.stringify(backup.factoryWorkspace);
  const rewardCounts=()=>page.evaluate(async()=>{const summary=await FG.rewards.refresh();return {gems:summary.lifetimeGems,grants:summary.totalGrants};});
  const rewardsBefore=await rewardCounts();
  const importBackup=async(name,value)=>{
   await page.getByRole('button',{name:'Grown-ups',exact:true}).click();
   await page.locator('[data-parent-tab="settings"]').click();
   await Promise.all([
    page.waitForNavigation({waitUntil:'load'}),
    page.setInputFiles('#importData',{name,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))})
   ]);
   await page.waitForFunction(()=>window.FG?.factory&&window.FG?.builder);
  };
  await importBackup('combined.json',backup);
  assert.equal(await page.evaluate(()=>JSON.stringify(FG.factory.exportWorkspace())),workspaceBefore);
  assert.deepEqual(await rewardCounts(),rewardsBefore,'restoring saved work cannot mint phantom rewards');
  const oldBackup=structuredClone(backup);delete oldBackup.factoryWorkspace;
  await importBackup('old-v1.json',oldBackup);
  assert.deepEqual(await page.evaluate(()=>FG.factory.exportWorkspace()),{version:2,projects:[],revisions:[],plays:[]},'a missing workspace domain is replaced with an empty workspace');
  assert.deepEqual(await rewardCounts(),rewardsBefore,'missing-domain replacement cannot create reward grants');
  await importBackup('combined-again.json',backup);
  assert.equal(await page.evaluate(()=>JSON.stringify(FG.factory.exportWorkspace())),workspaceBefore,'restore the complete workspace before testing its privacy and quota behavior');
  assert.deepEqual(await rewardCounts(),rewardsBefore,'repeated restoration cannot duplicate rewards');
  await nav('Remix');
  // Saved fork is private to the active pseudonymous profile on this browser.
  await page.locator('.profile-choice').nth(1).click();assert.equal(await page.locator('#liveEditor').isVisible(),false);await page.locator('.profile-choice').first().click();assert.equal(await page.locator('#liveEditor').isVisible(),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.locator('#liveFactory').screenshot({path:`test-results/live-remix-${device}.png`});
  // Quota failure preserves both durable and in-memory head; typed draft still visible.
  const before=await page.evaluate(()=>JSON.stringify(FG.factory.exportWorkspace()));await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw Error('full')}});
  await page.fill('#livePrompt','Give me two buckets');await page.click('#livePromptForm button[type=submit]');assert.match(await page.textContent('#liveStatus'),/Could not save/);assert.equal(await page.evaluate(()=>JSON.stringify(FG.factory.exportWorkspace())),before);assert.equal(await page.inputValue('#livePrompt'),'Give me two buckets');
  assert.deepEqual(errors,[]);console.log(`PASS ${device}: five real mutations, outcomes/coach, compare, undo/DAG, fork/reload, profile/math isolation, rejected edits, quota safety`);await context.close();
 }
 // Other plugin manifests drive real engine state, not cosmetic labels.
 const pluginPage=await browser.newPage(),pluginErrors=[];pluginPage.on('pageerror',error=>pluginErrors.push(error.message));await pluginPage.clock.install({time:new Date('2026-11-16T08:00:00Z')});await pluginPage.goto(`http://127.0.0.1:${server.address().port}/arcade/?arcade=1`);await pluginPage.waitForFunction(()=>window.FG?.factory&&window.FG?.builder);await pluginPage.getByRole('navigation').getByRole('button',{name:'Remix',exact:true}).click();
 for(const [game,prompt,key,expected] of [['gum','Give me 2 extra silly pieces','placed',{}],['dragon','Give the island 120 resilience','islandHP',120]]){
  await pluginPage.selectOption('#liveGame',game);await pluginPage.click('#newLiveGame');await pluginPage.fill('#livePrompt',prompt);await pluginPage.click('#livePromptForm button[type=submit]');if(game==='dragon'){await pluginPage.waitForFunction(()=>FG.runtime.snapshot().state.assets===22);await pluginPage.locator('#startBtn').click();}if(game==='gum'){const s=await pluginPage.evaluate(()=>FG.runtime.snapshot());assert.equal(s.config.qualityVersion,3);assert.equal(s.config.extraDecoys,2);assert.deepEqual(s.state.placed,{});assert.equal(s.state.availableChoices.length,5);assert.equal(await pluginPage.locator('[data-gum-part]').count(),5);}else assert.equal(await pluginPage.evaluate(k=>FG.runtime.snapshot().state[k],key),expected);await pluginPage.click('#returnLive');
 }
 // Pause while no game is active before manually advancing time. In Playwright
 // 1.56.1, a pending realtime tick can otherwise undo a fastForward advancement.
 await pluginPage.clock.pauseAt(new Date('2026-11-16T10:00:00Z'));
 // Native Splash uses title → hero → intro → play. A splash is a visual outcome;
 // the optional Original Challenge ends a run after a wrong math answer.
 // Explicit configs must opt into originalRules; an omitted flag preserves the
 // simplified adapter for compatible older saved games.
 const checkpointState=()=>pluginPage.evaluate(()=>{
  const profile=FG.store.current(),overlay=document.getElementById('stage-overlay'),now=Date.now(),mathWindow=[...(profile.mathWindow||[])];
  return {now,rate:profile.rate,mathWindow,elapsedSinceLast:mathWindow.length?now-mathWindow.at(-1):null,
   eligible:FG.math.canAsk(profile),active:FG.learning.active,activeAttemptId:FG.learning.activeAttemptId,
   native:FG.runtime.snapshot(),overlayHidden:overlay.classList.contains('hidden'),overlayText:overlay.textContent.slice(0,600),
   attempts:(profile.learning?.attempts||[]).slice(-4).map(attempt=>({id:attempt.id,outcome:attempt.outcome,answers:attempt.answers.length,correct:attempt.correct,independent:attempt.independent}))};
 });
 const advanceNativeBudget=async()=>{
  const before=await checkpointState();
  assert.equal(before.active,false,'Only advance pacing between completed math activities');
  await pluginPage.clock.fastForward(80_000);
  const after=await checkpointState();
  assert.equal(after.now-before.now,80_000,'The controlled clock must advance the full spacing interval');
  assert.deepEqual(after.mathWindow,before.mathWindow,'Advancing time must retain the previous questions');
  assert.equal(after.eligible,true,'The next native question must satisfy the real shared pacing policy');
 };
 const nativeRound=async(label)=>{
  try{
  assert.equal(await pluginPage.evaluate(()=>FG.runtime.snapshot().config.originalRules),true,'This regression must exercise the restored native Splash adapter');
  for(let i=0;i<3;i++){
   const mode=await pluginPage.evaluate(()=>FG.runtime.snapshot().state.mode);
   if(!['title','hero','intro'].includes(mode))break;
   await pluginPage.locator('#go').click();
  }
  assert.equal(await pluginPage.evaluate(()=>FG.runtime.snapshot().state.mode),'play');
  await pluginPage.locator('#go').click();
  // The restored native Splash uses requestAnimationFrame with capped frame
  // deltas. A single 3.5s fake-clock jump need not simulate 3.5s of frames,
  // especially when CI is busy. Advance bounded frames until the real game
  // reaches its result; never mutate its state or bypass the math checkpoint.
  let reached=false;
  for(let step=0;step<32;step++){
   await pluginPage.clock.runFor(500);
   if(await pluginPage.evaluate(()=>FG.runtime.snapshot().state.mode==='result')){reached=true;break;}
  }
  assert.equal(reached,true,`${label}: native Splash must reach its result through actual animation frames: ${JSON.stringify({...await checkpointState(),pluginErrors})}`);
  const before=await checkpointState();
  console.log(`[native-checkpoint:${label}]`,JSON.stringify({now:before.now,rate:before.rate,elapsedSinceLast:before.elapsedSinceLast,eligible:before.eligible,active:before.active,mode:before.native.state.mode,attempts:before.attempts,pluginErrors}));
  assert.equal(before.eligible,true,`${label} must respect the shared pacing policy: ${JSON.stringify({...before,pluginErrors})}`);
  assert.equal(before.active,false,`${label} cannot start with a leaked active question: ${JSON.stringify({...before,pluginErrors})}`);
  await pluginPage.locator('#go').click();
  try{
   // Native completion is synchronous. Report a policy skip or mounting error
   // directly instead of hiding the state behind a missing-question timeout.
   await pluginPage.waitForSelector('#stage-overlay .math-activity, #stage-overlay #resultNext',{timeout:5000});
  }catch(error){
   throw new Error(`${label} did not show math or a result: ${JSON.stringify({...await checkpointState(),pluginErrors})}`,{cause:error});
  }
  assert.equal(await pluginPage.locator('#stage-overlay .math-activity').isVisible(),true,`${label} skipped or failed shared math: ${JSON.stringify({...await checkpointState(),pluginErrors})}`);
  }catch(error){
   const stem=`test-results/native-checkpoint-${label.toLowerCase().replace(/\W+/g,'-')}`;
   fs.writeFileSync(`${stem}.json`,JSON.stringify({label,...await checkpointState(),pluginErrors},null,2));
   await pluginPage.screenshot({path:`${stem}.png`}).catch(()=>{});
   throw error;
  }
 };
 const answerNative=async(correct)=>{
  const item=await pluginPage.evaluate(()=>FG.learning.activeItem);assert.ok(item,'Native round must present shared math');
  const activity=pluginPage.locator('#stage-overlay .math-activity');
  if(item.answerKind==='choice'){
   const choice=item.choices.find(option=>correct?option.value===String(item.answer):option.value!==String(item.answer));assert.ok(choice);
   await activity.getByRole('button',{name:choice.label,exact:true}).click();
  }else{
   await activity.getByRole('textbox',{name:'Math answer',exact:true}).fill(correct?String(item.answer):'-999');
   await activity.getByRole('button',{name:'Check answer',exact:true}).click();
  }
 };
 // Measure the matching native remix adapter, not intro clicks or editor travel.
 // original-buckets.js scales only the drop by 1900/splashMs; a dirty drop has a
 // 3.42s animation threshold. Choose that outcome through the real arrow control
 // so both configurations measure the same drop, after the fixed suspense.
 const measureSplashDrop=async(splashMs)=>{
  const state=await pluginPage.evaluate(()=>FG.runtime.snapshot());
  assert.equal(state.config.originalRules,true);
  assert.equal(state.config.splashMs,splashMs);assert.equal(state.state.splashMs,splashMs);
  for(let step=0;step<3;step++){
   const mode=await pluginPage.evaluate(()=>FG.runtime.snapshot().state.mode);
   if(!['title','hero','intro'].includes(mode))break;
   await pluginPage.locator('#go').click();
  }
  assert.equal(await pluginPage.evaluate(()=>FG.runtime.snapshot().state.mode),'play');
  if(await pluginPage.evaluate(()=>{const s=FG.runtime.snapshot().state;return s.selection===s.safe;}))await pluginPage.locator('#right').click();
  assert.equal(await pluginPage.evaluate(()=>{const s=FG.runtime.snapshot().state;return s.selection!==s.safe;}),true,'both timing samples use a real non-safe bucket choice');
  await pluginPage.locator('#go').click();
  assert.equal(await pluginPage.evaluate(()=>FG.runtime.snapshot().state.mode),'suspense');
  const advanceTo=async(mode,limit)=>{
   let elapsed=0;
   while(await pluginPage.evaluate(()=>FG.runtime.snapshot().state.mode)!==mode&&elapsed<limit){await pluginPage.clock.runFor(100);elapsed+=100;}
   assert.equal(await pluginPage.evaluate(()=>FG.runtime.snapshot().state.mode),mode,`${splashMs}ms config must reach ${mode} through bounded real animation frames`);
   return elapsed;
  };
  await advanceTo('drop',3000);
  const dropMs=await advanceTo('result',4000);
  const needsMath=await pluginPage.evaluate(()=>FG.math.canAsk(FG.store.current()));
  await pluginPage.locator('#go').click();
  await pluginPage.waitForSelector('#stage-overlay .math-activity, #stage-overlay #resultNext',{timeout:5000});
  assert.equal(await pluginPage.evaluate(()=>FG.learning.active),needsMath,'timing samples still respect the shared learning checkpoint policy');
  if(needsMath){await answerNative(true);await pluginPage.clock.runFor(500);}
  await pluginPage.waitForSelector('#resultNext');
  assert.equal(await pluginPage.evaluate(()=>FG.learning.active),false,'finish required practice before leaving the timing round');
  await pluginPage.click('#returnLive');
  return dropMs;
 };
 await pluginPage.evaluate(()=>FG.learning.setMode('buckets','checkpoint'));
 await pluginPage.selectOption('#liveGame','buckets');await pluginPage.click('#newLiveGame');await pluginPage.click('#livePlay');
 const defaultDrop=await measureSplashDrop(1900);
 await pluginPage.fill('#livePrompt','Make the splash last 0.4 seconds');await pluginPage.click('#livePromptForm button[type=submit]');
 const fasterDrop=await measureSplashDrop(400);
 assert.ok(defaultDrop>=3000&&defaultDrop<=3600,`default dirty drop should take about 3.42s of animation time, measured ${defaultDrop}ms`);
 assert.ok(fasterDrop>=500&&fasterDrop<=900,`400ms configuration should scale the dirty drop to about 720ms, measured ${fasterDrop}ms`);
 assert.ok(fasterDrop*3<defaultDrop,'the real 400ms remix must animate over three times faster than the default 1900ms drop');
 console.log(`PASS native splash timing: default 1900ms config = ${defaultDrop}ms drop; remixed 400ms config = ${fasterDrop}ms drop; real result and learning checkpoints retained`);
 await pluginPage.evaluate(()=>{Math.random=()=>0;FG.store.changeProfile({rate:8,punish:true});FG.learning.setMode('buckets','checkpoint');FG.app.openGame('buckets',{config:{originalRules:true,bucketCount:3,revealSafe:false,splashMs:400}})});
 await advanceNativeBudget(); // Apply the existing rate-8 pacing policy before its challenge sequence.
 await nativeRound('Original Challenge incorrect');await answerNative(false);await pluginPage.waitForSelector('#resultNext');assert.match(await pluginPage.textContent('#resultNext'),/Retry/);
 await pluginPage.click('#resultNext');assert.equal(await pluginPage.evaluate(()=>FG.runtime.snapshot().state.level),1);
 await advanceNativeBudget(); // Respect spacing while the retry is still on its intro screen.
 await nativeRound('Original Challenge correct');await answerNative(true);await pluginPage.clock.runFor(500);
 await pluginPage.waitForSelector('#resultNext');assert.match(await pluginPage.textContent('#resultNext'),/Next/);
 await advanceNativeBudget(); // Advance the budget while the game is still at its result.
 await pluginPage.click('#resultNext');assert.equal(await pluginPage.evaluate(()=>FG.runtime.snapshot().state.level),2);

 // Answer and change games in one browser task so navigation always precedes
 // the 450 ms completion callback, regardless of CI transport scheduling.
 await pluginPage.evaluate(()=>{FG.store.changeProfile({punish:false});FG.app.openGame('buckets',{config:{originalRules:true,bucketCount:3,revealSafe:false,splashMs:400}})});
 await nativeRound('Practice before navigation');
 await pluginPage.evaluate(()=>{
  const item=FG.learning.activeItem,activity=document.querySelector('#stage-overlay .math-activity');
  if(!item||!activity)throw Error('A shared math activity is required for the stale-callback regression');
  if(item.answerKind==='choice'){
   const button=Array.from(activity.querySelectorAll('.math-choice-grid button')).find(button=>button.dataset.value===String(item.answer));
   if(!button)throw Error('The correct choice must be present');button.click();
  }else{
   activity.querySelector('.math-answer-input').value=String(item.answer);activity.querySelector('form').requestSubmit();
  }
  if(activity.querySelector('.math-feedback').dataset.state!=='correct')throw Error('The UI must accept the answer before navigation');
  FG.app.openGame('gum');
 });
 await pluginPage.clock.runFor(700);assert.equal(await pluginPage.locator('#stage-overlay').isVisible(),false);assert.equal(await pluginPage.locator('#game-mount').evaluate(node=>node.inert),false,'A new game must not retain the previous math overlay’s input lock');assert.ok(await pluginPage.locator('[data-gum-part]').count(),'assembly controls recover after mandatory math');
 assert.deepEqual(pluginErrors,[]);await pluginPage.close();
 // Legacy workspace migration in browser; failed/corrupt load never replaces stored source.
 const page=await browser.newPage();await page.addInitScript(()=>{localStorage.setItem('family-game-factory-workspace-v2',JSON.stringify({version:1,games:[{id:'old-game',owner:'player1',game:'buckets',name:'Migrated Splash',config:{bucketCount:2,revealSafe:true,splashMs:400}}]}))});await page.goto(`http://127.0.0.1:${server.address().port}/arcade/?arcade=1`);await page.waitForFunction(()=>window.FG?.factory&&window.FG?.builder);await page.getByRole('navigation').getByRole('button',{name:'Remix',exact:true}).click();assert.match(await page.textContent('#liveName'),/Migrated Splash/);await page.click('#livePlay');assert.equal((await page.evaluate(()=>FG.runtime.snapshot())).state.bucketCount,2);await page.close();
 }finally{await browser.close();server.close()}
})().catch(err=>{console.error(err);process.exitCode=1});
