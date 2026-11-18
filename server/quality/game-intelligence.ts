/**
 * Jems Game Intelligence, research v1.
 * This is a small, evidence-bound, advisory preflight. It is NOT a general
 * intent recognizer, an enjoyment predictor, or a release approval.
 * The child's actual request is sent unchanged to the trusted generator.
 */
export type GameSurface = '2d-canvas' | '3d-requested';
export type GameMotion = 'rule-driven' | 'physics-2d' | 'needs-review';
export type GameInteraction = 'drag-and-drop' | 'grid-puzzle' | 'driving' | 'arcade' | 'tap-and-react' | 'open-ended';
export type SignalConfidence = 'explicit' | 'tentative';
export interface GameFormAdvice {
  version: 'jems-game-form-advice-v1';
  provenance: 'deterministic-advisory-not-child-approved';
  surface: GameSurface;
  motion: GameMotion;
  interaction: GameInteraction;
  confidence: SignalConfidence;
  reasoning: string[];
  constraints: string[];
  capabilities: string[];
}
const matches = (text: string, pattern: RegExp) => pattern.test(text);
/**
 * Classification is about REQUIRED behavior, not the nouns in a theme.
 * A rocket, car, robot, cat, or bubble gum can all be scripted 2D.
 * Require explicit material cause/effect before recommending rigid bodies.
 */
