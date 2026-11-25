import {test} from 'node:test';import assert from 'node:assert/strict';
import {ContinuityService,MemoryContinuityRepository,type ContinuityRepository} from '../server/storage/continuity';import {RecoveryPoints} from '../server/storage/recovery-points';
const scope={family:'family1',profile:'player1'},sources={workspace:'🙂 original bytes'.repeat(4000),notebook:'Exact child words\nwith quotes "',missing:null,empty:''};
test('recovery point returns exact Unicode/null/empty originals and is private to its profile',async()=>{
 const service=new ContinuityService(new MemoryContinuityRepository(),true),points=new RecoveryPoints(service);await points.prepare(scope,scope,'backup1',sources);assert.deepEqual(await points.read(scope,scope,'backup1'),sources);
 await points.prepare(scope,scope,'backup1',sources);assert.deepEqual(await points.read(scope,scope,'backup1'),sources);
 await assert.rejects(points.read({...scope,profile:'player2'},scope,'backup1'),/DENIED/);
});
test('interrupted backup is never published; same-plan restart completes without replacing chunks',async()=>{
 const memory=new MemoryContinuityRepository();let operations=0,failAt=2;const repo:ContinuityRepository={transaction:fn=>{if(++operations===failAt)return Promise.reject(Error('network lost'));return memory.transaction(fn);}};
 const service=new ContinuityService(repo,true),points=new RecoveryPoints(service);await assert.rejects(points.prepare(scope,scope,'backup1',sources));assert.equal(await service.read(scope,scope,'recovery-points','backup1'),null);
 failAt=Infinity;await points.prepare(scope,scope,'backup1',sources);assert.deepEqual(await points.read(scope,scope,'backup1'),sources);
 await assert.rejects(points.prepare(scope,scope,'backup1',{...sources,notebook:'Changed source'}));assert.deepEqual(await points.read(scope,scope,'backup1'),sources);
});
test('missing or corrupted chunk prevents restore and never fabricates empty state',async()=>{
 const service=new ContinuityService(new MemoryContinuityRepository(),true),points=new RecoveryPoints(service);await points.prepare(scope,scope,'backup1',sources);
 await service.commit(scope,{id:'corrupt-fixture',scope,changes:[{collection:'recovery-chunks',id:'backup1-2-0',expectedVersion:1,value:{text:'changed'}}]});
 await assert.rejects(points.read(scope,scope,'backup1'),/INTEGRITY/);
});
