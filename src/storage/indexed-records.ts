import {assertRecordValue,operationFingerprint,recordKey,scopeKey,recordId,type RecordScope,type RecordOperation,type DurableRecord,type RecordReceipt} from './record-contract';
const DB='jems-records-preparation-v1';
/** Atomic domain records. Callers select local-only persistence explicitly; a
 * queued operation is still subject to independent server consent and gates. */
export class IndexedRecords {
 constructor(private db:IDBDatabase,private scope:RecordScope,private assertAuthorized:()=>void){}
 static open(scope:RecordScope,assertAuthorized:()=>void):Promise<IndexedRecords>{
  assertAuthorized();if(!recordId(scope.family)||!recordId(scope.profile))return Promise.reject(Error('STORAGE_SCOPE_INVALID'));
  return new Promise((resolve,reject)=>{const r=indexedDB.open(DB,2);r.onupgradeneeded=()=>{for(const name of ['records','history','receipts','outbox','pending','meta'])if(!r.result.objectStoreNames.contains(name))r.result.createObjectStore(name);const outbox=r.transaction!.objectStore('outbox');if(!outbox.indexNames.contains('scopeSequence'))outbox.createIndex('scopeSequence',['queueScope','queueSequence']);
   const rows:{key:IDBValidKey;operation:RecordOperation}[]=[],cursor=outbox.openCursor();
   cursor.onsuccess=()=>{if(cursor.result){rows.push({key:cursor.result.key,operation:cursor.result.value});cursor.result.continue();return;}
    // The previous preparation format had no queue order. Recover its actual
    // version dependencies once; no operation or receipt is discarded.
    const writes=new Map<string,number>(),depends=rows.map(()=>new Set<number>());
    rows.forEach(({operation},i)=>operation.changes.forEach(c=>writes.set(JSON.stringify([scopeKey(operation.scope),c.collection,c.id,c.expectedVersion+1]),i)));
    rows.forEach(({operation},i)=>operation.changes.forEach(c=>{const prior=writes.get(JSON.stringify([scopeKey(operation.scope),c.collection,c.id,c.expectedVersion]));if(prior!==undefined&&prior!==i)depends[i].add(prior);}));
    const done=new Set<number>();let sequence=0;
    while(done.size<rows.length){let progress=false;for(let i=0;i<rows.length;i++)if(!done.has(i)&&[...depends[i]].every(j=>done.has(j))){const row=rows[i];outbox.put({...row.operation,queueScope:scopeKey(row.operation.scope),queueSequence:++sequence},row.key);done.add(i);progress=true;}if(!progress){r.transaction!.abort();return;}}
    r.transaction!.objectStore('meta').put(sequence,'sequence');
   };
  };r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('STORAGE_UPGRADE_BLOCKED'));r.onsuccess=()=>{try{assertAuthorized();r.result.onversionchange=()=>r.result.close();resolve(new IndexedRecords(r.result,{...scope},assertAuthorized));}catch(e){r.result.close();reject(e);}};});
 }
 close(){this.db.close();}
 async commit(operation:RecordOperation,options:{enqueue?:boolean}={}):Promise<RecordReceipt>{
  const op=structuredClone(operation),fingerprint=await operationFingerprint(op);this.assertAuthorized();
  if(scopeKey(op.scope)!==scopeKey(this.scope))throw Error('STORAGE_SCOPE_DENIED');
  return new Promise((resolve,reject)=>{
   const tx=this.db.transaction(['records','history','receipts','outbox','pending','meta'],'readwrite'),records=tx.objectStore('records'),receipts=tx.objectStore('receipts');
   let result:RecordReceipt,failed:unknown;
   const abort=(error:unknown)=>{failed=error;tx.abort();};
   tx.onabort=()=>reject(failed??tx.error);tx.onerror=()=>{};tx.oncomplete=()=>resolve(result);
   const receiptKey=JSON.stringify([scopeKey(this.scope),op.id]),existing=receipts.get(receiptKey);
   existing.onsuccess=()=>{
    try{this.assertAuthorized();if(existing.result){if(existing.result.fingerprint!==fingerprint)throw Error('STORAGE_OPERATION_REUSED');result=existing.result;return;}
     let remaining=op.changes.length;
     for(const c of op.changes){const key=recordKey(this.scope,c.collection,c.id),r=records.get(key);r.onsuccess=()=>{
      try{this.assertAuthorized();if((r.result?.version??0)!==c.expectedVersion)throw Error('STORAGE_CONFLICT');
       if(--remaining)return;
       result={operation:op.id,fingerprint,versions:[]};
       for(const change of op.changes){const k=recordKey(this.scope,change.collection,change.id),version=change.expectedVersion+1;
        const record:DurableRecord={id:change.id,collection:change.collection,version,value:change.value,deleted:change.deleted??false};
        records.put(record,k);if(options.enqueue!==false)tx.objectStore('pending').put(op.id,k);tx.objectStore('history').add(record,JSON.stringify([k,version]));result.versions.push({id:change.id,collection:change.collection,version});
       }
       receipts.add(result,receiptKey);if(options.enqueue!==false){const sequence=tx.objectStore('meta').get('sequence');sequence.onsuccess=()=>{try{this.assertAuthorized();const next=(sequence.result??0)+1;if(!Number.isSafeInteger(next))throw Error('STORAGE_SEQUENCE_EXHAUSTED');tx.objectStore('meta').put(next,'sequence');tx.objectStore('outbox').add({...op,queueScope:scopeKey(this.scope),queueSequence:next},receiptKey);}catch(e){abort(e);}};}
      }catch(e){abort(e);}
     };}
    }catch(e){abort(e);}
   };
  });
 }
 async page(collection:string,after:string|null=null,limit=100):Promise<DurableRecord[]>{
  this.assertAuthorized();if(!recordId(collection)||after!==null&&!recordId(after)||!Number.isInteger(limit)||limit<1||limit>200)throw Error('STORAGE_PAGE_INVALID');
  const prefix=JSON.stringify([this.scope.family,this.scope.profile,collection]).slice(0,-1)+',';
  return new Promise((resolve,reject)=>{const tx=this.db.transaction('records'),result:DurableRecord[]=[];const r=tx.objectStore('records').openCursor(IDBKeyRange.bound(after===null?prefix:recordKey(this.scope,collection,after),prefix+'\uffff',after!==null,true));
   r.onsuccess=()=>{try{this.assertAuthorized();const cursor=r.result;if(cursor&&result.length<limit){result.push(cursor.value);cursor.continue();}}catch(e){reject(e);tx.abort();}};
   tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(tx.error);tx.onerror=()=>reject(tx.error);
  });
 }
 /** Exact indexed lookup; opening one game never reads the family library. */
 async get(collection:string,id:string):Promise<DurableRecord|null>{
  this.assertAuthorized();if(!recordId(collection)||!recordId(id))throw Error('STORAGE_RECORD_INVALID');
  return this.readValue('records',recordKey(this.scope,collection,id));
 }
 private readValue(store:string,key:IDBValidKey):Promise<any>{
  this.assertAuthorized();return new Promise((resolve,reject)=>{const tx=this.db.transaction(store),request=tx.objectStore(store).get(key);let value:any;
   request.onsuccess=()=>{try{this.assertAuthorized();value=request.result??null;}catch(e){reject(e);tx.abort();}};tx.oncomplete=()=>resolve(value);tx.onabort=()=>reject(tx.error);tx.onerror=()=>{};
  });
 }
 /** Bounded durable queue in commit order, never lexical operation-id order. */
 pending(limit=100):Promise<RecordOperation[]>{
  this.assertAuthorized();if(!Number.isInteger(limit)||limit<1||limit>200)throw Error('STORAGE_PAGE_INVALID');
  return new Promise((resolve,reject)=>{const tx=this.db.transaction('outbox'),values:RecordOperation[]=[];
   const request=tx.objectStore('outbox').index('scopeSequence').openCursor(IDBKeyRange.bound([scopeKey(this.scope),0],[scopeKey(this.scope),Number.MAX_SAFE_INTEGER]));
   request.onsuccess=()=>{try{this.assertAuthorized();if(request.result&&values.length<limit){const {queueScope,queueSequence,...operation}=request.result.value;values.push(operation);request.result.continue();}}catch(e){reject(e);tx.abort();}};
   tx.oncomplete=()=>resolve(values);tx.onabort=()=>reject(tx.error);tx.onerror=()=>{};
  });
 }
 async getSyncCursor():Promise<string>{return await this.readValue('meta','cursor:'+scopeKey(this.scope))??'';}
 setSyncCursor(expected:string,next:string):Promise<void>{
  this.assertAuthorized();if(typeof expected!=='string'||typeof next!=='string'||expected.length>1024||next.length>1024)throw Error('STORAGE_CURSOR_INVALID');
  return new Promise((resolve,reject)=>{const tx=this.db.transaction('meta','readwrite'),key='cursor:'+scopeKey(this.scope),request=tx.objectStore('meta').get(key);let failure:unknown;
   request.onsuccess=()=>{try{this.assertAuthorized();if((request.result??'')!==expected)throw Error('STORAGE_CURSOR_CONFLICT');tx.objectStore('meta').put(next,key);}catch(e){failure=e;tx.abort();}};
   tx.oncomplete=()=>resolve();tx.onabort=()=>reject(failure??tx.error);tx.onerror=()=>{};
  });
 }
 /** Apply an authorized server page atomically. Pending local changes conflict;
  * an older downloaded version can never replace newer local work. */
 acceptRemote(incoming:DurableRecord[]):Promise<void>{
  this.assertAuthorized();const rows=structuredClone(incoming);
  if(!rows.length||rows.length>200||new Set(rows.map(r=>JSON.stringify([r.collection,r.id]))).size!==rows.length)throw Error('STORAGE_PAGE_INVALID');
  for(const r of rows){if(!recordId(r.id)||!recordId(r.collection)||!Number.isSafeInteger(r.version)||r.version<1||typeof r.deleted!=='boolean'||r.value===undefined)throw Error('STORAGE_RECORD_INVALID');assertRecordValue(r.value);}
  return new Promise((resolve,reject)=>{const tx=this.db.transaction(['records','history','pending'],'readwrite');let remaining=rows.length,failure:unknown;const accepted:DurableRecord[]=[];
   const abort=(e:unknown)=>{failure=e;tx.abort();};tx.oncomplete=()=>resolve();tx.onabort=()=>reject(failure??tx.error);tx.onerror=()=>{};
   for(const row of rows){const key=recordKey(this.scope,row.collection,row.id),pending=tx.objectStore('pending').get(key);
    pending.onsuccess=()=>{try{this.assertAuthorized();if(pending.result)throw Error('STORAGE_CONFLICT');const r=tx.objectStore('records').get(key);r.onsuccess=()=>{try{
     this.assertAuthorized();if(r.result?.version===row.version&&JSON.stringify(r.result)!==JSON.stringify(row))throw Error('STORAGE_VERSION_REUSED');
     if(!r.result||r.result.version<row.version)accepted.push(row);
     if(--remaining)return;for(const value of accepted){const k=recordKey(this.scope,value.collection,value.id);tx.objectStore('records').put(value,k);tx.objectStore('history').add(value,JSON.stringify([k,value.version]));}
    }catch(e){abort(e);}};}catch(e){abort(e);}};
   }
  });
 }
 /** Acknowledgment removes only a matching completed metadata operation. */
 acknowledge(receipt:RecordReceipt):Promise<void>{
  this.assertAuthorized();return new Promise((resolve,reject)=>{const tx=this.db.transaction(['receipts','outbox','pending'],'readwrite'),key=JSON.stringify([scopeKey(this.scope),receipt.operation]),r=tx.objectStore('receipts').get(key);let failure:unknown;
   r.onsuccess=()=>{try{this.assertAuthorized();if(!r.result||r.result.fingerprint!==receipt.fingerprint||JSON.stringify(r.result.versions)!==JSON.stringify(receipt.versions))throw Error('STORAGE_ACK_MISMATCH');tx.objectStore('outbox').delete(key);for(const v of receipt.versions){const k=recordKey(this.scope,v.collection,v.id),p=tx.objectStore('pending').get(k);p.onsuccess=()=>{try{this.assertAuthorized();if(p.result===receipt.operation)tx.objectStore('pending').delete(k);}catch(e){failure=e;tx.abort();}};}}catch(e){failure=e;tx.abort();}};
   tx.oncomplete=()=>resolve();tx.onabort=()=>reject(failure??tx.error);tx.onerror=()=>{};
  });
 }
}
