import test from 'node:test';
import assert from 'node:assert/strict';
import {OBJECTS, type ObjectId} from '../src/games/bubble-gum-art';
import {
  BLUEPRINTS,GUMS,GUM_BUDGET,TOUR_DURATION_MS,MAX_COMPLETED,
  createBuild,getBlueprint,nextSlot,isConnected,canPlace,placePart,canBond,bondPart,
  removePart,isReady,gumRemaining,partChoices,completeTour,markReported,nextBuild,
  serializeBuild,readBuild,partCountAt,type BuildState,type Slot,type GumId,
} from '../src/games/bubble-gum-rules';

const json=(value:unknown)=>JSON.parse(JSON.stringify(value));
function solve(initial:BuildState,variant=0):BuildState {
  let state=initial;
  for(const slot of getBlueprint(state).slots){
    assert.ok(canPlace(state,slot.id,slot.accepts[variant%slot.accepts.length]));
    state=placePart(state,slot.id,slot.accepts[variant%slot.accepts.length]);
    if(slot.parent){
      assert.equal(isConnected(state,slot.id),false,'placing alone never joins a part');
      assert.equal(nextSlot(state)?.id,slot.id,'current step remains until its gum is applied');
      assert.ok(canBond(state,slot.id));
      state=bondPart(state,slot.id,GUMS[variant%GUMS.length].id);
    }
    assert.ok(isConnected(state,slot.id));
  }
  return state;
}

test('the catalog supplies twelve distinct inventions across four worlds with recognizable objects',()=>{
  assert.equal(BLUEPRINTS.length,12);
  assert.equal(new Set(BLUEPRINTS.map(item=>item.id)).size,12);
  assert.equal(new Set(BLUEPRINTS.map(item=>item.title)).size,12);
  assert.deepEqual(new Set(BLUEPRINTS.map(item=>item.world)),new Set(['sky','sea','stage','road']));
  assert.deepEqual(BLUEPRINTS.slice(0,3).map(item=>item.title),['Rocket Pop','Bubble Sub','Silly Bot']);
  const used=new Set<string>();
  for(const blueprint of BLUEPRINTS){
    const earlier=new Set<string>();
    assert.equal(blueprint.slots.length,8);
    assert.equal(blueprint.slots.filter(slot=>!slot.parent).length,1);
    assert.equal(blueprint.slots[0].parent,undefined);
    for(const slot of blueprint.slots){
      assert.equal(earlier.has(slot.id),false,'slot identities are unique within an invention');
      assert.ok(slot.accepts.length>=2,'children can choose visibly different valid objects');
      assert.equal(new Set(slot.accepts).size,slot.accepts.length);
      for(const objectId of slot.accepts){assert.ok(OBJECTS[objectId]);used.add(objectId);}
      if(slot.parent){assert.ok(earlier.has(slot.parent),'every difficulty prefix has its parents');assert.ok(slot.joint);}
      else assert.equal(slot.joint,undefined);
      earlier.add(slot.id);
    }
  }
  assert.ok(used.size>=28,'variety comes from actual part identities, not just colors');
});

test('parts remain on the stage and gum bridges sit at the two neighboring parts',()=>{
  const inside=(x:number,y:number,slot:Slot)=>x>=slot.x-slot.w/2-3&&x<=slot.x+slot.w/2+3&&
    y>=slot.y-slot.h/2-3&&y<=slot.y+slot.h/2+3;
  for(const blueprint of BLUEPRINTS)for(const slot of blueprint.slots){
    for(const value of [slot.x,slot.y,slot.w,slot.h])assert.ok(Number.isFinite(value));
    assert.ok(slot.w>0&&slot.h>0);
    assert.ok(slot.x-slot.w/2>=0&&slot.x+slot.w/2<=100,`${blueprint.id}/${slot.id} horizontal fit`);
    assert.ok(slot.y-slot.h/2>=0&&slot.y+slot.h/2<=100,`${blueprint.id}/${slot.id} vertical fit`);
    if(!slot.parent)continue;
    const parent=blueprint.slots.find(item=>item.id===slot.parent)!;
    const {x1,y1,x2,y2}=slot.joint!;
    const length=Math.hypot((x2-x1)*8,(y2-y1)*4.8);
    assert.ok(length>=12&&length<=60,`${blueprint.id}/${slot.id} has a short visible join`);
    assert.ok((inside(x1,y1,parent)&&inside(x2,y2,slot))||(inside(x2,y2,parent)&&inside(x1,y1,slot)),
      `${blueprint.id}/${slot.id} joins its actual parent seam`);
  }
});

