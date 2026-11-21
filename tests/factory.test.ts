import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaults, diff, validateConfig } from '../src/runtime/manifests';
import { interpret } from '../src/factory/interpreter';
import {buildPollDelay} from '../src/builder/client';
import { RevisionStore, migrateWorkspace, WORKSPACE_KEY, validateWorkspace } from '../src/factory/workspace';
import { DesignCoach } from '../src/factory/coach';
import { createLifecycle } from '../src/runtime/lifecycle';
import { manifests } from '../src/runtime/manifests';
import type { GamePlugin, GameContext, PlayOutcome } from '../src/runtime/types';
const physicsGum=()=>({...defaults('gum'),qualityVersion:1});
const memory=()=>{const values=new Map<string,string>();return {getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}};};
const outcome:PlayOutcome={game:'buckets',won:true,level:1,title:'Stayed dry',description:'One safe choice',durationMs:900,at:'2026-11-15T00:00:00Z',config:defaults('buckets')};
test('manifest types, ranges, steps and unknown keys fail closed; presets preserve originals',()=>{
 assert.equal(defaults('buckets').bucketCount,3);assert.equal(defaults('dragon','gentle').breathSpeed,.65);
 for(const invalid of [{...defaults('buckets'),bucketCount:99},{...defaults('buckets'),bucketCount:2.5},{...defaults('buckets'),revealSafe:'true'},{...defaults('buckets'),splashMs:NaN},{...defaults('buckets'),script:'alert(1)'},{...defaults('buckets'),mathDifficulty:'easy'}])assert.throws(()=>validateConfig('buckets',invalid));
 assert.equal(diff('buckets',defaults('buckets'),{...defaults('buckets'),bucketCount:4})[0].label,'Number of buckets');
});
test('honest interpreter accepts bounded child language, rejects mixed/novel instructions and out-of-range edits',()=>{
 const intent=interpret('buckets',defaults('buckets'),'Please give me four buckets!');assert.equal(intent.kind,'supported');if(intent.kind==='supported')assert.equal(intent.config.bucketCount,4);
 for(const text of ['Give me four buckets and add a flying dragon','Run this JavaScript: alert(1)','Build a skateboard racing game','Change math difficulty'])assert.equal(interpret('buckets',defaults('buckets'),text).kind,'generation-needed');
 assert.equal(interpret('buckets',defaults('buckets'),'Give me 99 buckets').kind,'invalid');assert.equal(interpret('buckets',defaults('buckets'),'Give me three buckets').kind,'unchanged');
 assert.equal(interpret('gum',physicsGum(),'Give me six gum sticks').kind,'supported');assert.equal(interpret('dragon',defaults('dragon'),'Give the island 120 resilience').kind,'supported');
});
test('seven native game manifests and transactional composed changes stay bounded',()=>{
 assert.equal(Object.keys(manifests).length,7);
 assert.equal(defaults('moon').donutGoal,6);assert.equal(defaults('robot','gentle').robotSpeed,.75);
 assert.throws(()=>validateConfig('moon',{...defaults('moon'),meteorRate:5}));
 assert.throws(()=>validateConfig('robot',{...defaults('robot'),script:true}));
 const composed=interpret('gum',physicsGum(),'Give me 15 gum sticks and make fan stronger');
 assert.equal(composed.kind,'supported');if(composed.kind==='supported'){assert.equal(composed.config.gumBudget,15);assert.equal(composed.config.thrust,1.1);}
 const atomic=interpret('gum',physicsGum(),'Give me 15 gum sticks and make a new universe');
 assert.equal(atomic.kind,'generation-needed');
 const moon=interpret('moon',defaults('moon'),'Make meteors slower and make moon gravity lower');
 assert.equal(moon.kind,'supported');if(moon.kind==='supported'){assert.equal(moon.config.meteorRate,.75);assert.equal(moon.config.moonGravity,.5);}
 const physical=interpret('moon',defaults('moon'),'Add bounce pads and make moon gravity lower');
 assert.equal(physical.kind,'supported');if(physical.kind==='supported')assert.equal(physical.config.bouncePads,true);
 const portal=interpret('robot',defaults('robot'),'Add portals and make robot faster');
 assert.equal(portal.kind,'supported');if(portal.kind==='supported')assert.equal(portal.config.portalEnabled,true);
 const robot=interpret('robot',defaults('robot'),'Make robot faster and hide my path');
 assert.equal(robot.kind,'supported');if(robot.kind==='supported'){assert.equal(robot.config.robotSpeed,1.25);assert.equal(robot.config.showTrail,false);}
});
test('Gem Factory presets and remixes stay within playable settings',()=>{
 assert.deepEqual(defaults('factory'),{orderSize:3,cutterSpeed:1,sparkleBoost:false});
 assert.deepEqual(defaults('factory','gentle'),{orderSize:2,cutterSpeed:.75,sparkleBoost:false});
 assert.deepEqual(defaults('factory','stretch'),{orderSize:5,cutterSpeed:1.25,sparkleBoost:false});
 const change=interpret('factory',defaults('factory'),'Pack 4 gems per order and add extra sparkles');
 assert.equal(change.kind,'supported');if(change.kind==='supported'){assert.equal(change.config.orderSize,4);assert.equal(change.config.sparkleBoost,true);}
 const slower=interpret('factory',defaults('factory'),'Make the cutter slower');
 assert.equal(slower.kind,'supported');if(slower.kind==='supported')assert.equal(slower.config.cutterSpeed,.75);
 assert.equal(interpret('factory',defaults('factory'),'Pack 99 gems per order').kind,'invalid');
 assert.equal(interpret('factory',defaults('factory'),'Turn off learning').kind,'generation-needed');
 assert.throws(()=>validateConfig('factory',{...defaults('factory'),cutterSpeed:0}));
});
test('background build polling slows down rather than querying every quarter-second',()=>{
 assert.equal(buildPollDelay(0),1000);
 assert.equal(buildPollDelay(14999),1000);
 assert.equal(buildPollDelay(15000),3000);
 assert.equal(buildPollDelay(60000),8000);
 assert.equal(buildPollDelay(600000),8000);
});
test('revision DAG preserves alternate futures; undo, compare, fork and reload never overwrite source',()=>{
 const storage=memory(),store=new RevisionStore(storage);const project=store.create('p1','buckets','My game');const root=store.revision(project.id,'p1');
 const a=store.commit(project.id,'p1',{...root.config,bucketCount:4},'Four buckets','It may be harder');store.undo(project.id,'p1');
 const b=store.commit(project.id,'p1',{...root.config,revealSafe:true},'A clue');assert.equal(b.parentId,root.id);assert.equal(store.history(project.id,'p1').length,3);
 store.checkout(project.id,'p1',a.id);const fork=store.fork(project.id,'p1','My fork');store.commit(fork.id,'p1',{...a.config,bucketCount:2},'Two buckets');
 const reloaded=new RevisionStore(storage);assert.equal(reloaded.revision(project.id,'p1').config.bucketCount,4);assert.equal(reloaded.revision(fork.id,'p1').config.bucketCount,2);assert.equal(reloaded.history(fork.id,'p1')[0].sourceRevisionId,a.id);
 assert.throws(()=>store.revision(project.id,'p2'));assert.throws(()=>store.checkout(project.id,'p1',store.revision(fork.id,'p1').id));
});
test('failed writes and invalid restore retain the last working revision and in-memory state',()=>{
 const storage=memory(),store=new RevisionStore(storage),p=store.create('p1','gum','Builder'),before=store.export();storage.setItem=()=>{throw Error('QuotaExceededError')};
 assert.throws(()=>store.commit(p.id,'p1',{...defaults('gum'),extraDecoys:2},'Two decoys'),/last working/);assert.equal(store.export(),before);
 assert.throws(()=>store.restore('{bad'));assert.equal(store.export(),before);
});
test('v1 workspace migration is durable on next save; unrelated original math/progress key is untouched',()=>{
 const storage=memory();storage.setItem('family-game-factory-state-v1','original math evidence');
 storage.setItem(WORKSPACE_KEY,JSON.stringify({version:1,games:[{id:'old-game',owner:'p1',game:'buckets',name:'Old game',config:defaults('buckets')}]}));
 const migrated=new RevisionStore(storage);assert.equal(migrated.snapshot().version,2);migrated.commit('old-game','p1',{...defaults('buckets'),bucketCount:4},'Four');
 assert.equal(JSON.parse(storage.getItem(WORKSPACE_KEY)!).version,2);assert.equal(storage.getItem('family-game-factory-state-v1'),'original math evidence');
 assert.equal(migrateWorkspace(migrated.snapshot()).revisions.length,2);
});
test('invalid DAG, unknown versions, private executable fields and corrupt storage are not silently reset',()=>{
 const storage=memory(),store=new RevisionStore(storage),p=store.create('p1','buckets','Test');const raw=store.snapshot();raw.revisions[0].parentId=raw.revisions[0].id;assert.throws(()=>validateWorkspace(raw),/history/);
 const snapshot=store.snapshot();snapshot.revisions[0].config.exec='evil' as unknown as boolean;assert.throws(()=>validateWorkspace(snapshot));assert.equal(store.revision(p.id,'p1').parentId,null);
 assert.throws(()=>migrateWorkspace({version:99}));storage.setItem(WORKSPACE_KEY,'{bad');assert.throws(()=>new RevisionStore(storage));assert.throws(()=>store.snapshot());assert.equal(storage.getItem(WORKSPACE_KEY),'{bad');
});
test('play evidence must match the revision, coach uses real outcome and supports skip and a testable hypothesis',()=>{
 const store=new RevisionStore(memory()),p=store.create('p1','buckets','Test'),revision=store.revision(p.id,'p1'),coach=new DesignCoach();
 const play=store.record(p.id,'p1',revision.id,outcome);coach.observe(play,revision);assert.match(coach.summary,/won level 1 after 0.9/);assert.match(coach.question(),/notice/);
 store.reflect(play.id,'p1','I saw a star');coach.answer('I saw a star');assert.match(coach.question(),/next change/);coach.answer('Four buckets will be harder');assert.equal(coach.hypothesis,'Four buckets will be harder');assert.equal(coach.question(),'');
 const next=store.commit(p.id,'p1',{...revision.config,bucketCount:4},'Four',coach.hypothesis);const second=store.record(p.id,'p1',next.id,{...outcome,config:next.config,won:false});coach.observe(second,next);assert.match(coach.summary,/one play, not proof/);coach.skip();assert.equal(coach.question(),'');
 assert.throws(()=>store.record(p.id,'p1',next.id,outcome),/match/);
});
test('plugin lifecycle starts once, disposes idempotently, retries and ignores stale/duplicate finishes',()=>{
 let context:GameContext,starts=0,stops=0,nexts=0,retries=0,events=0;
 const plugin:GamePlugin={manifest:manifests.buckets,mount(_target,ctx){starts++;context=ctx;return {next(){nexts++},restart(){retries++},unmount(){stops++},snapshot(){return {bucketCount:ctx.config.bucketCount}}}}};
 const target={replaceChildren(){}} as unknown as HTMLElement;const lifecycle=createLifecycle(plugin,target,defaults('buckets'),'classic',()=>events++);
 lifecycle.start();lifecycle.start();assert.equal(starts,1);context!.finish(outcome);context!.finish(outcome);assert.equal(events,1);lifecycle.next();assert.equal(nexts,1);context!.finish(outcome);assert.equal(events,2);lifecycle.retry();assert.equal(retries,1);lifecycle.dispose();lifecycle.dispose();context!.finish(outcome);assert.equal(events,2);assert.equal(stops,1);assert.equal(lifecycle.snapshot().disposed,true);
});

test('redo follows a selected child without deleting alternate futures and rejects other profiles',()=>{const store=new RevisionStore(memory());const p=store.create('a','buckets','Branches');const a=store.commit(p.id,'a',{...defaults('buckets'),bucketCount:4},'four');store.undo(p.id,'a');const b=store.commit(p.id,'a',{...defaults('buckets'),bucketCount:5},'five');store.undo(p.id,'a');store.redo(p.id,'a',a.id);assert.equal(store.revision(p.id,'a').id,a.id);store.undo(p.id,'a');store.redo(p.id,'a');assert.equal(store.revision(p.id,'a').id,b.id);assert.equal(store.history(p.id,'a').length,3);assert.throws(()=>store.redo(p.id,'someone-else'));});
