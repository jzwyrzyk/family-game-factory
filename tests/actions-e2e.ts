import {chromium,type Page} from 'playwright';
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
import {OpenAIResponsesAgent,type AgentApproval} from '../server/agent/openai';
import {FixtureOnlyGate} from '../server/testing/fixture-gate';
import {hopper,painter} from '../server/testing/generated-fixtures';
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
async function main(){
 const approval:AgentApproval={enabled:true,approvalId:'test-fixture-not-live',model:'gpt-5.4-mini',inputUsdPerMillion:.75,outputUsdPerMillion:4.5,maxInputTokens:64000,maxOutputTokens:4000,priceReviewedOn:new Date().toISOString().slice(0,10)};
 const repo=new MemoryRepository(),parent={subject:'test-owner',familyId:'test-family',role:'parent' as const,expiresAt:Date.now()+600000};const service=new JobService(repo,{kind:'metered-api',testFixture:true,available:true,generate:async()=>{throw Error('external only')}},{test:async()=>{throw Error('external only')}},{allowMock:true,maxUnits:120000,timeoutMs:60000,maxRetries:2});await service.setAllowance(parent,5000000,true);
 let run=100,failFirst=true,paused=false;const dispatches:{id:string;attempt:number}[]=[];
 // Keep the mocked workflow observable without logging credentials, source, or unbounded browser output.
 const startedAt=Date.now(),harnessTrace:{jobId:string;attempt:number;phase:string;elapsedMs:number;diagnostics?:string}[]=[];
 function trace(jobId:string,attempt:number,phase:string,diagnostics?:string){harnessTrace.push({jobId,attempt,phase,elapsedMs:Date.now()-startedAt,...(diagnostics?{diagnostics:diagnostics.slice(0,600)}:{})});if(harnessTrace.length>80)harnessTrace.shift();}
 const provider=new OpenAIResponsesAgent(approval,()=> 'fixture-only-not-a-real-key',(async(url,options)=>{assert.equal(url,'https://api.openai.com/v1/responses');const body=JSON.parse(String(options?.body)),request=JSON.parse(body.input);const fixture=request.idea.toLowerCase().includes('paint')?painter:hopper;const game=failFirst?{...fixture,source:'export function createGame(){ invalid syntax ! }'}:fixture;failFirst=false;return new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(game)}]}],usage:{input_tokens:100,output_tokens:600}}));}) as typeof fetch);
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
 const server=createServer((req,res)=>{if(req.url?.startsWith('/v1/')){void api(req,res);return;}if(req.url==='/arcade/factory-config.json'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({version:1,mode:'remote',apiBaseUrl:config.appOrigin,previewOrigin:config.previewOrigin}));return;}const name=new URL(req.url!,'http://local').pathname.replace(/^\/arcade\//,'/'),file=resolve('dist','.'+(name==='/'?'/index.html':name));if(!file.startsWith(resolve('dist')+'/')||!existsSync(file)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'} as Record<string,string>)[extname(file)]||'text/plain');res.end(readFileSync(file));});config.appOrigin='http://127.0.0.1:'+await listen(server,'127.0.0.1');
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
  await context.addCookies([{name:'factory_session',value:signSession(deviceActor,config.sessionKey),url:config.appOrigin,httpOnly:true,sameSite:'Strict'}]);await page.goto(config.appOrigin+'/arcade/');await page.waitForFunction(()=>window.FG?.builder);await page.getByRole('navigation').getByRole('button',{name:'✨ Create',exact:true}).click();await page.fill('#inventIdea','Make a moon hopper with a gate to jump through');
  const buildStartedAt=Date.now();
  const [submitted]=await Promise.all([page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/v1/jobs',{timeout:10000}),page.click('#createTry')]);
  const acknowledgement=await submitted.json();assert.equal(submitted.status(),202,`Initial ${device} submission failed: ${acknowledgement.errorCode||submitted.status()}`);assert.equal(acknowledgement.status,'queued');
  // This is an asynchronous job state, independent of animation frames in the separately launched gate browser.
  await page.waitForFunction(()=>{const status=document.getElementById('builderStatus')?.textContent||'';return status.includes('preview is ready')||/did not work|unavailable|allowance|Build cancelled|No job was queued|Keep names/.test(status);},{},{polling:100,timeout:Math.max(1,60000-(Date.now()-buildStartedAt))});
  assert.match(await page.textContent('#builderStatus')||'',/preview is ready/,`Initial ${device} build ended without a playable preview`);
  const initialJob=(await repo.snapshot()).jobs.find(j=>j.id===acknowledgement.jobId);assert.equal(initialJob?.status,'ready');assert.ok((initialJob?.attempts||0)>=2,'The intentionally invalid first candidate must go through automatic repair');
  assert.match(await page.textContent('#builderMode')||'',/Test builder \(mock\)/);const frame=page.frameLocator('#generatedPreview');await frame.getByRole('button',{name:'Play!',exact:true}).click();for(let i=0;i<5;i++){await frame.getByRole('button',{name:'⭐ Action',exact:true}).click();await page.waitForTimeout(100);if(await frame.locator('#status').getAttribute('data-state')==='won')break;}await frame.locator('#status[data-state=won]').waitFor({timeout:5000}).catch(async e=>{console.error('Fixture play failure',device,await frame.locator('#status').getAttribute('data-state'),await frame.locator('#score').textContent(),await frame.locator('#game').getAttribute('data-inputs'));throw e;});await finishPreviewRound(page);await page.click('#keepBuild');await page.getByText('Kept! Find your playable game in My Creations.',{exact:true}).waitFor();
  await page.fill('#reviseBuildPrompt','Change this into a rainbow paint trail, painting tiles where I tap');await page.click('#reviseBuildForm button[type=submit]');await page.getByRole('button',{name:'Try ready preview',exact:true}).click();await frame.getByRole('heading',{name:'Rainbow Trail',exact:true}).waitFor({timeout:60000});await frame.getByRole('button',{name:'Play!',exact:true}).click();for(let i=0;i<4;i++){await frame.locator('#game').click({position:{x:40+i*40,y:60}});await page.waitForTimeout(100);}await frame.locator('#status[data-state=won]').waitFor({timeout:5000}).catch(async e=>{console.error('Fixture play failure',device,await frame.locator('#status').getAttribute('data-state'),await frame.locator('#score').textContent(),await frame.locator('#game').getAttribute('data-inputs'));throw e;});await finishPreviewRound(page);await page.click('#keepBuild');await page.getByText('Kept! Find your playable game in My Creations.',{exact:true}).waitFor();for(const title of ['Moon Hopper','Rainbow Trail','Moon Hopper']){await page.fill('#reviseBuildPrompt',title==='Moon Hopper'?'Make a moon hopper again':'Make a rainbow paint trail again');await page.click('#reviseBuildForm button[type=submit]');await page.getByRole('button',{name:'Try ready preview',exact:true}).click();await frame.getByRole('heading',{name:title,exact:true}).waitFor({timeout:60000});await frame.getByRole('button',{name:'Play!',exact:true}).click();for(let i=0;i<5;i++){if(title==='Moon Hopper')await frame.getByRole('button',{name:'⭐ Action',exact:true}).click();else await frame.locator('#game').click({position:{x:40+i*35,y:70}});await page.waitForTimeout(100);if(await frame.locator('#status').getAttribute('data-state')==='won')break;}await frame.locator('#status[data-state=won]').waitFor({timeout:5000}).catch(async e=>{console.error('Fixture play failure',device,await frame.locator('#status').getAttribute('data-state'),await frame.locator('#score').textContent(),await frame.locator('#game').getAttribute('data-inputs'));throw e;});await finishPreviewRound(page);await page.click('#keepBuild');await page.getByText('Kept! Find your playable game in My Creations.',{exact:true}).waitFor();}
  await page.click('#undoBuild');await frame.getByRole('heading',{name:'Rainbow Trail',exact:true}).waitFor();await page.fill('#builtGameName','My generated '+device);await page.click('#forkBuildForm button[type=submit]');await page.getByText('Saved as a new builder game. Your original version is unchanged.',{exact:true}).waitFor();
  // Reload while an acknowledged job waits in the durable dispatcher; no prompt or credential is stored in the browser.
  paused=true;await page.fill('#reviseBuildPrompt','Make a rainbow paint trail again');await page.click('#reviseBuildForm button[type=submit]');await page.getByText('Your request is in the builder queue.',{exact:true}).waitFor();await page.reload();await page.waitForFunction(()=>window.FG?.builder);await page.getByRole('navigation').getByRole('button',{name:'✨ Create',exact:true}).click();await page.getByText('Your request is in the builder queue.',{exact:true}).waitFor();await page.click('#cancelBuild');await page.getByText('Build cancelled. Your current game is safe.',{exact:true}).waitFor();paused=false;
  await page.getByRole('navigation').getByRole('button',{name:'🎨 My Creations',exact:true}).click();await page.getByRole('button',{name:'🌟 My generated '+device,exact:true}).click();await frame.getByRole('heading',{name:'Rainbow Trail',exact:true}).waitFor();await frame.getByRole('button',{name:'Play!',exact:true}).click();for(let i=0;i<2;i++){await frame.locator('#game').click({position:{x:70+i*55,y:80}});await page.waitForTimeout(100);}mkdirSync('test-results',{recursive:true});await page.locator('#generatedPreview').screenshot({path:`test-results/assignment-002-${device}.png`});assert.deepEqual(errors,[]);console.log(`PASS Assignment 002 ${device}: website → authenticated gateway → mocked Actions → real adapter transport fixture → source compile/test/repair → private worker preview → five playable revisions/keep/undo/fork/reload/cancel`);
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
