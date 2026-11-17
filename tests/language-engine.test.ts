import test from 'node:test';
import assert from 'node:assert/strict';
import {generateLanguageItem} from '../src/language/content';
import {beginLanguageAttempt,ensureLanguage,finishLanguageAttempt,languageEvidenceState,
  recordLanguageReadAloud,reportLanguage,saveCreativeDraft,selectLanguageItem,submitLanguageAnswer,
  useLanguageHint,validateLanguage} from '../src/language/engine';
import type {LanguageProfile,LanguageItem} from '../src/language/types';

const DAY=86_400_000;
const profile=(grade:1|2|3|4=4):LanguageProfile=>({
  id:'child',grade,age:9,skills:{},intensity:'balanced',learningSubject:'language',hints:false,
});
const item=(id='g3-main-idea',tier=0)=>generateLanguageItem(id,{tier,random:()=>0.1});
function correct(p:LanguageProfile,chosen:LanguageItem,now:number){
  const a=beginLanguageAttempt(p,chosen,{now,gameId:'dragon',versionId:'v3',projectId:'test'});
  assert.equal(submitLanguageAnswer(p,a.id,chosen.answer!,now+100).correct,true);
  finishLanguageAttempt(p,a.id,'completed',now+200);
  return a;
}
test('first response is bounded evidence, never instant reading mastery',()=>{
  const p=profile(),chosen=item();correct(p,chosen,0);
  const report=reportLanguage(p,0);
  assert.equal(report.totals.independent,1);
  assert.equal(report.skills.find(s=>s.id===chosen.skillId)?.state,'discovering');
  assert.equal(report.recentAttempts[0].context.gameId,'dragon');
  assert.equal(report.recentAttempts[0].context.versionId,'v3');
});
test('wrong and helped responses are saved but cannot become independent proficiency',()=>{
  const p=profile(),chosen=item(),a=beginLanguageAttempt(p,chosen,{now:1000});
  assert.equal(submitLanguageAnswer(p,a.id,'',1200).valid,false);
  assert.equal(submitLanguageAnswer(p,a.id,chosen.choices!.find(c=>c.value!==chosen.answer)!.value,1500).correct,false);
  assert.equal(useLanguageHint(p,a.id,1,1600).hintDepth,1);
  assert.equal(submitLanguageAnswer(p,a.id,chosen.answer!,1800).correct,true);
  const finished=finishLanguageAttempt(p,a.id,'completed',1900);
  assert.equal(finished.independent,false);
  assert.equal(ensureLanguage(p).skills[chosen.skillId].incorrectResponses,1);
  assert.equal(ensureLanguage(p).skills[chosen.skillId].assisted,1);
  assert.equal(ensureLanguage(p).skills[chosen.skillId].helpRequests,1);
  assert.equal(finishLanguageAttempt(p,a.id,'completed'),finished,'completion is idempotent');
});
test('reading assistance is distinct evidence even after an otherwise correct response',()=>{
  const p=profile(),chosen=item(),a=beginLanguageAttempt(p,chosen,{now:1000});
  recordLanguageReadAloud(p,a.id,1100);
  assert.equal(submitLanguageAnswer(p,a.id,chosen.answer!,1200).correct,true);
  assert.equal(finishLanguageAttempt(p,a.id,'completed',1300).independent,false);
  assert.equal(reportLanguage(p).skills.find(s=>s.id===chosen.skillId)?.readSupport,1);
});
test('only due, at least 24-hour-separated retrieval advances long-term intervals',()=>{
  const p=profile(),chosen=item(),now=Date.UTC(2026,10,15);
  correct(p,chosen,now);
  let summary=ensureLanguage(p).skills[chosen.skillId];
  assert.equal(summary.reviewStage,0);
  assert.equal(summary.dueAt,now+200+DAY);
  correct(p,chosen,now+DAY/2);
  summary=ensureLanguage(p).skills[chosen.skillId];
  assert.equal(summary.reviewStage,0);
  assert.equal(summary.dueAt,now+200+DAY);
  correct(p,chosen,now+DAY+1000);
  summary=ensureLanguage(p).skills[chosen.skillId];
  assert.equal(summary.reviewStage,1);
  assert.equal(summary.delayedSuccesses,1);
  assert.equal(languageEvidenceState(summary),'discovering','one repeated passage is not varied retained reading');
});
test('unscored writing preserves a draft without creating fictional correctness',()=>{
  const p=profile(),chosen=item('g4-revision'),a=beginLanguageAttempt(p,chosen,{now:1000});
  assert.equal(chosen.kind,'creative');
  assert.equal(saveCreativeDraft(p,a.id,'',1200).valid,false);
  assert.equal(saveCreativeDraft(p,a.id,'My moon dragon made a rocket from leaves.',1300).valid,true);
  assert.equal(ensureLanguage(p).attempts[0].draft,'My moon dragon made a rocket from leaves.');
  assert.equal(reportLanguage(p).totals.explored,1);
  assert.equal(reportLanguage(p).totals.independent,0);
  assert.equal(ensureLanguage(p).attempts[0].outcome,'explored');
});
test('different children have independent skills and question histories',()=>{
  const a=profile(),b=profile(),chosen=item();correct(a,chosen,1000);
  assert.equal(reportLanguage(a).totals.independent,1);
  assert.equal(reportLanguage(b).totals.independent,0);
  assert.equal(validateLanguage(JSON.parse(JSON.stringify(a.language))),true);
});
test('the grade scope, targets and prerequisites constrain adaptive selection',()=>{
  const g1=profile(1);
  for(let i=0;i<50;i++)assert.ok(selectLanguageItem(g1,{random:()=>((i*0.13)%1)}).grade<=1);
  const g4=profile(4);g4.languageFocus=['g4-roots'];
  assert.equal(selectLanguageItem(g4,{random:()=>0}).skillId,'g4-roots');
  const g3=profile(3);g3.languageFocus=['g3-prefixes'];
  const target=item('g3-prefixes');
  for(let j=0;j<2;j++){
    const a=beginLanguageAttempt(g3,target,{now:1000+j*1000});
    assert.equal(submitLanguageAnswer(g3,a.id,target.choices!.find(c=>c.value!==target.answer)!.value,1100+j*1000).correct,false);
    finishLanguageAttempt(g3,a.id,'shown',1200+j*1000);
  }
  assert.equal(selectLanguageItem(g3,{random:()=>0,now:4000}).skillId,'g2-prefix-un-re');
});
test('future and tampered learning history cannot be accepted or overwritten',()=>{
  const p=profile(),chosen=item();correct(p,chosen,1000);
  const state=JSON.parse(JSON.stringify(p.language));
  assert.equal(validateLanguage(state),true);
  const future={...state,version:999};
  assert.equal(validateLanguage(future),false);
  const corrupt=structuredClone(state);
  corrupt.attempts[0].item.answer='forged answer';
  assert.equal(validateLanguage(corrupt),false);
  const imported=profile();imported.language=corrupt;
  assert.throws(()=>ensureLanguage(imported),/Unsupported language learning history/);
  assert.deepEqual(imported.language,corrupt,'do not erase unsupported data');
});
test('wrong choice is not credited, and interruption preserves a partial attempt',()=>{
  const p=profile(),chosen=item(),a=beginLanguageAttempt(p,chosen,{now:1000});
  const wrong=chosen.choices!.find(c=>c.value!==chosen.answer)!;
  assert.equal(submitLanguageAnswer(p,a.id,wrong.value,1100).valid,true);
  finishLanguageAttempt(p,a.id,'interrupted',1200);
  assert.equal(ensureLanguage(p).attempts[0].answers.length,1);
  assert.equal(ensureLanguage(p).totals.interrupted,1);
  assert.equal(ensureLanguage(p).totals.independent,0);
});

