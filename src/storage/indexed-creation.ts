import {IndexedRecords} from './indexed-records';
import type {DurableRecord,RecordChange,RecordScope} from './record-contract';
import {CreationStore,CREATION_KEY,CREATION_LIMITS,validateCreationWorkspace,type CreationWorkspace,type CreationEntry,type CreationRevision,type CreationDraft,type CreationAttempt} from '../creation/storage';
import type {CreationProject} from '../creation/model';
import type {MovementPrediction} from '../creation/challenges';
import {rewardFactId,type RewardFact} from '../rewards/model';
const P='creation-projects',R='creation-revisions',S='creation-scenes',D='creation-drafts',A='creation-attempts',Q='creation-rewards',C='creation-control';
const chronological=(at:string,id:string)=>String(Date.parse(at)).padStart(16,'0')+':'+id;
const recentKey=(at:string,id:string)=>String(Number.MAX_SAFE_INTEGER-Date.parse(at)).padStart(16,'0')+':'+id;
const history=(id:string)=>'creation-history:'+id,attempts=(id:string)=>'creation-checks:'+id;
const fresh=():CreationWorkspace=>({schema:'jems.creation.workspace.v1',projects:[],revisions:[],drafts:[],attempts:[]});
const clone=<T>(v:T):T=>structuredClone(v),same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const hash=async(v:string)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v)))].map(b=>b.toString(16).padStart(2,'0')).join('');
type StoredRevision=Omit<CreationRevision,'scene'>&{sceneHash:string};
type StoredDraft=Omit<CreationDraft,'scene'>&{sceneHash:string};
type Counts={projects:number;revisions:number;drafts:number;attempts:number;characters:number};
/** Per-record scene authority. Ordinary edits stage only the selected head,
 * kept revision and recoverable draft; retained history is never hydrated. */
export class IndexedCreationStore {
 private constructor(readonly records:IndexedRecords,readonly scope:RecordScope,private guard:()=>void){}
 static async open(scope:RecordScope,guard:()=>void){return new IndexedCreationStore(await IndexedRecords.open(scope,guard),scope,guard);}
 close(){this.records.close();}
 private async row(collection:string,id:string){this.guard();return this.records.get(collection,id);}
 async isActive(){return (await this.row(C,'migration'))?.value!=null&&((await this.row(C,'migration'))!.value as any).complete===true;}
 private async ready(){if(!await this.isActive())throw Error('Finish preparing scenes before opening this library.');}
 private async all(collection:string){const rows:DurableRecord[]=[];let after:string|null=null;do{const page=await this.records.page(collection,after,100);rows.push(...page.filter(r=>!r.deleted));after=page.length===100?page.at(-1)!.id:null;}while(after);return rows;}
 private entry(row:DurableRecord|null):CreationEntry{if(!row||row.deleted)throw Error('Choose a scene in your own profile.');const p=row.value as CreationEntry;if(!p||p.owner!==this.scope.profile||p.id!==row.id)throw Error('This scene needs recovery.');return clone(p);}
 async page(after:string|null=null,limit=24){await this.ready();if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('Choose a bounded scene page.');const items:CreationEntry[]=[];let cursor=after;for(;;){const rows=await this.records.page(P,cursor,limit+1);for(const row of rows){cursor=row.id;if(!row.deleted){if(items.length===limit)return {items,next:items.at(-1)!.id};items.push(this.entry(row));}}if(rows.length<limit+1)return {items,next:null};}}

