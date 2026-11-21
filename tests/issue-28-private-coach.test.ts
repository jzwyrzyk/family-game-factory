import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {PrivateCoachBridge,privateCoachOrigin,metadataIdentityToken} from '../server/coach/private-bridge';
import {CoachService,COACH_RECEIPT_TTL_MS} from '../server/coach/service';
import {MemoryRepository} from '../server/pipeline/repository';
import {privateCoachHandler,dedicatedCoachRuntime,googleCallerVerifier,type PrivateCoachRuntime} from '../server/coach/private-executor';
import type {CoachContext} from '../src/studio/design';
import {OpenAICoachProvider,coachFailureEvent,tagCoachFailure,type CoachFailureEvent,type PrivateCoachConfig} from '../server/coach/private-provider';
import {readFileSync} from 'node:fs';
const config:PrivateCoachConfig={
 enabled:true,privacyApproved:true,moderationApproved:true,zdrVerified:true,privateExecutionApproved:true,
 model:'fixture-model',apiKey:'fixture-private-key-never-in-gateway',
 maxInputChars:16000,maxOutputTokens:600,maxTurnMicroUsd:10000,
 inputMicroUsdPerMillion:1,outputMicroUsdPerMillion:2,pricesReviewedAt:new Date().toISOString()
};
assert.throws(()=>dedicatedCoachRuntime({K_SERVICE:'factory-gateway',FACTORY_COACH_EXECUTION_ENV:'dedicated-cloud-run'}),/DEDICATED_PRIVATE_CLOUD_RUN_REQUIRED/);
const inactive=dedicatedCoachRuntime({K_SERVICE:'factory-coach-private',FACTORY_COACH_EXECUTION_ENV:'dedicated-cloud-run'});
assert.equal(inactive.enabled,false,'inactive Cloud Run may start with no model key');
assert.throws(()=>dedicatedCoachRuntime({K_SERVICE:'factory-coach-private',FACTORY_COACH_EXECUTION_ENV:'dedicated-cloud-run',FACTORY_COACH_PRIVATE_OPENAI_API_KEY:'forbidden-secret-on-inactive'}),/COACH_SECRET_FORBIDDEN_WHILE_INACTIVE/);
assert.throws(()=>dedicatedCoachRuntime({K_SERVICE:'factory-coach-private',FACTORY_COACH_EXECUTION_ENV:'dedicated-cloud-run',FACTORY_OPENAI_API_KEY:'old-generation-key'}),/GENERATION_OR_GATEWAY_KEY_FORBIDDEN/);
assert.throws(()=>dedicatedCoachRuntime({K_SERVICE:'factory-coach-private',FACTORY_COACH_EXECUTION_ENV:'dedicated-cloud-run',FACTORY_COACH_APPROVED:'true'}),/COACH_APPROVAL_REQUIRED/);
assert.throws(()=>googleCallerVerifier('https://factory-coach-private-demo-uc.a.run.app','random-identity@example.iam.gserviceaccount.com'),/PRIVATE_COACH_IDENTITY_REQUIRED/);
const context:CoachContext={message:'Only if I jump',mode:'discuss',game:'dragon',plan:{},friction:'',helpLevel:0,
 support:'brief',conversation:[{role:'child',text:'The dragon should sneeze spaghetti'},
 {role:'helper',text:'That sounds playful. When should it sneeze?'},
 {role:'child',text:'Only if I jump'}],observations:[],tests:[]};
const reply={move:'clarify',text:'So jumping is the trigger!',question:'Should it sneeze once per jump?',
 suggestions:[],proposedChange:null,planSuggestions:[],childDecisions:[],evidenceIds:[]};

/** Exercise the real private HTTP boundary, including the production logger.
 * Every provider response is synthetic; no network call leaves loopback. */
