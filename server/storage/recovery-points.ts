import {createHash} from 'node:crypto';
import {ContinuityService,type ContinuityPrincipal} from './continuity';
import {recordId,type RecordScope} from '../../src/storage/record-contract';
interface SourceRef {key:string;chunks:number;sha256:string;isNull:boolean}
interface RecoveryManifest {schema:'jems.recovery-point.v1';sources:SourceRef[]}
const digest=(text:string)=>createHash('sha256').update(text).digest('hex');
/** Preparation only. Caller captures a consistent authorized source snapshot under
 * maintenance. No scheduler, application migration or live restore is installed. */
export class RecoveryPoints {
 constructor(private service:ContinuityService){}
 async prepare(actor:ContinuityPrincipal,scope:RecordScope,id:string,sources:Record<string,string|null>):Promise<void>{
  if(!recordId(id)||id.length>80||Object.keys(sources).length<1||Object.keys(sources).length>32)throw Error('RECOVERY_PLAN_INVALID');
  const manifest:RecoveryManifest={schema:'jems.recovery-point.v1',sources:[]};
  const entries=Object.entries(sources).sort(([a],[b])=>a.localeCompare(b));
  // Validate the complete supplied plan before any repository write.
  for(const [key,value] of entries)if(!recordId(key)||value!==null&&typeof value!=='string'||(value?.length??0)>16_000_000)throw Error('RECOVERY_PLAN_INVALID');
  for(const [index,[key,value]] of entries.entries()){
   const text=value??'',chunks=Math.ceil(text.length/32000);manifest.sources.push({key,chunks,sha256:digest(JSON.stringify(value)),isNull:value===null});
   for(let n=0;n<chunks;n++)await this.service.commit(actor,{id:`${id}-chunk-${index}-${n}`,scope,changes:[{collection:'recovery-chunks',id:`${id}-${index}-${n}`,expectedVersion:0,value:{text:text.slice(n*32000,(n+1)*32000)}}]});
  }
  // A point is discoverable only after every uploaded chunk reconstructs exactly.
  await this.reconstruct(actor,scope,id,manifest);
  await this.service.commit(actor,{id:`${id}-complete`,scope,changes:[{collection:'recovery-points',id,expectedVersion:0,value:manifest}]});
 }
 async read(actor:ContinuityPrincipal,scope:RecordScope,id:string):Promise<Record<string,string|null>>{
  if(!recordId(id)||id.length>80)throw Error('RECOVERY_PLAN_INVALID');
  const saved=await this.service.read(actor,scope,'recovery-points',id);if(!saved||saved.deleted)throw Error('RECOVERY_POINT_UNAVAILABLE');
  return this.reconstruct(actor,scope,id,saved.value as RecoveryManifest);
 }
 private async reconstruct(actor:ContinuityPrincipal,scope:RecordScope,id:string,manifest:RecoveryManifest):Promise<Record<string,string|null>>{
  if(!manifest||manifest.schema!=='jems.recovery-point.v1'||!Array.isArray(manifest.sources)||!manifest.sources.length||manifest.sources.length>32||new Set(manifest.sources.map(s=>s.key)).size!==manifest.sources.length)throw Error('RECOVERY_MANIFEST_INVALID');
  const result:Record<string,string|null>={};
  for(const [index,source] of manifest.sources.entries()){
   if(!recordId(source.key)||!Number.isInteger(source.chunks)||source.chunks<0||source.chunks>500||typeof source.isNull!=='boolean'||source.isNull&&source.chunks!==0||!/^[a-f0-9]{64}$/.test(source.sha256))throw Error('RECOVERY_MANIFEST_INVALID');
   let text='';for(let n=0;n<source.chunks;n++){const record=await this.service.read(actor,scope,'recovery-chunks',`${id}-${index}-${n}`);const chunk=(record?.value as {text?:unknown})?.text;
    if(!record||record.deleted||typeof chunk!=='string'||chunk.length>32000)throw Error('RECOVERY_CHUNK_UNAVAILABLE');text+=chunk;
   }
   const value=source.isNull?null:text;if(digest(JSON.stringify(value))!==source.sha256)throw Error('RECOVERY_INTEGRITY_FAILED');result[source.key]=value;
  }return result;
 }
}
