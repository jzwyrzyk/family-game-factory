import {createHash,randomUUID} from 'node:crypto';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {readJsonBody} from '../http-json';
import {verifySession} from '../pipeline/auth';
import {cookieValue} from '../trusted-devices';
import {buildRecoveryArchive,validateRecoveryArchive,type RecoveryArchive} from '../../src/storage/recovery-format';
import {readCloudRecovery} from '../../src/storage/cloud-recovery';
import {ContinuityService,DocumentContinuityRepository} from '../storage/continuity';
import {RecoveryPoints} from '../storage/recovery-points';
import type {BackupScheduleLedger} from '../storage/recovery-scheduler';
import {captureGeneratedRecovery,validateGeneratedRecovery,generatedRecoveryHash,importGeneratedRecovery,type GeneratedRecoverySnapshot} from '../storage/generated-recovery';
import {recordId} from '../../src/storage/record-contract';
import {authorizeBackupData,cloudBackupSchedule,backupIneligible} from './recovery';
import {guardedBackupOperation,BackupOperationNotStarted} from './backup-operations';
import {exact,internalCookies,metadataPlay} from './access';
import {familyOrigin} from './model';
import type {FamilyDirectory} from './store';
import type {Documents} from './documents';
const digest=(v:string)=>createHash('sha256').update(v).digest('hex');
const internalScope=(family:string)=>({family,profile:'server-generated'});
const enabled=(d:FamilyDirectory)=>(d.config.continuity as {generatedRecovery?:boolean}|undefined)?.generatedRecovery===true;
function requireEnabled(d:FamilyDirectory){if(!enabled(d))throw Error('GENERATED_RECOVERY_DISABLED');}
function sources(archive:RecoveryArchive){const raw=JSON.stringify(archive),result:Record<string,string|null>={};if(Buffer.byteLength(raw)>96*1024*1024)throw Error('GENERATED_RECOVERY_CAPACITY');for(let offset=0,n=0;offset<raw.length;offset+=12_000_000,n++)result['archive-'+String(n).padStart(2,'0')]=raw.slice(offset,offset+12_000_000);return result;}
function repository(d:FamilyDirectory,family:string,authorize:(tx:Documents)=>Promise<unknown>){return new ContinuityService(new DocumentContinuityRepository(d.db,'beta-'+family,async tx=>{requireEnabled(d);await authorize(tx);}),true);}
async function readPoint(d:FamilyDirectory,family:string,profile:string,id:string,authorize:(tx:Documents)=>Promise<unknown>){
 if(!/^scheduled-[a-f0-9]{48}$/.test(id))throw Error('INVALID_REQUEST');const access=await d.db.run(async tx=>{requireEnabled(d);await authorize(tx);return authorizeBackupData(d,tx,family,profile);},true),scope=internalScope(family),service=repository(d,family,authorize);
 const archive=await readCloudRecovery(id,{origin:familyOrigin(d.config,family),audience:'family',owners:access.family.profiles!},{read:(collection,key,version)=>service.read(scope,scope,collection,key,version)});
 const values=await validateRecoveryArchive(archive,archive.manifest.scope);if(Object.keys(values).join(',')!=='generated')throw Error('GENERATED_RECOVERY_FORMAT_INVALID');const snapshot=validateGeneratedRecovery(JSON.parse(values.generated),family);return {archive,snapshot};
}
async function savePoint(d:FamilyDirectory,family:string,profile:string,id:string,ledger:BackupScheduleLedger,authorize:(tx:Documents)=>Promise<unknown>){
 requireEnabled(d);const scope=internalScope(family),service=repository(d,family,authorize),receipt=await ledger.claim(id,async()=>{
  const captured=await d.withFamily(family,async(tx,f,p)=>{requireEnabled(d);await authorize(tx);const snapshot=await d.inWorkspace(tx,f,p,state=>captureGeneratedRecovery(state,family),false);return {snapshot,owners:f.profiles!};});
  const archive=await buildRecoveryArchive({origin:familyOrigin(d.config,family),audience:'family',owners:captured.owners},'Saved generated games',{generated:JSON.stringify(captured.snapshot)});return {sources:sources(archive)};
 });
 if(!receipt.completed){await new RecoveryPoints(service).prepare(scope,scope,id,receipt.sources);await d.db.run(async tx=>{requireEnabled(d);await authorize(tx);},true);await ledger.complete(id);}
 const {archive,snapshot}=await readPoint(d,family,profile,id,authorize),summary={pointId:id,checksum:archive.manifest.checksum,createdAt:archive.manifest.createdAt,projects:new Set(snapshot.revisions.map(r=>r.projectId)).size,revisions:snapshot.revisions.length,sourceHash:generatedRecoveryHash(snapshot)};
 await service.commit(scope,{id:'index-'+id,scope,changes:[{collection:'generated-recovery-index',id,expectedVersion:0,value:summary}]});return summary;
}
/** This private scope can never be supplied by a browser: registered family
 * profiles are server-issued UUIDs. Client-uploaded archives are not trusted
 * compilation/quality attestations and are never eligible for remote restore. */
