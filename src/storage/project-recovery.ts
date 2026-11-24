import {FAMILY_STATE_KEY,validateFamilyState} from './family-state';
import {adultStorageKey} from '../adult-pilot/storage';
import {validateWorkspace,migrateWorkspace,WORKSPACE_KEY} from '../factory/workspace';
import {validateNotebook,STUDIO_KEY} from '../studio/notebook';
import {assertRewardSourceLockHeld} from '../rewards/write-guard';
import {localJournal,type JournalStorage,type Change} from './local-journal';
export const PROJECT_KEYS=[WORKSPACE_KEY,STUDIO_KEY,FAMILY_STATE_KEY] as const;
function validateImages(changes:Change[],scope:string) {
  for(const c of changes)for(const raw of [c.before,c.after]){
    if(raw===null)continue;
    const value=JSON.parse(raw);
    if(c.key===FAMILY_STATE_KEY){
      if(!validateFamilyState(value)||new Set(value.profiles.map((p:{id:string})=>p.id)).size!==value.profiles.length||value.profiles.some((p:{id:string})=>scope==='family'?p.id.startsWith('adult:'):p.id!==scope))throw Error('Recovery profile differs.');
    }else if(c.key===WORKSPACE_KEY){
      // Legacy before-images remain recoverable without minting migration IDs.
      if(value.version===1){
        if(raw!==c.before)throw Error('Invalid legacy recovery source.');migrateWorkspace(value);
        if(value.games.some((p:{owner:string})=>scope==='family'?p.owner.startsWith('adult:'):p.owner!==scope))throw Error('Recovery profile differs.');
      }else{
        const data=validateWorkspace(value);
        if(data.projects.some(p=>scope==='family'?p.owner.startsWith('adult:'):p.owner!==scope))throw Error('Recovery profile differs.');
      }
    }else{
      const data=validateNotebook(value);
      const owners=[...data.sessions.map(s=>s.owner),...(data.conversationChapters??[]).map(c=>c.owner),...Object.keys(data.active),...Object.keys(data.avatars??{}),...Object.keys(data.guidance??{}),...Object.keys(data.notifications??{}),...(data.rewardOutbox??[]).map(f=>f.owner)];
      if(owners.some(owner=>scope==='family'?owner.startsWith('adult:'):owner!==scope))throw Error('Recovery profile differs.');
    }
  }
}
export function projectJournal(storage:JournalStorage,scope:string,guard=assertRewardSourceLockHeld){
  return localJournal(storage,scope,PROJECT_KEYS,guard,changes=>validateImages(changes,scope));
}
/** Adult scope must come from a newly authenticated grant, never a stored journal. */
export function recoverLocalProjects(storage:JournalStorage,scope='family') {
  const profile=scope==='family'?null:scope;
  const scoped:JournalStorage={getItem:key=>storage.getItem(adultStorageKey(key,profile)),setItem:(key,value)=>storage.setItem(adultStorageKey(key,profile),value),removeItem:key=>storage.removeItem(adultStorageKey(key,profile))};
  return projectJournal(scoped,scope).recover();
}
