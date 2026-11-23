import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ActionCoordinator} from '../server/actions/coordinator';
import type {WorkerStage} from '../server/actions/identity';
import {grantAdultPilot,beginAdultPilotSession,authenticateAdultPilotSession} from '../server/adult-pilot';
import {approvedPremiumPilot,type GatewayConfig} from '../server/gateway';
import {PREMIUM_POLICY_VERSION,INITIAL_PREMIUM_MODELS,premiumJobReserve,type AgentApproval,type PremiumApproval,type ModelStage,type StageUsage} from '../server/agent/model-policy';
import {MemoryRepository} from '../server/pipeline/repository';
import {JobService} from '../server/pipeline/service';
import {bindGameProductionPlan} from '../server/quality/presentation-plan';
import {bindQualityReview} from '../server/quality/game-quality';
import {fixturePremiumPlanProposal,syntheticPremiumReviewAnswer,syntheticQualityEvidence} from '../server/testing/presentation-quality-fixtures';
import {stickerLaunchFixture} from '../server/testing/working-game-fixtures';
import {hopper} from '../server/testing/generated-fixtures';
import {productionFixture,compiledPipelineFixture} from './quality-pipeline-fixtures';

const day=new Date().toISOString().slice(0,10),workerSha='a'.repeat(40),familyId='operator-family';
const child={subject:'family-designer',familyId,role:'designer' as const,deviceId:'00000000-aaaa-bbbb-cccc-000000000111',expiresAt:Date.now()+600000};
const request={gameId:'new',baseRevisionId:null,prompt:'Make a game where I attach stickers to a rocket and launch it.',clientRequestId:'first'};
const legacy:AgentApproval={enabled:true,approvalId:'existing-approval',model:'legacy-fixture',priceReviewedOn:day,
 inputUsdPerMillion:1,outputUsdPerMillion:3,maxInputTokens:32000,maxOutputTokens:4000};
function settings(stage:ModelStage){
 const model=INITIAL_PREMIUM_MODELS[stage],astra=model==='gpt-6.2-astra';
 return {model,reasoningEffort:'high' as const,zdrApproved:true as const,priceReviewedOn:day,providerAccessReviewedOn:day,
  maxInputTokens:stage==='review'?48000:20000,maxOutputTokens:astra?3000:2000,lowDetailImageTokens:4096,
  inputUsdPerMillion:astra?8:2,outputUsdPerMillion:astra?40:10};
}
const approval:PremiumApproval={version:PREMIUM_POLICY_VERSION,enabled:true,approvalId:'synthetic-premium-approval',
 maxRepairAttempts:1,stages:{planning:settings('planning'),construction:settings('construction'),review:settings('review'),repair:settings('repair')}};
