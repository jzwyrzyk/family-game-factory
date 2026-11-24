import {test} from 'node:test';import assert from 'node:assert/strict';
import {ContinuityService,MemoryContinuityRepository} from '../server/storage/continuity';
import {operationFingerprint,type RecordOperation} from '../src/storage/record-contract';
const scope={family:'family-one',profile:'player1'};
const op=(id='op1',expectedVersion=0,value:unknown={title:'Original'}):RecordOperation=>({id,scope,changes:[{id:'game1',collection:'games',expectedVersion,value}]});
test('new continuity is disabled; unauthorized profile and family cannot read or mutate',async()=>{
 const repo=new MemoryContinuityRepository(),disabled=new ContinuityService(repo);await assert.rejects(disabled.commit(scope,op()),/DISABLED/);
 const service=new ContinuityService(repo,true);for(const actor of [{...scope,family:'another'},{...scope,profile:'player2'}]){await assert.rejects(service.commit(actor,op()),/DENIED/);await assert.rejects(service.read(actor,scope,'games','game1'),/DENIED/);await assert.rejects(service.lookup(actor,scope,'op1'),/DENIED/);}
});
test('lost acknowledgment resolves by receipt; duplicate operation commits once and rejects changed payload',async()=>{
 const s=new ContinuityService(new MemoryContinuityRepository(),true),receipt=await s.commit(scope,op());
 assert.deepEqual(await s.lookup(scope,scope,'op1'),receipt);assert.deepEqual(await s.commit(scope,op()),receipt);
 await assert.rejects(s.commit(scope,op('op1',0,{changed:true})),/REUSED/);assert.equal((await s.read(scope,scope,'games','game1'))!.version,1);
});
test('tablet B cannot overwrite tablet A newer work; both histories remain readable after resolution',async()=>{
 const s=new ContinuityService(new MemoryContinuityRepository(),true);await s.commit(scope,op());
 await s.commit(scope,op('deviceA',1,{title:'New A'}));await assert.rejects(s.commit(scope,op('deviceB',1,{title:'Offline B'})),/CONFLICT/);
 assert.deepEqual((await s.read(scope,scope,'games','game1'))!.value,{title:'New A'});assert.deepEqual((await s.read(scope,scope,'games','game1',1))!.value,{title:'Original'});
 await s.commit(scope,{id:'keep-both',scope,changes:[{id:'gameB',collection:'games',expectedVersion:0,value:{title:'Offline B'}}]});assert.ok(await s.read(scope,scope,'games','gameB'));
});
test('partial conflict writes no other records or receipt; simultaneous stale writers have one winner',async()=>{
 const s=new ContinuityService(new MemoryContinuityRepository(),true);await s.commit(scope,op());
 await assert.rejects(s.commit(scope,{id:'partial',scope,changes:[{id:'new',collection:'games',expectedVersion:0,value:1},...op().changes]}),/CONFLICT/);assert.equal(await s.read(scope,scope,'games','new'),null);assert.equal(await s.lookup(scope,scope,'partial'),null);
 const results=await Promise.allSettled([s.commit(scope,op('a',1,1)),s.commit(scope,op('b',1,2))]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
});
test('soft deletion is versioned, cannot resurrect through stale writes, and retains exact restore data',async()=>{
 const s=new ContinuityService(new MemoryContinuityRepository(),true);await s.commit(scope,op());await s.commit(scope,{...op('delete',1,null),changes:[{...op('delete',1,null).changes[0],deleted:true}]});
 assert.equal((await s.read(scope,scope,'games','game1'))!.deleted,true);await assert.rejects(s.commit(scope,op('stale',1)),/CONFLICT/);
 const original=await s.read(scope,scope,'games','game1',1);await s.commit(scope,op('restore',2,original!.value));assert.deepEqual((await s.read(scope,scope,'games','game1'))!.value,original!.value);
});
test('canonical retry hashes agree; non-JSON and oversized values fail before mutation',async()=>{
 assert.equal(await operationFingerprint(op('same',0,{a:1,b:2})),await operationFingerprint(op('same',0,{b:2,a:1})));
 for(const value of [NaN,undefined,new Date(),'x'.repeat(270000)])await assert.rejects(operationFingerprint({...op('bad'),changes:[{...op('bad').changes[0],value}]}));
});
