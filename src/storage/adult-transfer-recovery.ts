import {parsePrivateArtId, mapSceneAssetIds} from '../creation/model';
import {currentAdultSession} from '../adult-pilot/session';
import {adultStorageKey,adultWorkspaceId} from '../adult-pilot/storage';
import {familyFetch} from '../builder/session';
import {REWARDS_DB_NAME} from '../rewards/store';
import {PALS_DB_NAME} from '../pals/store';
import {assemblyHash} from '../creation/private-art';
import {recoveryHash as sha256,type RecoveryArchive,type RecoveryScope} from './recovery-format';
import {decodeCompleteBackup,encodeCompleteBackup,completeSources,transferredRecoveryScope,type CompleteBackup} from './complete-backup';
import {nativeSnapshotsOf} from './native-recovery';
import {notebookSnapshotsOf} from './notebook-recovery';
import {creationSnapshotsOf} from './creation-recovery';
import {verifyAdultRecovery} from './adult-recovery';
export interface AdultRecoveryMapping {familyId:string;workspace:string;sourceOrigin:string;targetOrigin:string;sourceAudience:string;targetAudience:string;expiresAt:number;revisionMap?:Record<string,string>;projectMap?:Record<string,string>}
export interface GeneratedRecoveryMap {revisionMap:Record<string,string>;projectMap:Record<string,string>}
const adult=(value:unknown):value is string=>typeof value==='string'&&/^adult:[a-f0-9-]{36}$/i.test(value);
export async function requestAdultRecovery(path:string,input?:object){
 const session=currentAdultSession();if(!session||adultWorkspaceId()!==session.profileId)throw Error('Open a fresh Private parent session before recovery.');
 const response=await familyFetch(session.base,path,{method:'POST',headers:{'Content-Type':'application/json','X-Factory-Request':'1'},body:JSON.stringify({profile:session.profileId,...(input??{})}),cache:'no-store'});
 if(!response.ok)throw Error('Private recovery is unavailable or its approval has changed. Your original copies are safe.');return response.json();
}
export async function transferredAdultMappings():Promise<AdultRecoveryMapping[]>{
 const target=currentAdultSession()?.profileId;if(!target)throw Error('Open Private parent access first.');await verifyAdultRecovery(target);
 const response=await requestAdultRecovery('/v1/recovery/adult/mappings'),scope:RecoveryScope={origin:location.origin,audience:target,owners:[target]},source=transferredRecoveryScope(scope),receipt=JSON.parse(localStorage.getItem('jems-recovery-origin-transfer-v1')??'null');
 if(!source||!receipt)throw Error('Complete the approved household transfer before recovering an earlier private workspace.');
 if(!Array.isArray(response.mappings))throw Error('The private recovery mapping is invalid.');return response.mappings.filter((mapping:AdultRecoveryMapping)=>mapping&&mapping.familyId===receipt.familyId&&mapping.workspace===receipt.workspace&&mapping.sourceOrigin===source.origin&&mapping.targetOrigin===location.origin&&adult(mapping.sourceAudience)&&mapping.targetAudience===target&&Number.isSafeInteger(mapping.expiresAt)&&mapping.expiresAt>Date.now());
}
export function remoteRecoveryReferences(snapshot:CompleteBackup):string[]{
 const result=new Set<string>();for(const session of completeSources(snapshot).notebooks.flatMap(row=>row.notebook.sessions)){if(session.remoteId)result.add(session.remoteId);for(const candidate of [session.candidate,session.undone,...(session.experiments??[]).map((x:any)=>x.candidate)])if(candidate?.remoteId){result.add(candidate.remoteId);if(candidate.baseId)result.add(candidate.baseId);}for(const kept of session.keptExperiments??[])if(kept.kind==='remote'){result.add(kept.revisionId);result.add(kept.baseId);}}
 return [...result];
}
/** Maps only schema-owned identity fields. Authored words, original picture
 * bytes and the source archive remain untouched. Server mappings are needed
 * for every remote original; pending paid operations stay in the source copy. */
