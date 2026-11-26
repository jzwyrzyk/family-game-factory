import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {SCENE_WORLDS} from '../src/creation/model';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createStarterProject,parsePrivateArtId,privateArtId,validateEditableProject,validateGeneratedCreationManifest} from '../src/creation/projects';
import {CreationStore,CREATION_KEY,validateCreationWorkspace} from '../src/creation/storage';
import {SceneEngine} from '../src/creation/engine';
import {privateArtReferences,unionOriginalArtPixels} from '../src/creation/private-art';

class MemoryStorage {
  private data=new Map<string,string>();
  getItem(key:string){return this.data.get(key)??null;}
  setItem(key:string,value:string){this.data.set(key,value);}
}
const image=privateArtId({kind:'image',id:'fixture-drawing',sha256:'a'.repeat(64)});
const rig=privateArtId({kind:'rig',id:'fixture-rig',sha256:'b'.repeat(64)});
const sceneWith=(assetId=image)=>{
  const scene=createStarterProject('blank','My own art scene');scene.actors[0].assetId=assetId;
  scene.programs[0].actions=[{id:'move-own-art',type:'move',dx:80,durationMs:400,origin:'child'}];
  return scene;
};

test('overlapping cutouts preserve original translucent color and opacity',()=>{
  const original=new Uint8ClampedArray([139,62,209,128,240,190,55,64,30,40,50,0]);
  const firstMask=new Uint8ClampedArray([1,2,3,128,4,5,6,20,7,8,9,255]);
  const secondMask=new Uint8ClampedArray([250,250,250,128,0,0,0,255,255,255,255,255]);
  const initial=unionOriginalArtPixels(original,firstMask);
  assert.deepEqual([...initial],[139,62,209,128,240,190,55,20,30,40,50,0]);
  assert.deepEqual([...unionOriginalArtPixels(original,secondMask,initial)],[...original]);
  assert.equal(initial[3],128,'two half-opacity cutouts must not become 75% opaque');
  assert.deepEqual([...original],[139,62,209,128,240,190,55,64,30,40,50,0]);
  assert.throws(()=>unionOriginalArtPixels(original,new Uint8ClampedArray(4)),/match/);
});

test('private asset references are bounded opaque IDs, never URLs or executable strings',()=>{
  assert.deepEqual(parsePrivateArtId(image),{kind:'image',id:'fixture-drawing',sha256:'a'.repeat(64)});
  assert.deepEqual(parsePrivateArtId(rig),{kind:'rig',id:'fixture-rig',sha256:'b'.repeat(64)});
  for(const id of ['https://example.invalid/art.png','data:image/png;base64,abc','blob:local','art:image:../../other:'+ 'a'.repeat(64),'art:image:x:'+ 'A'.repeat(64),'art:script:x:'+ 'a'.repeat(64),'art:image:'+ 'x'.repeat(101)+':'+ 'a'.repeat(64),'art:image:x:short','art:image:__proto__:'+ 'a'.repeat(64),'art:rig:constructor:'+ 'a'.repeat(64)]){
    assert.equal(parsePrivateArtId(id),null,id);
    assert.throws(()=>validateEditableProject(sceneWith(id)));
  }
});

test('restored 100-character art IDs save and reload without widening other scene IDs',()=>{
  for(const kind of ['image','rig'] as const){
    const long=privateArtId({kind,id:'legacy-'+ 'x'.repeat(93),sha256:'e'.repeat(64)});
    assert.ok(long.length>160);
    const storage=new MemoryStorage(),store=new CreationStore(storage),project=store.create('player1',sceneWith(long));
    store.keep(project.id,'player1');
    const restored=new CreationStore(storage).load(project.id,'player1');
    assert.equal(restored.scene.actors[0].assetId,long);
    assert.equal(restored.project.keptId,project.headId);
    assert.throws(()=>validateGeneratedCreationManifest(restored.scene),/artwork/);
    const bad=sceneWith(long);bad.id='p'.repeat(161);
    assert.throws(()=>validateEditableProject(bad),/project ID/);
    const badActor=sceneWith(long);badActor.actors[0].id='a'.repeat(161);
    assert.throws(()=>validateEditableProject(badActor),/character ID/);
  }
});

test('local drawings are allowed in stored scenes but rejected at every generated manifest boundary',()=>{
  for(const ref of [image,rig]){
    assert.equal(validateEditableProject(sceneWith(ref)).actors[0].assetId,ref);
    assert.throws(()=>validateGeneratedCreationManifest(sceneWith(ref)),/artwork/);
    assert.throws(()=>validateEditableProject(sceneWith(ref),{allowPrivateArt:false}),/artwork/);
  }
  assert.equal(validateGeneratedCreationManifest(createStarterProject('robot')).actors[0].assetId,'robot');
});

