import {Firestore} from '@google-cloud/firestore';
import {createHash} from 'node:crypto';
import {operationFingerprint,scopeKey,recordKey,recordId,type RecordScope,type RecordOperation,type RecordReceipt,type DurableRecord} from '../../src/storage/record-contract';
interface Transaction {get(key:string):Promise<any>;put(key:string,value:unknown):void}
export interface ContinuityRepository {transaction<T>(fn:(tx:Transaction)=>Promise<T>):Promise<T>}
/** Construct only after authenticated gateway admission. No browser-supplied
 * family/profile claim is authority. No route or environment flag enables this. */
export interface ContinuityPrincipal {family:string;profile:string}
const hash=(key:string)=>createHash('sha256').update(key).digest('hex');
export class ContinuityService {
 constructor(private repository:ContinuityRepository,private enabled=false){}
 private authorize(actor:ContinuityPrincipal,scope:RecordScope){
  if(!this.enabled)throw Error('CONTINUITY_DISABLED');
  if(!actor||!recordId(actor.family)||!recordId(actor.profile)||actor.family!==scope.family||actor.profile!==scope.profile)throw Error('CONTINUITY_DENIED');
 }
 async commit(actor:ContinuityPrincipal,operation:RecordOperation):Promise<RecordReceipt>{
  const op=structuredClone(operation);this.authorize(actor,op.scope);const fingerprint=await operationFingerprint(op);
  return this.repository.transaction(async tx=>{
   const receiptKey='receipt:'+scopeKey(op.scope)+':'+op.id,prior=await tx.get(receiptKey);
   if(prior){if(prior.fingerprint!==fingerprint)throw Error('STORAGE_OPERATION_REUSED');return prior;}
   // All reads precede writes; Firestore retries only metadata, never paid work.
   const keys=op.changes.map(c=>'record:'+recordKey(op.scope,c.collection,c.id));
   const records=await Promise.all(keys.map(key=>tx.get(key)));
   if(op.changes.some((c,i)=>(records[i]?.version??0)!==c.expectedVersion))throw Error('STORAGE_CONFLICT');
   const result:RecordReceipt={operation:op.id,fingerprint,versions:[]};
   op.changes.forEach((c,i)=>{
    const value:DurableRecord={id:c.id,collection:c.collection,version:c.expectedVersion+1,value:c.value,deleted:c.deleted??false};
    tx.put(keys[i],value);tx.put('history:'+keys[i]+':'+value.version,value);
    result.versions.push({id:c.id,collection:c.collection,version:value.version});
   });tx.put(receiptKey,result);return result;
  });
 }
 async lookup(actor:ContinuityPrincipal,scope:RecordScope,id:string):Promise<RecordReceipt|null>{
  this.authorize(actor,scope);if(!recordId(id))throw Error('STORAGE_OPERATION_INVALID');
  return this.repository.transaction(async tx=>(await tx.get('receipt:'+scopeKey(scope)+':'+id))??null);
 }
 async read(actor:ContinuityPrincipal,scope:RecordScope,collection:string,id:string,version?:number):Promise<DurableRecord|null>{
  this.authorize(actor,scope);if(!recordId(collection)||!recordId(id)||version!==undefined&&(!Number.isSafeInteger(version)||version<1))throw Error('STORAGE_RECORD_INVALID');
  const key='record:'+recordKey(scope,collection,id);
  return this.repository.transaction(async tx=>(await tx.get(version===undefined?key:'history:'+key+':'+version))??null);
 }
}
/** Repository-side adapter only; constructing it neither provisions nor enables it. */
export class FirestoreContinuityRepository implements ContinuityRepository {
 constructor(private db:Firestore,private workspace:string){if(!/^[\w-]{1,100}$/.test(workspace))throw Error('WORKSPACE_REQUIRED');}
 transaction<T>(fn:(tx:Transaction)=>Promise<T>):Promise<T>{
  const doc=(key:string)=>this.db.doc(`factoryContinuity/${this.workspace}/continuityRecordsV1/${hash(key)}`);
  return this.db.runTransaction(tx=>fn({get:async key=>{const record=await tx.get(doc(key));return record.exists?record.data()!.value:undefined;},put:(key,value)=>{tx.set(doc(key),{value});}}));
 }
}
/** Deterministic serial adapter for offline conflicts, disconnects and receipts. */
export class MemoryContinuityRepository implements ContinuityRepository {
 private values=new Map<string,unknown>();private tail:Promise<unknown>=Promise.resolve();
 transaction<T>(fn:(tx:Transaction)=>Promise<T>):Promise<T>{
  const result=this.tail.then(async()=>{const staged=new Map(this.values);const value=await fn({get:async key=>structuredClone(staged.get(key)),put:(key,value)=>{staged.set(key,structuredClone(value));}});this.values=staged;return structuredClone(value);});this.tail=result.catch(()=>{});return result;
 }
}
