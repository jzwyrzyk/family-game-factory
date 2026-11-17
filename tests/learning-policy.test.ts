import test from 'node:test';
import assert from 'node:assert/strict';
import { interpretMathRequest, interpretLearningRequest, learningFormatLabel, LEARNING_MODES, modeFor, setMode } from '../src/learning/policy';
import { createLifecycle } from '../src/runtime/lifecycle';
import { defaults, manifests } from '../src/runtime/manifests';
import type { GameContext, GamePlugin } from '../src/runtime/types';
import type { LearnerProfile } from '../src/learning/types';

test('required math allows three per-game formats and no off state; ownership stays with the profile',()=>{
 const a:LearnerProfile={id:'a',skills:{}},b:LearnerProfile={id:'b',skills:{}};
 assert.equal(modeFor(a,'dragon'),'checkpoint');
 for(const mode of LEARNING_MODES){setMode(a,'dragon',mode);assert.equal(modeFor(a,'dragon'),mode);assert.equal(modeFor(a,'gum'),'checkpoint');assert.equal(modeFor(b,'dragon'),'checkpoint');}
 for(const value of ['off','none','',null,false,0])assert.throws(()=>setMode(a,'dragon',value),/Math stays part/);
 for(const key of ['__proto__','constructor','prototype','x'.repeat(161),'<script>'])assert.throws(()=>setMode(a,key,'both'));
 assert.equal(modeFor({skills:{},mathModes:{dragon:'off' as never}},'dragon'),'checkpoint');
});

test('explicit child requests switch the format while attempts to remove all math remain bounded',()=>{
 for(const prompt of ['Remove math','Turn off the math','No arithmetic please','Skip all maths','Make this game without math','Never show learning questions'])assert.equal(interpretMathRequest(prompt)?.kind,'required',prompt);
 for(const [prompt,mode] of [['Use math at checkpoints','checkpoint'],['Math between rounds please','checkpoint'],['Put math inside the game','interaction'],['Math without popups','interaction'],['Use both types of math','both'],['Mix math at pauses and inside the game','both']] as const)assert.deepEqual(interpretMathRequest(prompt),{kind:'mode',mode});
 for(const prompt of ['Give me four buckets','Remove the red blocks','Make multiplication easier','I love math','Build a math game with no score.','Create a math game with no losing','Make a math adventure with both a dragon and a robot','Build my game. Approved game plan: no score, math at checkpoints'])assert.equal(interpretMathRequest(prompt),null,prompt);
});

test('safe lifecycle pauses freeze controls, exclude learning time and cannot revive a disposed game',()=>{
 let playing=true,pauses=0,resumes=0,context:GameContext;
 const plugin:GamePlugin={manifest:manifests.gum,mount(_target,ctx){context=ctx;return {next(){playing=true},restart(){playing=true},unmount(){playing=false},isPlaying(){return playing},pause(){if(!playing)return false;playing=false;pauses++;return true},resume(){playing=true;resumes++}}}};
 const target={inert:false,replaceChildren(){}} as unknown as HTMLElement;
 const lifecycle=createLifecycle(plugin,target,defaults('gum'),'classic',()=>{});
 lifecycle.start();assert.equal(lifecycle.isPlaying(),true);assert.equal(lifecycle.pause(),true);assert.equal(target.inert,true);assert.equal(lifecycle.isPlaying(),false);assert.equal(lifecycle.pause(),false);assert.equal(pauses,1);
 lifecycle.resume();assert.equal(target.inert,false);assert.equal(lifecycle.isPlaying(),true);const prior=resumes;lifecycle.resume();assert.equal(resumes,prior);
 context!.finish({won:true,level:1,title:'Done',description:'Done'});assert.equal(lifecycle.pause(),false);
 lifecycle.next();assert.equal(lifecycle.isPlaying(),true);lifecycle.pause();lifecycle.dispose();assert.equal(target.inert,false);assert.equal(lifecycle.isPlaying(),false);assert.equal(lifecycle.pause(),false);
});

test('Language Arts prompt policy preserves mandatory checkpoints without hijacking game creativity or Math legacy behavior',()=>{
  for(const phrase of ['No reading please','Remove all english','Turn off language arts','Skip learning','Make a game without learning questions','No checkpoints','Give me math instead of English','Switch the learning subject to math']){
    const result=interpretLearningRequest(phrase,'language');
    assert.equal(result?.kind,'required',phrase);
    assert.match((result as {message:string}).message,/Language Arts checkpoints/);
  }
  for(const [phrase,mode] of [
    ['Language at checkpoints','checkpoint'],
    ['Reading between rounds','checkpoint'],
    ['Build words with word tiles inside the game','interaction'],
    ['Put spelling inside the game','interaction'],
    ['Mix reading and word activities','both'],
  ] as const){
    assert.deepEqual(interpretLearningRequest(phrase,'language'),{kind:'mode',mode});
    assert.ok(learningFormatLabel('language',mode).length>8);
  }
  for(const phrase of [
    'Remove all math','Take the math away',
    'Make a game where a dragon eats words',
    'Create a game with reading and a cat',
    "Don't remove reading",
    'Make this game with a letter maze',
    'Build a math game with a word dragon',
    'I love reading',
  ]){
    assert.equal(interpretLearningRequest(phrase,'language'),null,phrase);
  }
  assert.equal(interpretLearningRequest('Remove math','math')?.kind,'required');
  assert.deepEqual(interpretLearningRequest('Use math at checkpoints','math'),{kind:'mode',mode:'checkpoint'});
});
