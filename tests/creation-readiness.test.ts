import assert from 'node:assert/strict';
import test from 'node:test';
import {freshDesign,PLAN_FIELDS,validateCoachReply,validateDesign,type CoachContext,type CoachReply} from '../src/studio/design';
import {StudioNotebook,validateNotebook,type StudioSession} from '../src/studio/notebook';
import {creationBuildReadiness,creationInputFingerprint,creationConversation,recordCreationReview,validateCreationReadiness,validateCreationReview,type CreationReadinessVerdict} from '../src/studio/creation-readiness';

const evidence={
 action:'I drag the moth from flower to flower',
 consequence:'Each flower lights up when the moth touches it',
 experience:'It should feel peaceful and unhurried',
 world:'The moth lives in a moonlit garden'
};
const brief=[evidence.world,evidence.action,evidence.consequence,evidence.experience].join('. ')+'.';
const ready=():CreationReadinessVerdict=>({ready:true,evidence:{...evidence},unresolved:[]});
function fixture(text:string|undefined=brief){
 const data=new Map<string,string>();
 const notebook=new StudioNotebook({getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)});
 const initial=notebook.create('player1','new','Moon moth');
 const get=()=>notebook.get(initial.id,initial.owner);
 if(text)notebook.message(initial.id,initial.owner,'child',text);
 const save=(verdict:CreationReadinessVerdict=ready(),snapshot=get())=>{
  const review=recordCreationReview(snapshot,verdict);
  return notebook.update(initial.id,initial.owner,session=>{session.design!.creationReview=review;});
 };
 return {notebook,get,save,data};
}
function context(session:StudioSession):CoachContext {
 return {message:session.messages.filter(message=>message.role==='child').at(-1)?.text||'',mode:'discuss',game:'new',
  plan:session.design?.plan||{},friction:'',helpLevel:0,support:'brief',
  conversation:session.messages.map(({role,text})=>({role,text})),observations:[],tests:[],creation:{version:1}};
}
const reply:CoachReply={move:'listen',text:'I understand the game you described.',question:null,suggestions:[],proposedChange:null,planSuggestions:[],childDecisions:[],evidenceIds:[]};

test('one coherent child brief can support a contextual review without a questionnaire or populated plan',()=>{
 const f=fixture(),before=f.get();
 assert.deepEqual(before.design?.plan,{});
 assert.deepEqual(validateCreationReadiness(ready(),context(before)),ready());
 const saved=f.save();
 assert.equal(saved.messages.filter(message=>message.role==='child').length,1);
 assert.equal(creationBuildReadiness(saved).ready,true);
 assert.equal(saved.job,null,'recording readiness never creates a job');
 assert.equal(saved.pendingExperiment,null,'a review is not a build request');
 assert.equal(saved.candidate,null,'a review is not a generated game');
});

test('semantic readiness is the model verdict, not the presence of four quotes',()=>{
 const f=fixture(),verdict={...ready(),ready:false,unresolved:['How should touching two flowers at once behave?']};
 const saved=f.save(verdict),before=JSON.stringify(saved);
 assert.equal(creationBuildReadiness(saved).ready,false);
 assert.equal(creationBuildReadiness(saved).reason,verdict.unresolved[0]);
 assert.equal(JSON.stringify(saved),before,'checking the gate does not mutate stored ideas or evidence');
 assert.throws(()=>validateCreationReadiness({...ready(),unresolved:['The desired consequence is still unclear.']},context(saved)),/unresolved|ready/i);
});

test('transport requires the requested capability and exact child evidence, not helper prose',()=>{
 const f=fixture(),c=context(f.get());
 const old={...c};delete old.creation;
 assert.throws(()=>validateCreationReadiness(ready(),old),/requested/i);
 assert.throws(()=>validateCreationReadiness({...ready(),evidence:{...evidence,action:'The player taps a butterfly'}},c),/exact child/i);
 const helperOnly={...c,message:'Help me think about my game.',conversation:[{role:'helper' as const,text:brief}],plan:{}};
 assert.throws(()=>validateCreationReadiness(ready(),helperOnly),/exact child/i);
 assert.throws(()=>validateCreationReadiness({...ready(),evidence:{...evidence,world:''}},c),/grounded|ready/i);
 assert.throws(()=>validateCreationReadiness({...ready(),automaticBuild:true},c),/Invalid/);
 assert.throws(()=>validateCreationReadiness({...ready(),evidence:{...evidence,answer:'invented'}},c),/Invalid/);
});

