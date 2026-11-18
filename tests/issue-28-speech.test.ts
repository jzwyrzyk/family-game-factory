import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {MemoryRepository} from '../server/pipeline/repository';
import {CoachService} from '../server/coach/service';
import {signSession} from '../server/pipeline/auth';
import {allowedCoachFamily,setOwnerCoachConsent} from '../server/coach/consent';
import {speechApproved,validateAudio,CoachAudioService,type SpeechConfig} from '../server/coach/speech';
import {GooglePrivateSpeech} from '../server/coach/private-speech-provider';
import {speechHttpHandler} from '../server/coach/audio-http';
import {PrivateSpeechBridge} from '../server/coach/private-bridge';
import {privateCoachHandler,type PrivateCoachRuntime,dedicatedCoachRuntime} from '../server/coach/private-executor';
import type {PrivateCoachConfig} from '../server/coach/private-provider';
const family='synthetic-family',origin='https://studio.test',privateOrigin='https://factory-coach-private-example-uc.a.run.app';
const key='synthetic-test-signing-key-with-enough-entropy-for-fixtures'.repeat(2);
const now=()=>Date.now();
const designer={subject:'synthetic-designer',familyId:family,role:'designer' as const,expiresAt:now()+120000};
const parent={...designer,role:'parent' as const};
const speech:SpeechConfig={approved:true,privacyApproved:true,providerApproved:true,parentConsentApproved:true,
 projectId:'family-game-factory-jzw',maxMicroUsd:18000,pricesReviewedAt:new Date().toISOString()};
