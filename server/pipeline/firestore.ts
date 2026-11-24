import type {Firestore} from '@google-cloud/firestore';
import {firestoreStore,type AtomicStore} from '../beta/documents';
import type {PrivateArtifacts} from '../storage/artifacts';
import type {PipelineState,Repository} from './types';
import {readWorkspace,writeWorkspace} from './workspace-state';

/** One bounded family workspace, using the existing chunk and artifact format. */
export class FirestoreRepository implements Repository {
 private store:AtomicStore;
 constructor(db:Firestore,private workspace:string,private artifacts?:PrivateArtifacts){
  if(!/^[\w-]{1,100}$/.test(workspace))throw Error('WORKSPACE_REQUIRED');
  this.store=firestoreStore(db);
 }
 transaction<T>(update:(state:PipelineState)=>T){
  return this.store.run(async tx=>{
   const workspace=await readWorkspace(tx,this.workspace,this.artifacts);
   const result=update(workspace.state);
   await writeWorkspace(tx,workspace,this.artifacts);
   return structuredClone(result);
  });
 }
 snapshot(){return this.store.run(async tx=>(await readWorkspace(tx,this.workspace,this.artifacts)).state,true);}
}
