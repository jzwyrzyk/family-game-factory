import {IndexedRecords} from './indexed-records';
import {recordId,type DurableRecord,type RecordChange,type RecordScope} from './record-contract';
import {StudioNotebook,STUDIO_KEY,NOTEBOOK_CAPACITY,validateNotebook,type Notebook,type StudioSession,type ConversationChapter} from '../studio/notebook';
import {publishSourceEvidence,type SourceEvidenceSignal} from '../problem-solving/signals';
import {builderJourney,gemStage,type BuilderJourney,type GemStage} from '../brand/gem-progress';
import {hasMeaningfulCreation,recommendNext,readyGuidedExperiment,freshGuidance,type NextRecommendation,type GuidePreferences} from '../studio/guidance';
import {deriveStudioNotifications,freshStudioNotificationPreferences,type StudioNotification,type StudioNotificationContext,type StudioNotificationPreferences} from '../studio/notifications';

const CONTROL='notebook-control',CHUNKS='notebook-chunks',PAYLOADS='notebook-payloads';
const CHUNK_UNITS=24_000,MAX_PAYLOAD_BYTES=8*1024*1024;
const hash=async(raw:string)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw)))].map(x=>x.toString(16).padStart(2,'0')).join('');
const sha=(x:unknown):x is string=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const sessionCollection=(generation:string)=>'notebook-sessions:'+generation;
const chapterCollection=(generation:string)=>'notebook-chapters:'+generation;
const canonical=(value:any):string|undefined=>value===undefined?undefined:value===null?'null':Array.isArray(value)?'['+value.map(canonical).join(',')+']':typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}':JSON.stringify(value);
const equal=(a:unknown,b:unknown)=>canonical(a)===canonical(b);
type Meta=Omit<Notebook,'sessions'|'conversationChapters'>;
interface Head {schema:1;generation:string;meta:string;summary:string;sessions:string[];chapters:string[];hasChapters:boolean;sourceHash:string}
interface Migration {schema:1;sourceHash:string;generation:string;completed:number;total:number;complete:boolean}
interface Payload {schema:1;sha256:string;bytes:number;units:number;chunks:string[]}
export interface NotebookCard {id:string;owner:string;name:string;game:StudioSession['game'];projectId:string|null;remoteId:string|null;updated:string;archived:boolean;playOnly:boolean;resumeDismissed:boolean;hasDraft:boolean;messageCount:number;pendingCopy:boolean;pendingSubmission:boolean;jobStatus:string|null;gemStage:GemStage;meaningfulCreation:boolean;hasCandidate:boolean;experimentCount:number;readyExperiment:boolean;needsReadyRecovery:boolean;jobApi:string|null}
export interface NotebookSummary {
 owner:string;active:string|null;journey:BuilderJourney;meaningfulCreation:boolean;recommendation:NextRecommendation|null;continuationCandidates:NextRecommendation[];
 capacity:ReturnType<StudioNotebook['capacity']>;guidance:GuidePreferences;avatar:ReturnType<StudioNotebook['avatar']>;notificationPreferences:StudioNotificationPreferences;
 /** Eight small presentation variants per session cover transient connection
  * observations without storing duplicate conversation, design or job payloads.
  * Bits: unknown=1, unconfirmed=2, sending=4. These never authorize an action. */
 notificationVariants:{id:string;items:(StudioNotification|null)[]}[];
}
export interface PreparedNotebookTransaction<T>{
 changes:RecordChange[];value:T;
 /** Call once, only after the caller's shared-scope transaction commits. */
 publish:()=>void;
}
interface Pointer {id:string;owner:string;payload:string;card?:NotebookCard}
export const notebookCard=(s:StudioSession,expanded:StudioSession=s):NotebookCard=>({id:s.id,owner:s.owner,name:s.name,game:s.game,projectId:s.projectId,remoteId:s.remoteId,updated:s.updated,archived:!!s.archived,playOnly:!!s.playOnly,resumeDismissed:!!s.resumeDismissed,hasDraft:!!s.draft,messageCount:s.messages.length,pendingCopy:!!s.pendingCopy,pendingSubmission:!!s.pendingSubmission,jobStatus:s.job?.status??null,gemStage:gemStage(s),meaningfulCreation:hasMeaningfulCreation([expanded],s.owner),hasCandidate:!!s.candidate,experimentCount:s.experiments?.length??0,readyExperiment:!!readyGuidedExperiment(s),needsReadyRecovery:s.job?.status==='ready'&&!!s.job.revisionId&&(!!s.pendingExperiment||!s.experiments?.some(e=>e.candidate.remoteId===s.job!.revisionId)),jobApi:s.job?.api??null});

