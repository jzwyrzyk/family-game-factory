/** Existing game engines, learning host and revision storage remain authoritative. */
import { RevisionStore } from '../factory/workspace';
import type { Mechanics, GameId } from '../runtime/types';
/** Both generated formats use the generated revision endpoint; neither is a star catcher. */
export function isGeneratedRemoteKind(kind: unknown): boolean { return kind === 'generated-module-v1' || kind === 'generated-module-v2'; }
export class StudioGames {
  constructor(private storage: Storage, private fg: any) {}
  private store(){return new RevisionStore(this.storage);}
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
