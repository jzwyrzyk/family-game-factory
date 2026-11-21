/**
 * O6 — safe, bounded test feedback for the EXISTING generation/repair loop.
 *
 * Never echo raw sandbox/compiler text to an LLM: it can contain source,
 * secrets, child content, arbitrary control sequences or prompt injections.
 * Independent requirement IDs are only accepted if present in the vetted
 * server-side FunctionalGameContract. No additional inference call.
 */
import type {FunctionalGameContract,FunctionalCheckpoint,GameObservation} from './functional-game-contract';
import {QUALITY_AXES,QUALITY_FINDINGS,type QualityAxis,type QualityFinding,type QualityStatus} from './game-quality';

export type RepairCategory=
  'intent-missing'|'input-unresponsive'|'runtime-failed'|
  'replay-failed'|'syntax-invalid'|'limits-failed'|'test-unverified'|
  'presentation-failed'|'gameplay-shallow'|'quality-unverified';
export type RepairCode=
  'GAME_PRESENTATION_FAILED'|'GAMEPLAY_DESIGN_FAILED'|'INTENT_REQUIREMENT_FAILED'|
  'INPUT_PRESENTATION_FAILED'|'GAME_QUALITY_UNVERIFIED'|'INPUT_RESPONSE_FAILED'|
  'GAME_RUNTIME_FAILED'|'GAME_CONTINUITY_FAILED'|'GENERATED_SOURCE_INVALID'|
  'GAME_RESOURCE_LIMIT'|'GAME_TEST_FAILED';
export type QualityRepairAxes=Record<QualityAxis,QualityStatus>;
export interface SafeRepairDiagnostic{
  category:RepairCategory;
  code:RepairCode;
  feedback:string;
  findings?:QualityFinding[];
  qualityAxes?:QualityRepairAxes;
  repairable:true;
}
const SAFE_ID=/^[a-z][a-z0-9-]{0,39}$/;
const MAX_INPUT=2000;
const MAX_FEEDBACK=1500;
const allowedKeys=(id:string)=>SAFE_ID.test(id);
const testCode=(x:string)=>/^[A-Z][A-Z0-9_]{2,79}$/.test(x);

function describe(o:GameObservation):string {
  if(o.kind==='visible')return 'show visible '+o.key;
  if(o.kind==='hidden')return 'keep '+o.key+' hidden';
  if(o.kind==='coordinate')return 'move '+o.key+'.'+o.axis+' '+o.operator+' '+String(o.value);
  if(o.kind==='changed')return 'change '+o.key+'.'+o.axis+' at least '+String(o.minDelta);
  return 'physical '+o.metric+' '+o.operator+' '+String(o.value);
}
function safeRequirements(
 plan:FunctionalGameContract,probeId:string,checkpointIndex:number
):{probe:string;check:FunctionalCheckpoint;requirementIds:string[]}|null {
 const p=plan.probes.find(x=>x.id===probeId);
 if(!p||!allowedKeys(probeId)||!Number.isSafeInteger(checkpointIndex)||
    checkpointIndex<0||checkpointIndex>=p.checkpoints.length)return null;
 if(p.covers.some(x=>!allowedKeys(x)))return null;
 const check=p.checkpoints[checkpointIndex];
 // These data must already have passed the O3 source-contract validator.
 if(check.observations.some(x=>x.kind!=='world'&&!allowedKeys(x.key)))return null;
 return {probe:probeId,check,requirementIds:[...p.covers]};
}
const basic='Preserve the child-authored premise, essential actions, and payoff. Repair real game behavior, not the verdict. Never fake an outcome or change the goal to satisfy a test. Existing math/English, sandbox, touch/pause/replay, and saved-version rules remain mandatory.';

