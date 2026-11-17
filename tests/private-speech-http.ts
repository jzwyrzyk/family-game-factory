import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {CoachAudioService,GooglePrivateSpeech,validateAudio,audioApproved,type SpeechConfig} from '../server/coach/speech';
import {PrivateSpeechBroker} from '../server/coach/broker';
import {speechHttpHandler} from '../server/coach/audio-http';
import {privateCoachHandler} from '../server/coach/private-http';
import {MemoryRepository} from '../server/pipeline/repository';
import {setOwnerCoachConsent} from '../server/coach/consent';
import {signSession} from '../server/pipeline/auth';
import type {CoachConfig} from '../server/coach/service';
const origin='https://private-coach-example.a.run.app',appOrigin='https://family-studio.test';
const audio=Buffer.alloc(150);audio.set([0x1a,0x45,0xdf,0xa3]);
const speech:SpeechConfig={
 approved:true,privacyApproved:true,parentApproved:true,brokerApproved:true,
 brokerOrigin:origin,projectId:'family-game-factory-jzw',maxMicroUsd:18000
};
const coach:CoachConfig={
 enabled:true,privacyApproved:true,moderationApproved:true,zdrApproved:true,
 familyConsentApproved:true,brokerApproved:true,brokerOrigin:origin,
 model:'gpt-6-luna',maxInputChars:16000,maxOutputTokens:600,maxTurnMicroUsd:30000,
 inputMicroUsdPerMillion:1,outputMicroUsdPerMillion:2,pricesReviewedAt:new Date().toISOString()
};
let passed=0;async function test(name:string,fn:()=>Promise<unknown>|unknown){await fn();passed++;console.log('PASS '+name);}
async function main(){
 await test('audio signature and type fail before any model/network call',()=>{
  assert.equal(validateAudio(audio,'audio/webm;codecs=opus'),'audio/webm');
  assert.throws(()=>validateAudio(Buffer.alloc(150),'audio/webm'),/INVALID_AUDIO/);
  assert.throws(()=>validateAudio(audio,'audio/wav'),/INVALID_AUDIO/);
  assert.throws(()=>validateAudio(Buffer.alloc(330000),'audio/webm'),/INVALID_AUDIO/);
 });
 await test('private speech policies default deny each independently',()=>{
  assert.equal(audioApproved(speech),true);
  for(const key of ['approved','privacyApproved','parentApproved','brokerApproved'] as const)
   assert.equal(audioApproved({...speech,[key]:false}),false,key);
  assert.equal(audioApproved({...speech,maxMicroUsd:0}),false);
 });
 await test('Google Speech V2 uses IAM identity, in-memory bytes, no GCS URI',async()=>{
  let calls=0;
  const stt=new GooglePrivateSpeech('family-game-factory-jzw',async(url,init)=>{
   calls++;assert.equal(String(url),'https://us-speech.googleapis.com/v2/projects/family-game-factory-jzw/locations/us/recognizers/_:recognize');
   assert.equal((init?.headers as any).Authorization,'Bearer synthetic-iam-token-0123456789');
   const body=JSON.parse(String(init?.body));
   assert.deepEqual(body.config,{autoDecodingConfig:{},languageCodes:['en-US'],model:'short'});
   assert.ok(Buffer.from(body.content,'base64').equals(audio));assert.equal(body.uri,undefined);
   return new Response(JSON.stringify({results:[{alternatives:[{transcript:'The dragon sneezes spaghetti'}]}]}));
  },async()=> 'synthetic-iam-token-0123456789');
  assert.equal(await stt.transcribe(audio,'audio/webm',new AbortController().signal),'The dragon sneezes spaghetti');
  assert.equal(calls,1);
 });
 await test('private speech broker uses audience-bound IAM, never browser identity or direct speech endpoint',async()=>{
  let called=0;
  const broker=new PrivateSpeechBroker({origin},async(url,init)=>{
   called++;assert.equal(String(url),origin+'/internal/coach/audio');
   assert.equal((init?.headers as any).Authorization,'Bearer private-gateway-identity');
   const body=JSON.parse(String(init?.body));
   assert.deepEqual(Object.keys(body).sort(),['audio','mime']);
   assert.equal(body.mime,'audio/webm');assert.equal(Buffer.from(body.audio,'base64').length,audio.length);
   return new Response(JSON.stringify({text:'I imagine pink spaghetti'}));
  },async aud=>{assert.equal(aud,origin);return 'private-gateway-identity';});
  assert.equal(await broker.transcribe(audio,'audio/webm',new AbortController().signal),'I imagine pink spaghetti');
  assert.equal(called,1);
 });
 await test('audio gateway family reserve, hash-only receipts, no replay billing, owner and budget gates',async()=>{
  const repo=new MemoryRepository();const family='synthetic-family';
  await repo.transaction(s=>{s.ledgers[family]={allowance:100000,used:0,reserved:0,paidEnabled:true,month:new Date().toISOString().slice(0,7)};return true;});
  await setOwnerCoachConsent(repo,{subject:'guardian-one',familyId:family,role:'parent',expiresAt:Date.now()+3600000},
   {familyId:family,model:true,audio:true,verifiedByAdult:true,
    verificationReceipt:'synthetic-guardian-proof-001',expiresAt:Date.now()+30*86400000});
  let calls=0;
  const service=new CoachAudioService(repo,speech,{transcribe:async()=>{calls++;return 'Flying noodles!';}});
  const session={subject:'player-one',familyId:family,role:'designer' as const,expiresAt:Date.now()+60000};
  const reply=await service.transcribe(session,{id:'synthetic-1111',mime:'audio/webm',audio});
  assert.equal(reply.text,'Flying noodles!');assert.equal(calls,1);
  const state=await repo.snapshot();const receipt=state.coachReceipts!.find(r=>r.id==='audio-synthetic-1111');
  assert.equal(receipt?.reply,undefined);assert.equal(receipt?.hash.length,64);
  assert.equal(JSON.stringify(state).includes('Flying noodles'),false);
  assert.equal(state.ledgers[family].reserved,0);assert.equal(state.ledgers[family].used,18000);
  await assert.rejects(service.transcribe(session,{id:'synthetic-1111',mime:'audio/webm',audio}),/AUDIO_REQUEST_EXISTS/);
  assert.equal(calls,1);
  await repo.transaction(s=>{s.ledgers[family].allowance=18000;return true;});
  await assert.rejects(service.transcribe(session,{id:'synthetic-2222',mime:'audio/webm',audio}),/SPENDING_CUTOFF/);
  assert.equal(calls,1);
 });
 await test('audio HTTP requires family cookie, Origin/CSRF, and does not enable by default',async()=>{
  const repo=new MemoryRepository(),key='session-signing-key-for-synthetic-tests-only-'.repeat(2),family='family-test';
  await repo.transaction(s=>{s.ledgers[family]={allowance:100000,used:0,reserved:0,paidEnabled:true,month:new Date().toISOString().slice(0,7)};return true;});
  await setOwnerCoachConsent(repo,{subject:'guardian-one',familyId:family,role:'parent',expiresAt:Date.now()+3600000},
   {familyId:family,model:true,audio:true,verifiedByAdult:true,
    verificationReceipt:'synthetic-guardian-proof-001',expiresAt:Date.now()+30*86400000});
  const session={subject:'player-one',familyId:family,role:'designer' as const,expiresAt:Date.now()+100000},cookie='factory_session='+signSession(session,key);
  let calls=0;
  const service=new CoachAudioService(repo,speech,{transcribe:async()=>{calls++;return 'Spaghetti';}});
  const server=createServer((req,res)=>void speechHttpHandler(service,{appOrigin,sessionKey:key})(req,res));
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+(server.address() as any).port;
  const headers={Origin:appOrigin,Cookie:cookie,'Content-Type':'audio/webm;codecs=opus','X-Factory-Request':'1','X-Factory-Audio-Id':'test-audio-111'};
  try{
   assert.equal((await fetch(base+'/v1/coach/audio/status',{headers:{Origin:appOrigin}})).status,401);
   assert.equal((await fetch(base+'/v1/coach/audio/status',{headers:{Origin:appOrigin,Cookie:cookie}})).status,200);
   assert.equal((await fetch(base+'/v1/coach/audio',{method:'POST',headers:{...headers,Origin:'https://evil.example'},body:audio})).status,403);
   assert.equal((await fetch(base+'/v1/coach/audio',{method:'POST',headers:{...headers,'X-Factory-Request':'0'},body:audio})).status,403);
   const okay=await fetch(base+'/v1/coach/audio',{method:'POST',headers,body:audio});
   assert.equal(okay.status,200);assert.equal((await okay.json() as any).text,'Spaghetti');
   assert.equal(calls,1);
   const disabled=new CoachAudioService(repo,{...speech,approved:false},{transcribe:async()=>{throw Error('MUST_NOT_CALL');}});
   const fake:any={headers:{origin:appOrigin,cookie:cookie},url:'/v1/coach/audio/status',method:'GET'};
   const result:any={status:0,writeHead(code:number){this.status=code;},setHeader(){},end(){}};
   await speechHttpHandler(disabled,{appOrigin,sessionKey:key})(fake,result);
   assert.equal(result.status,200);assert.equal(disabled.enabled(),false);
  }finally{await new Promise<void>(r=>server.close(()=>r()));}
 });
 await test('private IAM-only endpoint refuses audio without an approved speech provider',async()=>{
  const host=privateCoachHandler({origin,gatewayServiceAccount:'gateway@example.iam.gserviceaccount.com',coach},
   {complete:async()=>{throw Error('NO_MODEL');}},async()=>true);
  const server=createServer((req,res)=>void host(req,res));
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
  try{
   const base='http://127.0.0.1:'+(server.address() as any).port;
   const response=await fetch(base+'/internal/coach/audio',{method:'POST',headers:{
    Authorization:'Bearer test-identity','Content-Type':'application/json'
   },body:JSON.stringify({audio:audio.toString('base64'),mime:'audio/webm'})});
   assert.equal(response.status,503);
  }finally{await new Promise<void>(r=>server.close(()=>r()));}
 });
 console.log(passed+' ephemeral private speech contracts passed. Audio is synthetic; no live STT or paid request.');
}
void main().catch(e=>{console.error(e);process.exitCode=1;});
