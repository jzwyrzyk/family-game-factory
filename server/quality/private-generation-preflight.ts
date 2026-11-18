/**
 * O4: the one private generation preflight.
 *
 * This is NOT another generator, an evaluator, a child-confirmed game design
 * or a paid inference call. It binds O1/O2 to the existing authenticated
 * AgentInput. O3 workability checks stay PENDING until independently executed.
 * The raw idea is still provided separately and unmodified to the model.
 */
import {draftChildIntentContract} from './child-intent';
import {
  chooseGameForm, type GameFormDecision,type TrustedExistingForm,
  type GameInputMode
} from './game-form';
import {isGeneratedGame} from '../agent/generated';
import type {AgentInput} from '../pipeline/types';
import {isGameId,validateConfig} from '../../src/runtime/manifests';

type TrustedBase=AgentInput['baseRevision'];
export interface PrivateGenerationPreflight {
  status:'PROPOSED_NOT_CHILD_CONFIRMED';
  intentVersion:'jems-child-intent-v1';
  sourceSha256:string;
  sourceEvidence:Array<{id:string;facet:string;quote:string;start:number;end:number}>;
  unresolved:string[];
  form:{
    version:GameFormDecision['version'];
    disposition:GameFormDecision['disposition'];
    rendering:GameFormDecision['rendering'];
    simulation:GameFormDecision['simulation'];
    primaryInput:GameFormDecision['primaryInput'];
    additionalInputs:GameFormDecision['additionalInputs'];
    blockers:GameFormDecision['blockers'];
    evidence:GameFormDecision['evidence'];
  };
  workability:{
    status:'NOT_TESTED';
    mandatoryChecks:string[];
  };
  /** Compatibility guidance for the existing v2 agent, not an approval. */
  motion:GameFormDecision['simulation'];
  interaction:GameFormDecision['primaryInput'];
  surface:'2d-canvas'|'3d-requested';
}
export interface PrivateGenerationRoute{
  brief:PrivateGenerationPreflight;
  instructionsMode:'rule-driven'|'physics-2d'|'unresolved';
  priorSourceKind:'v1'|'v2'|'none';
}
const error=(code:string):never=>{throw Error(code);};
const PHYSICS=/\bapi\s*(?:\.\s*physics|\[\s*['"]physics['"]\s*\])/;
function trustedBase(base:TrustedBase):TrustedExistingForm|undefined{
  if(base.id==='new'){
    if(base.game!==undefined||base.config!==undefined||base.sourceGame!==undefined||base.projectId!==undefined)error('GAME_FORM_BASE_UNVERIFIED');
    return undefined;
  }
  if(!/^[\w-]{1,100}$/.test(base.id))error('GAME_FORM_BASE_UNVERIFIED');
  if(base.game){
    if(isGeneratedGame(base.game)){
      if(typeof base.game.source!=='string')error('GAME_FORM_BASE_UNVERIFIED');
      return {revisionId:base.id,simulation:base.game.kind==='generated-module-v2'&&PHYSICS.test(base.game.source)?'physics-2d':'rule-driven'};
    }
    if(base.game.kind==='star-catcher-v1')return {revisionId:base.id,simulation:'rule-driven'};
    error('GAME_FORM_BASE_UNVERIFIED');
  }
  if(!base.sourceGame||!isGameId(base.sourceGame)||!base.config)error('GAME_FORM_BASE_UNVERIFIED');
  const config=validateConfig(base.sourceGame,base.config);
  // Only the native hill and the quality-v1 gum workshop have existing
  // rigid-body mechanics. Legacy v0 gum and other games keep their form.
  const physical=base.sourceGame==='hill'||base.sourceGame==='gum'&&config.qualityVersion===1;
  return {revisionId:base.id,simulation:physical?'physics-2d':'rule-driven'};
}
const HARD_BLOCKS=new Set([
 'physics-conflict','saved-revision-not-inspected',
 'saved-physics-removal-requires-review','saved-mechanics-migration-requires-review',
 'unclear-revision-change','dimension-conflict'
]);
/**
 * All information comes from the already-authorized, private AgentInput.
 * Do not call this with browser-provided base metadata.
 */
export function privateGenerationPreflight(input:AgentInput):PrivateGenerationRoute {
  if(typeof input.childIntent!=='string')error('GAME_FORM_INPUT_INVALID');
  // AgentInput's base revision is server-sourced in BOTH JobService and the
  // isolated Actions coordinator. Never infer a saved engine from an ID alone.
  const verified=trustedBase(input.baseRevision);
  const intent=draftChildIntentContract(input.childIntent,{
    projectId:input.baseRevision.id==='new'?null:input.baseRevision.projectId??null,
    baseRevisionId:input.baseRevision.id==='new'?null:input.baseRevision.id
  });
  const form=chooseGameForm(intent,verified);
  if(form.disposition==='unsupported')error('GAME_FORM_UNSUPPORTED');
  if(form.blockers.some(b=>HARD_BLOCKS.has(b)))error('GAME_FORM_REVIEW_REQUIRED');
  const brief:PrivateGenerationPreflight={
    status:'PROPOSED_NOT_CHILD_CONFIRMED',
    intentVersion:intent.version,sourceSha256:intent.source.sha256,
    sourceEvidence:intent.facts.map(f=>({
      id:f.id,facet:f.facet,quote:f.evidence.quote,
      start:f.evidence.start,end:f.evidence.end
    })),
    unresolved:intent.unknowns.map(u=>u.code),
    form:{
      version:form.version,disposition:form.disposition,
      rendering:form.rendering,simulation:form.simulation,
      primaryInput:form.primaryInput,additionalInputs:[...form.additionalInputs],
      blockers:[...form.blockers],
      evidence:form.evidence.map(e=>({
        signal:e.signal,source:{...e.source},factIds:[...e.factIds]
      }))
    },
    workability:{status:'NOT_TESTED',mandatoryChecks:[...form.pendingChecks]},
    motion:form.simulation,
    interaction:form.primaryInput,
    surface:form.rendering==='2d-canvas'?'2d-canvas':'3d-requested'
  };
  const instructionsMode=form.simulation==='unresolved'?'unresolved':
    form.simulation==='physics-2d'?'physics-2d':'rule-driven';
  return {
    brief,instructionsMode,
    priorSourceKind:isGeneratedGame(input.baseRevision.game)?
      input.baseRevision.game.kind==='generated-module-v1'?'v1':'v2':'none'
  };
}