// This optional context comes from a bound review, not a sandbox exception.
// Copy only exact enum data; malformed runtime objects never become feedback.
function qualityContext(value:unknown):{axes:QualityRepairAxes;findings:QualityFinding[]}|undefined {
 const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&
  [Object.prototype,null].includes(Object.getPrototypeOf(v))&&Object.values(Object.getOwnPropertyDescriptors(v)).every(d=>'value'in d);
 if(!record(value)||Object.keys(value).length!==2||!Object.hasOwn(value,'axes')||!Object.hasOwn(value,'findings'))return;
 const axes=value.axes,findings=value.findings;
 if(!record(axes)||Object.keys(axes).length!==QUALITY_AXES.length||QUALITY_AXES.some(axis=>!Object.hasOwn(axes,axis)||!['pass','fail','not-tested'].includes(axes[axis] as string)))return;
 if(!Array.isArray(findings)||findings.length>QUALITY_FINDINGS.length||findings.some(f=>!QUALITY_FINDINGS.includes(f))||new Set(findings).size!==findings.length)return;
 const statuses=QUALITY_AXES.map(axis=>axes[axis]);
 if(statuses.every(s=>s==='pass')||statuses.includes('not-tested')&&!findings.includes('QUALITY_EVIDENCE_INCOMPLETE')||statuses.includes('fail')&&!findings.length)return;
 if(findings.some(f=>{const axis=f.startsWith('VISUAL_')?'visual':f.startsWith('INTENT_')?'intent':f.startsWith('GAMEPLAY_')?'gameplay':f.startsWith('INPUT_')?'input':undefined;return axis&&axes[axis]==='pass';}))return;
 return {axes:{visual:axes.visual as QualityStatus,intent:axes.intent as QualityStatus,gameplay:axes.gameplay as QualityStatus,input:axes.input as QualityStatus},findings:QUALITY_FINDINGS.filter(f=>findings.includes(f))};
}

