import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {PrivateCoachBridge,privateCoachOrigin,metadataIdentityToken} from '../server/coach/private-bridge';
import {CoachService,COACH_RECEIPT_TTL_MS} from '../server/coach/service';
import {MemoryRepository} from '../server/pipeline/repository';
import {privateCoachHandler,type PrivateCoachRuntime} from '../server/coach/private-executor';
import type {CoachContext} from '../src/studio/design';
import type {PrivateCoachConfig} from '../server/coach/private-provider';
import {readFileSync} from 'node:fs';
const config:PrivateCoachConfig={
 enabled:true,privacyApproved:true,moderationApproved:true,zdrVerified:true,privateExecutionApproved:true,
 model:'fixture-model',apiKey:'fixture-private-key-never-in-gateway',
 maxInputChars:16000,maxOutputTokens:600,maxTurnMicroUsd:10000,
 inputMicroUsdPerMillion:1,outputMicroUsdPerMillion:2,pricesReviewedAt:new Date().toISOString()
};
const context:CoachContext={message:'Only if I jump',mode:'discuss',game:'dragon',plan:{},friction:'',helpLevel:0,
 support:'brief',conversation:[{role:'child',text:'The dragon should sneeze spaghetti'},
 {role:'helper',text:'That sounds playful. When should it sneeze?'},
 {role:'child',text:'Only if I jump'}],observations:[],tests:[]};
const reply={move:'clarify',text:'So jumping is the trigger!',question:'Should it sneeze once per jump?',
 suggestions:[],proposedChange:null,planSuggestions:[],childDecisions:[],evidenceIds:[]};
assert.equal(privateCoachOrigin('https://private-coach.run.app'),'https://private-coach.run.app');
for(const unsafe of ['http://coaching.example.com','https://private-coach.run.app/v1/coach',
 'https://private-coach.run.app?token=secret','https://localhost','https://evil.invalid'])
 assert.throws(()=>privateCoachOrigin(unsafe));
let identityCalls=0,privateCalls=0;
const origin='https://private-coach.run.app';
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
const tokenFn=metadataIdentityToken(async(input,init)=>{
 assert.match(String(input),/metadata.google.internal\/computeMetadata/);
 assert.match(String(input),/audience=https%3A%2F%2Fprivate-coach.run.app/);
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
const runtime:PrivateCoachRuntime={config,enabled:true,verifyCaller:async token=>token===proof,
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
 await repository.transaction(state=>{state.ledgers[family]={month:new Date().toISOString().slice(0,7),allowance:50000,reserved:0,used:0,paidEnabled:true};return true;});
 const metered=new CoachService(repository,config,{complete:async()=>({reply,usedMicroUsd:22})});
 await metered.respond(designer,{requestId:'turn-first',context});
 await repository.transaction(state=>{state.coachReceipts![0].at=Date.now()-COACH_RECEIPT_TTL_MS-10;return true;});
 await metered.respond(designer,{requestId:'turn-second',context});
 assert.equal((await repository.snapshot()).coachReceipts?.length,1,'expired content receipt pruned');
 await assert.rejects(metered.eraseFamilyReceipts(designer),/FORBIDDEN/);
 const total=(await repository.snapshot()).ledgers[family].used;
 assert.deepEqual(await metered.eraseFamilyReceipts(parent),{erased:1});
 assert.equal((await repository.snapshot()).coachReceipts?.length,0);
 assert.equal((await repository.snapshot()).ledgers[family].used,total,'erasure does not falsify charges');
 assert.equal((await repository.snapshot()).audit.length,2,'content-free audit remains');
 console.log('PASS private coach: authenticated identity, strict provider-only contract, keyless gateway, hard safety gates and no browser access');
}finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