/** Read-only view over an already validated source; pure projections do not
 * need to serialize/reparse or clone every original word to inspect it. */
export function notebookReadView(value:Notebook,session:StudioSession):StudioSession {
 const earlier:ConversationChapter[]=[],seen=new Set<string>();let id:string|null|undefined=session.previousConversationId;
 while(id){if(seen.has(id))throw Error('NOTEBOOK_CHAPTER_CHAIN_INVALID');seen.add(id);const chapter=value.conversationChapters?.find(c=>c.id===id&&c.owner===session.owner);if(!chapter)throw Error('NOTEBOOK_CHAPTER_CHAIN_INVALID');earlier.push(chapter);id=chapter.previousId;}
 return earlier.length?{...session,messages:[...earlier.reverse().flatMap(c=>c.messages),...session.messages]}:session;
}
/** Derivation runs at commit time against a validated source, using the existing
 * pure presentation rules. No mutation or defensive whole-history copy occurs. */
export function deriveNotebookSummary(value:Notebook,owner:string):NotebookSummary {
 const expanded=value.sessions.filter(s=>s.owner===owner).map(s=>notebookReadView(value,s)).sort((a,b)=>b.updated.localeCompare(a.updated)),preferences=value.notifications?.[owner]??freshStudioNotificationPreferences(),chapters=value.conversationChapters?.length??0;
 const continuationCandidates:NextRecommendation[]=[];let available=expanded;
 for(let next=recommendNext(available,owner,value.active[owner]);next;next=recommendNext(available,owner,value.active[owner])){continuationCandidates.push(next);available=available.filter(s=>s.id!==next!.sessionId);}
  const summary:NotebookSummary={owner,active:value.active[owner]??null,journey:builderJourney(expanded,owner),meaningfulCreation:hasMeaningfulCreation(expanded,owner),recommendation:continuationCandidates[0]??null,continuationCandidates,capacity:{limit:NOTEBOOK_CAPACITY,retained:value.sessions.length+chapters,active:value.sessions.filter(s=>!s.archived).length,archived:value.sessions.filter(s=>s.archived).length,chapters,available:NOTEBOOK_CAPACITY-value.sessions.length-chapters},guidance:value.guidance?.[owner]??freshGuidance(),avatar:value.avatars?.[owner]??null,notificationPreferences:preferences,notificationVariants:expanded.map(session=>({id:session.id,items:Array.from({length:8},(_,mask)=>deriveStudioNotifications([session],owner,{unknownSessionIds:new Set(mask&1?[session.id]:[]),unconfirmedSessionIds:new Set(mask&2?[session.id]:[]),sendingSessionIds:new Set(mask&4?[session.id]:[])},preferences)[0]??null)}))};
 return summary;
}

/** Actual async notebook authority. Immutable payloads are prepared first; one
 * CAS transaction publishes changed pointers, metadata and the head together.
 * No local-only mutation enters the remote outbox. Activation is the caller's
 * explicit storage-preview decision, never a persisted permission grant. */
