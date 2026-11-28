import {createHash} from 'node:crypto';
import {exact} from './access';
import {uuid,workspaceOf} from './model';
import {readPoint} from './generated-recovery';
import {authorizeBackupData} from './recovery';
import {pendingReservations} from './portability';
import type {PipelineState} from '../pipeline/types';
import {readWorkspace,writeSerializedWorkspace} from '../pipeline/workspace-state';
import {generatedRecoveryHash,type GeneratedRecoverySnapshot} from '../storage/generated-recovery';
import type {Documents} from './documents';
import type {FamilyDirectory} from './store';

interface Receipt {requestId:string;projectId:string;removed:number;pointId:string;checksum:string}
const projectSlice=(s:GeneratedRecoverySnapshot,projectId:string)=>({...s,revisions:s.revisions.filter(r=>r.projectId===projectId).sort((a,b)=>a.id.localeCompare(b.id)),active:s.active[projectId]?{[projectId]:s.active[projectId]}:{}});

/** Remove only checked, fully settled synthetic revision metadata. Keep the
 * original server backup, immutable objects, billing lineage and job history. */
export async function resetSyntheticProject(d:FamilyDirectory,subject:string,input:unknown,expiresAt:number){
 const bound=d.config.testReset;
 exact(input,['familyId','projectId','requestId','expectedRevisions','profile','pointId','checksum']);
 const {familyId,projectId,requestId,expectedRevisions,profile,pointId,checksum}=input;
 if(d.config.environment!=='test'||!bound||subject!==bound.subject||subject===d.config.administrator.subject||familyId!==bound.familyId||!uuid(familyId))throw Error('FORBIDDEN');
 if(!uuid(projectId)||!uuid(requestId)||!uuid(profile)||typeof pointId!=='string'||typeof checksum!=='string'||!/^[a-f0-9]{64}$/.test(checksum)||
   !Array.isArray(expectedRevisions)||expectedRevisions.length<1||expectedRevisions.length>32||!expectedRevisions.every(uuid)||
   new Set(expectedRevisions).size!==expectedRevisions.length)throw Error('INVALID_REQUEST');
 const authorize=async(tx:Documents)=>{
  if(!Number.isSafeInteger(expiresAt)||Date.now()>=expiresAt)throw Error('FORBIDDEN');
  return authorizeBackupData(d,tx,familyId,profile);
 };
 const ids=[...expectedRevisions].sort(),fingerprint=createHash('sha256').update(JSON.stringify([familyId,projectId,profile,pointId,checksum,ids])).digest('hex');
 const receiptPath=d.path(familyId)+'/test-resets/'+requestId;
 const {archive,snapshot}=await readPoint(d,familyId,profile,pointId,authorize);
 const original=projectSlice(snapshot,projectId);
 if(archive.manifest.checksum!==checksum||!original.active[projectId]||JSON.stringify(ids)!==JSON.stringify(original.revisions.map(r=>r.id)))throw Error('TEST_RESET_CONFLICT');
 return d.db.run(async tx=>{
  const {family}=await authorize(tx),prior=await tx.get<{fingerprint:string;receipt:Receipt}>(receiptPath);
  if(prior){if(prior.fingerprint!==fingerprint)throw Error('TEST_RESET_CONFLICT');return prior.receipt;}
  const workspace=workspaceOf(family),artifacts=d.recoveryArtifacts(familyId);
  if((await tx.page('factoryBackupSchedules/'+workspace+'/activeOperations','',1)).length)throw Error('TEST_RESET_BUSY');
  const loaded=await readWorkspace(tx,workspace,artifacts),state=loaded.state;
  if(Object.values(state.ledgers).some(l=>!Number.isSafeInteger(l.reserved)||l.reserved!==0)||pendingReservations(state).length||state.jobs.some(j=>j.status==='draft'))throw Error('TEST_RESET_BUSY');
  const target=projectSlice({...snapshot,revisions:state.revisions,active:state.active},projectId),removed=new Set(ids);
  if(generatedRecoveryHash(target)!==generatedRecoveryHash(original)||
    target.revisions.some(r=>r.familyId!==familyId||r.adapter!=='mock'||r.adultPilotProfileId||r.recoveryProvenance||r.game?.kind!=='generated-module-v1'||
     !state.jobs.some(j=>j.familyId===familyId&&j.revisionId===r.id&&j.status==='ready'&&j.testExecution?.providerMode==='fixture'&&j.adapter==='mock'&&!j.premiumPolicy&&j.usedUnits===0))||
    state.revisions.some(r=>!removed.has(r.id)&&(removed.has(r.parentId??'')||removed.has(r.sourceRevisionId??'')))||
    Object.entries(state.active).some(([project,id])=>project!==projectId&&removed.has(id)))throw Error('TEST_RESET_CONFLICT');
  // Keep the original artifact references, including older encodings. This
  // transaction needs no GCS writes or deletes.
  const encoded:PipelineState=JSON.parse(loaded.originalParts.join(''));
  encoded.revisions=encoded.revisions.filter(r=>!removed.has(r.id));
  delete encoded.active[projectId];
  writeSerializedWorkspace(tx,loaded,JSON.stringify(encoded));
  const receipt={requestId,projectId,removed:ids.length,pointId,checksum};
  tx.create(receiptPath,{fingerprint,receipt});return receipt;
 });
}
