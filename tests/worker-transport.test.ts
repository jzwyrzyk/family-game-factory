import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createServer} from 'node:http';
import {ActionCoordinator} from '../server/actions/coordinator';
import {workerHandler} from '../server/actions/http';
import {MemoryRepository} from '../server/pipeline/repository';
import {WorkerGateway,WorkerTransportError,coordinateWorkerStage,startWorkerHeartbeat,type WorkerStatus} from '../server/actions/worker-transport';

const options={gateway:'https://gateway.example',jobId:'synthetic-job',attempt:0,stage:'generate' as const,
 oidcEndpoint:'https://fixture.actions.githubusercontent.com/token',oidcCredential:'synthetic-oidc-credential'};
const json=(value:unknown)=>new Response(JSON.stringify(value));
const token=()=>json({value:'synthetic.payload.signature'});
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};

test('a stalled OIDC/claim request has a deadline, aborts transport, and never executes or reclaims',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 let calls=0,executions=0,signal:AbortSignal|undefined;
 const gateway=new WorkerGateway(options,(async(_url,init)=>{calls++;signal=init!.signal as AbortSignal;return new Promise(()=>{});}) as typeof fetch);
 const failed=assert.rejects(coordinateWorkerStage(gateway,async()=>{executions++;return {};}),/WORKER_TRANSPORT_TIMEOUT/);
 await flush();t.mock.timers.tick(15000);await failed;
 assert.equal(calls,1);assert.equal(executions,0);assert.equal(signal?.aborted,true);
});

test('the same deadline covers a stalled gateway response body and cancels its reader',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 let calls=0,cancelled=false;
 const gateway=new WorkerGateway(options,(async()=>{
  calls++;return calls===1?token():new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('{"task":'));},cancel(){cancelled=true;}}));
 }) as typeof fetch);
 const failed=assert.rejects(gateway.claim(),/WORKER_TRANSPORT_TIMEOUT/);
 await flush();assert.equal(calls,2);t.mock.timers.tick(15000);await failed;assert.equal(cancelled,true);
});

test('status counts actual streamed bytes and rejects oversized or invalid OIDC data before trusting it',async()=>{
 let cancelled=false,calls=0;
 const gateway=new WorkerGateway(options,(async()=>{
  calls++;return calls===1?token():new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('é'.repeat(9000)));},cancel(){cancelled=true;}}));
 }) as typeof fetch);
 await assert.rejects(gateway.status(),/WORKER_RESPONSE_TOO_LARGE/);assert.equal(cancelled,true);
 calls=0;
 const invalid=new WorkerGateway(options,(async()=>{calls++;return json({value:'not-a-jwt'});}) as typeof fetch);
 await assert.rejects(invalid.status(),/OIDC_RESPONSE_INVALID/);assert.equal(calls,1);
 assert.throws(()=>new WorkerGateway({...options,oidcEndpoint:'https://actions.githubusercontent.com.attacker.example/token'}),/OIDC_ENDPOINT_REJECTED/);
});

test('SIGTERM-style cancellation aborts coordination immediately instead of waiting for its deadline',async()=>{
 const controller=new AbortController();let signal:AbortSignal|undefined;
 const gateway=new WorkerGateway(options,(async(_url,init)=>{signal=init!.signal as AbortSignal;return new Promise(()=>{});}) as typeof fetch);
 const failed=assert.rejects(gateway.claim(controller.signal),/external stop/);
 await flush();controller.abort(Error('external stop'));await failed;assert.equal(signal?.aborted,true);
});

test('heartbeat requests are serial; one temporary outage does not cancel paid work',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const work=new AbortController();let calls=0,active=0,maxActive=0,finish!:(value:WorkerStatus)=>void;
 const heartbeat=startWorkerHeartbeat({async status(){
  calls++;active++;maxActive=Math.max(maxActive,active);
  try{
   if(calls===1)return await new Promise<WorkerStatus>(resolve=>{finish=resolve;});
   if(calls===2)throw new WorkerTransportError('WORKER_GATEWAY_UNAVAILABLE',true);
   return {status:'building'};
  }finally{active--;}
 }},work);
 t.mock.timers.tick(3000);await flush();assert.equal(calls,1);
 t.mock.timers.tick(12000);await flush();assert.equal(calls,1,'slow status requests must not overlap');
 finish({status:'building'});await flush();
 t.mock.timers.tick(3000);await flush();assert.equal(calls,2);assert.equal(work.signal.aborted,false);
 t.mock.timers.tick(3000);await flush();assert.equal(calls,3);assert.equal(work.signal.aborted,false);assert.equal(maxActive,1);
 await heartbeat.stop();t.mock.timers.tick(60000);await flush();assert.equal(calls,3);assert.equal(work.signal.aborted,false);
});

test('authoritative cancellation and lost visibility stop work for distinct reasons',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const cancelled=new AbortController(),first=startWorkerHeartbeat({status:async()=>({status:'cancelled'})},cancelled);
 t.mock.timers.tick(3000);await flush();assert.equal(cancelled.signal.reason.message,'WORKER_TERMINAL_CANCELLED');await first.stop();
 let calls=0;const unreachable=new AbortController(),second=startWorkerHeartbeat({async status(){calls++;return new Promise(()=>{});}},unreachable);
 t.mock.timers.tick(3000);await flush();assert.equal(calls,1);
 t.mock.timers.tick(41999);await flush();assert.equal(unreachable.signal.aborted,false);
 t.mock.timers.tick(1);await flush();assert.equal(unreachable.signal.reason.message,'WORKER_STATUS_UNREACHABLE');
 await second.stop();assert.equal(calls,1);
});

