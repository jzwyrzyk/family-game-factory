import {fundPremiumEditRepair} from '../server/pipeline/premium-policy';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ActionCoordinator} from '../server/actions/coordinator';
import type {WorkerStage} from '../server/actions/identity';
import {grantAdultPilot,beginAdultPilotSession,authenticateAdultPilotSession} from '../server/adult-pilot';
import {approvedPremiumPilot,type GatewayConfig} from '../server/gateway';
import {PREMIUM_POLICY_VERSION,INITIAL_PREMIUM_MODELS,premiumJobReserve,type AgentApproval,type PremiumApproval,type ModelStage,type StageUsage} from '../server/agent/model-policy';
import {illustratedGame} from './generated-art-fixtures';
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
  maxInputTokens:{planning:40000,construction:48000,review:64000,repair:64000}[stage],maxOutputTokens:astra?24000:stage==='review'?8000:6000,lowDetailImageTokens:4096,
  inputUsdPerMillion:astra?8:2,outputUsdPerMillion:astra?40:10};
}
const approval:PremiumApproval={version:PREMIUM_POLICY_VERSION,enabled:true,approvalId:'synthetic-premium-approval',
 images:{enabled:true,approvalId:'synthetic-art',model:'fixture-art',maxImages:2,maxMicroUsdPerImage:100000,priceReviewedOn:day,sheetFormat:'rgba8-png-grid-v1'},
 maxRepairAttempts:1,stages:{planning:settings('planning'),construction:settings('construction'),review:settings('review'),repair:settings('repair')}};
