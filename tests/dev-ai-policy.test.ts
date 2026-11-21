import assert from 'node:assert/strict';
import {test} from 'node:test';
import {generateKeyPair,SignJWT} from 'jose';
import {validateDevAccess,DevIapVerifier,runWithDevAccess,type DevAccessConfig} from '../server/dev-access';
import {devTestAllowed,devTestJobAllowed} from '../server/dev-test-policy';
import {MemoryRepository} from '../server/pipeline/repository';
import {JobService} from '../server/pipeline/service';
import {ActionCoordinator} from '../server/actions/coordinator';
import {signSession} from '../server/pipeline/auth';
import {verifyBrowserSession} from '../server/trusted-devices';
import {grantAdultPilot,beginAdultPilotSession,authenticateAdultPilotSession} from '../server/adult-pilot';
import {CoachService,type CoachConfig} from '../server/coach/service';
import {CoachAudioService,type SpeechConfig} from '../server/coach/speech';
import type {VerifiedSession} from '../server/contracts/api';
import type {AgentAdapter} from '../server/pipeline/types';
import {hopper} from '../server/testing/generated-fixtures';
import {compiledPipelineFixture} from './quality-pipeline-fixtures';

// All identities, adult operator records, provider replies and game attestations
// in this suite are synthetic fixtures. No cloud or live paid acceptance occurs.
const familyId='dev-synthetic',deviceId='00000000-aaaa-bbbb-cccc-000000000111';
const flags={enabled:true,ownerApproved:true,profileAccessVerified:true};
const key='synthetic-dev-session-key-not-a-real-secret';
const context={message:'Make a spaceship bounce',mode:'discuss',game:'new',plan:{},rules:'',
 friction:'',helpLevel:0,support:'brief',conversation:[],observations:[],tests:[]};
const reply={move:'listen',text:'The spaceship can bounce.',question:'How high?',suggestions:[],proposedChange:null,
 planSuggestions:[],childDecisions:[],evidenceIds:[]};
const coachConfig:CoachConfig={enabled:true,privacyApproved:true,moderationApproved:true,zdrVerified:false,
 privateExecutionApproved:true,adultPilot:flags,model:'synthetic-model',maxInputChars:16000,maxOutputTokens:600,
 maxTurnMicroUsd:10000,inputMicroUsdPerMillion:100,outputMicroUsdPerMillion:100,pricesReviewedAt:new Date().toISOString()};
const audioConfig:SpeechConfig={approved:true,privacyApproved:true,providerApproved:true,parentConsentApproved:false,
 adultPilot:flags,projectId:'jems-fixture-dev',maxMicroUsd:2000,pricesReviewedAt:new Date().toISOString()};
const approval={enabled:true,approvalId:'fixture-only',model:'synthetic-model',inputUsdPerMillion:1,
 outputUsdPerMillion:1,maxInputTokens:64000,maxOutputTokens:4000,priceReviewedOn:new Date().toISOString().slice(0,10)};
const build=(id:string)=>({gameId:'new',baseRevisionId:null,prompt:'Catch five stars',clientRequestId:id});
const audio=()=>{const bytes=new Uint8Array(200);bytes.set([0x1a,0x45,0xdf,0xa3]);return bytes;};

