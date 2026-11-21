const {exploreWelcome,navigate,openProfiles}=require('./studio-entry.cjs');
/* Production-browser checks for the earned, owner-scoped illustrated journey.
 * Notebook fixtures below use the production schema/API; they are isolated test
 * data, never demo progress in the application. The final milestone is exercised
 * through real local previews, reflection/notes, and the explicit Keep action.
 * Run after npm run build: node --import tsx tests/gem-journey-browser.cjs
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {once}=require('node:events');
const {chromium}=require('playwright');
const {start}=require('./browser-server.cjs');
const {StudioNotebook,STUDIO_KEY,validateNotebook}=require('../src/studio/notebook.ts');
const {builderJourney,gemStage}=require('../src/brand/gem-progress.ts');
const {defaults}=require('../src/runtime/manifests.ts');

function memoryNotebook(initial){
 const values=new Map(initial?[[STUDIO_KEY,JSON.stringify(initial)]]:[]);
 return new StudioNotebook({getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)});
}
function polishedFixture(notebook,owner,label){
 const session=notebook.create(owner,'gum',label,'fixture-project-'+crypto.randomUUID());
 const baseId='fixture-base-'+crypto.randomUUID(),testId='fixture-test-'+crypto.randomUUID();
 const candidate={id:testId,baseId,config:{...defaults('gum'),extraDecoys:2},prompt:'Give me 2 extra stickers',summary:'Two extra sticker choices'};
 notebook.saveExperiment(session.id,owner,candidate);
 notebook.observe(session.id,owner,'I tried the extra stickers and liked the new choices.','child',testId);
 notebook.keepExperiment(session.id,owner,testId,{revisionId:testId,baseId,kind:'local'});
 return notebook.get(session.id,owner);
}
function visualFixture(){
 const notebook=memoryNotebook();
 polishedFixture(notebook,'player1','Moon garden');
 notebook.setAvatar('player1','spark');
 for(const title of ['Sky garden','Silly workshop','Crystal trail'])polishedFixture(notebook,'player2',title);
 notebook.setAvatar('player2','nova');
 notebook.dismissWelcome('player3');
 // This is historical source evidence, without a new pending reward handoff.
 // Production-created pending facts are exercised by the real workflow below.
 const historical=notebook.read();delete historical.rewardOutbox;
 return validateNotebook(historical);
}

(async()=>{
 const server=start();
 let browser;
 try{
 await once(server,'listening');
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox']});
 const base='http://127.0.0.1:'+server.address().port+'/arcade/';
 fs.mkdirSync('test-results',{recursive:true});
 const newPage=async({fixture,viewport={width:1400,height:1000},reducedMotion='reduce'}={})=>{
  // Existing owners may have dismissed the former welcome without choosing a
  // maker. Their neutral artwork and later choice remain supported; the new
  // first-time character-first journey has its own browser acceptance suite.
  if(!fixture){
   const existing=memoryNotebook();
   for(const owner of ['player1','player2','player3'])existing.dismissWelcome(owner);
   fixture=existing.read();
  }
  const context=await browser.newContext({viewport,reducedMotion});
  await context.addInitScript(({key,fixture})=>{
   if(window.top!==window)return;
   window.__jemsMilestones=[];
   window.addEventListener('jems:milestone',event=>window.__jemsMilestones.push(event.detail));
   window.__jemsRewardPopups=[];
   const seen=new WeakSet();
   const recordPopup=element=>{
    if(!element.matches('.jems-rewards-toast')||seen.has(element))return;
    seen.add(element);
    window.__jemsRewardPopups.push({kind:'reward-popup',level:Number(element.dataset.makerLevel)||0,rewardIds:JSON.parse(element.dataset.rewardIds||'[]')});
   };
   new MutationObserver(records=>{
    for(const record of records)for(const added of record.addedNodes){
     if(!(added instanceof Element))continue;
     recordPopup(added);added.querySelectorAll('.jems-rewards-toast').forEach(recordPopup);
    }
   }).observe(document,{childList:true,subtree:true});
   if(fixture&&!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(fixture));
  },{key:STUDIO_KEY,fixture});
  const page=await context.newPage(),errors=[],network=[],dialogs=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('dialog',dialog=>{dialogs.push({type:dialog.type(),message:dialog.message()});void dialog.accept();});
  page.on('request',request=>{if(request.url().includes('/v1/jobs'))network.push(request.url());});
  await page.goto(base);await page.waitForFunction(()=>window.FG?.studio&&document.getElementById('studioNavJourney'));await exploreWelcome(page);
  return {page,context,errors,network,dialogs};
 };
 const openJourney=async page=>{
  await exploreWelcome(page);
  await navigate(page,'#studioNavJourney');
  await page.locator('#page-jems-journey').waitFor({state:'visible'});
  await page.evaluate(async()=>{
   const paths=[...new Set([...document.querySelectorAll('#page-jems-journey [data-sprite-src]')].map(element=>element.dataset.spriteSrc))];
   if(paths.length<2)throw Error('Illustrated character and gem artwork is required');
   const background=document.getElementById('page-jems-journey').style.getPropertyValue('--journey-world').match(/url\(["']?(.+?)["']?\)/)?.[1];
   if(background)paths.push(background);
   await Promise.all(paths.map(async path=>{
    const image=new Image();image.src=new URL(path,document.baseURI).href;
    await image.decode();if(!image.naturalWidth)throw Error('Missing journey artwork: '+path);
   }));
   await document.fonts.ready;
  });
 };
 const notebook=page=>page.evaluate(()=>FG.studio.exportNotebook());
 const earned=async page=>{
  const {data,owner}=await page.evaluate(()=>({data:FG.studio.exportNotebook(),owner:String(FG.store.current().id)}));
  return builderJourney(data.sessions.filter(session=>session.owner===owner));
 };
 const assertLevel=async(page,level)=>{
  assert.equal((await earned(page)).level,level,'notebook evidence determines the current level');
  assert.equal(await page.locator('#page-jems-journey').getAttribute('data-level'),String(level),'journey displays the earned level');
 };
 const profiles=async(page,index)=>{
  await openProfiles(page);
  await page.locator('.profile-choice').nth(index).click();
 };
 const more=async page=>{if(!await page.locator('#studioMore').evaluate(element=>element.open))await page.click('#studioMore > summary');};
 const events=page=>page.evaluate(()=>[...window.__jemsMilestones,...window.__jemsRewardPopups]);
 const levelEventCount=async(page,level)=>(await events(page)).filter(event=>event.kind==='reward-popup'&&event.rewardIds.includes(`maker.milestone:level%3A${level}`)).length;
 const waitForLevelPopup=(page,level)=>page.waitForFunction(level=>window.__jemsRewardPopups.some(popup=>popup.rewardIds.includes(`maker.milestone:level%3A${level}`)),level);
 const noOverflow=async page=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'layout fits the viewport without horizontal scrolling');
 const assertRankThumbnail=async(locator,character,level)=>{
  const actual=await locator.evaluate(tile=>({
   character:tile.dataset.character,level:Number(tile.dataset.level),
   art:[...tile.querySelectorAll('.jems-character-art')].map(art=>({character:art.dataset.character,level:Number(art.dataset.level),src:art.dataset.spriteSrc,position:parseFloat(art.style.backgroundPosition),aspect:parseFloat(art.style.aspectRatio)})),
   gems:tile.querySelectorAll('.jems-gem-art').length
  }));
  assert.equal(actual.character,character??'none');assert.equal(actual.level,level);
  assert.equal(actual.gems,character?0:1,'a selected maker retains the held gem; an unselected owner sees neutral art');
  assert.deepEqual(actual.art.map(art=>art.character),character?[character]:[]);
  for(const art of actual.art){
   assert.equal(art.src,`jems-journey/characters-${art.character}.webp`,'rank art uses the original native maker atlas');
   assert.equal(art.level,level);assert.equal(art.aspect,.75,'native full-figure aspect stays intact');
   assert.ok(Math.abs(art.position-100*(level-1)/3)<.001,'the displayed frame matches the stated rank');
  }
 };
 const assertVisibleMaker=async(page,character)=>{
  const visible=await page.locator('[data-sprite-src^="jems-journey/characters-"]').evaluateAll(elements=>[...new Set(elements.filter(element=>{
   const rect=element.getBoundingClientRect();
   return rect.width>0&&rect.height>0&&getComputedStyle(element).visibility!=='hidden';
  }).map(element=>element.dataset.character))]);
  assert.deepEqual(visible,character?[character]:[],'only the current selected human appears outside an explicit chooser');
 };
 const preview=async(page,name)=>{
  await page.evaluate(()=>window.scrollTo(0,0));
  const clip=await page.locator('#page-jems-journey').evaluate(element=>({x:0,y:0,width:innerWidth,height:Math.ceil(element.getBoundingClientRect().bottom+16)}));
  await page.screenshot({path:`test-results/${name}.png`,fullPage:true,clip});
 };
 const saveBlocked=async(page,blocked)=>page.evaluate(({key,blocked})=>{
  if(!window.__originalStorageSetItem)window.__originalStorageSetItem=Storage.prototype.setItem;
  Storage.prototype.setItem=blocked?function(name,value){if(name===key)throw new DOMException('Test storage full','QuotaExceededError');return window.__originalStorageSetItem.call(this,name,value);}:window.__originalStorageSetItem;
 },{key:STUDIO_KEY,blocked});

  // No progress for opening an empty page; picking a character is cosmetic.
  {
   const {page,context,errors}=await newPage();
   await openJourney(page);await assertLevel(page,0);
   await assertVisibleMaker(page,null);
   for(let rank=1;rank<=4;rank++)await assertRankThumbnail(page.locator(`[data-journey-level="${rank}"] .jems-rank-thumbnail`),null,rank);
   assert.deepEqual(await events(page),[]);
   assert.equal(await page.locator('[data-journey-level]').count(),4);
   const initial=JSON.stringify(await notebook(page));
   await page.click('[data-journey-level="4"]');
   assert.equal(JSON.stringify(await notebook(page)),initial,'previewing Gem Master does not award it');
   await assertLevel(page,0);
   assert.match(await page.locator('#page-jems-journey').innerText(),/preview|ahead|unlock|next|reach/i,'unearned artwork is clearly a preview');
   await page.click('#jemsChangeCharacter');
   await page.locator('#jemsCharacterDialog').waitFor({state:'visible'});
   assert.equal(await page.locator('[data-journey-character]').count(),2);
   for(const character of ['spark','nova'])await assertRankThumbnail(page.locator(`[data-journey-character="${character}"] .jems-rank-thumbnail`),character,4);
   assert.match(await page.locator('#jemsCharacterHint').innerText(),/Previewing the Level 4 outfit/,'chooser identifies an unearned outfit preview');
   assert.doesNotMatch(await page.locator('#jemsCharacterDialog').innerText(),/\b(boy|girl|male|female|gender)\b/i);
   await page.keyboard.press('Escape');
   assert.equal(await page.locator('#jemsCharacterDialog').isVisible(),false);
   assert.equal(await page.evaluate(()=>document.activeElement.id),'jemsChangeCharacter','Escape restores the invoking button');
   await page.click('#jemsChangeCharacter');
   await saveBlocked(page,true);
   await page.click('[data-journey-character="nova"]');
   assert.equal(await page.locator('#jemsCharacterDialog').isVisible(),true,'save failure leaves selection available to retry');
   assert.equal((await notebook(page)).avatars?.player1,undefined,'failed save never claims a persisted character');
   assert.match(await page.locator('#jemsCharacterDialog').innerText(),/save|try again/i);
   await saveBlocked(page,false);
   await page.click('[data-journey-character="nova"]');
   await page.locator('#jemsCharacterDialog').waitFor({state:'hidden'});
   assert.equal((await notebook(page)).avatars.player1,'nova');
   await assertVisibleMaker(page,'nova');
   await assertLevel(page,0);assert.deepEqual(await events(page),[]);
   await page.reload();await page.waitForFunction(()=>window.FG?.studio);await openJourney(page);
   assert.equal((await notebook(page)).avatars.player1,'nova');await assertLevel(page,0);
   assert.equal(await page.locator('#jemsJourneyCharacters').getAttribute('data-character'),'nova');
   await assertVisibleMaker(page,'nova');
   await page.screenshot({path:'test-results/jems-journey-empty.png',fullPage:true});
   assert.deepEqual(errors,[]);await context.close();
   console.log('PASS empty journey, honest previews, character persistence and failed-save retry');
  }

  // Real assets resolve under a subdirectory; illustration previews and profile
  // changes cannot alter another owner's earned stage or cosmetic choice.
  for(const [name,viewport] of [['desktop',{width:1400,height:1000}],['tablet',{width:820,height:1180}],['mobile',{width:390,height:844}]]){
   const {page,context,errors}=await newPage({fixture:visualFixture(),viewport});
   if(name!=='tablet')await page.screenshot({path:`test-results/jems-library-journey-${name}.png`,fullPage:true});
   await openJourney(page);await assertLevel(page,3);
   const initial=JSON.stringify(await notebook(page));
   const artAtThree=await page.locator('#jemsJourneyCharacters .jems-journey-character').evaluate(element=>element.style.backgroundPosition);
   await page.click('[data-journey-level="4"]');await assertLevel(page,3);
   assert.notEqual(await page.locator('#jemsJourneyCharacters .jems-journey-character').evaluate(element=>element.style.backgroundPosition),artAtThree,'character artwork evolves with the stage');
   assert.equal(JSON.stringify(await notebook(page)),initial);assert.deepEqual(await events(page),[]);
   await page.click('[data-journey-level="3"]');
   await noOverflow(page);
   await page.screenshot({path:`test-results/jems-journey-${name}.png`,fullPage:true});
   await preview(page,`jems-journey-${name}-preview`);
   if(name==='desktop'){
    await page.click('#jemsChangeCharacter');
    await page.screenshot({path:'test-results/jems-journey-character-picker.png',fullPage:true});
    await page.screenshot({path:'test-results/jems-character-picker-preview.png'});
    for(const key of ['Tab','Tab','Tab','Tab','Shift+Tab','Shift+Tab','Shift+Tab']){
     await page.keyboard.press(key);
     assert.ok(await page.evaluate(()=>document.getElementById('jemsCharacterDialog').contains(document.activeElement)),'keyboard focus stays within character choices');
    }
    await page.keyboard.press('Escape');
    await page.evaluate(()=>document.documentElement.style.zoom='2');
    await noOverflow(page);
    await page.screenshot({path:'test-results/jems-journey-zoom.png',fullPage:true});
    await page.evaluate(()=>document.documentElement.style.zoom='');
    const sessions=JSON.stringify((await notebook(page)).sessions);
    // All eight original outfit frames remain aligned in hero, rank tile and
    // chooser. Cosmetic preview must not rewrite evidence or replay a reward.
    for(const character of ['spark','nova']){
     const previousPreview=await page.locator('#page-jems-journey').getAttribute('data-preview-level');
     await page.click('#jemsChangeCharacter');await page.click(`[data-journey-character="${character}"]`);
     assert.equal(await page.locator('#page-jems-journey').getAttribute('data-preview-level'),previousPreview,'choosing a maker preserves the outfit preview');
     for(let level=1;level<=4;level++){
      await page.click(`[data-journey-level="${level}"]`);await assertLevel(page,3);
      assert.equal(await page.locator('#jemsJourneyCharacters').getAttribute('data-character'),character);
      assert.equal(await page.locator('#jemsJourneyCharacters [data-character]').getAttribute('data-level'),String(level));
      for(let rank=1;rank<=4;rank++)await assertRankThumbnail(page.locator(`[data-journey-level="${rank}"] .jems-rank-thumbnail`),character,rank);
      assert.equal(await page.locator('.jems-journey-hero-gem,.jems-journey-card-gem').count(),0,'rank art has no separate floating gem');
      await page.click('#jemsChangeCharacter');
      for(const choice of ['spark','nova'])await assertRankThumbnail(page.locator(`[data-journey-character="${choice}"] .jems-rank-thumbnail`),choice,level);
      await page.keyboard.press('Escape');
     }
    }
    await page.click('#jemsChangeCharacter');await page.click('[data-journey-character="spark"]');
    await page.click('[data-journey-level="3"]');
    assert.equal(JSON.stringify((await notebook(page)).sessions),sessions,'all maker/outfit previews leave earned evidence intact');
    assert.deepEqual(await events(page),[],'maker/outfit previews emit no achievements');
   }
   if(name==='mobile'){
    await page.setViewportSize({width:320,height:740});await noOverflow(page);
    await page.click('#jemsChangeCharacter');await noOverflow(page);await page.keyboard.press('Escape');
    await page.setViewportSize(viewport);
   }
   await profiles(page,1);await openJourney(page);await assertLevel(page,4);
   assert.equal((await notebook(page)).avatars.player2,'nova');
   await assertVisibleMaker(page,'nova');
   assert.match(await page.locator('#jemsJourneyName').innerText(),/Gem Master/);
   assert.deepEqual(await events(page),[],'loading another profile never replays old milestones');
   if(name==='tablet')await page.screenshot({path:'test-results/jems-journey-master-tablet.png',fullPage:true});
   await profiles(page,2);await openJourney(page);await assertLevel(page,0);
   assert.equal((await notebook(page)).avatars?.player3,undefined);
   await assertVisibleMaker(page,null);
   await page.click('#jemsChangeCharacter');await page.click('[data-journey-character="spark"]');
   assert.equal((await notebook(page)).avatars.player1,'spark');
   assert.equal((await notebook(page)).avatars.player2,'nova');
   assert.equal((await notebook(page)).avatars.player3,'spark');
   await profiles(page,0);await openJourney(page);await assertLevel(page,3);
   await assertVisibleMaker(page,'spark');
   assert.deepEqual(errors,[]);await context.close();
   console.log(`PASS ${name}: illustrated journey, owner isolation, keyboard and responsive layout`);
  }

  // A real storage event from another document refreshes every visible identity,
  // including Rewards, without changing the receiving tab's route or focus.
  // The second document is a storage fixture, not another writable Jems app:
  // the application's existing single-writer lock remains active throughout.
  {
   const {page,context,errors}=await newPage({fixture:visualFixture()});
   await navigate(page,'studioNavRewards');
   await page.locator('#page-jems-rewards').waitFor({state:'visible'});
   await assertRankThumbnail(page.locator('#jemsRewardsMakerArt .jems-rank-thumbnail'),'spark',3);
   const sessions=JSON.stringify((await notebook(page)).sessions);
   const rewardState=await page.evaluate(()=>JSON.stringify(FG.rewards.summary()));
   const beforeEvents=await events(page);
   await page.locator('#jemsRewardsMakerAction').focus();
   await page.evaluate(key=>{
    window.__makerStorageEvents=[];
    window.addEventListener('storage',event=>{if(event.key===key)window.__makerStorageEvents.push(event.isTrusted);});
   },STUDIO_KEY);

   const other=await context.newPage();
   other.on('pageerror',error=>errors.push(error.message));
   const fixtureUrl=new URL('/maker-storage-fixture.html',base).href;
   await other.route(fixtureUrl,route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><title>External storage fixture</title></head><body>Valid notebook storage fixture</body></html>'}));
   await other.goto(fixtureUrl);
   const changed=memoryNotebook(await notebook(page));changed.setAvatar('player1','nova');
   await other.evaluate(({key,data})=>localStorage.setItem(key,JSON.stringify(data)),{key:STUDIO_KEY,data:changed.read()});
   await page.waitForFunction(()=>document.querySelector('#jemsRewardsMakerArt .jems-rank-thumbnail')?.getAttribute('data-character')==='nova');
   await assertVisibleMaker(page,'nova');
   assert.equal(await page.evaluate(()=>document.activeElement.id),'jemsRewardsMakerAction','cross-tab identity refresh keeps focus on the original Rewards action');
   assert.equal(await page.locator('#page-jems-rewards').isVisible(),true,'cross-tab choice keeps the current destination');

   // A valid legacy/backup state can remove a cosmetic choice. Write it in the
   // other tab; the browser must deliver the storage event itself, with no
   // direct call to the receiving app's render functions or event handlers.
   const restored=memoryNotebook(await notebook(page));restored.setAvatar('player1',null);
   await other.evaluate(({key,data})=>localStorage.setItem(key,JSON.stringify(data)),{key:STUDIO_KEY,data:restored.read()});
   await page.waitForFunction(()=>document.querySelector('#jemsRewardsMakerArt .jems-rank-thumbnail')?.getAttribute('data-character')==='none');
   await assertRankThumbnail(page.locator('#jemsRewardsMakerArt .jems-rank-thumbnail'),null,3);
   await assertVisibleMaker(page,null);
   assert.equal(await page.evaluate(()=>document.activeElement.id),'jemsRewardsMakerAction');
   assert.equal(await page.locator('#studioProfileSummary .jems-character-art').count(),0,'the header removes the former human too');
   const storageEvents=await page.evaluate(()=>window.__makerStorageEvents);
   assert.ok(storageEvents.length>=2&&storageEvents.every(Boolean),'identity changes arrived through genuine browser storage events');
   assert.equal(JSON.stringify((await notebook(page)).sessions),sessions,'cross-tab cosmetic changes do not rewrite projects');
   assert.equal(await page.evaluate(()=>JSON.stringify(FG.rewards.summary())),rewardState,'cross-tab cosmetic changes do not award gems');
   assert.deepEqual(await events(page),beforeEvents,'cross-tab refresh does not replay celebrations');
   assert.deepEqual(errors,[]);await context.close();
   console.log('PASS native cross-document storage: Rewards/header, neutral restore, focus and reward isolation');
  }

  // Actual creation workflow. Keep must credit the exact reflected experiment;
  // repeated views, reloads and character choices never replay that transition.
  {
   const {page,context,errors,network,dialogs}=await newPage();
   await page.evaluate(()=>{FG.store.changeProfile({rate:1});FG.store.current().mathWindow=[Date.now()];if(!FG.store.save())throw Error('Pacing fixture failed');});
   const learning=await page.evaluate(()=>JSON.stringify(FG.store.current().skills));
   await page.click('[data-starter="gum"]');
   await page.click('#studioChange');await page.fill('#studioPrompt','Give me 2 extra stickers');await page.click('#studioSend');
   await page.waitForFunction(()=>FG.studio.exportNotebook().sessions.some(session=>session.game==='gum'&&session.candidate));
   let session=(await notebook(page)).sessions.find(session=>session.game==='gum');
   assert.equal(gemStage(session),'rough');
   const testId=session.candidate.id,baseId=session.candidate.baseId;
   const existingSessionCount=(await notebook(page)).sessions.length;
   await openJourney(page);
   assert.match(await page.locator('#jemsJourneyCreate').textContent(),/Continue my jem/);
   await page.click('#jemsJourneyCreate');
   await page.waitForFunction(()=>document.querySelector('#page-studio .studio-workspace').getAttribute('data-mobile-panel')==='talk');
   assert.equal((await notebook(page)).active.player1,session.id,'A rough next step continues the exact saved project');
   assert.equal((await notebook(page)).sessions.length,existingSessionCount,'Continuing a rough project creates no new idea');
   assert.equal((await notebook(page)).sessions.find(saved=>saved.id===session.id).candidate.id,testId);
   await more(page);await page.click('#studioCompare');
   await page.getByRole('button',{name:'Play preview',exact:true}).click();
   for(let index=0;index<3;index++){await page.locator('.gum-sticker').nth(index).click();await page.locator('.gum-slot').nth(index).click();}
   await page.click('.gum-launch');
   await page.waitForFunction(()=>FG.studio.exportNotebook().sessions.some(session=>session.reflection));
   await page.click('#studioChange');await page.click('#studioReflectAnswer');
   await page.fill('#studioPrompt','The extra sticker choices made my rocket more colorful.');await page.click('#studioSend');
   session=(await notebook(page)).sessions.find(session=>session.game==='gum');
   assert.equal(gemStage(session),'cut');
   assert.equal(session.design.observations.filter(observation=>observation.source==='child'&&observation.experimentId===testId).length,1);
   await page.waitForFunction(async()=>{
    const owner=FG.store.current().id,summary=await FG.rewards.summary();
    return summary.recentGrants.some(grant=>grant.id==='maker.milestone:level%3A2')&&
     !(FG.studio.exportNotebook().rewardOutbox||[]).some(fact=>fact.owner===owner&&fact.kind==='maker.milestone'&&fact.level===2);
   });
   assert.equal((await earned(page)).level,2,'the linked chat reflection still earns the same cut level');
   const cutGrant=await page.evaluate(async()=>(await FG.rewards.summary()).recentGrants.find(grant=>grant.id==='maker.milestone:level%3A2'));
   assert.equal(cutGrant.amount,10,'the ordinary milestone grant remains durable while chat stays quiet');
   // Give the normal reward batching interval time to finish. An immediately
   // empty toast container alone would not prove the chat presentation policy.
   await page.waitForTimeout(250);
   assert.equal(await levelEventCount(page,2),0,'a reward popup must not cover the active conversation');
   await openJourney(page);await page.click('#jemsJourneyCreate');
   await page.locator('#studioVersions').waitFor({state:'visible'});
   assert.equal((await notebook(page)).active.player1,session.id,'A cut next step opens the same project’s tests');
   assert.equal((await notebook(page)).sessions.length,existingSessionCount,'Continuing a cut project creates no new idea');
   assert.equal(await page.locator('#page-studio .studio-workspace').getAttribute('data-mobile-panel'),'versions');
   await page.getByRole('button',{name:'Play preview',exact:true}).click();
   await page.click('#studioKeep');
   await page.waitForFunction(id=>FG.studio.exportNotebook().sessions.some(session=>session.keptExperiments?.some(kept=>kept.experimentId===id)),testId);
   session=(await notebook(page)).sessions.find(session=>session.game==='gum');
   assert.equal(gemStage(session),'polished');
   assert.ok(session.keptExperiments.some(kept=>kept.experimentId===testId&&kept.baseId===baseId));
   await waitForLevelPopup(page,3);
   assert.equal(await levelEventCount(page,3),1,'one polished-level popup for the exact verified keep');
   const polishedPopup=page.locator('.jems-rewards-toast[data-maker-level="3"]');
   await assertRankThumbnail(polishedPopup.locator('.jems-rank-thumbnail'),null,3);
   assert.equal(await polishedPopup.locator('.jems-gem-art').count(),1,'a legacy unselected maker sees a neutral reward until they choose a character');
   assert.equal(await page.locator('.jems-rewards-toast-host').evaluate(element=>getComputedStyle(element).pointerEvents),'none');
   assert.equal(await polishedPopup.getAttribute('aria-live'),'polite');
   assert.equal(await page.locator('.jems-delight-sparks').count(),0);
   assert.equal(await polishedPopup.evaluate(element=>getComputedStyle(element).animationName),'none');
   await page.click('#studioChange');await page.fill('#studioPrompt','An idea to try when I come back');
   await openJourney(page);await assertLevel(page,3);
   assert.equal((await notebook(page)).sessions.find(session=>session.game==='gum').draft,'An idea to try when I come back','opening the journey flushes the unfinished draft');
   assert.equal(await page.evaluate(()=>FG.runtime.snapshot().disposed),true,'the dedicated journey safely disposes the game');
   assert.equal(await levelEventCount(page,3),1);
   await page.reload();await page.waitForFunction(()=>window.FG?.studio);await openJourney(page);
   assert.deepEqual(await events(page),[],'reload is not an accomplishment');

   // Add one schema-validated historical project as a test fixture, then earn
   // the third polished project by using the real Hill preview and notes UI.
   const prior=memoryNotebook(await notebook(page));
   polishedFixture(prior,'player1','Earlier moon garden');
   prior.setAvatar('player1','nova');
   await page.evaluate(({key,data})=>localStorage.setItem(key,JSON.stringify(data)),{key:STUDIO_KEY,data:prior.read()});
   await page.reload();await page.waitForFunction(()=>window.FG?.studio);
   assert.equal((await earned(page)).polishedCount,2);
   await page.click('[data-starter="hill"]');await page.click('#studioChange');
   await page.fill('#studioPrompt','Make wheels bigger');await page.click('#studioSend');
   await page.waitForFunction(()=>FG.studio.exportNotebook().sessions.some(session=>session.game==='hill'&&session.candidate));
   await more(page);await page.click('#studioCompare');
   const testNote=page.getByRole('textbox',{name:'Notes for Test A',exact:true}),noteText='The bigger wheels helped my car over the hill.';
   await testNote.fill('   ');
   assert.equal(gemStage((await notebook(page)).sessions.find(session=>session.game==='hill')),'rough','whitespace is not a reflection');
   await testNote.fill('');await testNote.pressSequentially(noteText);
   assert.equal(await testNote.inputValue(),noteText,'progress refresh must not interrupt typing the reflection');
   assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'Notes for Test A');
   assert.equal(gemStage((await notebook(page)).sessions.find(session=>session.game==='hill')),'cut');
   await assertRankThumbnail(page.locator('.jems-delight-toast .jems-rank-thumbnail'),'nova',3);
   assert.equal(await page.locator('.jems-delight-toast').getAttribute('data-kind'),'gem-cut','a second project Cut event keeps the already earned Polisher outfit');
   await page.click('#studioCloseVersions');await page.click('#studioKeep');
   await waitForLevelPopup(page,4);
   assert.equal(await levelEventCount(page,4),1,'the third distinct polished project shows one committed Gem Master popup');
   assert.equal((await earned(page)).level,4);
   const masterPopup=page.locator('.jems-rewards-toast[data-maker-level="4"]');
   await assertRankThumbnail(masterPopup.locator('.jems-rank-thumbnail'),'nova',4);
   assert.equal(await masterPopup.locator('.jems-rank-thumbnail').evaluate(tile=>Math.round(tile.getBoundingClientRect().width)),96,'the approved compact popup tile is 96px');
   await openJourney(page);await assertLevel(page,4);
   await masterPopup.screenshot({path:'test-results/jems-gem-master-toast.png'});
   await page.screenshot({path:'test-results/jems-journey-master-popup.png',fullPage:true});
   await preview(page,'jems-journey-master-preview');
   assert.equal(await levelEventCount(page,4),1);
   await page.click('#jemsChangeCharacter');await page.click('[data-journey-character="spark"]');
   assert.equal(await levelEventCount(page,4),1,'a cosmetic change cannot re-award Master');
   assert.equal(await page.locator('.jems-rewards-toast,.jems-delight-toast').count(),0,'changing character clears any prior-human celebration without replay');
   await assertVisibleMaker(page,'spark');
   await profiles(page,1);await openJourney(page);await assertLevel(page,0);
   assert.equal(await page.locator('#jemsJourneyCharacters').getAttribute('data-character'),'none');
   await profiles(page,0);await openJourney(page);await assertLevel(page,4);
   assert.equal(await levelEventCount(page,4),1,'switching back to a recent Master does not replay its popup');

   // Putting a project away preserves its real history; clearing the current
   // chat removes its exact keep receipts without deleting the working game.
   const hill=(await notebook(page)).sessions.find(session=>session.game==='hill');
   await navigate(page,'#studioNavHome');
   await page.locator(`[data-session="${hill.id}"] .studio-put-away`).click();
   await openJourney(page);await assertLevel(page,4);
   await navigate(page,'#studioNavHome');await page.locator('.studio-archived-details summary').click();
   await page.getByRole('button',{name:'Bring back '+hill.name,exact:true}).click();
   await page.locator(`[data-session="${hill.id}"] .studio-saved-open`).click();
   await page.click('#studioChange');
   await page.fill('#studioPrompt','Make motor stronger');await page.click('#studioSend');
   await page.waitForFunction(()=>FG.studio.exportNotebook().sessions.some(session=>session.game==='hill'&&session.experiments?.length===2));
   await more(page);await page.click('#studioCompare');
   await page.getByRole('textbox',{name:'Notes for Test B',exact:true}).fill('The faster motor has more zip.');
   assert.equal(gemStage((await notebook(page)).sessions.find(session=>session.id===hill.id)),'polished');
   const beforeErasing=await events(page);
   await page.getByRole('textbox',{name:'Notes for Test A',exact:true}).fill('');
   const afterErasing=(await notebook(page)).sessions.find(session=>session.id===hill.id);
   assert.equal(gemStage(afterErasing),'cut','keeping Test A cannot polish the remaining reflection on Test B');
   assert.equal(afterErasing.keptExperiments.length,1,'the exact receipt remains but no longer has its own reflection');
   assert.equal((await earned(page)).level,3);
   assert.equal(await page.locator('#studioProfileSummary [data-character="spark"]').getAttribute('data-level'),'3','profile art immediately follows the reduced evidence');
   assert.deepEqual(await events(page),beforeErasing,'a stage downgrade never emits a cut celebration');
   await openJourney(page);await assertLevel(page,3);
   assert.equal(await page.locator('#jemsJourneyCharacters').getAttribute('data-level'),'3');
   await navigate(page,'#studioNavHome');await page.locator(`[data-session="${hill.id}"] .studio-saved-open`).click();
   await page.click('#studioChange');
   const gemsBeforeClear=(await page.evaluate(()=>FG.rewards.summary())).lifetimeGems;
   if(!await page.locator('#studioMoreChoices').evaluate(element=>element.open))await page.click('#studioMoreChoices > summary');
   await page.click('#studioChatOptions summary');await page.click('#studioClearChat');
   const clearConfirmation=dialogs.filter(dialog=>dialog.type==='confirm').at(-1)?.message||'';
   assert.match(clearConfirmation,/lower your maker level.*change your outfit/i,'Clear chat explains its visible rank and outfit consequence');
   assert.match(clearConfirmation,/lifetime gems.*will remain/i,'Clear chat distinguishes retained lifetime rewards');
   const cleared=(await notebook(page)).sessions.find(session=>session.id===hill.id);
   assert.equal(cleared.keptExperiments?.length||0,0);
   assert.ok(cleared.projectId,'working game survives clearing chat');
   await page.evaluate(()=>FG.rewards.refresh());
   assert.equal((await page.evaluate(()=>FG.rewards.summary())).lifetimeGems,gemsBeforeClear,'The disclosed lifetime rewards survive clearing chat');
   await openJourney(page);await assertLevel(page,3);
   assert.equal(await levelEventCount(page,4),1);
   assert.equal(await page.evaluate(()=>JSON.stringify(FG.store.current().skills)),learning,'cosmetic progression never changes learning records');
   assert.deepEqual(network,[],'this local workflow never starts a paid build');
   assert.deepEqual(errors,[]);await context.close();
  }
  console.log('PASS gem journey: four illustrated stages, empty state, owner-isolated persistent characters, storage failures, preview honesty, real reflection/keep/Master, no replay, archive/clear, accessible modal, responsive layouts and reduced motion');
 }finally{
  try{await browser?.close();}
  finally{await new Promise(resolve=>server.close(resolve));}
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
