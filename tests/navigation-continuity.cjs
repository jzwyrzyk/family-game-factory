/* Default-URL regression for the collection that the legacy-only tests could reach.
 * All ideas/drawings below are synthetic historical records. No provider calls.
 */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {start}=require('./browser-server.cjs');
const {exploreWelcome,navigate,openProfiles,openRetainedGame}=require('./studio-entry.cjs');

const STATE='family-game-factory-state-v1',NOTEBOOK='family-game-factory-studio-v1',WORKSPACE='family-game-factory-workspace-v2';
const IDEAS=[
 {id:'navigation-idea-one',game:'new',type:'new game design',idea:'Fixture: a moon elevator made from jelly.',profile:'player1',createdAt:'2026-11-18T12:00:00.000Z'},
 {id:'navigation-idea-two',game:'robot',type:'feature',idea:'Fixture: a robot that carries a tiny garden.',profile:'player2',createdAt:'2026-11-18T13:00:00.000Z'},
 {id:'navigation-idea-older',game:'new',type:'new game design',idea:'Fixture: an older family idea with no assigned player.',createdAt:'2026-11-17T12:00:00.000Z'},
];
const DRAWINGS=[
 {id:'navigation-drawing-one',owner:'player1',name:'Fixture moon drawing',color:'#7c48db'},
 {id:'navigation-drawing-two',owner:'player2',name:'Fixture garden drawing',color:'#138974'},
];
const NAV=['studioNavHome','studioNavCreate','studioNavScenes','studioNavProblemSolving','studioNavJourney','studioNavRewards','studioNavPals','studioNavPowers'];
const unavailable=route=>route.fulfill({contentType:'application/json',body:JSON.stringify({version:1,mode:'unavailable'})});
const ready=page=>page.waitForFunction(()=>window.FG?.studio&&window.FG?.drawings&&window.FG?.creation&&window.FG?.problemSolving);

async function prepare(browser,base,viewport){
 const context=await browser.newContext({viewport,hasTouch:viewport.width<600});
 const page=await context.newPage(),errors=[],posts=[];
 page.setDefaultTimeout(15000);
 page.on('pageerror',error=>errors.push(error.message));
 page.on('request',request=>{if(request.method()==='POST')posts.push(request.url());});
 page.on('dialog',dialog=>void dialog.dismiss());
 await page.route('**/factory-config.json',unavailable);
 await page.goto(base);await ready(page);
 await exploreWelcome(page);
 return {context,page,errors,posts};
}

async function seedHistoricalRecords(page){
 // Populate the existing versioned stores before reloading the normal URL.
 // No migration or application-only test API is added for these old records.
 await page.evaluate(async({stateKey,ideas,drawings})=>{
  const state=window.FG.store.emptyBackup();state.feedback=ideas;state.activeProfile='player1';
  localStorage.setItem(stateKey,JSON.stringify(state));
  const db=await new Promise((resolve,reject)=>{
   const request=indexedDB.open('family-private-drawings-v1');
   request.onupgradeneeded=()=>request.result.createObjectStore('drawings',{keyPath:'id'});
   request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
  const records=[];
  for(const fixture of drawings){
   const canvas=document.createElement('canvas');canvas.width=32;canvas.height=40;
   const ctx=canvas.getContext('2d');ctx.fillStyle=fixture.color;ctx.fillRect(0,0,32,40);
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
   const bytes=await blob.arrayBuffer();
   const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
   records.push({id:fixture.id,owner:fixture.owner,name:fixture.name,mime:'image/png',bytes,preview:bytes.slice(0),sha256,createdAt:'2026-11-18T12:00:00.000Z'});
  }
  try{
   const tx=db.transaction('drawings','readwrite');
   const done=new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
   for(const record of records)tx.objectStore('drawings').put(record);
   await done;
  }finally{db.close();}
 },{stateKey:STATE,ideas:IDEAS,drawings:DRAWINGS});
 await page.reload();await ready(page);
}

async function choosePlayer(page,index){
 await openProfiles(page);
 await page.locator('#profile-choices .profile-choice').nth(index).click();
 await page.waitForFunction(id=>window.FG.store.current().id===id,'player'+(index+1));
 await page.locator('#page-studio-library').waitFor({state:'visible'});
 await exploreWelcome(page);
}

async function assertCollection(page,ownerIndex){
 await page.locator('#page-creations').waitFor({state:'visible'});
 const text=await page.locator('#feedbackList').innerText();
 for(const idea of IDEAS)assert.ok(text.includes(idea.idea),'the existing family-wide notebook retains '+idea.id);
 await page.locator('#drawingList').getByAltText(DRAWINGS[ownerIndex].name,{exact:true}).waitFor({state:'visible'});
 assert.equal(await page.locator('#drawingList article').count(),1,'drawings retain their existing per-profile boundary');
 assert.equal(await page.locator('#drawingList').getByAltText(DRAWINGS[1-ownerIndex].name,{exact:true}).count(),0,'another player’s drawing is not shown');
 assert.equal(await page.locator('#drawingUpload').isVisible(),true,'the drawing upload has a reachable page');
 assert.equal(await page.locator('#studioCollectionBack').isVisible(),true,'the collection has an explicit return');
 assert.deepEqual(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).feedback,STATE),IDEAS,'browsing does not rewrite historical family ideas');
}