test('cancelling execution does not turn an interrupted paid call into a new failure report',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let executions=0,reports=0;
 const client={claim:async()=>({} as Awaited<ReturnType<ActionCoordinator['claim']>>),status:async()=>({status:'cancelled' as const}),
  report:async()=>{reports++;return {accepted:true as const,reviewRequired:false};}};
 const failed=assert.rejects(coordinateWorkerStage(client,async()=>{executions++;return new Promise(()=>{});}),/WORKER_TERMINAL_CANCELLED/);
 await flush();t.mock.timers.tick(3000);await failed;assert.equal(executions,1);assert.equal(reports,0);
});

test('report retries freeze one result, stop after three attempts, and never rerun generation',async()=>{
 const bodies:string[]=[];let claims=0,executions=0;
 const gateway=new WorkerGateway({...options,retryDelayMs:0},(async(url,init)=>{
  const path=new URL(String(url)).pathname;
  if(path==='/token')return token();
  if(path.endsWith('/claim')){claims++;return json({});}
  if(path.endsWith('/report')){bodies.push(String(init!.body));throw TypeError('synthetic connection loss');}
  throw Error('unexpected request');
 }) as typeof fetch);
 await assert.rejects(coordinateWorkerStage(gateway,async()=>{executions++;return {candidate:'synthetic result',usageUnits:7};}),/WORKER_REPORT_UNCONFIRMED/);
 assert.equal(claims,1);assert.equal(executions,1);assert.equal(bodies.length,3);assert.equal(new Set(bodies).size,1);
});

test('authoritative report rejection is not retried or replaced by a different failure report',async()=>{
 let reports=0;
 const gateway=new WorkerGateway({...options,retryDelayMs:0},(async(url)=>{
  if(new URL(String(url)).pathname==='/token')return token();
  reports++;return new Response(null,{status:403});
 }) as typeof fetch);
 await assert.rejects(gateway.report({usageUnits:7}),/WORKER_GATEWAY_REJECTED/);assert.equal(reports,1);
});

test('report reconciliation has a total deadline even when acknowledgments never arrive',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 let calls=0;
 const gateway=new WorkerGateway({...options,reportWindowMs:1000},(async()=>{calls++;return new Promise(()=>{});}) as typeof fetch);
 const failed=assert.rejects(gateway.report({usageUnits:7}),/WORKER_REPORT_UNCONFIRMED/);
 await flush();t.mock.timers.tick(1000);await failed;assert.equal(calls,1);
});

test('worker HTTP distinguishes service outages from authentication and contract rejection without exposing diagnostics',async t=>{
 const repo=new MemoryRepository();let failure:Error=Error('temporary storage failure with PRIVATE_DETAILS');
 t.mock.method(repo,'snapshot',async()=>{throw failure;});
 const coordinator=new ActionCoordinator(repo,{dispatch:async()=>{}},{enabled:false,approvalId:'synthetic',model:'synthetic',inputUsdPerMillion:1,outputUsdPerMillion:1,maxInputTokens:64000,maxOutputTokens:4000,priceReviewedOn:'2026-11-21'});
 const handler=workerHandler(coordinator,{verify:async()=>({runId:'100',stage:'generate',repositoryId:'42',sha:'a'.repeat(40)})});
 const server=createServer((req,res)=>{void handler(req,res);});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const url=`http://127.0.0.1:${(server.address() as {port:number}).port}/v1/worker/jobs/synthetic/status`;
  const check=async(status:number)=>{
   const response=await fetch(url,{headers:{Authorization:'Bearer synthetic'}});
   assert.equal(response.status,status);assert.deepEqual(await response.json(),{errorCode:status===403?'WORKER_REQUEST_REJECTED':'WORKER_UNAVAILABLE'});
  };
  await check(503);
  failure=Object.assign(Error('UNAVAILABLE'),{code:14});await check(503);
  failure=Object.assign(Error('JWK fetch timed out'),{code:'ERR_JWKS_TIMEOUT'});await check(503);
  failure=Error('WORKER_FORBIDDEN');await check(403);
  failure=Error('WORKER_REPORT_CONFLICT');await check(403);
  failure=Object.assign(Error('signature verification failed'),{code:'ERR_JWS_SIGNATURE_VERIFICATION_FAILED'});await check(403);
  failure=Error('WORKER_LEASE_EXPIRED');await check(403);
  for(const value of [null,[],{stage:'generate',attempt:0},{stage:'generate',attempt:0,report:null}]){
   const response=await fetch(url.replace('/status','/report'),{method:'POST',headers:{Authorization:'Bearer synthetic','Content-Type':'application/json'},body:JSON.stringify(value)});
   assert.equal(response.status,403);assert.deepEqual(await response.json(),{errorCode:'WORKER_REQUEST_REJECTED'});
  }
  const report=t.mock.method(coordinator,'report',async()=>({accepted:true,reviewRequired:false}));
  const wrongMethod=await fetch(url,{method:'POST',headers:{Authorization:'Bearer synthetic','Content-Type':'application/json'},body:JSON.stringify({stage:'generate',attempt:0,report:{errorCode:'PROVIDER_FAILED'}})});
  assert.equal(wrongMethod.status,403);assert.equal(report.mock.callCount(),0,'the status route cannot accept a report mutation');
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
