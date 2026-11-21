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
import {prepareOwnerAccess} from '../server/owner-setup';
import {MemoryRepository} from '../server/pipeline/repository';
import {runtimeBundle} from '../server/sandbox/bundle-v2.cjs';
import {fixturePlanProposal,fixtureModuleReply,fixtureProviderResponse} from '../server/testing/presentation-quality-fixtures';
test('owner invitation and budget setup needs no App PEM, model key or generation and preserves spend/data',async()=>{
 const repo=new MemoryRepository();await repo.transaction(s=>{s.ledgers.owner={month:new Date().toISOString().slice(0,7),allowance:1,used:200,reserved:100,paidEnabled:false};s.revisions.push({id:'saved',familyId:'owner',parentId:null,projectId:'saved',adapter:'metered-api',game:physicalWorkshop});return true;});
 const token=await prepareOwnerAccess({active:true,familyId:'owner',workspace:'existing'},5000000,repo);
 const state=await repo.snapshot();assert.equal(state.ledgers.owner.used,200);assert.equal(state.ledgers.owner.reserved,100);assert.equal(state.ledgers.owner.allowance,5000000);assert.equal(state.revisions[0].id,'saved');assert.equal(state.invitations?.length,1);assert.ok(!JSON.stringify(state).includes(token));
 await assert.rejects(prepareOwnerAccess({active:true,familyId:'__proto__',workspace:'existing'},5,repo));
});
test('real Responses adapter keeps math and source while selecting physics docs only for physical generation/repair',async()=>{
 const approval:AgentApproval={enabled:true,approvalId:'synthetic-only',model:'gpt-5.4-mini-2026-03-17',reasoningEffort:'low',inputUsdPerMillion:.75,outputUsdPerMillion:4.5,maxInputTokens:64000,maxOutputTokens:8000,priceReviewedOn:new Date().toISOString().slice(0,10)};
 let calls=0;
 const adapter=new OpenAIResponsesAgent(approval,()=> 'synthetic-not-real-key',(async(url,options)=>{
  assert.equal(url,'https://api.openai.com/v1/responses');const body=JSON.parse(String(options?.body));
  if(body.text.format.name==='family_game_plan')return fixtureProviderResponse(fixturePlanProposal(body),3000,2000);
  calls++;
  assert.equal(body.store,false);assert.equal(body.text.format.strict,true);assert.ok(body.text.format.schema.properties.kind.enum.includes('generated-module-v2'));
  assert.ok(body.instructions.includes(runtimeBundle().version));assert.match(body.instructions,/Math is required/);
  if(calls===1){assert.doesNotMatch(body.instructions,/physics.part/);assert.equal(JSON.parse(body.input).gameDesignPreflight.motion,'rule-driven');}
  else {assert.doesNotMatch(body.instructions,/physics.part/);assert.match(JSON.parse(body.input).base.source,/api.physics/);assert.equal(JSON.parse(body.input).gameDesignPreflight.form.simulation,'rule-driven','a failed generated candidate cannot choose the engine for its repair');}
  assert.equal(body.reasoning.effort,'low');
  return fixtureProviderResponse(fixtureModuleReply(physicalWorkshop),3000,2000);
 }) as typeof fetch);
 const input={childIntent:'Make a moon construction game',gameManifest:{id:'new',allowedMechanics:['generated-module-v2']},baseRevision:{id:'new'},allowedCapabilities:['generated-module-v2'],budget:{maxUnits:300000,timeoutMs:60000},signal:new AbortController().signal};
 const result=await adapter.generate(input);assert.equal((result.candidate.game as typeof physicalWorkshop).source,physicalWorkshop.source);assert.equal(result.usageUnits,22500);
 await adapter.repair(input,result.candidate.game as typeof physicalWorkshop,'SYNTHETIC_PHYSICS_FAILURE');assert.equal(calls,2);
});
test('owner polling returns durable status before background recovery; unauthorized reads cannot trigger dispatch',async()=>{
 let polls=0,reads=0,polled!:()=>void;
 const recovered=new Promise<void>(resolve=>{polled=resolve;});
 const key='synthetic-session-key-for-pilot-test-only',family='owner-family';
 const service={get:async(session:any,id:string)=>{reads++;if(session.familyId!==family)throw Error('Forbidden');return {jobId:id,status:polls?'failed':'building'};}};
 const handler=apiHandler(service as any,{sessionKey:key,previewKey:key,appOrigin:'https://app.example',previewOrigin:'https://preview.example',poll:async()=>{polls++;polled();}});
 const server=createServer((req,res)=>{void handler(req,res);});await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const url='http://127.0.0.1:'+(server.address() as {port:number}).port+'/v1/jobs/job';
 try{
  assert.equal((await fetch(url)).status,401);assert.equal(polls,0);
  const token=(f:string)=>signSession({familyId:f,subject:'owner',role:'parent',expiresAt:Date.now()+60000},key);
  assert.equal((await fetch(url,{headers:{cookie:'factory_session='+token('other')}})).status,403);assert.equal(polls,0);
  const response=await fetch(url,{headers:{cookie:'factory_session='+token(family)}});
  assert.equal((await response.json()).status,'building');assert.equal(reads,2,'one authorized read per status response');
  await recovered;
  const after=await fetch(url,{headers:{cookie:'factory_session='+token(family)}});
  assert.equal((await after.json()).status,'failed');assert.equal(polls,1);assert.equal(reads,3);
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
 const sandbox=readFileSync('server/sandbox/Dockerfile','utf8');
 assert.match(sandbox,/COPY --chmod=644 server\/sandbox\/trusted\//);
 assert.match(sandbox,/find trusted -type d -exec chmod 755/);
 assert.match(sandbox,/USER node/);
});
