import {assertRecordValue,operationFingerprint,recordId,scopeKey,type RecordScope,type RecordOperation,type RecordReceipt,type DurableRecord} from './record-contract';
import {requiredStorageDomains,sequence,storageDomains,type StorageDomain,type ChangePage} from './sync-contract';
export interface SyncStore {
 finishRemote?(domains:readonly StorageDomain[]):Promise<void>;
 prepareRemoteOperation?(op:RecordOperation):Promise<RecordOperation>;
 acknowledgeRemote?(op:RecordOperation,receipt:RecordReceipt):Promise<void>;
 pending(limit:number):Promise<RecordOperation[]>;
 acknowledge(receipt:RecordReceipt):Promise<void>;
 acceptRemote(records:DurableRecord[]):Promise<void>;
 getSyncCursor():Promise<string>;
 setSyncCursor(expected:string,next:string):Promise<void>;
}
export interface SyncTransport {
 status():Promise<{version:1;epoch:string;domains:StorageDomain[];family?:string;profile?:string;profiles?:string[];guardian?:boolean;guardianUntil?:number}>;
 lookup(id:string):Promise<RecordReceipt|null>;
 commit(operation:RecordOperation):Promise<RecordReceipt>;
 read(collection:string,id:string,version?:number):Promise<DurableRecord|null>;
 page?(collection:string,after?:string,limit?:number):Promise<{records:DurableRecord[];next:string|null}>;
 changes(after:string,limit:number,epoch:string):Promise<ChangePage>;
}
export type SyncResult={state:'current'|'pending'|'busy'|'offline'|'blocked'|'review'|'removal';sent:number;received:number}|{state:'conflict';sent:number;received:number;operation:RecordOperation;remote:(DurableRecord|null)[]};
const errorCode=(error:unknown)=>error instanceof Error?error.message:'STORAGE_CONNECTION_INTERRUPTED';
const lockName=(s:RecordScope)=>'jems-sync:'+scopeKey(s);
/** One bounded pass, started by authorized application activity or an explicit
 * grown-up check. It never transports a build/coach request or retries a provider.
 * Durable operations stay queued on every unknown response or conflict. */
