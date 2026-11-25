import {FAMILY_STATE_KEY,validateFamilyState} from '../storage/family-state';
import { projectJournal } from '../storage/project-recovery';
import { assertRewardSourceLockHeld } from '../rewards/write-guard';
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
interface ProfileHost { store:{current():{id:string;constructionStates?:Record<string,unknown>};save():boolean;data?:{profiles:{id:string}[]}} }

/** Stage and validate both stores, then persist a durable undo intent.
 * Startup rolls back an interrupted operation before readers or rewards start. */
export function saveLocalStudioProject(
  storage:ProjectStorage,host:ProfileHost,owner:string,
  create:(games:StudioGames,notebook:StudioNotebook)=>StudioSession,
  onRewardSourceSaved?:(owner:string)=>void,
  updateProfile?:(profile:any,session:StudioSession)=>void,
):StudioSession {
  assertRewardSourceWritable();
  if(host.store.current().id!==owner)throw Error('Player changed. Reopen your game.');
  const namespace=adultWorkspaceId(),keys=[WORKSPACE_KEY,STUDIO_KEY,FAMILY_STATE_KEY];
  const before=new Map(keys.map(key=>[key,storage.getItem(key)]));
  const next=new Map(before),notifications=new Set<string>();
  const staged={
    getItem(key:string){if(!next.has(key))throw Error('Unknown project source.');return next.get(key)!;},
    setItem(key:string,value:string){if(!next.has(key))throw Error('Unknown project source.');next.set(key,value);},
  };
  const notebook=new StudioNotebook(staged,owner=>notifications.add(owner));
  notebook.assertCanCreate();
  const originalProfile=host.store.current(),stagedProfile=structuredClone(originalProfile);
  let profileChanged=false;
  const stagedHost={store:{current:()=>stagedProfile,save:()=>{
    if(!host.store.data)throw Error('The profile store cannot stage this construction safely.');
    const data=structuredClone(host.store.data);
    data.profiles=data.profiles.map(p=>p.id===owner?stagedProfile:p);
    if(!validateFamilyState(data))throw Error('Saved profile needs recovery.');
    next.set(FAMILY_STATE_KEY,JSON.stringify(data));profileChanged=true;return true;
  }}};
  const result=create(new StudioGames(staged,stagedHost),notebook);
  if(updateProfile){updateProfile(stagedProfile,result);stagedHost.store.save();}
  assertRewardSourceWritable();
  if(host.store.current().id!==owner||adultWorkspaceId()!==namespace)throw Error('Player changed. Reopen your game.');
  if(keys.some(key=>storage.getItem(key)!==before.get(key)))throw Error('Your saved work changed. Reopen it before making this copy.');
  const journal=projectJournal(storage,namespace??'family',()=>{
    assertRewardSourceLockHeld();
    if(host.store.current().id!==owner||adultWorkspaceId()!==namespace)throw Error('Player changed. Reopen your game.');
  });
  try{
    journal.commit(keys.filter(key=>next.get(key)!==before.get(key)).map(key=>({key,before:before.get(key)!,after:next.get(key)!})));
  }catch(error){
    let recovered=false;
    try{journal.recover();recovered=true;}catch{/* Preserve intent and unknown bytes for recovery. */}
    throw Error(recovered?'Could not save the new game. Your earlier work is unchanged. Try again when this device can save.':'The new game could not finish saving. Open My Games to recover saved work before making another copy.',{cause:error});
  }
  if(profileChanged)Object.assign(originalProfile,stagedProfile);
  for(const notifiedOwner of notifications){try{onRewardSourceSaved?.(notifiedOwner);}catch{/* The committed reward outbox remains retryable. */}}
  return result;
}
