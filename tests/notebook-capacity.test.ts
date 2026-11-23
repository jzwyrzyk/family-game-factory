import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StudioNotebook, STUDIO_KEY, NotebookCapacityError, type Message } from '../src/studio/notebook';
import { saveLocalStudioProject } from '../src/studio/local-project';
import { RevisionStore, WORKSPACE_KEY } from '../src/factory/workspace';
import { defaults } from '../src/runtime/manifests';
import { creationConversation, creationInputFingerprint, recordCreationReview, creationBuildReadiness } from '../src/studio/creation-readiness';
import { builderJourney } from '../src/brand/gem-progress';
import { setRewardSourceMaintenance } from '../src/rewards/write-guard';

class Memory {
  values = new Map<string, string>();
  fail = false;
  writes = 0;
  beforeSet?: (key:string,value:string)=>void;
  getItem(key:string){return this.values.get(key)??null;}
  setItem(key:string,value:string){this.writes++;this.beforeSet?.(key,value);if(this.fail)throw Error('QuotaExceededError');this.values.set(key,value);}
  removeItem(key:string){this.values.delete(key);}
}
const owner='player-one';
const messages=(count=200):Message[]=>Array.from({length:count},(_,index)=>({id:'turn-'+index,role:index%2?'helper':'child',text:index===0?'I guide a moth through a moon garden. Tapping a flower lights a path so the moth can find its home.':`Original ${index%2?'helper':'child'} words ${index}`,at:'2026-11-21T00:00:00Z'}));
function fullConversation(){
  const storage=new Memory(),book=new StudioNotebook(storage),session=book.create(owner,'new','Moon garden');
  book.update(session.id,owner,s=>{s.messages=messages();s.draft='My next unsent thought';s.design!.plan.action={value:'Tapping a flower',origin:'child',accepted:true,delegated:false};s.design!.plan.style={value:'Use silver leaves',origin:'helper',accepted:false,delegated:false};});
  return {storage,book,session};
}
function fillSessions(book:StudioNotebook,count:number){
  const snapshot=book.read(),template=structuredClone(snapshot.sessions[0]);
  snapshot.sessions=Array.from({length:count},(_,index)=>({...structuredClone(template),id:'session-'+index,name:'Saved idea '+index,rewardProjectId:'session-'+index,archived:true}));
  snapshot.active[owner]=snapshot.sessions[0].id;book.restore(snapshot);
  return snapshot;
}
function host(){const profile={id:owner,constructionStates:{} as Record<string,unknown>};return {profile,store:{current:()=>profile,save:()=>true}};}
function start(storage:Memory,fg=host()){
  return saveLocalStudioProject(storage,fg,owner,(games,book)=>{
    const p=games.create(owner,'buckets','My game',defaults('buckets'));
    return book.create(owner,'buckets',p.name,p.id,{playOnly:true,message:'Play first.'});
  });
}

test('full-conversation recovery preserves original words, plan and identity and accepts the next message',()=>{
  const {storage,book,session}=fullConversation(),before=book.get(session.id,owner);
  const fingerprint=creationInputFingerprint(before),progress=builderJourney(book.list(owner),owner);
  assert.throws(()=>book.message(session.id,owner,'child','Next thought'),/Choose Continue chat/);
  book.continueConversation(session.id,owner);
  const raw=book.read(),page=raw.conversationChapters![0];
  assert.deepEqual(page.messages,before.messages);
  assert.deepEqual(page.design,before.design);
  assert.equal(raw.sessions[0].id,before.id);
  assert.equal(raw.sessions[0].rewardProjectId,before.rewardProjectId);
  assert.equal(raw.sessions[0].draft,before.draft);
  assert.deepEqual(raw.sessions[0].design,before.design);
  assert.deepEqual(raw.sessions[0].messages,[]);
  assert.equal(raw.sessions[0].previousConversationId,page.id);
  assert.equal(creationInputFingerprint(book.get(session.id,owner)),fingerprint);
  assert.deepEqual(builderJourney(book.list(owner),owner),progress);
  book.message(session.id,owner,'child','I want one more garden path');
  const reloaded=new StudioNotebook(storage);
  assert.deepEqual(reloaded.get(session.id,owner).messages.slice(0,200),before.messages);
  assert.equal(reloaded.get(session.id,owner).messages.at(-1)!.text,'I want one more garden path');
  assert.equal(reloaded.conversationPage(session.id,owner).count,1);
  assert.ok(creationConversation(reloaded.get(session.id,owner)).some(turn=>turn.text===before.messages[0].text));
});

