import assert from 'node:assert/strict';
import test from 'node:test';
import {prepareCreationWire} from '../server/coach/private-creation-wire';
import {COACH_SCHEMA} from '../server/coach/policy';
import {validateCoachReply,type CoachContext} from '../src/studio/design';
import {recordCreationReview,creationBuildReadiness} from '../src/studio/creation-readiness';
import {StudioNotebook} from '../src/studio/notebook';

const context=(message='I steer a moth through a moonlit garden. Each flower lights when touched. Exploring should feel peaceful.'):CoachContext=>({
 message,mode:'discuss',game:'new',plan:{},friction:'',helpLevel:0,support:'brief',
 conversation:[{role:'child',text:message}],observations:[],tests:[],creation:{version:1}
});
const reply=()=>({move:'clarify',text:'Let’s work out what your character does.',question:'What happens when it reaches a flower?',
 suggestions:[],proposedChange:null,planSuggestions:[],childDecisions:[],evidenceIds:[]});
const empty={action:'',consequence:'',experience:'',world:''};
const ready=(id:string)=>({...reply(),move:'listen',text:'Your idea is ready to try. Choose Build my game.',
 question:null,creationReadiness:{ready:true,evidence:{action:id,consequence:id,experience:id,world:id},unresolved:[]}});
const notReady=()=>({...reply(),creationReadiness:{ready:false,evidence:{...empty},unresolved:['What happens when it reaches a flower?']}});
type Source={id:string;text:string;childDecision:boolean};
const catalog=(prepared:ReturnType<typeof prepareCreationWire>)=>(prepared.input as {creationSources:Source[]}).creationSources;

/** Check the schema subset emitted here without adding a runtime dependency. */
function matches(value:unknown,schema:any):boolean {
 if(schema.anyOf)return schema.anyOf.some((item:any)=>matches(value,item));
 if(schema.enum&&!schema.enum.includes(value))return false;
 if(Array.isArray(schema.type))return schema.type.some((type:string)=>matches(value,{...schema,type}));
 if(schema.type==='null')return value===null;
 if(schema.type==='boolean')return typeof value==='boolean';
 if(schema.type==='string')return typeof value==='string'&&
  (schema.minLength===undefined||Array.from(value).length>=schema.minLength)&&(schema.maxLength===undefined||Array.from(value).length<=schema.maxLength)&&
  (schema.pattern===undefined||new RegExp(schema.pattern).test(value));
 if(schema.type==='array')return Array.isArray(value)&&
  (schema.maxItems===undefined||value.length<=schema.maxItems)&&value.every(item=>matches(item,schema.items));
 if(schema.type==='object')return !!value&&typeof value==='object'&&!Array.isArray(value)&&
  (schema.required||[]).every((key:string)=>Object.hasOwn(value,key))&&
  Object.entries(value).every(([key,item])=>schema.properties[key]?matches(item,schema.properties[key]):schema.additionalProperties!==false);
 return false;
}

test('eligible text appears once and repeated source positions reference the same catalog entry',()=>{
 const c=context('I steer a moon moth to the glowing flowers.');
 c.plan.action={value:c.message,origin:'child',accepted:true,delegated:false};
 const before=structuredClone(c),schemaBefore=structuredClone(COACH_SCHEMA),prepared=prepareCreationWire(c,COACH_SCHEMA);
 const input=prepared.input as any,sources=catalog(prepared);
 assert.equal(sources.length,1);
 assert.deepEqual(input.message,{sourceIds:[sources[0].id]});
 assert.deepEqual(input.conversation[0].text,input.message);
 assert.deepEqual(input.plan.action.value,input.message);
 assert.equal(JSON.stringify(input).split(c.message).length-1,1);
 assert.ok(!JSON.stringify(prepared.schema).includes(c.message));
 assert.deepEqual(c,before);assert.deepEqual(COACH_SCHEMA,schemaBefore);
});

