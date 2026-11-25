import {Firestore} from '@google-cloud/firestore';
import {createHash} from 'node:crypto';
import {operationFingerprint,scopeKey,recordKey,recordId,type RecordScope,type RecordOperation,type RecordReceipt,type DurableRecord} from '../../src/storage/record-contract';
import {sequence,type ChangePage} from '../../src/storage/sync-contract';
import {firestoreStore,type AtomicStore,type Documents} from '../beta/documents';
interface Transaction {get(key:string):Promise<any>;put(key:string,value:unknown):void;page(prefix:string,after:string,limit:number):Promise<{id:string;value:DurableRecord}[]>}
export interface ContinuityRepository {transaction<T>(fn:(tx:Transaction)=>Promise<T>):Promise<T>}
/** Only authenticated route adapters construct principals. Domain grants and
 * current revocation are rechecked by their repository in the write transaction. */
export interface ContinuityPrincipal {family:string;profile:string}
const hash=(key:string)=>createHash('sha256').update(key).digest('hex');
const sequenceKey=(n:number)=>String(n).padStart(16,'0');
export class ContinuityService {
 constructor(private repository:ContinuityRepository,private enabled=false){}
 private authorize(actor:ContinuityPrincipal,scope:RecordScope){
  if(!this.enabled)throw Error('CONTINUITY_DISABLED');
  if(!actor||!recordId(actor.family)||!recordId(actor.profile)||actor.family!==scope.family||actor.profile!==scope.profile)throw Error('CONTINUITY_DENIED');
 }
 async commit(actor:ContinuityPrincipal,operation:RecordOperation):Promise<RecordReceipt>{
  const op=structuredClone(operation);this.authorize(actor,op.scope);const fingerprint=await operationFingerprint(op);
  if(Buffer.byteLength(JSON.stringify(op))>1024*1024)throw Error('STORAGE_OPERATION_CAPACITY');
  return this.repository.transaction(async tx=>{
   const receiptKey='receipt:'+scopeKey(op.scope)+':'+op.id,prior=await tx.get(receiptKey);
   if(prior){if(prior.fingerprint!==fingerprint)throw Error('STORAGE_OPERATION_REUSED');return prior;}
   // All reads precede writes; Firestore retries only metadata, never paid work.
   const keys=op.changes.map(c=>'record:'+recordKey(op.scope,c.collection,c.id));
   const records=await Promise.all(keys.map(key=>tx.get(key))),headKey='head:'+scopeKey(op.scope),head=(await tx.get(headKey))??0;
   if(!Number.isSafeInteger(head)||head<0||!Number.isSafeInteger(head+op.changes.length))throw Error('STORAGE_CURSOR_INVALID');
   if(op.changes.some((c,i)=>(records[i]?.version??0)!==c.expectedVersion))throw Error('STORAGE_CONFLICT');
   const result:RecordReceipt={operation:op.id,fingerprint,versions:[]};
   op.changes.forEach((c,i)=>{
    const value:DurableRecord={id:c.id,collection:c.collection,version:c.expectedVersion+1,value:c.value,deleted:c.deleted??false};
    const history='history:'+keys[i]+':'+value.version;tx.put(keys[i],value);tx.put(history,value);
    tx.put('feed:'+scopeKey(op.scope)+':'+sequenceKey(head+i+1),{reference:history});
    tx.put('index:'+JSON.stringify([op.scope.family,op.scope.profile,c.collection])+':'+c.id,{reference:keys[i]});
    result.versions.push({id:c.id,collection:c.collection,version:value.version});
   });tx.put(headKey,head+op.changes.length);tx.put(receiptKey,result);return result;
  });
 }
 async changes(actor:ContinuityPrincipal,scope:RecordScope,after='0',limit=100):Promise<ChangePage>{
  this.authorize(actor,scope);const start=sequence(after);
  if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('STORAGE_PAGE_INVALID');
  return this.repository.transaction(async tx=>{
   const head=(await tx.get('head:'+scopeKey(scope)))??0;
   if(!Number.isSafeInteger(head)||head<start)throw Error('STORAGE_CURSOR_INVALID');
   const rows=await tx.page('feed:'+scopeKey(scope)+':',sequenceKey(start),Math.min(limit,4));
   let through=start,bytes=0;const records:DurableRecord[]=[];
   for(const row of rows){
    if(Number(row.id)!==through+1)throw Error('STORAGE_FEED_INCOMPLETE');
    const size=Buffer.byteLength(JSON.stringify(row.value));if(records.length&&bytes+size>1024*1024)break;
    records.push(row.value);bytes+=size;through++;
   }
   if(!records.length&&head>start)throw Error('STORAGE_FEED_INCOMPLETE');
   return {version:1,after,through:String(through),records,hasMore:through<head};
  });
 }
 async page(actor:ContinuityPrincipal,scope:RecordScope,collection:string,after='',limit=20){
  this.authorize(actor,scope);if(!recordId(collection)||after!==''&&!recordId(after)||!Number.isInteger(limit)||limit<1||limit>100)throw Error('STORAGE_PAGE_INVALID');
  return this.repository.transaction(async tx=>{const size=Math.min(limit,4),rows=await tx.page('index:'+JSON.stringify([scope.family,scope.profile,collection])+':',after,size);return {records:rows.map(r=>r.value),next:rows.length===size?rows.at(-1)!.id:null};});
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
/** Shared native transaction ensures grant withdrawal/revocation races cannot
 * commit after a stale admission. No privileged callback runs outside it. */
export class DocumentContinuityRepository implements ContinuityRepository {
 constructor(private store:AtomicStore,private workspace:string,private authorize:(tx:Documents)=>Promise<void>=async()=>{}){if(!/^[\w-]{1,100}$/.test(workspace))throw Error('WORKSPACE_REQUIRED');}
 transaction<T>(fn:(tx:Transaction)=>Promise<T>):Promise<T>{
  const base=`factoryContinuity/${this.workspace}`;
  const path=(key:string)=>{const indexed=key.match(/^(feed:.*:)(\d{16})$/)??key.match(/^(index:\[.*\]:)([a-zA-Z0-9][a-zA-Z0-9:_-]*)$/);return indexed?`${base}/feeds/${hash(indexed[1])}/changes/${indexed[2]}`:`${base}/continuityRecordsV1/${hash(key)}`;};
  return this.store.run(async tx=>{
   await this.authorize(tx);
   return fn({get:async key=>(await tx.get<{value:unknown}>(path(key)))?.value,put:(key,value)=>tx.set(path(key),{key,value}),
    page:async(prefix,after,limit)=>Promise.all((await tx.page<{value:DurableRecord|{reference:string}}>(`${base}/feeds/${hash(prefix)}/changes`,after,limit)).map(async row=>{const raw=row.value.value,value='reference' in raw?(await tx.get<{value:DurableRecord}>(path(raw.reference)))?.value:raw;if(!value)throw Error('STORAGE_FEED_INCOMPLETE');return {id:row.id,value};}))});
  });
 }
}
export class FirestoreContinuityRepository extends DocumentContinuityRepository {
 constructor(db:Firestore,workspace:string){super(firestoreStore(db),workspace);}
}
/** Deterministic serial adapter for offline conflicts, disconnects and receipts. */
export class MemoryContinuityRepository implements ContinuityRepository {
 private values=new Map<string,unknown>();private tail:Promise<unknown>=Promise.resolve();
 transaction<T>(fn:(tx:Transaction)=>Promise<T>):Promise<T>{
  const result=this.tail.then(async()=>{const staged=new Map(this.values);const value=await fn({get:async key=>structuredClone(staged.get(key)),put:(key,value)=>{staged.set(key,structuredClone(value));},
   page:async(prefix,after,limit)=>[...staged.keys()].filter(k=>k.startsWith(prefix)&&k.slice(prefix.length)>after).sort().slice(0,limit).map(k=>({id:k.slice(prefix.length),value:structuredClone((staged.get(k) as any)?.reference?staged.get((staged.get(k) as any).reference):staged.get(k)) as DurableRecord}))});this.values=staged;return structuredClone(value);});this.tail=result.catch(()=>{});return result;
 }
}
