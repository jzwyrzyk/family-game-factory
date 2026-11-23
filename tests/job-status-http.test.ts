import assert from 'node:assert/strict';
import {test} from 'node:test';
import {setImmediate} from 'node:timers/promises';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {apiHandler} from '../server/pipeline/http';
import {JobService} from '../server/pipeline/service';
import {MemoryRepository} from '../server/pipeline/repository';
import {signSession} from '../server/pipeline/auth';

const origin='https://studio.test',key='synthetic-status-fixture-signing-key-with-sufficient-length';
const actor={subject:'fixture-parent',familyId:'fixture-family',role:'parent' as const,expiresAt:Date.now()+600000};
function request(jobId:string,familyId=actor.familyId){
 return {url:'/v1/jobs/'+jobId,method:'GET',headers:{origin,cookie:'factory_session='+signSession({...actor,familyId},key)}} as IncomingMessage;
}
function response(){
 const result={status:0,body:''};
 return {result,http:{setHeader(){},writeHead(status:number){result.status=status;},end(body:string){result.body=body;}} as unknown as ServerResponse};
}

test('job HTTP reads return durable state once while unrelated dispatch is stalled',{timeout:5000},async()=>{
 const repo=new MemoryRepository();
 await repo.transaction(state=>{
  const base={gameId:'new' as const,baseRevisionId:null,prompt:'Synthetic idea',familyId:actor.familyId,
   adapter:'mock' as const,maxUnits:0,usedUnits:0,retryCount:0};
  state.jobs=[{...base,id:'ready-job',clientRequestId:'ready-request',status:'ready',revisionId:'ready-revision'},
   {...base,id:'queued-job',clientRequestId:'queued-request',status:'queued'}];return true;
 });
 const service=new JobService(repo,{kind:'metered-api',available:false,generate:async()=>{throw Error('must not generate');}},{test:async()=>{}});
 let reads=0,polls=0,release!:()=>void,pollStarted!:()=>void;
 const get=service.get.bind(service);service.get=async(...args)=>{reads++;return get(...args);};
 const blocked=new Promise<void>(resolve=>{release=resolve;});
 const started=new Promise<void>(resolve=>{pollStarted=resolve;});
 const handler=apiHandler(service,{appOrigin:origin,sessionKey:key,previewKey:key,previewOrigin:'https://preview.test',
  poll:async()=>{polls++;pollStarted();if(polls===1){await blocked;throw Error('synthetic GitHub outage');}}});
 const before=await repo.snapshot(),pending:Promise<unknown>[]=[];
 try{
  const queued=response();pending.push(handler(request('queued-job'),queued.http));
  await setImmediate();
  assert.equal(queued.result.status,200,'active status must not await background dispatch');
  await started;
  assert.equal(polls,1);assert.equal(reads,1);
  const ready=response();pending.push(handler(request('ready-job'),ready.http));
  await setImmediate();
  assert.equal(ready.result.status,200,'completed status must remain readable during unrelated dispatch');
  assert.equal(JSON.parse(ready.result.body).revisionId,'ready-revision');assert.equal(reads,2);
  const more=Array.from({length:4},()=>response());
  for(const item of more)pending.push(handler(request('queued-job'),item.http));
  await setImmediate();assert.ok(more.every(item=>item.result.status===200));
  assert.equal(polls,1,'concurrent readers coalesce the optional fallback');
  assert.equal(reads,6,'each HTTP status request reads durable job state once');
  const denied=response();await handler(request('ready-job','different-family'),denied.http);
  assert.equal(denied.result.status,403);assert.equal(polls,1,'denied reads cannot wake dispatch');
  assert.deepEqual(await repo.snapshot(),before,'status reads themselves do not mutate jobs');
 }finally{release();await Promise.all(pending);await setImmediate();}
 const ready=response();await handler(request('ready-job'),ready.http);await setImmediate();
 assert.equal(polls,1,'terminal status never starts a new fallback');
 const queued=response();await handler(request('queued-job'),queued.http);await setImmediate();
 assert.equal(queued.result.status,200);assert.equal(polls,2,'a failed fallback releases the single-flight guard');
});