test('accepted child plan statements can support a review without relabeling helper or delegated fields',()=>{
 const f=fixture(''),mapping={action:'action',goal:'consequence',fun:'experience',style:'world'} as const;
 f.notebook.update(f.get().id,'player1',session=>{
  for(const [field,key]of Object.entries(mapping))session.design!.plan[field as keyof typeof mapping]={value:evidence[key],origin:'child',accepted:true,delegated:false};
 });
 assert.equal(creationBuildReadiness(f.save()).ready,true);
 for(const [origin,accepted,delegated] of [['helper',true,false],['child',false,false],['child',true,true]] as const){
  const candidate=structuredClone(f.get());
  for(const field of Object.values(candidate.design!.plan))Object.assign(field!,{origin,accepted,delegated});
  assert.throws(()=>recordCreationReview(candidate,ready()),/exact child/,'unsupported plan provenance cannot supply readiness evidence');
 }
});

test('old approval, delegation, and accepted helper plans never establish first-creation readiness',()=>{
 const f=fixture('Make a game.');
 const old=f.notebook.update(f.get().id,'player1',session=>{
  session.design!.approvedPlan=true;
  for(const field of PLAN_FIELDS)session.design!.plan[field]={value:'A helper choice',origin:'helper',accepted:true,delegated:true};
 });
 assert.doesNotThrow(()=>validateDesign(old.design),'legacy records remain readable');
 assert.equal(creationBuildReadiness(old).ready,false,'the legacy complete-plan shortcut is not a model review');
 assert.equal(old.job,null);
});

test('legacy helper answer text echoed as a child chat turn does not become child evidence',()=>{
 const f=fixture([evidence.world,evidence.action,evidence.consequence].join('. ')+'.');
 f.notebook.message(f.get().id,'player1','helper','How should it feel?');
 f.notebook.message(f.get().id,'player1','child','Funny surprises');
 const legacy=f.notebook.update(f.get().id,'player1',session=>{
  session.design!.plan.fun={value:'Funny surprises',origin:'helper',accepted:true,delegated:false};
  session.design!.approvedPlan=true;
 });
 assert.throws(()=>recordCreationReview(legacy,{...ready(),evidence:{...evidence,experience:'Funny surprises'}}),/exact child/);
 assert.equal(creationBuildReadiness(legacy).ready,false);
});

test('a legacy compiled-plan chat envelope is not evidence of child-authored missing detail',()=>{
 const original=[evidence.world,evidence.action,evidence.consequence].join('. ')+'.';
 const f=fixture(original);
 const generated=original+'\n\nApproved game plan (full choices remain in this notebook):\n'+[
  'fun: Funny surprises','action: '+evidence.action,'goal: '+evidence.consequence,
  'setback: Try again','score: Ten points for a flower','style: '+evidence.world,
  'progression: New levels','special: No extra rules'
 ].join('\n');
 f.notebook.message(f.get().id,'player1','child',generated);
 assert.throws(()=>recordCreationReview(f.get(),{...ready(),evidence:{...evidence,experience:'Funny surprises'}}),/exact child/,
  'the old host-generated suffix cannot fill the child’s missing intended experience');
});

test('accepted model proposals and superseded turns cannot supply fresh child evidence',()=>{
 const f=fixture(),authored=f.get().messages[0];
 for(const marker of [
  {id:'build-intent:'+authored.id,text:brief,origin:'helper' as const,adopted:true},
  {id:'superseded-turn:'+authored.id,text:brief,origin:'child' as const,adopted:false}
 ]){
  const session=structuredClone(f.get());session.design!.ideas.push(marker);
  assert.throws(()=>recordCreationReview(session,ready()),/exact child/);
 }
 const refused=structuredClone(f.get());
 refused.messages.push({id:'refusal',role:'helper',text:'I can help with safe game ideas. Let’s try another idea without sharing private details.',at:new Date().toISOString()});
 assert.throws(()=>recordCreationReview(refused,ready()),/exact child/,'a refused turn is not reusable creation evidence');
});

