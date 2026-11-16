import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {siteConfig} from '../scripts/deployment/site-config';
import {checkProviderModel} from '../server/provider-preflight';
import {createServer} from 'node:http';
import {apiHandler} from '../server/pipeline/http';
import {signSession} from '../server/pipeline/auth';
import {OpenAIResponsesAgent,type AgentApproval} from '../server/agent/openai';
import {physicalWorkshop} from '../server/testing/quality-generated-fixtures';
test('real Responses adapter sends v2 schema/physics/required math and preserves source in paid-usage reports',async()=>{
 const approval:AgentApproval={enabled:true,approvalId:'synthetic-only',model:'gpt-5.4-mini-2026-03-17',reasoningEffort:'low',inputUsdPerMillion:.75,outputUsdPerMillion:4.5,maxInputTokens:64000,maxOutputTokens:8000,priceReviewedOn:new Date().toISOString().slice(0,10)};
 let calls=0;
 const adapter=new OpenAIResponsesAgent(approval,()=> 'synthetic-not-real-key',(async(url,options)=>{
  calls++;assert.equal(url,'https://api.openai.com/v1/responses');const body=JSON.parse(String(options?.body));
  assert.equal(body.store,false);assert.equal(body.text.format.strict,true);assert.ok(body.text.format.schema.properties.kind.enum.includes('generated-module-v2'));
  assert.match(body.instructions,/quality-runtime-v2.0.3/);assert.match(body.instructions,/Math is required/);assert.match(body.instructions,/physics.part/);assert.equal(body.reasoning.effort,'low');
  return new Response(JSON.stringify({status:'completed',usage:{input_tokens:3000,output_tokens:2000},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(physicalWorkshop)}]}]}));
 }) as typeof fetch);
 const input={childIntent:'Make a moon construction game',gameManifest:{id:'new',allowedMechanics:['generated-module-v2']},baseRevision:{id:'new'},allowedCapabilities:['generated-module-v2'],budget:{maxUnits:300000,timeoutMs:60000},signal:new AbortController().signal};
 const result=await adapter.generate(input);assert.deepEqual(result.candidate.game,physicalWorkshop);assert.equal(result.usageUnits,11250);
 await adapter.repair(input,physicalWorkshop,'SYNTHETIC_PHYSICS_FAILURE');assert.equal(calls,2);
});
test('authenticated owner polling recovers a stalled job; unauthenticated and other-family reads cannot trigger dispatch',async()=>{
 let polls=0,reads=0;
 const key='synthetic-session-key-for-pilot-test-only',family='owner-family';
 const service={get:async(session:any,id:string)=>{reads++;if(session.familyId!==family)throw Error('Forbidden');return {jobId:id,status:polls?'failed':'building'};}};
 const handler=apiHandler(service as any,{sessionKey:key,previewKey:key,appOrigin:'https://app.example',previewOrigin:'https://preview.example',poll:async()=>{polls++;}});
 const server=createServer((req,res)=>{void handler(req,res);});await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const url='http://127.0.0.1:'+(server.address() as {port:number}).port+'/v1/jobs/job';
 try{
  assert.equal((await fetch(url)).status,401);assert.equal(polls,0);
  const token=(f:string)=>signSession({familyId:f,subject:'owner',role:'parent',expiresAt:Date.now()+60000},key);
  assert.equal((await fetch(url,{headers:{cookie:'factory_session='+token('other')}})).status,403);assert.equal(polls,0);
  const response=await fetch(url,{headers:{cookie:'factory_session='+token(family)}});assert.equal((await response.json()).status,'failed');assert.equal(polls,1);assert.equal(reads,3);
 }finally{await new Promise<void>(r=>server.close(()=>r()));}
});
test('pilot URLs stay unavailable by default, require separate HTTPS origins, expose no private config',()=>{
 assert.deepEqual(siteConfig('',''),{version:1,mode:'unavailable'});
 assert.deepEqual(siteConfig('https://gateway.example','https://preview.example'),{version:1,mode:'remote',apiBaseUrl:'https://gateway.example',previewOrigin:'https://preview.example'});
 for(const pair of [['https://gateway.example',''],['http://gateway.example','https://preview.example'],['https://same.example','https://same.example'],['https://user:secret@gateway.example','https://preview.example'],['https://gateway.example/path','https://preview.example']])assert.throws(()=>siteConfig(pair[0],pair[1]));
});
test('provider preflight only reads selected model; no prompt or generation request and no key in result',async()=>{
 const model='gpt-5.4-mini-2026-03-17',key='synthetic-provider-key';let reads=0;
 const transport=(async(url,options)=>{reads++;assert.equal(url,'https://api.openai.com/v1/models/'+model);assert.equal(options?.method,undefined);assert.equal(options?.body,undefined);assert.equal(options?.redirect,'error');return new Response(JSON.stringify({id:model}));}) as typeof fetch;
 assert.deepEqual(await checkProviderModel(model,key,transport),{model,authorized:true,generationTested:false});assert.equal(reads,1);
 await assert.rejects(checkProviderModel(model,key,(async()=>new Response(null,{status:403})) as typeof fetch),/NOT_AUTHORIZED/);
 await assert.rejects(checkProviderModel(model,key,(async()=>new Response(JSON.stringify({id:'other'}))) as typeof fetch),/ID_MISMATCH/);
});
test('gateway image and tracked build context include the new coach runtime dependency',()=>{
 assert.match(readFileSync('server/Dockerfile.gateway','utf8'),/COPY --chown=node:node src\/studio\/design.ts/);
 assert.match(readFileSync('.dockerignore','utf8'),/!src\/studio\/design.ts/);
 assert.match(readFileSync('scripts/deployment/build.py','utf8'),/'src\/studio\/design.ts'/);
});