test('new-game review still grounds its quotes in the original chapter after continuation',()=>{
  const {book,session}=fullConversation();
  const verdict={ready:true,evidence:{action:'Tapping a flower',consequence:'lights a path',experience:'find its home',world:'moon garden'},unresolved:[]};
  book.update(session.id,owner,s=>{s.design!.creationReview=recordCreationReview(s,verdict);s.draft='';});
  assert.equal(creationBuildReadiness(book.get(session.id,owner)).ready,true);
  book.continueConversation(session.id,owner);
  assert.equal(creationBuildReadiness(book.get(session.id,owner)).ready,true);
  book.message(session.id,owner,'child','The moth can rest on each flower.');
  book.update(session.id,owner,s=>{s.design!.creationReview=recordCreationReview(book.withConversation(s),verdict);});
  assert.equal(creationBuildReadiness(book.get(session.id,owner)).ready,true);
  assert.equal(book.get(session.id,owner).design!.plan.style!.origin,'helper');
});

test('ordinary full copies preserve history and can use the separate continuation action',()=>{
  const {book,session}=fullConversation(),source=book.get(session.id,owner);
  const copy=book.fork(session.id,owner,'Independent copy',null,null);
  assert.deepEqual(copy.messages,source.messages);
  book.continueConversation(copy.id,owner);book.message(copy.id,owner,'child','Only in the copy');
  assert.deepEqual(book.get(session.id,owner),source);
  assert.deepEqual(book.get(copy.id,owner).messages.slice(0,200),source.messages);
  assert.equal(book.get(copy.id,owner).messages.at(-1)!.text,'Only in the copy');
});

test('explicit chat erasure preserves chapters referenced by a copy and removes only unreferenced pages',()=>{
  const {book,session}=fullConversation();book.continueConversation(session.id,owner);
  const copied=book.fork(session.id,owner,'Copy with earlier words',null,null);
  const other=book.create('player-two','new','Other child');book.message(other.id,'player-two','child','Their private words');
  book.clearConversation(session.id,owner);
  assert.deepEqual(book.get(session.id,owner).messages,[]);
  assert.equal(book.get(copied.id,owner).messages.length,200);
  assert.equal(book.read().conversationChapters!.length,1);
  book.clearConversation(copied.id,owner);
  assert.deepEqual(book.read().conversationChapters,[]);
  assert.equal(book.get(other.id,'player-two').messages[0].text,'Their private words');
});

test('linked chapters export and restore exactly; corrupt, foreign, cyclic and orphaned pages fail closed',()=>{
  const {storage,book,session}=fullConversation();book.continueConversation(session.id,owner);
  book.message(session.id,owner,'child','Second page');book.continueConversation(session.id,owner);
  const backup=book.read(),restored=new StudioNotebook(new Memory());restored.restore(backup);
  assert.deepEqual(restored.read(),backup);
  assert.deepEqual(restored.get(session.id,owner),book.get(session.id,owner));
  const before=storage.getItem(STUDIO_KEY);
  const wrongOwner=structuredClone(backup);wrongOwner.conversationChapters![0].owner='player-two';
  const cycle=structuredClone(backup);cycle.conversationChapters![0].previousId=cycle.conversationChapters![1].id;
  const missing=structuredClone(backup);missing.sessions[0].previousConversationId='missing';
  const orphan=structuredClone(backup);delete orphan.sessions[0].previousConversationId;
  const secret=structuredClone(backup) as any;secret.conversationChapters[0].previewUrl='https://preview.test/?capability=secret';
  for(const bad of [wrongOwner,cycle,missing,orphan,secret]){assert.throws(()=>book.restore(bad));assert.equal(storage.getItem(STUDIO_KEY),before);}
  assert.throws(()=>book.continueConversation(session.id,'player-two'),/own profile/);
});

test('a failed continuation keeps the current page, draft and retained capacity unchanged',()=>{
  const {storage,book,session}=fullConversation(),before=storage.getItem(STUDIO_KEY),capacity=book.capacity();
  storage.fail=true;assert.throws(()=>book.continueConversation(session.id,owner),/Could not save/);storage.fail=false;
  assert.equal(storage.getItem(STUDIO_KEY),before);
  assert.deepEqual(book.capacity(),capacity);
  assert.equal(book.conversationPage(session.id,owner).count,200);
  assert.equal(book.get(session.id,owner).draft,'My next unsent thought');
});

