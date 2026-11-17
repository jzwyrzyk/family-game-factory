import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {PrivateCoachBroker,validPrivateCoachOrigin,googleGatewayIdentity} from '../server/coach/broker';
import {privateCoachHandler} from '../server/coach/private-http';
import {VertexChildCoachProvider,vertexAccessToken} from '../server/coach/vertex';
import {CoachService,approved,type CoachConfig} from '../server/coach/service';
import {MemoryRepository} from '../server/pipeline/repository';
import {setOwnerCoachConsent} from '../server/coach/consent';
import type {CoachContext,CoachReply} from '../src/studio/design';

const origin='https://private-coach-example.a.run.app';
const config:CoachConfig={
 enabled:true,privacyApproved:true,moderationApproved:true,zdrApproved:true,familyConsentApproved:true,brokerApproved:true,
 brokerOrigin:origin,model:'gpt-6-luna',maxInputChars:16000,maxOutputTokens:600,maxTurnMicroUsd:30000,
 inputMicroUsdPerMillion:1000000,outputMicroUsdPerMillion:1000000,pricesReviewedAt:new Date().toISOString()
};
const context:CoachContext={
 message:'What if the dragon sneezes spaghetti?',mode:'discuss',game:'dragon',
 rules:'Shield jumping and playful surprises',plan:{},friction:'',helpLevel:0,support:'brief',
 conversation:[{role:'child',text:'I imagine a dragon on the moon'}],observations:[],tests:[]
};
const reply:CoachReply={move:'listen',text:'A spaghetti sneeze would make a funny surprise!',question:'What should happen when it sneezes?',
 suggestions:[],proposedChange:null,planSuggestions:[],evidenceIds:[]};
