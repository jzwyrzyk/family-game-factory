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