async function fixture(maxTotalMicroUsd=5000000){
 const config:DevAccessConfig={environment:'development',projectNumber:'234567890123',
  iapAudience:'/projects/234567890123/locations/us-east1/services/jems-dev-app',
  allowedAdults:[{subject:'accounts.google.com:123456789012345678901',email:'adult@example.com',operatorConfirmedAdult:true}],
  syntheticDataOnly:true,syntheticFamilyId:familyId,syntheticWorkspace:'dev-synthetic',workerOwner:'fixture-lab',
  workerOwnerId:'987654321',maxTotalMicroUsd};
 const policy=validateDevAccess(config,{projectId:'jems-fixture-dev',workspace:'dev-synthetic',familyId,
  artifactBucket:'jems-fixture-dev-artifacts',iapService:'jems-dev-app'},{FACTORY_ENVIRONMENT:'development'});
 const pair=await generateKeyPair('ES256');
 const jwt=await new SignJWT({email:config.allowedAdults[0].email}).setProtectedHeader({alg:'ES256'})
  .setSubject(config.allowedAdults[0].subject).setIssuer('https://cloud.google.com/iap').setAudience(config.iapAudience)
  .setIssuedAt().setExpirationTime('10m').sign(pair.privateKey);
 const identity=await new DevIapVerifier(policy,async()=>pair.publicKey).verify(jwt);
 const repo=new MemoryRepository(),now=Date.now();
 const child:VerifiedSession={familyId,deviceId,role:'designer',subject:'family-designer',expiresAt:now+86400000};
 await repo.transaction(s=>{
  s.devices=[{id:deviceId,familyId,name:'Synthetic fixture device',secretHash:'a'.repeat(64),rotation:0,
   createdAt:now-1000,lastSeenAt:now,expiresAt:now+86400000}];
  s.ledgers[familyId]={month:new Date().toISOString().slice(0,7),allowance:5000000,used:0,reserved:0,paidEnabled:true};
  return true;
 });
 const cookie='factory_session='+signSession(child,key);
 const attach=()=>runWithDevAccess(policy,identity,()=>verifyBrowserSession(repo,cookie,key));
 const session=await attach();
 const agent:AgentAdapter={kind:'metered-api',available:true,testFixture:true,
  generate:async()=>({candidate:{format:'declarative-v1',game:{kind:'star-catcher-v1',target:5,seconds:15}},usageUnits:100})};
 const service=(custom:AgentAdapter=agent,gate={test:async()=>{}})=>new JobService(repo,custom,gate,
  {allowMock:true,maxUnits:10000,timeoutMs:2000,maxRetries:2,adultPilotMode:true,devTestPolicy:policy});
 const coach=(complete=async()=>({reply,usedMicroUsd:50}))=>new CoachService(repo,{...coachConfig,devTestPolicy:policy},{complete});
 const speech=(transcribe=async()=>'Synthetic adult dictation')=>new CoachAudioService(repo,{...audioConfig,devTestPolicy:policy},{transcribe});
 const adult=async()=>{
  await grantAdultPilot(repo,{familyId,deviceId,receipt:'synthetic-operator-verified-adult-fixture',operatorConfirmedAdult:true,expiresAt:Date.now()+86400000});
  const opened=await repo.transaction(s=>beginAdultPilotSession(s,child));
  return authenticateAdultPilotSession(await repo.snapshot(),child,opened.cookieValue,opened.sessionToken);
 };
 return {repo,config,policy,identity,child,cookie,session,attach,agent,service,coach,speech,adult};
}

test('synthetic child-style sessions require signed IAP, the exact family, and an active trusted device',async()=>{
 const f=await fixture(),state=await f.repo.snapshot();
 assert.equal(devTestAllowed(state,f.session,f.policy),true);
 assert.equal(state.parentPrivacyChoices,undefined);assert.equal(state.coachConsent,undefined);
 assert.equal(state.adultPilotPermits,undefined,'a synthetic child test never creates a fabricated adult/guardian record');
 const ordinary=await verifyBrowserSession(f.repo,f.cookie,key);assert.equal(ordinary.devTestGrantId,undefined);
 await assert.rejects(f.service().submit(ordinary,build('no-iap')),/DEV_TEST_ACCESS_REQUIRED/);
 const forged='factory_session='+signSession({...f.child,devTestGrantId:f.session.devTestGrantId},key);
 assert.equal((await verifyBrowserSession(f.repo,forged,key)).devTestGrantId,undefined,'ambient cookies cannot carry DEV authorization');
 await assert.rejects(runWithDevAccess(f.policy,f.identity,()=>verifyBrowserSession(f.repo,
  'factory_session='+signSession({...f.child,familyId:'foreign-family',deviceId:undefined},key),key)),/DEV_TEST_ACCESS_REQUIRED/);
 await assert.rejects(runWithDevAccess(f.policy,f.identity,()=>verifyBrowserSession(f.repo,
  'factory_session='+signSession({...f.child,deviceId:undefined},key),key)),/DEV_TEST_ACCESS_REQUIRED/);
 await assert.rejects(runWithDevAccess(f.policy,f.identity,()=>verifyBrowserSession(f.repo,f.cookie,key,Date.now(),'bad-proof')),/ADULT_PILOT_ACCESS_REQUIRED/);
 await f.repo.transaction(s=>{s.devices![0].revokedAt=Date.now();return true;});
 await assert.rejects(f.attach(),/UNAUTHENTICATED/);
});

