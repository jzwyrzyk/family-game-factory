import assert from 'node:assert/strict';
import {test} from 'node:test';
import {MemoryRepository} from '../server/pipeline/repository';
import {adultPilotAllowed,adultPilotConfigured,adultPilotFlags,adultPilotJobAllowed,grantAdultPilot,revokeAdultPilot} from '../server/adult-pilot';
import {CoachService,approved,type CoachConfig} from '../server/coach/service';
import {CoachAudioService,speechApproved,type SpeechConfig} from '../server/coach/speech';
import {JobService} from '../server/pipeline/service';
import type {VerifiedSession} from '../server/contracts/api';

const familyId='adult-private-demo',deviceId='00000000-aaaa-bbbb-cccc-000000000111';
const adult={enabled:true,ownerApproved:true,restrictedHostVerified:true};
const session:VerifiedSession={familyId,deviceId,role:'designer',subject:'family-designer',expiresAt:Date.now()+600000};
function make(){
 const repo=new MemoryRepository();
 return repo;
}
async function seed(repo:MemoryRepository){
 await repo.transaction(s=>{
  s.devices=[{id:deviceId,familyId,name:'Owner laptop',secretHash:'a'.repeat(64),rotation:0,
   createdAt:Date.now()-5000,lastSeenAt:Date.now(),expiresAt:Date.now()+86400000}];
  s.ledgers[familyId]={month:new Date().toISOString().slice(0,7),allowance:500000,
   used:0,reserved:0,paidEnabled:true};
  return true;
 });
}
const config:CoachConfig={
 enabled:true,privacyApproved:true,moderationApproved:true,zdrVerified:false,privateExecutionApproved:true,
 adultPilot:adult,model:'fixture',maxInputChars:16000,maxOutputTokens:600,maxTurnMicroUsd:10000,
 inputMicroUsdPerMillion:100,outputMicroUsdPerMillion:100,pricesReviewedAt:new Date().toISOString()
};
const speechConfig:SpeechConfig={
 approved:true,privacyApproved:true,providerApproved:true,parentConsentApproved:false,adultPilot:adult,
 projectId:'adult-pilot-project',maxMicroUsd:2000,pricesReviewedAt:new Date().toISOString()
};
const context={message:'Make my spaceship bounce',mode:'discuss' as const,game:'new',plan:{},
 rules:'',friction:'',helpLevel:0,support:'brief' as const,conversation:[],observations:[],tests:[]};
const reply={move:'listen',text:'You can make a moving toy.',question:'A ball or a rocket?',
 suggestions:[],proposedChange:null,planSuggestions:[],childDecisions:[],evidenceIds:[]};
