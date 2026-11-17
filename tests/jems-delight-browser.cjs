/* jems joy layer contract: durable idea, color zones and respectful motion. */
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const {start}=require('./browser-server.cjs');
(async()=>{
 const server=start(),browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox']});
 const base='http://127.0.0.1:'+server.address().port+'/arcade/';
 try{
  const ctx=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'});
  await ctx.addInitScript(()=>{window.__jemsMilestones=[];window.addEventListener('jems:milestone',e=>window.__jemsMilestones.push(e.detail.kind));});
  const page=await ctx.newPage();page.on('dialog',d=>void d.accept());
  await page.goto(base);await page.waitForFunction(()=>window.FG?.studio&&document.getElementById('jems-delight-host'));
  assert.equal(await page.locator('[data-starter]').count(),6);
  assert.equal(await page.locator('.jems-world-scene').count(),4,'4 illustrated worlds + 2 existing quality-game canvases');
  for(const asset of ['jems-workbench.svg','jems-world-buckets.svg','jems-world-dragon.svg','jems-world-moon.svg','jems-world-robot.svg']){
   assert.equal(await page.evaluate(p=>fetch('./'+p).then(r=>r.ok),asset),true,asset+' must be local');
  }
  await page.locator('#studioNew').click();
  assert.equal(await page.locator('.jems-empty-workbench').count(),1);
  assert.ok(await page.locator('.jems-empty-workbench').evaluate(img=>img.complete&&img.naturalWidth>0));
  assert.deepEqual(await page.evaluate(()=>window.__jemsMilestones),[],'opening blank canvas is not an accomplishment');
  await page.locator('#studioPrompt').fill('A cat drives a donut spaceship around the moon');
  await page.locator('#studioTalk').click();
  await page.waitForFunction(()=>window.__jemsMilestones.includes('idea'));
  assert.equal(await page.locator('#jems-delight-host').evaluate(e=>getComputedStyle(e).pointerEvents),'none');
  assert.equal(await page.locator('.jems-delight-toast').getAttribute('aria-live'),'polite');
  assert.ok(await page.evaluate(()=>window.FG.studio.exportNotebook().sessions.some(s=>s.game==='new'&&s.messages.some(m=>m.role==='child'))),'idea actually saved');
  await page.locator('#studioPrompt').fill('Make the donut spaceship bounce');
  await page.locator('#studioTalk').click();
  assert.equal(await page.evaluate(()=>window.__jemsMilestones.filter(x=>x==='idea').length),1,'no celebration every message');
  await page.locator('#studioNavHome').click();
  assert.ok(await page.locator('[data-session] .jems-project-badge').count(),'honest badge on saved creation');
  await page.locator('footer [data-page="parent"]').click();
  await page.locator('#parentSubject').selectOption('both');await page.locator('#saveParent').click();
  await page.locator('#studioNavHome').click();
  assert.equal(await page.locator('#studioSubjectLanguage').isDisabled(),false);
  await page.locator('#studioSubjectLanguage').click();
  assert.equal(await page.evaluate(()=>window.FG.learning.subject),'language');
  assert.equal(await page.locator('#studioLearningChoice').evaluate(e=>getComputedStyle(e).borderLeftColor),'rgb(138, 77, 255)');
  await page.locator('#studioNavPowers').click();
  assert.equal(await page.locator('#page-lab .panel').first().evaluate(e=>getComputedStyle(e).borderTopColor),'rgb(138, 77, 255)');
  await ctx.close();
  const reduced=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',serviceWorkers:'block'});
  const p=await reduced.newPage();await p.goto(base);await p.waitForFunction(()=>document.getElementById('jems-delight-host'));
  await p.evaluate(()=>window.dispatchEvent(new CustomEvent('jems:milestone',{detail:{kind:'kept'}})));
  await p.locator('.jems-delight-toast').waitFor({state:'visible'});
  assert.equal(await p.locator('.jems-delight-sparks').count(),0,'no floating pieces in reduced-motion mode');
  assert.equal(await p.locator('.jems-delight-toast').evaluate(e=>getComputedStyle(e).animationName),'none');
  await p.evaluate(()=>window.dispatchEvent(new CustomEvent('jems:milestone',{detail:{kind:'unsupported'}})));
  assert.equal(await p.locator('.jems-delight-toast').count(),1,'unsupported events ignored');
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
  await reduced.close();
  console.log('PASS jems joy: illustrated favorites, actual first saved idea, no spam, English accent, reduced motion');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});