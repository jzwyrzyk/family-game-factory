import {freshDesign, validateDesign, validateExperiments, experiment, type DesignRecord, type Experiment, type Origin} from './design';
import { isGameId } from '../runtime/manifests';
import type { GameId } from '../runtime/types';
import { publishSourceEvidence } from '../problem-solving/signals';
import { builderJourney } from '../brand/gem-progress';
import { createRewardFact, enqueueRewardFact, rewardFactId, validateRewardOutbox, type RewardFact } from '../rewards/model';
import { assertRewardSourceWritable } from '../rewards/write-guard';
import { freshGuidance, isGuideTipId, validateGuidePreferences, type GuidePreferences, type GuideTipId } from './guidance';
import {validateBuildSubmission,type PendingBuildSubmission} from '../builder/submission';
import { acknowledgeStudioNotificationItems, freshStudioNotificationPreferences, validateStudioNotificationPreferences, type StudioNotificationPreferences, type StudioNotificationRef } from './notifications';
/** Persistent UI state only. Never stores credentials, signed URLs or executable code. */
export const STUDIO_KEY = 'family-game-factory-studio-v1';
export const NOTEBOOK_CAPACITY = 80;
export const CONVERSATION_PAGE_CAPACITY = 200;
export interface StoragePort { getItem(key: string): string | null; setItem(key: string, value: string): void }
export type Message = { id: string; role: 'child' | 'helper' | 'reflection'; text: string; at: string };
export interface ConversationChapter { id:string; owner:string; previousId:string|null; messages:Message[]; design?:DesignRecord }
export type Candidate = { id: string; baseId: string | null; config?: Record<string, number | boolean>; remoteId?: string; prompt: string; summary: string };
export type PendingJob = { id: string; api: string; status: 'queued' | 'building' | 'testing' | 'ready' | 'failed' | 'cancelled'; revisionId?:string; phase?:string };
/** A cosmetic choice, not a gender or a fact about the player. */
export type BuilderAvatar = 'spark' | 'nova';
/** Written only after the underlying revision service confirms this exact keep. */
export type KeptExperiment = {experimentId:string; revisionId:string; baseId:string; kind:'local'|'remote'; at:string};
export type KeptExperimentInput = Pick<KeptExperiment,'revisionId'|'kind'> & {baseId:string|null;contentChanged?:boolean};
export interface StudioSession {
  id: string; owner: string; name: string; game: GameId | 'new';
  projectId: string | null; remoteId: string | null; remoteKind?: string;
  candidate: Candidate | null; undone?: Candidate | null; draft: string; messages: Message[];
  job: PendingJob | null; updated: string; hypothesis: string; reflection: boolean;
  design?:DesignRecord; experiments?:Experiment[]; selectedTest?:string|null; playOnly?:boolean;
  pendingExperiment?:{parents:string[];depth:Experiment['depth'];origin:Origin;baseId:string|null;prompt:string}|null;
  pendingSubmission?:PendingBuildSubmission|null;
  archived?:boolean; resumeDismissed?:boolean;
  keptExperiments?:KeptExperiment[]; verifiedRemoteExperiments?:string[];
  /** Canonical source project, retained through copies and local/remote transitions. */
  rewardProjectId?:string;
  /** Immutable earlier pages; the current messages remain a bounded writable page. */
  previousConversationId?:string;
}
export interface Notebook { version: 1; sessions: StudioSession[]; active: Record<string, string>; avatars?:Record<string,BuilderAvatar>;rewardOutbox?:RewardFact[];guidance?:Record<string,GuidePreferences>;conversationChapters?:ConversationChapter[];notifications?:Record<string,StudioNotificationPreferences> }
const guidanceFor=(notebook:Notebook,owner:string):GuidePreferences=>notebook.guidance&&Object.hasOwn(notebook.guidance,owner)?notebook.guidance[owner]:freshGuidance();
const fresh = (): Notebook => ({version: 1, sessions: [], active: {}});
const copy = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const safeText = (x: unknown, max: number): x is string => typeof x === 'string' && x.length <= max;
const ident = (x: unknown): x is string => safeText(x, 160) && /^[\w:-]+$/.test(x) && !['__proto__','constructor','prototype'].includes(x);
const validMessages = (messages:Message[]) => Array.isArray(messages) && messages.length<=CONVERSATION_PAGE_CAPACITY && messages.every(m=>m&&ident(m.id)&&['child','helper','reflection'].includes(m.role)&&safeText(m.text,2200)&&safeText(m.at,40)&&Number.isFinite(Date.parse(m.at)));
export class NotebookCapacityError extends Error {
  constructor(){super('This notebook is full. Put-away jems and earlier chat pages still count. Open a saved jem to keep working, or ask a grown-up to export a backup.');this.name='NotebookCapacityError';}
}
export class ConversationCapacityError extends Error {
  constructor(){super('This chat page is full. Choose Continue chat to keep your earlier words and make room.');this.name='ConversationCapacityError';}
}
function assertNotebookCapacity(notebook:Notebook){if(notebook.sessions.length+(notebook.conversationChapters?.length??0)>=NOTEBOOK_CAPACITY)throw new NotebookCapacityError();}
function chaptersFor(notebook:Notebook,session:StudioSession):ConversationChapter[]{
  const pages:ConversationChapter[]=[],seen=new Set<string>();
  let id=session.previousConversationId;
  while(id){
    const page=notebook.conversationChapters?.find(page=>page.id===id&&page.owner===session.owner);
    if(!page||seen.has(id))throw Error('Invalid earlier conversation link.');
    seen.add(id);pages.unshift(page);id=page.previousId??undefined;
  }
  return pages;
}
function conversationContext(notebook:Notebook,session:StudioSession):StudioSession {
  return {...session,messages:[...chaptersFor(notebook,session).flatMap(page=>page.messages),...session.messages]};
}
export function validateNotebook(input: unknown): Notebook {
  const n = input as Notebook;
  if (!n || n.version !== 1 || !Array.isArray(n.sessions) || n.sessions.length > NOTEBOOK_CAPACITY || !n.active || typeof n.active !== 'object' || Array.isArray(n.active)) throw Error('This studio notebook is not supported. Your saved data was not replaced.');
  if(Object.keys(n).some(k=>!['version','sessions','active','avatars','rewardOutbox','guidance','conversationChapters','notifications'].includes(k)))throw Error('Unknown studio data; not restored.');
  if(n.conversationChapters!==undefined){
    if(!Array.isArray(n.conversationChapters)||n.sessions.length+n.conversationChapters.length>NOTEBOOK_CAPACITY)throw Error('Invalid retained notebook capacity.');
    const ids=new Set<string>();
    for(const page of n.conversationChapters){
      if(!page||Object.keys(page).some(key=>!['id','owner','previousId','messages','design'].includes(key))||!ident(page.id)||ids.has(page.id)||!ident(page.owner)||(page.previousId!==null&&!ident(page.previousId))||!validMessages(page.messages)||!page.messages.length)throw Error('Invalid earlier conversation page.');
      ids.add(page.id);if(page.design!==undefined)validateDesign(page.design);
    }
  }
  if(n.avatars!==undefined&&(!n.avatars||typeof n.avatars!=='object'||Array.isArray(n.avatars)||Object.keys(n.avatars).length>80||!Object.entries(n.avatars).every(([owner,choice])=>ident(owner)&&(choice==='spark'||choice==='nova'))))throw Error('Invalid builder character choice.');
  if(n.guidance!==undefined){
    if(!n.guidance||typeof n.guidance!=='object'||Array.isArray(n.guidance)||Object.keys(n.guidance).length>80)throw Error('Invalid journey guidance preferences.');
    for(const [owner,preferences] of Object.entries(n.guidance)){if(!ident(owner))throw Error('Invalid journey guidance player.');validateGuidePreferences(preferences);}
  }
  const ids = new Set<string>();
  for (const s of n.sessions) {
    if (!s || !ident(s.id) || ids.has(s.id) || !ident(s.owner) || !safeText(s.name, 60) || !(s.game==='new'||isGameId(s.game)) || !safeText(s.draft,2000) || !safeText(s.hypothesis,300) || typeof s.reflection !== 'boolean' || !safeText(s.updated,40) || !Number.isFinite(Date.parse(s.updated))) throw Error('Invalid studio project.');
    ids.add(s.id);
    if (s.projectId !== null && !ident(s.projectId) || s.remoteId !== null && !ident(s.remoteId) || s.remoteKind !== undefined && !safeText(s.remoteKind,60)) throw Error('Invalid studio reference.');
    if(s.rewardProjectId!==undefined&&!ident(s.rewardProjectId))throw Error('Invalid reward project reference.');
    if (!validMessages(s.messages)) throw Error('Invalid studio conversation.');
    if(s.previousConversationId!==undefined&&!ident(s.previousConversationId))throw Error('Invalid earlier conversation link.');
    for (const c of [s.candidate,s.undone??null]) if (c !== null) {
      if (!c || !ident(c.id) || c.baseId !== null && !ident(c.baseId) || !safeText(c.prompt,2000) || !safeText(c.summary,2200) || (!!c.config === !!c.remoteId)) throw Error('Invalid preview.');
      if (c.remoteId && !ident(c.remoteId)) throw Error('Invalid preview reference.');
      if (c.config && (typeof c.config !== 'object' || Array.isArray(c.config) || Object.keys(c.config).length > 100 || !Object.entries(c.config).every(([k,v])=>/^[a-zA-Z][\w]*$/.test(k) && (typeof v==='boolean' || typeof v==='number' && Number.isFinite(v))))) throw Error('Invalid preview settings.');
    }
    if(s.design!==undefined)validateDesign(s.design);
    if(s.experiments!==undefined)validateExperiments(s.experiments);
    if(s.verifiedRemoteExperiments!==undefined&&(!Array.isArray(s.verifiedRemoteExperiments)||s.verifiedRemoteExperiments.length>100||new Set(s.verifiedRemoteExperiments).size!==s.verifiedRemoteExperiments.length||!s.verifiedRemoteExperiments.every(id=>ident(id)&&s.experiments?.some(e=>e.id===id&&!!e.candidate.remoteId))))throw Error('Invalid verified experiment.');
    if(s.keptExperiments!==undefined){
      if(!Array.isArray(s.keptExperiments)||s.keptExperiments.length>100||new Set(s.keptExperiments.map(k=>k?.experimentId)).size!==s.keptExperiments.length||new Set(s.keptExperiments.map(k=>k?.revisionId)).size!==s.keptExperiments.length)throw Error('Invalid kept experiment.');
      for(const kept of s.keptExperiments){
        const test=s.experiments?.find(e=>e.id===kept?.experimentId);
        if(!kept||Object.keys(kept).some(k=>!['experimentId','revisionId','baseId','kind','at'].includes(k))||!ident(kept.experimentId)||!ident(kept.revisionId)||!ident(kept.baseId)||kept.baseId===kept.revisionId||!['local','remote'].includes(kept.kind)||!safeText(kept.at,40)||!Number.isFinite(Date.parse(kept.at))||!test||test.baseId!==kept.baseId||test.candidate.baseId!==kept.baseId)throw Error('Invalid kept experiment.');
        if(kept.kind==='remote'?test.candidate.remoteId!==kept.revisionId||!s.verifiedRemoteExperiments?.includes(test.id):!s.projectId||!test.candidate.config)throw Error('Kept version does not match its experiment.');
      }
    }
    if(s.selectedTest!==undefined&&s.selectedTest!==null&&!s.experiments?.some(e=>e.id===s.selectedTest))throw Error('Unknown selected test.');
    if(s.playOnly!==undefined&&typeof s.playOnly!=='boolean')throw Error('Invalid play-only state.');
    if((s.archived!==undefined&&typeof s.archived!=='boolean')||(s.resumeDismissed!==undefined&&typeof s.resumeDismissed!=='boolean'))throw Error('Invalid home visibility state.');
    if(s.pendingExperiment&&(!Array.isArray(s.pendingExperiment.parents)||s.pendingExperiment.parents.length>10||!s.pendingExperiment.parents.every(id=>s.experiments?.some(e=>e.id===id))||!['tune','redesign','rethink'].includes(s.pendingExperiment.depth)||!['child','helper'].includes(s.pendingExperiment.origin)||(s.pendingExperiment.baseId!==null&&!ident(s.pendingExperiment.baseId))||!safeText(s.pendingExperiment.prompt,2000)))throw Error('Invalid pending experiment.');
    if (s.job !== null && (!s.job || !ident(s.job.id) || !safeText(s.job.api,500) || s.job.revisionId!==undefined&&!ident(s.job.revisionId) || s.job.phase!==undefined&&(typeof s.job.phase!=='string'||!/^[a-z-]{1,32}$/.test(s.job.phase)) || !['queued','building','testing','ready','failed','cancelled'].includes(s.job.status))) throw Error('Invalid pending build.');
    if(s.pendingSubmission!==undefined&&s.pendingSubmission!==null){
      const pending=s.pendingSubmission;
      if(Object.keys(pending).some(key=>!['owner','workspace','api','request'].includes(key))||pending.owner!==s.owner||pending.workspace!==s.id||!safeText(pending.api,500)||!pending.api)throw Error('Invalid pending submission.');
      validateBuildSubmission(pending.request);
    }
  }
  const retainedPages=new Set(n.sessions.flatMap(session=>chaptersFor(n,session).map(page=>page.id)));
  if(n.conversationChapters?.some(page=>!retainedPages.has(page.id)))throw Error('An earlier conversation page is missing its owning project.');
  for (const [owner,id] of Object.entries(n.active)) if (!ident(owner) || !ident(id) || !n.sessions.some(s=>s.id===id&&s.owner===owner)) throw Error('Invalid current project.');
  if(n.notifications!==undefined){
    if(!n.notifications||typeof n.notifications!=='object'||Array.isArray(n.notifications)||Object.keys(n.notifications).length>80)throw Error('Invalid notification preferences.');
    for(const [owner,preferences] of Object.entries(n.notifications)){
      if(!ident(owner))throw Error('Invalid notification player.');
      const validated=validateStudioNotificationPreferences(preferences);
      if(validated.acknowledgements.some(item=>!n.sessions.some(session=>session.id===item.sessionId&&session.owner===owner)))throw Error('Invalid notification project.');
    }
  }
  // Reject accidental capability/secret persistence anywhere in the notebook schema.
  const allowed = ['id','owner','name','game','projectId','remoteId','remoteKind','candidate','undone','draft','messages','job','updated','hypothesis','reflection','design','experiments','selectedTest','playOnly','pendingExperiment','pendingSubmission','archived','resumeDismissed','keptExperiments','verifiedRemoteExperiments','rewardProjectId','previousConversationId'];
  if (n.sessions.some(s=>Object.keys(s).some(k=>!allowed.includes(k)))) throw Error('Unknown studio data; not restored.');
  if(n.rewardOutbox!==undefined){
    const facts=validateRewardOutbox(n.rewardOutbox);
    if(facts.some(fact=>!n.sessions.some(s=>s.owner===fact.owner)||!['maker.milestone','game.developed'].includes(fact.kind)||
      fact.kind==='game.developed'&&!n.sessions.some(s=>s.owner===fact.owner&&(s.rewardProjectId??s.projectId??s.id)===fact.sourceId)))throw Error('Invalid studio reward receipt.');
  }
  return copy(n);
}
export class StudioNotebook {
  constructor(private storage: StoragePort,private onRewardSourceSaved?:(owner:string)=>void) { this.read(); }
  read(): Notebook { const raw=this.storage.getItem(STUDIO_KEY); return raw===null ? fresh() : validateNotebook(JSON.parse(raw)); }
  private write<T>(fn:(n:Notebook)=>T):T {
    assertRewardSourceWritable();
    // Re-read on every synchronous transaction: don't overwrite a newer workspace snapshot.
    const n=this.read();
    const previousFacts=new Set((n.rewardOutbox??[]).map(fact=>fact.owner+'|'+rewardFactId(fact)));
    const previous=new Map([...new Set(n.sessions.map(s=>s.owner))].map(owner=>[owner,builderJourney(n.sessions.map(s=>conversationContext(n,s)),owner).level]));
    const result=fn(n); validateNotebook(n);
    // Only a new saved transition creates a receipt. Reading or restoring an old
    // notebook never retroactively mints its existing maker history.
    for(const owner of new Set(n.sessions.map(s=>s.owner))){
      const before=previous.get(owner)??0,after=builderJourney(n.sessions.map(s=>conversationContext(n,s)),owner).level;
      for(let level=before+1;level<=after;level++)n.rewardOutbox=enqueueRewardFact(n.rewardOutbox??[],createRewardFact({owner,kind:'maker.milestone',level:level as 1|2|3|4,occurredAt:Date.now()}));
    }
    validateNotebook(n);
    try { this.storage.setItem(STUDIO_KEY, JSON.stringify(n)); } catch { throw Error('Could not save this notebook. Your working game is safe. Export a backup before freeing browser space.'); }
    const changedOwners=new Set((n.rewardOutbox??[]).filter(fact=>!previousFacts.has(fact.owner+'|'+rewardFactId(fact))).map(fact=>fact.owner));
    for(const owner of changedOwners){
      // Notification only, never an award. If projection is unavailable, the
      // committed outbox remains retryable and the saved work still succeeded.
      try{this.onRewardSourceSaved?.(owner);}catch{}
    }
    return copy(result);
  }
  /** Read views include original words from linked pages; read() is the export format. */
  list(owner:string):StudioSession[] {const n=this.read();return n.sessions.filter(s=>s.owner===owner).map(s=>conversationContext(n,s)).sort((a,b)=>b.updated.localeCompare(a.updated));}
  capacity(){const n=this.read(),chapters=n.conversationChapters?.length??0;return {limit:NOTEBOOK_CAPACITY,retained:n.sessions.length+chapters,active:n.sessions.filter(s=>!s.archived).length,archived:n.sessions.filter(s=>s.archived).length,chapters,available:NOTEBOOK_CAPACITY-n.sessions.length-chapters};}
  assertCanCreate(){assertNotebookCapacity(this.read());}
  conversationPage(id:string,owner:string){const s=this.read().sessions.find(s=>s.id===id&&s.owner===owner);if(!s)throw Error('Choose a game in your own profile.');return {count:s.messages.length,available:CONVERSATION_PAGE_CAPACITY-s.messages.length};}
  /** Expand a mutable callback's current page for provenance/readiness checks only. */
  withConversation(session:StudioSession):StudioSession {
    const n=this.read();if(!n.sessions.some(s=>s.id===session.id&&s.owner===session.owner))throw Error('Choose a game in your own profile.');
    return conversationContext(n,session);
  }
  assertMessageCapacity(id:string,owner:string,count=1):void {
    if(!Number.isInteger(count)||count<1||count>CONVERSATION_PAGE_CAPACITY)throw Error('Invalid conversation capacity request.');
    const n=this.read(),s=n.sessions.find(s=>s.id===id&&s.owner===owner);if(!s)throw Error('Choose a game in your own profile.');
    if(s.messages.length+count>CONVERSATION_PAGE_CAPACITY){assertNotebookCapacity(n);throw new ConversationCapacityError();}
  }
  /** Optional hints are profile preferences, not evidence or a completed journey. */
  guidance(owner:string):GuidePreferences {
    if(!ident(owner))throw Error('Invalid player.');
    return guidanceFor(this.read(),owner);
  }
  dismissWelcome(owner:string):GuidePreferences {
    if(!ident(owner))throw Error('Invalid player.');
    return this.write(n=>{const next={...guidanceFor(n,owner),welcomeDismissed:true};n.guidance={...n.guidance,[owner]:next};return next;});
  }
  dismissGuideTip(owner:string,tip:GuideTipId):GuidePreferences {
    if(!ident(owner)||!isGuideTipId(tip))throw Error('Invalid journey guidance preference.');
    return this.write(n=>{const before=guidanceFor(n,owner),next={...before,dismissedTips:[...new Set([...before.dismissedTips,tip])]};n.guidance={...n.guidance,[owner]:next};return next;});
  }
  resetGuidance(owner:string):GuidePreferences {
    if(!ident(owner))throw Error('Invalid player.');
    return this.write(n=>{const next={...guidanceFor(n,owner),dismissedTips:[]};n.guidance={...n.guidance,[owner]:next};return next;});
  }
  notificationPreferences(owner:string):StudioNotificationPreferences {
    if(!ident(owner))throw Error('Invalid player.');
    const preferences=this.read().notifications;
    return preferences&&Object.hasOwn(preferences,owner)?validateStudioNotificationPreferences(preferences[owner]):freshStudioNotificationPreferences();
  }
  acknowledgeNotifications(owner:string,items:readonly StudioNotificationRef[]):StudioNotificationPreferences {
    return this.writeNotificationAcknowledgements(owner,items,false);
  }
  dismissNotification(owner:string,item:StudioNotificationRef):StudioNotificationPreferences {
    return this.writeNotificationAcknowledgements(owner,[item],true);
  }
  private writeNotificationAcknowledgements(owner:string,items:readonly StudioNotificationRef[],dismiss:boolean):StudioNotificationPreferences {
    if(!ident(owner))throw Error('Invalid player.');
    if(!Array.isArray(items)||items.length>80)throw Error('Invalid notification acknowledgement.');
    if(!items.length)return this.notificationPreferences(owner);
    return this.write(n=>{
      if(items.some(item=>!item||item.ownerId!==owner||!n.sessions.some(session=>session.id===item.sessionId&&session.owner===owner)))throw Error('Choose a notification from your own profile.');
      const before=n.notifications&&Object.hasOwn(n.notifications,owner)?n.notifications[owner]:freshStudioNotificationPreferences();
      const next=acknowledgeStudioNotificationItems(before,owner,items,dismiss);
      n.notifications={...n.notifications,[owner]:next};return next;
    });
  }
  avatar(owner:string):BuilderAvatar|null {
    if(!ident(owner))throw Error('Invalid player.');
    return this.read().avatars?.[owner]??null;
  }
  setAvatar(owner:string,choice:BuilderAvatar|null):BuilderAvatar|null {
    if(!ident(owner)||choice!==null&&choice!=='spark'&&choice!=='nova')throw Error('Choose one of the two builder characters.');
    return this.write(n=>{n.avatars={...n.avatars};if(choice===null)delete n.avatars[owner];else n.avatars[owner]=choice;return choice;});
  }
  get(id:string,owner:string):StudioSession {const n=this.read(),s=n.sessions.find(s=>s.id===id&&s.owner===owner);if(!s)throw Error('Choose a game in your own profile.');return conversationContext(n,s);}
  last(owner:string):StudioSession|null {const n=this.read(),s=n.sessions.find(s=>s.id===n.active[owner]&&s.owner===owner);return s&&!s.archived&&!s.resumeDismissed?conversationContext(n,s):null;}
  dismissResume(id:string,owner:string){return this.update(id,owner,s=>{s.resumeDismissed=true;});}
  archive(id:string,owner:string){return this.update(id,owner,s=>{if(s.pendingSubmission)throw Error('Check your saved request before putting this jem away.');if(s.job&&['queued','building','testing'].includes(s.job.status))throw Error('Stop the build before putting this jem away.');s.archived=true;s.resumeDismissed=true;});}
  unarchive(id:string,owner:string){return this.update(id,owner,s=>{s.archived=false;s.resumeDismissed=false;});}
  create(owner:string,game:StudioSession['game'],name:string,projectId:string|null=null,initial?:{playOnly?:boolean;message?:string}):StudioSession {
    return this.write(n=>{assertNotebookCapacity(n);const id=crypto.randomUUID(),now=new Date().toISOString(),s:StudioSession={id,owner,game,name:name.trim().slice(0,60)||'My new idea',projectId,rewardProjectId:projectId??id,remoteId:null,candidate:null,draft:'',messages:initial?.message?[{id:crypto.randomUUID(),role:'helper',text:initial.message.slice(0,2200),at:now}]:[],job:null,updated:now,hypothesis:'',reflection:false,design:freshDesign(),experiments:[],selectedTest:null,playOnly:initial?.playOnly??false,pendingExperiment:null};n.sessions.push(s);n.active[owner]=s.id;return s;});
  }
  update(id:string,owner:string,fn:(s:StudioSession)=>void):StudioSession {
    let before:StudioSession|undefined;
    const after=this.write(n=>{const s=n.sessions.find(s=>s.id===id&&s.owner===owner);if(!s)throw Error('Choose a game in your own profile.');before=copy(conversationContext(n,s));fn(s);s.updated=new Date().toISOString();return conversationContext(n,s);});
    if(before)publishSourceEvidence({kind:'studio',before,after});
    return after;
  }
  select(id:string,owner:string) {this.get(id,owner);this.write(n=>{n.active[owner]=id;return true;});}
  message(id:string,owner:string,role:Message['role'],text:string) {
    return this.update(id,owner,s=>{if(s.messages.length>=CONVERSATION_PAGE_CAPACITY){this.assertCanCreate();throw new ConversationCapacityError();}s.messages.push({id:crypto.randomUUID(),role,text:text.slice(0,2200),at:new Date().toISOString()});});
  }
  continueConversation(id:string,owner:string):StudioSession {
    return this.write(n=>{
      const s=n.sessions.find(s=>s.id===id&&s.owner===owner);if(!s)throw Error('Choose a game in your own profile.');
      if(s.job&&['queued','building','testing'].includes(s.job.status)||s.pendingExperiment||s.pendingSubmission)throw Error('Finish or recover this build before continuing chat.');
      if(!s.messages.length)throw Error('This chat page already has room.');
      assertNotebookCapacity(n);
      const page:ConversationChapter={id:crypto.randomUUID(),owner,previousId:s.previousConversationId??null,messages:copy(s.messages),...(s.design?{design:copy(s.design)}:{})};
      (n.conversationChapters??=[]).push(page);
      s.previousConversationId=page.id;s.messages=[];s.updated=new Date().toISOString();return s;
    });
  }
  /** Local-only erasure of chat and design notes for one child/session.
   * Saved versions retain their own prompts and observations. This is not
   * deletion of remote artifacts or backups; the interface must say so.
   */
  clearConversation(id:string,owner:string):StudioSession {
    let before:StudioSession|undefined;
    const result=this.write(n=>{
      const s=n.sessions.find(s=>s.id===id&&s.owner===owner);if(!s)throw Error('Choose a game in your own profile.');before=copy(s);
      if(s.job&&['queued','building','testing'].includes(s.job.status)||s.pendingExperiment||s.pendingSubmission)
        throw Error('Finish or cancel the current build before clearing this chat.');
      s.messages=[];s.draft='';s.hypothesis='';s.reflection=false;
      s.design=freshDesign();
      delete s.previousConversationId;
      const retained=new Set(n.sessions.flatMap(session=>chaptersFor(n,session).map(page=>page.id)));
      if(n.conversationChapters)n.conversationChapters=n.conversationChapters.filter(page=>retained.has(page.id));
      // Keep receipts belong to this erased making history, not a shadow badge store.
      // Saved test prompts/notes and game versions retain their existing semantics.
      delete s.keptExperiments;
      s.updated=new Date().toISOString();return s;
    });
    if(before)publishSourceEvidence({kind:'studio',before,after:result});
    publishSourceEvidence({kind:'clear-studio',owner,sessionId:id});
    return result;
  }
  fork(id:string,owner:string,name:string,projectId:string|null,remoteId:string|null):StudioSession {
    return this.write(n=>{
    assertNotebookCapacity(n);
    const source=n.sessions.find(s=>s.id===id&&s.owner===owner);if(!source)throw Error('Choose a game in your own profile.');
    const design=source.design?copy(source.design):undefined;
    // Prior observations remain truthful history. Their old tests are not on the new shelf,
    // so keep the text, author/source, identifiers and dates while detaching those links.
    if(design)design.observations=design.observations.map(observation=>({...observation,experimentId:null}));
    const s:StudioSession={...source,id:crypto.randomUUID(),name:name.trim().slice(0,60)||'My new game',projectId,remoteId,rewardProjectId:source.rewardProjectId??source.projectId??source.id,candidate:null,undone:null,job:null,experiments:[],keptExperiments:[],verifiedRemoteExperiments:[],selectedTest:null,playOnly:false,pendingExperiment:null,pendingSubmission:null,reflection:false,archived:false,resumeDismissed:false,design,updated:new Date().toISOString(),messages:copy(source.messages)};n.sessions.push(s);n.active[owner]=s.id;return s;});
  }
  saveExperiment(id:string,owner:string,candidate:Candidate,parents:string[]=[],depth:Experiment['depth']='tune',origin:Origin='child',select=true,verifiedRemote=false):Experiment {
    let result:Experiment;
    this.update(id,owner,s=>{s.experiments ||= [];result=experiment(candidate,s.experiments!,parents,depth,origin,s.hypothesis);s.experiments!.push(result);if(verifiedRemote&&candidate.remoteId){s.verifiedRemoteExperiments ||= [];s.verifiedRemoteExperiments.push(result.id);}if(select){s.selectedTest=result.id;s.candidate=copy(candidate);s.undone=null;}s.playOnly=false;s.resumeDismissed=false;});return result!;
  }
  /** Call only after a real (not mock) remote preview/build is verified. */
  verifyRemoteExperiment(id:string,owner:string,testId:string):StudioSession {
    return this.update(id,owner,s=>{const test=s.experiments?.find(e=>e.id===testId);if(!test?.candidate.remoteId)throw Error('Choose a saved remote experiment.');s.verifiedRemoteExperiments ||= [];if(!s.verifiedRemoteExperiments.includes(testId))s.verifiedRemoteExperiments.push(testId);});
  }
  /** Complete the notebook side of a successful, exact-test keep atomically.
   * A first remote build has no prior base, so it stays a valid working game
   * without pretending to be a tested improvement. Unknown/mock remote tests
   * can still be kept by their existing workflow but never award progress.
   */
  keepExperiment(id:string,owner:string,testId:string,receipt:KeptExperimentInput):StudioSession {
    return this.write(n=>{
      const s=n.sessions.find(s=>s.id===id&&s.owner===owner);if(!s)throw Error('Choose a game in your own profile.');
      const test=s.experiments?.find(e=>e.id===testId);
      if(!test||!receipt||!ident(receipt.revisionId)||!['local','remote'].includes(receipt.kind)||receipt.baseId!==test.candidate.baseId||receipt.baseId!==test.baseId||receipt.baseId!==null&&!ident(receipt.baseId))throw Error('Kept version does not match its experiment.');
      if(receipt.contentChanged!==undefined&&typeof receipt.contentChanged!=='boolean')throw Error('Invalid saved change receipt.');
      if(receipt.kind==='remote'?test.candidate.remoteId!==receipt.revisionId:!s.projectId||!test.candidate.config)throw Error('Kept version does not match its experiment.');
      if(receipt.revisionId===receipt.baseId)throw Error('Keep a new version of this experiment.');
      if(receipt.kind==='remote')s.remoteId=receipt.revisionId;
      s.candidate=null;s.undone=null;
      const verified=receipt.kind==='local'||s.verifiedRemoteExperiments?.includes(test.id);
      if(receipt.baseId!==null&&verified){
        s.keptExperiments ||= [];
        // Repeating a keep does not create extra project or milestone credit.
        if(!s.keptExperiments.some(k=>k.experimentId===test.id))s.keptExperiments.push({kind:receipt.kind,revisionId:receipt.revisionId,baseId:receipt.baseId,experimentId:test.id,at:new Date().toISOString()});
      }
      // The first real remote build can earn development credit without claiming
      // an improvement over a nonexistent base. Local callers must verify an
      // actual config change against the saved base; clicking Keep alone cannot.
      if(receipt.kind==='remote'?verified:receipt.contentChanged===true){
        const sourceId=s.rewardProjectId??s.projectId??s.id;s.rewardProjectId=sourceId;
        n.rewardOutbox=enqueueRewardFact(n.rewardOutbox??[],createRewardFact({owner,kind:'game.developed',sourceId,occurredAt:Date.now()}));
      }
      s.updated=new Date().toISOString();return s;
    });
  }
  selectExperiment(id:string,owner:string,testId:string):Experiment {
    const e=this.get(id,owner).experiments?.find(e=>e.id===testId);if(!e)throw Error('Choose one of this project’s tests.');
    this.update(id,owner,s=>{s.selectedTest=e.id;s.candidate=copy(e.candidate);});return copy(e);
  }
  note(id:string,owner:string,testId:string,note:string){if(!safeText(note,2000))throw Error('Note is too long.');this.update(id,owner,s=>{const e=s.experiments?.find(e=>e.id===testId);if(!e)throw Error('Test not found.');e.notes=note;});}
  observe(id:string,owner:string,text:string,source:'runtime'|'child',experimentId:string|null=null){
    this.update(id,owner,s=>{s.design ||= freshDesign();if(experimentId&&!s.experiments?.some(e=>e.id===experimentId))throw Error('Unknown observation test.');s.design.observations.push({id:crypto.randomUUID(),experimentId,text:text.slice(0,1200),source,at:new Date().toISOString()});});
  }
  pendingRewards(owner:string):RewardFact[] {if(!ident(owner))throw Error('Invalid player.');return (this.read().rewardOutbox??[]).filter(fact=>fact.owner===owner);}
  acknowledgeRewards(owner:string,factIds:string[]):void {
    if(!ident(owner)||!Array.isArray(factIds)||!factIds.every(id=>typeof id==='string'))throw Error('Invalid reward acknowledgment.');
    const ids=new Set(factIds);this.write(n=>{n.rewardOutbox=(n.rewardOutbox??[]).filter(fact=>fact.owner!==owner||!ids.has(rewardFactId(fact)));return true;});
  }
  restore(data:unknown) {assertRewardSourceWritable();const checked=validateNotebook(data);this.storage.setItem(STUDIO_KEY,JSON.stringify(checked));}
}
