const {authorizeLearningParent}=require('./learning-parent-fixture.cjs');
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async()=>{
 const server=require('./browser-server.cjs').start();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(!process.env.CI&&fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']});
 try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.goto(`http://127.0.0.1:${server.address().port}/arcade/?arcade=1`);await page.waitForFunction(()=>window.FG?.app&&window.FG?.factory&&window.FG?.builder);
 const nav=async(name)=>page.getByRole('navigation').getByRole('button',{name,exact:true}).click();
 // Content can be a story, fraction, clock or choice. Read the shared activity
 // contract rather than trying to recover arithmetic from the displayed text.
 const answerActivity=async(correct=true)=>{
  const current=await page.evaluate(()=>({item:FG.learning.activeItem,attemptId:FG.learning.activeAttemptId}));
  assert.ok(current.item&&current.attemptId,'A shared learning activity must be active');
  const activity=page.locator('.math-activity:visible');
  const raw=current.item.answerKind==='choice'
   ? current.item.choices.find(option=>correct?option.value===String(current.item.answer):option.value!==String(current.item.answer)).value
   : correct?String(current.item.answer):'-999';
  if(current.item.answerKind==='choice')await activity.getByRole('button',{name:current.item.choices.find(option=>option.value===raw).label,exact:true}).click();
  else{
   const write=activity.getByRole('button',{name:'Write an answer',exact:true});
   if(await write.isVisible())await write.click();
   await activity.getByRole('textbox',{name:'Math answer',exact:true}).fill(raw);
   await activity.getByRole('button',{name:'Check answer',exact:true}).click();
  }
  return {...current,raw};
 };
 const original=await page.evaluate(()=>{FG.store.changeProfile({grade:1});FG.store.current().stats.gum={played:9,wins:5,bestLevel:3};FG.store.current().skills.legacy={tries:2};FG.store.save();return JSON.stringify(FG.store.current())});
 await nav('Create');await page.click('#wizardNext');assert.equal(await page.locator('[data-step="0"]').isVisible(),true);
 await page.fill('#inventIdea','A space cat collects dancing donuts');await page.click('#wizardNext');await page.selectOption('#inventAction','Run, jump and explore');await page.fill('#inventWin','Collect five donuts');await page.click('#wizardBack');assert.equal(await page.inputValue('#inventIdea'),'A space cat collects dancing donuts');await page.click('#wizardNext');await page.click('#wizardNext');assert.match(await page.textContent('#ideaPreview'),/Collect five donuts/);await page.click('#wizardSave');await page.waitForSelector('#page-creations:not(.hidden)');assert.match(await page.textContent('#feedbackList'),/space cat/);
 await page.reload();assert.equal(await page.evaluate(()=>JSON.stringify(FG.store.current())),original);
 await nav('My Creations');assert.match(await page.textContent('#feedbackList'),/space cat/);
 // Improvement save and safe text rendering.
 await nav('Remix');await page.fill('#feedbackText','<img src=x onerror=alert(1)> More dancing donuts');await page.click('#feedbackForm button[type=submit]');assert.match(await page.textContent('#feedbackStatus'),/Saved/);await nav('My Creations');assert.equal(await page.locator('#feedbackList img').count(),0);
 // Every original game and each difficulty can launch and exit.
 const exitPaths=new Set();
 for(const game of ['gum','buckets','dragon'])for(const difficulty of ['gentle','classic','stretch']){
 await nav('Remix');await page.selectOption('#remixGame',game);await page.selectOption('#remixDifficulty',difficulty);await page.click('#playRemix');await page.waitForSelector('#page-game:not(.hidden)');
 // This loop verifies the retained original engines. Preserve the chosen UI
 // difficulty, then deliberately select the older construction revision. The
 // physical workshop has its own quality and required-learning journeys.
 if(game==='gum')await page.evaluate(()=>FG.app.openGame('gum',{config:{...FG.runtime.snapshot().config,qualityVersion:0,originalRules:true}}));
 assert.equal(await page.locator('#game-mount').evaluate(node=>node.inert),false,'Opening another game must release an earlier checkpoint’s input lock');
 if(game==='gum')assert.ok(await page.locator('.builder-piece').count()>0);
 if(game==='dragon'){await page.waitForFunction(()=>FG.runtime.snapshot().state.assets===22);await page.locator('#startBtn').click();assert.equal(await page.evaluate(()=>FG.runtime.snapshot().state.dragonHP),2)}
 if(game==='buckets'){for(let i=0;i<4;i++)await page.locator('#go').click();await page.waitForFunction(()=>FG.runtime.snapshot().state.mode==='result');await page.locator('#go').click();assert.equal(await page.locator('#stage-overlay').isVisible(),true)}
 const checkpoint=await page.evaluate(()=>FG.learning.activeAttemptId?{
   id:FG.learning.activeAttemptId, budget:FG.store.current().mathWindow.length
 }:null);
 if(checkpoint){
   await page.locator('#stage-overlay [data-action="leave-game"]').click();
   const ended=await page.evaluate(id=>{
     const saved=JSON.parse(localStorage.getItem('family-game-factory-state-v1'));
     const child=saved.profiles.find(profile=>profile.id===saved.activeProfile);
     const attempt=child.learning.attempts.find(entry=>entry.id===id);
     return {outcome:attempt.outcome,answers:attempt.answers.length,budget:child.mathWindow.length};
   },checkpoint.id);
   assert.deepEqual(ended,{outcome:'interrupted',answers:0,budget:checkpoint.budget-1},
     'Leaving an unanswered checkpoint saves its interruption and refunds the single opportunity');
   exitPaths.add('checkpoint');
 }else{
   await page.click('#exitGame');
   exitPaths.add('game');
 }
 await page.waitForSelector('#page-home:not(.hidden)');
 assert.equal(await page.locator('#game-mount').evaluate(node=>node.inert),false);
 }
 assert.deepEqual([...exitPaths].sort(),['checkpoint','game'],'Both visible exits take the player home');
 // Shared math: wrong response saved immediately, a useful hint, and supported recovery.
 await nav('My Powers');const labAttempt=await answerActivity(false);
 assert.equal(await page.locator('#lab-question .math-feedback').getAttribute('data-state'),'incorrect');
 assert.equal(await page.locator('#lab-question .math-hint').isVisible(),true);
 const savedWrong=await page.evaluate(id=>{const data=JSON.parse(localStorage.getItem('family-game-factory-state-v1'));return data.profiles.find(p=>p.id===data.activeProfile).learning.attempts.find(a=>a.id===id)},labAttempt.attemptId);
 assert.equal(savedWrong.answers[0].raw,labAttempt.raw);assert.equal(savedWrong.answers[0].correct,false);
 await answerActivity(true);await page.waitForSelector('#lab-next');
 const recovered=await page.evaluate(id=>FG.store.current().learning.attempts.find(a=>a.id===id),labAttempt.attemptId);
 assert.equal(recovered.correct,true);assert.equal(recovered.independent,false);assert.equal(recovered.answers.length,2);
 // Parent settings and v1 restore retain original progress and ideas.
 await page.getByRole('button',{name:'Grown-ups',exact:true}).click();await page.locator('[data-parent-tab="settings"]').click();await authorizeLearningParent(page);
    await page.selectOption('#parentGrade','3');await page.selectOption('#parentFocus','div');await page.click('#saveParent');assert.equal(await page.evaluate(()=>FG.store.current().grade),3);assert.equal(await page.evaluate(()=>FG.store.current().focus),'div');const backup=await page.evaluate(()=>JSON.stringify(FG.store.data));await page.evaluate(raw=>FG.store.restore(raw),backup);
 await page.reload();assert.equal(await page.evaluate(()=>FG.store.current().stats.gum.played),9);assert.equal(await page.evaluate(()=>FG.store.data.feedback.length),2);
 assert.equal(await page.evaluate(id=>FG.store.current().learning.attempts.find(a=>a.id===id).answers[0].correct,labAttempt.attemptId),false,'The actual wrong response survives reload and restore');
 // Profile-specific remixes; legacy v1 backups without new fields still load.
 await nav('Remix');await page.selectOption('#remixGame','dragon');assert.equal(await page.inputValue('#remixDifficulty'),'stretch');await page.locator('.profile-choice').nth(1).click();assert.equal(await page.inputValue('#remixDifficulty'),'classic');
 // Complete a builder level and continue, without changing the first profile's history.
 await page.evaluate(()=>{FG.store.changeProfile({rate:8});FG.app.openGame('gum',{config:{qualityVersion:0,originalRules:true,highlightMatches:false,extraDecoys:0}})});
 await page.getByRole('button',{name:'Add Bottle',exact:true}).click();
 for(const [piece,key] of [['Cone','ArrowUp'],['Spoon','ArrowLeft'],['Paddle','ArrowRight'],['Fan','ArrowDown']]){
  await page.getByRole('button',{name:'Add '+piece,exact:true}).click();for(let i=0;i<10;i++)await page.keyboard.press(key);
 }
 for(const id of ['nose','left','right','engine']){await page.locator('[data-part="body"]').click();await page.getByRole('button',{name:'Chew gum & connect',exact:true}).click();await page.locator(`[data-part="${id}"]`).click();}
 await page.getByRole('button',{name:'Test construction',exact:true}).click();
 await page.waitForSelector('#stage-overlay .math-activity');await answerActivity(true);
 await page.waitForSelector('#resultNext');await page.click('#resultNext');assert.match(await page.textContent('.builder-wrap h2'),/Level 2/);assert.equal(await page.evaluate(()=>FG.store.current().stats.gum.wins),1);assert.equal(await page.evaluate(()=>FG.store.data.profiles[0].stats.gum.wins),5);await page.click('#exitGame');
 // Failed local writes keep a child's draft and report failure.
 await nav('Create');await page.fill('#inventIdea','A rainbow swimming adventure');await page.click('#wizardNext');await page.click('#wizardNext');await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw Error('Storage full')}});await page.click('#wizardSave');assert.match(await page.textContent('#createStatus'),/could not be saved/);assert.equal(await page.inputValue('#inventIdea'),'A rainbow swimming adventure');
 // Mobile pages fit and key controls stay reachable.
 await page.setViewportSize({width:375,height:812});for(const name of ['Play','Create','Remix','My Creations','My Powers']){await nav(name);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${name} overflows`)}
 assert.deepEqual(errors,[]);console.log('PASS: creation, remix, all games, math, parents, persistence, profiles, failed saves, mobile');
 }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
