import assert from 'node:assert/strict';
import {test,type TestContext} from 'node:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {CoachService,type CoachConfig} from '../server/coach/service';
import {CoachAudioService,type SpeechConfig} from '../server/coach/speech';
import {PAID_RECEIPT_LEASE_MS,reconcilePaidReceipts} from '../server/coach/receipts';
import {MemoryRepository,FileRepository} from '../server/pipeline/repository';
import {setOwnerCoachConsent} from '../server/coach/consent';
import type {Repository} from '../server/pipeline/types';
import type {CoachContext,CoachReply} from '../src/studio/design';

const context:CoachContext={message:'Should my dragon jump?',mode:'discuss',game:'dragon',plan:{},
 friction:'',helpLevel:0,support:'brief',conversation:[],observations:[],tests:[]};
const reply:CoachReply={move:'clarify',text:'You can choose how your dragon moves.',question:'Where would it jump?',
 suggestions:[],proposedChange:null,planSuggestions:[],childDecisions:[],evidenceIds:[]};
const coachConfig:CoachConfig={enabled:true,privacyApproved:true,moderationApproved:true,zdrVerified:true,
 privateExecutionApproved:true,model:'fixture-model',maxInputChars:16000,maxOutputTokens:600,
 maxTurnMicroUsd:10000,inputMicroUsdPerMillion:1,outputMicroUsdPerMillion:2,pricesReviewedAt:new Date().toISOString()};
const speechConfig:SpeechConfig={approved:true,privacyApproved:true,providerApproved:true,parentConsentApproved:true,
 projectId:'fixture-project',maxMicroUsd:18000,pricesReviewedAt:new Date().toISOString()};
const audio=Buffer.alloc(200);audio.set([0x1a,0x45,0xdf,0xa3]);
const request={requestId:'interrupted-coach',context};
const audioRequest={id:'interrupted-audio',mime:'audio/webm',audio};

async function fixture(t:TestContext,repo:Repository=new MemoryRepository()){
 const clock={now:Date.now()};t.mock.method(Date,'now',()=>clock.now);
 const parent={subject:'fixture-parent',familyId:'fixture-family',role:'parent' as const,expiresAt:clock.now+3600000};
 const month=new Date(clock.now).toISOString().slice(0,7);
 await repo.transaction(state=>{
  state.ledgers[parent.familyId]={month,allowance:1000000,used:0,reserved:0,paidEnabled:true};
  return true;
 });
 await setOwnerCoachConsent(repo,parent,{familyId:parent.familyId,model:true,audio:true,
  verifiedByAdult:true,verificationReceipt:'synthetic_receipt_123',expiresAt:clock.now+3600000});
 return {repo,parent,clock,month};
}

function deferred<T>(){
 let resolve!:(value:T)=>void;
 const promise=new Promise<T>(done=>{resolve=done;});
 return {promise,resolve};
}

test('restart recovery settles legacy text/audio receipts once and retains content-free original-month usage',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'jems-receipts-'));
 t.after(()=>rm(directory,{recursive:true,force:true}));
 const path=join(directory,'state.json');
 const {repo,parent,clock,month}=await fixture(t,await FileRepository.open(path));
 await repo.transaction(state=>{
  state.ledgers[parent.familyId].reserved=28000;
  state.coachReceipts=[{id:'legacy-text',familyId:parent.familyId,subject:parent.subject,hash:'fixture',month,
   at:clock.now-86400000,reserved:10000,state:'running',reply}];
  state.audioReceipts=[{id:'audio-legacy',familyId:parent.familyId,subject:parent.subject,month,
   at:clock.now-86400000,reserved:18000,state:'running'}];
  return true;
 });
 const reopened=await FileRepository.open(path);
 await Promise.all(Array.from({length:6},()=>reconcilePaidReceipts(reopened)));
 const state=await (await FileRepository.open(path)).snapshot();
 assert.equal(state.ledgers[parent.familyId].reserved,0);
 assert.equal(state.ledgers[parent.familyId].used,28000);
 assert.equal(state.coachReceipts![0].state,'failed');
 assert.equal(state.audioReceipts![0].state,'failed');
 assert.equal(state.coachReceipts![0].recoveredAt,clock.now);
 assert.equal(state.coachReceipts![0].reply,undefined);
 assert.equal(state.audit.length,2);
 assert.deepEqual(state.audit.map(event=>event.usage?.usedMicroUsd),[10000,18000]);
 assert.ok(state.audit.every(event=>event.usage?.month===month&&event.usage.outcome==='interrupted'));
 assert.equal(JSON.stringify(state).includes(reply.text),false);
});

