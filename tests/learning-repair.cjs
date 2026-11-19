const {chromium}=require('playwright');
const assert=require('node:assert/strict');

(async()=>{
 const server=require('./browser-server.cjs').start();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('dialog',dialog=>dialog.accept());
  await page.clock.install({time:new Date('2026-11-16T08:00:00Z')});
  await page.goto(`http://127.0.0.1:${server.address().port}/arcade/?arcade=1`);
  await page.waitForFunction(()=>window.FG?.app&&window.FG?.learning?.version===2);

  // Multiplication is available only when the parent has selected grade 3+.
  await page.getByRole('button',{name:'Grown-ups',exact:true}).click();
  assert.equal(await page.locator('#parentFacts').isDisabled(),true);
  await page.selectOption('#parentGrade','3');
  await page.selectOption('#parentIntensity','balanced');
  await page.fill('#parentFacts','8x7');
  await page.click('#saveParent');
  assert.equal(await page.evaluate(()=>FG.store.current().grade),3);
  assert.deepEqual(await page.evaluate(()=>FG.store.current().factTargets),['mul:8x7']);

  // Focus has weight; it does not remove readiness, confidence or review work.
  // Sampling a clone avoids manufacturing attempt evidence in the real profile.
  const selection=await page.evaluate(()=>{
   const profile=structuredClone(FG.store.current());let seed=17;
   const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
   return Array.from({length:24},()=>{const item=FG.learning.selectItem(profile,{random});return {factId:item.factId,grade:item.grade,purpose:item.purpose}});
  });
  assert.ok(selection.some(item=>item.factId==='mul:8x7'&&item.purpose==='focus'));
  assert.ok(selection.some(item=>item.factId!=='mul:8x7'),'Focused practice must retain its broader learning mix');
  assert.ok(selection.every(item=>item.grade<=3));
  // Pause before manually advancing the native rounds. A pending realtime tick
  // in Playwright 1.56.1 can otherwise move Date.now behind a recorded question.
  await page.clock.pauseAt(new Date('2026-11-16T10:00:00Z'));

  const answerActivity=async(correct)=>{
   const active=await page.evaluate(()=>({item:FG.learning.activeItem,attemptId:FG.learning.activeAttemptId}));
   assert.ok(active.item&&active.attemptId,'Splash must use the shared math activity');
   const activity=page.locator('#stage-overlay .math-activity');
   const raw=active.item.answerKind==='choice'
    ? active.item.choices.find(option=>correct?option.value===String(active.item.answer):option.value!==String(active.item.answer)).value
    : correct?String(active.item.answer):'-999';
   if(active.item.answerKind==='choice'){
    const option=active.item.choices.find(candidate=>candidate.value===raw);
    await activity.getByRole('button',{name:option.label,exact:true}).click();
   }else{
    const write=activity.getByRole('button',{name:'Write an answer',exact:true});
    if(await write.isVisible())await write.click();
    await activity.getByRole('textbox',{name:'Math answer',exact:true}).fill(raw);
    await activity.getByRole('button',{name:'Check answer',exact:true}).click();
   }
   return {...active,raw};
  };
  const attempts=[];
  const checkpointState=()=>page.evaluate(()=>{
   const profile=FG.store.current(),overlay=document.getElementById('stage-overlay'),item=FG.learning.activeItem;
   const mathWindow=[...(profile.mathWindow||[])],now=Date.now();
   return {now,rate:profile.rate,grade:profile.grade,mathWindow,elapsedSinceLast:mathWindow.length?now-mathWindow.at(-1):null,
    eligibleNow:FG.math.canAsk(profile),active:FG.learning.active,activeAttemptId:FG.learning.activeAttemptId,
    activeItem:item?{id:item.id,skillId:item.skillId,grade:item.grade}:null,native:FG.runtime.snapshot(),
    overlayHidden:overlay.classList.contains('hidden'),overlayText:overlay.textContent.slice(0,600),
    attempts:(profile.learning?.attempts||[]).slice(-4).map(attempt=>({id:attempt.id,outcome:attempt.outcome,answers:attempt.answers.length,correct:attempt.correct,independent:attempt.independent}))};
  });
  for(const challenge of [false,true]){
   const phase=challenge?'Original Challenge':'Practice';
   if(challenge){
    // Advance pacing at the completed result without replaying idle animation.
    const previous=await checkpointState();
    assert.equal(previous.active,false);
    assert.equal(previous.eligibleNow,false,'The previous question must still consume the shared pacing budget');
    await page.clock.fastForward(80_000);
    const advanced=await checkpointState();
    assert.equal(advanced.now-previous.now,80_000,'The controlled clock must advance the full spacing interval');
    assert.deepEqual(advanced.mathWindow,previous.mathWindow,'Elapsed time must retain prior question timestamps');
    assert.deepEqual(advanced.attempts,previous.attempts,'Elapsed time must retain the completed practice evidence');
    assert.equal(advanced.eligibleNow,true,'The next question must satisfy the real shared pacing policy');
   }
   await page.evaluate(challenge=>{FG.store.changeProfile({punish:challenge,rate:8});FG.app.openGame('buckets')},challenge);
   for(let i=0;i<4;i++)await page.locator('#go').click();
   await page.clock.runFor(6500);
   await page.waitForFunction(()=>FG.runtime.snapshot().state.mode==='result');
   const before=await checkpointState();
   console.log(`[learning-repair:${phase}] before checkpoint`,JSON.stringify({...before,pageErrors:errors}));
   assert.equal(before.eligibleNow,true,`${phase} must respect the real pacing policy: ${JSON.stringify(before)}`);
   assert.equal(before.active,false,`${phase} cannot start with a leaked active attempt: ${JSON.stringify(before)}`);
   await page.locator('#go').click();
   try{
    // Both outcomes are synchronous in the native host. Capture a policy-skip
    // result or a mounting error directly instead of waiting for missing math.
    await page.waitForSelector('#stage-overlay .math-activity, #stage-overlay #resultNext',{timeout:5000});
   }catch(error){
    const state=await checkpointState();
    throw new Error(`${phase} did not show a learning activity or result: ${JSON.stringify({...state,pageErrors:errors})}`,{cause:error});
   }
   const after=await checkpointState();
   console.log(`[learning-repair:${phase}] after checkpoint`,JSON.stringify({...after,pageErrors:errors}));
   assert.equal(await page.locator('#stage-overlay .math-activity').isVisible(),true,`${phase} skipped or failed math: ${JSON.stringify({...after,pageErrors:errors})}`);
   assert.deepEqual(after.mathWindow,[...before.mathWindow,after.now],`${phase} must append exactly one current question timestamp`);
   assert.equal(after.elapsedSinceLast,0,'A just-presented question cannot be in the future');
   assert.equal(after.eligibleNow,false,'A just-presented question must prevent an immediate second question');
   const attempt=await answerActivity(false);attempts.push(attempt);
   const storedWrong=await page.evaluate(id=>{
    const data=JSON.parse(localStorage.getItem('family-game-factory-state-v1'));
    return data.profiles.find(profile=>profile.id===data.activeProfile).learning.attempts.find(attempt=>attempt.id===id);
   },attempt.attemptId);
   assert.equal(storedWrong.answers[0].raw,attempt.raw);
   assert.equal(storedWrong.answers[0].correct,false,'The actual incorrect response is saved immediately');
   if(challenge){
    await page.waitForSelector('#resultNext');
    assert.match(await page.locator('#stage-overlay').textContent(),/Original Challenge/);
    assert.equal(storedWrong.correct,false);
   }else{
    assert.equal(await page.locator('#stage-overlay .math-activity').isVisible(),true);
    assert.equal(await page.locator('#stage-overlay .math-feedback').getAttribute('data-state'),'incorrect');
    assert.equal(await page.locator('#stage-overlay .math-hint').isVisible(),true);
    assert.ok((await page.locator('#stage-overlay .math-hint').textContent()).includes(attempt.item.hints[0].text));
    await answerActivity(true);await page.clock.runFor(700);await page.waitForSelector('#resultNext');
   }
   const completed=await page.evaluate(id=>FG.store.current().learning.attempts.find(attempt=>attempt.id===id),attempt.attemptId);
   assert.equal(completed.independent,false);
   assert.equal(completed.correct,!challenge);
   assert.equal(completed.answers.length,challenge?1:2);
   assert.equal(await page.evaluate(key=>FG.store.current().skills[key].lastIndependent,attempt.item.factId||attempt.item.id),false);
  }
  assert.notEqual(attempts[0].attemptId,attempts[1].attemptId);
  const backup=await page.evaluate(()=>JSON.stringify(FG.store.data));
  await page.reload();await page.waitForFunction(()=>window.FG?.app&&window.FG?.learning?.version===2);
  for(const attempt of attempts){
   const restored=await page.evaluate(id=>FG.store.current().learning.attempts.find(attempt=>attempt.id===id),attempt.attemptId);
   assert.equal(restored.answers[0].raw,attempt.raw);assert.equal(restored.answers[0].correct,false);assert.equal(restored.independent,false);
  }
  await page.evaluate(raw=>FG.store.restore(raw),backup);
  assert.equal(await page.evaluate(()=>FG.store.current().factTargets[0]),'mul:8x7');
  assert.equal(await page.evaluate(()=>FG.store.current().grade),3);
  assert.equal(await page.evaluate(()=>FG.store.current().learning.attempts.filter(attempt=>attempt.context.gameId==='buckets').length),2);
  assert.deepEqual(errors,[]);
  console.log('PASS learning: grade limit, weighted fact focus, saved wrong responses, hints, both Splash consequences, independent evidence, reload and backup');
 }finally{await browser.close();server.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
