/**
 * Deterministic, pure rules for the local-only Jems wait-time mini-game.
 * A shake always discards loose Jems, even when the miner grabs on.
 */
export type MinePhase = 'mining' | 'warning' | 'shaking';
export type MineState = Readonly<{
  banked:number; loose:number; lost:number; mined:number;
  shakes:number; holding:boolean; phase:MinePhase;
}>;
export type MineAction =
  | {type:'mine';value:1|3} | {type:'bank'} | {type:'grab'}
  | {type:'warn'} | {type:'shake'} | {type:'settle'};
export const BAG_CAPACITY=8;
export const newMineState=():MineState=>({
  banked:0,loose:0,lost:0,mined:0,shakes:0,holding:false,phase:'mining'
});

export function moveMine(state:MineState,action:MineAction):MineState {
  switch(action.type){
    case 'mine': {
      if(state.phase==='shaking'||state.loose>=BAG_CAPACITY)return state;
      const value=Math.min(action.value,BAG_CAPACITY-state.loose);
      return {...state,loose:state.loose+value,mined:state.mined+value};
    }
    case 'bank':
      return state.phase==='shaking'||!state.loose?state:
        {...state,banked:state.banked+state.loose,loose:0};
    case 'grab':
      return state.phase==='warning'?{...state,holding:true}:state;
    case 'warn':
      return state.phase==='mining'?{...state,phase:'warning',holding:false}:state;
    case 'shake':
      return state.phase==='warning'?
        {...state,phase:'shaking',lost:state.lost+state.loose,loose:0}:state;
    case 'settle':
      return state.phase==='shaking'?
        {...state,phase:'mining',holding:false,shakes:state.shakes+1}:state;
  }
}
