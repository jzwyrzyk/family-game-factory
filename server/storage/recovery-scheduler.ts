import {createHash} from 'node:crypto';
import type {ContinuityPrincipal} from './continuity';
import type {RecordScope} from '../../src/storage/record-contract';
import {RecoveryPoints} from './recovery-points';
export interface BackupSchedule {enabled:boolean;intervalMs:number;maxPointsPerRun:number}
export interface BackupCapture {actor:ContinuityPrincipal;scope:RecordScope;/** Authorization must be refreshed for every capture/resume. */authorize:()=>Promise<void>;/** Consistent snapshot including originals, never temporary source URLs. */capture:()=>Promise<Record<string,string|null>>}
export interface BackupScheduleLedger {/** Must be a durable atomic CAS. The frozen sources make retry independent of later edits. */claim:(key:string,make:()=>Promise<{sources:Record<string,string|null>}> )=>Promise<{sources:Record<string,string|null>;completed:boolean}>;complete:(key:string)=>Promise<void>}
/** Explicit opt-in orchestration. An environment supplies durable scoped ledger,
 * current grants and domain capture; constructing this creates no cloud resource.
 * There is intentionally no retention expiry or object deletion operation. */
export class RecoveryScheduler {
 constructor(private points:RecoveryPoints,private ledger:BackupScheduleLedger,private policy:BackupSchedule={enabled:false,intervalMs:86400000,maxPointsPerRun:10}){
  if(!Number.isSafeInteger(policy.intervalMs)||policy.intervalMs<60000||!Number.isInteger(policy.maxPointsPerRun)||policy.maxPointsPerRun<1||policy.maxPointsPerRun>100)throw Error('BACKUP_SCHEDULE_INVALID');
 }
 async run(captures:BackupCapture[],now=Date.now()):Promise<{prepared:string[];deferred:number}>{
  if(!this.policy.enabled)return {prepared:[],deferred:captures.length};if(!Number.isFinite(now)||now<0)throw Error('BACKUP_TIME_INVALID');
  const prepared:string[]=[];for(const capture of captures.slice(0,this.policy.maxPointsPerRun)){
   await capture.authorize();const key='scheduled-'+createHash('sha256').update(JSON.stringify([capture.scope,Math.floor(now/this.policy.intervalMs)])).digest('hex').slice(0,48);
   const receipt=await this.ledger.claim(key,async()=>{await capture.authorize();return {sources:await capture.capture()};});
   if(!receipt.completed){await capture.authorize();await this.points.prepare(capture.actor,capture.scope,key,receipt.sources);await capture.authorize();await this.ledger.complete(key);}prepared.push(key);
  }return {prepared,deferred:Math.max(0,captures.length-this.policy.maxPointsPerRun)};
 }
}

/** Existing private Firestore + artifact adapter, with no provisioning. Frozen
 * snapshots use immutable audience-bound chunks; the Firestore transaction only
 * publishes one winner's manifest and never stores full artwork in a document. */
export class FirestoreBackupScheduleLedger implements BackupScheduleLedger {
 constructor(private db:import('@google-cloud/firestore').Firestore,private workspace:string,private audience:string,private artifacts:import('./artifacts').PrivateArtifacts,private authorizeTransaction:(tx:FirebaseFirestore.Transaction)=>Promise<void>=async()=>{}){if(!/^[\w-]{1,100}$/.test(workspace)||!audience||audience.length>250)throw Error('BACKUP_LEDGER_SCOPE_INVALID');}
 private ref(key:string){if(!/^scheduled-[a-f0-9]{48}$/.test(key))throw Error('BACKUP_LEDGER_KEY_INVALID');return this.db.doc(`factoryBackupSchedules/${this.workspace}/points/${createHash('sha256').update(JSON.stringify([this.audience,key])).digest('hex')}`);}
 private async decode(record:any):Promise<{sources:Record<string,string|null>;completed:boolean}>{
  if(record?.schema!=='jems.backup-schedule.v1'||record.audience!==this.audience||!Array.isArray(record.parts)||record.parts.length<1||record.parts.length>32)throw Error('BACKUP_LEDGER_INVALID');
  const sources:Record<string,string|null>={};let total=0;
  for(const part of record.parts){if(!part||typeof part.key!=='string'||!/^[\w:-]{1,160}$/.test(part.key)||Object.hasOwn(sources,part.key)||!Array.isArray(part.refs)||part.refs.length>64||typeof part.sha256!=='string')throw Error('BACKUP_LEDGER_INVALID');let text='';for(const ref of part.refs){const bytes=await this.artifacts.get(ref);total+=bytes.length;if(total>100*1024*1024)throw Error('BACKUP_LEDGER_CAPACITY');const chunk=JSON.parse(bytes.toString('utf8'));if(chunk.audience!==this.audience||typeof chunk.text!=='string')throw Error('BACKUP_LEDGER_SCOPE_INVALID');text+=chunk.text;}if(createHash('sha256').update(text).digest('hex')!==part.sha256)throw Error('BACKUP_LEDGER_INTEGRITY');const value=JSON.parse(text);if(value!==null&&typeof value!=='string')throw Error('BACKUP_LEDGER_INVALID');sources[part.key]=value;}
  return {sources,completed:record.completed===true};
 }
 async claim(key:string,make:()=>Promise<{sources:Record<string,string|null>}>){
  const ref=this.ref(key),existing=await ref.get();if(existing.exists)return this.decode(existing.data());const {sources}=await make();if(!sources||Object.keys(sources).length<1||Object.keys(sources).length>32)throw Error('BACKUP_LEDGER_INVALID');
  const parts=[];let total=0;for(const [name,value] of Object.entries(sources).sort(([a],[b])=>a.localeCompare(b))){if(!/^[\w:-]{1,160}$/.test(name)||value!==null&&typeof value!=='string'||(value?.length??0)>16_000_000)throw Error('BACKUP_LEDGER_INVALID');const text=JSON.stringify(value),refs=[];total+=Buffer.byteLength(text);if(total>96*1024*1024)throw Error('BACKUP_LEDGER_CAPACITY');for(let offset=0;offset<text.length;offset+=256000)refs.push(await this.artifacts.put(Buffer.from(JSON.stringify({audience:this.audience,text:text.slice(offset,offset+256000)}))));parts.push({key:name,sha256:createHash('sha256').update(text).digest('hex'),refs});}
  const proposed={schema:'jems.backup-schedule.v1',audience:this.audience,parts,completed:false};const selected=await this.db.runTransaction(async tx=>{await this.authorizeTransaction(tx);const current=await tx.get(ref);if(current.exists)return current.data();tx.create(ref,proposed);return proposed;});return this.decode(selected);
 }
 async complete(key:string){const ref=this.ref(key);await this.db.runTransaction(async tx=>{await this.authorizeTransaction(tx);const current=await tx.get(ref);if(!current.exists||current.data()?.audience!==this.audience)throw Error('BACKUP_LEDGER_MISSING');tx.update(ref,{completed:true});});}
}
