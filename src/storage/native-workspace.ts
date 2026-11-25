import {IndexedNativeStore} from './indexed-native';
import {RevisionStore,WORKSPACE_KEY,type StoragePort,type Workspace} from '../factory/workspace';
import {assertRewardSourceWritable,assertRewardSourceLockHeld,setRewardSourceMaintenance} from '../rewards/write-guard';
import type {GameId,Mechanics,PlayOutcome} from '../runtime/types';

/** Synthetic preview is an explicit build selection. Production builds never
 * migrate or select a new authority from a query string or stored marker. */
export const indexedStoragePreview=()=>import.meta.env.MODE==='storage-preview';
export async function nativeScope(profile:string){
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(location.origin));
 return {family:'origin-'+[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join(''),profile};
}
export class NativeWorkspace {
 private constructor(private legacy:RevisionStore|null,readonly indexed:IndexedNativeStore|null,private owner:()=>string,private captured:string){}
 static async open(storage:StoragePort,owner:()=>string){
  const captured=owner();let indexed:IndexedNativeStore|null=null;
  if(indexedStoragePreview()){
   const candidate=await IndexedNativeStore.open(await nativeScope(captured),()=>{if(owner()!==captured)throw Error('The player changed. Reopen this game in its own profile.');assertRewardSourceWritable();});
   if(await candidate.isActive())indexed=candidate;else candidate.close();
  }
  return new NativeWorkspace(indexed?null:new RevisionStore(storage),indexed,owner,captured);
 }
 private check(owner=this.captured){if(owner!==this.captured||this.owner()!==this.captured)throw Error('The player changed. Reopen this game in its own profile.');}
 close(){this.indexed?.close();}
 async list(owner:string,after:string|null=null,limit=24){this.check(owner);return this.indexed?(await this.indexed.page(after,limit)).items:this.legacy!.list(owner);}
 async page(owner:string,after:string|null=null,limit=24){this.check(owner);return this.indexed?this.indexed.page(after,limit):{items:this.legacy!.list(owner),next:null};}
 async project(id:string,owner:string){this.check(owner);return this.indexed?this.indexed.project(id):this.legacy!.project(id,owner);}
 async revision(id:string,owner:string,revisionId?:string){this.check(owner);return this.indexed?this.indexed.revision(id,revisionId):this.legacy!.revision(id,owner,revisionId);}
 async history(id:string,owner:string){this.check(owner);return this.indexed?(await this.indexed.history(id,null,100)).items:this.legacy!.history(id,owner);}
 async historyPage(id:string,owner:string,after:string|null=null,limit=24){this.check(owner);return this.indexed?this.indexed.history(id,after,limit):{items:this.legacy!.history(id,owner),next:null};}
 async create(owner:string,game:GameId,name:string,config:Mechanics,revisionId?:string,drawingRigId?:string){this.check(owner);return this.indexed?this.indexed.create(game,name,config,revisionId?{projectId:crypto.randomUUID(),revisionId,operation:crypto.randomUUID()}:undefined,drawingRigId):this.legacy!.create(owner,game,name,config,revisionId,drawingRigId);}
 async commit(id:string,owner:string,config:Mechanics,label:string,hypothesis='',revisionId?:string,head?:string){this.check(owner);return this.indexed?this.indexed.commit(id,config,label,hypothesis,head,revisionId):this.legacy!.commit(id,owner,config,label,hypothesis,revisionId,head);}
 async keep(id:string,owner:string,expectedHeadId?:string){this.check(owner);return this.indexed?this.indexed.keep(id,expectedHeadId??(await this.indexed.project(id)).headId):this.legacy!.keep(id,owner,expectedHeadId);}
 async undo(id:string,owner:string){this.check(owner);return this.indexed?this.indexed.undo(id):this.legacy!.undo(id,owner);}
 async redo(id:string,owner:string){this.check(owner);return this.indexed?this.indexed.redo(id):this.legacy!.redo(id,owner);}
 async checkout(id:string,owner:string,revisionId:string,expectedHeadId?:string){this.check(owner);return this.indexed?this.indexed.checkout(id,revisionId,expectedHeadId):this.legacy!.checkout(id,owner,revisionId,expectedHeadId);}
 async fork(id:string,owner:string,name:string,revisionId?:string,head?:string){this.check(owner);return this.indexed?this.indexed.fork(id,name,head,{revisionId,expectedHeadId:head}):this.legacy!.fork(id,owner,name,revisionId,head);}
 async record(id:string,owner:string,revisionId:string,outcome:PlayOutcome){this.check(owner);return this.indexed?this.indexed.record(id,revisionId,outcome):this.legacy!.record(id,owner,revisionId,outcome);}
 async reflect(id:string,owner:string,text:string){this.check(owner);return this.indexed?this.indexed.reflect(id,text):this.legacy!.reflect(id,owner,text);}
 async projectForRevision(id:string){this.check();if(this.indexed)return this.indexed.projectForRevision(id);const data=this.legacy!.snapshot(),revision=data.revisions.find(r=>r.id===id);return revision?data.projects.find(p=>p.id===revision.projectId&&p.owner===this.captured)??null:null;}
 async snapshot(){this.check();return this.indexed?this.indexed.snapshot():this.legacy!.snapshot();}
 legacySnapshot(){this.check();if(this.indexed)throw Error('Use the complete recovery backup for this prepared library.');return this.legacy!.snapshot();}
 restoreLegacy(raw:string){this.check();if(this.indexed)throw Error('Preview the complete recovery backup before replacing this library.');this.legacy!.restore(raw);}
 async restore(raw:string){this.restoreLegacy(raw);}
}
export async function prepareIndexedNative(storage:StoragePort,owner:()=>string){
 if(!indexedStoragePreview())throw Error('Indexed storage migration is not enabled in this build.');
 assertRewardSourceWritable();const captured=owner(),raw=storage.getItem(WORKSPACE_KEY)??JSON.stringify({version:2,projects:[],revisions:[],plays:[]} satisfies Workspace);
 setRewardSourceMaintenance(true);let store:IndexedNativeStore|undefined;
 try{const scope=await nativeScope(captured);store=await IndexedNativeStore.open(scope,()=>{if(owner()!==captured)throw Error('The player changed.');assertRewardSourceLockHeld();});
  return await store.migrateLegacy(raw,{beforeActivate:()=>{if((storage.getItem(WORKSPACE_KEY)??JSON.stringify({version:2,projects:[],revisions:[],plays:[]}))!==raw)throw Error('Saved games changed while preparing the library. The original work is still active.');}});
 }finally{store?.close();setRewardSourceMaintenance(false);}
}
