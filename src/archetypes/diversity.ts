/**
 * Jems creative differentiation research, not a production "fun" classifier.
 * Source-backed child intent and actual browser playtesting remain independent.
 * Compare gameplay structure, not character/theme labels. Read-only advisory:
 * never changes an idea, saves data, blocks an authorized edit or triggers AI.
 */
import {archetypeById,mechanicById,type Input} from './catalog';

export type PlayerVerb='navigate'|'collect'|'avoid'|'drive'|'steer'|'fly'|'reflect'|'aim'|'protect'|'shoot'|'throw'|'time'|'catch'|'chase'|'program'|'solve'|'reveal'|'match'|'sort'|'merge'|'assemble'|'decorate'|'build'|'balance'|'explore'|'choose'|'care'|'manage'|'trade'|'grow'|'race'|'launch';
export type Challenge='hazard'|'enemy'|'terrain'|'precision'|'time-pressure'|'logic'|'hidden-information'|'resources'|'construction'|'coordination'|'memory'|'expression'|'exploration'|'care'|'none';
export type Goal='reach'|'collect'|'survive'|'defeat'|'protect'|'score'|'solve'|'create'|'discover'|'deliver'|'care'|'grow'|'manage'|'perform';
export type Pace='continuous'|'timed'|'turn-based'|'self-paced'|'staged';
export interface ExperienceSignature {
 readonly archetypeId:string;
 /** The actual verb a player performs, not what a character/asset depicts. */
 readonly verb:PlayerVerb;
 readonly control:Input;
 readonly challenge:Challenge;
 readonly goal:Goal;
 readonly pace:Pace;
 /** Required gameplay, not optional theme or polish. */
 readonly mechanics:readonly string[];
 /** Visible child-intended payoff described in words; NOT a gameplay test result. */
 readonly payoff:string;
 readonly theme?:string;
}
export type RequestedRelationship='different-game'|'similar-edit'|'reskin'|'unspecified';
export interface DiversityReview {
 readonly schema:'jems-diversity-advisory-v1';
 readonly proposedOnly:true;
 readonly comparison:'cosmetic-only'|'small-gameplay-variation'|'different-gameplay-candidate';
 readonly changedDimensions:readonly string[];
 readonly changedMechanics:readonly string[];
 readonly gameplayChangeCount:number;
 readonly suggestedReview:'none'|'similarity-risk';
 readonly reason:string;
 readonly mustStillTest:readonly string[];
}
const verbs:readonly PlayerVerb[]=['navigate','collect','avoid','drive','steer','fly','reflect','aim','protect','shoot','throw','time','catch','chase','program','solve','reveal','match','sort','merge','assemble','decorate','build','balance','explore','choose','care','manage','trade','grow','race','launch'];
const challenges:readonly Challenge[]=['hazard','enemy','terrain','precision','time-pressure','logic','hidden-information','resources','construction','coordination','memory','expression','exploration','care','none'];
const goals:readonly Goal[]=['reach','collect','survive','defeat','protect','score','solve','create','discover','deliver','care','grow','manage','perform'];
const paces:readonly Pace[]=['continuous','timed','turn-based','self-paced','staged'];
const controls:readonly Input[]=['tap','keyboard','drag','grid','steer','timed','choice'];
/** Only non-interactive embellishments are discounted: rhythm/dialogue/clues can be real mechanics. */
const cosmeticOnly=new Set(['sound-effect','celebration','launch-animation']);
const nonCosmetic=(ids:readonly string[])=>ids.filter(id=>!cosmeticOnly.has(id));
export function validateExperienceSignature(value:ExperienceSignature):void {
 if(!value||!archetypeById.has(value.archetypeId)||
  !verbs.includes(value.verb)||!controls.includes(value.control)||!challenges.includes(value.challenge)||
  !goals.includes(value.goal)||!paces.includes(value.pace)||
  !Array.isArray(value.mechanics)||value.mechanics.length<1||value.mechanics.length>32||
  value.mechanics.some(x=>typeof x!=='string'||!mechanicById.has(x))||
  new Set(value.mechanics).size!==value.mechanics.length||
  typeof value.payoff!=='string'||value.payoff.trim().length<5||value.payoff.length>180||
  (value.theme!==undefined&&(typeof value.theme!=='string'||value.theme.length>100)))throw Error('GAME_EXPERIENCE_SIGNATURE_INVALID');
}
/** A design comparison, not a calibrated psychological measurement. */
export function reviewDiversity(previous:ExperienceSignature,next:ExperienceSignature,relationship:RequestedRelationship):DiversityReview {
 validateExperienceSignature(previous);validateExperienceSignature(next);
 if(!['different-game','similar-edit','reskin','unspecified'].includes(relationship))throw Error('GAME_DIVERSITY_RELATIONSHIP_INVALID');
 const changed:string[]=[];
 for(const key of ['verb','control','challenge','goal','pace'] as const)if(previous[key]!==next[key])changed.push(key);
 const l=new Set(nonCosmetic(previous.mechanics)),r=new Set(nonCosmetic(next.mechanics));
 const mechanicsChanged=[...new Set([...l,...r])].filter(x=>l.has(x)!==r.has(x)).sort();
 if(mechanicsChanged.length)changed.push('gameplay-mechanics');
 // Theme, character artwork, sound-only effects and celebratory copy deliberately
 // do not count as a gameplay innovation. Pacing alone is not a new game loop.
 const majorChanges=['verb','challenge','goal','gameplay-mechanics'].filter(k=>changed.includes(k)).length;
 const comparison:DiversityReview['comparison']=majorChanges===0?'cosmetic-only':majorChanges===1?'small-gameplay-variation':'different-gameplay-candidate';
 const suggestedReview=relationship==='different-game'&&comparison!=='different-gameplay-candidate'?'similarity-risk':'none';
 const reason=comparison==='cosmetic-only'?
  'Same described player action, challenge, objective and gameplay mechanics. Theme, animation or timing changes alone do not establish a new game.':
  comparison==='small-gameplay-variation'?
  'One gameplay dimension changes; this might be a valuable edit, but is not yet evidence of a distinct play experience.':
  'At least two structural gameplay dimensions differ on paper. Their implemented behavior and child experience are still unverified.';
 return Object.freeze({
  schema:'jems-diversity-advisory-v1' as const,proposedOnly:true as const,
  comparison,changedDimensions:Object.freeze(changed),changedMechanics:Object.freeze(mechanicsChanged),
  gameplayChangeCount:majorChanges,suggestedReview,reason,
  mustStillTest:Object.freeze([
   'Trace the child\'s requested action, effect and payoff to independent playable evidence.',
   'Run actual touch and keyboard controls, win/fail/retry, and learning/session regression.',
   'Compare observed play traces and first-minute experience; a design signature does not prove different gameplay.',
   'Ask children whether different games feel repetitive in a consented pilot; never infer delight from this calculation.'
  ])
 });
}
