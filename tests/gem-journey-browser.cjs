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
 return validateNotebook(notebook.read());
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
  const context=await browser.newContext({viewport,reducedMotion});
  await context.addInitScript(({key,fixture})=>{
   if(window.top!==window)return;
   window.__jemsMilestones=[];
   window.addEventListener('jems:milestone',event=>window.__jemsMilestones.push(event.detail));
   if(fixture&&!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(fixture));
  },{key:STUDIO_KEY,fixture});
  const page=await context.newPage(),errors=[],network=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('dialog',dialog=>void dialog.accept());
  page.on('request',request=>{if(request.url().includes('/v1/jobs'))network.push(request.url());});
  await page.goto(base);await page.waitForFunction(()=>window.FG?.studio&&document.getElementById('studioNavJourney'));
  return {page,context,errors,network};
 };
 const openJourney=async page=>{
  await page.click('#studioNavJourney');
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
  if(!await page.locator('#studioProfileMenu').evaluate(element=>element.open))await page.click('#studioProfileMenu summary');
  await page.locator('.profile-choice').nth(index).click();
 };
 const more=async page=>{if(!await page.locator('#studioMore').evaluate(element=>element.open))await page.click('#studioMore summary');};
 const events=page=>page.evaluate(()=>window.__jemsMilestones);
 const levelEventCount=async(page,level)=>(await events(page)).filter(event=>event.kind.startsWith('builder-')&&event.level===level).length;
 const noOverflow=async page=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'layout fits the viewport without horizontal scrolling');
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
   await assertLevel(page,0);assert.deepEqual(await events(page),[]);
   await page.reload();await page.waitForFunction(()=>window.FG?.studio);await openJourney(page);
   assert.equal((await notebook(page)).avatars.player1,'nova');await assertLevel(page,0);
   assert.equal(await page.locator('#jemsJourneyCharacters').getAttribute('data-character'),'nova');
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
   }
   if(name==='mobile'){
    await page.setViewportSize({width:320,height:740});await noOverflow(page);
    await page.click('#jemsChangeCharacter');await noOverflow(page);await page.keyboard.press('Escape');
    await page.setViewportSize(viewport);
   }
   await profiles(page,1);await openJourney(page);await assertLevel(page,4);
   assert.equal((await notebook(page)).avatars.player2,'nova');
   assert.match(await page.locator('#jemsJourneyName').innerText(),/Gem Master/);
   assert.deepEqual(await events(page),[],'loading another profile never replays old milestones');
   if(name==='tablet')await page.screenshot({path:'test-results/jems-journey-master-tablet.png',fullPage:true});
   await profiles(page,2);await openJourney(page);await assertLevel(page,0);
   assert.equal((await notebook(page)).avatars?.player3,undefined);
   await page.click('#jemsChangeCharacter');await page.click('[data-journey-character="spark"]');
   assert.equal((await notebook(page)).avatars.player1,'spark');
   assert.equal((await notebook(page)).avatars.player2,'nova');
   assert.equal((await notebook(page)).avatars.player3,'spark');
   await profiles(page,0);await openJourney(page);await assertLevel(page,3);
   assert.deepEqual(errors,[]);await context.close();
   console.log(`PASS ${name}: illustrated journey, owner isolation, keyboard and responsive layout`);
  }

  // Actual creation workflow. Keep must credit the exact reflected experiment;
  // repeated views, reloads and character choices never replay that transition.
  {
   const {page,context,errors,network}=await newPage();
   await page.evaluate(()=>{FG.store.changeProfile({rate:1});FG.store.current().mathWindow=[Date.now()];if(!FG.store.save())throw Error('Pacing fixture failed');});
   const learning=await page.evaluate(()=>JSON.stringify(FG.store.current().skills));
   await page.click('[data-starter="gum"]');
   await page.click('#studioChange');await page.fill('#studioPrompt','Give me 2 extra stickers');await page.click('#studioSend');
   await page.waitForFunction(()=>FG.studio.exportNotebook().sessions.some(session=>session.game==='gum'&&session.candidate));
   let session=(await notebook(page)).sessions.find(session=>session.game==='gum');
   assert.equal(gemStage(session),'rough');
   const testId=session.candidate.id,baseId=session.candidate.baseId;
   for(let index=0;index<3;index++){await page.locator('.gum-sticker').nth(index).click();await page.locator('.gum-slot').nth(index).click();}
   await page.click('.gum-launch');
   await page.waitForFunction(()=>FG.studio.exportNotebook().sessions.some(session=>session.reflection));
   await page.click('#studioChange');await page.click('#studioReflectAnswer');
   await page.fill('#studioPrompt','The extra sticker choices made my rocket more colorful.');await page.click('#studioSend');
   session=(await notebook(page)).sessions.find(session=>session.game==='gum');
   assert.equal(gemStage(session),'cut');
   assert.equal(session.design.observations.filter(observation=>observation.source==='child'&&observation.experimentId===testId).length,1);
   assert.equal(await levelEventCount(page,2),1,'one cut-level popup for a durable linked reflection');
   await page.click('#studioKeep');
   await page.waitForFunction(id=>FG.studio.exportNotebook().sessions.some(session=>session.keptExperiments?.some(kept=>kept.experimentId===id)),testId);
   session=(await notebook(page)).sessions.find(session=>session.game==='gum');
   assert.equal(gemStage(session),'polished');
   assert.ok(session.keptExperiments.some(kept=>kept.experimentId===testId&&kept.baseId===baseId));
   assert.equal(await levelEventCount(page,3),1,'one polished-level popup for the exact verified keep');
   assert.equal(await page.locator('#jems-delight-host').evaluate(element=>getComputedStyle(element).pointerEvents),'none');
   assert.equal(await page.locator('.jems-delight-toast').getAttribute('aria-live'),'polite');
   assert.equal(await page.locator('.jems-delight-sparks').count(),0);
   assert.equal(await page.locator('.jems-delight-toast').evaluate(element=>getComputedStyle(element).animationName),'none');
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
   await page.click('#studioCloseVersions');await page.click('#studioKeep');
   await page.waitForFunction(()=>window.__jemsMilestones.some(event=>event.level===4));
   assert.equal(await levelEventCount(page,4),1,'the third distinct polished project earns one Gem Master event');
   assert.equal((await earned(page)).level,4);
   await openJourney(page);await assertLevel(page,4);
   await page.locator('.jems-delight-toast').screenshot({path:'test-results/jems-gem-master-toast.png'});
   await page.screenshot({path:'test-results/jems-journey-master-popup.png',fullPage:true});
   await preview(page,'jems-journey-master-preview');
   assert.equal(await levelEventCount(page,4),1);
   await page.click('#jemsChangeCharacter');await page.click('[data-journey-character="spark"]');
   assert.equal(await levelEventCount(page,4),1,'a cosmetic change cannot re-award Master');
   await profiles(page,1);await openJourney(page);await assertLevel(page,0);
   assert.equal(await page.locator('#jemsJourneyCharacters').getAttribute('data-character'),'both');
   await profiles(page,0);await openJourney(page);await assertLevel(page,4);
   assert.equal(await levelEventCount(page,4),1,'switching back to a recent Master does not replay its popup');

   // Putting a project away preserves its real history; clearing the current
   // chat removes its exact keep receipts without deleting the working game.
   const hill=(await notebook(page)).sessions.find(session=>session.game==='hill');
   await page.click('#studioNavHome');
   await page.locator(`[data-session="${hill.id}"] .studio-put-away`).click();
   await openJourney(page);await assertLevel(page,4);
   await page.click('#studioNavHome');await page.locator('.studio-archived-details summary').click();
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
   await page.click('#studioNavHome');await page.locator(`[data-session="${hill.id}"] .studio-saved-open`).click();
   await page.click('#studioChange');
   await page.click('#studioChatOptions summary');await page.click('#studioClearChat');
   const cleared=(await notebook(page)).sessions.find(session=>session.id===hill.id);
   assert.equal(cleared.keptExperiments?.length||0,0);
   assert.ok(cleared.projectId,'working game survives clearing chat');
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
