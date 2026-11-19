/** Authorization and workspace regression tests. All generation/sandbox
 * responses below are authored fixtures, not evidence of a paid provider call. */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {MemoryRepository} from '../server/pipeline/repository';
import {JobService} from '../server/pipeline/service';
import {ActionCoordinator} from '../server/actions/coordinator';
import {grantAdultPilot,beginAdultPilotSession,authenticateAdultPilotSession} from '../server/adult-pilot';
import {hash,type GeneratedGame} from '../server/agent/generated';
import {hopper} from '../server/testing/generated-fixtures';
import {defaults} from '../src/runtime/manifests';
import type {VerifiedSession} from '../server/contracts/api';
import type {AgentAdapter} from '../server/pipeline/types';
import type {AgentApproval} from '../server/agent/openai';

const familyId='adult-workspace-family';
const firstDevice='11111111-2222-3333-4444-555555555555';
const secondDevice='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const prompt='Build a rocket that flies';
const request=(clientRequestId:string)=>({gameId:'new',baseRevisionId:null,prompt,clientRequestId});
const options={allowMock:true,maxUnits:0,timeoutMs:2000,maxRetries:2};
const mock:AgentAdapter={available:true,kind:'mock',generate:async()=>({
 candidate:{format:'declarative-v1',game:{kind:'star-catcher-v1',target:4,seconds:20}},usageUnits:0
})};
const gate={test:async()=>{}};
const approval:AgentApproval={enabled:true,approvalId:'auth-fixture-only',model:'fixture',
 inputUsdPerMillion:1,outputUsdPerMillion:1,maxInputTokens:64000,maxOutputTokens:4000,
 priceReviewedOn:new Date().toISOString().slice(0,10)};
const identity=(stage:'generate'|'test',runId='adult-auth-worker')=>({
 stage,runId,repositoryId:'42',sha:'a'.repeat(40)
});
const generated={candidate:{format:'generated-source-v1' as const,game:hopper},usageUnits:1};
const compiled:GeneratedGame={...hopper,compiled:{code:'fixture-only-compiled-code',
 sourceHash:hash(hopper.source),codeHash:hash('fixture-only-compiled-code'),
 tests:{desktop:true,mobile:true,replay:true,isolation:true}}};
