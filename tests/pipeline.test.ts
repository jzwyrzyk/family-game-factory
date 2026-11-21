import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { signSession,verifySession } from '../server/pipeline/auth';
import { MemoryRepository,FileRepository } from '../server/pipeline/repository';
import { JobService,validateBuildRequest } from '../server/pipeline/service';
import { validateArtifact,renderPreview } from '../server/pipeline/artifacts';
import { MockAgent } from '../server/testing/mock-agent';
import type { AgentAdapter } from '../server/pipeline/types';
import type { VerifiedSession } from '../server/contracts/api';
import { defaults, manifests } from '../src/runtime/manifests';
import type { GameId } from '../src/runtime/types';
import {stickerLaunchFixture} from '../server/testing/working-game-fixtures';
import {syntheticQualityReview} from '../server/testing/presentation-quality-fixtures';
import {productionFixture,testedPipelineFixture} from './quality-pipeline-fixtures';
const session:VerifiedSession={subject:'designer-a',familyId:'family-a',role:'parent',expiresAt:Date.now()+60000};
const request={gameId:'new',baseRevisionId:null,prompt:'Catch five stars',clientRequestId:'request-123'};
const gate={test:async()=>{}}; // Unit fake; browser suite supplies an actual isolated browser smoke gate.
test('session verification rejects tampering, expiration and missing authentication',()=>{
 const key='unit-only-signing-key-that-is-not-a-real-credential';const token=signSession(session,key);assert.deepEqual(verifySession(token,key),session);assert.throws(()=>verifySession(token+'x',key));assert.throws(()=>verifySession(token,key,Date.now()+100000));assert.throws(()=>verifySession(undefined,key));
});
test('job submissions are idempotent, family-scoped and reject private/unknown inputs',async()=>{
 const repository=new MemoryRepository(),service=new JobService(repository,new MockAgent(),gate,{allowMock:true,maxUnits:1,timeoutMs:1000,maxRetries:2});
 const [a,b]=await Promise.all([service.submit(session,request),service.submit(session,request)]);assert.equal(a.jobId,b.jobId);assert.equal((await repository.snapshot()).jobs.length,1);
 await assert.rejects(service.submit(session,{...request,prompt:'Catch six stars'}),/CONFLICT/);await assert.rejects(service.get({...session,familyId:'other'},a.jobId),/Forbidden/);
 assert.throws(()=>validateBuildRequest({...request,secret:'no'}));assert.throws(()=>validateBuildRequest({...request,gameId:'unknown-game'}));assert.throws(()=>validateBuildRequest({...request,prompt:'email me at child@example.org'}),/PRIVATE/);
 const denied=new JobService(new MemoryRepository(),new MockAgent(),gate);await assert.rejects(denied.submit(session,request),/UNAVAILABLE/);
});
test('every reviewed native game can seed a family-scoped builder request, including the hill ride',async()=>{
 const repo=new MemoryRepository(),service=new JobService(repo,new MockAgent(),gate,{allowMock:true,maxUnits:0,timeoutMs:1000,maxRetries:1});
 for(const gameId of Object.keys(manifests) as GameId[]){
  const config=defaults(gameId),base=await service.registerBase(session,{gameId,localRevisionId:'native-'+gameId,config});
  const submission={gameId,baseRevisionId:base.revisionId,prompt:'Add a new physical obstacle to my game',clientRequestId:'change-'+gameId};
  const ack=await service.submit(session,submission);assert.equal(ack.status,'queued');
  const revision=(await repo.snapshot()).revisions.find(r=>r.id===base.revisionId)!;assert.equal(revision.sourceGame,gameId);assert.deepEqual(revision.config,config);
  await assert.rejects(service.submit({...session,familyId:'other-family'},submission),/Forbidden/);
 }
 for(const gameId of ['unknown-game','constructor','__proto__'])assert.throws(()=>validateBuildRequest({...request,gameId}),/INVALID_REQUEST/);
 assert.equal((await repo.snapshot()).jobs.length,Object.keys(manifests).length);
});
test('spending is disabled by default, reserved atomically, cut off under concurrent jobs and parent-controlled',async()=>{
 // Synthetic full-policy fixture: this tests metering, not model or visual quality.
 const spendingRequest={...request,prompt:'Attach stickers to a rocket and launch it.'},game=productionFixture(stickerLaunchFixture,spendingRequest.prompt);
 const adapter:AgentAdapter={available:true,kind:'metered-api',async generate(){return {candidate:{format:'generated-source-v1',game},usageUnits:1}},async review(_input,compiled,evidence){return {review:syntheticQualityReview(compiled,evidence),usageUnits:1};}};
 const repo=new MemoryRepository(),service=new JobService(repo,adapter,{test:async()=>testedPipelineFixture(game)},{allowMock:false,maxUnits:5,timeoutMs:1000,maxRetries:2});
 await assert.rejects(service.submit(session,spendingRequest),/SPENDING_CUTOFF/);await assert.rejects(service.setAllowance({...session,role:'designer'},5,true),/FORBIDDEN/);await service.setAllowance(session,5,true);
 const first=await service.submit(session,spendingRequest);await assert.rejects(service.submit(session,{...spendingRequest,clientRequestId:'request-456'}),/SPENDING_CUTOFF/);await service.run(first.jobId);
 const ledger=(await repo.snapshot()).ledgers[session.familyId];assert.equal(ledger.used,2);assert.equal(ledger.reserved,0);assert.equal((await service.get(session,first.jobId)).status,'ready');
});
test('cancellation is terminal, failed validation never replaces kept content, retry policy is bounded',async()=>{
 const repo=new MemoryRepository(),service=new JobService(repo,new MockAgent(),gate,{allowMock:true,maxUnits:0,timeoutMs:1000,maxRetries:1});
 const initial=await service.submit(session,request);await service.run(initial.jobId);const ready=await service.get(session,initial.jobId);await service.keep(session,ready.revisionId!);const before=(await service.list(session))[0].id;
 const cancelled=await service.submit(session,{...request,clientRequestId:'cancel-123'});await service.cancel(session,cancelled.jobId);await service.run(cancelled.jobId);assert.equal((await service.get(session,cancelled.jobId)).status,'cancelled');
 const bad=await service.submit(session,{...request,prompt:'Build a new car game',clientRequestId:'failed-123'});await service.run(bad.jobId);assert.equal((await service.get(session,bad.jobId)).status,'failed');assert.equal((await service.list(session))[0].id,before);
 const retry=await service.submit(session,{...request,prompt:'Build a new car game',clientRequestId:'retry-123',retryOf:bad.jobId});await service.run(retry.jobId);await assert.rejects(service.submit(session,{...request,prompt:'Build a new car game',clientRequestId:'retry-456',retryOf:retry.jobId}),/RETRY_LIMIT/);
 const states=(await repo.snapshot()).audit.filter(x=>x.jobId===initial.jobId).map(x=>x.status);assert.deepEqual(states,['queued','building','testing','ready']);
});
test('lost retry acknowledgement and concurrent explicit retries recover one durable successor and one reservation',async()=>{
 // No provider is called. A synthetic metered failure exercises the real
 // reservation, retry transaction and restart/read contracts.
 const adapter:AgentAdapter={available:true,kind:'metered-api',async generate(){throw Error('SYNTHETIC_FAILURE');}};
 const repo=new MemoryRepository(),options={allowMock:false,maxUnits:5,timeoutMs:1000,maxRetries:2};
 const service=new JobService(repo,adapter,gate,options),input={...request,prompt:'Attach stickers to a rocket and launch it.'};
 await service.setAllowance(session,100,true);
 const original=await service.submit(session,input);await service.run(original.jobId);
 assert.equal((await service.get(session,original.jobId)).status,'failed');
 const [first,repeated]=await Promise.all([
  service.retry(session,original.jobId,'first-retry-lost-response'),
  service.retry(session,original.jobId,'concurrent-retry-new-client-id')
 ]);
 assert.equal(first.jobId,repeated.jobId,'different request IDs cannot create sibling retry jobs');
 let state=await repo.snapshot();assert.equal(state.jobs.length,2);
 assert.deepEqual({used:state.ledgers[session.familyId].used,reserved:state.ledgers[session.familyId].reserved},{used:5,reserved:5});
 assert.equal(state.audit.filter(event=>event.status==='queued').length,2,'only one new reservation and queued event');

 const restarted=new JobService(repo,adapter,gate,options),beforeRead=await repo.snapshot();
 assert.equal((await restarted.get(session,original.jobId)).retryJobId,first.jobId,'a fresh browser can discover the accepted retry by reading its saved original job');
 assert.deepEqual(await repo.snapshot(),beforeRead,'recovery lookup is read-only');
 assert.equal((await restarted.retry(session,original.jobId,'after-reload-new-client-id')).jobId,first.jobId);
 assert.deepEqual(await repo.snapshot(),beforeRead,'an explicit duplicate retry does not reserve or enqueue again');
 await assert.rejects(restarted.submit(session,{...input,retryOf:original.jobId,clientRequestId:input.clientRequestId}),/IDEMPOTENCY_CONFLICT/,'an existing submission key cannot be reassigned to a retry');
 await assert.rejects(restarted.submit(session,{...input,prompt:'Attach a different sticker and launch it.',retryOf:original.jobId,clientRequestId:'changed-retry-intent'}),/RETRY_LIMIT/);

 await restarted.run(first.jobId);assert.equal((await restarted.get(session,first.jobId)).status,'failed');
 assert.equal((await restarted.retry(session,original.jobId,'recover-failed-successor')).jobId,first.jobId,'a failed successor requires a new explicit decision; recovery never retries it recursively');
 const second=await restarted.retry(session,first.jobId,'explicit-second-retry');await restarted.run(second.jobId);
 assert.equal((await restarted.get(session,first.jobId)).retryJobId,second.jobId);
 await assert.rejects(restarted.retry(session,second.jobId,'beyond-retry-limit'),/RETRY_LIMIT/);
 state=await repo.snapshot();assert.equal(state.jobs.length,3);
 assert.deepEqual(state.jobs.map(job=>job.retryCount),[0,1,2]);
 assert.equal(state.ledgers[session.familyId].used,15);assert.equal(state.ledgers[session.familyId].reserved,0);
 await assert.rejects(restarted.get({...session,familyId:'other-family'},original.jobId),/Forbidden/);
 await assert.rejects(restarted.retry({...session,familyId:'other-family'},original.jobId,'foreign-recovery'),/Forbidden/);
});
test('ambiguous legacy retry siblings stop recovery without another reservation or job mutation',async()=>{
 const adapter:AgentAdapter={available:true,kind:'metered-api',async generate(){throw Error('SYNTHETIC_FAILURE');}};
 const repo=new MemoryRepository(),service=new JobService(repo,adapter,gate,{allowMock:false,maxUnits:5,timeoutMs:1000,maxRetries:2});
 await service.setAllowance(session,100,true);
 const original=await service.submit(session,{...request,prompt:'Attach stickers to a rocket and launch it.'});await service.run(original.jobId);
 const accepted=await service.retry(session,original.jobId,'legacy-first-retry');
 await repo.transaction(state=>{
  const first=state.jobs.find(job=>job.id===accepted.jobId)!;
  state.jobs.push({...first,id:'legacy-second-retry',clientRequestId:'legacy-second-key'});
  state.ledgers[session.familyId].reserved+=first.maxUnits;
  state.audit.push({jobId:'legacy-second-retry',familyId:session.familyId,status:'queued',at:new Date().toISOString()});
  return true;
 });
 const before=await repo.snapshot();
 await assert.rejects(service.get(session,original.jobId),/IDEMPOTENCY_CONFLICT/,'status recovery must not pick one of two accepted siblings');
 await assert.rejects(service.retry(session,original.jobId,'new-key-after-unknown-ack'),/IDEMPOTENCY_CONFLICT/);
 assert.deepEqual(await repo.snapshot(),before,'conflict leaves every accepted job and all accounting unchanged');
 assert.equal((await service.get(session,accepted.jobId)).jobId,accepted.jobId,'an exact known child ID remains readable');
});
test('durable queue survives reopening; immutable revisions and kept pointers survive restart',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'factory-job-test-'));try{
 const file=join(directory,'jobs.json'),first=await FileRepository.open(file),service=new JobService(first,new MockAgent(),gate,{allowMock:true,maxUnits:0,timeoutMs:1000,maxRetries:1});const ack=await service.submit(session,request);
 const second=await FileRepository.open(file),restarted=new JobService(second,new MockAgent(),gate,{allowMock:true,maxUnits:0,timeoutMs:1000,maxRetries:1});assert.deepEqual(await restarted.recover(),[ack.jobId]);await restarted.run(ack.jobId);const job=await restarted.get(session,ack.jobId);await restarted.keep(session,job.revisionId!);const third=await FileRepository.open(file);assert.equal((await third.snapshot()).revisions.length,1);assert.equal(Object.values((await third.snapshot()).active)[0],job.revisionId);
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('unknown executable artifacts fail validation; compiled preview uses strict CSP and no credential or network access',()=>{
 for(const artifact of [{format:'javascript',script:'evil'},{format:'declarative-v1',game:{kind:'star-catcher-v1',target:4,seconds:10,script:'evil'}},{format:'declarative-v1',game:{kind:'star-catcher-v1',target:999,seconds:10}}])assert.throws(()=>validateArtifact(artifact));
 const artifact=renderPreview({kind:'star-catcher-v1',target:4,seconds:10},'artifact-1','channel-123');assert.match(artifact.csp,/default-src 'none'/);assert.match(artifact.csp,/connect-src 'none'/);assert.match(artifact.csp,/script-src 'sha256-/);assert.doesNotMatch(artifact.html,/localStorage|document.cookie|fetch\(/);
});
test('timeouts fail closed and record an audit event instead of replacing active revision',async()=>{
 const adapter:AgentAdapter={available:true,kind:'mock',generate:()=>new Promise(()=>{})};const repo=new MemoryRepository(),service=new JobService(repo,adapter,gate,{allowMock:true,maxUnits:0,timeoutMs:20,maxRetries:1});const ack=await service.submit(session,request);await service.run(ack.jobId);assert.equal((await service.get(session,ack.jobId)).errorCode,'BUILD_TIMEOUT');assert.equal((await service.list(session)).length,0);
});
