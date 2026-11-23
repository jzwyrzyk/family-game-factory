/** Offline-only acceptance rubric for synthetic design-coach scenarios.
 * No model API requests, child transcripts, raw audio or credentials are accessed.
 * Human reviewers record results outside the public repo (never commit actual data).
 */
import {readFileSync} from 'node:fs';

export const COACH_RUBRIC=[
 'childOwnership','gameDesignRelevance','appropriateHelp','evidenceHonesty',
 'brevityAndInterruptions','preservationOfAlternatives','usefulNextAction',
 'creativeDiscovery','naturalConversation','childComprehensibility'
] as const;
export type CoachRubricKey=typeof COACH_RUBRIC[number];
export interface CoachCaseReview {
 id:string;
 scores:Record<CoachRubricKey,0|1|2>;
 blockers:string[];
}
/** Narrow counterexamples for reviewers of these particular synthetic prompts.
 * Meaning, variety, attribution and reading level still require human judgment.
 * These checks never run on a child's conversation in the app. */
export function wordingFailures(id:string,replies:readonly string[]):string[] {
 const failures:string[]=[];
 const first=replies[0]||'';
 if(['leaves-open-move','fox-dodge-incomplete','fold-the-shadow'].includes(id)&&/\b(jump|duck)(?:s|ing)?\b/i.test(first))failures.push('supplied a conventional move');
 if(id==='fox-side-view'&&/left[- ]to[- ]right|right[- ]to[- ]left/i.test(first))failures.push('assumed travel direction');
 if(id==='pixel-word'&&/old(?:er)? (?:video )?games|retro games/i.test(first))failures.push('defined pixel art by age');
 if(id==='natural-rhythm'){
  if(replies.length>1&&replies.every(text=>/\p{Extended_Pictographic}/u.test(text)))failures.push('emoji on every turn');
  if(replies.filter(text=>/^yay\b/i.test(text.trim())).length>1)failures.push('repeated praise opening');
  if(replies.at(-1)?.includes('?'))failures.push('question after stop');
 }
 if(id==='stuck-across-turns'&&new Set(replies.map(text=>text.trim().toLowerCase())).size<replies.length)failures.push('repeated support verbatim');
 return failures;
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
interface Scenario {id:string;nextChildTurns?:string[]}
const replyCount=(scenario:Scenario)=>scenario.id==='single-intro'?0:1+(scenario.nextChildTurns?.length||0);

function main(){
 const args=process.argv.slice(2);
 const scenarios:Scenario[]=JSON.parse(readFileSync('docs/design-coach/evaluation-cases.json','utf8')).cases;
 const ids=scenarios.map(item=>item.id);
 if(args[0]==='--template'){
  const reviews=scenarios.map(item=>({id:item.id,replies:Array(replyCount(item)).fill(''),
   scores:Object.fromEntries(COACH_RUBRIC.map(k=>[k,null])),blockers:[]}));
  console.log(JSON.stringify({model:'REVIEWER_MUST_FILL',privacyApproval:'NOT_VERIFIED',reviews},null,2));
  return;
 }
 if(args[0]!=='--check'||!args[1])throw Error('USAGE: --template or --check PRIVATE_REVIEW_JSON');
 const review=JSON.parse(readFileSync(args[1],'utf8'));
 if(review.privacyApproval!=='VERIFIED'||!review.model||review.model==='REVIEWER_MUST_FILL')throw Error('LIVE_ACTIVATION_EVIDENCE_REQUIRED');
 for(const item of scenarios){
  const row=review.reviews?.find((entry:CoachCaseReview)=>entry.id===item.id);
  if(!row)continue;
  if(!Array.isArray(row.replies)||row.replies.length!==replyCount(item)||
   !row.replies.every((text:unknown)=>typeof text==='string'&&text.trim()))throw Error('OBSERVED_REPLIES_REQUIRED');
  if(!Array.isArray(row.blockers))throw Error('INVALID_REVIEW_RUBRIC');
  row.blockers.push(...wordingFailures(item.id,row.replies));
 }
 const verdict=evaluateCoachReview(ids,review.reviews);
 // Output only aggregate scores and scenario IDs, never raw private transcripts.
 console.log(JSON.stringify({scenarioCount:verdict.cases,blockedScenarioIds:verdict.blocked,
  averageRubricScore:verdict.averageScore,eligibleForHumanReleaseReview:verdict.releaseEligible}));
 if(!verdict.releaseEligible)process.exitCode=1;
}
if(process.argv.some(x=>/[/\\]coach-acceptance\.ts$/.test(x)))try{main();}catch(error){
 console.error((error as Error).message);process.exitCode=1;
}
