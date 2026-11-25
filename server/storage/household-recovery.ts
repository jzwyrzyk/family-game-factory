import {createHash} from 'node:crypto';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {authenticateAdultPilotSession} from '../adult-pilot';
import {assertActiveTrustedDevice,cookieValue} from '../trusted-devices';
import {verifySession} from '../pipeline/auth';
import {writeWorkspace} from '../pipeline/workspace-state';
import type {PipelineState} from '../pipeline/types';
import type {VerifiedSession} from '../contracts/api';
import type {AtomicStore,Documents} from '../beta/documents';
import type {HouseholdHost} from '../beta/owner-host';
import {readJsonBody} from '../http-json';
import {decodeArtifacts,type PrivateArtifacts} from './artifacts';
import {encodeGamePayload} from './game-payload';
import {ContinuityService,DocumentContinuityRepository} from './continuity';
import {republishGeneratedRecoveryArtifacts} from './generated-recovery-artifacts';
import {RecoveryPoints} from './recovery-points';
import type {BackupScheduleLedger} from './recovery-scheduler';
import {captureGeneratedRecovery,validateGeneratedRecovery,generatedRecoveryHash,mapGeneratedRecovery,importGeneratedRecovery,type GeneratedRecoverySnapshot} from './generated-recovery';
import {BACKUP_DOMAINS,readCloudRecovery} from '../../src/storage/cloud-recovery';
import {buildRecoveryArchive,validateRecoveryArchive,type RecoveryArchive} from '../../src/storage/recovery-format';
import {storageDomains,type StorageDomain} from '../../src/storage/sync-contract';
import {recordId} from '../../src/storage/record-contract';

export interface AdultRecoveryMapping {sourceOrigin:string;sourceAudience:string;targetAudience:string}
export interface HouseholdRecoveryConfig {
 platformMode?:'HOUSEHOLD'|'PRIVATE_FAMILY_BETA'|'PUBLIC';householdPrivateHost?:HouseholdHost;
 familyId:string;workspace:string;appOrigin:string;gatewayOrigin:string;sessionKey:string;storageEncoding?:'private-game-v2';
 householdRecovery?:{enabled:boolean;domains:StorageDomain[];adultMappings?:AdultRecoveryMapping[]};
}
type Reader=Pick<Documents,'get'>;
type LedgerFactory=(audience:string,authorize:(tx:Reader)=>Promise<void>)=>BackupScheduleLedger;
const digest=(text:string)=>createHash('sha256').update(text).digest('hex');
const adult=(value:unknown):value is string=>typeof value==='string'&&/^adult:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
const origin=(value:unknown):value is string=>typeof value==='string'&&/^https:\/\/[a-z0-9.-]+$/.test(value);
const canonical=(value:any):string=>value===null?'null':Array.isArray(value)?'['+value.map(canonical).join(',')+']':typeof value==='object'?'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}':JSON.stringify(value);
function enabled(config:HouseholdRecoveryConfig){
 const p=config.householdRecovery;
 if(p?.enabled!==true)throw Error('GENERATED_RECOVERY_DISABLED');
 if(config.platformMode&&config.platformMode!=='HOUSEHOLD'||!config.householdPrivateHost||config.appOrigin!==config.gatewayOrigin||!origin(config.appOrigin)||!recordId(config.familyId)||!/^[\w-]{1,100}$/.test(config.workspace)||!Array.isArray(p.domains)||BACKUP_DOMAINS.some(d=>!p.domains.includes(d))||p.domains.some(d=>!storageDomains.includes(d)))throw Error('HOUSEHOLD_RECOVERY_CONFIG_REQUIRED');
 const mappings=p.adultMappings??[];
 if(!Array.isArray(mappings)||mappings.length>100||mappings.some(m=>!m||Object.keys(m).some(k=>!['sourceOrigin','sourceAudience','targetAudience'].includes(k))||!origin(m.sourceOrigin)||!adult(m.sourceAudience)||!adult(m.targetAudience)||m.sourceAudience===m.targetAudience&&m.sourceOrigin===config.appOrigin||![config.appOrigin,config.householdPrivateHost!.sourceOrigin].includes(m.sourceOrigin))||new Set(mappings.map(m=>m.sourceAudience+'\0'+m.targetAudience)).size!==mappings.length)throw Error('HOUSEHOLD_RECOVERY_MAPPING_REQUIRED');
}
/** Authentication deliberately reads bounded transactional metadata without
 * resolving artwork/code. Missing original payloads must not lock out recovery. */
