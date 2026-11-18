import assert from 'node:assert/strict';
import {test} from 'node:test';
import {familyFetch} from '../src/builder/session';

async function mockNetwork(handler:(path:string,init:RequestInit)=>Response|Promise<Response>,run:(events:string[])=>Promise<void>){
 const originalFetch=globalThis.fetch,originalWindow=Object.getOwnPropertyDescriptor(globalThis,'window');
 const events:string[]=[];
 Object.defineProperty(globalThis,'window',{configurable:true,value:{dispatchEvent:(event:Event)=>{events.push(event.type);return true;}}});
 Object.defineProperty(globalThis,'fetch',{configurable:true,value:(url:string,init:RequestInit={})=>Promise.resolve().then(()=>handler(new URL(String(url)).pathname,init))});
 try{await run(events);}finally{
  Object.defineProperty(globalThis,'fetch',{configurable:true,value:originalFetch});
  if(originalWindow)Object.defineProperty(globalThis,'window',originalWindow);else delete (globalThis as any).window;
 }
}
const base='https://private-api.example';
const json=(status:number)=>new Response(JSON.stringify(status===401?{errorCode:'UNAUTHENTICATED'}:{connected:true}),{status,headers:{'Content-Type':'application/json'}});

test('GET readiness silently renews 401 once, coalesces transport and retries the read only',async()=>{
 let reads=0,renewals=0;
 await mockNetwork((path,init)=>{
  if(path==='/v1/sessions/renew'){renewals++;assert.equal(init.method,'POST');return json(200);}
  if(path==='/v1/builder/status'){reads++;return json(reads===1?401:200);}
  throw Error('Unexpected route '+path);
 },async events=>{
  const result=await familyFetch(base,'/v1/builder/status',{method:'GET'});
  assert.equal(result.status,200);assert.equal(reads,2);assert.equal(renewals,1);
  assert.deepEqual(events,['factory-session-restored']);
 });
});
test('paid POST is sent exactly once after an independent auth preflight',async()=>{
 let sent=0,probes=0,renewals=0;
 await mockNetwork(path=>{
  if(path==='/v1/sessions/status'){probes++;return json(401);}
  if(path==='/v1/sessions/renew'){renewals++;return json(200);}
  if(path==='/v1/jobs'){sent++;return json(202);}
  throw Error('Unexpected route '+path);
 },async()=>{
  const response=await familyFetch(base,'/v1/jobs',{method:'POST',body:'{"prompt":"build a cat"}'});
  assert.equal(response.status,202);assert.equal(sent,1);assert.equal(probes,1);assert.equal(renewals,1);
 });
});
test('an unauthorized or uncertain paid POST response is not automatically retried',async()=>{
 let sent=0,renewals=0;
 await mockNetwork(path=>{
  if(path==='/v1/sessions/status')return json(200);
  if(path==='/v1/jobs'){sent++;return json(401);}
  if(path==='/v1/sessions/renew'){renewals++;return json(200);}
  throw Error('Unexpected route '+path);
 },async()=>{
  const response=await familyFetch(base,'/v1/jobs',{method:'POST',body:'{}'});
  assert.equal(response.status,401);assert.equal(sent,1);assert.equal(renewals,0);
 });
});
test('failed renewal blocks paid submission, with no duplicate request',async()=>{
 let sent=0,renewals=0;
 await mockNetwork(path=>{
  if(path==='/v1/sessions/status')return json(401);
  if(path==='/v1/sessions/renew'){renewals++;return json(401);}
  if(path==='/v1/jobs'){sent++;return json(202);}
  throw Error('Unexpected route '+path);
 },async()=>{
  const response=await familyFetch(base,'/v1/jobs',{method:'POST',body:'{}'});
  assert.equal(response.status,401);assert.equal(renewals,1);assert.equal(sent,0);
 });
});

test('unavailable authentication preflight fails closed before a paid mutation',async()=>{
 let submitted=0;
 await mockNetwork(path=>{
  if(path==='/v1/sessions/status')throw Error('Gateway unreachable');
  if(path==='/v1/jobs'){submitted++;return json(202);}
  throw Error('Unexpected route '+path);
 },async()=>{
  const response=await familyFetch(base,'/v1/jobs',{method:'POST',body:'{"prompt":"Build a game"}'});
  assert.equal(response.status,503);
  assert.equal((await response.json()).errorCode,'BUILDER_UNAVAILABLE');
  assert.equal(submitted,0,'No paid build submission after uncertain authentication');
 });
});

test('a missing or denied session-status route fails closed without coach or build mutation',async()=>{
 for(const status of [302,403,404,503]){
  let submitted=0,renewals=0,probes=0;
  await mockNetwork(path=>{
   if(path==='/v1/sessions/status'){probes++;return json(status);}
   if(path==='/v1/sessions/renew'){renewals++;return json(200);}
   if(path==='/v1/coach'||path==='/v1/jobs'){submitted++;return json(202);}
   throw Error('Unexpected route '+path);
  },async()=>{
   for(const endpoint of ['/v1/jobs','/v1/coach']){
    const response=await familyFetch(base,endpoint,{method:'POST',body:'{}'});
    assert.equal(response.status,status,'unexpected preflight status '+status+' on '+endpoint);
   }
   assert.equal(probes,2);
   assert.equal(submitted,0,'denied or unsupported gateway must not receive a paid action');
   assert.equal(renewals,0,'only 401 permits renewal');
  });
 }
});
