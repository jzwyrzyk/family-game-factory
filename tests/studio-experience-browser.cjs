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
  await page.waitForFunction(()=>window.FG?.studio);
  await page.click('#studioNavCreate');
  assert.equal(await page.locator('#page-studio').evaluate(el=>el.classList.contains('studio-creating')),true,'new game is creation-first');
  assert.equal(await page.locator('#studioCanvas').isVisible(),false,'empty canvas must not dominate creation');
  assert.equal(await page.locator('#studioCreationHero').isVisible(),true,'an invitation to imagine is visible');
  assert.equal(await page.locator('#studioMic').isVisible(),true,'voice is beside the composer');
  const textarea=await page.locator('#studioPrompt').boundingBox(),send=await page.locator('#studioTalk').boundingBox();
  assert(textarea&&send&&send.y-textarea.y-textarea.height<115,'send belongs directly under the text field');
  if(device==='mobile'){
   assert(textarea.y>=0&&textarea.y<viewport.height-130,'child sees where to type without scrolling on mobile');
   assert(send.y+send.height<=viewport.height-20,'child sees Send to jems on the first mobile screen');
  }
  const color=await page.locator('#studioSend').evaluate(el=>getComputedStyle(el).backgroundColor);
  assert.equal(color,'rgb(11, 29, 77)','build game is an obvious deep navy CTA');
  assert.equal(await page.locator('#designPlan').isVisible(),false,'eight-field plan is not visible before requested');
  await page.fill('#studioPrompt','I win every time');
  await page.click('#studioTalk');
  await page.waitForFunction(()=>document.getElementById('studioMessages').textContent.includes('more challenging'));
  const afterTalk=await page.evaluate(()=>FG.studio.exportNotebook().sessions.find(x=>x.game==='new'));
  assert.equal(afterTalk.job,null,'chat never falsely queues a build');
  assert.match(await page.locator('#studioAvailability').textContent(),/Limited conversation/,'fallback must not claim real AI');
  assert.equal(await page.inputValue('#studioPrompt'),'','chat clears its submitted draft only after saving the idea');
  await page.click('#studioSend');
  assert.equal(await page.locator('#designPlan').evaluate(el=>el.open),true,'the explicit build choice opens the plan before generation');
  assert.equal(await page.locator('.design-plan-field:visible').count(),1,'the guided plan shows only one question at a time');
  assert.equal((await page.evaluate(()=>FG.studio.exportNotebook().sessions.find(x=>x.game==='new'))).job,null,'unapproved plan starts no build');
  assert.equal(errors.length,0,'no page errors: '+errors.join('; '));
  await ctx.close();
 }
 console.log('PASS child-first composer, limited-coach honesty, distinct build consent (desktop+mobile)');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