 async list(){await this.ready();return (await this.all(P)).map(row=>this.entry(row));}
 async get(id:string){await this.ready();return this.entry(await this.row(P,id));}
 private async scene(hashId:string):Promise<CreationProject>{const row=await this.row(S,hashId);if(!row||row.deleted||await hash(JSON.stringify(row.value))!==hashId)throw Error('The saved scene is missing or damaged. Earlier versions are preserved.');return clone(row.value) as CreationProject;}
 private async revision(id:string,projectId:string):Promise<CreationRevision>{const row=await this.row(R,id),value=row?.value as StoredRevision;if(!row||row.deleted||value.projectId!==projectId)throw Error('This saved scene version is unavailable.');const {sceneHash,...rest}=value;return {...clone(rest),scene:await this.scene(sceneHash)};}
 private async draft(id:string):Promise<CreationDraft|null>{const row=await this.row(D,id);if(!row||row.deleted)return null;const {sceneHash,...rest}=row.value as StoredDraft;return {...clone(rest),scene:await this.scene(sceneHash)};}
 async load(id:string){const project=await this.get(id),revision=await this.revision(project.headId,id);return {project,revision,scene:clone(revision.scene),draft:await this.draft(id)};}
 async historyPage(id:string,after:string|null=null,limit=24){await this.get(id);const rows=await this.records.page(history(id),after,limit+1),visible=rows.slice(0,limit),items:CreationRevision[]=[];for(const row of visible)items.push(await this.revision((row.value as any).id,id));return {items,next:rows.length>limit?visible.at(-1)!.id:null};}
 async history(id:string){const items:CreationRevision[]=[];let after:string|null=null;do{const page=await this.historyPage(id,after,100);items.push(...page.items);after=page.next;}while(after);return items;}
 async attempts(id:string){await this.get(id);const rows=await this.all(attempts(id)),values:CreationAttempt[]=[];for(const pointer of rows){const row=await this.row(A,(pointer.value as any).id);if(row&&!row.deleted)values.push(clone(row.value) as CreationAttempt);}return values;}
 async recentChecks(limit=5){await this.ready();if(!Number.isInteger(limit)||limit<1||limit>50)throw Error('Choose a small recent-check page.');const result:{projectId:string;revisionId:string;title:string;challengeId:string;passed:boolean;hintUsed:boolean;checkedAt:string}[]=[];let after:string|null=null;while(result.length<limit){const rows=await this.records.page('creation-recent',after,limit-result.length);if(!rows.length)break;for(const pointer of rows){after=pointer.id;const p=await this.row(P,(pointer.value as any).projectId);if(!p||p.deleted)continue;const row=await this.row(A,(pointer.value as any).id);if(!row||row.deleted)continue;const a=row.value as CreationAttempt,r=await this.revision(a.revisionId,a.projectId);result.push({projectId:a.projectId,revisionId:a.revisionId,title:r.scene.title,challengeId:a.challengeId,passed:a.passed,hintUsed:a.hintUsed,checkedAt:a.checkedAt});}}return result;}
 async pendingRewards(){await this.ready();return (await this.all(Q)).map(r=>clone(r.value) as RewardFact);}
 async acknowledgeRewards(ids:string[]){await this.ready();const changes:RecordChange[]=[];for(const id of new Set(ids)){const row=await this.row(Q,await hash(id));if(row&&!row.deleted)changes.push({collection:Q,id:row.id,value:row.value,deleted:true,expectedVersion:row.version});}if(changes.length)await this.records.restoreLocal({id:crypto.randomUUID(),scope:this.scope,changes});}
 /** Reuse the established scene/domain validator against a bounded local view.
  * Detached validation copies never replace retained immutable parent links. */
 private async edit<T>(id:string|null,action:(store:CreationStore)=>T):Promise<T>{
  await this.ready();const data=fresh(),originals=new Set<string>(),source=id?await this.row(P,id):null,countsRow=await this.row(C,'counts');
  if(id){const p=this.entry(source);data.projects.push(p);const d=await this.draft(id);if(d)data.drafts.push(d);for(const revisionId of new Set([p.headId,p.keptId,d?.baseRevisionId].filter(Boolean) as string[])){const r=await this.revision(revisionId,id);originals.add(r.id);data.revisions.push({...r,parentId:null});}}
  data.rewardOutbox=await this.pendingRewards();const before=clone(data);let raw=JSON.stringify(data);const memory={getItem:(key:string)=>key===CREATION_KEY?raw:null,setItem:(key:string,value:string)=>{if(key!==CREATION_KEY)throw Error('Unexpected scene source.');raw=value;}};
  const result=action(new CreationStore(memory,()=>this.scope.profile)),after=validateCreationWorkspace(JSON.parse(raw)),changes:RecordChange[]=[];
  const put=async(collection:string,key:string,value:unknown,deleted=false)=>{const row=await this.row(collection,key);changes.push({collection,id:key,value,deleted,expectedVersion:row?.version??0});};
  const plannedScenes=new Set<string>();const sceneRef=async(scene:CreationProject)=>{const digest=await hash(JSON.stringify(scene));if(!plannedScenes.has(digest)&&!await this.row(S,digest)){plannedScenes.add(digest);await put(S,digest,scene);}return digest;};
  for(const p of after.projects){if(!before.projects.some(v=>v.id===p.id)&&await this.row(P,p.id))throw Error('That scene identity is already retained. Make a new copy.');const activity=[p.updatedAt,...after.drafts.filter(d=>d.projectId===p.id).map(d=>d.updatedAt),...after.attempts.filter(a=>a.projectId===p.id).map(a=>a.checkedAt)].sort().at(-1)!;p.updatedAt=activity;await put(P,p.id,p);}
  for(const p of before.projects)if(!after.projects.some(v=>v.id===p.id))await put(P,p.id,p,true);
  for(const r of after.revisions)if(!originals.has(r.id)){if(await this.row(R,r.id))throw Error('That immutable scene version is already retained.');const {scene,...rest}=r;await put(R,r.id,{...rest,sceneHash:await sceneRef(scene)});await put(history(r.projectId),chronological(r.createdAt,r.id),{id:r.id});}
  for(const d of after.drafts){const {scene,...rest}=d;await put(D,d.projectId,{...rest,sceneHash:await sceneRef(scene)});}
  for(const d of before.drafts)if(!after.drafts.some(v=>v.projectId===d.projectId))await put(D,d.projectId,null,true);
  for(const a of after.attempts){await put(A,a.id,a);await put(attempts(a.projectId),a.id,{id:a.id});await put('creation-recent',recentKey(a.checkedAt,a.id),{id:a.id,projectId:a.projectId});}
  for(const fact of after.rewardOutbox??[])if(!(before.rewardOutbox??[]).some(v=>rewardFactId(v)===rewardFactId(fact)))await put(Q,await hash(rewardFactId(fact)),fact);
  const counts:Counts={...((countsRow?.value as Counts)??{projects:0,revisions:0,drafts:0,attempts:0,characters:JSON.stringify(fresh()).length})};
  counts.characters+=JSON.stringify(after).length-JSON.stringify(before).length;if(counts.characters>CREATION_LIMITS.characters)throw Error('This scene collection is full. Keep a complete recovery copy before changing its storage.');
  counts.projects+=after.projects.length-before.projects.length;counts.revisions+=after.revisions.filter(r=>!originals.has(r.id)).length;counts.drafts+=after.drafts.length-before.drafts.length;counts.attempts+=after.attempts.length;
  for(const key of ['projects','revisions','drafts','attempts'] as const)if(counts[key]>CREATION_LIMITS[key])throw Error('This scene collection is full. Keep a complete recovery copy before changing its storage.');
  changes.push({collection:C,id:'counts',value:counts,expectedVersion:countsRow?.version??0});
  // The selected source row is included even for copy/draft/evidence operations,
  // so a head changed in another tab cannot be silently accepted.
  if(source&&!changes.some(c=>c.collection===P&&c.id===source.id))changes.push({collection:P,id:source.id,value:source.value,expectedVersion:source.version});
  if(source){const c=changes.find(c=>c.collection===P&&c.id===source.id);if(c)c.expectedVersion=source.version;}
  await this.records.restoreLocal({id:crypto.randomUUID(),scope:this.scope,changes});return clone(result);
 }
 create(scene:CreationProject,options:{challengeId?:string}={}){return this.edit(null,s=>s.create(this.scope.profile,scene,options));}
 save(id:string,scene:CreationProject,head:string,label?:string){return this.edit(id,s=>s.save(id,this.scope.profile,scene,head,label));}
 keep(id:string,head?:string){return this.edit(id,s=>s.keep(id,this.scope.profile,head));}
 autosave(id:string,scene:CreationProject,head:string){return this.edit(id,s=>s.autosave(id,this.scope.profile,scene,head));}
 discardDraft(id:string){return this.edit(id,s=>s.discardDraft(id,this.scope.profile));}
 copy(id:string,title?:string,options:{detachChallenge?:boolean}={}){return this.edit(id,s=>s.copy(id,this.scope.profile,title,options));}
 markHintUsed(id:string){return this.edit(id,s=>s.markHintUsed(id,this.scope.profile));}
 recordAttempt(id:string,head:string,result:{challengeId:string;passed:boolean;hintUsed:boolean;prediction?:MovementPrediction}){return this.edit(id,s=>s.recordAttempt(id,this.scope.profile,head,result));}
 async checkout(id:string,revisionId:string,expected?:string){const p=await this.get(id);if(expected!==undefined&&p.headId!==expected)throw Error('This scene changed elsewhere. Open its latest version.');const r=await this.revision(revisionId,id),row=await this.row(P,id);if((row?.value as CreationEntry).headId!==p.headId)throw Error('This scene changed elsewhere.');const next={...p,headId:r.id,title:r.scene.title,updatedAt:new Date().toISOString()};await this.records.commit({id:crypto.randomUUID(),scope:this.scope,changes:[{collection:P,id,value:next,expectedVersion:row!.version}]},{enqueue:false});return next;}
 remove(id:string){return this.edit(id,s=>s.remove(id,this.scope.profile));}
 async snapshot(){await this.ready();const data=fresh();data.projects=await this.list();for(const p of data.projects){data.revisions.push(...await this.history(p.id));const d=await this.draft(p.id);if(d)data.drafts.push(d);data.attempts.push(...await this.attempts(p.id));}data.rewardOutbox=await this.pendingRewards();return validateCreationWorkspace(data);}
 private owned(input:unknown){const data=validateCreationWorkspace(input),projects=data.projects.filter(p=>p.owner===this.scope.profile),ids=new Set(projects.map(p=>p.id));return {...data,projects,revisions:data.revisions.filter(r=>ids.has(r.projectId)),drafts:data.drafts.filter(d=>ids.has(d.projectId)),attempts:data.attempts.filter(a=>ids.has(a.projectId)),rewardOutbox:(data.rewardOutbox??[]).filter(f=>f.owner===this.scope.profile)};}
 private async plan(input:CreationWorkspace){const entries:{collection:string;id:string;value:unknown;immutable?:boolean}[]=[],seen=new Set<string>();const add=(collection:string,id:string,value:unknown,immutable=false)=>{const key=collection+':'+id;if(!seen.has(key)){seen.add(key);entries.push({collection,id,value,immutable});}};
  const sceneRef=async(scene:CreationProject)=>{const id=await hash(JSON.stringify(scene));add(S,id,scene,true);return id;};
  for(const p of input.projects)add(P,p.id,p);
  for(const r of input.revisions){const {scene,...rest}=r;add(R,r.id,{...rest,sceneHash:await sceneRef(scene)},true);add(history(r.projectId),chronological(r.createdAt,r.id),{id:r.id},true);}
  for(const d of input.drafts){const {scene,...rest}=d;add(D,d.projectId,{...rest,sceneHash:await sceneRef(scene)});}
  for(const a of input.attempts){add(A,a.id,a,true);add(attempts(a.projectId),a.id,{id:a.id},true);add('creation-recent',recentKey(a.checkedAt,a.id),{id:a.id,projectId:a.projectId},true);}
  for(const fact of input.rewardOutbox??[])add(Q,await hash(rewardFactId(fact)),fact);
  return entries;
 }
 async restoreSnapshot(input:unknown,operation:string){await this.ready();const data=this.owned(input),changes:RecordChange[]=[];for(const item of await this.plan(data)){const row=await this.row(item.collection,item.id);if(row&&item.immutable&&!same(row.value,item.value))throw Error('This copy contains a different scene under a retained version identity. Original scenes are safe.');if(!row||row.deleted||!same(row.value,item.value))changes.push({...item,expectedVersion:row?.version??0});}
  // Omitted scenes and immutable versions remain available. Restored drafts
  // replace only reviewed matching draft IDs, never unrelated work.
  if(changes.length){const row=await this.row(C,'counts'),current=await this.snapshot(),merge=<T>(a:T[],b:T[],key:(v:T)=>string)=>[...new Map([...a,...b].map(v=>[key(v),v])).values()];const merged=validateCreationWorkspace({schema:current.schema,projects:merge(current.projects,data.projects,p=>p.id),revisions:merge(current.revisions,data.revisions,r=>r.id),drafts:merge(current.drafts,data.drafts,d=>d.projectId),attempts:merge(current.attempts,data.attempts,a=>a.id),rewardOutbox:merge(current.rewardOutbox??[],data.rewardOutbox??[],rewardFactId)}),counts:Counts={projects:merged.projects.length,revisions:merged.revisions.length,drafts:merged.drafts.length,attempts:merged.attempts.length,characters:JSON.stringify(merged).length};changes.push({collection:C,id:'counts',value:counts,expectedVersion:row?.version??0});await this.records.restoreLocal({id:operation,scope:this.scope,changes});}
 }
 async migrateLegacy(raw:string,options:{onBatch?:(progress:number)=>void|Promise<void>;beforeActivate?:()=>void}={}){
  const sourceHash=await hash(raw),existing=await this.row(C,'migration'),state=existing?.value as any;if(state?.complete)return state;if(state&&state.sourceHash!==sourceHash)throw Error('The original scenes changed during preparation. Their original source remains active.');
  const data=this.owned(JSON.parse(raw));for(const p of data.projects){if(p.challengeId&&data.attempts.some(a=>a.projectId===p.id&&a.hintUsed))p.hintUsed=true;p.updatedAt=[p.updatedAt,...data.drafts.filter(d=>d.projectId===p.id).map(d=>d.updatedAt),...data.attempts.filter(a=>a.projectId===p.id).map(a=>a.checkedAt)].sort().at(-1)!;}
  const plan=await this.plan(data);let progress=state?.progress??0;
  for(;progress<plan.length;){const changes:RecordChange[]=[];for(const item of plan.slice(progress,progress+40)){const row=await this.row(item.collection,item.id);if(row&&!same(row.value,item.value))throw Error('Prepared scene data conflicts with its retained original.');if(!row)changes.push({...item,expectedVersion:0});}progress=Math.min(progress+40,plan.length);const row=await this.row(C,'migration');changes.push({collection:C,id:'migration',value:{sourceHash,progress,complete:false},expectedVersion:row?.version??0});await this.records.commit({id:crypto.randomUUID(),scope:this.scope,changes},{enqueue:false});await options.onBatch?.(progress);}
  for(const item of plan){const row=await this.row(item.collection,item.id);if(!row||row.deleted||!same(row.value,item.value))throw Error('Scene preparation verification failed. Original scenes remain active.');}
  options.beforeActivate?.();const row=await this.row(C,'migration'),counts=await this.row(C,'counts'),result={sourceHash,progress,complete:true};await this.records.commit({id:crypto.randomUUID(),scope:this.scope,changes:[{collection:C,id:'migration',value:result,expectedVersion:row?.version??0},{collection:C,id:'counts',value:{projects:data.projects.length,revisions:data.revisions.length,drafts:data.drafts.length,attempts:data.attempts.length,characters:JSON.stringify(data).length},expectedVersion:counts?.version??0}]},{enqueue:false});return result;
 }
}
