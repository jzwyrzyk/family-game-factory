import {test} from 'node:test';
import assert from 'node:assert/strict';
import {draftChildIntentContract, type ChildIntentContract} from '../server/quality/child-intent';
import {
 chooseGameForm,validateGameFormDecision,GAME_FORM_VERSION,
 type TrustedExistingForm,type GameFormDecision,type GameInputMode
} from '../server/quality/game-form';

const choose=(raw:string,existing?:{revisionId:string;simulation:TrustedExistingForm['simulation'];interaction?:GameInputMode})=>
  chooseGameForm(draftChildIntentContract(raw,existing?{projectId:'family-project',baseRevisionId:existing.revisionId}:{}),existing);

test('O2: sticker construction + visible launch uses 2D rule-driven drag, not physics',()=>{
  const text='Make a game where you put socks together with bubble gum and then press Launch to blast off!';
  const d=choose(text);
  assert.equal(d.version,GAME_FORM_VERSION);
  assert.equal(d.status,'proposed-not-child-confirmed');
  assert.equal(d.disposition,'candidate');
  assert.equal(d.rendering,'2d-canvas');
  assert.equal(d.simulation,'rule-driven');
  assert.equal(d.primaryInput,'drag-and-drop');
  assert.ok(d.additionalInputs.includes('tap-and-react'));
  assert.ok(d.pendingChecks.some(t=>t.includes('visible game-state change')));
  assert.ok(d.pendingChecks.some(t=>t.includes('Saved versions')));
  assert.equal(d.evidence.some(e=>e.signal==='physics-needed'),false);
  assert.equal(d.evidence.every(e=>text.slice(e.source.start,e.source.end)===e.source.quote),true);
  assert.deepEqual(validateGameFormDecision(d,draftChildIntentContract(text)),d);
});

test('O2: robot grid is not a 3D or physics game and cat growth is arcade rules',()=>{
  const grid=choose('Make a robot route puzzle with arrow commands on a grid.');
  assert.equal(grid.primaryInput,'grid-commands');
  assert.equal(grid.simulation,'rule-driven');
  assert.equal(grid.rendering,'2d-canvas');
  const cat=choose('Make a cat eat donuts on the moon and grow bigger and explode into stars.');
  assert.equal(cat.primaryInput,'arcade');
  assert.equal(cat.simulation,'rule-driven');
  assert.equal(cat.disposition,'candidate');
});

test('O2: automotive mechanics and physical consequences keep 2D physics',()=>{
  const prompts=[
    'Drive a car over bumpy hills with working suspension.',
    'Make a real physics engine where balls collide.',
    'Build a bridge that collapses under weight.',
    'Balance a tower of wobbly blocks.',
    'Make a catapult trajectory puzzle.',
    'The gum joints snap under weight.'
  ];
  for(const raw of prompts){
    const d=choose(raw);
    assert.equal(d.simulation,'physics-2d',raw);
    assert.equal(d.rendering,'2d-canvas',raw);
    assert.ok(d.evidence.some(e=>e.signal==='physics-needed'),raw);
  }
  const car=choose('Drive a car over bumpy hills with working suspension.');
  assert.equal(car.primaryInput,'driving');
  assert.equal(car.disposition,'candidate');
});

test('O2: a plain car, rocket or robot is not enough to require physics',()=>{
 for(const raw of [
   'Drive a car along a flat racetrack.',
   'Make a rocket that launches when I press a button.',
   'Make a robot dance when I tap it.',
   'Make a physics-looking rocket using stickers without physics.'
 ]){
   const d=choose(raw);
   assert.notEqual(d.simulation,'physics-2d',raw);
 }
 const style=choose('A 3D-looking robot puzzle with 2D sticker buttons on a grid.');
 assert.equal(style.rendering,'2d-canvas');
 assert.equal(style.simulation,'rule-driven');
 assert.equal(style.disposition,'candidate');
});

