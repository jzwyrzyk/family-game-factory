import assert from 'node:assert/strict';
import {test,type TestContext} from 'node:test';
import {familyFetch,renewTrustedSession} from '../src/builder/session';
import {BuilderClient,isKnownBuildRejection} from '../src/builder/client';
import {activateAdultSession,clearAdultSession} from '../src/adult-pilot/session';

const base='https://deadline-fixture.example';
const config={version:1 as const,mode:'remote' as const,apiBaseUrl:base,previewOrigin:'https://preview-fixture.example'};
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
const timeout=()=>new DOMException('Synthetic request deadline','TimeoutError');
function deferred<T=void>(){
 let resolve!:(value:T|PromiseLike<T>)=>void;
 const promise=new Promise<T>(done=>{resolve=done;});return {promise,resolve};
}
function deadlines(t:TestContext){
 const scheduled:{ms:number;controller:AbortController}[]=[];
 t.mock.method(AbortSignal,'timeout',(ms:number)=>{const controller=new AbortController();scheduled.push({ms,controller});return controller.signal;});
 return {expire:(ms:number)=>{
  const entry=[...scheduled].reverse().find(item=>item.ms===ms&&!item.controller.signal.aborted);
  assert.ok(entry,`missing ${ms}ms deadline`);entry.controller.abort(timeout());
 }};
}
function hung(signal:AbortSignal|null|undefined):Promise<Response>{
 assert.ok(signal,'transport must receive cancellation');
 return new Promise((_resolve,reject)=>{
  if(signal.aborted)reject(signal.reason);else signal.addEventListener('abort',()=>reject(signal.reason),{once:true});
 });
}
function network(t:TestContext,handler:(path:string,init:RequestInit)=>Response|Promise<Response>){
 const originalWindow=Object.getOwnPropertyDescriptor(globalThis,'window'),events:string[]=[];
 Object.defineProperty(globalThis,'window',{configurable:true,value:{dispatchEvent:(event:Event)=>{events.push(event.type);return true;}}});
 t.after(()=>{if(originalWindow)Object.defineProperty(globalThis,'window',originalWindow);else delete (globalThis as any).window;});
 t.mock.method(globalThis,'fetch',(url:RequestInfo|URL,init:RequestInit={})=>Promise.resolve().then(()=>handler(new URL(String(url)).pathname,init)));
 return events;
}

test('browser read deadline aborts an unresolved status fetch without another request',async t=>{
 const clock=deadlines(t),started=deferred();let calls=0;
 network(t,(_path,init)=>{calls++;started.resolve();return hung(init.signal);});
 const result=familyFetch(base,'/v1/builder/status');
 const rejected=assert.rejects(result,error=>error instanceof DOMException&&error.name==='TimeoutError');
 await started.promise;clock.expire(15000);await rejected;assert.equal(calls,1);
});

test('unresolved authentication preflight reaches its deadline before any paid body is sent',async t=>{
 const clock=deadlines(t),started=deferred();let paid=0;
 network(t,(path,init)=>{
  if(path==='/v1/sessions/status'){started.resolve();return hung(init.signal);}
  paid++;return json({jobId:'unexpected'},202);
 });
 const result=familyFetch(base,'/v1/jobs',{method:'POST',body:'{"prompt":"synthetic"}'});
 await started.promise;clock.expire(15000);
 const response=await result;assert.equal(response.status,503);assert.equal(paid,0);
 assert.deepEqual(await response.json(),{errorCode:'BUILDER_UNAVAILABLE'});
});

test('shared renewal bounds its transport and lets one caller cancel without cancelling the other',async t=>{
 const clock=deadlines(t),first=deferred<Response>(),started=deferred();let calls=0;
 const events=network(t,(path,init)=>{
  assert.equal(path,'/v1/sessions/renew');calls++;
  if(calls===1){started.resolve();return first.promise;}
  if(calls===2){started.resolve();return hung(init.signal);}
  return json({connected:true});
 });
 const cancel=new AbortController();
 const one=renewTrustedSession(base,cancel.signal),two=renewTrustedSession(base);
 await started.promise;assert.equal(calls,1);cancel.abort();assert.equal(await one,false);
 first.resolve(json({connected:true}));assert.equal(await two,true);assert.deepEqual(events,['factory-session-restored']);
 const stalled=renewTrustedSession(base);await Promise.resolve();clock.expire(15000);
 assert.equal(await stalled,false);assert.equal(calls,2);
 assert.equal(await renewTrustedSession(base),true,'expired shared promise must be evicted');assert.equal(calls,3);
});