test('two scenes and copies pin the same art version without sharing editable behavior',()=>{
  const storage=new MemoryStorage(),store=new CreationStore(storage),one=store.create('player1',sceneWith()),two=store.create('player1',sceneWith());
  const earlier=store.load(one.id,'player1').scene,changed=store.load(one.id,'player1').scene;
  changed.actors[0].assetId=rig;changed.actors[0].x=50;
  store.save(one.id,'player1',changed,one.headId);
  assert.equal(earlier.actors[0].assetId,image);
  assert.equal(store.history(one.id,'player1')[0].scene.actors[0].assetId,image);
  assert.equal(store.load(two.id,'player1').scene.actors[0].assetId,image);
  const copied=store.copy(two.id,'player1');
  assert.equal(store.load(copied.id,'player1').scene.actors[0].assetId,image);
  assert.equal(store.get(one.id,'player1').keptId,null);
  assert.deepEqual(validateCreationWorkspace(JSON.parse(storage.getItem(CREATION_KEY)!)),store.read());
});

test('private art does not grant profile access, challenge credit, or an interpreter capability',()=>{
  const store=new CreationStore(new MemoryStorage()),project=store.create('player1',sceneWith());
  assert.throws(()=>store.load(project.id,'player2'),/own profile/);
  assert.deepEqual(store.attempts(project.id,'player1'),[]);
  assert.deepEqual(store.pendingRewards('player1'),[]);
  const engine=new SceneEngine(store.load(project.id,'player1').scene);engine.start();engine.advance(400);
  assert.equal(engine.snapshot().actors[0].x,480);
  assert.equal(engine.snapshot().actors[0].assetId,image);
  const invalid=sceneWith();(invalid.actors[0] as any).url='https://example.invalid/private.png';
  assert.throws(()=>store.create('player1',invalid),/Unknown field/);
});

test('a scene role survives storage without assigning physics or changing the original pin', () => {
  const source = sceneWith();
  const tagged = structuredClone(source);
  tagged.actors[0].role = 'obstacle';
  assert.equal(validateEditableProject(tagged).actors[0].role, 'obstacle');
  const run = (scene: typeof tagged) => {
    const engine = new SceneEngine(scene);
    engine.start();
    engine.advance(400);
    const actor = engine.snapshot().actors[0];
    return [actor.x, actor.y, actor.assetId];
  };
  assert.deepEqual(run(tagged), run(source));
  assert.throws(() => validateEditableProject({...tagged, actors: [{...tagged.actors[0], role:'force-field'}]}));
});

test('a derivative traces to its original across exact owner and parent hashes', async () => {
  const { originalFor } = await import('../src/assets/art-lineage');
  const root = {id:'root', owner:'maker', sha256:'a'.repeat(64)};
  const parent = {...root,id:'parent',sha256:'b'.repeat(64),sourceId:root.id,sourceSha256:root.sha256};
  const child = {...parent,id:'child',sourceId:parent.id,sourceSha256:parent.sha256};
  const images = new Map<string, Pick<import('../src/assets/private-drawings').Drawing, 'id'|'owner'|'sha256'|'sourceId'|'sourceSha256'>>([root,parent,child].map(image => [image.id,image]));
  assert.equal(originalFor(child,images).id,root.id);
  assert.throws(() => originalFor({...child,owner:'another'},images));
  assert.throws(() => originalFor({...child,sourceSha256:root.sha256},images));
  assert.throws(() => originalFor({...child,sourceId:child.id},images));
});

test('world illustrations pin approved bytes and legacy scenes retain their saved background',()=>{
  for(const world of SCENE_WORLDS.filter(world=>!world.middle)){
    const bytes=readFileSync(new URL('../public/'+world.url.slice(2),import.meta.url));
    assert.ok(createHash('sha256').update(bytes).digest('hex').startsWith(world.id.split('-').at(-1)!));
  }
  const scene=createStarterProject('robot');
  assert.equal(scene.world?.assetId,SCENE_WORLDS[1].id);
  delete scene.world;
  assert.equal(validateEditableProject(scene).world,undefined);
  assert.equal(validateEditableProject(scene).background,'workshop');
});

test('a private world uses the same pinned source without adding an actor or granting generated access',()=>{
  const scene=createStarterProject('blank');
  scene.world={assetId:image,framing:'fit'};
  assert.deepEqual(privateArtReferences(scene),[image]);
  assert.equal(validateEditableProject(scene).actors.length,1);
  assert.throws(()=>validateGeneratedCreationManifest(scene),/Private world/);
  for(const bad of [{assetId:rig,framing:'fit'},{assetId:'https://example.invalid/art.png',framing:'fill'},{assetId:image,framing:'stretch'}]){
    assert.throws(()=>validateEditableProject({...scene,world:bad}));
  }
  const store=new CreationStore(new MemoryStorage()),entry=store.create('player1',scene);
  const initial=store.load(entry.id,'player1');
  scene.world={assetId:SCENE_WORLDS[0].id,framing:'fill'};
  store.save(entry.id,'player1',scene,initial.revision.id);
  assert.equal(store.history(entry.id,'player1').find(r=>r.id===initial.revision.id)?.scene.world?.assetId,image);
});
