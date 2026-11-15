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
test('spending is disabled by default, reserved atomically, cut off under concurrent jobs and parent-controlled',async()=>{
 const adapter:AgentAdapter={available:true,kind:'metered-api',async generate(){return {candidate:{format:'declarative-v1',game:{kind:'star-catcher-v1',target:3,seconds:10}},usageUnits:2}}};
 const repo=new MemoryRepository(),service=new JobService(repo,adapter,gate,{allowMock:false,maxUnits:5,timeoutMs:1000,maxRetries:2});
 await assert.rejects(service.submit(session,request),/SPENDING_CUTOFF/);await assert.rejects(service.setAllowance({...session,role:'designer'},5,true),/FORBIDDEN/);await service.setAllowance(session,5,true);
 const first=await service.submit(session,request);await assert.rejects(service.submit(session,{...request,clientRequestId:'request-456'}),/SPENDING_CUTOFF/);await service.run(first.jobId);
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
