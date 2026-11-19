/** Parent-visible privacy choices. This is NOT age or guardian verification.
 * Parent clicks create PENDING records only; an independent owner-controlled,
 * externally verified receipt is needed before any provider consent activates.
 */
import {createHash,randomUUID} from 'node:crypto';
import type {PipelineState,Repository} from '../pipeline/types';
import type {VerifiedSession} from '../contracts/api';
import {assertActiveTrustedDevice} from '../trusted-devices';
import type {FamilyCoachConsent} from '../coach/consent';

export const PARENT_PRIVACY_NOTICE_VERSION='jems-parent-privacy-2026-11-v1' as const;
export type ParentPrivacyScopes={generation:boolean;conversation:boolean;remoteSpeech:boolean};
export interface ParentPrivacyChoice {
 id:string;familyId:string;deviceId:string;guardianSubject:string;
 noticeVersion:typeof PARENT_PRIVACY_NOTICE_VERSION;
 scopes:ParentPrivacyScopes;requestedAt:number;expiresAt:number;
 verifiedAt?:number;verificationReceiptHash?:string;revokedAt?:number;
}
const MAX_AGE=90*86400000;
const allBoolean=(v:unknown):v is ParentPrivacyScopes=>{
 if(!v||typeof v!=='object'||Array.isArray(v))return false;
 const x=v as Record<string,unknown>;
 return Object.keys(x).sort().join(',')==='conversation,generation,remoteSpeech'&&
  typeof x.generation==='boolean'&&typeof x.conversation==='boolean'&&typeof x.remoteSpeech==='boolean';
};
const activeDevice=(state:PipelineState,s:VerifiedSession,now:number)=>{
 if(!s?.deviceId||s.role!=='parent'||s.expiresAt<=now||!s.familyId)throw Error('PARENT_UNLOCK_REQUIRED');
 assertActiveTrustedDevice(state,s,now);
};
const newest=(s:PipelineState,familyId:string)=>
 (s.parentPrivacyChoices||[]).filter(x=>x.familyId===familyId).at(-1);
export function privacyStatus(s:PipelineState,familyId:string,now=Date.now()){
 const choice=newest(s,familyId);
 const status=choice?(choice.revokedAt?'revoked':choice.expiresAt<=now?'expired':
  choice.verifiedAt?'verified':'pending'):'not-requested';
 return {noticeVersion:PARENT_PRIVACY_NOTICE_VERSION,status,
  scopes:choice?.scopes||{generation:false,conversation:false,remoteSpeech:false},
  requestedAt:choice?.requestedAt||null,expiresAt:choice?.expiresAt||null,
  // A stored choice is not an assertion about OpenAI project-level ZDR.
  externalVerificationRequired:status!=='verified'};
}
export async function submitParentPrivacyChoice(repo:Repository,session:VerifiedSession,input:unknown,now=Date.now()){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('INVALID_PRIVACY_CHOICE');
 const v=input as Record<string,unknown>;
 if(Object.keys(v).sort().join(',')!=='guardianAffirmed,noticeVersion,providerAcknowledged,scopes'||
  v.noticeVersion!==PARENT_PRIVACY_NOTICE_VERSION||v.guardianAffirmed!==true||
  v.providerAcknowledged!==true||!allBoolean(v.scopes)||
  !Object.values(v.scopes).some(Boolean))throw Error('INVALID_PRIVACY_CHOICE');
 return repo.transaction(s=>{
  activeDevice(s,session,now);
  s.parentPrivacyChoices||=[];
  if(s.parentPrivacyChoices.length>=300)throw Error('PRIVACY_RECORD_LIMIT');
  // Updating requested scopes revokes previous provider consent immediately.
  for(const c of s.parentPrivacyChoices)if(c.familyId===session.familyId&&!c.revokedAt)c.revokedAt=now;
  s.coachConsent=(s.coachConsent||[]).filter(x=>x.familyId!==session.familyId);
  const choice:ParentPrivacyChoice={
   id:randomUUID(),familyId:session.familyId,deviceId:session.deviceId!,
   guardianSubject:session.subject,noticeVersion:PARENT_PRIVACY_NOTICE_VERSION,
   scopes:{...(v.scopes as ParentPrivacyScopes)},requestedAt:now,expiresAt:now+MAX_AGE
  };
  s.parentPrivacyChoices.push(choice);
  return {status:'pending' as const,choiceId:choice.id,noticeVersion:choice.noticeVersion};
 });
}
export async function revokeParentPrivacyChoice(repo:Repository,session:VerifiedSession,now=Date.now()){
 return repo.transaction(s=>{
  activeDevice(s,session,now);
  for(const c of s.parentPrivacyChoices||[])if(c.familyId===session.familyId&&!c.revokedAt)c.revokedAt=now;
  s.coachConsent=(s.coachConsent||[]).filter(x=>x.familyId!==session.familyId);
  return {status:'revoked' as const};
 });
}
/** Owner machine only after actual independent guardian/identity verification.
 * The receipt is NOT proof produced by this application. Store a digest of
 * the off-platform reference; never raw photo ID or payment instrument data.
 */