test('continuation refuses pending builds and maintenance without changing saved data',()=>{
  const {storage,book,session}=fullConversation();
  book.update(session.id,owner,s=>{s.job={id:'build-one',api:'https://workshop.test',status:'building'};});
  const before=storage.getItem(STUDIO_KEY);assert.throws(()=>book.continueConversation(session.id,owner),/Finish or recover/);assert.equal(storage.getItem(STUDIO_KEY),before);
  book.update(session.id,owner,s=>{s.job=null;s.pendingExperiment={parents:[],depth:'tune',origin:'child',baseId:null,prompt:'My idea'};});
  assert.throws(()=>book.continueConversation(session.id,owner),/Finish or recover/);
  book.update(session.id,owner,s=>{s.pendingExperiment=null;});
  setRewardSourceMaintenance(true);
  try{assert.throws(()=>book.continueConversation(session.id,owner),/restoring saved progress/);}finally{setRewardSourceMaintenance(false);}
});

test('capacity distinguishes open projects, put-away projects and retained pages without silently freeing anything',()=>{
  const {storage,book}=fullConversation();fillSessions(book,80);
  assert.deepEqual(book.capacity(),{limit:80,retained:80,active:0,archived:80,chapters:0,available:0});
  const before=storage.getItem(STUDIO_KEY);
  assert.throws(()=>book.create(owner,'new','Another idea'),NotebookCapacityError);
  assert.throws(()=>book.fork('session-0',owner,'Copy',null,null),NotebookCapacityError);
  assert.throws(()=>book.continueConversation('session-0',owner),NotebookCapacityError);
  assert.throws(()=>book.assertMessageCapacity('session-0',owner),NotebookCapacityError);
  assert.throws(()=>book.message('session-0',owner,'child','No hidden room'),NotebookCapacityError);
  assert.equal(storage.getItem(STUDIO_KEY),before);
  book.unarchive('session-0',owner);
  assert.equal(book.capacity().active,1);assert.equal(book.capacity().retained,80);assert.equal(book.capacity().available,0);
  assert.equal(book.get('session-0',owner).messages.length,200);
});

test('continuation consumes one retained slot without increasing the 80-item bound',()=>{
  const {book}=fullConversation();fillSessions(book,79);
  book.continueConversation('session-0',owner);
  assert.equal(book.capacity().retained,80);assert.equal(book.capacity().chapters,1);assert.equal(book.capacity().available,0);
  book.message('session-0',owner,'child','A message on the new page fits');
  assert.throws(()=>book.create(owner,'new','Too many'),NotebookCapacityError);
  assert.equal(book.get('session-0',owner).messages.length,201);
});

test('message preflight leaves room for a whole reply without saving a partial turn',()=>{
  const {storage,book,session}=fullConversation();book.update(session.id,owner,s=>{s.messages=messages(197);});
  const before=storage.getItem(STUDIO_KEY);
  assert.throws(()=>book.assertMessageCapacity(session.id,owner,4),/Continue chat/);
  assert.equal(storage.getItem(STUDIO_KEY),before);
  book.continueConversation(session.id,owner);book.assertMessageCapacity(session.id,owner,4);
});

test('native creation validates and saves the game, notebook reference and welcome together',()=>{
  const storage=new Memory(),saved=start(storage),book=new StudioNotebook(storage),workspace=new RevisionStore(storage);
  assert.equal(workspace.list(owner).length,1);
  assert.equal(book.get(saved.id,owner).projectId,workspace.list(owner)[0].id);
  assert.equal(book.get(saved.id,owner).playOnly,true);
  assert.equal(book.get(saved.id,owner).messages[0].text,'Play first.');
});

test('full notebook preflight prevents an orphan native project and calls no profile saver',()=>{
  const {storage,book}=fullConversation();fillSessions(book,80);
  const before=new Map(storage.values),writes=storage.writes,fg=host();let profileSaves=0;fg.store.save=()=>{profileSaves++;return true;};
  assert.throws(()=>start(storage,fg),NotebookCapacityError);
  assert.deepEqual(storage.values,before);assert.equal(storage.writes,writes);assert.equal(profileSaves,0);
});

test('native workspace capacity is also checked before creating a notebook record',()=>{
  const storage=new Memory(),original=start(storage),workspace=new RevisionStore(storage),snapshot=workspace.snapshot();
  const template=snapshot.projects[0],revision=snapshot.revisions[0];
  for(let index=1;index<50;index++){
    const id='native-'+index,headId='revision-'+index;
    snapshot.projects.push({...template,id,headId});snapshot.revisions.push({...revision,id:headId,projectId:id});
  }
  workspace.restore(JSON.stringify(snapshot));const before=new Map(storage.values);
  assert.throws(()=>start(storage),/not supported/);
  assert.deepEqual(storage.values,before);
  assert.equal(new StudioNotebook(storage).get(original.id,owner).projectId,template.id);
});

