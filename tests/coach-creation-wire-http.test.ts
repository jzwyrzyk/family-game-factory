import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import test from 'node:test';
import {privateCoachHandler} from '../server/coach/private-executor';
import {OpenAICoachProvider,type CoachFailureEvent,type PrivateCoachConfig} from '../server/coach/private-provider';
import {COACH_SCHEMA} from '../server/coach/policy';
import {validateCoachReply,type CoachContext,type CoachReply} from '../src/studio/design';
import {StudioNotebook} from '../src/studio/notebook';
import {creationBuildReadiness,recordCreationReview} from '../src/studio/creation-readiness';

/** Real loopback private HTTP requests with synthetic provider responses.
 * No model request or cloud call is made by this suite. */
const config:PrivateCoachConfig={
 enabled:true,privacyApproved:true,moderationApproved:true,zdrVerified:true,privateExecutionApproved:true,
 model:'fixture-model',apiKey:'fixture-private-creation-key',
 maxInputChars:16000,maxOutputTokens:800,maxTurnMicroUsd:30000,
 inputMicroUsdPerMillion:750000,outputMicroUsdPerMillion:4500000,pricesReviewedAt:new Date().toISOString()
};
const action='I steer a paper boat between stars';
const brief=action+'. Each parcel I deliver lights a star. I want a peaceful night voyage.';
const incomplete='I want a paper boat in a sky full of stars.';
const emptyEvidence=()=>({action:'',consequence:'',experience:'',world:''});
const ordinaryReply=()=>({move:'clarify',text:'Your paper boat can travel among the stars.',
 question:'What should the player help the boat do?',suggestions:[],proposedChange:null,
 planSuggestions:[],childDecisions:[],evidenceIds:[]});
const notReady=()=>({...ordinaryReply(),creationReadiness:{ready:false,evidence:emptyEvidence(),
 unresolved:['What does the player help the boat do?']}});
function context(message=brief):CoachContext {
 return {message,mode:'discuss',game:'new',plan:{},friction:'',helpLevel:0,support:'brief',
  conversation:[{role:'child',text:message}],observations:[],tests:[],creation:{version:1}};
}
interface CapturedRequest {
 request:any;
 input:any;
}
type ReplyFactory=(captured:CapturedRequest)=>unknown;
function source(captured:CapturedRequest,text:string){
 const sources=captured.input.creationSources;
 assert.ok(Array.isArray(sources),'the actual provider input includes its exact-source catalog');
 const found=sources.find((entry:any)=>entry.text===text);
 assert.ok(found,'expected authored source is present in the actual request');
 assert.equal(typeof found.id,'string');
 return found;
}
function readyWire(captured:CapturedRequest,text=brief){
 const id=source(captured,text).id;
 return {...ordinaryReply(),move:'listen',text:'Your boat delivers light to the stars. Choose Build my game when you are ready.',
  question:'Would another color make it prettier?',childDecisions:[{field:'action',quote:action}],
  creationReadiness:{ready:true,evidence:{action:id,consequence:id,experience:id,world:id},unresolved:[]}};
}

