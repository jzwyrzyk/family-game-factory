import {movementChoices,predictActor,type MovementPrediction} from './challenges';
/** Local immutable creation history. Autosave is recovery, never an implicit Keep. */
import type { CreationProject } from './model';
import { validateEditableProject } from './projects';
import { createRewardFact, enqueueRewardFact, rewardFactId, validateRewardOutbox, type RewardFact } from '../rewards/model';
import { assertRewardSourceWritable } from '../rewards/write-guard';

export const CREATION_KEY='family-game-factory-creation-v1';
export const CREATION_LIMITS=Object.freeze({projects:40,revisions:400,drafts:40,attempts:500,characters:2_000_000});
export interface CreationStoragePort {getItem(key:string):string|null;setItem(key:string,value:string):void}
export interface CreationEntry {
  id:string;owner:string;title:string;headId:string;keptId:string|null;createdAt:string;updatedAt:string;challengeId?:string;hintUsed?:boolean;
}
export interface CreationRevision {
  id:string;projectId:string;parentId:string|null;sourceRevisionId?:string;createdAt:string;label:string;scene:CreationProject;
}
export interface CreationDraft {projectId:string;baseRevisionId:string;scene:CreationProject;updatedAt:string}
export interface CreationAttempt {
  prediction?:MovementPrediction;
  id:string;projectId:string;revisionId:string;challengeId:string;passed:boolean;hintUsed:boolean;checkedAt:string;
}
export interface CreationWorkspace {
  schema:'jems.creation.workspace.v1';projects:CreationEntry[];revisions:CreationRevision[];drafts:CreationDraft[];attempts:CreationAttempt[];
  rewardOutbox?:RewardFact[];
}
export interface LoadedCreation {project:CreationEntry;revision:CreationRevision;scene:CreationProject;draft:CreationDraft|null}
const fresh=():CreationWorkspace=>({schema:'jems.creation.workspace.v1',projects:[],revisions:[],drafts:[],attempts:[]});
const clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
const uid=()=>crypto.randomUUID();
const now=()=>new Date().toISOString();
const text=(v:unknown,max:number):v is string=>typeof v==='string'&&v.length<=max;
const ident=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(v)&&!['__proto__','constructor','prototype'].includes(v);
const date=(v:unknown)=>text(v,40)&&/^\d{4}-\d{2}-\d{2}T/.test(v)&&Number.isFinite(Date.parse(v));
function object(value:unknown,keys:string[]):value is Record<string,unknown>{
  return !!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>keys.includes(key));
}
function invalid():never{throw Error('This creation backup is unsupported or damaged. Your saved work has not been replaced.');}
function checkSize(value:unknown):string {
  const raw=JSON.stringify(value);
  if(raw.length>CREATION_LIMITS.characters)throw Error('This scene collection is full. Export a backup before removing a creation or an old experiment.');
  return raw;
}

