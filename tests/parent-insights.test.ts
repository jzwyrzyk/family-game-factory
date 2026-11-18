import assert from 'node:assert/strict';
import {summarizeParentPractice} from '../src/learning/insights';
const day=86_400_000;
const now=new Date('2026-11-17T12:00:00').getTime();
const report={totals:{presentations:21,independent:10,assisted:4},skills:[
 {id:'g1-add',title:'Add within 10',grade:1,state:'learning-with-support',presentations:14,independent:10,assisted:4,distinctDays:2,dueAt:null,reviewDue:false}
]};
const make=(days:number,independent:boolean,outcome='completed')=>({startedAt:now-days*day,completedAt:now-days*day,outcome,independent});
const attempts=[
 ...Array.from({length:5},(_,i)=>make(8+i,false)),
 ...Array.from({length:5},(_,i)=>make(i,true)),
 make(2,false,'interrupted'),make(16,true),make(0,false,'explored')
];
const result=summarizeParentPractice(report,attempts,now);
assert.equal(result.completed,14);
assert.equal(result.previous.help,5);
assert.equal(result.current.solo,5);
assert.equal(result.current.help,0);
assert.equal(result.delta,100);
assert.equal(result.strengths,0);
assert.equal(result.days.reduce((sum,d)=>sum+d.solo+d.help,0),10);
const thin=summarizeParentPractice(report,[make(0,true)],now);
assert.equal(thin.enough,false);
assert.equal(thin.delta,null);
assert.equal(thin.current.solo,1);
console.log('PASS parent insights: honest weekly windows, insufficient evidence, separate lifetime totals and completed-only charts');