test('O2: explicit true 3D depth is an unsupported requirement, not disguised as 2D',()=>{
 for(const raw of [
  'Make a 3D space game where I can fly.',
  'Make a robot move freely in three dimensions.',
  'Build a true 3D world I can explore.'
 ]){
  const d=choose(raw);
  assert.equal(d.rendering,'true-3d-required',raw);
  assert.equal(d.simulation,'unresolved',raw);
  assert.equal(d.disposition,'unsupported',raw);
  assert.ok(d.blockers.includes('true-3d-not-supported'));
  assert.ok(d.evidence.some(e=>e.signal==='explicit-3d'));
 }
 const conflict=choose('Make a 3D space game but it must only be 2D.');
 assert.ok(conflict.blockers.includes('dimension-conflict'));
 for(const request of [
  'Make a game with no 3D world, only 2D robot stickers.',
  'Make a robot puzzle without a 3D game, just 2D buttons.'
 ]){
   const d=choose(request);
   assert.equal(d.rendering,'2d-canvas',request);
   assert.notEqual(d.disposition,'unsupported',request);
   assert.ok(d.evidence.some(e=>e.signal==='3d-avoided'),request);
 }
});
test('O2: labelled launch/start buttons count as real secondary tap interactions',()=>{
 for(const request of ['Drag stickers and then press Launch.', 'Drag stickers and press Make it GO.']){
   const d=choose(request);
   assert.equal(d.primaryInput,'drag-and-drop');
   assert.ok(d.additionalInputs.includes('tap-and-react'),request);
 }
});

test('O2: negation does not falsely demand physics; contradictory physical asks are reviewed',()=>{
 for(const raw of ['No real physics. Drag stickers onto a rocket.', 'Make a robot with no physics that dances when I tap it.', 'Make a game without physics where I press a button.']){
   const d=choose(raw);
   assert.equal(d.simulation,'rule-driven',raw);
   assert.equal(d.evidence.some(e=>e.signal==='physics-needed'),false,raw);
   assert.equal(d.disposition,'candidate',raw);
 }
 const contradictory=choose('No physics, but simulate gravity and momentum.');
 assert.equal(contradictory.disposition,'review-required');
 assert.equal(contradictory.simulation,'unresolved');
 assert.ok(contradictory.blockers.includes('physics-conflict'));
 assert.ok(contradictory.evidence.some(e=>e.signal==='physics-avoided'));
 assert.ok(contradictory.evidence.some(e=>e.signal==='physics-needed'));
});

test('O2: vague physical language requires review instead of physics-by-theme',()=>{
 const wobble=choose('Make a springy robot dance.');
 assert.equal(wobble.disposition,'review-required');
 assert.equal(wobble.simulation,'unresolved');
 assert.ok(wobble.blockers.includes('physical-mechanics-ambiguous'));
 const suspension=choose('Make a car with suspension.');
 assert.equal(suspension.disposition,'review-required');
 assert.equal(suspension.simulation,'unresolved');
 const noAction=choose('A game about a cat.');
 assert.ok(noAction.blockers.includes('mechanic-not-described'));
 assert.equal(noAction.primaryInput,'unresolved');
});

test('O2: uninspected saved revisions are never silently converted into new mechanics',()=>{
 const raw='Make my saved car faster.';
 const c=draftChildIntentContract(raw,{projectId:'p1',baseRevisionId:'saved-2'});
 const d=chooseGameForm(c);
 assert.equal(d.disposition,'review-required');
 assert.ok(d.blockers.includes('saved-revision-not-inspected'));
 assert.equal(d.baseRevisionId,'saved-2');
 assert.equal(d.projectId,'p1');
 assert.equal(d.simulation,'rule-driven'); // tentative *only*, never promoted without base lookup
});

