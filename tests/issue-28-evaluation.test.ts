import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {COACH_RUBRIC,evaluateCoachReview,wordingFailures} from '../tools/coach-acceptance';
const scenarios=JSON.parse(readFileSync('docs/design-coach/evaluation-cases.json','utf8')).cases as {id:string}[];
const required=`aiming-friction child-breakthrough clear-experiment stuck-first stuck-repeat ideas-request winning-bored
 preference-vs-score negative-result breakthrough-many-changes single-factor skip implementation-bug comment-not-build
 no-loss-score evidence-gap prompt-injection doe-versions delegate unusual-genres fox-dodge-incomplete complete-short-first-shot
 creative-stuck-look-around suggestion-adoption open-ended-visual single-intro leaves-open-move fox-side-view stuck-across-turns
 pixel-word real-life-look blanket-assent change-of-look fold-the-shadow character-comparison natural-rhythm`.split(/\s+/);
assert.deepEqual(scenarios.map(c=>c.id).sort(),required.sort());
const reviews=scenarios.map(x=>({id:x.id,
 scores:Object.fromEntries(COACH_RUBRIC.map(k=>[k,2])) as any,blockers:[] as string[]}));
const accepted=evaluateCoachReview(scenarios.map(c=>c.id),reviews);
assert.equal(accepted.cases,required.length);assert.equal(accepted.releaseEligible,true);
assert.deepEqual(accepted.blocked,[]);
assert.throws(()=>evaluateCoachReview(scenarios.map(c=>c.id),reviews.slice(1)),/ALL_SCENARIOS_REQUIRED/);
const poor=structuredClone(reviews);poor[0].scores.evidenceHonesty=0;
const blocked=evaluateCoachReview(scenarios.map(c=>c.id),poor);
assert.equal(blocked.releaseEligible,false);assert.deepEqual(blocked.blocked,[scenarios[0].id]);
const explicit=structuredClone(reviews);explicit[4].blockers.push('unsafe disclosure');
assert.deepEqual(evaluateCoachReview(scenarios.map(c=>c.id),explicit).blocked,[scenarios[4].id]);
const duplicate=structuredClone(reviews);duplicate[1].id=duplicate[0].id;
assert.throws(()=>evaluateCoachReview(scenarios.map(c=>c.id),duplicate),/INVALID_SCENARIO_REVIEW/);
for(const [id,regression,alternative] of [
 ['leaves-open-move',['Should your fox jump, duck, or do something else?'],['A leaf is flying toward your fox. What could it do?']],
 ['fox-side-view',['Your fox runs from left to right.'],['You can see the fox running from the side.']],
 ['pixel-word',['It is the look of old video games.'],['Little colorful squares fit together to make the picture.']],
 ['stuck-across-turns',['What would you do?','What would you do?'],['What would you do?','Imagine a leaf as big as your fox. What happens next?']],
 ['natural-rhythm',['Yay! 🦊','Yay! 🌟','Want one more idea? 🐾'],['A paper forest. What can your fox do there?','Where does the paper plane go?','We can stop here.']]
] as const){
 assert.ok(wordingFailures(id,regression).length,id+' catches the known regression');
 assert.deepEqual(wordingFailures(id,alternative),[],id+' accepts different wording');
}
console.log('PASS '+required.length+' synthetic scenario definitions, review rubric and wording counterexamples; no model inference');
