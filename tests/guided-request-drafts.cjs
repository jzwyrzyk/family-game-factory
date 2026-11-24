/* Real bundled controls with synthetic authenticated coach/builder transport.
 * These fixtures establish request/draft ownership, not live-provider quality.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');
const {start}=require('./browser-server.cjs');
const {exploreWelcome,openRetainedGame}=require('./studio-entry.cjs');

const session=page=>page.evaluate(()=>{
 const notebook=FG.studio.exportNotebook();
 return notebook.sessions.find(item=>item.id===notebook.active[FG.store.current().id]);
});
const proposal=(title,request,depth='tune')=>({
 move:'propose',text:'Here is an idea you can try.',question:null,suggestions:[],
 proposedChange:{title,request,depth},planSuggestions:[],childDecisions:[],evidenceIds:[]
});
const reflection={move:'listen',text:'Let’s make your idea.',question:null,suggestions:[],proposedChange:null,planSuggestions:[],childDecisions:[],evidenceIds:[]};

async function fixture(browser,url,replyFor){
 const context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});
 const page=await context.newPage(),errors=[],unexpected=[],requests=[],coachRequests=[];
 page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(error.message));
 const api='https://guided-draft-fixture.test',preview='https://guided-draft-preview.test';
 const headers={'Access-Control-Allow-Origin':new URL(url).origin,'Access-Control-Allow-Credentials':'true','Access-Control-Allow-Headers':'Content-Type, X-Factory-Request','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
 let acknowledge;const acceptance=new Promise(resolve=>{acknowledge=resolve;});
 await page.route('**/factory-config.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({version:1,mode:'remote',apiBaseUrl:api,previewOrigin:preview})}));
 await page.route(api+'/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname;let body;
  if(request.method()==='OPTIONS'){await route.fulfill({status:204,headers});return;}
  if(path==='/v1/sessions/status')body={connected:true,trusted:true,expiresAt:Date.now()+60000};
  else if(path==='/v1/builder/status'||path==='/v1/coach/status')body={available:true};
  else if(path==='/v1/coach/audio/status')body={available:false};
  // Opening the retained games through My Creations also reads its private list.
  else if(path==='/v1/creations'&&request.method()==='GET')body=[];
  else if(path==='/v1/coach'&&request.method()==='POST'){
   const coachContext=request.postDataJSON().context;coachRequests.push(coachContext);
   body={mode:'model',reply:await replyFor(coachContext.message,coachContext)};
  }
  else if(path==='/v1/revisions'&&request.method()==='POST')body={revisionId:'draft-base'};
  else if(path==='/v1/jobs'&&request.method()==='POST'){
   requests.push(request.postDataJSON());await acceptance;
   body={jobId:'draft-job',status:'queued',adapter:'mock'};
  }else if(path==='/v1/jobs/draft-job')body={jobId:'draft-job',status:'building',adapter:'mock'};
  else{unexpected.push(request.method()+' '+path);body={errorCode:'FIXTURE_ROUTE_NOT_DEFINED'};}
  await route.fulfill({status:body.errorCode?404:200,headers,contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto(url);await page.waitForFunction(()=>window.FG?.studio&&FG.studio.mode()==='remote');await exploreWelcome(page);
 return {context,page,errors,unexpected,requests,coachRequests,acknowledge,async close(){acknowledge();await context.close();}};
}

async function askForProposal(page,message,title){
 await page.fill('#studioPrompt',message);await page.click('#studioTalk');
 await page.getByRole('button',{name:'Try this idea: '+title,exact:true}).waitFor({state:'visible'});
 await page.waitForFunction(()=>!document.getElementById('coachModeStatus').classList.contains('is-thinking'));
}

async function localProposal(browser,url){
 const f=await fixture(browser,url,message=>message.includes('fewer')?proposal('Fewer buckets','Give me two buckets'):proposal('More buckets','Give me four buckets'));
 const {page}=f;
 try{
  await openRetainedGame(page,'buckets');await page.waitForSelector('#game-mount canvas#game');
  const initial=await page.evaluate(()=>FG.runtime.snapshot().config.bucketCount);
  await page.click('#studioChange');await askForProposal(page,'Help me think about bucket choices.','More buckets');
  const draft='After this, make the buckets blue.';
  await page.fill('#studioPrompt',draft);
  await page.getByRole('button',{name:'Try this idea: More buckets',exact:true}).click();
  await page.waitForSelector('#game-mount canvas#game');
  let current=await session(page);
  assert.equal(current.candidate.prompt,'Give me four buckets');
  assert.ok(current.candidate.config.bucketCount>initial,'the chosen proposal actually changes the native game');
  assert.equal(await page.evaluate(()=>FG.runtime.snapshot().state.bucketCount),4);
  assert.equal(current.draft,draft,'a native proposal cannot consume the separate unfinished thought');
  assert.equal(await page.inputValue('#studioPrompt'),draft);
  assert.equal(current.experiments.at(-1).origin,'helper');
  assert.equal(current.experiments.at(-1).depth,'tune');
  // A later request must use its own proposed words, not the preserved draft or
  // the first proposal. The child deliberately replaces the draft with a chat turn.
  await page.click('#studioChange');await askForProposal(page,'Suggest fewer buckets.','Fewer buckets');
  const later='Remember a purple trail for another version.';
  await page.fill('#studioPrompt',later);
  await page.getByRole('button',{name:'Try this idea: Fewer buckets',exact:true}).click();
  await page.waitForSelector('#game-mount canvas#game');current=await session(page);
  assert.equal(current.candidate.prompt,'Give me two buckets');
  assert.ok(current.candidate.config.bucketCount<initial);
  assert.equal(await page.evaluate(()=>FG.runtime.snapshot().state.bucketCount),2);
  assert.equal(current.experiments.length,2,'each explicit supported request makes its own test');
  assert.equal(current.draft,later);assert.equal(await page.inputValue('#studioPrompt'),later);
  assert.deepEqual(f.requests,[],'supported native proposals never start a remote build');
  assert.deepEqual(f.unexpected,[]);assert.deepEqual(f.errors,[]);
  console.log('PASS guided native proposals: real repeated changes, helper provenance, separate unfinished drafts preserved');
 }catch(error){await page.screenshot({path:'test-results/guided-request-native-failure.png',fullPage:true}).catch(()=>{});throw error;}
 finally{await f.close();}
}

async function remoteProposal(browser,url){
 const request='Replace the buckets with a flying doughnut spaceship';
 const f=await fixture(browser,url,()=>proposal('Flying doughnut',request,'redesign'));
 const {page}=f;
 try{
  await openRetainedGame(page,'buckets');await page.waitForSelector('#game-mount canvas#game');
  await page.click('#studioChange');await askForProposal(page,'Suggest a new way to play.','Flying doughnut');
  const draft='Save a rainbow trail for my next version.';
  await page.fill('#studioPrompt',draft);
  const submission=page.waitForRequest(r=>r.url().endsWith('/v1/jobs')&&r.method()==='POST');
  await page.getByRole('button',{name:'Try this idea: Flying doughnut',exact:true}).click();
  await submission;
  await page.locator('#studioBuildHandoff[open]').waitFor();
  assert.equal(f.requests.length,1);assert.equal(f.requests[0].prompt,request);
  assert.equal((await session(page)).draft,draft,'submission leaves an unrelated draft intact');
  await page.click('#studioBuildHandoffStay');
  f.acknowledge();
  await page.waitForFunction(()=>FG.studio.exportNotebook().sessions.some(s=>s.job?.id==='draft-job'));
  const current=await session(page);
  assert.equal(current.draft,draft,'durable ACK only consumes text belonging to the chosen request');
  assert.equal(await page.inputValue('#studioPrompt'),draft);
  assert.equal(current.pendingExperiment.prompt,request);
  assert.equal(current.pendingExperiment.origin,'helper');
  assert.equal(current.pendingExperiment.depth,'redesign');
  assert.deepEqual(f.unexpected,[]);assert.deepEqual(f.errors,[]);
  console.log('PASS guided remote proposal: exact request/provenance, distinct draft preserved through durable ACK');
 }catch(error){await page.screenshot({path:'test-results/guided-request-remote-failure.png',fullPage:true}).catch(()=>{});throw error;}
 finally{await f.close();}
}

async function firstCreationConversation(browser,url){
 const idea='I want a purple cat game on the moon.';
 const answer='I tap to jump between stones, and touching a donut makes the cat grow. It should feel silly and springy. I want a cute pixel-art look. I win when I reach the big moon donut.';
 const evidence={action:'I tap to jump between stones',consequence:'touching a donut makes the cat grow',experience:'silly and springy',world:'a purple cat game on the moon',goal:'I win when I reach the big moon donut.',visualStyle:'cute pixel-art look',mood:'silly and springy'};
 const f=await fixture(browser,url,message=>message===idea?{
  ...proposal('Helper-made cat','Make a silly moon cat collect stars','redesign'),
  text:'Let’s work out what your cat does.',question:'What happens when you help your cat move?',
  suggestions:['Make it silly'],planSuggestions:[{field:'fun',value:'Funny surprises'}],
  creationReadiness:{ready:false,evidence:{action:'',consequence:'',experience:'',world:'',goal:'',visualStyle:'',mood:''},unresolved:['The player action and its consequence need your own detail.']}
 }:{
  ...reflection,text:'Your cat grows when it reaches a donut, and the jumping feels springy.',
  childDecisions:[{field:'action',quote:evidence.action},{field:'goal',quote:evidence.consequence},{field:'fun',quote:evidence.experience}],
  creationReadiness:{ready:true,evidence,unresolved:[]}
 });
 const {page}=f;
 try{
  await page.click('#studioNavCreate');
  assert.equal(await page.locator('#studioSend').isDisabled(),true,'new creation does not begin with an enabled Build');
  await page.fill('#studioPrompt',idea);await page.click('#studioTalk');
  await page.waitForFunction(()=>!document.getElementById('coachModeStatus').classList.contains('is-thinking'));
  assert.match(await page.locator('#studioMessages').textContent(),/What happens when you help your cat move/);
  assert.equal(await page.locator('#studioSend').isDisabled(),true,'a partial idea cannot be submitted');
  assert.equal(await page.locator('#coachGuidedChoices button, #coachChooseRest, #coachChooseForMe').count(),0,'no supplied-answer or delegation buttons are created');
  assert.equal(await page.getByRole('button',{name:'Try this idea: Helper-made cat',exact:true}).count(),0,'a model proposal cannot become a first-build shortcut');
  assert.equal(await page.locator('#coachProposals button').count(),0,'even an older model response cannot introduce creative answer chips');
  assert.equal(f.requests.length,0);
  await page.fill('#studioPrompt',answer);await page.click('#studioTalk');
  await page.waitForFunction(()=>document.getElementById('studioSend').disabled===false);
  assert.equal((await session(page)).design.creationReview.ready,true);
  assert.equal(f.coachRequests.length,2,'two explicit child messages drive the existing conversation service');
  assert.ok(f.coachRequests.every(context=>context.creation?.version===2));
  assert.equal(f.requests.length,0,'readiness never automatically submits a game');
  // New unsent thoughts are not silently folded into a previously reviewed game.
  const draft='Keep this thought for a different version.';
  await page.fill('#studioPrompt',draft);
  await page.waitForFunction(()=>document.getElementById('studioSend').disabled);
  assert.equal(f.requests.length,0);
  await page.fill('#studioPrompt','');await page.waitForFunction(()=>document.getElementById('studioSend').disabled===false);
  const submission=page.waitForRequest(request=>request.url().endsWith('/v1/jobs')&&request.method()==='POST');
  await page.click('#studioSend');await submission;await page.locator('#studioBuildHandoff[open]').waitFor();
  assert.equal(f.requests.length,1);
  for(const text of [idea,...Object.values(evidence)])assert.ok(f.requests[0].prompt.includes(text),text+' survives the reviewed build request');
  assert.ok(!f.requests[0].prompt.includes('Make a silly moon cat collect stars'),'the unchosen model proposal is not built');
  assert.ok(!f.requests[0].prompt.includes('Funny surprises'),'an unchosen helper plan field is not child intent');
  assert.doesNotMatch(await page.locator('#studioMessages').textContent(),/Game choices in order|Current choices \(these replace|Choose sensible details for:|Later ideas, in order/,'the full build envelope stays outside child chat');
  await page.click('#studioBuildHandoffStay');
  await page.fill('#studioPrompt',draft);f.acknowledge();
  await page.waitForFunction(()=>FG.studio.exportNotebook().sessions.some(s=>s.job?.id==='draft-job'));
  assert.equal((await session(page)).draft,draft,'durable acceptance preserves the newer unfinished thought');
  assert.equal(await page.inputValue('#studioPrompt'),draft);
  const ownId=(await session(page)).id;
  await page.click('#studioNavHome');
  const chooseProfile=async index=>{
   if(!await page.locator('#studioProfileMenu').evaluate(node=>node.open))await page.locator('#studioProfileMenu > summary').click();
   await page.locator('.profile-choice').nth(index).click();
   await page.waitForFunction(value=>FG.store.current().id==='player'+(value+1),index);
  };
  await chooseProfile(1);await exploreWelcome(page);
  assert.equal(await page.locator('#studioMessages').textContent(),'','a sibling never retains the earlier child’s transcript in hidden DOM');
  assert.equal(await page.inputValue('#studioPrompt'),'');
  await chooseProfile(0);
  await page.locator(`#studioLibrary [data-session="${ownId}"] .studio-saved-open`).click();
  await page.locator('#page-studio').waitFor({state:'visible'});
  assert.ok((await page.locator('#studioMessages').textContent()).includes(idea),'returning to the unchanged saved session repaints its conversation');
  assert.equal(await page.inputValue('#studioPrompt'),draft);
  assert.equal(await page.locator('#studioBuildHandoff').isVisible(),false,'resuming an acknowledged job never reopens an old handoff');
  assert.deepEqual(f.unexpected,[]);assert.deepEqual(f.errors,[]);
  console.log('PASS first creation conversation: own answers establish readiness, helper shortcuts blocked, explicit Build, draft and transcript restored after sibling visit');
 }catch(error){await page.screenshot({path:'test-results/guided-request-first-build-failure.png',fullPage:true}).catch(()=>{});throw error;}
 finally{await f.close();}
}

async function sentCorrections(browser,url){
 const idea='A purple cat lives on the moon. I tap to jump over stones. Each donut makes the cat bigger. It should feel silly and springy. I want a bright cartoon look. I win by reaching the moon castle.';
 const correction='Actually make it calm instead. The clouds are trampolines.';
 const evidence={action:'I tap to jump over stones',consequence:'Each donut makes the cat bigger',experience:'silly and springy',world:'A purple cat lives on the moon',goal:'I win by reaching the moon castle.',visualStyle:'bright cartoon look',mood:'silly and springy'};
 let finishAssessment;const assessment=new Promise(resolve=>{finishAssessment=resolve;});
 const f=await fixture(browser,url,async message=>{
  if(message===correction){await assessment;return {
   ...reflection,text:'The same moon cat now moves calmly, and the clouds bounce it back up.',
   childDecisions:[{field:'fun',quote:'Actually make it calm instead.'},{field:'special',quote:'The clouds are trampolines.'}],
   creationReadiness:{ready:true,evidence:{...evidence,experience:'Actually make it calm instead.',mood:'Actually make it calm instead.'},unresolved:[]}
  };}
  return {...reflection,childDecisions:[{field:'action',quote:evidence.action},{field:'fun',quote:evidence.experience}],creationReadiness:{ready:true,evidence,unresolved:[]}};
 });
 const {page}=f;
 try{
  await page.click('#studioNavCreate');
  await page.fill('#studioPrompt',idea);await page.click('#studioTalk');
  await page.waitForFunction(()=>document.getElementById('studioSend').disabled===false);
  assert.equal(f.requests.length,0);
  const originalReview=(await session(page)).design.creationReview.fingerprint;
  await page.fill('#studioPrompt',correction);await page.waitForFunction(()=>document.getElementById('studioSend').disabled);
  await page.click('#studioTalk');
  await page.waitForFunction(()=>document.getElementById('coachModeStatus').classList.contains('is-thinking'));
  assert.equal(await page.locator('#studioSend').isDisabled(),true,'an earlier verdict cannot authorize an unreviewed correction');
  assert.equal(f.requests.length,0,'sending a correction never builds');
  assert.equal(await page.locator('#studioBuildHandoff').isVisible(),false,'coaching is not presented as game generation');
  finishAssessment();await page.waitForFunction(()=>document.getElementById('studioSend').disabled===false);
  const current=await session(page);
  assert.notEqual(current.design.creationReview.fingerprint,originalReview,'the new assessment is bound to the revised child intent');
  assert.equal(current.design.plan.fun.value,'Actually make it calm instead.');
  assert.equal(current.design.plan.fun.origin,'child');
  assert.equal(f.requests.length,0,'even the refreshed ready verdict waits for the child’s explicit Build');
  const submission=page.waitForRequest(request=>request.url().endsWith('/v1/jobs')&&request.method()==='POST');
  await page.click('#studioSend');await submission;await page.locator('#studioBuildHandoff[open]').waitFor();
  assert.equal(f.requests.length,1);
  for(const required of [evidence.world,evidence.action,evidence.consequence,'Actually make it calm instead.','The clouds are trampolines.'])assert.ok(f.requests[0].prompt.includes(required),required+' reaches the actual build request');
  assert.ok(f.requests[0].prompt.lastIndexOf('Actually make it calm instead.')>f.requests[0].prompt.indexOf('silly and springy'),'the explicit newer choice follows and supersedes the original feeling');
  assert.equal((await session(page)).pendingExperiment.prompt,f.requests[0].prompt,'recovery retains the same reviewed request');
  assert.doesNotMatch(await page.locator('#studioMessages').textContent(),/Game choices in order|Current choices \(these replace|Choose sensible details for:|Later ideas, in order/);
  assert.deepEqual(f.unexpected,[]);assert.deepEqual(f.errors,[]);
  console.log('PASS sent correction: old readiness blocked, new contextual assessment required, child revision and later mechanic reach explicit Build');
 }catch(error){await page.screenshot({path:'test-results/guided-request-correction-failure.png',fullPage:true}).catch(()=>{});throw error;}
 finally{finishAssessment();await f.close();}
}

(async()=>{
 const server=start(),browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox']});
 fs.mkdirSync('test-results',{recursive:true});
 const url=`http://127.0.0.1:${server.address().port}/arcade/`;
 try{await localProposal(browser,url);await remoteProposal(browser,url);await firstCreationConversation(browser,url);await sentCorrections(browser,url);}
 finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
