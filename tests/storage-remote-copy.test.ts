import {test} from 'node:test';import assert from 'node:assert/strict';
import {MemoryRepository} from '../server/pipeline/repository';import {JobService} from '../server/pipeline/service';import {MockAgent} from '../server/testing/mock-agent';import {defaults} from '../src/runtime/manifests';
const session={subject:'synthetic',familyId:'family-a',role:'parent' as const,expiresAt:Date.now()+60000};
test('remote copy receipt survives lost acknowledgment without another mutation and rejects reused payload',async()=>{
 const repo=new MemoryRepository(),service=new JobService(repo,new MockAgent(),{test:async()=>{}},{allowMock:true,maxUnits:1,timeoutMs:1000,maxRetries:1});
 const original=await service.registerBase(session,{gameId:'buckets',localRevisionId:'local-one',config:defaults('buckets')});
 await repo.transaction(state=>{state.revisions.find(r=>r.id===original.revisionId)!.game={kind:'star-catcher-v1',target:5,seconds:15};return true;});
 const first=await service.fork(session,original.revisionId,'My copy','request-one');assert.deepEqual(await service.forkReceipt(session,original.revisionId,'request-one'),first);
 const count=(await repo.snapshot()).revisions.length;assert.deepEqual(await service.fork(session,original.revisionId,'My copy','request-one'),first);assert.equal((await repo.snapshot()).revisions.length,count);
 await assert.rejects(service.fork(session,original.revisionId,'Different name','request-one'),/CONFLICT/);
 await assert.rejects(service.forkReceipt({...session,familyId:'another-family'},original.revisionId,'request-one'));
 assert.equal(await service.forkReceipt(session,original.revisionId,'unknown'),null);assert.equal((await repo.snapshot()).revisions.length,count);
 const nested=await service.fork(session,first.revisionId,'Nested legacy');assert.equal((await service.revision(session,nested.revisionId)).copyRequestId,undefined);
});