/** Validate complete graph and allowlisted assets before modifying any browser storage. */
export function validateCreationWorkspace(value:unknown):CreationWorkspace {
  if(!object(value,['schema','projects','revisions','drafts','attempts','rewardOutbox'])||value.schema!=='jems.creation.workspace.v1')invalid();
  const data=value as unknown as CreationWorkspace;
  for(const field of ['projects','revisions','drafts','attempts'] as const){
    if(!Array.isArray(data[field])||data[field].length>CREATION_LIMITS[field])invalid();
  }
  const projects=new Map<string,CreationEntry>(),revisions=new Map<string,CreationRevision>();
  for(const p of data.projects){
    if(!object(p,['id','owner','title','headId','keptId','createdAt','updatedAt','challengeId','hintUsed'])||!ident(p.id)||projects.has(p.id)||!ident(p.owner)||!text(p.title,60)||!p.title.trim()||!ident(p.headId)||!(p.keptId===null||ident(p.keptId))||!date(p.createdAt)||!date(p.updatedAt)||p.challengeId!==undefined&&!ident(p.challengeId)||p.hintUsed!==undefined&&(typeof p.hintUsed!=='boolean'||!p.challengeId))invalid();
    projects.set(p.id,p);
  }
  for(const r of data.revisions){
    if(!object(r,['id','projectId','parentId','sourceRevisionId','createdAt','label','scene'])||!ident(r.id)||revisions.has(r.id)||!projects.has(r.projectId)||!(r.parentId===null||ident(r.parentId))||r.sourceRevisionId!==undefined&&!ident(r.sourceRevisionId)||!date(r.createdAt)||!text(r.label,120))invalid();
    const scene=validateEditableProject(r.scene);if(scene.id!==r.projectId)invalid();
    revisions.set(r.id,r);
  }
  for(const p of data.projects){
    const head=revisions.get(p.headId);if(!head||head.projectId!==p.id||head.scene.title!==p.title)invalid();
    if(p.keptId!==null&&revisions.get(p.keptId)?.projectId!==p.id)invalid();
  }
  for(const r of data.revisions){
    const seen=new Set([r.id]);let parent=r.parentId;
    while(parent!==null){const prior=revisions.get(parent);if(!prior||prior.projectId!==r.projectId||seen.has(parent))invalid();seen.add(parent);parent=prior.parentId;}
    // A deleted copied-from project may no longer exist. A retained source cannot cross owners.
    const source=r.sourceRevisionId?revisions.get(r.sourceRevisionId):undefined;
    if(source&&projects.get(source.projectId)?.owner!==projects.get(r.projectId)?.owner)invalid();
  }
  const drafts=new Set<string>();
  for(const d of data.drafts){
    if(!object(d,['projectId','baseRevisionId','scene','updatedAt'])||!projects.has(d.projectId)||drafts.has(d.projectId)||revisions.get(d.baseRevisionId)?.projectId!==d.projectId||!date(d.updatedAt))invalid();
    const scene=validateEditableProject(d.scene);if(scene.id!==d.projectId)invalid();drafts.add(d.projectId);
  }
  const attempts=new Set<string>();
  for(const a of data.attempts){
    if(!object(a,['id','projectId','revisionId','challengeId','passed','hintUsed','checkedAt','prediction'])||!ident(a.id)||attempts.has(a.id)||!projects.has(a.projectId)||revisions.get(a.revisionId)?.projectId!==a.projectId||!ident(a.challengeId)||projects.get(a.projectId)?.challengeId!==a.challengeId||typeof a.passed!=='boolean'||typeof a.hintUsed!=='boolean'||!date(a.checkedAt))invalid();
    if(a.prediction!==undefined&&(!predictActor(a.challengeId)||!object(a.prediction,['choice','observed'])||
      !movementChoices.includes(a.prediction.choice)||!movementChoices.includes(a.prediction.observed)))invalid();
    attempts.add(a.id);
  }
  if(data.rewardOutbox!==undefined){
    const facts=validateRewardOutbox(data.rewardOutbox);
    if(facts.some(fact=>fact.kind!=='scene.challenge'||!data.projects.some(p=>p.owner===fact.owner)))invalid();
  }
  checkSize(data);return clone(data);
}

