import {guardedBackupOperation} from './backup-operations';
import {createHash} from 'node:crypto';
import {ContinuityService,DocumentContinuityRepository} from '../storage/continuity';
import {RecoveryPoints} from '../storage/recovery-points';
import {RecoveryScheduler,type BackupScheduleLedger} from '../storage/recovery-scheduler';
import {readCloudRecovery,BACKUP_DOMAINS} from '../../src/storage/cloud-recovery';
import {activeFamily,participationNotice,betaNotice,familyOrigin} from './model';
import type {FamilyDirectory} from './store';
import type {Documents} from './documents';
import {GcsPrivateArtifacts} from '../storage/artifacts';
import type {Firestore} from '@google-cloud/firestore';
import {FirestoreBackupScheduleLedger} from '../storage/recovery-scheduler';
import type {BackupSchedule} from '../storage/recovery-scheduler';
interface ScheduleState {after:string;latest?:string;latestAt?:string;copied?:string;selected?:string;selectedAt?:number;lastCopiedAt?:number}
export function cloudBackupSchedule(d:FamilyDirectory):BackupSchedule {
 const config=(d.config.continuity as unknown as {backupSchedule?:BackupSchedule}|undefined)?.backupSchedule;
 if(!config)return {enabled:false,intervalMs:86400000,maxPointsPerRun:1};
 if(typeof config.enabled!=='boolean'||!Number.isSafeInteger(config.intervalMs)||config.intervalMs<60000||!Number.isInteger(config.maxPointsPerRun)||config.maxPointsPerRun<1||config.maxPointsPerRun>6)throw Error('BACKUP_SCHEDULE_INVALID');return config;
}
/** Background authorization uses the separately recorded, still-current guardian
 * storage choices. Enrollment, generation permission and parent login alone do
 * not authorize a snapshot. Every read/write transaction rechecks these grants. */
export async function authorizeScheduledRecovery(d:FamilyDirectory,tx:Documents,id:string,profile:string){
 const f=await d.family(tx,id),policy=await d.policy(tx);activeFamily(f,policy);const config=d.config.continuity;
 const grant=await tx.get<{version:number;notice:string;participation:string;guardianNotice:string;renewedAt:number;guardian:string;profiles:string[];domains:string[];revokedAt?:number}>(d.path(id)+'/continuity/authorization');
 if(!cloudBackupSchedule(d).enabled||!config?.enabled||f.request?.kind==='deletion'||!f.profiles?.includes(profile)||!grant||grant.version!==1||grant.notice!==config.notice||grant.participation!==participationNotice||grant.guardianNotice!==betaNotice||grant.renewedAt!==((f.guardian as {participationRenewedAt?:number}).participationRenewedAt??0)||grant.guardian!==f.guardian.id||grant.revokedAt!==undefined||!grant.profiles.includes(profile)||f.profiles.some(owner=>!grant.profiles.includes(owner))||BACKUP_DOMAINS.some(domain=>!config.domains.includes(domain)||!f.storageDomains?.includes(domain)||!grant.domains.includes(domain)))throw Error('BACKUP_SCHEDULE_DENIED');
 return {family:f,grant};
}
/** Bounded scanner of already authorized COMPLETE cloud copies. It never reads
 * local device stores, admits paid work, migrates household data or erases data.
 * Complete roots and every chunk are pinned to immutable version 1, so racing
 * later edits cannot produce a mixed recovery point. */
