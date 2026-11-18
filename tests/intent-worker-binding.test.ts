import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ActionCoordinator} from '../server/actions/coordinator';
import {MemoryRepository} from '../server/pipeline/repository';
import {JobService,validateBuildRequest} from '../server/pipeline/service';
import {draftChildIntentContract} from '../server/quality/child-intent';
import {chooseGameForm} from '../server/quality/game-form';
import {createFunctionalGameContract} from '../server/quality/functional-game-contract';
import {stickerLaunchFixture} from '../server/testing/working-game-fixtures';
import type {AgentApproval} from '../server/agent/openai';

const idea='Drag three bubble gum stickers onto a rocket, then press Launch to blast off.';
const req={gameId:'new',baseRevisionId:null,prompt:idea,clientRequestId:'intent-probe-1'};
const intent=draftChildIntentContract(idea);
const form=chooseGameForm(intent);
const spec=createFunctionalGameContract(intent,form,[
 {id:'attach',quote:'Drag three bubble gum stickers onto a rocket'},
 {id:'launch',quote:'press Launch'}, {id:'payoff',quote:'blast off'}
],[{
 id:'complete-build',covers:['attach','launch','payoff'],deterministicReplay:true,
 actions:[
  {kind:'drag',from:{x:60,y:330},to:{x:310,y:270}},
  {kind:'drag',from:{x:140,y:330},to:{x:360,y:270}},
  {kind:'drag',from:{x:220,y:330},to:{x:410,y:270}},
  {kind:'press',button:'action'}, {kind:'wait',frames:75}
 ],
 checkpoints:[{after:5,outcome:'won',observations:[
  {kind:'coordinate',key:'rocket',axis:'y',operator:'lt',value:100}
 ]}]
}]);
const approval:AgentApproval={
 enabled:true,approvalId:'fixture-unit',model:'fixture-v2',inputUsdPerMillion:1,
 outputUsdPerMillion:1,maxInputTokens:64000,maxOutputTokens:4000,
 priceReviewedOn:new Date().toISOString().slice(0,10)
};
const parent={subject:'owner',familyId:'quality-family',role:'parent' as const,expiresAt:Date.now()+60000};
const identity=(stage:'generate'|'test',runId:string)=>({
 runId,repositoryId:'42',sha:'a'.repeat(40),stage
});
function service(repo:MemoryRepository){
 return new JobService(repo,{kind:'metered-api',available:true,
  generate:async()=>{throw Error('MODEL_TRANSPORT_NOT_ALLOWED_IN_TEST');}
 },{test:async()=>{throw Error('SANDBOX_NOT_ALLOWED_IN_TEST');}},
 {allowMock:false,maxUnits:100,timeoutMs:60000,maxRetries:2});
}
test('O5 independent specification is server-private: public BuildRequest cannot attach or forge it',()=>{
 assert.throws(()=>validateBuildRequest({...req,independentIntentPlan:spec}),/INVALID_REQUEST/);
});
test('O5 private test claim binds source-verified plan and refuses a false intent attestation',async()=>{
 const repo=new MemoryRepository(),svc=service(repo);
 await svc.setAllowance(parent,1000,true);
 const job=await svc.submit(parent,req);
 await repo.transaction(state=>{
  const target=state.jobs.find(j=>j.id===job.jobId);
  assert.ok(target);
  target.independentIntentPlan=spec; // internal-only vetted write, no API route
  return true;
 });
 const coordinator=new ActionCoordinator(repo,{dispatch:async()=>{}},approval);
 await coordinator.enqueue(job.jobId);
 const gen=identity('generate','run-1'),testing=identity('test','run-1');
 await coordinator.claim(job.jobId,0,'generate',gen);
 await coordinator.report(job.jobId,0,'generate',gen,{
  candidate:{format:'generated-source-v1',game:stickerLaunchFixture},usageUnits:1
 });
 const task=await coordinator.claim(job.jobId,0,'test',testing);
 assert.deepEqual(task.independentIntentPlan,spec);
 assert.equal(task.game.source,stickerLaunchFixture.source);
 await assert.rejects(coordinator.report(job.jobId,0,'test',testing,{
  ok:true,game:{...stickerLaunchFixture,compiled:{
   code:'fake',sourceHash:'fake',codeHash:'fake',
   tests:{desktop:true,mobile:true,replay:true,isolation:true}
  }}
 }),/INTENT_ATTESTATION_REQUIRED/);
 await coordinator.report(job.jobId,0,'test',testing,{
  ok:false,diagnostics:'INTENT_PLAYTEST_FAILED:complete-build:0'
 });
 const state=await repo.snapshot();
 const current=state.jobs.find(j=>j.id===job.jobId)!;
 assert.equal(current.phase,'repairing');
 assert.equal(current.status,'building');
 assert.equal(current.execution?.attempt,1);
 assert.deepEqual(current.independentIntentPlan,spec,'repair retains same independent expectations');
 assert.equal(state.revisions.length,0,'failed behavior cannot become a ready revision');
 assert.equal(state.ledgers[parent.familyId].reserved,100);
});
test('O5 a source-tampered plan fails closed before a private test-stage claim',async()=>{
 const repo=new MemoryRepository(),svc=service(repo);
 await svc.setAllowance(parent,1000,true);
 const job=await svc.submit(parent,{...req,clientRequestId:'intent-tamper'});
 const forged=JSON.parse(JSON.stringify(spec));
 forged.sourceSha256='f'.repeat(64);
 await repo.transaction(state=>{
  state.jobs.find(j=>j.id===job.jobId)!.independentIntentPlan=forged;return true;
 });
 const coordinator=new ActionCoordinator(repo,{dispatch:async()=>{}},approval);
 await coordinator.enqueue(job.jobId);
 const gen=identity('generate','run-2'),testing=identity('test','run-2');
 await coordinator.claim(job.jobId,0,'generate',gen);
 await coordinator.report(job.jobId,0,'generate',gen,{
  candidate:{format:'generated-source-v1',game:stickerLaunchFixture},usageUnits:1
 });
 await assert.rejects(coordinator.claim(job.jobId,0,'test',testing),/WORKING_GAME_CONTRACT_SCHEMA/);
 const state=await repo.snapshot(),current=state.jobs.find(j=>j.id===job.jobId)!;
 assert.equal(current.status,'testing');
 assert.equal(current.execution?.stage,'generate');
 assert.equal(state.revisions.length,0);
});