for(const existing of [false,true])test(`a notebook write failure restores ${existing?'the prior workspace bytes':'an absent workspace key'}`,()=>{
  const storage=new Memory();if(existing)start(storage);
  const before=new Map(storage.values);let once=true;
  storage.beforeSet=key=>{if(key===STUDIO_KEY&&once){once=false;throw Error('QuotaExceededError');}};
  assert.throws(()=>start(storage),/earlier work is unchanged/);
  assert.deepEqual(storage.values,before);
});

test('local copy stages all native revisions and the full notebook before writing either source',()=>{
  const storage=new Memory(),original=start(storage),book=new StudioNotebook(storage),before=book.get(original.id,owner);
  const draft='My next unsent copy idea';
  book.update(original.id,owner,s=>{s.messages=messages();s.draft=draft;});
  const copied=saveLocalStudioProject(storage,host(),owner,(games,staged)=>{
    const p=games.fork(owner,original.projectId!,'My copy');
    return staged.fork(original.id,owner,'My copy',p.id,null);
  });
  assert.equal(new RevisionStore(storage).list(owner).length,2);
  assert.equal(book.get(copied.id,owner).messages.length,200);
  assert.equal(book.get(copied.id,owner).draft,draft);
  assert.equal(book.get(original.id,owner).projectId,before.projectId);
  book.continueConversation(copied.id,owner);book.message(copied.id,owner,'child','New copy idea');
  assert.equal(book.get(copied.id,owner).messages.length,201);
  assert.equal(new StudioNotebook(storage).get(copied.id,owner).draft,draft);
  assert.equal(book.get(original.id,owner).draft,draft);
});

test('an older unlisted drawing game survives failed notebook recovery and is linked exactly once on retry',()=>{
  const storage=new Memory(),workspace=new RevisionStore(storage),rigId='saved-car-movement';
  const original=workspace.create(owner,'hill','Saved drawing Rally',defaults('hill'),undefined,rigId);
  const before=new Map(storage.values);
  const recover=()=>saveLocalStudioProject(storage,host(),owner,(games,book)=>{
    const saved=games.project(original.id,owner);
    return book.create(owner,'hill',saved.name,saved.id,{message:'Your own drawing is driving this game.'});
  });
  storage.beforeSet=key=>{if(key===STUDIO_KEY)throw Error('QuotaExceededError');};
  assert.throws(recover,/earlier work is unchanged/);
  assert.deepEqual(storage.values,before,'recovery never erases a project retained by an older partial save');
  storage.beforeSet=undefined;
  const recovered=recover(),book=new StudioNotebook(storage);
  assert.deepEqual(workspace.snapshot().projects,[original]);
  assert.equal(workspace.revision(original.id,owner).drawingRigId,rigId);
  assert.equal(book.list(owner).length,1);
  assert.equal(book.get(recovered.id,owner).projectId,original.id);
});

test('compensation preserves another writer’s edit and reports incomplete recovery honestly',()=>{
  const storage=new Memory(),original=start(storage);let otherId='';
  storage.beforeSet=key=>{
    if(key!==STUDIO_KEY)return;
    storage.beforeSet=undefined;
    otherId=new RevisionStore(storage).create(owner,'robot','Another writer').id;
    throw Error('QuotaExceededError');
  };
  assert.throws(()=>start(storage),/recover saved work/);
  const workspace=new RevisionStore(storage);
  assert.equal(workspace.project(otherId,owner).name,'Another writer');
  assert.equal(workspace.project(original.projectId!,owner).name,'My game');
  assert.equal(new StudioNotebook(storage).list(owner).length,1);
});

test('owner changes and intervening writes during preparation fail before committing staged work',()=>{
  const storage=new Memory(),fg=host();
  assert.throws(()=>saveLocalStudioProject(storage,fg,owner,(games,book)=>{
    const p=games.create(owner,'buckets','Staged',defaults('buckets'));
    const s=book.create(owner,'buckets',p.name,p.id);fg.profile.id='player-two';return s;
  }),/Player changed/);
  assert.equal(storage.values.size,0);
  fg.profile.id=owner;
  assert.throws(()=>saveLocalStudioProject(storage,fg,owner,(games,book)=>{
    const p=games.create(owner,'buckets','Staged',defaults('buckets'));
    new RevisionStore(storage).create(owner,'robot','Intervening original');
    return book.create(owner,'buckets',p.name,p.id);
  }),/saved work changed/);
  assert.deepEqual(new RevisionStore(storage).list(owner).map(p=>p.name),['Intervening original']);
  assert.equal(storage.getItem(STUDIO_KEY),null);
});
