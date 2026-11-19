import {test} from 'node:test';
import assert from 'node:assert/strict';
import {archetypes,mechanics,archetypeById,mechanicById,validateArchetypeCatalog} from '../src/archetypes/catalog';
import {inspectNative,validateNativeLinks} from '../src/archetypes/native';
import {assessAssembly} from '../src/archetypes/assessment';
import {makePrototype,collide,type PrototypeRecipe} from '../src/archetypes/prototype';
import {defaults} from '../src/runtime/manifests';

test('the 22-family inventory has unique, resolved mechanics and truthful maturity',()=>{
 assert.doesNotThrow(validateArchetypeCatalog);
 assert.equal(archetypes.length,22);
 assert.ok(mechanics.length>=70);
 assert.equal(archetypeById.size,22);
 assert.equal(mechanicById.size,mechanics.length);
 for(const a of archetypes)for(const id of a.coreMechanics)assert.ok(mechanicById.has(id));
 assert.equal(mechanicById.get('reflect-projectile')!.maturity,'shared-prototype');
 assert.notEqual(mechanicById.get('vehicle-suspension')!.maturity,'shared-prototype');
});
test('six existing games have compatible read-only native links, no silent engine migration',()=>{
 assert.doesNotThrow(validateNativeLinks);
 assert.deepEqual(inspectNative('gum',defaults('gum')).archetypeIds,['drag-creation']);
 assert.deepEqual(inspectNative('gum',{...defaults('gum'),qualityVersion:1}).archetypeIds,['physical-construction']);
 assert.deepEqual(inspectNative('gum',{...defaults('gum'),qualityVersion:0}).archetypeIds,[]);
 assert.deepEqual(inspectNative('hill',defaults('hill')).archetypeIds,['side-driving']);
 assert.throws(()=>inspectNative('hill',{...defaults('hill'),wheelSize:99}));
});
test('existing native edit is only a candidate for real local interpreter',()=>{
 const plan=assessAssembly({originalIdea:'Make my car go much faster over the hills',archetypeId:'side-driving',requestedMechanics:['drive-throttle'],existing:{game:'hill',config:defaults('hill'),baseRevisionId:'r1'}});
 assert.equal(plan.route,'existing-native-interpreter');
 assert.equal(plan.canPlayNow,false);
 assert.match(plan.notes.join(' '),/interpreter/i);
});
test('new ideas do not become instant games just because they match a native example',()=>{
 const plan=assessAssembly({originalIdea:'Drive a dinosaur truck over hills and collect eggs',archetypeId:'side-driving',requestedMechanics:['collect-item']});
 assert.equal(plan.route,'generation-required');
 assert.ok(plan.unverifiedPortableMechanics.includes('vehicle-suspension'));
 assert.equal(plan.canPlayNow,false);
});
test('structural changes cannot masquerade as parameter edits',()=>{
 const p=assessAssembly({originalIdea:'Make dragon fire reflect into the dragon using a bow',archetypeId:'projectile-defense',requestedMechanics:['reflect-projectile'],existing:{game:'dragon',config:defaults('dragon'),baseRevisionId:'r2'}});
 assert.equal(p.route,'generation-required');
 assert.ok(p.blockers.includes('MECHANIC_NOT_NATIVE_EDITABLE'));
});
test('unfamiliar mechanics, unsafe game-form assumptions and true 3d fail closed',()=>{
 const base={originalIdea:'A new way to bounce between planets',archetypeId:'platformer',requestedMechanics:['unknown-magic-rule']};
 assert.equal(assessAssembly(base).route,'review-required');
 assert.ok(assessAssembly(base).essentialMechanics.includes('unknown-magic-rule'));
 assert.equal(assessAssembly({...base,requestedMechanics:[],view:'true-3d'}).route,'unsupported');
 assert.equal(assessAssembly({...base,archetypeId:'side-driving',requestedMechanics:[],simulation:'rules'}).route,'review-required');
 assert.throws(()=>assessAssembly({...base,originalIdea:'',requestedMechanics:[]}));
 assert.throws(()=>assessAssembly({...base,requestedMechanics:new Array(33).fill('jump')}));
});
test('misclassified native saved revisions do not change the game',()=>{
 const plan=assessAssembly({originalIdea:'Make the sticker robot a real physics joint machine',archetypeId:'physical-construction',requestedMechanics:['joint-break'],existing:{game:'gum',config:defaults('gum'),baseRevisionId:'r3'}});
 assert.equal(plan.route,'review-required');
 assert.ok(plan.blockers.includes('NATIVE_FORM_MISMATCH'));
});

