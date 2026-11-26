import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {betaFixture,fixtureKey} from './beta-fixture';
import {internalCookies,requirePlay,logout} from '../server/beta/access';
import {signSession} from '../server/pipeline/auth';
import {changeLearnerSetting,parentGuidance,withLearnerRequest} from '../server/beta/guidance';
import {defaultCapabilities,betaNotice} from '../server/beta/model';
import {submitParentPrivacyChoice,recordExternalGuardianVerification} from '../server/privacy/parent-consent';
import type {VerifiedSession} from '../server/contracts/api';

async function fixture(){
 const f=await betaFixture(),a=await f.enroll('guided-family'),other=await f.enroll('other-family');
 const profileId=randomUUID(),older=randomUUID();await f.d.withFamily(a.id,async(tx,family)=>{family.profiles=[profileId,older];tx.set(f.d.path(a.id),family);});
 const session=(await requirePlay(f.d,a.id,a.cookies,fixtureKey,'check')).session;
 const parent:VerifiedSession={...session,role:'parent'},cookies=internalCookies(a.cookies)+'; factory_parent='+signSession(parent,fixtureKey);
 const approve=async()=>{
  f.d.config.providerEvidence=[{scope:'generation',provider:'openai',notice:betaNotice,expiresAt:Date.now()+60000,privacyDigest:'a'.repeat(64),safetyDigest:'b'.repeat(64),zdrApproved:true}];
  await f.mutate('policy',a.id,{capabilities:{...defaultCapabilities(),generation:true},paused:false,generationPaused:false,monthlyCents:100});
  const choice=await submitParentPrivacyChoice(f.d.repository(a.id),parent,{noticeVersion:betaNotice,guardianAffirmed:true,providerAcknowledged:true,scopes:{generation:true,conversation:false,remoteSpeech:false}});
  await recordExternalGuardianVerification(f.d.repository(a.id),{familyId:a.id,choiceId:choice.choiceId,receipt:'synthetic-scope-proof',verifiedByOwner:true});
 };
 return {...f,a,other,profileId,older,session,parent,cookies,approve};
}
test('six canonical grades are parent-authorized CAS metadata; early release and all optional scopes remain separate',async()=>{
 const f=await fixture(),{d,a,profileId,cookies}=f;
 await assert.rejects(changeLearnerSetting(d,a.id,{profileId,grade:-1,expectedVersion:0},cookies,fixtureKey),/EARLY_RELEASE_REQUIRED/);
 d.config.earlyLearningPreview=true;
 await assert.rejects(changeLearnerSetting(d,a.id,{profileId,grade:-1,expectedVersion:0},internalCookies(a.cookies),fixtureKey),/UNAUTHENTICATED/);
 await assert.rejects(changeLearnerSetting(d,a.id,{profileId:f.older,grade:-1,expectedVersion:0},internalCookies(f.other.cookies),fixtureKey),/UNAUTHENTICATED/);
 let version=0;for(const grade of [-1,0,1,2,3,4]){const next=await changeLearnerSetting(d,a.id,{profileId,grade,expectedVersion:version},cookies,fixtureKey);assert.equal(next.grade,grade);version=next.version;}
 await assert.rejects(changeLearnerSetting(d,a.id,{profileId,grade:0,expectedVersion:0},cookies,fixtureKey),/PROFILE_VERSION_CONFLICT/);
 await changeLearnerSetting(d,a.id,{profileId,grade:0,expectedVersion:version},cookies,fixtureKey);
 await assert.rejects(parentGuidance(d,a.id,{profileId,supervise:true},cookies,fixtureKey),/EARLY_RELEASE_REQUIRED/);
 d.config.parentGuidedCreation=true;
 await assert.rejects(parentGuidance(d,a.id,{profileId,supervise:true},cookies,fixtureKey),/GUIDED_CREATION_SCOPE_REQUIRED/);
 const state=await d.repository(a.id).snapshot();assert.equal(state.jobs.length,0);assert.equal(state.revisions.length,0);assert.equal(state.parentPrivacyChoices?.length??0,0);
});
test('short parent-guided authority binds learner, device, grade version and verified scope at transactional admission',async()=>{
 const f=await fixture(),{d,a,profileId,cookies,session}=f;d.config.earlyLearningPreview=true;d.config.parentGuidedCreation=true;
 await changeLearnerSetting(d,a.id,{profileId,grade:-1,expectedVersion:0},cookies,fixtureKey);await f.approve();
 const grant=await parentGuidance(d,a.id,{profileId,supervise:true},cookies,fixtureKey);assert.ok('token'in grant);if(!('token'in grant))throw Error('Expected grant');
 assert.deepEqual(grant.scopes,['generation']);
 const saved=await d.withFamily(a.id,async(_tx,family)=>family);assert.ok(!JSON.stringify(saved).includes(grant.token));
 const context={session,profileId,token:grant.token,scope:'generation' as const};
 const admit=()=>d.repository(a.id).transaction(s=>{s.jobs.push({id:randomUUID(),familyId:a.id,gameId:'synthetic-game',baseRevisionId:null,prompt:'Synthetic supervised request',clientRequestId:randomUUID(),status:'queued',adapter:'mock',maxUnits:100,usedUnits:0,retryCount:0});s.ledgers[a.id].reserved+=100;return true;});
 await assert.rejects(withLearnerRequest({...context,token:undefined},admit),/PARENT_GUIDANCE_REQUIRED/);
 await assert.rejects(withLearnerRequest({...context,token:'copied-invalid-token'},admit),/PARENT_GUIDANCE_REQUIRED/);
 await assert.rejects(withLearnerRequest({...context,scope:'conversation'},admit),/GUARDIAN_CONSENT_REQUIRED/);
 await assert.rejects(withLearnerRequest({...context,profileId:randomUUID()},admit),/LEARNER_REQUIRED/);
 await withLearnerRequest(context,admit);
 const job=(await d.repository(a.id).snapshot()).jobs[0];assert.equal(job.learnerId,profileId);assert.equal(job.guidedCreation?.learnerId,profileId);assert.equal(job.guidedCreation?.deviceId,session.deviceId);
 await parentGuidance(d,a.id,{profileId,supervise:false},cookies,fixtureKey);
 const after=await d.repository(a.id).snapshot();assert.equal(after.jobs[0].status,'cancelled');assert.equal(after.jobs[0].errorCode,'PARENT_GUIDANCE_ENDED');assert.equal(after.ledgers[a.id].reserved,0);assert.equal(after.ledgers[a.id].used,100);
 await assert.rejects(withLearnerRequest(context,admit),/PARENT_GUIDANCE_REQUIRED/);
 const next=await parentGuidance(d,a.id,{profileId,supervise:true},cookies,fixtureKey);if(!('token'in next))throw Error('Expected grant');
 await changeLearnerSetting(d,a.id,{profileId,grade:0,expectedVersion:1},cookies,fixtureKey);
 await assert.rejects(withLearnerRequest({...context,token:next.token},admit),/PARENT_GUIDANCE_REQUIRED/);
 const finalGrant=await parentGuidance(d,a.id,{profileId,supervise:true},cookies,fixtureKey);if(!('token'in finalGrant))throw Error('Expected grant');
 await withLearnerRequest({...context,token:finalGrant.token},admit);
 await logout(d,a.id,a.cookies,fixtureKey,false);
 assert.equal((await d.withFamily(a.id,async(_tx,family)=>family)).parentGuidance?.length,0);
 assert.equal((await d.repository(a.id).snapshot()).jobs.at(-1)?.status,'cancelled');

});
test('expired supervision cannot publish work or survive notice renewal or revocation',async()=>{
 const f=await fixture(),{d,a,profileId,cookies,session}=f;d.config.earlyLearningPreview=true;d.config.parentGuidedCreation=true;
 await changeLearnerSetting(d,a.id,{profileId,grade:0,expectedVersion:0},cookies,fixtureKey);await f.approve();
 const grant=await parentGuidance(d,a.id,{profileId,supervise:true},cookies,fixtureKey);if(!('token'in grant))throw Error('Expected grant');
 const context={session,profileId,token:grant.token,scope:'generation' as const},write=()=>d.repository(a.id).transaction(()=>true);
 await d.withFamily(a.id,async(tx,family)=>{family.parentGuidance![0].expiresAt=Date.now()-1;tx.set(d.path(a.id),family);});
 await assert.rejects(withLearnerRequest(context,write),/PARENT_GUIDANCE_REQUIRED/);
 const fresh=await parentGuidance(d,a.id,{profileId,supervise:true},cookies,fixtureKey);if(!('token'in fresh))throw Error('Expected grant');
 await d.withFamily(a.id,async(tx,family)=>{family.guardian.participationRenewedAt=Date.now();tx.set(d.path(a.id),family);});
 await assert.rejects(withLearnerRequest({...context,token:fresh.token},write),/PARENT_GUIDANCE_REQUIRED/);
 await d.repository(a.id).transaction(s=>{s.devices!.find(device=>device.id===session.deviceId)!.revokedAt=Date.now();});
 await assert.rejects(withLearnerRequest({...context,token:fresh.token},write),/UNAUTHENTICATED/);
});
