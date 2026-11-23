import assert from 'node:assert/strict';
import {test,type TestContext} from 'node:test';
import {ActionCoordinator} from '../server/actions/coordinator';
import {WorkerGateway,coordinateWorkerStage} from '../server/actions/worker-transport';
import type {WorkerStage} from '../server/actions/identity';
import type {AgentApproval} from '../server/agent/openai';
import {MemoryRepository} from '../server/pipeline/repository';
import {JobService} from '../server/pipeline/service';
import {stickerLaunchFixture} from '../server/testing/working-game-fixtures';
import {syntheticQualityEvidence,syntheticQualityReview,syntheticReviewAnswer} from '../server/testing/presentation-quality-fixtures';
import {bindQualityReview} from '../server/quality/game-quality';
import {productionFixture,compiledPipelineFixture} from './quality-pipeline-fixtures';

const minute=60_000;
const approval:AgentApproval={enabled:true,approvalId:'synthetic-worker-lifecycle',model:'synthetic-model',inputUsdPerMillion:1,outputUsdPerMillion:1,maxInputTokens:64000,maxOutputTokens:4000,priceReviewedOn:new Date().toISOString().slice(0,10)};
const identity=(stage:WorkerStage,runId='100')=>({stage,runId,repositoryId:'42',sha:'a'.repeat(40)});

async function fixture(t:TestContext){
 let now=Date.now();t.mock.method(Date,'now',()=>now);
 const repo=new MemoryRepository(),actor={subject:'owner',familyId:'lifecycle',role:'parent' as const,expiresAt:now+24*60*minute};
 const service=new JobService(repo,{kind:'metered-api',available:true,generate:async()=>{throw Error('NO_PROVIDER_IN_SYNTHETIC_TEST');}},{test:async()=>{}},{allowMock:false,maxUnits:120000,timeoutMs:600000,maxRetries:2});
 await service.setAllowance(actor,1000000,true);
 const prompt='Drag stickers onto a rocket and launch it.',game=productionFixture(stickerLaunchFixture,prompt);
 const {jobId:id}=await service.submit(actor,{gameId:'new',baseRevisionId:null,prompt,clientRequestId:'lifecycle'});
 const coordinator=new ActionCoordinator(repo,{dispatch:async()=>{}},approval);
 await coordinator.enqueue(id);await coordinator.tick();
 const generated={candidate:{format:'generated-source-v1',game},usageUnits:1000};
 const compiled=compiledPipelineFixture(game),evidence=syntheticQualityEvidence(compiled);
 return {repo,coordinator,id,actor,service,generated,compiled,evidence,
  advance:(ms:number)=>{now+=ms;},setTime:(value:number)=>{now=value;},now:()=>now,
  job:async()=>(await repo.snapshot()).jobs[0]};
}

test('slow valid generation and provisioning have separate bounds; test and review share their setup budgets',async t=>{
 const h=await fixture(t);await h.coordinator.claim(h.id,0,'generate',identity('generate'));
 h.advance(9*minute);await h.coordinator.report(h.id,0,'generate',identity('generate'),h.generated);
 h.advance(7*minute);await h.coordinator.tick();assert.equal((await h.job()).status,'testing','the original 9m + 7m reproduction must remain active');
 h.advance(11*minute);await h.coordinator.claim(h.id,0,'test',identity('test'));
 h.advance(11*minute);await h.coordinator.report(h.id,0,'test',identity('test'),{ok:true,game:h.compiled,qualityEvidence:h.evidence});
 h.advance(2*minute);const claim=await h.coordinator.claim(h.id,0,'review',identity('review'));
 assert.equal(claim.input?.budget.timeoutMs,10*minute,'review setup consumes its existing 12m window');
 h.advance(9*minute);await h.coordinator.report(h.id,0,'review',identity('review'),{review:syntheticQualityReview(h.compiled,h.evidence),usageUnits:7});
 const state=await h.repo.snapshot();assert.equal(state.jobs[0].status,'ready');assert.equal(state.ledgers.lifecycle.used,1007);assert.equal(state.revisions.length,1);
});