test('one DEV stack runs both policies with distinct provenance; partial or mixed authorization cannot fall through',async()=>{
 const f=await fixture(),jobs=f.service(),synthetic=await jobs.submit(f.session,build('synthetic-child'));
 await jobs.run(synthetic.jobId);
 let state=await f.repo.snapshot();assert.equal(state.jobs[0].status,'ready');
 assert.equal(state.jobs[0].devTestGrantId,f.session.devTestGrantId);assert.equal(state.jobs[0].adultPilotSessionId,undefined);
 assert.equal(state.revisions[0].devTestPolicyId,f.policy.policyId);assert.equal(state.parentPrivacyChoices,undefined);
 const adult=await f.adult(),actual=await jobs.submit(adult,build('actual-adult'));await jobs.run(actual.jobId);
 state=await f.repo.snapshot();assert.equal(state.jobs[1].status,'ready');assert.equal(state.jobs[1].adultPilotSessionId,adult.adultSessionId);
 assert.equal(state.jobs[1].devTestGrantId,undefined);assert.equal(state.revisions[1].adultPilotProfileId,adult.adultProfileId);
 for(const bad of [{...f.session,adultSessionId:''},{...f.session,adultProfileId:adult.adultProfileId},
  {...adult,adultProfileId:undefined},{...adult,adultSessionId:undefined},{...adult,devTestGrantId:f.session.devTestGrantId},
  {...f.session,devTestGrantId:''}]){
  await assert.rejects(jobs.submit(bad,build('bad-grant')),/DEV_TEST_ACCESS_REQUIRED|ADULT_PILOT_ACCESS_REQUIRED/);
  assert.equal(await f.coach().ready(bad),false);assert.equal(await f.speech().familyAvailable(bad),false);
 }
 const prod=new JobService(f.repo,f.agent,{test:async()=>{}},{allowMock:true,maxUnits:10000,timeoutMs:2000,maxRetries:2,adultPilotMode:true});
 await assert.rejects(prod.submit(f.session,build('dev-into-prod')),/DEV_TEST_ACCESS_REQUIRED/);
 await assert.rejects(prod.submit(f.child,build('ambient-child-into-prod')),/ADULT_PILOT_ACCESS_REQUIRED/);
 const prodCoach=new CoachService(f.repo,coachConfig,{complete:async()=>({reply,usedMicroUsd:50})});
 assert.equal(await prodCoach.ready(f.session),false);assert.equal(await prodCoach.ready(f.child),false);
});