export async function recordExternalGuardianVerification(
 repo:Repository,options:{familyId:string;choiceId:string;receipt:string;verifiedByOwner:boolean},
 now=Date.now()
){
 if(!options.verifiedByOwner||!/^[\w-]{12,120}$/.test(options.receipt)||
  !/^[0-9a-f-]{36}$/.test(options.choiceId))throw Error('EXTERNAL_VERIFICATION_REQUIRED');
 const receiptHash=createHash('sha256').update(options.receipt).digest('hex');
 return repo.transaction(s=>{
  const choice=s.parentPrivacyChoices?.find(c=>c.id===options.choiceId&&c.familyId===options.familyId);
  if(!choice||choice!==newest(s,options.familyId)||choice.revokedAt||choice.verifiedAt||
     choice.expiresAt<=now)throw Error('PARENT_CONSENT_NOT_PENDING');
  if(s.parentPrivacyChoices?.some(c=>c.verificationReceiptHash===receiptHash))throw Error('RECEIPT_REUSED');
  const d=s.devices?.find(d=>d.familyId===choice.familyId&&d.id===choice.deviceId);
  if(!d||d.revokedAt||d.expiresAt<=now||d.lastSeenAt+90*86400000<=now)
   throw Error('PARENT_DEVICE_REVOKED');
  choice.verifiedAt=now;choice.verificationReceiptHash=receiptHash;
  // Existing coach gate reads the family's verified receipt. The app does
  // not activate ZDR, private model credentials, provider permissions or spend.
  const coach:FamilyCoachConsent={
   familyId:choice.familyId,guardianSubject:choice.guardianSubject,
   confirmedAt:now,expiresAt:choice.expiresAt,policyVersion:'owner-pilot-1',
   model:choice.scopes.conversation,audio:choice.scopes.remoteSpeech,
   verificationReceipt:receiptHash
  };
  s.coachConsent=(s.coachConsent||[]).filter(c=>c.familyId!==choice.familyId);
  s.coachConsent.push(coach);
  return {status:'verified' as const,noticeVersion:choice.noticeVersion};
 });
}
export function verifiedParentScope(s:PipelineState,familyId:string,scope:keyof ParentPrivacyScopes,now=Date.now()){
 const c=newest(s,familyId);
 if(!c||!c.verifiedAt||c.revokedAt||c.expiresAt<=now||!c.scopes[scope]||c.noticeVersion!==PARENT_PRIVACY_NOTICE_VERSION)return false;
 const device=s.devices?.find(d=>d.familyId===c.familyId&&d.id===c.deviceId);
 return !!device&&!device.revokedAt&&device.expiresAt>now&&device.lastSeenAt+90*86400000>now;
}
