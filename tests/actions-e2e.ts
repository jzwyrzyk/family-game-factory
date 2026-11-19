import {chromium,type FrameLocator,type Page} from 'playwright';
import {createServer,type Server} from 'node:http';
import {randomBytes} from 'node:crypto';
import {existsSync,readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {MemoryRepository} from '../server/pipeline/repository';
import {JobService} from '../server/pipeline/service';
import {ActionCoordinator} from '../server/actions/coordinator';
import {apiHandler,previewHandler} from '../server/pipeline/http';
import {signSession} from '../server/pipeline/auth';
import {verifyBrowserSession} from '../server/trusted-devices';
import {OpenAIResponsesAgent,type AgentApproval} from '../server/agent/openai';
import {FixtureOnlyGate} from '../server/testing/fixture-gate';
import {hopper,painter} from '../server/testing/generated-fixtures';
import {v2FirstGame,v2RevisedGame} from '../server/testing/v2-journey-fixtures';
import type {MathItem} from '../src/learning/types';
import {verifyV1InputOrdering} from './generated-v1-input-browser';
const listen=(s:Server,host?:string)=>new Promise<number>(r=>s.listen(0,host,()=>r((s.address() as {port:number}).port)));
async function finishPreviewRound(page:Page){
 // A worker win arrives before the host finishes its required learning activity.
 // Wait for that message to be handled; later rounds can legitimately use the pacing budget.
 await page.waitForFunction(()=>window.FG.learning.active||/^You (finished|tried) this round\./.test(document.getElementById('previewOutcome')?.textContent||''));
 if(await page.evaluate(()=>window.FG.learning.active)){
  const item:MathItem|null=await page.evaluate(()=>window.FG.learning.activeItem);
  assert.ok(item,'an active learning activity must expose its actual item');
  assert.notEqual(item.answer,undefined);assert.notEqual(item.answer,null);
  const answer=String(item.answer);assert.ok(answer.trim(),'the item must have a nonblank answer');
  const activity=page.locator('.learning-preview-cover .math-activity');
  if(item.answerKind==='choice'){
   const choice=item.choices?.find(option=>option.value===answer);assert.ok(choice,'the correct choice must belong to this item');
   await activity.getByRole('button',{name:choice.label,exact:true}).click();
  }else{
   const write=activity.getByRole('button',{name:'Write an answer',exact:true});if(await write.isVisible())await write.click();
   // Preserve fractional and text answers verbatim; zero is a valid number answer.
   await activity.locator('.math-answer-input').fill(answer);
   await activity.getByRole('button',{name:'Check answer',exact:true}).click();
  }
  await page.waitForFunction(()=>!window.FG.learning.active);
 }
 await page.locator('#previewOutcome').filter({hasText:/^You (finished|tried) this round\./}).waitFor();
}
async function playAuthoredPreview(page:Page,frame:FrameLocator,title:'Moon Hopper'|'Rainbow Trail',device:string){
 await frame.getByRole('button',{name:'Play!',exact:true}).click();
 try{
  if(title==='Moon Hopper'){
   // The unchanged authored fixture samples held Action input. Keep one ordinary
   // gesture down until its real win; another click could race the math cover.
   const action=frame.getByRole('button',{name:'⭐ Action',exact:true});await action.hover();
   const bounds=await action.boundingBox();assert.ok(bounds,'the authored Action control must be visible');
   await page.mouse.down();
   try{await frame.locator('#status[data-state=won]').waitFor({timeout:5000});}
   finally{
    // Release outside the button so no click pulse is queued after the win.
    try{await page.mouse.move(bounds.x+bounds.width+2,bounds.y+bounds.height/2);}
    finally{await page.mouse.up();}
   }
  }else{
   // A returned score acknowledges each actual canvas tap before the next one.
   // Four acknowledged taps finish this fixture; never send a fifth behind math.
   for(let i=0;i<4;i++){
    await frame.locator('#game').click({position:{x:40+i*40,y:60}});
    await frame.locator('#score').filter({hasText:new RegExp('^Score: '+(i+1)+'$')}).waitFor({timeout:5000});
   }
   await frame.locator('#status[data-state=won]').waitFor({timeout:5000});
  }
 }catch(error){
  console.error('Fixture play failure',device,title,await frame.locator('#status').getAttribute('data-state'),await frame.locator('#score').textContent(),await frame.locator('#game').getAttribute('data-inputs'));throw error;
 }
 await finishPreviewRound(page);
 // V1's host pause leaves the authored terminal state intact beneath the cover.
 assert.equal(await frame.locator('#status').getAttribute('data-state'),'won','real host math must finish without replacing the authored win');
 assert.match(await page.locator('#previewOutcome').textContent()||'',/^You finished this round\./);
}

/** O7: validate real rendered v2 movement, not just an altered source or title. */
async function marbleCenter(frame:FrameLocator):Promise<number>{
 const x=await frame.locator('#game').evaluate((canvas:HTMLCanvasElement)=>{
  const pixels=canvas.getContext('2d')!.getImageData(0,0,canvas.width,canvas.height);
  let total=0,count=0;
  for(let y=183;y<216;y+=3)for(let x=9;x<710;x+=3){
   const i=(y*pixels.width+x)*4,d=pixels.data;
   if(d[i]>200&&d[i+1]>130&&d[i+1]<205&&d[i+2]<105&&d[i]>d[i+1]+28){
    total+=x;count++;
   }
  }
  return count?total/count:null;
 });
 assert.ok(typeof x==='number'&&Number.isFinite(x),'marble must actually be visible on canvas');
 return x;
}
async function playV2Marble(page:Page,frame:FrameLocator,device:string):Promise<number>{
 await frame.getByRole('button',{name:'Play!',exact:true}).click();
 await frame.locator('#game[data-frames]').waitFor({timeout:4500});
 const before=await marbleCenter(frame);
 await frame.locator('[data-control="right"]').focus();
 await page.keyboard.down('ArrowRight');await page.waitForTimeout(670);
 await page.keyboard.up('ArrowRight');await page.waitForTimeout(60);
 const after=await marbleCenter(frame);
 assert.ok(after-before>45,'Right must visibly move the game object');
 // Canvas CSS pixels shrink on narrow screens; logical 720x400 positions
 // cannot be passed directly to Playwright's CSS-pixel tap coordinates.
 // The child taps the actual visible center, on both desktop and mobile.
 const playfield=frame.locator('#game'),bounds=await playfield.boundingBox();
 assert.ok(bounds&&bounds.width>100&&bounds.height>60,'rendered mobile canvas must be visible');
 const center={x:bounds.width/2,y:bounds.height/2};
 if(device==='mobile')await playfield.tap({position:center});
 else await playfield.click({position:center});
 await frame.locator('#status[data-state=won]').waitFor({timeout:6500});
 await finishPreviewRound(page);
 assert.equal(await frame.locator('#status').getAttribute('data-state'),'won');
 return after-before;
}

async function main(){
 const approval:AgentApproval={enabled:true,approvalId:'test-fixture-not-live',model:'gpt-5.4-mini',inputUsdPerMillion:.75,outputUsdPerMillion:4.5,maxInputTokens:64000,maxOutputTokens:4000,priceReviewedOn:new Date().toISOString().slice(0,10)};
 const repo=new MemoryRepository(),parent={subject:'test-owner',familyId:'test-family',role:'parent' as const,expiresAt:Date.now()+600000};const service=new JobService(repo,{kind:'metered-api',testFixture:true,available:true,generate:async()=>{throw Error('external only')}},{test:async()=>{throw Error('external only')}},{allowMock:true,maxUnits:120000,timeoutMs:60000,maxRetries:2});await service.setAllowance(parent,5000000,true);
 let run=100,failFirst=true,paused=false;const dispatches:{id:string;attempt:number}[]=[];
 // Keep the mocked workflow observable without logging credentials, source, or unbounded browser output.
 const startedAt=Date.now(),harnessTrace:{jobId:string;attempt:number;phase:string;elapsedMs:number;diagnostics?:string}[]=[];
 function trace(jobId:string,attempt:number,phase:string,diagnostics?:string){harnessTrace.push({jobId,attempt,phase,elapsedMs:Date.now()-startedAt,...(diagnostics?{diagnostics:diagnostics.slice(0,600)}:{})});if(harnessTrace.length>80)harnessTrace.shift();}
 const provider=new OpenAIResponsesAgent(approval,()=> 'fixture-only-not-a-real-key',(async(url,options)=>{assert.equal(url,'https://api.openai.com/v1/responses');const body=JSON.parse(String(options?.body)),request=JSON.parse(body.input);
  // O4 must reach the EXISTING fixture-backed Actions/preview/browser journey.
  // These are proposed requirements, never claimed as verified gameplay.
  assert.equal(body.store,false);
  assert.equal(request.gameDesignPreflight.status,'PROPOSED_NOT_CHILD_CONFIRMED');
  assert.equal(request.gameDesignPreflight.intentVersion,'jems-child-intent-v1');
  assert.equal(request.gameDesignPreflight.form.version,'jems-game-form-v2');
  assert.equal(request.gameDesignPreflight.workability.status,'NOT_TESTED');
  assert.ok(request.gameDesignPreflight.workability.mandatoryChecks.some((check:string)=>check.includes('visible')));
  assert.ok(request.gameDesignPreflight.sourceEvidence.every((f:any)=>request.idea.slice(f.start,f.end)===f.quote));
  const v2=request.idea.toLowerCase().includes('marble');
  const fixture=v2?(request.idea.toLowerCase().includes('faster')?v2RevisedGame:v2FirstGame):request.idea.toLowerCase().includes('paint')?painter:hopper;
  const game=(failFirst||request.idea.toLowerCase().includes('break this marble game'))?
    {...fixture,source:'export function createGame(){ invalid syntax ! }'}:fixture;
  failFirst=false;return new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(game)}]}],usage:{input_tokens:100,output_tokens:600}}));}) as typeof fetch);
 const coordinator=new ActionCoordinator(repo,{dispatch:async(id,attempt)=>{dispatches.push({id,attempt});trace(id,attempt,paused?'dispatch-paused':'dispatch');if(paused)return;const identity={runId:String(++run),repositoryId:'42',sha:'a'.repeat(40),stage:'generate' as const};setImmediate(()=>{void(async()=>{
  trace(id,attempt,'claim-generate');const task:any=await coordinator.claim(id,attempt,'generate',identity),input={...task.input,signal:new AbortController().signal};
  trace(id,attempt,'provider');const result=attempt?await provider.repair(input,task.previous,task.diagnostics):await provider.generate(input);
  trace(id,attempt,'report-generate');await coordinator.report(id,attempt,'generate',identity,result);const tester={...identity,stage:'test' as const};
  trace(id,attempt,'claim-test');const candidate:any=await coordinator.claim(id,attempt,'test',tester);trace(id,attempt,'fixture-gate');
  try{const game=await new FixtureOnlyGate().test(candidate.game);trace(id,attempt,'test-passed');await coordinator.report(id,attempt,'test',tester,{ok:true,game});}
  catch(error){const diagnostics=(error as Error).message;trace(id,attempt,'test-failed',diagnostics);console.error('Actions fixture requested repair:',JSON.stringify({jobId:id,attempt,diagnostics:diagnostics.slice(0,600)}));await coordinator.report(id,attempt,'test',tester,{ok:false,diagnostics});}
  trace(id,attempt,'reported');await coordinator.tick();
 })().catch(e=>{trace(id,attempt,'harness-error',(e as Error).message);console.error('Mocked Actions harness failed:',JSON.stringify({jobId:id,attempt,error:(e as Error).message.slice(0,600)}));});});}},approval);
 const config={sessionKey:randomBytes(32).toString('hex'),previewKey:randomBytes(32).toString('hex'),appOrigin:'',previewOrigin:'',dispatch:async(id:string)=>{await coordinator.enqueue(id);await coordinator.tick();}};
 const preview=createServer(previewHandler(service,config));config.previewOrigin='http://localhost:'+await listen(preview);const api=apiHandler(service,config);
 const server=createServer((req,res)=>{
  // Verify the real signed test session before admitting any paid mock action.
  if(req.url==='/v1/sessions/status'&&req.method==='GET'){
   void verifyBrowserSession(repo,req.headers.cookie,config.sessionKey).then(session=>{
    res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
    res.end(JSON.stringify({connected:true,trusted:!!session.deviceId,expiresAt:session.expiresAt}));
   }).catch(()=>{res.writeHead(401,{'Content-Type':'application/json','Cache-Control':'no-store'});
    res.end(JSON.stringify({errorCode:'UNAUTHENTICATED'}));});
   return;
  }
  if(req.url?.startsWith('/v1/')){void api(req,res);return;}if(req.url==='/arcade/factory-config.json'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({version:1,mode:'remote',apiBaseUrl:config.appOrigin,previewOrigin:config.previewOrigin}));return;}const name=new URL(req.url!,'http://local').pathname.replace(/^\/arcade\//,'/'),file=resolve('dist','.'+(name==='/'?'/index.html':name));if(!file.startsWith(resolve('dist')+'/')||!existsSync(file)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'} as Record<string,string>)[extname(file)]||'text/plain');res.end(readFileSync(file));});config.appOrigin='http://127.0.0.1:'+await listen(server,'127.0.0.1');
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(!process.env.CI&&existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']});
 try{
 await verifyV1InputOrdering(browser);
 for(const [device,viewport]of [['desktop',{width:1280,height:900}],['mobile',{width:375,height:812}]] as const){
  const deviceActor={...parent,familyId:'test-family-'+device,expiresAt:Date.now()+600000};await service.setAllowance(deviceActor,5000000,true);failFirst=true;
  const context=await browser.newContext({viewport,hasTouch:device==='mobile'}),page=await context.newPage(),errors:string[]=[];
  const apiEvents:{method:string;path:string;status?:number;error?:string}[]=[];
  const recordApi=(event:typeof apiEvents[number])=>{apiEvents.push(event);if(apiEvents.length>20)apiEvents.shift();};
  page.on('pageerror',e=>{if(errors.length<10)errors.push(e.message.slice(0,600));});page.on('crash',()=>errors.push('PAGE_CRASHED'));
  page.on('response',r=>{const path=new URL(r.url()).pathname;if(path.startsWith('/v1/')&&(r.request().method()==='POST'||r.status()>=400))recordApi({method:r.request().method(),path,status:r.status()});});
  page.on('requestfailed',r=>{const path=new URL(r.url()).pathname;if(path.startsWith('/v1/'))recordApi({method:r.method(),path,error:r.failure()?.errorText.slice(0,200)});});
  try{
  await context.addCookies([{name:'factory_session',value:signSession(deviceActor,config.sessionKey),url:config.appOrigin,httpOnly:true,sameSite:'Strict'}]);await page.goto(config.appOrigin+'/arcade/?arcade=1');await page.waitForFunction(()=>window.FG?.builder);await page.getByRole('navigation').getByRole('button',{name:'✨ Create',exact:true}).click();await page.fill('#inventIdea','Make a moon hopper with a gate to jump through');
  const buildStartedAt=Date.now();
  const [submitted]=await Promise.all([page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/v1/jobs',{timeout:10000}),page.click('#createTry')]);
  const acknowledgement=await submitted.json();assert.equal(submitted.status(),202,`Initial ${device} submission failed: ${acknowledgement.errorCode||submitted.status()}`);assert.equal(acknowledgement.status,'queued');
  // This is an asynchronous job state, independent of animation frames in the separately launched gate browser.
  await page.waitForFunction(()=>{const status=document.getElementById('builderStatus')?.textContent||'';return status.includes('preview is ready')||/did not work|unavailable|allowance|Build cancelled|No job was queued|Keep names/.test(status);},{},{polling:100,timeout:Math.max(1,60000-(Date.now()-buildStartedAt))});
  assert.match(await page.textContent('#builderStatus')||'',/preview is ready/,`Initial ${device} build ended without a playable preview`);
  const initialJob=(await repo.snapshot()).jobs.find(j=>j.id===acknowledgement.jobId);assert.equal(initialJob?.status,'ready');assert.ok((initialJob?.attempts||0)>=2,'The intentionally invalid first candidate must go through automatic repair');
  assert.match(await page.textContent('#builderMode')||'',/Test builder \(mock\)/);const frame=page.frameLocator('#generatedPreview');
  await playAuthoredPreview(page,frame,'Moon Hopper',device);
  await page.click('#keepBuild');await page.getByText('Kept! Find your playable game in My Creations.',{exact:true}).waitFor();
  await page.fill('#reviseBuildPrompt','Change this into a rainbow paint trail, painting tiles where I tap');await page.click('#reviseBuildForm button[type=submit]');
  await page.getByRole('button',{name:'Try ready preview',exact:true}).click();await frame.getByRole('heading',{name:'Rainbow Trail',exact:true}).waitFor({timeout:60000});
  await playAuthoredPreview(page,frame,'Rainbow Trail',device);
  await page.click('#keepBuild');await page.getByText('Kept! Find your playable game in My Creations.',{exact:true}).waitFor();
  for(const title of ['Moon Hopper','Rainbow Trail','Moon Hopper'] as const){
   await page.fill('#reviseBuildPrompt',title==='Moon Hopper'?'Make a moon hopper again':'Make a rainbow paint trail again');await page.click('#reviseBuildForm button[type=submit]');
   await page.getByRole('button',{name:'Try ready preview',exact:true}).click();await frame.getByRole('heading',{name:title,exact:true}).waitFor({timeout:60000});
   await playAuthoredPreview(page,frame,title,device);
   await page.click('#keepBuild');await page.getByText('Kept! Find your playable game in My Creations.',{exact:true}).waitFor();
  }
  await page.click('#undoBuild');await frame.getByRole('heading',{name:'Rainbow Trail',exact:true}).waitFor();await page.fill('#builtGameName','My generated '+device);await page.click('#forkBuildForm button[type=submit]');await page.getByText('Saved as a new builder game. Your original version is unchanged.',{exact:true}).waitFor();
  // Reload while an acknowledged job waits in the durable dispatcher; no prompt or credential is stored in the browser.
  paused=true;await page.fill('#reviseBuildPrompt','Make a rainbow paint trail again');await page.click('#reviseBuildForm button[type=submit]');await page.getByText('Your request is in the builder queue.',{exact:true}).waitFor();await page.reload();await page.waitForFunction(()=>window.FG?.builder);await page.getByRole('navigation').getByRole('button',{name:'✨ Create',exact:true}).click();await page.getByText('Your request is in the builder queue.',{exact:true}).waitFor();await page.click('#cancelBuild');await page.getByText('Build cancelled. Your current game is safe.',{exact:true}).waitFor();paused=false;
  await page.getByRole('navigation').getByRole('button',{name:'🎨 My Creations',exact:true}).click();await page.getByRole('button',{name:'🌟 My generated '+device,exact:true}).click();await frame.getByRole('heading',{name:'Rainbow Trail',exact:true}).waitFor();await frame.getByRole('button',{name:'Play!',exact:true}).click();for(let i=0;i<2;i++){await frame.locator('#game').click({position:{x:70+i*55,y:80}});await page.waitForTimeout(100);}mkdirSync('test-results',{recursive:true});await page.locator('#generatedPreview').screenshot({path:`test-results/assignment-002-${device}.png`});
  // O7: modern generated-module-v2 Create→Play→Edit→Compare→Keep→Return.
  // Existing old v1 fixtures above remain required; this is a separate,
  // exact-source-allowlisted journey through the same authenticated Actions
  // and private preview/learning host, NOT a real paid model generation.
  failFirst=false;
  await page.getByRole('navigation').getByRole('button',{name:'✨ Create',exact:true}).click();
  await page.fill('#inventIdea','Make a marble game where I press Right to move the marble and tap to win.');
  const [marbleResponse]=await Promise.all([
   page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/v1/jobs'),
   page.click('#createTry')
  ]);
  assert.equal(marbleResponse.status(),202);
  const marbleAck=await marbleResponse.json();
  await page.getByRole('button',{name:'Try ready preview',exact:true}).waitFor({timeout:90000});
  await page.getByRole('button',{name:'Try ready preview',exact:true}).click();
  await frame.getByRole('heading',{name:'Marble Playground',exact:true}).waitFor({timeout:15000});
  const firstDistance=await playV2Marble(page,frame,device);
  const firstJob=(await repo.snapshot()).jobs.find(j=>j.id===marbleAck.jobId);
  assert.equal(firstJob?.status,'ready');
  assert.equal(firstJob?.attempts,1);
  const firstId=firstJob?.revisionId;
  assert.ok(firstId);
  await page.click('#keepBuild');
  await page.getByText('Kept! Find your playable game in My Creations.',{exact:true}).waitFor();

  await page.fill('#reviseBuildPrompt','Make the marble move faster when I press Right and tap to win.');
  const [fasterResponse]=await Promise.all([
   page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/v1/jobs'),
   page.click('#reviseBuildForm button[type=submit]')
  ]);
  assert.equal(fasterResponse.status(),202);
  const fasterAck=await fasterResponse.json();
  await page.getByRole('button',{name:'Try ready preview',exact:true}).waitFor({timeout:90000});
  await page.getByRole('button',{name:'Try ready preview',exact:true}).click();
  await frame.getByRole('heading',{name:'Faster Marble Playground',exact:true}).waitFor({timeout:15000});
  const fasterDistance=await playV2Marble(page,frame,device);
  assert.ok(fasterDistance>firstDistance+25,
   'the revised game must really move faster, not merely rename itself');
  const fasterJob=(await repo.snapshot()).jobs.find(j=>j.id===fasterAck.jobId);
  assert.equal(fasterJob?.status,'ready');
  const fasterId=fasterJob?.revisionId;
  assert.ok(fasterId);
  const fasterVersion=await service.revision(deviceActor,fasterId);
  assert.equal(fasterVersion.parentId,firstId);
  assert.equal((await service.list(deviceActor)).some(r=>r.id===fasterId),false,
   'ready must not silently replace the main game before Keep');
  assert.equal((await service.list(deviceActor)).some(r=>r.id===firstId),true);
  await page.click('#compareBuild');
  await page.locator('#buildComparison').filter({
   hasText:/Before: Marble Playground\. Now: Faster Marble Playground/
  }).waitFor();
  await page.click('#keepBuild');
  await page.getByText('Kept! Find your playable game in My Creations.',{exact:true}).waitFor();
  assert.equal((await service.list(deviceActor)).some(r=>r.id===fasterId),true);

  // A deliberately invalid edit exhausts the *existing* bounded retry loop.
  // Neither false Ready nor an invisible model edit may replace the kept game.
  const learningBeforeFailure=await page.evaluate(()=>JSON.stringify(window.FG.store.current().skills));
  await page.fill('#reviseBuildPrompt','Break this marble game so it does not work.');
  const [invalidResponse]=await Promise.all([
   page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/v1/jobs'),
   page.click('#reviseBuildForm button[type=submit]')
  ]);
  assert.equal(invalidResponse.status(),202);
  const invalidAck=await invalidResponse.json();
  await page.waitForFunction(()=>/did not work/.test(document.getElementById('builderStatus')?.textContent||''),
   null,{timeout:90000});
  const brokenJob=(await repo.snapshot()).jobs.find(j=>j.id===invalidAck.jobId);
  assert.equal(brokenJob?.status,'failed');
  assert.equal(brokenJob?.attempts,3,'bad game must have at most two automatic repairs');
  assert.equal(brokenJob?.revisionId,undefined);
  assert.equal((await service.list(deviceActor)).some(r=>r.id===fasterId),true);
  assert.equal(await page.evaluate(()=>JSON.stringify(window.FG.store.current().skills)),learningBeforeFailure,
   'failed build must not alter learning performance');

  await page.reload();await page.waitForFunction(()=>window.FG?.builder);
  await page.getByRole('navigation').getByRole('button',{name:'🎨 My Creations',exact:true}).click();
  await page.getByRole('button',{name:'🌟 Faster Marble Playground',exact:true}).click();
  await frame.getByRole('heading',{name:'Faster Marble Playground',exact:true}).waitFor({timeout:15000});
  const returnedDistance=await playV2Marble(page,frame,device);
  assert.ok(returnedDistance>45,'saved v2 game must remain playable after reload');
  assert.equal((await service.list(deviceActor)).some(r=>r.id===fasterId),true);
  console.log('PASS O7 '+device+
   ': v2 Create→real play+learning→Keep→faster observed edit→Compare→Keep→bad edit recovery→reload→play');
  assert.deepEqual(errors,[]);console.log(`PASS Assignment 002 ${device}: website → authenticated gateway → mocked Actions → real adapter transport fixture → source compile/test/repair → private worker preview → five playable revisions/keep/undo/fork/reload/cancel`);
  }catch(error){
   const state=await repo.snapshot(),now=Date.now();
   const diagnostic={device,elapsedMs:now-startedAt,paused,sessionRemainingMs:deviceActor.expiresAt-now,builderStatus:await page.locator('#builderStatus').textContent({timeout:1000}).catch(()=>'<unavailable>'),builderMode:await page.locator('#builderMode').textContent({timeout:1000}).catch(()=>'<unavailable>'),errors,apiEvents,ledger:state.ledgers[deviceActor.familyId],jobs:state.jobs.filter(j=>j.familyId===deviceActor.familyId).slice(-8).map(j=>({id:j.id,status:j.status,phase:j.phase,errorCode:j.errorCode,attempts:j.attempts,usedUnits:j.usedUnits,execution:j.execution&&{attempt:j.execution.attempt,stage:j.execution.stage,dispatchPending:j.execution.dispatchPending,runId:j.execution.runId,queuedMsAgo:j.execution.queuedAt&&now-j.execution.queuedAt,claimedMsAgo:j.execution.claimAt&&now-j.execution.claimAt,diagnostics:j.execution.diagnostics?.slice(0,600)}})),trace:harnessTrace.slice(-32)};
   console.error('Actions E2E failure diagnostics:',JSON.stringify(diagnostic));mkdirSync('test-results',{recursive:true});writeFileSync(`test-results/assignment-002-${device}-failure.json`,JSON.stringify(diagnostic,null,2));await page.screenshot({path:`test-results/assignment-002-${device}-failure.png`,fullPage:true,timeout:5000}).catch(()=>{});throw error;
  }finally{paused=false;await context.close();}
 }
 assert.ok(dispatches.every(d=>Object.keys(d).sort().join(',')==='attempt,id'));const state=await repo.snapshot();assert.ok(state.audit.some(e=>e.code==='AUTOMATIC_REPAIR'));assert.ok(state.revisions.some(r=>r.game?.kind==='generated-module-v1'));
 }finally{await browser.close();await new Promise<void>(r=>server.close(()=>r()));await new Promise<void>(r=>preview.close(()=>r()));}
}
void main().catch(e=>{console.error(e);process.exitCode=1});
