/**
 * O2: Game-form decision from the exact, validated O1 child-intent contract.
 * Advisory only: does not run the generator, migrate an existing revision,
 * approve a child choice, or claim any game has passed an integration test.
 * Workability and source fidelity precede optional first-shot delight.
 */
import {
  type ChildIntentContract, type IntentSpan, validateChildIntentContract
} from './child-intent';

export const GAME_FORM_VERSION='jems-game-form-v2' as const;
export type GameFormDisposition='candidate'|'review-required'|'unsupported';
export type GameRenderMode='2d-canvas'|'true-3d-required';
export type GameSimulationMode='rule-driven'|'physics-2d'|'unresolved';
export type GameInputMode='drag-and-drop'|'grid-commands'|'driving'|'arcade'|'tap-and-react'|'unresolved';
export type GameFormSignal=
  'explicit-3d'|'3d-looking-art'|'3d-avoided'|'2d-view'|'physics-needed'|'physics-avoided'|
  'physics-ambiguous'|'drag-action'|'grid-action'|'drive-action'|'arcade-action'|'tap-action';
export type GameFormBlocker=
  'true-3d-not-supported'|'dimension-conflict'|'physics-conflict'|
  'physical-mechanics-ambiguous'|'mechanic-not-described'|
  'saved-revision-not-inspected'|'saved-physics-removal-requires-review'|
  'saved-mechanics-migration-requires-review'|'unclear-revision-change';