async function unlock(repo:MemoryRepository,session:VerifiedSession){
 const credentials=await repo.transaction(s=>beginAdultPilotSession(s,session));
 return authenticateAdultPilotSession(await repo.snapshot(),session,credentials.cookieValue,credentials.sessionToken);
}
async function fixture(){
 const repo=new MemoryRepository(),now=Date.now();
 const child:VerifiedSession={subject:'family-designer',familyId,deviceId:firstDevice,role:'designer',expiresAt:now+86400000};
 const otherChild={...child,deviceId:secondDevice};
 await repo.transaction(s=>{
  s.devices=[firstDevice,secondDevice].map(id=>({id,familyId,name:'Fixture device',secretHash:'a'.repeat(64),
   rotation:0,createdAt:now-60000,lastSeenAt:now,expiresAt:now+86400000}));
  s.ledgers[familyId]={allowance:10000,paidEnabled:true,month:new Date().toISOString().slice(0,7),used:0,reserved:0};
  return true;
 });
 for(const deviceId of [firstDevice,secondDevice])await grantAdultPilot(repo,{familyId,deviceId,
  receipt:'workspace-adult-review-'+deviceId,operatorConfirmedAdult:true,expiresAt:now+86400000});
 const adult=await unlock(repo,child),otherAdult=await unlock(repo,otherChild);
 const service=new JobService(repo,mock,gate,{...options,adultPilotMode:true});
 const childService=new JobService(repo,mock,gate,options);
 return {repo,child,otherChild,adult,otherAdult,service,childService};
}
async function makeReady(service:JobService,session:VerifiedSession,id:string){
 const ack=await service.submit(session,request(id));
 await service.run(ack.jobId);
 const status=await service.get(session,ack.jobId);
 assert.equal(status.status,'ready');assert.ok(status.revisionId);
 await service.keep(session,status.revisionId);
 return {jobId:ack.jobId,revisionId:status.revisionId};
}
test('adult workspace: seeds and idempotency are isolated within one family and across adult devices',async()=>{
 const {repo,adult,otherAdult,child,service,childService}=await fixture();
 const base={gameId:'moon',localRevisionId:'same-local-revision',config:defaults('moon')};
 const childBase=await childService.registerBase(child,base);
 const adultBase=await service.registerBase(adult,base);
 const otherBase=await service.registerBase(otherAdult,base);
 assert.equal(new Set([childBase.revisionId,adultBase.revisionId,otherBase.revisionId]).size,3);
 assert.deepEqual(await service.registerBase(adult,base),adultBase);
 await assert.rejects(service.registerBase(adult,{...base,config:{...base.config,donutGoal:7}}),/IDEMPOTENCY_CONFLICT/);
 const first=await childService.submit(child,request('same-client-request'));
 const second=await service.submit(adult,request('same-client-request'));
 const third=await service.submit(otherAdult,request('same-client-request'));
 assert.equal(new Set([first.jobId,second.jobId,third.jobId]).size,3,'profile namespaces cannot collide');
 assert.equal((await service.submit(adult,request('same-client-request'))).jobId,second.jobId);
 await assert.rejects(service.submit(adult,{...request('same-client-request'),prompt:'Build a different rocket'}),/IDEMPOTENCY_CONFLICT/);
 for(const [session,svc,revisionId] of [
  [adult,service,childBase.revisionId],[child,childService,adultBase.revisionId],
  [otherAdult,service,adultBase.revisionId]
 ] as const)await assert.rejects(svc.submit(session,{...request('foreign-base'),gameId:'moon',baseRevisionId:revisionId}),/FORBIDDEN/);
 const state=await repo.snapshot();assert.equal(state.jobs.length,3);assert.equal(state.revisions.length,3);
 assert.equal(state.ledgers[familyId].reserved,0);
});
test('adult workspace: job and saved-game reads, lists, forks, keeps and retries never cross profiles',async()=>{
 const {repo,adult,otherAdult,child,service,childService}=await fixture();
 const childGame=await makeReady(childService,child,'child-game');
 const adultGame=await makeReady(service,adult,'adult-game');
 const otherGame=await makeReady(service,otherAdult,'other-adult-game');
 assert.deepEqual((await childService.list(child)).map(r=>r.id),[childGame.revisionId]);
 assert.deepEqual((await service.list(adult)).map(r=>r.id),[adultGame.revisionId]);
 assert.deepEqual((await service.list(otherAdult)).map(r=>r.id),[otherGame.revisionId]);
 const before=await repo.snapshot();
 for(const [session,svc,target] of [[child,childService,adultGame],[adult,service,childGame],
  [otherAdult,service,adultGame]] as const){
  await assert.rejects(svc.get(session,target.jobId),/FORBIDDEN/);
  await assert.rejects(svc.cancel(session,target.jobId),/FORBIDDEN/);
  await assert.rejects(svc.retry(session,target.jobId,'foreign-retry'),/FORBIDDEN/);
  await assert.rejects(svc.revision(session,target.revisionId),/FORBIDDEN/);
  await assert.rejects(svc.fork(session,target.revisionId,'Foreign fork'),/FORBIDDEN/);
  await assert.rejects(svc.keep(session,target.revisionId),/FORBIDDEN/);
  await assert.rejects(svc.undo(session,target.revisionId),/FORBIDDEN/);
 }
 assert.deepEqual(await repo.snapshot(),before,'denied cross-profile operations cannot mutate state');
 const fork=await service.fork(adult,adultGame.revisionId,'Adult experiment');
 assert.equal((await service.revision(adult,fork.revisionId)).adultPilotProfileId,adult.adultProfileId);
 assert.equal((await childService.list(child)).length,1);
 await assert.rejects(childService.list({...child,adultProfileId:adult.adultProfileId}),/FORBIDDEN/,
  'an adult profile name without the authenticated grant cannot retrieve a library');
});
test('adult workspace: expired or locked sessions cannot read saved work or create paid retries',async()=>{
 const {repo,child,adult,service}=await fixture();
 const ready=await makeReady(service,adult,'saved-before-lock');
 const pending=await service.submit(adult,request('failed-before-lock'));
 await repo.transaction(s=>{s.jobs.find(j=>j.id===pending.jobId)!.status='failed';
  s.adultPilotSessions!.find(x=>x.id===adult.adultSessionId)!.revokedAt=Date.now();return true;});
 const before=await repo.snapshot();
 await assert.rejects(service.get(adult,ready.jobId),/FORBIDDEN/);
 await assert.rejects(service.list(adult),/FORBIDDEN/);
 await assert.rejects(service.revision(adult,ready.revisionId),/FORBIDDEN/);
 await assert.rejects(service.keep(adult,ready.revisionId),/FORBIDDEN/);
 await assert.rejects(service.retry(adult,pending.jobId,'retry-with-locked-session'),/FORBIDDEN/);
 assert.equal((await repo.snapshot()).jobs.length,before.jobs.length);
 const fresh=await unlock(repo,child);
 assert.equal((await service.revision(fresh,ready.revisionId)).id,ready.revisionId,'fresh same-profile unlock can reopen its saved work');
 const retry=await service.retry(fresh,pending.jobId,'explicit-fresh-retry');
 const newJob=(await repo.snapshot()).jobs.find(j=>j.id===retry.jobId)!;
 assert.equal(newJob.adultPilotSessionId,fresh.adultSessionId);
 assert.notEqual(newJob.adultPilotSessionId,adult.adultSessionId,'explicit retry is new work bound to fresh authority');
 await repo.transaction(s=>{s.adultPilotSessions!.find(x=>x.id===fresh.adultSessionId)!.expiresAt=Date.now()-1;return true;});
 await assert.rejects(service.list(fresh),/FORBIDDEN/);
 await assert.rejects(service.retry(fresh,pending.jobId,'retry-with-expired-session'),/FORBIDDEN/);
});
async function workerFixture(){
 const f=await fixture();
 const adapter:AgentAdapter={kind:'metered-api',available:true,generate:async()=>{throw Error('NO_LIVE_PROVIDER_IN_TEST');}};
 const service=new JobService(f.repo,adapter,gate,{...options,allowMock:false,maxUnits:100,adultPilotMode:true});
 const dispatches:{id:string;attempt:number}[]=[];
 const dispatcher={dispatch:async(id:string,attempt:number)=>{dispatches.push({id,attempt});}};
 const coordinator=new ActionCoordinator(f.repo,dispatcher,approval,900000,false,true);
 const ack=await service.submit(f.adult,request('worker-auth-fixture'));
 await coordinator.enqueue(ack.jobId);
 return {...f,service,adapter,dispatches,dispatcher,coordinator,jobId:ack.jobId};
}
const invalidate=async(repo:MemoryRepository,adult:VerifiedSession,reason:'lock'|'expiry')=>
 repo.transaction(s=>{const grant=s.adultPilotSessions!.find(x=>x.id===adult.adultSessionId)!;
  if(reason==='lock')grant.revokedAt=Date.now();else grant.expiresAt=Date.now()-1;return true;});
