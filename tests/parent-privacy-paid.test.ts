import assert from 'node:assert/strict';
import {test} from 'node:test';
import {MemoryRepository} from '../server/pipeline/repository';
import {JobService} from '../server/pipeline/service';
import {ActionCoordinator} from '../server/actions/coordinator';
import {CoachService,type CoachConfig} from '../server/coach/service';
import {CoachAudioService,type SpeechConfig} from '../server/coach/speech';
import {PARENT_PRIVACY_NOTICE_VERSION,submitParentPrivacyChoice,recordExternalGuardianVerification,revokeParentPrivacyChoice,verifiedParentScope} from '../server/privacy/parent-consent';
import type {VerifiedSession} from '../server/contracts/api';
import type {AgentApproval} from '../server/agent/openai';
import type {AgentAdapter} from '../server/pipeline/types';
import {stickerLaunchFixture} from '../server/testing/working-game-fixtures';
import {syntheticQualityEvidence,syntheticQualityReview} from '../server/testing/presentation-quality-fixtures';
import {productionFixture,compiledPipelineFixture,testedPipelineFixture} from './quality-pipeline-fixtures';

const familyId='child-parent-release',deviceId='11111111-2222-3333-4444-555555555555';
const parent:VerifiedSession={subject:'verified-parent',role:'parent',familyId,deviceId,expiresAt:Date.now()+3600000};
const child:VerifiedSession={subject:'family-designer',role:'designer',familyId,deviceId,expiresAt:Date.now()+3600000};
const selection={noticeVersion:PARENT_PRIVACY_NOTICE_VERSION,guardianAffirmed:true,providerAcknowledged:true,
 scopes:{generation:true,conversation:true,remoteSpeech:true}};
async function fixture(){
 const repo=new MemoryRepository();await repo.transaction(s=>{
  s.devices=[{id:deviceId,familyId,name:'Parent-reviewed family tablet',rotation:0,
   secretHash:'a'.repeat(64),createdAt:Date.now()-60000,lastSeenAt:Date.now(),expiresAt:Date.now()+86400000}];
  s.ledgers[familyId]={allowance:300000,paidEnabled:true,
   month:new Date().toISOString().slice(0,7),used:0,reserved:0};
  return true;
 });return repo;
}
async function verify(repo:MemoryRepository){
 const draft=await submitParentPrivacyChoice(repo,parent,selection);
 assert.equal(draft.status,'pending');
 await recordExternalGuardianVerification(repo,{familyId,choiceId:draft.choiceId,
  receipt:'external-guardian-record-123',verifiedByOwner:true});
 return draft.choiceId;
}
const build=(id:string)=>({gameId:'new',baseRevisionId:null,prompt:'Build a rocket that flies',clientRequestId:id});
function jobService(repo:MemoryRepository){
 const agent={kind:'metered-api' as const,available:true,generate:async()=>{throw Error('PROVIDER_NOT_CALLED');}};
 const gate={test:async()=>{throw Error('SANDBOX_NOT_CALLED');}};
 return new JobService(repo,agent,gate,{allowMock:false,maxUnits:100,timeoutMs:60000,
  maxRetries:2,requireVerifiedParentPrivacy:true});
}
const approval:AgentApproval={enabled:true,approvalId:'fixture',model:'fixture-model',
 inputUsdPerMillion:1,outputUsdPerMillion:1,maxInputTokens:64000,
 maxOutputTokens:4000,priceReviewedOn:new Date().toISOString().slice(0,10)};