test('repeated independent retrieval on varied authored passages reaches conservative across-day states',()=>{
  const p=profile(4),skill='g3-main-idea',base=Date.UTC(2026,9,1,9);
  const first=generateLanguageItem(skill,{tier:0,random:()=>0});
  const second=generateLanguageItem(skill,{tier:0,random:()=>.99});
  const third=generateLanguageItem(skill,{tier:1,random:()=>0});
  const fourth=generateLanguageItem(skill,{tier:2,random:()=>0});
  assert.equal(new Set([first.id,second.id,third.id,fourth.id]).size,4);
  correct(p,first,base);
  correct(p,second,base+DAY+1000);
  correct(p,third,base+3*DAY+1000);
  correct(p,fourth,base+4*DAY+1000);
  assert.equal(reportLanguage(p,base+5*DAY).skills.find(s=>s.id===skill)?.state,'independent');
  correct(p,first,base+7*DAY+1000);
  assert.equal(reportLanguage(p,base+8*DAY).skills.find(s=>s.id===skill)?.state,'remembered-later');
});
test('Gentle can reach enough task variety without jumping to stretch tier',()=>{
  const p=profile(3);p.intensity='gentle';p.languageFocus=['g3-main-idea'];
  const base=Date.UTC(2026,9,1,9);
  const first=generateLanguageItem('g3-main-idea',{tier:0,random:()=>0});
  const second=generateLanguageItem('g3-main-idea',{tier:0,random:()=>.99});
  correct(p,first,base);
  correct(p,second,base+500);
  correct(p,first,base+1000);
  const next=selectLanguageItem(p,{now:base+1500,random:()=>0});
  assert.equal(next.tier,1,'after varied success, Gentle exposes a third task without stretch tier');
});
