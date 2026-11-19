/* Production-dist journeys. Children use real controls; fixtures are limited to storage faults and checkpoint pacing. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {once}=require('node:events');
const {start}=require('./browser-server.cjs');
const KEY='family-game-factory-problem-solving-v1';

(async()=>{
 const server=start();if(!server.listening)await once(server,'listening');
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(!process.env.CI&&fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']})
  .catch(async error=>{await new Promise(resolve=>server.close(resolve));throw error;});
 fs.mkdirSync('test-results',{recursive:true});const results=[];
 try{
  for(const [device,viewport] of [['desktop',{width:1440,height:1080}],['touch',{width:390,height:844}]]){
   const context=await browser.newContext({viewport,hasTouch:device==='touch',reducedMotion:'reduce',acceptDownloads:true});
   const page=await context.newPage(),errors=[],paid=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
   page.on('request',r=>{if(r.method()==='POST'&&/\/v1\/(jobs|coach)(\/|$)|api\.openai\.com/.test(r.url()))paid.push(r.url());});
   await page.route('**/factory-config.json',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({version:1,mode:'unavailable'})}));
   const activate=async s=>{const l=typeof s==='string'?page.locator(s):s;device==='touch'?await l.tap():await l.click();};
   const phase=()=>page.locator('#page-problem-solving').getAttribute('data-phase');
   const saved=()=>page.evaluate(()=>FG.problemSolvingEvidence.list());
   const overflow=async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,device+': no page overflow');
   const pick=async i=>{if(!await page.locator('#studioProfileMenu').evaluate(e=>e.open))await activate('#studioProfileMenu summary');await activate(page.locator('.profile-choice').nth(i));};
   const parent=()=>activate(page.getByRole('button',{name:'⚙️ Grown-ups',exact:true}));
   const fault=()=>page.evaluate(()=>{window.psSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.endsWith('family-game-factory-problem-solving-v1'))throw new DOMException('Fixture quota','QuotaExceededError');return window.psSetItem.call(this,k,v);};});
   const unfault=()=>page.evaluate(()=>{Storage.prototype.setItem=window.psSetItem;delete window.psSetItem;});
   try{
    await page.goto(`http://127.0.0.1:${server.address().port}/arcade/?problem-solving=1`);
    await page.waitForSelector('#page-problem-solving:not(.hidden)');
    assert.equal(await page.locator('[data-ps-task]').count(),3);await overflow();
    await page.screenshot({path:`test-results/problem-solving-shelf-${device}.png`,fullPage:true});
    await activate('[data-ps-task="robot-stop-g1-2"]');assert.equal(await phase(),'predict');
    const beforeFault=await page.evaluate(key=>localStorage.getItem(key),KEY);await fault();
    await activate('[data-ps-choice="at-gem"]');assert.equal(await phase(),'predict');assert.match(await page.locator('#psStatus').textContent(),/Could not save/);
    assert.equal(await page.evaluate(key=>localStorage.getItem(key),KEY),beforeFault);await unfault();
    // An incorrect guess is retained as context, without denying later reasoning opportunities.
    await activate('[data-ps-choice="at-gem"]');assert.equal(await phase(),'test');
    await page.reload();await page.waitForSelector('[data-ps-task="robot-stop-g1-2"]');
    assert.match(await page.locator('[data-ps-task="robot-stop-g1-2"]').textContent(),/Continue/);
    await activate('[data-ps-task="robot-stop-g1-2"]');assert.equal(await phase(),'test');
    // Leaving for a different learner does not expose or overwrite this unfinished activity.
    await pick(1);await activate('#studioNavProblemSolving');assert.equal(await page.locator('[data-ps-task="robot-stop-g3-4"]').count(),1);assert.equal((await saved()).length,0);
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
    await parent();await page.waitForSelector('#problemSolvingParentProgress');
    assert.match(await page.locator('#problemSolvingParentProgress').textContent(),/Not sampled by a completed activity/);
    assert.match(await page.locator('#problemSolvingParentProgress').textContent(),/not a standardized score/);
    await overflow();await page.screenshot({path:`test-results/problem-solving-parent-${device}.png`,fullPage:true});

    // Existing learning controls still own their source score, and the new route cannot skip an open question.
    await activate('#studioNavPowers');if(await page.locator('#lab-next').isVisible())await activate('#lab-next');
    await page.waitForSelector('.math-activity');assert.equal(await page.evaluate(()=>FG.learning.active),true);
    await activate('#studioNavProblemSolving');assert.equal(await page.locator('#page-problem-solving').isVisible(),false);
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
    await parent();const downloadWait=page.waitForEvent('download');await activate('#exportData');const download=await downloadWait,backup=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
    assert.equal(backup.factoryProblemSolving.schema,'jems.problem-solving.workspace.v1');
    const beforeRestore=await page.evaluate(key=>localStorage.getItem(key),KEY);
    const corrupt={...backup,factoryProblemSolving:{schema:'future'}};
    await page.locator('#importData').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(corrupt))});
    await page.waitForFunction(()=>!document.getElementById('importData').value);assert.equal(await page.evaluate(key=>localStorage.getItem(key),KEY),beforeRestore);
    await activate('#clearProblemSolving');assert.equal((await saved()).length,0);
    const navigation=page.waitForNavigation();await page.locator('#importData').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});await navigation;
    await page.waitForFunction(()=>FG.problemSolvingEvidence&&FG.studio);assert.equal((await saved()).length,backup.factoryProblemSolving.episodes.length);
    assert.equal(await page.evaluate(()=>Object.hasOwn(FG.store.data,'factoryProblemSolving')),false,'no duplicated ledger in profile blob');
    await pick(1);await parent();assert.equal((await saved()).length,0);assert.doesNotMatch(await page.locator('#problemSolvingParentProgress').textContent(),/Earliest retained activity/);
    assert.deepEqual(errors,[]);assert.deepEqual(paid,[]);results.push({device,status:'passed',episodes:backup.factoryProblemSolving.episodes.length});
   }finally{await context.close();}
  }
  fs.writeFileSync('test-results/problem-solving-browser.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1;});