test('status and duplicate reports do not renew provisioning; a late claim cannot revive it',async t=>{
 const h=await fixture(t);await h.coordinator.claim(h.id,0,'generate',identity('generate'));
 await h.coordinator.report(h.id,0,'generate',identity('generate'),h.generated);
 const deadline=(await h.job()).execution!.lease!.expiresAt;
 h.advance(20*minute);
 await h.coordinator.report(h.id,0,'generate',identity('generate'),h.generated);
 for(let i=0;i<5;i++)await h.coordinator.status(h.id,identity('generate'));
 assert.equal((await h.job()).execution!.lease!.expiresAt,deadline);
 h.setTime(deadline);await assert.rejects(h.coordinator.claim(h.id,0,'test',identity('test')),/WORKER_LEASE_EXPIRED/);
 assert.deepEqual(await h.coordinator.status(h.id,identity('generate')),{status:'failed',phase:'failed'});
 await h.coordinator.tick();await h.coordinator.tick();
 const state=await h.repo.snapshot();assert.equal(state.jobs[0].errorCode,'WORKER_LEASE_EXPIRED');assert.equal(state.ledgers.lifecycle.used,120000);assert.equal(state.ledgers.lifecycle.reserved,0);
});

test('late generation is terminalized before a candidate is accepted',async t=>{
 const h=await fixture(t);await h.coordinator.claim(h.id,0,'generate',identity('generate'));
 h.advance(12*minute);await h.coordinator.report(h.id,0,'generate',identity('generate'),h.generated);
 assert.equal((await h.job()).errorCode,'WORKER_LEASE_EXPIRED');assert.equal((await h.job()).execution?.candidate,undefined);
});

test('test claim near the provisioning limit cannot add another 12 minutes',async t=>{
 const h=await fixture(t);await h.coordinator.claim(h.id,0,'generate',identity('generate'));
 await h.coordinator.report(h.id,0,'generate',identity('generate'),h.generated);
 const deadline=(await h.job()).execution!.lease!.expiresAt;h.advance(29*minute);
 await h.coordinator.claim(h.id,0,'test',identity('test'));
 assert.equal((await h.job()).execution!.lease!.expiresAt,deadline);
 h.advance(minute);await h.coordinator.tick();assert.equal((await h.job()).errorCode,'WORKER_LEASE_EXPIRED');
});

test('repair preserves the absolute workflow ceiling and does not renew approval',async t=>{
 const h=await fixture(t),deadline=(await h.job()).execution!.deadlineAt!;
 assert.ok(deadline-h.now()<=207*minute);
 await h.coordinator.claim(h.id,0,'generate',identity('generate'));
 await h.coordinator.report(h.id,0,'generate',identity('generate'),h.generated);
 await h.coordinator.claim(h.id,0,'test',identity('test'));
 await h.coordinator.report(h.id,0,'test',identity('test'),{ok:false,diagnostics:'Compile failed'});
 assert.equal((await h.job()).execution?.deadlineAt,deadline);
 await h.service.setAllowance(h.actor,1000000,false);
 await assert.rejects(h.coordinator.claim(h.id,1,'generate',identity('generate','101')),/OWNER_APPROVAL_REQUIRED/);
 await h.service.setAllowance(h.actor,1000000,true);
 await h.repo.transaction(s=>{s.jobs[0].execution!.lease!.expiresAt=deadline+minute;return true;});
 h.setTime(deadline);await assert.rejects(h.coordinator.claim(h.id,1,'generate',identity('generate','101')),/WORKER_LEASE_EXPIRED/);
 await h.coordinator.tick();assert.equal((await h.job()).errorCode,'WORKER_LEASE_EXPIRED');
});

test('legacy rows derive a fixed handoff from stored times, never from the latest poll',async t=>{
 const h=await fixture(t);await h.coordinator.claim(h.id,0,'generate',identity('generate'));
 h.advance(9*minute);await h.coordinator.report(h.id,0,'generate',identity('generate'),h.generated);
 await h.repo.transaction(s=>{delete s.jobs[0].execution!.lease;delete s.jobs[0].execution!.deadlineAt;return true;});
 h.advance(7*minute);await h.coordinator.tick();const deadline=(await h.job()).execution!.lease!.expiresAt;
 assert.equal((await h.job()).status,'testing');
 h.advance(20*minute);await h.coordinator.status(h.id,identity('generate'));assert.equal((await h.job()).execution!.lease!.expiresAt,deadline);
 h.setTime(deadline);await h.coordinator.tick();assert.equal((await h.job()).errorCode,'WORKER_LEASE_EXPIRED');
});

