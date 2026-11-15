import {createHash} from 'node:crypto';
import {Storage} from '@google-cloud/storage';
import type {PipelineState} from '../pipeline/types';
export const MAX_ARTIFACT_BYTES=8*1024*1024;
const digest=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
export interface ArtifactRef {storage:'private-artifact-v1';sha256:string;bytes:number}
export interface PrivateArtifacts {put(bytes:Buffer):Promise<ArtifactRef>;get(ref:ArtifactRef):Promise<Buffer>}
export function validateRef(ref:ArtifactRef){if(!ref||ref.storage!=='private-artifact-v1'||!/^[a-f0-9]{64}$/.test(ref.sha256)||!Number.isInteger(ref.bytes)||ref.bytes<1||ref.bytes>MAX_ARTIFACT_BYTES)throw Error('PRIVATE_ARTIFACT_REFERENCE_REJECTED');}
/** ADC on the gateway/preview identities only; no URLs, ACL changes or signing keys are exposed. */
export class GcsPrivateArtifacts implements PrivateArtifacts {
 private bucket;
 private cache=new Map<string,Buffer>();
 private remember(ref:ArtifactRef,bytes:Buffer){this.cache.delete(ref.sha256);this.cache.set(ref.sha256,Buffer.from(bytes));let total=Array.from(this.cache.values()).reduce((n,b)=>n+b.length,0);while(total>32*1024*1024){const key=this.cache.keys().next().value!;total-=this.cache.get(key)!.length;this.cache.delete(key);}}
 constructor(bucket:string,private workspace:string,client=new Storage()){
  if(!/^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/.test(bucket)||!/^[\w-]{1,100}$/.test(workspace))throw Error('PRIVATE_ARTIFACT_STORAGE_CONFIGURATION_REQUIRED');
  this.bucket=client.bucket(bucket);
 }
 private file(ref:ArtifactRef){validateRef(ref);return this.bucket.file(`factory/${this.workspace}/sha256/${ref.sha256}`)}
 async put(bytes:Buffer){const ref:ArtifactRef={storage:'private-artifact-v1',sha256:digest(bytes),bytes:bytes.length};validateRef(ref);if(this.cache.has(ref.sha256))return ref;
  try{await this.file(ref).save(bytes,{resumable:false,preconditionOpts:{ifGenerationMatch:0},metadata:{contentType:'application/json',cacheControl:'private,no-store'}})}catch(error){if((error as {code?:number}).code!==412)throw Error('PRIVATE_ARTIFACT_WRITE_FAILED');await this.get(ref);}
  this.remember(ref,bytes);return ref;
 }
 async get(ref:ArtifactRef){validateRef(ref);const cached=this.cache.get(ref.sha256);if(cached){if(cached.length!==ref.bytes)throw Error('PRIVATE_ARTIFACT_INTEGRITY_FAILED');this.remember(ref,cached);return Buffer.from(cached)}const [bytes]=await this.file(ref).download({start:0,end:MAX_ARTIFACT_BYTES});if(bytes.length!==ref.bytes||digest(bytes)!==ref.sha256)throw Error('PRIVATE_ARTIFACT_INTEGRITY_FAILED');this.remember(ref,bytes);return bytes;}
}
// Only game payloads are externalized. Jobs, authorization, budgets and revision relationships stay transactional.
function gameSlots(state:any):Array<{get:()=>any;set:(value:any)=>void}>{
 const slots:Array<{get:()=>any;set:(value:any)=>void}>=[];
 for(const r of state.revisions||[])if(r.game)slots.push({get:()=>r.game,set:v=>r.game=v});
 for(const j of state.jobs||[])if(j.execution?.candidate?.game)slots.push({get:()=>j.execution.candidate.game,set:v=>j.execution.candidate.game=v});
 return slots;
}
export async function encodeArtifacts(state:PipelineState,store?:PrivateArtifacts):Promise<string>{
 if(!store)return JSON.stringify(state);const copy=JSON.parse(JSON.stringify(state));let total=0,count=0;
 for(const slot of gameSlots(copy)){const bytes=Buffer.from(JSON.stringify(slot.get()));if(bytes.length<16384)continue;total+=bytes.length;if(total>100*1024*1024||++count>512)throw Error('PRIVATE_ARTIFACT_QUOTA_REACHED');slot.set(await store.put(bytes));}
 return JSON.stringify(copy);
}
export async function decodeArtifacts(serialized:string,store?:PrivateArtifacts):Promise<PipelineState>{
 const state=JSON.parse(serialized);let total=0,count=0;
 for(const slot of gameSlots(state)){const value=slot.get();if(value.storage!=='private-artifact-v1')continue;validateRef(value);if(!store)throw Error('PRIVATE_ARTIFACT_STORE_REQUIRED');total+=value.bytes;if(total>100*1024*1024||++count>512)throw Error('PRIVATE_ARTIFACT_QUOTA_REACHED');const bytes=await store.get(value);if(bytes.length!==value.bytes||digest(bytes)!==value.sha256)throw Error('PRIVATE_ARTIFACT_INTEGRITY_FAILED');slot.set(JSON.parse(bytes.toString('utf8')));}
 return state;
}
