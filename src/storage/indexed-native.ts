import {IndexedRecords} from './indexed-records';
import type {RecordScope,RecordChange,DurableRecord} from './record-contract';
import {validateWorkspace,type Project,type Revision,type PlayRecord,type Workspace} from '../factory/workspace';
import {defaults,validateConfig,isGameId} from '../runtime/manifests';
import type {GameId,Mechanics,PlayOutcome} from '../runtime/types';

const PROJECTS='native-projects',REVISIONS='native-revisions',CONFIGS='native-configs',PLAYS='native-plays',CONTROL='native-control';
const copy=<T>(value:T):T=>structuredClone(value);
const canonical=(value:any):string=>value===null?'null':Array.isArray(value)?'['+value.map(canonical).join(',')+']':typeof value==='object'?'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}':JSON.stringify(value);
const digest=async(value:string)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(n=>n.toString(16).padStart(2,'0')).join('');
const key=(id:string)=>'native-history:'+id;
const historyId=(r:Revision)=>String(Date.parse(r.createdAt)).padStart(16,'0')+':'+r.id;
type StoredRevision=Omit<Revision,'config'>&{configHash:string};
type Migration={schema:1;sourceHash:string;progress:number;total:number;complete:boolean;projects:number;revisions:number;plays:number};

/** An async authoritative native-game domain. It is selected only after an
 * explicit, verified migration. Legacy originals remain untouched for recovery.
 * All writes are local-only; remote sync needs a separate approved scope. */
