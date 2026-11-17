import assert from 'node:assert/strict';
import {MemoryRepository} from '../server/pipeline/repository';
import {CoachService,type CoachConfig} from '../server/coach/service';
import {CoachAudioService,type SpeechConfig} from '../server/coach/speech';
import {setOwnerCoachConsent} from '../server/coach/consent';
import type {CoachContext} from '../src/studio/design';

const origin='https://private-coach-example.a.run.app';
const family='cancellation-family',today=new Date().toISOString().slice(0,7);
const config:CoachConfig={
 enabled:true,privacyApproved:true,moderationApproved:true,zdrApproved:true,
 familyConsentApproved:true,brokerApproved:true,brokerOrigin:origin,
 model:'gpt-6-luna',maxInputChars:16000,maxOutputTokens:600,maxTurnMicroUsd:30000,
 inputMicroUsdPerMillion:100,outputMicroUsdPerMillion:100,pricesReviewedAt:new Date().toISOString()
};
const speech:SpeechConfig={approved:true,privacyApproved:true,parentApproved:true,brokerApproved:true,
 brokerOrigin:origin,projectId:'family-game-factory-jzw',maxMicroUsd:18000};
const context:CoachContext={message:'The dragon should sneeze spaghetti',mode:'discuss',game:'dragon',
 plan:{},friction:'',helpLevel:0,support:'balanced',rules:'Try a shield jump',
 conversation:[],observations:[],tests:[]};
const session={subject:'child-one',familyId:family,role:'designer' as const,expiresAt:Date.now()+60000};
const audio=Buffer.alloc(180);audio.set([0x1a,0x45,0xdf,0xa3]);
async function setup(){
 const repo=new MemoryRepository();
 await repo.transaction(s=>{s.ledgers[family]={allowance:150000,used:0,reserved:0,paidEnabled:true,month:today};return true;});
 await setOwnerCoachConsent(repo,{subject:'verified-guardian',familyId:family,role:'parent',expiresAt:Date.now()+60000},
  {familyId:family,verifiedByAdult:true,verificationReceipt:'synthetic-parent-proof-001',
   model:true,audio:true,expiresAt:Date.now()+30*86400000});
 return repo;
}
const aborted=(signal:AbortSignal)=>new Promise<never>((_,reject)=>{
 if(signal.aborted)return reject(Error('ABORTED'));
 signal.addEventListener('abort',()=>reject(Error('ABORTED')),{once:true});
});
async function run(){
 const repo=await setup(),controller=new AbortController();let entered=false;
 const service=new CoachService(repo,config,{complete:async(_,signal)=>{entered=true;return aborted(signal);}});
 const promise=service.respond(session,{requestId:'cancel-test-111',context},controller.signal);
 for(let i=0;i<10&&!entered;i++)await new Promise<void>(r=>setImmediate(r));
 assert.equal(entered,true,'the provider should have received the abort signal');
 controller.abort();await assert.rejects(promise,/ABORTED/);
 const state=await repo.snapshot(),receipt=state.coachReceipts?.find(x=>x.id==='cancel-test-111');
 assert.equal(receipt?.state,'failed');assert.equal(receipt?.reply,undefined);
 assert.equal(state.ledgers[family].reserved,0);assert.equal(state.ledgers[family].used,30000,
  'an unknown canceled paid turn is conservatively charged at the cap');
 console.log('PASS model request stops and settles its reservation after child cancellation');
 const audioRepo=await setup(),audioCtrl=new AbortController();let audioEntered=false;
 const stt=new CoachAudioService(audioRepo,speech,{transcribe:async(_bytes,_mime,signal)=>{audioEntered=true;return aborted(signal);}});
 const voice=stt.transcribe(session,{id:'cancel-voice-111',mime:'audio/webm',audio},audioCtrl.signal);
 for(let i=0;i<10&&!audioEntered;i++)await new Promise<void>(r=>setImmediate(r));
 assert.equal(audioEntered,true);audioCtrl.abort();await assert.rejects(voice,/ABORTED/);
 const speechState=await audioRepo.snapshot();
 assert.equal(speechState.ledgers[family].reserved,0);
 assert.equal(speechState.ledgers[family].used,18000);
 assert.equal(speechState.coachReceipts?.find(x=>x.id==='audio-cancel-voice-111')?.state,'failed');
 console.log('PASS private voice cancellation stops STT, reserves no future budget and retains no audio');
}
void run().catch(e=>{console.error(e);process.exitCode=1;});
