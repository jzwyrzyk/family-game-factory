import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer,request} from 'node:http';
import type {AddressInfo} from 'node:net';
import {betaFixture,fixtureKey} from './beta-fixture';
import {storageConsent,continuityRequest} from '../server/beta/continuity';
import {betaRouter} from '../server/beta/router';
import {defaultCapabilities,familyOrigin} from '../server/beta/model';
import {internalCookies,metadataSession} from '../server/beta/access';
import {cookieValue} from '../server/trusted-devices';
import {signSession,verifySession} from '../server/pipeline/auth';
import {ContinuityService,MemoryContinuityRepository} from '../server/storage/continuity';
import {FixtureDocuments,type AtomicStore,type Documents} from '../server/beta/documents';
import {storageDomains} from '../src/storage/sync-contract';
import {ContinuityPump,type SyncStore,type SyncTransport} from '../src/storage/synchronizer';
import type {RecordOperation,RecordReceipt,DurableRecord} from '../src/storage/record-contract';
import {reconcileFamilies} from '../server/beta/reconcile';

import {syncFixture} from './storage-sync-fixture';
test('enrollment, local capability and generation consent never authorize storage copies',async()=>{
 const x=await syncFixture();await assert.rejects(x.call('commit',{operation:x.operation()}),/DISABLED/);
 x.d.config.continuity={enabled:true,notice:'private-copies-test-v1',domains:['games','artwork','conversation']};
 await assert.rejects(storageConsent(x.d,x.a.id,x.cookies,fixtureKey,{notice:x.d.config.continuity.notice,profiles:[x.profile],domains:['games'],acknowledged:true}),/CONSENT_REQUIRED/);
 await assert.rejects(x.call('commit',{operation:x.operation()}),/CONSENT_REQUIRED/);
 assert.equal(await x.call('lookup',{operation:'op1'}).catch(()=>null),null);
});
test('operator permission and separate guardian domain grant bind profile, family and backup sources',async()=>{
 const x=await syncFixture();await x.activate();assert.equal((await x.call('commit',{operation:x.operation()}) as RecordReceipt).versions[0].version,1);
 const wrong=x.operation('wrong');wrong.scope.family=randomUUID();await assert.rejects(x.call('commit',{operation:wrong}),/DENIED/);
 const other=x.operation('other');other.changes[0].collection='learning-math';await assert.rejects(x.call('commit',{operation:other}),/DOMAIN_DENIED/);
 const backup=x.operation('backup');backup.changes[0].collection='recovery-chunks';await assert.rejects(x.call('commit',{operation:backup}),/DOMAIN_DENIED/);
 await assert.rejects(continuityRequest(x.d,x.a.id,x.a.cookies,fixtureKey,'/v1/storage/lookup',{profile:randomUUID(),operation:'op1'}),/CONSENT_REQUIRED/);
 const b=await x.enroll('sync-b');await assert.rejects(continuityRequest(x.d,b.id,x.a.cookies,fixtureKey,'/v1/storage/status',{profile:x.profile}),/UNAUTHENTICATED|PAUSED/);
});
test('narrow category grants cannot upload composite profile or game records',async()=>{
 const x=await syncFixture();await x.activate(['games','profiles']);
 const art=x.operation('nested-art',0,{originalImage:'data:image/png;base64,synthetic',conversation:[{text:'synthetic child'}]});
 await assert.rejects(x.call('commit',{operation:art}),/DOMAIN_DENIED/);
 const profile=x.operation('nested-learning',0,{learning:{attempts:['synthetic']},rewardOutbox:[{id:'synthetic'}]});profile.changes[0].collection='profiles';
 await assert.rejects(x.call('commit',{operation:profile}),/DOMAIN_DENIED/);
 assert.equal(await x.call('lookup',{operation:'nested-art'}),null);
});
test('withdrawal, operator category removal and current device revocation stop queued copies',async()=>{
 const x=await syncFixture();await x.activate();await x.call('commit',{operation:x.operation()});
 await storageConsent(x.d,x.a.id,x.cookies,fixtureKey,{notice:x.d.config.continuity!.notice,profiles:[],domains:[],acknowledged:true});
 await assert.rejects(x.call('commit',{operation:x.operation('queued',1)}),/CONSENT_REQUIRED/);
 await x.activate();await x.mutate('storage-domains',x.a.id,{domains:[]});await assert.rejects(x.call('read',{collection:'games',id:'game1',version:null}),/DOMAIN_DENIED/);
 await x.activate();await x.mutate('revoke-device',x.a.id,{deviceId:x.session.deviceId});await assert.rejects(x.call('commit',{operation:x.operation('stale',1)}),/UNAUTHENTICATED/);
});
test('guardian can withdraw stored copy consent while the feature is disabled',async()=>{
 const x=await syncFixture();await x.activate();x.d.config.continuity!.enabled=false;
 await storageConsent(x.d,x.a.id,x.cookies,fixtureKey,{notice:x.d.config.continuity!.notice,profiles:[],domains:[],acknowledged:true});
 x.d.config.continuity!.enabled=true;await assert.rejects(x.call('commit',{operation:x.operation()}),/CONSENT_REQUIRED/);
});
test('incremental feed preserves revisions, tombstones, idempotency and page boundaries',async()=>{
 const s=new ContinuityService(new MemoryContinuityRepository(),true),scope={family:'fixture',profile:'player1'};
 const op=(id:string,n:number,deleted=false):RecordOperation=>({id,scope,changes:[{id:'game',collection:'games',expectedVersion:n,value:deleted?null:{n},deleted}]});
 const first=await s.commit(scope,op('one',0));await s.commit(scope,op('two',1));await s.commit(scope,op('gone',2,true));
 assert.deepEqual(await s.commit(scope,op('one',0)),first);
 const a=await s.changes(scope,scope,'0',2);assert.equal(a.through,'2');assert.equal(a.hasMore,true);assert.deepEqual(a.records.map(r=>r.version),[1,2]);
 const b=await s.changes(scope,scope,a.through,2);assert.equal(b.through,'3');assert.equal(b.records[0].deleted,true);assert.equal(b.hasMore,false);
 assert.deepEqual((await s.changes(scope,scope,'3')).records,[]);await assert.rejects(s.changes(scope,scope,'4'),/CURSOR_INVALID/);await assert.rejects(s.changes(scope,scope,'0',101),/PAGE_INVALID/);
});
test('changed consent epoch rejects stale cursor, filtering disallowed content without disclosing values',async()=>{
 const x=await syncFixture();await x.activate(['games','artwork','conversation','learning']);await x.call('commit',{operation:x.operation()});
 const learning=x.operation('learning');learning.changes=[{id:'math1',collection:'learning-math',expectedVersion:0,value:{privateLearning:'synthetic'}}];await x.call('commit',{operation:learning});
 const old=await x.call('status',{}) as any;await x.activate(['games','artwork','conversation']);const current=await x.call('status',{}) as any;
 await assert.rejects(x.call('changes',{after:'0',limit:100,epoch:old.epoch}),/CONSENT_CHANGED/);
 const page=await x.call('changes',{after:'0',limit:100,epoch:current.epoch}) as any;
 assert.equal(page.through,'2');assert.equal(page.records.length,1);assert.equal(JSON.stringify(page).includes('privateLearning'),false);
});
test('operator category narrowing and restoration change epoch and replay previously filtered history',async()=>{
 const x=await syncFixture();await x.activate(['games','artwork','conversation','learning']);
 const learning=x.operation('learning');learning.changes=[{id:'math1',collection:'learning-math',expectedVersion:0,value:{attempt:'synthetic'}}];await x.call('commit',{operation:learning});
 await x.mutate('storage-domains',x.a.id,{domains:['games','artwork','conversation']});const narrowed=await x.call('status',{}) as any;
 const skipped=await x.call('changes',{after:'0',limit:100,epoch:narrowed.epoch}) as any;assert.equal(skipped.through,'1');assert.equal(skipped.records.length,0);
 await x.mutate('storage-domains',x.a.id,{domains:['games','artwork','conversation','learning']});const restored=await x.call('status',{}) as any;assert.notEqual(restored.epoch,narrowed.epoch);
 const page=await x.call('changes',{after:'0',limit:100,epoch:restored.epoch}) as any;assert.equal(page.records.length,1);
});
test('mounted HTTP route rejects wrong origin and emits conflict response; expiry rejects read',async()=>{
 const x=await syncFixture();await x.activate();const route=betaRouter(x.d,fixtureKey,{runtime:async()=>async()=>{throw Error('Must not hydrate runtime');}});
 const server=createServer((req,res)=>void route(req,res));await new Promise<void>(ok=>server.listen(0,'127.0.0.1',ok));const port=(server.address() as AddressInfo).port,host=new URL(familyOrigin(x.d.config,x.a.id)).host;
 const call=(operation:RecordOperation,origin='https://'+host)=>new Promise<{status:number;json:any}>((ok,fail)=>{const req=request({host:'127.0.0.1',port,path:'/v1/storage/commit',method:'POST',headers:{Host:host,Origin:origin,Cookie:x.a.cookies,'Content-Type':'application/json','X-Factory-Request':'1'}},res=>{const chunks:Buffer[]=[];res.on('data',b=>chunks.push(b));res.on('end',()=>ok({status:res.statusCode!,json:JSON.parse(Buffer.concat(chunks).toString())}));});req.on('error',fail);req.end(JSON.stringify({profile:x.profile,operation}));});
 try{assert.equal((await call(x.operation(),'https://different.invalid')).status,403);assert.equal((await call(x.operation())).status,200);const conflict=await call(x.operation('stale'));assert.equal(conflict.status,409);assert.equal(conflict.json.errorCode,'STORAGE_CONFLICT');
  await assert.rejects(continuityRequest(x.d,x.a.id,x.a.cookies,fixtureKey,'/v1/storage/status',{profile:x.profile},Date.now()+2*86400000),/UNAUTHENTICATED/);
 }finally{server.closeAllConnections();await new Promise<void>(ok=>server.close(()=>ok()));}
});
test('entry and operator metadata reads do not hydrate saved-game artifact chunks',async()=>{
 const base=new FixtureDocuments(),paths:string[]=[];
 const store:AtomicStore={run:(fn,readonly)=>base.run(tx=>fn({...tx,get:async<T>(path:string)=>{paths.push(path);return tx.get<T>(path);}}))};
 const x=await syncFixture(store);paths.length=0;
 await x.d.withFamily(x.a.id,async(tx,f)=>metadataSession(x.d,tx,f,x.a.cookies,fixtureKey));
 const auth=[...paths];assert.equal(auth.some(p=>p.startsWith('factoryWorkspaces/')),false);assert.equal(auth.length,3);
 paths.length=0;await x.admin.view('test-owner',x.a.id);assert.equal(paths.some(p=>p.startsWith('factoryWorkspaces/')),false);assert.ok(paths.some(p=>p.endsWith('/metadata/administration')));
});
test('scheduler runs at most four families, attempts every family and reports any failure',async()=>{
 let active=0,max=0;const visited:string[]=[];
 await assert.rejects(reconcileFamilies(Array.from({length:12},(_,i)=>String(i)),async id=>{visited.push(id);active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,2));active--;if(id==='4')throw Error('synthetic outage');}),/INCOMPLETE/);
 assert.equal(max,4);assert.equal(visited.length,12);await assert.rejects(reconcileFamilies(['same','same'],async()=>{}),/CAPACITY/);
});

