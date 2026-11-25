/* Real built storage-preview Studio; synthetic local players, no providers. */
const assert=require('node:assert/strict'),{chromium}=require('playwright');
const {start}=require('./browser-server.cjs'),{exploreWelcome,openProfiles}=require('./studio-entry.cjs');
(async()=>{
 const server=start(process.env.STUDIO_BUILD_DIR||'test-results/storage-preview'),browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox'],headless:true});
 try{
  for(const viewport of [{width:1400,height:960},{width:390,height:844}]){
   const context=await browser.newContext({viewport,reducedMotion:'reduce'}),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
   await page.route('**/v1/jobs**',route=>{throw Error('Unexpected paid request '+route.request().url());});
   await page.goto(`http://127.0.0.1:${server.address().port}/arcade/?studio=1`);await page.waitForFunction(()=>FG.studio&&FG.factory);await exploreWelcome(page);
   await page.evaluate(()=>{FG.store.changeProfile({rate:1});FG.store.current().mathWindow=[Date.now()];FG.store.save();});
   await page.click('[data-starter="hill"]');await page.waitForSelector('.quality-hill');await page.click('#studioHome');
   const before=await page.evaluate(()=>localStorage.getItem('family-game-factory-workspace-v2'));
   await page.evaluate(()=>FG.factory.prepareIndexedWorkspace());
   await page.click('[data-starter="hill"]');await page.waitForSelector('.quality-hill');
   await page.locator('.quality-hill summary').click();await page.getByRole('button',{name:'Make the wheels bigger',exact:true}).click();await page.waitForFunction(()=>FG.runtime.snapshot().config.wheelSize===.57);
   await page.click('#studioKeep');await page.waitForFunction(()=>!FG.studio.exportNotebook().sessions.find(s=>s.id===FG.studio.exportNotebook().active[FG.store.current().id]).candidate);
   const kept=await page.evaluate(async()=>{const s=FG.studio.exportNotebook().sessions.find(s=>s.game==='hill'),w=await FG.factory.captureWorkspace();return {session:s.id,head:w.projects.find(p=>p.id===s.projectId).headId,config:w.revisions.find(r=>r.id===w.projects.find(p=>p.id===s.projectId).headId).config};});assert.equal(kept.config.wheelSize,.57);
   await page.click('#studioChange');await page.click('#studioMore > summary');await page.click('#studioCopy');await page.fill('#studioCopyName','Indexed road trip');await page.click('#studioCopyForm button[type="submit"]');await page.waitForFunction(()=>document.getElementById('studioTitle')?.textContent==='Indexed road trip');
   assert.equal(await page.evaluate(()=>localStorage.getItem('family-game-factory-workspace-v2')),before,'Studio kept using indexed native authority');
   await page.reload();await page.waitForFunction(()=>FG.studio);await page.locator('#studioLibrary .studio-saved-open').filter({hasText:'Indexed road trip'}).click();await page.waitForSelector('.quality-hill');assert.equal(await page.evaluate(()=>FG.runtime.snapshot().config.wheelSize),.57);
   await page.click('#studioChange');await page.fill('#studioPrompt','Private saved thought');await openProfiles(page);await page.locator('.profile-choice').nth(1).click();await page.waitForFunction(()=>document.getElementById('studioPrompt').value==='');assert.equal(await page.locator('#studioLibrary [data-session]').count(),0);
   await openProfiles(page);await page.locator('.profile-choice').first().click();await page.locator('#studioLibrary .studio-saved-open').filter({hasText:'Indexed road trip'}).click();await page.click('#studioChange');assert.equal(await page.inputValue('#studioPrompt'),'Private saved thought');assert.deepEqual(errors,[]);
   console.log(JSON.stringify({viewport,checks:['same-tab migration selects authority','native Keep','compound copy','reload exact revision','profile switch and draft isolation']}));await context.close();
  }
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
