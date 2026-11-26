import assert from 'node:assert/strict';
import {test} from 'node:test';
import {pathBlock,pathFromPoints,reusablePaths} from '../src/creation/motion-path';
import {createStarterProject,validateEditableProject,validateGeneratedCreationManifest} from '../src/creation/projects';
import {SceneEngine} from '../src/creation/engine';
import {CreationStore} from '../src/creation/storage';

const drawing='art:image:drawn-moon:'+ 'a'.repeat(64);
function fixture() {
  const scene=createStarterProject('blank');
  scene.actors[0].assetId=drawing;
  const path=pathFromPoints('Moon walk',[{x:0,y:0},{x:20,y:0},{x:20,y:-20}],200);
  scene.programs[0].actions.push(pathBlock(path));
  return {scene,path};
}
test('a named drawing path runs at the same coordinates on either clock cadence',()=>{
  const {scene}=fixture();
  const one=new SceneEngine(scene), stepped=new SceneEngine(scene);
  one.start();stepped.start();
  one.advance(200);stepped.pause();stepped.step(100);stepped.step(100);
  assert.deepEqual(one.snapshot().actors,stepped.snapshot().actors);
  assert.deepEqual([one.snapshot().actors[0].x,one.snapshot().actors[0].y],[420,205]);
  assert.equal(one.snapshot().actors[0].assetId,drawing);
  assert.throws(()=>validateGeneratedCreationManifest(scene));
  assert.throws(()=>pathFromPoints('Empty',[{x:0,y:0}],100));
  const tooLong=structuredClone(scene);Object.assign(tooLong.programs[0].actions[0],{pathName:'x'.repeat(41)});
  assert.throws(()=>validateEditableProject(tooLong));
});
test('paths are copied from an exact owner-scoped Keep; later edits do not retarget the copy',()=>{
  const {scene,path}=fixture();
  const values=new Map<string,string>();
  const store=new CreationStore({getItem:key=>values.get(key)??null,setItem:(k,v)=>{values.set(k,v);}});
  const created=store.create('player1',scene);
  assert.equal(store.keptRevision(created.id,'player1'),null);
  store.keep(created.id,'player1',created.headId);
  const selected=store.keptRevision(created.id,'player1')!;
  assert.equal(selected.id,created.headId);
  const copy=pathBlock(reusablePaths(selected.scene)[0]);
  assert.deepEqual(reusablePaths(selected.scene),[path]);
  const modified=structuredClone(scene);modified.programs[0].actions=[];
  const later=store.save(created.id,'player1',modified,created.headId);
  assert.equal(store.keptRevision(created.id,'player1')!.id,created.headId);
  assert.throws(()=>store.keptRevision(created.id,'player2'));
  store.keep(created.id,'player1',later.id);
  assert.deepEqual(reusablePaths(store.keptRevision(created.id,'player1')!.scene),[]);
  assert.notEqual(copy.id,scene.programs[0].actions[0].id);
  assert.equal(copy.actions.length,2);
  scene.programs[0].actions.push(copy);
  assert.doesNotThrow(()=>validateEditableProject(scene));
});
test('authorship and scene-specific actions stay with their original programs',()=>{
  const {scene}=fixture(),group=scene.programs[0].actions[0];
  assert.ok(group.type==='repeat');
  group.actions[0].origin='assisted';assert.deepEqual(reusablePaths(scene),[]);
  group.actions[0].origin='child';group.actions.push({id:crypto.randomUUID(),type:'say',text:'Hey',durationMs:40});
  assert.deepEqual(reusablePaths(scene),[]);
  group.actions.pop();scene.actors[0].assetId='gem';assert.deepEqual(reusablePaths(scene),[]);
});
