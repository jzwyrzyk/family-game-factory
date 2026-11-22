const {exploreWelcome,navigate,sendChildMessage}=require('./studio-entry.cjs');
/* jems joy layer contract: durable idea, color zones and respectful motion. */
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const fs=require('node:fs');
const {start}=require('./browser-server.cjs');
(async()=>{
 const server=start(),browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox']});
 const base='http://127.0.0.1:'+server.address().port+'/arcade/';
 try{
  const ctx=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'});
  await ctx.addInitScript(()=>{window.__jemsMilestones=[];window.addEventListener('jems:milestone',e=>window.__jemsMilestones.push(e.detail.kind));});
  const page=await ctx.newPage();page.on('dialog',d=>void d.accept());
  await page.goto(base);await page.waitForFunction(()=>window.FG?.studio&&document.getElementById('jems-delight-host'));await exploreWelcome(page);
  assert.equal(await page.locator('[data-starter]').count(),6);
  const cardArtwork={
   factory:['./gem-factory-workshop.webp'],
   mining:['./art/mind-your-jems/scene-sky.webp','./art/mind-your-jems/rock-expressions.webp','./art/mind-your-jems/miner-poses.webp','./art/mind-your-jems/cart-empty.webp'],
   dragon:['./jems-world-dragon.svg'],buckets:['./jems-world-buckets.svg']
  };
  for(const [game,assets] of Object.entries(cardArtwork)){
   const images=page.locator('[data-starter="'+game+'"] .studio-game-art img');
   assert.deepEqual(await images.evaluateAll(nodes=>nodes.map(image=>image.getAttribute('src'))),assets,game+' keeps its actual illustrated artwork');
   for(const image of await images.all())assert.ok(await image.evaluate(async image=>{await image.decode();return image.complete&&image.naturalWidth>0&&image.naturalHeight>0;}),game+' artwork decodes');
  }
  for(const game of ['gum','hill']){
   const canvas=page.locator('[data-starter="'+game+'"] canvas.quality-card-art[data-quality-card="'+game+'"]');
   assert.equal(await canvas.count(),1,game+' keeps its quality-game canvas');
   assert.ok(await canvas.isVisible(),game+' canvas is visible');
   assert.ok(await canvas.evaluate(canvas=>canvas.width>0&&canvas.height>0),game+' canvas has a drawable surface');
  }
  assert.equal(await page.locator('[data-starter="moon"],[data-starter="robot"]').count(),0,'retired worlds are not default catalogue cards');
  for(const asset of ['jems-workbench.svg','jems-world-buckets.svg','jems-world-dragon.svg','jems-world-moon.svg','jems-world-robot.svg']){
   assert.equal(await page.evaluate(p=>fetch('./'+p).then(r=>r.ok),asset),true,asset+' must be local');
   assert.ok(await page.evaluate(async p=>{const image=new Image();image.src='./'+p;await image.decode();return image.naturalWidth>0&&image.naturalHeight>0;},asset),asset+' remains decodable, including retired saved worlds');
  }
  await page.locator('#studioNew').click();
  assert.equal(await page.locator('.jems-empty-workbench').count(),1);
  assert.ok(await page.locator('.jems-empty-workbench').evaluate(async img=>{await img.decode();return img.complete&&img.naturalWidth>0;}));
  assert.deepEqual(await page.evaluate(()=>window.__jemsMilestones),[],'opening blank canvas is not an accomplishment');
  await sendChildMessage(page,'A cat drives a donut spaceship around the moon');
  assert.equal(await page.locator('#coachGuidedChoices').count(),0,'the conversation does not supply answer buttons');
  assert.equal(await page.locator('#studioSend').isDisabled(),true,'an unreviewed first idea does not enable Build');
  assert.equal(await page.locator('#jems-delight-host').evaluate(e=>getComputedStyle(e).pointerEvents),'none');
  assert.equal(await page.locator('.jems-delight-toast[data-kind="idea"]').count(),0,'the first idea stays in the focused conversation without a competing toast');
  assert.ok(await page.evaluate(()=>window.FG.studio.exportNotebook().sessions.some(s=>s.game==='new'&&s.messages.some(m=>m.role==='child'))),'idea actually saved');
  await sendChildMessage(page,'Make the donut spaceship bounce');
  assert.equal(await page.evaluate(()=>window.__jemsMilestones.filter(x=>x==='idea').length),0,'conversation does not emit cosmetic first-idea celebrations');
  await page.locator('#studioNavHome').click();
  assert.ok(await page.locator('[data-session] .jems-project-badge').count(),'honest badge on saved creation');
  await page.locator('footer [data-page="parent"]').click();
  await page.locator('[data-parent-tab="settings"]').click();
  await page.locator('#parentSubject').selectOption('both');await page.locator('#saveParent').click();
  await page.locator('#studioNavHome').click();
  assert.equal(await page.locator('#studioSubjectLanguage').isDisabled(),false);
  await page.locator('#studioNavMenu').click();
  await page.locator('#studioSubjectLanguage').click();
  assert.equal(await page.evaluate(()=>window.FG.learning.subject),'language');
  assert.equal(await page.locator('#studioLearningChoice').evaluate(e=>getComputedStyle(e).borderLeftColor),'rgb(139, 92, 246)');
  await navigate(page,'#studioNavPowers');
  assert.equal(await page.locator('#page-lab .panel').first().evaluate(e=>getComputedStyle(e).borderTopColor),'rgb(139, 92, 246)');
  await ctx.close();
  const reduced=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',serviceWorkers:'block'});
  const p=await reduced.newPage();await p.goto(base);await p.waitForFunction(()=>document.getElementById('jems-delight-host'));
  await p.evaluate(()=>window.dispatchEvent(new CustomEvent('jems:milestone',{detail:{kind:'kept'}})));
  await p.locator('.jems-delight-toast').waitFor({state:'visible'});
  assert.equal(await p.locator('.jems-delight-toast').getAttribute('aria-live'),'polite','retained achievement celebrations announce politely');
  assert.equal(await p.locator('.jems-delight-sparks').count(),0,'no floating pieces in reduced-motion mode');
  assert.equal(await p.locator('.jems-delight-toast').evaluate(e=>getComputedStyle(e).animationName),'none');
  await p.evaluate(()=>window.dispatchEvent(new CustomEvent('jems:milestone',{detail:{kind:'unsupported'}})));
  assert.equal(await p.locator('.jems-delight-toast').count(),1,'unsupported events ignored');
  const evidence=await p.evaluate(()=>JSON.stringify(FG.studio.exportNotebook()));
  await p.evaluate(()=>window.dispatchEvent(new CustomEvent('jems:milestone',{detail:{kind:'gem-cut',character:'nova',level:4}})));
  assert.equal(await p.locator('.jems-delight-toast .jems-rank-thumbnail').getAttribute('data-character'),'nova');
  assert.equal(await p.locator('.jems-delight-toast .jems-character-art').getAttribute('data-level'),'4','a project event respects the maker’s current earned outfit');
  assert.equal(await p.locator('.jems-delight-toast .jems-gem-art').count(),0,'progress celebration uses the human rank thumbnail');
  assert.equal(await p.locator('.jems-delight-toast').evaluate(e=>getComputedStyle(e).pointerEvents),'none','rank artwork never intercepts play controls');
  await p.evaluate(()=>window.dispatchEvent(new CustomEvent('jems:milestone',{detail:{kind:'builder-master',character:'spark',level:4}})));
  await p.evaluate(()=>document.fonts.ready);
  const mobilePopup=await p.locator('.jems-delight-toast').evaluate(toast=>({
   left:toast.getBoundingClientRect().left,right:toast.getBoundingClientRect().right,
   tile:toast.querySelector('.jems-rank-thumbnail').getBoundingClientRect().width,
   fits:toast.querySelector('.jems-delight-copy').scrollWidth<=toast.querySelector('.jems-delight-copy').clientWidth+1,
   font:getComputedStyle(toast.querySelector('strong')).fontFamily
  }));
  assert.ok(mobilePopup.left>=0&&mobilePopup.right<=390&&mobilePopup.fits,'rank popup and text fit the 390px viewport');
  assert.equal(Math.round(mobilePopup.tile),96,'mobile popup keeps the approved 96px full-figure tile');
  assert.match(mobilePopup.font,/Nunito/,'rank title uses the approved rounded brand font');
  fs.mkdirSync('test-results',{recursive:true});
  await p.screenshot({path:'test-results/jems-rank-popup-mobile.png'});
  assert.equal(await p.evaluate(()=>JSON.stringify(FG.studio.exportNotebook())),evidence,'rendering a celebration cannot award or persist progress');
  await p.evaluate(()=>window.dispatchEvent(new Event('factory-profile')));
  assert.equal(await p.locator('#jems-delight-host').evaluate(host=>host.childElementCount),0,'changing profile clears the previous maker celebration');
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
  await reduced.close();
  console.log('PASS jems joy: illustrated favorites, actual first saved idea, no spam, English accent, reduced motion');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
