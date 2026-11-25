/** Disabled continuity contract: bounded metadata records, immutable versions,
 * opaque operation identities. Binary originals stay in private artifact stores. */
export interface RecordScope {family:string;profile:string}
export interface DurableRecord {id:string;collection:string;version:number;value:unknown;deleted:boolean}
export interface RecordChange {id:string;collection:string;expectedVersion:number;value:unknown;deleted?:boolean}
export interface RecordOperation {id:string;scope:RecordScope;changes:RecordChange[]}
export interface RecordReceipt {operation:string;fingerprint:string;versions:{id:string;collection:string;version:number}[]}
export const recordId=(s:unknown):s is string=>typeof s==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,159}$/.test(s)&&!['constructor','prototype','__proto__'].includes(s);
export function assertRecordValue(value:unknown):void {
 const seen=new Set<object>();
 const visit=(v:any):void=>{
  if(v===null||typeof v==='string'||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v))return;
  if(!v||typeof v!=='object'||seen.has(v))throw Error('STORAGE_VALUE_NOT_JSON');
  seen.add(v);
  if(Array.isArray(v)){if(Object.keys(v).length!==v.length)throw Error('STORAGE_VALUE_NOT_JSON');for(const item of v)visit(item);}
  else{if(Object.getPrototypeOf(v)!==Object.prototype||Reflect.ownKeys(v).length!==Object.keys(v).length)throw Error('STORAGE_VALUE_NOT_JSON');for(const key of Object.keys(v)){if(!('value' in Object.getOwnPropertyDescriptor(v,key)!))throw Error('STORAGE_VALUE_NOT_JSON');visit(v[key]);}}
  seen.delete(v);
 };
 visit(value);if(new TextEncoder().encode(JSON.stringify(value)).length>256*1024)throw Error('STORAGE_RECORD_CAPACITY');
}
export function validateOperation(op:RecordOperation):void {
 if(!op||!recordId(op.id)||!op.scope||!recordId(op.scope.family)||!recordId(op.scope.profile)||!Array.isArray(op.changes)||!op.changes.length||op.changes.length>50)throw Error('STORAGE_OPERATION_INVALID');
 const seen=new Set<string>();
 for(const c of op.changes){
  if(!c||!recordId(c.id)||!recordId(c.collection)||!Number.isSafeInteger(c.expectedVersion)||c.expectedVersion<0||c.expectedVersion>=Number.MAX_SAFE_INTEGER||c.deleted!==undefined&&typeof c.deleted!=='boolean')throw Error('STORAGE_RECORD_INVALID');
  const key=JSON.stringify([c.collection,c.id]);if(seen.has(key))throw Error('STORAGE_DUPLICATE_RECORD');seen.add(key);
  assertRecordValue(c.value);
 }
}
export const scopeKey=(scope:RecordScope)=>JSON.stringify([scope.family,scope.profile]);
export const recordKey=(scope:RecordScope,collection:string,id:string)=>JSON.stringify([scope.family,scope.profile,collection,id]);
export async function operationFingerprint(op:RecordOperation):Promise<string>{
 validateOperation(op);
 // JSON-compatible values only; canonical key order makes legitimate retries stable.
 function canonical(value:any):string{
  if(value===null)return 'null';
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(typeof value==='object'&&Object.getPrototypeOf(value)===Object.prototype)return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
  if(typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return JSON.stringify(value);
  throw Error('STORAGE_VALUE_NOT_JSON');
 }
 return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(op))))].map(b=>b.toString(16).padStart(2,'0')).join('');
}