export class IndexedNotebook {
 private constructor(readonly records:IndexedRecords,readonly scope:RecordScope,private authorized:()=>void,private rewardSaved?:(owner:string)=>void){}
 static async open(scope:RecordScope,authorized:()=>void,rewardSaved?:(owner:string)=>void){return new IndexedNotebook(await IndexedRecords.open(scope,authorized),{...scope},authorized,rewardSaved);}
 close(){this.records.close();}
 private async row(collection:string,id:string){this.authorized();return this.records.get(collection,id);}
 private change(collection:string,id:string,value:unknown,expectedVersion=0,deleted=false):RecordChange{return {collection,id,value,expectedVersion,deleted};}
 private async save(changes:RecordChange[],operation:string=crypto.randomUUID()){this.authorized();return this.records.commit({id:operation,scope:this.scope,changes},{enqueue:false});}
 private checkOwner(owner=this.scope.profile){this.authorized();if(owner!==this.scope.profile)throw Error('NOTEBOOK_SCOPE_DENIED');}
 private own(input:Notebook,filter=false):Notebook {
  const source=validateNotebook(input),owner=this.scope.profile;
  if(!filter){
   if(source.sessions.some(s=>s.owner!==owner)||source.conversationChapters?.some(c=>c.owner!==owner)||source.rewardOutbox?.some(f=>f.owner!==owner)||['active','avatars','guidance','notifications'].some(k=>Object.keys((source as any)[k]??{}).some(id=>id!==owner)))throw Error('NOTEBOOK_SCOPE_DENIED');
   return source;
  }
  const next:Notebook={version:1,sessions:source.sessions.filter(s=>s.owner===owner),active:{}};
  for(const field of ['active','avatars','guidance','notifications'] as const)if(source[field]!==undefined)(next as any)[field]=Object.fromEntries(Object.entries(source[field]!).filter(([id])=>id===owner));
  if(source.conversationChapters!==undefined)next.conversationChapters=source.conversationChapters.filter(c=>c.owner===owner);
  if(source.rewardOutbox!==undefined)next.rewardOutbox=source.rewardOutbox.filter(f=>f.owner===owner);
  return validateNotebook(next);
 }
 private checkHead(row:DurableRecord):Head {
  const h=row.value as Head;
  if(row.deleted||!h||h.schema!==1||!recordId(h.generation)||!sha(h.meta)||!sha(h.summary)||!sha(h.sourceHash)||!Array.isArray(h.sessions)||!Array.isArray(h.chapters)||h.sessions.length+h.chapters.length>80||typeof h.hasChapters!=='boolean'||new Set(h.sessions).size!==h.sessions.length||new Set(h.chapters).size!==h.chapters.length||[...h.sessions,...h.chapters].some(id=>typeof id!=='string'||!/^[\w:-]{1,160}$/.test(id)))throw Error('NOTEBOOK_HEAD_INVALID');
  return h;
 }
 private async head(){const row=await this.row(CONTROL,'head');if(!row)throw Error('Finish preparing this notebook before opening it.');return {row,value:this.checkHead(row)};}
 private async unchanged(version:number){const latest=await this.row(CONTROL,'head');if(latest?.version!==version)throw Error('STORAGE_CONFLICT');}
 async version(){return (await this.head()).row.version;}
 async isActive(){const row=await this.row(CONTROL,'head');if(!row)return false;this.checkHead(row);return true;}
 async migration():Promise<Migration|null>{return (await this.row(CONTROL,'migration'))?.value as Migration??null;}

