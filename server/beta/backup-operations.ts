import {createHash,randomUUID} from 'node:crypto';
import type {FamilyDirectory} from './store';
import type {Documents} from './documents';
import {workspaceOf,uuid} from './model';
export class BackupOperationNotStarted extends Error {constructor(readonly original:unknown){super('BACKUP_OPERATION_NOT_STARTED');}}
export interface GeneratedRestoreCompletion<T> {pointId:string;checksum:string;attemptId:string;result:(receipt:Record<string,unknown>)=>T}
interface CompletionBinding {pointId:string;checksum:string;attemptId?:string}
interface Operation {schema:string;familyId:string;profile:string;purpose:string;attempt?:string;completion?:CompletionBinding}
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
function completionIdentity(completion:CompletionBinding){
 if(!/^scheduled-[a-f0-9]{48}$/.test(completion.pointId)||!/^[a-f0-9]{64}$/.test(completion.checksum)||completion.attemptId!==undefined&&!uuid(completion.attemptId))throw Error('BACKUP_OPERATION_TARGET_INVALID');
 const key=completion.attemptId===undefined?completion.pointId+':'+completion.checksum:JSON.stringify([completion.pointId,completion.checksum,completion.attemptId]);
 return {operation:'restore-'+digest(key),receipt:digest(key)};
}
export const generatedRestoreReceiptId=(completion:GeneratedRestoreCompletion<unknown>)=>completionIdentity(completion).receipt;
async function completedRestore(tx:Pick<Documents,'get'>,familyPath:string,completion:CompletionBinding){
 const receipt=await tx.get<Record<string,unknown>>(familyPath+'/generated-restores/'+completionIdentity(completion).receipt);
 if(!receipt||receipt.pointId!==completion.pointId||receipt.checksum!==completion.checksum||receipt.attemptId!==completion.attemptId)return undefined;
 if(['added','opened','retained'].some(key=>!Number.isSafeInteger(receipt[key])||(receipt[key] as number)<0))return undefined;
 return receipt;
}
function sameCompletion(a:CompletionBinding|undefined,b:CompletionBinding){return a?.pointId===b.pointId&&a.checksum===b.checksum&&a.attemptId===b.attemptId;}
/** Only a receipt committed atomically with the completed restore proves that
 * every artifact write finished. This remains usable by the verified erasure
 * executor after grants are withdrawn; age and object existence prove nothing. */
export async function reconcileGeneratedRestoreOperation(tx:Pick<Documents,'get'|'delete'>,familyPath:string,familyId:string,workspace:string,operationId:string){
 const path=`factoryBackupSchedules/${workspace}/activeOperations/${operationId}`,record=await tx.get<Operation>(path);
 if(!record||record.schema!=='jems.backup-operation.v1'||record.familyId!==familyId||record.purpose!=='generated-restore'||!record.completion)return false;
 let identity;try{identity=completionIdentity(record.completion);}catch{return false;}
 if(identity.operation!==operationId||!await completedRestore(tx,familyPath,record.completion))return false;
 tx.delete(path);return true;
}
/** A remaining record means an admitted external write has no positive terminal
 * result. Erasure must not sweep or claim completion while any record remains.
 * No TTL converts network uncertainty into proof that a write cannot arrive. */
export async function guardedBackupOperation<T>(d:FamilyDirectory,familyId:string,profile:string,purpose:'artifact-write'|'generated-restore',authorize:(tx:Documents)=>Promise<unknown>,work:()=>Promise<T>,artifactSha256?:string,completion?:GeneratedRestoreCompletion<T>):Promise<T>{
 if(completion&&(purpose!=='generated-restore'||!uuid(completion.attemptId)))throw Error('BACKUP_OPERATION_TARGET_INVALID');
 const binding=completion?{pointId:completion.pointId,checksum:completion.checksum,attemptId:completion.attemptId}:undefined,id=binding?completionIdentity(binding).operation:randomUUID(),attempt=randomUUID();let path='';
 const prior=await d.db.run(async tx=>{await authorize(tx);const family=await d.family(tx,familyId);if(family.request?.kind==='deletion')throw Error('DELETION_PENDING');path=`factoryBackupSchedules/${workspaceOf(family)}/activeOperations/${id}`;
  if(binding){const existing=await tx.get<Operation>(path),receipt=await completedRestore(tx,d.path(familyId),binding);
   if(existing&&(existing.schema!=='jems.backup-operation.v1'||existing.familyId!==familyId||existing.purpose!==purpose||!sameCompletion(existing.completion,binding)))throw Error('BACKUP_OPERATION_UNCONFIRMED');
   if(receipt){if(existing)tx.delete(path);return receipt;}
   // A second request cannot finish while an earlier upload is still pending,
   // then clear the only erasure barrier in front of that delayed write.
   if(existing)throw Error('BACKUP_OPERATION_PENDING');
  }
  tx.create(path,{schema:'jems.backup-operation.v1',familyId,profile,purpose,attempt,startedAt:Date.now(),...(artifactSha256?{artifactSha256}:{}),...(binding?{completion:binding}:{})});return undefined;
 });
 if(prior)return completion!.result(prior);
 // An error is deliberately not a finally-cleanup: the cloud result may be unknown.
 let result:T;try{result=await work();}catch(error){if(!(error instanceof BackupOperationNotStarted))throw error;await settle(false);throw error.original;}
 // A positively completed admitted operation may settle after grants are revoked.
 await settle(true);return result;
 async function settle(requireProof:boolean){ await d.db.run(async tx=>{const record=await tx.get<Operation>(path),receipt=binding?await completedRestore(tx,d.path(familyId),binding):undefined;
  if(!record&&receipt)return; // A concurrent receipt-only retry already settled it.
  if(!record||record.schema!=='jems.backup-operation.v1'||record.familyId!==familyId||record.profile!==profile||record.attempt!==attempt||binding&&!sameCompletion(record.completion,binding)||binding&&requireProof&&!receipt)throw Error('BACKUP_OPERATION_UNCONFIRMED');tx.delete(path);
 });}
}