test('difficulty adds parts after three completed builds and stops at eight',()=>{
  for(const [count,parts] of [[0,5],[2,5],[3,6],[5,6],[6,7],[8,7],[9,8],[12,8],[MAX_COMPLETED,8]]){
    assert.equal(partCountAt(count),parts);
    assert.equal(getBlueprint(createBuild(count)).slots.length,parts);
  }
  assert.equal(GUM_BUDGET,10);
  assert.equal(TOUR_DURATION_MS,24_000,'reduced motion uses the same meaningful tour duration');
});

test('all recipes and difficulty prefixes can be built with either set of object choices',()=>{
  for(const blueprint of BLUEPRINTS)for(const completed of [0,3,6,9])for(const variant of [0,1]){
    const initial=createBuild(completed,blueprint.id),before=serializeBuild(initial);
    const state=solve(initial,variant),parts=getBlueprint(state).slots.length;
    assert.ok(isReady(state),`${blueprint.id}/${completed}/${variant}`);
    assert.equal(nextSlot(state),undefined);
    assert.equal(Object.keys(state.placed).length,parts);
    assert.equal(Object.keys(state.bonds).length,parts-1);
    assert.equal(gumRemaining(state),GUM_BUDGET-(parts-1));
    assert.deepEqual(serializeBuild(initial),before,'reducers do not mutate the initial build');
    assert.deepEqual(json(readBuild(serializeBuild(state))),json(state));
  }
});

test('a child places a part, then bonds it, before receiving the next piece',()=>{
  let state=createBuild();
  const [body,nose,wing]=getBlueprint(state).slots;
  assert.equal(canPlace(state,nose.id,nose.accepts[0]),false);
  state=placePart(state,body.id,body.accepts[0]);
  assert.equal(nextSlot(state)?.id,nose.id);
  assert.equal(canBond(state,body.id),false,'the root does not spend gum');
  state=placePart(state,nose.id,nose.accepts[0]);
  assert.equal(canPlace(state,wing.id,wing.accepts[0]),false,'unbonded objects cannot be skipped');
  assert.equal(isReady(state),false);
  assert.equal(gumRemaining(state),10);
  state=bondPart(state,nose.id,'pink');
  assert.equal(nextSlot(state)?.id,wing.id);
  assert.equal(gumRemaining(state),9);
});

test('wrong, duplicate, unknown and premature actions consume no gum and change nothing',()=>{
  const state=createBuild(),slot=nextSlot(state)!;
  const wrong=(Object.keys(OBJECTS) as ObjectId[]).find(id=>!slot.accepts.includes(id))!;
  assert.equal(placePart(state,slot.id,wrong),state);
  assert.equal(placePart(state,'__proto__',slot.accepts[0]),state);
  assert.equal(bondPart(state,slot.id,'pink'),state);
  assert.equal(removePart(state,'unknown'),state);
  const placed=placePart(state,slot.id,slot.accepts[0]);
  assert.equal(placePart(placed,slot.id,slot.accepts[1]),placed);
  const second=nextSlot(placed)!;
  const unbonded=placePart(placed,second.id,second.accepts[0]);
  assert.equal(bondPart(unbonded,second.id,'fake' as GumId),unbonded);
  const bonded=bondPart(unbonded,second.id,'pink');
  assert.equal(bondPart(bonded,second.id,'mint'),bonded);
  assert.equal(gumRemaining(bonded),9);
});

test('all gum colors work as real connections with identical rules',()=>{
  for(const gum of GUMS){
    let state=createBuild();
    for(const slot of getBlueprint(state).slots){
      state=placePart(state,slot.id,slot.accepts[0]);
      if(slot.parent)state=bondPart(state,slot.id,gum.id);
    }
    assert.ok(isReady(state));
    assert.ok(Object.values(state.bonds).every(id=>id===gum.id));
    assert.equal(gumRemaining(state),6);
  }
});

test('removing a parent removes its attached subtree, returns gum, and preserves siblings',()=>{
  const full=solve(createBuild(9,'balloon-buggy'));
  const before=serializeBuild(full),removed=removePart(full,'left-rope');
  assert.equal(removed.placed['left-rope'],undefined);
  assert.equal(removed.placed['left-balloon'],undefined);
  assert.equal(removed.bonds['left-rope'],undefined);
  assert.equal(removed.bonds['left-balloon'],undefined);
  assert.equal(removed.placed['right-balloon'],full.placed['right-balloon']);
  assert.equal(gumRemaining(removed),gumRemaining(full)+2);
  assert.equal(isReady(removed),false);
  assert.deepEqual(serializeBuild(full),before,'a retained undo snapshot is unchanged');
  assert.deepEqual(json(readBuild(serializeBuild(removed))),json(removed));
  const empty=removePart(full,'body');
  assert.deepEqual(Object.keys(empty.placed),[]);
  assert.deepEqual(Object.keys(empty.bonds),[]);
  assert.equal(gumRemaining(empty),10);
});