test('expired, excessive, revoked or replaced DEV grants cannot authorize queued or running worker work',async()=>{
 for(const reason of ['expired','lifetime','fraction','revoked','policy','device'] as const){
  const f=await fixture(),jobs=f.service(),ack=await jobs.submit(f.session,build('worker-'+reason));let dispatches=0;
  const coordinator=new ActionCoordinator(f.repo,{dispatch:async()=>{dispatches++;}},approval,900000,false,true,f.policy);
  await coordinator.enqueue(ack.jobId);
  await f.repo.transaction(s=>{const grant=s.devTestGrants![0];
   if(reason==='expired')grant.expiresAt=Date.now()-1;
   if(reason==='lifetime')grant.expiresAt=grant.createdAt+3600001;
   if(reason==='fraction')grant.createdAt+=.5;
   if(reason==='revoked')grant.revokedAt=Date.now();
   if(reason==='policy')grant.policyId='foreign-policy';
   if(reason==='device')s.devices![0].revokedAt=Date.now();return true;
  });
  assert.equal(devTestJobAllowed(await f.repo.snapshot(),(await f.repo.snapshot()).jobs[0],f.policy),false);
  if(reason==='expired'||reason==='revoked')assert.notEqual((await f.attach()).devTestGrantId,f.session.devTestGrantId);
  await coordinator.tick();const state=await f.repo.snapshot();assert.equal(dispatches,0);
  assert.equal(state.jobs[0].status,'failed');assert.equal(state.jobs[0].errorCode,'DEV_TEST_ACCESS_REQUIRED');assert.equal(state.revisions.length,0);
  await assert.rejects(coordinator.claim(ack.jobId,0,'generate',{runId:'1',repositoryId:'2',sha:'a'.repeat(40),stage:'generate'}));
 }
});

test('revocation at sandbox completion cannot trigger a repair or publish a synthetic game',async()=>{
 const f=await fixture();let repairs=0;
 const agent:AgentAdapter={...f.agent,generate:async()=>({candidate:{format:'generated-source-v1',game:hopper},usageUnits:100}),
  repair:async()=>{repairs++;throw Error('MUST_NOT_REPAIR_AFTER_ACCESS_LOSS');}};
 const jobs=new JobService(f.repo,agent,{test:async()=>{
  await f.repo.transaction(s=>{s.devTestGrants![0].revokedAt=Date.now();return true;});return compiledPipelineFixture(hopper);
 }},{allowMock:true,maxUnits:10000,timeoutMs:2000,maxRetries:2,adultPilotMode:true,devTestPolicy:f.policy});
 const ack=await jobs.submit(f.session,build('late-sandbox'));await jobs.run(ack.jobId);
 const state=await f.repo.snapshot();assert.equal(state.jobs[0].errorCode,'DEV_TEST_ACCESS_REQUIRED');assert.equal(state.revisions.length,0);assert.equal(repairs,0);
 assert.equal(state.devSpend!.admittedMicroUsd,10000,'uncertain work never restores total authorization');
});

test('all AI paths share one durable nonrefilling DEV cap alongside the existing allowance',async()=>{
 const f=await fixture(23000),jobs=f.service();
 const ack=await jobs.submit(f.session,build('cap-job'));await jobs.run(ack.jobId);
 await f.coach().respond(f.session,{requestId:'cap-coach',context});
 await f.speech().transcribe(f.session,{id:'cap-audio',mime:'audio/webm',audio:audio()});
 let state=await f.repo.snapshot();assert.equal(state.devSpend!.admittedMicroUsd,22000);
 assert.equal(state.ledgers[familyId].used,2150,'ordinary ledger settles actual model usage and conservative speech usage');
 assert.equal(state.ledgers[familyId].reserved,0);
 await f.repo.transaction(s=>{s.ledgers[familyId].month='2000-01';return true;});
 await jobs.setAllowance({...f.child,role:'parent'},50000000,true);
 await assert.rejects(jobs.submit(f.session,build('after-month-change')),/SPENDING_CUTOFF/);
 await assert.rejects(f.coach().respond(f.session,{requestId:'after-topup',context}),/SPENDING_CUTOFF/);
 await assert.rejects(f.speech().transcribe(f.session,{id:'after-topup',mime:'audio/webm',audio:audio()}),/SPENDING_CUTOFF/);
 state=await f.repo.snapshot();assert.equal(state.devSpend!.admittedMicroUsd,22000);
 assert.equal(await f.coach().ready(f.session),false);assert.equal(await f.speech().familyAvailable(f.session),false);
});