const pilot={approval,workerSha};
const agent={available:true,kind:'metered-api' as const,generate:async()=>{throw Error('NO_PAID_TRANSPORT_IN_TEST');}};
const options={allowMock:false,maxUnits:1_000_000,timeoutMs:5000,maxRetries:2,adultPilotMode:true};
const gate={test:async()=>{throw Error('NO_EXTERNAL_SANDBOX_IN_TEST');}};
async function setup(){
 const repo=new MemoryRepository(),service=new JobService(repo,agent,gate,{...options,premiumPilot:pilot});
 await repo.transaction(s=>{
  s.devices=[{id:child.deviceId,familyId,name:'fixture',secretHash:'a'.repeat(64),rotation:0,createdAt:Date.now()-1000,lastSeenAt:Date.now(),expiresAt:Date.now()+86400000}];
  s.ledgers[familyId]={month:day.slice(0,7),allowance:1_000_000,used:0,reserved:0,paidEnabled:true};return true;
 });
 await grantAdultPilot(repo,{familyId,deviceId:child.deviceId,receipt:'synthetic-receipt',operatorConfirmedAdult:true,expiresAt:Date.now()+86400000});
 const grant=await repo.transaction(s=>beginAdultPilotSession(s,child));
 const adult=authenticateAdultPilotSession(await repo.snapshot(),child,grant.cookieValue,grant.sessionToken);
 const coordinator=new ActionCoordinator(repo,{dispatch:async()=>{}},legacy,900000,false,true,pilot);
 return {repo,service,adult,coordinator};
}
async function admitted(){
 const h=await setup(),ack=await h.service.submit(h.adult,request);
 await h.coordinator.enqueue(ack.jobId);return {...h,id:ack.jobId};
}
const identity=(stage:WorkerStage,attempt=0)=>({stage,runId:String(10+attempt),sha:workerSha,repositoryId:'42'});
function usage(...stages:ModelStage[]){
 const stageUsage:StageUsage[]=stages.map(stage=>{
  const policy=approval.stages[stage],inputTokens=100,outputTokens=50;
  return {stage,model:policy.model,reasoningEffort:'high',inputTokens,outputTokens,cachedInputTokens:0,reasoningTokens:20,
   costMicroUsd:inputTokens*policy.inputUsdPerMillion+outputTokens*policy.outputUsdPerMillion};
 });
 return {stageUsage,imageUsageUnits:0,usageUnits:stageUsage.reduce((sum,r)=>sum+r.costMicroUsd,0)};
}
test('premium requires separate explicit private worker, spending and adult activation',()=>{
 const config={approval:legacy,premiumApproval:approval,premiumWorkerApprovedSha:workerSha,workerApprovedSha:workerSha} as GatewayConfig;
 assert.equal(approvedPremiumPilot(config,false,true,true),undefined);
 assert.deepEqual(approvedPremiumPilot(config,true,true,true),pilot);
 assert.throws(()=>approvedPremiumPilot(config,true,false,true),/MODEL_POLICY_UNAVAILABLE/);
 assert.throws(()=>approvedPremiumPilot(config,true,true,false),/MODEL_POLICY_UNAVAILABLE/);
 assert.throws(()=>approvedPremiumPilot({...config,premiumApproval:undefined},true,true,true),/MODEL_POLICY_UNAVAILABLE/);
 assert.throws(()=>approvedPremiumPilot({...config,workerApprovedSha:'b'.repeat(40)},true,true,true),/MODEL_POLICY_WORKER_MISMATCH/);
});
test('only an unlocked adult can see the selected policy or reserve a job; ceiling and family limits are transactional',async()=>{
 const {repo,service,adult}=await setup();
 assert.equal((await service.readiness(adult)).modelPolicy?.activeVersion,PREMIUM_POLICY_VERSION);
 assert.equal((await service.readiness(child)).modelPolicy,undefined);
 await assert.rejects(service.submit(child,request),/ADULT_PILOT_ACCESS_REQUIRED/);
 await assert.rejects(service.submit(adult,{...request,premiumPolicy:pilot}),/INVALID_REQUEST/);
 const ceiling=new JobService(repo,agent,gate,{...options,maxUnits:premiumJobReserve(approval)-1,premiumPilot:pilot});
 assert.equal((await ceiling.readiness(adult)).modelPolicy?.activeVersion,null);
 await assert.rejects(ceiling.submit(adult,request),/SPENDING_CUTOFF/);
 const inaccessible=new JobService(repo,agent,gate,{...options,premiumConfigured:true,premiumUnavailable:true});
 assert.equal((await inaccessible.readiness(adult)).modelPolicy?.reason,'MODEL_POLICY_UNAVAILABLE');
 await assert.rejects(inaccessible.submit(adult,request),/MODEL_POLICY_UNAVAILABLE/);
 const acknowledgements=await Promise.all([service.submit(adult,request),service.submit(adult,request)]);
 assert.deepEqual(acknowledgements[0],acknowledgements[1]);
 await assert.rejects(service.submit(adult,{...request,clientRequestId:'another'}),/SPENDING_CUTOFF/);
 const state=await repo.snapshot();
 assert.equal(state.jobs.length,1);assert.equal(state.jobs[0].maxUnits,premiumJobReserve(approval));
 assert.equal(state.ledgers[familyId].reserved,premiumJobReserve(approval));
 await assert.rejects(service.get(child,state.jobs[0].id),/FORBIDDEN/);
 const stopped=await service.cancel(adult,state.jobs[0].id);assert.equal(stopped.status,'cancelled');
 assert.equal((await repo.snapshot()).ledgers[familyId].used,0,'no paid claim took place');
});
test('old worker handshake, drift and disabled policy fail before inference; premium retry never downgrades',async()=>{
 const h=await admitted(),id=identity('generate');
 await assert.rejects(h.coordinator.claim(h.id,0,'generate',id),/MODEL_POLICY_WORKER_MISMATCH/);
 const state=await h.repo.snapshot();assert.equal(state.jobs[0].status,'failed');assert.equal(state.ledgers[familyId].used,0);
 const legacyService=new JobService(h.repo,agent,gate,options);
 await assert.rejects(legacyService.retry(h.adult,h.id,'manual-retry'),/MODEL_POLICY_UNAVAILABLE/);
 const next=await h.service.retry(h.adult,h.id,'approved-retry');
 await h.coordinator.enqueue(next.jobId);
 const changed=new ActionCoordinator(h.repo,{dispatch:async()=>{}},legacy,900000,false,true,{workerSha,approval:{...approval,approvalId:'different'}});
 await assert.rejects(changed.claim(next.jobId,0,'generate',id,PREMIUM_POLICY_VERSION),/MODEL_POLICY_CHANGED/);
 await changed.tick();assert.equal((await h.repo.snapshot()).jobs.at(-1)?.errorCode,'MODEL_POLICY_CHANGED');
 const old=await legacyService.submit(h.adult,{...request,clientRequestId:'existing-legacy'});
 await h.coordinator.enqueue(old.jobId);
 assert.deepEqual((await h.coordinator.claim(old.jobId,0,'generate',id)).approval,legacy);
});
for(const usageComplete of [true,false])test('an interrupted paid report preserves measured usage and '+(usageComplete?'settles actual text cost':'accounts for unknown charges'),async()=>{
 const h=await admitted(),id=identity('generate');
 const claim=await h.coordinator.claim(h.id,0,'generate',id,PREMIUM_POLICY_VERSION);
 assert.deepEqual(claim.approval,approval);
 const report={errorCode:'MODEL_ACCESS_UNAVAILABLE',...usage('planning'),usageComplete};
 await h.coordinator.report(h.id,0,'generate',id,report);await h.coordinator.report(h.id,0,'generate',id,report);
 const state=await h.repo.snapshot(),view=await h.service.get(h.adult,h.id);
 assert.equal(view.errorCode,'MODEL_ACCESS_UNAVAILABLE');assert.equal(view.modelPolicy?.measuredTextCostMicroUsd,report.usageUnits);
 assert.equal(view.modelPolicy?.usageUncertain,!usageComplete);
 assert.equal(view.modelPolicy?.accountedMicroUsd,usageComplete?report.usageUnits:premiumJobReserve(approval));
 assert.equal(state.ledgers[familyId].reserved,0);assert.equal(state.ledgers[familyId].used,view.modelPolicy?.accountedMicroUsd);
 assert.equal(state.jobs[0].premiumUsage!.calls.length,1);
 for(const privateValue of [approval.approvalId,request.prompt,'receiptHash','fingerprint'])assert.ok(!JSON.stringify(view).includes(privateValue));
});
test('a settled planning-only rejection reaches the adult without construction, repair or duplicate charges',async()=>{
 const h=await admitted(),gen=identity('generate');
 await h.coordinator.claim(h.id,0,'generate',gen,PREMIUM_POLICY_VERSION);
 const report={errorCode:'QUALITY_EVIDENCE_CAPACITY_EXCEEDED',...usage('planning'),usageComplete:true};
 await h.coordinator.report(h.id,0,'generate',gen,report);
 await h.coordinator.report(h.id,0,'generate',gen,report);
 await h.coordinator.tick();
 const job=await h.service.get(h.adult,h.id),state=await h.repo.snapshot();
 assert.equal(job.status,'failed');assert.equal(job.errorCode,report.errorCode);
 assert.deepEqual(job.modelPolicy?.stages.map(call=>call.stage),['planning']);
 assert.equal(job.modelPolicy?.repairAttempts,0);assert.equal(job.modelPolicy?.usageUncertain,false);
 assert.equal(job.modelPolicy?.measuredTextCostMicroUsd,report.usageUnits);
 assert.equal(state.ledgers[familyId].used,report.usageUnits);assert.equal(state.ledgers[familyId].reserved,0);
 assert.equal(state.revisions.length,0);await assert.rejects(h.service.get(child,h.id),/FORBIDDEN/);
 await assert.rejects(h.coordinator.claim(h.id,1,'generate',identity('generate',1),PREMIUM_POLICY_VERSION),/WORKER_CLAIM_REJECTED/);
});
test('ambiguous paid cancellation conservatively settles once and ignores late results',async()=>{
 const h=await admitted(),gen=identity('generate');await h.coordinator.claim(h.id,0,'generate',gen,PREMIUM_POLICY_VERSION);
 await h.service.cancel(h.adult,h.id);await h.service.cancel(h.adult,h.id);
 await assert.rejects(h.coordinator.report(h.id,0,'generate',gen,{...usage('planning','construction')}),/WORKER_REPORT_REJECTED/);
 const state=await h.repo.snapshot(),view=await h.service.get(h.adult,h.id);
 assert.equal(view.status,'cancelled');assert.equal(view.modelPolicy?.usageUncertain,true);
 assert.equal(state.ledgers[familyId].used,premiumJobReserve(approval));assert.equal(view.modelPolicy?.measuredTextCostMicroUsd,0);
});
test('premium v1 edit refuses before spend; existing revisions retain play, Keep, Undo, Fork and legacy edit behavior',async()=>{
 const h=await setup();
 await h.repo.transaction(s=>{
  const game=compiledPipelineFixture(hopper);
  for(const [id,parentId] of [['v1-base',null],['v1-child','v1-base']] as const)s.revisions.push({
   id,parentId,game,familyId,projectId:'saved',adultPilotProfileId:h.adult.adultProfileId});
  return true;
 });
 const edit={...request,gameId:'generated-module',baseRevisionId:'v1-child',prompt:'Make the player jump higher.'};
 await assert.rejects(h.service.submit(h.adult,edit),/GAME_FORM_REVIEW_REQUIRED/);
 assert.equal((await h.repo.snapshot()).ledgers[familyId].reserved,0);
 assert.equal((await h.service.revision(h.adult,'v1-child')).game?.kind,'generated-module-v1');
 await h.service.keep(h.adult,'v1-child');
 assert.equal((await h.service.undo(h.adult,'v1-child')).revisionId,'v1-base');
 assert.equal((await h.service.revision(h.adult,(await h.service.fork(h.adult,'v1-child','Fork')).revisionId)).game?.kind,'generated-module-v1');
 const legacyService=new JobService(h.repo,agent,gate,options);
 assert.equal((await legacyService.submit(h.adult,edit)).status,'queued');
});
for(const pass of [true,false])test('hosted premium candidate is '+(pass?'accepted after grounded repair':'rejected after configured repair exhaustion'),async()=>{
 const h=await admitted(),source=productionFixture(stickerLaunchFixture,request.prompt);
 for(let attempt=0;attempt<2;attempt++){
  const gen=identity('generate',attempt),sandbox=identity('test',attempt),reviewer=identity('review',attempt);
  const claim=await h.coordinator.claim(h.id,attempt,'generate',gen,PREMIUM_POLICY_VERSION);
  assert.ok(claim.input);assert.deepEqual(claim.approval,approval);
  if(attempt)assert.ok(claim.previous&&claim.diagnostics);
  const plan=bindGameProductionPlan(fixturePremiumPlanProposal({}),{...claim.input,signal:new AbortController().signal},true);
  const game={...source,productionPlan:plan,playthrough:source.playthrough!.slice(0,1)},result={candidate:{format:'generated-source-v1',game},...(attempt?usage('repair'):usage('planning','construction'))};
  await assert.rejects(h.coordinator.report(h.id,attempt,'generate',gen,{...result,...usage('review')}),/PREMIUM_USAGE_INVALID/);
  await h.coordinator.report(h.id,attempt,'generate',gen,result);
  await h.coordinator.report(h.id,attempt,'generate',gen,result);
  const sandboxClaim=await h.coordinator.claim(h.id,attempt,'test',sandbox,PREMIUM_POLICY_VERSION);
  assert.equal(sandboxClaim.approval,undefined);
  const compiled=compiledPipelineFixture(game),evidence=syntheticQualityEvidence(compiled);
  await h.coordinator.report(h.id,attempt,'test',sandbox,{ok:true,game:compiled,qualityEvidence:evidence});
  const reviewClaim=await h.coordinator.claim(h.id,attempt,'review',reviewer,PREMIUM_POLICY_VERSION);
  assert.deepEqual(reviewClaim.approval,approval);
  const answer=syntheticPremiumReviewAnswer();
  const review=bindQualityReview(compiled,evidence,attempt&&pass?answer:{...answer,axes:{...answer.axes,visual:'fail'},findings:['VISUAL_STYLE_MISMATCH']});
  const report={review,...usage('review')};
  await h.coordinator.report(h.id,attempt,'review',reviewer,report);await h.coordinator.report(h.id,attempt,'review',reviewer,report);
 }
 const state=await h.repo.snapshot(),view=await h.service.get(h.adult,h.id);
 assert.equal(view.status,pass?'ready':'failed');assert.equal(view.modelPolicy?.review,pass?'passed':'rejected');
 assert.equal(view.modelPolicy?.repairAttempts,1);assert.equal(state.revisions.length,pass?1:0);
 assert.deepEqual(view.modelPolicy?.stages.map(r=>r.stage),['planning','construction','review','repair','review']);
 assert.equal(state.ledgers[familyId].used,view.modelPolicy?.measuredTextCostMicroUsd);
 assert.equal(state.ledgers[familyId].reserved,0);assert.equal(state.jobs[0].execution?.qualityEvidence,undefined);
 assert.equal(view.modelPolicy?.usageUncertain,false);
 if(pass){
  const legacyService=new JobService(h.repo,agent,gate,options);
  const fork=await legacyService.fork(h.adult,view.revisionId!,'My saved premium game');
  for(const id of [view.revisionId!,fork.revisionId]){
   await legacyService.keep(h.adult,id);
   await assert.rejects(legacyService.submit(h.adult,{...request,gameId:'generated-module',baseRevisionId:id,
    clientRequestId:'after-rollback',prompt:'Make the rocket move faster.'}),/MODEL_POLICY_UNAVAILABLE/);
  }
  assert.equal((await h.repo.snapshot()).ledgers[familyId].reserved,0);
 }
});
