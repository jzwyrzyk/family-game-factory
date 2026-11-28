import assert from 'node:assert/strict';
import { test, afterEach } from 'node:test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { CreationStore, CREATION_KEY, validateCreationWorkspace } from '../src/creation/storage';
import { createStarterProject, createProjectFromStudio, CREATION_ASSETS, validateEditableProject } from '../src/creation/projects';
import { profileStorage, setAdultWorkspace } from '../src/adult-pilot/storage';
import { StudioNotebook } from '../src/studio/notebook';
import { defaults } from '../src/runtime/manifests';
import { recentCreationObservations } from '../src/creation/progress';

class MemoryStorage implements Storage {
  data=new Map<string,string>();fail=false;
  get length(){return this.data.size;}
  key(i:number){return [...this.data.keys()][i]??null;}
  getItem(k:string){return this.data.get(k)??null;}
  setItem(k:string,v:string){if(this.fail)throw Error('quota');this.data.set(k,v);}
  removeItem(k:string){this.data.delete(k);}
  clear(){this.data.clear();}
}
const copy=<T>(x:T):T=>JSON.parse(JSON.stringify(x));
function fixture(){const storage=new MemoryStorage(),store=new CreationStore(storage);const scene=createStarterProject('dragon');const project=store.create('child-one',scene);return {storage,store,project,scene};}
afterEach(()=>setAdultWorkspace(null));

test('working revisions, explicit Keep and reload preserve distinct pointers',()=>{
  const {storage,store,project,scene}=fixture();assert.equal(project.keptId,null);
  store.keep(project.id,project.owner,project.headId);
  const edit=copy(scene);edit.title='The dragon takes a bow';edit.actors[0].x=400;
  const saved=store.save(project.id,project.owner,edit,project.headId);
  const reopened=new CreationStore(storage).load(project.id,project.owner);
  assert.equal(reopened.project.headId,saved.id);assert.equal(reopened.project.keptId,project.headId);
  assert.equal(reopened.scene.actors[0].x,400);assert.equal(store.history(project.id,project.owner)[0].scene.actors[0].x,560);
  store.keep(project.id,project.owner,saved.id);assert.equal(store.get(project.id,project.owner).keptId,saved.id);
});

test('autosave protects a separate recovery draft without promoting it',()=>{
  const {storage,store,project,scene}=fixture();const edit=copy(scene);edit.actors[0].x=90;
  store.autosave(project.id,project.owner,edit,project.headId);
  const loaded=new CreationStore(storage).load(project.id,project.owner);
  assert.equal(loaded.scene.actors[0].x,560);assert.equal(loaded.draft?.scene.actors[0].x,90);
  assert.equal(loaded.draft?.baseRevisionId,project.headId);assert.equal(loaded.project.keptId,null);assert.equal(store.history(project.id,project.owner).length,1);
  store.save(project.id,project.owner,loaded.draft!.scene,project.headId);
  assert.equal(store.load(project.id,project.owner).draft,null);
});

test('undo, redo and branched experiments never mutate old revisions or a favorite',()=>{
  const {store,project,scene}=fixture();const first=copy(scene);first.title='First experiment';
  const r1=store.save(project.id,project.owner,first,project.headId);store.keep(project.id,project.owner,r1.id);
  const second=copy(first);second.title='Second experiment';const r2=store.save(project.id,project.owner,second,r1.id);
  store.undo(project.id,project.owner,r2.id);assert.equal(store.load(project.id,project.owner).scene.title,first.title);
  const third=copy(first);third.title='Another direction';const r3=store.save(project.id,project.owner,third,r1.id);
  assert.equal(r3.parentId,r1.id);assert.equal(store.get(project.id,project.owner).keptId,r1.id);
  store.undo(project.id,project.owner,r3.id);store.redo(project.id,project.owner,r2.id,r1.id);
  assert.equal(store.get(project.id,project.owner).headId,r2.id);
  assert.equal(store.history(project.id,project.owner).length,4);
});

test('copy pins its source and keeps actors independent',()=>{
  const {store,project}=fixture();const other=store.copy(project.id,project.owner,'My separate story');
  const loaded=store.load(other.id,other.owner);assert.equal(other.keptId,null);assert.equal(loaded.scene.provenance?.sourceRevisionId,project.headId);
  assert.equal(loaded.scene.provenance?.sourceProjectId,project.id);assert.equal(loaded.revision.sourceRevisionId,project.headId);
  loaded.scene.actors[0].x=15;store.save(other.id,other.owner,loaded.scene,other.headId);
  assert.equal(store.load(project.id,project.owner).scene.actors[0].x,560);
  store.remove(project.id,project.owner);assert.equal(store.load(other.id,other.owner).scene.actors[0].x,15);
});

