import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createServer,request as httpRequest,type Server,type RequestListener,type IncomingHttpHeaders} from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {MemoryRepository} from '../server/pipeline/repository';
import {JobService} from '../server/pipeline/service';
import {apiHandler} from '../server/pipeline/http';
import {signSession} from '../server/pipeline/auth';
import {beginAdultPilotSession,authenticateAdultPilotSession,grantAdultPilot} from '../server/adult-pilot';
import {CoachService,type CoachConfig} from '../server/coach/service';
import {coachHandler} from '../server/coach/http';
import {CoachAudioService,type SpeechConfig} from '../server/coach/speech';
import {speechHttpHandler} from '../server/coach/audio-http';
import {createPreview} from '../server/preview-server';
import {createGateway,type GatewayConfig} from '../server/gateway';
import type {VerifiedSession} from '../server/contracts/api';
import type {Repository,PipelineState} from '../server/pipeline/types';

const origin='https://jzwyrzyk.github.io',previewOrigin='https://preview.example';
const signing='synthetic-adult-profile-session-key-not-a-real-secret';
const previewKey='synthetic-adult-preview-key-not-a-real-secret';
const familyId='same-site-adult-fixture',deviceId='00000000-aaaa-bbbb-cccc-000000000111';
const flags={enabled:true,ownerApproved:true,profileAccessVerified:true};
const context={message:'Make a spaceship bounce',mode:'discuss',game:'new',plan:{},rules:'',
 friction:'',helpLevel:0,support:'brief',conversation:[],observations:[],tests:[]};
const reply={move:'listen',text:'The spaceship can bounce.',question:'How high?',
 suggestions:[],proposedChange:null,planSuggestions:[],childDecisions:[],evidenceIds:[]};
const modelConfig:CoachConfig={enabled:true,privacyApproved:true,moderationApproved:true,
 zdrVerified:false,privateExecutionApproved:true,adultPilot:flags,model:'synthetic-test-model',
 maxInputChars:16000,maxOutputTokens:600,maxTurnMicroUsd:10000,inputMicroUsdPerMillion:100,
 outputMicroUsdPerMillion:100,pricesReviewedAt:new Date().toISOString()};
const audioConfig:SpeechConfig={approved:true,privacyApproved:true,providerApproved:true,
 parentConsentApproved:false,adultPilot:flags,projectId:'synthetic-speech',maxMicroUsd:2000,
 pricesReviewedAt:new Date().toISOString()};
async function listen(handler:RequestListener){
 const server=createServer(handler);
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 return {server,url:'http://127.0.0.1:'+(server.address() as {port:number}).port};
}
async function close(server:Server){await new Promise<void>(resolve=>server.close(()=>resolve()));}
async function fixture(){
 const repo=new MemoryRepository(),now=Date.now();
 const child:VerifiedSession={familyId,deviceId,role:'designer',subject:'family-designer',expiresAt:now+86400000};
 await repo.transaction(s=>{
  s.devices=[{id:deviceId,familyId,name:'Synthetic development device',secretHash:'a'.repeat(64),
   rotation:0,createdAt:now-1000,lastSeenAt:now,expiresAt:now+86400000}];
  s.ledgers[familyId]={month:new Date().toISOString().slice(0,7),allowance:500000,used:0,reserved:0,paidEnabled:true};
  return true;
 });
 await grantAdultPilot(repo,{familyId,deviceId,receipt:'synthetic-adult-reviewed-receipt',operatorConfirmedAdult:true,expiresAt:now+86400000});
 const unlocked=await repo.transaction(s=>beginAdultPilotSession(s,child));
 const adult=authenticateAdultPilotSession(await repo.snapshot(),child,unlocked.cookieValue,unlocked.sessionToken);
 const cookies='factory_session='+signSession(child,signing)+'; factory_adult='+unlocked.cookieValue;
 const jobs=new JobService(repo,{kind:'mock',available:true,testFixture:true,
  generate:async()=>({candidate:{format:'declarative-v1',game:{kind:'star-catcher-v1',target:5,seconds:15}},usageUnits:0})},
  {test:async()=>{}},{allowMock:true,maxUnits:0,timeoutMs:2000,maxRetries:2,adultPilotMode:true});
 return {repo,child,adult,unlocked,cookies,jobs};
}

