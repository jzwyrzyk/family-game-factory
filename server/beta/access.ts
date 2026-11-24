import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {verifySession} from '../pipeline/auth';
import {assertActiveTrustedDevice,checkParentPassphrase,cookieValue,deviceCredentials,firstPartyCookie,newParentAuth,newTrustedDevice} from '../trusted-devices';
import type {VerifiedSession} from '../contracts/api';
import type {PipelineState} from '../pipeline/types';
import {activeFamily,betaNotice,participationNotice,playIdle,playLifetime,type Family,type Play} from './model';
import type {FamilyDirectory} from './store';

export const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
export const secret=()=>randomBytes(32).toString('base64url');
export const playCookie=(value:string,age:number)=>`__Host-jems-play=${value}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${age}`;
export function internalCookies(header:string|undefined){
 // Only host-prefixed cookies can enter the household-compatible handler.
 return (header??'').split(';').map(s=>s.trim()).filter(s=>/^__Host-factory_(session|device|parent|adult)=/.test(s)).map(s=>s.slice(7)).join('; ');
}
export function exact(input:unknown,keys:string[]):asserts input is Record<string,unknown>{
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).sort().join(',')!==[...keys].sort().join(','))throw Error('INVALID_REQUEST');
}
export function liveSession(f:Family,s:PipelineState,cookies:string|undefined,key:string,now:number){
 const session=verifySession(cookieValue(cookies,'factory_session'),key,now);
 if(session.familyId!==f.id||session.role!=='designer'||!session.deviceId)throw Error('UNAUTHENTICATED');
 assertActiveTrustedDevice(s,session,now);return session;
}
export function issueInvitation(f:Family,purpose:'new-family'|'recovery',now:number){
 if(f.status!=='invited'||(purpose==='new-family'&&!!f.guardian.pairedDevice))throw Error('INVALID_LIFECYCLE');
 const value=secret();
 f.invitation={id:randomUUID(),purpose,digest:digest(value),issuedAt:now,expiresAt:now+24*3600000};
 return {invitation:value,expiresAt:f.invitation.expiresAt};
}
export async function redeem(directory:FamilyDirectory,id:string,input:unknown,key:string,now=Date.now()){
 exact(input,['invitation','passphrase','terms','notice','guardianAffirmed','purpose']);
 if(typeof input.invitation!=='string'||!/^[\w-]{43}$/.test(input.invitation)||input.terms!==participationNotice||
  input.notice!==betaNotice||input.guardianAffirmed!==true||!['new-family','recovery'].includes(String(input.purpose)))throw Error('INVALID_INVITATION');
 const hash=digest(input.invitation),pair=secret().slice(0,16);
 return directory.withFamily(id,async(tx,f,p)=>{
  const invite=f.invitation;
  if(!p.invitations||!p.participation||f.status!=='invited'||!invite||invite.digest!==hash||invite.purpose!==input.purpose||
   invite.usedAt!==undefined||invite.revokedAt!==undefined||invite.expiresAt<=now)throw Error('INVALID_INVITATION');
  const {device,secret:deviceSecret}=newTrustedDevice(id,'Family device',now);
  await directory.inWorkspace(tx,f,p,s=>{
   if(s.parentAuth?.[id])throw Error('INVALID_LIFECYCLE');
   s.parentAuth={[id]:newParentAuth(input.passphrase)};(s.devices??=[]).push(device);
  },true);
  f.status='pending';invite.usedAt=now;
  f.guardian.pairingDigest=digest(pair);f.guardian.pairedDevice=device.id;f.guardian.participationVersion=participationNotice;
  tx.set(directory.path(id),f);
  return {pairingCode:pair,cookies:deviceCredentials(device,deviceSecret,key,now).map(firstPartyCookie)};
 });
}
export function verifyParticipation(f:Family,pair:unknown,receipt:unknown,now:number){
 if(f.status!=='pending'||typeof pair!=='string'||pair.length!==16||!f.guardian.pairingDigest||
  digest(pair)!==f.guardian.pairingDigest||typeof receipt!=='string'||!/^[-\w]{12,120}$/.test(receipt))throw Error('VERIFICATION_REQUIRED');
 f.guardian.verifiedAt=now;f.guardian.receiptDigest=digest(receipt);
 delete f.guardian.pairingDigest;f.status='active';
}
export async function acknowledge(directory:FamilyDirectory,id:string,input:unknown,cookies:string|undefined,key:string,now=Date.now()){
 exact(input,['adult','supervise','avoidIdentifying','notice','terms','passphrase']);
 if(input.adult!==true||input.supervise!==true||input.avoidIdentifying!==true||input.notice!==betaNotice||input.terms!==participationNotice||
  typeof input.passphrase!=='string'||input.passphrase.length<12||input.passphrase.length>128)throw Error('ACKNOWLEDGMENT_REQUIRED');
 const passphrase=input.passphrase,value=secret();
 const result=await directory.withFamily(id,async(tx,f,p)=>{
  activeFamily(f,p);
  const session=await directory.inWorkspace(tx,f,p,s=>{
   const session=liveSession(f,s,cookies,key,now);
   return checkParentPassphrase(s.parentAuth?.[id],passphrase,now)?session:null;
  },true);
  if(!session)return false; // The failed-attempt counter must commit.
  const play:Play={digest:digest(value),familyId:id,deviceId:session.deviceId!,guardianId:f.guardian.id,notice:betaNotice,terms:participationNotice,
   at:now,lastActive:now,expires:Math.min(now+playLifetime,session.expiresAt),entryPending:true};
  f.plays=f.plays.filter(row=>row.expires>now&&row.deviceId!==play.deviceId);
  f.plays.push(play);tx.set(directory.path(id),f);
  tx.create(directory.path(id)+'/acknowledgments/'+randomUUID(),{familyId:id,deviceId:play.deviceId,guardianId:play.guardianId,
   sessionDigest:play.digest,notice:betaNotice,terms:participationNotice,at:now,expiresAt:play.expires});
  return true;
 });
 if(!result)throw Error('INVALID_PARENT_ACCESS');
 return playCookie(value,playLifetime/1000);
}
export async function requirePlay(directory:FamilyDirectory,id:string,raw:string|undefined,key:string,action:'check'|'entry'|'activity',now=Date.now()){
 const value=cookieValue(raw,'__Host-jems-play');
 if(!value||!/^[-\w]{43}$/.test(value))throw Error('PLAY_REQUIRED');
 return directory.withFamily(id,async(tx,f,p)=>{
  activeFamily(f,p);
  const play=f.plays.find(row=>row.digest===digest(value));
  const session=verifySession(cookieValue(internalCookies(raw),'factory_session'),key,now);
  if(session.familyId!==id||session.role!=='designer'||!session.deviceId)throw Error('UNAUTHENTICATED');
  const metadata=await tx.get<{devices:{id:string;familyId:string;revokedAt:number|null;lastSeenAt:number;expiresAt:number}[]}>(directory.path(id)+'/metadata/devices');
  const device=metadata?.devices.find(d=>d.id===session.deviceId&&d.familyId===id);
  if(!device||device.revokedAt!==null||device.expiresAt<=now||device.lastSeenAt+90*86400000<=now)throw Error('UNAUTHENTICATED');
  if(!play||play.familyId!==id||play.deviceId!==session.deviceId||play.guardianId!==f.guardian.id||
   play.notice!==betaNotice||play.terms!==participationNotice||play.expires<=now||play.lastActive+playIdle<=now||
   action==='entry'&&!play.entryPending||action!=='entry'&&play.entryPending)throw Error('PLAY_REQUIRED');
  if(action==='entry'){play.entryPending=false;tx.set(directory.path(id),f);}
  if(action==='activity'&&now-play.lastActive>=60000){play.lastActive=now;tx.set(directory.path(id),f);}
  return {familyId:id,capabilities:f.capabilities,expires:play.expires,idleUntil:play.lastActive+playIdle,session};
 });
}
export async function logout(directory:FamilyDirectory,id:string,raw:string|undefined,key:string,forget:boolean,now=Date.now()){
 await directory.withFamily(id,async(tx,f,p)=>{
  let session:VerifiedSession|undefined;
  try{session=verifySession(cookieValue(internalCookies(raw),'factory_session'),key,now);}catch{/* Expired authentication can still end its matching play. */}
  const playHash=digest(cookieValue(raw,'__Host-jems-play')??'');
  f.plays=f.plays.filter(r=>r.digest!==playHash&&!(session?.familyId===id&&session.deviceId===r.deviceId));
  if(forget&&session?.familyId===id)await directory.inWorkspace(tx,f,p,s=>{
   const d=s.devices?.find(d=>d.id===session?.deviceId&&d.familyId===id);if(d)d.revokedAt=now;
  },true);
  tx.set(directory.path(id),f);
 });
 return [playCookie('',0),...(forget?['session','device','parent','adult'].map(name=>firstPartyCookie('factory_'+name+'=; Path=/; Secure; HttpOnly; SameSite=None; Partitioned; Max-Age=0')):[])];
}