test('different children cannot read, mutate, copy or delete one another’s creation',()=>{
  const {storage,store,project,scene}=fixture(),before=storage.getItem(CREATION_KEY);
  assert.deepEqual(store.list('child-two'),[]);
  for(const operation of [()=>store.load(project.id,'child-two'),()=>store.keep(project.id,'child-two'),()=>store.copy(project.id,'child-two'),()=>store.remove(project.id,'child-two'),()=>store.save(project.id,'child-two',scene,project.headId),()=>store.autosave(project.id,'child-two',scene,project.headId)])assert.throws(operation,/own profile/);
  assert.equal(storage.getItem(CREATION_KEY),before);
});

test('a profile switch invalidates late saves, and adult data uses the existing namespace',()=>{
  const raw=new MemoryStorage();let owner='child-one';const store=new CreationStore(profileStorage(raw),()=>owner);
  const scene=createStarterProject('robot'),project=store.create(owner,scene);owner='child-two';
  assert.throws(()=>store.autosave(project.id,'child-one',scene,project.headId),/Player changed/);
  const adult='adult:11111111-2222-3333-4444-555555555555';setAdultWorkspace(adult);owner=adult;
  assert.deepEqual(store.list(owner),[]);const adultScene=store.create(owner,createStarterProject('buckets'));
  assert.ok(raw.getItem(`family-game-factory-adult:${adult}:${CREATION_KEY}`));
  setAdultWorkspace(null);owner='child-one';assert.equal(store.list(owner).length,1);
  assert.throws(()=>store.load(adultScene.id,owner),/own profile/);assert.equal(store.get(project.id,owner).id,project.id);
});

test('concurrent stores reread and stale writes cannot replace a newer experiment',()=>{
  const {storage,store,project,scene}=fixture(),other=new CreationStore(storage);
  const edited=copy(scene);edited.title='Newer edit';store.save(project.id,project.owner,edited,project.headId);
  const before=storage.getItem(CREATION_KEY);
  assert.throws(()=>other.save(project.id,project.owner,scene,project.headId),/changed elsewhere/);
  assert.throws(()=>other.autosave(project.id,project.owner,scene,project.headId),/changed elsewhere/);
  assert.throws(()=>other.keep(project.id,project.owner,project.headId),/changed elsewhere/);
  assert.equal(storage.getItem(CREATION_KEY),before);
});

test('failed writes leave the stored graph and working pointer intact',()=>{
  const {storage,store,project,scene}=fixture(),before=storage.getItem(CREATION_KEY);storage.fail=true;
  assert.throws(()=>store.save(project.id,project.owner,scene,project.headId),/Could not save/);
  assert.throws(()=>store.autosave(project.id,project.owner,scene,project.headId),/Could not save/);
  assert.throws(()=>store.keep(project.id,project.owner),/Could not save/);
  assert.equal(storage.getItem(CREATION_KEY),before);assert.equal(store.get(project.id,project.owner).headId,project.headId);
});

test('corrupt and future schemas remain exportable and are never silently reset',()=>{
  for(const raw of ['{incomplete','{"schema":"jems.creation.workspace.v99"}']){
    const storage=new MemoryStorage();storage.setItem(CREATION_KEY,raw);const store=new CreationStore(storage);
    assert.equal(store.recoveryRaw,raw);assert.throws(()=>store.read(),/unsupported|damaged/);
    assert.throws(()=>store.create('child-one',createStarterProject('blank')));assert.throws(()=>store.reset());
    assert.equal(storage.getItem(CREATION_KEY),raw);
  }
});

test('backup validation rejects broken history, source tampering and untrusted assets atomically',()=>{
  const {storage,store,project,scene}=fixture(),before=storage.getItem(CREATION_KEY);
  const cycle=store.read();cycle.revisions[0].parentId=cycle.revisions[0].id;assert.throws(()=>store.restore(cycle),/unsupported|damaged/);
  const foreign=store.read();foreign.revisions[0].scene.actors[0].assetId='external-secret-url';assert.throws(()=>store.restore(foreign),/artwork/);
  const url=store.read();(url.revisions[0].scene.actors[0] as any).url='https://example.invalid/private';assert.throws(()=>store.restore(url),/Unknown field/);
  const tampered=copy(scene);tampered.provenance={createdBy:'child',sourceProjectId:'other-child'};assert.throws(()=>store.save(project.id,project.owner,tampered,project.headId),/source.*cannot/i);
  const bad=store.read();(bad as any).credential='not-real';assert.throws(()=>validateCreationWorkspace(bad),/unsupported|damaged/);
  assert.equal(storage.getItem(CREATION_KEY),before);
});

