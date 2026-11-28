/* Exercise the real host and local game builds using synthetic profiles and
 * an intercepted gateway. Keep all child and provider traffic on loopback. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const {start}=require('./browser-server.cjs');
const {exploreWelcome,openProfiles}=require('./studio-entry.cjs');

const views=[
 ['tablet-portrait',768,1024,-1],['tablet-landscape',1024,768,0],
 ['desktop',1366,768,0],['phone',390,844,-1],['short-landscape',844,390,0]
];
const evidence=process.env.EARLY_EVIDENCE_DIR||'test-results/early-journey';
async function capture(page,name){
 await page.screenshot({path:path.join(evidence,name+'.png'),animations:'disabled'});
}
async function editGrade(page,value,permitted=true){
 await openProfiles(page);
 await page.click('#learningProfileEdit');
 const offered=await page.locator('#learningProfileGrade option').evaluateAll(nodes=>nodes.map(n=>n.value));
 assert.deepEqual(offered,['-1','0','1','2','3','4']);
 await page.selectOption('#learningProfileGrade',String(value));
 await page.click('#learningProfileSave');
 if(permitted){
  await page.waitForFunction(value=>!document.querySelector('#learningProfileDialog').open&&FG.store.current().grade===value,value);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('family-game-factory-state-v1')).profiles.find(p=>p.id===FG.store.current().id).grade),value);
 }else{
  await page.locator('#learningProfileError:not([hidden])').waitFor();
  assert.match(await page.locator('#learningProfileError').innerText(),/Unlock Parent Controls/);
  await page.click('#learningProfileCancel');
 }
}
async function solve(page,scope){
 const item=await page.evaluate(()=>FG.learning.activeItem);
 const helper=scope.getByRole('button',{name:'A grown-up read the instruction'});
 // Chromium runs without a device voice in this fixture. A response before
 // the adult confirms delivery must leave answers and earned progress intact.
 const attemptId=await page.evaluate(()=>FG.learning.activeAttemptId);
 const records=()=>page.evaluate(id=>{
  const p=FG.store.current(),a=(FG.learning.subject==='language'?p.language:p.learning)?.attempts?.find(a=>a.id===id);
  return {id:a?.id,outcome:a?.outcome,answers:a?.answers?.length,delivery:a?.promptDelivery,independent:a?.independent};
 },attemptId);
 const before=await records();assert.equal(before.id,attemptId);
 const story=item.kind==='picture-order',beats=scope.locator('[data-action=check-beats]');
 const check=story?scope.locator('[data-action=check-tiles]'):await beats.count()?beats:scope.locator('.early-check');

 const answer=String(item.answer);
 if(await check.count()){
  if(story){for(const token of answer.split(' '))await scope.getByRole('button',{name:token,exact:true}).click();}
  else if(await beats.count()){for(let i=0;i<Number(answer);i++)await scope.locator('.language-beat-tap').click();}
  else if(item.parameters?.style==='sort'){for(const [i,bit] of [...answer].entries())if(bit==='1')await scope.locator('.early-counter button').nth(i).click();}
  else for(let i=0;i<Number(answer);i++)await scope.locator('.early-counter button').nth(i).click();
  await check.click();
 }else await scope.locator('[data-value='+JSON.stringify(answer)+']').click();
 assert.deepEqual(await records(),before);
 await helper.click();
 if(await check.count())await check.click();
 else await scope.locator('[data-value='+JSON.stringify(answer)+']').click();
 await page.waitForFunction(()=>!FG.learning.active);
 const saved=await records();assert.equal(saved.delivery,'grown-up');assert.equal(saved.independent,false);
 return item;
}
async function nativeMatrix(page){
 const state=()=>page.evaluate(()=>FG.runtime.snapshot().state);
 let tick=3;
 for(const game of ['factory','mining','gum','dragon','buckets','hill','moon','robot']){
  for(const subject of ['math','language']){
   await page.clock.setFixedTime(new Date(Date.now()+ ++tick*660000));
   await page.evaluate(({game,subject})=>{
    FG.store.changeProfile({learningSubject:subject});
    if(!['mining','factory','hill','gum'].includes(game))FG.app.openGame(game,{stateKey:'early-'+game+'-'+subject});
   },{game,subject});
   const studio=['mining','factory','hill','gum'].includes(game);
   if(studio){
    await page.click('#studioNavHome');
    await page.locator('[data-starter="'+game+'"]').click();
    await page.locator('#page-studio.studio-play-mode').waitFor();
   }
   const mount=page.locator('#game-mount');let after;
   if(game==='factory'){
    await mount.locator('[data-action="route-order"]').click();
    assert.equal((await state()).sortingBusy,true);
    after=async()=>{await page.waitForFunction(()=>!FG.runtime.snapshot().state.hostPaused);await mount.locator('[data-action="pause"]').click();assert.equal((await state()).userPaused,true);};
   }else if(game==='gum'){
    const parts=mount.locator('[data-gum-part]:visible');
    const first=parts.first(),second=parts.nth(1);
    await first.click();assert.equal((await state()).selectedPart,await first.getAttribute('data-gum-part'));
    after=async()=>{await second.click();assert.equal((await state()).selectedPart,await second.getAttribute('data-gum-part'));};
   }else if(game==='mining'){
    await mount.locator('.native-mining[data-assets="ready"]').waitFor();
    const resume=mount.locator('[data-myj="resume"]');if(await resume.isVisible())await resume.click();
    const start=(await state()).elapsedMs;await page.waitForFunction(start=>FG.runtime.snapshot().state.elapsedMs>start,start);
    after=async()=>{const t=(await state()).elapsedMs;await page.waitForFunction(t=>FG.runtime.snapshot().state.elapsedMs>t,t);};
   }else if(game==='buckets'){
    for(let i=0;i<3;i++)await mount.locator('#go').click();
    assert.equal((await state()).mode,'play');await mount.locator('#right').click();
    after=async()=>{const old=(await state()).selection;await mount.locator('#left').click();assert.notEqual((await state()).selection,old);};
   }else if(game==='dragon'){
    await mount.locator('#startBtn').click();assert.equal((await state()).mode,'playing');
    after=async()=>{await mount.locator('#pauseBtn').click();assert.equal((await state()).mode,'pause');await mount.locator('#resumeBtn').click();assert.equal((await state()).mode,'playing');};
   }else if(game==='hill'){
    await mount.getByRole('button',{name:'Let’s drive',exact:true}).click();
    assert.equal((await state()).mode,'drive');
    after=async()=>{const old=(await state()).time;await page.waitForFunction(t=>FG.runtime.snapshot().state.time!==t,old);};
   }else if(game==='moon'){
    await mount.locator('[data-action="jump"]').click();
    after=async()=>{const move=mount.locator('[data-action="right"]');await move.scrollIntoViewIfNeeded();const box=await move.boundingBox();
     const x=(await state()).x;await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
     try{await page.waitForFunction(x=>Math.abs(FG.runtime.snapshot().state.x-x)>1,x);}finally{await page.mouse.up();}};
   }else{
    await mount.locator('[data-direction="right"]').click();assert.equal((await state()).planLength,1);
    after=async()=>{await mount.locator('[data-direction="up"]').click();assert.equal((await state()).planLength,2);};
   }
   if(game==='buckets'){
    await mount.locator('#go').click();await page.waitForFunction(()=>FG.runtime.snapshot().state.mode==='result',null,{timeout:45000});
    await mount.locator('#go').click();
   }else await page.evaluate(game=>window.dispatchEvent(new CustomEvent('factory-game-event',{detail:{type:'checkpoint',game}})),game);
   const scope=page.locator('#stage-overlay .early-activity');await scope.waitFor();
   assert.equal(await mount.evaluate(n=>n.inert),true);
   const active=await page.evaluate(()=>FG.learning.activeAttemptId);
   await page.evaluate(game=>window.dispatchEvent(new CustomEvent('factory-game-event',{detail:{type:'checkpoint',game}})),game);
   assert.equal(await page.evaluate(()=>FG.learning.activeAttemptId),active);
   const item=await solve(page,scope);assert.ok(item.grade<=0);
   if(game==='buckets')await page.click('#resultNext');
   assert.equal(await mount.evaluate(n=>n.inert),false);await after();
   if(studio)await page.click('#studioHome');else await page.evaluate(()=>FG.app.page('home'));console.log('PASS native '+game+' '+subject+' with activity and resumed gameplay.');
  }
 }
}
async function isolatedPreview(page){
 const {renderPreview}=require('../server/pipeline/artifacts.ts');
 const {build}=require('esbuild');
 const bridge=(await build({entryPoints:['src/learning/remote.ts'],bundle:true,format:'iife',globalName:'EarlyPreview',platform:'browser',write:false})).outputFiles[0].text;
 await page.addScriptTag({content:bridge});
 for(const [i,subject] of ['math','language'].entries()){
  await page.clock.setFixedTime(new Date(Date.now()+(30+i)*660000));
  const channel='early-reviewed-'+subject,artifactId='synthetic-star-catcher';
  const html=renderPreview({kind:'star-catcher-v1',target:2,seconds:60},artifactId,channel).html;
  await page.evaluate(({channel,artifactId,html,subject})=>{
   FG.app.page('home');FG.store.changeProfile({learningSubject:subject});
   const wrapper=document.createElement('section');wrapper.id='early-preview-fixture';wrapper.style.cssText='position:relative;width:100%;height:640px';
   const frame=document.createElement('iframe');frame.sandbox.add('allow-scripts');frame.style.cssText='width:100%;height:640px';
   wrapper.append(frame);document.querySelector('#page-home').prepend(wrapper);
   window.earlyRounds=0;window.earlyBridge=EarlyPreview.attachPreviewLearning(frame,{channel,artifactId,ownerId:FG.store.current().id,
    gameId:'synthetic-catcher',projectId:'private-synthetic',mode:'checkpoint',onRound(){window.earlyRounds++;}});
   frame.srcdoc=html;
  },{channel,artifactId,html,subject});
  const frame=page.frameLocator('#early-preview-fixture iframe');
  await page.waitForFunction(()=>window.earlyBridge.ready);
  assert.equal(await frame.locator('body').evaluate(()=>{try{return !!parent.document.body;}catch{return false;}}),false);
  const star=frame.getByRole('button',{name:'Catch star',exact:true}).first();
  await star.click();await star.click();
  const activity=page.locator('.learning-preview-cover .early-activity');await activity.waitFor();
  await solve(page,activity);await page.waitForFunction(()=>window.earlyRounds===1);
  await frame.locator('#restart').click();await star.click();
  await page.evaluate(()=>{window.earlyBridge.dispose();document.querySelector('#early-preview-fixture').remove();});
  console.log('PASS isolated reviewed game '+subject+', host-only evaluation and replay.');
 }
}

async function checkEarlyScene(page){
 await page.click('#creationBack');await page.click('#creationChallengeMode');await page.click('[data-challenge="first-step"]');
 await page.locator('[data-move-direction="right"]').click();
 await page.getByText('Predict a move',{exact:true}).click();await page.click('[data-prediction="right"]');
 await page.click('#creationCheck');
 if(await page.locator('.early-activity:visible').count())await solve(page,page.locator('.early-activity:visible'));
 await page.locator('#creationFeedback.is-success').waitFor();
 const observation=await page.evaluate(()=>{
  return JSON.parse(localStorage.getItem('family-game-factory-creation-v1')).attempts.at(-1);
 });
 assert.deepEqual(observation.prediction,{choice:'right',observed:'right'});assert.equal(observation.passed,true);
 await page.click('#creationCloseFeedback');
 console.log('PASS graphical program and explicit prediction recorded against the checked revision.');
}
async function localAudioAndCreationGate(page){
 const {build}=require('esbuild');
 for(const [entry,globalName] of [['src/learning/content.ts','EarlyMath'],['src/language/content.ts','EarlyContent'],['src/builder/session.ts','EarlyFamilyClient']]){
  const bundle=await build({entryPoints:[entry],platform:'browser',format:'iife',globalName,bundle:true,write:false});
  await page.addScriptTag({content:bundle.outputFiles[0].text});
 }
 const statuses=await page.evaluate(async()=>{
  const codes=[];
  for(const path of ['/v1/jobs','/v1/revisions','/v1/coach','/v1/coach/audio']){
   const response=await EarlyFamilyClient.familyFetch(location.origin+'/fixture',path,{method:'POST',body:'{}'});
   codes.push([response.status,(await response.json()).errorCode]);
  }
  return codes;
 });
 assert.deepEqual(statuses,Array(4).fill([403,'PARENT_GUIDED_CREATION_UNAVAILABLE']));
 const answer=await page.evaluate(()=>{
  const w=window;w.spoken=[];
  w.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
  speechSynthesis.getVoices=()=>[{name:'Samantha',lang:'en-US',voiceURI:'Samantha',default:true,localService:true}];
  speechSynthesis.cancel=()=>{};
  speechSynthesis.speak=u=>{w.spoken.push(u.text);u.onstart?.();queueMicrotask(()=>u.onend?.());};
  FG.store.changeProfile({learningSubject:'language'});
  const item=EarlyContent.generateLanguageItem('k-ela-printed-word',{tier:1,random:()=>.25});
  const holder=document.createElement('section');holder.id='early-listening-check';document.body.append(holder);
  FG.learning.mount(holder,{item,context:{gameId:'synthetic-decoding'},onComplete(){}});
  return item.answer;
 });
 const activity=page.locator('#early-listening-check .early-activity');await activity.waitFor();
 await page.waitForFunction(()=>FG.store.current().language.attempts[0].promptDelivery==='audio');
 await activity.getByRole('button',{name:'Hear it again'}).click();await page.waitForFunction(()=>window.spoken.length>=2);
 const spoken=await page.evaluate(()=>window.spoken);
 assert.ok(spoken.every(text=>!text.toLowerCase().split(/\W+/).includes(answer)));
 await activity.locator('[data-value='+JSON.stringify(answer)+']').click();await page.waitForFunction(()=>!FG.learning.active);
 const record=await page.evaluate(()=>FG.store.current().language.attempts[0]);
 assert.equal(record.item.domain,'early-reading');assert.equal(record.independent,true);
 await page.evaluate(()=>{
  FG.store.changeProfile({learningSubject:'math'});
  let item;
  for(let seed=0;seed<=200;seed++){
   item=EarlyMath.generateItem('k-numeral-group',{tier:0,random:()=>seed/201});if(item.answer==='0')break;
  }
  if(item.answer!=='0')throw Error('Missing a zero-quantity test item');
  FG.learning.mount(document.querySelector('#early-listening-check'),{item,context:{gameId:'synthetic-quantity'},onComplete(){}});
 });
 const empty=page.locator('#early-listening-check .early-empty-group');
 assert.equal(await empty.textContent(),'');assert.equal(await empty.getAttribute('aria-label'),'Empty group');
 await page.waitForFunction(()=>FG.store.current().learning.attempts.find(a=>a.id===FG.learning.activeAttemptId)?.promptDelivery==='audio');
 await page.locator('#early-listening-check [data-value="0"]').click();await page.waitForFunction(()=>!FG.learning.active);
 await page.evaluate(()=>{
  document.querySelector('#early-listening-check').remove();
  FG.app.openGame('gum',{config:{originalRules:true,qualityVersion:0,gumBudget:10,jointStrength:1,highlightMatches:false,extraDecoys:0}});
 });
 const directions=page.locator('[data-early-game-directions="gum"]');
 await directions.waitFor();
 await page.waitForFunction(()=>window.spoken.at(-1)==='Tap a piece to add it to your build.');
 await directions.getByRole('button',{name:'Mute',exact:true}).click();
 await page.evaluate(()=>FG.app.page('home'));assert.equal(await directions.count(),0);

 console.log('PASS local speech event fixture, replay, silent decoding target, independent response and restricted creation requests.');
}

async function run(){
 fs.mkdirSync(evidence,{recursive:true});
 const server=start(process.env.EARLY_BUILD_DIR||'test-results/early-build');
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox']});
 try{
  for(const [name,width,height,grade] of views){
   if(process.env.EARLY_TEST_VIEW&&process.env.EARLY_TEST_VIEW!==name)continue;
   const context=await browser.newContext({viewport:{width,height},hasTouch:name!=='desktop',reducedMotion:'reduce'});
   await context.addInitScript(()=>{if(window.speechSynthesis)window.speechSynthesis.getVoices=()=>[];});
   const page=await context.newPage();page.setDefaultTimeout(18000);
   const errors=[],paid=[];let unlocked=false,verified=0;
   let waitForParent=null,parentReached=null;
   const origin='http://127.0.0.1:'+server.address().port;
   await page.route('**/factory-config.json',route=>route.fulfill({json:{version:1,mode:'remote',apiBaseUrl:origin+'/fixture',previewOrigin:'http://localhost:'+server.address().port}}));
   await page.route('**/fixture/**',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname==='/fixture/v1/devices'){verified++;parentReached?.();if(waitForParent)await waitForParent;return route.fulfill({status:unlocked?200:403,json:unlocked?{devices:[]}:{errorCode:'PARENT_REQUIRED'}});}
    if(route.request().method()==='POST'&&/jobs|coach|revisions|actions/.test(url.pathname))paid.push(url.pathname);
    return route.fulfill({status:200,json:{connected:false,trusted:false,projects:[],games:[]}});
   });
   page.on('dialog',dialog=>void dialog.accept());page.on('pageerror',err=>errors.push(err.message));
   try{
    await page.goto(origin+'/arcade/');await exploreWelcome(page);
    await page.waitForFunction(()=>typeof FG.verifyParentSettings==='function');
    await editGrade(page,grade,false);
    assert.equal(await page.evaluate(()=>FG.store.current().grade),1);
    unlocked=true;
    if(name==='tablet-portrait'){
     let release;const admitted=new Promise(resolve=>{parentReached=resolve;});const prior=verified;waitForParent=new Promise(resolve=>{release=resolve;});
     await page.evaluate(()=>{window.staleSave=FG.store.changeLearningProfile({grade:4}).then(()=>true,()=>false);});
     await Promise.race([admitted,page.waitForTimeout(8000)]);parentReached=null;
     assert.ok(verified>prior);
     await page.evaluate(()=>{FG.store.choose('player2');window.dispatchEvent(new Event('factory-profile'));});
     release();waitForParent=null;assert.equal(await page.evaluate(()=>window.staleSave),false);
     await page.evaluate(()=>{FG.store.choose('player1');FG.app.refreshProfiles();window.dispatchEvent(new Event('factory-profile'));});
     assert.equal(await page.evaluate(()=>FG.store.current().grade),1);
    }
    if(name==='tablet-portrait')for(const g of [4,3,2,1,0])await editGrade(page,g);
    await editGrade(page,grade);
    assert.ok(verified>=2);
    await page.reload();await exploreWelcome(page);
    assert.equal(await page.evaluate(()=>FG.store.current().grade),grade);
    await page.click('#studioNew');await page.locator('#earlyCreationHandoff[open]').waitFor();
    if(name==='phone')await capture(page,'phone-handoff');
    await page.locator('#earlyCreationHandoff').getByRole('button',{name:'Create a scene'}).click();
    if(await page.locator('#creationIntroduction').isVisible())await page.click('#creationIntroSkip');
    await page.click('#creationFreeMode');
    await page.click('[data-creation-starter="blank"]');
    await page.locator('[data-move-direction="right"]').click();
    assert.ok(await page.evaluate(()=>FG.creation.scene().programs.some(p=>p.actions.some(a=>a.type==='move'))));
    await capture(page,name+'-coding');
    if(name==='tablet-landscape')await checkEarlyScene(page);
    await page.click('#creationHome');
    for(const [index,subject] of ['math','language'].entries()){
     await page.clock.setFixedTime(new Date(Date.now()+(index+1)*660000));
     await page.evaluate(subject=>{
      FG.store.changeProfile({learningSubject:subject,allowSubjectSwitch:true,rate:8,intensity:'stretch'});
      FG.app.openGame('gum',{stateKey:'early-'+subject,config:{originalRules:true,qualityVersion:0,gumBudget:10,jointStrength:1,highlightMatches:false,extraDecoys:0}});
     },subject);
     const add=page.getByRole('button',{name:'Add Bottle',exact:true});
     await add.click();
     if(name==='tablet-portrait'&&subject==='math')await capture(page,'game-before');
     const count=await page.evaluate(()=>FG.runtime.snapshot().state.parts.length);
     await page.evaluate(()=>window.dispatchEvent(new CustomEvent('factory-game-event',{detail:{type:'checkpoint',game:'gum'}})));
     const scope=page.locator('#stage-overlay .early-activity');await scope.waitFor();
     assert.equal(await page.locator('#game-mount').evaluate(n=>n.inert),true);
     if(name==='tablet-landscape'&&subject==='math')assert.equal(await scope.locator('[data-action="leave-game"]').count(),1);
     await capture(page,name+'-'+subject);
     const item=await solve(page,scope);
     assert.ok(item.grade<=grade);
     assert.equal(await page.locator('#game-mount').evaluate(n=>n.inert),false);
     await page.getByRole('button',{name:'Add Fan',exact:true}).click();assert.ok(await page.evaluate(()=>FG.runtime.snapshot().state.parts.length)>count);
     if(name==='tablet-portrait'&&subject==='math')await capture(page,'game-after');
     await page.evaluate(()=>FG.app.page('home'));
    }
    if(name==='desktop'){await nativeMatrix(page);await isolatedPreview(page);await localAudioAndCreationGate(page);}
    assert.deepEqual(errors,[]);assert.deepEqual(paid,[]);
    console.log('PASS '+name+' saved grade '+grade+', parent authorization, scene editing, two live game checkpoints and resumed play.');
   }catch(error){console.error(name,await page.evaluate(()=>({grade:FG.store.current().grade,subject:FG.learning.subject,active:FG.learning.active,visible:document.querySelector('main > .page:not(.hidden)')?.id})));await capture(page,name+'-failure');throw error;}finally{await context.close();}
  }
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
