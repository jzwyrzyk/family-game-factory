import type {Documents} from './documents';
import type {Family} from './model';
import {uuid,workspaceOf} from './model';
import type {PipelineState} from '../pipeline/types';
import type {FamilyDirectory} from './store';
import {digest,exact,internalCookies,liveSession} from './access';
import {checkParentPassphrase,cookieValue} from '../trusted-devices';
import {signSession,verifySession} from '../pipeline/auth';
import {activeFamily,type Policy} from './model';
import type {VerifiedSession} from '../contracts/api';

export function exportApproved(f:Family,now:number){
 if(f.request?.kind!=='export'||!['ready','completed'].includes(f.request.state)||!f.request.approvedAt||f.request.approvedAt+86400000<=now)throw Error('EXPORT_APPROVAL_REQUIRED');
}
/** Privacy access is independent of participation/processing, but never revocation. */
export function exportGuardian(f:Family,now=Date.now()){
 if(!['active','suspended'].includes(f.status)||!f.guardian.verifiedAt||!f.guardian.receiptDigest)throw Error('FAMILY_ACCESS_PAUSED');
 exportApproved(f,now);
}
const exportSubject=(f:Family)=>'family-export:'+digest(JSON.stringify([f.request!.id,f.request!.approvedAt,f.guardian.id,f.guardian.verifiedAt,f.guardian.receiptDigest]));
// Purpose-separated signatures prevent even a copied proof from being renamed
// into an ordinary parent cookie after the family resumes participation.
const exportKey=(key:string)=>key+'\n'+'jems-family-export-v1';
export function authorizeFamilyExport(f:Family,p:Policy,session:VerifiedSession,raw:string|undefined,key:string,now:number){
 exportGuardian(f,now);
 const proof=cookieValue(raw,'__Host-jems-export');
 // Existing active management remains supported; a suspended family must use
 // its separate case-bound proof, which no runtime or management handler reads.
 if(!proof)activeFamily(f,p);
 const parent=verifySession(proof??cookieValue(internalCookies(raw),'factory_parent'),proof?exportKey(key):key,now);
 if(parent.role!=='parent'||parent.familyId!==f.id||parent.deviceId!==session.deviceId||proof&&parent.subject!==exportSubject(f))throw Error('FORBIDDEN');
}
export async function unlockFamilyExport(d:FamilyDirectory,id:string,input:unknown,raw:string|undefined,key:string,now=Date.now()){
 exact(input,['parentPassphrase']);
 if(typeof input.parentPassphrase!=='string'||input.parentPassphrase.length<12||input.parentPassphrase.length>128)throw Error('INVALID_PARENT_ACCESS');
 const passphrase=input.parentPassphrase;
 const result=await d.withFamily(id,async(tx,f,p)=>{
  exportGuardian(f,now);
  const session=await d.inWorkspace(tx,f,p,s=>{
   const session=liveSession(f,s,internalCookies(raw),key,now);
   return checkParentPassphrase(s.parentAuth?.[id],passphrase,now)?session:null;
  },true);
  if(!session)return null; // Failed guesses persist in the existing shared throttle.
  const expiresAt=Math.min(now+15*60000,session.expiresAt,f.request!.approvedAt!+86400000);
  const proof=signSession({subject:exportSubject(f),familyId:id,deviceId:session.deviceId,role:'parent',expiresAt},exportKey(key));
  return {expiresAt,cookie:`__Host-jems-export=${proof}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${Math.max(0,Math.floor((expiresAt-now)/1000))}`};
 });
 if(!result)throw Error('INVALID_PARENT_ACCESS');
 return result;
}
export function exportWorkspace(f:Family,s:PipelineState,now:number){
 return {schema:'jems.family-export.v1',familyId:f.id,profileIds:f.profiles??[],profileSettings:f.profileSettings??{},participation:{verifiedAt:f.guardian.verifiedAt,version:f.guardian.participationVersion,notice:f.guardian.noticeVersion,renewedAt:f.guardian.participationRenewedAt??null},
  devices:(s.devices??[]).map(d=>({id:d.id,name:d.name,createdAt:d.createdAt,lastSeenAt:d.lastSeenAt,expiresAt:d.expiresAt,revokedAt:d.revokedAt})),
  revisions:s.revisions.filter(r=>r.familyId===f.id&&!r.adultPilotProfileId),active:s.active,
  jobs:s.jobs.map(j=>({id:j.id,learnerId:j.learnerId??null,guidedCreation:j.guidedCreation??null,prompt:j.prompt,status:j.status,revisionId:j.revisionId??null,usedMicroUsd:j.usedUnits})),
  consents:(s.parentPrivacyChoices??[]).map(c=>({notice:c.noticeVersion,scopes:c.scopes,requestedAt:c.requestedAt,verifiedAt:c.verifiedAt??null,withdrawnAt:c.revokedAt??null})),
  coachReplies:(s.coachReceipts??[]).filter(r=>r.reply).map(r=>({at:r.at,reply:r.reply})),
  usage:s.ledgers[f.id],usageEvents:s.audit.filter(a=>a.usage).map(a=>({at:a.at,usage:a.usage})),exportedAt:now};
}
export async function exportReceiptPage(tx:Documents,path:string,f:Family,kind:unknown,after:unknown){
 if(kind!=='acknowledgments'&&kind!=='usage'||typeof after!=='string'||after&&(kind==='usage'?!/^\d{4}-\d{2}$/.test(after):!uuid(after)))throw Error('INVALID_REQUEST');
 const rows=await tx.page<Record<string,unknown>>(path+'/'+kind,after,48);
 return {next:rows.length===48?rows.at(-1)!.id:null,rows:rows.map(({id,value:v})=>{
  if(kind==='usage')return {month:id,used:v.used,reserved:v.reserved};
  if(v.familyId!==f.id)throw Error('FAMILY_UNAVAILABLE');
  return {id,...(v.kind==='notice-renewal'?{kind:v.kind}:{}),at:v.at,expiresAt:v.expiresAt,notice:v.notice,terms:v.terms,guardianId:v.guardianId,deviceId:v.deviceId};
 })};
}
export function pendingReservations(s:PipelineState){
 const jobs=s.jobs.filter(j=>['queued','building','testing'].includes(j.status)).map(j=>({kind:'game',reference:j.id,stage:j.status,microUsd:j.maxUnits}));
 const calls=[...((s.coachReceipts??[]).filter(r=>r.state==='running').map(r=>({kind:'coaching',r}))),
  ...((s.audioReceipts??[]).filter(r=>r.state==='running').map(r=>({kind:'speech',r}))),
  ...((s.narrationReceipts??[]).filter(r=>r.state==='running').map(r=>({kind:'narration',r})))];
 return [...jobs,...calls.map(({kind,r})=>({kind,reference:r.reservationId??r.id,stage:'reserved',microUsd:r.reserved}))];
}

/** Case-approved parent export of scoped consent and recovery operation metadata.
 * Full original recovery bytes are already present in the versioned continuity
 * records; schedule manifests retain their immutable source/artifact references. */
export async function exportStorageMetadataPage(tx:Documents,path:string,f:Family,kind:unknown,after:unknown){
 const workspace=workspaceOf(f),collections:Record<string,string>={
  'storage-consents':path+'/storage-consents','backup-scans':path+'/backup-scans','generated-restores':path+'/generated-restores',
  'backup-schedules':'factoryBackupSchedules/'+workspace+'/points',
  'backup-operations':'factoryBackupSchedules/'+workspace+'/activeOperations'
 };
 if(typeof kind!=='string'||!Object.hasOwn(collections,kind)||typeof after!=='string'||after&&!/^[a-zA-Z0-9_-]{1,160}$/.test(after))throw Error('INVALID_REQUEST');
 const rows=await tx.page<Record<string,unknown>>(collections[kind],after,4);
 return {rows:rows.map(row=>({id:row.id,value:row.value})),next:rows.length===4?rows.at(-1)!.id:null};
}
