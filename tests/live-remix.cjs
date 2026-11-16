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
  await page.goto(`http://127.0.0.1:${server.address().port}/arcade/`);await page.waitForFunction(()=>window.FG?.factory&&window.FG?.builder);
  const nav=async(name)=>page.getByRole('navigation').getByRole('button',{name,exact:true}).click();
  // Seed real legacy progress before remixing. A recent-question budget isolates
  // editor/history behavior while mandatory math remains enabled at rate 1.
  const original=await page.evaluate(()=>{FG.store.current().skills['mul:8x4']={tries:3,right:2,hints:1,streak:1,last:'2026-11-14T00:00:00Z'};FG.store.changeProfile({rate:1});FG.store.current().mathWindow=[Date.now()];FG.store.save();return JSON.stringify({skills:FG.store.current().skills,focus:FG.store.current().focus,age:FG.store.current().age,intensity:FG.store.current().intensity})});
  await nav('🎛️ Remix');await page.click('#newLiveGame');
  const snapshot=()=>page.evaluate(()=>FG.runtime.snapshot());
  const ready=async()=>{for(let i=0;i<3;i++)await page.locator('#go').click()};
  const round=async()=>{if((await snapshot()).state.mode==='title')await ready();await page.locator('#go').click();await page.waitForFunction(()=>FG.runtime.snapshot().state.mode==='result');await page.locator('#go').click();await page.waitForSelector('#resultNext');await page.click('#returnLive');};
  await page.click('#livePlay');assert.equal((await snapshot()).state.bucketCount,3);await round();assert.match(await page.textContent('#coachEvidence'),/level 1 after/);assert.match(await page.textContent('#coachQuestion'),/notice/);
  await page.fill('#coachAnswer','I got splashed');await page.click('#coachForm button[type=submit]');assert.match(await page.textContent('#coachQuestion'),/next change/);await page.fill('#coachAnswer','More buckets might be harder');await page.click('#coachForm button[type=submit]');
  const changes=[['Give me four buckets','bucketCount',4],['Show the safe bucket','revealSafe',true],['Make the splash last 0.4 seconds','splashMs',400],['Hide the safe bucket','revealSafe',false],['Give me two buckets','bucketCount',2]];
  for(const [i,[prompt,key,expected]] of changes.entries()){
    await page.fill('#livePrompt',prompt);await page.click('#livePromptForm button[type=submit]');await page.waitForSelector('#page-game:not(.hidden)');
    const state=await snapshot();assert.equal(state.config[key],expected);assert.equal(state.state[key],expected);assert.equal(state.state.bucketCount,state.config.bucketCount);

    const began=Date.now();await round();if(key==='splashMs')assert.ok(Date.now()-began<5000,'splash duration must really change');
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
  await page.fill('#forkName',`Donut Splash ${device}`);await page.click('#liveForkForm button[type=submit]');await page.reload();await page.waitForFunction(()=>window.FG?.factory&&window.FG?.builder);await nav('🎨 My Creations');await page.getByRole('button',{name:`🎮 Donut Splash ${device}`,exact:true}).click();assert.match(await page.textContent('#liveMechanics'),/Number of buckets: 5/);await page.click('#livePlay');assert.equal((await snapshot()).state.bucketCount,5);await page.click('#returnLive');
  const after=await page.evaluate(()=>JSON.stringify({skills:FG.store.current().skills,focus:FG.store.current().focus,age:FG.store.current().age,intensity:FG.store.current().intensity}));assert.equal(after,original);
  // Parent export/restore includes the new workspace, while an old backup keeps it intact.
  await page.getByRole('button',{name:'⚙️ Grown-ups',exact:true}).click();const downloadPromise=page.waitForEvent('download');await page.click('#exportData');const download=await downloadPromise,backup=JSON.parse(fs.readFileSync(await download.path(),'utf8'));assert.equal(backup.factoryWorkspace.version,2);const workspaceBefore=JSON.stringify(backup.factoryWorkspace);
  await page.setInputFiles('#importData',{name:'combined.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});await page.waitForFunction(()=>document.getElementById('importData').value==='');assert.equal(await page.evaluate(()=>JSON.stringify(FG.factory.exportWorkspace())),workspaceBefore);
  delete backup.factoryWorkspace;await page.setInputFiles('#importData',{name:'old-v1.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});await page.waitForFunction(()=>document.getElementById('importData').value==='');assert.equal(await page.evaluate(()=>JSON.stringify(FG.factory.exportWorkspace())),workspaceBefore);await nav('🎛️ Remix');
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
 const pluginPage=await browser.newPage();await pluginPage.goto(`http://127.0.0.1:${server.address().port}/arcade/`);await pluginPage.waitForFunction(()=>window.FG?.factory&&window.FG?.builder);await pluginPage.getByRole('navigation').getByRole('button',{name:'🎛️ Remix',exact:true}).click();
 for(const [game,prompt,key,expected] of [['gum','Give me six gum sticks','gumRemaining',6],['dragon','Give the island 120 resilience','islandHP',120]]){
  await pluginPage.selectOption('#liveGame',game);await pluginPage.click('#newLiveGame');await pluginPage.fill('#livePrompt',prompt);await pluginPage.click('#livePromptForm button[type=submit]');if(game==='dragon'){await pluginPage.waitForFunction(()=>FG.runtime.snapshot().state.assets===22);await pluginPage.locator('#startBtn').click();}assert.equal(await pluginPage.evaluate(k=>FG.runtime.snapshot().state[k],key),expected);await pluginPage.click('#returnLive');
 }
 // Deterministic round regression uses the same recent-question budget for
 // lose/retry and win/next. The next case clears it to exercise actual math.
 await pluginPage.evaluate(()=>{Math.random=()=>0;FG.store.changeProfile({rate:1});FG.store.current().mathWindow=[Date.now()];FG.store.save();FG.app.openGame('buckets',{config:{bucketCount:3,revealSafe:false,splashMs:400}})});await pluginPage.getByRole('button',{name:'Bucket 2',exact:true}).click();await pluginPage.getByRole('button',{name:'🪣 Choose bucket',exact:true}).click();await pluginPage.waitForSelector('#resultNext');assert.match(await pluginPage.textContent('#resultNext'),/Retry/);await pluginPage.click('#resultNext');await pluginPage.getByRole('button',{name:'Bucket 1',exact:true}).click();await pluginPage.getByRole('button',{name:'🪣 Choose bucket',exact:true}).click();await pluginPage.waitForSelector('#resultNext');assert.match(await pluginPage.textContent('#resultNext'),/Next/);await pluginPage.click('#resultNext');assert.equal(await pluginPage.evaluate(()=>FG.runtime.snapshot().state.level),2);
 await pluginPage.evaluate(()=>{FG.store.changeProfile({rate:8});FG.store.current().mathWindow=[];FG.learning.setMode('buckets','checkpoint');FG.app.openGame('buckets',{config:{bucketCount:3,revealSafe:false,splashMs:400}})});await pluginPage.getByRole('button',{name:'🪣 Choose bucket',exact:true}).click();await pluginPage.waitForSelector('.math-activity');
 const activeItem=await pluginPage.evaluate(()=>FG.learning.activeItem);
 assert.ok(activeItem,'math feedback regression must exercise an actual learning item');
 if(activeItem.answerKind==='choice'){
  const choice=activeItem.choices.find(c=>c.value===String(activeItem.answer));assert.ok(choice);
  await pluginPage.getByRole('button',{name:choice.label,exact:true}).click();
 }else{
  await pluginPage.fill('#math-answer',String(activeItem.answer));await pluginPage.click('#math-submit');
 }
 await pluginPage.evaluate(()=>FG.app.openGame('gum'));await pluginPage.waitForTimeout(650);assert.equal(await pluginPage.locator('#stage-overlay').isVisible(),false);assert.ok(await pluginPage.locator('.builder-piece').count());
 await pluginPage.close();
 // Legacy workspace migration in browser; failed/corrupt load never replaces stored source.
 const page=await browser.newPage();await page.addInitScript(()=>{localStorage.setItem('family-game-factory-workspace-v2',JSON.stringify({version:1,games:[{id:'old-game',owner:'player1',game:'buckets',name:'Migrated Splash',config:{bucketCount:2,revealSafe:true,splashMs:400}}]}))});await page.goto(`http://127.0.0.1:${server.address().port}/arcade/`);await page.waitForFunction(()=>window.FG?.factory&&window.FG?.builder);await page.getByRole('navigation').getByRole('button',{name:'🎛️ Remix',exact:true}).click();assert.match(await page.textContent('#liveName'),/Migrated Splash/);await page.click('#livePlay');assert.equal((await page.evaluate(()=>FG.runtime.snapshot())).state.bucketCount,2);await page.close();
 }finally{await browser.close();server.close()}
})().catch(err=>{console.error(err);process.exitCode=1});