function pumpFixture(){
 const scope={family:'fixture',profile:'player1'},service=new ContinuityService(new MemoryContinuityRepository(),true),queue:RecordOperation[]=[],rows:DurableRecord[]=[];let cursor='',epoch='epoch-one';
 const store:SyncStore={pending:async n=>structuredClone(queue.slice(0,n)),acknowledge:async r=>{const i=queue.findIndex(o=>o.id===r.operation);queue.splice(i,1);},acceptRemote:async r=>{rows.push(...r);},getSyncCursor:async()=>cursor,setSyncCursor:async(expected,next)=>{assert.equal(cursor,expected);cursor=next;}};
 const remote:SyncTransport={status:async()=>({version:1,epoch,domains:['games','artwork','conversation']}),lookup:id=>service.lookup(scope,scope,id),commit:op=>service.commit(scope,op),read:(c,id)=>service.read(scope,scope,c,id),changes:(after,limit)=>service.changes(scope,scope,after,limit)};
 const pump=()=>new ContinuityPump(store,remote,scope,()=>{},async(_,fn)=>fn());
 const op=(id:string,n=0):RecordOperation=>({id,scope,changes:[{collection:'games',id:'game',expectedVersion:n,value:{n}}]});
 return {scope,service,queue,rows,store,remote,pump,op,epoch:(value:string)=>{epoch=value;},cursor:()=>cursor};
}
test('outbox follows commit order across pages and preserves all downloaded versions',async()=>{
 const x=pumpFixture();x.queue.push(x.op('z-first'),x.op('a-second',1));
 assert.equal((await x.pump().runOnce(1)).state,'pending');assert.equal(x.rows.length,0);
 const done=await x.pump().runOnce();assert.equal(done.state,'current');assert.equal(x.queue.length,0);assert.deepEqual(x.rows.map(r=>r.version),[1,2]);
});
test('lost metadata acknowledgment is reconciled without replay; offline queue survives',async()=>{
 const x=pumpFixture(),commit=x.remote.commit;let writes=0;x.queue.push(x.op('accepted'));x.remote.commit=async op=>{writes++;await commit(op);throw Error('network response interrupted');};
 assert.equal((await x.pump().runOnce()).state,'offline');assert.equal(x.queue.length,1);assert.equal(writes,1);
 assert.equal((await x.pump().runOnce()).state,'current');assert.equal(x.queue.length,0);assert.equal(writes,1);
});
test('meaningful conflict returns both versions, preserves queue and never advances cursor',async()=>{
 const x=pumpFixture();await x.service.commit(x.scope,{...x.op('other'),changes:[{...x.op('other').changes[0],value:{title:'Other device'}}]});x.queue.push(x.op('local'));
 const result=await x.pump().runOnce();assert.equal(result.state,'conflict');if(result.state==='conflict')assert.deepEqual(result.remote[0]!.value,{title:'Other device'});
 assert.equal(x.queue.length,1);assert.equal(x.rows.length,0);assert.equal(x.cursor(),'');
});
test('changed consent replays authorized history and invalid remote receipts keep local work',async()=>{
 const x=pumpFixture();await x.service.commit(x.scope,x.op('first'));await x.pump().runOnce();assert.equal(x.rows.length,1);x.epoch('epoch-two');await x.pump().runOnce();assert.equal(x.rows.length,2);
 x.queue.push(x.op('next',1));x.remote.lookup=async()=>({operation:'next',fingerprint:'bad',versions:[]});assert.equal((await x.pump().runOnce()).state,'blocked');assert.equal(x.queue.length,1);
});