export class CreationStore {
  constructor(private storage:CreationStoragePort,private currentOwner?:()=>string){}
  /** Retain the original bytes for export when a newer/invalid schema cannot be opened. */
  get recoveryRaw():string|null {
    const raw=this.storage.getItem(CREATION_KEY);if(raw===null)return null;
    try{if(raw.length>CREATION_LIMITS.characters)return raw;validateCreationWorkspace(JSON.parse(raw));return null;}catch{return raw;}
  }
  read():CreationWorkspace {
    const raw=this.storage.getItem(CREATION_KEY);if(raw===null)return fresh();
    try{if(raw.length>CREATION_LIMITS.characters)invalid();return validateCreationWorkspace(JSON.parse(raw));}
    catch(error){if(error instanceof SyntaxError)invalid();throw error;}
  }
  export():CreationWorkspace{return this.read();}
  private scope(owner:string){if(!ident(owner)||this.currentOwner&&this.currentOwner()!==owner)throw Error('Player changed. Reopen this creation in your own profile.');}
  private entry(data:CreationWorkspace,id:string,owner:string):CreationEntry {
    this.scope(owner);const p=data.projects.find(p=>p.id===id&&p.owner===owner);if(!p)throw Error('Choose a creation in your own profile.');return p;
  }
  private persist(data:CreationWorkspace){
    assertRewardSourceWritable();
    const checked=validateCreationWorkspace(data),raw=checkSize(checked);
    try{this.storage.setItem(CREATION_KEY,raw);}catch{throw Error('Could not save this creation on this device. Your last saved version is safe. Export a backup before freeing browser space.');}
  }
  private write<T>(fn:(data:CreationWorkspace)=>T):T {
    assertRewardSourceWritable();
    // Each synchronous transaction sees the latest tab/workspace state.
    const data=this.read(),result=fn(data);this.persist(data);return clone(result);
  }
  private expect(p:CreationEntry,head:string){if(p.headId!==head)throw Error('This creation changed elsewhere. Reopen its latest version before saving this edit.');}
  private sceneFor(p:CreationEntry,head:CreationRevision,input:unknown):CreationProject {
    const scene=validateEditableProject(input);
    if(scene.id!==p.id)throw Error('This edit belongs to a different creation.');
    if(JSON.stringify(scene.provenance)!==JSON.stringify(head.scene.provenance))throw Error('The source of a creation cannot be changed by an edit. Make a copy instead.');
    return scene;
  }
  list(owner:string):CreationEntry[]{this.scope(owner);return this.read().projects.filter(p=>p.owner===owner).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));}
  get(id:string,owner:string):CreationEntry{return clone(this.entry(this.read(),id,owner));}
  load(id:string,owner:string):LoadedCreation {
    const data=this.read(),project=this.entry(data,id,owner),revision=data.revisions.find(r=>r.id===project.headId)!;
    return clone({project,revision,scene:revision.scene,draft:data.drafts.find(d=>d.projectId===id)??null});
  }
  history(id:string,owner:string):CreationRevision[]{const data=this.read();this.entry(data,id,owner);return clone(data.revisions.filter(r=>r.projectId===id));}
  attempts(id:string,owner:string):CreationAttempt[]{const data=this.read();this.entry(data,id,owner);return clone(data.attempts.filter(a=>a.projectId===id));}
  create(owner:string,input:CreationProject,options:{challengeId?:string}={}):CreationEntry {
    this.scope(owner);const scene=validateEditableProject(input);
    if(options.challengeId!==undefined&&!ident(options.challengeId))throw Error('Unknown challenge.');
    return this.write(data=>{
      this.scope(owner);if(data.projects.some(p=>p.id===scene.id))throw Error('That creation is already saved. Make a copy to start another.');
      const at=now(),headId=uid(),p:CreationEntry={id:scene.id,owner,title:scene.title,headId,keptId:null,createdAt:at,updatedAt:at,...(options.challengeId?{challengeId:options.challengeId}:{})};
      data.projects.push(p);data.revisions.push({id:headId,projectId:p.id,parentId:null,createdAt:at,label:'Starting scene',scene});return p;
    });
  }
  save(id:string,owner:string,input:CreationProject,expectedRevisionId:string,label='Saved experiment'):CreationRevision {
    return this.write(data=>{
      const p=this.entry(data,id,owner);this.expect(p,expectedRevisionId);
      const head=data.revisions.find(r=>r.id===p.headId)!,scene=this.sceneFor(p,head,input),at=now();
      const revision:CreationRevision={id:uid(),projectId:id,parentId:p.headId,createdAt:at,label:label.slice(0,120),scene};
      data.revisions.push(revision);p.headId=revision.id;p.title=scene.title;p.updatedAt=at;
      data.drafts=data.drafts.filter(d=>d.projectId!==id);return revision;
    });
  }
  keep(id:string,owner:string,expectedRevisionId?:string):CreationEntry {
    return this.write(data=>{const p=this.entry(data,id,owner);if(expectedRevisionId!==undefined)this.expect(p,expectedRevisionId);p.keptId=p.headId;p.updatedAt=now();return p;});
  }
  autosave(id:string,owner:string,input:CreationProject,expectedRevisionId:string):CreationDraft {
    return this.write(data=>{
      const p=this.entry(data,id,owner);this.expect(p,expectedRevisionId);
      const head=data.revisions.find(r=>r.id===p.headId)!,scene=this.sceneFor(p,head,input);
      const draft={projectId:id,baseRevisionId:p.headId,scene,updatedAt:now()};
      data.drafts=data.drafts.filter(d=>d.projectId!==id);data.drafts.push(draft);return draft;
    });
  }
  discardDraft(id:string,owner:string):void {this.write(data=>{this.entry(data,id,owner);data.drafts=data.drafts.filter(d=>d.projectId!==id);return true;});}
  checkout(id:string,owner:string,revisionId:string,expectedRevisionId?:string):CreationEntry {
    return this.write(data=>{const p=this.entry(data,id,owner);if(expectedRevisionId!==undefined)this.expect(p,expectedRevisionId);
      const revision=data.revisions.find(r=>r.id===revisionId&&r.projectId===id);if(!revision)throw Error('That scene version is unavailable.');
      p.headId=revision.id;p.title=revision.scene.title;p.updatedAt=now();return p;});
  }
  undo(id:string,owner:string,expectedRevisionId?:string):CreationEntry {
    return this.write(data=>{const p=this.entry(data,id,owner);if(expectedRevisionId!==undefined)this.expect(p,expectedRevisionId);
      const head=data.revisions.find(r=>r.id===p.headId)!;if(!head.parentId)throw Error('You are at the starting scene.');
      const prior=data.revisions.find(r=>r.id===head.parentId)!;p.headId=prior.id;p.title=prior.scene.title;p.updatedAt=now();return p;});
  }
  redo(id:string,owner:string,childId?:string,expectedRevisionId?:string):CreationEntry {
    return this.write(data=>{const p=this.entry(data,id,owner);if(expectedRevisionId!==undefined)this.expect(p,expectedRevisionId);
      const children=data.revisions.filter(r=>r.projectId===id&&r.parentId===p.headId),next=childId?children.find(r=>r.id===childId):children.at(-1);
      if(!next)throw Error('No later version on this branch. Choose a saved version.');p.headId=next.id;p.title=next.scene.title;p.updatedAt=now();return p;});
  }
  copy(id:string,owner:string,title?:string,options:{detachChallenge?:boolean}={}):CreationEntry {
    return this.write(data=>{const source=this.entry(data,id,owner),head=data.revisions.find(r=>r.id===source.headId)!,at=now();
      const projectId=uid(),revisionId=uid(),scene=validateEditableProject({...head.scene,id:projectId,title:(title?.trim()||`${source.title} copy`).slice(0,60),
        provenance:{...head.scene.provenance,createdBy:'child',sourceKind:'creation',sourceProjectId:source.id,sourceRevisionId:head.id}});
      const hasHint=source.hintUsed||data.attempts.some(a=>a.projectId===source.id&&a.hintUsed);
      const p:CreationEntry={id:projectId,owner,title:scene.title,headId:revisionId,keptId:null,createdAt:at,updatedAt:at,...(source.challengeId&&!options.detachChallenge?{challengeId:source.challengeId,...(hasHint?{hintUsed:true}:{})}:{})};
      data.projects.push(p);data.revisions.push({id:revisionId,projectId,parentId:null,sourceRevisionId:head.id,createdAt:at,label:'Copied scene',scene});return p;});
  }
  /** Record support when it is revealed, even if the scene is not checked until a later visit. */
  markHintUsed(id:string,owner:string):CreationEntry {
    return this.write(data=>{const p=this.entry(data,id,owner);if(!p.challengeId)throw Error('This scene has no challenge hint.');p.hintUsed=true;p.updatedAt=now();return p;});
  }
  recordAttempt(id:string,owner:string,expectedRevisionId:string,result:{challengeId:string;passed:boolean;hintUsed:boolean;prediction?:MovementPrediction}):CreationAttempt {
    return this.write(data=>{const p=this.entry(data,id,owner);this.expect(p,expectedRevisionId);
      if(!p.challengeId||p.challengeId!==result.challengeId||typeof result.passed!=='boolean'||typeof result.hintUsed!=='boolean')throw Error('This check does not belong to the selected challenge.');
      const hintUsed=!!(p.hintUsed||result.hintUsed||data.attempts.some(a=>a.projectId===id&&a.hintUsed));
      if(hintUsed)p.hintUsed=true;
      const attempt:CreationAttempt={id:uid(),projectId:id,revisionId:p.headId,challengeId:p.challengeId,passed:result.passed,hintUsed,checkedAt:now(),...(result.prediction?{prediction:result.prediction}:{})};
      data.attempts.push(attempt);
      if(attempt.passed)data.rewardOutbox=enqueueRewardFact(data.rewardOutbox??[],createRewardFact({owner,kind:'scene.challenge',sourceId:attempt.challengeId,occurredAt:attempt.checkedAt}));
      return attempt;});
  }
  remove(id:string,owner:string):void {this.write(data=>{this.entry(data,id,owner);data.projects=data.projects.filter(p=>p.id!==id);data.revisions=data.revisions.filter(r=>r.projectId!==id);data.drafts=data.drafts.filter(d=>d.projectId!==id);data.attempts=data.attempts.filter(a=>a.projectId!==id);if(data.rewardOutbox&&!data.projects.some(p=>p.owner===owner))data.rewardOutbox=data.rewardOutbox.filter(fact=>fact.owner!==owner);return true;});}
  removeOwner(owner:string):void {this.write(data=>{this.scope(owner);const ids=new Set(data.projects.filter(p=>p.owner===owner).map(p=>p.id));data.projects=data.projects.filter(p=>p.owner!==owner);data.revisions=data.revisions.filter(r=>!ids.has(r.projectId));data.drafts=data.drafts.filter(d=>!ids.has(d.projectId));data.attempts=data.attempts.filter(a=>!ids.has(a.projectId));if(data.rewardOutbox)data.rewardOutbox=data.rewardOutbox.filter(fact=>fact.owner!==owner);return true;});}
  pendingRewards(owner:string):RewardFact[] {this.scope(owner);return (this.read().rewardOutbox??[]).filter(fact=>fact.owner===owner);}
  acknowledgeRewards(owner:string,factIds:string[]):void {
    this.scope(owner);if(!Array.isArray(factIds)||!factIds.every(id=>typeof id==='string'))throw Error('Invalid reward acknowledgment.');
    const ids=new Set(factIds);this.write(data=>{this.scope(owner);data.rewardOutbox=(data.rewardOutbox??[]).filter(fact=>fact.owner!==owner||!ids.has(rewardFactId(fact)));return true;});
  }
  /** Parent backup restore is explicit and all-or-nothing for this independent key. */
  restore(value:unknown):void {assertRewardSourceWritable();this.persist(validateCreationWorkspace(value));}
  /** Only used from the existing explicit profile/family reset flow. Corrupt originals stay recoverable. */
  reset():void {this.read();this.persist(fresh());}
}