const audio=Buffer.alloc(200);audio.set([0x1a,0x45,0xdf,0xa3]);
const mp4=Buffer.alloc(200);mp4.write('ftyp',4,'ascii');
const ogg=Buffer.alloc(200);ogg.write('OggS',0,'ascii');
let count=0;async function test(name:string,fn:()=>Promise<unknown>|unknown){await fn();count++;console.log('PASS '+name);}
async function main(){
 await test('strict container/signature, size and MIME checks',()=>{
  assert.equal(validateAudio(audio,'audio/webm;codecs=opus'),'audio/webm');
  assert.equal(validateAudio(mp4,'audio/mp4'),'audio/mp4');
  assert.equal(validateAudio(ogg,'audio/ogg;codecs=opus'),'audio/ogg');
  assert.throws(()=>validateAudio(Buffer.alloc(200),'audio/webm'),/INVALID_AUDIO/);
  assert.throws(()=>validateAudio(mp4,'audio/webm'),/INVALID_AUDIO/);
  assert.throws(()=>validateAudio(audio,'audio/wav'),/INVALID_AUDIO/);
  assert.throws(()=>validateAudio(Buffer.alloc(330000),'audio/webm'),/INVALID_AUDIO/);
 });
 await test('speech activation independently requires provider/guardian and reviewed prices',()=>{
  assert.equal(speechApproved(speech),true);
  for(const flag of ['approved','privacyApproved','providerApproved','parentConsentApproved'] as const)
   assert.equal(speechApproved({...speech,[flag]:false}),false,flag);
  assert.equal(speechApproved({...speech,maxMicroUsd:0}),false);
  assert.equal(speechApproved({...speech,pricesReviewedAt:'2020-01-01'}),false);
  assert.throws(()=>dedicatedCoachRuntime({
   K_SERVICE:'factory-coach-private',FACTORY_COACH_EXECUTION_ENV:'dedicated-cloud-run',
   FACTORY_COACH_AUDIO_APPROVED:'true'
  }),/AUDIO_APPROVAL_REQUIRED/);
 });
 const repo=new MemoryRepository();
 await repo.transaction(s=>{s.ledgers[family]={allowance:150000,used:0,reserved:0,paidEnabled:true,
  month:new Date().toISOString().slice(0,7)};return true;});
 let calls=0;
 const model={
  transcribe:async(_a:Uint8Array,_m:'audio/webm'|'audio/mp4'|'audio/ogg')=>{calls++;return 'My robot sneezes spaghetti';},
  readiness:async()=>true
 };
 const service=new CoachAudioService(repo,speech,model);
 await test('no consent means no speech availability or paid upload',async()=>{
  assert.equal(await service.familyAvailable(designer),false);
  await assert.rejects(service.transcribe(designer,{id:'no-consent',mime:'audio/webm',audio}),/AUDIO_UNAVAILABLE/);
  assert.equal(calls,0);
 });
 await test('explicit externally verified family-scope authorization and revocation',async()=>{
  await assert.rejects(setOwnerCoachConsent(repo,parent,{familyId:family,model:true,audio:true,
   verifiedByAdult:false,verificationReceipt:'verified_receipt_123',expiresAt:now()+3600000}),/VERIFIED_GUARDIAN_APPROVAL_REQUIRED/);
  await setOwnerCoachConsent(repo,parent,{familyId:family,model:true,audio:true,
   verifiedByAdult:true,verificationReceipt:'verified_receipt_123',expiresAt:now()+3600000});
  assert.equal(allowedCoachFamily(await repo.snapshot(),designer,'audio'),true);
  assert.equal(allowedCoachFamily(await repo.snapshot(),designer,'model'),true);
  assert.equal(await service.familyAvailable(designer),true);
 });
 await test('speech billed conservatively, never stores bytes or recognized text',async()=>{
  assert.deepEqual(await service.transcribe(designer,{id:'first-voice-123',mime:'audio/webm',audio}),{text:'My robot sneezes spaghetti'});
  assert.equal(calls,1);
  const state=await repo.snapshot();
  assert.equal(state.ledgers[family].used,speech.maxMicroUsd);
  assert.equal(state.ledgers[family].reserved,0);
  assert.equal(state.audioReceipts?.[0].state,'ready');
  assert.equal(JSON.stringify(state).includes('My robot sneezes'),false);
  assert.equal(JSON.stringify(state).includes(Buffer.from(audio).toString('base64')),false);
  await assert.rejects(service.transcribe(designer,{id:'first-voice-123',mime:'audio/webm',audio}),/AUDIO_REQUEST_EXISTS/);
  assert.equal(calls,1,'no duplicate paid request');
 });
 await test('verified revocation fails closed even with adequate credit',async()=>{
  await repo.transaction(s=>{s.coachConsent=[];return true;});
  assert.equal(await service.familyAvailable(designer),false);
  await assert.rejects(service.transcribe(designer,{id:'revoked-voice',mime:'audio/webm',audio}),/AUDIO_UNAVAILABLE/);
  assert.equal(calls,1);
  await setOwnerCoachConsent(repo,parent,{familyId:family,model:true,audio:true,
   verifiedByAdult:true,verificationReceipt:'verified_receipt_123',expiresAt:now()+3600000});
 });
 await test('private OAuth STT adapter uses US V2 and recognized text only',async()=>{
  const adapter=new GooglePrivateSpeech('family-game-factory-jzw',async(url,init)=>{
   assert.match(String(url),/^https:\/\/us-speech.googleapis.com\/v2\/projects\/family-game-factory-jzw\/locations\/us\/recognizers\/_:recognize$/);
   const body=JSON.parse(String(init?.body));
   assert.equal(body.content,Buffer.from(audio).toString('base64'));
   assert.deepEqual(body.config.autoDecodingConfig,{});
   assert.equal((init?.headers as any).Authorization,'Bearer '+ 'x'.repeat(75));
   return new Response(JSON.stringify({results:[{alternatives:[{transcript:'A dragon sneezes spaghetti!'}]}]}),{status:200});
  },async()=> 'x'.repeat(75));
  assert.equal(await adapter.transcribe(audio,'audio/webm',new AbortController().signal),'A dragon sneezes spaghetti!');
 });
 const bridge=new PrivateSpeechBridge(privateOrigin,async aud=>{assert.equal(aud,privateOrigin);return 'token';},
 async(url,init)=>{
  assert.equal((init?.headers as any).Authorization,'Bearer token');
  if(String(url).endsWith('/audio/status'))return new Response(JSON.stringify({available:true,mode:'private'}));
  assert.equal(url,privateOrigin+'/v1/private-coach/audio');
  assert.equal(init?.redirect,'error');
  const body=JSON.parse(String(init?.body));
  assert.equal(body.mime,'audio/webm');
  assert.equal(body.audio,Buffer.from(audio).toString('base64'));
  return new Response(JSON.stringify({text:'Robot route'}));
 });
 await test('private IAM bridge never sends cookies or model code',async()=>{
  assert.equal(await bridge.readiness(new AbortController().signal),true);
  assert.equal(await bridge.transcribe(audio,'audio/webm',new AbortController().signal),'Robot route');
 });
 await test('gateway HTTP rejects wrong origin, missing session, no CSRF and bad audio',async()=>{
  const handler=speechHttpHandler(service,{appOrigin:origin,sessionKey:key});
  const server=createServer((req,res)=>{void handler(req,res);});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url='http://127.0.0.1:'+(server.address() as any).port;
  const cookie='factory_session='+signSession(designer,key);
  const headers={Origin:origin,Cookie:cookie,'Content-Type':'audio/webm;codecs=opus',
   'X-Factory-Request':'1','X-Factory-Audio-Id':'new-voice-123'};
  try{
   assert.equal((await fetch(url+'/v1/coach/audio/status',{headers:{Origin:origin}})).status,401);
   assert.equal((await fetch(url+'/v1/coach/audio/status',{headers:{...headers,Origin:'https://evil.test'}})).status,403);
   const status=await fetch(url+'/v1/coach/audio/status',{headers});
   assert.deepEqual(await status.json(),{available:true,mode:'private'});
   assert.equal((await fetch(url+'/v1/coach/audio',{method:'POST',headers:{...headers,'X-Factory-Request':'0'},body:audio})).status,403);
   assert.equal((await fetch(url+'/v1/coach/audio',{method:'POST',headers,body:Buffer.alloc(200)})).status,400);
   const response=await fetch(url+'/v1/coach/audio',{method:'POST',headers,body:audio});
   assert.equal(response.status,200);assert.deepEqual(await response.json(),{text:'My robot sneezes spaghetti'});
   assert.equal(response.headers.get('cache-control'),'no-store');
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
 });
 await test('private speech endpoint accepts only authenticated gateway, not browsers or malformed payloads',async()=>{
  const proof='x'.repeat(80);let privateCalls=0;
  const runtime:PrivateCoachRuntime={
   config:{enabled:false,privacyApproved:false,moderationApproved:false,zdrVerified:false,
    privateExecutionApproved:false,model:'',apiKey:'',maxInputChars:16000,maxOutputTokens:600,
    maxTurnMicroUsd:10000,inputMicroUsdPerMillion:1,outputMicroUsdPerMillion:2,pricesReviewedAt:new Date().toISOString()},
   enabled:false,provider:{complete:async()=>{throw Error('MODEL_MUST_NOT_BE_CALLED');}},
   verifyCaller:async token=>token===proof,audioConfig:speech,
   audio:{transcribe:async()=>{privateCalls++;return 'Robot is ready'}}
  };
  const handler=privateCoachHandler(runtime);
  const server=createServer((req,res)=>{void handler(req,res);});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url='http://127.0.0.1:'+(server.address() as any).port;
  const headers={'Content-Type':'application/json','X-Factory-Request':'1',Authorization:'Bearer '+proof};
  try{
   const ready=await fetch(url+'/v1/private-coach/audio/status',{headers});
   assert.deepEqual(await ready.json(),{available:true,mode:'private'});
   const payload=JSON.stringify({version:1,mime:'audio/webm',audio:audio.toString('base64')});
   assert.equal((await fetch(url+'/v1/private-coach/audio',{method:'POST',headers:{...headers,Origin:origin},body:payload})).status,403);
   assert.equal((await fetch(url+'/v1/private-coach/audio',{method:'POST',headers:{...headers,Authorization:'Bearer '+'y'.repeat(80)},body:payload})).status,403);
   assert.equal((await fetch(url+'/v1/private-coach/audio',{method:'POST',headers,body:JSON.stringify({version:1,mime:'audio/webm',audio:audio.toString('base64'),execute:true})})).status,400);
   const result=await fetch(url+'/v1/private-coach/audio',{method:'POST',headers,body:payload});
   assert.deepEqual(await result.json(),{text:'Robot is ready'});
   assert.equal(privateCalls,1);
   assert.equal(result.headers.get('access-control-allow-origin'),null);
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
 });
 await test('parent erasure removes completed speech metadata but preserves usage accounting',async()=>{
  const clean=new CoachService(repo,{
   enabled:false,privacyApproved:false,moderationApproved:false,zdrVerified:false,
   privateExecutionApproved:false,model:'',maxInputChars:16000,maxOutputTokens:500,
   maxTurnMicroUsd:10000,inputMicroUsdPerMillion:1,outputMicroUsdPerMillion:2,
   pricesReviewedAt:new Date().toISOString()
  });
  await assert.rejects(clean.eraseFamilyReceipts(designer),/FORBIDDEN/);
  const before=(await repo.snapshot()).ledgers[family].used;
  const result=await clean.eraseFamilyReceipts(parent);
  assert.ok(result.erased>=2,'two completed synthetic audio requests were erased');
  const after=await repo.snapshot();
  assert.equal(after.audioReceipts?.length,0);
  assert.equal(after.ledgers[family].used,before,'erasure never falsifies spending totals');
 });
 console.log(count+' isolated speech and consent checks passed, without processing real child audio.');
}
void main().catch(e=>{console.error(e);process.exitCode=1;});
