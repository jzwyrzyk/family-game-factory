import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BAG_CAPACITY,newMineState,stepMine,retryMine,nextMineLevel,mineDifficulty,isMineSafe,
  type MineState,type MineInput,type MineGem
} from '../src/games/mind-your-jems-rules';

const IDLE:MineInput={left:false,right:false,hold:false};
const LEFT:MineInput={...IDLE,left:true},RIGHT:MineInput={...IDLE,right:true},HOLD:MineInput={...IDLE,hold:true};
function run(state:MineState,input:MineInput,ms:number):MineState {
  let next=state;
  for(let remaining=ms;remaining>0;remaining-=20)next=stepMine(next,input,Math.min(remaining,20));
  return next;
}
const crystal=(id:number,x:number,value:1|3=1):MineGem=>({id,x,value,frame:value===3?3:0});
function scenario(patch:Partial<MineState>={}):MineState {
  return {...newMineState(42),gems:[],phaseMs:20000,spawnInMs:20000,...patch};
}
function assertAccounting(state:MineState){
  assert.equal(state.mined,state.banked+state.loose+state.lost);
  assert.ok(state.loose>=0&&state.loose<=BAG_CAPACITY);
  assert.ok(state.playerX>=0&&state.playerX<=100);
}

test('a fresh game starts on the safe platform with deterministic reachable crystals',()=>{
  const state=newMineState(42);
  assert.deepEqual(state,newMineState(42));
  assert.notDeepEqual(state,newMineState(43));
  assert.equal(state.playerX,96);assert.ok(isMineSafe(state.playerX));
  assert.equal(state.level,1);assert.equal(state.levelBanked,0);assert.equal(state.banked,0);
  assert.equal(state.phase,'mining');assert.equal(state.holding,false);
  assert.ok(state.gems.length>0);
  assert.ok(state.gems.every(g=>g.x>=5&&g.x<=76));
  assertAccounting(state);
});

test('only contact collects: stationary players cannot click distant crystals into a bag',()=>{
  const initial=scenario({playerX:70,gems:[crystal(1,50),crystal(2,30,3)]});
  const stationary=run(initial,IDLE,500);
  assert.equal(stationary.loose,0);assert.equal(stationary.gems.length,2);
  const walking=run(stationary,LEFT,1000);
  assert.equal(walking.loose,1);assert.equal(walking.mined,1);
  assert.equal(walking.gems.length,1);assert.equal(walking.gems[0].id,2);
  assert.equal(initial.playerX,70,'the input state was not mutated');
  assert.equal(initial.gems.length,2,'the input crystal list was not mutated');
  assertAccounting(walking);
});

test('holding stops movement and collection; opposed directions cancel',()=>{
  const state=scenario({playerX:40,gems:[crystal(1,40)]});
  const held=run(state,{...HOLD,left:true},500);
  assert.equal(held.playerX,40);assert.equal(held.holding,true);assert.equal(held.loose,0);
  const opposed=run(scenario({playerX:40}),{...IDLE,left:true,right:true},500);
  assert.equal(opposed.playerX,40);
});

test('a bag never exceeds eight and a rare crystal is not partially destroyed',()=>{
  const state=scenario({playerX:40,loose:6,mined:6,gems:[crystal(1,40,3),crystal(2,40),crystal(3,40)]});
  const collected=stepMine(state,IDLE,20);
  assert.equal(collected.loose,8);assert.equal(collected.gems.length,1);
  assert.deepEqual(collected.gems[0],crystal(1,40,3));
  assert.equal(run(collected,IDLE,500).loose,8);
  assertAccounting(collected);
});

test('running to the bucket deposits once; being near it is not a remote bank action',()=>{
  const state=scenario({playerX:80,loose:5,mined:5});
  const waiting=run(state,IDLE,200);
  assert.equal(waiting.loose,5);assert.equal(waiting.banked,0);
  const deposited=run(waiting,RIGHT,700);
  assert.equal(deposited.loose,0);assert.equal(deposited.banked,5);assert.equal(deposited.levelBanked,5);
  assert.equal(run(deposited,IDLE,1000).banked,5,'standing at the cart never repeats a deposit');
  assertAccounting(deposited);
});