async function assertCollectionContrast(page){
 const selectors=[
  '#builderLibraryStatus','#savedRemixes','#liveCollection > p',
  '#page-creations > .panel:has(#drawingUpload) > p:first-of-type',
  '#feedbackList .idea b','#feedbackList .idea p','#feedbackList .idea small',
 ];
 const samples=await page.evaluate(targets=>targets.flatMap(selector=>{
  const elements=[...document.querySelectorAll(selector)].filter(element=>element.textContent.trim()&&element.getClientRects().length);
  if(!elements.length)throw Error('Missing collection contrast sample: '+selector);
  return elements.map(element=>{
   let ancestor=element,background='rgb(255, 255, 255)';
   while(ancestor){
    const fill=getComputedStyle(ancestor).backgroundColor,rgba=fill.match(/[\d.]+/g).map(Number);
    if((rgba[3]??1)===1){background=fill;break;}
    ancestor=ancestor.parentElement;
   }
   return {selector,text:element.textContent.trim().slice(0,90),color:getComputedStyle(element).color,background};
  });
 }),selectors);
 const luminance=color=>color.match(/[\d.]+/g).slice(0,3).map(Number).map(value=>{
  const channel=value/255;return channel<=0.04045?channel/12.92:((channel+0.055)/1.055)**2.4;
 }).reduce((sum,value,index)=>sum+value*[0.2126,0.7152,0.0722][index],0);
 for(const sample of samples){
  const ink=luminance(sample.color),paper=luminance(sample.background);
  const contrast=(Math.max(ink,paper)+0.05)/(Math.min(ink,paper)+0.05);
  assert.ok(contrast>=4.5,`collection copy needs readable contrast: ${sample.selector} (${contrast.toFixed(2)}:1), ${sample.text}`);
 }
}

