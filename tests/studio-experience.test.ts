import assert from 'node:assert/strict';
import {JobService} from '../server/pipeline/service';
import {MemoryRepository} from '../server/pipeline/repository';
import {BuilderClient,BuilderApiError,isKnownBuildRejection} from '../src/builder/client';
import {buildErrorCopy,buildProgressCopy,builderReadinessCopy,canCompareExperiments,coachConnectionCopy,conversationDisposition} from '../src/studio/experience';
assert.match(coachConnectionCopy('unavailable'),/not connected/);
assert.match(coachConnectionCopy('available'),/no game is building/);
assert.match(builderReadinessCopy('allowance-required'),/paused/);
assert.match(builderReadinessCopy('unverified'),/not been verified/);
assert.match(buildErrorCopy('SPENDING_CUTOFF'),/allowance/);
assert.match(buildErrorCopy('UNAUTHENTICATED'),/reconnect/);
assert.match(buildErrorCopy('RETRY_LIMIT'),/retry limit/);
assert.match(buildErrorCopy('REQUEST_REJECTED'),/did not confirm/);
assert.doesNotMatch(buildErrorCopy('REQUEST_REJECTED'),/Nothing was built|no game build started/i,'a catch-all response cannot promise that admission failed');
assert.doesNotMatch(buildErrorCopy('GAME_RUNTIME_FAILED',true),/did not confirm/,'a known failed job is not an unknown submission');
assert.match(buildProgressCopy(undefined,true)!.description,/No build is confirmed yet/);
assert.equal(buildProgressCopy(undefined,false),null);
assert.equal(buildProgressCopy({status:'queued'},false)!.phase,'queued');
assert.equal(buildProgressCopy({status:'building',phase:'repairing'},false)!.phase,'building');
assert.match(buildProgressCopy({status:'building',phase:'repairing'},false)!.description,/repairing/);
assert.equal(buildProgressCopy({status:'testing'},false)!.phase,'testing');
assert.equal(buildProgressCopy({status:'ready'},false)!.phase,'ready');
assert.match(buildProgressCopy({status:'failed'},false)!.description,/not completed/);
assert.equal(buildProgressCopy(undefined,false,true)!.phase,'uncertain');
assert.equal(canCompareExperiments(1),false);
assert.equal(canCompareExperiments(3),true);
assert.equal(conversationDisposition('I just want to play now!'),'play');
assert.equal(conversationDisposition('Let me play.'),'play');
assert.equal(conversationDisposition('No more questions'),'play');
assert.equal(conversationDisposition('Actually never mind'),'cancel');
assert.equal(conversationDisposition('The dragon says never mind, then jumps'),'continue');
assert.equal(conversationDisposition('Make a game where we play on the moon'),'continue');
async function readiness(){
 const repository=new MemoryRepository(),session={subject:'family-designer',familyId:'family-1',role:'designer' as const,expiresAt:Date.now()+60000};
 const agent={kind:'metered-api' as const,available:true,generate:async()=>{throw Error('fixture must never generate');}};
 const options={allowMock:false,maxUnits:500,timeoutMs:1000,maxRetries:0};
 const service=new JobService(repository,agent as any,{test:async()=>{throw Error('no worker execution');}},options);
 assert.deepEqual(await service.readiness(session),{available:false,reason:'ALLOWANCE_REQUIRED'});
 await repository.transaction(state=>{state.ledgers['family-1']={month:new Date().toISOString().slice(0,7),allowance:800,used:50,reserved:50,paidEnabled:true};return true;});
 assert.deepEqual(await service.readiness(session),{available:true,reason:'READY'});
 await repository.transaction(state=>{state.ledgers['family-1'].reserved=300;return true;});
 assert.deepEqual(await service.readiness(session),{available:false,reason:'ALLOWANCE_REQUIRED'});
 assert.equal((await repository.snapshot()).jobs.length,0,'readiness never starts paid execution');
 const disabled=new JobService(repository,{...agent,available:false} as any,{test:async()=>{}},options);
 assert.deepEqual(await disabled.readiness(session),{available:false,reason:'UNAVAILABLE'});
 console.log('PASS creation truth, authenticated build-readiness gates, and optional experiment comparison');
}
async function cancelFromReload(){
 const originalFetch=globalThis.fetch,calls:string[]=[],events:string[]=[];
 try{
  globalThis.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{
   const url=String(input);calls.push((init?.method||'GET')+' '+url);
   if(url.endsWith('/v1/sessions/status'))return new Response(JSON.stringify({connected:true}),{status:200});
   if(url.endsWith('/v1/jobs/known-job'))return new Response(JSON.stringify({jobId:'known-job',status:'building'}),{status:200});
   if(url.endsWith('/v1/jobs/known-job/cancel'))return new Response(JSON.stringify({jobId:'known-job',status:'cancelled'}),{status:200});
   throw Error('Unexpected endpoint '+url);
  }) as typeof fetch;
  const client=new BuilderClient({version:1,mode:'remote',apiBaseUrl:'https://factory.test',previewOrigin:'https://preview.test'},job=>events.push(job.status));
  const stopped=await client.cancel('known-job');
  assert.equal(stopped.status,'cancelled');
  assert.deepEqual(calls,['GET https://factory.test/v1/jobs/known-job','GET https://factory.test/v1/sessions/status','POST https://factory.test/v1/jobs/known-job/cancel']);
  assert.deepEqual(events,['cancelled']);
  console.log('PASS exact-job cancellation after reload, verified server transition');
 }finally{globalThis.fetch=originalFetch;}
}
async function retryFromReload(){
 const originalFetch=globalThis.fetch,calls:{method:string;path:string;body?:any}[]=[],events:string[]=[];
 let retryExists=false,loseAcknowledgement=false,rejectRetry=false;
 const config={version:1 as const,mode:'remote' as const,apiBaseUrl:'https://factory.test',previewOrigin:'https://preview.test'};
 const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status});
 try{
  globalThis.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{
   const path=new URL(String(input)).pathname,method=init?.method||'GET';calls.push({method,path,...(init?.body?{body:JSON.parse(String(init.body))}:{})});
   if(path==='/v1/sessions/status')return json({connected:true});
   if(path==='/v1/jobs/saved-failed')return json({jobId:'saved-failed',status:'failed',...(retryExists?{retryJobId:'recovered-retry'}:{})});
   if(path==='/v1/jobs/saved-failed/retry'){
    if(rejectRetry)return json({errorCode:'RETRY_LIMIT'},400);
    retryExists=true;
    if(loseAcknowledgement)throw Error('connection lost after acceptance');
    return json({jobId:'recovered-retry',status:'queued'},202);
   }
   if(path==='/v1/jobs/recovered-retry')return json({jobId:'recovered-retry',status:'ready',revisionId:'saved-result'});
   throw Error('Unexpected endpoint '+path);
  }) as typeof fetch;
  // A fresh client has no in-memory request or last job. The durable job ID is
  // sufficient, and the server reuses its already-reviewed prompt/base.
  const client=new BuilderClient(config,job=>events.push(job.jobId+':'+job.status));
  const result=await client.retry('saved-failed');
  assert.equal(result?.revisionId,'saved-result');
  assert.deepEqual(calls.map(call=>call.method+' '+call.path),['GET /v1/jobs/saved-failed','GET /v1/sessions/status','POST /v1/jobs/saved-failed/retry','GET /v1/jobs/recovered-retry']);
  assert.deepEqual(Object.keys(calls.find(call=>call.method==='POST')!.body),['clientRequestId'],'retry cannot replace the original prompt with a new unsent draft');
  assert.deepEqual(events,['recovered-retry:queued','recovered-retry:ready']);
  assert.equal(calls.some(call=>call.path==='/v1/jobs'),false,'retry never creates an unrelated first build');

  // A lost retry acknowledgement is recovered by GETs from the saved parent,
  // including after another reload. It never automatically repeats the POST.
  calls.length=0;events.length=0;retryExists=false;loseAcknowledgement=true;
  const interrupted=new BuilderClient(config,job=>events.push(job.status));
  await assert.rejects(interrupted.retry('saved-failed'),/connection lost/);
  const before=calls.filter(call=>call.method==='POST').length;
  const reloaded=new BuilderClient(config,job=>events.push(job.status));
  const recovered=await reloaded.check('saved-failed');
  assert.equal(recovered?.jobId,'recovered-retry');
  assert.equal(recovered?.revisionId,'saved-result');
  assert.equal(calls.filter(call=>call.method==='POST').length,before);
  await new BuilderClient(config,()=>{}).retry('saved-failed');
  assert.equal(calls.filter(call=>call.method==='POST').length,before,'a stale retry click follows the already accepted child');

  retryExists=false;loseAcknowledgement=false;rejectRetry=true;
  await assert.rejects(new BuilderClient(config,()=>{}).retry('saved-failed'),error=>isKnownBuildRejection(error)&&String(error).includes('RETRY_LIMIT'));
  assert.equal(isKnownBuildRejection(new Error('connection lost')),false);
  assert.equal(isKnownBuildRejection(new BuilderApiError('RETRY_LIMIT',400)),true);
  assert.equal(isKnownBuildRejection(new BuilderApiError('REQUEST_REJECTED',400)),false,'a catch-all gateway failure may follow an admitted transaction');
  assert.equal(isKnownBuildRejection(new Error('RETRY_LIMIT')),false,'unstructured errors do not establish a gateway rejection');
  const unknown=new BuilderClient(config,()=>{});
  await assert.rejects(unknown.retry(),/NO_ACKNOWLEDGED_JOB/,'an unacknowledged request is not silently replayable');
  console.log('PASS durable failed-job retry, exact original request, lost-ack recovery and structured rejection');
 }finally{globalThis.fetch=originalFetch;}
}
async function retryGuards(){
 const originalFetch=globalThis.fetch,calls:string[]=[];
 const config={version:1 as const,mode:'remote' as const,apiBaseUrl:'https://factory.test',previewOrigin:'https://preview.test'};
 let resolveRead:(response:Response)=>void=()=>{},mode='pending';
 try{
  globalThis.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{
   const path=new URL(String(input)).pathname;calls.push((init?.method||'GET')+' '+path);
   if(mode==='pending')return new Promise<Response>(resolve=>{resolveRead=resolve;});
   if(mode==='wrong-id')return new Response(JSON.stringify({jobId:'different-job',status:'failed'}));
   if(mode==='loop')return new Response(JSON.stringify({jobId:path.endsWith('/parent')?'parent':'child',status:'failed',retryJobId:path.endsWith('/parent')?'child':'parent'}));
   if(mode==='child-failed')return new Response(JSON.stringify(path.endsWith('/parent')?{jobId:'parent',status:'failed',retryJobId:'child'}:{jobId:'child',status:'failed'}));
   throw Error('Unexpected request');
  }) as typeof fetch;
  const events:string[]=[],client=new BuilderClient(config,job=>events.push(job.jobId));
  const pending=client.retry('parent');client.disconnect();resolveRead(new Response(JSON.stringify({jobId:'parent',status:'failed'})));await pending;
  assert.deepEqual(events,[],'profile change suppresses stale callbacks and mutation');
  mode='wrong-id';await assert.rejects(new BuilderClient(config,()=>{}).retry('parent'),/INVALID_JOB_RESPONSE/);
  mode='loop';await assert.rejects(new BuilderClient(config,()=>{}).check('parent'),/INVALID_JOB_RESPONSE/);
  mode='child-failed';const child=await new BuilderClient(config,()=>{}).retry('parent');assert.equal(child?.jobId,'child');
  assert.ok(calls.every(call=>call.startsWith('GET ')),'a recovered child failure requires its own explicit retry, and invalid/stale reads cannot submit');
  console.log('PASS retry owner-change, response identity, bounded-chain and recovered-child guards');
 }finally{globalThis.fetch=originalFetch;}
}
void (async()=>{await readiness();await cancelFromReload();await retryFromReload();await retryGuards();})().catch(error=>{console.error(error);process.exitCode=1;});
