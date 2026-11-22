/** Pure, local arcade simulation. Banked Jems never become learning or lifetime rewards. */
export type MinePhase = 'mining'|'warning'|'shaking'|'falling'|'retry'|'level-complete';
export type MineGem = Readonly<{id:number;x:number;value:1;frame:number}>;
export type MineInput = Readonly<{left:boolean;right:boolean;hold:boolean}>;
export type MineState = Readonly<{
  phase:MinePhase;playerX:number;facing:-1|1;holding:boolean;
  banked:number;levelBanked:number;level:number;loose:number;lost:number;mined:number;shakes:number;
  gems:readonly MineGem[];
  /** Remaining phase/spawn time; elapsedMs advances only while the game runs. */
  phaseMs:number;spawnInMs:number;elapsedMs:number;seed:number;nextGemId:number;
}>;
export const BAG_CAPACITY=10;
const PLATFORM_X=88,BUCKET_X=94,START_X=96,PICKUP_DISTANCE=2.4;
const FALL_MS=850,MAX_STEP_MS=20,MAX_ELAPSED_MS=100,MAX_GEMS=9;
const DEFAULT_SEED=0x4a454d53;
type WorkingState={-readonly [K in keyof MineState]:MineState[K]} & {gems:MineGem[]};

export function mineDifficulty(level:number){
  const extra=Math.max(0,Math.floor(Number.isFinite(level)?level:1)-1);
  return {
    goal:12+Math.min(extra,12)*4,
    speed:22,
    calmMinMs:Math.max(5200,10000-extra*500),
    calmMaxMs:Math.max(7200,14000-extra*600),
    warningMs:Math.max(2000,3000-extra*100),
    shakeMs:1500,
    spawnMinMs:Math.max(650,1100-extra*45),
    spawnMaxMs:Math.max(1100,1900-extra*70)
  };
}

export const isMineSafe=(x:number)=>x>=PLATFORM_X;

function random(state:WorkingState){
  state.seed=(Math.imul(state.seed,1664525)+1013904223)>>>0;
  return state.seed/0x100000000;
}
function between(state:WorkingState,min:number,max:number){
  return min+Math.floor(random(state)*(max-min+1));
}
function gem(state:WorkingState,x:number):MineGem {
  const frame=Math.floor(random(state)*6);
  return {id:state.nextGemId++,x,value:1,frame};
}
function beginMining(state:WorkingState,first=false){
  const difficulty=mineDifficulty(state.level);
  state.phase='mining';
  state.phaseMs=between(state,difficulty.calmMinMs,difficulty.calmMaxMs);
  state.spawnInMs=first?900:between(state,350,650);
  if(first)state.gems=[72,57,42,25,10].map(x=>gem(state,x));
}

export function newMineState(seed=DEFAULT_SEED):MineState {
  const state:WorkingState={
    phase:'mining',playerX:START_X,facing:-1,holding:false,
    banked:0,levelBanked:0,level:1,loose:0,lost:0,mined:0,shakes:0,
    gems:[],phaseMs:0,spawnInMs:0,elapsedMs:0,
    seed:Number.isFinite(seed)?seed>>>0:DEFAULT_SEED,nextGemId:1
  };
  beginMining(state,true);
  return state;
}

function spill(state:WorkingState){
  state.lost+=state.loose;
  state.loose=0;
}
function fall(state:WorkingState){
  spill(state);
  state.phase='falling';
  state.phaseMs=FALL_MS;
  state.holding=false;
}
function collect(state:WorkingState,fromX:number){
  // Swept contact avoids skipping a crystal on a slower frame. A full bag
  // leaves the crystal on the head so it can be collected after banking.
  const low=Math.min(fromX,state.playerX)-PICKUP_DISTANCE;
  const high=Math.max(fromX,state.playerX)+PICKUP_DISTANCE;
  state.gems=state.gems.filter(crystal=>{
    if(crystal.x<low||crystal.x>high||state.loose+crystal.value>BAG_CAPACITY)return true;
    state.loose+=crystal.value;
    state.mined+=crystal.value;
    return false;
  });
}
function deposit(state:WorkingState){
  if(state.playerX<BUCKET_X||!state.loose)return;
  state.banked+=state.loose;
  state.levelBanked+=state.loose;
  state.loose=0;
  if(state.levelBanked>=mineDifficulty(state.level).goal){
    state.phase='level-complete';
    state.phaseMs=0;
    state.holding=false;
  }
}