async function collectionJourney(browser,base,device,viewport){
 const {context,page,errors,posts}=await prepare(browser,base,viewport);
 try{
  await seedHistoricalRecords(page);
  assert.equal(new URL(page.url()).search,'','the regression starts in ordinary default mode');
  assert.equal(await page.locator('#page-studio-library').isVisible(),true);
  assert.equal(await page.locator('.studio-nav > button:visible').count(),3,'the compact shell has three primary actions');
  for(const id of NAV)assert.equal(await page.locator('#'+id).count(),1,id+' retains one authoritative route control');
  if(device==='phone'){
   const firstGame=await page.locator('#studioStarters [data-starter]').first().boundingBox();
   assert.ok(firstGame&&firstGame.y>=0&&firstGame.y+firstGame.height<=viewport.height,
     'restoring saved collections must not move the first complete playable game below the phone viewport');
  }
  for(const id of NAV.slice(0,2))assert.equal(await page.locator('#'+id).isVisible(),true,id+' stays in the primary navigation');
  await page.click('#studioNavMenu');
  for(const id of NAV.slice(2))assert.equal(await page.locator('#'+id).isVisible(),true,id+' is discoverable in Menu');
  await page.click('#studioMenuClose');
  const entry=page.getByRole('button',{name:'My Creations',exact:true});
  assert.equal(await entry.getAttribute('id'),'studioSavedIdeas');
  const target=await entry.boundingBox();assert.ok(target&&target.height>=44,'collection entry is a touch-sized target');
  await entry.focus();await page.keyboard.press('Enter');
  await assertCollection(page,0);
  await assertCollectionContrast(page);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true,'collection fits the '+device+' viewport');
  await page.screenshot({path:'test-results/navigation-collection-'+device+'.png',fullPage:true});
  await page.click('#studioCollectionBack');
  await page.locator('#page-studio-library').waitFor({state:'visible'});
  await navigate(page,'#studioNavJourney');await page.locator('#studioNavJourney[aria-current="page"]').waitFor({state:'attached'});
  await navigate(page,'#studioNavRewards');await page.locator('#studioNavRewards[aria-current="page"]').waitFor({state:'attached'});
  await navigate(page,'#studioNavPals');await page.locator('#page-jems-pals').waitFor({state:'visible'});
  assert.equal(await page.locator('#studioNavPals').getAttribute('aria-current'),'page');
  assert.deepEqual(await page.locator('.studio-nav button.active').evaluateAll(buttons=>buttons.map(button=>button.id)),['studioNavPals']);
  await navigate(page,'#studioNavHome');await page.click('#studioSavedIdeas');await assertCollection(page,0);
  await choosePlayer(page,1);await page.click('#studioSavedIdeas');await assertCollection(page,1);
  await page.reload();await ready(page);
  assert.equal(await page.evaluate(()=>window.FG.store.current().id),'player2','active player survives reload');
  await page.click('#studioSavedIdeas');await assertCollection(page,1);
  await choosePlayer(page,0);await page.click('#studioSavedIdeas');await assertCollection(page,0);
  await page.click('#studioCollectionBack');
  assert.deepEqual(errors,[],'no browser runtime errors');assert.deepEqual(posts,[],'collection navigation makes no provider POST');
  console.log(`PASS navigation ${device}: default entry, shared historical ideas, private drawings, readable collection copy, explicit return, eight routes and reload`);
 }catch(error){await page.screenshot({path:'test-results/navigation-'+device+'-failure.png',fullPage:true}).catch(()=>{});throw error;}
 finally{await context.close();}
}

async function failNotebookWrites(page,enabled){
 await page.evaluate(({key,enabled})=>{
  window.navigationOriginalSetItem??=Storage.prototype.setItem;
  Storage.prototype.setItem=enabled?function(name,value){
   if(this===localStorage&&name===key)throw new DOMException('Synthetic navigation save failure','QuotaExceededError');
   return window.navigationOriginalSetItem.call(this,name,value);
  }:window.navigationOriginalSetItem;
 },{key:NOTEBOOK,enabled});
}

