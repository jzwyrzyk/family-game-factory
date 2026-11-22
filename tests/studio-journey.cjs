const {exploreWelcome,sendChildMessage,navigate,openProfiles}=require('./studio-entry.cjs');
/* Runs against the real production dist and original game host. No paid model calls. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {start}=require('./browser-server.cjs');
(async()=>{
 const server=start(),browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(!process.env.CI&&fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']});
 fs.mkdirSync('test-results',{recursive:true});
 try{
 for(const [device,viewport] of [['desktop',{width:1400,height:960}],['mobile',{width:390,height:844}]] ){
  const ctx=await browser.newContext({viewport,hasTouch:device==='mobile',reducedMotion:'reduce'}),page=await ctx.newPage(),errors=[],jobs=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());page.on('request',r=>{if(r.url().includes('/v1/jobs'))jobs.push(r.url());});
  const url=`http://127.0.0.1:${server.address().port}/arcade/?studio=1`;
  await page.goto(url);await page.waitForFunction(()=>FG.studio&&FG.factory&&FG.builder);await exploreWelcome(page);
  // This suite checks studio/history isolation. A recent question satisfies the
  // ordinary pacing budget; math remains mandatory and is tested separately.
  const seededSkill=await page.evaluate(()=>{FG.store.changeProfile({rate:1});FG.store.current().mathWindow=[Date.now()];FG.store.save();FG.store.current().skills['mul:8x7']={tries:4,right:2,hints:1,streak:1,last:'2026-11-14T00:00:00Z'};FG.store.save();return JSON.stringify(FG.store.current().skills['mul:8x7']);});
  const notebook=()=>page.evaluate(()=>FG.studio.exportNotebook());
  const workspace=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('family-game-factory-workspace-v2')));
  const runtime=()=>page.evaluate(()=>FG.runtime.snapshot());
  const bottles=async()=>(await runtime()).state.parts.filter(p=>p.kind==='bottle').length;
  const budget=async expected=>{await page.waitForFunction(n=>FG.runtime.snapshot().config.gumBudget===n,expected);const r=await runtime();assert.equal(r.state.gumRemaining,expected-r.state.joints.length);};
  const talk=async()=>{await page.click('#studioChange');};
  const more=async()=>{if(!await page.locator('#studioMore').evaluate(e=>e.open))await page.click('#studioMore > summary');};
  const profiles=()=>openProfiles(page);
  assert.equal(await page.locator('#studioStarters [data-starter]').count(),4);
  await page.screenshot({path:`test-results/studio-library-${device}.png`,fullPage:true});
  await page.click('[data-starter="gum"]');
  // This suite exercises the preserved physical builder; newly created games
  // use assembly and are tested in bubble-gum-builder-browser.cjs. Resume this
  // older project from its own My jems card, preserving its engine and history.
  const physicalSessionId=await page.evaluate(()=>{
    const key='family-game-factory-workspace-v2',w=JSON.parse(localStorage.getItem(key));
    const p=w.projects.find(p=>p.game==='gum'),r=w.revisions.find(r=>r.id===p.headId);
    r.config.qualityVersion=1;
    localStorage.setItem(key,JSON.stringify(w));
    return FG.studio.exportNotebook().sessions.find(s=>s.projectId===p.id).id;
  });
  await page.reload();await page.waitForFunction(()=>FG.studio);
  await page.locator(`#studioLibrary [data-session="${physicalSessionId}"] .studio-saved-open`).click();await page.waitForSelector('.quality-builder');
  // A replay/version control must retain an active host activity; leaving the game may interrupt it.
  const guardedAttempt=await page.evaluate(()=>{const overlay=document.getElementById('stage-overlay'),target=document.createElement('div');overlay.replaceChildren(target);overlay.classList.remove('hidden');FG.store.current().mathWindow=[];const s=FG.studio.exportNotebook().sessions[0];FG.learning.checkpoint(target,{gameId:'gum',projectId:s.id,versionId:'replay-guard'},()=>{},{roundId:'replay-guard'});return FG.learning.activeAttemptId;});
  assert.ok(guardedAttempt);assert.equal(await page.locator('#studioPlay').isVisible(),false,'active play has no redundant restart control');
  await page.click('#studioChange');
  // A stale queued replay activation must still respect the same host guard,
  // even though the ordinary play screen no longer displays this button.
  await page.evaluate(()=>document.getElementById('studioPlay').click());
  assert.equal(await page.evaluate(()=>FG.learning.activeAttemptId),guardedAttempt);
  assert.equal(await page.evaluate(id=>FG.store.current().learning.attempts.find(a=>a.id===id).outcome,guardedAttempt),'open');
  await page.screenshot({path:`test-results/math-studio-${device}.png`,fullPage:true});
  await page.click('#studioHome');assert.equal(await page.evaluate(()=>FG.learning.active),false);
  assert.equal(await page.evaluate(id=>FG.store.current().learning.attempts.find(a=>a.id===id).outcome,guardedAttempt),'interrupted');
  assert.deepEqual(await page.evaluate(id=>{const a=FG.store.current().learning.attempts.find(a=>a.id===id);return {answers:a.answers.length,correct:a.correct,independent:a.independent};},guardedAttempt),{answers:0,correct:false,independent:false});
  assert.equal(await page.evaluate(()=>JSON.stringify(FG.store.current().skills['mul:8x7'])),seededSkill);
  // An unanswered checkpoint now refunds its pacing receipt. Assert that
  // requirement, then use the test-only pacing fixture from this suite to
  // isolate Studio/physics interactions from unrelated later checkpoints.
  assert.equal(await page.evaluate(()=>FG.math.canAsk(FG.store.current())),true,
    'Leaving an unanswered checkpoint must not satisfy the learning budget');
  await page.evaluate(()=>{
    FG.store.current().mathWindow=[Date.now()];
    if(!FG.store.save())throw Error('Could not save Studio pacing fixture');
  });
  assert.equal(await page.evaluate(()=>FG.math.canAsk(FG.store.current())),false,
    'The Studio journey requires a deliberately satisfied test-only pacing budget');
  // The intentional presentation may create a zero-count legacy fact. Subsequent
  // design/history actions must preserve this post-checkpoint learning baseline.
  const original=await page.evaluate(()=>JSON.stringify(FG.store.current().skills));
  await page.locator(`#studioLibrary [data-session="${physicalSessionId}"] .studio-saved-open`).click();await page.waitForSelector('.quality-builder');
  await page.getByRole('button',{name:'Add Bottle',exact:true}).click();assert.equal(await bottles(),1);
  const base=(await workspace()).projects[0].headId;
  await talk();await page.fill('#studioPrompt','Give me 15 gum sticks');await page.click('#studioSend');
  assert.equal((await workspace()).projects[0].headId,base,'Try must not change working pointer');
  await budget(15);assert.equal(await bottles(),1);
  await more();await page.click('#studioUndo');await budget(10);
  await more();await page.click('#studioRedo');await budget(15);
  await page.click('#studioKeep');assert.notEqual((await workspace()).projects[0].headId,base);
  for(const prompt of ['Make joints stronger','Give me six gum sticks','Make joints stronger','Give me ten gum sticks']){
   await talk();await page.fill('#studioPrompt',prompt);await page.click('#studioSend');assert.equal(await page.locator('#studioPreviewNotice').isVisible(),true);assert.equal(await bottles(),1);await page.click('#studioKeep');
  }
  assert.equal((await workspace()).revisions.length,6,'five kept edits plus starting version');
  // Complete a real physical construction, then explicitly enter the ordinary host outcome.
  await page.getByRole('button',{name:'Use example',exact:true}).click();const testedBlueprint=(await runtime()).state.blueprint;
  await page.getByRole('button',{name:/Test machine/}).click();
  await page.waitForFunction(()=>FG.runtime.snapshot().state.simulation?.status==='won',null,{timeout:15000});
  assert.equal((await notebook()).sessions.some(s=>s.reflection),false,'physics success alone does not force reflection');
  await page.getByRole('button',{name:'Finish challenge',exact:true}).click();
  await page.waitForFunction(()=>FG.studio.exportNotebook().sessions.some(s=>s.reflection));
  await talk();assert.match(await page.textContent('#studioMessages'),/fun or tricky/);
  await page.click('#studioReflectAnswer');await page.fill('#studioPrompt','I liked seeing my rocket stay together.');await page.click('#studioSend');
  assert.match(await page.textContent('#studioMessages'),/I liked seeing/);
  await more();await page.click('#studioCopy');await page.fill('#studioCopyName',`Space workshop ${device}`);await page.click('#studioCopyForm button[type="submit"]');
  assert.deepEqual((await runtime()).state.blueprint,testedBlueprint);
  await talk();await page.fill('#studioPrompt','An unfinished idea for next time');await page.click('#studioHome');await page.reload();await page.waitForFunction(()=>FG.studio);
  await page.locator('#studioLibrary button').filter({hasText:`Space workshop ${device}`}).click();await page.waitForFunction(()=>FG.runtime.snapshot().state.clock.frames>0);await talk();
  assert.equal(await page.inputValue('#studioPrompt'),'An unfinished idea for next time');assert.match(await page.textContent('#studioMessages'),/Give me 15 gum sticks/);
  await more();await page.click('#studioCompare');assert.ok(await page.locator('.studio-version-card').count()>=1);
  await page.click('#studioCloseVersions');
  assert.equal(await page.locator('#studioPausedPreview').isVisible(),true,'closing versions shows the paused build instead of a blank host');
  assert.equal(await page.locator('.quality-builder').count(),0,'the preview does not keep the live game mounted');assert.equal((await runtime()).disposed,true);
  const pausedFrame=await page.locator('#studioPausedPreview canvas').evaluate(canvas=>{
   const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data,colors=new Set();
   for(let i=0;i<pixels.length;i+=256)if(pixels[i+3])colors.add(`${pixels[i]},${pixels[i+1]},${pixels[i+2]}`);
   return {width:canvas.width,height:canvas.height,colors:colors.size,image:canvas.toDataURL()};
  });
  assert.ok(pausedFrame.width>0&&pausedFrame.width<=960&&pausedFrame.height>0&&pausedFrame.height<=600);assert.ok(pausedFrame.colors>8,'the copied scene contains the rendered workshop');
  assert.match(await page.textContent('#studioPausedPreview'),new RegExp(`Space workshop ${device}`));const disposedFrames=(await runtime()).state.clock.frames;
  await page.waitForTimeout(120);assert.equal(await page.locator('#studioPausedPreview canvas').evaluate(c=>c.toDataURL()),pausedFrame.image,'the paused scene is static');assert.equal((await runtime()).state.clock.frames,disposedFrames,'the disposed game does not keep rendering');
  assert.equal(await page.evaluate(()=>Object.values(localStorage).some(value=>String(value).includes('data:image/'))),false,'paused pixels never enter browser storage');
  await page.screenshot({path:`test-results/studio-workspace-${device}.png`,fullPage:true});
  await page.locator('#studioPausedPreview').screenshot({path:`test-results/studio-paused-workshop-${device}.png`});
  await page.click('#studioPlay');await page.waitForSelector('.quality-builder');
  assert.equal(await page.locator('#studioPausedPreview canvas').count(),0,'mounting a game releases the copied frame');assert.equal((await runtime()).disposed,false);assert.deepEqual((await runtime()).state.blueprint,testedBlueprint);
  const after=await page.evaluate(()=>JSON.stringify(FG.store.current().skills));assert.equal(after,original);
  // Profile isolation must not lose an immediately typed draft.
  await talk();await page.fill('#studioPrompt','My private unfinished idea');await profiles();await page.locator('.profile-choice').nth(1).click();assert.equal(await page.locator('#studioLibrary [data-session]').count(),0);
  assert.equal(await page.locator('#studioPausedPreview').textContent(),'');assert.equal(await page.locator('#studioPausedPreview canvas').count(),0,'a profile switch releases the previous profile’s scene');
  await profiles();await page.locator('.profile-choice').first().click();await page.locator('#studioLibrary button').filter({hasText:`Space workshop ${device}`}).click();await talk();assert.equal(await page.inputValue('#studioPrompt'),'My private unfinished idea');
  // Garage requests stay in this notebook and continue the currently played test.
  await page.click('#studioHome');await page.click('[data-starter="hill"]');await page.waitForSelector('.quality-hill');
  assert.equal(await page.locator('#studioPausedPreview canvas').count(),0,'a different project never inherits the previous frame');
  const hillMain=(await workspace()).projects.find(p=>p.game==='hill').headId,projectCount=(await workspace()).projects.length,sessionCount=(await notebook()).sessions.length;
  await page.locator('.quality-hill summary').click();await page.getByRole('button',{name:'Sea green',exact:true}).click();await page.getByRole('combobox',{name:'Choose a trail',exact:true}).selectOption('ridge');
  await page.getByRole('button',{name:'Make the wheels bigger',exact:true}).click();await page.waitForFunction(()=>FG.runtime.snapshot().config.wheelSize===.57);
  let ride=await runtime(),rideSession=(await notebook()).sessions.find(s=>s.game==='hill');const firstRideTest=rideSession.candidate.id;
  assert.equal(ride.state.paint,'#50a89a');assert.equal(ride.state.track,'ridge');assert.equal(rideSession.experiments[0].origin,'helper');
  assert.equal((await workspace()).projects.length,projectCount);assert.equal((await notebook()).sessions.length,sessionCount);assert.equal((await workspace()).projects.find(p=>p.game==='hill').headId,hillMain);
  assert.equal(await page.locator('#page-feedback').isVisible(),false,'the legacy remix screen never opens');
  await page.locator('.quality-hill summary').click();await page.getByRole('button',{name:'Make the motor stronger',exact:true}).click();await page.waitForFunction(()=>FG.runtime.snapshot().config.enginePower===1.2);
  ride=await runtime();rideSession=(await notebook()).sessions.find(s=>s.game==='hill');assert.equal(ride.config.wheelSize,.57);assert.equal(ride.state.paint,'#50a89a');assert.deepEqual(rideSession.experiments.at(-1).parents,[firstRideTest]);
  await page.click('#studioKeep');assert.notEqual((await workspace()).projects.find(p=>p.game==='hill').headId,hillMain);
  await talk();assert.match(await page.textContent('#studioPausedPreview'),/Junkyard Rally/);
  await navigate(page,'#studioNavCreate');assert.equal(await page.locator('#studioPausedPreview').textContent(),'');assert.equal(await page.locator('#studioPausedPreview canvas').count(),0,'a new idea clears the previous game preview');
  const offlineIdea=await sendChildMessage(page,'Build a brand new flying banana universe');
  assert.ok(offlineIdea.messages.some(message=>message.role==='child'&&message.text==='Build a brand new flying banana universe'),'the offline idea is saved through Send');
  assert.equal(await page.locator('#coachGuidedChoices').count(),0,'the child supplies the answers in the conversation');
  assert.equal(await page.locator('#studioSend').isDisabled(),true,'an offline coach cannot approve a new game for Build');
  assert.equal(await page.locator('#studioBuildHandoff').isVisible(),false,'discussion does not pretend a build has started');
  assert.equal(await page.locator('#studioKeep').isDisabled(),true);assert.deepEqual(jobs,[]);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);assert.deepEqual(errors,[]);
  const n=await notebook();assert.ok(n.sessions.some(s=>s.game==='new'&&!s.projectId&&!s.remoteId));
  console.log(`PASS ${device}: production studio, five staged changes, physical construction, optional reflection, static paused preview and cleanup, Hill garage routing, undo/redo/fork, private draft/reload and honest offline AI`);await ctx.close();
 }
 // Transport fixtures exercise in-tool remote states. They are NOT real model inference.
 const ctx=await browser.newContext(),page=await ctx.newPage();let polls=0,phase='ready',kept=0;const errors=[],remoteRequests=[],coachRequests=[];page.on('pageerror',e=>errors.push(e.message));
 const childIdea='A fox hops between clouds to carry stars to the moon house. Tap to jump.';
 const childRules='You win when all five stars reach the house. Falling puts the fox back on the last cloud. I want it to feel playful and brave, with time to think. A pink sky, soft cartoon clouds, and gold stars. Each later level adds one moving cloud. No timer, enemies, or extra powers.';
 const childEvidence={
  action:'Tap to jump.',
  consequence:'You win when all five stars reach the house. Falling puts the fox back on the last cloud.',
  experience:'I want it to feel playful and brave, with time to think.',
  world:'A pink sky, soft cartoon clouds, and gold stars.'
 };
 await page.route('**/factory-config.json',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({version:1,mode:'remote',apiBaseUrl:'https://studio-api.test',previewOrigin:'https://studio-preview.test'})}));
 await page.route('https://studio-api.test/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;let data;
  const headers={'Access-Control-Allow-Origin':`http://127.0.0.1:${server.address().port}`,'Access-Control-Allow-Credentials':'true','Access-Control-Allow-Headers':'Content-Type, X-Factory-Request','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
  if(req.method()==='OPTIONS'){await route.fulfill({status:204,headers});return;}
  // Model a real authenticated modern gateway. An absent session-status
  // endpoint must NEVER silently authorize a paid build.
  if(path==='/v1/sessions/status'&&req.method()==='GET')
   data={connected:true,trusted:true,expiresAt:Date.now()+60000};
  else if(path==='/v1/coach'&&req.method()==='POST'){
   const context=req.postDataJSON().context;coachRequests.push(context);
   assert.deepEqual(context.creation,{version:1},'new-game Send requests a contextual creation review');
   const complete=context.message===childRules;
   assert.ok(complete||context.message===childIdea,'the fixture reviews only the words the child sent');
   if(complete)for(const quote of Object.values(childEvidence))assert.ok([context.message,...context.conversation.filter(message=>message.role==='child').map(message=>message.text)].some(text=>text.includes(quote)),'every ready reason quotes the child');
   data={mode:'model',reply:{move:complete?'listen':'clarify',
    text:complete?'Your fox can jump, recover from a fall, and carry stars home. The gentle world and moving clouds fit the way you want to play.':'A fox carrying stars home is a start.',
    question:complete?null:'How should it feel to jump between the clouds?',
    suggestions:[],proposedChange:null,planSuggestions:[],childDecisions:[],evidenceIds:[],
    creationReadiness:complete?{ready:true,evidence:childEvidence,unresolved:[]}:
     {ready:false,evidence:{action:childEvidence.action,consequence:'',experience:'',world:''},unresolved:['We still need to discuss what falling means, how it should feel, and the world around the fox.']}}};
  }
  else if(path==='/v1/jobs'&&req.method()==='POST'){remoteRequests.push(req.postDataJSON());polls=0;data={jobId:'fixture-job',status:'queued',adapter:'mock'};}
  else if(path==='/v1/jobs/fixture-job'){polls++;data=polls<2?{jobId:'fixture-job',status:'testing',adapter:'mock'}:phase==='failed'?{jobId:'fixture-job',status:'failed',adapter:'mock'}:{jobId:'fixture-job',status:'ready',revisionId:'fixture-rev',adapter:'mock'};}
  else if(path.endsWith('/preview'))data={url:'https://studio-preview.test/game?capability=TEST_ONLY',artifactId:'fixture-artifact',expiresAt:Date.now()+60000,kind:'generated-module-v2',adapter:'mock'};
  else if(path.endsWith('/keep')){kept++;data={ok:true};}
  else if(path.endsWith('/fork'))data={revisionId:'fixture-fork'};
  else data={errorCode:'NOT_FOUND'};
  await route.fulfill({status:data.errorCode?404:200,headers,contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.route('https://studio-preview.test/**',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><h1>Explicit test fixture</h1><button>Play</button><script>const channel=new URLSearchParams(location.search).get('channel'),artifactId='fixture-artifact';window.addEventListener('message',e=>{if(e.source===parent&&e.data.type==='factory-learning'&&e.data.channel===channel&&e.data.artifactId===artifactId&&e.data.action==='connect')parent.postMessage({type:'factory-preview',channel,artifactId,event:'ready',height:1000,learningProtocol:1},'*')});<\/script>`}));
 await page.goto(`http://127.0.0.1:${server.address().port}/arcade/?studio=1`);await page.waitForFunction(()=>FG.studio);await exploreWelcome(page);
 await navigate(page,'#studioNavCreate');await sendChildMessage(page,childIdea);
 assert.equal(await page.locator('#studioSend').isDisabled(),true,'an initial idea does not unlock Build');
 assert.equal(await page.locator('#coachChooseRest').count(),0,'the child cannot delegate an unfinished game plan');
 assert.equal(remoteRequests.length,0,'the first conversation turn cannot submit a job');
 await sendChildMessage(page,childRules);await page.waitForFunction(()=>document.getElementById('studioSend').disabled===false);
 assert.equal(await page.locator('#studioSend').isEnabled(),true,'a fresh grounded review offers an explicit Build');
 assert.equal(coachRequests.length,2);assert.equal(remoteRequests.length,0,'even a reviewed game still waits for the child to choose Build');
 await page.click('#studioSend');await page.waitForFunction(()=>document.getElementById('studioBuildHandoff')?.dataset.phase==='ready');
 assert.equal(remoteRequests.length,1);assert.ok(remoteRequests[0].prompt.includes(childIdea)&&remoteRequests[0].prompt.includes(childRules),'the submitted game carries the child’s own plan');
 assert.doesNotMatch(await page.textContent('#studioMessages'),/Current choices \(these replace|Later ideas, in order|Approved game plan|Choose sensible details for:/,'the build envelope stays out of the child’s conversation');
 await page.click('#studioBuildHandoffPlay');await page.waitForSelector('#studioRemoteHost iframe');
  assert.equal(await page.locator('#studioPausedPreview canvas').count(),0,'remote mounting does not retain a native frame');
 assert.equal(await page.locator('#studioRemoteHost iframe').getAttribute('sandbox'),'allow-scripts');
 // A generated game's preferred height cannot push the shared player offscreen.
 for(const size of [{width:1280,height:720},{width:390,height:844},{width:844,height:390}]){
  await page.setViewportSize(size);
  await page.waitForFunction(()=>{const frame=document.querySelector('#studioRemoteHost iframe'),r=frame.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight+1&&r.left>=0&&r.right<=innerWidth+1&&r.height>100;});
  assert.equal(await page.locator('#page-studio').evaluate(e=>e.classList.contains('studio-play-mode')),true);
  assert.equal(await page.locator('#studioHome').isVisible(),true,'remote preview keeps the same exit');
  assert.equal(await page.locator('#studioFullScreen').isVisible(),true,'remote preview keeps the same fullscreen control');
 }
 await page.setViewportSize({width:1280,height:720});
 assert.match(await page.textContent('#studioPlayNote'),/mock/);assert.equal(kept,0);
 assert.equal(await page.evaluate(()=>JSON.stringify(FG.studio.exportNotebook()).includes('TEST_ONLY')),false,'signed preview capabilities must not persist');
 await page.click('#studioKeep');await page.waitForFunction(()=>FG.studio.exportNotebook().sessions.some(s=>s.remoteId==='fixture-rev'&&!s.candidate));assert.equal(kept,1);
 phase='failed';await page.click('#studioChange');await page.fill('#studioPrompt','Try another fixture revision');await page.click('#studioSend');await page.waitForFunction(()=>FG.studio.exportNotebook().sessions.some(s=>s.job?.status==='failed'));
 assert.equal(await page.locator('#studioBuildHandoff').getAttribute('data-phase'),'failed');await page.click('#studioBuildHandoffStay');
 assert.equal(await page.evaluate(()=>FG.studio.exportNotebook().sessions[0].remoteId),'fixture-rev');assert.equal(remoteRequests.at(-1).gameId,'generated-module');assert.equal(kept,1);assert.deepEqual(errors,[]);
 console.log('PASS remote fixture: durable ACK, progress, isolated preview, explicit keep, failed-change preservation, no capability persistence (NO live AI calls)');await ctx.close();
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