 private async immutable(collection:string,id:string,value:unknown){
  const previous=await this.row(collection,id);
  if(previous){if(previous.deleted||!equal(previous.value,value))throw Error('NOTEBOOK_IMMUTABLE_CORRUPTION');return;}
  // Stable identities make a simultaneous identical preparation safe to retry.
  await this.save([this.change(collection,id,value)],'notebook-immutable:'+await hash(collection+':'+id));
 }
 private async encode(value:unknown):Promise<string>{
  const raw=JSON.stringify(value),bytes=new TextEncoder().encode(raw).length;
  if(bytes>MAX_PAYLOAD_BYTES)throw Error('This notebook record is too large. The original remains unchanged.');
  const id=await hash(raw),existing=await this.row(PAYLOADS,id);
  if(existing){if(!equal(await this.decode(id),value))throw Error('NOTEBOOK_IMMUTABLE_CORRUPTION');return id;}
  const chunks:string[]=[];
  for(let i=0;i<raw.length;i+=CHUNK_UNITS){const text=raw.slice(i,i+CHUNK_UNITS),key=await hash(text);await this.immutable(CHUNKS,key,text);chunks.push(key);}
  await this.immutable(PAYLOADS,id,{schema:1,sha256:id,bytes,units:raw.length,chunks} satisfies Payload);return id;
 }
 private async decode<T>(id:string):Promise<T>{
  if(!sha(id))throw Error('NOTEBOOK_PAYLOAD_INVALID');const row=await this.row(PAYLOADS,id),p=row?.value as Payload;
  if(!row||row.deleted||!p||p.schema!==1||p.sha256!==id||!Number.isInteger(p.bytes)||p.bytes<1||p.bytes>MAX_PAYLOAD_BYTES||!Number.isInteger(p.units)||p.units<1||p.units>MAX_PAYLOAD_BYTES||!Array.isArray(p.chunks)||p.chunks.length!==Math.ceil(p.units/CHUNK_UNITS))throw Error('A saved notebook record is missing or damaged.');
  let raw='';for(const key of p.chunks){if(!sha(key))throw Error('NOTEBOOK_CHUNK_INVALID');const part=await this.row(CHUNKS,key);if(!part||part.deleted||typeof part.value!=='string'||part.value.length>CHUNK_UNITS||await hash(part.value)!==key)throw Error('An original notebook page is missing or damaged.');raw+=part.value;}
  if(raw.length!==p.units||new TextEncoder().encode(raw).length!==p.bytes||await hash(raw)!==id)throw Error('NOTEBOOK_CHECKSUM_MISMATCH');return JSON.parse(raw);
 }
 private async pointer<T extends {id:string;owner:string}>(collection:string,id:string):Promise<T>{
  const row=await this.row(collection,await hash(id)),pointer=row?.value as Pointer;
  if(!row||row.deleted||!pointer||pointer.id!==id||pointer.owner!==this.scope.profile||!sha(pointer.payload))throw Error('Choose a saved notebook page in your own profile.');
  const value=await this.decode<T>(pointer.payload);if(value.id!==id||value.owner!==this.scope.profile)throw Error('NOTEBOOK_SCOPE_DENIED');return value;
 }
 /** Card pages never fetch conversation/design chunks. The stable cursor is
  * a storage key; UI can display updated timestamps without loading history. */
 async page(after:string|null=null,limit=24):Promise<{items:NotebookCard[];next:string|null}>{
  this.checkOwner();if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('STORAGE_PAGE_INVALID');const head=await this.head(),rows=await this.records.page(sessionCollection(head.value.generation),after,limit),items:NotebookCard[]=[];
  for(const row of rows){if(row.deleted)continue;const p=row.value as Pointer;if(!p||p.owner!==this.scope.profile||!p.card||p.card.id!==p.id||p.card.owner!==p.owner||!head.value.sessions.includes(p.id))throw Error('NOTEBOOK_INDEX_INVALID');items.push(structuredClone(p.card));}
  await this.unchanged(head.row.version);return {items,next:rows.length===limit?rows.at(-1)!.id:null};
 }
 /** Only the selected session and its explicitly linked earlier pages load. */
 async get(id:string,owner=this.scope.profile):Promise<StudioSession>{
  this.checkOwner(owner);const head=await this.head();if(!head.value.sessions.includes(id))throw Error('Choose a game in your own profile.');
  const session=await this.pointer<StudioSession>(sessionCollection(head.value.generation),id),chapters:ConversationChapter[]=[],seen=new Set<string>();let previous=session.previousConversationId;
  while(previous){if(seen.has(previous)||!head.value.chapters.includes(previous)||seen.size>=80)throw Error('NOTEBOOK_CHAPTER_CHAIN_INVALID');seen.add(previous);const chapter=await this.pointer<ConversationChapter>(chapterCollection(head.value.generation),previous);chapters.push(chapter);previous=chapter.previousId??undefined;}
  const notebook=validateNotebook({version:1,sessions:[session],active:{},...(chapters.length?{conversationChapters:chapters}:{})});
  await this.unchanged(head.row.version);return {...notebook.sessions[0],messages:[...chapters.reverse().flatMap(c=>c.messages),...session.messages]};
 }
 async metadata():Promise<Meta>{const head=await this.head(),meta=await this.decode<Meta>(head.value.meta);this.checkOwner();await this.unchanged(head.row.version);return meta;}
 /** Precomputed from the exact committed notebook. Startup never opens the
  * sessions behind these bounded presentation fields. */
 async summary():Promise<NotebookSummary>{const h=await this.head(),summary=await this.decode<NotebookSummary>(h.value.summary);this.checkOwner(summary.owner);await this.unchanged(h.row.version);return summary;}
 async notifications(context:StudioNotificationContext={}):Promise<StudioNotification[]>{
  const summary=await this.summary(),items:StudioNotification[]=[];
  for(const row of summary.notificationVariants){const mask=(context.unknownSessionIds?.has(row.id)?1:0)|(context.unconfirmedSessionIds?.has(row.id)?2:0)|(context.sendingSessionIds?.has(row.id)?4:0),item=row.items[mask];if(item)items.push(item);}
  return items.sort((a,b)=>a.priority-b.priority||a.sessionId.localeCompare(b.sessionId));
 }
 async pendingRewards(owner=this.scope.profile){this.checkOwner(owner);return (await this.metadata()).rewardOutbox??[];}
 async acknowledgeRewards(owner:string,ids:string[]){this.checkOwner(owner);return this.transaction(book=>book.acknowledgeRewards(owner,ids));}
 async last(owner=this.scope.profile){this.checkOwner(owner);const meta=await this.metadata(),id=meta.active[owner];if(!id)return null;const session=await this.get(id,owner);return session.archived||session.resumeDismissed?null:session;}
 private async snapshotAt(h:Head):Promise<Notebook>{
  const meta=await this.decode<Meta>(h.meta),sessions:StudioSession[]=[],chapters:ConversationChapter[]=[];
  for(const id of h.sessions)sessions.push(await this.pointer<StudioSession>(sessionCollection(h.generation),id));
  for(const id of h.chapters)chapters.push(await this.pointer<ConversationChapter>(chapterCollection(h.generation),id));
  return this.own({...meta,sessions,...(h.hasChapters?{conversationChapters:chapters}:{})});
 }
 /** Full reads are explicit backup/write operations, never card/open reads.
  * A concurrent save or reward acknowledgement can advance the head while
  * immutable payloads are being read. Retry only this read, with a strict bound;
  * malformed/missing data and authorization errors still fail immediately. */
 async snapshot():Promise<Notebook>{
  for(let attempt=0;;attempt++){
   try{const h=await this.head(),value=await this.snapshotAt(h.value);await this.unchanged(h.row.version);return value;}
   catch(error){if(attempt>=2||!(error instanceof Error)||error.message!=='STORAGE_CONFLICT')throw error;}
  }
 }
 private async prepareHead(value:Notebook,generation:string,sourceHash:string):Promise<Head>{
  const {sessions,conversationChapters,...meta}=value;
  return {schema:1,generation,meta:await this.encode(meta),summary:await this.encode(deriveNotebookSummary(value,this.scope.profile)),sessions:sessions.map(s=>s.id),chapters:(conversationChapters??[]).map(c=>c.id),hasChapters:conversationChapters!==undefined,sourceHash};
 }
 private async preparePointer(value:StudioSession|ConversationChapter,notebook:Notebook):Promise<Pointer>{
  return {id:value.id,owner:value.owner,payload:await this.encode(value),...('game'in value?{card:notebookCard(value,notebookReadView(notebook,value))}:{})};
 }
 private async stageGeneration(value:Notebook,generation:string,sourceHash:string){
  for(const [collection,rows]of [[sessionCollection(generation),value.sessions],[chapterCollection(generation),value.conversationChapters??[]]] as const)for(const row of rows)await this.immutable(collection,await hash(row.id),await this.preparePointer(row,value));
  const head=await this.prepareHead(value,generation,sourceHash);if(!equal(await this.snapshotAt(head),value))throw Error('NOTEBOOK_RESTORE_READBACK_FAILED');return head;
 }
 /** Reuses the existing source business logic. The callback is synchronous;
  * rewards and evidence publish only after the durable IDB commit succeeds.
  * Write CPU still validates the bounded owner notebook; only changed records
  * are written. No fire-and-forget mirror or early saved acknowledgment exists. */
 async prepareTransaction<T>(mutate:(book:StudioNotebook)=>T):Promise<PreparedNotebookTransaction<T>>{
  this.checkOwner();const h=await this.head(),before=await this.snapshotAt(h.value);await this.unchanged(h.row.version);
  let raw=JSON.stringify(before);const rewards=new Set<string>(),signals:SourceEvidenceSignal[]=[];
  const book=new StudioNotebook({getItem:key=>key===STUDIO_KEY?raw:null,setItem:(key,value)=>{if(key!==STUDIO_KEY)throw Error('NOTEBOOK_KEY_DENIED');raw=value;}},owner=>rewards.add(owner),signal=>signals.push(structuredClone(signal)));
  const result=mutate(book);if(result&&typeof(result as any).then==='function')throw Error('Notebook mutations must finish before saving.');const next=this.own(book.read());
  if(equal(before,next))return {changes:[],value:structuredClone(result),publish:()=>{}};
  const changes:RecordChange[]=[];
  for(const [kind,oldRows,newRows]of [['sessions',before.sessions,next.sessions],['chapters',before.conversationChapters??[],next.conversationChapters??[]]] as const){
   const collection=kind==='sessions'?sessionCollection(h.value.generation):chapterCollection(h.value.generation),old=new Map(oldRows.map(x=>[x.id,x])),current=new Map(newRows.map(x=>[x.id,x]));
   for(const [id,value]of current){if(equal(value,old.get(id)))continue;const key=await hash(id),row=await this.row(collection,key);changes.push(this.change(collection,key,await this.preparePointer(value,next),row?.version??0));}
   for(const [id]of old)if(!current.has(id)){const key=await hash(id),row=await this.row(collection,key);if(!row)throw Error('NOTEBOOK_RECORD_MISSING');changes.push(this.change(collection,key,row.value,row.version,true));}
  }
  let nextHead:Head;
  if(changes.length>49){nextHead=await this.stageGeneration(next,'replace-'+crypto.randomUUID(),h.value.sourceHash);changes.length=0;}
  else nextHead=await this.prepareHead(next,h.value.generation,h.value.sourceHash);
  changes.push(this.change(CONTROL,'head',nextHead,h.row.version));
  let published=false;
  return {changes,value:structuredClone(result),publish:()=>{if(published)return;published=true;for(const owner of rewards){try{this.rewardSaved?.(owner);}catch{}}for(const signal of signals)publishSourceEvidence(signal);}};
 }
 async transaction<T>(mutate:(book:StudioNotebook)=>T):Promise<T>{const prepared=await this.prepareTransaction(mutate);if(prepared.changes.length)await this.save(prepared.changes);prepared.publish();return prepared.value;}
 async update(id:string,mutate:(session:StudioSession)=>void){return this.transaction(book=>book.update(id,this.scope.profile,mutate));}
 async create(game:StudioSession['game'],name:string,projectId:string|null=null){return this.transaction(book=>book.create(this.scope.profile,game,name,projectId));}
 async message(id:string,role:StudioSession['messages'][number]['role'],text:string){return this.transaction(book=>book.message(id,this.scope.profile,role,text));}