async function recoveryJourney(browser,base){
 const {context,page,errors,posts}=await prepare(browser,base,{width:1280,height:900});
 try{
  await navigate(page,'#studioNavCreate');
  const prior='Fixture: a saved balloon library.';
  await page.fill('#studioPrompt',prior);
  await page.waitForFunction(text=>window.FG.studio.exportNotebook().sessions.some(s=>s.draft===text),prior);
  const durable=await page.evaluate(key=>localStorage.getItem(key),NOTEBOOK);
  await failNotebookWrites(page,true);
  const unsaved='Fixture: keep my new words when the device cannot save.';
  await page.fill('#studioPrompt',unsaved);
  await page.waitForFunction(()=>document.getElementById('studioDraftStatus').textContent.includes('Could not save'));
  await navigate(page,'#studioNavHome');
  assert.equal(await page.locator('#page-studio').isVisible(),true,'normal home navigation does not discard an unsaved draft');
  // Exercise the retained legacy route listener as well as the visible home path.
  // This event is intentionally synthetic; it does not claim a hidden item is clickable.
  await page.evaluate(()=>document.querySelector('.site-header nav:not(.studio-nav) [data-page="creations"]').click());
  assert.equal(await page.locator('#page-studio').isVisible(),true,'the restored collection route respects the same save guard');
  assert.equal(await page.locator('#page-creations').isVisible(),false);
  assert.equal(await page.inputValue('#studioPrompt'),unsaved);
  assert.equal(await page.evaluate(key=>localStorage.getItem(key),NOTEBOOK),durable,'a failed save does not overwrite the durable draft');
  await failNotebookWrites(page,false);await navigate(page,'#studioNavHome');
  await page.click('#studioSavedIdeas');await page.locator('#page-creations').waitFor({state:'visible'});
  assert.equal(await page.locator('#feedbackList .idea').count(),0,'an empty notebook remains a usable collection');
  assert.equal(await page.locator('#drawingUpload').isVisible(),true);
  await page.click('#studioCollectionBack');await page.reload();await ready(page);
  await page.click('#studioContinuePlaying');
  assert.equal(await page.inputValue('#studioPrompt'),unsaved,'retrying navigation saves the exact draft across reload');
  assert.deepEqual(errors,[]);assert.deepEqual(posts,[]);
  console.log('PASS navigation recovery: failed saves block both routes; retry preserves the exact draft; empty collection remains usable');
 }catch(error){await page.screenshot({path:'test-results/navigation-recovery-failure.png',fullPage:true}).catch(()=>{});throw error;}
 finally{await context.close();}
}

async function workspaceIntegrityJourney(browser,base){
 const {context,page,errors,posts}=await prepare(browser,base,{width:1280,height:900});
 const workspace=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),WORKSPACE);
 try{
  await openRetainedGame(page,'buckets');
  await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key))?.projects.length===1,WORKSPACE);
  await navigate(page,'studioNavHome');await page.reload();await ready(page);
  const original=(await workspace()).projects[0];
  // The legacy store now knows the first game. Keep this same document alive
  // while Studio adds a second game through its actual adapter and controls.
  await openRetainedGame(page,'dragon');
  await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key))?.projects.length===2,WORKSPACE);
  const before=await workspace();
  await navigate(page,'studioNavHome');await page.click('#studioSavedIdeas');
  await page.locator('#savedRemixes').getByRole('button',{name:original.name,exact:true}).click();
  await page.locator('#liveKeep').waitFor({state:'visible'});await page.click('#liveKeep');
  assert.match(await page.textContent('#liveStatus'),/pinned/);
  const saved=await workspace();
  assert.deepEqual(saved.projects.map(p=>p.id),before.projects.map(p=>p.id),'legacy Keep preserves the game created by Studio after this document loaded');
  assert.deepEqual(saved.revisions,before.revisions,'both immutable starting versions survive');
  assert.equal(saved.projects.find(p=>p.id===original.id).keptId,original.headId);
  assert.deepEqual(await page.evaluate(()=>FG.factory.exportWorkspace()),saved,'legacy export reads the same latest workspace');
  await page.reload();await ready(page);
  assert.deepEqual(await workspace(),saved,'both games survive reload');
  const sessions=await page.evaluate(()=>FG.studio.exportNotebook().sessions);
  for(const project of saved.projects)assert.ok(sessions.some(s=>s.projectId===project.id),'the Studio notebook retains its saved game '+project.id);
  assert.deepEqual(errors,[]);assert.deepEqual(posts,[]);
  console.log('PASS workspace integrity: create in Studio, reopen the original through Saved ideas & drawings, Keep in Live Remix, and reload without losing either game');
 }catch(error){await page.screenshot({path:'test-results/navigation-workspace-integrity-failure.png',fullPage:true}).catch(()=>{});throw error;}
 finally{await context.close();}
}

