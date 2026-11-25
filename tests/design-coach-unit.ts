import assert from 'node:assert/strict';
import {freshDesign,validateDesign,validateExperiments,experiment,missingPlan,localCoach,validateCoachReply,type CoachContext,type CoachReply,PLAN_FIELDS} from '../src/studio/design';
import {creationBuildReadiness,creationConversation,recordCreationReview,selectedSuggestions} from '../src/studio/creation-readiness';
import {StudioNotebook,STUDIO_KEY,type Candidate} from '../src/studio/notebook';
import {CoachService,type CoachConfig} from '../server/coach/service';
import {OpenAICoachProvider} from '../server/coach/private-provider';
import {privateCoachHandler} from '../server/coach/private-executor';
import {MemoryRepository} from '../server/pipeline/repository';
import {COACH_POLICY} from '../server/coach/policy';
import {installCoaching,type CoachingNotebook} from '../src/studio/coaching';
class Memory {data=new Map<string,string>();fail=false;getItem(k:string){return this.data.get(k)??null}setItem(k:string,v:string){if(this.fail)throw Error('quota');this.data.set(k,v)}}

// Exercise the real coaching event handlers with a small DOM/storage port. Browser
// journeys separately verify rendering, focus and touch behavior in production.
function coachingHarness(game:'new'|'gum'='new',deferWrites=false){
 const elements=new Map<string,any>();
 class Element {
  children:any[]=[];parentElement:Element|null=null;value='';textContent='';className='';open=false;rows=0;maxLength=0;type='';dataset:Record<string,string>={};
  onclick?:()=>void|Promise<void>;oninput?:()=>void|Promise<void>;onchange?:()=>void|Promise<void>;lastAction:Promise<void>=Promise.resolve();private name='';private html='';private listeners=new Map<string,Function[]>();
  classList={add(..._x:string[]){},remove(..._x:string[]){}};
  set id(v:string){this.name=v;elements.set(v,this);}get id(){return this.name;}
  set innerHTML(v:string){this.html=v;for(const m of v.matchAll(/<([a-z][a-z0-9]*)[^>]*\bid="([^"]+)"[^>]*>/g)){const e=new Element();e.id=m[2];this.append(e);}}get innerHTML(){return this.html;}
  append(...children:any[]){for(const child of children){child.parentElement=this;this.children.push(child);}}
  prepend(...children:any[]){for(const child of children)child.parentElement=this;this.children.unshift(...children);}
  after(..._children:any[]){}replaceChildren(...children:any[]){this.children=[];this.append(...children);}
  setAttribute(_key:string,_value:string){}addEventListener(event:string,listener:Function){this.listeners.set(event,[...this.listeners.get(event)||[],listener]);}
  querySelector(selector:string){return selector==='.studio-send-row'?get('send-row'):null;}
  focus(){documentPort.activeElement=this;}
  dispatchEvent(event:Event){if(event.type==='input')this.lastAction=Promise.resolve(this.oninput?.());for(const listener of this.listeners.get(event.type)||[])listener(event);return true;}
 }
 const get=(id:string)=>{if(!elements.has(id)){const e=new Element();e.id=id;}return elements.get(id) as Element;};
 const documentPort:any={activeElement:null,body:new Element(),createElement:()=>new Element(),getElementById:get};
 for(const id of ['studioPromptForm','studioPrompt','studioVersions','studioPlay','send-row'])get(id);
 const saved=new Map<string,PropertyDescriptor|undefined>();for(const key of ['document','window','fetch'])saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));
 const storage=new Memory(),book=new StudioNotebook(storage),initial=game==='new'?book.create('child-one','new','Synthetic new game'):book.create('child-one','gum','Synthetic game','fixture-project');let active=initial;
 const statuses:{text:string;error:boolean}[]=[],coachStates:string[]=[],pending:{resolve:(response:Response)=>void;reject:(error:Error)=>void;signal:AbortSignal}[]=[],milestones:string[]=[],requests:any[]=[],buildRequests:{prompt:string;displayText?:string;compiledPlan?:boolean}[]=[];let playCalls=0,interceptBuildRequests=false;
 Object.defineProperty(globalThis,'document',{configurable:true,value:documentPort});Object.defineProperty(globalThis,'window',{configurable:true,value:{FG:{learning:{active:false}},dispatchEvent:(event:Event)=>{if(event.type==='jems:milestone')milestones.push((event as CustomEvent<{kind:string}>).detail.kind);return true;}}});
 Object.defineProperty(globalThis,'fetch',{configurable:true,value:(url:string,options:RequestInit={})=>{
  // Session preflight is separate from the model reply: no message is queued
  // and no coach request is made until a valid family session is confirmed.
  if(url.endsWith('/v1/sessions/status'))return Promise.resolve(new Response(JSON.stringify({connected:true,trusted:true}),{status:200}));
  return new Promise<Response>((resolve,reject)=>{requests.push(JSON.parse(String(options.body)));pending.push({resolve,reject,signal:options.signal as AbortSignal});});
 }});
 const deferredWrites:{commit():void;reject(error:Error):void}[]=[];
 const notebook=new Proxy(book,{get(target,key){const value=Reflect.get(target,key);if(typeof value!=='function')return value;
  if(deferWrites&&['update','reply','note','selectExperiment','observe'].includes(String(key)))return (...args:unknown[])=>new Promise((resolve,reject)=>deferredWrites.push({commit(){try{resolve(value.apply(target,args));}catch(error){reject(error);}},reject}));
  return value.bind(target);
 }}) as unknown as CoachingNotebook;
 const coach=installCoaching({notebook,current:()=>book.get(active.id,active.owner),owner:()=>active.owner,
  message:(session,role,text)=>{book.message(session.id,session.owner,role,text);},render(){},status:(text,error=false)=>{statuses.push({text,error});},onCoachState:state=>{coachStates.push(state);},
  config:()=>({version:1,mode:'remote',apiBaseUrl:'https://api.example',previewOrigin:'https://preview.example'}),localSupported:()=>false,
  tryRequest:async(prompt,_origin,_depth,displayText,compiledPlan)=>{buildRequests.push({prompt,displayText,compiledPlan});if(interceptBuildRequests)await coach.intercept(prompt,true);},rules:()=>'',playTest:async()=>{},playMain:async()=>{playCalls++;},combineTests:async()=>{},pauseForThinking:()=>true,showTalk(){}
 });coach.openSession();
 return {coach,book,storage,deferredWrites,statuses,coachStates,pending,milestones,requests,buildRequests,routeBuildRequestsThroughCoach:()=>{interceptBuildRequests=true;},get playCalls(){return playCalls;},get,has:(id:string)=>elements.has(id),
  async awaitModelRequest(){
   // A successful auth preflight adds asynchronous microtasks before the model call.
   // Wait for the real call rather than assuming it is queued in the same tick.
   for(let turn=0;turn<20&&!pending.length;turn++)await Promise.resolve();
   assert.equal(pending.length,1,'expected exactly one model request after session preflight');
  },
  session:()=>book.get(active.id,active.owner),
  input(id:string,value:string){const input=get(id);input.focus();input.value=value;input.dispatchEvent(new Event('input'));return input.lastAction;},
  save(field:string){const input=get('plan-'+field),index=input.parentElement!.children.indexOf(input);return input.parentElement!.children[index+2].children[0].onclick();},
  resolve(reply:CoachReply){pending.shift()!.resolve(new Response(JSON.stringify({mode:'model',reply}),{status:200}));},
  switchChild(){active=book.create('child-two','new','Another child’s game');coach.openSession();return active;},
  dispose(){for(const [key,descriptor]of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete (globalThis as any)[key];}}
 };
}
let passed=0;async function test(name:string,fn:()=>unknown|Promise<unknown>){await fn();console.log('PASS '+name);passed++;}
async function main(){
const mem=new Memory(),nb=new StudioNotebook(mem),owner='child-one',s=nb.create(owner,'gum','Synthetic rocket','project');
const c=(id:string,n:number):Candidate=>({id,baseId:'main-one',config:{gumBudget:n},prompt:'Try '+n+' gum sticks',summary:'Gum '+n});
await test('three independent test alternatives preserve main and each other',async()=>{nb.saveExperiment(s.id,owner,c('a',12));nb.saveExperiment(s.id,owner,c('b',15));nb.saveExperiment(s.id,owner,c('c',18));const n=nb.get(s.id,owner);assert.equal(n.projectId,'project');assert.deepEqual(n.experiments?.map(e=>e.candidate.config!.gumBudget),[12,15,18]);assert.ok(n.experiments!.every(e=>e.baseId==='main-one'&&!e.parents.length));});
await test('continuing a test preserves original and names provenance',async()=>{nb.saveExperiment(s.id,owner,c('d',14),['a'],'redesign','child');assert.equal(nb.get(s.id,owner).experiments![0].candidate.config!.gumBudget,12);assert.deepEqual(nb.get(s.id,owner).experiments![3].parents,['a']);});
await test('select test does not delete unselected alternatives',async()=>{nb.selectExperiment(s.id,owner,'b');assert.equal(nb.get(s.id,owner).candidate!.id,'b');assert.equal(nb.get(s.id,owner).experiments!.length,4);});
await test('notes, predictions, source attribution and shelf survive reload',async()=>{nb.note(s.id,owner,'b','Still exciting');const r=new StudioNotebook(mem).get(s.id,owner);assert.equal(r.experiments![1].notes,'Still exciting');assert.equal(r.experiments![3].origin,'child');});
await test('fork preserves authored history and plan while detaching absent test links',async()=>{
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
await test('cross-profile selection and notes rejected',async()=>{assert.throws(()=>nb.selectExperiment(s.id,'other','a'));assert.throws(()=>nb.note(s.id,'other','a','leak'));});
await test('failed shelf write is atomic',async()=>{const old=mem.getItem(STUDIO_KEY);mem.fail=true;assert.throws(()=>nb.saveExperiment(s.id,owner,c('failed',17)));mem.fail=false;assert.equal(mem.getItem(STUDIO_KEY),old);});
await test('unknown and cyclic test parents rejected',async()=>{assert.throws(()=>experiment(c('z',5),nb.get(s.id,owner).experiments!,['z']));});
await test('helper provenance remains after child adopts an idea',async()=>{nb.update(s.id,owner,x=>{x.design!.ideas.push({id:'idea1',text:'Try a different interaction',origin:'helper',adopted:true});});assert.equal(nb.get(s.id,owner).design!.ideas[0].origin,'helper');});
await test('legacy design storage preserves no-score/no-loss and delegation without granting build authority',async()=>{const d=freshDesign();for(const k of PLAN_FIELDS)d.plan[k]={value:k==='score'||k==='setback'?'None':'A choice',origin:'child',accepted:true,delegated:false};assert.deepEqual(missingPlan(d),[]);d.plan.special={value:'',origin:'helper',accepted:false,delegated:true};assert.deepEqual(missingPlan(d),[]);});
await test('unaccepted helper plan is not called child-approved',async()=>{const d=freshDesign();d.plan.goal={value:'Rescue the dragon',origin:'helper',accepted:false,delegated:false};assert.ok(missingPlan(d).includes('goal'));});
await test('record rejects inferred emotions, secret fields, malformed evidence',async()=>{assert.throws(()=>validateDesign({...freshDesign(),emotion:'frustrated'}));assert.throws(()=>validateDesign({...freshDesign(),plan:{token:{value:'secret'}}}));assert.throws(()=>validateExperiments([{...nb.get(s.id,owner).experiments![0],url:'https://secret'}]));});
const context:CoachContext={message:'I dislike aiming',mode:'discuss',game:'dragon',plan:{fun:{value:'Exciting close calls',origin:'child',accepted:true,delegated:false}},friction:'',helpLevel:0,support:'balanced',conversation:[],observations:[],tests:[]};
const reply:CoachReply={move:'clarify',text:'We can question the action, not just the difficulty.',question:'Could your hero reach that goal another way?',suggestions:[],proposedChange:null,planSuggestions:[],evidenceIds:[],creationReadiness:{ready:false,evidence:{action:'',consequence:'',experience:'',world:''},unresolved:['The player action still needs your own decision.']}};
await test('plan input survives another field save, rerender and durable reload without approving a build',async()=>{
 const h=coachingHarness();try{await h.input('plan-action','Jump over the river');await h.input('plan-goal','Deliver the pizza');await h.save('goal');h.coach.renderPlan();
  assert.equal(h.get('plan-action').value,'Jump over the river');const restored=new StudioNotebook(h.storage).get(h.session().id,h.session().owner);
  assert.equal(restored.design!.plan.action!.value,'Jump over the river');assert.equal(restored.design!.plan.goal!.value,'Deliver the pizza');assert.equal(restored.design!.approvedPlan,false);
 }finally{h.dispose();}
});
await test('autosave retains unchanged helper provenance and explicit acceptance remains separate',async()=>{
 const h=coachingHarness();try{const s=h.session();h.book.update(s.id,s.owner,x=>{x.design!.plan.style={value:'A cloud castle',origin:'helper',accepted:false,delegated:false};});await h.coach.openSession();
  await h.input('plan-style','A cloud castle');assert.equal(h.session().design!.plan.style!.origin,'helper');assert.equal(h.session().design!.plan.style!.accepted,false);
  await h.input('plan-style','A cloud castle with penguins');assert.equal(h.session().design!.plan.style!.origin,'child');
  await h.input('plan-style','A cloud castle');assert.equal(h.session().design!.plan.style!.origin,'helper');assert.equal(h.session().design!.plan.style!.accepted,false);
  await h.save('style');assert.equal(h.session().design!.plan.style!.origin,'helper');assert.equal(h.session().design!.plan.style!.accepted,true);assert.equal(h.session().design!.approvedPlan,false);
 }finally{h.dispose();}
});
await test('safety refusal or private information never falls into unreviewed local coach',async()=>{
 for(const code of ['COACH_REFUSED','PRIVATE_INFORMATION']){
  const h=coachingHarness();
  try{
   await h.input('studioPrompt','Please tell me something private');
   const turn=h.coach.discuss('discuss');await h.awaitModelRequest();
   h.pending.shift()!.resolve(new Response(JSON.stringify({errorCode:code}),{status:422}));
   await turn;
   assert.match(h.session().messages.slice(-2).map(m=>m.text).join(' '),/safe game ideas/);
   assert.equal(h.session().messages.at(-1)!.text,'What would you like to create instead?');
   assert.match(h.get('coachModeStatus').textContent,/could not be used safely/);
   assert.deepEqual(h.coachStates,[],'a content refusal preserves connection state instead of claiming a technical outage');
   assert.equal(h.session().job,null);
   assert.equal(h.session().experiments?.length,0);
  }finally{h.dispose();}
 }
});
await test('model-backed path receives real bounded conversation context over multiple synthetic turns, with no build',async()=>{
 const h=coachingHarness();
 try{
  await h.input('studioPrompt','The dragon should sneeze spaghetti');
  const first=h.coach.discuss('discuss');
  await h.awaitModelRequest();
  h.resolve({...reply,text:'Spaghetti sneezes could be funny!',question:'When should the dragon sneeze?'});
  await first;
  await h.input('studioPrompt','Only if I jump');
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
  await h.input('studioPrompt','I would rather get back into the game');
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
  await h.input('studioPrompt','Actually never mind');
  await h.coach.discuss('discuss');
  assert.equal(h.requests.length,0);
  assert.equal(h.session().job,null);
  assert.match(h.session().messages.at(-1)!.text,/No game changed/);
 }finally{h.dispose();}
});
await test('just let me play returns to the existing game without interviewing or building',async()=>{
 const h=coachingHarness('gum');
 try{
  await h.input('studioPrompt','I just want to play now');
  await h.coach.discuss('discuss');
  assert.equal(h.playCalls,1);
  assert.equal(h.requests.length,0);
  assert.equal(h.session().job,null);
 }finally{h.dispose();}
});
await test('a delayed coach reply preserves a newly typed draft before its debounce saves',async()=>{
 const h=coachingHarness();try{await h.input('studioPrompt','I want a different way to move');const turn=h.coach.discuss('discuss');await h.awaitModelRequest();assert.deepEqual(h.milestones,[],'saving the first idea does not place a cosmetic popup over the next action');
  await h.input('studioPrompt','Maybe the penguin could bounce');h.resolve(reply);await turn;
  assert.equal(h.get('studioPrompt').value,'Maybe the penguin could bounce');assert.equal(h.session().draft,'Maybe the penguin could bounce');assert.equal(h.session().messages[0].text,'I want a different way to move');assert.equal(h.statuses.some(s=>s.error),false);
 }finally{h.dispose();}
});
await test('retyping the same draft while the coach replies still counts as new work',async()=>{
 const h=coachingHarness();try{await h.input('studioPrompt','Make the tower wobble');const turn=h.coach.discuss('discuss');await h.input('studioPrompt','');await h.input('studioPrompt','Make the tower wobble');await h.awaitModelRequest();h.resolve(reply);await turn;assert.equal(h.session().draft,'Make the tower wobble');assert.equal(h.get('studioPrompt').value,'Make the tower wobble');}finally{h.dispose();}
});
await test('a late coach suggestion cannot overwrite a newer child plan answer',async()=>{
 const h=coachingHarness();try{await h.input('studioPrompt','I want a castle');const turn=h.coach.discuss('discuss');await h.input('plan-style','A castle made of colourful boats');await h.awaitModelRequest();h.resolve({...reply,planSuggestions:[{field:'style',value:'A stone castle'}]});await turn;assert.equal(h.session().design!.plan.style!.value,'A castle made of colourful boats');assert.equal(h.session().design!.plan.style!.origin,'child');assert.equal(h.session().design!.approvedPlan,false);}finally{h.dispose();}
});
await test('an old rejected coach request cannot write into a new child or interrupt their reply',async()=>{
 const h=coachingHarness();try{await h.input('studioPrompt','First child idea');const old=h.coach.discuss('discuss');await h.awaitModelRequest();const oldRequest=h.pending.shift()!;
  h.switchChild();await h.input('studioPrompt','Second child idea');const current=h.coach.discuss('discuss');await h.awaitModelRequest();oldRequest.reject(Error('Late aborted network request'));await old;
  assert.match(h.get('coachModeStatus').textContent,/thinking about your idea/i);assert.deepEqual(h.session().messages.map(m=>m.text),['Second child idea']);
  h.resolve(reply);await current;assert.deepEqual(h.session().messages.map(m=>m.role),['child','helper','helper']);assert.ok(h.session().messages.every(m=>!m.text.includes('First child')));assert.equal(h.statuses.some(s=>s.error),false);
 }finally{h.dispose();}
});
await test('a failed plan autosave keeps the visible answer through another save and can retry',async()=>{
 const h=coachingHarness();try{h.storage.fail=true;await h.input('plan-action','Balance on a wobbly bridge');assert.equal(h.session().design!.plan.action,undefined);assert.match(h.get('planSaveStatus').textContent,/has not saved/);
  h.storage.fail=false;await h.input('plan-goal','Reach the treehouse');await h.save('goal');h.coach.renderPlan();assert.equal(h.get('plan-action').value,'Balance on a wobbly bridge');assert.equal(h.get('plan-credit-action').textContent,'Not saved yet');assert.match(h.get('planSaveStatus').textContent,/Some answers have not saved/);
  await h.save('action');assert.equal(h.session().design!.plan.action!.value,'Balance on a wobbly bridge');assert.equal(h.session().design!.approvedPlan,false);assert.equal(h.statuses.some(s=>s.error),true);
 }finally{h.dispose();}
});
await test('navigation flush blocks on an unsaved plan, then saves all visible drafts before reopening',async()=>{
 const h=coachingHarness();try{
  h.storage.fail=true;await h.input('plan-fun','A funny wobbly bridge');await h.input('designPrediction','The lighter bridge might sway');await h.input('coachFriction','I want to try balancing');
  await assert.rejects(h.coach.flushDrafts(),/Could not save this notebook/);assert.equal(h.get('plan-fun').value,'A funny wobbly bridge');assert.equal(h.session().design!.plan.fun,undefined);
  h.storage.fail=false;await h.coach.flushDrafts();await h.coach.openSession();
  assert.equal(h.get('plan-fun').value,'A funny wobbly bridge');assert.equal(h.get('designPrediction').value,'The lighter bridge might sway');assert.equal(h.get('coachFriction').value,'I want to try balancing');
  const restored=new StudioNotebook(h.storage).get(h.session().id,h.session().owner);assert.equal(restored.design!.plan.fun!.value,'A funny wobbly bridge');assert.equal(restored.hypothesis,'The lighter bridge might sway');assert.equal(restored.design!.friction,'I want to try balancing');assert.equal(restored.design!.approvedPlan,false);
 }finally{h.dispose();}
});
await test('delayed notebook commits never confirm a failed or superseded field save',async()=>{
 const h=coachingHarness('new',true);try{
  const first=h.input('plan-fun','My first bridge idea');
  assert.equal(h.session().design!.plan.fun,undefined);
  assert.doesNotMatch(h.get('planSaveStatus').textContent,/answers are saved/);
  h.deferredWrites.shift()!.reject(Error('Device storage is full'));await first;
  assert.equal(h.session().design!.plan.fun,undefined);assert.match(h.get('planSaveStatus').textContent,/has not saved/);
  const retry=h.save('fun');h.deferredWrites.shift()!.commit();await retry;
  assert.equal(h.session().design!.plan.fun!.value,'My first bridge idea');
  const earlier=h.input('plan-fun','An older change'),later=h.input('plan-fun','My newer change');
  h.deferredWrites.shift()!.commit();await earlier;
  assert.equal(h.get('plan-fun').value,'My newer change');assert.match(h.get('planSaveStatus').textContent,/Some answers have not saved/);
  h.deferredWrites.shift()!.commit();await later;
  assert.equal(new StudioNotebook(h.storage).get(h.session().id,h.session().owner).design!.plan.fun!.value,'My newer change');
  assert.match(h.get('planSaveStatus').textContent,/answers are saved/);
 }finally{h.dispose();}
});
for(const game of ['new','gum'] as const)await test(`a full ${game} idea ledger refuses another model request without losing work or the draft`,async()=>{
 const h=coachingHarness(game);try{
  const session=h.session();
  h.book.update(session.id,session.owner,s=>{
   s.design!.ideas=Array.from({length:100},(_,index)=>({id:'retained-idea-'+index,text:'Original idea '+index,origin:index%2?'helper':'child',adopted:index%2===0}));
  });
  h.book.message(session.id,session.owner,'child','Keep my earlier exact words.');
  h.book.continueConversation(session.id,session.owner);
  await h.input('studioPrompt','My next unsent idea');
  h.book.update(session.id,session.owner,s=>{s.draft='My next unsent idea';});
  const before=h.storage.getItem(STUDIO_KEY);
  await h.coach.discuss('ideas');
  assert.equal(h.requests.length,0,'a full provenance ledger cannot start a paid reply');
  assert.equal(h.storage.getItem(STUDIO_KEY),before,'no existing words or provenance are trimmed');
  assert.equal(h.get('studioPrompt').value,'My next unsent idea');
  assert.match(h.statuses.at(-1)!.text,/idea notes are full/);
  assert.equal(new StudioNotebook(h.storage).get(session.id,session.owner).messages[0].text,'Keep my earlier exact words.');
  // Stopping is still an immediate local action with the full saved ledger.
  await h.input('studioPrompt','no more questions');await h.coach.discuss('discuss');
  assert.equal(h.requests.length,0);assert.equal(h.session().design!.ideas.length,100);
  assert.match(h.session().messages.at(-1)!.text,/Okay/);
 }finally{h.dispose();}
});
await test('full observation notes reject a further entry without altering earlier evidence',async()=>{
 const storage=new Memory(),book=new StudioNotebook(storage),session=book.create(owner,'new','Retained observations');
 book.update(session.id,owner,s=>{s.design!.observations=Array.from({length:300},(_,index)=>({id:'observation-'+index,experimentId:null,text:'Exact observation '+index,source:'child',at:'2026-11-23T00:00:00Z'}));});
 const before=storage.getItem(STUDIO_KEY);
 assert.throws(()=>book.observe(session.id,owner,'My next observation','child'),/observation notes are full/);
 assert.equal(storage.getItem(STUDIO_KEY),before);
 assert.equal(new StudioNotebook(storage).get(session.id,owner).design!.observations.at(-1)!.text,'Exact observation 299');
});
await test('a coach persistence failure is caught and retains the child draft for recovery',async()=>{
 const h=coachingHarness();try{await h.input('studioPrompt','Keep my idea if saving fails');const turn=h.coach.discuss('discuss');await h.awaitModelRequest();h.storage.fail=true;h.resolve(reply);await assert.doesNotReject(turn);
  assert.equal(h.get('studioPrompt').value,'Keep my idea if saving fails');assert.equal(h.session().messages.length,1);assert.match(h.get('coachModeStatus').textContent,/could not be saved/);assert.equal(h.statuses.some(s=>s.error),true);
 }finally{h.dispose();}
});

const ownGame='I steer a purple cat over clouds. Landing makes a cloud bounce. I want calm discoveries. It is a moon painted with soft colors. There are no points and no losing; I just explore.';
const ownEvidence={action:'I steer a purple cat over clouds.',consequence:'Landing makes a cloud bounce.',experience:'I want calm discoveries.',world:'It is a moon painted with soft colors.'};
const readyReply:CoachReply={...reply,text:'Your cat can explore bouncy moon clouds.',question:null,childDecisions:[{field:'action',quote:ownEvidence.action},{field:'fun',quote:ownEvidence.experience},{field:'style',quote:ownEvidence.world},{field:'goal',quote:'I just explore.'}],creationReadiness:{ready:true,evidence:ownEvidence,unresolved:[]}};
const unresolved=(question:string):CoachReply=>({...reply,text:'Let’s think about the moment you want to play.',question,creationReadiness:{ready:false,evidence:{action:'',consequence:'',experience:'',world:''},unresolved:[question]}});
async function sendTurn(h:ReturnType<typeof coachingHarness>,text:string,result:CoachReply){await h.input('studioPrompt',text);const turn=h.coach.discuss('discuss');await h.awaitModelRequest();h.resolve(result);await turn;}

await test('premature first Build preserves the draft and requires the conversation, with no form or answer chips',async()=>{
 const h=coachingHarness();try{
  await h.input('studioPrompt','A cat jumps between donuts');
  assert.equal(await h.coach.intercept('A cat jumps between donuts',true),true);
  assert.equal(h.get('designPlan').open,false);assert.equal(h.has('coachGuidedChoices'),false);assert.equal(h.has('coachChooseRest'),false);assert.equal(h.has('buildGamePlan'),false);
  assert.equal(h.get('studioPrompt').value,'A cat jumps between donuts');
  assert.equal(h.session().messages.length,0);assert.equal(h.session().job,null);assert.equal(h.requests.length,0);
  assert.equal(h.coach.buildReadiness().ready,false);assert.throws(()=>h.coach.buildPrompt(),/Send your new thought/);
 }finally{h.dispose();}
});
await test('the connected coach keeps its genuine contextual question instead of a preset interview',async()=>{
 const h=coachingHarness();try{
  await sendTurn(h,'The dragon sneezes spaghetti.',unresolved('What should the spaghetti do when it lands?'));
  assert.equal(h.session().messages.at(-1)!.text,'What should the spaghetti do when it lands?');
  assert.equal(h.session().messages.at(-2)!.text,'Let’s think about the moment you want to play.');
  assert.deepEqual(h.requests[0].context.creation,{version:1});assert.equal(h.get('coachProposals').children.length,0);
  assert.equal(h.coach.buildReadiness().ready,false);assert.equal(h.session().job,null);
 }finally{h.dispose();}
});
await test('a coherent child-authored idea can be reviewed without filling every plan field or automatically building',async()=>{
 const h=coachingHarness();try{
  await sendTurn(h,ownGame,readyReply);
  assert.equal(h.coach.buildReadiness().ready,true);assert.equal(h.session().design!.creationReview!.source,'model');
  assert.ok(Object.keys(h.session().design!.plan).length<8,'no mandatory eight-field interview');
  assert.equal(h.session().design!.approvedPlan,false,'legacy plan approval is not the gate');
  assert.equal(h.buildRequests.length,0);assert.equal(h.session().job,null);assert.equal(await h.coach.intercept(ownGame,true),false);
  const payload=h.coach.buildPrompt()!;assert.match(payload,/Landing makes a cloud bounce/);assert.match(payload,/no points and no losing/);
  assert.doesNotMatch(h.session().messages.map(m=>m.text).join(' '),/Current choices|Choose sensible details|Approved game plan/);
 }finally{h.dispose();}
});
await test('complete-looking legacy child or delegated plans cannot bypass a missing contextual review',async()=>{
 for(const delegated of [false,true]){
  const h=coachingHarness();try{
   const s=h.session();h.book.message(s.id,s.owner,'child',ownGame);h.book.update(s.id,s.owner,x=>{for(const key of PLAN_FIELDS)x.design!.plan[key]={value:delegated?'':'A supplied field',origin:delegated?'helper':'child',accepted:!delegated,delegated};x.design!.approvedPlan=true;});
   assert.equal(h.coach.buildReadiness().ready,false);assert.equal(await h.coach.intercept(ownGame,true),true);assert.throws(()=>h.coach.buildPrompt(),/check how/);
  }finally{h.dispose();}
 }
});
await test('a new-context reply without readiness reports a failed check instead of a connected successful conversation',async()=>{
 const h=coachingHarness();try{
  await sendTurn(h,ownGame,{...readyReply,creationReadiness:undefined});
  assert.equal(h.coach.buildReadiness().ready,false);assert.equal(h.coach.buildReadiness().issue,'review-unavailable');assert.equal(h.session().design!.creationReview,undefined);
  assert.match(h.get('coachModeStatus').textContent,/could not check/);
  assert.deepEqual(h.coachStates,['limited']);
  assert.equal(h.session().messages.at(-1)!.text,'Chat could not answer just now. Your idea is saved.');
  assert.equal(h.requests.length,1,'no automatic provider retry');assert.equal(h.buildRequests.length,0);
 }finally{h.dispose();}
});
await test('you choose remains a conversation request and never resolves the child’s plan',async()=>{
 const h=coachingHarness();try{
  await sendTurn(h,'A cat on the moon.',unresolved('What would you enjoy making the cat do?'));
  await sendTurn(h,'You choose the rest.',unresolved('Imagine playing for a moment. What would you try first?'));
  assert.equal(h.requests.length,2);assert.equal(Object.values(h.session().design!.plan).some(field=>field?.delegated),false);
  assert.equal(h.coach.buildReadiness().ready,false);assert.equal(h.buildRequests.length,0);
  assert.equal(h.session().messages.at(-1)!.text,'Imagine playing for a moment. What would you try first?');
 }finally{h.dispose();}
});
await test('offline help saves the child’s own answer without pretending to judge completeness',async()=>{
 const h=coachingHarness();try{
  await h.input('studioPrompt',ownGame);const turn=h.coach.discuss('discuss');await h.awaitModelRequest();h.pending.shift()!.resolve(new Response(JSON.stringify({errorCode:'COACH_UNAVAILABLE'}),{status:503}));await turn;
  assert.equal(h.session().messages[0].text,ownGame);assert.equal(h.coach.buildReadiness().ready,false);assert.equal(h.session().design!.creationReview,undefined);
  assert.doesNotMatch(h.session().messages.map(m=>m.text).join(' '),/Ready!|Tap Build/);assert.match(h.get('coachModeStatus').textContent,/could not check/);
  assert.equal(h.session().messages.filter(m=>m.role==='helper').length,1,'an outage is not replaced with a scripted interview');
  assert.match(h.session().messages.at(-1)!.text,/Chat could not answer/);assert.equal(h.requests.length,1);
 }finally{h.dispose();}
});
await test('an expired adult session requests sign-in instead of claiming a provider outage',async()=>{
 const h=coachingHarness();try{
  await h.input('studioPrompt',ownGame);const turn=h.coach.discuss('discuss');await h.awaitModelRequest();
  h.pending.shift()!.resolve(new Response(JSON.stringify({errorCode:'ADULT_PILOT_ACCESS_REQUIRED'}),{status:403}));await turn;
  assert.deepEqual(h.coachStates,['sign-in']);assert.equal(h.coach.buildReadiness().ready,false);
  assert.equal(h.requests.length,1);assert.equal(h.session().job,null);
 }finally{h.dispose();}
});
await test('explicit Check my idea reassesses saved child intent without duplicating a message or submitting a build',async()=>{
 const h=coachingHarness();try{
  assert.equal(h.coach.canReassess(),false);
  await sendTurn(h,ownGame,unresolved('What happens when the cat lands?'));
  const before=h.session().messages.filter(message=>message.role==='child');
  assert.equal(h.coach.canReassess(),true);
  const check=h.coach.reassess();await h.awaitModelRequest();
  assert.equal(h.requests.at(-1).context.message,ownGame);
  assert.deepEqual(h.session().messages.filter(message=>message.role==='child'),before);
  assert.equal(h.coach.canReassess(),false,'one explicit check is already in flight');
  h.resolve(readyReply);await check;
  assert.equal(h.coach.buildReadiness().ready,true);assert.equal(h.session().job,null);assert.equal(h.buildRequests.length,0);
  assert.equal(h.requests.length,2);
  assert.deepEqual(h.session().messages.filter(message=>message.role==='child'),before);
 }finally{h.dispose();}
});
await test('Check my idea preserves the source identity of a legacy compiled-only child message',async()=>{
 const h=coachingHarness();try{
  const s=h.session(),raw=ownGame+'\n\nApproved game plan (full choices remain in this notebook):\n'+PLAN_FIELDS.map(field=>field+': Earlier choice').join('\n');
  h.book.message(s.id,s.owner,'child',raw);const before=h.session().messages[0];
  assert.equal(h.coach.canReassess(),true);
  const check=h.coach.reassess();await h.awaitModelRequest();
  assert.equal(h.requests.at(-1).context.message,ownGame);
  assert.doesNotMatch(JSON.stringify(h.requests.at(-1).context.conversation),/Approved game plan/);
  h.resolve(readyReply);await check;
  assert.equal(h.coach.buildReadiness().ready,true);assert.deepEqual(h.session().messages[0],before);
  assert.equal(h.session().messages.filter(message=>message.role==='child').length,1);
  assert.equal(h.statuses.some(status=>status.error),false);assert.equal(h.buildRequests.length,0);
 }finally{h.dispose();}
});
await test('a failed check has one explicit reconnect path and preserves an unsent draft',async()=>{
 const h=coachingHarness();try{
  await sendTurn(h,ownGame,{...readyReply,creationReadiness:null});
  assert.equal(h.coach.canReassess(),true);
  await h.input('studioPrompt','I also want rain.');
  assert.equal(h.coach.canReassess(),false);await h.coach.reassess();assert.equal(h.requests.length,1);
  assert.equal(h.get('studioPrompt').value,'I also want rain.');
  await h.input('studioPrompt','');const check=h.coach.reassess();await h.awaitModelRequest();
  h.pending.shift()!.reject(Error('fixture connection failure'));await check;
  assert.equal(h.requests.length,2,'the failed request is not automatically replayed');
  assert.equal(h.session().messages.filter(message=>message.role==='child').length,1);
  assert.equal(h.coach.buildReadiness().issue,'review-unavailable');assert.equal(h.session().job,null);
  const reconnect=h.coach.reassess();await h.awaitModelRequest();h.resolve(readyReply);await reconnect;
  assert.equal(h.coach.buildReadiness().ready,true);assert.equal(h.requests.length,3);
  assert.deepEqual(h.coachStates,['limited','limited','connected']);
 }finally{h.dispose();}
});
await test('a later refusal after reconnect excludes the rejected turn and its plan quotes from the next idea',async()=>{
 const h=coachingHarness();try{
  await sendTurn(h,ownGame,{...readyReply,creationReadiness:null});
  const rejected=h.session().messages[0],check=h.coach.reassess();await h.awaitModelRequest();
  h.pending.shift()!.resolve(new Response(JSON.stringify({errorCode:'COACH_REFUSED'}),{status:422}));await check;
  assert.equal(h.coach.canReassess(),false,'the refused original is not offered as a reconnect target');
  const safe='I drag a lantern along a river. The water lights up behind it. I just explore the glowing river.';
  const verdict={ready:true,evidence:{action:'I drag a lantern along a river.',consequence:'The water lights up behind it.',experience:'I just explore the glowing river.',world:'a lantern along a river'},unresolved:[]};
  await h.input('studioPrompt',safe);const next=h.coach.discuss('discuss');await h.awaitModelRequest();
  const sent=JSON.stringify(h.requests.at(-1).context);assert.doesNotMatch(sent,/purple cat|calm discoveries|moon painted|no points and no losing/);
  h.resolve({...readyReply,childDecisions:[{field:'action',quote:verdict.evidence.action}],creationReadiness:verdict});await next;
  assert.equal(h.coach.buildReadiness().ready,true);
  assert.doesNotMatch(h.coach.buildPrompt()!,/purple cat|calm discoveries|moon painted|no points and no losing/);
  assert.deepEqual(h.session().messages[0],rejected,'refused work stays saved without being resubmitted');
 }finally{h.dispose();}
});
await test('rechecking an earlier turn binds refusal to its source ID even when a later refused turn repeats the same words',async()=>{
 const h=coachingHarness();try{
  await sendTurn(h,ownGame,{...readyReply,creationReadiness:null});
  const original=h.session().messages[0];
  await h.input('studioPrompt',ownGame);const repeated=h.coach.discuss('discuss');await h.awaitModelRequest();
  h.pending.shift()!.resolve(new Response(JSON.stringify({errorCode:'COACH_REFUSED'}),{status:422}));await repeated;
  assert.equal(h.coach.canReassess(),true,'the earlier unchecked turn remains eligible');
  const check=h.coach.reassess();await h.awaitModelRequest();
  h.pending.shift()!.resolve(new Response(JSON.stringify({errorCode:'COACH_REFUSED'}),{status:422}));await check;
  assert.equal(h.coach.canReassess(),false,'the refusal belongs to the reviewed source, not the newest matching text');
  assert.ok(h.session().design!.ideas.some(idea=>idea.id==='refused-turn:'+original.id));
  const safe='I drag a lantern along a river. The water lights up behind it. I just explore the glowing river.';
  const verdict={ready:true,evidence:{action:'I drag a lantern along a river.',consequence:'The water lights up behind it.',experience:'I just explore the glowing river.',world:'a lantern along a river'},unresolved:[]};
  await h.input('studioPrompt',safe);const next=h.coach.discuss('discuss');await h.awaitModelRequest();
  assert.doesNotMatch(JSON.stringify(h.requests.at(-1).context),/purple cat|calm discoveries|moon painted/);
  h.resolve({...readyReply,childDecisions:[{field:'action',quote:verdict.evidence.action}],creationReadiness:verdict});await next;
  assert.equal(h.coach.buildReadiness().ready,true);assert.doesNotMatch(h.coach.buildPrompt()!,/purple cat|calm discoveries|moon painted/);
  assert.deepEqual(h.session().messages[0],original);assert.equal(h.buildRequests.length,0);
 }finally{h.dispose();}
});
await test('real coach requests keep the original child idea through seven turns without relying on model plan extraction',async()=>{
 const h=coachingHarness();try{
  const original='A sleepy lighthouse keeper balances while the beacon charges.';
  await sendTurn(h,original,unresolved('What happens in that moment?'));
  const details=[];
  for(let i=0;i<7;i++){
   const text='My chosen detail '+i+'.';details.push(text);await sendTurn(h,text,unresolved('What else happens?'));
  }
  const sent=h.requests.at(-1).context as CoachContext;
  assert.ok(sent.conversation.some(message=>message.text===original));
  for(const text of details)assert.ok(sent.conversation.some(message=>message.role==='child'&&message.text===text));
  assert.ok(sent.conversation.length<=16);assert.ok(JSON.stringify(sent).length<16000);
  assert.equal(h.session().job,null);
 }finally{h.dispose();}
});
await test('helper inspiration stays labelled prose and cannot supply a first-game build shortcut',async()=>{
 const h=coachingHarness();try{
  await h.input('studioPrompt','Please help me think of a game');const turn=h.coach.discuss('ideas');await h.awaitModelRequest();h.resolve({...reply,text:'Imagine a surprising way your character could move.',question:'What would you try?',suggestions:['A robot slides on jelly.','A cat rolls inside a bubble.'],proposedChange:{title:'Jelly robot',request:'Build a robot sliding on jelly.',depth:'redesign'}});await turn;
  assert.equal(h.get('coachProposals').children.length,0);assert.ok(h.session().messages.some(message=>message.text.startsWith('Some ideas from jems:')));
  assert.equal(h.session().design!.ideas.filter(idea=>idea.origin==='helper').every(idea=>!idea.adopted),true);
  await h.input('studioPrompt','My unfinished own thought');await h.coach.tryPreset('Build a robot sliding on jelly.');
  assert.equal(h.buildRequests.length,0);assert.equal(h.get('studioPrompt').value,'My unfinished own thought');assert.equal(h.coach.buildReadiness().ready,false);
 }finally{h.dispose();}
});
await test('typing an answer retains the child’s exact words and the model’s next contextual question',async()=>{
 const h=coachingHarness();try{
  await sendTurn(h,'A cat on the moon.',unresolved('What would make exploring it feel special?'));
  await sendTurn(h,'It should feel like finding a secret cave.',{...unresolved('What would you find inside?'),childDecisions:[{field:'fun',quote:'It should feel like finding a secret cave.'}]});
  assert.deepEqual(h.session().design!.plan.fun,{value:'It should feel like finding a secret cave.',origin:'child',accepted:true,delegated:false});
  assert.equal(h.session().messages.at(-1)!.text,'What would you find inside?');assert.equal(h.get('designPlan').open,false);
 }finally{h.dispose();}
});
await test('a fresh sent correction revises an earlier feeling without being misfiled as the current question',async()=>{
 const h=coachingHarness();try{
  await sendTurn(h,ownGame,{...readyReply,question:'Where should the cat go next?',creationReadiness:{...readyReply.creationReadiness!,ready:false,unresolved:['Where should the cat go next?']}});
  const correction='Actually make it funny instead.';
  await sendTurn(h,correction,{...readyReply,childDecisions:[{field:'fun',quote:correction}],creationReadiness:{ready:true,evidence:{...ownEvidence,experience:correction},unresolved:[]}});
  assert.equal(h.session().design!.plan.fun!.value,correction);assert.equal(h.session().design!.plan.style!.value,ownEvidence.world);
  assert.equal(h.coach.buildReadiness().ready,true);assert.match(h.coach.buildPrompt()!,/fun: Actually make it funny instead/);
 }finally{h.dispose();}
});
await test('unreviewed drafts and optional field edits invalidate readiness while preserving the last review',async()=>{
 const h=coachingHarness();try{
  await sendTurn(h,ownGame,readyReply);await h.input('studioPrompt','The clouds should sing.');
  assert.equal(h.coach.buildReadiness().ready,false);assert.throws(()=>h.coach.buildPrompt(),/Send your new thought/);
  await h.input('studioPrompt','');await h.input('plan-style','A purple pencil moon');assert.equal(h.coach.buildReadiness().ready,false);assert.equal(await h.coach.intercept(ownGame,true),true);
  assert.equal(h.session().design!.creationReview!.source,'model');
 }finally{h.dispose();}
});
await test('a delayed ready verdict cannot bless a newer optional plan edit',async()=>{
 const h=coachingHarness();try{
  await h.input('studioPrompt',ownGame);const turn=h.coach.discuss('discuss');await h.awaitModelRequest();await h.input('plan-action','The cat swims inside a bubble.');h.resolve(readyReply);await turn;
  assert.equal(h.session().design!.plan.action!.value,'The cat swims inside a bubble.');assert.equal(h.session().design!.creationReview,undefined);assert.equal(h.coach.buildReadiness().ready,false);
 }finally{h.dispose();}
});
await test('a newer authored choice wins over a delayed correction and the rejected correction stays out of build intent',async()=>{
 const h=coachingHarness();try{
  await sendTurn(h,ownGame,readyReply);await h.input('studioPrompt','Actually use the sound of rain instead.');const turn=h.coach.discuss('discuss');await h.awaitModelRequest();await h.input('plan-fun','Quiet space exploring');
  h.resolve({...readyReply,childDecisions:[{field:'fun',quote:'the sound of rain'}],creationReadiness:{ready:true,evidence:{...ownEvidence,experience:'the sound of rain'},unresolved:[]}});await turn;
  assert.equal(h.session().design!.plan.fun!.value,'Quiet space exploring');assert.equal(h.coach.buildReadiness().ready,false);
  await sendTurn(h,'I want Quiet space exploring.',{...readyReply,childDecisions:[],creationReadiness:{ready:true,evidence:{...ownEvidence,experience:'Quiet space exploring'},unresolved:[]}});
  const payload=h.coach.buildPrompt()!;assert.match(payload,/Quiet space exploring/);assert.doesNotMatch(payload,/sound of rain/);
 }finally{h.dispose();}
});
await test('creative questions and plain follow-up mechanics survive normal chat and later reviewed Build',async()=>{
 const h=coachingHarness();try{
  await sendTurn(h,ownGame,{...readyReply,question:'What else could happen on your moon?'});
  for(const text of ['Could the clouds be trampolines?','The dragon sneezes bubbles.'])await sendTurn(h,text,{...readyReply,childDecisions:[]});
  assert.equal(h.coach.buildReadiness().ready,true);const payload=h.coach.buildPrompt()!;
  assert.match(payload,/Could the clouds be trampolines/);assert.match(payload,/The dragon sneezes bubbles/);assert.equal(h.get('studioPrompt').value,'');
 }finally{h.dispose();}
});
await test('a refused correction changes no accepted choice and never enters a later reviewed payload',async()=>{
 const h=coachingHarness();try{
  await sendTurn(h,ownGame,readyReply);await h.input('studioPrompt','Actually make it funny with rejected private details.');const turn=h.coach.discuss('discuss');await h.awaitModelRequest();h.pending.shift()!.resolve(new Response(JSON.stringify({errorCode:'PRIVATE_INFORMATION'}),{status:422}));await turn;
  assert.equal(h.session().design!.plan.fun!.value,ownEvidence.experience);assert.equal(h.coach.buildReadiness().ready,false);
  await sendTurn(h,'Keep my safe moon idea.',{...readyReply,childDecisions:[]});assert.doesNotMatch(h.coach.buildPrompt()!,/rejected private details/);
 }finally{h.dispose();}
});
await test('copying a helper suggestion never relabels its source or supplies readiness evidence',async()=>{
 const h=coachingHarness();try{
  await sendTurn(h,'A cat jumps over stones.',{...reply,text:'Here is one possibility to think about.',question:'What would you invent?',suggestions:['Make it silly']});
  await sendTurn(h,'Make it silly',{...reply,text:'Tell me what makes that interesting to you.',question:null,childDecisions:[{field:'fun',quote:'silly'}]});
  assert.equal(h.session().design!.plan.fun!.origin,'helper');assert.equal(h.coach.buildReadiness().ready,false);assert.equal(h.buildRequests.length,0);
 }finally{h.dispose();}
});
await test('a selected or adapted option stays helper-origin across context, reload, Build and a later independent correction',async()=>{
 const h=coachingHarness();
 try{
  const {id,owner}=h.session();
  h.book.update(id,owner,s=>{s.design!.creationStandard=2;});
  const premise='In a cozy paper forest my fox folds its shadow into a pocket. The pocket catches leaves until the den is full.';
  const offer='a storybook drawing',picked='I pick the second one, with silver lines.',replacement='Realistic fur now.';
  const evidence={world:'paper forest',action:'folds its shadow into a pocket',consequence:'The pocket catches leaves',
   experience:'cozy',goal:'until the den is full',mood:'cozy',visualStyle:picked};
  const gaps=Object.fromEntries(Object.keys(evidence).map(key=>[key,''])) as typeof evidence;
  const thinking={...reply,creationReadiness:{ready:false,evidence:gaps,unresolved:['How should the forest look?']}};
  await sendTurn(h,premise,{...thinking,childDecisions:[{field:'action',quote:evidence.action}]});
  const options=['paper cutouts',offer,'chalk marks'];
  await sendTurn(h,'Can I have three ideas?',{...thinking,text:'Three ideas from me are paper cutouts, a storybook drawing, or chalk marks.',
   question:null,planSuggestions:options.map(value=>({field:'style',value}))});
  assert.equal(h.session().design!.plan.action!.origin,'child');
  await sendTurn(h,'Sure.',{...thinking,childDecisions:[{field:'style',quote:'Sure.'}],planSuggestions:[{field:'style',value:offer}]});
  assert.equal(h.session().design!.plan.style!.accepted,false);
  assert.equal(h.coach.buildReadiness().ready,false);
  await sendTurn(h,picked,{...reply,question:null,childDecisions:[{field:'style',quote:picked}],
   planSuggestions:[{field:'style',value:offer}],creationReadiness:{ready:true,evidence,unresolved:[]}});
  const restored=new StudioNotebook(h.storage).get(id,owner);
  assert.deepEqual(restored.design!.plan.style,{value:picked,origin:'helper',accepted:true,delegated:false});
  assert.equal(selectedSuggestions(restored).style?.[0].offer,offer);
  assert.equal(creationBuildReadiness(restored,2).ready,true);
  assert.equal(h.buildRequests.length,0);
  const build=h.coach.buildPrompt()!;
  for(const words of [premise,picked,offer])assert.ok(build.includes(words),words);
  assert.doesNotMatch(build,/chalk marks|paper cutouts|Can I have three ideas|Sure\./);
  assert.throws(()=>recordCreationReview(restored,{ready:true,evidence:{...evidence,visualStyle:offer},unresolved:[]},2),/exact child/);
  const lostOffer=structuredClone(restored);
  lostOffer.messages=lostOffer.messages.filter(message=>message.role!=='helper'||!message.text.includes(offer));
  assert.equal(creationBuildReadiness(lostOffer,2).ready,false,'the child’s reference needs its earlier offer');
  const lostProof=structuredClone(restored);lostProof.design!.ideas=lostProof.design!.ideas.filter(i=>!i.id.startsWith('selection:'));
  assert.equal(creationBuildReadiness(lostProof,2).ready,false);
  assert.deepEqual(selectedSuggestions(lostProof),{});
  for(let i=0;i<20;i++)h.book.message(id,owner,'helper','A later conversation note '+i+'.');
  const bounded=creationConversation(h.session());
  assert.ok(bounded.some(m=>m.role==='helper'&&m.text.includes(offer)));
  assert.ok(bounded.some(m=>m.role==='child'&&m.text===picked));
  await sendTurn(h,replacement,{...reply,question:null,childDecisions:[{field:'style',quote:replacement}],
   creationReadiness:{ready:true,evidence:{...evidence,visualStyle:replacement},unresolved:[]}});
  assert.deepEqual(h.requests.at(-1).context.plan.style,restored.design!.plan.style);
  assert.deepEqual(h.session().design!.plan.style,{value:replacement,origin:'child',accepted:true,delegated:false});
  assert.notEqual(h.session().design!.creationReview!.fingerprint,restored.design!.creationReview!.fingerprint);
  assert.deepEqual(selectedSuggestions(h.session()),{});
  assert.match(h.coach.buildPrompt()!,/style: Realistic fur now/);
  assert.doesNotMatch(h.coach.buildPrompt()!,/storybook|silver lines/);
 }finally{h.dispose();}
});
await test('rechecking a literal selected helper option preserves child selection across reload and repeated checks',async()=>{
 const h=coachingHarness();
 try{
  const {id,owner}=h.session();h.book.update(id,owner,s=>{s.design!.creationStandard=2;});
  const premise='I tap the quiet pond. Each tap makes a ripple. I just want to play with the ripples.',picked='paper waves';
  const empty={action:'',consequence:'',world:'',experience:'',goal:'',visualStyle:'',mood:''};
  const waiting={...reply,question:null,creationReadiness:{ready:false,evidence:empty,unresolved:['How should it look?']}};
  await sendTurn(h,premise,waiting);
  await sendTurn(h,'Give me three ideas.',{...waiting,text:'My ideas are chalk lines, clay rings and paper waves.',
   planSuggestions:['chalk lines','clay rings',picked].map(value=>({field:'style',value}))});
  const ready:CoachReply={...reply,question:null,childDecisions:[{field:'style',quote:picked}],planSuggestions:[{field:'style',value:picked}],
   creationReadiness:{ready:true,evidence:{action:'tap',consequence:'makes a ripple',world:'pond',experience:'play with the ripples',goal:'just want to play with the ripples',mood:'quiet',visualStyle:picked},unresolved:[]}};
  await sendTurn(h,picked,ready);
  const originalChildren=h.session().messages.filter(message=>message.role==='child');
  const chosen=originalChildren.at(-1)!;
  for(let checkNumber=0;checkNumber<2;checkNumber++){
   const restored=new StudioNotebook(h.storage).get(id,owner);
   assert.equal(creationBuildReadiness(restored,2).ready,true);
   assert.equal(selectedSuggestions(restored).style?.[0].offer,picked);
   h.coach.reset();await h.coach.openSession();
   const check=h.coach.reassess();await h.awaitModelRequest();h.resolve(ready);await check;
   assert.equal(h.coach.buildReadiness().ready,true);
   assert.deepEqual(h.session().messages.filter(message=>message.role==='child'),originalChildren);
   assert.equal(h.session().design!.ideas.some(idea=>idea.id==='helper-turn:'+chosen.id),false);
   assert.equal(h.session().design!.plan.style!.origin,'helper');
   assert.match(h.coach.buildPrompt()!,/paper waves/);assert.doesNotMatch(h.coach.buildPrompt()!,/chalk lines|clay rings/);
   assert.equal(h.buildRequests.length,0);
  }
 }finally{h.dispose();}
});
await test('repeated uncertainty sends prior kinds of support to the coach; a direct ideas request retains all three alternatives',async()=>{
 const h=coachingHarness();
 try{
  const {id,owner}=h.session();h.book.update(id,owner,s=>{s.design!.creationStandard=2;});
  const game='My fox needs to dodge flying leaves.';
  const gap={ready:false,evidence:{action:'',consequence:'',world:'',experience:'',goal:'',visualStyle:'',mood:''},unresolved:['The fox needs a move.']};
  const turn=(text:string,question:string|null)=>({...reply,text,question,creationReadiness:gap});
  const open='What could your fox do to get away from the leaves?';
  const imagine='Imagine being that fox. A leaf is flying at your nose!';
  const inspiration='Picture a toy doing something impossible.';
  await sendTurn(h,game,turn('',open));
  await sendTurn(h,"I don't know.",turn(imagine,'What do you do?'));
  await sendTurn(h,"I still don't know.",turn(inspiration,'What could your fox borrow from it?'));
  const examples=['fold the wind','zip into a shadow','sing the leaf to sleep'];
  const ideas='Three ideas from me: '+examples.join(', ')+'. You can change any of them.';
  await sendTurn(h,'Can I have three ideas?',{...turn(ideas,null),planSuggestions:examples.map(value=>({field:'action',value}))});
  const sent=h.requests.at(-1).context as CoachContext;
  for(const text of [game,open,imagine,inspiration])assert.ok(sent.conversation.some(message=>message.text===text),text);
  assert.deepEqual(h.requests.map(r=>r.context.helpLevel),[0,1,2,0]);
  assert.equal(h.session().messages.at(-1)!.text,ideas);
  assert.ok(examples.every(text=>h.session().design!.ideas.some(i=>i.text===text&&i.origin==='helper'&&!i.adopted)));
  assert.equal(h.coach.buildReadiness().ready,false);assert.equal(h.buildRequests.length,0);
 }finally{h.dispose();}
});
await test('reconnect restores provenance for an earlier prose-only offer and never creates another child turn',async()=>{
 const h=coachingHarness();
 try{
  const {id,owner}=h.session();h.book.update(id,owner,s=>{s.design!.creationStandard=2;});
  const empty={action:'',consequence:'',world:'',experience:'',goal:'',visualStyle:'',mood:''};
  const waiting={...reply,creationReadiness:{ready:false,evidence:empty,unresolved:['What will the fox do?']}};
  await sendTurn(h,'My fox needs a look. Can I have an idea?',{...waiting,text:'One idea from me is a storybook look.',question:null});
  const words='Yes, I want it to look like a storybook.';
  await h.input('studioPrompt',words);const failed=h.coach.discuss('discuss');await h.awaitModelRequest();
  h.pending.shift()!.reject(Error('fixture connection failure'));await failed;
  assert.equal(h.coach.buildReadiness().ready,false);
  assert.equal(h.session().design!.plan.style,undefined,'the disconnected extractor leaves the offered look unassigned');
  // A notebook from the original v2 client could already contain this literal
  // classification after an outage. A fresh review can repair its attribution.
  h.book.update(id,owner,s=>{s.design!.plan.style={value:words,origin:'child',accepted:true,delegated:false};});
  const before=h.session().messages.filter(m=>m.role==='child');
  const check=h.coach.reassess();await h.awaitModelRequest();
  h.resolve({...waiting,childDecisions:[{field:'style',quote:'storybook'}]});await check;
  assert.deepEqual(h.session().messages.filter(m=>m.role==='child'),before);
  assert.deepEqual(h.session().design!.plan.style,{value:'storybook',origin:'helper',accepted:true,delegated:false});
  assert.equal(selectedSuggestions(h.session()).style?.[0].offer,'storybook');
  assert.equal(h.buildRequests.length,0);
 }finally{h.dispose();}
});
await test('a selected prose-only helper offer keeps its origin across a sealed chapter, restore and Build',async()=>{
 const h=coachingHarness();
 try{
  const {id,owner}=h.session();h.book.update(id,owner,s=>{s.design!.creationStandard=2;});
  const premise='I tap the quiet pond. Each tap makes a ripple. I just want to play with the ripples.';
  const picked='I want a storybook look.',offer='storybook';
  const empty={action:'',consequence:'',world:'',experience:'',goal:'',visualStyle:'',mood:''};
  const waiting={...reply,question:null,creationReadiness:{ready:false,evidence:empty,unresolved:['How should it look?']}};
  await sendTurn(h,premise,{...waiting,text:'One idea from me is a storybook look. You can invent your own.'});
  while(h.book.conversationPage(id,owner).available)h.book.message(id,owner,'helper','Earlier saved conversation note '+h.book.conversationPage(id,owner).count+'.');
  const original=h.session().messages;
  h.book.continueConversation(id,owner);
  const backup=JSON.parse(JSON.stringify(h.book.read()));h.book.restore(backup);
  assert.deepEqual(h.session().messages,original);
  const ready:CoachReply={...reply,question:null,childDecisions:[{field:'style',quote:offer}],
   creationReadiness:{ready:true,evidence:{action:'tap',consequence:'makes a ripple',world:'pond',experience:'play with the ripples',goal:'just want to play with the ripples',mood:'quiet',visualStyle:picked},unresolved:[]}};
  await sendTurn(h,picked,ready);
  const selected=h.session();
  assert.deepEqual(selected.design!.plan.style,{value:offer,origin:'helper',accepted:true,delegated:false});
  assert.equal(selectedSuggestions(selected).style?.[0].offer,offer);
  assert.equal(h.coach.buildReadiness().ready,true);
  const beforePrompt=h.coach.buildPrompt()!;
  assert.match(beforePrompt,/jems suggested "storybook", child chose/);assert.ok(beforePrompt.includes(premise));
  assert.equal(h.buildRequests.length,0,'saved readiness is never Build consent');
  h.book.continueConversation(id,owner);h.book.restore(JSON.parse(JSON.stringify(h.book.read())));
  h.coach.reset();await h.coach.openSession();
  const children=h.session().messages.filter(message=>message.role==='child');
  const check=h.coach.reassess();await h.awaitModelRequest();h.resolve(ready);await check;
  assert.deepEqual(h.session().messages.filter(message=>message.role==='child'),children);
  assert.equal(h.coach.buildReadiness().ready,true);
  assert.equal(h.coach.buildPrompt(),beforePrompt);
  assert.deepEqual(new StudioNotebook(h.storage).get(id,owner).messages.slice(0,200),original);
 }finally{h.dispose();}
});

await test('a mixed selection preserves both earlier options and no other option',async()=>{
 const h=coachingHarness();
 try{
  const {id,owner}=h.session();h.book.update(id,owner,s=>{s.design!.creationStandard=2;});
  const world='I tap the quiet pond. Each tap makes a ripple. I just want to play with the ripples.';
  const looks=['chalk lines','clay rings','paper waves'];
  const evidence={action:'tap',consequence:'makes a ripple',world:'pond',mood:'quiet',experience:'play with the ripples',
   goal:'just want to play with the ripples',visualStyle:'Mix the first and third.'};
  const gaps=Object.fromEntries(Object.keys(evidence).map(key=>[key,''])) as typeof evidence;
  const incomplete={...reply,creationReadiness:{ready:false,evidence:gaps,unresolved:['How should the pond look?']}};
  await sendTurn(h,world,incomplete);
  await sendTurn(h,'Give me three ideas.',{...incomplete,text:'My ideas are chalk lines, clay rings and paper waves.',
   planSuggestions:looks.map(value=>({field:'style',value}))});
  await sendTurn(h,evidence.visualStyle,{...reply,question:null,childDecisions:[{field:'style',quote:evidence.visualStyle}],
   planSuggestions:[looks[0],looks[2]].map(value=>({field:'style',value})),creationReadiness:{ready:true,evidence,unresolved:[]}});
  const build=h.coach.buildPrompt()!;
  assert.match(build,/chalk lines/);assert.match(build,/paper waves/);assert.doesNotMatch(build,/clay rings/);
  assert.equal(h.buildRequests.length,0);
 }finally{h.dispose();}
});
await test('a clarification about pixel art and a side view create no extra plan fields in a connected v2 game',async()=>{
 const h=coachingHarness();
 try{
  const {id,owner}=h.session();h.book.update(id,owner,s=>{s.design!.creationStandard=2;});
  const evidence={action:'',consequence:'',experience:'',world:'',goal:'',visualStyle:'',mood:''};
  const ongoing={...reply,creationReadiness:{ready:false,evidence,unresolved:['The purpose of play is still open.']}};
  await sendTurn(h,'I see the fox from the side, like it is running.',{...ongoing,childDecisions:[{field:'viewpoint',quote:'from the side'},{field:'movement',quote:'running'}]});
  await sendTurn(h,'What does pixel art mean?',{...ongoing,move:'explain',text:'A picture made of little colorful squares.',question:null,childDecisions:[{field:'style',quote:'pixel art'}]});
  assert.deepEqual(Object.keys(h.session().design!.plan).sort(),['movement','viewpoint']);
  assert.doesNotMatch(JSON.stringify(h.session().design!.plan),/right|left|pixel|button/);
  await h.input('studioPrompt','Please stop.');await h.coach.discuss('discuss');
  assert.equal(h.requests.length,2);assert.equal(h.buildRequests.length,0);
  assert.doesNotMatch(h.session().messages.at(-1)!.text,/\?/);
 }finally{h.dispose();}
});
await test('a legacy sole compiled message needs a new contextual review and its payload stays out of visible intent',async()=>{
 const h=coachingHarness();try{
  const s=h.session(),envelope='\n\nApproved game plan (full choices remain in this notebook):\n'+PLAN_FIELDS.map(field=>field+': My choice').join('\n');
  h.book.message(s.id,s.owner,'child',ownGame+envelope);h.book.update(s.id,s.owner,x=>{x.design!.approvedPlan=true;});
  assert.equal(h.coach.buildReadiness().ready,false);const original=h.session().messages[0].text;
  await sendTurn(h,'Keep the moon game I described.',readyReply);
  assert.doesNotMatch(JSON.stringify(h.requests.at(-1).context.conversation),/Approved game plan/);
  assert.equal(h.coach.buildReadiness().ready,true);assert.doesNotMatch(h.coach.buildPrompt()!,/Approved game plan/);assert.equal(h.session().messages[0].text,original);
 }finally{h.dispose();}
});

await test('model cannot declare a build or promotion action',async()=>{assert.throws(()=>validateCoachReply({...reply,promote:true},context));assert.throws(()=>validateCoachReply({...reply,move:'execute'},context));});
await test('unsupported observation citation rejected',async()=>{assert.throws(()=>validateCoachReply({...reply,evidenceIds:['not-real']},context));});
await test('one question per reply, not a disguised interview',async()=>{assert.throws(()=>validateCoachReply({...reply,text:'What happened? What next?'},context));});
await test('offline help opens the interaction design space without giving the benchmark answer',async()=>{const r=localCoach({...context,message:'I hate aiming'});assert.match(r.text,/action itself/);assert.doesNotMatch(JSON.stringify(r),/shield|pong/i);assert.equal(r.proposedChange,null);});
await test('help escalates without repeating the same question',async()=>{const qs=[0,1,2].map(helpLevel=>localCoach({...context,message:"I don't know",helpLevel}).question);assert.equal(new Set(qs).size,3);});
await test('requests for inspiration get alternatives; no withholding',async()=>{assert.ok(localCoach({...context,mode:'ideas'}).suggestions.length>=2);});
await test('winning does not automatically establish enjoyment',async()=>{const r=localCoach({...context,message:'I won but it was boring'});assert.match(r.text,/change the action or goal/);});
await test('gold policy explicitly preserves redesign, skip, ownership and not overclaiming',async()=>{for(const phrase of ['not as a fixed interview','child owns','Rethinking','no nagging','one play is not proof'])assert.ok(COACH_POLICY.toLowerCase().includes(phrase.toLowerCase()),phrase);});
await test('conversation coach respects either required learning subject',async()=>{assert.match(COACH_POLICY,/Math or Language Arts/);assert.match(COACH_POLICY,/cannot change the parent's chosen subject/);assert.match(COACH_POLICY,/required learning layer/);});
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
await test('private readiness rejects a fixed prompt that cannot fit the approved turn allowance without inference',async()=>{
 let calls=0;const transport:typeof fetch=async()=>{calls++;throw Error('readiness must not call a provider');};
 const normal=new OpenAICoachProvider(privateConfig,transport);assert.equal(await normal.readiness(new AbortController().signal),true);
 const impossible=new OpenAICoachProvider({...privateConfig,maxTurnMicroUsd:1000,inputMicroUsdPerMillion:750000,outputMicroUsdPerMillion:4500000},transport);
 assert.equal(await impossible.readiness(new AbortController().signal),false);
 await assert.rejects(impossible.complete(context,new AbortController().signal),/SPENDING_CUTOFF/);
 assert.equal(calls,0);assert.equal(privateConfig.maxTurnMicroUsd,10000,'the check never increases a configured allowance');
});
await test('private status includes provider preflight without making an inference or exposing its configuration',async()=>{
 let available=false,calls=0;const handler=privateCoachHandler({config:privateConfig,enabled:true,verifyCaller:async()=>true,
  provider:{readiness:async()=>available,complete:async()=>{calls++;throw Error('status must not infer');}}});
 const request={headers:{authorization:'Bearer '+'x'.repeat(80),'x-factory-request':'1'},url:'/v1/private-coach/status',method:'GET'};
 for(const expected of [false,true]){
  available=expected;let status=0,body:any;
  const response={headersSent:false,writableEnded:false,destroyed:false,once(){},writeHead(code:number){status=code;},end(value:string){body=JSON.parse(value);}};
  await handler(request as any,response as any);
  assert.equal(status,200);assert.deepEqual(body,{available:expected,mode:expected?'model':'unavailable'});
 }
 assert.equal(calls,0);
});
await test('refusal never becomes a proposed game',async()=>{const p=new OpenAICoachProvider(privateConfig,async(url)=>String(url).endsWith('/moderations')?new Response(JSON.stringify({results:[{flagged:false}]})):new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'refusal'}]}]})));await assert.rejects(p.complete(context,new AbortController().signal),/COACH_REFUSED/);});
await test('output exhaustion is a technical failed reply, not a safety refusal or an automatic paid retry',async()=>{
 for(const response of [{status:'incomplete',incomplete_details:{reason:'max_output_tokens'},output:[]},{status:'failed',error:{code:'server_error'},output:[]}]){
  let calls=0;const p=new OpenAICoachProvider(privateConfig,async url=>{
   if(String(url).endsWith('/moderations'))return new Response(JSON.stringify({results:[{flagged:false}]}));
   calls++;return new Response(JSON.stringify(response));
  });
  await assert.rejects(p.complete(context,new AbortController().signal),/^Error: COACH_PROVIDER_FAILED$/);
  assert.equal(calls,1);
 }
 const filtered=new OpenAICoachProvider(privateConfig,async url=>String(url).endsWith('/moderations')?new Response(JSON.stringify({results:[{flagged:false}]})):new Response(JSON.stringify({status:'incomplete',incomplete_details:{reason:'content_filter'},output:[]})));
 await assert.rejects(filtered.complete(context,new AbortController().signal),/COACH_REFUSED/);
});
await test('child-authorship requires an exact child quote, not a helper paraphrase',async()=>{assert.throws(()=>validateCoachReply({...reply,childDecisions:[{field:'fun',quote:'I want a shield'}]},context));assert.equal(validateCoachReply({...reply,childDecisions:[{field:'fun',quote:'I dislike aiming'}]},context).childDecisions![0].quote,'I dislike aiming');});
await test('input moderation refuses before an inference request',async()=>{let inference=0;const p=new OpenAICoachProvider(privateConfig,async url=>{if(!String(url).endsWith('/moderations'))inference++;return new Response(JSON.stringify({results:[{flagged:true}]}));});await assert.rejects(p.complete(context,new AbortController().signal),/COACH_REFUSED/);assert.equal(inference,0);});
await test('output moderation prevents an unsafe response from reaching the child',async()=>{let mod=0;const p=new OpenAICoachProvider(privateConfig,async url=>{if(String(url).endsWith('/moderations'))return new Response(JSON.stringify({results:[{flagged:++mod===2}]}));return new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(reply)}]}],usage:{input_tokens:10,output_tokens:20}}));});await assert.rejects(p.complete(context,new AbortController().signal),/COACH_REFUSED/);assert.equal(mod,2);});
await test('invalid model output never mutates a game or becomes a trusted plan',async()=>{const bad=new CoachService(repo,config,{complete:async()=>({reply:{...reply,tool:'change-main'},usedMicroUsd:4})});await assert.rejects(bad.respond(session,{requestId:'bad-output',context}),/Invalid coach response/);assert.equal((await repo.snapshot()).coachReceipts!.find(r=>r.id==='bad-output')!.state,'failed');});
await test('request IDs cannot leak another family response',async()=>{const other={...session,familyId:'other-family'};await assert.rejects(service.respond(other,{requestId:'req1',context}),/COACH_UNAVAILABLE/);});
console.log(`${passed} design-coach tests passed. Model outputs are fixtures; no live inference or learning efficacy is claimed.`);

}
void main().catch(e=>{console.error(e);process.exitCode=1;});