export class ContinuityPump {
 private running=false;
 constructor(private store:SyncStore,private remote:SyncTransport,private scope:RecordScope,private assertAuthorized:()=>void,
  private lock:<T>(name:string,action:()=>Promise<T>)=>Promise<T|undefined>=async(name,action)=>{
   if(!globalThis.navigator?.locks)throw Error('STORAGE_LOCK_UNAVAILABLE');
   return navigator.locks.request(name,{ifAvailable:true},lock=>lock?action():undefined);
  }){}
 async runOnce(maxOperations=32,maxPages=8):Promise<SyncResult>{
  if(this.running)return {state:'busy',sent:0,received:0};
  if(!Number.isInteger(maxOperations)||maxOperations<1||maxOperations>100||!Number.isInteger(maxPages)||maxPages<1||maxPages>20)throw Error('STORAGE_PAGE_INVALID');
  this.running=true;try{return await this.lock(lockName(this.scope),()=>this.pass(maxOperations,maxPages))??{state:'busy',sent:0,received:0};}
  finally{this.running=false;}
 }
 private async pass(maxOperations:number,maxPages:number):Promise<SyncResult>{
  let sent=0,received=0;
  try{
   this.assertAuthorized();const status=await this.remote.status();this.assertAuthorized();
   if(status.version!==1||!recordId(status.epoch)||!Array.isArray(status.domains)||status.domains.some(d=>!storageDomains.includes(d)))throw Error('STORAGE_RESPONSE_INVALID');
   const pending=await this.store.pending(maxOperations);
   for(const op of pending){
    this.assertAuthorized();if(scopeKey(op.scope)!==scopeKey(this.scope))throw Error('CONTINUITY_DENIED');
    if(op.changes.some(c=>requiredStorageDomains(c.collection).some(d=>!status.domains.includes(d))))throw Error('STORAGE_DOMAIN_DENIED');
    try{
     const wire=await this.store.prepareRemoteOperation?.(op)??op;
     this.assertAuthorized();const known=await this.remote.lookup(wire.id);this.assertAuthorized();
     const receipt=known??await this.remote.commit(wire);this.assertAuthorized();
     if(receipt.operation!==wire.id||receipt.fingerprint!==await operationFingerprint(wire)||JSON.stringify(receipt.versions)!==JSON.stringify(wire.changes.map(c=>({id:c.id,collection:c.collection,version:c.expectedVersion+1}))))throw Error('STORAGE_ACK_MISMATCH');
     if(this.store.acknowledgeRemote)await this.store.acknowledgeRemote(op,receipt);else await this.store.acknowledge(receipt);sent++;
    }catch(error){
     if(errorCode(error)!=='STORAGE_CONFLICT')throw error;
     this.assertAuthorized();const remote=await Promise.all(op.changes.map(c=>this.remote.read(c.collection,c.id)));this.assertAuthorized();
     return {state:'conflict',sent,received,operation:structuredClone(op),remote};
    }
   }
   // Never download over an unsent local branch. A later pass drains the next
   // bounded queue page; commit order is the store's durable sequence order.
   if((await this.store.pending(1)).length)return {state:'pending',sent,received};
   let stored=await this.store.getSyncCursor(),cursor:{epoch:string;after:string};
   try{cursor=JSON.parse(stored);}catch{cursor={epoch:status.epoch,after:'0'};}
   if(cursor?.epoch!==status.epoch)cursor={epoch:status.epoch,after:'0'};
   sequence(cursor.after);
   for(let i=0;i<maxPages;i++){
    this.assertAuthorized();const page=await this.remote.changes(cursor.after,100,status.epoch);this.assertAuthorized();
    if(page.version!==1||page.after!==cursor.after||sequence(page.through)<sequence(page.after)||!Array.isArray(page.records)||page.records.length>100||typeof page.hasMore!=='boolean'||page.hasMore&&page.through===page.after)throw Error('STORAGE_RESPONSE_INVALID');
    // A feed may contain multiple retained versions of a record. Apply each in
    // order so immutable local history is retained, including tombstones.
    for(const row of page.records){
     if(!row||!recordId(row.id)||!recordId(row.collection)||!Number.isSafeInteger(row.version)||row.version<1||typeof row.deleted!=='boolean'||requiredStorageDomains(row.collection).some(d=>!status.domains.includes(d)))throw Error('STORAGE_RESPONSE_INVALID');
     assertRecordValue(row.value);this.assertAuthorized();await this.store.acceptRemote([row]);received++;
    }
    const next=JSON.stringify({epoch:status.epoch,after:page.through});await this.store.setSyncCursor(stored,next);stored=next;cursor.after=page.through;
    if(!page.hasMore){await this.store.finishRemote?.(status.domains);return {state:'current',sent,received};}
   }
   return {state:'pending',sent,received};
  }catch(error){
   const code=errorCode(error);
   if(code==='STORAGE_LOCAL_CHANGES')return {state:'review',sent,received};
   if(code==='STORAGE_REMOVAL_REVIEW')return {state:'removal',sent,received};
   if(/(?:DENIED|REQUIRED|DISABLED|UNAUTHENTICATED|PAUSED|INVALID|MISMATCH|REUSED|REVOKED|CONSENT_CHANGED|LOCK_UNAVAILABLE)/.test(code))return {state:'blocked',sent,received};
   if(code==='STORAGE_CONFLICT')return {state:'pending',sent,received};
   return {state:'offline',sent,received};
  }
 }
}
/** Same-origin only. The family origin and Secure/HttpOnly session establish
 * authority; the requested profile is checked against server-owned enrollment. */
export function continuityTransport(profile:string,fetcher:typeof fetch=fetch):SyncTransport {
 if(!recordId(profile))throw Error('STORAGE_SCOPE_INVALID');
 const request=async(path:string,data:object)=>{
  const response=await fetcher('/v1/storage/'+path,{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{'Content-Type':'application/json','X-Factory-Request':'1'},body:JSON.stringify({profile,...data})});
  const body=await response.json();if(!response.ok)throw Error(typeof body.errorCode==='string'?body.errorCode:'STORAGE_CONNECTION_INTERRUPTED');return body;
 };
 return {status:()=>request('status',{}),lookup:operation=>request('lookup',{operation}),commit:operation=>request('commit',{operation}),read:(collection,id,version)=>request('read',{collection,id,version:version??null}),page:(collection,after='',limit=20)=>request('page',{collection,after,limit}),changes:(after,limit,epoch)=>request('changes',{after,limit,epoch})};
}
