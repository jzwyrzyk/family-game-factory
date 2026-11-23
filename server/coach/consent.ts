/**
 * Owner-only, family-scoped model and remote-audio authorization.
 *
 * Creating an authorization is NOT an age-verification service or COPPA
 * compliance by itself. An authenticated adult must be independently verified
 * and a consent receipt recorded outside this app, before trusted owner setup
 * can write the corresponding family authorization.
 */
import type {Repository,PipelineState} from '../pipeline/types';
import type {VerifiedSession} from '../contracts/api';

export interface FamilyCoachConsent {
 familyId:string;guardianSubject:string;confirmedAt:number;expiresAt:number;
 policyVersion:'owner-pilot-1';model:boolean;audio:boolean;
 /** Separate opt-in; old model/microphone approvals do not enable hosted reading. */
 narration?:boolean;
 // An opaque reference to an externally verified adult-consent record.
 verificationReceipt:string;
}
export function allowedCoachFamily(state:PipelineState,session:VerifiedSession,scope:'model'|'audio'|'narration',now=Date.now()):boolean {
 if(!session||session.expiresAt<=now||!['parent','designer'].includes(session.role))return false;
 return state.coachConsent?.some(record=>
  record.familyId===session.familyId&&record.confirmedAt<=now&&record.expiresAt>now&&
  record.policyVersion==='owner-pilot-1'&&record[scope]===true&&
  typeof record.verificationReceipt==='string'&&/^[a-zA-Z0-9_-]{12,120}$/.test(record.verificationReceipt)
 )===true;
}
export async function setOwnerCoachConsent(repo:Repository,guardian:VerifiedSession,choice:{
 familyId:string;model:boolean;audio:boolean;narration?:boolean;verifiedByAdult:boolean;
 verificationReceipt:string;expiresAt:number;
}):Promise<boolean>{
 const now=Date.now();
 if(guardian?.role!=='parent'||guardian.expiresAt<=now||guardian.familyId!==choice.familyId||
  typeof guardian.subject!=='string'||!guardian.subject||
  choice.verifiedByAdult!==true||typeof choice.model!=='boolean'||typeof choice.audio!=='boolean'||
  choice.narration!==undefined&&typeof choice.narration!=='boolean'||
  !/^[a-zA-Z0-9_-]{12,120}$/.test(choice.verificationReceipt)||
  !Number.isSafeInteger(choice.expiresAt)||choice.expiresAt<=now||
  choice.expiresAt>now+90*86400000)throw Error('VERIFIED_GUARDIAN_APPROVAL_REQUIRED');
 // Audio and model consent are independent. Neither authorizes the other; a
 // signed owner verified receipt is mandatory for each granted capability.
 return repo.transaction(state=>{
  state.coachConsent ||= [];
  state.coachConsent=state.coachConsent.filter(entry=>entry.familyId!==choice.familyId);
  state.coachConsent.push({
   familyId:choice.familyId,guardianSubject:guardian.subject,confirmedAt:now,
   expiresAt:choice.expiresAt,policyVersion:'owner-pilot-1',model:choice.model,
   audio:choice.audio,...(choice.narration===true?{narration:true}:{}),verificationReceipt:choice.verificationReceipt
  });
  return true;
 });
}
