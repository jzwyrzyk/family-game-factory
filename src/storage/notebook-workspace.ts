import {StudioNotebook,STUDIO_KEY,NOTEBOOK_CAPACITY,CONVERSATION_PAGE_CAPACITY,NotebookCapacityError,ConversationCapacityError,type StudioSession,type Notebook} from '../studio/notebook';
import {DESIGN_IDEA_CAPACITY,DesignCapacityError} from '../studio/design';
import type {StoragePort} from '../factory/workspace';
import {IndexedNotebook,deriveNotebookSummary,notebookCard,notebookReadView,type NotebookCard,type NotebookSummary} from './indexed-notebook';
import {indexedStoragePreview,nativeScope} from './native-workspace';
import {assertRewardSourceWritable,assertRewardSourceLockHeld,setRewardSourceMaintenance} from '../rewards/write-guard';
import type {StudioNotificationContext,StudioNotification} from '../studio/notifications';
import type {RewardFact} from '../rewards/model';

/** A bounded synchronous presentation view over an async durable authority.
 * Call load before using a selected session. Card records are never passed off
 * as complete sessions. The selected and last active session plus at most eight unresolved
 * jobs are cached; the ordinary indexed open does not read the legacy blob. */
export class NotebookWorkspace {
 private cards:NotebookCard[]=[];
 private view!:NotebookSummary;
 private facts:RewardFact[]=[];
 private loaded=new Map<string,StudioSession>();
 private selected:string|null=null;
 private transitionPrevious:string|null=null;
 private selectionEpoch=0;
 private queue:Promise<unknown>=Promise.resolve();
 private staged:StudioNotebook|null=null;
 private invalidated=false;
 private authorityChanged=()=>{this.invalidated=true;};
 private constructor(private legacy:StudioNotebook|null,readonly indexed:IndexedNotebook|null,private owner:()=>string,private captured:string){window.addEventListener('jems:notebook-authority-changed',this.authorityChanged);}
 static async open(storage:StoragePort,owner:()=>string,rewardSaved?:(owner:string)=>void){
  const captured=owner();let indexed:IndexedNotebook|null=null;
  if(indexedStoragePreview()){
   const candidate=await IndexedNotebook.open(await nativeScope(captured),()=>{if(owner()!==captured)throw Error('The player changed. Reopen this idea in its own profile.');assertRewardSourceWritable();},rewardSaved);
   if(await candidate.isActive())indexed=candidate;else candidate.close();
  }
  const result=new NotebookWorkspace(indexed?null:new StudioNotebook(storage,rewardSaved),indexed,owner,captured);
  await result.refresh(captured);return result;
 }
 /** Explicit construction for an already-authorized adapter also supports
  * isolated browser verification without selecting a production build mode. */
 static async fromIndexed(indexed:IndexedNotebook,owner:()=>string){const result=new NotebookWorkspace(null,indexed,owner,indexed.scope.profile);await result.refresh(indexed.scope.profile);return result;}
 private check(owner=this.captured){if(this.invalidated)throw Error('Reload Jems to open the prepared notebook.');if(owner!==this.captured||this.owner()!==this.captured)throw Error('The player changed. Reopen this idea in its own profile.');}
 close(){this.invalidated=true;window.removeEventListener('jems:notebook-authority-changed',this.authorityChanged);this.loaded.clear();this.indexed?.close();}
 async whenIdle():Promise<void>{await this.queue;this.check();}
 list(owner:string):NotebookCard[]{this.check(owner);return structuredClone(this.cards);}
 pendingSessions():StudioSession[]{this.check();return this.cards.filter(c=>c.pendingCopy||c.pendingSubmission||c.needsReadyRecovery||['queued','building','testing'].includes(c.jobStatus??'')).slice(0,8).flatMap(c=>{const session=this.loaded.get(c.id);return session?[structuredClone(session)]:[];});}
 summary():NotebookSummary {this.check();return structuredClone(this.view);}
 capacity(){this.check();return structuredClone(this.view.capacity);}
 avatar(owner:string){this.check(owner);return this.view.avatar;}
 guidance(owner:string){this.check(owner);return structuredClone(this.view.guidance);}
 notificationPreferences(owner:string){this.check(owner);return structuredClone(this.view.notificationPreferences);}
 pendingRewards(owner:string){this.check(owner);return structuredClone(this.facts);}
 async refreshRewards(){
  await this.queue.catch(()=>{});this.check();
  for(let attempt=0;;attempt++){try{const facts=this.indexed?await this.indexed.pendingRewards(this.captured):this.legacy!.pendingRewards(this.captured);this.check();this.facts=facts;return;}catch(error){if(attempt>=2||!(error instanceof Error)||error.message!=='STORAGE_CONFLICT')throw error;}}
 }
 notifications(context:StudioNotificationContext={}):StudioNotification[]{
  this.check();const items:StudioNotification[]=[];
  for(const row of this.view.notificationVariants){const mask=(context.unknownSessionIds?.has(row.id)?1:0)|(context.unconfirmedSessionIds?.has(row.id)?2:0)|(context.sendingSessionIds?.has(row.id)?4:0),item=row.items[mask];if(item)items.push(structuredClone(item));}
  return items.sort((a,b)=>a.priority-b.priority||a.sessionId.localeCompare(b.sessionId));
 }
 get(id:string,owner:string):StudioSession {
  this.check(owner);if(this.staged)return this.staged.get(id,owner);if(this.legacy)return this.legacy.get(id,owner);
  const session=this.loaded.get(id);if(!session)throw Error('Open this saved idea before using it.');return structuredClone(session);
 }
 current(){this.check();if(!this.selected)throw Error('Choose a project first.');return this.get(this.selected,this.captured);}
 last(owner:string):StudioSession|null {this.check(owner);const id=this.view.active;if(!id)return null;const session=this.get(id,owner);return session.archived||session.resumeDismissed?null:session;}
 async load(id:string,owner:string):Promise<StudioSession>{
  this.check(owner);const epoch=++this.selectionEpoch,session=this.indexed?await this.indexed.get(id,owner):this.legacy!.get(id,owner);this.check(owner);if(epoch!==this.selectionEpoch)throw Error('The selected idea changed. Open it again.');if(this.selected!==id)this.transitionPrevious=this.selected;this.selected=id;this.loaded.set(id,session);this.trim();return structuredClone(session);
 }
 private trim(){const pending=new Set(this.cards.filter(c=>c.pendingCopy||c.pendingSubmission||c.needsReadyRecovery||['queued','building','testing'].includes(c.jobStatus??'')).slice(0,8).map(c=>c.id));for(const id of this.loaded.keys())if(id!==this.selected&&id!==this.view.active&&id!==this.transitionPrevious&&!pending.has(id))this.loaded.delete(id);}
 async refresh(owner=this.captured):Promise<NotebookSummary>{
  // A reward acknowledgement may advance the same head after a source save.
  // Retry only the read projection, never a mutation or paid request.
  for(let attempt=0;;attempt++){try{return await this.refreshOnce(owner);}catch(error){if(attempt>=2||!(error instanceof Error)||error.message!=='STORAGE_CONFLICT')throw error;}}
 }
 private async refreshOnce(owner=this.captured){
  this.check(owner);let cards:NotebookCard[],view:NotebookSummary,facts:RewardFact[];
  if(this.indexed){
   const version=await this.indexed.version();cards=[];let cursor:string|null=null;
   do {const page=await this.indexed.page(cursor,24);cards.push(...page.items);cursor=page.next;if(cards.length>NOTEBOOK_CAPACITY)throw Error('NOTEBOOK_INDEX_INVALID');}while(cursor);
   view=await this.indexed.summary();facts=await this.indexed.pendingRewards(owner);if(version!==await this.indexed.version())throw Error('STORAGE_CONFLICT');
  }else {const source=this.legacy!.read();cards=source.sessions.filter(s=>s.owner===owner).map(s=>notebookCard(s,notebookReadView(source,s)));view=deriveNotebookSummary(source,owner);facts=source.rewardOutbox?.filter(f=>f.owner===owner)??[];}
  this.check(owner);this.cards=cards.sort((a,b)=>b.updated.localeCompare(a.updated)||a.id.localeCompare(b.id));this.view=view;this.facts=facts;
  if(this.selected&&!cards.some(c=>c.id===this.selected))this.selected=null;if(!this.selected)this.selected=view.active;
  const selected=this.selected,epoch=this.selectionEpoch,required=new Set([...(selected?[selected]:[]),...(view.active?[view.active]:[]),...(this.transitionPrevious&&cards.some(c=>c.id===this.transitionPrevious)?[this.transitionPrevious]:[]),...cards.filter(c=>c.pendingCopy||c.pendingSubmission||c.needsReadyRecovery||['queued','building','testing'].includes(c.jobStatus??'')).slice(0,8).map(c=>c.id)]);
  const loaded=new Map<string,StudioSession>();for(const id of required){const session=this.indexed?await this.indexed.get(id,owner):this.legacy!.get(id,owner);this.check(owner);loaded.set(id,session);}if(epoch===this.selectionEpoch&&selected===this.selected)this.loaded=loaded;
  return this.summary();
 }
 /** For callback provenance checks the staged source is authoritative. Outside
  * a mutation use only the selected session's already-loaded earlier pages. */
 withConversation(session:StudioSession):StudioSession {
  this.check(session.owner);if(this.staged)return this.staged.withConversation(session);if(this.legacy)return this.legacy.withConversation(session);
  const saved=this.get(session.id,session.owner),count=this.cards.find(c=>c.id===session.id)?.messageCount;if(count===undefined)throw Error('Choose a saved idea.');
  return {...session,messages:[...saved.messages.slice(0,Math.max(0,saved.messages.length-count)),...structuredClone(session.messages)]};
 }
 conversationPage(id:string,owner:string){this.check(owner);const card=this.cards.find(c=>c.id===id);if(!card)throw Error('Choose a saved idea.');return {count:card.messageCount,available:CONVERSATION_PAGE_CAPACITY-card.messageCount};}
 assertCanCreate(){this.check();if(this.view.capacity.available<=0)throw new NotebookCapacityError();}
 assertMessageCapacity(id:string,owner:string,count=1){if(!Number.isInteger(count)||count<1||count>CONVERSATION_PAGE_CAPACITY)throw Error('Invalid conversation capacity request.');if(this.conversationPage(id,owner).available<count){this.assertCanCreate();throw new ConversationCapacityError();}}
 assertIdeaCapacity(id:string,owner:string){if((this.get(id,owner).design?.ideas.length??0)>=DESIGN_IDEA_CAPACITY)throw new DesignCapacityError('idea');}
 private mutate<T>(callback:(book:StudioNotebook)=>T):Promise<T>{
  const captured=this.captured;
  const work=this.queue.catch(()=>{}).then(async()=>{this.check(captured);assertRewardSourceWritable();const run=(book:StudioNotebook)=>{this.staged=book;try{return callback(book);}finally{this.staged=null;}};
   const result=this.indexed?await this.indexed.transaction(run):run(this.legacy!);this.check(captured);await this.refresh(captured);return result;});
  this.queue=work;return work;
 }
 /** Shared native/notebook local transaction. The caller commits these changes
  * with the native delta in one IndexedRecords transaction, then publishes. */
 async prepareTransaction<T>(callback:(book:StudioNotebook)=>T){
  await this.queue.catch(()=>{});this.check();if(!this.indexed)throw Error('Use the legacy project transaction for this notebook.');
  const prepared=await this.indexed.prepareTransaction(book=>{this.staged=book;try{return callback(book);}finally{this.staged=null;}});
  return {...prepared,publish:async()=>{prepared.publish();await this.refresh();}};
 }
 async dismissWelcome(...args:Parameters<StudioNotebook['dismissWelcome']>):Promise<ReturnType<StudioNotebook['dismissWelcome']>>{return this.mutate(book=>book.dismissWelcome(...args));}
 async dismissGuideTip(...args:Parameters<StudioNotebook['dismissGuideTip']>):Promise<ReturnType<StudioNotebook['dismissGuideTip']>>{return this.mutate(book=>book.dismissGuideTip(...args));}
 async resetGuidance(...args:Parameters<StudioNotebook['resetGuidance']>):Promise<ReturnType<StudioNotebook['resetGuidance']>>{return this.mutate(book=>book.resetGuidance(...args));}
 async acknowledgeNotifications(...args:Parameters<StudioNotebook['acknowledgeNotifications']>):Promise<ReturnType<StudioNotebook['acknowledgeNotifications']>>{return this.mutate(book=>book.acknowledgeNotifications(...args));}
 async dismissNotification(...args:Parameters<StudioNotebook['dismissNotification']>):Promise<ReturnType<StudioNotebook['dismissNotification']>>{return this.mutate(book=>book.dismissNotification(...args));}
 async setAvatar(...args:Parameters<StudioNotebook['setAvatar']>):Promise<ReturnType<StudioNotebook['setAvatar']>>{return this.mutate(book=>book.setAvatar(...args));}
 async dismissResume(...args:Parameters<StudioNotebook['dismissResume']>):Promise<ReturnType<StudioNotebook['dismissResume']>>{return this.mutate(book=>book.dismissResume(...args));}
 async archive(...args:Parameters<StudioNotebook['archive']>):Promise<ReturnType<StudioNotebook['archive']>>{return this.mutate(book=>book.archive(...args));}
 async unarchive(...args:Parameters<StudioNotebook['unarchive']>):Promise<ReturnType<StudioNotebook['unarchive']>>{return this.mutate(book=>book.unarchive(...args));}
 async create(...args:Parameters<StudioNotebook['create']>):Promise<ReturnType<StudioNotebook['create']>>{return this.mutate(book=>book.create(...args));}
 async update(...args:Parameters<StudioNotebook['update']>):Promise<ReturnType<StudioNotebook['update']>>{return this.mutate(book=>book.update(...args));}
 async reply(...args:Parameters<StudioNotebook['reply']>):Promise<ReturnType<StudioNotebook['reply']>>{return this.mutate(book=>book.reply(...args));}
 async select(...args:Parameters<StudioNotebook['select']>):Promise<ReturnType<StudioNotebook['select']>>{const result=await this.mutate(book=>book.select(...args));this.transitionPrevious=null;this.trim();return result;}
 async message(...args:Parameters<StudioNotebook['message']>):Promise<ReturnType<StudioNotebook['message']>>{return this.mutate(book=>book.message(...args));}
 async continueConversation(...args:Parameters<StudioNotebook['continueConversation']>):Promise<ReturnType<StudioNotebook['continueConversation']>>{return this.mutate(book=>book.continueConversation(...args));}
 async clearConversation(...args:Parameters<StudioNotebook['clearConversation']>):Promise<ReturnType<StudioNotebook['clearConversation']>>{return this.mutate(book=>book.clearConversation(...args));}
 async fork(...args:Parameters<StudioNotebook['fork']>):Promise<ReturnType<StudioNotebook['fork']>>{return this.mutate(book=>book.fork(...args));}
 async saveExperiment(...args:Parameters<StudioNotebook['saveExperiment']>):Promise<ReturnType<StudioNotebook['saveExperiment']>>{return this.mutate(book=>book.saveExperiment(...args));}
 async verifyRemoteExperiment(...args:Parameters<StudioNotebook['verifyRemoteExperiment']>):Promise<ReturnType<StudioNotebook['verifyRemoteExperiment']>>{return this.mutate(book=>book.verifyRemoteExperiment(...args));}
 async keepExperiment(...args:Parameters<StudioNotebook['keepExperiment']>):Promise<ReturnType<StudioNotebook['keepExperiment']>>{return this.mutate(book=>book.keepExperiment(...args));}
 async selectExperiment(...args:Parameters<StudioNotebook['selectExperiment']>):Promise<ReturnType<StudioNotebook['selectExperiment']>>{return this.mutate(book=>book.selectExperiment(...args));}
 async note(...args:Parameters<StudioNotebook['note']>):Promise<ReturnType<StudioNotebook['note']>>{return this.mutate(book=>book.note(...args));}
 async observe(...args:Parameters<StudioNotebook['observe']>):Promise<ReturnType<StudioNotebook['observe']>>{return this.mutate(book=>book.observe(...args));}
 async acknowledgeRewards(...args:Parameters<StudioNotebook['acknowledgeRewards']>):Promise<ReturnType<StudioNotebook['acknowledgeRewards']>>{return this.mutate(book=>book.acknowledgeRewards(...args));}
 async snapshot():Promise<Notebook>{this.check();return this.indexed?this.indexed.snapshot():this.legacy!.read();}
 legacySnapshot():Notebook {this.check();if(this.indexed)throw Error('Use the complete recovery backup for this prepared notebook.');return this.legacy!.read();}
 async restore(value:Notebook,operationId?:string){this.check();if(this.indexed)await this.indexed.restore(value,operationId);else this.legacy!.restore(value);await this.refresh();}
}

/** Retains the original scoped localStorage source. Only the explicitly selected
 * preview build may create an authority; the UI calls this before reload. */
export async function prepareIndexedNotebook(storage:StoragePort,owner:()=>string){
 if(!indexedStoragePreview())throw Error('Indexed storage migration is not enabled in this build.');
 assertRewardSourceWritable();const captured=owner(),raw=storage.getItem(STUDIO_KEY)??JSON.stringify({version:1,sessions:[],active:{}} satisfies Notebook);
 setRewardSourceMaintenance(true);let store:IndexedNotebook|undefined;
 try{
  store=await IndexedNotebook.open(await nativeScope(captured),()=>{if(owner()!==captured)throw Error('The player changed.');assertRewardSourceLockHeld();});
  const result=await store.migrateLegacy(raw,{beforeActivate:()=>{if((storage.getItem(STUDIO_KEY)??JSON.stringify({version:1,sessions:[],active:{}}))!==raw)throw Error('Saved ideas changed while preparing the notebook. The original work is still active.');}});
  window.dispatchEvent(new Event('jems:notebook-authority-changed'));return result;
 }finally{store?.close();setRewardSourceMaintenance(false);}
}
