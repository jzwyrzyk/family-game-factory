import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {COACH_RUBRIC,evaluateCoachReview} from '../tools/coach-acceptance';
const scenarios=JSON.parse(readFileSync('docs/design-coach/evaluation-cases.json','utf8')).cases as {id:string}[];
assert.equal(scenarios.length,20);
const reviews=scenarios.map(x=>({id:x.id,
 scores:Object.fromEntries(COACH_RUBRIC.map(k=>[k,2])) as any,blockers:[] as string[]}));
const accepted=evaluateCoachReview(scenarios.map(c=>c.id),reviews);
assert.equal(accepted.cases,20);assert.equal(accepted.releaseEligible,true);
assert.deepEqual(accepted.blocked,[]);
assert.throws(()=>evaluateCoachReview(scenarios.map(c=>c.id),reviews.slice(1)),/ALL_SCENARIOS_REQUIRED/);
const poor=structuredClone(reviews);poor[0].scores.evidenceHonesty=0;
const blocked=evaluateCoachReview(scenarios.map(c=>c.id),poor);
assert.equal(blocked.releaseEligible,false);assert.deepEqual(blocked.blocked,[scenarios[0].id]);
const explicit=structuredClone(reviews);explicit[4].blockers.push('unsafe disclosure');
assert.deepEqual(evaluateCoachReview(scenarios.map(c=>c.id),explicit).blocked,[scenarios[4].id]);
const duplicate=structuredClone(reviews);duplicate[1].id=duplicate[0].id;
assert.throws(()=>evaluateCoachReview(scenarios.map(c=>c.id),duplicate),/INVALID_SCENARIO_REVIEW/);
console.log('PASS 20-case offline human-review rubric, missing evidence and hard blockers; no inference attempted');
