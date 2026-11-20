import test from 'node:test';
import assert from 'node:assert/strict';
import {RevisionStore,validateWorkspace} from '../src/factory/workspace';
import {defaults} from '../src/runtime/manifests';

test('a saved drawn car retains its immutable art through mechanic edits, history and copies',()=>{
  const data=new Map<string,string>();const store=new RevisionStore({getItem:key=>data.get(key)??null,setItem:(key,value)=>{data.set(key,value);}});
  const first=store.create('player1','hill','My drawn racer',defaults('hill'),undefined,'rig-first');
  const root=store.revision(first.id,'player1');assert.equal(root.drawingRigId,'rig-first');
  const changed=store.commit(first.id,'player1',{...root.config,enginePower:1.5},'More power');assert.equal(changed.drawingRigId,'rig-first');
  const copy=store.fork(first.id,'player1','My second adventure');assert.equal(store.revision(copy.id,'player1').drawingRigId,'rig-first');
  store.undo(first.id,'player1');assert.equal(store.revision(first.id,'player1').id,root.id);assert.equal(store.revision(first.id,'player1').drawingRigId,'rig-first');
  const second=store.create('player1','hill','A new drawing version',defaults('hill'),undefined,'rig-second');assert.equal(store.revision(second.id,'player1').drawingRigId,'rig-second');
  assert.equal(store.revision(copy.id,'player1').drawingRigId,'rig-first','new design does not rewrite another game');
  assert.throws(()=>store.revision(first.id,'player2'),/own profile/);
});
test('native art bindings reject unsupported engines and URL-shaped references',()=>{
  const data=new Map<string,string>();const store=new RevisionStore({getItem:key=>data.get(key)??null,setItem:(key,value)=>{data.set(key,value);}});
  assert.throws(()=>store.create('player1','robot','Wrong engine',defaults('robot'),undefined,'rig-first'),/drawing version/);
  assert.throws(()=>store.create('player1','hill','Unsafe reference',defaults('hill'),undefined,'https://example.test/private.png'),/drawing version/);
  const stock=store.create('player1','hill','Existing stock game');assert.equal(store.revision(stock.id,'player1').drawingRigId,undefined);
  assert.doesNotThrow(()=>validateWorkspace(store.snapshot()));
});