export async function runFamilyCloudRecovery(d:FamilyDirectory,id:string,ledgerFor:(profile:string)=>BackupScheduleLedger,now=Date.now()):Promise<{copied:number;pending:boolean}>{
 const schedule=cloudBackupSchedule(d);if(!schedule.enabled||!d.config.continuity?.enabled)return {copied:0,pending:false};
 const profiles=await d.withFamily(id,async(_tx,f)=>f.profiles??[]);let copied=0,pending=false;
 const offset=profiles.length?Math.floor(now/schedule.intervalMs)%profiles.length:0;for(const profile of [...profiles.slice(offset),...profiles.slice(0,offset)].slice(0,6)){
  const authorize=async(tx:Documents)=>{await authorizeScheduledRecovery(d,tx,id,profile);};
  // Families without the independent grants are simply ineligible, not errors.
  try{await d.db.run(authorize,true);}catch(error){if((error as Error).message==='BACKUP_SCHEDULE_DENIED')continue;throw error;}
  const scope={family:id,profile},service=new ContinuityService(new DocumentContinuityRepository(d.db,'beta-'+id,authorize),true);
  const statePath=d.path(id)+'/backup-scans/'+createHash('sha256').update(profile).digest('hex');
  let state=await d.db.run(async tx=>{await authorize(tx);return await tx.get<ScheduleState>(statePath)??{after:''};},true);
  // Scan only bounded root metadata pages, never thousands of original chunks.
  // A completed cycle restarts, so a new random root ID behind the cursor is found.
  for(let n=0;n<2;n++){const page=await service.page(scope,scope,'recovery-points',state.after,4);const next={...state,after:page.next??''};for(const record of page.records){const value=record.value as {schema?:string;manifest?:{createdAt?:string}};const createdAt=value?.manifest?.createdAt;if(!record.deleted&&value?.schema==='jems.cloud-recovery.v1'&&typeof createdAt==='string'&&Number.isFinite(Date.parse(createdAt))&&(!next.latestAt||createdAt>next.latestAt||createdAt===next.latestAt&&record.id>(next.latest??''))){next.latest=record.id;next.latestAt=createdAt;}}
   await d.db.run(async tx=>{await authorize(tx);const prior=await tx.get<ScheduleState>(statePath);if((prior?.after??'')!==state.after)throw Error('BACKUP_SCAN_CONFLICT');tx.set(statePath,next);});state=next;pending ||= page.next!==null;if(page.next===null)break;
  }
  if(copied>=schedule.maxPointsPerRun){pending ||= !!state.selected||!!state.latest&&state.latest!==state.copied;continue;}
  if(!state.selected){if(!state.latest||state.latest===state.copied||state.lastCopiedAt!==undefined&&now-state.lastCopiedAt<schedule.intervalMs)continue;state=await d.db.run(async tx=>{await authorize(tx);const current=await tx.get<ScheduleState>(statePath);if(!current||current.after!==state.after)throw Error('BACKUP_SCAN_CONFLICT');const selected={...current,selected:current.latest,selectedAt:now};tx.set(statePath,selected);return selected;});}
  const sourceId=state.selected!;
  const capture=async()=>{const access=await d.db.run(tx=>authorizeScheduledRecovery(d,tx,id,profile),true);const archive=await readCloudRecovery(sourceId,{origin:familyOrigin(d.config,id),audience:'family',owners:access.family.profiles!},{read:(collection,key,version)=>service.read(scope,scope,collection,key,version)});
   if(archive.manifest.scope.owners.some(owner=>!access.family.profiles?.includes(owner)||!access.grant.profiles.includes(owner)))throw Error('BACKUP_SCHEDULE_DENIED');
   const text=JSON.stringify(archive),sources:Record<string,string|null>={};if(text.length>96*1024*1024)throw Error('BACKUP_SCHEDULE_CAPACITY');for(let offset=0,n=0;offset<text.length;offset+=12_000_000,n++)sources['archive-'+String(n).padStart(2,'0')]=text.slice(offset,offset+12_000_000);return sources;
  };
  const scheduler=new RecoveryScheduler(new RecoveryPoints(service),ledgerFor(profile),{...schedule,maxPointsPerRun:1});
  const result=await scheduler.run([{actor:scope,scope,authorize:()=>d.db.run(authorize,true),capture}],state.selectedAt!);
  if(result.prepared.length){await d.db.run(async tx=>{await authorize(tx);const current=await tx.get<ScheduleState>(statePath);if(current?.selected===sourceId){const next={...current,copied:sourceId,lastCopiedAt:now};delete next.selected;delete next.selectedAt;tx.set(statePath,next);}});copied++;}
 }
 return {copied,pending};
}

export function familyBackupLedger(db:Firestore,d:FamilyDirectory,bucket:string,id:string,profile:string):BackupScheduleLedger {
 const authorize=()=>d.db.run(tx=>authorizeScheduledRecovery(d,tx,id,profile),true).then(()=>{}),artifacts=new GcsPrivateArtifacts(bucket,'beta-'+id);
 return new FirestoreBackupScheduleLedger(db,'beta-'+id,JSON.stringify([id,profile,'backups']),{
  put:async bytes=>guardedBackupOperation(d,id,profile,'artifact-write',tx=>authorizeScheduledRecovery(d,tx,id,profile),()=>artifacts.put(bytes),createHash('sha256').update(bytes).digest('hex')),get:async ref=>{await authorize();return artifacts.get(ref);}
 },async native=>{
  const readonly:Documents={get:async<T>(path:string)=>{const row=await native.get(db.doc(path));return row.exists?row.data() as T:undefined;},page:async()=>{throw Error('BACKUP_AUTH_QUERY_UNSUPPORTED');},set:()=>{throw Error('BACKUP_AUTH_READ_ONLY');},create:()=>{throw Error('BACKUP_AUTH_READ_ONLY');},delete:()=>{throw Error('BACKUP_AUTH_READ_ONLY');}};
  await authorizeScheduledRecovery(d,readonly,id,profile);
 });
}