test('a changed child turn, plan, owner or project invalidates the saved verdict',()=>{
 const f=fixture(),reviewed=f.save();
 const changedTurn=structuredClone(reviewed);changedTurn.messages[0].text+=' The moth now jumps instead.';
 const changedPlan=structuredClone(reviewed);changedPlan.design!.plan.action={value:'Now the moth jumps.',origin:'child',accepted:true,delegated:false};
 const otherOwner={...structuredClone(reviewed),owner:'player2'};
 const otherProject={...structuredClone(reviewed),id:'another-project'};
 for(const changed of [changedTurn,changedPlan,otherOwner,otherProject]){
  assert.notEqual(creationInputFingerprint(changed),reviewed.design!.creationReview!.fingerprint);
  assert.equal(creationBuildReadiness(changed).ready,false);
 }
});

test('a delayed review of an older snapshot cannot unlock a newer conversation',()=>{
 const f=fixture(),snapshot=f.get();
 f.notebook.message(snapshot.id,snapshot.owner,'child','Actually, I want the moth to race a thunderstorm.');
 const saved=f.save(ready(),snapshot);
 assert.equal(creationBuildReadiness(saved).ready,false);
 assert.ok(saved.messages.at(-1)!.text.includes('race a thunderstorm'));
});

test('unsent intent blocks Build without destroying a current review or the draft',()=>{
 const f=fixture(),reviewed=f.save();
 const changed={...structuredClone(reviewed),draft:'Give the moth a new power.'};
 assert.equal(creationInputFingerprint(changed),creationInputFingerprint(reviewed),'the draft has a separate explicit-send gate');
 assert.equal(creationBuildReadiness(changed).ready,false);
 assert.equal(changed.draft,'Give the moth a new power.');
 changed.draft='';assert.equal(creationBuildReadiness(changed).ready,true,'discarding an unsent thought leaves the unchanged reviewed idea available');
});

test('helper explanation and ordinary display state do not invalidate unchanged authored intent',()=>{
 const f=fixture(),reviewed=f.save(),same=structuredClone(reviewed);
 same.messages.push({id:'helper-status',role:'helper',text:'Your idea is saved. Build when you are ready.',at:new Date().toISOString()});
 same.updated=new Date(Date.now()+1000).toISOString();same.name='My moth game';
 assert.equal(creationInputFingerprint(same),creationInputFingerprint(reviewed));
 assert.equal(creationBuildReadiness(same).ready,true);
});

test('review serialization survives notebook reload and older notebooks stay compatible but unready',()=>{
 const f=fixture(),saved=f.save();
 assert.deepEqual(validateCreationReview(saved.design!.creationReview),saved.design!.creationReview);
 const restored=validateNotebook(JSON.parse(JSON.stringify(f.notebook.read())));
 assert.equal(creationBuildReadiness(restored.sessions[0]).ready,true);
 const older=structuredClone(restored);delete older.sessions[0].design!.creationReview;
 assert.doesNotThrow(()=>validateNotebook(older));
 assert.equal(creationBuildReadiness(older.sessions[0]).ready,false);
 assert.throws(()=>validateCreationReview({...saved.design!.creationReview,source:'local'}),/Invalid/);
 assert.throws(()=>validateCreationReview({...saved.design!.creationReview,version:2}),/Invalid/);
});

