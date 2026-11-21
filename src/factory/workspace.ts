import { defaults, isGameId, validateConfig } from '../runtime/manifests';
import type { GameId, Mechanics, PlayOutcome } from '../runtime/types';
import { assertRewardSourceWritable } from '../rewards/write-guard';
export const WORKSPACE_KEY = 'family-game-factory-workspace-v2';
export interface Revision { id: string; projectId: string; parentId: string | null; sourceRevisionId?: string; drawingRigId?: string; config: Mechanics; label: string; hypothesis: string; createdAt: string; state: 'private' }
export interface Project { id: string; owner: string; game: GameId; name: string; headId: string; keptId?:string }
export interface PlayRecord { id: string; revisionId: string; outcome: PlayOutcome; reflection: string }
export interface Workspace { version: 2; projects: Project[]; revisions: Revision[]; plays: PlayRecord[] }
export interface StoragePort { getItem(key: string): string | null; setItem(key: string, value: string): void }
const empty = (): Workspace => ({ version: 2, projects: [], revisions: [], plays: [] });
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const id = () => crypto.randomUUID();
const text = (s: unknown, max: number): s is string => typeof s === 'string' && s.length <= max;
function ownedProject(data: Workspace, projectId: string, owner: string): Project {
  const project = data.projects.find(p => p.id === projectId && p.owner === owner);
  if (!project) throw Error('Choose a game in your own profile.');
  return project;
}
function projectRevision(data: Workspace, project: Project, revisionId = project.headId): Revision {
  const revision = data.revisions.find(r => r.id === revisionId && r.projectId === project.id);
  if (!revision) throw Error('Version not found.');
  return revision;
}
function checkHead(project: Project, expectedHeadId?: string): void {
  if (expectedHeadId !== undefined && project.headId !== expectedHeadId) throw Error('This game changed elsewhere. Compare with the latest version before keeping this preview.');
}
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
    if (r.drawingRigId !== undefined && (project.game !== 'hill' || typeof r.drawingRigId !== 'string' || !/^[\w-]{1,100}$/.test(r.drawingRigId))) throw Error('Invalid saved drawing version.');
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
    const revisionId:string=id();d.projects.push({id:g.id,owner:g.owner,game:g.game,name:g.name,headId:revisionId});
    d.revisions.push({id:revisionId,projectId:g.id,parentId:null,config:validateConfig(g.game,g.config),label:'Migrated version',hypothesis:'',createdAt:new Date().toISOString(),state:'private'});
  }
  return validateWorkspace(d);
}
export class RevisionStore {
  private data: Workspace;
  private raw: string | null;
  constructor(private storage: StoragePort) {
    this.raw=storage.getItem(WORKSPACE_KEY);
    // Never silently replace corrupt data: caller can keep playing the original arcade.
    this.data=this.raw===null?empty():migrateWorkspace(JSON.parse(this.raw));
  }
  private read(): Workspace {
    const raw = this.storage.getItem(WORKSPACE_KEY);
    if (raw !== this.raw) {
      const next = raw === null ? empty() : migrateWorkspace(JSON.parse(raw));
      this.data = next;
      this.raw = raw;
    }
    // Cache by source bytes so an unsaved v1 migration retains its revision IDs.
    return this.data;
  }
  snapshot(): Workspace { return copy(this.read()); }
  private save(next: Workspace): void {
    const checked = validateWorkspace(next);
    const raw = JSON.stringify(checked);
    try { this.storage.setItem(WORKSPACE_KEY,raw); } catch { throw Error('Could not save on this device. Your last working version is safe. Free some space and try again.'); }
    this.data = checked;
    this.raw = raw;
  }
  private transaction<T>(mutate:(next:Workspace)=>T):T {
    assertRewardSourceWritable();
    // Same-document stores share storage, not their snapshots. Keep the read,
    // preconditions and write synchronous; the source-writer lock guards tabs.
    const next=copy(this.read()), result=mutate(next);
    this.save(next);return copy(result);
  }
  project(projectId:string,owner:string):Project { return copy(ownedProject(this.read(),projectId,owner)); }
  revision(projectId:string,owner:string,revisionId?:string):Revision {const d=this.read();return copy(projectRevision(d,ownedProject(d,projectId,owner),revisionId));}
  list(owner:string):Project[]{return copy(this.read().projects.filter(p=>p.owner===owner));}
  history(projectId:string,owner:string):Revision[]{const d=this.read();ownedProject(d,projectId,owner);return copy(d.revisions.filter(r=>r.projectId===projectId));}
  create(owner:string,game:GameId,name:string,config=defaults(game),revisionId:string=id(),drawingRigId?:string):Project {
    const checked=validateConfig(game,config);
    return this.transaction(d=>{const projectId=id();const p={id:projectId,owner,game,name:name.trim().slice(0,60)||'My remix',headId:revisionId};d.projects.push(p);d.revisions.push({id:revisionId,projectId,parentId:null,...(drawingRigId?{drawingRigId}:{}),config:checked,label:'Starting game',hypothesis:'',createdAt:new Date().toISOString(),state:'private'});return p;});
  }
  commit(projectId:string,owner:string,config:Mechanics,label:string,hypothesis='',revisionId:string=id(),expectedHeadId?:string):Revision {
    return this.transaction(d=>{const p=ownedProject(d,projectId,owner);checkHead(p,expectedHeadId);const checked=validateConfig(p.game,config),source=projectRevision(d,p);const revision={id:revisionId,projectId,parentId:p.headId,...(source.drawingRigId?{drawingRigId:source.drawingRigId}:{}),config:checked,label:label.slice(0,300),hypothesis:hypothesis.slice(0,300),createdAt:new Date().toISOString(),state:'private' as const};d.revisions.push(revision);p.headId=revision.id;return revision;});
  }
  keep(projectId:string,owner:string,expectedHeadId?:string):void {this.transaction(d=>{const p=ownedProject(d,projectId,owner);checkHead(p,expectedHeadId);p.keptId=p.headId;return true;});}
  checkout(projectId:string,owner:string,revisionId:string,expectedHeadId?:string):void {this.transaction(d=>{const p=ownedProject(d,projectId,owner);checkHead(p,expectedHeadId);p.headId=projectRevision(d,p,revisionId).id;return true;});}
  undo(projectId:string,owner:string):void {this.transaction(d=>{const p=ownedProject(d,projectId,owner),r=projectRevision(d,p);if(!r.parentId)throw Error('You are at the starting version.');p.headId=r.parentId;return true;});}
  redo(projectId:string,owner:string,childId?:string):void {this.transaction(d=>{const p=ownedProject(d,projectId,owner),children=d.revisions.filter(r=>r.projectId===p.id&&r.parentId===p.headId);const next=childId?children.find(r=>r.id===childId):children.at(-1);if(!next)throw Error('No later change on this branch. Choose another version in Compare.');p.headId=next.id;return true;});}
  fork(projectId:string,owner:string,name:string,revisionId:string=id(),expectedHeadId?:string):Project {
    return this.transaction(d=>{const p=ownedProject(d,projectId,owner);checkHead(p,expectedHeadId);const r=projectRevision(d,p),project={id:id(),owner,game:p.game,name:name.trim().slice(0,60)||'My new remix',headId:revisionId};d.projects.push(project);d.revisions.push({...r,id:project.headId,projectId:project.id,parentId:null,sourceRevisionId:r.id,label:'Saved as a new game'});return project;});
  }
  record(projectId:string,owner:string,revisionId:string,outcome:PlayOutcome):PlayRecord {
    return this.transaction(d=>{projectRevision(d,ownedProject(d,projectId,owner),revisionId);const play={id:id(),revisionId,outcome,reflection:''};d.plays.push(play);return play;});
  }
  reflect(playId:string,owner:string,reflection:string):void {
    this.transaction(d=>{const play=d.plays.find(p=>p.id===playId);if(!play)throw Error('Play not found.');const revision=d.revisions.find(r=>r.id===play.revisionId)!;ownedProject(d,revision.projectId,owner);play.reflection=reflection.slice(0,300);return true;});
  }
  export():string {return JSON.stringify(this.read(),null,2);}
  restore(raw:string):void {
    assertRewardSourceWritable();
    // Explicit replacement may recover corrupt source bytes; ordinary edits may not.
    this.save(migrateWorkspace(JSON.parse(raw)));
  }
}
