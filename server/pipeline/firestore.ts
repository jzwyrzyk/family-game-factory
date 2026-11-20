import {encodeArtifacts,decodeArtifacts,type PrivateArtifacts} from '../storage/artifacts';
import {Firestore} from '@google-cloud/firestore';
import type {PipelineState,Repository} from './types';
const fresh=():PipelineState=>({version:1,jobs:[],revisions:[],active:{},ledgers:{},audit:[]});
const MAX_WORKSPACE_BYTES=3*1024*1024;
/** Bounded family-workspace POC, not an unbounded multi-tenant database. All chunks are private IAM-only documents. */
export class FirestoreRepository implements Repository {
 private root;
 constructor(private db:Firestore,workspace:string,private artifacts?:PrivateArtifacts){if(!/^[\w-]{1,100}$/.test(workspace))throw Error('WORKSPACE_REQUIRED');this.root=db.doc(`factoryWorkspaces/${workspace}/state/current`);}
 async transaction<T>(update:(state:PipelineState)=>T):Promise<T>{return this.db.runTransaction(async tx=>{
  const meta=await tx.get(this.root),old=meta.exists?meta.data()!:{chunks:0,version:1};if(old.version!==1||!Number.isInteger(old.chunks)||old.chunks<0||old.chunks>16)throw Error('PERSISTENCE_SCHEMA_REJECTED');
  let state=fresh();if(old.chunks){const refs=Array.from({length:old.chunks},(_,i)=>this.root.collection('chunks').doc(String(i))),docs=await tx.getAll(...refs);if(docs.some(x=>!x.exists))throw Error('PERSISTENCE_CHUNK_MISSING');state=await decodeArtifacts(docs.map(x=>x.data()!.json).join(''),this.artifacts);}
  if(state.version!==1)throw Error('PERSISTENCE_SCHEMA_REJECTED');const result=update(state);let serialized=await encodeArtifacts(state,this.artifacts);
  if(Buffer.byteLength(serialized)>MAX_WORKSPACE_BYTES&&state.analytics){
   // Optional delivery state yields storage to core data. Preserve every
   // permission choice and reuse encoded artifact references. Neither the core
   // update nor private artifact uploads run again for this fallback.
   const retained=JSON.parse(serialized) as PipelineState;
   retained.analytics!.pending=[];retained.analytics!.bindings=[];retained.analytics!.receipts=[];
   serialized=JSON.stringify(retained);
  }
  if(Buffer.byteLength(serialized)>MAX_WORKSPACE_BYTES)throw Error('WORKSPACE_CAPACITY_REACHED');
  const points=Array.from(serialized),chunks:string[]=[];for(let i=0;i<points.length;i+=250000)chunks.push(points.slice(i,i+250000).join(''));tx.set(this.root,{version:1,chunks:chunks.length,updatedAt:Date.now()});chunks.forEach((json,i)=>tx.set(this.root.collection('chunks').doc(String(i)),{json}));for(let i=chunks.length;i<old.chunks;i++)tx.delete(this.root.collection('chunks').doc(String(i)));return JSON.parse(JSON.stringify(result));
 });}
 async snapshot(){return this.db.runTransaction(async tx=>{const doc=await tx.get(this.root);if(!doc.exists)return fresh();const meta=doc.data()!;if(meta.version!==1||!Number.isInteger(meta.chunks)||meta.chunks<1||meta.chunks>16)throw Error('PERSISTENCE_SCHEMA_REJECTED');const docs=await tx.getAll(...Array.from({length:meta.chunks},(_,i)=>this.root.collection('chunks').doc(String(i))));if(docs.some(d=>!d.exists))throw Error('PERSISTENCE_CHUNK_MISSING');return decodeArtifacts(docs.map(d=>d.data()!.json).join(''),this.artifacts);},{readOnly:true});}
}