let total=0;async function test(name:string,fn:()=>Promise<unknown>|unknown){
 await fn();total++;console.log('PASS '+name);
}
async function main(){
 await test('broker URLs are exact vetted Cloud Run origins, never redirects or caller URLs',()=>{
  assert.equal(validPrivateCoachOrigin(origin),true);
  for(const url of ['http://private-coach-example.a.run.app','https://127.0.0.1','https://evil.example',
   origin+'/prompt',origin+'?trick=1','https://bad.run.app.evil.test','https://user:pass@private-coach-example.a.run.app'])
   assert.equal(validPrivateCoachOrigin(url),false,url);
 });
 await test('gateway ID token is bound to the private broker audience',async()=>{
  const token='a'.repeat(45)+'.'+'b'.repeat(45)+'.'+'c'.repeat(45);
  const request:typeof fetch=async(url,init)=>{
   assert.match(String(url),/metadata.google.internal/);
   assert.ok(String(url).includes(encodeURIComponent(origin)));
   assert.equal((init?.headers as any)['Metadata-Flavor'],'Google');
   return new Response(token);
  };
  assert.equal(await googleGatewayIdentity(origin,new AbortController().signal,request),token);
  await assert.rejects(googleGatewayIdentity('https://evil.example',new AbortController().signal,request),/UNAVAILABLE/);
 });
 await test('broker sends only bounded context via IAM identity, no API key or family token',async()=>{
  let calls=0;
  const p=new PrivateCoachBroker({origin},async(url,init)=>{
   calls++;assert.equal(String(url),origin+'/internal/coach/turn');
   assert.equal(init?.redirect,'error');
   assert.deepEqual(Object.keys(JSON.parse(String(init?.body))),['context']);
   assert.equal((init?.headers as any).Authorization,'Bearer synthetic-gateway-identity');
   assert.equal(JSON.stringify(init).includes('OPENAI_API_KEY'),false);
   return new Response(JSON.stringify({reply,usedMicroUsd:25}),{status:200});
  },async(audience)=>{assert.equal(audience,origin);return 'synthetic-gateway-identity';});
  assert.equal((await p.complete(context,new AbortController().signal)).usedMicroUsd,25);
  assert.equal(calls,1);
 });
 await test('invalid broker and private response fail closed with no alternate provider',async()=>{
  const disabled=new PrivateCoachBroker({origin:'https://evil.example'},async()=>{throw Error('No network');},async()=>{throw Error('No identity');});
  await assert.rejects(disabled.complete(context,new AbortController().signal),/UNAVAILABLE/);
  const bad=new PrivateCoachBroker({origin},async()=>new Response(JSON.stringify({usage:1,reply}),{status:200}),async()=> 'identity');
  await assert.rejects(bad.complete(context,new AbortController().signal),/FAILED/);
 });
 await test('private endpoint requires Google gateway identity and correct path',async()=>{
  const host=privateCoachHandler({origin,gatewayServiceAccount:'factory-gateway@example.iam.gserviceaccount.com',coach:config},
   {complete:async()=>({reply,usedMicroUsd:10})},async token=>token==='valid-identity');
  const server=createServer((req,res)=>void host(req,res));
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+(server.address() as any).port;
  try{
   const req=(url:string,auth?:string,body:unknown={context})=>fetch(base+url,{method:'POST',headers:{
    ...(auth?{Authorization:'Bearer '+auth}:{}),'Content-Type':'application/json'},
    body:JSON.stringify(body)
   });
   assert.equal((await req('/internal/coach/turn')).status,403);
   assert.equal((await req('/internal/coach/turn','invalid')).status,403);
   assert.equal((await req('/internal/other','valid-identity')).status,403);
   const ok=await req('/internal/coach/turn','valid-identity');
   assert.equal(ok.status,200);assert.equal(ok.headers.get('cache-control'),'no-store');
   assert.equal((await ok.json() as any).reply.text,reply.text);
   assert.equal((await req('/internal/coach/turn','valid-identity',{context,secret:'not-allowed'})).status,400);
   const blocked=privateCoachHandler({origin,gatewayServiceAccount:'factory-gateway@example.iam.gserviceaccount.com',
    coach:{...config,zdrApproved:false}},
    {complete:async()=>{throw Error('MUST_NOT_RUN');}},async()=>true);
   // Confirm config-level ZDR denial before processing any payload.
   const fake:any={method:'POST',url:'/internal/coach/turn',headers:{authorization:'Bearer valid-identity',
    'content-type':'application/json'},async *[Symbol.asyncIterator](){yield Buffer.from(JSON.stringify({context}));}};
   const res:any={once(_event:string,_cb:()=>void){return this;},writeHead(status:number){this.status=status;},end(){this.writableEnded=true;},writableEnded:false};await blocked(fake,res);assert.equal(res.status,503);
  }finally{await new Promise<void>(r=>server.close(()=>r()));}
 });
 await test('owner approvals default deny independently of spend and model access',()=>{
  for(const name of ['enabled','privacyApproved','moderationApproved','zdrApproved','familyConsentApproved','brokerApproved'] as const)
   assert.equal(approved({...config,[name]:false}),false,name);
  assert.equal(approved(config),true);
 });
 await test('Vertex AI model calls are stateless, keyless and safety checked before and after output',async()=>{
  const calls:any[]=[];
  const mock:typeof fetch=async(url,init)=>{
   calls.push({url:String(url),data:JSON.parse(String(init?.body)),headers:init?.headers});
   const result=calls.length===2?reply:{allow:true,category:'none'};
   return new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(result)}]}],
    usage:{input_tokens:150,output_tokens:30}}));
  };
  const provider=new VertexChildCoachProvider(config,{projectId:'family-game-factory-jzw',model:config.model,maxOutputTokens:config.maxOutputTokens,
   inputMicroUsdPerMillion:config.inputMicroUsdPerMillion,
   outputMicroUsdPerMillion:config.outputMicroUsdPerMillion,maxTurnMicroUsd:config.maxTurnMicroUsd},
   mock,async()=> 'synthetic-gcp-workload-token');
  const response=await provider.complete(context,new AbortController().signal);
  assert.equal(response.reply.text,reply.text);
  assert.equal(calls.length,3);
  assert.ok(calls.every(c=>c.url==='https://aiplatform.googleapis.com/v1/projects/family-game-factory-jzw/locations/global/publishers/openai/v1/responses'));
  assert.ok(calls.every(c=>c.data.store===false&&c.data.tools===undefined&&!JSON.stringify(c.headers).includes('sk-')));
  assert.ok(response.usedMicroUsd>0);
 });
 await test('Vertex safety refusal cannot reach child or execute a design action',async()=>{
  let calls=0;
  const provider=new VertexChildCoachProvider(config,{projectId:'family-game-factory-jzw',model:config.model,maxOutputTokens:config.maxOutputTokens,
   inputMicroUsdPerMillion:config.inputMicroUsdPerMillion,outputMicroUsdPerMillion:config.outputMicroUsdPerMillion,maxTurnMicroUsd:config.maxTurnMicroUsd},
   async()=>{calls++;return new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',
    text:JSON.stringify({allow:false,category:'privacy'})}]}],usage:{input_tokens:3,output_tokens:6}}));},
   async()=> 'synthetic-gcp-workload-token');
  await assert.rejects(provider.complete(context,new AbortController().signal),/COACH_REFUSED/);
  assert.equal(calls,1);
 });
 await test('Vertex metadata token must be verified, not supplied by browser',async()=>{
  const access='x'.repeat(50);
  const value=await vertexAccessToken(new AbortController().signal,async(url,init)=>{
   assert.match(String(url),/metadata.google.internal/);
   assert.equal((init?.headers as any)['Metadata-Flavor'],'Google');
   return new Response(JSON.stringify({access_token:access,expires_in:1200}));
  });
  assert.equal(value,access);
 });
 await test('gateway spending ledger and receipt stay text-free after broker response',async()=>{
  const repo=new MemoryRepository();const family='synthetic-family';
  await repo.transaction(s=>{s.ledgers[family]={allowance:1000000,used:0,reserved:0,paidEnabled:true,month:new Date().toISOString().slice(0,7)};return true;});
  await setOwnerCoachConsent(repo,{subject:'guardian-one',familyId:family,role:'parent',expiresAt:Date.now()+3600000},
   {familyId:family,model:true,audio:true,verifiedByAdult:true,
    verificationReceipt:'synthetic-guardian-proof-001',expiresAt:Date.now()+30*86400000});
  const service=new CoachService(repo,config,{complete:async()=>({reply,usedMicroUsd:80})});
  const session={subject:'synthetic-child',familyId:family,role:'designer' as const,expiresAt:Date.now()+100000};
  const r=await service.respond(session,{requestId:'synthetic-turn-1',context});assert.equal(r.reply.text,reply.text);
  const state=await repo.snapshot(),receipt=state.coachReceipts?.find(x=>x.id==='synthetic-turn-1');
  assert.equal(receipt?.reply,undefined);
  assert.equal(state.ledgers[family].reserved,0);assert.equal(state.ledgers[family].used,80);
  await assert.rejects(service.respond(session,{requestId:'synthetic-turn-1',context}),/COACH_REQUEST_EXISTS/);
  assert.equal((await repo.snapshot()).ledgers[family].used,80);
 });
 console.log(total+' private coach integration contracts passed. Fixtures only; no paid model or child data processed.');
}
void main().catch(e=>{console.error(e);process.exitCode=1;});