test('readiness recovers a stalled turn and duplicate rejection cannot roll back settlement or replay it',async t=>{
 const {repo,parent,clock}=await fixture(t);
 const started=deferred<void>(),answer=deferred<{reply:CoachReply;usedMicroUsd:number}>();let calls=0;
 const provider={complete:async()=>{calls++;started.resolve();return answer.promise;}};
 const service=new CoachService(repo,coachConfig,provider);
 const running=service.respond(parent,request);
 await started.promise;
 clock.now+=PAID_RECEIPT_LEASE_MS;
 const recoveredService=new CoachService(repo,coachConfig,provider);
 assert.equal(await recoveredService.ready(parent),true);
 await assert.rejects(recoveredService.respond(parent,request),/COACH_REQUEST_EXISTS/);
 assert.equal(calls,1);
 answer.resolve({reply,usedMicroUsd:21});
 await assert.rejects(running,/COACH_UNAVAILABLE/);
 const state=await repo.snapshot();
 assert.equal(state.ledgers[parent.familyId].used,coachConfig.maxTurnMicroUsd);
 assert.equal(state.ledgers[parent.familyId].reserved,0);
 assert.equal(state.audit.length,1);
 assert.equal(state.coachReceipts![0].reply,undefined);
});

test('freshly recovered old receipts stay as duplicate tombstones for the normal retention window',async t=>{
 const {repo,parent,clock,month}=await fixture(t);
 await repo.transaction(state=>{
  state.ledgers[parent.familyId].reserved=speechConfig.maxMicroUsd;
  state.audioReceipts=[{id:'audio-'+audioRequest.id,familyId:parent.familyId,subject:parent.subject,month,
   at:clock.now-2*86400000,reserved:speechConfig.maxMicroUsd,state:'running'}];
  return true;
 });
 let calls=0;
 const service=new CoachAudioService(repo,speechConfig,{transcribe:async()=>{calls++;return 'Fixture transcript';}});
 assert.equal(await service.familyAvailable(parent),true);
 for(let attempt=0;attempt<2;attempt++)await assert.rejects(service.transcribe(parent,audioRequest),/AUDIO_REQUEST_EXISTS/);
 assert.equal(calls,0);
 assert.equal((await repo.snapshot()).audioReceipts?.length,1);
});

