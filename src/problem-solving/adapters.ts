/** Source facts only. Subject correctness and a working game are not general reasoning scores. */
import { PROBLEM_SOLVING_EPISODE_SCHEMA, type ProblemSolvingEpisode, type ProblemSolvingObservation, type ProblemSolvingSkill } from './model';
import type { SourceEvidenceSignal } from './signals';

// Bounded stable local keys. These are deduplication keys, never authentication.
export function sourceEvidenceId(prefix: string, value: string): string {
  let a = 2166136261, b = 5381;
  for (let i = 0; i < value.length; i++) { a = Math.imul(a ^ value.charCodeAt(i), 16777619); b = Math.imul(b, 33) ^ value.charCodeAt(i); }
  return `${prefix}:${(a >>> 0).toString(16)}:${(b >>> 0).toString(16)}`;
}
const iso = (at: number | string) => new Date(at).toISOString();
function fact(skill: ProblemSolvingSkill, at: string, ref: string, authorship: ProblemSolvingObservation['authorship'] = 'unknown'): ProblemSolvingObservation {
  return {id: sourceEvidenceId('fact', `${skill}:${ref}`), skill, outcome:'unobserved', authorship,
    support:'unknown', elicitation:'unknown', observedAt:at, evidenceRef:ref.slice(0,240),
    note:'A source activity was recorded. The quality of this reasoning has not been assessed.'};
}
function contextual(owner: string, source: ProblemSolvingEpisode['source'], key: string, session: string, family: string, label: string,
  startedAt: string, completedAt: string, context: string, observations: ProblemSolvingObservation[] = []): ProblemSolvingEpisode {
  return {schema:PROBLEM_SOLVING_EPISODE_SCHEMA,id:sourceEvidenceId(source,key),owner,
    sessionId:session,source,kind:'context-only',
    task:{id:sourceEvidenceId('source',key),family,version:'source-adapter-v1',label,exposure:'unknown',firstAttempt:false},
    startedAt,completedAt,status:'completed',observations,context};
}

/** No transcript analysis, retroactive backfill, or claimed independent assessment. */
export function adaptSourceEvidence(signal: SourceEvidenceSignal): ProblemSolvingEpisode[] {
  if(signal.kind==='clear-studio'||signal.kind==='clear-creation')return [];
  if(signal.kind==='math'||signal.kind==='language'){
    const a=signal.attempt;if(a.outcome==='open')return [];
    const ended=signal.kind==='math'?signal.attempt.completedAt:signal.attempt.finishedAt;
    if(ended===undefined)return [];
    const hints=signal.kind==='math'?signal.attempt.hintLevel:signal.attempt.hintDepth;
    const e=contextual(signal.owner,signal.kind,a.id,sourceEvidenceId('session',a.context.sessionId||a.id),
      `${signal.kind}-question`,signal.kind==='math'?'Math question':'English activity',iso(a.startedAt),iso(ended),
      `Source outcome: ${a.outcome}. Responses: ${a.answers.length}. Content-hint depth recorded: ${hints}. Subject results remain in the subject report. This question did not measure general problem solving.`);
    if(a.outcome==='interrupted'||a.outcome==='skipped')e.status='interrupted';
    return [e];
  }
  if(signal.kind==='creation'){
    const {attempt:a,result:r}=signal,at=iso(a.checkedAt);
    const e=contextual(signal.owner,'creation',`${a.projectId}:${a.revisionId}:${a.challengeId}`,a.projectId,
      'scene-goal-check','Saved scene check',at,at,
      `Scene goal ${a.challengeId}: ${r.status}. Checks: ${r.checks.map(c=>`${c.id}=${c.passed?'matched':'not matched'}`).join(', ')}. Hint opened in this scene: ${a.hintUsed?'yes':'not recorded'}. Blocks may be starter, child-created, or assisted; this is a scene result, not a reasoning assessment.`.slice(0,1200),
      [fact('plan_test',at,`creation:${a.projectId}/${a.revisionId}/${a.challengeId}`)]);
    if(r.status==='invalid')e.status='technical-invalid';
    return [e];
  }
  const {before,after}=signal;
  if(before.id!==after.id||before.owner!==after.owner)return [];
  const at=iso(after.updated),records:ProblemSolvingEpisode[]=[];
  const add=(key:string,label:string,context:string,skill:ProblemSolvingSkill,origin:'learner'|'helper'|'unknown',ref:string)=>{
    records.push(contextual(after.owner,'studio',`${after.id}:${key}`,after.id,'game-design',label,at,at,context,[fact(skill,at,ref,origin)]));
  };
  const oldExperiments=new Set(before.experiments?.map(e=>e.id));
  for(const e of after.experiments??[])if(!oldExperiments.has(e.id)){
    add(`experiment:${e.id}`,'Game-design experiment',
      `A ${e.depth} experiment was saved. Recorded idea origin: ${e.origin}. Prediction present: ${!!e.prediction.trim()}. Parent versions: ${e.parents.length}. A saved or generated version does not establish a useful test, correct prediction, or independent reasoning.`,
      'plan_test',e.origin==='child'?'learner':'helper',`studio:${after.id}/experiment:${e.id}`);
  }
  const oldObservations=new Set(before.design?.observations.map(o=>o.id));
  for(const o of after.design?.observations??[])if(o.source==='child'&&!oldObservations.has(o.id)){
    add(`observation:${o.id}`,'Game-design observation',
      `A child observation was saved${o.experimentId?' and linked to an experiment':''}. Its content and accuracy have not been scored.`,
      'interpret_evidence','learner',`studio:${after.id}/observation:${o.id}`);
  }
  const goal=after.design?.plan.goal,previousGoal=before.design?.plan.goal;
  if(goal?.value.trim()&&JSON.stringify(goal)!==JSON.stringify(previousGoal)){
    add(`goal:${sourceEvidenceId('version',JSON.stringify(goal))}`,'Game-design goal',
      `A goal was recorded. Recorded origin: ${goal.origin}; accepted: ${goal.accepted}; delegated: ${goal.delegated}. Recording a goal does not establish that the problem was well defined.`,
      'define_problem',goal.delegated?'helper':goal.origin==='child'?'learner':'helper',`studio:${after.id}/plan:goal`);
  }
  return records;
}
