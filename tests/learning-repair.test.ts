import test from 'node:test';
import assert from 'node:assert/strict';
import { createMathAdapter } from '../src/learning/adapter';
import { ensureLearning, profileGrade, selectItem, beginAttempt, submitAnswer } from '../src/learning/engine';
import { selectLanguageItem, beginLanguageAttempt } from '../src/language/engine';
import { generateItem } from '../src/learning/content';
import { generateLanguageItem } from '../src/language/content';
import type { LearnerProfile } from '../src/learning/types';
import { buildSync } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { resolve } from 'node:path';

const profile = (): LearnerProfile => ({ grade: 3, age: 9, focus: 'times8', skills: {}, factTargets: ['mul:8x7', 'mul:8x8'] });
test('parent targets and due reviews persist while leaving room for supporting practice', () => {
  const math = createMathAdapter(), p = profile(), now = Date.UTC(2026, 10, 14);
  const q = math.select(p, now, () => 0);
  assert.equal(q.factId, 'mul:8x7');
  math.record(p, q, true, false, now, 1);
  assert.equal(p.skills['mul:8x7'].dueAt, new Date(now + 86_400_000).toISOString());
  assert.notEqual(math.select(p, now, () => 0).factId, 'mul:8x7');
  const restored = JSON.parse(JSON.stringify(p));
  ensureLearning(restored).selectionCount = 3;
  assert.equal(math.select(restored, now + 2 * 86_400_000, () => 0).factId, 'mul:8x7');
});
test('legacy assisted outcomes preserve attempt count without inventing raw errors', () => {
  const math = createMathAdapter(), p = profile(), q = math.select(p, 0, () => 0);
  math.record(p, q, true, true, 0, 1);
  assert.equal(p.skills[q.factId!].right, 0);
  assert.equal(p.skills[q.factId!].hints, 1);
  math.record(p, q, false, true, 1000, 3);
  assert.equal(p.skills[q.factId!].lastAttempts, 3);
  assert.equal(p.skills[q.factId!].lastIndependent, false);
  assert.equal(p.skills[q.factId!].tries, 2);
  const latest = ensureLearning(p).attempts.at(-1)!;
  assert.equal(latest.answers.length, 0);
  assert.equal(latest.legacy?.rawAnswersAvailable, false);
});

// Execute the real store and its imported engine, compiled as the browser compiles it.
const storeBundle = buildSync({ entryPoints: [resolve('src/legacy/store.js')], bundle: true, write: false, format: 'iife', platform: 'browser' }).outputFiles[0].text;
function loadStore(raw: string) {
  let stored = raw, writes = 0, failWrites = false;
  const window: any = {dispatchEvent:()=>true};
  runInNewContext(storeBundle, { window, CustomEvent:class {constructor(public type:string,public options?:any){}}, console: { warn() {} }, localStorage: {
    getItem: (key:string) => key==='family-game-factory-state-v1'?stored:null,
    setItem: (_key: string, value: string) => { if(failWrites)throw Error('Storage is full'); writes++; stored = value; },
  } });
  window.FG.verifyParentSettings=async()=>{};
  return { store: window.FG.store, get stored() { return stored; }, get writes() { return writes; }, failWrites() { failWrites=true; } };
}
const backup = (learning?: unknown) => JSON.stringify({ version: 1, activeProfile: 'child', feedback: [],
  profiles: [{ id: 'child', name: 'Explorer', age: 8, skills: {}, stats: {}, rate: 0, ...(learning === undefined ? {} : { learning }) }] });

test('missing grade starts at grade 1 rather than inferring school level from age', () => {
  const loaded = loadStore(backup());
  assert.equal(loaded.store.current().grade, 1);
  assert.ok(loaded.store.current().rate >= 1);
  assert.equal(loaded.store.loadError, null);
});
test('unsupported local learning is preserved and cannot be overwritten by startup saves', () => {
  const raw = backup({ version: 99, preserved: 'original data' }), loaded = loadStore(raw);
  assert.equal(loaded.store.current().learning.version, 99);
  assert.match(loaded.store.loadError, /has not been reset or overwritten/);
  assert.equal(loaded.store.recoveryRaw, raw);
  assert.equal(loaded.store.save(), false); assert.equal(loaded.writes, 0); assert.equal(loaded.stored, raw);
  assert.throws(() => loaded.store.restore(backup({ version: 2 })), /invalid or unsupported/);
  assert.equal(loaded.stored, raw);
  loaded.store.restore(backup());
  assert.equal(loaded.store.loadError, null); assert.equal(loaded.store.recoveryRaw, null);
  assert.equal(loaded.store.save(), true); assert.equal(loaded.store.current().grade, 1);
});
test('unreadable local backup remains exportable with all writes blocked', () => {
  const raw = '{broken backup', loaded = loadStore(raw);
  assert.equal(loaded.store.recoveryRaw, raw); assert.equal(loaded.store.save(), false);
  assert.equal(loaded.stored, raw); assert.equal(loaded.writes, 0);
  assert.throws(() => loaded.store.reset(), /preserved progress/);
});


