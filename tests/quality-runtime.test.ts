import test from 'node:test';
import assert from 'node:assert/strict';
import { createFixedStepper, interpolateBody } from '../src/quality/clock';
import { defaults, validateConfig, playableMechanics } from '../src/runtime/manifests';
import { interpret } from '../src/factory/interpreter';
import { RevisionStore } from '../src/factory/workspace';

test('quality clock: identical simulation time at 30, 60, 120 and 144 display Hz', () => {
  const results = [30,60,120,144].map(hz => {
    const clock = createFixedStepper(); let x = 0, v = 0, time = 0;
    for(let frame=0; frame<hz*10; frame++) clock.advance(1/hz, dt => { v += 9.8*dt; x += v*dt; time += dt; });
    assert.equal(clock.steps,600); assert.ok(Math.abs(time-10)<1e-10); return x;
  });
  assert.ok(results.every(x => x === results[0]));
});
test('quality clock: bounded stall recovery and no accumulated time after a reset', () => {
  const clock = createFixedStepper(); let updates=0;
  clock.advance(20,()=>updates++); assert.equal(updates,5); assert.ok(clock.droppedSeconds>19.9);
  clock.advance(.009,()=>updates++); clock.reset(); clock.advance(.009,()=>updates++); assert.equal(updates,5);
  assert.throws(()=>clock.advance(NaN,()=>{})); assert.throws(()=>clock.advance(-1,()=>{})); assert.throws(()=>createFixedStepper(0));
});
test('quality drawing: interpolation does not mutate authoritative positions',()=>{
  const body={x:4,y:8,angle:2,previousX:2,previousY:4,previousAngle:0};
  assert.deepEqual(interpolateBody(body,.5),{...body,x:3,y:6,angle:1});assert.equal(body.x,4);
  assert.equal(interpolateBody(body,5).x,4);assert.equal(interpolateBody(body,-1).x,2);
});
test('quality compatibility: new workshop uses stickers; old revisions keep their engine',()=>{
  assert.equal(defaults('gum').qualityVersion,2);
  const old=validateConfig('gum',{originalRules:true,gumBudget:10,jointStrength:1,highlightMatches:false,extraDecoys:0});
  assert.equal(old.qualityVersion,0);assert.equal(old.originalRules,true);
  const oldest=validateConfig('gum',{highlightMatches:false,extraDecoys:0});assert.equal(oldest.qualityVersion,0);assert.equal(oldest.originalRules,false);
  assert.equal(interpret('gum',old,'Make gravity lower').kind,'invalid');
  assert.deepEqual(playableMechanics('gum',defaults('gum')).map(x=>x.key),['extraDecoys']);
  assert.deepEqual(playableMechanics('gum',{...defaults('gum'),qualityVersion:1}).map(x=>x.key),['gravity','thrust','gumBudget','jointStrength']);
  for(const game of ['gum','hill','buckets','dragon'] as const)for(const difficulty of ['gentle','classic','stretch'] as const)assert.doesNotThrow(()=>validateConfig(game,defaults(game,difficulty)));
});
test('quality local changes: five successive ride experiments retain earlier settings and saved branches',()=>{
  const memory=new Map<string,string>();const store=new RevisionStore({getItem:k=>memory.get(k)||null,setItem:(k,v)=>{memory.set(k,v)}});
  const project=store.create('explorer','hill','My bouncy ride');const original=store.revision(project.id,'explorer');
  const prompts=['Make wheels bigger','Make springs softer','Make motor stronger','Make car lighter','Make wheels bigger'];
  for(const prompt of prompts){const current=store.revision(project.id,'explorer'),intent=interpret('hill',current.config,prompt);assert.equal(intent.kind,'supported');if(intent.kind==='supported')store.commit(project.id,'explorer',intent.config,prompt);}
  const current=store.revision(project.id,'explorer');assert.equal(current.config.wheelSize,.62);assert.equal(current.config.suspension,3.5);assert.equal(current.config.enginePower,1.2);assert.equal(current.config.chassisMass,.8);
  assert.deepEqual(store.revision(project.id,'explorer',original.id).config,defaults('hill'));assert.equal(store.history(project.id,'explorer').length,6);
  store.keep(project.id,'explorer');store.undo(project.id,'explorer');assert.equal(store.project(project.id,'explorer').keptId,current.id);
  store.redo(project.id,'explorer');assert.equal(store.revision(project.id,'explorer').id,current.id);
  assert.equal(interpret('hill',current.config,'Make wheels bigger and secretly delete my games').kind,'generation-needed');
  assert.equal(interpret('hill',{...current.config,wheelSize:.8},'Make wheels bigger').kind,'invalid');
});
