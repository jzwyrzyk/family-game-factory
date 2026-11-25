import test from 'node:test';
import assert from 'node:assert/strict';
import {installParentGuidance,hasParentGuidance} from '../src/family-beta/guidance';

test('a delayed supervised start cannot revive authority after End, profile round trip, or page hide',async()=>{
 const previous={window:globalThis.window,document:globalThis.document,fetch:globalThis.fetch};
 const nodes=new Map<string,any>();
 const node=()=>({id:'',hidden:false,disabled:false,textContent:'',innerHTML:'',className:'',onclick:null as any,setAttribute(){},append(value:any){nodes.set(value.id,value);},prepend(value:any){nodes.set(value.id,value);},querySelector(selector:string){return nodes.get(selector.slice(1));}});
 for(const id of ['parentPanel-settings','page-studio','parentGuidanceStatus','parentGuidanceStart','parentGuidanceEnd'])nodes.set(id,node());
 let profile='early-one';const window=new EventTarget() as any;window.FG={store:{current:()=>({id:profile,grade:-1})}};
 Object.assign(globalThis,{window,document:{documentElement:{dataset:{privateBeta:'true',parentGuidance:'true'}},getElementById:(id:string)=>nodes.get(id),createElement:()=>node()}});
 let resolveStart:(response:Response)=>void=()=>{};
 globalThis.fetch=(async(_url:unknown,init:RequestInit)=>JSON.parse(String(init.body)).supervise?new Promise<Response>(resolve=>{resolveStart=resolve;}):new Response('{}',{status:200})) as typeof fetch;
 try{
  installParentGuidance();
  assert.equal(nodes.has('builderConnection'),false,'The remote builder is deliberately not installed.');
  assert.equal(nodes.has('parentGuidance'),true,'Local Parent settings must contain guidance before remote configuration arrives.');
  for(const stop of ['end','profile','pagehide']){
   const pending=nodes.get('parentGuidanceStart').onclick();
   if(stop==='end')await nodes.get('parentGuidanceEnd').onclick();
   if(stop==='profile'){window.dispatchEvent(new Event('factory-profile-changing'));profile='other';window.dispatchEvent(new Event('factory-profile'));profile='early-one';window.dispatchEvent(new Event('factory-profile'));}
   if(stop==='pagehide')window.dispatchEvent(new Event('pagehide'));
   resolveStart(new Response(JSON.stringify({token:'synthetic-grant',profileId:profile,expiresAt:Date.now()+60000}),{status:200}));await pending;
   assert.equal(hasParentGuidance(profile),false,stop+' must invalidate the in-flight grant');
  }
 }finally{window.dispatchEvent(new Event('pagehide'));Object.assign(globalThis,previous);}
});
