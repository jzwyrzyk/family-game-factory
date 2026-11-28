import type {Documents} from '../beta/documents';
import {encodeArtifacts,decodeArtifacts,type PrivateArtifacts} from '../storage/artifacts';
import type {PipelineState} from './types';

export async function readWorkspace(tx:Documents,workspace:string,artifacts?:PrivateArtifacts){
 if(!/^[\w-]{1,100}$/.test(workspace))throw Error('WORKSPACE_REQUIRED');
 const root=`factoryWorkspaces/${workspace}/state/current`;
 const head=await tx.get<{version:number;chunks:number}>(root);
 const chunks=head?.chunks??0;
 if(head&&(head.version!==1||!Number.isInteger(chunks)||chunks<1||chunks>16))throw Error('PERSISTENCE_SCHEMA_REJECTED');
 const parts=await Promise.all(Array.from({length:chunks},(_,i)=>tx.get<{json:string}>(root+'/chunks/'+i)));
 if(parts.some(v=>typeof v?.json!=='string'))throw Error('PERSISTENCE_CHUNK_MISSING');
 const state:PipelineState=head?await decodeArtifacts(parts.map(v=>v!.json).join(''),artifacts):
  {version:1,jobs:[],revisions:[],active:{},ledgers:{},audit:[]};
 if(state.version!==1)throw Error('PERSISTENCE_SCHEMA_REJECTED');
 return {root,chunks,state,originalParts:parts.map(v=>v!.json)};
}
export async function writeWorkspace(tx:Documents,workspace:Awaited<ReturnType<typeof readWorkspace>>,artifacts?:PrivateArtifacts,encoding:{splitGamePayloads?:boolean}={}){
 return writeSerializedWorkspace(tx,workspace,await encodeArtifacts(workspace.state,artifacts,encoding));
}
export function writeSerializedWorkspace(tx:Documents,workspace:Awaited<ReturnType<typeof readWorkspace>>,serialized:string){
 if(Buffer.byteLength(serialized)>3*1024*1024)throw Error('WORKSPACE_CAPACITY_REACHED');
 const points=Array.from(serialized);
 const chunks=Math.ceil(points.length/250000);
 const parts=Array.from({length:chunks},(_,i)=>points.slice(i*250000,(i+1)*250000).join(''));
 if(chunks===workspace.chunks&&parts.every((json,i)=>json===workspace.originalParts[i]))return;
 tx.set(workspace.root,{version:1,chunks,updatedAt:Date.now()});
 for(let i=0;i<chunks;i++)if(parts[i]!==workspace.originalParts[i])tx.set(workspace.root+'/chunks/'+i,{json:parts[i]});
 for(let i=chunks;i<workspace.chunks;i++)tx.delete(workspace.root+'/chunks/'+i);
}
