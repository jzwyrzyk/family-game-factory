/** Temporary, owner-enrolled adult development profiles on the existing site.
 * A permit only makes a trusted device eligible: switching to the adult profile
 * must also prove the adult passphrase and obtain a short, revocable session.
 * This is not a child-age classifier, guardian consent or ZDR attestation.
 */
import {createHash,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import type {PipelineState,Repository} from './pipeline/types';
import type {VerifiedSession} from './contracts/api';
import {assertActiveTrustedDevice} from './trusted-devices';

export interface AdultPilotPermit {
 familyId:string;deviceId:string;approvedAt:number;expiresAt:number;receiptHash:string;
 revokedAt?:number;
}
export interface AdultPilotSession {
 id:string;familyId:string;deviceId:string;profileId:string;
 permitReceiptHash:string;permitApprovedAt:number;
 proofHash:string;cookieHash:string;createdAt:number;expiresAt:number;revokedAt?:number;
}
export interface AdultPilotFlags {
 enabled:boolean;ownerApproved:boolean;profileAccessVerified:boolean;
}
/** Fixed lifetime: family-device renewal never extends adult privileges. */
export const ADULT_PILOT_SESSION_MS=60*60000;
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const secret=()=>randomBytes(32).toString('base64url');
const sameHash=(left:string,right:string)=>/^[a-f0-9]{64}$/.test(left)&&
 /^[a-f0-9]{64}$/.test(right)&&timingSafeEqual(Buffer.from(left,'hex'),Buffer.from(right,'hex'));
const idPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export const adultPilotProfileId=(deviceId:string)=>'adult:'+deviceId;

export function adultPilotFlags(env:NodeJS.ProcessEnv):AdultPilotFlags {
 return {
  enabled:env.FACTORY_ADULT_PILOT_MODE==='true',
  ownerApproved:env.FACTORY_ADULT_PILOT_OWNER_APPROVED==='true',
  // The old PRIVATE_HOST flag intentionally does not authorize a public site.
  profileAccessVerified:env.FACTORY_ADULT_PILOT_PROFILE_ACCESS_VERIFIED==='true'
 };
}
export function adultPilotConfigured(flags:AdultPilotFlags):boolean {
 return flags.enabled&&flags.ownerApproved&&flags.profileAccessVerified;
}
function activePermit(state:PipelineState,session:VerifiedSession,now:number){
 if(!session||!Number.isFinite(session.expiresAt)||session.expiresAt<=now||
    !session.deviceId||session.role!=='designer'||!session.familyId)return undefined;
 try{assertActiveTrustedDevice(state,session,now);}catch{return undefined;}
 return state.adultPilotPermits?.find(x=>x.familyId===session.familyId&&
  x.deviceId===session.deviceId&&x.revokedAt===undefined&&
  Number.isSafeInteger(x.approvedAt)&&x.approvedAt<=now&&
  Number.isSafeInteger(x.expiresAt)&&x.expiresAt>now&&x.expiresAt<=x.approvedAt+14*86400000&&
  /^[a-f0-9]{64}$/.test(x.receiptHash));
}
/** Eligibility is safe to display; it does not authorize a paid request. */
export function adultPilotEligible(state:PipelineState,session:VerifiedSession,now=Date.now()):boolean {
 return !!activePermit(state,session,now);
}
/** Server-owned grant lookup, shared with worker/preview authorization. */
export function activeAdultPilotSession(state:PipelineState,familyId:string,deviceId:string,
 sessionId:string,now=Date.now()):AdultPilotSession|undefined {
 const session=state.adultPilotSessions?.find(x=>x.id===sessionId&&x.familyId===familyId&&x.deviceId===deviceId);
 if(!session||session.revokedAt!==undefined||session.profileId!==adultPilotProfileId(deviceId)||
    !Number.isSafeInteger(session.createdAt)||session.createdAt>now||
    !Number.isSafeInteger(session.expiresAt)||session.expiresAt<=now||
    session.expiresAt>session.createdAt+ADULT_PILOT_SESSION_MS)return undefined;
 const permit=activePermit(state,{familyId,deviceId,subject:'family-adult',role:'designer',expiresAt:session.expiresAt},now);
 if(!permit||permit.receiptHash!==session.permitReceiptHash||permit.approvedAt!==session.permitApprovedAt||
    session.createdAt<permit.approvedAt||session.expiresAt>permit.expiresAt)return undefined;
 return session;
}
export function adultPilotAllowed(state:PipelineState,session:VerifiedSession,now=Date.now()):boolean {
 if(!session||session.role!=='designer'||!Number.isFinite(session.expiresAt)||session.expiresAt<=now||
    !session.deviceId||!session.adultSessionId||!session.adultProfileId)return false;
 const grant=activeAdultPilotSession(state,session.familyId,session.deviceId,session.adultSessionId,now);
 return !!grant&&grant.profileId===session.adultProfileId;
}
/** Only call within the transaction that successfully checked the passphrase.
 * Neither token is persisted in plaintext. A new unlock supersedes any previous
 * adult session on that device, including work waiting on an old session.
 */
export function beginAdultPilotSession(state:PipelineState,session:VerifiedSession,now=Date.now()){
 const permit=activePermit(state,session,now);
 if(!permit||!session.deviceId)throw Error('ADULT_PILOT_ACCESS_REQUIRED');
 const sessionToken=secret(),cookieSecret=secret(),id=randomUUID();
 const grant:AdultPilotSession={id,familyId:session.familyId,deviceId:session.deviceId,
  profileId:adultPilotProfileId(session.deviceId),permitReceiptHash:permit.receiptHash,
  permitApprovedAt:permit.approvedAt,proofHash:hash(sessionToken),cookieHash:hash(cookieSecret),
  createdAt:now,expiresAt:Math.min(now+ADULT_PILOT_SESSION_MS,permit.expiresAt)};
 // Expired/revoked grant IDs can never be resurrected. Bound stored session data.
 state.adultPilotSessions=(state.adultPilotSessions||[]).filter(x=>
  x.revokedAt===undefined&&x.expiresAt>now&&(x.familyId!==session.familyId||x.deviceId!==session.deviceId));
 state.adultPilotSessions.push(grant);
 return {grant,sessionToken,cookieValue:id+'.'+cookieSecret};
}
/** An ambient cookie cannot activate AI in a child tab. Both the HttpOnly
 * credential and this tab's in-memory proof must match a current server grant.
 */
export function adultPilotCookieSession(state:PipelineState,rawCookie:string|undefined,now=Date.now()):AdultPilotSession|undefined {
 const parts=rawCookie?.split('.');
 if(!parts||parts.length!==2||!idPattern.test(parts[0])||!/^[A-Za-z0-9_-]{43}$/.test(parts[1]))return undefined;
 const record=state.adultPilotSessions?.find(x=>x.id===parts[0]);
 if(!record)return undefined;
 const grant=activeAdultPilotSession(state,record.familyId,record.deviceId,record.id,now);
 return grant&&sameHash(grant.cookieHash,hash(parts[1]))?grant:undefined;
}
export function authenticateAdultPilotSession(state:PipelineState,session:VerifiedSession,
 rawCookie:string|undefined,proof:string|string[]|undefined,now=Date.now()):VerifiedSession {
 if(!session.deviceId||session.role!=='designer'||session.expiresAt<=now||
    typeof proof!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(proof))throw Error('ADULT_PILOT_ACCESS_REQUIRED');
 const grant=adultPilotCookieSession(state,rawCookie,now);
 if(!grant||grant.familyId!==session.familyId||grant.deviceId!==session.deviceId||!sameHash(grant.proofHash,hash(proof)))
  throw Error('ADULT_PILOT_ACCESS_REQUIRED');
 return {...session,subject:'family-adult',adultSessionId:grant.id,adultProfileId:grant.profileId,
  expiresAt:Math.min(session.expiresAt,grant.expiresAt)};
}
/** Use only on a trusted operator machine after checking the adult tester and
 * exact enrolled device. The receipt is an off-platform audit reference,
 * not proof created by this program. Keep hashed history to reject receipt reuse.
 */
export async function grantAdultPilot(repo:Repository,input:{
 familyId:string;deviceId:string;receipt:string;operatorConfirmedAdult:boolean;expiresAt:number
},now=Date.now()){
 if(input.operatorConfirmedAdult!==true||
    !/^[A-Za-z0-9_-]{1,100}$/.test(input.familyId)||
    !idPattern.test(input.deviceId)||
    !/^[A-Za-z0-9_-]{12,120}$/.test(input.receipt)||
    !Number.isSafeInteger(input.expiresAt)||input.expiresAt<=now||input.expiresAt>now+14*86400000)
  throw Error('ADULT_PILOT_OPERATOR_VERIFICATION_REQUIRED');
 const receiptHash=hash(input.receipt);
 return repo.transaction(state=>{
  const device=state.devices?.find(d=>d.id===input.deviceId&&d.familyId===input.familyId);
  if(!device||device.revokedAt!==undefined||device.expiresAt<=now||device.lastSeenAt+90*86400000<=now)
   throw Error('ADULT_PILOT_DEVICE_UNVERIFIED');
  state.adultPilotPermits??=[];
  if(state.adultPilotPermits.some(p=>p.receiptHash===receiptHash))throw Error('ADULT_PILOT_RECEIPT_REUSED');
  if(state.adultPilotPermits.length>=1000)throw Error('ADULT_PILOT_RECORD_LIMIT');
  for(const permit of state.adultPilotPermits)
   if(permit.familyId===input.familyId&&permit.deviceId===input.deviceId&&permit.revokedAt===undefined)permit.revokedAt=now;
  for(const session of state.adultPilotSessions||[])
   if(session.familyId===input.familyId&&session.deviceId===input.deviceId&&session.revokedAt===undefined)session.revokedAt=now;
  state.adultPilotPermits.push({familyId:input.familyId,deviceId:input.deviceId,
   receiptHash,approvedAt:now,expiresAt:input.expiresAt});
  return {approved:true,expiresAt:input.expiresAt};
 });
}
export async function revokeAdultPilot(repo:Repository,familyId:string,deviceId:string,now=Date.now()){
 return repo.transaction(s=>{
  for(const r of s.adultPilotPermits||[])
   if(r.familyId===familyId&&r.deviceId===deviceId&&r.revokedAt===undefined)r.revokedAt=now;
  for(const r of s.adultPilotSessions||[])
   if(r.familyId===familyId&&r.deviceId===deviceId&&r.revokedAt===undefined)r.revokedAt=now;
  return {revoked:true};
 });
}
/** Async jobs retain the exact privilege session that admitted them; they do
 * not inherit a subsequent adult unlock or a replacement operator permit.
 */
export function adultPilotJobAllowed(s:PipelineState,job:{familyId:string;adultPilotDeviceId?:string;
 adultPilotSessionId?:string;adultPilotProfileId?:string},now=Date.now()):boolean{
 if(!job.adultPilotDeviceId||!job.adultPilotSessionId||!job.adultPilotProfileId)return false;
 const grant=activeAdultPilotSession(s,job.familyId,job.adultPilotDeviceId,job.adultPilotSessionId,now);
 return !!grant&&grant.profileId===job.adultPilotProfileId;
}
