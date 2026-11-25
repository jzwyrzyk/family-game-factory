import {assertRecordValue,recordId,type DurableRecord} from './record-contract';
import type {SyncTransport} from './synchronizer';
/** Capture only the reviewed heads and their immutable ancestry. Reads are
 * independently authorized and bounded; no partial graph is published. */
export async function capturePrivateBranches(remote:SyncTransport,roots:DurableRecord[],assertAuthorized:()=>void):Promise<DurableRecord[]>{
 const rows=new Map<string,DurableRecord>(),projects=new Set<string>(),revisions=new Set<string>();
 const add=(row:DurableRecord)=>{if(!row||row.deleted||!recordId(row.id)||!recordId(row.collection)||!Number.isSafeInteger(row.version)||row.version<1)throw Error('STORAGE_RESPONSE_INVALID');assertRecordValue(row.value);rows.set(row.collection+':'+row.id,structuredClone(row));if(rows.size>2000)throw Error('STORAGE_RECOVERY_CAPACITY');return row;};
 const read=async(collection:string,id:string)=>{assertAuthorized();if(!recordId(id))throw Error('STORAGE_RESPONSE_INVALID');const prior=rows.get(collection+':'+id);if(prior)return prior;const row=await remote.read(collection,id);assertAuthorized();if(!row||row.id!==id||row.collection!==collection)throw Error('STORAGE_RESPONSE_INVALID');return add(row);};
 for(const root of roots){if(root.collection!=='native-projects')throw Error('STORAGE_RESPONSE_INVALID');add(root);}
 const revision=async(id:string):Promise<void>=>{
  if(revisions.has(id))return;revisions.add(id);if(revisions.size>500)throw Error('STORAGE_RECOVERY_CAPACITY');const row=await read('native-revisions',id),value=row.value as {projectId:string;configHash:string;createdAt:string;parentId:string|null;sourceRevisionId?:string;drawingRigId?:string};
  if(!value||value.drawingRigId||!Number.isFinite(Date.parse(value.createdAt)))throw Error('STORAGE_RESPONSE_INVALID');
  await read('native-configs',value.configHash);await read('native-history:'+value.projectId,String(Date.parse(value.createdAt)).padStart(16,'0')+':'+id);
  if(value.parentId!==null)await revision(value.parentId);if(value.sourceRevisionId)await revision(value.sourceRevisionId);await project(value.projectId);
 };
 const project=async(id:string):Promise<void>=>{
  if(projects.has(id))return;projects.add(id);if(projects.size>50)throw Error('STORAGE_RECOVERY_CAPACITY');const row=await read('native-projects',id),value=row.value as {headId:string;keptId?:string};if(!value)throw Error('STORAGE_RESPONSE_INVALID');await revision(value.headId);if(value.keptId)await revision(value.keptId);
 };
 for(const root of roots)await project(root.id);assertAuthorized();return [...rows.values()];
}
