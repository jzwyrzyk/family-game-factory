const {exploreWelcome,sendChildMessage}=require('./studio-entry.cjs');
/* Real production bundle, independent of paid model/generation.
 * Creation-first affordances and non-deceptive offline conversation. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {start}=require('./browser-server.cjs');
(async()=>{
 const server=start(),browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(!process.env.CI&&fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']});
 try{
 for(const [device,viewport] of [['desktop',{width:1400,height:950}],['mobile',{width:390,height:844}]]){
  const ctx=await browser.newContext({viewport,reducedMotion:'reduce'}),page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);
  await page.goto('http://127.0.0.1:'+server.address().port+'/arcade/?studio=1');
  await page.waitForFunction(()=>window.FG?.studio);await exploreWelcome(page);
  await page.click('#studioNavCreate');
  assert.equal(await page.locator('#page-studio').evaluate(el=>el.classList.contains('studio-creating')),true,'new game is creation-first');
  assert.equal(await page.locator('#studioCanvas').isVisible(),false,'empty canvas must not dominate creation');
  assert.equal(await page.locator('#studioCreationHero').isVisible(),true,'one short empty-state question starts the conversation');
  assert.equal(await page.locator('#studioMoreChoices').evaluate(el=>el.open),false,'extra tools start collapsed');
  assert.equal(await page.locator('#studioMic').isVisible(),true,'voice is beside the composer');
  const textarea=await page.locator('#studioPrompt').boundingBox(),send=await page.locator('#studioTalk').boundingBox();
  assert(textarea&&send&&send.y-textarea.y-textarea.height<115,'send belongs directly under the text field');
  if(device==='mobile'){
   assert(textarea.y>=0&&textarea.y<viewport.height-130,'child sees where to type without scrolling on mobile');
   assert(send.y+send.height<=viewport.height-20,'child sees Send to jems on the first mobile screen');
  }
  assert.equal(await page.locator('#studioSend').isDisabled(),true,'new-game Build waits for a grounded conversational review');
  assert.equal(await page.locator('#designPlan').isVisible(),false,'the detailed plan is optional');
  assert.equal(await page.locator('#studioIdeaSparks').isVisible(),false,'asking for inspiration stays optional');
  assert.equal(await page.locator('#studioIdeaSparks button').count(),1,'inspiration offers only a request for conversation, not preset game answers');
  assert.equal(await page.locator('#studioIdeaSparks button').textContent(),'Help me think of an idea');
  assert.equal(await page.locator('#coachGuidedChoices').count(),0,'no preset-answer chips');
  assert.equal(await page.locator('#coachChooseRest').count(),0,'no delegate-the-rest shortcut');

  const afterTalk=await sendChildMessage(page,'A cat jumps between donuts on the moon.');
  assert.equal(await page.locator('#studioCreationHero').isVisible(),false,'the first real conversation replaces the empty-state prompt');
  assert.equal(afterTalk.job,null,'chat never queues a build');
  assert.equal(afterTalk.design.plan.action.value,'A cat jumps between donuts on the moon.','literal intent stays in the child’s words');
  assert.match(await page.locator('#studioAvailability').textContent(),/Limited conversation/,'fallback must not claim real AI');
  assert.equal(await page.inputValue('#studioPrompt'),'','chat clears only its submitted draft');
  assert.match(await page.locator('#studioMessages .studio-message').last().textContent(),/Chat could not answer.*idea is saved/);
  assert.doesNotMatch(await page.locator('#studioMessages').textContent(),/What does the player do\?|How should it feel\?/,'an outage is not a scripted interview');
  await sendChildMessage(page,'It should feel calm and full of funny surprises.');
  const withChoices=await sendChildMessage(page,'Purple clouds and green donuts.');
  assert.equal(withChoices.design.plan.fun.origin,'child');
  assert.equal(withChoices.design.plan.fun.value,'It should feel calm and full of funny surprises.');
  assert.ok(withChoices.messages.some(message=>message.role==='child'&&message.text==='Purple clouds and green donuts.'),'free answers remain saved in the child’s own words even without a connected model');
  assert.equal(Object.values(withChoices.design.plan).some(choice=>choice.origin==='helper'),false,'offline help cannot invent plan choices');
  assert.equal(await page.locator('#studioMoreChoices').evaluate(el=>el.open),false);
  assert.equal(await page.locator('#designPlan').isVisible(),false,'conversation never opens a form');
  await sendChildMessage(page,'You choose the rest.');
  const notDelegated=await page.evaluate(()=>FG.studio.exportNotebook().sessions.find(x=>x.game==='new'));
  assert.equal(Object.values(notDelegated.design.plan).some(choice=>choice.delegated),false,'a request for help never silently delegates the design');
  assert.equal(notDelegated.job,null);assert.equal(notDelegated.design.creationReview,undefined,'local help cannot produce a contextual readiness review');
  assert.equal(await page.locator('#studioSend').isDisabled(),true,'offline coaching does not pretend the design is ready');
  assert.equal(await page.locator('#studioBuildHandoff').isVisible(),false);
  const transcript=await page.locator('#studioMessages').textContent();
  assert.doesNotMatch(transcript,/Approved game plan|Choose sensible details for:|full choices remain|Job queued|Ready! Tap Build/);
  await page.locator('#studioMoreChoices > summary').click();
  await page.click('#coachPlanToggle');
  assert.equal(await page.locator('#designPlan').isVisible(),true,'details remain available by choice');
  assert.equal(await page.getByRole('button',{name:'You choose',exact:true}).count(),0);
  assert.equal(await page.locator('#buildGamePlan').count(),0,'the optional plan cannot bypass readiness');
  assert.equal(await page.locator('#studioSend').isDisabled(),true);
  await page.locator('#studioMoreChoices > summary').click();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  assert.equal(errors.length,0,'no page errors: '+errors.join('; '));
  await ctx.close();
 }
 console.log('PASS child-authored chat, no preset answers/delegation, optional details, honest offline readiness (desktop+mobile)');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