async function invoke(c:CoachContext,reply:ReplyFactory,options:PrivateCoachConfig=config){
 const calls:string[]=[],captured:CapturedRequest[]=[],failures:CoachFailureEvent[]=[];
 const provider=new OpenAICoachProvider(options,async(url,init)=>{
  const target=String(url);
  if(target==='https://api.openai.com/v1/moderations'){
   calls.push('moderation');
   return new Response(JSON.stringify({results:[{flagged:false}]}));
  }
  assert.equal(target,'https://api.openai.com/v1/responses','the fixture rejects every unexpected provider destination');
  calls.push('inference');
  const request=JSON.parse(String(init?.body));
  assert.equal(request.store,false);assert.equal(request.text.format.strict,true);
  const observation={request,input:JSON.parse(request.input.find((entry:any)=>entry.role==='user').content)};
  captured.push(observation);
  return new Response(JSON.stringify({status:'completed',usage:{input_tokens:10,output_tokens:20},
   output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(reply(observation))}]}]}));
 });
 const handler=privateCoachHandler({config:options,enabled:true,verifyCaller:async()=>true,provider,
  reportFailure:event=>{failures.push(event);}});
 const server=createServer((req,res)=>{void handler(req,res);});
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 try{
  const response=await fetch('http://127.0.0.1:'+(server.address() as AddressInfo).port+'/v1/private-coach/complete',{
   method:'POST',headers:{'Content-Type':'application/json','X-Factory-Request':'1',Authorization:'Bearer '+'f'.repeat(80)},
   body:JSON.stringify({version:1,context:c})
  });
  return {status:response.status,body:await response.json() as any,calls,captured,failures};
 }finally{
  await new Promise<void>((resolve,reject)=>{server.close(error=>error?reject(error):resolve());server.closeAllConnections();});
 }
}
function saveReview(c:CoachContext,reply:CoachReply){
 const storage=new Map<string,string>();
 const notebook=new StudioNotebook({getItem:key=>storage.get(key)??null,setItem:(key,value)=>{storage.set(key,value);}});
 const created=notebook.create('fixture-player','new','Starlight post');
 for(const message of c.conversation)if(message.role==='child')notebook.message(created.id,created.owner,'child',message.text);
 if(!c.conversation.some(message=>message.role==='child'&&message.text===c.message))notebook.message(created.id,created.owner,'child',c.message);
 const snapshot=notebook.update(created.id,created.owner,session=>{session.design!.plan=structuredClone(c.plan);});
 const review=recordCreationReview(snapshot,reply.creationReadiness);
 return notebook.update(created.id,created.owner,session=>{session.design!.creationReview=review;});
}

test('an incomplete idea receives a real contextual reply while Build remains unavailable',async()=>{
 const c=context(incomplete),before=JSON.stringify(c),answer=notReady();
 const result=await invoke(c,captured=>{
  source(captured,incomplete);
  assert.notEqual(captured.input.message,c.message,'source indexing is private to the provider request');
  return answer;
 });
 assert.equal(result.status,200);assert.deepEqual(result.failures,[]);
 assert.deepEqual(result.calls,['moderation','inference','moderation']);
 assert.equal(result.captured.length,1,'one explicit turn produces one inference');
 const gatewayChecked=validateCoachReply(result.body.reply,c);
 const browserChecked=validateCoachReply(gatewayChecked,c);
 assert.equal(browserChecked.text,answer.text);assert.equal(browserChecked.question,answer.question);
 assert.equal(browserChecked.creationReadiness?.ready,false);
 const saved=saveReview(c,browserChecked);
 assert.equal(creationBuildReadiness(saved).ready,false);
 assert.equal(saved.job,null);assert.equal(saved.pendingExperiment,null);
 assert.equal(JSON.stringify(c),before,'the public context is preserved');
 assert.deepEqual(answer.creationReadiness.evidence,emptyEvidence(),'the synthetic provider object is not rewritten');
});

test('exact evidence references survive private, gateway and browser validation without submitting Build',async()=>{
 const c=context(),before=JSON.stringify(c);
 let rawWire:any;
 const result=await invoke(c,captured=>{rawWire=readyWire(captured);return rawWire;});
 assert.equal(result.status,200);assert.deepEqual(result.failures,[]);
 assert.deepEqual(result.calls,['moderation','inference','moderation']);
 const gatewayChecked=validateCoachReply(result.body.reply,c);
 const browserChecked=validateCoachReply(gatewayChecked,c);
 assert.equal(browserChecked.creationReadiness?.ready,true);
 assert.deepEqual(browserChecked.creationReadiness?.evidence,{action:brief,consequence:brief,experience:brief,world:brief});
 assert.equal(browserChecked.childDecisions?.[0].quote,action);
 assert.equal(browserChecked.question,null,'a ready review ends optional follow-up questions');
 assert.notEqual(rawWire.creationReadiness.evidence.action,brief,'source IDs remain a provider-only wire format');
 const saved=saveReview(c,browserChecked);
 assert.equal(creationBuildReadiness(saved).ready,true);
 assert.equal(saved.job,null);assert.equal(saved.candidate,null,'readiness never generates a game');
 assert.equal(JSON.stringify(c),before);
});