async function notebookCapacityJourney(browser,base){
 const {context,page,errors,posts}=await prepare(browser,base,{width:1280,height:900});
 const notebook=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),NOTEBOOK);
 try{
  const draft='My next unsent idea';
  await openRetainedGame(page,'buckets');await page.click('#studioChange');
  await page.fill('#studioPrompt',draft);await navigate(page,'studioNavHome');
  assert.equal((await notebook()).sessions[0].draft,draft,'the real composer saves the unsent draft before historical messages are seeded');
  const sourceId=await page.evaluate(key=>{
   // Reload flushes the live composer. Seed only retained history; replacing
   // its draft behind that editor would correctly be overwritten on unload.
   const n=JSON.parse(localStorage.getItem(key)),s=n.sessions[0];s.playOnly=false;
   s.messages=Array.from({length:200},(_,i)=>({id:'capacity-turn-'+i,role:i%2?'helper':'child',text:'Original saved words '+i,at:'2026-11-21T00:00:00Z'}));
   localStorage.setItem(key,JSON.stringify(n));return s.id;
  },NOTEBOOK);
  await page.reload();await ready(page);await exploreWelcome(page);
  await page.locator(`[data-session="${sourceId}"] .studio-saved-open`).click();
  assert.equal(await page.inputValue('#studioPrompt'),draft,'the saved draft survives reload before copying');
  await page.locator('#studioMore > summary').click();await page.click('#studioCopy');
  await page.fill('#studioCopyName','Full chat copy');await page.locator('#studioCopyForm button[type="submit"]').click();
  await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).sessions.some(s=>s.name==='Full chat copy'),NOTEBOOK);
  const copied=(await notebook()).sessions.find(s=>s.name==='Full chat copy');
  assert.equal(copied.messages.length,200,'ordinary copy preserves the whole conversation without failing on an extra helper note');
  assert.equal(copied.draft,draft,'ordinary copy preserves the unsent draft');
  await page.click('#studioChange');await page.locator('#studioContinueChat').waitFor({state:'visible'});
  await page.click('#studioContinueChat');
  assert.equal(await page.inputValue('#studioPrompt'),draft,'continuation preserves the unsent draft');
  const continued=await notebook(),chapter=continued.conversationChapters[0];
  assert.deepEqual(chapter.messages,continued.sessions.find(s=>s.id===sourceId).messages);
  assert.equal(continued.sessions.find(s=>s.id===copied.id).messages.length,0);
  const next='I want a moon above the buckets.';await page.fill('#studioPrompt',next);await page.click('#studioTalk');
  await page.waitForFunction(({key,id,text})=>{const s=JSON.parse(localStorage.getItem(key)).sessions.find(s=>s.id===id);return s.messages.length>=2&&s.messages.some(m=>m.role==='child'&&m.text===text)&&!document.getElementById('coachModeStatus').classList.contains('is-thinking');},{key:NOTEBOOK,id:copied.id,text:next});
  assert.deepEqual((await notebook()).conversationChapters[0],chapter,'the next exchange does not rewrite the saved chapter');
  await page.reload();await ready(page);
  assert.deepEqual((await notebook()).conversationChapters[0],chapter,'the exact earlier words survive reload');

  // Fill only synthetic notebook records. The existing native games become
  // unlisted here, exercising the capacity-safe legacy recovery entrance too.
  await page.evaluate(key=>{
   const n=JSON.parse(localStorage.getItem(key)),template=n.sessions[0],owner=template.owner;
   n.sessions=Array.from({length:80},(_,i)=>({...template,id:'full-session-'+i,name:'Saved idea '+i,game:'new',projectId:null,remoteId:null,rewardProjectId:'full-session-'+i,messages:[],draft:'',candidate:null,undone:null,job:null,experiments:[],keptExperiments:[],verifiedRemoteExperiments:[],selectedTest:null,pendingExperiment:null,playOnly:false,archived:true,previousConversationId:undefined}));
   n.active={[owner]:n.sessions[0].id};delete n.conversationChapters;n.rewardOutbox=[];localStorage.setItem(key,JSON.stringify(n));
  },NOTEBOOK);
  await page.reload();await ready(page);await exploreWelcome(page);
  await page.locator('#studioNotebookCapacity').waitFor({state:'visible'});
  const before=await page.evaluate(({book,games})=>[localStorage.getItem(book),localStorage.getItem(games)],{book:NOTEBOOK,games:WORKSPACE});
  await openRetainedGame(page,'dragon');
  assert.deepEqual(await page.evaluate(({book,games})=>[localStorage.getItem(book),localStorage.getItem(games)],{book:NOTEBOOK,games:WORKSPACE}),before,'full notebook fails before writing an orphan native game');
  await page.locator('#studioCollectionBack').click();
  await page.locator('#studioArchived summary').click();await page.getByRole('button',{name:'Bring back Saved idea 0',exact:true}).click();
  const full=await notebook();assert.equal(full.sessions.length,80);assert.equal(full.sessions.filter(s=>!s.archived).length,1);
  await page.locator('#studioNotebookCapacity summary').click();assert.match(await page.textContent('#studioNotebookCapacity'),/80 of 80.*1 open jems, 79 put-away jems/s);
  await page.getByRole('button',{name:'Open saved remixes',exact:true}).click();await page.locator('#savedRemixes button').first().waitFor({state:'visible'});
  assert.deepEqual(errors,[]);assert.deepEqual(posts,[]);
  console.log('PASS notebook capacity: full copy, explicit continuation, next exchange, exact history reload, truthful full archive and preflight without orphan games');
 }catch(error){await page.screenshot({path:'test-results/navigation-notebook-capacity-failure.png',fullPage:true}).catch(()=>{});throw error;}
 finally{await context.close();}
}