for(const kind of ['coach','audio'] as const){
 test(`${kind}: erasure and reused request ID fence late completion from the old reservation`,async t=>{
  const {repo,parent,clock}=await fixture(t);
  const starts=[deferred<void>(),deferred<void>()],answers=[deferred<any>(),deferred<any>()];let calls=0;
  const provider=async()=>{const call=calls++;starts[call].resolve();return answers[call].promise;};
  const coach=new CoachService(repo,coachConfig,{complete:provider});
  const speech=new CoachAudioService(repo,speechConfig,{transcribe:provider});
  const run=()=>kind==='coach'?coach.respond(parent,request):speech.transcribe(parent,audioRequest);
  const old=run();await starts[0].promise;
  await assert.rejects(coach.eraseFamilyReceipts(parent),/COACH_REQUEST_EXISTS/);
  clock.now+=PAID_RECEIPT_LEASE_MS+1;
  assert.deepEqual(await coach.eraseFamilyReceipts(parent),{erased:1});
  const replacement=run();await starts[1].promise;
  const before=await repo.snapshot();
  const maximum=kind==='coach'?coachConfig.maxTurnMicroUsd:speechConfig.maxMicroUsd;
  const completedValue=kind==='coach'?{reply,usedMicroUsd:21}:'Synthetic transcript';
  answers[0].resolve(completedValue);
  await assert.rejects(old,kind==='coach'?/COACH_UNAVAILABLE/:/AUDIO_UNAVAILABLE/);
  const fenced=await repo.snapshot();
  assert.deepEqual(fenced,before,'old response cannot settle or publish into the replacement');
  assert.equal(fenced.ledgers[parent.familyId].reserved,maximum);
  answers[1].resolve(completedValue);await replacement;
  const complete=await repo.snapshot();
  assert.equal(complete.ledgers[parent.familyId].used,maximum+(kind==='coach'?21:maximum));
  assert.equal(complete.ledgers[parent.familyId].reserved,0);
  assert.equal(complete.audit.length,2);
  assert.equal(JSON.stringify(complete).includes('Synthetic transcript'),false);
 });
}

test('completion after the fixed deadline settles conservatively without waiting for a recovery poll',async t=>{
 const {repo,parent,clock}=await fixture(t);
 const started=deferred<void>(),answer=deferred<{reply:CoachReply;usedMicroUsd:number}>();
 const service=new CoachService(repo,coachConfig,{complete:async()=>{started.resolve();return answer.promise;}});
 const running=service.respond(parent,request);await started.promise;
 clock.now+=PAID_RECEIPT_LEASE_MS+1;
 answer.resolve({reply,usedMicroUsd:0});
 await assert.rejects(running,/COACH_UNAVAILABLE/);
 const state=await repo.snapshot();
 assert.equal(state.ledgers[parent.familyId].used,coachConfig.maxTurnMicroUsd);
 assert.equal(state.audit[0].code,'COACH_INTERRUPTED');
 assert.equal(state.coachReceipts![0].reply,undefined);
});

test('old-month settlement releases carried reservations without consuming the new month allowance',async t=>{
 const {repo,parent,clock,month}=await fixture(t);
 const oldMonth=month==='2026-01'?'2025-12':'2020-01';
 await repo.transaction(state=>{
  state.ledgers[parent.familyId].used=77;
  state.ledgers[parent.familyId].reserved=11000;
  state.coachReceipts=[{id:'old-month',familyId:parent.familyId,subject:parent.subject,hash:'fixture',month:oldMonth,
   at:clock.now-PAID_RECEIPT_LEASE_MS,reserved:10000,state:'running'}];
  state.audioReceipts=[{id:'audio-still-running',familyId:parent.familyId,subject:parent.subject,month,
   at:clock.now,reserved:1000,state:'running'}];
  return true;
 });
 const state=await reconcilePaidReceipts(repo,parent);
 assert.equal(state.ledgers[parent.familyId].used,77);
 assert.equal(state.ledgers[parent.familyId].reserved,1000);
 assert.equal(state.audioReceipts![0].state,'running');
 assert.equal(state.audit[0].usage?.month,oldMonth);
 assert.equal(state.audit[0].usage?.usedMicroUsd,10000);
});

test('family recovery requires a current trusted device and does not settle another family',async t=>{
 const {repo,parent,clock,month}=await fixture(t);
 await repo.transaction(state=>{
  state.coachReceipts=[{id:'other-family',familyId:'other-family',subject:'other',hash:'fixture',month,
   at:clock.now-PAID_RECEIPT_LEASE_MS,reserved:10000,state:'running'}];
  return true;
 });
 await assert.rejects(reconcilePaidReceipts(repo,{...parent,deviceId:'unknown-device'}),/UNAUTHENTICATED/);
 const state=await reconcilePaidReceipts(repo,parent);
 assert.equal(state.coachReceipts![0].state,'running');
 assert.equal(state.audit.length,0);
});
