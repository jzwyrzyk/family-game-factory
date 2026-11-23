import assert from 'node:assert/strict';
import {test} from 'node:test';
import {MemoryRepository} from '../server/pipeline/repository';
import {setOwnerCoachConsent} from '../server/coach/consent';
import {NarrationService,narrationApproved,narrationConfig,reconcileNarrationReceipts,validateNarrationText,
 NATURAL_NARRATION_VOICE,type NarrationConfig} from '../server/coach/narration';
import {GooglePrivateNarration} from '../server/coach/private-narration-provider';
import {PrivateNarrationBridge} from '../server/coach/private-narration-bridge';
import {readNarrationResponse} from '../server/coach/narration-transport';
import {dedicatedCoachRuntime} from '../server/coach/private-executor';
import {CoachService} from '../server/coach/service';
const family='narration-fixture',month=()=>new Date().toISOString().slice(0,7);
const session=()=>({subject:'synthetic-designer',familyId:family,role:'designer' as const,expiresAt:Date.now()+3600000});
const config=():NarrationConfig=>({approved:true,privacyApproved:true,providerApproved:true,parentConsentApproved:true,
 projectId:'family-game-factory-jzw',voice:NATURAL_NARRATION_VOICE,maxMicroUsd:60000,
 priceMicroUsdPerMillionChars:30_000_000,pricesReviewedAt:new Date().toISOString()});