test('every fresh child starts with an explicit safe grade and gentle difficulty', () => {
  const loaded=loadStore('');
  for(const p of loaded.store.data.profiles){
    assert.equal(p.grade,1);assert.equal(p.intensity,'gentle');assert.equal(p.learningSetupComplete,false);
    assert.equal(selectItem(p).grade,1);assert.equal(selectLanguageItem(p).grade,1);
  }
});

test('a missing or malformed grade cannot become grade 4 through age or coercion', () => {
  for(const grade of [undefined,null,-2,5,Infinity,NaN,'4',[],[4],{},true]){
    for(const age of [5,8,12,18,99,Infinity,'11'])assert.equal(profileGrade({grade,age,skills:{}} as any),1);
  }
  for(const grade of [-1,0,1,2,3,4])assert.equal(profileGrade({grade,age:5,skills:{}} as any),grade);
});

test('explicit saved grade, challenge and history survive migration and unrelated settings changes', async () => {
  const p:any={id:'child',name:'Reader',age:8,grade:3,intensity:'stretch',skills:{},stats:{},rate:3};
  const q=generateItem('g3-multiply',{random:()=>.4});
  const attempt=beginAttempt(p,q);submitAnswer(p,attempt.id,String(q.answer));
  const before=JSON.stringify(p.learning);
  const loaded=loadStore(JSON.stringify({version:1,activeProfile:'child',feedback:[],profiles:[p]}));
  assert.equal(loaded.store.current().grade,3);assert.equal(loaded.store.current().intensity,'stretch');
  assert.equal(JSON.stringify(loaded.store.current().learning),before);
  loaded.store.changeProfile({rate:4});
  assert.equal(loaded.store.current().age,8,'changing learning settings never rewrites the child age');
  await loaded.store.changeLearningProfile({grade:1,intensity:'gentle',learningSetupComplete:true});
  assert.equal(JSON.stringify(loaded.store.current().learning),before,'lowering a grade preserves higher-grade evidence');
  const restored=loadStore(loaded.stored);assert.equal(restored.store.current().grade,1);
  assert.equal(restored.store.current().intensity,'gentle');assert.equal(restored.store.current().learningSetupComplete,true);
});

test('grade and difficulty save to the chosen profile only, including backup restore', async () => {
  const loaded=loadStore('');
  await loaded.store.changeLearningProfile({grade:2,intensity:'balanced',learningSetupComplete:true});
  assert.equal(loaded.store.choose('player2'),true);
  assert.equal(loaded.store.current().grade,1);assert.equal(loaded.store.current().intensity,'gentle');
  await loaded.store.changeLearningProfile({grade:4,intensity:'stretch',learningSetupComplete:true});
  const exported=loaded.stored;
  assert.equal(loaded.store.choose('player1'),true);
  assert.equal(loaded.store.current().grade,2);assert.equal(loaded.store.current().intensity,'balanced');
  loaded.store.restore(exported);
  assert.equal(loaded.store.current().grade,4);assert.equal(loaded.store.current().intensity,'stretch');
  const before=loaded.stored;
  await assert.rejects(()=>loaded.store.changeLearningProfile({grade:99}),/listed learning grade/);
  await assert.rejects(()=>loaded.store.changeLearningProfile({grade:'4'}),/listed learning grade/);
  assert.throws(()=>loaded.store.changeProfile({intensity:'random'}),/learning difficulty/);
  assert.equal(loaded.stored,before,'invalid edits cannot change saved settings');
});

test('grade 1 ceiling holds in both subjects for every difficulty despite older higher-grade focus and history', () => {
  for(const intensity of ['gentle','balanced','stretch']){
    const p:any={id:'first-grader',grade:4,age:12,intensity,skills:{},focus:'mul',skillFocus:['g4-fractions'],languageFocus:['g4-reading'],factTargets:['mul:8x8']};
    const older=generateItem('g3-multiply',{random:()=>.2});const attempt=beginAttempt(p,older);submitAnswer(p,attempt.id,String(older.answer));
    p.grade=1;
    const oldHistory=JSON.stringify(p.learning.attempts);
    let seed=19;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
    for(let i=0;i<160;i++){
      const math=selectItem(p,{random}),language=selectLanguageItem(p,{random});
      assert.equal(math.grade,1);assert.equal(language.grade,1);
      if(intensity==='gentle')assert.equal(math.tier,0);
    }
    assert.equal(JSON.stringify(p.learning.attempts),oldHistory);
    assert.throws(()=>beginAttempt(p,older),/outside the selected learning range/);
    const olderLanguage=generateLanguageItem('g4-word-meanings',{random:()=>.2});
    assert.throws(()=>beginLanguageAttempt(p,olderLanguage),/grade scope/);
  }
});


test('failed setup save leaves the previous grade, difficulty and setup state intact', async () => {
  const loaded=loadStore('');loaded.store.save();
  const before=loaded.stored;
  loaded.failWrites();
  await assert.rejects(()=>loaded.store.changeLearningProfile({grade:3,intensity:'stretch',learningSetupComplete:true}),/could not be saved/);
  assert.equal(loaded.store.current().grade,1);assert.equal(loaded.store.current().intensity,'gentle');
  assert.equal(loaded.store.current().learningSetupComplete,false);assert.equal(loaded.stored,before);
});
