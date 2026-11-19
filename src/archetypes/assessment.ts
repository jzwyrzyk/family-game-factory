/**
 * Pre-assembly decision boundary. Input MUST be a separately reviewed, structured
 * interpretation of the child's words (future PR #43 adapter), NOT a keyword
 * guesser. This never builds, deploys, charges, or rewrites a playable game.
 */
import type {GameId,Mechanics} from '../runtime/types';
import {archetypeById,mechanicById,type Engine} from './catalog';
import {inspectNative,nativeLinks} from './native';

export type AssemblyRoute='existing-native-interpreter'|'prototype-only'|'generation-required'|'review-required'|'unsupported';
export interface GameProposal {
 /** Preserve original wording. Never replace it with a template-generated storyline. */
 readonly originalIdea:string;
 readonly archetypeId:string;
 /** Essential child-requested behavior IDs, NOT mere aesthetic suggestions. */
 readonly requestedMechanics:readonly string[];
 readonly view?:'2d'|'true-3d';
 readonly simulation?:'rules'|'physics-2d';
 readonly existing?:{readonly game:GameId;readonly config:Mechanics;readonly baseRevisionId:string};
}
export interface AssemblyAssessment {
 readonly contract:'jems-archetype-assessment-v1';
 readonly route:AssemblyRoute;
 readonly archetypeId:string;
 readonly essentialMechanics:readonly string[];
 readonly unverifiedPortableMechanics:readonly string[];
 readonly blockers:readonly string[];
 readonly notes:readonly string[];
 /** A candidate only; never a playable artifact, a paid job or a quality certification. */
 readonly canPlayNow:false;
}
const unique=(values:readonly string[])=>[...new Set(values)];
const validId=(value:unknown)=>typeof value==='string'&&/^[a-z][a-z0-9-]{0,63}$/.test(value);
const done=(route:AssemblyRoute,archetypeId:string,essentials:string[],unverified:string[],blockers:string[],notes:string[]):AssemblyAssessment=>Object.freeze({
 contract:'jems-archetype-assessment-v1' as const,route,archetypeId,
 essentialMechanics:Object.freeze([...essentials]),unverifiedPortableMechanics:Object.freeze([...unverified]),
 blockers:Object.freeze([...blockers]),notes:Object.freeze([...notes]),canPlayNow:false as const
});
export function assessAssembly(proposal:GameProposal):AssemblyAssessment {
 if(!proposal||typeof proposal.originalIdea!=='string'||proposal.originalIdea.trim().length<5||proposal.originalIdea.length>2000||
  !validId(proposal.archetypeId)||!Array.isArray(proposal.requestedMechanics)||
  proposal.requestedMechanics.length>32||proposal.requestedMechanics.some(x=>!validId(x))||
  (proposal.view!==undefined&&!['2d','true-3d'].includes(proposal.view))||
  (proposal.simulation!==undefined&&!['rules','physics-2d'].includes(proposal.simulation)))throw Error('ARCHETYPE_PROPOSAL_INVALID');
 const a=archetypeById.get(proposal.archetypeId);
 if(!a)return done('review-required',proposal.archetypeId,[],[],['UNKNOWN_ARCHETYPE'],['Preserve the original idea and ask the generator to consider a novel game form.']);
 // An archetype's reference mechanics are examples, never mandatory child intent.
 // Inheriting those would force a bow game to reflect spells, among other failures.
 const essential=unique(proposal.requestedMechanics);
 const unknown=essential.filter(id=>!mechanicById.has(id));
 if(unknown.length)return done('review-required',a.id,essential,unknown,['UNKNOWN_MECHANIC'],['Never omit unfamiliar requested actions silently.']);
 const missing=essential.filter(id=>mechanicById.get(id)!.maturity!=='shared-prototype');
 if(proposal.view==='true-3d')return done('unsupported',a.id,essential,missing,['TRUE_3D_NOT_SUPPORTED'],['Do not quietly convert essential spatial depth to 2D.']);
 if(essential.length===0)return done('review-required',a.id,essential,missing,['ESSENTIAL_MECHANICS_UNSPECIFIED'],['A genre label is not a game specification. Preserve original wording and resolve the required action and payoff.']);
 const engine:Engine=proposal.simulation||(a.engine==='either'?'rules':a.engine);
 if(a.engine!=='either'&&a.engine!==engine)return done('review-required',a.id,essential,missing,['GAME_FORM_ENGINE_CONFLICT'],['Reassess the essential physical cause and effect, not the nouns in the theme.']);
 if(engine==='rules'&&essential.some(id=>mechanicById.get(id)!.engine==='physics-2d'))return done('review-required',a.id,essential,missing,['REQUIRES_PHYSICAL_SIMULATION'],['A rules-only shortcut would change a required mechanic.']);
 if(proposal.existing){
  const b=proposal.existing;
  if(typeof b.baseRevisionId!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(b.baseRevisionId)||!b.config)return done('review-required',a.id,essential,missing,['SAVED_REVISION_REQUIRED'],['Do not migrate or overwrite revisions.']);
  // The real existing manifest validator is authoritative.
  let native;
  try{native=inspectNative(b.game,b.config);}catch{return done('review-required',a.id,essential,missing,['INVALID_NATIVE_REVISION'],['Keep the saved working game intact.']);}
  if(!native.archetypeIds.includes(a.id))return done('review-required',a.id,essential,missing,['NATIVE_FORM_MISMATCH'],[native.caveat]);
  const link=nativeLinks.find(x=>x.game===b.game)!;
  const adjustable=new Set(native.adjustableFields.map(field=>link.knobs[field]));
  const requested=proposal.requestedMechanics.filter(k=>!adjustable.has(k));
  if(requested.length)return done('generation-required',a.id,essential,missing,['MECHANIC_NOT_NATIVE_EDITABLE'],['A native game can have a mechanic without exposing a supported edit. Never imply an existing game can switch combat or engine modes.']);
  return done('existing-native-interpreter',a.id,essential,missing,[],[
   'Only a candidate for the existing local interpreter; it must still parse the exact child request and validate a concrete config delta.',
   'Do not skip revision, owner, learning, or Keep/Undo gates.'
  ]);
 }
 // A logic-level shared prototype is NOT a browser game or safe deployable artifact.
 if(missing.length===0)return done('prototype-only',a.id,essential,missing,[],['Verified logic-level primitives still need a renderer, input, gameplay tests and release gates.']);
 return done('generation-required',a.id,essential,missing,[],[
  'Catalog matching does not equal implementability. Queue the existing secure generator only after its ordinary authorization and budget checks.',
  'No inferred engine or template may replace required child-authored actions or payoff.'
 ]);
}
