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
  // This suite checks studio/history isolation. A recent question satisfies the
  // ordinary pacing budget; math remains mandatory and is tested separately.
  const original=await page.evaluate(()=>{FG.store.changeProfile({rate:1});FG.store.current().mathWindow=[Date.now()];FG.store.save();FG.store.current().skills['mul:8x7']={tries:4,right:2,hints:1,streak:1,last:'2026-11-14T00:00:00Z'};FG.store.save();return JSON.stringify(FG.store.current().skills);});
  const notebook=()=>page.evaluate(()=>FG.studio.exportNotebook());
  const workspace=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('family-game-factory-workspace-v2')));
  const talk=async()=>{if(device==='mobile')await page.click('[data-studio-tab="talk"]');};
  assert.equal(await page.locator('#studioStarters [data-starter]').count(),3);
  await page.screenshot({path:`test-results/studio-library-${device}.png`,fullPage:true});
  await page.click('[data-starter="gum"]');await page.waitForSelector('.construction-stage');
  await page.getByRole('button',{name:'Add Bottle',exact:true}).click();assert.equal(await page.locator('[data-part="body"]').count(),1);
  const base=(await workspace()).projects[0].headId;
  await talk();await page.fill('#studioPrompt','Give me 15 gum sticks');await page.click('#studioSend');
  assert.equal((await workspace()).projects[0].headId,base,'Try must not change working pointer');
  assert.match(await page.textContent('.builder-message'),/15 \/ 15/);assert.equal(await page.locator('[data-part="body"]').count(),1);
  await page.click('#studioUndo');assert.match(await page.textContent('.builder-message'),/10 \/ 10/);
  await page.click('#studioRedo');assert.match(await page.textContent('.builder-message'),/15 \/ 15/);
  await page.click('#studioKeep');assert.notEqual((await workspace()).projects[0].headId,base);
  for(const prompt of ['Make joints stronger','Give me six gum sticks','Make joints stronger','Give me ten gum sticks']){
   await talk();await page.fill('#studioPrompt',prompt);await page.click('#studioSend');assert.equal(await page.locator('#studioPreviewNotice').isVisible(),true);assert.equal(await page.locator('[data-part="body"]').count(),1);await page.click('#studioKeep');
  }
  assert.equal((await workspace()).revisions.length,6,'five kept edits plus starting version');
  // Complete a real construction to observe the ordinary host's outcome and optional reflection.
  for(const [name,key,count] of [['Cone','ArrowUp',10],['Fan','ArrowDown',10],['Spoon','ArrowLeft',10],['Paddle','ArrowRight',10]]){
   await page.getByRole('button',{name:'Add '+name,exact:true}).click();for(let i=0;i<count;i++)await page.keyboard.press(key);
  }
  for(const id of ['nose','engine','left','right']){await page.click('[data-part="body"]');await page.getByRole('button',{name:'Chew gum & connect',exact:true}).click();await page.click(`[data-part="${id}"]`);}
  await page.getByRole('button',{name:'Test construction',exact:true}).click();
  await page.waitForFunction(()=>FG.studio.exportNotebook().sessions.some(s=>s.reflection));
  await talk();assert.match(await page.textContent('#studioMessages'),/fun or tricky/);
  await page.click('#studioReflectAnswer');await page.fill('#studioPrompt','I liked seeing my rocket stay together.');await page.click('#studioSend');
  assert.match(await page.textContent('#studioMessages'),/I liked seeing/);
  await page.click('#studioCopy');await page.fill('#studioCopyName',`Space workshop ${device}`);await page.click('#studioCopyForm button[type="submit"]');
  assert.equal(await page.locator('[data-part="body"]').count(),1);
  await talk();await page.fill('#studioPrompt','An unfinished idea for next time');await page.click('#studioHome');await page.reload();await page.waitForFunction(()=>FG.studio);
  await page.locator('#studioLibrary button').filter({hasText:`Space workshop ${device}`}).click();await talk();
  assert.equal(await page.inputValue('#studioPrompt'),'An unfinished idea for next time');assert.match(await page.textContent('#studioMessages'),/Give me 15 gum sticks/);
  await page.click('#studioCompare');assert.ok(await page.locator('.studio-version-card').count()>=1);
  await page.click('#studioCloseVersions');await page.screenshot({path:`test-results/studio-workspace-${device}.png`,fullPage:true});
  const after=await page.evaluate(()=>JSON.stringify(FG.store.current().skills));assert.equal(after,original);
  // Profile isolation must not lose an immediately typed draft.
  await talk();await page.fill('#studioPrompt','My private unfinished idea');await page.locator('.profile-choice').nth(1).click();assert.equal(await page.locator('#studioLibrary [data-session]').count(),0);
  await page.locator('.profile-choice').first().click();await page.locator('#studioLibrary button').filter({hasText:`Space workshop ${device}`}).click();await talk();assert.equal(await page.inputValue('#studioPrompt'),'My private unfinished idea');
  await page.click('#studioNavCreate');await page.fill('#studioPrompt','Build a brand new flying banana universe');await page.click('#studioSend');assert.match(await page.textContent('#studioMessages'),/no build was started/);assert.equal(await page.locator('#studioKeep').isDisabled(),true);assert.deepEqual(jobs,[]);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);assert.deepEqual(errors,[]);
  const n=await notebook();assert.ok(n.sessions.some(s=>s.game==='new'&&!s.projectId&&!s.remoteId));
  console.log(`PASS ${device}: production studio, five staged changes, real construction, optional reflection, undo/redo/fork, private draft/reload and honest offline AI`);await ctx.close();
 }
 // Transport fixtures exercise in-tool remote states. They are NOT real model inference.
 const ctx=await browser.newContext(),page=await ctx.newPage();let polls=0,phase='ready',kept=0;const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/factory-config.json',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({version:1,mode:'remote',apiBaseUrl:'https://studio-api.test',previewOrigin:'https://studio-preview.test'})}));
 await page.route('https://studio-api.test/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;let data;
  const headers={'Access-Control-Allow-Origin':`http://127.0.0.1:${server.address().port}`,'Access-Control-Allow-Credentials':'true','Access-Control-Allow-Headers':'Content-Type, X-Factory-Request','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
  if(req.method()==='OPTIONS'){await route.fulfill({status:204,headers});return;}
  if(path==='/v1/jobs'&&req.method()==='POST'){polls=0;data={jobId:'fixture-job',status:'queued',adapter:'mock'};}
  else if(path==='/v1/jobs/fixture-job'){polls++;data=polls<2?{jobId:'fixture-job',status:'testing',adapter:'mock'}:phase==='failed'?{jobId:'fixture-job',status:'failed',adapter:'mock'}:{jobId:'fixture-job',status:'ready',revisionId:'fixture-rev',adapter:'mock'};}
  else if(path.endsWith('/preview'))data={url:'https://studio-preview.test/game?capability=TEST_ONLY',artifactId:'fixture-artifact',expiresAt:Date.now()+60000,kind:'generated-module-v1',adapter:'mock'};
  else if(path.endsWith('/keep')){kept++;data={ok:true};}
  else if(path.endsWith('/fork'))data={revisionId:'fixture-fork'};
  else data={errorCode:'NOT_FOUND'};
  await route.fulfill({status:data.errorCode?404:200,headers,contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.route('https://studio-preview.test/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><h1>Explicit test fixture</h1><button>Play</button>'}));
 await page.goto(`http://127.0.0.1:${server.address().port}/arcade/?studio=1`);await page.waitForFunction(()=>FG.studio);
 await page.click('#studioNavCreate');await page.fill('#studioPrompt','Create a novel test fixture');await page.click('#studioSend');await page.waitForSelector('#studioRemoteHost iframe');
 assert.equal(await page.locator('#studioRemoteHost iframe').getAttribute('sandbox'),'allow-scripts');
 assert.match(await page.textContent('#studioPlayNote'),/mock/);assert.equal(kept,0);
 assert.equal(await page.evaluate(()=>JSON.stringify(FG.studio.exportNotebook()).includes('TEST_ONLY')),false,'signed preview capabilities must not persist');
 await page.click('#studioKeep');await page.waitForFunction(()=>FG.studio.exportNotebook().sessions.some(s=>s.remoteId==='fixture-rev'&&!s.candidate));assert.equal(kept,1);
 phase='failed';await page.fill('#studioPrompt','Try another fixture revision');await page.click('#studioSend');await page.waitForFunction(()=>FG.studio.exportNotebook().sessions.some(s=>s.job?.status==='failed'));
 assert.equal(await page.evaluate(()=>FG.studio.exportNotebook().sessions[0].remoteId),'fixture-rev');assert.equal(kept,1);assert.deepEqual(errors,[]);
 console.log('PASS remote fixture: durable ACK, progress, isolated preview, explicit keep, failed-change preservation, no capability persistence (NO live AI calls)');await ctx.close();
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