export function recommendGameForm(childIdea: string): GameFormAdvice {
  const s = childIdea.normalize('NFKC').toLowerCase().slice(0, 4000);
  const styleOnly3D = matches(s, /\b(?:3d[- ](?:looking|style|art)|look(?:s|ing)?\s+(?:like\s+)?3d|faux[- ]3d)\b/);
  const threeD = (matches(s, /\b(?:3d|three[- ]dimensional|full[- ]3d|true[- ]3d)\b/) && !styleOnly3D) ||
    matches(s, /\b(?:move|fly|walk|navigate)\s+(?:freely\s+)?(?:in|through)\s+(?:all\s+)?three\s+(?:axes|dimensions)\b/);
  const forbidPhysics = matches(s, /\b(?:no|without|avoid|skip|don't use|do not use)\s+(?:(?:real|realistic)\s+)?physics\b/) ||
    matches(s, /\b(?:just|only)\s+(?:simple\s+)?(?:stickers|drag[- ]and[- ]drop)\b/);
  const requirePhysics = matches(s, /\b(?:real(?:istic)?\s+physics|physics\s+(?:game|engine|simulation)|simulate\s+(?:gravity|momentum|inertia)|real(?:istic)?\s+(?:gravity|collisions?|suspension))\b/) ||
    matches(s, /\b(?:suspension|springs?\s+(?:compress|stretch)|wheels?\s+(?:grip|slip)|bouncy\s+(?:collisions?|balls?)|bounce\s+(?:off|against)|joints?\s+(?:break|snap)|(?:collapse|collapses|collapsing|topple|topples|toppling)\s+(?:under|from)\s+(?:weight|gravity)|catapult\s+(?:launch|trajectory)|balance\s+(?:a|the)\s+(?:tower|stack)|drive\s+(?:a\s+)?(?:car|truck|bike)\s+(?:over|across)\s+(?:bumpy|hilly|rough)\b)/);
  const explicitConflict = forbidPhysics && requirePhysics;
  const motion: GameMotion = explicitConflict ? 'needs-review' : requirePhysics && !forbidPhysics ? 'physics-2d' : 'rule-driven';
  let interaction: GameInteraction = 'open-ended';
  if (matches(s, /\b(?:drag|drop|stickers?|decorate|attach|assemble|place\s+(?:parts|pieces)|put\s+(?:\w+\s+){0,3}together|bubble\s*gum\s+builders?)\b/)) interaction = 'drag-and-drop';
  else if (matches(s, /\b(?:grid|maze|route|directions|coding|program\s+(?:a|the)\s+robot|puzzle|sequence\s+of\s+(?:moves|steps))\b/)) interaction = 'grid-puzzle';
  else if (matches(s, /\b(?:drive|race|hill[- ]?climb|wheels?\s+grip|suspension)\b/)) interaction = 'driving';
  else if (matches(s, /\b(?:collect(?:s|ing)?|catch(?:es|ing)?|eat(?:s|ing)?|jump(?:s|ing)?|dodge|shoot|avoid|run\s+through)\b/)) interaction = 'arcade';
  else if (matches(s, /\b(?:tap|tapping|click|press\s+(?:a|the)\s+button)\b/)) interaction = 'tap-and-react';
  const reasoning = [
    threeD ? 'The request explicitly names spatial depth; current generated runtime is a 2D canvas.' : 'A 2D canvas is the supported presentation default; thematic 3D art does not require a 3D engine.',
    explicitConflict ? 'The text simultaneously requests and forbids physical simulation; require an intentional decision.' :
      motion === 'physics-2d' ? 'A physical cause/effect requirement is explicit, so bounded 2D physics may earn its complexity.' :
      'No essential rigid-body interaction was established; use rule-driven movement, drag/drop and animation first.',
    'Interaction is inferred from verbs and intended actions, not from whether the theme mentions a vehicle, robot, cat or rocket.'
  ];
  const constraints = [
    'Preserve the child idea verbatim. Treat this classification as a hypothesis, never as permission to change the story or objective.',
    'Make the core player action obvious and immediately responsive, then show an observable consequence and requested payoff.',
    'Choose the minimum machinery needed: attractive animation is not evidence that real rigid-body physics is required.',
    'Do not secretly optimize, remove, or rewrite child-created mechanics; preserve child ownership and explicit version selection.',
    'The trusted host—not generated code—owns required learning checkpoints, pause/resume, and learner records.'
  ];
  const capabilities = threeD ?
    ['True 3D is not supported by generated-module-v2; do not claim to deliver true 3D or silently substitute a 2D design. Flag for product review.'] :
    motion === 'needs-review' ?
    ['Physics constraints conflict. Resolve the intended behavior before treating this as a validated design choice.'] :
    motion === 'rule-driven' ?
    ['A scripted 2D game can implement movement, reactions, sound, growth, stickers, collisions-as-rules, and celebration without api.physics.'] :
    ['Use the supported 2D rigid-body facade only for the interactions that depend on mass, joints, contact, momentum or gravity.'];
  return {
    version:'jems-game-form-advice-v1', provenance:'deterministic-advisory-not-child-approved',
    surface:threeD?'3d-requested':'2d-canvas', motion, interaction,
    confidence:threeD || requirePhysics || forbidPhysics || interaction!=='open-ended' ? 'explicit':'tentative',
    reasoning, constraints, capabilities
  };
}

/** Data supplied ONLY to the existing private generation call. No extra provider call. */
export function generationDesignBrief(childIdea: string) {
  const advice = recommendGameForm(childIdea);
  return {
    status:'ADVISORY_NOT_VALIDATED',
    // Keep the original wording in the sibling "idea" field; do not pre-rewrite it here.
    surface:advice.surface, motion:advice.motion, interaction:advice.interaction,
    rationale:advice.reasoning, invariants:advice.constraints, capabilityNotes:advice.capabilities,
    acceptanceQuestions:[
      'Can a child understand and perform the main action without adult explanation?',
      'Does that action cause the visible change the child asked for?',
      'Are all explicitly requested essential mechanics and the payoff observable in play?',
      'Is the chosen physics or rendering complexity necessary for that experience?',
      'Does the first playable interaction give clear, satisfying feedback and allow a kind retry?'
    ]
  } as const;
}

export type QualityAxis =
  'idea-fidelity' | 'game-form-fit' | 'controls-and-discoverability' |
  'playability-and-recovery' | 'feedback-and-payoff' | 'child-appropriate-accessibility' |
  'learning-boundary' | 'isolation-and-performance';
export type EvidenceResult = 'pass' | 'fail' | 'not-tested';
export interface GameQualityEvidence {
  axis: QualityAxis;
  result: EvidenceResult;
  source: 'automated' | 'expert-review' | 'observed-child';
  reason: string;
}
export const QUALITY_AXES: readonly QualityAxis[] = [
  'idea-fidelity','game-form-fit','controls-and-discoverability','playability-and-recovery',
  'feedback-and-payoff','child-appropriate-accessibility','learning-boundary','isolation-and-performance'
] as const;
export interface GameQualityReview {
  decision: 'blocked' | 'incomplete' | 'await-child-playtest';
  missing: QualityAxis[];
  failing: QualityAxis[];
  unsupportedClaims: string[];
}
/**
 * This research-only result NEVER authorizes publication. Green automated checks
 * are not a measurement of fun or of educational efficacy.
 */
export function reviewGameEvidence(evidence: readonly GameQualityEvidence[]): GameQualityReview {
  const byAxis = new Map<QualityAxis, GameQualityEvidence>();
  for(const entry of evidence){
    if(!QUALITY_AXES.includes(entry.axis)) throw Error('QUALITY_AXIS_INVALID');
    if(byAxis.has(entry.axis)) throw Error('QUALITY_EVIDENCE_DUPLICATE');
    if(!['pass','fail','not-tested'].includes(entry.result) ||
       !['automated','expert-review','observed-child'].includes(entry.source) ||
       !entry.reason.trim()) throw Error('QUALITY_EVIDENCE_INVALID');
    byAxis.set(entry.axis,entry);
  }
  const missing = QUALITY_AXES.filter(axis => !byAxis.has(axis) || byAxis.get(axis)!.result === 'not-tested');
  const failing = QUALITY_AXES.filter(axis => byAxis.get(axis)?.result === 'fail');
  return {
    decision:failing.length?'blocked':missing.length?'incomplete':'await-child-playtest',
    missing, failing,
    unsupportedClaims:[
      'No automated assessment establishes enjoyment, child understanding, sustained interest or learning improvement.',
      'A successful quality review does not approve deployment, model activation, sharing or replacing the child-selected game.'
    ]
  };
}
