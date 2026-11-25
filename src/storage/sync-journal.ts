import {operationFingerprint,recordKey,scopeKey,type RecordScope,type RecordOperation,type RecordReceipt,type DurableRecord} from './record-contract';
import {requiredStorageDomains,type StorageDomain} from './sync-contract';
import type {SyncStore} from './synchronizer';
interface LocalRecords extends SyncStore {
 get(collection:string,id:string):Promise<DurableRecord|null>;
 hasPending(collection:string,id:string):Promise<boolean>;
 receipt(id:string):Promise<RecordReceipt|null>;
 commit(op:RecordOperation,options?:{enqueue?:boolean}):Promise<RecordReceipt>;
}
interface Base {remoteVersion:number;localVersion:number;fingerprint:string}
interface Plan {localFingerprint:string;remote:RecordOperation}
/** Device versions and server CAS versions are independent. This small durable
 * journal freezes the wire plan before transmission and keeps acknowledgment
 * recovery separate from the authoritative local record/history transaction. */
export class MappedSyncStore implements SyncStore {
 private prefix:string;
 private constructor(private db:IDBDatabase,private local:LocalRecords,readonly localScope:RecordScope,readonly remoteScope:RecordScope,private assertAuthorized:()=>void,private applyGraph?:(rows:DurableRecord[],operation:string)=>Promise<RecordReceipt>){this.prefix=JSON.stringify([scopeKey(localScope),scopeKey(remoteScope),applyGraph?'native':'records']);}
 static async open(local:LocalRecords,localScope:RecordScope,remoteScope:RecordScope,assertAuthorized:()=>void,applyGraph?:(rows:DurableRecord[],operation:string)=>Promise<RecordReceipt>){
  assertAuthorized();const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('jems-sync-journal-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('state');r.onsuccess=()=>{r.result.onversionchange=()=>r.result.close();resolve(r.result);};r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('STORAGE_UPGRADE_BLOCKED'));});
  try{assertAuthorized();return new MappedSyncStore(db,local,localScope,remoteScope,assertAuthorized,applyGraph);}catch(error){db.close();throw error;}
 }
 close(){this.db.close();}
 private key(kind:string,id:string){return this.prefix+':'+kind+':'+id;}
 private get<T>(key:string):Promise<T|undefined>{
  this.assertAuthorized();return new Promise((resolve,reject)=>{const tx=this.db.transaction('state'),r=tx.objectStore('state').get(key);tx.oncomplete=()=>{try{this.assertAuthorized();resolve(r.result);}catch(e){reject(e);}};tx.onabort=()=>reject(tx.error);});
 }
 private put(entries:[string,unknown][]):Promise<void>{
  this.assertAuthorized();return new Promise((resolve,reject)=>{const tx=this.db.transaction('state','readwrite');for(const [k,v] of entries)tx.objectStore('state').put(v,k);tx.oncomplete=()=>{try{this.assertAuthorized();resolve();}catch(error){reject(error);}};tx.onabort=()=>reject(tx.error);});
 }
 pending(limit:number){return this.local.pending(limit);}
 acknowledge(receipt:RecordReceipt){return this.local.acknowledge(receipt);}
 async prepareRemoteOperation(op:RecordOperation):Promise<RecordOperation>{
  this.assertAuthorized();if(scopeKey(op.scope)!==scopeKey(this.localScope))throw Error('STORAGE_SCOPE_DENIED');
  const fingerprint=await operationFingerprint(op),key=this.key('plan',op.id),prior=await this.get<Plan>(key);
  if(prior){if(prior.localFingerprint!==fingerprint)throw Error('STORAGE_OPERATION_REUSED');return prior.remote;}
  const bases=await Promise.all(op.changes.map(c=>this.get<Base>(this.key('base',recordKey(this.localScope,c.collection,c.id)))));
  const remote:RecordOperation={id:'copy-'+crypto.randomUUID(),scope:this.remoteScope,changes:op.changes.map((c,i)=>({...c,expectedVersion:bases[i]?.remoteVersion??0}))};
  await this.put([[key,{localFingerprint:fingerprint,remote} satisfies Plan]]);return remote;
 }
 async acknowledgeRemote(op:RecordOperation,receipt:RecordReceipt){
  const remote=await this.prepareRemoteOperation(op);
  if(receipt.fingerprint!==await operationFingerprint(remote)||receipt.operation!==remote.id||JSON.stringify(receipt.versions)!==JSON.stringify(remote.changes.map(c=>({id:c.id,collection:c.collection,version:c.expectedVersion+1}))))throw Error('STORAGE_ACK_MISMATCH');
  const entries:[string,unknown][]=[];
  for(let i=0;i<remote.changes.length;i++){
   const c=remote.changes[i],row:DurableRecord={id:c.id,collection:c.collection,version:c.expectedVersion+1,value:c.value,deleted:c.deleted??false};
   entries.push([this.key('base',recordKey(this.localScope,c.collection,c.id)),{remoteVersion:row.version,localVersion:op.changes[i].expectedVersion+1,fingerprint:await rowHash(row)} satisfies Base]);
  }
  // Persist server bases first. A crash can repeat this exact receipt before the
  // original local outbox is removed; it never invents another wire operation.
  await this.put(entries);const localReceipt=await this.local.receipt(op.id);if(!localReceipt)throw Error('STORAGE_ACK_MISMATCH');this.assertAuthorized();await this.local.acknowledge(localReceipt);this.assertAuthorized();
 }
 async acceptRemote(rows:DurableRecord[]){
  for(const row of rows){
   this.assertAuthorized();if(this.applyGraph&&!/^native-(?:projects|revisions|configs|plays|history:.*)$/.test(row.collection))continue;const id=recordKey(this.localScope,row.collection,row.id),baseKey=this.key('base',id),base=await this.get<Base>(baseKey),fingerprint=await rowHash(row);
   if(base&&row.version<=base.remoteVersion){if(row.version===base.remoteVersion&&base.fingerprint!==fingerprint)throw Error('STORAGE_VERSION_REUSED');continue;}
   if(await this.local.hasPending(row.collection,row.id))throw Error('STORAGE_CONFLICT');
   if(this.applyGraph){await this.put([[this.key('staged',id),row]]);continue;}
   const incomingKey=this.key('incoming',id+':'+row.version),saved=await this.get<{op:RecordOperation;fingerprint:string}>(incomingKey),current=await this.local.get(row.collection,row.id);
   if(!saved&&current&&(!base||current.version!==base.localVersion))throw Error('STORAGE_CONFLICT');
   if(saved&&saved.fingerprint!==fingerprint)throw Error('STORAGE_VERSION_REUSED');
   const op=saved?.op??{id:'received-'+crypto.randomUUID(),scope:this.localScope,changes:[{id:row.id,collection:row.collection,expectedVersion:current?.version??0,value:row.value,deleted:row.deleted}]};
   if(!saved)await this.put([[incomingKey,{op,fingerprint}]]);
   const receipt=await this.local.commit(op,{enqueue:false});
   await this.put([[baseKey,{remoteVersion:row.version,localVersion:receipt.versions[0].version,fingerprint} satisfies Base]]);
  }
 }
 async finishRemote(domains:readonly StorageDomain[]){
  if(!this.applyGraph)return;
  const batchKey=this.key('batch','active');
  let batch=await this.get<{id:string;rows:DurableRecord[]}>(batchKey);
  if(!batch){
   const prefix=this.key('staged','');this.assertAuthorized();
   const rows=await new Promise<DurableRecord[]>((resolve,reject)=>{const tx=this.db.transaction('state'),request=tx.objectStore('state').openCursor(IDBKeyRange.bound(prefix,prefix+'\uffff',false,true)),rows:DurableRecord[]=[];let failure:unknown;
    request.onsuccess=()=>{try{this.assertAuthorized();if(request.result){if(rows.length>=5000)throw Error('STORAGE_RECOVERY_CAPACITY');rows.push(request.result.value);request.result.continue();}}catch(e){failure=e;tx.abort();}};tx.oncomplete=()=>{try{this.assertAuthorized();resolve(rows);}catch(error){reject(error);}};tx.onabort=()=>reject(failure??tx.error);
   });
   if(!rows.length)return;batch={id:'received-graph-'+crypto.randomUUID(),rows};await this.put([[batchKey,batch]]);
  }
  if(!await this.local.receipt(batch.id)){
   const remaining:DurableRecord[]=[],obsolete:DurableRecord[]=[];
   for(const row of batch.rows){const base=await this.get<Base>(this.key('base',recordKey(this.localScope,row.collection,row.id)));(base&&base.remoteVersion>=row.version?obsolete:remaining).push(row);}
   if(obsolete.length){
    this.assertAuthorized();await new Promise<void>((resolve,reject)=>{const tx=this.db.transaction('state','readwrite'),state=tx.objectStore('state');
     for(const row of obsolete){const key=this.key('staged',recordKey(this.localScope,row.collection,row.id)),r=state.get(key);r.onsuccess=()=>{if(r.result?.version===row.version)state.delete(key);};}
     state.delete(batchKey);tx.oncomplete=()=>{try{this.assertAuthorized();resolve();}catch(error){reject(error);}};tx.onabort=()=>reject(tx.error);
    });
    if(!remaining.length)return;batch={id:'received-graph-'+crypto.randomUUID(),rows:remaining};await this.put([[batchKey,batch]]);
   }
  }
  if(batch.rows.some(row=>requiredStorageDomains(row.collection).some(d=>!domains.includes(d))))throw Error('STORAGE_DOMAIN_DENIED');
  if(!await this.local.receipt(batch.id))for(const row of batch.rows){
   const id=recordKey(this.localScope,row.collection,row.id),base=await this.get<Base>(this.key('base',id)),current=await this.local.get(row.collection,row.id);
   if(current&&(!base||current.version!==base.localVersion))throw Error('STORAGE_LOCAL_CHANGES');
  }
  // A paused/partial download lives only in the staging journal. The native
  // adapter validates all references and publishes its complete graph atomically.
  this.assertAuthorized();const receipt=await this.applyGraph(batch.rows,batch.id),entries:[string,unknown][]=[];
  for(const row of batch.rows){const local=receipt.versions.find(v=>v.collection===row.collection&&v.id===row.id);if(!local)throw Error('STORAGE_ACK_MISMATCH');
   entries.push([this.key('base',recordKey(this.localScope,row.collection,row.id)),{remoteVersion:row.version,localVersion:local.version,fingerprint:await rowHash(row)} satisfies Base]);}
  await this.put(entries);
  this.assertAuthorized();await new Promise<void>((resolve,reject)=>{const tx=this.db.transaction('state','readwrite'),state=tx.objectStore('state');
   for(const row of batch!.rows){const key=this.key('staged',recordKey(this.localScope,row.collection,row.id)),r=state.get(key);r.onsuccess=()=>{if(r.result?.version===row.version)state.delete(key);};}
   state.delete(batchKey);tx.oncomplete=()=>{try{this.assertAuthorized();resolve();}catch(error){reject(error);}};tx.onabort=()=>reject(tx.error);
  });
 }
 async getSyncCursor(){return await this.get<string>(this.key('cursor','current'))??'';}
 async setSyncCursor(expected:string,next:string){
  this.assertAuthorized();return new Promise<void>((resolve,reject)=>{const tx=this.db.transaction('state','readwrite'),store=tx.objectStore('state'),key=this.key('cursor','current'),r=store.get(key);let failure:unknown;
   r.onsuccess=()=>{try{this.assertAuthorized();if((r.result??'')!==expected)throw Error('STORAGE_CONFLICT');store.put(next,key);}catch(e){failure=e;tx.abort();}};tx.oncomplete=()=>{try{this.assertAuthorized();resolve();}catch(error){reject(error);}};tx.onabort=()=>reject(failure??tx.error);
  });
 }
 /** Explicit grown-up resolution only, after showing both records. Keep this
  * device's work as the current version; the server retains its prior history.
  * A newer intervening edit returns another CAS conflict and requires review. */
 async keepLocal(op:RecordOperation,reviewedRemote:(DurableRecord|null)[]){
  if(reviewedRemote.length!==op.changes.length)throw Error('STORAGE_CONFLICT');
  const plan=await this.prepareRemoteOperation(op);
  for(let i=0;i<op.changes.length;i++){const r=reviewedRemote[i],c=op.changes[i];if(r&&(r.id!==c.id||r.collection!==c.collection))throw Error('STORAGE_SCOPE_DENIED');}
  const remote:RecordOperation={...plan,id:'resolved-'+crypto.randomUUID(),changes:plan.changes.map((c,i)=>({...c,expectedVersion:reviewedRemote[i]?.version??0}))};
  await this.put([[this.key('plan',op.id),{localFingerprint:await operationFingerprint(op),remote} satisfies Plan],
   [this.key('resolution',remote.id),{localOperation:op.id,priorPlan:plan,reviewedRemote,at:Date.now()}]]);
 }
}
async function rowHash(row:DurableRecord){return operationFingerprint({id:'row',scope:{family:'hash',profile:'hash'},changes:[{id:row.id,collection:row.collection,expectedVersion:row.version,value:row.value,deleted:row.deleted}]});}