test('helper, reflection, delegated, unaccepted and helper-origin plan data cannot be evidence',()=>{
 const c=context('A child-authored world.');
 c.conversation.push({role:'helper',text:'HELPER_ONLY_SENTINEL'},{role:'reflection',text:'REFLECTION_ONLY_SENTINEL'});
 c.plan={
  fun:{value:'HELPER_PLAN_SENTINEL',origin:'helper',accepted:true,delegated:false},
  action:{value:'DELEGATED_SENTINEL',origin:'child',accepted:true,delegated:true},
  goal:{value:'UNACCEPTED_SENTINEL',origin:'child',accepted:false,delegated:false},
  style:{value:'Accepted child-only plan wording.',origin:'child',accepted:true,delegated:false}
 };
 const prepared=prepareCreationWire(c,COACH_SCHEMA),sources=catalog(prepared),input=prepared.input as any;
 for(const text of ['HELPER_ONLY_SENTINEL','REFLECTION_ONLY_SENTINEL','HELPER_PLAN_SENTINEL','DELEGATED_SENTINEL','UNACCEPTED_SENTINEL']){
  assert.ok(JSON.stringify(input).includes(text),'noneligible data remains available for conversation');
  assert.ok(!sources.some(source=>source.text===text));
 }
 const plan=sources.find(source=>source.text==='Accepted child-only plan wording.')!;
 assert.ok(plan);assert.equal(plan.childDecision,false);
 const decoded=validateCoachReply(prepared.decode(ready(plan.id)),c);
 assert.equal(decoded.creationReadiness!.evidence.world,plan.text);
 assert.throws(()=>validateCoachReply(prepared.decode({...ready(plan.id),childDecisions:[{field:'style',quote:plan.text}]}),c),/exact child-authored quote/);
});

test('source chunks preserve all characters and avoid splitting UTF-16 surrogate pairs',()=>{
 const message='a'.repeat(699)+'🦋'+' '+('A moth lands. '.repeat(110));
 const c=context(message),prepared=prepareCreationWire(c,COACH_SCHEMA),input=prepared.input as any,sources=catalog(prepared);
 const byId=new Map(sources.map(source=>[source.id,source.text]));
 const parts=input.message.sourceIds.map((id:string)=>byId.get(id)!);
 assert.equal(parts.join(''),message);
 for(const part of parts){
  assert.ok(part.length>0&&part.length<=700);
  assert.ok(!/[\uD800-\uDBFF]$/.test(part));
  assert.ok(!/^[\uDC00-\uDFFF]/.test(part));
  assert.ok(message.includes(part),'every translated quote remains an exact substring');
 }
 assert.deepEqual(input.message,input.conversation[0].text);
});

test('long punctuated sources prefer existing phrase boundaries without rewriting them',()=>{
 const first='The moon moth glides past '+ 'glowing flowers '.repeat(18)+'. ';
 const second='Then it lands softly, '+ 'watching stars '.repeat(20)+'.';
 const prepared=prepareCreationWire(context(first+second),COACH_SCHEMA),sources=catalog(prepared),input=prepared.input as any;
 const chunks=input.message.sourceIds.map((id:string)=>sources.find(source=>source.id===id)!.text);
 assert.equal(chunks.join(''),first+second);
 assert.equal(chunks[0],first);
 assert.ok(chunks.every((part:string)=>part.length<=700));
});

test('ready and not-ready wire replies satisfy their schema and unchanged public validators',()=>{
 const c=context(),prepared=prepareCreationWire(c,COACH_SCHEMA),id=catalog(prepared)[0].id;
 for(const wire of [ready(id),notReady()]){
  assert.equal(matches(wire,prepared.schema),true);
  const before=structuredClone(wire),decoded=validateCoachReply(prepared.decode(wire),c);
  assert.equal(decoded.creationReadiness!.ready,wire.creationReadiness.ready);
  assert.deepEqual(wire,before);
  assert.equal(decoded.creationReadiness!.evidence.action,wire.creationReadiness.ready?c.message:'');
 }
 const choice={...ready(id),childDecisions:[{field:'action',quote:'steer a moth'}]};
 assert.equal(matches(choice,prepared.schema),true);
 assert.equal(validateCoachReply(prepared.decode(choice),c).childDecisions![0].quote,'steer a moth');
});

test('not-ready conversation cannot unlock Build; a current valid ready review still needs explicit Build',()=>{
 const c=context(),prepared=prepareCreationWire(c,COACH_SCHEMA),id=catalog(prepared)[0].id;
 const data=new Map<string,string>(),notebook=new StudioNotebook({getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)});
 const initial=notebook.create('owner','new','Moon moth');
 notebook.message(initial.id,initial.owner,'child',c.message);
 for(const wire of [notReady(),ready(id)]){
  const validated=validateCoachReply(prepared.decode(wire),c),snapshot=notebook.get(initial.id,initial.owner);
  const review=recordCreationReview(snapshot,validated.creationReadiness);
  const saved=notebook.update(initial.id,initial.owner,session=>{session.design!.creationReview=review;});
  assert.equal(creationBuildReadiness(saved).ready,wire.creationReadiness.ready);
  assert.equal(saved.job,null);assert.equal(saved.pendingExperiment,null);
 }
});

