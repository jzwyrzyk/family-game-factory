/* Real built storage-preview Studio; synthetic local players, no providers. */
const assert=require('node:assert/strict'),{chromium,webkit}=require('playwright');
const {start}=require('./browser-server.cjs'),{exploreWelcome,openProfiles}=require('./studio-entry.cjs');
const {installNativeResizeTrace}=require('./native-resize-trace.cjs');
async function checkHillResizeTransition(page){
 // Studio removes its fitted play layout when returning to editing. Hold that
 // ordinary layout transition long enough to deliver the real stage observer:
 // changing the child canvas height must not resize its observed parent again
 // within the same notification delivery.
 const result=await page.evaluate(async()=>{
  const shell=document.getElementById('page-studio'),game=document.querySelector('.quality-hill'),canvas=game.querySelector('canvas'),width=game.style.width;
  const frames=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await frames();shell.classList.remove('studio-play-mode');game.style.width='320px';await frames();
  const natural={width:canvas.width,height:canvas.height,stage:canvas.parentElement.getBoundingClientRect().height,dpr:Math.min(2,devicePixelRatio||1)};
  game.style.width=width;shell.classList.add('studio-play-mode');await frames();
  const fitted={width:canvas.width,height:canvas.height,rect:canvas.getBoundingClientRect().toJSON()};
  return {natural,fitted};
 });
 assert.equal(result.natural.width,Math.round(318*result.natural.dpr));
 assert.equal(result.natural.height,Math.round(290*result.natural.dpr));
 assert.equal(result.natural.stage,290,'ordinary stage follows the resized canvas');
 assert.ok(result.fitted.width>0&&result.fitted.height>0&&Math.abs(result.fitted.width/result.fitted.rect.width-result.fitted.height/result.fitted.rect.height)<.025,'returning to fitted play keeps uniform canvas scale');
}
(async()=>{
 const server=start(process.env.STUDIO_BUILD_DIR||'test-results/storage-preview'),browser=await (process.env.STORAGE_BROWSER==='webkit'?webkit:chromium).launch({...(process.env.STORAGE_BROWSER==='webkit'?{}:{executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']}),headless:true});
 try{
  for(const viewport of [{width:1400,height:960},{width:390,height:844}]){
   const context=await browser.newContext({viewport,reducedMotion:'reduce'}),page=await context.newPage(),errors=[];let phase='startup';
   page.on('pageerror',error=>{errors.push(error.message);console.error('Native Studio page error',JSON.stringify({phase,viewport,indexedNotebook:process.env.STUDIO_NOTEBOOK==='1',message:error.message}));});page.on('dialog',dialog=>dialog.accept());
   page.on('console',message=>{if(message.text().startsWith('JEMS_NATIVE_RESIZE_TRACE '))console.error(JSON.stringify({phase,viewport,indexedNotebook:process.env.STUDIO_NOTEBOOK==='1'}),message.text());});
   await page.addInitScript(installNativeResizeTrace);
   await page.route('**/v1/jobs**',route=>{throw Error('Unexpected paid request '+route.request().url());});
   await page.goto(`http://127.0.0.1:${server.address().port}/arcade/?studio=1`);await page.waitForFunction(()=>FG.studio&&FG.factory);await exploreWelcome(page);
   await page.evaluate(()=>{FG.store.changeProfile({rate:1});FG.store.current().mathWindow=[Date.now()];FG.store.save();});
   phase='first Rally and deliberate fitted/ordinary transition';await page.click('[data-starter="hill"]');await page.waitForSelector('.quality-hill');await checkHillResizeTransition(page);assert.deepEqual(await page.evaluate(()=>window.__hillResizeEffects),[],'Rally must not resize its observed stage within the same observer delivery');phase='return Home before preparation';await page.click('#studioHome');
   const before=await page.evaluate(()=>localStorage.getItem('family-game-factory-workspace-v2'));
   phase='prepare native authority';await page.evaluate(()=>FG.factory.prepareIndexedWorkspace());
   let originalNotebook;
   if(process.env.STUDIO_NOTEBOOK==='1'){phase='prepare notebook authority and reload';originalNotebook=await page.evaluate(()=>localStorage.getItem('family-game-factory-studio-v1'));await Promise.all([page.waitForNavigation(),page.evaluate(()=>FG.studio.prepareIndexedNotebook())]);await page.waitForFunction(()=>FG.studio&&FG.factory);}
   phase='open prepared Rally';await page.click('[data-starter="hill"]');await page.waitForSelector('.quality-hill');
   phase='garage mechanic change';await page.locator('.quality-hill summary').click();await page.getByRole('button',{name:'Make the wheels bigger',exact:true}).click();await page.waitForFunction(()=>FG.runtime.snapshot().config.wheelSize===.57);
   phase='Keep prepared Rally';await page.click('#studioKeep');await page.waitForFunction(async()=>{const book=await FG.studio.captureNotebook();return !book.sessions.find(s=>s.id===book.active[FG.store.current().id]).candidate;});
   const kept=await page.evaluate(async()=>{const s=(await FG.studio.captureNotebook()).sessions.find(s=>s.game==='hill'),w=await FG.factory.captureWorkspace();return {session:s.id,head:w.projects.find(p=>p.id===s.projectId).headId,config:w.revisions.find(r=>r.id===w.projects.find(p=>p.id===s.projectId).headId).config};});assert.equal(kept.config.wheelSize,.57);
   phase='open change and copy';await page.click('#studioChange');await page.click('#studioMore > summary');await page.click('#studioCopy');await page.fill('#studioCopyName','Indexed road trip');await page.click('#studioCopyForm button[type="submit"]');await page.waitForFunction(()=>document.getElementById('studioTitle')?.textContent==='Indexed road trip').catch(async error=>{console.error(await page.evaluate(()=>({status:document.getElementById('studioStatus')?.textContent,global:document.getElementById('studioGlobalStatus')?.textContent,title:document.getElementById('studioTitle')?.textContent})),errors);throw error;});
   assert.equal(await page.evaluate(()=>localStorage.getItem('family-game-factory-workspace-v2')),before,'Studio kept using indexed native authority');
   if(process.env.STUDIO_NOTEBOOK==='1')assert.equal(await page.evaluate(()=>localStorage.getItem('family-game-factory-studio-v1')),originalNotebook,'Indexed notebook original preserved');
   phase='reload kept copy';await page.reload();await page.waitForFunction(()=>FG.studio);await page.locator('#studioLibrary .studio-saved-open').filter({hasText:'Indexed road trip'}).click();await page.waitForSelector('.quality-hill');assert.equal(await page.evaluate(()=>FG.runtime.snapshot().config.wheelSize),.57);
   phase='edit draft and switch away';await page.click('#studioChange');await page.fill('#studioPrompt','Private saved thought');await openProfiles(page);await page.locator('.profile-choice').nth(1).click();await page.waitForFunction(()=>document.getElementById('studioPrompt').value==='');assert.equal(await page.locator('#studioLibrary [data-session]').count(),0);
   phase='switch back and reopen saved Rally';await openProfiles(page);await page.locator('.profile-choice').first().click();await page.locator('#studioLibrary .studio-saved-open').filter({hasText:'Indexed road trip'}).click();await page.click('#studioChange');assert.equal(await page.inputValue('#studioPrompt'),'Private saved thought');assert.deepEqual(await page.evaluate(()=>window.__hillResizeEffects),[],'saved Rally transitions do not resize a stage during observer delivery');assert.deepEqual(errors,[]);
   console.log(JSON.stringify({browser:process.env.STORAGE_BROWSER??'chromium',viewport,indexedNotebook:process.env.STUDIO_NOTEBOOK==='1',checks:['observer-safe Rally layout transition','same-tab migration selects authority','native Keep','compound copy','reload exact revision','profile switch and draft isolation']}));await context.close();
  }
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