test('a multi-aspect follow-up retains a short child action quote and the complete original context',async()=>{
 const c=context();
 c.conversation=[{role:'child',text:incomplete},{role:'helper',text:'What should your paper boat do?'},{role:'child',text:brief}];
 const before=structuredClone(c);
 let rawWire:any;
 const result=await invoke(c,captured=>{
  source(captured,incomplete);source(captured,brief);
  assert.deepEqual(captured.request.text.format.schema.properties.childDecisions,COACH_SCHEMA.properties.childDecisions,
   'readiness indexing does not change the child decision contract');
  rawWire=readyWire(captured);return rawWire;
 });
 assert.equal(result.status,200);
 const checked=validateCoachReply(validateCoachReply(result.body.reply,c),c);
 assert.deepEqual(checked.childDecisions,[{field:'action',quote:action}]);
 assert.notEqual(checked.childDecisions?.[0].quote,brief,'the action field does not absorb consequence and experience from the whole follow-up');
 assert.equal(checked.creationReadiness?.evidence.action,brief,'a separate readiness citation may retain the full eligible source chunk');
 assert.equal(rawWire.childDecisions[0].quote,action,'the model literal quote is preserved rather than expanded');
 assert.deepEqual(c,before,'the original premise, helper question and multi-aspect follow-up stay intact');
 assert.equal(result.calls.filter(call=>call==='inference').length,1);
});

test('unsupported, helper-only and contradictory ready evidence fail without a repair inference',async()=>{
 const c=context();
 const helper='A helper proposes a golden rocket powered by fireworks.';
 c.conversation.unshift({role:'helper',text:helper});
 const variants=[
  {change:(wire:any)=>{wire.creationReadiness.evidence.world='unknown-source';},reason:'readiness_reference_invalid'},
  {change:(wire:any)=>{wire.creationReadiness.evidence.world=helper;},reason:'readiness_reference_invalid'},
  {change:(wire:any)=>{wire.creationReadiness.evidence.world='';},reason:'readiness_inconsistent'},
  {change:(wire:any)=>{wire.creationReadiness.unresolved=['The player action is still undecided.'];},reason:'readiness_inconsistent'}
 ];
 for(const variant of variants){
  const result=await invoke(c,captured=>{
   assert.ok(!captured.input.creationSources.some((entry:any)=>entry.text===helper),'helper prose cannot enter the evidence catalog');
   const wire=readyWire(captured);variant.change(wire);return wire;
  });
  assert.equal(result.status,503);assert.deepEqual(result.body,{errorCode:'COACH_UNAVAILABLE'});
  assert.equal(result.calls.filter(call=>call==='inference').length,1,'invalid readiness never triggers another inference');
  assert.equal(result.failures.length,1);assert.equal(result.failures[0].stage,'reply_validation');
  assert.equal(result.failures[0].reason,variant.reason,'remaining failures have a specific content-free category');
  const diagnostic=JSON.stringify(result.failures[0]);
  for(const privateValue of [brief,helper,config.apiKey])assert.ok(!diagnostic.includes(privateValue));
 }
});

test('a plan-only source may support readiness but cannot be invented as a fresh child decision',async()=>{
 const c=context();
 const planOnly='I want the paper boat to ring a bell at each star.';
 c.plan.special={value:planOnly,origin:'child',accepted:true,delegated:false};
 const valid=await invoke(c,captured=>{
  const wire=readyWire(captured);wire.creationReadiness.evidence.consequence=source(captured,planOnly).id;
  return wire;
 });
 assert.equal(valid.status,200);
 assert.equal(validateCoachReply(valid.body.reply,c).creationReadiness?.evidence.consequence,planOnly);
 for(const quote of [()=>planOnly,(captured:CapturedRequest)=>source(captured,brief).id]){
  const forged=await invoke(c,captured=>{
   const wire=readyWire(captured);wire.childDecisions[0].quote=quote(captured);return wire;
  });
  assert.equal(forged.status,200,'invalid optional child attribution must not disconnect an otherwise valid reply');
  assert.deepEqual(forged.body.reply.childDecisions,[],'a forged child choice is removed rather than saved');
  assert.equal(forged.body.reply.creationReadiness.ready,true,'independently verified readiness remains unchanged');
  assert.equal(forged.calls.filter(call=>call==='inference').length,1);
  assert.deepEqual(forged.failures,[],'optional metadata recovery is not a failed request');
 }
});

