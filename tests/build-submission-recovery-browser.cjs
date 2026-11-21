/* Real production bundle with synthetic transport; no paid generation. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createHash}=require('node:crypto');
const {chromium}=require('playwright');
const {start}=require('./browser-server.cjs');
const {exploreWelcome,sendChildMessage,navigate}=require('./studio-entry.cjs');
const {assertTextContrast}=require('./helpers/text-contrast.cjs');
const idea='I want a silly moon cat game. I tap to jump between clouds. Catching a donut makes the cat grow. Missing a cloud sends it back to try again.';
const evidence={action:'I tap to jump between clouds.',consequence:'Catching a donut makes the cat grow.',experience:'silly',world:'moon cat game'};
const ready={move:'listen',text:'Your moon cat jumps for donuts and grows when it catches one. You can build your game.',question:null,suggestions:[],proposedChange:null,planSuggestions:[],childDecisions:[],evidenceIds:[],creationReadiness:{ready:true,evidence,unresolved:[]}};
const current=page=>page.evaluate(()=>{const n=FG.studio.exportNotebook();return n.sessions.find(s=>s.id===n.active[FG.store.current().id]);});
(async()=>{
 const server=start();let browser;
 try{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox']});
  const url='http://127.0.0.1:'+server.address().port+'/arcade/';fs.mkdirSync('test-results',{recursive:true});
  for(const [device,viewport] of [['desktop',{width:1280,height:900}],['phone',{width:390,height:844}]]){
   for(const variant of ['accepted','unknown','ready-save-failure']){
    const admittedBeforeLoss=variant!=='unknown';
    const context=await browser.newContext({viewport,reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
    page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));
    const api='https://submission-api.test',preview='https://submission-preview.test';
    const headers={'Access-Control-Allow-Origin':new URL(url).origin,'Access-Control-Allow-Credentials':'true','Access-Control-Allow-Headers':'Content-Type, X-Factory-Request','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
    let accepted=admittedBeforeLoss,posts=0,lookups=0,body;
    const job=variant==='ready-save-failure'?{jobId:'accepted-initial',status:'ready',revisionId:'accepted-revision',adapter:'mock'}:{jobId:'accepted-initial',status:'failed',errorCode:'GAME_RUNTIME_FAILED',adapter:'mock'};
    await page.route('**/factory-config.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({version:1,mode:'remote',apiBaseUrl:api,previewOrigin:preview})}));
    await page.route(api+'/**',async route=>{
     const request=route.request(),target=new URL(request.url()),path=target.pathname,method=request.method();let data;
     if(method==='OPTIONS'){await route.fulfill({status:204,headers});return;}
     if(path==='/v1/sessions/status')data={connected:true,trusted:true,expiresAt:Date.now()+60000};
     else if(path==='/v1/coach/status'||path==='/v1/builder/status')data={available:true};
     else if(path==='/v1/coach/audio/status')data={available:false};
     else if(path==='/v1/coach')data={mode:'model',reply:ready};
     else if(path==='/v1/jobs'&&method==='POST'){
      posts++;body=request.postDataJSON();
      const saved=(await current(page)).pendingSubmission;
      assert.equal(saved.request.clientRequestId,body.clientRequestId,'persisted before the paid POST');
      await route.abort('failed');return;
     }else if(path.startsWith('/v1/job-requests/')){
      lookups++;assert.equal(method,'GET');assert.equal(path.split('/').at(-1),body.clientRequestId);
      const hash=createHash('sha256').update(JSON.stringify(['build',body.clientRequestId,body.gameId,body.baseRevisionId,body.prompt])).digest('hex');
      assert.equal(target.searchParams.get('payloadHash'),hash);
      data={job:accepted?job:null};
     }else if(path==='/v1/jobs/accepted-initial')data=job;
     else throw Error('Unexpected submission recovery request '+method+' '+path);
     await route.fulfill({headers,contentType:'application/json',body:JSON.stringify(data)});
    });
    try{
     await page.goto(url);await page.waitForFunction(()=>FG.studio?.mode()==='remote');await exploreWelcome(page);await navigate(page,'studioNavCreate');
     await sendChildMessage(page,idea);await page.waitForFunction(()=>!document.getElementById('studioSend').disabled);
     await page.click('#studioSend');await page.waitForFunction(()=>document.getElementById('studioBuildHandoff').dataset.phase==='uncertain');
     assert.equal(posts,1);assert.equal(await page.locator('#studioBuildHandoffRecover').innerText(),'Check build status');
     await assertTextContrast(page,'#studioBuildHandoff :is(h2,p,button)','initial request recovery',{includeDisabled:true});
     await page.click('#studioBuildHandoffStay');
     const saved=await current(page),transcript=saved.messages;
     const newerDraft='Save a blue hat for another version.';await page.fill('#studioPrompt',newerDraft);
     await page.waitForFunction(text=>FG.studio.exportNotebook().sessions.some(s=>s.draft===text),newerDraft);
     if(variant==='ready-save-failure')await page.addInitScript(()=>{
      window.blockReadyCandidate=true;window.candidateSaveFailures=0;
      const original=Storage.prototype.setItem;
      Storage.prototype.setItem=function(key,value){
       if(window.blockReadyCandidate&&key.includes('family-game-factory-studio-v1')){
        const data=JSON.parse(value);
        if(data.sessions?.some(s=>s.experiments?.some(e=>e.candidate.remoteId==='accepted-revision'))){window.candidateSaveFailures++;throw new DOMException('Synthetic quota','QuotaExceededError');}
       }
       return original.call(this,key,value);
      };
     });
     await page.reload();await page.waitForFunction(()=>FG.studio?.mode()==='remote');
     await page.locator(`[data-session="${saved.id}"] .studio-saved-open`).click();
     if(variant==='ready-save-failure'){
      await page.waitForFunction(()=>window.candidateSaveFailures>0);
      let partial=await current(page);assert.equal(partial.job.status,'ready');assert.ok(partial.pendingSubmission);assert.equal(partial.experiments.length,0);
      assert.equal(await page.locator('#studioRetry').isDisabled(),false,'failed candidate save leaves read-only recovery usable');
      assert.equal(await page.locator('#studioBuildProgress').getAttribute('data-phase'),'uncertain','an unsaved candidate is not advertised as playable');
      await page.reload();await page.waitForFunction(()=>FG.studio?.mode()==='remote');
      await page.locator(`[data-session="${saved.id}"] .studio-saved-open`).click();
      await page.waitForFunction(()=>window.candidateSaveFailures>0);
      partial=await current(page);assert.ok(partial.pendingSubmission,'reload keeps identity until the actual result is saved');
      await page.evaluate(()=>{window.blockReadyCandidate=false;});await page.click('#studioRetry');
     }else if(!accepted){
      await page.waitForFunction(()=>document.getElementById('studioRetry').textContent.includes('Check build status'));
      assert.equal(await page.locator('#studioSend').isDisabled(),true,'unknown admission blocks another paid build after reload');
      await page.click('#studioRetry');await page.waitForFunction(()=>document.getElementById('studioBuildHandoff').dataset.phase==='uncertain');
      assert.equal(posts,1);assert.ok((await current(page)).pendingSubmission,'missing record retains uncertainty');
      accepted=true;await page.click('#studioBuildHandoffRecover');
     }
     await page.waitForFunction(()=>FG.studio.exportNotebook().sessions.some(s=>s.job?.id==='accepted-initial'&&!s.pendingSubmission));
     assert.equal(posts,1);assert.ok(lookups>=1);
     assert.deepEqual((await current(page)).messages,transcript);assert.equal(await page.inputValue('#studioPrompt'),newerDraft);
     if(variant==='ready-save-failure'){assert.equal((await current(page)).experiments.filter(e=>e.candidate.remoteId==='accepted-revision').length,1);assert.equal(await page.locator('#studioRetry').isVisible(),false);}else assert.equal(await page.locator('#studioRetry').innerText(),'Try build again','only a confirmed failure offers a paid retry');
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
     assert.deepEqual(errors,[]);
     await page.screenshot({path:`test-results/initial-submission-${device}-${variant}.png`});
     console.log(`PASS ${device}: ${variant} request survives reload, preserves draft and reconciles without a second POST`);
    }finally{await context.close();}
   }
  }
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