async function rawWorkspace(tx:Reader,workspace:string){
 const root=`factoryWorkspaces/${workspace}/state/current`,head=await tx.get<{version:number;chunks:number}>(root);
 if(!head||head.version!==1||!Number.isInteger(head.chunks)||head.chunks<1||head.chunks>16)throw Error('PERSISTENCE_SCHEMA_REJECTED');
 const parts=await Promise.all(Array.from({length:head.chunks},(_,i)=>tx.get<{json:string}>(root+'/chunks/'+i)));
 if(parts.some(p=>typeof p?.json!=='string'))throw Error('PERSISTENCE_CHUNK_MISSING');
 const originalParts=parts.map(p=>p!.json),serialized=originalParts.join('');if(Buffer.byteLength(serialized)>3*1024*1024)throw Error('WORKSPACE_CAPACITY_REACHED');
 const state=JSON.parse(serialized) as PipelineState;
 if(state.version!==1||!Array.isArray(state.jobs)||!Array.isArray(state.revisions)||!state.active||!state.ledgers||!Array.isArray(state.audit))throw Error('PERSISTENCE_SCHEMA_REJECTED');
 return {root,chunks:head.chunks,state,originalParts};
}
function exact(body:Record<string,unknown>,keys:string[]){if(Object.keys(body).some(key=>!keys.includes(key)))throw Error('INVALID_REQUEST');}
function archiveSources(archive:RecoveryArchive){const raw=JSON.stringify(archive),result:Record<string,string|null>={};if(Buffer.byteLength(raw)>96*1024*1024)throw Error('GENERATED_RECOVERY_CAPACITY');for(let i=0,n=0;i<raw.length;i+=12_000_000,n++)result['archive-'+String(n).padStart(2,'0')]=raw.slice(i,i+12_000_000);return result;}

async function hydrateCompatibleOriginals(state:PipelineState,snapshot:GeneratedRecoverySnapshot){
 // Compare retained immutable metadata and content-addressed originals before
     // repairing any missing payload. Never overwrite a conflicting revision.
     for(const revision of snapshot.revisions){const existing=state.revisions.find(r=>r.id===revision.id);if(!existing)continue;
      const {game:oldGame,...oldMeta}=existing,{game,...metadata}=revision;if(canonical(oldMeta)!==canonical(metadata))throw Error('GENERATED_RECOVERY_IMMUTABLE_CONFLICT');
      let expected:unknown=game;const stored=oldGame as any;
      const hashStore:PrivateArtifacts={put:async bytes=>({storage:'private-artifact-v1',sha256:digest(bytes.toString('utf8')),bytes:bytes.length}),get:async()=>{throw Error('UNEXPECTED_ARTIFACT_READ');}};
      if(stored?.storage==='private-artifact-v1')expected=await hashStore.put(Buffer.from(JSON.stringify(game)));
      else if(stored?.storage==='private-game-v2')expected=await encodeGamePayload(game,hashStore,JSON.stringify([revision.familyId,revision.adultPilotProfileId??null]));
      if(canonical(oldGame)!==canonical(expected))throw Error('GENERATED_RECOVERY_IMMUTABLE_CONFLICT');
      existing.game=game;
     }
}

/** Server-owned recovery namespace. Call only behind protectedHousehold; neither
 * uploaded artifacts nor client-issued attestations can enter this route. */