export class IndexedNativeStore {
 private privateCopies=new Map<string,()=>boolean>();
 private constructor(readonly records:IndexedRecords,readonly scope:RecordScope,private assertAuthorized:()=>void){}
 static async open(scope:RecordScope,assertAuthorized:()=>void){return new IndexedNativeStore(await IndexedRecords.open(scope,assertAuthorized),{...scope},assertAuthorized);}
 close(){this.records.close();}
 private async row(collection:string,id:string){this.assertAuthorized();return this.records.get(collection,id);}
 private change(collection:string,id:string,value:unknown,expectedVersion=0):RecordChange{return {collection,id,value,expectedVersion};}
 private async save(changes:RecordChange[],operation:string=crypto.randomUUID()){
  this.assertAuthorized();const projects=changes.filter(c=>c.collection===PROJECTS);const enqueue=projects.length>0&&projects.every(c=>this.privateCopies.get(c.id)?.()===true);return this.records.commit({id:operation,scope:this.scope,changes},{enqueue});
 }
 async migration():Promise<Migration|null>{return (await this.row(CONTROL,'migration'))?.value as Migration|null??null;}
 async isActive(){return (await this.migration())?.complete===true;}
 private async ready(){this.assertAuthorized();if(!await this.isActive())throw Error('Finish preparing saved games before opening this library.');}
 async page(after:string|null=null,limit=24):Promise<{items:Project[];next:string|null}>{
  await this.ready();const rows=await this.records.page(PROJECTS,after,limit+1),items=rows.slice(0,limit).map(r=>this.decodeProject(r));return {items,next:rows.length>limit?items.at(-1)!.id:null};
 }
 private decodeProject(row:DurableRecord):Project{
  const p=row.value as Project;if(row.deleted||!p||p.id!==row.id||p.owner!==this.scope.profile||!isGameId(p.game)||typeof p.name!=='string'||typeof p.headId!=='string')throw Error('Saved game metadata needs recovery.');return copy(p);
 }
 async project(id:string):Promise<Project>{await this.ready();const row=await this.row(PROJECTS,id);if(!row)throw Error('Choose a game in your own profile.');return this.decodeProject(row);}
 private async decodeRevision(row:DurableRecord,project:Project):Promise<Revision>{
  const r=row.value as StoredRevision;if(row.deleted||!r||r.id!==row.id||r.projectId!==project.id||r.state!=='private'||typeof r.configHash!=='string'||!Number.isFinite(Date.parse(r.createdAt)))throw Error('Saved version needs recovery.');
  const config=await this.row(CONFIGS,r.configHash);if(!config||config.deleted||await digest(JSON.stringify(config.value))!==r.configHash)throw Error('The saved game settings are missing or damaged. Your earlier versions are preserved.');
  const {configHash,...revision}=r;return {...copy(revision),config:validateConfig(project.game,config.value)};
 }
 async revision(projectId:string,id?:string):Promise<Revision>{const project=await this.project(projectId),row=await this.row(REVISIONS,id??project.headId);if(!row)throw Error('This saved version is unavailable.');return this.decodeRevision(row,project);}
 async projectForRevision(id:string):Promise<Project|null>{await this.ready();const revision=await this.row(REVISIONS,id);return revision?this.project((revision.value as StoredRevision).projectId):null;}
 async history(projectId:string,after:string|null=null,limit=24):Promise<{items:Revision[];next:string|null}>{
  const project=await this.project(projectId),rows=await this.records.page(key(projectId),after,limit+1),visible=rows.slice(0,limit);
  const items:Revision[]=[];for(const row of visible){const pointer=row.value as {revisionId:string};const revision=await this.row(REVISIONS,pointer.revisionId);if(!revision)throw Error('A retained version is unavailable.');items.push(await this.decodeRevision(revision,project));}
  return {items,next:rows.length>limit?visible.at(-1)!.id:null};
 }
 private async revisionChanges(revision:Revision):Promise<RecordChange[]>{
  const configHash=await digest(JSON.stringify(revision.config)),{config,...rest}=revision;
  const changes=[this.change(REVISIONS,revision.id,{...rest,configHash}),this.change(key(revision.projectId),historyId(revision),{revisionId:revision.id})];
  const existing=await this.row(CONFIGS,configHash);
  if(existing){if(JSON.stringify(existing.value)!==JSON.stringify(config))throw Error('Saved settings failed their integrity check.');}
  else changes.push(this.change(CONFIGS,configHash,config));
  return changes;
 }
 async create(game:GameId,name:string,config:Mechanics=defaults(game),identity?:{projectId:string;revisionId:string;operation:string},drawingRigId?:string):Promise<Project>{
  await this.ready();const revisionId=identity?.revisionId??crypto.randomUUID(),projectId=identity?.projectId??crypto.randomUUID();
  const project:Project={id:projectId,owner:this.scope.profile,game,name:name.trim().slice(0,60)||'My remix',headId:revisionId};
  if(drawingRigId!==undefined&&(game!=='hill'||!/^[\w-]{1,100}$/.test(drawingRigId)))throw Error('Choose a saved drawing version.');
  const revision:Revision={id:revisionId,projectId,parentId:null,...(drawingRigId?{drawingRigId}:{}),config:validateConfig(game,config),label:'Starting game',hypothesis:'',createdAt:new Date().toISOString(),state:'private'};
  await this.save([this.change(PROJECTS,projectId,project),...await this.revisionChanges(revision)],identity?.operation);return project;
 }
 async commit(projectId:string,config:Mechanics,label:string,hypothesis='',expectedHeadId?:string,revisionId?:string):Promise<Revision>{
  await this.ready();const row=await this.row(PROJECTS,projectId);if(!row)throw Error('Choose a game in your own profile.');const project=this.decodeProject(row);
  if(expectedHeadId!==undefined&&project.headId!==expectedHeadId)throw Error('This game changed elsewhere. Compare the latest version first.');
  const prior=await this.revision(projectId),revision:Revision={id:revisionId??crypto.randomUUID(),projectId,parentId:project.headId,...(prior.drawingRigId?{drawingRigId:prior.drawingRigId}:{}),config:validateConfig(project.game,config),label:label.slice(0,300),hypothesis:hypothesis.slice(0,300),createdAt:new Date().toISOString(),state:'private'};
  await this.save([this.change(PROJECTS,projectId,{...project,headId:revision.id},row.version),...await this.revisionChanges(revision)]);return revision;
 }
 async keep(projectId:string,expectedHeadId:string){await this.pointer(projectId,expectedHeadId,expectedHeadId,true);}
 private async pointer(projectId:string,target:string,expectedHeadId?:string,keep=false){
  const row=await this.row(PROJECTS,projectId);if(!row)throw Error('Choose a game in your own profile.');const project=this.decodeProject(row);await this.revision(projectId,target);
  if(expectedHeadId!==undefined&&project.headId!==expectedHeadId)throw Error('This game changed elsewhere. Compare the latest version first.');
  await this.save([this.change(PROJECTS,projectId,{...project,headId:target,...(keep?{keptId:target}:{})},row.version)]);
 }
 async checkout(projectId:string,revisionId:string,expectedHeadId?:string){await this.pointer(projectId,revisionId,expectedHeadId);}
 async undo(projectId:string){const project=await this.project(projectId),revision=await this.revision(projectId,project.headId);if(!revision.parentId)throw Error('You are at the starting version.');await this.pointer(projectId,revision.parentId,project.headId);}
 async redo(projectId:string,childId?:string){
  const project=await this.project(projectId);let after:string|null=null,chosen:Revision|undefined;
  do{const page=await this.history(projectId,after,100);for(const revision of page.items)if(revision.parentId===project.headId&&(!childId||revision.id===childId))chosen=revision;after=page.next;}while(after);
  if(!chosen)throw Error('No later change on this branch.');await this.pointer(projectId,chosen.id,project.headId);
 }
 async reflect(playId:string,reflection:string){const row=await this.row(PLAYS,playId);if(!row)throw Error('Play not found.');const play=row.value as PlayRecord,revision=await this.row(REVISIONS,play.revisionId);if(!revision)throw Error('Saved play version is unavailable.');await this.project((revision.value as StoredRevision).projectId);await this.save([this.change(PLAYS,playId,{...play,reflection:reflection.slice(0,300)},row.version)]);}
 async fork(projectId:string,name:string,revisionId?:string,identity?:{projectId?:string;revisionId?:string;expectedHeadId?:string}):Promise<Project>{
  const sourceRow=await this.row(PROJECTS,projectId);if(!sourceRow)throw Error('Choose a game in your own profile.');const original=this.decodeProject(sourceRow);if(identity?.expectedHeadId!==undefined&&identity.expectedHeadId!==original.headId)throw Error('This game changed elsewhere. Compare the latest version first.');const source=await this.revision(projectId,revisionId??original.headId),id=identity?.projectId??crypto.randomUUID(),headId=identity?.revisionId??crypto.randomUUID();
  const project={...original,id,name:name.trim().slice(0,60)||'My new remix',headId,keptId:headId};
  const revision={...source,id:headId,projectId:id,parentId:null,sourceRevisionId:source.id,label:'Saved as a new game'};
  await this.save([this.change(PROJECTS,projectId,original,sourceRow.version),this.change(PROJECTS,id,project),...await this.revisionChanges(revision)]);return project;
 }
 async record(projectId:string,revisionId:string,outcome:PlayOutcome):Promise<PlayRecord>{
  const project=await this.project(projectId),revision=await this.revision(projectId,revisionId);
  if(outcome.game!==project.game||JSON.stringify(validateConfig(project.game,outcome.config))!==JSON.stringify(revision.config)||typeof outcome.won!=='boolean'||!Number.isInteger(outcome.level)||outcome.level<1||!Number.isFinite(outcome.durationMs)||outcome.durationMs<0)throw Error('Play evidence does not match this saved game.');
  const play:PlayRecord={id:crypto.randomUUID(),revisionId,outcome:copy(outcome),reflection:''};await this.save([this.change(PLAYS,play.id,play)]);return play;
 }
 /** Explicit full capture for backups; ordinary library/open/save paths never call it. */
 async snapshot():Promise<Workspace>{
  await this.ready();const all=async(collection:string)=>{const rows:DurableRecord[]=[];let after:string|null=null;do{const page=await this.records.page(collection,after,100);rows.push(...page);after=page.length===100?page.at(-1)!.id:null;}while(after);return rows;};
  const projects=(await all(PROJECTS)).map(r=>this.decodeProject(r)),owners=new Map(projects.map(p=>[p.id,p]));const revisions:Revision[]=[];
  for(const row of await all(REVISIONS)){const project=owners.get((row.value as StoredRevision).projectId);if(!project)throw Error('A saved version has no owning game.');revisions.push(await this.decodeRevision(row,project));}
  return {version:2,projects,revisions,plays:(await all(PLAYS)).map(r=>copy(r.value as PlayRecord))};
 }
 /** Enable future selected native writes only for the current, explicitly
  * approved session. The pump independently rechecks remote grants per request. */
 enablePrivateCopies(projectId:string,approved:()=>boolean){this.assertAuthorized();if(!approved())throw Error('Private copies need current grown-up permission.');this.privateCopies.set(projectId,approved);}
 disablePrivateCopies(){this.privateCopies.clear();}
 async projectRecords(projectId:string):Promise<DurableRecord[]>{
  await this.ready();const found=new Map<string,DurableRecord>(),seenProjects=new Set<string>();
  const add=(row:DurableRecord)=>found.set(row.collection+':'+row.id,row);
  const collect=async(id:string):Promise<void>=>{
   if(seenProjects.has(id))return;seenProjects.add(id);const projectRow=await this.row(PROJECTS,id);if(!projectRow)throw Error('An original game is unavailable.');this.decodeProject(projectRow);add(projectRow);
   let after:string|null=null;do{const page=await this.records.page(key(id),after,100);for(const pointer of page){add(pointer);const revision=await this.row(REVISIONS,(pointer.value as {revisionId:string}).revisionId);if(!revision)throw Error('A saved version is unavailable.');add(revision);const stored=revision.value as StoredRevision;
    // Original image/rig transfer has a separate authorization and integrity path.
    if(stored.drawingRigId)throw Error('Include this game’s original artwork in a complete private copy first.');
    const config=await this.row(CONFIGS,stored.configHash);if(!config||await digest(JSON.stringify(config.value))!==stored.configHash)throw Error('Saved settings need recovery.');add(config);
    if(stored.sourceRevisionId){const source=await this.row(REVISIONS,stored.sourceRevisionId);if(!source)throw Error('The copied game’s original version is unavailable.');await collect((source.value as StoredRevision).projectId);}
   }after=page.length===100?page.at(-1)!.id:null;}while(after);
  };
  await collect(projectId);return [...found.values()];
 }
 /** Queue only the game the grown-up selected, together with its immutable
  * revision ancestry. Local values remain unchanged; receipts make retries safe. */
 async queueSelectedCopy(projectId:string,approved:()=>boolean):Promise<number>{
  this.assertAuthorized();if(!approved())throw Error('Private copies need current grown-up permission.');const rows=await this.projectRecords(projectId);
  for(let i=0;i<rows.length;i+=40){if(!approved())throw Error('Private copy permission changed.');const changes=rows.slice(i,i+40).map(row=>this.change(row.collection,row.id,row.value,row.version));await this.records.commit({id:crypto.randomUUID(),scope:this.scope,changes},{enqueue:true});}
  this.enablePrivateCopies(projectId,approved);return rows.length;
 }
 /** Restore a reviewed native snapshot in one local transaction. Retained
  * revisions and unrelated projects are never removed. Pointer changes are
  * explicit; immutable-ID/content conflicts fail before any mutation. */
 async restoreSnapshot(input:Workspace,operation:string,extraChanges:RecordChange[]=[]):Promise<void>{
  await this.ready();const checked=validateWorkspace(input),projects=checked.projects.filter(p=>p.owner===this.scope.profile),ids=new Set(projects.map(p=>p.id));
  const revisions=checked.revisions.filter(r=>ids.has(r.projectId)),revisionIds=new Set(revisions.map(r=>r.id));
  if(revisions.some(r=>r.sourceRevisionId&&!revisionIds.has(r.sourceRevisionId)))throw Error('The backup has an unavailable original game.');
  const planned=new Map<string,{collection:string;id:string;value:unknown}>();
  const add=(collection:string,id:string,value:unknown)=>planned.set(collection+':'+id,{collection,id,value});
  for(const project of projects)add(PROJECTS,project.id,project);
  for(const revision of revisions){const configHash=await digest(JSON.stringify(revision.config)),{config,...rest}=revision;add(CONFIGS,configHash,config);add(REVISIONS,revision.id,{...rest,configHash});add(key(revision.projectId),historyId(revision),{revisionId:revision.id});}
  for(const play of checked.plays.filter(p=>revisionIds.has(p.revisionId)))add(PLAYS,play.id,play);
  const changes:RecordChange[]=[];
  for(const record of planned.values()){
   const prior=await this.row(record.collection,record.id);if(prior&&canonical(prior.value)===canonical(record.value))continue;
   if(prior&&(record.collection===REVISIONS||record.collection===CONFIGS||record.collection.startsWith('native-history:')))throw Error('This backup conflicts with an original saved version. Keep both copies for review.');
   changes.push(this.change(record.collection,record.id,record.value,prior?.version??0));
  }
  changes.push(...extraChanges);if(!changes.length)return;
  await this.records.restoreLocal({id:operation,scope:this.scope,changes});
 }
 /** The source hash binds every resumable batch. No live source key is deleted,
  * and the final authority marker is published only after reference readback. */
 async migrateLegacy(raw:string,options:{batchSize?:number;onBatch?:(completed:number,total:number)=>void;beforeActivate?:()=>void}={}):Promise<Migration>{
  this.assertAuthorized();const input=validateWorkspace(JSON.parse(raw)),sourceHash=await digest(raw),batchSize=options.batchSize??40;
  if(!Number.isInteger(batchSize)||batchSize<1||batchSize>40)throw Error('Invalid migration batch size.');
  const current=await this.row(CONTROL,'migration'),prior=current?.value as Migration|undefined;
  if(prior&&prior.sourceHash!==sourceHash)throw Error('Saved work changed during preparation. Keep its original and start a separately reviewed migration.');
  if(prior?.complete)return prior;
  const projects=input.projects.filter(p=>p.owner===this.scope.profile),ids=new Set(projects.map(p=>p.id)),revisions=input.revisions.filter(r=>ids.has(r.projectId)),revisionIds=new Set(revisions.map(r=>r.id)),plays=input.plays.filter(p=>revisionIds.has(p.revisionId));
  if(revisions.some(r=>r.sourceRevisionId&&!revisionIds.has(r.sourceRevisionId)))throw Error('A copied game refers to a different profile. Preserve the original and review its ownership.');
  const configs=new Map<string,Mechanics>(),changes:RecordChange[]=[];
  for(const project of projects)changes.push(this.change(PROJECTS,project.id,project));
  for(const revision of revisions){const configHash=await digest(JSON.stringify(revision.config));configs.set(configHash,revision.config);const {config,...rest}=revision;changes.push(this.change(REVISIONS,revision.id,{...rest,configHash}),this.change(key(revision.projectId),historyId(revision),{revisionId:revision.id}));}
  for(const [hash,config]of configs)changes.push(this.change(CONFIGS,hash,config));for(const play of plays)changes.push(this.change(PLAYS,play.id,play));
  let manifest:Migration=prior??{schema:1,sourceHash,progress:0,total:changes.length,complete:false,projects:projects.length,revisions:revisions.length,plays:plays.length};
  let version=current?.version??0;
  for(let i=manifest.progress;i<changes.length;i+=batchSize){const batch=changes.slice(i,i+batchSize);manifest={...manifest,progress:i+batch.length};await this.save([...batch,this.change(CONTROL,'migration',manifest,version++)],'migration:'+sourceHash+':'+i);options.onBatch?.(manifest.progress,manifest.total);}
  // Verify every immutable object and pointer before selecting the new reader.
  for(const project of projects){const row=await this.row(PROJECTS,project.id);if(!row||JSON.stringify(row.value)!==JSON.stringify(project))throw Error('Prepared game failed verification.');}
  for(const revision of revisions){const row=await this.row(REVISIONS,revision.id),project=projects.find(p=>p.id===revision.projectId)!;if(!row||canonical(await this.decodeRevision(row,project))!==canonical(revision))throw Error('Prepared version failed verification.');}
  options.beforeActivate?.();this.assertAuthorized();manifest={...manifest,complete:true};await this.save([this.change(CONTROL,'migration',manifest,version)],'migration:'+sourceHash+':complete');return manifest;
 }
}