test('every shake has a full warning before it can spill or make the miner fall',()=>{
  let state=scenario({playerX:40,loose:4,mined:4,phaseMs:20});
  state=stepMine(state,IDLE,20);
  assert.equal(state.phase,'warning');assert.equal(state.phaseMs,3000);assert.equal(state.loose,4);
  state=run(state,IDLE,2980);
  assert.equal(state.phase,'warning');assert.equal(state.loose,4);
  state=stepMine(state,IDLE,20);
  assert.equal(state.phase,'falling');assert.equal(state.loose,0);assert.equal(state.lost,4);assert.equal(state.shakes,1);
  assertAccounting(state);
});

test('holding survives a shake, spills loose jems once, clears the head and preserves the bucket',()=>{
  const initial=scenario({phase:'warning',phaseMs:20,playerX:40,loose:3,banked:5,levelBanked:5,mined:8,gems:[crystal(1,12)]});
  let state=stepMine(initial,HOLD,20);
  assert.equal(state.phase,'shaking');assert.equal(state.holding,true);
  assert.equal(state.loose,0);assert.equal(state.lost,3);assert.equal(state.gems.length,0);
  state=run(state,HOLD,1500);
  assert.equal(state.phase,'mining');assert.equal(state.lost,3);assert.equal(state.banked,5);
  assert.equal(state.levelBanked,5);assert.equal(state.shakes,1);
  assertAccounting(state);
});

test('holding must stay pressed throughout shaking; release falls and waits for explicit retry',()=>{
  let state=scenario({phase:'warning',phaseMs:20,playerX:40,loose:3,banked:4,levelBanked:4,mined:7});
  state=stepMine(state,HOLD,20);
  state=run(state,HOLD,400);
  assert.equal(state.phase,'shaking');
  state=stepMine(state,IDLE,20);
  assert.equal(state.phase,'falling');assert.equal(state.holding,false);
  state=run(state,RIGHT,850);
  assert.equal(state.phase,'retry');assert.equal(state.lost,3);
  assert.equal(stepMine(state,RIGHT,100),state,'no movement or timer after the loss screen');
  const retry=retryMine(state);
  assert.equal(retry.phase,'mining');assert.equal(retry.playerX,96);
  assert.equal(retry.banked,4);assert.equal(retry.levelBanked,4);assert.equal(retry.level,1);
  assert.equal(retry.lost,3);assert.ok(retry.gems.length>0);assertAccounting(retry);
  assert.equal(retryMine(retry),retry,'Retry cannot restart an active attempt');
});

test('the platform is fully safe; the bridge is exposed and the cart banks during a shake',()=>{
  assert.equal(isMineSafe(87.99),false);assert.equal(isMineSafe(88),true);
  const safe=scenario({phase:'warning',phaseMs:20,playerX:89,loose:4,mined:4,gems:[crystal(1,20)]});
  let state=stepMine(safe,IDLE,20);
  assert.equal(state.phase,'shaking');assert.equal(state.loose,4);assert.equal(state.lost,0);
  assert.equal(state.gems.length,0);
  state=run(state,RIGHT,300);
  assert.equal(state.banked,4);assert.equal(state.loose,0);assert.equal(state.phase,'shaking');
  const exposed=stepMine({...safe,playerX:85},IDLE,20);
  assert.equal(exposed.phase,'falling');assert.equal(exposed.lost,4);
  const escaping=stepMine({...safe,playerX:87.8},RIGHT,20);
  assert.equal(escaping.phase,'shaking');assert.equal(escaping.lost,0);
  const leaving=stepMine({...safe,phase:'shaking',phaseMs:1000,playerX:88.1},LEFT,20);
  assert.equal(leaving.phase,'falling');assert.equal(leaving.lost,4);
  assertAccounting(state);assertAccounting(exposed);assertAccounting(escaping);assertAccounting(leaving);
});