test('racing generation, coach and speech reserve at most one paid request transactionally',async()=>{
 const f=await fixture();let release!:()=>void;const pending=new Promise<void>(resolve=>{release=resolve;});let calls=0;
 const coach=f.coach(async()=>{calls++;await pending;return {reply,usedMicroUsd:50};});
 const speech=f.speech(async()=>{calls++;await pending;return 'Fixture dictation';});
 const requests=[f.service().submit(f.session,build('racing-job')),coach.respond(f.session,{requestId:'racing-coach',context}),
  speech.transcribe(f.session,{id:'racing-audio',mime:'audio/webm',audio:audio()})];
 const resultsPromise=Promise.allSettled(requests);await f.repo.snapshot();release();
 const results=await resultsPromise;assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.ok(calls<=1);const state=await f.repo.snapshot();assert.equal(state.devSpend!.admittedMicroUsd,10000);
 assert.equal(state.jobs.length,1);assert.equal(state.coachReceipts?.length??0,0);assert.equal(state.audioReceipts?.length??0,0);
 await f.service().cancel(f.session,state.jobs[0].id);assert.equal((await f.repo.snapshot()).devSpend!.admittedMicroUsd,10000);
});

test('missing DEV accounting cannot refill a previously used or reserved workspace',async()=>{
 for(const field of ['used','reserved'] as const){
  const f=await fixture();await f.repo.transaction(s=>{s.ledgers[familyId][field]=1;return true;});
  await assert.rejects(f.service().submit(f.session,build('missing-accounting')),/SPENDING_CUTOFF/);
  await assert.rejects(f.coach().respond(f.session,{requestId:'missing-accounting',context}),/SPENDING_CUTOFF/);
  await assert.rejects(f.speech().transcribe(f.session,{id:'missing-accounting',mime:'audio/webm',audio:audio()}),/SPENDING_CUTOFF/);
  assert.equal((await f.repo.snapshot()).devSpend,undefined);
 }
});

test('coach and speech recheck a DEV grant at completion; a new grant cannot revive an old cached reply',async()=>{
 for(const kind of ['coach','speech'] as const){
  const f=await fixture();let calls=0;
  const expire=()=>f.repo.transaction(s=>{s.devTestGrants!.find(g=>g.id===f.session.devTestGrantId)!.expiresAt=Date.now()-1;return true;});
  if(kind==='coach'){
   const coach=f.coach(async()=>{calls++;if(calls===1)await expire();return {reply,usedMicroUsd:50};});
   await assert.rejects(coach.respond(f.session,{requestId:'late-reply',context}),/COACH_UNAVAILABLE/);
   let state=await f.repo.snapshot();assert.equal(state.coachReceipts![0].state,'failed');assert.equal(state.coachReceipts![0].reply,undefined);
   const renewed=await f.attach();assert.notEqual(renewed.devTestGrantId,f.session.devTestGrantId);
   await coach.respond(renewed,{requestId:'late-reply',context});assert.equal(calls,2);
   state=await f.repo.snapshot();assert.notEqual(state.coachReceipts![0].subject,state.coachReceipts![1].subject);
  }else{
   await assert.rejects(f.speech(async()=>{calls++;await expire();return 'Never publish expired transcript';})
    .transcribe(f.session,{id:'late-speech',mime:'audio/webm',audio:audio()}),/AUDIO_UNAVAILABLE/);
   const state=await f.repo.snapshot();assert.equal(state.audioReceipts![0].state,'failed');assert.equal(JSON.stringify(state).includes('Never publish expired transcript'),false);
  }
  assert.ok((await f.repo.snapshot()).devSpend!.admittedMicroUsd>0);
 }
});
