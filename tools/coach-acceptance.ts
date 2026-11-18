/** Offline-only acceptance rubric for the 20 owner-approved synthetic scenarios.
 * No model API requests, child transcripts, raw audio or credentials are accessed.
 * Human reviewers record results outside the public repo (never commit actual data).
 */
import {readFileSync} from 'node:fs';

export const COACH_RUBRIC=[
 'childOwnership','gameDesignRelevance','appropriateHelp','evidenceHonesty',
 'brevityAndInterruptions','preservationOfAlternatives','usefulNextAction'
] as const;
export type CoachRubricKey=typeof COACH_RUBRIC[number];
export interface CoachCaseReview {
 id:string;
 scores:Record<CoachRubricKey,0|1|2>;
 blockers:string[];
}
export function evaluateCoachReview(expectedIds:readonly string[],reviews:CoachCaseReview[]){
 if(!Array.isArray(reviews)||reviews.length!==expectedIds.length)throw Error('ALL_SCENARIOS_REQUIRED');
 const ids=new Set<string>(),results:{id:string;total:number;blocked:boolean}[]=[];
 for(const review of reviews){
  if(!review||typeof review.id!=='string'||!expectedIds.includes(review.id)||ids.has(review.id))
   throw Error('INVALID_SCENARIO_REVIEW');
  ids.add(review.id);
  if(!review.scores||Object.keys(review.scores).length!==COACH_RUBRIC.length||
   !COACH_RUBRIC.every(key=>[0,1,2].includes(review.scores[key]))||
   !Array.isArray(review.blockers)||!review.blockers.every(s=>typeof s==='string'&&s.length<=200))
   throw Error('INVALID_REVIEW_RUBRIC');
  const total=COACH_RUBRIC.reduce((sum,key)=>sum+review.scores[key],0);
  results.push({id:review.id,total,blocked:review.blockers.length>0||COACH_RUBRIC.some(k=>review.scores[k]===0)});
 }
 if(expectedIds.some(id=>!ids.has(id)))throw Error('ALL_SCENARIOS_REQUIRED');
 return {cases:results.length,blocked:results.filter(x=>x.blocked).map(x=>x.id),
  averageScore:results.reduce((n,x)=>n+x.total,0)/results.length,
  releaseEligible:!results.some(x=>x.blocked)};
}
function main(){
 const args=process.argv.slice(2),caseData=JSON.parse(readFileSync('docs/design-coach/evaluation-cases.json','utf8'));
 const ids:string[]=caseData.cases.map((c:{id:string})=>c.id);
 if(args[0]==='--template'){
  console.log(JSON.stringify({model:'REVIEWER_MUST_FILL',privacyApproval:'NOT_VERIFIED',
   reviews:ids.map(id=>({id,scores:Object.fromEntries(COACH_RUBRIC.map(k=>[k,null])),blockers:[]}))},null,2));
  return;
 }
 if(args[0]!=='--check'||!args[1])throw Error('USAGE: --template or --check PRIVATE_REVIEW_JSON');
 const review=JSON.parse(readFileSync(args[1],'utf8'));
 if(review.privacyApproval!=='VERIFIED'||!review.model||review.model==='REVIEWER_MUST_FILL')throw Error('LIVE_ACTIVATION_EVIDENCE_REQUIRED');
 const verdict=evaluateCoachReview(ids,review.reviews);
 // Output only aggregate scores and scenario IDs, never raw private transcripts.
 console.log(JSON.stringify({scenarioCount:verdict.cases,blockedScenarioIds:verdict.blocked,
  averageRubricScore:verdict.averageScore,eligibleForHumanReleaseReview:verdict.releaseEligible}));
 if(!verdict.releaseEligible)process.exitCode=1;
}
if(process.argv.some(x=>/[/\\]coach-acceptance\.ts$/.test(x)))try{main();}catch(error){
 console.error((error as Error).message);process.exitCode=1;
}
