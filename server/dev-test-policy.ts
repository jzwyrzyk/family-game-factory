/** Adult-operated synthetic product tests, never guardian consent or ZDR evidence. */
import {randomUUID} from 'node:crypto';
import type {VerifiedSession} from './contracts/api';
import type {Job,PipelineState,Repository} from './pipeline/types';
import {currentDevAccess,requireDevPolicy,type DevAccessPolicy} from './dev-access';
export interface DevTestGrant {
 id:string;familyId:string;deviceId:string;subjectHash:string;policyId:string;
 createdAt:number;expiresAt:number;revokedAt?:number;
}
export interface DevSpend {admittedMicroUsd:number}
const activeDevice=(state:PipelineState,familyId:string,deviceId:string,now:number)=>state.devices?.some(d=>
 d.id===deviceId&&d.familyId===familyId&&d.revokedAt===undefined&&d.expiresAt>now&&d.lastSeenAt+90*86400000>now)===true;
export const hasAdultSession=(session:VerifiedSession)=>session.adultSessionId!==undefined||session.adultProfileId!==undefined;
export const hasAdultJob=(job:Job)=>job.adultPilotDeviceId!==undefined||job.adultPilotSessionId!==undefined||job.adultPilotProfileId!==undefined;
export const hasDevJob=(job:Job)=>job.devTestGrantId!==undefined||job.devTestDeviceId!==undefined||job.devTestPolicyId!==undefined;
function grantAllowed(state:PipelineState,grantId:string|undefined,deviceId:string|undefined,familyId:string,
 policy:DevAccessPolicy|undefined,now:number){
 if(!policy||now>=policy.allowanceExpiresAt||!grantId||!deviceId||familyId!==policy.syntheticFamilyId)return false;
 requireDevPolicy(policy);
 const grant=state.devTestGrants?.find(g=>g.id===grantId);
 return !!grant&&grant.familyId===familyId&&grant.deviceId===deviceId&&grant.policyId===policy.policyId&&
  grant.revokedAt===undefined&&Number.isSafeInteger(grant.createdAt)&&Number.isSafeInteger(grant.expiresAt)&&
  grant.createdAt<=now&&grant.expiresAt>now&&grant.expiresAt<=grant.createdAt+3600000&&
  policy.adultIdentityHashes.includes(grant.subjectHash)&&activeDevice(state,familyId,deviceId,now);
}
export async function attachDevTestSession(repo:Repository|undefined,session:VerifiedSession,now=Date.now()):Promise<VerifiedSession>{
 const context=currentDevAccess();if(!context)return session;
 const {policy,identity}=context;
 if(!repo||!session.deviceId||session.role!=='designer'||hasAdultSession(session)||session.familyId!==policy.syntheticFamilyId||session.expiresAt<=now||identity.expiresAt<=now-30000)
  throw Error('DEV_TEST_ACCESS_REQUIRED');
 const grantId=await repo.transaction(state=>{
  if(!activeDevice(state,session.familyId,session.deviceId!,now))throw Error('UNAUTHENTICATED');
  state.devTestGrants??=[];
  // Never extend an old grant: renewal must not resurrect its in-flight jobs.
  state.devTestGrants=state.devTestGrants.filter(g=>g.expiresAt>now&&g.revokedAt===undefined);
  const existing=state.devTestGrants.find(g=>g.familyId===session.familyId&&g.deviceId===session.deviceId&&
   g.subjectHash===identity.subjectHash&&g.policyId===policy.policyId);
  if(existing)return existing.id;
  if(state.devTestGrants.length>=120)throw Error('DEV_TEST_ACCESS_REQUIRED');
  const grant:DevTestGrant={id:randomUUID(),familyId:session.familyId,deviceId:session.deviceId!,subjectHash:identity.subjectHash,
   policyId:policy.policyId,createdAt:now,expiresAt:Math.min(session.expiresAt,now+3600000)};
  state.devTestGrants.push(grant);return grant.id;
 });
 return {...session,devTestGrantId:grantId};
}
export function devTestAllowed(state:PipelineState,session:VerifiedSession,policy:DevAccessPolicy|undefined,now=Date.now()){
 return session.role==='designer'&&session.expiresAt>now&&!hasAdultSession(session)&&
  grantAllowed(state,session.devTestGrantId,session.deviceId,session.familyId,policy,now);
}
export function devTestJobAllowed(state:PipelineState,job:Job,policy:DevAccessPolicy|undefined,now=Date.now()){
 return !hasAdultJob(job)&&!!policy&&job.devTestPolicyId===policy.policyId&&
  grantAllowed(state,job.devTestGrantId,job.devTestDeviceId,job.familyId,policy,now);
}
function admitted(state:PipelineState){
 if(state.devSpend){if(!Number.isSafeInteger(state.devSpend.admittedMicroUsd)||state.devSpend.admittedMicroUsd<0)throw Error('DEV_BUDGET_STATE_REQUIRED');return state.devSpend.admittedMicroUsd;}
 if(state.jobs.some(j=>j.maxUnits>0)||(state.coachReceipts?.length??0)>0||(state.audioReceipts?.length??0)>0||(state.narrationReceipts?.length??0)>0||
  Object.values(state.ledgers).some(l=>l.used!==0||l.reserved!==0))throw Error('DEV_BUDGET_STATE_REQUIRED');
 return 0;
}
export function devCapacityAvailable(state:PipelineState,policy:DevAccessPolicy|undefined,amount:number){
 if(!policy)return true;requireDevPolicy(policy);
 if(Date.now()>=policy.allowanceExpiresAt||!Number.isSafeInteger(amount)||amount<0)return false;
 if(state.jobs.some(j=>['draft','queued','building','testing'].includes(j.status))||
  state.coachReceipts?.some(r=>r.state==='running')||state.audioReceipts?.some(r=>r.state==='running')||state.narrationReceipts?.some(r=>r.state==='running'))return false;
 try{return admitted(state)+amount<=policy.maxTotalMicroUsd;}catch{return false;}
}
/** Maximum-cost admissions are permanent. Uncertain calls, failures and a
 * month rollover cannot silently refill this explicitly authorized DEV cap. */
export function reserveDevSpend(state:PipelineState,policy:DevAccessPolicy|undefined,amount:number){
 if(!policy)return;requireDevPolicy(policy);
 if(!devCapacityAvailable(state,policy,amount))throw Error('SPENDING_CUTOFF');
 state.devSpend={admittedMicroUsd:admitted(state)+amount};
}

/** Charge an additional premium repair hold for the already admitted job.
 * No second operation is admitted; the family and lineage gates remain upstream. */
export function reserveDevRepair(state:PipelineState,policy:DevAccessPolicy|undefined,job:Job,amount:number):boolean {
 if(!policy)return true;requireDevPolicy(policy);
 if(!state.jobs.includes(job)||!job.premiumPolicy||!hasAdultJob(job)||
  !['building','testing'].includes(job.status)||Date.now()>=policy.allowanceExpiresAt||
  !Number.isSafeInteger(amount)||amount<=0)return false;
 try{const total=admitted(state)+amount;if(total>policy.maxTotalMicroUsd)return false;
  state.devSpend={admittedMicroUsd:total};return true;}catch{return false;}
}