export async function runGeneratedCloudRecovery(d:FamilyDirectory,family:string,ledgerFor:(profile:string)=>BackupScheduleLedger,now=Date.now()){
 const schedule=cloudBackupSchedule(d);if(!enabled(d)||!schedule.enabled||!d.config.continuity?.enabled)return {copied:false};const f=await d.withFamily(family,async(_tx,f)=>f),profile=f.profiles?.[0];if(!profile)return {copied:false};const authorize=(tx:Documents)=>authorizeBackupData(d,tx,family,profile,true);
 try{await d.db.run(authorize,true);}catch(error){if(backupIneligible(error))return {copied:false};throw error;}
 const path=d.path(family)+'/backup-scans/'+digest('server-generated'),last=await d.db.run(async tx=>{await authorize(tx);return tx.get<{period:number}>(path);},true),period=Math.floor(now/schedule.intervalMs);if(last?.period===period)return {copied:false};
 const key='scheduled-'+digest(JSON.stringify([internalScope(family),period])).slice(0,48);await savePoint(d,family,profile,key,ledgerFor(profile),authorize);await d.db.run(async tx=>{await authorize(tx);tx.set(path,{period,pointId:key});});return {copied:true};
}
export async function generatedRecoveryRequest(d:FamilyDirectory,family:string,raw:string|undefined,key:string,path:string,input:unknown,ledgerFor:(profile:string)=>BackupScheduleLedger){
 requireEnabled(d);if(!input||typeof input!=='object'||!('profile'in input)||!recordId(input.profile))throw Error('INVALID_REQUEST');const body=input as Record<string,unknown>,profile=input.profile;
 const authorize=async(tx:Documents)=>{requireEnabled(d);const {family:f}=await authorizeBackupData(d,tx,family,profile),session=await metadataPlay(d,tx,f,raw,key,Date.now()),parent=verifySession(cookieValue(internalCookies(raw),'factory_parent'),key);if(parent.role!=='parent'||parent.familyId!==family||parent.deviceId!==session.deviceId)throw Error('FORBIDDEN');};
 await d.db.run(authorize,true);const scope=internalScope(family),service=repository(d,family,authorize);
 if(path==='list'){exact(body,['profile','after']);if(typeof body.after!=='string')throw Error('INVALID_REQUEST');const page=await service.page(scope,scope,'generated-recovery-index',body.after,4);return {copies:page.records.map(r=>r.value),next:page.next};}
 if(path==='capture'){exact(body,['profile','requestId']);if(!recordId(body.requestId))throw Error('INVALID_REQUEST');return savePoint(d,family,profile,'scheduled-'+digest(JSON.stringify([scope,body.requestId])).slice(0,48),ledgerFor(profile),authorize);}
 if(path!=='preview'&&path!=='restore')throw Error('NOT_FOUND');exact(body,path==='preview'?['profile','pointId']:['profile','pointId','checksum','approved']);if(typeof body.pointId!=='string')throw Error('INVALID_REQUEST');const {archive,snapshot}=await readPoint(d,family,profile,body.pointId,authorize);
 if(path==='preview')return {pointId:body.pointId,checksum:archive.manifest.checksum,createdAt:archive.manifest.createdAt,versions:snapshot.revisions.length,games:Object.values(snapshot.active).map(id=>snapshot.revisions.find(r=>r.id===id)!).map(r=>({id:r.projectId,title:r.name??(r.game&&'title'in r.game?r.game.title:'Saved game')}))};
 if(body.approved!==true||body.checksum!==archive.manifest.checksum)throw Error('RECOVERY_REVIEW_REQUIRED');const receiptPath=d.path(family)+'/generated-restores/'+digest(body.pointId+':'+body.checksum);
 return guardedBackupOperation<Record<string,unknown>>(d,family,profile,'generated-restore',authorize,async()=>{let mayHaveWritten=false;try{return await d.withFamily(family,async(tx,f,p)=>{await authorize(tx);const prior=await tx.get<Record<string,unknown>>(receiptPath);if(prior)return {...prior,alreadyRestored:true};const result=await d.inWorkspace(tx,f,p,state=>{const result=importGeneratedRecovery(state,snapshot,family);mayHaveWritten=true;return result;},true);const receipt={pointId:body.pointId,checksum:body.checksum,...result};tx.create(receiptPath,receipt);return receipt;});}catch(error){if(!mayHaveWritten)throw new BackupOperationNotStarted(error);throw error;}},undefined,{pointId:body.pointId,checksum:archive.manifest.checksum,result:receipt=>({...receipt,alreadyRestored:true})});
}
export async function generatedRecoveryHttp(d:FamilyDirectory,family:string,raw:string|undefined,key:string,req:IncomingMessage,res:ServerResponse,ledgerFor:(profile:string)=>BackupScheduleLedger){if(req.method!=='POST')throw Error('FORBIDDEN');const input=await readJsonBody(req,8192,{invalidJsonError:'INVALID_REQUEST'}),path=req.url?.split('/').at(-1)??'';const value=await generatedRecoveryRequest(d,family,raw,key,path,input,ledgerFor);res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));}
