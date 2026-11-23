import { WORKSPACE_KEY } from '../factory/workspace';
import { assertRewardSourceWritable } from '../rewards/write-guard';
import { adultWorkspaceId } from '../adult-pilot/storage';
import { StudioGames } from './adapter';
import { STUDIO_KEY, StudioNotebook, type StudioSession } from './notebook';

interface ProjectStorage {
  getItem(key:string):string|null;
  setItem(key:string,value:string):void;
  removeItem(key:string):void;
}
interface ProfileHost { store:{current():{id:string};save():boolean} }

/** Validate both source values before persisting either one. A synchronous
 * save failure restores only values still equal to this operation's writes.
 * This is compensation, not a crash-safe transaction across localStorage keys.
 */
export function saveLocalStudioProject(
  storage:ProjectStorage,host:ProfileHost,owner:string,
  create:(games:StudioGames,notebook:StudioNotebook)=>StudioSession,
  onRewardSourceSaved?:(owner:string)=>void,
):StudioSession {
  assertRewardSourceWritable();
  if(host.store.current().id!==owner)throw Error('Player changed. Reopen your game.');
  const namespace=adultWorkspaceId(),keys=[WORKSPACE_KEY,STUDIO_KEY];
  const before=new Map(keys.map(key=>[key,storage.getItem(key)]));
  const next=new Map(before),notifications=new Set<string>();
  const staged={
    getItem(key:string){if(!next.has(key))throw Error('Unknown project source.');return next.get(key)!;},
    setItem(key:string,value:string){if(!next.has(key))throw Error('Unknown project source.');next.set(key,value);},
  };
  const notebook=new StudioNotebook(staged,owner=>notifications.add(owner));
  notebook.assertCanCreate();
  const result=create(new StudioGames(staged,host),notebook);
  assertRewardSourceWritable();
  if(host.store.current().id!==owner||adultWorkspaceId()!==namespace)throw Error('Player changed. Reopen your game.');
  if(keys.some(key=>storage.getItem(key)!==before.get(key)))throw Error('Your saved work changed. Reopen it before making this copy.');
  const changed=keys.filter(key=>next.get(key)!==before.get(key)),attempted:string[]=[];
  try{
    for(const key of changed){attempted.push(key);storage.setItem(key,next.get(key)!);}
  }catch(error){
    let recovered=adultWorkspaceId()===namespace;
    if(recovered)for(const key of attempted.reverse()){
      try{
        const current=storage.getItem(key),original=before.get(key)!;
        if(current===original)continue;
        if(current!==next.get(key)){recovered=false;continue;}
        if(original===null)storage.removeItem(key);else storage.setItem(key,original);
      }catch{recovered=false;}
    }
    throw Error(recovered?'Could not save the new game. Your earlier work is unchanged. Try again when this device can save.':'The new game could not finish saving. Open My Games to recover saved work before making another copy.',{cause:error});
  }
  for(const notifiedOwner of notifications){try{onRewardSourceSaved?.(notifiedOwner);}catch{/* The committed reward outbox remains retryable. */}}
  return result;
}
