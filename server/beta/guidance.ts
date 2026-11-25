import {AsyncLocalStorage} from 'node:async_hooks';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {isGrade,isEarlyGrade,type Grade} from '../../src/learning/grades';
import {verifySession} from '../pipeline/auth';
import {cookieValue,assertActiveTrustedDevice} from '../trusted-devices';
import {verifiedParentScope} from '../privacy/parent-consent';
import {settleStoppedJob} from '../pipeline/premium-policy';
import type {PipelineState} from '../pipeline/types';
import type {VerifiedSession} from '../contracts/api';
import {activeFamily,betaNotice,participationNotice,type Family,type BetaConfig,type RemoteScope} from './model';
import {exact,liveSession} from './access';
import type {FamilyDirectory} from './store';

export interface LearnerSetting {grade:Grade;version:number}
export interface ParentGuidance {id:string;digest:string;profileId:string;deviceId:string;guardianId:string;gradeVersion:number;privacyChoiceId:string;renewalAt:number;notice:string;terms:string;expiresAt:number;scopes:RemoteScope[]}
export interface GuidedProvenance {grantId:string;learnerId:string;deviceId:string;gradeVersion:number;expiresAt:number}
interface LearnerRequest {session:VerifiedSession;profileId:string;token?:string;scope:RemoteScope}
const requestContext=new AsyncLocalStorage<LearnerRequest>();
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const setting=(f:Family,id:string):LearnerSetting=>{const value=f.profileSettings?.[id];if(!value)return {grade:1,version:0};if(!isGrade(value.grade)||!Number.isSafeInteger(value.version)||value.version<1)throw Error('LEARNER_SETTINGS_REQUIRED');return value;};
const enabled=(config:BetaConfig)=>config.earlyLearningPreview===true&&config.parentGuidedCreation===true;
const liveGrant=(f:Family,g:ParentGuidance,now:number)=>g.expiresAt>now&&g.guardianId===f.guardian.id&&g.notice===betaNotice&&g.terms===participationNotice&&g.renewalAt===(f.guardian.participationRenewedAt??0)&&g.gradeVersion===setting(f,g.profileId).version;
function requireParent(f:Family,s:PipelineState,cookies:string|undefined,key:string,now:number){
 const session=liveSession(f,s,cookies,key,now),parent=verifySession(cookieValue(cookies,'factory_parent'),key,now);
 if(parent.role!=='parent'||parent.familyId!==f.id||parent.deviceId!==session.deviceId)throw Error('PARENT_UNLOCK_REQUIRED');
 return {session,parent};
}
export async function changeLearnerSetting(d:FamilyDirectory,id:string,input:unknown,cookies:string|undefined,key:string,now=Date.now()){
 exact(input,['profileId','grade','expectedVersion']);
 if(typeof input.profileId!=='string'||!isGrade(input.grade)||!Number.isSafeInteger(input.expectedVersion)||Number(input.expectedVersion)<0)throw Error('INVALID_REQUEST');
 const {profileId,grade}=input;
 return d.withFamily(id,async(tx,f,p)=>{
  activeFamily(f,p);if(!f.profiles?.includes(profileId))throw Error('FORBIDDEN');
  if(isEarlyGrade(grade)&&d.config.earlyLearningPreview!==true)throw Error('EARLY_RELEASE_REQUIRED');
  await d.inWorkspace(tx,f,p,s=>requireParent(f,s,cookies,key,now),false);
  const previous=setting(f,profileId);if(previous.version!==input.expectedVersion||previous.version===Number.MAX_SAFE_INTEGER)throw Error('PROFILE_VERSION_CONFLICT');
  const next=previous.grade===grade&&previous.version>0?previous:{grade,version:previous.version+1};
  f.profileSettings={...f.profileSettings,[profileId]:next};
  if(next.version!==previous.version)f.parentGuidance=(f.parentGuidance??[]).filter(g=>g.profileId!==profileId);
  // Commit any guidance cancellation with the settings change and its spending settlement.
  await d.inWorkspace(tx,f,p,()=>true,true);tx.set(d.path(f.id),f);return next;
 });
}
export async function parentGuidance(d:FamilyDirectory,id:string,input:unknown,cookies:string|undefined,key:string,now=Date.now()){
 exact(input,['profileId','supervise']);
 if(typeof input.profileId!=='string'||typeof input.supervise!=='boolean')throw Error('INVALID_REQUEST');
 const {profileId,supervise}=input;
 return d.withFamily(id,async(tx,f,p)=>{
  activeFamily(f,p);if(!f.profiles?.includes(profileId))throw Error('FORBIDDEN');
  const {session,parent,scopes,privacyChoiceId}=await d.inWorkspace(tx,f,p,s=>({...requireParent(f,s,cookies,key,now),privacyChoiceId:s.parentPrivacyChoices?.filter(c=>c.familyId===id).at(-1)?.id,scopes:(['conversation','generation','remoteSpeech'] as const).filter(scope=>verifiedParentScope(s,id,scope,now))}),false);
  f.parentGuidance=(f.parentGuidance??[]).filter(g=>liveGrant(f,g,now)&&!(g.profileId===profileId&&g.deviceId===session.deviceId));
  if(!supervise){await d.inWorkspace(tx,f,p,()=>true,true);tx.set(d.path(id),f);return {ended:true};}
  if(!enabled(d.config))throw Error('EARLY_RELEASE_REQUIRED');
  const learner=setting(f,profileId);if(!privacyChoiceId||!isEarlyGrade(learner.grade)||!scopes.some(scope=>scope==='conversation'||scope==='generation'))throw Error('GUIDED_CREATION_SCOPE_REQUIRED');
  if(f.parentGuidance.length>=96)throw Error('BETA_CAPACITY');
  const token=randomBytes(32).toString('base64url'),grant:ParentGuidance={id:randomUUID(),digest:hash(token),profileId,deviceId:session.deviceId!,guardianId:f.guardian.id,gradeVersion:learner.version,privacyChoiceId,renewalAt:f.guardian.participationRenewedAt??0,notice:betaNotice,terms:participationNotice,expiresAt:Math.min(now+15*60000,parent.expiresAt,session.expiresAt),scopes};
  f.parentGuidance.push(grant);tx.set(d.path(id),f);return {token,profileId,expiresAt:grant.expiresAt,scopes};
 });
}
/** Request context carries no authority until rechecked inside the workspace transaction. */
export function withLearnerRequest<T>(context:LearnerRequest,fn:()=>Promise<T>){return requestContext.run(context,fn);}
export function assertLearnerWrite(f:Family,s:PipelineState,config:BetaConfig,now=Date.now()){
 const request=requestContext.getStore();if(!request)return;
 if(request.session.familyId!==f.id||!f.profiles?.includes(request.profileId))throw Error('LEARNER_REQUIRED');
 assertActiveTrustedDevice(s,request.session,now);
 if(!verifiedParentScope(s,f.id,request.scope,now))throw Error('GUARDIAN_CONSENT_REQUIRED');
 if(!f.profileSettings?.[request.profileId])throw Error('LEARNER_SETTINGS_REQUIRED');
 const learner=setting(f,request.profileId);
 if(isEarlyGrade(learner.grade)){
  const grant=(f.parentGuidance??[]).find(g=>g.profileId===request.profileId&&g.deviceId===request.session.deviceId&&g.digest===hash(request.token??'')&&g.scopes.includes(request.scope)&&g.privacyChoiceId===s.parentPrivacyChoices?.filter(c=>c.familyId===f.id).at(-1)?.id&&liveGrant(f,g,now));
  if(!enabled(config)||!grant)throw Error('PARENT_GUIDANCE_REQUIRED');
 }
}
export function attributeLearnerJobs(f:Family,s:PipelineState,start:number){
 const request=requestContext.getStore();if(!request)return;
 const grant=(f.parentGuidance??[]).find(g=>g.profileId===request.profileId&&g.deviceId===request.session.deviceId&&g.digest===hash(request.token??''));
 for(const job of s.jobs.slice(start)){
  job.learnerId=request.profileId;
  if(grant&&isEarlyGrade(setting(f,request.profileId).grade))job.guidedCreation={grantId:grant.id,learnerId:request.profileId,deviceId:grant.deviceId,gradeVersion:grant.gradeVersion,expiresAt:grant.expiresAt};
 }
}
export function reconcileGuidedJobs(f:Family,s:PipelineState,config:BetaConfig,now=Date.now()){
 for(const job of s.jobs){
  if(!job.guidedCreation||!['queued','building','testing'].includes(job.status))continue;
  const g=(f.parentGuidance??[]).find(g=>g.id===job.guidedCreation!.grantId);
  if(enabled(config)&&g&&liveGrant(f,g,now)&&g.privacyChoiceId===s.parentPrivacyChoices?.filter(c=>c.familyId===f.id).at(-1)?.id&&verifiedParentScope(s,f.id,'generation',now)&&s.devices?.some(device=>device.id===g.deviceId&&device.familyId===f.id&&device.revokedAt===undefined&&device.expiresAt>now&&device.lastSeenAt+90*86400000>now))continue;
  settleStoppedJob(s,job);job.status='cancelled';job.errorCode='PARENT_GUIDANCE_ENDED';
  if(job.execution){delete job.execution.candidate;delete job.execution.qualityEvidence;}
  s.audit.push({jobId:job.id,familyId:f.id,status:'cancelled',at:new Date(now).toISOString(),code:'PARENT_GUIDANCE_ENDED'});
 }
}