 async migrateLegacy(raw:string,options:{batchSize?:number;onBatch?:(completed:number,total:number)=>void;beforeActivate?:()=>void}={}):Promise<Migration>{
  this.checkOwner();const value=this.own(JSON.parse(raw),true),sourceHash=await hash(raw),priorRow=await this.row(CONTROL,'migration'),prior=priorRow?.value as Migration|undefined;
  if(prior&&(prior.schema!==1||!Number.isInteger(prior.completed)||prior.completed<0||prior.completed>prior.total||typeof prior.complete!=='boolean'||prior.generation!==sourceHash))throw Error('NOTEBOOK_MIGRATION_INVALID');
  if(prior&&prior.sourceHash!==sourceHash)throw Error('The source notebook changed. Keep the original and review migration again.');if(prior?.complete)return prior;
  if(await this.isActive())throw Error('An active notebook cannot be replaced by migration.');
  const batchSize=options.batchSize??20;if(!Number.isInteger(batchSize)||batchSize<1||batchSize>40)throw Error('STORAGE_PAGE_INVALID');
  let manifest:Migration=prior??{schema:1,sourceHash,generation:sourceHash,completed:0,total:value.sessions.length+(value.conversationChapters?.length??0),complete:false},version=priorRow?.version??0;
  const entries=[...value.sessions.map(s=>({collection:sessionCollection(manifest.generation),value:s})),...(value.conversationChapters??[]).map(c=>({collection:chapterCollection(manifest.generation),value:c}))];
  for(let i=manifest.completed;i<entries.length;i+=batchSize){const batch=entries.slice(i,i+batchSize),changes:RecordChange[]=[];for(const entry of batch)changes.push(this.change(entry.collection,await hash(entry.value.id),await this.preparePointer(entry.value,value)));manifest={...manifest,completed:i+batch.length};changes.push(this.change(CONTROL,'migration',manifest,version++));await this.save(changes,'notebook-migrate:'+sourceHash+':'+i);options.onBatch?.(manifest.completed,manifest.total);}
  const head=await this.prepareHead(value,manifest.generation,sourceHash),readback=await this.snapshotAt(head);if(!equal(readback,value))throw Error('NOTEBOOK_MIGRATION_READBACK_FAILED');manifest={...manifest,complete:true};
  options.beforeActivate?.();this.checkOwner();await this.save([this.change(CONTROL,'head',head),this.change(CONTROL,'migration',manifest,version)],'notebook-migrate:'+sourceHash+':complete');return manifest;
 }
 /** Explicit whole-owner replacement stages a fresh generation; only the head
  * switches atomically. Prior generations/original source remain recoverable. */
 async restore(snapshot:Notebook,operationId:string=crypto.randomUUID()):Promise<'restored'|'already-restored'>{
  this.checkOwner();const value=this.own(snapshot),sourceHash=await hash(JSON.stringify(value)),identity=await hash(operationId),receipt=await this.row('notebook-restores',identity);
  if(receipt){if((receipt.value as any).sourceHash!==sourceHash)throw Error('STORAGE_OPERATION_REUSED');return 'already-restored';}
  const h=await this.head(),generation='restore-'+identity;
  const next=await this.stageGeneration(value,generation,h.value.sourceHash);
  await this.save([this.change(CONTROL,'head',next,h.row.version),this.change('notebook-restores',identity,{sourceHash,previousGeneration:h.value.generation})],'notebook-restore:'+identity);return 'restored';
 }
}
