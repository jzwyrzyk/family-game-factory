import {randomUUID} from 'node:crypto';
import type {FamilyDirectory} from './store';
import type {Documents} from './documents';
import {workspaceOf} from './model';
export class BackupOperationNotStarted extends Error {constructor(readonly original:unknown){super('BACKUP_OPERATION_NOT_STARTED');}}
/** A remaining record means an admitted external write has no positive terminal
 * result. Erasure must not sweep or claim completion while any record remains.
 * No TTL converts network uncertainty into proof that a write cannot arrive. */
export async function guardedBackupOperation<T>(d:FamilyDirectory,familyId:string,profile:string,purpose:'artifact-write'|'generated-restore',authorize:(tx:Documents)=>Promise<unknown>,work:()=>Promise<T>,artifactSha256?:string):Promise<T>{
 const id=randomUUID();let path='';await d.db.run(async tx=>{await authorize(tx);const family=await d.family(tx,familyId);if(family.request?.kind==='deletion')throw Error('DELETION_PENDING');path=`factoryBackupSchedules/${workspaceOf(family)}/activeOperations/${id}`;tx.create(path,{schema:'jems.backup-operation.v1',familyId,profile,purpose,startedAt:Date.now(),...(artifactSha256?{artifactSha256}:{})});});
 // An error is deliberately not a finally-cleanup: the cloud result may be unknown.
 let result:T;try{result=await work();}catch(error){if(!(error instanceof BackupOperationNotStarted))throw error;await settle();throw error.original;}
 // A positively completed admitted operation may settle after grants are revoked.
 await settle();return result;
 async function settle(){ await d.db.run(async tx=>{const record=await tx.get<{schema:string;familyId:string;profile:string}>(path);if(!record||record.schema!=='jems.backup-operation.v1'||record.familyId!==familyId||record.profile!==profile)throw Error('BACKUP_OPERATION_UNCONFIRMED');tx.delete(path);});}
}
