import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { defaults } from '../src/runtime/manifests';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);

function bundle(file:string,globalName:string){return buildSync({entryPoints:[new URL('../'+file,import.meta.url).pathname],bundle:true,write:false,format:'iife',globalName,platform:'browser',target:'es2022',keepNames:false}).outputFiles[0].text;}

test('learning runtime excludes overlapping game/host pauses and preserves a manual pause',()=>{
  let now=0,ctx:any,manual=false,held=false,disposed=0;const events:any[]=[],outcomes:any[]=[];
  const realm:any={performance:{now:()=>now},window:{dispatchEvent:(event:any)=>events.push(event)},CustomEvent:class{constructor(readonly type:string,readonly detail:any){}}};
  runInNewContext(bundle('src/runtime/lifecycle.ts','LearningLifecycle'),realm);
  const target={inert:false,replaceChildren(){}};
  const plugin={manifest:{id:'gum'},mount(_target:any,context:any){ctx=context;return {isPlaying:()=>!manual&&!held,pause(){if(held)return false;held=true;if(!manual)ctx.emit({type:'pause',name:'fixture'});return true;},resume(){held=false;if(!manual)ctx.emit({type:'resume',name:'fixture'});},next(){},restart(){},unmount(){disposed++;}};}};
  const life=realm.LearningLifecycle.createLifecycle(plugin,target,defaults('gum'),'classic',(value:any)=>outcomes.push(value));
  life.start();now=100;assert.equal(life.pause(),true);assert.equal(target.inert,true);assert.equal(life.isPlaying(),false);
  now=1000;life.resume();assert.equal(target.inert,false);assert.equal(life.isPlaying(),true);
  now=1100;manual=true;ctx.emit({type:'pause',name:'fixture'});
  now=1200;assert.equal(life.pause(),true);now=1300;life.resume();assert.equal(life.isPlaying(),false,'finishing math cannot undo the child’s own pause');
  now=1500;manual=false;ctx.emit({type:'resume',name:'fixture'});now=1700;ctx.finish({won:true,level:1,title:'Done',description:'Fixture'});
  assert.equal(outcomes.length,1);assert.equal(outcomes[0].durationMs,400);ctx.finish({won:true});assert.equal(outcomes.length,1);
  assert.equal(life.pause(),false,'a completed round cannot be paused again');life.dispose();life.dispose();assert.equal(disposed,1);
  const count=events.length;ctx.emit({type:'checkpoint',name:'late'});assert.equal(events.length,count);
});

function clientHarness(client:string){
  let now=0,id=0;const listeners=new Map<string,(event:any)=>void>(),raf=new Map<number,(now:number)=>void>(),intervals=new Map<number,()=>void>();
  const reports:any[]=[],requests:any[]=[],workers:any[]=[],replies:Array<()=>void>=[];
  const noop=()=>{},ctx=new Proxy({},{get:()=>noop});
  const element=(name:string)=>({id:name,dataset:{} as Record<string,string>,style:{},disabled:false,textContent:'',tagName:name==='game'?'CANVAS':'BUTTON',attrs:{} as Record<string,string>,focusCount:0,
    setAttribute(key:string,value:string){this.attrs[key]=value;},focus(){this.focusCount++;},getContext:()=>ctx,getBoundingClientRect:()=>({left:0,top:0,width:720,height:400}),setPointerCapture:noop});
  const nodes:any=Object.fromEntries(['game','status','score','pause','start','replay','music','effects'].map(name=>[name,element(name)]));
  const control:any=element('right-control');control.dataset.control='right';
  const parent={postMessage:(packet:any)=>reports.push(structuredClone(packet))};
  const document:any={hidden:false,body:{scrollHeight:650},getElementById:(name:string)=>nodes[name],querySelectorAll:()=>[control],addEventListener:(event:string,fn:any)=>listeners.set('document:'+event,fn)};
  class FakeWorker {
    onmessage:((event:any)=>void)|null=null;onerror:unknown;terminated=false;ticks=0;
    constructor(_url:string){workers.push(this);}
    postMessage(packet:any){requests.push(structuredClone(packet));replies.push(()=>{if(this.terminated)return;if(packet.type==='tick')this.ticks+=packet.steps;this.reply();});}
    reply(status='playing',score=0){this.onmessage?.({data:{commands:[],outcome:{status,score},presentation:{bodies:0,joints:0,ticks:this.ticks,camera:{x:0,y:0,zoom:1},sounds:[],music:'off'}}});}
    terminate(){this.terminated=true;}
  }
  const realm:any={document,parent,performance:{now:()=>now},Worker:FakeWorker,Blob:class{},URL:{createObjectURL:()=>'/fixture-worker',revokeObjectURL:noop},
    requestAnimationFrame:(fn:any)=>{raf.set(++id,fn);return id;},cancelAnimationFrame:(key:number)=>raf.delete(key),setInterval:(fn:any)=>{intervals.set(++id,fn);return id;},clearInterval:(key:number)=>intervals.delete(key),addEventListener:(event:string,fn:any)=>listeners.set(event,fn)};
  runInNewContext(client,realm);realm.FactoryClient.startClient({worker:'trusted test worker',channel:'learning-channel',artifactId:'learning-artifact',controls:['right']});
  function flush(){while(replies.length)replies.shift()!();}
  function frame(ms=20){now+=ms;const first=raf.entries().next().value;if(first){raf.delete(first[0]);first[1](now);}flush();}
  function command(action:string,extra={},source:any=parent){listeners.get('message')!({source,data:{type:'factory-learning',channel:'learning-channel',artifactId:'learning-artifact',action,...extra}});}
  return {nodes,control,document,reports,requests,workers,listeners,command,frame,flush,intervals,advance:(ms:number)=>{now+=ms;}};
}