async function failureDiagnostics(){
 const secret='PRIVATE_DIAGNOSTIC_SENTINEL',events:CoachFailureEvent[]=[];
 const proof='d'.repeat(80),headers={'Content-Type':'application/json','X-Factory-Request':'1',Authorization:'Bearer '+proof};
 const defaults:PrivateCoachRuntime={config,enabled:true,verifyCaller:async()=>true,
  provider:{complete:async()=>({reply,usedMicroUsd:1})},reportFailure:event=>{events.push(event);}};
 const runtime={...defaults},handler=privateCoachHandler(runtime);
 const server=createServer((req,res)=>{void handler(req,res);});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+(server.address() as any).port;
 const invoke=async(patch:Partial<PrivateCoachRuntime>={},body:unknown={version:1,context},path='/v1/private-coach/complete',method='POST')=>{
  events.length=0;Object.assign(runtime,defaults,patch);
  const response=await fetch(base+path,{method,headers,...(method==='POST'?{body:JSON.stringify(body)}:{})});
  return {status:response.status,body:await response.json()};
 };
 const assertEvent=(stage:string,reason:string)=>{
  assert.equal(events.length,1,'exactly one terminal record per failed coach POST');
  const event=events[0];assert.equal(event.event,'jems_private_coach_failure');assert.equal(event.version,1);
  assert.equal(event.stage,stage);assert.equal(event.reason,reason);
  assert.ok(Number.isInteger(event.elapsedMs)&&event.elapsedMs>=0&&event.elapsedMs<=3600000);
  assert.ok(Object.keys(event).every(key=>['event','version','stage','reason','elapsedMs','providerHttpStatus','incompleteReason'].includes(key)));
  const serialized=JSON.stringify(event);
  for(const privateValue of [secret,config.apiKey,context.message,proof])assert.ok(!serialized.includes(privateValue),'diagnostics must exclude private values');
  return event;
 };
 const unavailable={status:503,body:{errorCode:'COACH_UNAVAILABLE'}};
 const successfulBody=()=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(reply)}]}],usage:{input_tokens:10,output_tokens:20}});
 function providerFor(failureStage?:string,httpStatus=503,inferenceBody:unknown=successfulBody()){
  const calls:string[]=[];let moderation=0;
  const provider=new OpenAICoachProvider(config,async url=>{
   const stage=String(url).endsWith('/moderations')?(++moderation===1?'input_moderation':'output_moderation'):'inference';
   calls.push(stage);
   if(stage===failureStage){
    const response=new Response(secret,{status:httpStatus});
    response.text=async()=>{throw Error('Provider error bodies must not be read: '+secret);};
    return response;
   }
   return new Response(JSON.stringify(stage==='inference'?inferenceBody:{results:[{flagged:false}]}));
  });
  return {provider,calls};
 }
 try{
  assert.deepEqual(await invoke({verifyCaller:async()=>{throw Error(secret);}}),unavailable);
  assertEvent('caller_verification','verification_failed');
  assert.deepEqual(await invoke({verifyCaller:async()=>false}),{status:403,body:{errorCode:'FORBIDDEN'}});
  assertEvent('caller_verification','denied');

  for(const status of [400,401,403,429,500]){
   const {provider,calls}=providerFor('input_moderation',status);
   assert.deepEqual(await invoke({provider}),unavailable);
   assert.equal(assertEvent('input_moderation','http_error').providerHttpStatus,status);
   assert.deepEqual(calls,['input_moderation'],'a failed call must not retry or continue to inference');
  }
  for(const stage of ['inference','output_moderation']){
   const {provider,calls}=providerFor(stage,400);
   assert.deepEqual(await invoke({provider}),unavailable);
   assert.equal(assertEvent(stage,'http_error').providerHttpStatus,400);
   assert.equal(calls.filter(value=>value==='inference').length,1,'no automatic paid retry');
  }
  for(const reason of ['max_output_tokens',secret]){
   const {provider,calls}=providerFor(undefined,503,{status:'incomplete',incomplete_details:{reason},output:[]});
   assert.deepEqual(await invoke({provider}),unavailable);
   const event=assertEvent('inference',reason==='max_output_tokens'?'output_limit':'incomplete');
   assert.equal(event.incompleteReason,reason==='max_output_tokens'?'max_output_tokens':'other');
   assert.deepEqual(calls,['input_moderation','inference']);
  }
  const invalidJson=new OpenAICoachProvider(config,async()=>new Response(secret));
  assert.deepEqual(await invoke({provider:invalidJson}),unavailable);
  assertEvent('input_moderation','invalid_json');
  const transportFailure=new OpenAICoachProvider(config,async()=>{throw Error(secret);});
  assert.deepEqual(await invoke({provider:transportFailure}),unavailable);
  assertEvent('input_moderation','transport_error');

  const refused=new OpenAICoachProvider(config,async()=>new Response(JSON.stringify({results:[{flagged:true}]})));
  assert.deepEqual(await invoke({provider:refused}),{status:422,body:{errorCode:'COACH_REFUSED'}});
  assertEvent('input_moderation','refused');
  const filtered=providerFor(undefined,503,{status:'incomplete',incomplete_details:{reason:'content_filter'},output:[]});
  assert.deepEqual(await invoke({provider:filtered.provider}),{status:422,body:{errorCode:'COACH_REFUSED'}});
  assertEvent('inference','refused');

  let budgetCalls=0;
  const budgetConfig={...config,inputMicroUsdPerMillion:1000000,maxTurnMicroUsd:20000};
  const budgetProvider=new OpenAICoachProvider(budgetConfig,async()=>{budgetCalls++;throw Error('Unexpected paid request');});
  assert.equal(await budgetProvider.readiness(new AbortController().signal),true,'fixed prompt fits this approved allowance');
  const longContext={...context,message:'a'.repeat(1800),conversation:Array.from({length:6},()=>({role:'child',text:'b'.repeat(2000)}))};
  assert.deepEqual(await invoke({config:budgetConfig,provider:budgetProvider},{version:1,context:longContext}),unavailable);
  assertEvent('budget','turn_budget');assert.equal(budgetCalls,0,'full-context cutoff must precede any provider request');

  assert.deepEqual(await invoke({}, {version:1,context:{...context,creation:{version:1}}}),unavailable);
  assertEvent('reply_validation','readiness_missing');
  assert.deepEqual(await invoke({provider:{complete:async()=>({reply:{...reply,text:secret,unexpected:secret},usedMicroUsd:1})}}),unavailable);
  assertEvent('reply_validation','reply_invalid');
  assert.deepEqual(await invoke({provider:{complete:async()=>({reply,usedMicroUsd:-1})}}),unavailable);
  assertEvent('usage_validation','invalid_usage');

  for(const reportFailure of [()=>{throw Error(secret);},async()=>{throw Error(secret);}]){
   assert.deepEqual(await invoke({verifyCaller:async()=>{throw Error(secret);},reportFailure}),unavailable,'diagnostic failure must preserve the original HTTP result');
  }
  const printed:unknown[][]=[],oldError=console.error;
  try{
   console.error=(...args:unknown[])=>{printed.push(args);};
   assert.deepEqual(await invoke({verifyCaller:async()=>{throw Error(secret);},reportFailure:undefined}),unavailable);
  }finally{console.error=oldError;}
  assert.equal(printed.length,1);assert.equal(printed[0].length,1);
  events.push(JSON.parse(String(printed[0][0])));assertEvent('caller_verification','verification_failed');

  assert.equal((await invoke()).status,200);assert.equal(events.length,0,'successful chat has no failure diagnostic');
  assert.equal((await invoke({verifyCaller:async()=>false},undefined,'/v1/private-coach/status','GET')).status,403);
  assert.equal(events.length,0,'status probes do not create turn-failure records');
  assert.equal((await invoke({}, {version:1},'/v1/private-coach/audio')).status,503);
  assert.equal(events.length,0,'speech diagnostics are outside this change');

  const tampered=tagCoachFailure(Error(secret),{stage:secret,reason:secret,providerHttpStatus:secret,incompleteReason:secret} as any);
  const safe=coachFailureEvent(tampered,'unknown',Infinity);
  assert.ok(!JSON.stringify(safe).includes(secret));
  assert.ok(Number.isFinite(safe.elapsedMs)&&safe.elapsedMs>=0);
  assert.equal(safe.providerHttpStatus,undefined);
  const timed=coachFailureEvent(new DOMException(secret,'TimeoutError'),'inference',25);
  assert.equal(timed.reason,'timeout');assert.ok(!JSON.stringify(timed).includes(secret));
  console.log('PASS private coach diagnostics: failure stages, unchanged public errors, bounded metadata, redaction and reporter isolation');
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
}
async function main(){
await failureDiagnostics();
assert.equal(privateCoachOrigin('https://factory-coach-private-demo-uc.a.run.app'),'https://factory-coach-private-demo-uc.a.run.app');
for(const unsafe of ['https://evil.example.com','https://api.openai.com','http://coaching.example.com','https://factory-coach-private-demo-uc.a.run.app/v1/coach',
 'https://factory-coach-private-demo-uc.a.run.app?token=secret','https://localhost','https://evil.invalid'])
 assert.throws(()=>privateCoachOrigin(unsafe));
let identityCalls=0,privateCalls=0;
const origin='https://factory-coach-private-demo-uc.a.run.app';
const bridge=new PrivateCoachBridge(origin,async audience=>{identityCalls++;assert.equal(audience,origin);return 'signed-fixture-token';},
 async(url,init)=>{
  privateCalls++;assert.equal(url,origin+'/v1/private-coach/complete');
  assert.equal(init?.method,'POST');assert.equal((init?.headers as any).Authorization,'Bearer signed-fixture-token');
  assert.equal((init?.headers as any).Cookie,undefined);
  assert.equal((init?.headers as any)['X-Factory-Request'],'1');
  assert.equal(init?.redirect,'error');
  const body=JSON.parse(String(init?.body));assert.deepEqual(body,{version:1,context});
  return new Response(JSON.stringify({reply,usedMicroUsd:18}),{status:200,headers:{'Content-Type':'application/json'}});
 });
const result=await bridge.complete(context,new AbortController().signal);
assert.deepEqual(result,{reply,usedMicroUsd:18});
assert.equal(privateCalls,1);assert.equal(identityCalls,1);
const probeBridge=new PrivateCoachBridge(origin,async()=> 'signed-fixture-token',async(url,init)=>{
 assert.equal(url,origin+'/v1/private-coach/status');
 assert.equal(init?.method,'GET');
 assert.equal(init?.body,undefined,'readiness never transmits a child prompt');
 return new Response(JSON.stringify({available:true,mode:'model'}),{status:200});
});
assert.equal(await probeBridge.readiness(new AbortController().signal),true);
const offlineProbe=new PrivateCoachBridge(origin,async()=> 'signed-fixture-token',
 async()=>new Response(JSON.stringify({errorCode:'FORBIDDEN'}),{status:403}));
assert.equal(await offlineProbe.readiness(new AbortController().signal),false);
const tokenFn=metadataIdentityToken(async(input,init)=>{
 assert.match(String(input),/metadata.google.internal\/computeMetadata/);
 assert.match(String(input),/audience=https%3A%2F%2Ffactory-coach-private-demo-uc.a.run.app/);
 assert.match(String(input),/format=full/,'private gateway identity verification requires the email claim');
 assert.equal((init?.headers as any)['Metadata-Flavor'],'Google');
 return new Response('a'.repeat(60)+'.'+'b'.repeat(60)+'.'+'c'.repeat(60),{status:200});
});
assert.equal((await tokenFn(origin,new AbortController().signal)).split('.').length,3);
await assert.rejects(new PrivateCoachBridge(origin,async()=>'',async()=>new Response('{}',{status:401}))
 .complete(context,new AbortController().signal),/COACH_UNAVAILABLE/);
await assert.rejects(new PrivateCoachBridge(origin,async()=>'',async()=>new Response(JSON.stringify({reply,usedMicroUsd:-1})))
 .complete(context,new AbortController().signal),/COACH_PROVIDER_FAILED/);
const gateway=readFileSync('server/gateway.ts','utf8'),dockerfile=readFileSync('server/Dockerfile.gateway','utf8');
assert.doesNotMatch(gateway,/new OpenAICoachProvider|apiKey\s*:\s*process\.env\.FACTORY/);
assert.match(dockerfile,/rm -f .*private-provider\.ts .*private-executor\.ts/);

const proof='x'.repeat(80);let providerCalls=0;
const runtime:PrivateCoachRuntime={config,enabled:true,verifyCaller:async token=>token===proof,reportFailure:()=>{},
 provider:{complete:async c=>{providerCalls++;assert.equal(c.conversation[0].text,'The dragon should sneeze spaghetti');
 return {reply,usedMicroUsd:21};}}
};
const handler=privateCoachHandler(runtime);
const server=createServer((req,res)=>{void handler(req,res);});
await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+(server.address() as any).port;
const headers={'Content-Type':'application/json','X-Factory-Request':'1',Authorization:'Bearer '+proof};
const post=(body:unknown,h:any=headers)=>fetch(base+'/v1/private-coach/complete',{method:'POST',headers:h,body:JSON.stringify(body)});
try{
 const ready=await fetch(base+'/v1/private-coach/status',{method:'GET',headers:{
  Authorization:'Bearer '+proof,'X-Factory-Request':'1'}});
 assert.equal(ready.status,200);assert.deepEqual(await ready.json(),{available:true,mode:'model'});
 assert.equal(providerCalls,0,'readiness never invokes the model');
 const deniedProbe=await fetch(base+'/v1/private-coach/status',{method:'GET',headers:{
  Authorization:'Bearer '+'z'.repeat(80),'X-Factory-Request':'1'}});
 assert.equal(deniedProbe.status,403);
 const fail=await post({version:1,context},{...headers,Authorization:'Bearer '+'z'.repeat(80)});
 assert.equal(fail.status,403);assert.equal(providerCalls,0);
 const browser=await post({version:1,context},{...headers,Origin:'https://untrusted.example'});
 assert.equal(browser.status,403);assert.equal(providerCalls,0);
 const missingCsrf=await post({version:1,context},{'Content-Type':'application/json',Authorization:'Bearer '+proof});
 assert.equal(missingCsrf.status,403);
 const pii=await post({version:1,context:{...context,message:'Email test@example.com'}});
 assert.equal(pii.status,400);assert.equal(providerCalls,0);
 const success=await post({version:1,context});
 assert.equal(success.status,200);assert.equal(success.headers.get('cache-control'),'no-store');
 assert.equal(success.headers.get('access-control-allow-origin'),null);
 assert.deepEqual(await success.json(),{reply,usedMicroUsd:21});assert.equal(providerCalls,1);
 const forbiddenExtra=await post({version:1,context,execute:true});
 assert.equal(forbiddenExtra.status,400);
 const disabled=privateCoachHandler({...runtime,enabled:false});
 const other=createServer((req,res)=>{void disabled(req,res);});
 await new Promise<void>(res=>other.listen(0,'127.0.0.1',res));
 try{
  const response=await fetch('http://127.0.0.1:'+(other.address() as any).port+'/v1/private-coach/complete',
   {method:'POST',headers,body:JSON.stringify({version:1,context})});
  assert.equal(response.status,503);assert.equal(providerCalls,1);
 }finally{await new Promise<void>(resolve=>other.close(()=>resolve()));}
 const repository=new MemoryRepository(),family='family-synthetic';
 const designer={subject:'designer-fixture',familyId:family,role:'designer' as const,expiresAt:Date.now()+60000};
 const parent={...designer,role:'parent' as const};
 await repository.transaction(state=>{state.ledgers[family]={month:new Date().toISOString().slice(0,7),allowance:50000,reserved:0,used:0,paidEnabled:true};state.coachConsent=[{familyId:family,guardianSubject:'synthetic-parent',confirmedAt:Date.now(),expiresAt:Date.now()+3600000,policyVersion:'owner-pilot-1',model:true,audio:false,verificationReceipt:'fixture_verified_consent_123'}];return true;});
 const metered=new CoachService(repository,config,{complete:async()=>({reply,usedMicroUsd:22})});
 await metered.respond(designer,{requestId:'turn-first',context});
 await repository.transaction(state=>{state.coachReceipts![0].at=Date.now()-COACH_RECEIPT_TTL_MS-10;return true;});
 await metered.respond(designer,{requestId:'turn-second',context});
 assert.equal((await repository.snapshot()).coachReceipts?.length,1,'expired content receipt pruned');
 const trustedId='trusted-coach-fixture',trustedSession={...designer,deviceId:trustedId};
 await repository.transaction(state=>{state.devices=[{id:trustedId,familyId:family,name:'Test tablet',
  secretHash:'0'.repeat(64),rotation:0,createdAt:Date.now()-1000,lastSeenAt:Date.now(),expiresAt:Date.now()+3600000}];return true;});
 await metered.respond(trustedSession,{requestId:'turn-device-safe',context});
 await repository.transaction(state=>{state.devices![0].revokedAt=Date.now();return true;});
 const beforeRevoked=(await repository.snapshot()).ledgers[family].used;
 await assert.rejects(metered.respond(trustedSession,{requestId:'turn-device-revoked',context}),/UNAUTHENTICATED/);
 assert.equal((await repository.snapshot()).ledgers[family].used,beforeRevoked,
  'revoked trusted device must never reserve another model call');
 await assert.rejects(metered.eraseFamilyReceipts(designer),/FORBIDDEN/);
 const total=(await repository.snapshot()).ledgers[family].used;
 assert.deepEqual(await metered.eraseFamilyReceipts(parent),{erased:2});
 assert.equal((await repository.snapshot()).coachReceipts?.length,0);
 assert.equal((await repository.snapshot()).ledgers[family].used,total,'erasure does not falsify charges');
 assert.equal((await repository.snapshot()).audit.length,3,'content-free audit remains');
 console.log('PASS private coach: authenticated identity, strict provider-only contract, keyless gateway, hard safety gates and no browser access');
}finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}

}
void main().catch(error=>{console.error(error);process.exitCode=1;});