export function createHouseholdRecovery(config:HouseholdRecoveryConfig,store:AtomicStore,artifacts:PrivateArtifacts,ledgerFor:LedgerFactory){
 async function authenticate(tx:Reader,cookies:string|undefined,proof:string|string[]|undefined){
  enabled(config);
  const {adultSessionId:_id,adultProfileId:_profile,...browser}=verifySession(cookieValue(cookies,'factory_session'),config.sessionKey);
  if(browser.familyId!==config.familyId)throw Error('FORBIDDEN');const loaded=await rawWorkspace(tx,config.workspace);assertActiveTrustedDevice(loaded.state,browser);
  const session=authenticateAdultPilotSession(loaded.state,browser,cookieValue(cookies,'factory_adult'),proof);
  return {loaded,session};
 }
 function selection(session:VerifiedSession,body:Record<string,unknown>){
  if(body.profile!==session.adultProfileId)throw Error('GENERATED_RECOVERY_SCOPE_INVALID');
  const target=session.adultProfileId!,source=body.sourceAudience??target;
  if(!adult(source))throw Error('GENERATED_RECOVERY_SCOPE_INVALID');
  if(source===target&&(body.sourceOrigin===undefined||body.sourceOrigin===config.appOrigin))return {source,target,sourceOrigin:config.appOrigin,mapped:false};
  const mapping=config.householdRecovery!.adultMappings?.find(m=>m.sourceAudience===source&&m.targetAudience===target);
  if(!mapping||body.sourceOrigin!==undefined&&body.sourceOrigin!==mapping.sourceOrigin)throw Error('HOUSEHOLD_RECOVERY_MAPPING_REQUIRED');
  return {source,target,sourceOrigin:mapping.sourceOrigin,mapped:true};
 }
 async function request(cookies:string|undefined,proof:string|string[]|undefined,path:string,input:unknown){
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('INVALID_REQUEST');const body=input as Record<string,unknown>;
  const initial=await store.run(tx=>authenticate(tx,cookies,proof),true),target=initial.session.adultProfileId!;
  if(path==='mappings'){
   exact(body,[]);return {mappings:(config.householdRecovery!.adultMappings??[]).filter(m=>m.targetAudience===target).map(m=>{
    const restored=initial.loaded.state.revisions.filter(r=>r.familyId===config.familyId&&r.adultPilotProfileId===target&&r.recoveryProvenance?.playbackOnly===true&&r.recoveryProvenance.sourceAudience===m.sourceAudience&&r.recoveryProvenance.sourceOrigin===m.sourceOrigin);
    return {...m,familyId:config.familyId,workspace:config.workspace,targetOrigin:config.appOrigin,expiresAt:initial.session.expiresAt,revisionMap:Object.fromEntries(restored.map(r=>[r.recoveryProvenance!.sourceRevisionId,r.id])),projectMap:Object.fromEntries(restored.map(r=>[r.recoveryProvenance!.sourceProjectId,r.projectId]))};
   })};
  }
  const selected=selection(initial.session,body),scope={family:config.familyId,profile:'adult-generated-'+digest(selected.source).slice(0,48)};
  const authorize=async(tx:Reader)=>{const current=await authenticate(tx,cookies,proof);if(current.session.adultSessionId!==initial.session.adultSessionId||current.session.adultProfileId!==target||canonical(selection(current.session,body))!==canonical(selected))throw Error('ADULT_PILOT_ACCESS_REQUIRED');};
  const service=new ContinuityService(new DocumentContinuityRepository(store,'household-'+digest(config.workspace).slice(0,60),authorize),true);
  const read=async(id:unknown)=>{
   if(typeof id!=='string'||!/^scheduled-[a-f0-9]{48}$/.test(id))throw Error('INVALID_REQUEST');
   const archive=await readCloudRecovery(id,{origin:selected.sourceOrigin,audience:selected.source,owners:[selected.source]},{read:(collection,key,version)=>service.read(scope,scope,collection,key,version)});
   const values=await validateRecoveryArchive(archive,archive.manifest.scope);if(Object.keys(values).join(',')!=='generated'||typeof values.generated!=='string')throw Error('GENERATED_RECOVERY_FORMAT_INVALID');
   return {archive,snapshot:validateGeneratedRecovery(JSON.parse(values.generated),config.familyId,selected.source)};
  };
  let result:unknown;
  if(path==='list'){
   exact(body,['profile','sourceAudience','sourceOrigin','after']);if(typeof body.after!=='string')throw Error('INVALID_REQUEST');
   const page=await service.page(scope,scope,'generated-recovery-index',body.after,4);result={copies:page.records.filter(r=>!r.deleted).map(r=>r.value),next:page.next};
  }else if(path==='capture'){
   exact(body,['profile','requestId']);if(!recordId(body.requestId)||selected.mapped)throw Error('INVALID_REQUEST');
   const id='scheduled-'+digest(JSON.stringify([scope,body.requestId])).slice(0,48),ledger=ledgerFor(JSON.stringify([config.familyId,selected.source]),authorize);
   const frozen=await ledger.claim(id,async()=>{
    const snapshot=await store.run(async tx=>{await authorize(tx);const {loaded}=await authenticate(tx,cookies,proof),raw=loaded.state;
     const revisions=raw.revisions.filter(r=>r.familyId===config.familyId&&r.adultPilotProfileId===selected.source),ids=new Set(revisions.map(r=>r.id));
     const state=await decodeArtifacts(JSON.stringify({version:1,revisions,jobs:[],active:Object.fromEntries(Object.entries(raw.active).filter(([,id])=>ids.has(id))),ledgers:{},audit:[]}),artifacts);
     return captureGeneratedRecovery(state,config.familyId,selected.source);
    },true);
    const archive=await buildRecoveryArchive({origin:config.appOrigin,audience:selected.source,owners:[selected.source]},'Saved Adult generated games',{generated:JSON.stringify(snapshot)});return {sources:archiveSources(archive)};
   });
   if(!frozen.completed){await new RecoveryPoints(service).prepare(scope,scope,id,frozen.sources);await store.run(authorize,true);await ledger.complete(id);}
   const {archive,snapshot}=await read(id),summary={pointId:id,checksum:archive.manifest.checksum,createdAt:archive.manifest.createdAt,projects:new Set(snapshot.revisions.map(r=>r.projectId)).size,revisions:snapshot.revisions.length,sourceHash:generatedRecoveryHash(snapshot)};
   await service.commit(scope,{id:'index-'+id,scope,changes:[{collection:'generated-recovery-index',id,expectedVersion:0,value:summary}]});result=summary;
  }else if(path==='preview'||path==='restore'){
   exact(body,['profile','sourceAudience','sourceOrigin','pointId',...(path==='restore'?['checksum','approved','attemptId']:[])]);
   const {archive,snapshot:original}=await read(body.pointId),mapped=selected.mapped?mapGeneratedRecovery(original,config.familyId,selected.source,target,selected.sourceOrigin):{snapshot:original,revisionMap:Object.fromEntries(original.revisions.map(r=>[r.id,r.id])),projectMap:Object.fromEntries(original.revisions.map(r=>[r.projectId,r.projectId])),playbackOnly:original.revisions.some(r=>r.recoveryProvenance?.playbackOnly===true)};
   const summary={pointId:body.pointId,checksum:archive.manifest.checksum,createdAt:archive.manifest.createdAt,versions:original.revisions.length,games:Object.values(original.active).map(id=>original.revisions.find(r=>r.id===id)!).map(r=>({id:mapped.projectMap[r.projectId],title:r.name??(r.game&&'title'in r.game?r.game.title:'Saved game')})),revisionMap:mapped.revisionMap,projectMap:mapped.projectMap,playbackOnly:mapped.playbackOnly};
   if(path==='preview')result=summary;
   else{
    if(body.approved!==true||body.checksum!==archive.manifest.checksum||!recordId(body.attemptId))throw Error('RECOVERY_REVIEW_REQUIRED');
    const receiptPath=`factoryHouseholdRecovery/${config.workspace}/restores/`+digest(JSON.stringify([selected,body.pointId,body.checksum,body.attemptId]));
    const prior=await store.run(async tx=>{await authorize(tx);const receipt=await tx.get<Record<string,unknown>>(receiptPath);if(receipt)return receipt;const {loaded}=await authenticate(tx,cookies,proof);await hydrateCompatibleOriginals(loaded.state,original);if(selected.mapped)await hydrateCompatibleOriginals(loaded.state,mapped.snapshot);return null;},true);
    if(prior)result={...prior,alreadyRestored:true};
    else{
    const guardedArtifacts:PrivateArtifacts={get:ref=>artifacts.get(ref),put:async(bytes,options)=>{await store.run(authorize,true);return artifacts.put(bytes,options);}};
    // Retained source references also need their original bytes. Mapping never
    // deletes or rewrites their metadata, and publishes no target pointer yet.
    await republishGeneratedRecoveryArtifacts(original,guardedArtifacts);
    if(selected.mapped)await republishGeneratedRecoveryArtifacts(mapped.snapshot,guardedArtifacts);
    result=await store.run(async tx=>{
     await authorize(tx);const {loaded}=await authenticate(tx,cookies,proof),prior=await tx.get<Record<string,unknown>>(receiptPath);if(prior)return {...prior,alreadyRestored:true};
     const snapshot=mapped.snapshot;
     await hydrateCompatibleOriginals(loaded.state,snapshot);
     const imported=importGeneratedRecovery(loaded.state,snapshot,config.familyId,target);
     // Only restored revisions were hydrated. Unrelated games/jobs retain their
     // exact artifact references; grants, jobs and accounting remain untouched.
     await writeWorkspace(tx,loaded,artifacts,{splitGamePayloads:config.storageEncoding==='private-game-v2'});
     const receipt={...summary,attemptId:body.attemptId,...imported};tx.create(receiptPath,receipt);return receipt;
    });
    }
   }
  }else throw Error('NOT_FOUND');
  // Withdrawal during a long read cannot return archive details after revocation.
  await store.run(authorize,true);return result;
 }
 const handler=async(req:IncomingMessage,res:ServerResponse)=>{
  res.setHeader('Cache-Control','private, no-store');res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('X-Content-Type-Options','nosniff');
  try{
   const path=new URL(req.url??'/',config.appOrigin).pathname;
   if(req.headers.origin!==config.appOrigin)throw Error('FORBIDDEN');
   let action:string,input:unknown;
   if(path==='/v1/recovery/adult/mappings'&&req.method==='GET'){action='mappings';input={};}
   else{if(!/^\/v1\/recovery\/generated\/(?:list|capture|preview|restore)$/.test(path)||req.method!=='POST'||req.headers['x-factory-request']!=='1'||!req.headers['content-type']?.startsWith('application/json'))throw Error('FORBIDDEN');action=path.split('/').at(-1)!;input=await readJsonBody(req,8192,{invalidJsonError:'INVALID_REQUEST'});}
   const value=await request(req.headers.cookie,req.headers['x-factory-adult-session'],action,input);res.writeHead(200);res.end(JSON.stringify(value));
  }catch(error){const message=(error as Error).message,code=/^[A-Z][A-Z0-9_]{1,80}$/.test(message)?message:'RECOVERY_UNAVAILABLE';res.writeHead(code==='NOT_FOUND'?404:code==='GENERATED_RECOVERY_DISABLED'?503:403);res.end(JSON.stringify({error:code}));}
 };
 return {request,handler};
}
