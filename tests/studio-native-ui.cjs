/* Real built storage-preview Studio; synthetic local players, no providers. */
const assert=require('node:assert/strict'),{chromium,webkit}=require('playwright');
const {clickFittedControl}=require('./studio-fitted-input.cjs');
const {start}=require('./browser-server.cjs'),{exploreWelcome,openProfiles}=require('./studio-entry.cjs');
const {installNativeResizeTrace,installNativeResizeErrorCapture}=require('./native-resize-trace.cjs');
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
async function checkPlaySubscriptions(page,active){
 const targets=await page.evaluate(()=>window.__nativeResizeSubscriptions().flatMap(observer=>observer.targets).filter(target=>target.id==='studioGameHost'||target.classes.split(' ').includes('site-header')));
 assert.equal(targets.filter(target=>target.id==='studioGameHost').length,active?1:0,'only active fitted play observes the game host');
 assert.equal(targets.filter(target=>target.classes.split(' ').includes('site-header')).length,active?1:0,'only active fitted play observes the header');
}
async function observeEmptyPlayHost(page){
 await page.evaluate(()=>{
  window.__emptyPlayHostSubscriptions=[];
  const shell=document.getElementById('page-studio'),host=document.getElementById('studioGameHost');
  const observer=new MutationObserver(()=>{
   if(shell.classList.contains('hidden')||shell.classList.contains('studio-play-mode')||host.querySelector('.quality-hill'))return;
   window.__emptyPlayHostSubscriptions.push(window.__nativeResizeSubscriptions().flatMap(row=>row.targets).filter(target=>target.id==='studioGameHost'||target.classes.split(' ').includes('site-header')));
  });
  observer.observe(shell,{attributes:true,attributeFilter:['class']});observer.observe(host,{childList:true,subtree:true});
  window.__stopEmptyPlayHostObservation=()=>observer.disconnect();
 });
}
async function checkPendingNativeChange(page){
 const before=await page.evaluate(async()=>{const book=await FG.studio.captureNotebook(),owner=FG.store.current().id,id=book.active[owner];return {owner,id,draft:book.sessions.find(s=>s.id===id).draft};});
 assert.equal(before.draft,'Private saved thought');
 for(const stage of ['revealed','mounted']){
  await page.click('#studioHome');await page.waitForFunction(()=>document.getElementById('page-studio').classList.contains('hidden'));
  await page.evaluate(stage=>{
   const shell=document.getElementById('page-studio'),host=document.getElementById('studioGameHost');window.__pendingNativeChange=[];
   const observer=new MutationObserver(()=>{
    if(shell.classList.contains('hidden')||shell.classList.contains('studio-play-mode')||host.querySelector('.quality-hill'))return;
    const native=host.querySelector('#page-game');if(stage==='mounted'&&(!native||native.classList.contains('hidden')))return;
    observer.disconnect();const button=document.getElementById('studioChange');
    window.__pendingNativeChange.push({stage,disabled:button.disabled,fitted:false,hill:false});button.click();
   });observer.observe(host,{childList:true,subtree:true});observer.observe(shell,{attributes:true,attributeFilter:['class']});
  },stage);
  await page.locator('#studioLibrary .studio-saved-open').filter({hasText:'Indexed road trip'}).click();
  const after=await page.evaluate(async()=>{
   // Capture drains actual UI actions; a Change discovered while open waits is
   // included by the second drain. There is no mocked storage or fixed sleep.
   await FG.studio.captureNotebook();const book=await FG.studio.captureNotebook(),owner=FG.store.current().id,id=book.active[owner],shell=document.getElementById('page-studio');
   return {events:window.__pendingNativeChange,owner,id,draft:book.sessions.find(s=>s.id===id).draft,input:document.getElementById('studioPrompt').value,panel:shell.querySelector('.studio-workspace').dataset.mobilePanel,fitted:shell.classList.contains('studio-play-mode'),hill:!!document.querySelector('.quality-hill')};
  });
  assert.deepEqual(after.events,[{stage,disabled:false,fitted:false,hill:false}],'Change uses the real enabled button in the pending local read');
  assert.equal(after.panel,'talk','the newer Change action wins over delayed local playback');assert.equal(after.fitted,false);assert.equal(after.hill,false);assert.equal(await page.locator('#studioPrompt').isVisible(),true);
  assert.deepEqual({owner:after.owner,id:after.id,draft:after.draft},before);assert.equal(after.input,before.draft);
  await page.click('#studioPlay');await page.waitForFunction(()=>document.getElementById('page-studio').classList.contains('studio-play-mode'));assert.equal(await page.evaluate(()=>FG.runtime.snapshot().config.wheelSize),.57,'a later explicit Play still opens the exact kept revision');
  await clickFittedControl(page,'#studioChange');await page.waitForFunction(()=>!document.querySelector('.quality-hill'));
 }
}
async function checkUnwrappedNativeLifecycle(context,url,viewport){
 const page=await context.newPage(),errors=[];let phase='unwrapped startup';
 page.on('pageerror',error=>errors.push({phase,message:error.message}));
 page.on('console',message=>{if(message.text().startsWith('JEMS_NATIVE_RESIZE_CONTROL ')){const detail=JSON.parse(message.text().slice('JEMS_NATIVE_RESIZE_CONTROL '.length));errors.push({phase,message:detail.message});console.error(JSON.stringify({phase,viewport,indexedNotebook:process.env.STUDIO_NOTEBOOK==='1'}),message.text());}});
 await page.addInitScript(installNativeResizeErrorCapture);
 await page.route('**/v1/jobs**',route=>{throw Error('Unexpected paid request '+route.request().url());});
 await page.goto(url);await page.waitForFunction(()=>FG.studio&&FG.factory);
 // The previous page's exact saved game and prepared authorities remain in this
 // context. This page has never wrapped ResizeObserver, RAF or canvas setters.
 const frames=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(resolve,0))))));
 const sizes=viewport.width>600?[{width:1280,height:800},viewport,{width:1024,height:768},viewport]:[{width:320,height:667},viewport,{width:844,height:390},viewport];
 for(const [cycle,size] of sizes.entries()){
  phase=`unwrapped cycle ${cycle+1}: Home to saved Rally`;
  await page.locator('#studioLibrary .studio-saved-open').filter({hasText:'Indexed road trip'}).click();await page.waitForSelector('.quality-hill');
  phase=`unwrapped cycle ${cycle+1}: garage and viewport`;
  await clickFittedControl(page,'.quality-hill summary');await page.setViewportSize(size);await frames();
  const fitted=await page.locator('.quality-hill canvas').evaluate(canvas=>{const rect=canvas.getBoundingClientRect();return {width:canvas.width,height:canvas.height,rect:rect.toJSON()};});
  assert.ok(fitted.width>0&&fitted.height>0&&Math.abs(fitted.width/fitted.rect.width-fitted.height/fitted.rect.height)<.025,'unwrapped native resize keeps uniform canvas scale');
  await clickFittedControl(page,'.quality-hill summary');
  phase=`unwrapped cycle ${cycle+1}: Change and Back`;
  await clickFittedControl(page,'#studioChange');await page.waitForFunction(()=>!document.querySelector('.quality-hill')&&!document.getElementById('page-studio').classList.contains('studio-play-mode'));
  await page.click('#studioPlay');
  await page.waitForSelector('.quality-hill');await frames();assert.equal(await page.evaluate(()=>FG.runtime.snapshot().config.wheelSize),.57);
  phase=`unwrapped cycle ${cycle+1}: return Home`;
  await page.click('#studioHome');await page.waitForFunction(()=>!document.querySelector('.quality-hill'));await frames();
 }
 assert.equal(await page.evaluate(()=>window.__nativeResizeUntouched()),true,'the lifecycle control leaves native observer, frame and canvas setters untouched');
 assert.deepEqual(await page.evaluate(()=>window.__nativeResizeErrors),[],'native error delivery stays visible even when Playwright omits pageerror');
 assert.deepEqual(errors,[],'every native lifecycle error is retained across all cycles');
 console.log(JSON.stringify({browser:process.env.STORAGE_BROWSER??'chromium',viewport,indexedNotebook:process.env.STUDIO_NOTEBOOK==='1',checks:['native unwrapped observer/frame control','four actual saved Rally garage/viewport/Change/Back/Home cycles','exact kept mechanic after every remount']}));await page.close();
}
(async()=>{
 const server=start(process.env.STUDIO_BUILD_DIR||'test-results/storage-preview'),browser=await (process.env.STORAGE_BROWSER==='webkit'?webkit:chromium).launch({...(process.env.STORAGE_BROWSER==='webkit'?{}:{executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']}),headless:true});
 try{
  for(const viewport of [{width:1400,height:960},{width:390,height:844}]){
   const context=await browser.newContext({viewport,reducedMotion:'reduce'}),page=await context.newPage(),errors=[];let phase='startup';
   page.on('pageerror',error=>{errors.push(error.message);console.error('Native Studio page error',JSON.stringify({phase,viewport,indexedNotebook:process.env.STUDIO_NOTEBOOK==='1',message:error.message}));});page.on('dialog',dialog=>dialog.accept());
   page.on('console',message=>{if(message.text().startsWith('JEMS_NATIVE_RESIZE_TRACE ')){const detail=JSON.parse(message.text().slice('JEMS_NATIVE_RESIZE_TRACE '.length));errors.push('Native resize ErrorEvent: '+detail.message);console.error(JSON.stringify({phase,viewport,indexedNotebook:process.env.STUDIO_NOTEBOOK==='1'}),message.text());}});
   await page.addInitScript(installNativeResizeTrace);
   await page.route('**/v1/jobs**',route=>{throw Error('Unexpected paid request '+route.request().url());});
   await page.goto(`http://127.0.0.1:${server.address().port}/arcade/?studio=1`);await page.waitForFunction(()=>FG.studio&&FG.factory);await exploreWelcome(page);
   await checkPlaySubscriptions(page,false);
   await page.evaluate(()=>{FG.store.changeProfile({rate:1});FG.store.current().mathWindow=[Date.now()];FG.store.save();});
   phase='first Rally and deliberate fitted/ordinary transition';await page.click('[data-starter="hill"]');await page.waitForSelector('.quality-hill');await checkHillResizeTransition(page);await checkPlaySubscriptions(page,true);assert.deepEqual(await page.evaluate(()=>window.__hillResizeEffects),[],'Rally must not write canvas dimensions within observer delivery');phase='return Home before preparation';await page.click('#studioHome');await page.waitForFunction(()=>!document.querySelector('.quality-hill'));await checkPlaySubscriptions(page,false);
   const before=await page.evaluate(()=>localStorage.getItem('family-game-factory-workspace-v2'));
   phase='prepare native authority';await page.evaluate(()=>FG.factory.prepareIndexedWorkspace());
   let originalNotebook;
   if(process.env.STUDIO_NOTEBOOK==='1'){phase='prepare notebook authority and reload';originalNotebook=await page.evaluate(()=>localStorage.getItem('family-game-factory-studio-v1'));assert.deepEqual(await page.evaluate(()=>window.__hillResizeEffects),[],'preparation does not write canvas dimensions during observer delivery');await Promise.all([page.waitForNavigation(),page.evaluate(()=>FG.studio.prepareIndexedNotebook())]);await page.waitForFunction(()=>FG.studio&&FG.factory);}
   phase='open prepared Rally';await page.click('[data-starter="hill"]');await page.waitForSelector('.quality-hill');
   phase='garage mechanic change';await clickFittedControl(page,'.quality-hill summary');await page.getByRole('button',{name:'Make the wheels bigger',exact:true}).click();await page.waitForFunction(()=>FG.runtime.snapshot().config.wheelSize===.57);
   phase='Keep prepared Rally';await page.click('#studioKeep');await page.waitForFunction(async()=>{const book=await FG.studio.captureNotebook();return !book.sessions.find(s=>s.id===book.active[FG.store.current().id]).candidate;});
   const kept=await page.evaluate(async()=>{const s=(await FG.studio.captureNotebook()).sessions.find(s=>s.game==='hill'),w=await FG.factory.captureWorkspace();return {session:s.id,head:w.projects.find(p=>p.id===s.projectId).headId,config:w.revisions.find(r=>r.id===w.projects.find(p=>p.id===s.projectId).headId).config};});assert.equal(kept.config.wheelSize,.57);
   phase='open change and copy';await clickFittedControl(page,'#studioChange');await page.click('#studioMore > summary');await page.click('#studioCopy');await page.fill('#studioCopyName','Indexed road trip');await page.click('#studioCopyForm button[type="submit"]');await page.waitForFunction(()=>document.getElementById('studioTitle')?.textContent==='Indexed road trip').catch(async error=>{console.error(await page.evaluate(()=>({status:document.getElementById('studioStatus')?.textContent,global:document.getElementById('studioGlobalStatus')?.textContent,title:document.getElementById('studioTitle')?.textContent})),errors);throw error;});
   assert.equal(await page.evaluate(()=>localStorage.getItem('family-game-factory-workspace-v2')),before,'Studio kept using indexed native authority');
   if(process.env.STUDIO_NOTEBOOK==='1')assert.equal(await page.evaluate(()=>localStorage.getItem('family-game-factory-studio-v1')),originalNotebook,'Indexed notebook original preserved');
   assert.deepEqual(await page.evaluate(()=>window.__hillResizeEffects),[],'prepared Keep and copy do not write canvas dimensions during observer delivery');
   phase='reload kept copy';await page.reload();await page.waitForFunction(()=>FG.studio);await observeEmptyPlayHost(page);await page.locator('#studioLibrary .studio-saved-open').filter({hasText:'Indexed road trip'}).click();await page.waitForSelector('.quality-hill');await page.waitForFunction(()=>document.getElementById('page-studio').classList.contains('studio-play-mode'));await checkPlaySubscriptions(page,true);const emptyHost=await page.evaluate(()=>{window.__stopEmptyPlayHostObservation();return window.__emptyPlayHostSubscriptions;});assert.ok(emptyHost.length,'saved opening exposes its real empty host while the indexed revision loads');assert.ok(emptyHost.every(targets=>targets.length===0),'the revealed empty host has no inactive play subscriptions');assert.equal(await page.evaluate(()=>FG.runtime.snapshot().config.wheelSize),.57);
   phase='edit draft and switch away';await clickFittedControl(page,'#studioChange');await page.fill('#studioPrompt','Private saved thought');await openProfiles(page);await page.locator('.profile-choice').nth(1).click();await page.waitForFunction(()=>document.getElementById('studioPrompt').value==='');assert.equal(await page.locator('#studioLibrary [data-session]').count(),0);
   phase='switch back and reopen saved Rally';await openProfiles(page);await page.locator('.profile-choice').first().click();await page.locator('#studioLibrary .studio-saved-open').filter({hasText:'Indexed road trip'}).click();await page.waitForSelector('.quality-hill');await page.waitForFunction(()=>document.getElementById('page-studio').classList.contains('studio-play-mode'));await clickFittedControl(page,'#studioChange');assert.equal(await page.inputValue('#studioPrompt'),'Private saved thought');await page.waitForFunction(()=>!document.querySelector('.quality-hill'));await checkPlaySubscriptions(page,false);assert.deepEqual(await page.evaluate(()=>window.__hillResizeEffects),[],'saved Rally transitions do not write canvas dimensions during observer delivery');assert.deepEqual(errors,[]);
   phase='Change during pending local revision';await checkPendingNativeChange(page);await checkPlaySubscriptions(page,false);assert.deepEqual(errors,[]);
   console.log(JSON.stringify({browser:process.env.STORAGE_BROWSER??'chromium',viewport,indexedNotebook:process.env.STUDIO_NOTEBOOK==='1',checks:['active-only fitted play observations','unobserved real empty-host revision-loading gap','observer-safe Rally layout transition','same-tab migration selects authority','native Keep','compound copy','reload exact revision','profile switch and draft isolation','Change wins in both pending local read gaps','later explicit Play preserves owner/draft/kept revision']}));await page.close();
   await checkUnwrappedNativeLifecycle(context,`http://127.0.0.1:${server.address().port}/arcade/?studio=1`,viewport);await context.close();
  }
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
