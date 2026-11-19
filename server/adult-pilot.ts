/** Strictly private, owner-enrolled ADULT test devices, not a child-age
 * classifier, legal consent mechanism, ZDR attestation or public user signup.
 * No browser route can create this authorization.
 */
import {createHash} from 'node:crypto';
import type {PipelineState,Repository} from './pipeline/types';
import type {VerifiedSession} from './contracts/api';
import {assertActiveTrustedDevice} from './trusted-devices';

export interface AdultPilotPermit {
 familyId:string;deviceId:string;approvedAt:number;expiresAt:number;receiptHash:string;
 revokedAt?:number;
}
export interface AdultPilotFlags {
 enabled:boolean;ownerApproved:boolean;restrictedHostVerified:boolean;
}
export function adultPilotFlags(env:NodeJS.ProcessEnv):AdultPilotFlags {
 return {
  enabled:env.FACTORY_ADULT_PILOT_MODE==='true',
  ownerApproved:env.FACTORY_ADULT_PILOT_OWNER_APPROVED==='true',
  restrictedHostVerified:env.FACTORY_ADULT_PILOT_PRIVATE_HOST_VERIFIED==='true'
 };
}
export function adultPilotConfigured(flags:AdultPilotFlags):boolean {
 return flags.enabled&&flags.ownerApproved&&flags.restrictedHostVerified;
}
export function adultPilotAllowed(state:PipelineState,session:VerifiedSession,now=Date.now()):boolean {
 if(!session||session.expiresAt<=now||!session.deviceId||
   session.role!=='designer'||!session.familyId)return false;
 try{assertActiveTrustedDevice(state,session,now);}catch{return false;}
 const r=state.adultPilotPermits?.find(x=>
  x.familyId===session.familyId&&x.deviceId===session.deviceId&&
  !x.revokedAt&&x.approvedAt<=now&&x.expiresAt>now&&
  /^[a-f0-9]{64}$/.test(x.receiptHash));
 return !!r;
}
/** Use only on a trusted operator machine after checking the adult tester and
 * the exact enrolled device. The receipt is an off-platform audit reference,
 * not proof created by this program.
 */
export async function grantAdultPilot(repo:Repository,input:{
 familyId:string;deviceId:string;receipt:string;operatorConfirmedAdult:boolean;expiresAt:number
},now=Date.now()){
 if(!input.operatorConfirmedAdult||
    !/^[A-Za-z0-9_-]{1,100}$/.test(input.familyId)||
    !/^[0-9a-f-]{36}$/.test(input.deviceId)||
    !/^[A-Za-z0-9_-]{12,120}$/.test(input.receipt)||
    !Number.isSafeInteger(input.expiresAt)||input.expiresAt<=now||input.expiresAt>now+14*86400000)
  throw Error('ADULT_PILOT_OPERATOR_VERIFICATION_REQUIRED');
 const receiptHash=createHash('sha256').update(input.receipt).digest('hex');
 return repo.transaction(state=>{
  const device=state.devices?.find(d=>d.id===input.deviceId&&d.familyId===input.familyId);
  if(!device||device.revokedAt||device.expiresAt<=now||device.lastSeenAt+90*86400000<=now)
   throw Error('ADULT_PILOT_DEVICE_UNVERIFIED');
  state.adultPilotPermits??=[];
  if(state.adultPilotPermits.some(p=>p.receiptHash===receiptHash))throw Error('ADULT_PILOT_RECEIPT_REUSED');
  state.adultPilotPermits=state.adultPilotPermits.filter(p=>p.familyId!==input.familyId||p.deviceId!==input.deviceId);
  state.adultPilotPermits.push({familyId:input.familyId,deviceId:input.deviceId,
   receiptHash,approvedAt:now,expiresAt:input.expiresAt});
  return {approved:true,expiresAt:input.expiresAt};
 });
}
export async function revokeAdultPilot(repo:Repository,familyId:string,deviceId:string,now=Date.now()){
 return repo.transaction(s=>{
  for(const r of s.adultPilotPermits||[])if(r.familyId===familyId&&r.deviceId===deviceId)r.revokedAt=now;
  return {revoked:true};
 });
}
/** A worker may not infer a child's age from a role or opaque family ID.
 * Only an existing, explicitly assigned adult pilot device can authorize
 * a job later claimed by a trusted private worker.
 */
export function adultPilotJobAllowed(s:PipelineState,job:{familyId:string;adultPilotDeviceId?:string},now=Date.now()):boolean{
 if(!job.adultPilotDeviceId)return false;
 const session:VerifiedSession={familyId:job.familyId,deviceId:job.adultPilotDeviceId,
  role:'designer',subject:'family-designer',expiresAt:now+60000};
 return adultPilotAllowed(s,session,now);
}
