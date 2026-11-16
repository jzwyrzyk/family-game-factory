const {chromium}=require('playwright');
const assert=require('node:assert/strict');

(async()=>{
 const server=require('./browser-server.cjs').start();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('dialog',dialog=>dialog.accept());
  await page.clock.install();
  await page.goto(`http://127.0.0.1:${server.address().port}/arcade/`);
  await page.waitForFunction(()=>window.FG?.app&&window.FG?.learning?.version===2);

  // Multiplication is available only when the parent has selected grade 3+.
  await page.getByRole('button',{name:'⚙️ Grown-ups',exact:true}).click();
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
  for(const challenge of [false,true]){
   if(challenge)await page.clock.fastForward(80_000); // Advance pacing while at the completed result, without replaying idle animation frames.
   await page.evaluate(challenge=>{FG.store.changeProfile({punish:challenge,rate:8});FG.app.openGame('buckets')},challenge);
   for(let i=0;i<4;i++)await page.locator('#go').click();
   await page.clock.runFor(6500);
   await page.waitForFunction(()=>FG.runtime.snapshot().state.mode==='result');
   await page.locator('#go').click();
   await page.waitForSelector('#stage-overlay .math-activity');
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