const reflectRecipe=(id:string,archetypeId:string,hero:string,enemy:string,shield:string,ball:string):PrototypeRecipe=>({
 id,archetypeId,mechanics:['reflect-projectile','health-damage'],goal:'defeat-enemy',
 actors:[
  {id:hero,role:'avatar',hp:3},
  {id:enemy,role:'enemy',hp:1},
  {id:shield,role:'shield',owner:hero},
  {id:ball,role:'projectile',owner:enemy,vx:-5}
 ]
});
test('same projectile-reflect component works in DRAGON defense and SPACE flight',()=>{
 const games=[
  reflectRecipe('dragon-meadow','projectile-defense','hero','dragon','shield','fireball'),
  reflectRecipe('space-mirror','flight-dodge','astronaut','alien','forcefield','laser')
 ];
 for(const recipe of games){
  let state=makePrototype(recipe);
  const shot=recipe.actors.find(x=>x.role==='projectile')!;
  const enemy=recipe.actors.find(x=>x.role==='enemy')!;
  const shield=recipe.actors.find(x=>x.role==='shield')!;
  const hero=recipe.actors.find(x=>x.role==='avatar')!;
  state=collide(state,shield.id,shot.id);
  assert.equal(state.actors[shot.id].owner,hero.id);
  assert.equal(state.actors[shot.id].vx,5);
  assert.deepEqual(state.events,['reflected:'+shot.id]);
  state=collide(state,shot.id,enemy.id);
  assert.equal(state.actors[enemy.id].hp,0);
  assert.equal(state.phase,'won');
  assert.ok(state.events.includes('goal:won'));
 }
});
test('same portable primitives can collect and visibly grow a character',()=>{
 const recipe:PrototypeRecipe={id:'cat-moon',archetypeId:'endless-runner',mechanics:['collect-item','grow-on-collect'],goal:'collect-all',actors:[
  {id:'cat',role:'avatar'},{id:'donut-a',role:'collectible'},{id:'donut-b',role:'collectible'}
 ]};
 const initial=makePrototype(recipe);
 const once=collide(initial,'cat','donut-a');
 const twice=collide(once,'cat','donut-b');
 assert.equal(initial.actors['donut-a'].active,true);
 assert.equal(once.actors['cat'].score,1);
 assert.equal(once.actors['cat'].scale,1.2);
 assert.equal(twice.actors['cat'].scale,1.4);
 assert.equal(twice.phase,'won');
 assert.equal(collide(twice,'cat','donut-a'),twice);
});
test('prototype rejects unknown code-like behaviors, broken owners, duplicate actors and missing goals',()=>{
 const good=reflectRecipe('safe','projectile-defense','hero','enemy','shield','shot');
 assert.throws(()=>makePrototype({...good,mechanics:['arbitrary-javascript' as any]}));
 assert.throws(()=>makePrototype({...good,actors:[...good.actors,good.actors[0]]}));
 assert.throws(()=>makePrototype({...good,actors:good.actors.map(x=>x.id==='shield'?{...x,owner:'missing'}:x)}));
 assert.throws(()=>makePrototype({...good,goal:'collect-all'}));
 assert.throws(()=>makePrototype({...good,archetypeId:'made-up'}));
 let state=makePrototype(good);
 state=collide(state,'shot','hero');assert.equal(state.phase,'playing');assert.equal(state.actors.hero.hp,2);
 assert.throws(()=>collide(state,'shot','unknown'));
});
