import {test} from 'node:test';
import assert from 'node:assert/strict';
import {localJournal,LOCAL_JOURNAL_KEY,packChange,type Change} from '../src/storage/local-journal';
import {projectJournal,recoverLocalProjects} from '../src/storage/project-recovery';
import {STUDIO_KEY,StudioNotebook} from '../src/studio/notebook';
import {WORKSPACE_KEY,RevisionStore} from '../src/factory/workspace';
import {FAMILY_STATE_KEY} from '../src/storage/family-state';
import {saveLocalStudioProject} from '../src/studio/local-project';
import {defaults} from '../src/runtime/manifests';
class Memory {
 values=new Map<string,string>(); step=0;fault=Infinity;after=false;
 getItem(k:string){return this.values.get(k)??null;}
 mutate(fn:()=>void){const fault=++this.step===this.fault;if(fault&&!this.after)throw Error('termination');fn();if(fault&&this.after)throw Error('termination');}
 setItem(k:string,v:string){this.mutate(()=>this.values.set(k,v));}
 removeItem(k:string){this.mutate(()=>this.values.delete(k));}
}
const changes:Change[]=[{key:'game',before:'{"old":1}',after:'{"old":1,"new":2}'},{key:'chat',before:null,after:'{"reply":1}'},{key:'profile',before:null,after:'{"slot":"reserved"}'}];
const journal=(s:Memory,scope='family',guard=()=>{})=>localJournal(s,scope,['game','chat','profile'],guard,cs=>cs.forEach(c=>{if(c.before!==null)JSON.parse(c.before);JSON.parse(c.after);}));
for(const after of [false,true])for(let boundary=1;boundary<=changes.length+3;boundary++)test(`termination ${after?'after':'before'} mutation ${boundary} restores a coherent outcome`,()=>{
 const s=new Memory();s.values.set('game',changes[0].before!);s.fault=boundary;s.after=after;
 try{journal(s).commit(changes);}catch{}
 s.fault=Infinity;const outcome=journal(s).recover();
 const committed=boundary>5||boundary===5&&after;
 assert.equal(s.getItem('game'),committed?changes[0].after:changes[0].before);
 assert.equal(s.getItem('chat'),committed?changes[1].after:null);
 assert.equal(s.getItem('profile'),committed?changes[2].after:null);
 assert.equal(s.getItem(LOCAL_JOURNAL_KEY),null);
 assert.equal(journal(s).recover(),'none');
});
for(let boundary=1;boundary<=4;boundary++)test(`interrupted rollback boundary ${boundary} resumes without replay`,()=>{
 const s=new Memory();s.values.set('game',changes[0].before!);s.fault=5;
 assert.throws(()=>journal(s).commit(changes));s.step=0;s.fault=boundary;s.after=true;
 try{journal(s).recover();}catch{}
 s.fault=Infinity;journal(s).recover();assert.equal(s.getItem('game'),changes[0].before);assert.equal(s.getItem('chat'),null);assert.equal(s.getItem('profile'),null);
});
test('newer bytes, wrong namespace, lost lock and malformed intents fail before any write',()=>{
 const s=new Memory();s.values.set('game',changes[0].before!);s.fault=3;assert.throws(()=>journal(s).commit(changes));s.fault=Infinity;
 const snapshot=new Map(s.values);
 assert.throws(()=>journal(s,'adult:11111111-1111-1111-1111-111111111111').recover());assert.deepEqual(s.values,snapshot);
 assert.throws(()=>journal(s,'family',()=>{throw Error('lock');}).recover());assert.deepEqual(s.values,snapshot);
 s.values.set('chat','{"newer":true}');const newer=new Map(s.values);assert.throws(()=>journal(s).recover());assert.deepEqual(s.values,newer);
 s.values.set(LOCAL_JOURNAL_KEY,'{"version":2}');const malformed=new Map(s.values);assert.throws(()=>journal(s).recover());assert.deepEqual(s.values,malformed);
});
test('stale preparation and existing pending operation cannot be overwritten',()=>{
 const s=new Memory();assert.throws(()=>journal(s).commit(changes));assert.equal(s.values.size,0);
 s.values.set('game',changes[0].before!);s.fault=2;assert.throws(()=>journal(s).commit(changes));s.fault=Infinity;const snapshot=new Map(s.values);
 assert.throws(()=>journal(s).commit(changes));assert.deepEqual(s.values,snapshot);
});
test('packing preserves exact Unicode and null versus empty with less duplication',()=>{
 for(const [before,after] of [['🙂'.repeat(1000)+'old-end','🙂'.repeat(1000)+'new-end'],['','x'],['x',''],[null,'']]){
 const p=packChange({key:'game',before,after:after!});assert.equal(p.before===null?null:p.prefix+p.before+p.suffix,before);assert.equal(p.prefix+p.after+p.suffix,after);
 }
 const before='a'.repeat(10000)+'b',after='a'.repeat(10000)+'c';assert.ok(JSON.stringify(packChange({key:'game',before,after})).length<JSON.stringify({before,after}).length*.51);
});
test('schema and Adult ownership rejection leave sources and journals untouched',()=>{
 const s=new Memory();assert.throws(()=>projectJournal(s,'family').commit([{key:WORKSPACE_KEY,before:null,after:'{"version":99}'}]));assert.equal(s.values.size,0);
 const book=new StudioNotebook(s);book.create('player1','new','Family');const value=s.getItem(STUDIO_KEY)!;s.values.clear();
 assert.throws(()=>projectJournal(s,'adult:11111111-1111-1111-1111-111111111111').commit([{key:STUDIO_KEY,before:null,after:value}]));assert.equal(s.values.size,0);
});
test('construction copy stages profile, game and notebook together and rolls back all three',()=>{
 const s=new Memory(),owner='player1',profile={id:owner,name:'One',skills:{},stats:{},constructionStates:{} as Record<string,unknown>};
 const data={version:1,activeProfile:owner,profiles:[profile],feedback:[]};
 const host={store:{current:()=>profile,data,save:()=>{throw Error('Direct profile save forbidden');}}};
 const root=new RevisionStore(s).create(owner,'buckets','Original');profile.constructionStates[root.headId]={parts:['original']};s.setItem(FAMILY_STATE_KEY,JSON.stringify(data));
 const book=new StudioNotebook(s),original=book.create(owner,'buckets','Original',root.id);const before=new Map(s.values);
 const copy=()=>saveLocalStudioProject(s,host,owner,(games,notebook)=>{const p=games.fork(owner,root.id,'Copy');return notebook.fork(original.id,owner,'Copy',p.id,null);});
 s.step=0;s.fault=3;assert.throws(copy);assert.deepEqual(s.values,before);assert.equal(Object.keys(profile.constructionStates).length,1);
 s.fault=Infinity;const copied=copy();const revision=new RevisionStore(s).revision(copied.projectId!,owner);assert.deepEqual(profile.constructionStates[revision.id],{parts:['original']});
 assert.deepEqual(JSON.parse(s.getItem(FAMILY_STATE_KEY)!).profiles[0].constructionStates,profile.constructionStates);
});
test('reply evidence and all messages save together; capacity or quota changes neither',()=>{
 const s=new Memory(),book=new StudioNotebook(s),session=book.create('player1','new','Idea');
 const apply=(draft:any)=>{draft.design.friction='Exact evidence';};
 const original=s.getItem(STUDIO_KEY);s.fault=s.step+1;assert.throws(()=>book.reply(session.id,'player1',['First','Question'],apply));assert.equal(s.getItem(STUDIO_KEY),original);
 s.fault=Infinity;book.reply(session.id,'player1',['First','Question'],apply);assert.equal(book.get(session.id,'player1').design!.friction,'Exact evidence');assert.equal(book.get(session.id,'player1').messages.length,2);
 const saved=s.getItem(STUDIO_KEY);assert.throws(()=>book.reply(session.id,'player1',Array(200).fill('Overflow'),draft=>{draft.name='Lost';}));assert.equal(s.getItem(STUDIO_KEY),saved);
});
test('completed remote-copy notebook receipt is idempotent and clears pending intent in the same write',()=>{
 const s=new Memory(),book=new StudioNotebook(s),source=book.create('player1','new','Source');
 book.update(source.id,'player1',draft=>{draft.pendingCopy={requestId:'copy-one',sourceRevisionId:'remote-original',name:'Copy',api:'https://workshop.example'};});
 const before=s.getItem(STUDIO_KEY);s.fault=s.step+1;assert.throws(()=>book.fork(source.id,'player1','Copy',null,'remote-copy','copy-one'));assert.equal(s.getItem(STUDIO_KEY),before);
 s.fault=Infinity;const copy=book.fork(source.id,'player1','Copy',null,'remote-copy','copy-one');assert.equal(book.get(source.id,'player1').pendingCopy,null);assert.equal(book.fork(source.id,'player1','Copy',null,'remote-copy','copy-one').id,copy.id);assert.equal(book.list('player1').length,2);
});