test('retaining the previous immutable state is an exact undo including its gum inventory',()=>{
  let state=createBuild();const history:BuildState[]=[];
  for(const slot of getBlueprint(state).slots){
    history.push(state);state=placePart(state,slot.id,slot.accepts[0]);
    if(slot.parent){history.push(state);state=bondPart(state,slot.id,'gold');}
  }
  const justPlaced=history.pop()!;
  assert.equal(gumRemaining(justPlaced),gumRemaining(state)+1);
  assert.equal(isReady(justPlaced),false);
  assert.equal(nextSlot(justPlaced)?.id,'booster');
  while(history.length)state=history.pop()!;
  assert.deepEqual(serializeBuild(state),serializeBuild(createBuild()));
});

test('object trays are stable across reloads, contain all valid alternatives, and have bounded distinct decoys',()=>{
  for(const blueprint of BLUEPRINTS){
    const state=createBuild(9,blueprint.id),restored=readBuild(serializeBuild(state));
    for(const slot of getBlueprint(state).slots)for(const extra of [0,1,6]){
      const choices=partChoices(state,slot.id,extra);
      assert.deepEqual(choices,partChoices(restored,slot.id,extra));
      assert.equal(choices.length,slot.accepts.length+extra);
      assert.equal(new Set(choices).size,choices.length);
      assert.ok(slot.accepts.every(id=>choices.includes(id)));
      assert.equal(choices.filter(id=>!slot.accepts.includes(id)).length,extra);
    }
  }
  const state=createBuild();
  assert.equal(partChoices(state,'body',999).length,8);
  assert.equal(partChoices(state,'body',-10).length,2);
  assert.equal(partChoices(state,'body',NaN).length,2);
  assert.deepEqual(partChoices(state,'unknown'),[]);
});

test('cycling the collection avoids immediate repeats and changes later object trays',()=>{
  let state=createBuild();const seen:string[]=[];
  for(let i=0;i<BLUEPRINTS.length;i++){
    seen.push(state.blueprint);
    state=nextBuild(completeTour(solve(state)));
    assert.equal(state.completed,i+1);
    assert.equal(state.tourCompleted,false);
    assert.equal(state.reported,false);
  }
  assert.equal(new Set(seen).size,BLUEPRINTS.length);
  assert.equal(state.blueprint,seen[0]);
  assert.notDeepEqual(partChoices(createBuild(0),'body',6),partChoices(createBuild(12),'body',6));
});

test('tours and host reporting are idempotent, and an unfinished build cannot advance',()=>{
  const empty=createBuild();
  assert.equal(completeTour(empty),empty);
  assert.equal(markReported(empty),empty);
  assert.equal(nextBuild(empty),empty);
  const ready=solve(empty);
  assert.equal(nextBuild(ready),ready,'joining the last part alone does not complete the journey');
  assert.equal(markReported(ready),ready);
  const toured=completeTour(ready),reported=markReported(toured);
  assert.equal(completeTour(toured),toured);
  assert.equal(markReported(reported),reported);
  assert.equal(completeTour(reported),reported,'watching again never resets the reported guard');
  assert.equal(reported.completed,0,'only choosing the next build advances progression');
  assert.equal(nextBuild(reported).completed,1);
  assert.equal(removePart(reported,'body'),reported,'finished builds cannot quietly become a new reward attempt');
  assert.equal(placePart(reported,'body','can'),reported);
});

test('changing an unreported toured invention preserves progression and requires a new full tour',()=>{
  const original=completeTour(solve(createBuild()));
  const changed=removePart(original,'booster');
  assert.equal(changed.tourCompleted,false);
  assert.equal(changed.reported,false);
  assert.equal(changed.completed,0);
  assert.equal(isReady(changed),false);
  assert.equal(gumRemaining(changed),gumRemaining(original)+1);
  assert.equal(nextBuild(changed),changed);
  assert.equal(markReported(changed),changed);
  const replaced=bondPart(placePart(changed,'booster','tube'),'booster','blue');
  assert.ok(isReady(replaced));
  assert.equal(markReported(replaced),replaced,'rebuilding does not bypass the tour');
  const toured=completeTour(replaced);
  assert.equal(markReported(toured).reported,true);
  assert.equal(nextBuild(toured).completed,1);
  assert.equal(original.tourCompleted,true,'the original undo snapshot remains intact');
});

