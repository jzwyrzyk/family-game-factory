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
  await page.goto(url);await page.waitForFunction(()=>FG.studio&&FG.factory&&FG.builder);
  const original=await page.evaluate(()=>{FG.store.changeProfile({rate:0});FG.store.current().skills['mul:8x7']={tries:4,right:2,hints:1,streak:1,last:'2026-11-14T00:00:00Z'};FG.store.save();return JSON.stringify(FG.store.current().skills);});
  const notebook=()=>page.evaluate(()=>FG.studio.exportNotebook());
  const workspace=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('family-game-factory-workspace-v2')));
  const runtime=()=>page.evaluate(()=>FG.runtime.snapshot());
  const bottles=async()=>(await runtime()).state.parts.filter(p=>p.kind==='bottle').length;
  const budget=async expected=>{await page.waitForFunction(n=>FG.runtime.snapshot().config.gumBudget===n,expected);const r=await runtime();assert.equal(r.state.gumRemaining,expected-r.state.joints.length);};
  const talk=async()=>{await page.click('#studioChange');};
  assert.equal(await page.locator('#studioStarters [data-starter]').count(),4);
  await page.screenshot({path:`test-results/studio-library-${device}.png`,fullPage:true});
  await page.click('[data-starter="gum"]');await page.waitForSelector('.quality-builder');
  await page.getByRole('button',{name:'Add Bottle',exact:true}).click();assert.equal(await bottles(),1);
  const base=(await workspace()).projects[0].headId;
  await talk();await page.fill('#studioPrompt','Give me 15 gum sticks');await page.click('#studioSend');
  assert.equal((await workspace()).projects[0].headId,base,'Try must not change working pointer');
  await budget(15);assert.equal(await bottles(),1);
  await page.click('#studioUndo');await budget(10);
  await page.click('#studioRedo');await budget(15);
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
  await page.getByRole('button',{name:'Finish challenge →',exact:true}).click();
  await page.waitForFunction(()=>FG.studio.exportNotebook().sessions.some(s=>s.reflection));
  await talk();assert.match(await page.textContent('#studioMessages'),/fun or tricky/);
  await page.click('#studioReflectAnswer');await page.fill('#studioPrompt','I liked seeing my rocket stay together.');await page.click('#studioSend');
  assert.match(await page.textContent('#studioMessages'),/I liked seeing/);
  await page.click('#studioCopy');await page.fill('#studioCopyName',`Space workshop ${device}`);await page.click('#studioCopyForm button[type="submit"]');
  assert.deepEqual((await runtime()).state.blueprint,testedBlueprint);
  await talk();await page.fill('#studioPrompt','An unfinished idea for next time');await page.click('#studioHome');await page.reload();await page.waitForFunction(()=>FG.studio);
  await page.locator('#studioLibrary button').filter({hasText:`Space workshop ${device}`}).click();await talk();
  assert.equal(await page.inputValue('#studioPrompt'),'An unfinished idea for next time');assert.match(await page.textContent('#studioMessages'),/Give me 15 gum sticks/);
  await page.click('#studioCompare');assert.ok(await page.locator('.studio-version-card').count()>=1);
  await page.click('#studioCloseVersions');await page.screenshot({path:`test-results/studio-workspace-${device}.png`,fullPage:true});
  const after=await page.evaluate(()=>JSON.stringify(FG.store.current().skills));assert.equal(after,original);
  // Profile isolation must not lose an immediately typed draft.
  await talk();await page.fill('#studioPrompt','My private unfinished idea');await page.locator('.profile-choice').nth(1).click();assert.equal(await page.locator('#studioLibrary [data-session]').count(),0);
  await page.locator('.profile-choice').first().click();await page.locator('#studioLibrary button').filter({hasText:`Space workshop ${device}`}).click();await talk();assert.equal(await page.inputValue('#studioPrompt'),'My private unfinished idea');
  // Garage requests stay in this notebook and continue the currently played test.
  await page.click('#studioHome');await page.click('[data-starter="hill"]');await page.waitForSelector('.quality-hill');
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
  await page.click('#studioNavCreate');await page.fill('#studioPrompt','Build a brand new flying banana universe');await page.click('#studioSend');assert.match(await page.textContent('#studioMessages'),/Local design helper/);await page.click('#coachPlanToggle');await page.getByRole('button',{name:'You choose the remaining details',exact:true}).click();await page.click('#buildGamePlan');assert.match(await page.textContent('#studioMessages'),/no build was started/);assert.equal(await page.locator('#studioKeep').isDisabled(),true);assert.deepEqual(jobs,[]);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);assert.deepEqual(errors,[]);
  const n=await notebook();assert.ok(n.sessions.some(s=>s.game==='new'&&!s.projectId&&!s.remoteId));
  console.log(`PASS ${device}: production studio, five staged changes, physical construction, optional reflection, Hill garage routing, undo/redo/fork, private draft/reload and honest offline AI`);await ctx.close();
 }
 // Transport fixtures exercise in-tool remote states. They are NOT real model inference.
 const ctx=await browser.newContext(),page=await ctx.newPage();let polls=0,phase='ready',kept=0;const errors=[],remoteRequests=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/factory-config.json',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({version:1,mode:'remote',apiBaseUrl:'https://studio-api.test',previewOrigin:'https://studio-preview.test'})}));
 await page.route('https://studio-api.test/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;let data;
  const headers={'Access-Control-Allow-Origin':`http://127.0.0.1:${server.address().port}`,'Access-Control-Allow-Credentials':'true','Access-Control-Allow-Headers':'Content-Type, X-Factory-Request','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
  if(req.method()==='OPTIONS'){await route.fulfill({status:204,headers});return;}
  if(path==='/v1/jobs'&&req.method()==='POST'){remoteRequests.push(req.postDataJSON());polls=0;data={jobId:'fixture-job',status:'queued',adapter:'mock'};}
  else if(path==='/v1/jobs/fixture-job'){polls++;data=polls<2?{jobId:'fixture-job',status:'testing',adapter:'mock'}:phase==='failed'?{jobId:'fixture-job',status:'failed',adapter:'mock'}:{jobId:'fixture-job',status:'ready',revisionId:'fixture-rev',adapter:'mock'};}
  else if(path.endsWith('/preview'))data={url:'https://studio-preview.test/game?capability=TEST_ONLY',artifactId:'fixture-artifact',expiresAt:Date.now()+60000,kind:'generated-module-v2',adapter:'mock'};
  else if(path.endsWith('/keep')){kept++;data={ok:true};}
  else if(path.endsWith('/fork'))data={revisionId:'fixture-fork'};
  else data={errorCode:'NOT_FOUND'};
  await route.fulfill({status:data.errorCode?404:200,headers,contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.route('https://studio-preview.test/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><h1>Explicit test fixture</h1><button>Play</button>'}));
 await page.goto(`http://127.0.0.1:${server.address().port}/arcade/?studio=1`);await page.waitForFunction(()=>FG.studio);
 await page.click('#studioNavCreate');await page.fill('#studioPrompt','Create a novel test fixture');await page.click('#studioSend');await page.click('#coachPlanToggle');await page.getByRole('button',{name:'You choose the remaining details',exact:true}).click();await page.click('#buildGamePlan');await page.waitForSelector('#studioRemoteHost iframe');
 assert.equal(await page.locator('#studioRemoteHost iframe').getAttribute('sandbox'),'allow-scripts');
 assert.match(await page.textContent('#studioPlayNote'),/mock/);assert.equal(kept,0);
 assert.equal(await page.evaluate(()=>JSON.stringify(FG.studio.exportNotebook()).includes('TEST_ONLY')),false,'signed preview capabilities must not persist');
 await page.click('#studioKeep');await page.waitForFunction(()=>FG.studio.exportNotebook().sessions.some(s=>s.remoteId==='fixture-rev'&&!s.candidate));assert.equal(kept,1);
 phase='failed';await page.click('#studioChange');await page.fill('#studioPrompt','Try another fixture revision');await page.click('#coachTry');await page.waitForFunction(()=>FG.studio.exportNotebook().sessions.some(s=>s.job?.status==='failed'));
 assert.equal(await page.evaluate(()=>FG.studio.exportNotebook().sessions[0].remoteId),'fixture-rev');assert.equal(remoteRequests.at(-1).gameId,'generated-module');assert.equal(kept,1);assert.deepEqual(errors,[]);
 console.log('PASS remote fixture: durable ACK, progress, isolated preview, explicit keep, failed-change preservation, no capability persistence (NO live AI calls)');await ctx.close();
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