async function assertNoPublication(repo:MemoryRepository,jobId:string){
 const state=await repo.snapshot(),job=state.jobs.find(j=>j.id===jobId)!;
 assert.equal(job.status,'failed');assert.equal(job.errorCode,'ADULT_PILOT_ACCESS_REQUIRED');
 assert.equal(state.revisions.length,0);assert.deepEqual(state.active,{});
 assert.equal(state.ledgers[familyId].reserved,0);
}
for(const reason of ['lock','expiry'] as const){
 for(const boundary of ['dispatch','generate claim','generate report','test claim','test report'] as const){
  test(`adult worker: ${reason} prevents ${boundary} and Ready publication`,async()=>{
   const {repo,adult,coordinator,dispatches,jobId}=await workerFixture();
   const gen=identity('generate'),tester=identity('test');
   if(boundary!=='dispatch')await coordinator.tick();
   if(!['dispatch','generate claim'].includes(boundary))await coordinator.claim(jobId,0,'generate',gen);
   if(['test claim','test report'].includes(boundary))await coordinator.report(jobId,0,'generate',gen,generated);
   if(boundary==='test report')await coordinator.claim(jobId,0,'test',tester);
   await invalidate(repo,adult,reason);
   if(boundary==='dispatch'){await coordinator.tick();assert.equal(dispatches.length,0);}
   else if(boundary==='generate claim'||boundary==='test claim'){
    await assert.rejects(coordinator.claim(jobId,0,boundary==='generate claim'?'generate':'test',
     boundary==='generate claim'?gen:tester),/ADULT_PILOT_ACCESS_REQUIRED/);
    await coordinator.tick();
   }else await coordinator.report(jobId,0,boundary==='generate report'?'generate':'test',
    boundary==='generate report'?gen:tester,boundary==='generate report'?generated:{ok:true,game:compiled});
   await assertNoPublication(repo,jobId);
  });
 }
}
test('adult worker: re-unlocking cannot revive the original job or its automatic repair',async()=>{
 const {repo,child,coordinator,jobId,adult,service}=await workerFixture();
 const gen=identity('generate'),tester=identity('test');
 await coordinator.claim(jobId,0,'generate',gen);
 await coordinator.report(jobId,0,'generate',gen,generated);
 await coordinator.claim(jobId,0,'test',tester);
 await coordinator.report(jobId,0,'test',tester,{ok:false,diagnostics:'GAMEPLAY_TEST_FAILED'});
 const fresh=await unlock(repo,child);assert.notEqual(fresh.adultSessionId,adult.adultSessionId);
 await assert.rejects(coordinator.claim(jobId,1,'generate',identity('generate','repair-run')),/ADULT_PILOT_ACCESS_REQUIRED/);
 await coordinator.tick();await assertNoPublication(repo,jobId);
 const retry=await service.retry(fresh,jobId,'explicit-after-reunlock');
 assert.equal((await repo.snapshot()).jobs.find(j=>j.id===retry.jobId)!.adultPilotSessionId,fresh.adultSessionId);
});
test('adult worker: a successful private worker publication retains its adult profile audience',async()=>{
 const {repo,adult,child,service,childService,coordinator,jobId}=await workerFixture();
 const gen=identity('generate'),tester=identity('test');
 await coordinator.claim(jobId,0,'generate',gen);
 await coordinator.report(jobId,0,'generate',gen,generated);
 await coordinator.claim(jobId,0,'test',tester);
 await coordinator.report(jobId,0,'test',tester,{ok:true,game:compiled});
 const status=await service.get(adult,jobId);assert.equal(status.status,'ready');assert.ok(status.revisionId);
 const revision=await service.revision(adult,status.revisionId);
 assert.equal(revision.adultPilotProfileId,adult.adultProfileId);
 await service.keep(adult,revision.id);
 assert.equal((await service.list(adult)).length,1);
 assert.deepEqual(await childService.list(child),[]);
 await assert.rejects(childService.revision(child,revision.id),/FORBIDDEN/);
 assert.equal((await repo.snapshot()).ledgers[familyId].used,1);
});
test('adult worker: an active replacement session cannot publish a result admitted by the old session',async()=>{
 const {repo,child,adult,service,coordinator,jobId}=await workerFixture();
 const gen=identity('generate'),tester=identity('test');
 await coordinator.claim(jobId,0,'generate',gen);
 await coordinator.report(jobId,0,'generate',gen,generated);
 await coordinator.claim(jobId,0,'test',tester);
 const fresh=await unlock(repo,child);
 assert.notEqual(fresh.adultSessionId,adult.adultSessionId);
 assert.equal((await service.readiness(fresh)).available,true,'the new adult session itself is authorized');
 await coordinator.report(jobId,0,'test',tester,{ok:true,game:compiled});
 await assertNoPublication(repo,jobId);
});
test('adult worker: disabling the feature denies old jobs at dispatch, claim and report',async()=>{
 for(const stage of ['dispatch','claim','report'] as const){
  const {repo,coordinator,dispatcher,jobId,adult}=await workerFixture();
  const gen=identity('generate');
  if(stage==='report')await coordinator.claim(jobId,0,'generate',gen);
  const disabled=new ActionCoordinator(repo,dispatcher,approval,900000,false,false);
  if(stage==='dispatch')await disabled.tick();
  else if(stage==='claim'){
   await assert.rejects(disabled.claim(jobId,0,'generate',gen),/ADULT_PILOT_ACCESS_REQUIRED/);
   await disabled.tick();
  }else await disabled.report(jobId,0,'generate',gen,generated);
  await assertNoPublication(repo,jobId);
  const modeOff=new JobService(repo,mock,gate,options);
  assert.equal((await modeOff.readiness(adult)).available,false);
  await assert.rejects(modeOff.submit(adult,request('disabled-submit')),/ADULT_PILOT_ACCESS_REQUIRED/);
  assert.equal((await repo.snapshot()).jobs.length,1);
 }
});
test('adult local runner: revocation during a provider call cannot publish; disabling denies old queued work',async()=>{
 const {repo,adult}=await fixture();
 const adapter:AgentAdapter={kind:'metered-api',available:true,generate:async()=>{
  await invalidate(repo,adult,'lock');
  return {candidate:{format:'declarative-v1',game:{kind:'star-catcher-v1',target:4,seconds:20}},usageUnits:1};
 }};
 const service=new JobService(repo,adapter,gate,{...options,maxUnits:100,adultPilotMode:true});
 const ack=await service.submit(adult,request('provider-revoked'));
 await service.run(ack.jobId);await assertNoPublication(repo,ack.jobId);
 const f=await fixture();let called=0;
 const otherAdapter:AgentAdapter={...adapter,generate:async()=>{called++;throw Error('MUST_NOT_RUN');}};
 const enabled=new JobService(f.repo,otherAdapter,gate,{...options,maxUnits:100,adultPilotMode:true});
 const queued=await enabled.submit(f.adult,request('queued-before-disable'));
 const disabled=new JobService(f.repo,otherAdapter,gate,{...options,maxUnits:100,adultPilotMode:false});
 await disabled.run(queued.jobId);await assertNoPublication(f.repo,queued.jobId);assert.equal(called,0);
});
