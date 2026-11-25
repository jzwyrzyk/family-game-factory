/** Existing game engines, learning host and revision storage remain authoritative. */
import { RevisionStore, type StoragePort } from '../factory/workspace';
import type { Mechanics, GameId } from '../runtime/types';
import {NativeWorkspace} from '../storage/native-workspace';
import {adultWorkspaceId} from '../adult-pilot/storage';
import type {Revision} from '../factory/workspace';
/** Both generated formats use the generated revision endpoint; neither is a star catcher. */
export function isGeneratedRemoteKind(kind: unknown): boolean { return kind === 'generated-module-v1' || kind === 'generated-module-v2'; }
export class StudioGames {
  constructor(private storage: StoragePort, private fg: any,private indexedStagingOwner?:string) {}
  private store(){return this.indexedStagingOwner===undefined?new RevisionStore(this.storage):RevisionStore.forIndexedStaging(this.storage,this.indexedStagingOwner);}
  list(owner:string){return this.store().list(owner);}
  create(owner:string,game:GameId,name:string,config:Mechanics,drawingRigId?:string){return this.store().create(owner,game,name,config,undefined,drawingRigId);}
  project(projectId:string,owner:string){return this.store().project(projectId,owner);}
  revision(projectId:string,owner:string,id?:string){return this.store().revision(projectId,owner,id);}
  history(projectId:string,owner:string){return this.store().history(projectId,owner);}
  clonePlayState(owner:string,from:string,to:string){
    const p=this.fg.store.current();if(p.id!==owner)throw Error('Player changed. Reopen your game.');
    const state=p.constructionStates?.[from];if(state===undefined)return;
    const before=p.constructionStates;p.constructionStates={...before,[to]:JSON.parse(JSON.stringify(state))};
    if(!this.fg.store.save()){p.constructionStates=before;throw Error('Could not preserve the construction. Your original is unchanged.');}
  }
  keep(owner:string,projectId:string,baseId:string,config:Mechanics,prompt:string,hypothesis:string,stateKey:string){
    const store=this.store();
    const p=this.fg.store.current();if(p.id!==owner)throw Error('Player changed. Reopen your game.');
    const revision=store.commit(projectId,owner,config,prompt,hypothesis,undefined,baseId);
    try {this.clonePlayState(owner,stateKey,revision.id);store.keep(projectId,owner,revision.id);} catch(err) {
      // Undo only this operation's pointer; preserve a newer writer's revision.
      if(store.project(projectId,owner).headId===revision.id)store.checkout(projectId,owner,baseId,revision.id);
      throw err;
    }
    return revision;
  }
  undo(owner:string,projectId:string){this.store().undo(projectId,owner);}
  redo(owner:string,projectId:string){this.store().redo(projectId,owner);}
  checkout(owner:string,projectId:string,id:string){this.store().checkout(projectId,owner,id);}
  record(owner:string,projectId:string,revisionId:string,outcome:any){this.store().record(projectId,owner,revisionId,outcome);}
  fork(owner:string,projectId:string,name:string,config?:Mechanics,prompt='',stateKey?:string){
    const store=this.store(),base=store.revision(projectId,owner),p=store.fork(projectId,owner,name,undefined,base.id);
    const revision=config?store.commit(p.id,owner,config,prompt):store.revision(p.id,owner);
    this.clonePlayState(owner,stateKey||base.id,revision.id);store.keep(p.id,owner,revision.id);return p;
  }
  export(){return this.store().snapshot();}
}

/** Actual Studio journeys await the selected authority. The synchronous class
 * above is retained only for legacy callers and isolated compound staging. */
export class AsyncStudioGames {
  private selected:{key:string;value:Promise<NativeWorkspace>}|undefined;
  private working=new Map<string,Revision>();
  constructor(private storage:StoragePort,private fg:any){if(typeof window!=='undefined')window.addEventListener('jems:native-authority-changed',()=>{this.selected?.value.then(value=>value.close()).catch(()=>{});this.selected=undefined;this.working.clear();});}
  private async store(owner:string){
    if(this.fg.store.current().id!==owner)throw Error('Player changed. Reopen your game.');
    const key=JSON.stringify([adultWorkspaceId(),owner]);
    if(this.selected?.key!==key){
      this.selected?.value.then(value=>value.close()).catch(()=>{});this.working.clear();
      this.selected={key,value:NativeWorkspace.open(this.storage,()=>String(this.fg.store.current().id))};
    }
    const selected=this.selected,value=await selected.value;
    if(this.selected!==selected||this.fg.store.current().id!==owner||JSON.stringify([adultWorkspaceId(),owner])!==key)throw Error('Player changed. Reopen your game.');
    return value;
  }
  async ready(owner:string){await this.store(owner);}
  async list(owner:string){const store=await this.store(owner),items=[];let after:string|null=null;do{const page=await store.page(owner,after,40);items.push(...page.items);after=page.next;}while(after);return items;}
  async create(owner:string,game:GameId,name:string,config:Mechanics,drawingRigId?:string){return (await this.store(owner)).create(owner,game,name,config,undefined,drawingRigId);}
  async project(id:string,owner:string){return (await this.store(owner)).project(id,owner);}
  async revision(id:string,owner:string,revisionId?:string){const value=await(await this.store(owner)).revision(id,owner,revisionId);if(!revisionId)this.working.set(JSON.stringify([owner,id]),value);return value;}
  cachedRevision(id:string,owner:string){return this.working.get(JSON.stringify([owner,id]));}
  async historyPage(id:string,owner:string,after:string|null=null,limit=24){return(await this.store(owner)).historyPage(id,owner,after,limit);}
  async history(id:string,owner:string){const store=await this.store(owner),items=[];let after:string|null=null;do{const page=await store.historyPage(id,owner,after,40);items.push(...page.items);after=page.next;}while(after);return items;}
  clonePlayState(owner:string,from:string,to:string){new StudioGames(this.storage,this.fg).clonePlayState(owner,from,to);}
  async keep(owner:string,id:string,baseId:string,config:Mechanics,prompt:string,hypothesis:string,stateKey:string){
    const store=await this.store(owner),revision=await store.commit(id,owner,config,prompt,hypothesis,undefined,baseId);
    try{this.clonePlayState(owner,stateKey,revision.id);await store.keep(id,owner,revision.id);}catch(error){
      if((await store.project(id,owner)).headId===revision.id)await store.checkout(id,owner,baseId,revision.id);
      throw error;
    }
    this.working.set(JSON.stringify([owner,id]),revision);return revision;
  }
  async undo(owner:string,id:string){await(await this.store(owner)).undo(id,owner);this.working.delete(JSON.stringify([owner,id]));}
  async redo(owner:string,id:string){await(await this.store(owner)).redo(id,owner);this.working.delete(JSON.stringify([owner,id]));}
  async checkout(owner:string,id:string,revisionId:string){await(await this.store(owner)).checkout(id,owner,revisionId);this.working.delete(JSON.stringify([owner,id]));}
  async record(owner:string,id:string,revisionId:string,outcome:any){return(await this.store(owner)).record(id,owner,revisionId,outcome);}
  async export(){return(await this.store(String(this.fg.store.current().id))).snapshot();}
}