const pilot={approval,workerSha};
const agent={available:true,kind:'metered-api' as const,generate:async()=>{throw Error('NO_PAID_TRANSPORT_IN_TEST');}};
const options={allowMock:false,maxUnits:120_000,premiumMaxJobMicroUsd:5_000_000,timeoutMs:5000,maxRetries:2,adultPilotMode:true};
const gate={test:async()=>{throw Error('NO_EXTERNAL_SANDBOX_IN_TEST');}};
async function setup(){
 const repo=new MemoryRepository(),service=new JobService(repo,agent,gate,{...options,premiumPilot:pilot});
 await repo.transaction(s=>{
  s.devices=[{id:child.deviceId,familyId,name:'fixture',secretHash:'a'.repeat(64),rotation:0,createdAt:Date.now()-1000,lastSeenAt:Date.now(),expiresAt:Date.now()+86400000}];
  s.ledgers[familyId]={month:day.slice(0,7),allowance:5_000_000,used:0,reserved:0,paidEnabled:true};return true;
 });
 await grantAdultPilot(repo,{familyId,deviceId:child.deviceId,receipt:'synthetic-receipt',operatorConfirmedAdult:true,expiresAt:Date.now()+86400000});
 const grant=await repo.transaction(s=>beginAdultPilotSession(s,child));
 const adult=authenticateAdultPilotSession(await repo.snapshot(),child,grant.cookieValue,grant.sessionToken);
 const coordinator=new ActionCoordinator(repo,{dispatch:async()=>{}},legacy,900000,false,true,pilot,options.premiumMaxJobMicroUsd);
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
 const ceiling=new JobService(repo,agent,gate,{...options,premiumMaxJobMicroUsd:premiumJobReserve(approval)-1,premiumPilot:pilot});
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
test('only new premium admissions need a valid explicit ceiling and fresh approval',async()=>{
 const {repo,service,adult}=await setup();
 assert.equal(premiumJobReserve(approval),3_912_000);
 const {jobId}=await service.submit(adult,request);
 for(const cap of [undefined,null,false,'5000000',NaN,Infinity,0,-1,1.5,5_000_001]){
  const closed=new JobService(repo,agent,gate,{...options,premiumMaxJobMicroUsd:cap as number,premiumPilot:pilot});
  assert.equal((await closed.readiness(adult)).available,false);
  await assert.rejects(closed.submit(adult,{...request,clientRequestId:'new'}),/MODEL_POLICY_UNAVAILABLE/);
  assert.equal((await closed.submit(adult,request)).jobId,jobId);
 }
 const stale=structuredClone(pilot);
 stale.approval.stages.repair.priceReviewedOn='2000-01-01';
 const expired=new JobService(repo,agent,gate,{...options,premiumPilot:stale});
 await assert.rejects(expired.submit(adult,{...request,clientRequestId:'expired'}),/MODEL_POLICY_UNAVAILABLE/);
 assert.equal((await repo.snapshot()).ledgers[familyId].reserved,3_912_000);
 await expired.cancel(adult,jobId);
 assert.equal((await repo.snapshot()).ledgers[familyId].reserved,0);
});
test('a five-dollar envelope competes atomically for the remaining family allowance',async()=>{
 const {repo,adult}=await setup(),maximal=structuredClone(pilot);
 for(const [stage,policy] of Object.entries(maximal.approval.stages)){
  policy.maxInputTokens=64000;
  policy.maxOutputTokens=['construction','repair'].includes(stage)?32000:16000;
 }
 maximal.approval.images!.maxMicroUsdPerImage=66000;
 assert.equal(premiumJobReserve(maximal.approval),5_000_000);
 const service=new JobService(repo,agent,gate,{...options,premiumPilot:maximal});
 const outcomes=await Promise.allSettled(['one','two'].map(clientRequestId=>service.submit(adult,{...request,clientRequestId})));
 assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
 const denied=outcomes.find(x=>x.status==='rejected');
 assert.match(String(denied?.reason),/SPENDING_CUTOFF/);
 const state=await repo.snapshot();
 assert.equal(state.jobs.length,1);
 assert.equal(state.ledgers[familyId].reserved,5_000_000);
 await service.cancel(adult,state.jobs[0].id);
 await service.setAllowance({...adult,role:'parent'},6_000_000,true);
 maximal.approval.images!.maxMicroUsdPerImage++;
 assert.equal((await service.readiness(adult)).available,false);
 await assert.rejects(service.submit(adult,{...request,clientRequestId:'oversize'}),/SPENDING_CUTOFF/);
 assert.equal((await repo.snapshot()).ledgers[familyId].reserved,0);
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
 assert.equal((await h.repo.snapshot()).jobs.find(job=>job.id===old.jobId)?.maxUnits,120_000);
 assert.deepEqual((await h.coordinator.claim(old.jobId,0,'generate',id)).approval,legacy);
});
for(const usageComplete of [true,false])test('an interrupted paid report preserves measured usage and '+(usageComplete?'settles actual text cost':'accounts for unknown charges'),async()=>{
 const h=await admitted(),id=identity('generate');
 const claim=await h.coordinator.claim(h.id,0,'generate',id,PREMIUM_POLICY_VERSION);
 assert.deepEqual(claim.approval,approval);
 const planning=usage('planning'),art=approval.images!.maxMicroUsdPerImage;
 const report={errorCode:'MODEL_ACCESS_UNAVAILABLE',...planning,imageUsageUnits:art,usageUnits:planning.usageUnits+art,usageComplete};
 await h.coordinator.report(h.id,0,'generate',id,report);await h.coordinator.report(h.id,0,'generate',id,report);
 const state=await h.repo.snapshot(),view=await h.service.get(h.adult,h.id);
 assert.equal(view.errorCode,'MODEL_ACCESS_UNAVAILABLE');assert.equal(view.modelPolicy?.measuredTextCostMicroUsd,planning.usageUnits);
 assert.equal(view.modelPolicy?.imageAllowanceMicroUsd,art);
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

// This historical Build predates pass-sized reservations. Its job and revision
// already carry every link needed to charge later edits against the same game.
async function savedGame(spent:number){
 const h=await admitted();
 await h.repo.transaction(s=>{
  const job=s.jobs[0];
  Object.assign(job,{status:'ready',usedUnits:spent,revisionId:'saved'});
  s.revisions.push({id:'saved',familyId,parentId:null,projectId:'original-project',
   adultPilotProfileId:h.adult.adultProfileId,game:illustratedGame()});
  Object.assign(s.ledgers[familyId],{used:0,reserved:0,allowance:10_000_000}); // new family billing month
  return true;
 });
 return h;
}
const edit=(baseRevisionId:string,clientRequestId:string,prompt='Make the player jump higher.')=>
 ({...request,gameId:'generated-module',baseRevisionId,clientRequestId,prompt});

test('separate successful paid revisions share the original game balance and release unused funds',async()=>{
 const h=await savedGame(1_500_000);
 let base='saved',editCost=0;
 for(const clientId of ['first-edit','second-edit']){
  const r=edit(base,clientId),ack=await h.service.submit(h.adult,r);
  await h.coordinator.enqueue(ack.jobId);
  const gen=identity('generate'),sandbox=identity('test'),reviewer=identity('review');
  const claim=await h.coordinator.claim(ack.jobId,0,'generate',gen,PREMIUM_POLICY_VERSION);
  // No redraw on the first pass of a mechanics edit to illustrated artwork.
  assert.equal(claim.input!.budget.maxUnits,1_692_000);
  const plan=bindGameProductionPlan({...fixturePremiumPlanProposal({}),presentationStyle:'illustrated'},{...claim.input!,signal:new AbortController().signal},true);
  const source=productionFixture(stickerLaunchFixture,r.prompt);
  const game={...source,assets:illustratedGame().assets,productionPlan:plan,playthrough:source.playthrough!.slice(0,1)};
  const generated=usage('planning','construction');
  await h.coordinator.report(ack.jobId,0,'generate',gen,{candidate:{format:'generated-source-v1',game},...generated});
  await h.coordinator.claim(ack.jobId,0,'test',sandbox,PREMIUM_POLICY_VERSION);
  const compiled=compiledPipelineFixture(game),evidence=syntheticQualityEvidence(compiled);
  await h.coordinator.report(ack.jobId,0,'test',sandbox,{ok:true,game:compiled,qualityEvidence:evidence});
  await h.coordinator.claim(ack.jobId,0,'review',reviewer,PREMIUM_POLICY_VERSION);
  const review=bindQualityReview(compiled,evidence,syntheticPremiumReviewAnswer()),reviewed=usage('review');
  await h.coordinator.report(ack.jobId,0,'review',reviewer,{review,...reviewed});
  const result=await h.service.get(h.adult,ack.jobId);
  assert.equal(result.status,'ready');
  base=result.revisionId!;
  await h.service.keep(h.adult,base);
  editCost+=generated.usageUnits+reviewed.usageUnits;
  const ledger=(await h.repo.snapshot()).ledgers[familyId];
  assert.equal(ledger.reserved,0);
  assert.equal(ledger.used,editCost);
 }
 const fork=await h.service.fork(h.adult,base,'Copy');
 const sibling=(await h.service.undo(h.adult,base)).revisionId;
 // Both copies have the same historical spend even when the current ledger is empty.
 const lowered=new JobService(h.repo,agent,gate,{...options,premiumPilot:pilot,premiumMaxJobMicroUsd:1_500_000+editCost+1_692_000-1});
 for(const id of [base,sibling,fork.revisionId])await assert.rejects(lowered.submit(h.adult,edit(id,'no-room')),/GAME_BUDGET_REACHED/);
 assert.equal((await h.repo.snapshot()).ledgers[familyId].reserved,0);
});
test('requested artwork on a saved game reserves its approved first-pass image capacity',async()=>{
 const h=await savedGame(3_108_000);
 const ack=await h.service.submit(h.adult,edit('saved','art-edit','Redraw the background.'));
 assert.equal((await h.repo.snapshot()).ledgers[familyId].reserved,1_892_000);
 await h.service.cancel(h.adult,ack.jobId);
 assert.equal((await h.repo.snapshot()).ledgers[familyId].reserved,0);
});
test('concurrent edits on fork and original compete for the same game funds',async()=>{
 const h=await savedGame(1_700_000),fork=await h.service.fork(h.adult,'saved','Copy');
 const results=await Promise.allSettled(['saved',fork.revisionId].map((id,i)=>h.service.submit(h.adult,edit(id,'race-'+i))));
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
 assert.match(String(results.find(x=>x.status==='rejected')?.reason),/GAME_BUDGET_REACHED/);
 assert.equal((await h.repo.snapshot()).ledgers[familyId].reserved,1_692_000);
 const independent=await h.service.submit(h.adult,{...request,clientRequestId:'independent'});
 assert.equal(independent.status,'queued');
});
test('unknown initial Build cost stays charged through a fresh retry ID and a new family month',async()=>{
 const h=await admitted(),gen=identity('generate');
 await h.coordinator.claim(h.id,0,'generate',gen,PREMIUM_POLICY_VERSION);
 await h.coordinator.report(h.id,0,'generate',gen,{errorCode:'PROVIDER_TIMEOUT',usageComplete:false,...usage()});
 await h.repo.transaction(s=>{s.ledgers[familyId].used=0;return true;});
 await assert.rejects(h.service.retry(h.adult,h.id,'explicit-retry'),/GAME_BUDGET_REACHED/);
 assert.equal((await h.repo.snapshot()).jobs.length,1);
});
for(const limit of ['game','family','funded'] as const)test('visual repair reserves before dispatch: '+limit,async()=>{
 const h=await savedGame(limit==='game'?3_308_000:1_500_000);
 if(limit==='family')await h.service.setAllowance({...h.adult,role:'parent'},1_692_000,true);
 const ack=await h.service.submit(h.adult,edit('saved','needs-repair'));
 await h.coordinator.enqueue(ack.jobId);
 const gen=identity('generate'),sandbox=identity('test');
 const claim=await h.coordinator.claim(ack.jobId,0,'generate',gen,PREMIUM_POLICY_VERSION);
 const plan=bindGameProductionPlan({...fixturePremiumPlanProposal({}),presentationStyle:'illustrated'},{...claim.input!,signal:new AbortController().signal},true);
 const source=productionFixture(stickerLaunchFixture,claim.input!.childIntent);
 const game={...source,assets:illustratedGame().assets,productionPlan:plan,playthrough:source.playthrough!.slice(0,1)};
 const generated=usage('planning','construction');
 await h.coordinator.report(ack.jobId,0,'generate',gen,{candidate:{format:'generated-source-v1',game},...generated});
 await h.coordinator.claim(ack.jobId,0,'test',sandbox,PREMIUM_POLICY_VERSION);
 const failure={ok:false,diagnostics:'VISUAL_INCOHERENT_ART'};
 await h.coordinator.report(ack.jobId,0,'test',sandbox,failure);
 await h.coordinator.report(ack.jobId,0,'test',sandbox,failure);
 const state=await h.repo.snapshot(),job=state.jobs.at(-1)!;
 if(limit==='funded'){
  assert.equal(state.ledgers[familyId].reserved,generated.usageUnits+2_020_000);
  const repair=await h.coordinator.claim(job.id,1,'generate',identity('generate',1),PREMIUM_POLICY_VERSION);
  assert.equal(repair.input!.budget.maxUnits,2_020_000);
 }else{
  assert.equal(job.status,'failed');
  assert.equal(job.errorCode,limit==='game'?'GAME_BUDGET_REACHED':'SPENDING_CUTOFF');
  assert.equal(job.execution!.attempt,0);
  assert.equal(state.ledgers[familyId].used,generated.usageUnits);
  assert.equal(state.ledgers[familyId].reserved,0);
 }
});
test('approved art on a saved revision stays within its immutable family and adult profile',async()=>{
 const {repo,service,adult}=await setup();
 const original=illustratedGame();
 for(const [id,family,profile] of [['foreign-family','other',adult.adultProfileId],['foreign-profile',familyId,'other-profile']] as const){
  await repo.transaction(state=>{state.revisions.push({id,familyId:family,adultPilotProfileId:profile,parentId:null,projectId:'art',game:original});return true;});
  await assert.rejects(service.submit(adult,{...request,gameId:'generated-module',baseRevisionId:id,clientRequestId:id}),/forbidden|not_found/i);
 }
 const state=await repo.snapshot();
 assert.equal(state.jobs.length,0);assert.equal(state.ledgers[familyId].reserved,0);
 assert.equal(state.revisions.length,2);
});

test('additional repair allowance denial leaves the existing job and family reservation unchanged',async()=>{
 const h=await admitted();
 await h.repo.transaction(state=>{
  const job=state.jobs.find(j=>j.id===h.id)!;
  job.status='testing';job.maxUnits=10000;job.usedUnits=10000;job.premiumEditCeilingMicroUsd=5000000;
  state.ledgers[familyId].reserved=10000;
  let admissions=0;
  assert.equal(fundPremiumEditRepair(state,job,approval,5000000,false,()=>{admissions++;return false;}),'SPENDING_CUTOFF');
  assert.equal(job.maxUnits,10000);assert.equal(state.ledgers[familyId].reserved,10000);
  assert.equal(fundPremiumEditRepair(state,job,approval,5000000,false,()=>{admissions++;return true;}),undefined);
  const admitted=job.maxUnits;assert.ok(admitted>10000);assert.equal(state.ledgers[familyId].reserved,admitted);
  assert.equal(fundPremiumEditRepair(state,job,approval,5000000,false,()=>{throw Error('Must not re-admit a covered repair');}),undefined);
  assert.equal(job.maxUnits,admitted);assert.equal(admissions,2);return true;
 });
});
