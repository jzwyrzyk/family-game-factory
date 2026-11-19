/** Versioned trusted bootstrap, archived with the engine so saved games retain their exact stepping contract. */
import {createCapabilities} from './runtime-v2';
import {hardenIntrinsics,sealAmbient} from './harden-v2';
import {copyCommands,copyOutcome} from './frame-v2';
export function run(makeGame:(api:ReturnType<typeof createCapabilities>['api'])=>any,approvedAssetIds:readonly string[]=[]){
 if(!Array.isArray(approvedAssetIds)||approvedAssetIds.length>8||approvedAssetIds.some(id=>typeof id!=='string'||!/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/.test(id))||new Set(approvedAssetIds).size!==approvedAssetIds.length)throw Error('ASSET_MANIFEST_REJECTED');
 // The trusted caller supplies IDs only. Raster bytes never enter the generated-code realm.
 const assetIds=new Set(approvedAssetIds);
 const worker=self as any,send=worker.postMessage.bind(worker),listen=worker.addEventListener.bind(worker);let seed=173;
 Math.random=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};
 const trusted=createCapabilities();let game:any,state:any,started=false;
 listen('unhandledrejection',()=>send({failed:true}));
 listen('message',(event:MessageEvent)=>{try{
  const message=event.data;
  if(message.type==='start'){state=game.init();started=true;}
  else if(message.type==='tick'&&started){
   if(!Number.isInteger(message.steps)||message.steps<1||message.steps>4)throw Error('STEP_LIMIT');
   for(let i=0;i<message.steps;i++){trusted.beginTick();const input=i===0?message.input:{...message.input,tap:null,pointer:{...message.input.pointer,pressed:false,released:false}};state=game.step(state,input,1/60);trusted.step();}
  }else return;
  const frame={commands:copyCommands(game.draw(state),assetIds),outcome:copyOutcome(game.outcome(state)),presentation:trusted.presentation()};
  if(JSON.stringify(frame).length>64000)throw Error('FRAME_BYTES_LIMIT');
  send(frame);
 }catch{send({failed:true});}});
 hardenIntrinsics(worker);sealAmbient(worker);game=makeGame(trusted.api);
}