test('builder paid POST timeout remains uncertain and is never automatically replayed',async t=>{
 const clock=deadlines(t),started=deferred();let paid=0;
 network(t,(path,init)=>{
  if(path==='/v1/sessions/status')return json({connected:true});
  assert.equal(path,'/v1/jobs');paid++;started.resolve();return hung(init.signal);
 });
 const client=new BuilderClient(config,()=>{throw Error('no unacknowledged update');});
 const result=client.api('/v1/jobs',{clientRequestId:'durable-request',prompt:'Synthetic game'});
 const rejected=assert.rejects(result,error=>{
  assert.equal(isKnownBuildRejection(error),false);
  return error instanceof DOMException&&error.name==='TimeoutError';
 });
 await started.promise;clock.expire(20000);await rejected;assert.equal(paid,1);
});

test('builder request deadline covers a response body that stalls after headers',async t=>{
 const clock=deadlines(t),started=deferred();
 network(t,(_path,init)=>{
  assert.ok(init.signal);
  const signal=init.signal;
  return new Response(new ReadableStream({start(controller){
   controller.enqueue(new TextEncoder().encode('{"jobId":'));
   signal.addEventListener('abort',()=>controller.error(signal.reason),{once:true});started.resolve();
  }}),{status:200});
 });
 const client=new BuilderClient(config,()=>{}),result=client.api('/v1/jobs/fixture');
 const rejected=assert.rejects(result,error=>error instanceof DOMException&&error.name==='TimeoutError');
 await started.promise;clock.expire(20000);await rejected;
});

test('disconnect aborts a pending builder read and a new profile can start a fresh request',async t=>{
 deadlines(t);const started=deferred();let calls=0,updates=0;
 network(t,(_path,init)=>{calls++;if(calls===1){started.resolve();return hung(init.signal);}return json({jobId:'fixture',status:'ready',revisionId:'revision'});});
 const client=new BuilderClient(config,()=>{updates++;}),result=client.check('fixture');
 const rejected=assert.rejects(result,/PROFILE_CHANGED/);
 await started.promise;client.disconnect();await rejected;assert.equal(updates,0);
 assert.equal((await client.check('fixture'))?.status,'ready');assert.equal(updates,1);
});

test('leaving an adult profile cancels preflight and cannot submit the old adult body',async t=>{
 deadlines(t);const started=deferred();let paid=0;
 activateAdultSession(base,{active:true,profileId:'adult:12345678-1234-1234-1234-123456789abc',sessionToken:'s'.repeat(43),expiresAt:Date.now()+60000});
 t.after(()=>clearAdultSession('test',false));
 network(t,(path,init)=>{if(path==='/v1/sessions/status'){started.resolve();return hung(init.signal);}paid++;return json({},202);});
 const result=familyFetch(base,'/v1/jobs',{method:'POST',body:'{"prompt":"adult draft"}'});
 await started.promise;clearAdultSession('test',false);
 assert.equal((await result).status,503);assert.equal(paid,0);
});

test('a late acknowledgement after cancellation cannot become a successful builder result',async t=>{
 const clock=deadlines(t),started=deferred(),answer=deferred<Response>();let paid=0;
 network(t,(path)=>{if(path==='/v1/sessions/status')return json({connected:true});paid++;started.resolve();return answer.promise;});
 const client=new BuilderClient(config,()=>{}),result=client.api('/v1/jobs',{clientRequestId:'same-request'});
 const rejected=assert.rejects(result,error=>error instanceof DOMException&&error.name==='TimeoutError'&&!isKnownBuildRejection(error));
 await started.promise;clock.expire(20000);answer.resolve(json({jobId:'accepted-job',status:'queued'},202));
 await rejected;assert.equal(paid,1);
});