const identity=(stage:'generate'|'test'|'review',runId:string)=>({stage,runId,repositoryId:'42',sha:'a'.repeat(40)});
test('parent verified generation scope is mandatory before every new paid build',async()=>{
 const repo=await fixture(),service=jobService(repo);
 assert.equal((await service.readiness(child)).available,false);
 await assert.rejects(service.submit(child,build('pre-consent')),/GUARDIAN_CONSENT_REQUIRED/);
 assert.equal((await repo.snapshot()).jobs.length,0);
 assert.equal((await repo.snapshot()).ledgers[familyId].reserved,0);
 await verify(repo);
 assert.equal(verifiedParentScope(await repo.snapshot(),familyId,'generation'),true);
 assert.equal((await service.readiness(child)).available,true);
 const ack=await service.submit(child,build('after-consent'));
 assert.equal(ack.status,'queued');
 assert.equal((await repo.snapshot()).jobs.length,1);
 await revokeParentPrivacyChoice(repo,parent);
 assert.equal((await service.readiness(child)).available,false);
 await assert.rejects(service.submit(child,build('after-withdrawal')),/GUARDIAN_CONSENT_REQUIRED/);
});
test('private worker refuses revoked parent consent at claim and report; never promotes ready',async()=>{
 const repo=await fixture(),service=jobService(repo);
 await verify(repo);
 const ack=await service.submit(child,build('worker-revocation'));
 const coordinator=new ActionCoordinator(repo,{dispatch:async()=>{}},approval,900000,true);
 await coordinator.enqueue(ack.jobId);
 await coordinator.tick();
 const gen=identity('generate','first-worker-run');
 const claimed=await coordinator.claim(ack.jobId,0,'generate',gen);
 assert.equal(claimed.input?.childIntent,'Build a rocket that flies');
 await revokeParentPrivacyChoice(repo,parent);
 await assert.rejects(coordinator.claim(ack.jobId,0,'generate',identity('generate','second-worker-run')),/WORKER_CLAIM_REJECTED/,
  'a different run ID is rejected before the consent check');
 await assert.rejects(coordinator.claim(ack.jobId,0,'generate',gen),/GUARDIAN_CONSENT_REQUIRED/,
  'even the existing authorized worker cannot continue after revocation');
 await coordinator.report(ack.jobId,0,'generate',gen,{errorCode:'PROVIDER_FAILED'});
 const state=await repo.snapshot();
 const job=state.jobs.find(x=>x.id===ack.jobId);
 assert.equal(job?.status,'failed');
 assert.equal(job?.errorCode,'GUARDIAN_CONSENT_REQUIRED');
 assert.equal(state.revisions.length,0);
});
// Synthetic source, technical attestation, captures and reviewer reply establish
// consent enforcement only. They are not evidence of game or visual quality.
const qualityGame=productionFixture(stickerLaunchFixture,build('quality-fixture').prompt);
const generated={candidate:{format:'generated-source-v1' as const,game:qualityGame},usageUnits:1};
const compiled=compiledPipelineFixture(qualityGame),qualityEvidence=syntheticQualityEvidence(compiled);
const reviewed={review:syntheticQualityReview(compiled,qualityEvidence),usageUnits:1};
for(const boundary of ['review claim','review report'] as const)for(const reason of ['withdrawal','expiry'] as const){
 test(`parent ${reason} blocks ${boundary}, withholds screenshots/publication and settles once`,async()=>{
  const repo=await fixture(),service=jobService(repo);await verify(repo);
  const ack=await service.submit(child,build('quality-'+boundary.replace(' ','-')+'-'+reason));
  const coordinator=new ActionCoordinator(repo,{dispatch:async()=>{}},approval,900000,true),run='consent-quality-worker';
  await coordinator.enqueue(ack.jobId);await coordinator.claim(ack.jobId,0,'generate',identity('generate',run));
  await coordinator.report(ack.jobId,0,'generate',identity('generate',run),generated);
  await coordinator.claim(ack.jobId,0,'test',identity('test',run));
  await coordinator.report(ack.jobId,0,'test',identity('test',run),{ok:true,game:compiled,qualityEvidence});
  assert.equal((await service.get(child,ack.jobId)).phase,'reviewing');assert.equal((await repo.snapshot()).revisions.length,0);
  if(boundary==='review report'){
   const task=await coordinator.claim(ack.jobId,0,'review',identity('review',run));assert.ok('qualityEvidence'in task);assert.deepEqual(task.qualityEvidence,qualityEvidence);
  }
  if(reason==='withdrawal')await revokeParentPrivacyChoice(repo,parent);
  else await repo.transaction(s=>{s.parentPrivacyChoices!.at(-1)!.expiresAt=Date.now()-1;return true;});
  if(boundary==='review claim'){
   await assert.rejects(coordinator.claim(ack.jobId,0,'review',identity('review',run)),/GUARDIAN_CONSENT_REQUIRED/);
   await coordinator.tick();
  }else await coordinator.report(ack.jobId,0,'review',identity('review',run),reviewed);
  for(let repeat=0;repeat<2;repeat++){
   const s=await repo.snapshot(),job=s.jobs.find(j=>j.id===ack.jobId)!;
   assert.equal(job.status,'failed');assert.equal(job.errorCode,'GUARDIAN_CONSENT_REQUIRED');assert.equal(job.execution?.candidate,undefined);assert.equal(job.execution?.qualityEvidence,undefined);
   assert.equal(s.revisions.length,0);assert.deepEqual(s.active,{});assert.equal(s.ledgers[familyId].reserved,0);assert.equal(s.ledgers[familyId].used,100);
   await coordinator.tick();
  }
  if(boundary==='review report')await assert.rejects(coordinator.report(ack.jobId,0,'review',identity('review',run),reviewed),/WORKER_REPORT_REJECTED/);
 });
}
for(const boundary of ['sandbox capture','review'] as const)test(`local parent withdrawal during ${boundary} cannot release further evidence or publish`,async()=>{
 const repo=await fixture();await verify(repo);let reviews=0,repairs=0;
 const agent:AgentAdapter={kind:'metered-api',available:true,generate:async()=>generated,
  repair:async()=>{repairs++;return generated;},review:async()=>{reviews++;await revokeParentPrivacyChoice(repo,parent);return reviewed;}};
 const service=new JobService(repo,agent,{test:async()=>{if(boundary==='sandbox capture')await revokeParentPrivacyChoice(repo,parent);return testedPipelineFixture(qualityGame);}},{allowMock:false,maxUnits:100,timeoutMs:60000,maxRetries:2,requireVerifiedParentPrivacy:true});
 const ack=await service.submit(child,build('local-'+boundary.replace(' ','-')));await service.run(ack.jobId);
 assert.equal(reviews,boundary==='review'?1:0);assert.equal(repairs,0);
 const s=await repo.snapshot(),job=s.jobs.find(j=>j.id===ack.jobId)!;assert.equal(job.status,'failed');assert.equal(job.errorCode,'GUARDIAN_CONSENT_REQUIRED');assert.equal(job.execution?.qualityEvidence,undefined);assert.equal(s.revisions.length,0);assert.equal(s.ledgers[familyId].reserved,0);assert.equal(s.ledgers[familyId].used,100);
 await service.run(ack.jobId);assert.equal((await repo.snapshot()).ledgers[familyId].used,100);
});
test('child coach and remote audio require the new notice as well as legacy model/audio consent',async()=>{
 const repo=await fixture();
 const coachConfig:CoachConfig={
  enabled:true,privacyApproved:true,moderationApproved:true,zdrVerified:true,
  privateExecutionApproved:true,model:'fixture',
  maxInputChars:16000,maxOutputTokens:600,maxTurnMicroUsd:10000,
  inputMicroUsdPerMillion:1,outputMicroUsdPerMillion:1,
  pricesReviewedAt:new Date().toISOString(),requireVerifiedParentPrivacy:true
 };
 const speechConfig:SpeechConfig={
  approved:true,privacyApproved:true,providerApproved:true,parentConsentApproved:true,
  projectId:'child-speech-project',maxMicroUsd:2000,pricesReviewedAt:new Date().toISOString(),
  requireVerifiedParentPrivacy:true
 };
 const coach=new CoachService(repo,coachConfig,{
  readiness:async()=>true,complete:async()=>{throw Error('MUST_NOT_SEND_CHILD_BEFORE_NOTICE');}
 });
 const speech=new CoachAudioService(repo,speechConfig,{
  readiness:async()=>true,transcribe:async()=>{throw Error('MUST_NOT_SEND_AUDIO_BEFORE_NOTICE');}
 });
 // Older operator-written authorization cannot override the new notice requirement.
 await repo.transaction(s=>{s.coachConsent=[{familyId,guardianSubject:parent.subject,
  confirmedAt:Date.now(),expiresAt:Date.now()+3600000,policyVersion:'owner-pilot-1',
  model:true,audio:true,verificationReceipt:'fixture-legacy-approval'}];return true;});
 assert.equal(await coach.ready(child),false);
 assert.equal(await speech.familyAvailable(child),false);
 await verify(repo);
 assert.equal(await coach.ready(child),true);
 assert.equal(await speech.familyAvailable(child),true);
 await revokeParentPrivacyChoice(repo,parent);
 assert.equal(await coach.ready(child),false);
 assert.equal(await speech.familyAvailable(child),false);
});