test('actual indexed input and dynamic schema are budgeted before any provider call',async()=>{
 const c=context('I want a night voyage through the stars.');
 c.conversation=Array.from({length:16},(_,index)=>({role:'child' as const,text:'My own scene detail '+index+' is a small paper lantern.'}));
 const priced={...config,inputMicroUsdPerMillion:1000000,outputMicroUsdPerMillion:1000000,maxTurnMicroUsd:100000};
 const measured=await invoke(c,()=>notReady(),priced);
 assert.equal(measured.status,200);
 const request=measured.captured[0].request;
 const developer=request.input.find((entry:any)=>entry.role==='developer').content;
 const user=request.input.find((entry:any)=>entry.role==='user').content;
 const actual=Buffer.byteLength(developer+user+JSON.stringify(request.text.format.schema))+2048+request.max_output_tokens;
 const staticEstimate=Buffer.byteLength(developer+JSON.stringify(c)+JSON.stringify(COACH_SCHEMA))+2048+request.max_output_tokens;
 assert.ok(actual>staticEstimate,'fixture must expose the cost of source indexes and the context-bound schema');
 const bounded={...priced,maxTurnMicroUsd:actual-1};
 assert.ok(staticEstimate<=bounded.maxTurnMicroUsd,'the old static calculation would incorrectly admit this request');
 const fixed=new OpenAICoachProvider(bounded,async()=>{throw Error('Readiness must not make a model request');});
 assert.equal(await fixed.readiness(new AbortController().signal),true,'the fixed prompt fits; only the actual turn exceeds the limit');
 const blocked=await invoke(c,()=>{throw Error('An over-budget turn must not reach inference');},bounded);
 assert.equal(blocked.status,503);assert.deepEqual(blocked.calls,[],'cutoff precedes input moderation and inference');
 assert.equal(blocked.failures.length,1);assert.equal(blocked.failures[0].stage,'budget');
 assert.equal(blocked.failures[0].reason,'turn_budget');
 const exact=await invoke(c,()=>notReady(),{...priced,maxTurnMicroUsd:actual});
 assert.equal(exact.status,200,'the exact calculated bound permits the otherwise valid turn');
 assert.equal(exact.calls.filter(call=>call==='inference').length,1);
});

test('valid conversational question and literal child decision are preserved byte-for-byte',async()=>{
 const c=context();
 const response=await invoke(c,captured=>({
  ...readyWire(captured),
  text:'You steer the boat between the stars.',
  question:null,
  childDecisions:[{field:'action',quote:action}]
 }));
 assert.equal(response.status,200);
 assert.deepEqual(response.body.reply.childDecisions,[{field:'action',quote:action}]);
 assert.equal(response.body.reply.text,'You steer the boat between the stars.');
 assert.equal(response.body.reply.question,null);
 assert.deepEqual(response.failures,[]);
});

test('legacy requests keep their provider input and public reply contract',async()=>{
 const c=context();delete c.creation;
 const result=await invoke(c,captured=>{
  assert.deepEqual(captured.input,c);
  assert.deepEqual(captured.request.text.format.schema,COACH_SCHEMA);
  return {...ordinaryReply(),creationReadiness:null};
 });
 assert.equal(result.status,200);assert.deepEqual(result.failures,[]);
 const checked=validateCoachReply(result.body.reply,c);
 assert.equal(Object.hasOwn(checked,'creationReadiness'),false);
 assert.equal(checked.question,ordinaryReply().question);
 assert.equal(result.calls.filter(call=>call==='inference').length,1);
});

