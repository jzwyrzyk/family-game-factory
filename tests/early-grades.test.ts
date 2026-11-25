import assert from 'node:assert/strict';
import test from 'node:test';
import {GRADES, gradeLabel, withinGrade, parseGradeOption, isGrade} from '../src/learning/grades';
import {beginAttempt, profileGrade, submitAnswer} from '../src/learning/engine';
import {generateItem} from '../src/learning/content';
import {beginLanguageAttempt} from '../src/language/engine';
import {generateLanguageItem} from '../src/language/content';
test('six explicit grades retain wire values and reject coercion',()=>{
  for(const [index,grade] of GRADES.entries()){
    assert.equal(parseGradeOption(String(grade)),grade);
    assert.equal(profileGrade({grade,age:18,skills:{}}),grade);
    for(const [otherIndex,other] of GRADES.entries())assert.equal(withinGrade(other,grade),otherIndex<=index);
  }
  assert.deepEqual(GRADES.map(gradeLabel),['Pre-K','Kindergarten','Grade 1','Grade 2','Grade 3','Grade 4']);
  for(const value of ['',null,undefined,false,'0',5,-2])assert.equal(isGrade(value),false);
  assert.equal(profileGrade({age:4,skills:{}}),1);
});
test('a lower ceiling blocks new attempts and responses to restored open work',()=>{
 const p={grade:4 as typeof GRADES[number],skills:{}};
 const item=generateItem('g4-decimal');
 const opened=beginAttempt(p,item);p.grade=0;
 assert.equal(submitAnswer(p,opened.id,String(item.answer)).valid,false);
 assert.equal(opened.answers.length,0);
 assert.throws(()=>beginAttempt(p,item));
 assert.throws(()=>beginLanguageAttempt(p,generateLanguageItem('g1-cvc-patterns')));
});

import {EARLY_MATH,earlyMathTopic} from '../src/learning/early/math';
import {EARLY_LANGUAGE,EARLY_LANGUAGE_BANK} from '../src/language/early';
import {evaluateAnswer} from '../src/learning/content';
import {selectItem} from '../src/learning/engine';
import {selectLanguageItem} from '../src/language/engine';
test('deterministic early items, independently calculated quantities, persisted integrity and distractors',()=>{
 for(const skill of EARLY_MATH)for(let i=0;i<60;i++){
  const item=generateItem(skill.id,{tier:i%3,random:()=>i/61});
  const {prompt,n}=item.parameters;
  let expected=String(n);
  const topic=earlyMathTopic(skill.id);
  if(topic==='count'||topic==='equal')expected=String(prompt).slice(6);
  if(['join','remove','missing'].includes(topic)){
   const [,total,part]=String(prompt).split('-').map(Number);expected=String(topic==='join'?total:total-part);
  }
  if(['small','count','numeral','build','touch','equal','join','remove','missing','teen'].includes(topic))assert.equal(item.answer,expected);
  assert.equal(item.choices!.filter(x=>x.value===item.answer).length,1);
  assert.equal(new Set(item.choices!.map(x=>x.value)).size,item.choices!.length);
  const p={grade:skill.grade,skills:{}};
  beginAttempt(p,structuredClone(item));
  for(const c of item.choices!)assert.equal(evaluateAnswer(item,c.value).correct,c.value===item.answer);
  assert.throws(()=>beginAttempt(p,{...item,answer:'forged'}));
 }
});
test('early learning selection respects stale focus and stretch in both subjects',()=>{
 for(const grade of [-1,0] as const){
  const p={grade,skills:{},intensity:'stretch',skillFocus:['g4-decimal'],factTargets:['mul:8x7'],languageFocus:['g4-theme']};
  for(let i=0;i<120;i++){assert.ok(withinGrade(selectItem(p).grade,grade));assert.ok(withinGrade(selectLanguageItem(p).grade,grade));}
 }
});
test('every early literacy skill has several local examples at every tier, unique options and silent print stimuli',()=>{
 for(const skill of EARLY_LANGUAGE)for(const t of [0,1,2]){
  const items=EARLY_LANGUAGE_BANK[skill.id].items.filter(i=>i.t===t);
  assert.ok(new Set(items.map(i=>i.q+'|'+i.a+'|'+i.stimulus)).size>=3,skill.id);
  for(const i of items){
   if(i.kind==='picture-order'){assert.equal(skill.domain,'listening');assert.ok(i.a.split(' ').length>=2);}
   else assert.equal(new Set([i.a,...i.d!]).size,4);
   if(skill.domain==='early-reading'){assert.ok(i.stimulus);assert.ok(!i.q.split(/\W+/).includes(i.a));}
  }
 }
});