test('unknown and literal readiness references are rejected without normalization',()=>{
 const c=context(),prepared=prepareCreationWire(c,COACH_SCHEMA),id=catalog(prepared)[0].id;
 for(const value of ['unknown-id',c.message,'I invent a different world',9,null]){
  const wire=ready(id) as any;wire.creationReadiness.evidence.world=value;
  assert.equal(matches(wire,prepared.schema),false);
  assert.throws(()=>prepared.decode(wire),/Invalid creation (evidence reference|review)/);
 }
 assert.throws(()=>validateCoachReply(prepared.decode({...ready(id),childDecisions:[{field:'action',quote:id}]}),c),/exact child-authored quote/);
});

test('child decisions retain short literal quotes and their unchanged validation contract',()=>{
 const c=context('I steer a moth. Flowers light up. It lives in a moonlit garden.');
 const prepared=prepareCreationWire(c,COACH_SCHEMA),id=catalog(prepared)[0].id;
 assert.deepEqual((prepared.schema as any).properties.childDecisions,COACH_SCHEMA.properties.childDecisions);
 const choices=[{field:'action',quote:'steer a moth'},{field:'goal',quote:'Flowers light up'},{field:'style',quote:'moonlit garden'}];
 const wire={...ready(id),childDecisions:choices},decoded=validateCoachReply(prepared.decode(wire),c);
 assert.deepEqual(decoded.childDecisions,choices,'one plan choice must not expand to an unrelated whole source chunk');
 for(const bad of [
  [{field:'action',quote:id}],
  [{field:'action',quote:'an invented action'}],
  [{field:'action',quote:'steer a moth',extra:true}],
  [{field:'action',quote:7}]
 ]){
  const preserved=prepared.decode({...wire,childDecisions:bad}) as any;
  assert.deepEqual(preserved.childDecisions,bad);
  assert.throws(()=>validateCoachReply(preserved,c),/exact child-authored quote/);
 }
});

test('malformed and contradictory verdicts fail instead of granting partial success',()=>{
 const c=context(),prepared=prepareCreationWire(c,COACH_SCHEMA),id=catalog(prepared)[0].id;
 const candidates:any[]=[
  {...ready(id),creationReadiness:null},
  {...ready(id),creationReadiness:{ready:true,evidence:{...empty},unresolved:[]}},
  {...ready(id),creationReadiness:{ready:true,evidence:ready(id).creationReadiness.evidence,unresolved:['Still undecided']}},
  {...notReady(),creationReadiness:{...notReady().creationReadiness,evidence:{...empty,world:id}}},
  {...notReady(),creationReadiness:{...notReady().creationReadiness,unresolved:['  ']}},
  {...notReady(),creationReadiness:{...notReady().creationReadiness,unresolved:['x'.repeat(351)]}},
  {...notReady(),creationReadiness:{...notReady().creationReadiness,unresolved:Array(9).fill('Missing choice')}},
  {...notReady(),creationReadiness:{...notReady().creationReadiness,unknown:true}},
  {...ready(id),childDecisions:[{field:'unknown',quote:id}]}
 ];
 for(const value of candidates){
  assert.equal(matches(value,prepared.schema),false);
  assert.throws(()=>validateCoachReply(prepared.decode(value),c));
 }
});

test('missing readiness keeps the existing diagnostic while malformed present values remain invalid',()=>{
 const prepared=prepareCreationWire(context(),COACH_SCHEMA);
 for(const value of [{...reply()},{...reply(),creationReadiness:null},{...reply(),creationReadiness:undefined}])
  assert.throws(()=>prepared.decode(value),error=>error instanceof Error&&error.message==='CREATION_REVIEW_MISSING');
 for(const creationReadiness of [false,7,'missing',{...notReady().creationReadiness,extra:true}])
  assert.throws(()=>prepared.decode({...reply(),creationReadiness}),error=>error instanceof Error&&error.message==='Invalid creation review.');
});