test('O2: verified physical game preserves the old engine for ordinary revisions',()=>{
 const existing:TrustedExistingForm={revisionId:'saved-2',simulation:'physics-2d',interaction:'driving'};
 const d=choose('Make it faster.',existing);
 assert.equal(d.simulation,'physics-2d');
 assert.equal(d.primaryInput,'driving');
 assert.equal(d.disposition,'candidate');
 assert.ok(d.reason.some(s=>s.includes('Preserve the verified existing physics')));
 assert.equal(d.alternative,'preserve-existing-option');
 const remove=choose('Remove physics and make it a sticker game.',existing);
 assert.equal(remove.disposition,'review-required');
 assert.equal(remove.simulation,'unresolved');
 assert.ok(remove.blockers.includes('saved-physics-removal-requires-review'));
 const change=choose('Make it better.',existing);
 assert.ok(change.blockers.includes('unclear-revision-change'));
});

test('O2: verified scripted game needs explicit migration before adding physical simulation',()=>{
 const existing:TrustedExistingForm={revisionId:'r3',simulation:'rule-driven',interaction:'arcade'};
 const d=choose('Make a physics game with realistic gravity.',existing);
 assert.equal(d.simulation,'physics-2d');
 assert.equal(d.disposition,'review-required');
 assert.ok(d.blockers.includes('saved-mechanics-migration-requires-review'));
 assert.equal(d.primaryInput,'arcade');
});

test('O2: wrong or unverified base metadata is rejected and cannot grant authority',()=>{
 const saved=draftChildIntentContract('Drive a car faster.',{projectId:'family-a',baseRevisionId:'a1'});
 assert.throws(()=>chooseGameForm(saved,{revisionId:'b1',simulation:'physics-2d'}),/GAME_FORM_INVALID_BASE_REFERENCE_OR_FORM/);
 assert.throws(()=>chooseGameForm(saved,{revisionId:'a1',simulation:'anything' as any}),/GAME_FORM_INVALID_BASE_REFERENCE_OR_FORM/);
 assert.throws(()=>chooseGameForm(draftChildIntentContract('Drive a car faster.'),{revisionId:'a1',simulation:'physics-2d'}),/GAME_FORM_INVALID_BASE_REFERENCE_OR_FORM/);
});

test('O2: every signal is exact source grounded with honest fact provenance',()=>{
 const raw='🐱 Draw a robot route in 2D with a cat and a rocket. No physics.';
 const c=draftChildIntentContract(raw);
 const d=chooseGameForm(c);
 assert.equal(d.sourceSha256,c.source.sha256);
 for(const e of d.evidence){
   assert.equal(raw.slice(e.source.start,e.source.end),e.source.quote);
   for(const id of e.factIds)assert.ok(c.facts.some(f=>f.id===id && f.evidence.start<e.source.end && e.source.start<f.evidence.end));
 }
 assert.ok(d.evidence.some(e=>e.signal==='physics-avoided'));
 assert.equal(d.simulation,'rule-driven');
});

test('O2: forged decisions and modified intent cannot become valid architecture authorization',()=>{
 const intent=draftChildIntentContract('Decorate a robot with stickers, then press Launch.');
 const genuine=chooseGameForm(intent);
 assert.deepEqual(validateGameFormDecision(genuine,intent),genuine);
 const fake={...genuine,simulation:'physics-2d'};
 assert.throws(()=>validateGameFormDecision(fake,intent),/GAME_FORM_INVALID_DECISION_MISMATCH/);
 const corrupted=JSON.parse(JSON.stringify(intent)) as ChildIntentContract;
 corrupted.source.raw+='!'; // hash is now invalid
 assert.throws(()=>chooseGameForm(corrupted),/CHILD_INTENT_INVALID_ORIGINAL_SOURCE/);
 assert.throws(()=>validateGameFormDecision(genuine,draftChildIntentContract('Make a new game with real gravity.')),/GAME_FORM_INVALID_DECISION_MISMATCH/);
});

test('O2: large repeated evidence fails closed rather than hiding physical constraints past an arbitrary cap',()=>{
 const s='Drag a rocket. '.repeat(19)+'No physics, but simulate gravity.';
 // O1 itself enforces fact count and may reject this request first.
 assert.throws(()=>chooseGameForm(draftChildIntentContract(s)),/CHILD_INTENT_INVALID_FACT_LIMIT/);
});
