import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {coachHandler,coachConfig} from '../server/coach/http';
import {CoachService,type CoachConfig} from '../server/coach/service';
import {MemoryRepository} from '../server/pipeline/repository';
import {signSession} from '../server/pipeline/auth';
async function main(){
 const repo=new MemoryRepository(),session={subject:'test-designer',familyId:'test-family',role:'designer' as const,expiresAt:Date.now()+60000},key='synthetic-test-signing-key-not-a-secret'.repeat(2),origin='https://studio.test';
 const config:CoachConfig={enabled:true,privacyApproved:true,moderationApproved:true,apiKey:'fixture-key',model:'fixture-model',maxInputChars:16000,maxOutputTokens:500,maxTurnMicroUsd:10000,inputMicroUsdPerMillion:1,outputMicroUsdPerMillion:2,pricesReviewedAt:new Date().toISOString()};
 await repo.transaction(s=>{s.ledgers[session.familyId]={allowance:100000,used:0,reserved:0,paidEnabled:true,month:new Date().toISOString().slice(0,7)};return true;});
 let calls=0;const service=new CoachService(repo,config,{complete:async()=>{calls++;return {usedMicroUsd:10,reply:{move:'clarify',text:'Your preference matters, not just the score.',question:'Which part would you change?',suggestions:[],proposedChange:null,planSuggestions:[],childDecisions:[],evidenceIds:[]}};}});
 const handler=coachHandler(service,{appOrigin:origin,sessionKey:key}),server=createServer((req,res)=>void handler(req,res));
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+(server.address() as any).port;
 const cookie='factory_session='+signSession(session,key),context={message:'I won but it was boring',mode:'discuss',game:'dragon',rules:'Jump to reflect projectiles',plan:{},friction:'',helpLevel:0,support:'brief',conversation:[],observations:[],tests:[]};
 const headers={Origin:origin,Cookie:cookie,'Content-Type':'application/json','X-Factory-Request':'1'};
 try{
  assert.equal(coachConfig({}).enabled,false);
  assert.equal((await fetch(base+'/v1/coach/status',{headers:{Origin:origin}})).status,401);
  assert.equal((await fetch(base+'/v1/coach/status',{headers:{...headers,Origin:'https://other.test'}})).status,403);
  assert.equal((await fetch(base+'/v1/coach',{method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({requestId:'csrf',context})})).status,403);
  const status=await fetch(base+'/v1/coach/status',{headers});assert.deepEqual(await status.json(),{available:true,mode:'model'});
  const r=await fetch(base+'/v1/coach',{method:'POST',headers,body:JSON.stringify({requestId:'turn',context})});assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(r.headers.get('access-control-allow-origin'),origin);assert.equal((await r.json() as any).reply.proposedChange,null);
  const replay=await fetch(base+'/v1/coach',{method:'POST',headers,body:JSON.stringify({requestId:'turn',context})});assert.equal(replay.status,200);assert.equal(calls,1);
  const excessive=await fetch(base+'/v1/coach',{method:'POST',headers,body:JSON.stringify({requestId:'large',context:{...context,message:'x'.repeat(51000)}})});assert.equal(excessive.status,400);assert.equal(calls,1);
  assert.equal((await repo.snapshot()).jobs.length,0);assert.deepEqual((await repo.snapshot()).active,{});
  console.log('PASS coach HTTP: disabled defaults, authentication, Origin/CSRF, private response headers, authorized fixture, idempotency, size limits, no game actions (8 checks)');
 }finally{await new Promise<void>(r=>server.close(()=>r()));}
}
void main().catch(e=>{console.error(e);process.exitCode=1;});
