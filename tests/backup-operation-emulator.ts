import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {betaFixture} from './beta-fixture';
import type {AtomicStore} from '../server/beta/documents';
import {guardedBackupOperation,reconcileGeneratedRestoreOperation} from '../server/beta/backup-operations';
export async function backupOperationEmulatorAcceptance(store:AtomicStore){
 const {d,enroll,mutate}=await betaFixture(store,'restore-'+randomUUID().slice(0,8)),family=await enroll('restore-proof'),pointId='scheduled-'+createHash('sha256').update(randomUUID()).digest('hex').slice(0,48),checksum='c'.repeat(64),attemptId=randomUUID(),identity=createHash('sha256').update(JSON.stringify([pointId,checksum,attemptId])).digest('hex'),receiptPath=d.path(family.id)+'/generated-restores/'+identity,operations='factoryBackupSchedules/beta-'+family.id+'/activeOperations';
 const receipt={pointId,checksum,attemptId,added:1,opened:1,retained:0},completion={pointId,checksum,attemptId,result:(saved:Record<string,unknown>)=>saved};let begin!:()=>void,release!:()=>void,writes=0;
 const started=new Promise<void>(done=>begin=done),pending=new Promise<void>(done=>release=done);
 const first=guardedBackupOperation(d,family.id,'profile-one','generated-restore',async()=>{},async()=>{begin();await pending;await store.run(async tx=>{tx.create(receiptPath,receipt);});writes++;throw Error('SYNTHETIC_LOST_ACK');},undefined,completion);
 const failed=assert.rejects(first,/SYNTHETIC_LOST_ACK/);await started;
 await assert.rejects(guardedBackupOperation(d,family.id,'profile-two','generated-restore',async()=>{},async()=>{writes++;return receipt;},undefined,completion),/BACKUP_OPERATION_PENDING/);
 assert.equal((await store.run(tx=>tx.page(operations,'',10),true)).length,1);release();await failed;assert.equal(writes,1);
 // Positive receipt settlement is independent of revoked user access. The
 // erasure executor uses this same transaction before its first deletion.
 await mutate('request-deletion',family.id);const requestId=(await d.withFamily(family.id,async(_tx,f)=>f)).request!.id;await mutate('confirm-deletion',family.id,{requestId,receipt:'synthetic-native-restore-proof'});
 assert.equal(await store.run(tx=>reconcileGeneratedRestoreOperation(tx,d.path(family.id),family.id,'beta-'+family.id,'restore-'+identity)),true);
 assert.equal((await store.run(tx=>tx.page(operations,'',10),true)).length,0);
 console.log('Firestore restore barriers: concurrent retries denied, committed lost reply reconciled by exact receipt after revocation.');
}