test('backup round trip retains drafts, kept edition, source and challenge observations',()=>{
  const storage=new MemoryStorage(),store=new CreationStore(storage),scene=createStarterProject('robot');
  const project=store.create('child-one',scene,{challengeId:'repeat-route'});store.keep(project.id,project.owner);
  store.recordAttempt(project.id,project.owner,project.headId,{challengeId:'repeat-route',passed:false,hintUsed:true});
  const edited=copy(scene);edited.title='Try again';store.autosave(project.id,project.owner,edited,project.headId);
  const target=new CreationStore(new MemoryStorage());target.restore(JSON.parse(JSON.stringify(store.export())));
  assert.deepEqual(target.export(),store.export());assert.equal(target.attempts(project.id,project.owner)[0].hintUsed,true);
  assert.throws(()=>target.recordAttempt(project.id,project.owner,project.headId,{challengeId:'different',passed:true,hintUsed:false}),/does not belong/);
  const changed=target.save(project.id,project.owner,edited,project.headId);
  assert.throws(()=>target.recordAttempt(project.id,project.owner,project.headId,{challengeId:'repeat-route',passed:true,hintUsed:false}),/changed elsewhere/);
  assert.notEqual(changed.id,project.headId);
});

test('removing one owner preserves the other child’s complete history',()=>{
  const {store,project}=fixture();const second=store.create('child-two',createStarterProject('buckets'));
  store.removeOwner(project.owner);assert.deepEqual(store.list(project.owner),[]);assert.equal(store.load(second.id,second.owner).scene.actors.length,3);
  store.reset();assert.deepEqual(store.read().projects,[]);
});

test('revealed challenge support survives reload, checks, and challenge copies',()=>{
  const storage=new MemoryStorage(),store=new CreationStore(storage),scene=createStarterProject('robot');
  const project=store.create('child-one',scene,{challengeId:'repeat-route'});
  assert.throws(()=>store.markHintUsed(project.id,'child-two'),/own profile/);
  store.markHintUsed(project.id,project.owner);
  const reopened=new CreationStore(storage);assert.equal(reopened.load(project.id,project.owner).project.hintUsed,true);
  const attempt=reopened.recordAttempt(project.id,project.owner,project.headId,{challengeId:'repeat-route',passed:true,hintUsed:false});
  assert.equal(attempt.hintUsed,true);
  const copied=reopened.copy(project.id,project.owner);assert.equal(copied.hintUsed,true);assert.equal(copied.challengeId,'repeat-route');
  assert.equal(reopened.recordAttempt(copied.id,copied.owner,copied.headId,{challengeId:'repeat-route',passed:false,hintUsed:false}).hintUsed,true);
  const detached=reopened.copy(project.id,project.owner,undefined,{detachChallenge:true});
  assert.equal(detached.challengeId,undefined);assert.equal(detached.hintUsed,undefined);
  assert.deepEqual(reopened.load(detached.id,detached.owner).scene.programs,scene.programs);
  assert.equal(reopened.load(detached.id,detached.owner).scene.provenance?.sourceRevisionId,project.headId);
  const invalid=reopened.export();(invalid.projects[0] as any).hintUsed='yes';assert.throws(()=>reopened.restore(invalid),/unsupported|damaged/);
});

