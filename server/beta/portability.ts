import type {Documents} from './documents';
import type {Family} from './model';
import {uuid,workspaceOf} from './model';
import type {PipelineState} from '../pipeline/types';

export function exportApproved(f:Family,now:number){
 if(f.request?.kind!=='export'||!['ready','completed'].includes(f.request.state)||!f.request.approvedAt||f.request.approvedAt+86400000<=now)throw Error('EXPORT_APPROVAL_REQUIRED');
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
  'storage-consents':path+'/storage-consents','backup-scans':path+'/backup-scans',
  'backup-schedules':'factoryBackupSchedules/'+workspace+'/points',
  'backup-operations':'factoryBackupSchedules/'+workspace+'/activeOperations'
 };
 if(typeof kind!=='string'||!Object.hasOwn(collections,kind)||typeof after!=='string'||after&&!/^[a-zA-Z0-9_-]{1,160}$/.test(after))throw Error('INVALID_REQUEST');
 const rows=await tx.page<Record<string,unknown>>(collections[kind],after,4);
 return {rows:rows.map(row=>({id:row.id,value:row.value})),next:rows.length===4?rows.at(-1)!.id:null};
}