const mp3=()=>{const bytes=Buffer.alloc(200);bytes.write('ID3');return bytes;};
async function fixture(allow=true){
 const repo=new MemoryRepository(),user=session();
 await repo.transaction(s=>{s.ledgers[family]={month:month(),allowance:1_000_000,used:0,reserved:0,paidEnabled:true};return true;});
 await setOwnerCoachConsent(repo,{...user,role:'parent'},{familyId:family,model:true,audio:true,narration:allow,
  verifiedByAdult:true,verificationReceipt:'synthetic_verified_receipt',expiresAt:Date.now()+3600000});
 return {repo,user};
}
test('natural voice is independently off by default; incomplete or stale configuration stays off',()=>{
 assert.equal(narrationApproved(narrationConfig({})),false);
 assert.equal(narrationApproved(config()),true);
 for(const name of ['approved','privacyApproved','providerApproved','parentConsentApproved'] as const)
  assert.equal(narrationApproved({...config(),[name]:false}),false);
 for(const other of [{voice:'en-US-Standard-A'},{maxMicroUsd:1000},{pricesReviewedAt:'2020-01-01'},
  {priceMicroUsdPerMillionChars:0},{projectId:'https://untrusted.example'}])
  assert.equal(narrationApproved({...config(),...other}),false);
 assert.throws(()=>dedicatedCoachRuntime({K_SERVICE:'factory-coach-private',FACTORY_COACH_EXECUTION_ENV:'dedicated-cloud-run',FACTORY_NARRATION_APPROVED:'true'}),/NARRATION_APPROVAL_REQUIRED/);
});
test('existing chat or microphone permission never authorizes paid narration',async()=>{
 const {repo,user}=await fixture(false);let calls=0;
 const service=new NarrationService(repo,config(),{read:async()=>{calls++;return mp3();}});
 assert.equal(await service.familyAvailable(user),false);
 await assert.rejects(service.read(user,{id:'not-permitted',text:'Try again.'}),/NARRATION_UNAVAILABLE/);
 assert.equal(calls,0);assert.equal((await repo.snapshot()).ledgers[family].reserved,0);
});
test('one explicit read returns transient MP3, settles once, and stores no spoken content',async()=>{
 const {repo,user}=await fixture();let calls=0;
 const service=new NarrationService(repo,config(),{read:async text=>{calls++;assert.equal(text,'Move the dragon.');return mp3();},readiness:async()=>true});
 assert.equal(await service.familyAvailable(user),true);assert.equal(calls,0,'status has no speech call');
 assert.deepEqual(await service.read(user,{id:'read-once-123',text:'Move the dragon.'}),mp3());
 const state=await repo.snapshot();assert.equal(state.ledgers[family].used,16*30);assert.equal(state.ledgers[family].reserved,0);
 assert.equal(state.narrationReceipts?.[0].state,'ready');
 assert.equal(JSON.stringify(state).includes('Move the dragon.'),false);
 assert.equal(JSON.stringify(state).includes(mp3().toString('base64')),false);
 await assert.rejects(service.read(user,{id:'read-once-123',text:'Move the dragon.'}),/NARRATION_REQUEST_EXISTS/);
 assert.equal(calls,1);
});
test('grade/task text limits, malformed bodies and budget cutoff reject before provider admission',async()=>{
 const {repo,user}=await fixture();let calls=0;
 const service=new NarrationService(repo,config(),{read:async()=>{calls++;return mp3();}});
 for(const text of ['', 'x'.repeat(2001), '字'.repeat(1400), 'Read\u0000this', 'email test@example.com'])
  await assert.rejects(service.read(user,{id:'invalid-read',text}),/INVALID_NARRATION/);
 await assert.rejects(service.read(user,{id:'invalid-read',text:'Hello',voice:'changed'} as any),/INVALID_NARRATION/);
 assert.equal(validateNarrationText('  2 + 3 = ?  '),'2 + 3 = ?');
 await repo.transaction(s=>{s.ledgers[family].allowance=1;return true;});
 await assert.rejects(service.read(user,{id:'budget-read',text:'Hello'}),/SPENDING_CUTOFF/);
 assert.equal(calls,0);
});
test('cancellation before admission spends nothing; cancellation during speech settles without disclosure',async()=>{
 const {repo,user}=await fixture(),cancel=new AbortController();let calls=0;
 const service=new NarrationService(repo,config(),{read:async()=>{calls++;cancel.abort();return mp3();}});
 const already=new AbortController();already.abort();
 await assert.rejects(service.read(user,{id:'cancel-before',text:'Hello'},already.signal),/NARRATION_UNAVAILABLE/);
 assert.equal(calls,0);assert.equal((await repo.snapshot()).ledgers[family].used,0);
 await assert.rejects(service.read(user,{id:'cancel-during',text:'Hello'},cancel.signal),/NARRATION_UNAVAILABLE/);
 assert.equal(calls,1);const state=await repo.snapshot();assert.equal(state.ledgers[family].reserved,0);assert.equal(state.ledgers[family].used,150);
 assert.equal(state.narrationReceipts?.[0].state,'failed');
});
test('revoked consent during synthesis blocks late audio and keeps conservative accounting',async()=>{
 const {repo,user}=await fixture();
 const service=new NarrationService(repo,config(),{read:async()=>{await repo.transaction(s=>{s.coachConsent=[];return true;});return mp3();}});
 await assert.rejects(service.read(user,{id:'revoked-later',text:'Hello'}),/NARRATION_UNAVAILABLE/);
 const state=await repo.snapshot();assert.equal(state.narrationReceipts?.[0].state,'failed');assert.equal(state.ledgers[family].reserved,0);
 assert.equal(await service.familyAvailable(user),false);
});
test('expired reservation is recovered once; late provider completion cannot settle it twice or return audio',async()=>{
 const {repo,user}=await fixture();let complete!:(value:Uint8Array)=>void,entered!:()=>void;
 const start=new Promise<void>(resolve=>{entered=resolve;});
 const service=new NarrationService(repo,config(),{read:async()=>{entered();return new Promise(resolve=>{complete=resolve;});}});
 const pending=service.read(user,{id:'expired-read',text:'Hello'});const failure=assert.rejects(pending,/NARRATION_UNAVAILABLE/);
 await start;
 await repo.transaction(s=>{s.narrationReceipts![0].leaseUntil=Date.now()-1;reconcileNarrationReceipts(s);reconcileNarrationReceipts(s);return true;});
 complete(mp3());await failure;
 const state=await repo.snapshot();assert.equal(state.ledgers[family].used,150);assert.equal(state.ledgers[family].reserved,0);
 assert.equal(state.narrationReceipts?.[0].state,'failed');
});
test('profile adulthood and trusted-device revocation cannot be inferred from a local profile label',async()=>{
 const {repo,user}=await fixture();let calls=0;
 const service=new NarrationService(repo,config(),{read:async()=>{calls++;return mp3();}});
 await assert.rejects(service.read({...user,adultProfileId:'adult-local',adultSessionId:'fake'},{id:'fake-adult',text:'Hello'}),/NARRATION_UNAVAILABLE/);
 await assert.rejects(service.read({...user,deviceId:'missing-device'},{id:'fake-device',text:'Hello'}),/NARRATION_UNAVAILABLE/);
 assert.equal(calls,0);
});
test('private provider uses an allowlisted female voice, plain text and IAM with bounded transient MP3',async()=>{
 let calls=0;
 const provider=new GooglePrivateNarration(config(),async(url,init)=>{
  calls++;assert.equal(url,'https://texttospeech.googleapis.com/v1/text:synthesize');assert.equal(init?.redirect,'error');
  const body=JSON.parse(String(init?.body));assert.deepEqual(body,{input:{text:'Try your idea.'},voice:{languageCode:'en-US',name:NATURAL_NARRATION_VOICE},audioConfig:{audioEncoding:'MP3'}});
  assert.equal((init?.headers as any).Authorization,'Bearer '+'x'.repeat(75));
  return new Response(JSON.stringify({audioContent:mp3().toString('base64')}));
 },async()=> 'x'.repeat(75));
 assert.deepEqual(await provider.read('Try your idea.',new AbortController().signal),mp3());assert.equal(calls,1);
 const broken=new GooglePrivateNarration(config(),async()=>new Response(JSON.stringify({audioContent:Buffer.alloc(200).toString('base64')})),async()=> 'x'.repeat(75));
 await assert.rejects(broken.read('Hello',new AbortController().signal),/NARRATION_UNAVAILABLE/);
});
test('keyless bridge validates private origin and no-inference status, then only transports text/MP3',async()=>{
 const origin='https://factory-coach-private-example-uc.a.run.app';
 assert.throws(()=>new PrivateNarrationBridge('https://untrusted.example'),/PRIVATE_COACH_ORIGIN_REQUIRED/);
 const bridge=new PrivateNarrationBridge(origin,async audience=>{assert.equal(audience,origin);return 'fixture-token';},async(url,init)=>{
  assert.equal((init?.headers as any).Authorization,'Bearer fixture-token');assert.equal(init?.redirect,'error');
  if(String(url).endsWith('/status')){assert.equal(init?.body,undefined);return new Response(JSON.stringify({available:true,mode:'natural'}));}
  assert.deepEqual(JSON.parse(String(init?.body)),{version:1,text:'Read this.'});return new Response(mp3(),{headers:{'Content-Type':'audio/mpeg'}});
 });
 assert.equal(await bridge.readiness(new AbortController().signal),true);
 assert.deepEqual(Buffer.from(await bridge.read('Read this.',new AbortController().signal)),mp3());
});
test('streaming byte limit rejects oversized output even without Content-Length',async()=>{
 let cancelled=false;
 const body=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new Uint8Array(500));controller.enqueue(new Uint8Array(501));},cancel(){cancelled=true;}});
 await assert.rejects(readNarrationResponse(new Response(body),1000,new AbortController().signal),/NARRATION_UNAVAILABLE/);
 assert.equal(cancelled,true);
});
test('parent receipt erasure includes narration, preserving only aggregate spend',async()=>{
 const {repo,user}=await fixture();const reader=new NarrationService(repo,config(),{read:async()=>mp3()});
 await reader.read(user,{id:'erase-read-123',text:'Hello'});
 const coach=new CoachService(repo,{} as any);
 assert.deepEqual(await coach.eraseFamilyReceipts({...user,role:'parent'}),{erased:1});
 const state=await repo.snapshot();assert.equal(state.narrationReceipts?.length,0);assert.equal(state.ledgers[family].used,150);
});

test('cancelled provider body does not wait for stalled stream cleanup',async()=>{
 const abort=new AbortController();let started!:()=>void;
 const reading=new Promise<void>(resolve=>{started=resolve;});
 const body=new ReadableStream<Uint8Array>({pull(){started();return new Promise(()=>{});},cancel(){return new Promise(()=>{});}});
 const pending=readNarrationResponse(new Response(body),1000,abort.signal);
 const rejected=assert.rejects(pending,/NARRATION_UNAVAILABLE/);
 await reading;abort.abort();await rejected;
});