export async function mapTransferredAdultBackup(archive:RecoveryArchive,mapping:AdultRecoveryMapping,remote:GeneratedRecoveryMap={revisionMap:{},projectMap:{}}):Promise<RecoveryArchive>{
 const scope=archive.manifest.scope;if(!adult(mapping.sourceAudience)||!adult(mapping.targetAudience)||mapping.sourceAudience===mapping.targetAudience&&mapping.sourceOrigin===mapping.targetOrigin||scope.audience!==mapping.sourceAudience||scope.origin!==mapping.sourceOrigin||scope.owners.length!==1||scope.owners[0]!==mapping.sourceAudience)throw Error('The private source does not match its reviewed mapping.');
 const snapshot=await decodeCompleteBackup(archive,scope),resolved=completeSources(snapshot),p=snapshot.progress; p.factoryWorkspace=resolved.native[0].workspace;p.factoryStudio=resolved.notebooks[0].notebook;p.factoryCreation=resolved.creations[0].workspace;const source=mapping.sourceAudience,target=mapping.targetAudience;
 const changeOwner=(row:any)=>{if(row.owner!==source)throw Error('The private copy includes another owner.');row.owner=target;};
 const outbox=(rows:any[]|undefined)=>{for(const row of rows??[])changeOwner(row);};
 for(const profile of p.profiles){if(profile.id!==source)throw Error('The private profile is invalid.');profile.id=target;outbox(profile.rewardOutbox);}p.activeProfile=target;for(const feedback of p.feedback??[]){if(feedback.profile!==source)throw Error('Private feedback belongs to another player.');feedback.profile=target;}
 for(const project of p.factoryWorkspace.projects)changeOwner(project);for(const project of p.factoryCreation.projects)changeOwner(project);outbox(p.factoryCreation.rewardOutbox);
 const book=p.factoryStudio;for(const key of ['active','avatars','guidance','notifications'])if(book[key])book[key]=Object.fromEntries(Object.entries(book[key]).map(([owner,value])=>{if(owner!==source)throw Error('Private preferences belong to another player.');return [target,value];}));outbox(book.rewardOutbox);for(const chapter of book.conversationChapters??[])changeOwner(chapter);
 const revision=(id:string)=>{const mapped=remote.revisionMap[id];if(typeof mapped!=='string'||!/^[\w:-]{1,160}$/.test(mapped))throw Error('Recover the matching original workshop games before moving their notebook.');return mapped;};
 for(const session of book.sessions){changeOwner(session);const hasRemote=!!session.remoteId||[session.candidate,session.undone,...(session.experiments??[]).map((x:any)=>x.candidate)].some(c=>c?.remoteId);const pending=!!session.pendingSubmission||!!session.pendingCopy||!!session.job;
  if(session.remoteId)session.remoteId=revision(session.remoteId);for(const candidate of [session.candidate,session.undone,...(session.experiments??[]).map((x:any)=>x.candidate)])if(candidate?.remoteId){candidate.remoteId=revision(candidate.remoteId);if(candidate.baseId)candidate.baseId=revision(candidate.baseId);}
  for(const experiment of session.experiments??[])if(experiment.candidate?.remoteId&&experiment.baseId)experiment.baseId=revision(experiment.baseId);
  for(const kept of session.keptExperiments??[])if(kept.kind==='remote'){kept.revisionId=revision(kept.revisionId);kept.baseId=revision(kept.baseId);}
  if(session.rewardProjectId&&remote.projectMap[session.rewardProjectId])session.rewardProjectId=remote.projectMap[session.rewardProjectId];
  if(hasRemote||pending)session.playOnly=true;session.job=null;session.pendingSubmission=null;session.pendingCopy=null;session.pendingExperiment=null;
 }
 for(const episode of p.factoryProblemSolving?.episodes??[])changeOwner(episode);for(const draft of p.factoryProblemSolving?.drafts??[])changeOwner(draft.episode);if(p.factoryProblemSolving?.discardedByOwner)p.factoryProblemSolving.discardedByOwner=Object.fromEntries(Object.entries(p.factoryProblemSolving.discardedByOwner).map(([owner,value])=>{if(owner!==source)throw Error('Private observations belong to another player.');return [target,value];}));
 for(const ledger of p.factoryRewards.data.profiles){changeOwner(ledger);for(const receipt of ledger.receipts)if(receipt.fact)changeOwner(receipt.fact);}p.factoryRewards.namespace=adultStorageKey(REWARDS_DB_NAME,target);for(const profile of p.factoryPals.data.profiles)changeOwner(profile);p.factoryPals.namespace=adultStorageKey(PALS_DB_NAME,target);
 const pictures=new Map<string,string>(),rigs=new Map<string,string>(),rigHashes=new Map<string,string>();const mappedId=async(kind:string,id:string)=>'recovered-'+(await sha256(JSON.stringify([mapping.sourceOrigin,source,target,kind,id]))).slice(0,64);
 for(const entry of snapshot.art){if(entry.owner!==source)throw Error('Private artwork belongs to another player.');entry.owner=target;for(const drawing of entry.bundle.drawings)pictures.set(drawing.id,await mappedId('picture',drawing.id));for(const rig of entry.bundle.rigs)rigs.set(rig.id,await mappedId('rig',rig.id));}
 const picture=(id:string)=>{const result=pictures.get(id);if(!result)throw Error('An original private picture is missing.');return result;},rig=(id:string)=>{const result=rigs.get(id);if(!result)throw Error('An original private movement version is missing.');return result;};
 for(const entry of snapshot.art){for(const drawing of entry.bundle.drawings){drawing.id=picture(drawing.id);if(drawing.sourceId)drawing.sourceId=picture(drawing.sourceId);}for(const saved of entry.bundle.rigs){const prior=saved.id;saved.id=rig(prior);if(saved.parentId)saved.parentId=rig(saved.parentId);saved.assembly.sourceId=picture(saved.assembly.sourceId);rigHashes.set(prior,await assemblyHash(saved.assembly));}for(const draft of entry.bundle.drafts??[]){draft.sourceId=picture(draft.sourceId);draft.assembly.sourceId=picture(draft.assembly.sourceId);if(draft.parentId)draft.parentId=rig(draft.parentId);}if(entry.activeRigId)entry.activeRigId=rig(entry.activeRigId);}
 for(const saved of p.factoryWorkspace.revisions)if(saved.drawingRigId)saved.drawingRigId=rig(saved.drawingRigId);
 for(const saved of [...p.factoryCreation.revisions,...p.factoryCreation.drafts]){
   const source=saved.scene.provenance;
   if(source?.sourceKind==='art'){
     if(pictures.has(source.sourceProjectId))source.sourceProjectId=picture(source.sourceProjectId);
     if(rigs.has(source.sourceRevisionId))source.sourceRevisionId=rig(source.sourceRevisionId);
   }
   mapSceneAssetIds(saved.scene, assetId=>{
   const ref=parsePrivateArtId(assetId);if(!ref)return assetId;
   return ref.kind==='image'?`art:image:${picture(ref.id)}:${ref.sha256}`:`art:rig:${rig(ref.id)}:${rigHashes.get(ref.id)}`;
   });
 }
 if(snapshot.native?.length||snapshot.notebooks?.length||snapshot.creations?.length){snapshot.preparedDomains=true;snapshot.native=nativeSnapshotsOf(p.factoryWorkspace,[target]);snapshot.notebooks=notebookSnapshotsOf(p.factoryStudio,[target]);snapshot.creations=creationSnapshotsOf(p.factoryCreation,[target]);p.factoryWorkspace={version:2,projects:[],revisions:[],plays:[]};p.factoryStudio={version:1,sessions:[],active:{}};p.factoryCreation={schema:'jems.creation.workspace.v1',projects:[],revisions:[],drafts:[],attempts:[]};}
 snapshot.provenance={schema:'jems.adult-recovery-map.v1',sourceScope:structuredClone(scope),sourcePointId:archive.manifest.id,sourceChecksum:archive.manifest.checksum,targetAudience:target};
 const id='mapped-'+(await sha256(JSON.stringify([archive.manifest.checksum,mapping.targetOrigin,target]))).slice(0,64);return encodeCompleteBackup({origin:mapping.targetOrigin,audience:target,owners:[target]},snapshot,'Recovered private workspace',id,archive.manifest.createdAt);
}
