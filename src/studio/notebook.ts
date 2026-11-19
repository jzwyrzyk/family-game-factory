import {freshDesign, validateDesign, validateExperiments, experiment, type DesignRecord, type Experiment, type Origin} from './design';
import { isGameId } from '../runtime/manifests';
import type { GameId } from '../runtime/types';
import { publishSourceEvidence } from '../problem-solving/signals';
/** Persistent UI state only. Never stores credentials, signed URLs or executable code. */
export const STUDIO_KEY = 'family-game-factory-studio-v1';
export interface StoragePort { getItem(key: string): string | null; setItem(key: string, value: string): void }
export type Message = { id: string; role: 'child' | 'helper' | 'reflection'; text: string; at: string };
export type Candidate = { id: string; baseId: string | null; config?: Record<string, number | boolean>; remoteId?: string; prompt: string; summary: string };
export type PendingJob = { id: string; api: string; status: 'queued' | 'building' | 'testing' | 'ready' | 'failed' | 'cancelled'; revisionId?:string; phase?:string };
export interface StudioSession {
  id: string; owner: string; name: string; game: GameId | 'new';
  projectId: string | null; remoteId: string | null; remoteKind?: string;
  candidate: Candidate | null; undone?: Candidate | null; draft: string; messages: Message[];
  job: PendingJob | null; updated: string; hypothesis: string; reflection: boolean;
  design?:DesignRecord; experiments?:Experiment[]; selectedTest?:string|null; playOnly?:boolean;
  pendingExperiment?:{parents:string[];depth:Experiment['depth'];origin:Origin;baseId:string|null;prompt:string}|null;
  archived?:boolean; resumeDismissed?:boolean;
}
export interface Notebook { version: 1; sessions: StudioSession[]; active: Record<string, string> }
const fresh = (): Notebook => ({version: 1, sessions: [], active: {}});
const copy = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const safeText = (x: unknown, max: number): x is string => typeof x === 'string' && x.length <= max;
const ident = (x: unknown): x is string => safeText(x, 160) && /^[\w:-]+$/.test(x) && !['__proto__','constructor','prototype'].includes(x);
export function validateNotebook(input: unknown): Notebook {
  const n = input as Notebook;
  if (!n || n.version !== 1 || !Array.isArray(n.sessions) || n.sessions.length > 80 || !n.active || typeof n.active !== 'object' || Array.isArray(n.active)) throw Error('This studio notebook is not supported. Your saved data was not replaced.');
  const ids = new Set<string>();
  for (const s of n.sessions) {
    if (!s || !ident(s.id) || ids.has(s.id) || !ident(s.owner) || !safeText(s.name, 60) || !(s.game==='new'||isGameId(s.game)) || !safeText(s.draft,2000) || !safeText(s.hypothesis,300) || typeof s.reflection !== 'boolean' || !safeText(s.updated,40) || !Number.isFinite(Date.parse(s.updated))) throw Error('Invalid studio project.');
    ids.add(s.id);
    if (s.projectId !== null && !ident(s.projectId) || s.remoteId !== null && !ident(s.remoteId) || s.remoteKind !== undefined && !safeText(s.remoteKind,60)) throw Error('Invalid studio reference.');
    if (!Array.isArray(s.messages) || s.messages.length > 200 || !s.messages.every(m => m && ident(m.id) && ['child','helper','reflection'].includes(m.role) && safeText(m.text,2200) && safeText(m.at,40) && Number.isFinite(Date.parse(m.at)))) throw Error('Invalid studio conversation.');
    for (const c of [s.candidate,s.undone??null]) if (c !== null) {
      if (!c || !ident(c.id) || c.baseId !== null && !ident(c.baseId) || !safeText(c.prompt,2000) || !safeText(c.summary,2200) || (!!c.config === !!c.remoteId)) throw Error('Invalid preview.');
      if (c.remoteId && !ident(c.remoteId)) throw Error('Invalid preview reference.');
      if (c.config && (typeof c.config !== 'object' || Array.isArray(c.config) || Object.keys(c.config).length > 100 || !Object.entries(c.config).every(([k,v])=>/^[a-zA-Z][\w]*$/.test(k) && (typeof v==='boolean' || typeof v==='number' && Number.isFinite(v))))) throw Error('Invalid preview settings.');
    }
    if(s.design!==undefined)validateDesign(s.design);
    if(s.experiments!==undefined)validateExperiments(s.experiments);
    if(s.selectedTest!==undefined&&s.selectedTest!==null&&!s.experiments?.some(e=>e.id===s.selectedTest))throw Error('Unknown selected test.');
    if(s.playOnly!==undefined&&typeof s.playOnly!=='boolean')throw Error('Invalid play-only state.');
    if((s.archived!==undefined&&typeof s.archived!=='boolean')||(s.resumeDismissed!==undefined&&typeof s.resumeDismissed!=='boolean'))throw Error('Invalid home visibility state.');
    if(s.pendingExperiment&&(!Array.isArray(s.pendingExperiment.parents)||s.pendingExperiment.parents.length>10||!s.pendingExperiment.parents.every(id=>s.experiments?.some(e=>e.id===id))||!['tune','redesign','rethink'].includes(s.pendingExperiment.depth)||!['child','helper'].includes(s.pendingExperiment.origin)||(s.pendingExperiment.baseId!==null&&!ident(s.pendingExperiment.baseId))||!safeText(s.pendingExperiment.prompt,2000)))throw Error('Invalid pending experiment.');
    if (s.job !== null && (!s.job || !ident(s.job.id) || !safeText(s.job.api,500) || s.job.revisionId!==undefined&&!ident(s.job.revisionId) || s.job.phase!==undefined&&(typeof s.job.phase!=='string'||!/^[a-z-]{1,32}$/.test(s.job.phase)) || !['queued','building','testing','ready','failed','cancelled'].includes(s.job.status))) throw Error('Invalid pending build.');
  }
  for (const [owner,id] of Object.entries(n.active)) if (!ident(owner) || !ident(id) || !n.sessions.some(s=>s.id===id&&s.owner===owner)) throw Error('Invalid current project.');
  // Reject accidental capability/secret persistence anywhere in the notebook schema.
  const allowed = ['id','owner','name','game','projectId','remoteId','remoteKind','candidate','undone','draft','messages','job','updated','hypothesis','reflection','design','experiments','selectedTest','playOnly','pendingExperiment','archived','resumeDismissed'];
  if (n.sessions.some(s=>Object.keys(s).some(k=>!allowed.includes(k)))) throw Error('Unknown studio data; not restored.');
  return copy(n);
}
export class StudioNotebook {
  constructor(private storage: StoragePort) { this.read(); }
  read(): Notebook { const raw=this.storage.getItem(STUDIO_KEY); return raw===null ? fresh() : validateNotebook(JSON.parse(raw)); }
  private write<T>(fn:(n:Notebook)=>T):T {
    // Re-read on every synchronous transaction: don't overwrite a newer workspace snapshot.
    const n=this.read(), result=fn(n); validateNotebook(n);
    try { this.storage.setItem(STUDIO_KEY, JSON.stringify(n)); } catch { throw Error('Could not save this notebook. Your working game is safe. Export a backup before freeing browser space.'); }
    return copy(result);
  }
  list(owner:string):StudioSession[] {return this.read().sessions.filter(s=>s.owner===owner).sort((a,b)=>b.updated.localeCompare(a.updated));}
  get(id:string,owner:string):StudioSession {const s=this.read().sessions.find(s=>s.id===id&&s.owner===owner);if(!s)throw Error('Choose a game in your own profile.');return s;}
  last(owner:string):StudioSession|null {const n=this.read(),s=n.sessions.find(s=>s.id===n.active[owner]&&s.owner===owner);return s&&!s.archived&&!s.resumeDismissed?s:null;}
  dismissResume(id:string,owner:string){return this.update(id,owner,s=>{s.resumeDismissed=true;});}
  archive(id:string,owner:string){return this.update(id,owner,s=>{if(s.job&&['queued','building','testing'].includes(s.job.status))throw Error('Stop the build before putting this jem away.');s.archived=true;s.resumeDismissed=true;});}
  unarchive(id:string,owner:string){return this.update(id,owner,s=>{s.archived=false;s.resumeDismissed=false;});}
  create(owner:string,game:StudioSession['game'],name:string,projectId:string|null=null):StudioSession {
    return this.write(n=>{const s:StudioSession={id:crypto.randomUUID(),owner,game,name:name.trim().slice(0,60)||'My new idea',projectId,remoteId:null,candidate:null,draft:'',messages:[],job:null,updated:new Date().toISOString(),hypothesis:'',reflection:false,design:freshDesign(),experiments:[],selectedTest:null,playOnly:false,pendingExperiment:null};n.sessions.push(s);n.active[owner]=s.id;return s;});
  }
  update(id:string,owner:string,fn:(s:StudioSession)=>void):StudioSession {
    let before:StudioSession|undefined;
    const after=this.write(n=>{const s=n.sessions.find(s=>s.id===id&&s.owner===owner);if(!s)throw Error('Choose a game in your own profile.');before=copy(s);fn(s);s.updated=new Date().toISOString();return s;});
    if(before)publishSourceEvidence({kind:'studio',before,after});
    return after;
  }
  select(id:string,owner:string) {this.get(id,owner);this.write(n=>{n.active[owner]=id;return true;});}
  message(id:string,owner:string,role:Message['role'],text:string) {
    return this.update(id,owner,s=>{if(s.messages.length>=200)throw Error('This conversation is full. Save a new copy or export your notebook to keep exploring.');s.messages.push({id:crypto.randomUUID(),role,text:text.slice(0,2200),at:new Date().toISOString()});});
  }
  /** Local-only erasure of chat and design notes for one child/session.
   * Saved versions retain their own prompts and observations. This is not
   * deletion of remote artifacts or backups; the interface must say so.
   */
  clearConversation(id:string,owner:string):StudioSession {
    const result=this.update(id,owner,s=>{
      if(s.job&&['queued','building','testing'].includes(s.job.status)||s.pendingExperiment)
        throw Error('Finish or cancel the current build before clearing this chat.');
      s.messages=[];s.draft='';s.hypothesis='';s.reflection=false;
      s.design=freshDesign();
    });
    publishSourceEvidence({kind:'clear-studio',owner,sessionId:id});
    return result;
  }
  fork(id:string,owner:string,name:string,projectId:string|null,remoteId:string|null):StudioSession {
    const source=this.get(id,owner);
    const design=source.design?copy(source.design):undefined;
    // Prior observations remain truthful history. Their old tests are not on the new shelf,
    // so keep the text, author/source, identifiers and dates while detaching those links.
    if(design)design.observations=design.observations.map(observation=>({...observation,experimentId:null}));
    return this.write(n=>{const s:StudioSession={...source,id:crypto.randomUUID(),name:name.trim().slice(0,60)||'My new game',projectId,remoteId,candidate:null,undone:null,job:null,experiments:[],selectedTest:null,playOnly:false,pendingExperiment:null,reflection:false,archived:false,resumeDismissed:false,design,updated:new Date().toISOString(),messages:copy(source.messages)};n.sessions.push(s);n.active[owner]=s.id;return s;});
  }
  saveExperiment(id:string,owner:string,candidate:Candidate,parents:string[]=[],depth:Experiment['depth']='tune',origin:Origin='child',select=true):Experiment {
    let result:Experiment;
    this.update(id,owner,s=>{s.experiments ||= [];result=experiment(candidate,s.experiments!,parents,depth,origin,s.hypothesis);s.experiments!.push(result);if(select){s.selectedTest=result.id;s.candidate=copy(candidate);s.undone=null;}s.playOnly=false;s.resumeDismissed=false;});return result!;
  }
  selectExperiment(id:string,owner:string,testId:string):Experiment {
    const e=this.get(id,owner).experiments?.find(e=>e.id===testId);if(!e)throw Error('Choose one of this project’s tests.');
    this.update(id,owner,s=>{s.selectedTest=e.id;s.candidate=copy(e.candidate);});return copy(e);
  }
  note(id:string,owner:string,testId:string,note:string){if(!safeText(note,2000))throw Error('Note is too long.');this.update(id,owner,s=>{const e=s.experiments?.find(e=>e.id===testId);if(!e)throw Error('Test not found.');e.notes=note;});}
  observe(id:string,owner:string,text:string,source:'runtime'|'child',experimentId:string|null=null){
    this.update(id,owner,s=>{s.design ||= freshDesign();if(experimentId&&!s.experiments?.some(e=>e.id===experimentId))throw Error('Unknown observation test.');s.design.observations.push({id:crypto.randomUUID(),experimentId,text:text.slice(0,1200),source,at:new Date().toISOString()});});
  }
  restore(data:unknown) {const checked=validateNotebook(data);this.storage.setItem(STUDIO_KEY,JSON.stringify(checked));}
}