function tick(state:WorkingState,input:MineInput,ms:number){
  state.elapsedMs+=ms;
  if(state.phase==='falling'){
    state.phaseMs=Math.max(0,state.phaseMs-ms);
    if(!state.phaseMs)state.phase='retry';
    return;
  }
  const fromX=state.playerX;
  state.holding=input.hold&&!isMineSafe(fromX);
  const direction=Number(input.right)-Number(input.left);
  if(direction&&!state.holding){
    state.facing=direction<0?-1:1;
    state.playerX=Math.max(0,Math.min(100,fromX+direction*mineDifficulty(state.level).speed*ms/1000));
  }
  state.holding=input.hold&&!isMineSafe(state.playerX);
  if(state.phase==='shaking'&&!isMineSafe(state.playerX)){
    spill(state);
    if(!state.holding){fall(state);return;}
  }
  if((state.phase==='mining'||state.phase==='warning')&&!state.holding)collect(state,fromX);
  deposit(state);
  if(state.phase==='level-complete')return;

  if(state.phase==='mining'){
    state.spawnInMs-=ms;
    if(state.spawnInMs<=0){
      if(state.gems.length<MAX_GEMS){
        const x=between(state,5,76);
        // Keep separately readable crystals; retry another spawn interval if crowded.
        if(!state.gems.some(crystal=>Math.abs(crystal.x-x)<5))state.gems.push(gem(state,x));
      }
      const difficulty=mineDifficulty(state.level);
      state.spawnInMs=between(state,difficulty.spawnMinMs,difficulty.spawnMaxMs);
      if(!state.holding)collect(state,state.playerX);
    }
  }
  state.phaseMs=Math.max(0,state.phaseMs-ms);
  if(state.phaseMs)return;
  switch(state.phase){
    case 'mining':
      state.phase='warning';
      state.phaseMs=mineDifficulty(state.level).warningMs;
      break;
    case 'warning':
      state.phase='shaking';
      state.phaseMs=mineDifficulty(state.level).shakeMs;
      state.shakes++;
      state.gems=[];
      if(!isMineSafe(state.playerX)){
        spill(state);
        if(!state.holding)fall(state);
      }
      break;
    case 'shaking':
      beginMining(state);
      break;
  }
}

/**
 * Advance active play, in bounded slices. The host pauses by not stepping.
 * A delayed/background frame advances at most 100 ms: it cannot skip the warning
 * and instantly punish the child. Retry/level-complete wait for explicit actions.
 */
export function stepMine(state:MineState,input:MineInput,elapsedMs:number):MineState {
  if(state.phase==='retry'||state.phase==='level-complete'||!Number.isFinite(elapsedMs)||elapsedMs<=0)return state;
  const next:WorkingState={...state,gems:[...state.gems]};
  let remaining=Math.min(elapsedMs,MAX_ELAPSED_MS);
  while(remaining>0&&next.phase!=='retry'&&next.phase!=='level-complete'){
    const ms=Math.min(remaining,MAX_STEP_MS,Math.max(1,next.phaseMs));
    tick(next,input,ms);
    remaining-=ms;
  }
  return next;
}

export function retryMine(state:MineState):MineState {
  if(state.phase!=='retry')return state;
  const next:WorkingState={...state,gems:[],playerX:START_X,facing:-1,holding:false};
  beginMining(next,true);
  return next;
}

export function nextMineLevel(state:MineState):MineState {
  if(state.phase!=='level-complete')return state;
  const next:WorkingState={...state,gems:[],level:state.level+1,levelBanked:0,playerX:START_X,facing:-1,holding:false};
  beginMining(next,true);
  return next;
}
