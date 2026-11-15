import { defaults, isGameId, validateConfig } from '../runtime/manifests';
import type { GameId, Mechanics, PlayOutcome } from '../runtime/types';
export const WORKSPACE_KEY = 'family-game-factory-workspace-v2';
export interface Revision { id: string; projectId: string; parentId: string | null; sourceRevisionId?: string; config: Mechanics; label: string; hypothesis: string; createdAt: string; state: 'private' }
export interface Project { id: string; owner: string; game: GameId; name: string; headId: string; keptId?:string }
export interface PlayRecord { id: string; revisionId: string; outcome: PlayOutcome; reflection: string }
export interface Workspace { version: 2; projects: Project[]; revisions: Revision[]; plays: PlayRecord[] }
export interface StoragePort { getItem(key: string): string | null; setItem(key: string, value: string): void }
const empty = (): Workspace => ({ version: 2, projects: [], revisions: [], plays: [] });
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const id = () => crypto.randomUUID();
const text = (s: unknown, max: number): s is string => typeof s === 'string' && s.length <= max;
export function validateWorkspace(value: unknown): Workspace {
  const d = value as Workspace;
  if (!d || d.version !== 2 || !Array.isArray(d.projects) || !Array.isArray(d.revisions) || !Array.isArray(d.plays) || d.projects.length > 50 || d.revisions.length > 500 || d.plays.length > 1000) throw Error('This workspace backup is not supported.');
  const unique = (items: {id:string}[]) => items.every(x=>x && text(x.id,100) && x.id.length>0) && new Set(items.map(x=>x.id)).size===items.length;
  if (!unique(d.projects) || !unique(d.revisions) || !unique(d.plays)) throw Error('Workspace identifiers are invalid.');
  for (const p of d.projects) {
    if (!text(p.owner,100) || !text(p.name,60) || !isGameId(p.game) || !d.revisions.some(r=>r.id===p.headId && r.projectId===p.id)) throw Error('Invalid game project.');
    if(p.keptId&&!d.revisions.some(r=>r.id===p.keptId&&r.projectId===p.id))throw Error('Invalid kept version.');
  }
  for (const r of d.revisions) {
    const project = d.projects.find(p=>p.id===r.projectId);
    if (!project || r.state!=='private' || !text(r.label,300) || !text(r.hypothesis,300) || !text(r.createdAt,40) || !Number.isFinite(Date.parse(r.createdAt))) throw Error('Invalid revision.');
    validateConfig(project.game, r.config);
    if (r.sourceRevisionId && !d.revisions.some(x=>x.id===r.sourceRevisionId)) throw Error('Missing fork source.');
    const seen = new Set([r.id]); let parent = r.parentId;
    while (parent !== null) { const next = d.revisions.find(x=>x.id===parent && x.projectId===r.projectId); if (!next || seen.has(next.id)) throw Error('Invalid revision history.'); seen.add(next.id); parent = next.parentId; }
  }
  for (const play of d.plays) {
    const revision=d.revisions.find(r=>r.id===play.revisionId), project=d.projects.find(p=>p.id===revision?.projectId), out=play.outcome;
    if (!revision || !project || !out || out.game!==project.game || typeof out.won!=='boolean' || !Number.isInteger(out.level) || out.level<1 || !Number.isFinite(out.durationMs) || out.durationMs<0 || !text(out.title,300) || !text(out.description,1000) || !text(out.at,40) || !text(play.reflection,300)) throw Error('Invalid play evidence.');
    const playedConfig=validateConfig(out.game, out.config);
    if (Object.entries(playedConfig).some(([key,value])=>validateConfig(project.game,revision.config)[key]!==value)) throw Error('Play evidence does not match its revision.');
  }
  return copy(d);
}
// A documented, local-only pre-release schema: each v1 game becomes a root revision.
export function migrateWorkspace(value: unknown): Workspace {
  if ((value as {version?:number})?.version !== 1) return validateWorkspace(value);
  const old=value as {version:1;games: {id:string;owner:string;game:GameId;name:string;config:Mechanics}[]};
  if (!Array.isArray(old.games) || old.games.length>50) throw Error('Invalid v1 workspace.');
  const d=empty();
  for (const g of old.games) {
    if (!isGameId(g.game)) throw Error('Unknown game in v1 workspace.');
    const revisionId=id();d.projects.push({id:g.id,owner:g.owner,game:g.game,name:g.name,headId:revisionId});
    d.revisions.push({id:revisionId,projectId:g.id,parentId:null,config:validateConfig(g.game,g.config),label:'Migrated version',hypothesis:'',createdAt:new Date().toISOString(),state:'private'});
  }
  return validateWorkspace(d);
}
export class RevisionStore {
  private data: Workspace;
  constructor(private storage: StoragePort) {
    const raw=storage.getItem(WORKSPACE_KEY);
    // Never silently replace corrupt data: caller can keep playing the original arcade.
    this.data=raw===null?empty():migrateWorkspace(JSON.parse(raw));
  }
  snapshot(): Workspace { return copy(this.data); }
  private transaction<T>(mutate:(next:Workspace)=>T):T {
    const next=copy(this.data), result=mutate(next);validateWorkspace(next);
    try { this.storage.setItem(WORKSPACE_KEY,JSON.stringify(next)); } catch { throw Error('Could not save on this device. Your last working version is safe. Free some space and try again.'); }
    this.data=next;return copy(result);
  }
  project(projectId:string,owner:string):Project { const p=this.data.projects.find(p=>p.id===projectId&&p.owner===owner);if(!p)throw Error('Choose a game in your own profile.');return copy(p); }
  revision(projectId:string,owner:string,revisionId?:string):Revision {const p=this.project(projectId,owner);const r=this.data.revisions.find(r=>r.id===(revisionId||p.headId)&&r.projectId===p.id);if(!r)throw Error('Version not found.');return copy(r);}
  list(owner:string):Project[]{return copy(this.data.projects.filter(p=>p.owner===owner));}
  history(projectId:string,owner:string):Revision[]{this.project(projectId,owner);return copy(this.data.revisions.filter(r=>r.projectId===projectId));}
  create(owner:string,game:GameId,name:string,config=defaults(game)):Project {
    const checked=validateConfig(game,config);
    return this.transaction(d=>{const projectId=id(),revisionId=id();const p={id:projectId,owner,game,name:name.trim().slice(0,60)||'My remix',headId:revisionId};d.projects.push(p);d.revisions.push({id:revisionId,projectId,parentId:null,config:checked,label:'Starting game',hypothesis:'',createdAt:new Date().toISOString(),state:'private'});return p;});
  }
  commit(projectId:string,owner:string,config:Mechanics,label:string,hypothesis=''):Revision {
    const p=this.project(projectId,owner),checked=validateConfig(p.game,config);
    return this.transaction(d=>{const revision={id:id(),projectId,parentId:p.headId,config:checked,label:label.slice(0,300),hypothesis:hypothesis.slice(0,300),createdAt:new Date().toISOString(),state:'private' as const};d.revisions.push(revision);d.projects.find(x=>x.id===p.id)!.headId=revision.id;return revision;});
  }
  keep(projectId:string,owner:string):void {const p=this.project(projectId,owner);this.transaction(d=>{d.projects.find(x=>x.id===p.id)!.keptId=p.headId;return true;});}
  checkout(projectId:string,owner:string,revisionId:string):void {this.revision(projectId,owner,revisionId);this.transaction(d=>{d.projects.find(p=>p.id===projectId)!.headId=revisionId;return true;});}
  undo(projectId:string,owner:string):void {const r=this.revision(projectId,owner);if(!r.parentId)throw Error('You are at the starting version.');this.checkout(projectId,owner,r.parentId);}
  redo(projectId:string,owner:string,childId?:string):void {const current=this.revision(projectId,owner);const children=this.history(projectId,owner).filter(r=>r.parentId===current.id);const next=childId?children.find(r=>r.id===childId):children.at(-1);if(!next)throw Error('No later change on this branch. Choose another version in Compare.');this.checkout(projectId,owner,next.id);}
  fork(projectId:string,owner:string,name:string):Project {
    const p=this.project(projectId,owner),r=this.revision(projectId,owner);
    return this.transaction(d=>{const project={id:id(),owner,game:p.game,name:name.trim().slice(0,60)||'My new remix',headId:id()};d.projects.push(project);d.revisions.push({...r,id:project.headId,projectId:project.id,parentId:null,sourceRevisionId:r.id,label:'Saved as a new game'});return project;});
  }
  record(projectId:string,owner:string,revisionId:string,outcome:PlayOutcome):PlayRecord {
    this.revision(projectId,owner,revisionId);
    return this.transaction(d=>{const play={id:id(),revisionId,outcome,reflection:''};d.plays.push(play);return play;});
  }
  reflect(playId:string,owner:string,reflection:string):void {
    const play=this.data.plays.find(p=>p.id===playId);if(!play)throw Error('Play not found.');const revision=this.data.revisions.find(r=>r.id===play.revisionId)!;this.project(revision.projectId,owner);
    this.transaction(d=>{d.plays.find(p=>p.id===playId)!.reflection=reflection.slice(0,300);return true;});
  }
  export():string {return JSON.stringify(this.data,null,2);}
  restore(raw:string):void {const next=migrateWorkspace(JSON.parse(raw));this.transaction(d=>{Object.assign(d,next);return true;});}
}
