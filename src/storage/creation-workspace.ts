import type {SceneCopyOptions} from '../creation/storage';
import {IndexedCreationStore} from './indexed-creation';
import {CreationStore,CREATION_KEY,type CreationStoragePort} from '../creation/storage';
import type {CreationProject} from '../creation/model';
import type {MovementPrediction} from '../creation/challenges';
import {nativeScope,indexedStoragePreview} from './native-workspace';
import {assertRewardSourceWritable,assertRewardSourceLockHeld,setRewardSourceMaintenance} from '../rewards/write-guard';
const empty=()=>JSON.stringify({schema:'jems.creation.workspace.v1',projects:[],revisions:[],drafts:[],attempts:[]});
/** Same asynchronous surface in both modes; only explicit verified preparation
 * in a storage-preview build selects IndexedDB as the scene authority. */
export class CreationWorkspace {
 private constructor(private legacy:CreationStore|null,readonly indexed:IndexedCreationStore|null,private owner:()=>string,private captured:string){}
 static async open(storage:CreationStoragePort,owner:()=>string){const captured=owner();let indexed:IndexedCreationStore|null=null;if(indexedStoragePreview()){const candidate=await IndexedCreationStore.open(await nativeScope(captured),()=>{if(owner()!==captured)throw Error('The player changed. Reopen this scene.');assertRewardSourceWritable();});try{if(await candidate.isActive())indexed=candidate;else candidate.close();}catch(error){candidate.close();throw error;}}return new CreationWorkspace(indexed?null:new CreationStore(storage,owner),indexed,owner,captured);}
 private check(owner=this.captured){if(owner!==this.captured||this.owner()!==this.captured)throw Error('The player changed. Reopen this scene.');}
 close(){this.indexed?.close();}
 async read(){this.check();return this.indexed?this.indexed.snapshot():this.legacy!.read();}
 async export(){return this.read();}
 async page(owner:string,after:string|null=null,limit=24){this.check(owner);if(this.indexed)return this.indexed.page(after,limit);const rows=this.legacy!.list(owner),start=after===null?0:rows.findIndex(p=>p.id===after)+1;return {items:rows.slice(start,start+limit),next:start+limit<rows.length?rows[start+limit-1].id:null};}
 async list(owner:string){this.check(owner);return this.indexed?this.indexed.list():this.legacy!.list(owner);}
 async listByActivity(owner:string){this.check(owner);if(this.indexed)return (await this.indexed.list()).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));const data=this.legacy!.read(),projects=data.projects.filter(p=>p.owner===owner),recent=new Map(projects.map(p=>[p.id,Date.parse(p.updatedAt)]));for(const draft of data.drafts)if(recent.has(draft.projectId))recent.set(draft.projectId,Math.max(recent.get(draft.projectId)!,Date.parse(draft.updatedAt)));for(const attempt of data.attempts)if(recent.has(attempt.projectId))recent.set(attempt.projectId,Math.max(recent.get(attempt.projectId)!,Date.parse(attempt.checkedAt)));return projects.sort((a,b)=>recent.get(b.id)!-recent.get(a.id)!);}
 async get(id:string,owner:string){this.check(owner);return this.indexed?this.indexed.get(id):this.legacy!.get(id,owner);}
 async load(id:string,owner:string){this.check(owner);return this.indexed?this.indexed.load(id):this.legacy!.load(id,owner);}
 async keptRevision(id:string,owner:string){this.check(owner);return this.indexed?this.indexed.keptRevision(id):this.legacy!.keptRevision(id,owner);}
 async history(id:string,owner:string){this.check(owner);return this.indexed?this.indexed.history(id):this.legacy!.history(id,owner);}
 async historyPage(id:string,owner:string,after:string|null=null,limit=24){this.check(owner);if(this.indexed)return this.indexed.historyPage(id,after,limit);const rows=this.legacy!.history(id,owner),start=after===null?0:rows.findIndex(r=>r.id===after)+1;return {items:rows.slice(start,start+limit),next:start+limit<rows.length?rows[start+limit-1].id:null};}
 async attempts(id:string,owner:string){this.check(owner);return this.indexed?this.indexed.attempts(id):this.legacy!.attempts(id,owner);}
 async create(owner:string,scene:CreationProject,options:{challengeId?:string}={}){this.check(owner);return this.indexed?this.indexed.create(scene,options):this.legacy!.create(owner,scene,options);}
 async save(id:string,owner:string,scene:CreationProject,head:string,label?:string){this.check(owner);return this.indexed?this.indexed.save(id,scene,head,label):this.legacy!.save(id,owner,scene,head,label);}
 async keep(id:string,owner:string,head?:string){this.check(owner);return this.indexed?this.indexed.keep(id,head):this.legacy!.keep(id,owner,head);}
 async autosave(id:string,owner:string,scene:CreationProject,head:string){this.check(owner);return this.indexed?this.indexed.autosave(id,scene,head):this.legacy!.autosave(id,owner,scene,head);}
 async discardDraft(id:string,owner:string){this.check(owner);return this.indexed?this.indexed.discardDraft(id):this.legacy!.discardDraft(id,owner);}
 async checkout(id:string,owner:string,revision:string,head?:string){this.check(owner);return this.indexed?this.indexed.checkout(id,revision,head):this.legacy!.checkout(id,owner,revision,head);}
 async copy(id:string,owner:string,title?:string,options:SceneCopyOptions={}){this.check(owner);return this.indexed?this.indexed.copy(id,title,options):this.legacy!.copy(id,owner,title,options);}
 async markHintUsed(id:string,owner:string){this.check(owner);return this.indexed?this.indexed.markHintUsed(id):this.legacy!.markHintUsed(id,owner);}
 async recordAttempt(id:string,owner:string,head:string,result:{challengeId:string;passed:boolean;hintUsed:boolean;prediction?:MovementPrediction}){this.check(owner);return this.indexed?this.indexed.recordAttempt(id,head,result):this.legacy!.recordAttempt(id,owner,head,result);}
 async remove(id:string,owner:string){this.check(owner);return this.indexed?this.indexed.remove(id):this.legacy!.remove(id,owner);}
 async recentChecks(owner:string,limit=5){this.check(owner);if(this.indexed)return this.indexed.recentChecks(limit);const data=this.legacy!.read(),projects=new Map(data.projects.filter(p=>p.owner===owner).map(p=>[p.id,p])),revisions=new Map(data.revisions.map(r=>[r.id,r]));return data.attempts.filter(a=>projects.has(a.projectId)).sort((a,b)=>b.checkedAt.localeCompare(a.checkedAt)).slice(0,limit).map(a=>({projectId:a.projectId,revisionId:a.revisionId,title:revisions.get(a.revisionId)!.scene.title,challengeId:a.challengeId,passed:a.passed,hintUsed:a.hintUsed,checkedAt:a.checkedAt}));}
 async pendingRewards(owner:string){this.check(owner);return this.indexed?this.indexed.pendingRewards():this.legacy!.pendingRewards(owner);}
 async acknowledgeRewards(owner:string,ids:string[]){this.check(owner);return this.indexed?this.indexed.acknowledgeRewards(ids):this.legacy!.acknowledgeRewards(owner,ids);}
 async restore(value:unknown){this.check();return this.indexed?this.indexed.restoreSnapshot(value,crypto.randomUUID()):this.legacy!.restore(value);}
 legacyBackup(){this.check();if(this.indexed)throw Error('Use the complete recovery copy for these prepared scenes.');try{return {factoryCreation:this.legacy!.read()};}catch(error){const raw=this.legacy!.recoveryRaw;if(raw===null)throw error;return {factoryCreationRecoveryRaw:raw};}}
}
export async function prepareIndexedCreation(storage:CreationStoragePort,owner:()=>string){if(!indexedStoragePreview())throw Error('Scene preparation is not enabled in this build.');assertRewardSourceWritable();const captured=owner(),raw=storage.getItem(CREATION_KEY)??empty();setRewardSourceMaintenance(true);let indexed:IndexedCreationStore|undefined;try{indexed=await IndexedCreationStore.open(await nativeScope(captured),()=>{if(owner()!==captured)throw Error('The player changed.');assertRewardSourceLockHeld();});return await indexed.migrateLegacy(raw,{beforeActivate:()=>{if((storage.getItem(CREATION_KEY)??empty())!==raw)throw Error('Scenes changed while preparing storage. Original scenes remain active.');}});}finally{indexed?.close();setRewardSourceMaintenance(false);}}
