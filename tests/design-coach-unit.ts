import assert from 'node:assert/strict';
import {freshDesign,validateDesign,validateExperiments,experiment,missingPlan,localCoach,validateCoachReply,type CoachContext,type CoachReply,PLAN_FIELDS} from '../src/studio/design';
import {StudioNotebook,STUDIO_KEY,type Candidate} from '../src/studio/notebook';
import {CoachService,type CoachConfig} from '../server/coach/service';
import {OpenAICoachProvider} from '../server/coach/private-provider';
import {MemoryRepository} from '../server/pipeline/repository';
import {COACH_POLICY} from '../server/coach/policy';
import {installCoaching} from '../src/studio/coaching';
class Memory {data=new Map<string,string>();fail=false;getItem(k:string){return this.data.get(k)??null}setItem(k:string,v:string){if(this.fail)throw Error('quota');this.data.set(k,v)}}

// Exercise the real coaching event handlers with a small DOM/storage port. Browser
// journeys separately verify rendering, focus and touch behavior in production.
function coachingHarness(game:'new'|'gum'='new'){
 const elements=new Map<string,any>();
 class Element {
  children:any[]=[];parentElement:Element|null=null;value='';textContent='';className='';open=false;rows=0;maxLength=0;type='';dataset:Record<string,string>={};
  onclick?:()=>void;oninput?:()=>void;onchange?:()=>void;private name='';private html='';private listeners=new Map<string,Function[]>();
  classList={add(..._x:string[]){},remove(..._x:string[]){}};
  set id(v:string){this.name=v;elements.set(v,this);}get id(){return this.name;}
  set innerHTML(v:string){this.html=v;for(const m of v.matchAll(/<([a-z][a-z0-9]*)[^>]*\bid="([^"]+)"[^>]*>/g)){const e=new Element();e.id=m[2];this.append(e);}}get innerHTML(){return this.html;}
  append(...children:any[]){for(const child of children){child.parentElement=this;this.children.push(child);}}
  prepend(...children:any[]){for(const child of children)child.parentElement=this;this.children.unshift(...children);}
  after(..._children:any[]){}replaceChildren(...children:any[]){this.children=[];this.append(...children);}
  setAttribute(_key:string,_value:string){}addEventListener(event:string,listener:Function){this.listeners.set(event,[...this.listeners.get(event)||[],listener]);}
  querySelector(selector:string){return selector==='.studio-send-row'?get('send-row'):null;}
  focus(){documentPort.activeElement=this;}
  dispatchEvent(event:Event){if(event.type==='input')this.oninput?.();for(const listener of this.listeners.get(event.type)||[])listener(event);return true;}
 }
 const get=(id:string)=>{if(!elements.has(id)){const e=new Element();e.id=id;}return elements.get(id) as Element;};
 const documentPort:any={activeElement:null,body:new Element(),createElement:()=>new Element(),getElementById:get};
 for(const id of ['studioPromptForm','studioPrompt','studioVersions','studioPlay','send-row'])get(id);
 const saved=new Map<string,PropertyDescriptor|undefined>();for(const key of ['document','window','fetch'])saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));
 const storage=new Memory(),book=new StudioNotebook(storage),initial=game==='new'?book.create('child-one','new','Synthetic new game'):book.create('child-one','gum','Synthetic game','fixture-project');let active=initial;
 const statuses:{text:string;error:boolean}[]=[],pending:{resolve:(response:Response)=>void;reject:(error:Error)=>void;signal:AbortSignal}[]=[],milestones:string[]=[],requests:any[]=[];let playCalls=0;
 Object.defineProperty(globalThis,'document',{configurable:true,value:documentPort});Object.defineProperty(globalThis,'window',{configurable:true,value:{FG:{learning:{active:false}},dispatchEvent:(event:Event)=>{if(event.type==='jems:milestone')milestones.push((event as CustomEvent<{kind:string}>).detail.kind);return true;}}});
 Object.defineProperty(globalThis,'fetch',{configurable:true,value:(url:string,options:RequestInit={})=>{
  // Session preflight is separate from the model reply: no message is queued
  // and no coach request is made until a valid family session is confirmed.
  if(url.endsWith('/v1/sessions/status'))return Promise.resolve(new Response(JSON.stringify({connected:true,trusted:true}),{status:200}));
  return new Promise<Response>((resolve,reject)=>{requests.push(JSON.parse(String(options.body)));pending.push({resolve,reject,signal:options.signal as AbortSignal});});
 }});
 const coach=installCoaching({notebook:book,current:()=>book.get(active.id,active.owner),owner:()=>active.owner,
  message:(session,role,text)=>{book.message(session.id,session.owner,role,text);},render(){},status:(text,error=false)=>{statuses.push({text,error});},
  config:()=>({version:1,mode:'remote',apiBaseUrl:'https://api.example',previewOrigin:'https://preview.example'}),localSupported:()=>false,
  tryRequest:async()=>{},rules:()=>'',playTest:async()=>{},playMain:async()=>{playCalls++;},combineTests:async()=>{},pauseForThinking:()=>true,showTalk(){}
 });coach.openSession();
 return {coach,book,storage,statuses,pending,milestones,requests,get playCalls(){return playCalls;},get,
  async awaitModelRequest(){
   // A successful auth preflight adds asynchronous microtasks before the model call.
   // Wait for the real call rather than assuming it is queued in the same tick.
   for(let turn=0;turn<20&&!pending.length;turn++)await Promise.resolve();
   assert.equal(pending.length,1,'expected exactly one model request after session preflight');
  },
  session:()=>book.get(active.id,active.owner),
  input(id:string,value:string){const input=get(id);input.focus();input.value=value;input.dispatchEvent(new Event('input'));},
  save(field:string){const input=get('plan-'+field),index=input.parentElement!.children.indexOf(input);input.parentElement!.children[index+2].children[0].onclick();},
  resolve(reply:CoachReply){pending.shift()!.resolve(new Response(JSON.stringify({mode:'model',reply}),{status:200}));},
  switchChild(){active=book.create('child-two','new','Another child’s game');coach.openSession();return active;},
  dispose(){for(const [key,descriptor]of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete (globalThis as any)[key];}}
 };
}
let passed=0;async function test(name:string,fn:()=>unknown|Promise<unknown>){await fn();console.log('PASS '+name);passed++;}
async function main(){
const mem=new Memory(),nb=new StudioNotebook(mem),owner='child-one',s=nb.create(owner,'gum','Synthetic rocket','project');
const c=(id:string,n:number):Candidate=>({id,baseId:'main-one',config:{gumBudget:n},prompt:'Try '+n+' gum sticks',summary:'Gum '+n});
await test('three independent test alternatives preserve main and each other',()=>{nb.saveExperiment(s.id,owner,c('a',12));nb.saveExperiment(s.id,owner,c('b',15));nb.saveExperiment(s.id,owner,c('c',18));const n=nb.get(s.id,owner);assert.equal(n.projectId,'project');assert.deepEqual(n.experiments?.map(e=>e.candidate.config!.gumBudget),[12,15,18]);assert.ok(n.experiments!.every(e=>e.baseId==='main-one'&&!e.parents.length));});
await test('continuing a test preserves original and names provenance',()=>{nb.saveExperiment(s.id,owner,c('d',14),['a'],'redesign','child');assert.equal(nb.get(s.id,owner).experiments![0].candidate.config!.gumBudget,12);assert.deepEqual(nb.get(s.id,owner).experiments![3].parents,['a']);});
await test('select test does not delete unselected alternatives',()=>{nb.selectExperiment(s.id,owner,'b');assert.equal(nb.get(s.id,owner).candidate!.id,'b');assert.equal(nb.get(s.id,owner).experiments!.length,4);});
await test('notes, predictions, source attribution and shelf survive reload',()=>{nb.note(s.id,owner,'b','Still exciting');const r=new StudioNotebook(mem).get(s.id,owner);assert.equal(r.experiments![1].notes,'Still exciting');assert.equal(r.experiments![3].origin,'child');});
await test('fork preserves authored history and plan while detaching absent test links',()=>{
 const storage=new Memory(),book=new StudioNotebook(storage),original=book.create(owner,'gum','Original experiment','original-project');
 book.saveExperiment(original.id,owner,c('original-test',12));book.note(original.id,owner,'original-test','My original note stays with that test.');
 book.message(original.id,owner,'child','I want a floating castle.');
 book.update(original.id,owner,x=>{x.design!.plan.fun={value:'Explore my floating castle',origin:'child',accepted:true,delegated:false};x.reflection=true;});
 book.observe(original.id,owner,'Completed a round','runtime','original-test');
 book.observe(original.id,owner,'I liked the wobble, even when it fell.','child','original-test');
 const before=book.get(original.id,owner),forked=book.fork(original.id,owner,'Castle copy','copied-project',null);
 assert.equal(forked.reflection,false);assert.deepEqual(forked.experiments,[]);assert.equal(forked.selectedTest,null);
 assert.deepEqual(forked.messages,before.messages);assert.deepEqual(forked.design!.plan,before.design!.plan);
 assert.deepEqual(forked.design!.observations,before.design!.observations.map(o=>({...o,experimentId:null})));
 assert.deepEqual(book.get(original.id,owner),before);
 assert.equal(book.get(original.id,owner).experiments![0].notes,'My original note stays with that test.');
 const recentRuntime=forked.design!.observations.filter(o=>o.source==='runtime').at(-1)!;
 assert.doesNotThrow(()=>book.observe(forked.id,owner,'Now I want to test the copy.','child',recentRuntime.experimentId));
 assert.equal(new StudioNotebook(storage).get(forked.id,owner).design!.observations.at(-1)!.text,'Now I want to test the copy.');
});
await test('cross-profile selection and notes rejected',()=>{assert.throws(()=>nb.selectExperiment(s.id,'other','a'));assert.throws(()=>nb.note(s.id,'other','a','leak'));});
await test('failed shelf write is atomic',()=>{const old=mem.getItem(STUDIO_KEY);mem.fail=true;assert.throws(()=>nb.saveExperiment(s.id,owner,c('failed',17)));mem.fail=false;assert.equal(mem.getItem(STUDIO_KEY),old);});
await test('unknown and cyclic test parents rejected',()=>{assert.throws(()=>experiment(c('z',5),nb.get(s.id,owner).experiments!,['z']));});
await test('helper provenance remains after child adopts an idea',()=>{nb.update(s.id,owner,x=>{x.design!.ideas.push({id:'idea1',text:'Try a different interaction',origin:'helper',adopted:true});});assert.equal(nb.get(s.id,owner).design!.ideas[0].origin,'helper');});
await test('game plan permits no-score/no-loss and explicit delegation',()=>{const d=freshDesign();for(const k of PLAN_FIELDS)d.plan[k]={value:k==='score'||k==='setback'?'None':'A choice',origin:'child',accepted:true,delegated:false};assert.deepEqual(missingPlan(d),[]);d.plan.special={value:'',origin:'helper',accepted:false,delegated:true};assert.deepEqual(missingPlan(d),[]);});
await test('unaccepted helper plan is not called child-approved',()=>{const d=freshDesign();d.plan.goal={value:'Rescue the dragon',origin:'helper',accepted:false,delegated:false};assert.ok(missingPlan(d).includes('goal'));});
await test('record rejects inferred emotions, secret fields, malformed evidence',()=>{assert.throws(()=>validateDesign({...freshDesign(),emotion:'frustrated'}));assert.throws(()=>validateDesign({...freshDesign(),plan:{token:{value:'secret'}}}));assert.throws(()=>validateExperiments([{...nb.get(s.id,owner).experiments![0],url:'https://secret'}]));});
const context:CoachContext={message:'I dislike aiming',mode:'discuss',game:'dragon',plan:{fun:{value:'Exciting close calls',origin:'child',accepted:true,delegated:false}},friction:'',helpLevel:0,support:'balanced',conversation:[],observations:[],tests:[]};
const reply:CoachReply={move:'clarify',text:'We can question the action, not just the difficulty.',question:'Could your hero reach that goal another way?',suggestions:[],proposedChange:null,planSuggestions:[],evidenceIds:[]};
await test('plan input survives another field save, rerender and durable reload without approving a build',()=>{
 const h=coachingHarness();try{h.input('plan-action','Jump over the river');h.input('plan-goal','Deliver the pizza');h.save('goal');h.coach.renderPlan();
  assert.equal(h.get('plan-action').value,'Jump over the river');const restored=new StudioNotebook(h.storage).get(h.session().id,h.session().owner);
  assert.equal(restored.design!.plan.action!.value,'Jump over the river');assert.equal(restored.design!.plan.goal!.value,'Deliver the pizza');assert.equal(restored.design!.approvedPlan,false);
 }finally{h.dispose();}
});
await test('autosave retains unchanged helper provenance and explicit acceptance remains separate',()=>{
 const h=coachingHarness();try{const s=h.session();h.book.update(s.id,s.owner,x=>{x.design!.plan.style={value:'A cloud castle',origin:'helper',accepted:false,delegated:false};});h.coach.openSession();
  h.input('plan-style','A cloud castle');assert.equal(h.session().design!.plan.style!.origin,'helper');assert.equal(h.session().design!.plan.style!.accepted,false);
  h.input('plan-style','A cloud castle with penguins');assert.equal(h.session().design!.plan.style!.origin,'child');
  h.input('plan-style','A cloud castle');assert.equal(h.session().design!.plan.style!.origin,'helper');assert.equal(h.session().design!.plan.style!.accepted,false);
  h.save('style');assert.equal(h.session().design!.plan.style!.origin,'helper');assert.equal(h.session().design!.plan.style!.accepted,true);assert.equal(h.session().design!.approvedPlan,false);
 }finally{h.dispose();}
});
await test('safety refusal or private information never falls into unreviewed local coach',async()=>{
 for(const code of ['COACH_REFUSED','PRIVATE_INFORMATION']){
  const h=coachingHarness();
  try{
   h.input('studioPrompt','Please tell me something private');
   const turn=h.coach.discuss('discuss');await h.awaitModelRequest();
   h.pending.shift()!.resolve(new Response(JSON.stringify({errorCode:code}),{status:422}));
   await turn;
   assert.match(h.session().messages.at(-1)!.text,/safe game ideas/);
   assert.match(h.get('coachModeStatus').textContent,/could not be used safely/);
   assert.equal(h.session().job,null);
   assert.equal(h.session().experiments?.length,0);
  }finally{h.dispose();}
 }
});
await test('model-backed path receives real bounded conversation context over multiple synthetic turns, with no build',async()=>{
 const h=coachingHarness();
 try{
  h.input('studioPrompt','The dragon should sneeze spaghetti');
  const first=h.coach.discuss('discuss');
  await h.awaitModelRequest();
  h.resolve({...reply,text:'Spaghetti sneezes could be funny!',question:'When should the dragon sneeze?'});
  await first;
  h.input('studioPrompt','Only if I jump');
  const second=h.coach.discuss('discuss');
  await h.awaitModelRequest();
  const sent=h.requests.at(-1).context as CoachContext;
  assert.equal(sent.message,'Only if I jump');
  assert.ok(sent.conversation.some(m=>m.role==='child'&&m.text==='The dragon should sneeze spaghetti'));
  assert.ok(sent.conversation.some(m=>m.role==='helper'&&m.text.includes('When should the dragon sneeze?')));
  assert.ok(sent.conversation.some(m=>m.role==='child'&&m.text==='Only if I jump'));
  assert.ok(sent.conversation.length<=16);
  h.resolve({...reply,text:'So jumping is your trigger.',question:'Should it sneeze once per jump?'});
  await second;
  assert.equal(h.session().job,null);
  assert.equal(h.session().experiments?.length,0);
  assert.equal(h.requests.length,2,'two model-turn calls, zero game generations');
 }finally{h.dispose();}
});
await test('model play move returns to the game without any automatic build',async()=>{
 const h=coachingHarness('gum');
 try{
  h.input('studioPrompt','I would rather get back into the game');
  const turn=h.coach.discuss('discuss');
  await h.awaitModelRequest();
  h.resolve({...reply,move:'play',text:'Okay, go play!',question:null});
  await turn;
  assert.equal(h.playCalls,1);
  assert.equal(h.requests.length,1);
  assert.equal(h.session().job,null);
 }finally{h.dispose();}
});
await test('never mind cancels without a provider call or an experiment',async()=>{
 const h=coachingHarness();
 try{
  h.input('studioPrompt','Actually never mind');
  await h.coach.discuss('discuss');
  assert.equal(h.requests.length,0);
  assert.equal(h.session().job,null);
  assert.match(h.session().messages.at(-1)!.text,/No game changed/);
 }finally{h.dispose();}
});
await test('just let me play returns to the existing game without interviewing or building',async()=>{
 const h=coachingHarness('gum');
 try{
  h.input('studioPrompt','I just want to play now');
  await h.coach.discuss('discuss');
  assert.equal(h.playCalls,1);
  assert.equal(h.requests.length,0);
  assert.equal(h.session().job,null);
 }finally{h.dispose();}
});
await test('a delayed coach reply preserves a newly typed draft before its debounce saves',async()=>{
 const h=coachingHarness();try{h.input('studioPrompt','I want a different way to move');const turn=h.coach.discuss('discuss');await h.awaitModelRequest();assert.deepEqual(h.milestones,['idea'],'first persisted child idea emits its earned milestone');
  h.input('studioPrompt','Maybe the penguin could bounce');h.resolve(reply);await turn;
  assert.equal(h.get('studioPrompt').value,'Maybe the penguin could bounce');assert.equal(h.session().draft,'Maybe the penguin could bounce');assert.equal(h.session().messages[0].text,'I want a different way to move');assert.equal(h.statuses.some(s=>s.error),false);
 }finally{h.dispose();}
});
await test('retyping the same draft while the coach replies still counts as new work',async()=>{
 const h=coachingHarness();try{h.input('studioPrompt','Make the tower wobble');const turn=h.coach.discuss('discuss');h.input('studioPrompt','');h.input('studioPrompt','Make the tower wobble');await h.awaitModelRequest();h.resolve(reply);await turn;assert.equal(h.session().draft,'Make the tower wobble');assert.equal(h.get('studioPrompt').value,'Make the tower wobble');}finally{h.dispose();}
});
await test('a late coach suggestion cannot overwrite a newer child plan answer',async()=>{
 const h=coachingHarness();try{h.input('studioPrompt','I want a castle');const turn=h.coach.discuss('discuss');h.input('plan-style','A castle made of colourful boats');await h.awaitModelRequest();h.resolve({...reply,planSuggestions:[{field:'style',value:'A stone castle'}]});await turn;assert.equal(h.session().design!.plan.style!.value,'A castle made of colourful boats');assert.equal(h.session().design!.plan.style!.origin,'child');assert.equal(h.session().design!.approvedPlan,false);}finally{h.dispose();}
});
await test('an old rejected coach request cannot write into a new child or interrupt their reply',async()=>{
 const h=coachingHarness();try{h.input('studioPrompt','First child idea');const old=h.coach.discuss('discuss');await h.awaitModelRequest();const oldRequest=h.pending.shift()!;
  h.switchChild();h.input('studioPrompt','Second child idea');const current=h.coach.discuss('discuss');await h.awaitModelRequest();oldRequest.reject(Error('Late aborted network request'));await old;
  assert.match(h.get('coachModeStatus').textContent,/thinking about your idea/i);assert.deepEqual(h.session().messages.map(m=>m.text),['Second child idea']);
  h.resolve(reply);await current;assert.equal(h.session().messages.length,2);assert.ok(h.session().messages.every(m=>!m.text.includes('First child')));assert.equal(h.statuses.some(s=>s.error),false);
 }finally{h.dispose();}
});
await test('a failed plan autosave keeps the visible answer through another save and can retry',()=>{
 const h=coachingHarness();try{h.storage.fail=true;h.input('plan-action','Balance on a wobbly bridge');assert.equal(h.session().design!.plan.action,undefined);assert.match(h.get('planSaveStatus').textContent,/has not saved/);
  h.storage.fail=false;h.input('plan-goal','Reach the treehouse');h.save('goal');h.coach.renderPlan();assert.equal(h.get('plan-action').value,'Balance on a wobbly bridge');assert.equal(h.get('plan-credit-action').textContent,'Not saved yet');assert.match(h.get('planSaveStatus').textContent,/Some answers have not saved/);
  h.save('action');assert.equal(h.session().design!.plan.action!.value,'Balance on a wobbly bridge');assert.equal(h.session().design!.approvedPlan,false);assert.equal(h.statuses.some(s=>s.error),true);
 }finally{h.dispose();}
});
await test('navigation flush blocks on an unsaved plan, then saves all visible drafts before reopening',()=>{
 const h=coachingHarness();try{
  h.storage.fail=true;h.input('plan-fun','A funny wobbly bridge');h.input('designPrediction','The lighter bridge might sway');h.input('coachFriction','I want to try balancing');
  assert.throws(()=>h.coach.flushDrafts(),/Could not save this notebook/);assert.equal(h.get('plan-fun').value,'A funny wobbly bridge');assert.equal(h.session().design!.plan.fun,undefined);
  h.storage.fail=false;h.coach.flushDrafts();h.coach.openSession();
  assert.equal(h.get('plan-fun').value,'A funny wobbly bridge');assert.equal(h.get('designPrediction').value,'The lighter bridge might sway');assert.equal(h.get('coachFriction').value,'I want to try balancing');
  const restored=new StudioNotebook(h.storage).get(h.session().id,h.session().owner);assert.equal(restored.design!.plan.fun!.value,'A funny wobbly bridge');assert.equal(restored.hypothesis,'The lighter bridge might sway');assert.equal(restored.design!.friction,'I want to try balancing');assert.equal(restored.design!.approvedPlan,false);
 }finally{h.dispose();}
});
await test('a coach persistence failure is caught and retains the child draft for recovery',async()=>{
 const h=coachingHarness();try{h.input('studioPrompt','Keep my idea if saving fails');const turn=h.coach.discuss('discuss');await h.awaitModelRequest();h.storage.fail=true;h.resolve(reply);await assert.doesNotReject(turn);
  assert.equal(h.get('studioPrompt').value,'Keep my idea if saving fails');assert.equal(h.session().messages.length,1);assert.match(h.get('coachModeStatus').textContent,/could not be saved/);assert.equal(h.statuses.some(s=>s.error),true);
 }finally{h.dispose();}
});

await test('model cannot declare a build or promotion action',()=>{assert.throws(()=>validateCoachReply({...reply,promote:true},context));assert.throws(()=>validateCoachReply({...reply,move:'execute'},context));});
await test('unsupported observation citation rejected',()=>{assert.throws(()=>validateCoachReply({...reply,evidenceIds:['not-real']},context));});
await test('one question per reply, not a disguised interview',()=>{assert.throws(()=>validateCoachReply({...reply,text:'What happened? What next?'},context));});
await test('offline help opens the interaction design space without giving the benchmark answer',()=>{const r=localCoach({...context,message:'I hate aiming'});assert.match(r.text,/action itself/);assert.doesNotMatch(JSON.stringify(r),/shield|pong/i);assert.equal(r.proposedChange,null);});
await test('help escalates without repeating the same question',()=>{const qs=[0,1,2].map(helpLevel=>localCoach({...context,message:"I don't know",helpLevel}).question);assert.equal(new Set(qs).size,3);});
await test('requests for inspiration get alternatives; no withholding',()=>{assert.ok(localCoach({...context,mode:'ideas'}).suggestions.length>=2);});
await test('winning does not automatically establish enjoyment',()=>{const r=localCoach({...context,message:'I won but it was boring'});assert.match(r.text,/change the action or goal/);});
await test('gold policy explicitly preserves redesign, skip, ownership and not overclaiming',()=>{for(const phrase of ['not as a fixed interview','child owns','Rethinking','no nagging','one play is not proof'])assert.ok(COACH_POLICY.toLowerCase().includes(phrase.toLowerCase()),phrase);});
await test('conversation coach respects either required learning subject',()=>{assert.match(COACH_POLICY,/Math or Language Arts/);assert.match(COACH_POLICY,/cannot change the parent's chosen subject/);assert.match(COACH_POLICY,/required learning layer/);});
const config:CoachConfig={enabled:true,privacyApproved:true,moderationApproved:true,zdrVerified:true,privateExecutionApproved:true,model:'synthetic-model',maxInputChars:16000,maxOutputTokens:500,maxTurnMicroUsd:10000,inputMicroUsdPerMillion:1,outputMicroUsdPerMillion:2,pricesReviewedAt:new Date().toISOString()};
const privateConfig={...config,apiKey:'synthetic-secret-from-private-executor'};
const session={subject:'synthetic-designer',familyId:'family-test',role:'designer' as const,expiresAt:Date.now()+60000};
const repo=new MemoryRepository();await repo.transaction(s=>{s.ledgers[session.familyId]={allowance:50000,reserved:0,used:0,paidEnabled:true,month:new Date().toISOString().slice(0,7)};s.coachConsent=[{familyId:session.familyId,guardianSubject:'synthetic-parent',confirmedAt:Date.now(),expiresAt:Date.now()+3600000,policyVersion:'owner-pilot-1',model:true,audio:false,verificationReceipt:'fixture_verified_consent_123'}];return true;});
let calls=0;const provider={complete:async()=>{calls++;return {reply,usedMicroUsd:100};}};
const service=new CoachService(repo,config,provider);
await test('real service contract uses authorized budgeted provider port',async()=>{const r=await service.respond(session,{requestId:'req1',context});assert.equal(r.mode,'model');assert.equal(r.reply.move,'clarify');assert.equal(calls,1);const ledger=(await repo.snapshot()).ledgers[session.familyId];assert.equal(ledger.used,100);assert.equal(ledger.reserved,0);});
await test('idempotent turn does not repeat inference or charge',async()=>{await service.respond(session,{requestId:'req1',context});assert.equal(calls,1);});
await test('payload rebinding rejected',async()=>{await assert.rejects(service.respond(session,{requestId:'req1',context:{...context,message:'different'}}),/IDEMPOTENCY/);});
await test('expired session rejected before inference',async()=>{await assert.rejects(service.respond({...session,expiresAt:0},{requestId:'expired',context}),/UNAUTHENTICATED/);});
await test('disabled provider and privacy gates fail closed',async()=>{for(const patch of [{enabled:false},{privacyApproved:false},{moderationApproved:false},{zdrVerified:false},{privateExecutionApproved:false},{pricesReviewedAt:'2020-01-01'}])await assert.rejects(new CoachService(repo,{...config,...patch},provider).respond(session,{requestId:'gate',context}),/UNAVAILABLE/);});
await test('contact information blocked before provider call',async()=>{await assert.rejects(service.respond(session,{requestId:'pii',context:{...context,message:'Email test@example.invalid'}}),/PRIVATE_INFORMATION/);assert.equal(calls,1);});
await test('spending cutoff stops provider calls',async()=>{await repo.transaction(s=>{s.ledgers[session.familyId].allowance=100;return true;});await assert.rejects(service.respond(session,{requestId:'cap',context}),/SPENDING/);assert.equal(calls,1);});
await test('unknown provider failure conservatively settles reservation',async()=>{await repo.transaction(s=>{s.ledgers[session.familyId].allowance=50000;return true;});const failing=new CoachService(repo,config,{complete:async()=>{throw Error('network');}});await assert.rejects(failing.respond(session,{requestId:'fail',context}));const l=(await repo.snapshot()).ledgers[session.familyId];assert.equal(l.used,10100);assert.equal(l.reserved,0);});
await test('Responses transport is server-only, schema-bound and non-storing',async()=>{let captured:any;const transport:typeof fetch=async(url,init)=>{if(String(url).endsWith('/moderations'))return new Response(JSON.stringify({results:[{flagged:false}]}));assert.equal(String(url),'https://api.openai.com/v1/responses');captured=JSON.parse(String(init?.body));return new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(reply)}]}],usage:{input_tokens:10,output_tokens:20}}),{status:200});};const p=new OpenAICoachProvider(privateConfig,transport);await p.complete(context,new AbortController().signal);assert.equal(captured.store,false);assert.equal(captured.text.format.strict,true);assert.equal(captured.tools,undefined);});
await test('refusal never becomes a proposed game',async()=>{const p=new OpenAICoachProvider(privateConfig,async(url)=>String(url).endsWith('/moderations')?new Response(JSON.stringify({results:[{flagged:false}]})):new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'refusal'}]}]})));await assert.rejects(p.complete(context,new AbortController().signal),/COACH_REFUSED/);});
await test('child-authorship requires an exact child quote, not a helper paraphrase',()=>{assert.throws(()=>validateCoachReply({...reply,childDecisions:[{field:'fun',quote:'I want a shield'}]},context));assert.equal(validateCoachReply({...reply,childDecisions:[{field:'fun',quote:'I dislike aiming'}]},context).childDecisions![0].quote,'I dislike aiming');});
await test('input moderation refuses before an inference request',async()=>{let inference=0;const p=new OpenAICoachProvider(privateConfig,async url=>{if(!String(url).endsWith('/moderations'))inference++;return new Response(JSON.stringify({results:[{flagged:true}]}));});await assert.rejects(p.complete(context,new AbortController().signal),/COACH_REFUSED/);assert.equal(inference,0);});
await test('output moderation prevents an unsafe response from reaching the child',async()=>{let mod=0;const p=new OpenAICoachProvider(privateConfig,async url=>{if(String(url).endsWith('/moderations'))return new Response(JSON.stringify({results:[{flagged:++mod===2}]}));return new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(reply)}]}],usage:{input_tokens:10,output_tokens:20}}));});await assert.rejects(p.complete(context,new AbortController().signal),/COACH_REFUSED/);assert.equal(mod,2);});
await test('invalid model output never mutates a game or becomes a trusted plan',async()=>{const bad=new CoachService(repo,config,{complete:async()=>({reply:{...reply,tool:'change-main'},usedMicroUsd:4})});await assert.rejects(bad.respond(session,{requestId:'bad-output',context}),/Invalid coach response/);assert.equal((await repo.snapshot()).coachReceipts!.find(r=>r.id==='bad-output')!.state,'failed');});
await test('request IDs cannot leak another family response',async()=>{const other={...session,familyId:'other-family'};await assert.rejects(service.respond(other,{requestId:'req1',context}),/COACH_UNAVAILABLE/);});
console.log(`${passed} design-coach tests passed. Model outputs are fixtures; no live inference or learning efficacy is claimed.`);

}
void main().catch(e=>{console.error(e);process.exitCode=1;});