test('new creation requires a readiness verdict while old clients keep their reply contract',()=>{
 const f=fixture(),c=context(f.get());
 assert.throws(()=>validateCoachReply(reply,c),/CREATION_REVIEW_MISSING/);
 assert.throws(()=>validateCoachReply({...reply,creationReadiness:null},c),/CREATION_REVIEW_MISSING/);
 assert.equal(creationBuildReadiness(f.get()).ready,false);
 const withReview={...reply,creationReadiness:ready()};
 assert.deepEqual(validateCoachReply(withReview,c).creationReadiness,ready());
 const old={...c};delete old.creation;
 assert.doesNotThrow(()=>validateCoachReply(reply,old));
 assert.equal(Object.hasOwn(validateCoachReply(withReview,old),'creationReadiness'),false,'old clients receive their existing reply shape without readiness authority');
 assert.deepEqual(withReview.creationReadiness,ready(),'compatibility filtering does not rewrite the provider response object');
 assert.doesNotThrow(()=>validateDesign(freshDesign()));
});

test('a ready verdict ends optional follow-up questions without granting automatic Build',()=>{
 const f=fixture(),c=context(f.get());
 const checked=validateCoachReply({...reply,question:'What color should each flower be?',creationReadiness:ready()},c);
 assert.equal(checked.question,null);
 assert.equal(checked.creationReadiness?.ready,true);
 assert.equal(f.get().job,null);assert.equal(creationBuildReadiness(f.get()).ready,false);
});

test('a stated balancing challenge conveys experience without an emotion or art-style field',()=>{
 const idea='I balance a sleepy lighthouse keeper on a floating rock while the beacon charges. Falling off wakes the sea monster and ends the round.';
 const f=fixture(idea),verdict:CreationReadinessVerdict={ready:true,evidence:{
  action:'I balance a sleepy lighthouse keeper on a floating rock',
  consequence:'Falling off wakes the sea monster and ends the round.',
  experience:'while the beacon charges',world:'a sleepy lighthouse keeper on a floating rock'
 },unresolved:[]};
 assert.deepEqual(f.get().design!.plan,{});
 assert.equal(creationBuildReadiness(f.save(verdict)).ready,true);
 assert.equal(f.get().job,null,'the accepted fixture verdict is not a provider or build claim');
});

test('creation context retains the original idea and older child decisions across helper-heavy turns',()=>{
 const f=fixture('I balance a lighthouse keeper while the beacon charges.');
 const own=[];
 for(let i=0;i<7;i++){
  f.notebook.message(f.get().id,'player1','helper','Your earlier choice is saved.');
  f.notebook.message(f.get().id,'player1','helper','What happens in that moment?');
  const text='My next authored detail '+i+'.';own.push(text);f.notebook.message(f.get().id,'player1','child',text);
 }
 const sent=creationConversation(f.get());
 assert.ok(sent.some(message=>message.text===f.get().messages[0].text));
 for(const text of own)assert.ok(sent.some(message=>message.role==='child'&&message.text===text));
 assert.ok(sent.some(message=>message.role==='helper'&&message.text==='What happens in that moment?'));
 assert.ok(sent.length<=16);assert.ok(JSON.stringify(sent).length<=12000);
});

test('bounded creation context preserves exact original and newest words without reviving refused or helper turns',()=>{
 const f=fixture('Original child world. '+ 'o'.repeat(1900));
 for(let i=0;i<25;i++)f.notebook.message(f.get().id,'player1','child',i+' '+ 'x'.repeat(1900));
 const final='Newest correction. '+ 'n'.repeat(1900);f.notebook.message(f.get().id,'player1','child',final);
 const sent=creationConversation(f.get(),9000);
 assert.ok(sent.some(message=>message.text===f.get().messages[0].text));
 assert.ok(sent.some(message=>message.text===final));
 assert.ok(sent.length<=16);assert.ok(JSON.stringify(sent).length<=9000);
 const snapshot=f.get();const first=snapshot.messages[0];
 snapshot.design!.ideas.push({id:'helper-turn:'+first.id,text:'Original child world.',origin:'helper',adopted:true});
 snapshot.messages.push({id:'refused-child',role:'child',text:'Rejected request.',at:new Date().toISOString()},
  {id:'refusal-note',role:'helper',text:'I can help with safe game ideas. Let’s try another idea without sharing private details.',at:new Date().toISOString()});
 const safe=creationConversation(snapshot,9000);
 assert.ok(!safe.some(message=>message.text===first.text||message.text==='Rejected request.'));
});
