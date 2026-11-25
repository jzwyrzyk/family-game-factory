import type {IndexedRecords} from './indexed-records';
import type {RecordChange} from './record-contract';
import type {StoragePort} from '../factory/workspace';
import {STUDIO_KEY} from '../studio/notebook';
import {FAMILY_STATE_KEY} from './family-state';
import {projectJournal} from './project-recovery';
import type {Change,JournalStorage} from './local-journal';
import {setRewardSourceMaintenance} from '../rewards/write-guard';

const COLLECTION='studio-local-transactions',CHUNKS='studio-local-transaction-chunks',CHUNK=60000;
interface Image {key:string;before:string[]|null;after:string[];beforeHash:string|null;afterHash:string}
interface Intent {version:1;id:string;owner:string;scope:string;phase:'prepared'|'complete';images:Image[]}
const hash=async(value:string)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');
const namespace=(owner:string)=>owner.startsWith('adult:')?owner:'family';
const fail=()=>Error('A saved copy needs recovery. Your original records and pending copy are preserved. Reopen this player before making another copy.');

/** The native delta and these exact source images are committed in one local
 * IndexedDB transaction. No upload or paid operation is represented here. */
export async function prepareStudioNativeIntent(records:IndexedRecords,owner:string,changes:Change[],id=crypto.randomUUID()):Promise<RecordChange[]>{
 if(!changes.length||changes.length>2||new Set(changes.map(c=>c.key)).size!==changes.length||changes.some(c=>![STUDIO_KEY,FAMILY_STATE_KEY].includes(c.key)||typeof c.after!=='string'||c.after.length>16000000||c.before!==null&&typeof c.before!=='string'||(c.before?.length??0)>16000000))throw fail();
 const prior=await records.get(COLLECTION,'active');if(prior&&!prior.deleted&&(prior.value as Intent)?.phase!=='complete')throw fail();
 const chunks=new Map<string,string>();
 const pack=async(text:string)=>{const ids:string[]=[];for(let offset=0;offset<text.length;offset+=CHUNK){const value=text.slice(offset,offset+CHUNK),id=await hash(value);chunks.set(id,value);ids.push(id);}return ids;};
 const images:Image[]=[];
 for(const change of changes)images.push({key:change.key,before:change.before===null?null:await pack(change.before),after:await pack(change.after),beforeHash:change.before===null?null:await hash(change.before),afterHash:await hash(change.after)});
 const writes:RecordChange[]=[];
 for(const [id,value]of chunks){const existing=await records.get(CHUNKS,id);if(existing){if(existing.deleted||existing.value!==value)throw fail();}else writes.push({collection:CHUNKS,id,value,expectedVersion:0});}
 const intent:Intent={version:1,id,owner,scope:namespace(owner),phase:'prepared',images};
 writes.push({collection:COLLECTION,id:'active',value:intent,expectedVersion:prior?.version??0});return writes;
}

/** Complete only the local half of an already committed native operation.
 * Every source must still equal its exact before/after image. Unknown content
 * blocks recovery; deterministic local replay never resubmits a build. */
const recovering=new Map<string,Promise<boolean>>();
export function recoverStudioNative(records:IndexedRecords,storage:StoragePort,assertAuthorized:()=>void,owner:string,manageMaintenance=false):Promise<boolean>{
 const key=JSON.stringify(records.scopeIdentity()),pending=recovering.get(key);if(pending)return pending;
 const task=recover(records,storage,assertAuthorized,owner,manageMaintenance).finally(()=>recovering.delete(key));recovering.set(key,task);return task;
}
async function recover(records:IndexedRecords,storage:StoragePort,assertAuthorized:()=>void,owner:string,manageMaintenance:boolean):Promise<boolean>{
 assertAuthorized();const row=await records.get(COLLECTION,'active');assertAuthorized();if(!row||row.deleted)return false;
 const intent=row.value as Intent;
 if(!intent||typeof intent.id!=='string'||!/^[-a-zA-Z0-9_:]{1,100}$/.test(intent.id)||intent.version!==1||intent.owner!==owner||intent.scope!==namespace(owner)||!['prepared','complete'].includes(intent.phase)||!Array.isArray(intent.images)||intent.images.length<1||intent.images.length>2||new Set(intent.images.map(v=>v.key)).size!==intent.images.length)throw fail();
 if(intent.phase==='complete')return false;
 if(manageMaintenance)setRewardSourceMaintenance(true);
 try{
 const load=async(ids:string[],digest:string)=>{
  if(!Array.isArray(ids)||ids.length>267||!/^[a-f0-9]{64}$/.test(digest))throw fail();let result='';
  for(const id of ids){if(!/^[a-f0-9]{64}$/.test(id))throw fail();assertAuthorized();const chunk=await records.get(CHUNKS,id);assertAuthorized();if(!chunk||chunk.deleted||typeof chunk.value!=='string'||chunk.value.length>CHUNK||await hash(chunk.value)!==id)throw fail();result+=chunk.value;}
  if(result.length>16000000||await hash(result)!==digest)throw fail();return result;
 };
 const changes:Change[]=[];
 for(const image of intent.images){if(![STUDIO_KEY,FAMILY_STATE_KEY].includes(image.key)||image.before===null&&image.beforeHash!==null)throw fail();changes.push({key:image.key,before:image.before===null?null:await load(image.before,image.beforeHash!),after:await load(image.after,image.afterHash)});}
 const source=storage as JournalStorage;if(typeof source.removeItem!=='function')throw fail();
 const journal=projectJournal(source,intent.scope,assertAuthorized);journal.recover();assertAuthorized();
 if(changes.some(c=>source.getItem(c.key)!==c.before&&source.getItem(c.key)!==c.after))throw fail();
 const pending=changes.filter(c=>source.getItem(c.key)!==c.after),changed=pending.length>0;
 try{if(pending.length)journal.commit(pending);}catch(error){try{journal.recover();}catch{}throw Error('This copy is safely pending. Free browser space or reopen to finish saving it. Your original data is preserved.',{cause:error});}
 assertAuthorized();
 await records.commit({id:intent.id+':local-complete',scope:records.scopeIdentity(),changes:[{collection:COLLECTION,id:'active',value:{...intent,phase:'complete'},expectedVersion:row.version}]},{enqueue:false});
 return changed;
 }finally{if(manageMaintenance)setRewardSourceMaintenance(false);}
}
