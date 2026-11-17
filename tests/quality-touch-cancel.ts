import assert from 'node:assert/strict';
import type {Page,FrameLocator,Locator} from 'playwright';
import type {GeneratedGame} from '../server/agent/generated';

// Authored test only. Use the exact archived runtime, without adding a runtime
// inspection hook or modifying its physics. One body, no gravity/collisions:
// a real spring holds against a constant force; after release that force moves it.
const dragProbe:GeneratedGame={kind:'generated-module-v2',title:'Touch cancellation probe',instructions:'Hold the ball, then cancel the touch.',controls:[],source:`export function createGame(api){const p=api.physics;return {
init(){p.reset({gravityY:0});p.body({id:'toy',shape:'circle',x:200,y:200,radius:24,mass:1});return {phase:'idle',held:0,free:0};},
step(s,input){const q=input.pointer;if(s.phase==='idle'&&q.pressed&&q.down)s.phase='holding';
if(s.phase==='holding'){if(q.down){p.drag('toy',200,200);s.held++;}else{p.drag(null);s.phase='released';}}
if(s.phase==='released')s.free++;if(s.phase!=='idle')p.force('toy',20,0);return s;},
draw(s){return [...p.sprites(),{type:'text',key:'probe',screen:true,x:20,y:40,text:s.phase+':'+s.held+':'+s.free,size:16,color:'#254b50'}];},
outcome(){return {status:'playing',score:0};}};}`};

type Observation={phase:string;held:number;free:number;x:number;ticks:number;cancels:number;pointerType:string};
async function observe(canvas:Locator):Promise<Observation>{
 return canvas.evaluate(el=>{
  const commands=JSON.parse((el as HTMLElement).dataset.snapshot||'[]'),toy=commands.find((c:any)=>c.key==='toy'),probe=commands.find((c:any)=>c.key==='probe');
  const [phase,held,free]=(probe?.text||'').split(':');const d=(el as HTMLElement).dataset;
  return {phase,held:Number(held),free:Number(free),x:toy?.x,ticks:Number(d.ticks),cancels:Number(d.touchCancels||0),pointerType:d.cancelPointerType||''};
 });
}
async function until(page:Page,canvas:Locator,condition:(value:Observation)=>boolean,label:string){
 const end=Date.now()+10000;let value=await observe(canvas);
 while(!condition(value)&&Date.now()<end){await page.waitForTimeout(20);value=await observe(canvas);}
 assert.ok(condition(value),label+': '+JSON.stringify(value));return value;
}

async function cancellationCase(page:Page,load:(game:GeneratedGame)=>Promise<FrameLocator>,rate:number,defect?:'input'|'joint'){
 const session=await page.context().newCDPSession(page);
 try{
  await session.send('Emulation.setCPUThrottlingRate',{rate});
  const game=defect==='joint'?{...dragProbe,source:dragProbe.source.replace('p.drag(null);','')}:dragProbe;
  const frame=await load(game),canvas=frame.locator('#game');await canvas.scrollIntoViewIfNeeded();
  await canvas.evaluate(el=>{
   el.addEventListener('pointercancel',event=>{const d=(el as HTMLElement).dataset;d.touchCancels=String(Number(d.touchCancels||0)+1);d.cancelPointerType=(event as PointerEvent).pointerType;});
  });
  if(defect==='input')await canvas.evaluate(el=>{(el as HTMLCanvasElement).onpointercancel=null;});
  const box=await canvas.boundingBox();assert.ok(box);
  const point={x:box.x+200/720*box.width,y:box.y+200/400*box.height,id:1,radiusX:5,radiusY:5};
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
  // Observe completed worker ticks, not an assumed number of frames in 350 ms.
  const held=await until(page,canvas,s=>s.phase==='holding'&&s.held>=60,'DRAG_NOT_ESTABLISHED');
  assert.ok(Math.abs(held.x-200)<10,'DRAG_DID_NOT_HOLD_AGAINST_FORCE: '+JSON.stringify(held));
  await session.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
  const released=await until(page,canvas,s=>s.free>=30||s.held>=held.held+30,'CANCEL_DID_NOT_ADVANCE');
  assert.equal(released.cancels,1,'a real touch-cancel event must reach the canvas');
  assert.equal(released.pointerType,'touch');
  assert.equal(released.phase,'released','CANCEL_INPUT_STUCK: '+JSON.stringify(released));
  assert.ok(released.x-held.x>50,'CANCEL_JOINT_STUCK: '+JSON.stringify({held,released}));
  console.log('PASS touch cancel: '+JSON.stringify({rate,heldTicks:held.held,freeTicks:released.free,heldX:held.x,releasedX:released.x,cancels:released.cancels}));
 }finally{
  await session.send('Emulation.setCPUThrottlingRate',{rate:1});await session.detach();
 }
}

export async function verifyTouchCancellation(page:Page,load:(game:GeneratedGame)=>Promise<FrameLocator>){
 await cancellationCase(page,load,1);
 await cancellationCase(page,load,4);
 // These negative controls must fail despite a genuine pointercancel event:
 // clearing the pointer and actually destroying the joint are both necessary.
 await assert.rejects(cancellationCase(page,load,1,'input'),/CANCEL_INPUT_STUCK/);
 await assert.rejects(cancellationCase(page,load,1,'joint'),/CANCEL_JOINT_STUCK/);
 console.log('PASS touch cancel negative controls: stuck pointer and retained spring joint rejected');
}
