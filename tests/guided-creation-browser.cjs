/* Actual bundled conversation with synthetic coach/build transport. No provider call. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');
const {start}=require('./browser-server.cjs');
const {exploreWelcome,sendChildMessage}=require('./studio-entry.cjs');
const {assertTextContrast}=require('./helpers/text-contrast.cjs');
const idea='A dragon lives above jelly clouds.';
const action='I tap a cloud and the dragon bounces off it to catch a star.';
const purpose='I want it to feel calm and floaty. Each star lights a window in the moon house; when all five shine the dragon goes home.';
const askForLooks='Can you give me three ideas for how my clouds could look?';
const offeredLook='cartoon clouds';
const alternatives=['clouds cut from paper','clouds made of clay',offeredLook];
const finish='If I miss, the dragon floats back to the last cloud and I try again. I want soft blue and pink cartoon clouds. No timer, points or enemies.';
const evidence={action,consequence:'Each star lights a window in the moon house; when all five shine the dragon goes home.',experience:'I want it to feel calm and floaty.',world:'I want soft blue and pink cartoon clouds.',goal:'when all five shine the dragon goes home',visualStyle:'soft blue and pink cartoon clouds',mood:'calm and floaty'};
const emptyEvidence=Object.fromEntries(Object.keys(evidence).map(key=>[key,'']));
const baseReply={move:'clarify',suggestions:[],proposedChange:null,planSuggestions:[],childDecisions:[],evidenceIds:[]};
const replies={
 [idea]:{...baseReply,text:'Your dragon has a world of jelly clouds.',question:'What could your dragon do with those clouds?',childDecisions:[],creationReadiness:{ready:false,evidence:{...emptyEvidence},unresolved:['The player action and its effect are still unclear.']}},
 [action]:{...baseReply,text:'Your tap sends the dragon bouncing toward a star.',question:'How do you want that bouncing to feel?',childDecisions:[{field:'action',quote:action}],creationReadiness:{ready:false,evidence:{...emptyEvidence},unresolved:['What happens when a star is caught, and the intended experience, are still unclear.']}},
 [purpose]:{...baseReply,text:'Each caught star lights up the dragon’s home. You want the bouncing to feel calm and floaty.',question:'What happens if the dragon misses a star?',childDecisions:[{field:'fun',quote:evidence.experience},{field:'goal',quote:evidence.consequence}],creationReadiness:{ready:false,evidence:{...emptyEvidence},unresolved:['The consequence of missing a jump still needs the child’s decision.']}},
 [askForLooks]:{...baseReply,move:'inspire',text:'Here are three ideas from me. Try clouds cut from paper, clouds made of clay, or cartoon clouds. You can mix them or make up your own.',question:null,
  planSuggestions:alternatives.map(value=>({field:'style',value})),creationReadiness:{ready:false,evidence:emptyEvidence,unresolved:['The look of the clouds is still open.']}},
 'Sure.':{...baseReply,text:'You get to choose.',question:'How do you picture your clouds?',creationReadiness:{ready:false,evidence:emptyEvidence,unresolved:['The look of the clouds is still open.']}},
 [finish]:{...baseReply,text:'Tap a jelly cloud to bounce your dragon toward a star. Light all five windows to bring it home. Miss a star and float back to try again. Choose Build my game when you’re ready.',question:null,planSuggestions:[{field:'style',value:offeredLook}],childDecisions:[{field:'setback',quote:'If I miss, the dragon floats back to the last cloud and I try again.'},{field:'style',quote:evidence.world},{field:'score',quote:'No timer, points or enemies.'},{field:'special',quote:'No timer, points or enemies.'}],creationReadiness:{ready:true,evidence,unresolved:[]}}
};
(async()=>{
 const server=start(),browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox']});
 const url='http://127.0.0.1:'+server.address().port+'/arcade/';
 fs.mkdirSync('test-results',{recursive:true});
 try{
  for(const [device,viewport] of [['desktop',{width:1280,height:900}],['phone',{width:390,height:844}]]){
   const context=await browser.newContext({viewport,reducedMotion:'reduce'}),page=await context.newPage(),errors=[],requests=[];
   page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
   const api='https://guided-fixture.test',preview='https://guided-preview.test';
   const headers={'Access-Control-Allow-Origin':new URL(url).origin,'Access-Control-Allow-Credentials':'true','Access-Control-Allow-Headers':'Content-Type, X-Factory-Request','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
   let acknowledge;const acceptance=new Promise(resolve=>{acknowledge=resolve;});let phase='building';
   await page.route('**/factory-config.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({version:1,mode:'remote',apiBaseUrl:api,previewOrigin:preview})}));
   await page.route(api+'/**',async route=>{
    const req=route.request(),path=new URL(req.url()).pathname;let data;
    if(req.method()==='OPTIONS'){await route.fulfill({status:204,headers});return;}
    if(path==='/v1/sessions/status')data={connected:true,trusted:true,expiresAt:Date.now()+60000};
    else if(path==='/v1/builder/status'||path==='/v1/coach/status')data={available:true};
    else if(path==='/v1/coach/audio/status')data={available:false};
    else if(path==='/v1/coach'){
     const input=req.postDataJSON().context;assert.equal(input.creation?.version,2);
     assert.ok(replies[input.message],'the fixture responds only to the child’s authored turns');
     data={mode:'model',reply:replies[input.message]};
    }else if(path==='/v1/jobs'&&req.method()==='POST'){requests.push(req.postDataJSON());await acceptance;data={jobId:'guided-job',status:'queued',adapter:'mock'};}
    else if(path==='/v1/jobs/guided-job')data={jobId:'guided-job',status:phase,adapter:'mock',...(phase==='ready'?{revisionId:'guided-ready'}:{})};
    else throw Error('Unexpected fixture request: '+req.method()+' '+path);
    await route.fulfill({headers,contentType:'application/json',body:JSON.stringify(data)});
   });
   try{
    await page.goto(url);await page.waitForFunction(()=>window.FG?.studio);await exploreWelcome(page);await page.click('#studioNavCreate');
    assert.match(await page.locator('#studioMessages').innerText(),/Hey, I'm jems!/);
    assert.match(await page.locator('#studioMessages').innerText(),/I'll ask a few fun questions/);
    const newSession=(await page.evaluate(()=>FG.studio.exportNotebook())).sessions.at(-1);
    assert.equal(newSession.design.creationStandard,2);
    assert.equal(newSession.messages.length,0,'the static intro is not a saved helper or child turn');
    assert.equal(await page.locator('#studioMoreChoices').evaluate(el=>el.open),false);
    assert.equal(await page.locator('#studioHear').isVisible(),true,'read-aloud is visible without opening More choices');
    assert.equal(await page.locator('#studioHear').isEnabled(),true,'the opening child direction can be read');
    assert.equal(await page.locator('#designPlan').isVisible(),false);
    assert.equal(await page.locator('#studioUseDrawing').isVisible(),false);
    assert.equal(await page.locator('#studioSend').isDisabled(),true,'Build stays disabled before the coach understands the game');
    assert.equal(await page.locator('#coachGuidedChoices, #coachChooseRest, #coachChooseForMe, #buildGamePlan').count(),0,'no suggested-answer or delegation shortcuts exist');
    await sendChildMessage(page,idea);
    assert.equal(await page.locator('.studio-coach-welcome').count(),0,'greeting disappears after the child speaks');
    assert.equal(await page.locator('#studioSend').isDisabled(),true);
    assert.match(await page.locator('#studioMessages').innerText(),/What could your dragon do with those clouds\?/);
    await sendChildMessage(page,action);
    assert.equal(await page.locator('#studioCreationHero').isVisible(),false);
    assert.match(await page.locator('#studioMessages').innerText(),/How do you want that bouncing to feel\?/);
    const helperMessages=page.locator('#studioMessages .studio-message.helper');
    assert.equal(await helperMessages.locator('[data-action=read-aloud]').count(),await helperMessages.count(),'every helper message keeps its own reader across later turns');
    assert.equal(await page.locator('#studioHear').isVisible(),true);
    assert.equal(await page.locator('#studioHear').isEnabled(),true);
    assert.equal(await page.locator('#coachProposals button').count(),0,'the child writes answers instead of choosing model answers');
    assert.equal(await page.locator('#studioMoreChoices').evaluate(el=>el.open),false);
    await page.waitForFunction(async()=>FG.rewards&&(await FG.rewards.summary()).lifetimeGems>0);
    await page.waitForTimeout(220); // Cover the reward host's 180 ms batching window.
    assert.equal(await page.locator('#jemsRewardCelebrations').evaluate(el=>el.childElementCount),0);
    await assertTextContrast(page,'#studioMessages .studio-message p','coach conversation');
    await assertTextContrast(page,'#studioTalk, #studioMic','conversation actions');
    await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.querySelectorAll('#studioConversation img')].map(image=>image.decode().catch(()=>{})));});
    await page.screenshot({path:'test-results/guided-question-'+device+'.png'});
    await sendChildMessage(page,purpose);
    assert.equal(await page.locator('#studioSend').isDisabled(),true,'four quoted aspects still cannot override a material unresolved rule');
    const offered=await sendChildMessage(page,askForLooks);
    assert.deepEqual(offered.design.plan.style,{origin:'helper',accepted:false,delegated:false,value:offeredLook});
    const unsure=await sendChildMessage(page,'Sure.');
    assert.equal(unsure.design.plan.style.accepted,false);
    assert.equal(await page.locator('#studioSend').isDisabled(),true);
    const reviewed=await sendChildMessage(page,finish);
    assert.deepEqual(reviewed.design.plan.style,{origin:'helper',accepted:true,delegated:false,value:evidence.world});
    assert.ok(reviewed.design.ideas.some(idea=>idea.origin==='helper'&&idea.adopted&&idea.text===offeredLook));
    assert.equal(reviewed.design.creationReview.ready,true);
     assert.equal(reviewed.design.creationReview.version,2);
    assert.equal(await page.locator('#studioSend').isEnabled(),true,'the child can build after a grounded contextual review');
    assert.equal(requests.length,0,'even a ready review cannot submit a build');
    await page.fill('#studioPrompt','I have a different ending in mind.');
    assert.equal(await page.locator('#studioSend').isDisabled(),true,'unsent changes must be discussed before building');
    await page.fill('#studioPrompt','');
    assert.equal(await page.locator('#studioSend').isVisible(),true);
    await page.click('#studioSend');
    await page.waitForFunction(()=>document.getElementById('studioBuildHandoff').open);
    assert.equal(await page.locator('#studioBuildHandoff').getAttribute('data-phase'),'sending');
    assert.equal(await page.locator('#studioBuildHandoffPlay').isDisabled(),true);
    await page.waitForTimeout(40);assert.equal(requests.length,1);
    const payload=requests[0].prompt;
    for(const required of [idea,action,evidence.experience,evidence.consequence,evidence.world,'No timer, points or enemies.'])assert.ok(payload.includes(required),required+' survives into the actual job');
    assert.match(payload,/style \(jems suggested "cartoon clouds", child chose\): I want soft blue and pink cartoon clouds/);
    for(const excluded of [...alternatives.slice(0,2),askForLooks,'Sure.', "Hey, I'm jems!"])assert.ok(!payload.includes(excluded),excluded);
    assert.doesNotMatch(await page.locator('#studioMessages').textContent(),/Game choices in order|Current choices \(these replace|Later ideas, in order|Approved game plan/);
    assert.equal(await page.locator('#studioPrompt').inputValue(),'');
    acknowledge();await page.waitForFunction(()=>!document.getElementById('studioBuildHandoffPlay').disabled);
    await page.locator('.studio-handoff-art img').evaluate(image=>image.decode());
    await assertTextContrast(page,'#studioBuildHandoff :is(h2,p,button)','build handoff',{includeDisabled:true});
    await page.screenshot({path:'test-results/guided-build-'+device+'.png'});
    await page.click('#studioBuildHandoffStay');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'studioPrompt');
    await page.fill('#studioPrompt','Keep this new thought while the game builds.');
    const beforeReady=await page.locator('#studioMessages').textContent();phase='ready';
    await page.waitForFunction(()=>FG.studio.exportNotebook().sessions.some(s=>s.job?.status==='ready'&&s.experiments?.some(e=>e.candidate.remoteId==='guided-ready')));
    assert.equal(await page.locator('#studioBuildHandoff').isVisible(),false);
    assert.equal(await page.inputValue('#studioPrompt'),'Keep this new thought while the game builds.');
    assert.equal(await page.locator('#studioMessages').textContent(),beforeReady);
    assert.equal(await page.locator('#studioReady').isVisible(),true);
    assert.equal(requests.length,1);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
    assert.deepEqual(errors,[]);console.log('PASS '+device+': contextual child-owned coaching, grounded readiness, no answer menus, clean handoff and draft-safe background completion');
   }catch(error){await page.screenshot({path:'test-results/guided-creation-failure-'+device+'.png',fullPage:true}).catch(()=>{});throw error;}
   finally{acknowledge();await context.close();}
  }
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
