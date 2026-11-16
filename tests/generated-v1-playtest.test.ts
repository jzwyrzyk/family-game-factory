import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {transformSync} from 'esbuild';
import {renderGenerated} from '../server/sandbox/preview.cjs';
import {hopper} from '../server/testing/generated-fixtures';
import {hash} from '../server/agent/generated';

// Audited hand-authored fixture only. Exercise the unchanged v1 host and worker
// with deterministic timers; never execute model-provided source in Node.
function controlledPreview(options:{stalled?:boolean;inFlightFrames?:boolean}={}){
 let now=0,id=0,mouseDown=false,target:any=null,inFlight=!!options.inFlightFrames;
 const timers=new Map<number,{at:number;repeat:number;callback:()=>void}>(),blobs=new Map<string,string>();
 const elements:Record<string,any>={};
 for(const name of ['game','status','score','start','replay'])elements[name]={dataset:{},textContent:'',disabled:true};
 const action={dataset:{control:'action'}} as any,right={dataset:{control:'right'}} as any;
 const canvas=elements.game;canvas.getBoundingClientRect=()=>({left:0,top:0,width:720,height:400});
 canvas.getContext=()=>({clearRect(){},fillRect(){},beginPath(){},arc(){},fill(){},fillText(){}});
 const schedule=(callback:()=>void,delay:number,repeat=0)=>{timers.set(++id,{at:now+delay,repeat,callback});return id;};
 function advance(ms:number){const end=now+ms;for(;;){const next=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at||a[0]-b[0])[0];if(!next)break;const [key,timer]=next;now=timer.at;if(timer.repeat)timer.at+=timer.repeat;else timers.delete(key);timer.callback();}now=end;}
 class BlobStub{source:string;constructor(parts:string[]){this.source=parts.join('');}}
 let lastReply:any,hostWorker:any;
 class WorkerStub{
  onmessage:((event:any)=>void)|undefined;onerror:unknown;realm:any;stopped=false;
  constructor(url:string){hostWorker=this;this.realm={self:{postMessage:(message:any)=>{lastReply=message;this.onmessage?.({data:message});}}};runInNewContext(blobs.get(url)!,this.realm,{timeout:1000});}
  postMessage(message:any){if(!this.stopped&&!(options.stalled&&message.type==='step'))this.realm.self.onmessage({data:message});}
  terminate(){this.stopped=true;}
 }
 const code=transformSync(hopper.source,{loader:'ts',format:'iife',globalName:'GameModule'}).code;
 const game={...hopper,compiled:{code,sourceHash:hash(hopper.source),codeHash:hash(code),tests:{desktop:true,mobile:true,replay:true,isolation:true}}};
 const html=renderGenerated(game,'v1-input-fixture','v1-input-channel').html,script=html.match(/<script>([\s\S]*)<\/script>/)![1];
 runInNewContext(script,{document:{getElementById:(name:string)=>elements[name],querySelectorAll:()=>[action,right],body:{scrollHeight:680}},parent:{postMessage(){}},Blob:BlobStub,Worker:WorkerStub,
  URL:{createObjectURL:(blob:BlobStub)=>{const url='fixture:'+ ++id;blobs.set(url,blob.source);return url;},revokeObjectURL:(url:string)=>blobs.delete(url)},
  performance:{now:()=>now},setInterval:(fn:()=>void,ms:number)=>schedule(fn,ms,ms),setTimeout:(fn:()=>void,ms:number)=>schedule(fn,ms),clearInterval:(key:number)=>timers.delete(key)},
  {timeout:1000});
 function move(next:any){if(target!==next)target?.onpointerleave?.();target=next;}
 function down(){mouseDown=true;target?.onpointerdown?.();}
 function up(){mouseDown=false;target?.onpointerup?.();target?.onclick?.({clientX:80,clientY:60});}
 const control={hover:async()=>move(action),boundingBox:async()=>({x:10,y:500,width:100,height:48})},frame={locator:(selector:string)=>({getAttribute:async(name:string)=>String(elements[selector.slice(1)].dataset[name.slice(5)]??'')})};
 const page={viewportSize:()=>({width:720,height:800}),mouse:{down:async()=>down(),up:async()=>up(),move:async()=>move(null)},waitForTimeout:async(ms:number)=>{if(inFlight){inFlight=false;hostWorker.onmessage({data:lastReply});hostWorker.onmessage({data:lastReply});}advance(ms);}};
 const module={exports:{} as {pressV1Control:(page:any,frame:any,control:any)=>Promise<void>}},workerPath=new URL('../server/sandbox/worker.cjs',import.meta.url);
 // Only the exported input gesture runs here; compilation/browser dependencies
 // are unused. The CLI guard prevents stdin listeners when the helper is loaded.
 runInNewContext(readFileSync(workerPath,'utf8'),{require:()=>({}),module,performance:{now:()=>now}},{timeout:1000});
 elements.start.onclick();
 return {page,frame,control,advance,elements,press:()=>module.exports.pressV1Control(page,frame,control),clickControl(){move(action);down();up();},clickCanvas(){move(canvas);down();up();},get mouseDown(){return mouseDown;},get now(){return now;},get pendingClickCleanup(){return [...timers.values()].filter(timer=>!timer.repeat).length;}};
}

test('v1 gate holds an ordinary control across simulation samples before canvas pointerleave',async()=>{
 const old=controlledPreview();
 for(let i=0;i<30;i++){old.clickControl();old.clickCanvas();old.advance(100);}
 assert.equal(old.elements.score.textContent,'Score: 0','the old click then immediate pointerleave can lose every sampled control');
 assert.equal(old.elements.status.dataset.state,'playing');
 assert.ok(Number(old.elements.game.dataset.inputs)>0,'input-event counts alone do not establish delivery to a step');
 const fixed=controlledPreview({inFlightFrames:true});
 await fixed.press();
 assert.ok(fixed.now>=100,'already in-flight frames cannot end the hold before two sampling periods');
 assert.equal(fixed.elements.score.textContent,'Score: 2');
 assert.equal(fixed.mouseDown,false);
 assert.equal(fixed.pendingClickCleanup,0,'release outside the button does not create a click timer that could clear a later press');
 fixed.clickCanvas();fixed.advance(50);
 assert.equal(fixed.elements.score.textContent,'Score: 2','leaving the button only clears future input after observed held samples');
 await fixed.press();fixed.clickCanvas();
 assert.equal(fixed.elements.status.dataset.state,'won','the unchanged authored fixture wins through ordinary inputs');
});

test('v1 control probe fails a stalled game and releases its physical pointer',async()=>{
 const preview=controlledPreview({stalled:true});
 await assert.rejects(()=>preview.press(),/CONTROL_DID_NOT_ADVANCE/);
 assert.equal(preview.mouseDown,false);
 assert.equal(preview.now,700,'the probe is bounded by the existing v1 watchdog interval');
 assert.notEqual(preview.elements.status.dataset.state,'won');
});

test('v1 control probe retains loss rejection and pointer cleanup',async()=>{
 const preview=controlledPreview();preview.elements.status.dataset.state='lost';
 await assert.rejects(()=>preview.press(),/PLAYTEST_LOST/);
 assert.equal(preview.mouseDown,false);
});