test('a real completed reply with optional invented metadata and two questions stays conversational, not build-ready',async()=>{
 const c=context(incomplete),before=structuredClone(c);
 const result=await invoke(c,captured=>{
  source(captured,incomplete);
  return {...notReady(),
   text:'What does your paper boat do? Does it move between the stars?',
   question:'Can you explain your idea?',
   childDecisions:[{field:'action',quote:'I invented a rocket'}],
   evidenceIds:['fabricated-observation'],
   planSuggestions:[{field:'goal',value:'Deliver letters'}, {field:'unknown',value:'Unsafe guessed choice'}]};
 });
 assert.equal(result.status,200);assert.deepEqual(result.failures,[]);
 assert.deepEqual(result.calls,['moderation','inference','moderation']);
 const checked=validateCoachReply(validateCoachReply(result.body.reply,c),c);
 assert.equal(checked.text,'What does your paper boat do? Does it move between the stars.');
 assert.equal(checked.question,null);
 assert.deepEqual(checked.childDecisions,[]);
 assert.deepEqual(checked.evidenceIds,[]);
 assert.deepEqual(checked.planSuggestions,[{field:'goal',value:'Deliver letters'}],'helper proposal is never an accepted child decision');
 assert.equal(checked.creationReadiness?.ready,false);
 const saved=saveReview(c,checked);
 assert.equal(creationBuildReadiness(saved).ready,false);
 assert.equal(saved.job,null);assert.equal(saved.candidate,null);
 assert.deepEqual(c,before,'the provider boundary cannot mutate the authored context');
});

test('invalid nonessential model metadata cannot bypass a missing or forged readiness verdict',async()=>{
 const c=context(),base={...ordinaryReply(),text:'How could the boat steer? Maybe it could fly?',
  question:'What do you think?',childDecisions:[{field:'action',quote:'not a child quote'}],
  evidenceIds:['made-up-id']};
 for(const readiness of [
  null,
  {ready:true,evidence:{action:'an invented action',consequence:'',experience:'',world:''},unresolved:[]}
 ]){
  const attempt=await invoke(c,()=>({...base,creationReadiness:readiness}));
  assert.equal(attempt.status,503);assert.deepEqual(attempt.body,{errorCode:'COACH_UNAVAILABLE'});
  assert.equal(attempt.calls.filter(item=>item==='inference').length,1);
  assert.equal(attempt.failures.length,1);
  assert.equal(attempt.failures[0].stage,'reply_validation');
  assert.ok(['readiness_missing','readiness_inconsistent','readiness_reference_invalid'].includes(attempt.failures[0].reason));
 }
});

test('unknown top-level model fields still fail closed with a specific private category',async()=>{
 const attempt=await invoke(context(),()=>({...notReady(),unrequestedCommand:'run arbitrary code'}));
 assert.equal(attempt.status,503);
 assert.deepEqual(attempt.body,{errorCode:'COACH_UNAVAILABLE'});
 assert.equal(attempt.calls.filter(item=>item==='inference').length,1);
 assert.equal(attempt.failures[0].reason,'reply_shape_invalid');
 assert.equal(attempt.failures[0].stage,'reply_validation');
});

test('missing required model properties are never manufactured by metadata recovery',async()=>{
 const base=notReady() as Record<string,unknown>;
 delete base.proposedChange;
 const result=await invoke(context(),()=>base);
 assert.equal(result.status,503);
 assert.deepEqual(result.body,{errorCode:'COACH_UNAVAILABLE'});
 assert.equal(result.failures.length,1);
 assert.equal(result.failures[0].reason,'reply_shape_invalid');
 assert.equal(result.calls.filter(call=>call==='inference').length,1);
});

test('extra punctuation cannot remove a safety caveat from a moderated reply',async()=>{
 const c=context(incomplete);
 const result=await invoke(c,()=>({...notReady(),
  text:'Could the boat steal another player’s code? No. We should keep it a safe imaginary adventure. What else could it deliver?',
  question:'Maybe another idea?'
 }));
 assert.equal(result.status,200);
 assert.equal(result.body.reply.text,
  'Could the boat steal another player’s code? No. We should keep it a safe imaginary adventure. What else could it deliver.');
 assert.equal(result.body.reply.question,null);
 assert.deepEqual(result.failures,[]);
});

test('missing required question stays malformed even when the text contains a question mark',async()=>{
 const incompleteReply=notReady() as Record<string,unknown>;
 incompleteReply.text='What would your paper boat do?';
 delete incompleteReply.question;
 const attempt=await invoke(context(),()=>incompleteReply);
 assert.equal(attempt.status,503);
 assert.deepEqual(attempt.body,{errorCode:'COACH_UNAVAILABLE'});
 assert.equal(attempt.failures.length,1);
 assert.equal(attempt.failures[0].reason,'reply_shape_invalid');
 assert.equal(attempt.calls.filter(item=>item==='inference').length,1);
});