export function safeRepairDiagnostic(raw:unknown,plan?:FunctionalGameContract,reviewContext?:unknown):SafeRepairDiagnostic {
 const input=typeof raw==='string'?raw.slice(0,MAX_INPUT):'';
 // Only these bounded findings from the independently bound reviewer can
 // become instructions. Never relay its free text, pixels or raw API body.
 const context=qualityContext(reviewContext);
 const findings=context?.findings||QUALITY_FINDINGS.filter(code=>new RegExp('\\b'+code+'\\b').test(input));
 if(findings.length){
  const visual=findings.some(f=>f.startsWith('VISUAL_')),gameplay=findings.some(f=>f.startsWith('GAMEPLAY_')),
   intent=findings.some(f=>f.startsWith('INTENT_')),inputFinding=findings.includes('INPUT_UNCLEAR_OR_INACCESSIBLE');
  // Preserve the existing primary category, but do not discard other axes.
  const category:RepairCategory=visual?'presentation-failed':gameplay?'gameplay-shallow':intent?'intent-missing':inputFinding?'input-unresponsive':'quality-unverified';
  const code:RepairCode=visual?'GAME_PRESENTATION_FAILED':gameplay?'GAMEPLAY_DESIGN_FAILED':intent?'INTENT_REQUIREMENT_FAILED':inputFinding?'INPUT_PRESENTATION_FAILED':'GAME_QUALITY_UNVERIFIED';
  const advice:string[]=[];
  if(visual||context&&context.axes.visual!=='pass')advice.push('Address the identified art, style, layout and readability criteria; show the requested art family clearly on both devices and preserve successful assets.');
  if(gameplay||context&&context.axes.gameplay!=='pass')advice.push('Demonstrate consequential choices and the required variation or recovery through ordinary play; counters and reskins are insufficient.');
  if(intent||context&&context.axes.intent!=='pass')advice.push('Expose the requested essential action and payoff with ordinary input; labels or claimed wins are insufficient.');
  if(inputFinding||context&&context.axes.input!=='pass')advice.push('Make touch and keyboard controls clear, reachable and responsive, with visible effects.');
  if(findings.includes('QUALITY_EVIDENCE_INCOMPLETE'))advice.push('Make every unobserved criterion observable in the ordinary playthrough; never invent test-only callbacks or fake evidence.');
  const prefix=code+';FINDINGS='+findings.join(',')+(context?';AXES='+QUALITY_AXES.map(axis=>axis+':'+context.axes[axis]).join(','):'')+'. ';
  // Older pinned workers forward only the first 1,500 characters. Preserve
  // all enum criteria and the intent/safety rules before trimming fixed advice.
  const detail=advice.join(' ').slice(0,Math.max(0,MAX_FEEDBACK-prefix.length-basic.length-1));
  return {category,code,feedback:prefix+detail+' '+basic,findings,
   ...(context?{qualityAxes:context.axes}:{}),repairable:true};
 }
 if(/\b(?:QUALITY_EVIDENCE_INCOMPLETE|QUALITY_REVIEW_UNGROUNDED|QUALITY_REVIEW_FAILED)\b/.test(input)){
  return {category:'quality-unverified',code:'GAME_QUALITY_UNVERIFIED',feedback:'GAME_QUALITY_UNVERIFIED: The captured ordinary-input path did not establish every required visual, gameplay, intent or input criterion. Improve the game or its ordinary exploration path so the real behavior is observable. Never add a test-only fast win, generated assertions or a privileged callback. Keep unknowns honest. '+basic,repairable:true};
 }
 const match=input.match(/(?:^|[^A-Z])INTENT_PLAYTEST_FAILED:([a-z][a-z0-9-]{0,39}):(\d{1,2})(?!\d)/);
 if(match&&plan){
  const accepted=safeRequirements(plan,match[1],Number(match[2]));
  if(accepted){
   const check=accepted.check;
   const obs=check.observations.map(describe).join('; ').slice(0,360);
   const feedback=
     'INTENT_REQUIREMENT_FAILED;PROBE='+accepted.probe+
     ';CHECKPOINT='+String(Number(match[2]))+
     ';AFTER_ACTION='+String(check.after)+
     ';REQUIREMENTS='+accepted.requirementIds.join(',')+
     ';EXPECTED_OUTCOME='+check.outcome+
     ';EXPECTED_RENDER='+obs+'. '+
     'Independent browser input did not produce this required observable result. '+basic;
   return {category:'intent-missing',code:'INTENT_REQUIREMENT_FAILED',feedback:feedback.slice(0,950),repairable:true};
  }
 }
 // Test errors are an observation, never trusted instructions. Nothing else
 // from the sandbox's raw string is forwarded.
 if(/\b(?:NO_MEANINGFUL_INPUT_EFFECT|NO_VISIBLE_GAMEPLAY_CHANGE|CONTROL_DID_NOT_ADVANCE|INTENT_CONTROL_MISSING)\b/.test(input)){
  return {category:'input-unresponsive',code:'INPUT_RESPONSE_FAILED',
   feedback:'INPUT_RESPONSE_FAILED: Real player input did not produce a visible, meaningful change. Verify pointer/touch/keyboard handling and step-to-draw state updates. '+basic,repairable:true};
 }
 if(/\b(?:RUNTIME_FAILED|INTENT_PREVIEW_RUNTIME_FAILED|NO_STABLE_SIMULATION|WORKER_STAGE_FAILED)\b/.test(input)){
  return {category:'runtime-failed',code:'GAME_RUNTIME_FAILED',
   feedback:'GAME_RUNTIME_FAILED: The isolated preview did not run reliably to an observable checkpoint. Fix runtime exceptions, state transitions, and nonterminating logic. '+basic,repairable:true};
 }
 if(/\b(?:REPLAY_DID_NOT_RESET|PAUSE_DID_NOT_STOP|RESUME_CATCHUP)\b/.test(input)){
  return {category:'replay-failed',code:'GAME_CONTINUITY_FAILED',
   feedback:'GAME_CONTINUITY_FAILED: Restart, pause or resume was inconsistent. Reset state and any physics world deterministically and release held controls on resume. '+basic,repairable:true};
 }
 if(/\b(?:IMPORTS_NOT_ALLOWED|FORBIDDEN_CAPABILITY|UNAPPROVED_GLOBAL|SYNTAX|Unexpected token|Expected|Compile failed|GENERATED_ARTIFACT_REJECTED)\b/i.test(input)){
  return {category:'syntax-invalid',code:'GENERATED_SOURCE_INVALID',
   feedback:'GENERATED_SOURCE_INVALID: Generated source failed compilation or static validation. Check the allowed TypeScript module contract, syntax and approved APIs without importing forbidden code. '+basic,repairable:true};
 }
 if(/\b(?:BODY_LIMIT|FRAME_LIMIT|DRAW_WORK_LIMIT|OUTPUT_TOO_LARGE|WORLD_BOUNDS|RESOURCE_LIMIT|SOURCE_TOO_COMPLEX)\b/.test(input)){
  return {category:'limits-failed',code:'GAME_RESOURCE_LIMIT',
   feedback:'GAME_RESOURCE_LIMIT: The game exceeded a bounded sandbox resource limit. Reduce unnecessary objects, per-frame work or simulation cost without omitting required player actions. '+basic,repairable:true};
 }
 return {category:'test-unverified',code:'GAME_TEST_FAILED',
  feedback:'GAME_TEST_FAILED: An independent test did not verify working gameplay. Inspect the previous source and preserve the original request; fix input, response, outcome or testability without weakening sandbox checks. '+basic,repairable:true};
}

/** Stable, source-free error code for user-visible failure state / audit. */
export function safeFinalRepairCode(raw:unknown,plan?:FunctionalGameContract):string{
 if(typeof raw==='string'&&/\b(?:QUALITY_REVIEW|GAME_PRESENTATION|GAMEPLAY_DESIGN|GAME_QUALITY|VISUAL_|GAMEPLAY_NO_)/.test(raw))return 'REPAIR_EXHAUSTED_QUALITY';
 return plan?'REPAIR_EXHAUSTED_INTENT':'REPAIR_EXHAUSTED';
}