test('trusted v2 math bridge validates owner channel, freezes controls, resumes same round and emits fresh replay ids',()=>{
  const h=clientHarness(bundle('server/sandbox/client-v2.ts','FactoryClient'));
  assert.equal(h.reports[0].learningProtocol,1);h.command('connect');assert.equal(h.reports.at(-1).learningProtocol,1,'load handshake is repeatable');
  h.nodes.start.onclick();h.flush();h.control.onpointerdown({pointerId:1,preventDefault(){}});h.frame();
  h.command('pause',{},{});assert.equal(h.nodes.replay.disabled,false,'a non-parent sender has no pause authority');
  h.command('pause',{channel:'wrong'});assert.equal(h.nodes.replay.disabled,false,'a different preview channel has no authority');
  h.command('pause');assert.equal(h.nodes.replay.disabled,true);assert.equal(h.nodes.game.dataset.paused,'true');
  const posted=h.requests.length,workers=h.workers.length;
  h.nodes.start.onclick();h.nodes.replay.onclick();h.nodes.pause.onclick();h.control.onpointerdown({pointerId:2,preventDefault(){}});h.frame(500);
  assert.equal(h.requests.length,posted);assert.equal(h.workers.length,workers,'replay cannot replace an unanswered learning round');
  h.command('resume');h.frame();assert.equal(h.workers.length,workers);assert.deepEqual(h.requests.at(-1).input.pressed,[],'held input is cleared before resuming');
  h.workers.at(-1).reply('won',2);const end=h.reports.find(packet=>packet.event==='round-complete');assert.equal(end.roundId,1);assert.equal(end.score,2);assert.equal(h.nodes.replay.disabled,true);
  h.command('resume',{focus:true});assert.equal(h.nodes.replay.disabled,false);assert.equal(h.nodes.replay.focusCount,1);
  h.nodes.replay.onclick();h.flush();h.control.onpointerdown({pointerId:3,preventDefault(){}});h.frame();h.workers.at(-1).reply('lost');
  assert.deepEqual(h.reports.filter(packet=>packet.event==='round-complete').map(packet=>packet.roundId),[1,2]);
});

test('trusted v2 requests math during endless active play and preserves an independent manual pause',()=>{
  const h=clientHarness(bundle('server/sandbox/client-v2.ts','FactoryClient'));h.command('connect');h.nodes.start.onclick();h.flush();
  h.nodes.pause.onclick();h.command('pause');h.command('resume');assert.equal(h.nodes.game.dataset.paused,'true','parent release does not cancel manual pause');h.nodes.pause.onclick();
  for(let i=0;i<4600&&!h.reports.some(packet=>packet.event==='math-checkpoint');i++)h.frame();
  const checkpoint=h.reports.find(packet=>packet.event==='math-checkpoint');assert.equal(checkpoint?.roundId,1);assert.equal(checkpoint?.checkpointId,1);assert.equal(h.nodes.replay.disabled,true);
  const posted=h.requests.length;h.advance(120_000);for(const check of h.intervals.values())check();h.frame();assert.equal(h.requests.length,posted);assert.equal(h.reports.some(packet=>packet.event==='preview-failed'),false,'host math time cannot trigger a worker timeout');
  h.command('resume');h.frame();assert.ok(h.requests.length>posted);assert.equal(h.workers.length,1,'a checkpoint resumes the same worker');
});

test('archived trusted v2 package matches the source math handshake contract',()=>{
  const trusted=require('../server/sandbox/bundle-v2.cjs').runtimeBundle();const h=clientHarness(trusted.client);
  h.command('connect');assert.equal(h.reports.at(-1).learningProtocol,1);h.nodes.start.onclick();h.flush();h.command('pause');assert.equal(h.nodes.replay.disabled,true);h.command('resume');assert.equal(h.nodes.replay.disabled,false);
});