test('progression remains bounded after long play while rotating the next invention',()=>{
  const finished=completeTour(solve(createBuild(MAX_COMPLETED,'basket-boogie')));
  const next=nextBuild(finished);
  assert.equal(next.completed,MAX_COMPLETED);
  assert.equal(next.blueprint,'rocket-pop');
  assert.equal(getBlueprint(next).slots.length,8);
  for(const count of [-1,0.5,Infinity,NaN,MAX_COMPLETED+1])assert.throws(()=>createBuild(count));
  assert.throws(()=>createBuild(0,'missing'));
});

test('save round trips are detached and preserve exact objects, colors and completion',()=>{
  const source=markReported(completeTour(solve(createBuild(6,'sponge-sailor'),1)));
  const serialized=serializeBuild(source),loaded=readBuild(serialized);
  assert.deepEqual(json(loaded),json(source));
  assert.equal(Object.getPrototypeOf(loaded.placed),null);
  assert.equal(Object.getPrototypeOf(loaded.bonds),null);
  serialized.placed.body='sponge';
  assert.equal(source.placed.body,'basket');
  assert.equal(loaded.placed.body,'basket');
  loaded.bonds.mast='blue';
  assert.equal(source.bonds.mast,'mint');
});

test('unknown schemas, malformed counts and invalid completion flags are rejected without replacement',()=>{
  const valid=serializeBuild(createBuild());
  const cases:unknown[]=[null,[],true,'gum-assembly-v1',{},
    {...valid,schema:'gum-stickers-v1'}, {...valid,schema:'gum-assembly-v2'},
    {...valid,blueprint:'__proto__'}, {...valid,completed:-1}, {...valid,completed:1.5},
    {...valid,completed:NaN}, {...valid,completed:MAX_COMPLETED+1},
    {...valid,tourCompleted:1}, {...valid,tourCompleted:true}, {...valid,reported:true},
    {...valid,unexpected:true}, {...valid,placed:[]}, {...valid,bonds:null},
  ];
  for(const value of cases){
    const before=value&&typeof value==='object'?Object.getOwnPropertyDescriptors(value):value;
    assert.throws(()=>readBuild(value));
    if(value&&typeof value==='object')assert.deepEqual(Object.getOwnPropertyDescriptors(value),before);
  }
});

test('saved parts must match the active recipe and every connection must have its actual parent',()=>{
  const empty=serializeBuild(createBuild());
  assert.throws(()=>readBuild({...empty,placed:{body:'sock'}}));
  assert.throws(()=>readBuild({...empty,placed:{nose:'funnel'}}));
  assert.throws(()=>readBuild({...empty,placed:{body:'bottle',window:'lid'}}),'later difficulty pieces are not accepted early');
  assert.throws(()=>readBuild({...empty,bonds:{nose:'pink'}}));
  assert.throws(()=>readBuild({...empty,placed:{body:'bottle'},bonds:{body:'pink'}}));
  assert.throws(()=>readBuild({...empty,placed:{body:'bottle',nose:'funnel'},bonds:{nose:'purple'}}));
  const balloon=serializeBuild(createBuild(9,'balloon-buggy'));
  assert.throws(()=>readBuild({...balloon,placed:{body:'basket','left-rope':'straw','left-balloon':'balloon'},bonds:{'left-balloon':'pink'}}));
  const legitimate=placePart(placePart(createBuild(),'body','bottle'),'nose','funnel');
  assert.deepEqual(json(readBuild(serializeBuild(legitimate))),json(legitimate),'an in-progress unbonded part survives reload');
});

test('save validation rejects prototype keys, inherited data, symbols and accessors without invoking them',()=>{
  const empty=serializeBuild(createBuild());
  const poisoned=JSON.parse('{"__proto__":"bottle"}');
  assert.throws(()=>readBuild({...empty,placed:poisoned}));
  assert.throws(()=>readBuild({...empty,placed:{constructor:'bottle'}}));
  assert.throws(()=>readBuild({...empty,bonds:JSON.parse('{"__proto__":"pink"}')}));
  assert.throws(()=>readBuild(Object.create(empty)));
  assert.throws(()=>readBuild({...empty,placed:Object.create({body:'bottle'})}));
  assert.throws(()=>readBuild({...empty,[Symbol('hidden')]:true}));
  let reads=0;const accessor={...empty};
  Object.defineProperty(accessor,'placed',{enumerable:true,get(){reads++;return {body:'bottle'};}});
  assert.throws(()=>readBuild(accessor));
  assert.equal(reads,0);
  const nested=Object.create(null);
  Object.defineProperty(nested,'body',{enumerable:true,get(){reads++;return 'bottle';}});
  assert.throws(()=>readBuild({...empty,placed:nested}));
  assert.equal(reads,0);
  assert.equal(({} as Record<string,unknown>).polluted,undefined);
});