test('provider gap bounds fit unchanged UTF-16 host limits for astral text',()=>{
 const c=context(),prepared=prepareCreationWire(c,COACH_SCHEMA);
 const accepted={...notReady(),creationReadiness:{...notReady().creationReadiness,unresolved:['🦋'.repeat(175)]}};
 assert.equal(accepted.creationReadiness.unresolved[0].length,350);
 assert.equal(matches(accepted,prepared.schema),true);
 assert.doesNotThrow(()=>validateCoachReply(prepared.decode(accepted),c));
 for(const gap of ['🦋'.repeat(176),'x'.repeat(176)]){
  const rejected={...notReady(),creationReadiness:{...notReady().creationReadiness,unresolved:[gap]}};
  assert.equal(matches(rejected,prepared.schema),false);
  assert.throws(()=>prepared.decode(rejected),/Invalid creation review/);
 }
});

test('no eligible source omits the ready branch and child choices still need actual child wording',()=>{
 const c=context('');c.conversation=[{role:'helper',text:'A fully specified helper game.'}];
 const prepared=prepareCreationWire(c,COACH_SCHEMA),schema=prepared.schema as any;
 assert.equal(catalog(prepared).length,0);
 assert.equal(schema.properties.creationReadiness.anyOf.length,1);
 assert.deepEqual(schema.properties.childDecisions,COACH_SCHEMA.properties.childDecisions);
 assert.equal(matches(notReady(),prepared.schema),true);
 assert.equal(validateCoachReply(prepared.decode(notReady()),c).creationReadiness!.ready,false);
 assert.throws(()=>validateCoachReply(prepared.decode({...notReady(),childDecisions:[{field:'action',quote:c.conversation[0].text}]}),c),/exact child-authored quote/);
 assert.throws(()=>prepared.decode(ready('s0')),/reference/);
 const spaces=prepareCreationWire(context(' '.repeat(800)),COACH_SCHEMA);
 assert.equal((spaces.schema as any).properties.creationReadiness.anyOf.length,1);
 assert.throws(()=>spaces.decode(ready(catalog(spaces)[0].id)),/reference/);
});

test('catalog bounds reject excessive sources before a provider request can be built',()=>{
 const c=context('Current child message.');
 c.conversation=Array.from({length:200},(_,index)=>({role:'child',text:'Unique bounded statement '+index+'.'}));
 assert.throws(()=>prepareCreationWire(c,COACH_SCHEMA),/INVALID_REQUEST/);
});

test('legacy clients retain exactly their prior provider input/schema/reply path',()=>{
 const c=context();delete c.creation;
 const prepared=prepareCreationWire(c,COACH_SCHEMA),value=reply();
 assert.equal(prepared.input,c);assert.equal(prepared.schema,COACH_SCHEMA);
 assert.equal(prepared.decode(value),value);
 assert.doesNotThrow(()=>validateCoachReply(value,c));
 assert.equal(Object.hasOwn(c,'creationSources'),false);
});


test('creative readiness v2 has seven sourced dimensions and preserves the v1 schema',()=>{
 const idea='A happy pixel fox dodges leaves in a forest. When a leaf hits, the fox loses. You win when the wind stops. I want it cute and colorful.';
 const c=context(idea);c.creation={version:2};
 const before=structuredClone(c),base=structuredClone(COACH_SCHEMA),prepared=prepareCreationWire(c,COACH_SCHEMA),id=catalog(prepared)[0].id;
 const evidence={action:id,consequence:id,experience:id,world:id,goal:id,visualStyle:id,mood:id};
 const v2={...ready(id),creationReadiness:{ready:true,evidence,unresolved:[]}};
 assert.equal(matches(v2,prepared.schema),true);
 const accepted=validateCoachReply(prepared.decode(v2),c);
 assert.equal(accepted.creationReadiness?.evidence.goal,idea);
 assert.equal(accepted.creationReadiness?.evidence.visualStyle,idea);
 assert.equal(accepted.creationReadiness?.evidence.mood,idea);
 assert.deepEqual(c,before);assert.deepEqual(COACH_SCHEMA,base);
 assert.equal(matches({...v2,creationReadiness:{...v2.creationReadiness,evidence:{action:id,consequence:id,experience:id,world:id}}},prepared.schema),false);
 assert.throws(()=>prepared.decode({...v2,creationReadiness:{...v2.creationReadiness,evidence:{...evidence,visualStyle:'fake-id'}}}),/Invalid creation evidence reference/);
 const unresolved={...v2,question:'How does the game look?',creationReadiness:{ready:false,
  evidence:{action:'',consequence:'',experience:'',world:'',goal:'',visualStyle:'',mood:''},
  unresolved:['The child has not chosen a visual style.']}};
 assert.equal(matches(unresolved,prepared.schema),true);
 assert.equal(validateCoachReply(prepared.decode(unresolved),c).creationReadiness?.ready,false);
});