test('one-site API: cookie alone stays child; a verified profile switch activates all three AI routes',async()=>{
 const f=await fixture();let modelCalls=0,audioCalls=0;
 const coach=new CoachService(f.repo,modelConfig,{complete:async()=>{modelCalls++;return {reply,usedMicroUsd:50};}});
 const audio=new CoachAudioService(f.repo,audioConfig,{transcribe:async()=>{audioCalls++;return 'Synthetic adult dictation';}});
 const config={appOrigin:origin,previewOrigin,sessionKey:signing,previewKey};
 const api=apiHandler(f.jobs,config,f.repo),model=coachHandler(coach,config,f.repo),speech=speechHttpHandler(audio,config,f.repo);
 const {server,url}=await listen((req,res)=>void (req.url?.startsWith('/v1/coach/audio')?speech:req.url?.startsWith('/v1/coach')?model:api)(req,res));
 const childHeaders={Origin:origin,Cookie:f.cookies,'X-Factory-Request':'1','Content-Type':'application/json'};
 const adultHeaders={...childHeaders,'X-Factory-Adult-Session':f.unlocked.sessionToken};
 try{
  for(const path of ['/v1/builder/status','/v1/coach/status','/v1/coach/audio/status']){
   const child=await fetch(url+path,{headers:childHeaders});assert.equal(child.status,200);
   assert.equal((await child.json()).available,false,'an ambient adult cookie cannot activate a child tab');
   const active=await fetch(url+path,{headers:adultHeaders});assert.equal(active.status,200);
   assert.equal((await active.json()).available,true,path+' activates with the adult profile');
   const forged=await fetch(url+path,{headers:{...adultHeaders,'X-Factory-Adult-Session':'z'.repeat(43)}});
   assert.equal(forged.status,403,'a local profile label or guessed proof cannot activate the tools');
   const preflight=await fetch(url+path,{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Headers':'x-factory-adult-session'}});
   assert.equal(preflight.status,204);assert.match(preflight.headers.get('access-control-allow-headers')||'',/X-Factory-Adult-Session/);
  }
  const body=JSON.stringify({requestId:'adult-model-turn',context});
  assert.equal((await fetch(url+'/v1/coach',{method:'POST',headers:childHeaders,body})).status,503);
  assert.equal(modelCalls,0);
  const response=await fetch(url+'/v1/coach',{method:'POST',headers:adultHeaders,body});
  assert.equal(response.status,200);assert.equal((await response.json()).mode,'model');assert.equal(modelCalls,1);
  const wave=new Uint8Array(200);wave.set([0x1a,0x45,0xdf,0xa3]);
  const spoken=await fetch(url+'/v1/coach/audio',{method:'POST',headers:{...adultHeaders,
   'Content-Type':'audio/webm','X-Factory-Audio-Id':'adult-audio-one'},body:new Blob([wave])});
  assert.equal(spoken.status,200);assert.equal((await spoken.json()).text,'Synthetic adult dictation');assert.equal(audioCalls,1);
  const request={gameId:'new',baseRevisionId:null,prompt:'Make a bouncing spaceship',clientRequestId:'same-site-job'};
  const queued=await fetch(url+'/v1/jobs',{method:'POST',headers:adultHeaders,body:JSON.stringify(request)});
  assert.equal(queued.status,202);const {jobId}=await queued.json();
  assert.equal((await fetch(url+'/v1/jobs/'+jobId,{headers:childHeaders})).status,403);
  const forgedBody=await fetch(url+'/v1/jobs',{method:'POST',headers:adultHeaders,
   body:JSON.stringify({...request,clientRequestId:'forged-profile',adultPilotProfileId:f.adult.adultProfileId})});
  assert.equal(forgedBody.status,400,'audience is attached by the server, never accepted from JSON');
  assert.equal((await fetch(url+'/v1/coach',{method:'POST',headers:{...adultHeaders,Origin:'https://hostile.example'},body})).status,403);
  assert.equal(modelCalls,1);
 }finally{await close(server);}
});

test('adult preview capabilities are audience-bound, revoked immediately on profile lock, and never renewed by reopening a URL',async()=>{
 const f=await fixture();
 const job=await f.jobs.submit(f.adult,{gameId:'new',baseRevisionId:null,prompt:'Catch five stars',clientRequestId:'preview-adult'});
 await f.jobs.run(job.jobId);const ready=await f.jobs.get(f.adult,job.jobId);assert.ok(ready.revisionId);
 const config={appOrigin:origin,previewOrigin,sessionKey:signing,previewKey};
 const api=await listen((req,res)=>void apiHandler(f.jobs,config,f.repo)(req,res));
 const preview=createPreview({previewOrigin,previewKey,projectId:'fixture',workspace:familyId},f.repo);
 const viewer=await listen((req,res)=>void preview(req,res));
 try{
  const response=await fetch(api.url+'/v1/revisions/'+ready.revisionId+'/preview',{
   headers:{Origin:origin,Cookie:f.cookies,'X-Factory-Adult-Session':f.unlocked.sessionToken}});
  assert.equal(response.status,200);const link=new URL((await response.json()).url);link.searchParams.set('channel','synthetic-channel');
  const request=(target:URL)=>new Promise<{status:number;headers:IncomingHttpHeaders}>((resolve,reject)=>{
   const req=httpRequest(viewer.url+target.pathname+target.search,{headers:{Host:'preview.example'}},response=>{
    response.resume();response.on('end',()=>resolve({status:response.statusCode!,headers:response.headers}));
   });req.on('error',reject);req.end();
  });
  const playable=await request(link);assert.equal(playable.status,200);assert.match(String(playable.headers['content-security-policy']||''),/default-src 'none'/);
  const stripped=new URL(link);for(const key of ['adult','device','profile'])stripped.searchParams.delete(key);
  assert.equal((await request(stripped)).status,403,'removing audience invalidates the signature');
  const changed=new URL(link);changed.searchParams.set('profile','adult:00000000-aaaa-bbbb-cccc-000000000222');
  assert.equal((await request(changed)).status,403);
  await f.repo.transaction(s=>{s.adultPilotSessions![0].revokedAt=Date.now();return true;});
  assert.equal((await request(link)).status,403,'a still-unexpired URL loses access after adult lock');
  await f.repo.transaction(s=>beginAdultPilotSession(s,f.child));
  assert.equal((await request(link)).status,403,'a new adult session cannot revive an old preview capability');
 }finally{await close(api.server);await close(viewer.server);}
});

test('model and speech completion cannot publish a late reply after device revocation or adult session lock',async()=>{
 for(const capability of ['model','speech'] as const){
  for(const reason of ['device','profile'] as const){
   const f=await fixture();
   const revoke=()=>f.repo.transaction(s=>{
    if(reason==='device')s.devices![0].revokedAt=Date.now();else s.adultPilotSessions![0].revokedAt=Date.now();return true;
   });
   if(capability==='model'){
    const service=new CoachService(f.repo,modelConfig,{complete:async()=>{await revoke();return {reply,usedMicroUsd:50};}});
    await assert.rejects(service.respond(f.adult,{requestId:'late-model',context}),reason==='device'?/UNAUTHENTICATED/:/COACH_UNAVAILABLE/);
    const state=await f.repo.snapshot();assert.equal(state.coachReceipts![0].state,'failed');assert.equal(state.coachReceipts![0].reply,undefined);
    assert.equal(state.ledgers[familyId].reserved,0);assert.equal(state.ledgers[familyId].used,50);
   }else{
    const service=new CoachAudioService(f.repo,audioConfig,{transcribe:async()=>{await revoke();return 'Never publish this late transcript';}});
    const wave=new Uint8Array(200);wave.set([0x1a,0x45,0xdf,0xa3]);
    await assert.rejects(service.transcribe(f.adult,{id:'late-speech',mime:'audio/webm',audio:wave}),reason==='device'?/UNAUTHENTICATED/:/AUDIO_UNAVAILABLE/);
    const state=await f.repo.snapshot();assert.equal(state.audioReceipts![0].state,'failed');
    assert.equal(JSON.stringify(state).includes('Never publish this late transcript'),false);
    assert.equal(state.ledgers[familyId].reserved,0);assert.equal(state.ledgers[familyId].used,2000);
   }
  }
 }
});

test('a queued or retried storage transaction checks adult expiry at paid admission, before any provider call',async()=>{
 for(const capability of ['model','speech'] as const){
  const f=await fixture();let calls=0;
  const delayed:Repository={snapshot:()=>f.repo.snapshot(),transaction:async<T>(update:(state:PipelineState)=>T)=>{
   // Model a Firestore callback delayed across the exact grant expiry. The
   // initial HTTP/request check was valid, but admission must now be denied.
   await f.repo.transaction(s=>{s.adultPilotSessions![0].expiresAt=Date.now()+5;return true;});
   await new Promise(resolve=>setTimeout(resolve,15));
   return f.repo.transaction(update);
  }};
  if(capability==='model'){
   const service=new CoachService(delayed,modelConfig,{complete:async()=>{calls++;return {reply,usedMicroUsd:50};}});
   await assert.rejects(service.respond(f.adult,{requestId:'delayed-admission',context}),/COACH_UNAVAILABLE/);
  }else{
   const service=new CoachAudioService(delayed,audioConfig,{transcribe:async()=>{calls++;return 'Never called';}});
   const wave=new Uint8Array(200);wave.set([0x1a,0x45,0xdf,0xa3]);
   await assert.rejects(service.transcribe(f.adult,{id:'delayed-admission',mime:'audio/webm',audio:wave}),/AUDIO_UNAVAILABLE/);
  }
  assert.equal(calls,0);assert.equal((await f.repo.snapshot()).ledgers[familyId].reserved,0);
 }
});

test('temporary adult mode can use the existing GitHub Pages origin and routes profile access through the real gateway',async()=>{
 const names=['FACTORY_ADULT_PILOT_MODE','FACTORY_ADULT_PILOT_OWNER_APPROVED','FACTORY_ADULT_PILOT_PROFILE_ACCESS_VERIFIED'] as const;
 const previous=names.map(name=>process.env[name]);
 const directory=await mkdtemp(join(tmpdir(),'adult-gateway-'));
 let server:Server|undefined;
 try{
  for(const name of names)process.env[name]='true';
  const config:GatewayConfig={active:false,appOrigin:origin,gatewayOrigin:'https://gateway.example',previewOrigin,
   sessionKey:signing,previewKey,familyId,repository:'jzwyrzyk/family-game-factory',repositoryId:'1458033181',
   workflow:'factory-agent.yml',approvedSha:'a'.repeat(40),githubAppId:'1',githubInstallationId:'2',githubPrivateKey:'unused',
   approval:{enabled:false,approvalId:'synthetic',model:'synthetic',inputUsdPerMillion:1,outputUsdPerMillion:1,
    maxInputTokens:1000,maxOutputTokens:1000,priceReviewedOn:new Date().toISOString().slice(0,10)},
   maxJobMicroUsd:1000,workspace:familyId,localFile:join(directory,'state.json')};
  const gateway=await createGateway(config),listener=await listen((req,res)=>void gateway.handler(req,res));server=listener.server;
  const response=await fetch(listener.url+'/v1/sessions/adult/unlock',{method:'POST',
   headers:{Origin:origin,'Content-Type':'application/json','X-Factory-Request':'1'},body:JSON.stringify({parentPassphrase:'synthetic test passphrase'})});
  assert.equal(response.status,401,'route exists and requires a genuine trusted family session');
  const health=await fetch(listener.url+'/health');assert.deepEqual(await health.json(),{ready:true,paidExecution:false});
  process.env.FACTORY_ADULT_PILOT_PROFILE_ACCESS_VERIFIED='false';
  await assert.rejects(createGateway(config),/ADULT_PILOT_PROFILE_ACCESS_REQUIRED/);
 }finally{
  if(server)await close(server);
  names.forEach((name,i)=>{if(previous[i]===undefined)delete process.env[name];else process.env[name]=previous[i];});
  await rm(directory,{recursive:true,force:true});
 }
});