function loseFirstAcknowledgment(h:Awaited<ReturnType<typeof fixture>>,stage:WorkerStage){
 const bodies:string[]=[];let claims=0;
 const client=new WorkerGateway({gateway:'https://gateway.example',jobId:h.id,attempt:0,stage,retryDelayMs:0,
  oidcEndpoint:'https://fixture.actions.githubusercontent.com/token',oidcCredential:'synthetic-credential'},(async(url,init)=>{
  const path=new URL(String(url)).pathname;
  if(path==='/token')return new Response(JSON.stringify({value:'synthetic.payload.signature'}));
  if(path.endsWith('/claim')){claims++;return new Response(JSON.stringify(await h.coordinator.claim(h.id,0,stage,identity(stage))));}
  if(path.endsWith('/status'))return new Response(JSON.stringify(await h.coordinator.status(h.id,identity(stage))));
  bodies.push(String(init!.body));const {report}=JSON.parse(String(init!.body));
  const receipt=await h.coordinator.report(h.id,0,stage,identity(stage),report);
  if(bodies.length===1)throw TypeError('synthetic acknowledgement lost after durable acceptance');
  return new Response(JSON.stringify(receipt));
 }) as typeof fetch);
 return {client,bodies,claims:()=>claims};
}

test('a lost generation acknowledgment reconciles one durable fingerprint without generating or charging again',async t=>{
 const h=await fixture(t),transport=loseFirstAcknowledgment(h,'generate');let executions=0;
 assert.deepEqual(await coordinateWorkerStage(transport.client,async()=>{executions++;return h.generated;}),{accepted:true,reviewRequired:false});
 const job=await h.job();assert.equal(executions,1);assert.equal(transport.claims(),1);assert.equal(transport.bodies.length,2);assert.equal(new Set(transport.bodies).size,1);
 assert.equal(job.usedUnits,1000);assert.equal(job.status,'testing');assert.equal(job.execution?.reportReceipts?.length,1);
 assert.match(job.execution!.reportReceipts![0].fingerprint,/^[a-f0-9]{64}$/);
});

test('a lost rejected-test acknowledgment survives repair identity changes without scheduling another repair',async t=>{
 const h=await fixture(t);await h.coordinator.claim(h.id,0,'generate',identity('generate'));await h.coordinator.report(h.id,0,'generate',identity('generate'),h.generated);
 const transport=loseFirstAcknowledgment(h,'test'),report={ok:false,diagnostics:'Compile failed'};
 assert.deepEqual(await coordinateWorkerStage(transport.client,async()=>report),{accepted:true,reviewRequired:false});
 const state=await h.repo.snapshot();assert.equal(state.jobs[0].execution?.attempt,1);assert.equal(state.jobs[0].execution?.runId,undefined);assert.equal(state.jobs[0].execution?.reportReceipts?.length,2);
 assert.equal(state.audit.filter(a=>a.code==='AUTOMATIC_REPAIR').length,1);assert.equal(transport.bodies.length,2);
 await h.coordinator.claim(h.id,1,'generate',identity('generate','101'));
 await h.coordinator.report(h.id,0,'test',identity('test'),report);
 assert.equal((await h.job()).execution?.runId,'101','old receipts cannot change current run ownership');
 await assert.rejects(h.coordinator.report(h.id,0,'test',identity('test'),{ok:true}),/WORKER_REPORT_CONFLICT/);
 for(const wrong of [{...identity('test'),sha:'b'.repeat(40)},{...identity('test'),repositoryId:'other'},identity('review')]){
  await assert.rejects(h.coordinator.report(h.id,0,'test',wrong,report),/WORKER_REPORT_REJECTED/);
 }
});

for(const verdict of ['pass','fail'] as const)test(`a lost ${verdict} review acknowledgment cannot duplicate usage, publication or repair`,async t=>{
 const h=await fixture(t);await h.coordinator.claim(h.id,0,'generate',identity('generate'));await h.coordinator.report(h.id,0,'generate',identity('generate'),h.generated);
 await h.coordinator.claim(h.id,0,'test',identity('test'));await h.coordinator.report(h.id,0,'test',identity('test'),{ok:true,game:h.compiled,qualityEvidence:h.evidence});
 const answer=syntheticReviewAnswer();
 const review=verdict==='pass'?syntheticQualityReview(h.compiled,h.evidence):bindQualityReview(h.compiled,h.evidence,{...answer,axes:{...answer.axes,visual:'fail'},findings:['VISUAL_STYLE_MISMATCH']});
 const transport=loseFirstAcknowledgment(h,'review');let executions=0;
 await coordinateWorkerStage(transport.client,async()=>{executions++;return {review,usageUnits:7};});
 const state=await h.repo.snapshot();assert.equal(executions,1);assert.equal(transport.bodies.length,2);assert.equal(state.jobs[0].usedUnits,1007);assert.equal(state.jobs[0].execution?.reportReceipts?.length,3);
 assert.equal(state.revisions.length,verdict==='pass'?1:0);assert.equal(state.audit.filter(a=>a.code==='AUTOMATIC_REPAIR').length,verdict==='pass'?0:1);
});
