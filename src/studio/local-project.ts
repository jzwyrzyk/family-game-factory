import {FAMILY_STATE_KEY,validateFamilyState} from '../storage/family-state';
import { projectJournal } from '../storage/project-recovery';
import { assertRewardSourceLockHeld,setRewardSourceMaintenance } from '../rewards/write-guard';
import { WORKSPACE_KEY } from '../factory/workspace';
import { assertRewardSourceWritable } from '../rewards/write-guard';
import { adultWorkspaceId } from '../adult-pilot/storage';
import { StudioGames } from './adapter';
import { STUDIO_KEY, StudioNotebook, type StudioSession } from './notebook';
import {IndexedNativeStore} from '../storage/indexed-native';
import {IndexedNotebook} from '../storage/indexed-notebook';
import {publishSourceEvidence,type SourceEvidenceSignal} from '../problem-solving/signals';
import {indexedStoragePreview,nativeScope} from '../storage/native-workspace';
import {prepareStudioNativeIntent,recoverStudioNative} from '../storage/studio-native-transaction';
import {validateIndexedNativeWorkspace} from '../factory/workspace';

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
  requiresNewSession=true,
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
  if(requiresNewSession)notebook.assertCanCreate();
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

/** The selected indexed game authority and the legacy notebook/profile half
 * share a durable operation. Startup completes its exact local after-images
 * before exposing the new game; ambiguous paid requests are never replayed. */
export async function saveStudioProject(
 storage:ProjectStorage,host:ProfileHost,owner:string,
 create:(games:StudioGames,notebook:StudioNotebook)=>StudioSession,
 onRewardSourceSaved?:(owner:string)=>void,
 updateProfile?:(profile:any,session:StudioSession)=>void,
 sourceProjectId:string|null=null,
):Promise<StudioSession>{
 assertRewardSourceWritable();if(!indexedStoragePreview())return saveLocalStudioProject(storage,host,owner,create,onRewardSourceSaved,updateProfile,sourceProjectId===null);
 const audience=adultWorkspaceId(),guard=()=>{assertRewardSourceLockHeld();if(host.store.current().id!==owner||adultWorkspaceId()!==audience)throw Error('Player changed. Reopen your game.');};
 guard();const scope=await nativeScope(owner),indexed=await IndexedNativeStore.open(scope,guard),notices=new Set<string>(),signals:SourceEvidenceSignal[]=[];
 const indexedBook=await IndexedNotebook.open(scope,guard,value=>notices.add(value));
 try{
  const nativeActive=await indexed.isActive(),notebookActive=await indexedBook.isActive();
  if(!nativeActive&&!notebookActive)return saveLocalStudioProject(storage,host,owner,create,onRewardSourceSaved,updateProfile,sourceProjectId===null);
  guard();assertRewardSourceWritable();setRewardSourceMaintenance(true);
  let result:StudioSession,publish=()=>{};
  try{
   if(await recoverStudioNative(indexed.records,storage,guard,owner))throw Error('A previous copy finished recovery. Reload before making another copy.');
   const sourceKeys=[FAMILY_STATE_KEY,...(nativeActive?[]:[WORKSPACE_KEY]),...(notebookActive?[]:[STUDIO_KEY])];
   const before=new Map(sourceKeys.map(key=>[key,storage.getItem(key)]));
   const workspace=nativeActive?await indexed.snapshotProject(sourceProjectId):null;guard();
   const values=new Map<string,string|null>([[WORKSPACE_KEY,workspace?JSON.stringify(workspace):storage.getItem(WORKSPACE_KEY)],...before]);
   const staged:ProjectStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>{values.set(key,value);},removeItem:key=>{values.delete(key);}};
   const data=structuredClone(host.store.data),profile=structuredClone(host.store.current());
   if(!data)throw Error('The selected player needs recovery before making a copy.');
   data.profiles=data.profiles.map(p=>p.id===owner?profile:p);
   const stagedHost:ProfileHost={store:{current:()=>profile,data,save:()=>{if(!validateFamilyState(data))throw Error('Saved profile needs recovery.');staged.setItem(FAMILY_STATE_KEY,JSON.stringify(data));return true;}}};
   const run=(book:StudioNotebook)=>{
    // The mutation is synchronous; all async preparation keeps the source gate.
    setRewardSourceMaintenance(false);
    try{if(sourceProjectId===null)book.assertCanCreate();const value=create(new StudioGames(staged,stagedHost,nativeActive?owner:undefined),book);if(updateProfile){updateProfile(profile,value);stagedHost.store.save();}return value;}
    finally{setRewardSourceMaintenance(true);}
   };
   const prepared=notebookActive?await indexedBook.prepareTransaction(run):null;
   result=prepared?prepared.value:run(new StudioNotebook(staged,value=>notices.add(value),signal=>signals.push(signal)));
   guard();if([...before].some(([key,value])=>storage.getItem(key)!==value))throw Error('Saved work changed. Reopen it before making this copy.');
   const changes=[...before].filter(([key,value])=>staged.getItem(key)!==value).map(([key,value])=>({key,before:value,after:staged.getItem(key)!}));
   const id=crypto.randomUUID(),extra=[...(prepared?.changes??[]),...(changes.length?await prepareStudioNativeIntent(indexed.records,owner,changes,id):[])];
   guard();
   if(nativeActive)await indexed.restoreSnapshot(validateIndexedNativeWorkspace(JSON.parse(staged.getItem(WORKSPACE_KEY)!),owner),id,extra);
   else if(extra.length)await indexed.records.restoreLocal({id,scope,changes:extra});
   if(changes.length)await recoverStudioNative(indexed.records,storage,guard,owner);guard();
   if(changes.some(change=>change.key===FAMILY_STATE_KEY))Object.assign(host.store.current(),profile);
   publish=prepared?.publish??(()=>{});
  }finally{setRewardSourceMaintenance(false);}
  publish();for(const signal of signals)publishSourceEvidence(signal);
  for(const changed of notices){try{onRewardSourceSaved?.(changed);}catch{}}
  return result!;
 }finally{indexed.close();indexedBook.close();}
}