async function legacyReturn(browser,base){
 for(const modes of ['arcade=1','studio=0','arcade=1&studio=0']){
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/factory-config.json',unavailable);
  try{
   const old=new URL(base);old.search=modes+'&source=navigation-fixture';old.hash='saved-work';
   await page.goto(old.href);await page.waitForFunction(()=>window.FG?.app&&window.FG?.drawings);
   assert.equal(await page.evaluate(()=>Boolean(window.FG?.studio)),false,'explicit legacy mode still works');
   const link=page.getByRole('link',{name:'Open current Jems',exact:true});await link.waitFor({state:'visible'});
   const expected=new URL(old);expected.searchParams.delete('arcade');if(expected.searchParams.get('studio')==='0')expected.searchParams.delete('studio');
   assert.equal(new URL(await link.getAttribute('href'),page.url()).href,expected.href,'return link removes only legacy mode flags');
   await Promise.all([page.waitForURL(expected.href),link.click()]);await ready(page);
   await exploreWelcome(page);
   assert.equal(await page.locator('#page-studio-library').isVisible(),true,'the visible link reaches the modern home');
   assert.equal(await page.locator('#studioSavedIdeas').isVisible(),true);
   assert.deepEqual(errors,[]);
  }finally{await context.close();}
 }
 console.log('PASS legacy return: both old entry flags have a visible modern link; unrelated query and hash survive');
}

(async()=>{
 const server=start();let browser;
 fs.mkdirSync('test-results',{recursive:true});
 try{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(!process.env.CI&&fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']});
  const base=`http://127.0.0.1:${server.address().port}/arcade/`;
  await collectionJourney(browser,base,'desktop',{width:1280,height:900});
  await collectionJourney(browser,base,'phone',{width:390,height:844});
  await recoveryJourney(browser,base);
  await workspaceIntegrityJourney(browser,base);
  await notebookCapacityJourney(browser,base);
  await legacyReturn(browser,base);
 }finally{await browser?.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