export interface GameFormEvidence {
  signal:GameFormSignal; source:IntentSpan;
  factIds:string[]; // matches the exact original request, not guessed meaning
}
export interface TrustedExistingForm {
  /** Must be a server-owned and authorization-verified lookup of this revision. */
  revisionId:string; simulation:'rule-driven'|'physics-2d';
  interaction?:GameInputMode;
}
export interface GameFormDecision {
  version:typeof GAME_FORM_VERSION;
  status:'proposed-not-child-confirmed';
  sourceSha256:string; projectId:string|null; baseRevisionId:string|null;
  disposition:GameFormDisposition;
  rendering:GameRenderMode; simulation:GameSimulationMode;
  primaryInput:GameInputMode; additionalInputs:GameInputMode[];
  blockers:GameFormBlocker[];
  evidence:GameFormEvidence[];
  reason:string[];
  alternative: 'rule-driven-option'|'physics-option'|'preserve-existing-option'|'not-applicable';
  pendingChecks:readonly string[];
}
const checks=[
  'Actual player input causes the requested visible game-state change.',
  'Every expressly requested mechanic and payoff is demonstrable; no fake win.',
  'A failed action can recover, reset and replay without freezing or losing the saved design.',
  'Real touch and keyboard controls, mobile viewport, and focus/pause are functional.',
  'Required adaptive learning resumes without duplicating events or losing play state.',
  'Saved versions, Keep/Undo and existing builds are preserved; no silent engine migration.',
  'Generated code remains sandboxed and resource-bounded, with no credential exposure.'
] as const;
const ISSUE='GAME_FORM_INVALID_';
const fail=(reason:string):never=>{throw Error(ISSUE+reason);};
const overlap=(a:IntentSpan,b:IntentSpan)=>a.start<b.end && b.start<a.end;
const patterns:readonly [GameFormSignal, readonly RegExp[]][]=[
  ['3d-looking-art', [
    /\b(?:3[\s-]?d|three[- ]dimensional)[- ](?:looking|style|art|graphics|appearance|effect)\b/gi,
    /\b(?:looks?|looking)\s+(?:like\s+)?3[\s-]?d\b/gi,
    /\b(?:faux|fake)\s*3[\s-]?d\b/gi
  ]],
  ['3d-avoided',[
    /\b(?:no|without|avoid|skip) (?:a |any )?(?:free[- ]orbit camera|3d physics)\b/gi,
    /\b(?:no|without|avoid|skip|don't\s+use|do\s+not\s+use|not\s+(?:a|in))\s+(?:(?:a|an|the|any|true|real|full)\s+){0,3}(?:3[\s-]?d|three[- ]dimensional)(?:\s+(?:game|world|movement|navigation))?\b/gi
  ]],
  ['explicit-3d',[
    /\b(?:free[- ]orbit camera|orbit (?:the camera )?freely (?:around|in)|(?:free|unrestricted) flight (?:on|in) (?:all )?three axes|3d physics)\b/gi,
    /\b(?:true|real|full)\s*3[\s-]?d(?:imensional)?\b/gi,
    /\b(?:3[\s-]?d|three[- ]dimensional)\s+(?:game|world|space|camera|environment|movement|navigation|maze)\b/gi,
    /\b(?:fly|move|walk|navigate|travel)\s+(?:freely\s+)?(?:in|through)\s+(?:all\s+)?(?:three|3)\s+(?:dimensions|axes)\b/gi,
    /\b(?:move|fly|walk|navigate)\s+(?:forward|backward)\s+(?:in|through)\s+(?:depth|3d)\b/gi
  ]],
  ['2d-view',[
    /\b(?:2[\s-]?d|two[- ]dimensional|side[- ]view|side[- ]scrolling|top[- ]down|flat\s+view|isometric)\b/gi
  ]],
  ['physics-avoided',[
    /\b(?:no|without|avoid|skip|remove|don'?t\s+use|do\s+not\s+use|not\s+using)\s+(?:(?:the|any|real|realistic|full|heavy|rigid[- ]body)\s+){0,3}physics\b/gi,
    /\b(?:no|without|avoid)\s+(?:real|actual)\s+(?:gravity|collision|suspension)\b/gi
  ]],
  ['physics-needed',[
    /\b(?:real|realistic|actual|working|simulated)\s+(?:rigid[- ]body\s+)?(?:physics|gravity|collisions?|suspension|springs?|inertia|momentum|force|weight)\b/gi,
    /\bphysics\s+(?:engine|simulation|puzzle|game)\b/gi,
    /\b(?:simulate|model)\s+(?:gravity|real\s+collisions?|weight|momentum|inertia|suspension|springs?)\b/gi,
    /\b(?:springs?\s+(?:compress(?:es)?|stretch(?:es)?)|wheels?\s+(?:grip|slip)|joints?\s+(?:snap|break)|gum\s+joints?\s+(?:snap|break))\b/gi,
    /\b(?:collaps(?:e|es|ing)|toppl(?:e|es|ing)|breaks?)\s+(?:under|from|because\s+of)\s+(?:its\s+|the\s+)?(?:weight|gravity|load)\b/gi,
    /\b(?:catapult)\s+(?:trajectory|force|launch\s+angle)\b/gi,
    /\b(?:drive|driving)\s+(?:a\s+)?(?:car|truck|bike)\s+(?:over|across)\s+(?:bumpy|rough|hilly)\s+(?:hills|terrain|ground)\b/gi,
    /\b(?:balance|balancing)\s+(?:a|the)\s+(?:tower|stack|bridge)\b/gi
  ]],
  ['physics-ambiguous',[
    /\b(?:squishy|springy|wobbly|floppy|bouncy|floating|weightless|tumbling|ragdoll|physically|like\s+physics|realistic\s+movement|suspension)\b/gi
  ]],
  ['drag-action',[
    /\b(?:drag(?:ging)?(?:[- ]and[- ]drop)?|drop(?:ping)?|stick(?:ing)?\s+(?:pieces|parts|stickers?)|stickers?|assemble|assembly|decorate|attach|put\s+(?:pieces|parts|socks?)\s+together)\b/gi
  ]],
  ['grid-action',[
    /\b(?:grid|maze|route|path\s+puzzle|step[- ]by[- ]step\s+commands?|arrow\s+commands?|program\s+(?:a|the)\s+robot|code\s+(?:a|the)\s+robot)\b/gi
  ]],
  ['drive-action',[
    /\b(?:drive|driving|race|racing|hill[- ]climb|steer|steering|suspension)\b/gi
  ]],
  ['arcade-action',[
    /\b(?:collect|collects|collecting|catch|catches|eat|eats|eating|jump|jumps|jumping|dodge|shoot|avoid\s+obstacles|fly\s+through)\b/gi
  ]],
  ['tap-action',[
    /\b(?:tap|tapping|click|press\s+(?:(?:a|the)\s+)?(?:button|launch|start|go|play|make\s+it\s+go)|choose|select)\b/gi
  ]]
];
function gather(raw:string,facts:ChildIntentContract['facts']):GameFormEvidence[] {
  const output:GameFormEvidence[]=[];
  const seen=new Set<string>();
  for(const [signal,regexes] of patterns){
    for(const regex of regexes){
      for(const match of raw.matchAll(regex)){
        const start=match.index;
        if(start===undefined)fail('MATCH');
        const end=start+match[0].length;
        const source={start,end,quote:raw.slice(start,end)};
        const key=signal+':'+start+':'+end;
        if(seen.has(key))continue;
        seen.add(key);
        output.push({signal,source,factIds:facts
          .filter(f=>overlap(f.evidence,source)).map(f=>f.id)});
      }
    }
  }
  // Never truncate a physical or 3D constraint and then mistake absence for safety.
  if(output.length>48)fail('EVIDENCE_LIMIT');
  return output.sort((a,b)=>a.source.start-b.source.start||a.source.end-b.source.end||a.signal.localeCompare(b.signal));
}
function dedupe<T extends string>(items:T[]):T[] {return [...new Set(items)];}
const signals=(evidence:readonly GameFormEvidence[],signal:GameFormSignal)=>
  evidence.filter(e=>e.signal===signal);
const inputPriority:readonly [GameFormSignal,GameInputMode][]=[
  ['drag-action','drag-and-drop'],['grid-action','grid-commands'],['drive-action','driving'],
  ['arcade-action','arcade'],['tap-action','tap-and-react']
];

/** An optional verified base is read-only context, NEVER a license to mutate it. */
export function chooseGameForm(
  contractInput:unknown, verifiedBase?:TrustedExistingForm
):GameFormDecision {
  const c=validateChildIntentContract(contractInput);
  if(verifiedBase){
    if(c.revision.baseRevisionId===null||verifiedBase.revisionId!==c.revision.baseRevisionId||
       !['rule-driven','physics-2d'].includes(verifiedBase.simulation)||
       (verifiedBase.interaction!==undefined&&
        !['drag-and-drop','grid-commands','driving','arcade','tap-and-react','unresolved'].includes(verifiedBase.interaction)))
      fail('BASE_REFERENCE_OR_FORM');
  }
  const all=gather(c.source.raw,c.facts);
  const forbidden=signals(all,'physics-avoided');
  const rawPhysics=signals(all,'physics-needed');
  const positive=rawPhysics.filter(e=>!forbidden.some(n=>overlap(n.source,e.source)));
  const ambiguous=signals(all,'physics-ambiguous').filter(e=>!forbidden.some(n=>overlap(n.source,e.source)));
  const styleOnly=signals(all,'3d-looking-art');
  const forbidden3d=signals(all,'3d-avoided');
  const depth=signals(all,'explicit-3d').filter(e=>
    !styleOnly.some(s=>overlap(e.source,s.source))&&
    !forbidden3d.some(s=>overlap(e.source,s.source)));
  const view2d=signals(all,'2d-view');
  const blockers:GameFormBlocker[]=[];
  const reason:string[]=[];
  const evidence=all.filter(e=>
    (e.signal!=='physics-needed'||positive.includes(e))&&
    (e.signal!=='explicit-3d'||depth.includes(e)));
  const asked3d=depth.length>0;
  const conflictDepth=asked3d && (view2d.length>0 || forbidden3d.length>0);
  if(asked3d)blockers.push('true-3d-not-supported');
  if(conflictDepth)blockers.push('dimension-conflict');
  const rendering:GameRenderMode=asked3d?'true-3d-required':'2d-canvas';
  let simulation:GameSimulationMode='rule-driven';
  if(positive.length>0 && forbidden.length>0) {
    simulation='unresolved';
    blockers.push('physics-conflict');
    reason.push('The request both requires a physical effect and forbids physical simulation; do not choose for the child.');
  }else if(positive.length>0){
    simulation='physics-2d';
    reason.push('Physical cause and effect is explicitly requested, so trusted 2D simulation may be necessary.');
  }else if(ambiguous.length>0&&!forbidden.length){
    simulation='unresolved';
    blockers.push('physical-mechanics-ambiguous');
    reason.push('The wording suggests physical behavior but does not establish whether simulation is essential.');
  }else{
    simulation='rule-driven';
    reason.push(forbidden.length
      ? 'The child explicitly excludes physical simulation; begin with direct game-state rules.'
      : 'No essential physical simulation was stated; a rule-driven approach avoids unnecessary engine complexity.');
  }
  if(asked3d)reason.push('The request names genuine 3D depth, which the current 2D generated runtime cannot honestly provide.');
  else reason.push('A 2D canvas is the supported presentation form; visual 3D styling alone does not require a 3D engine.');

  const interactionModes=dedupe(inputPriority.filter(([signal])=>signals(evidence,signal).length>0).map(([,mode])=>mode));
  let primaryInput:GameInputMode=interactionModes[0]??'unresolved';
  if(primaryInput==='unresolved'&&verifiedBase?.interaction)primaryInput=verifiedBase.interaction;
  const additionalInputs=interactionModes.filter(m=>m!==primaryInput);
  if(primaryInput==='unresolved'&&c.revision.baseRevisionId===null)blockers.push('mechanic-not-described');

  if(c.revision.baseRevisionId!==null){
    if(!verifiedBase){
      blockers.push('saved-revision-not-inspected');
      reason.push('Existing game mechanics cannot be inferred from a revision ID. A trusted lookup is required before changes.');
    }else if(verifiedBase.simulation==='physics-2d'&&forbidden.length>0){
      blockers.push('saved-physics-removal-requires-review');
      simulation='unresolved';
      reason.push('Removing physics from an existing physical game is a design migration, not a routine parameter edit.');
    }else if(verifiedBase.simulation==='physics-2d'&&positive.length===0){
      simulation='physics-2d';
      reason.push('Preserve the verified existing physics implementation; do not downgrade a saved game silently.');
    }else if(verifiedBase.simulation==='rule-driven'&&positive.length>0){
      blockers.push('saved-mechanics-migration-requires-review');
      reason.push('Adding physical simulation to a saved scripted game requires an explicit versioned migration.');
    }
    if(c.unknowns.some(u=>u.code==='revision-scope-needs-review'))blockers.push('unclear-revision-change');
  }
  let disposition:GameFormDisposition=asked3d?'unsupported':blockers.length>0?'review-required':'candidate';
  if(asked3d)simulation='unresolved';
  if(c.revision.baseRevisionId===null && primaryInput==='unresolved')reason.push('A game interaction was not stated clearly; do not invent a mechanic.');
  const alternative:GameFormDecision['alternative']=asked3d?'not-applicable':
    c.revision.baseRevisionId!==null?'preserve-existing-option':
      simulation==='physics-2d'?'rule-driven-option':'physics-option';
  return {
    version:GAME_FORM_VERSION,status:'proposed-not-child-confirmed',
    sourceSha256:c.source.sha256,projectId:c.revision.projectId,
    baseRevisionId:c.revision.baseRevisionId,
    disposition,rendering,simulation,primaryInput,additionalInputs,
    blockers:dedupe(blockers),evidence,reason,alternative,pendingChecks:[...checks]
  };
}

/**
 * If used at a boundary, re-evaluate against the authenticated source/context.
 * This catches forged engine approvals, evidence or tampered source digests.
 * It DOES NOT prove the advice is semantically right.
 */
export function validateGameFormDecision(
  input:unknown, contract:unknown, verifiedBase?:TrustedExistingForm
):GameFormDecision {
  const expected=chooseGameForm(contract,verifiedBase);
  if(!input||typeof input!=='object'||Array.isArray(input)||
     JSON.stringify(input)!==JSON.stringify(expected))fail('DECISION_MISMATCH');
  return expected;
}