test('filling the bucket wins exactly once, retains surplus and waits for Next level',()=>{
  let state=scenario({playerX:94,banked:9,levelBanked:9,loose:6,mined:15});
  state=stepMine(state,IDLE,20);
  assert.equal(state.phase,'level-complete');assert.equal(state.banked,15);assert.equal(state.levelBanked,15);
  assert.equal(stepMine(state,LEFT,100),state);assert.equal(retryMine(state),state);
  const next=nextMineLevel(state);
  assert.equal(next.level,2);assert.equal(next.phase,'mining');assert.equal(next.banked,15);
  assert.equal(next.levelBanked,0);assert.equal(next.playerX,96);assert.equal(next.loose,0);
  assert.equal(mineDifficulty(1).goal,12);assert.equal(mineDifficulty(2).goal,16);
  assert.equal(nextMineLevel(next),next,'Next level cannot be repeated while playing');
  assertAccounting(next);
});

test('a safe winning deposit wins over a simultaneous shake without losing saved jems',()=>{
  const state=stepMine(scenario({phase:'warning',phaseMs:20,playerX:93.8,banked:8,levelBanked:8,loose:4,mined:12}),RIGHT,20);
  assert.equal(state.phase,'level-complete');assert.equal(state.banked,12);assert.equal(state.lost,0);
  assertAccounting(state);
});

test('slow/background frames are capped, invalid elapsed times do nothing, movement stays bounded',()=>{
  const state=scenario({playerX:40,phaseMs:1000});
  const late=stepMine(state,LEFT,60000);
  assert.equal(late.elapsedMs,100);assert.equal(late.phase,'mining');assert.equal(late.phaseMs,900);
  for(const elapsed of [-1,0,NaN,Infinity])assert.equal(stepMine(state,LEFT,elapsed),state);
  assert.equal(run(scenario({playerX:1}),LEFT,1000).playerX,0);
  assert.equal(run(scenario({playerX:99}),RIGHT,1000).playerX,100);
});

test('difficulty increases with bounded fair warning, travel speed and calm intervals',()=>{
  const first=mineDifficulty(1),later=mineDifficulty(8),maximum=mineDifficulty(1000);
  assert.ok(later.goal>first.goal);assert.ok(later.calmMinMs<first.calmMinMs);
  assert.ok(later.warningMs<first.warningMs);assert.ok(maximum.warningMs>=2000);
  assert.ok(maximum.calmMinMs>=5000);assert.ok(maximum.calmMaxMs>maximum.calmMinMs);
  assert.equal(later.speed,first.speed);assert.ok(80/first.speed<4);
});

test('seeded play remains repeatable, bounded and fully accounted across falls, banks and levels',()=>{
  let state=newMineState(12345),mirror=newMineState(12345);
  for(let i=0;i<18000;i++){
    if(state.phase==='retry'){state=retryMine(state);mirror=retryMine(mirror);}
    if(state.phase==='level-complete'){state=nextMineLevel(state);mirror=nextMineLevel(mirror);}
    const collecting=state.loose<6&&state.phase==='mining';
    const input:MineInput={
      left:collecting&&state.playerX>5,
      right:!collecting||state.playerX<=5,
      hold:state.phase==='warning'&&state.playerX<25&&i%3!==0||state.phase==='shaking'&&i%19!==0
    };
    state=stepMine(state,input,20);mirror=stepMine(mirror,input,20);
    assertAccounting(state);
    assert.ok(state.gems.length<=9);
    assert.ok(state.gems.every(g=>g.x>=5&&g.x<=76));
  }
  assert.deepEqual(state,mirror);assert.ok(state.banked>0);assert.ok(state.shakes>0);
});