test('visible observations are owner scoped, bounded and tied to the checked version',()=>{
  const storage=new MemoryStorage();let owner='child-one';const store=new CreationStore(profileStorage(storage),()=>owner);
  const scene=createStarterProject('robot','The checked title'),project=store.create(owner,scene,{challengeId:'repeat-route'});
  for(let i=0;i<7;i++)store.recordAttempt(project.id,owner,project.headId,{challengeId:'repeat-route',passed:i%2===0,hintUsed:false});
  const data=store.read();data.attempts.forEach((attempt,i)=>{attempt.checkedAt=`2026-11-19T12:00:0${i}.000Z`;});store.restore(data);
  store.save(project.id,owner,{...scene,title:'Later renamed scene'},project.headId);
  owner='child-two';const second=store.create(owner,createStarterProject('dragon','Other child private title'),{challengeId:'repeat-route'});
  store.recordAttempt(second.id,owner,second.headId,{challengeId:'repeat-route',passed:true,hintUsed:true});
  assert.throws(()=>recentCreationObservations(store,'child-one'),/Player changed/);
  owner='child-one';const observations=recentCreationObservations(store,owner);
  assert.equal(observations.length,5);assert.ok(observations.every(item=>item.projectId===project.id&&item.title==='The checked title'));
  assert.equal(observations[0].checkedAt,'2026-11-19T12:00:06.000Z');assert.equal(observations[4].checkedAt,'2026-11-19T12:00:02.000Z');
  assert.ok(observations.every(item=>!item.hintUsed));
  const adult='adult:11111111-2222-3333-4444-555555555555';setAdultWorkspace(adult);owner=adult;
  assert.deepEqual(recentCreationObservations(store,owner),[]);
});

test('curated adapters retain real assets, exact source revision and usable source settings',()=>{
  const memory=new MemoryStorage(),notebook=new StudioNotebook(memory);
  for(const game of ['dragon','buckets','robot'] as const){
    const session=notebook.create('child-one',game,'My saved game',`project-${game}`);
    const config=defaults(game);if(game==='buckets')config.bucketCount=5;if(game==='robot')config.robotSpeed=2;
    const scene=createProjectFromStudio(session,{id:`revision-${game}`,projectId:session.projectId!,config});
    assert.equal(scene.provenance?.sourceProjectId,session.projectId);assert.equal(scene.provenance?.sourceRevisionId,`revision-${game}`);
    assert.notEqual(scene.id,session.projectId);validateEditableProject(scene);
    if(game==='dragon')assert.equal(scene.actors[0].assetId,'dragon');
    if(game==='buckets')assert.equal(scene.actors.length,5);
    if(game==='robot')assert.equal((scene.programs[0].actions[0] as {durationMs:number}).durationMs,220);
    assert.throws(()=>createProjectFromStudio(session,{id:'wrong',projectId:'other',config}),/saved version/);
  }
  for(const asset of CREATION_ASSETS)if(asset.url)assert.ok(existsSync(resolve('public',asset.url)),`Bundled artwork exists: ${asset.id}`);
});

test('generated game import needs an actual validated manifest, never inferred JavaScript',()=>{
  const notebook=new StudioNotebook(new MemoryStorage()),session=notebook.create('child-one','new','My own story');session.remoteId='remote-revision';
  assert.throws(()=>createProjectFromStudio(session),/does not include an editable scene/);
  const source=createStarterProject('dragon'),scene=createProjectFromStudio(session,undefined,source);
  assert.notEqual(scene.id,source.id);assert.equal(scene.provenance?.sourceRevisionId,'remote-revision');assert.equal(scene.provenance?.createdBy,'assisted');
  const injected=copy(source);(injected as any).source='console.log("not executed")';assert.throws(()=>createProjectFromStudio(session,undefined,injected),/Unknown field/);
});

test('using a kept world pins the selected revision while later edits and drafts stay with the source', () => {
  const {store, project, scene} = fixture();
  store.keep(project.id, project.owner, project.headId);
  const changed = copy(scene);
  changed.background = 'night';
  changed.actors[0].size = 52;
  const later = store.save(project.id, project.owner, changed, project.headId);
  store.autosave(project.id, project.owner, {...changed, title:'Working draft'}, later.id);

  const reused = store.copy(project.id, project.owner, undefined, {keptRevisionId:project.headId, detachChallenge:true});
  const reopened = store.load(reused.id, project.owner);
  assert.equal(reopened.scene.provenance?.sourceRevisionId, project.headId);
  assert.equal(reopened.scene.background, scene.background);
  assert.deepEqual(reopened.scene.actors, scene.actors);
  assert.deepEqual(reopened.scene.programs, scene.programs);
  assert.equal(reopened.project.keptId, null);
  assert.equal(store.load(project.id, project.owner).draft?.scene.title, 'Working draft');
  assert.throws(() => store.copy(project.id, 'another-owner', undefined, {keptRevisionId:project.headId}));

  store.keep(project.id, project.owner, later.id);
  assert.throws(() => store.copy(project.id, project.owner, undefined, {keptRevisionId:project.headId}), /kept world changed/);
});