test('adult pilot is off by default and NEVER fabricates a child ZDR or consent claim',()=>{
 assert.deepEqual(adultPilotFlags({}),{enabled:false,ownerApproved:false,restrictedHostVerified:false});
 assert.equal(adultPilotConfigured({enabled:true,ownerApproved:true,restrictedHostVerified:false}),false);
 assert.equal(approved({...config,adultPilot:{...adult,restrictedHostVerified:false}}),false);
 assert.equal(approved({...config,adultPilot:{...adult,ownerApproved:false}}),false);
 assert.equal(approved({...config,adultPilot:{enabled:false,ownerApproved:true,restrictedHostVerified:true}}),false,
  'child mode keeps its existing ZDR requirement');
 assert.equal(speechApproved({...speechConfig,adultPilot:{enabled:false,ownerApproved:true,restrictedHostVerified:true}}),false,
  'child mode keeps separate parent speech approval');
 assert.equal(approved(config),true,'adult-specific owner+private-host review permits adult test without fake ZDR');
 assert.equal(speechApproved(speechConfig),true);
});
test('adult pilot requires exact trusted device and owner-enrolled, expiring receipt',async()=>{
 const repo=make();await seed(repo);
 assert.equal(adultPilotAllowed(await repo.snapshot(),session),false);
 assert.equal(await grantAdultPilot(repo,{familyId,deviceId,receipt:'owner-reviewed-adult-1',operatorConfirmedAdult:false,expiresAt:Date.now()+600000}).then(()=>true).catch(()=>false),false);
 assert.equal(await grantAdultPilot(repo,{familyId,deviceId,receipt:'owner-reviewed-adult-1',operatorConfirmedAdult:true,expiresAt:Date.now()+15*86400000}).then(()=>true).catch(()=>false),false);
 await grantAdultPilot(repo,{familyId,deviceId,receipt:'owner-reviewed-adult-1',operatorConfirmedAdult:true,expiresAt:Date.now()+86400000});
 assert.equal(adultPilotAllowed(await repo.snapshot(),session),true);
 assert.equal(adultPilotAllowed(await repo.snapshot(),{...session,deviceId:'00000000-aaaa-bbbb-cccc-000000000222'}),false);
 assert.equal(adultPilotAllowed(await repo.snapshot(),{...session,role:'parent'}),false);
 assert.equal(adultPilotAllowed(await repo.snapshot(),{...session,deviceId:undefined}),false);
 assert.equal(adultPilotJobAllowed(await repo.snapshot(),{familyId,adultPilotDeviceId:deviceId}),true);
 assert.equal(adultPilotJobAllowed(await repo.snapshot(),{familyId}),false);
 assert.ok(!JSON.stringify(await repo.snapshot()).includes('owner-reviewed-adult-1'),'no raw operator receipt in database');
 await revokeAdultPilot(repo,familyId,deviceId);
 assert.equal(adultPilotAllowed(await repo.snapshot(),session),false);
});
test('adult-only model and cloud speech require the permit at admission and after provider completes',async()=>{
 const repo=make();await seed(repo);
 let modelCalls=0,speechCalls=0;
 const model=new CoachService(repo,config,{
  readiness:async()=>true,complete:async()=>{modelCalls++;return {reply,usedMicroUsd:50};}
 });
 const mic=new CoachAudioService(repo,speechConfig,{
  readiness:async()=>true,transcribe:async()=>{speechCalls++;return 'Hello world';}
 });
 assert.equal(await model.ready(session),false);
 assert.equal(await mic.familyAvailable(session),false);
 await assert.rejects(model.respond(session,{requestId:'adult-try-1',context}),/COACH_UNAVAILABLE/);
 const wave=new Uint8Array(200);wave.set([0x1a,0x45,0xdf,0xa3],0);
 await assert.rejects(mic.transcribe(session,{id:'adult-test-111',mime:'audio/webm',audio:wave}),/AUDIO_UNAVAILABLE/);
 assert.equal(modelCalls,0);assert.equal(speechCalls,0);
 await grantAdultPilot(repo,{familyId,deviceId,receipt:'owner-reviewed-adult-2',operatorConfirmedAdult:true,expiresAt:Date.now()+86400000});
 assert.equal(await model.ready(session),true);
 assert.equal(await mic.familyAvailable(session),true);
 assert.equal((await model.respond(session,{requestId:'adult-try-2',context})).mode,'model');
 assert.equal((await mic.transcribe(session,{id:'adult-test-222',mime:'audio/webm',audio:wave})).text,'Hello world');
 assert.equal(modelCalls,1);assert.equal(speechCalls,1);
 await revokeAdultPilot(repo,familyId,deviceId);
 assert.equal(await model.ready(session),false);
 assert.equal(await mic.familyAvailable(session),false);
 await assert.rejects(model.respond(session,{requestId:'adult-try-2',context}),/COACH_UNAVAILABLE/,
  'cached paid response cannot bypass revocation');
});
test('adult remote model revocation while in flight does not return or cache response',async()=>{
 const repo=make();await seed(repo);
 await grantAdultPilot(repo,{familyId,deviceId,receipt:'owner-reviewed-adult-3',operatorConfirmedAdult:true,expiresAt:Date.now()+86400000});
 const service=new CoachService(repo,config,{complete:async()=>{
  await revokeAdultPilot(repo,familyId,deviceId);
  return {reply,usedMicroUsd:50};
 }});
 await assert.rejects(service.respond(session,{requestId:'adult-inflight-3',context}),/COACH_UNAVAILABLE/);
 const receipts=(await repo.snapshot()).coachReceipts;
 assert.equal(receipts?.[0]?.reply,undefined);
 assert.equal(receipts?.[0]?.state,'failed');
});
test('adult-only generated game admission binds the exact device and rejects nonadult clients',async()=>{
 const repo=make();await seed(repo);
 const mock={kind:'mock' as const,available:true,testFixture:true,generate:async()=>{throw Error('NOT_USED');}};
 const jobs=new JobService(repo,mock,{test:async()=>{}},{allowMock:true,maxUnits:0,timeoutMs:2000,maxRetries:2,adultPilotMode:true});
 const request={gameId:'new',baseRevisionId:null,prompt:'Make my rocket fly',clientRequestId:'adult-build-a'};
 assert.equal((await jobs.readiness(session)).available,false);
 await assert.rejects(jobs.submit(session,request),/ADULT_PILOT_ACCESS_REQUIRED/);
 await grantAdultPilot(repo,{familyId,deviceId,receipt:'owner-reviewed-adult-4',operatorConfirmedAdult:true,expiresAt:Date.now()+86400000});
 assert.equal((await jobs.readiness(session)).available,true);
 await jobs.submit(session,request);
 assert.equal((await repo.snapshot()).jobs[0].adultPilotDeviceId,deviceId);
 await revokeAdultPilot(repo,familyId,deviceId);
 await assert.rejects(jobs.submit(session,{...request,clientRequestId:'adult-build-b'}),/ADULT_PILOT_ACCESS_REQUIRED/);
});
