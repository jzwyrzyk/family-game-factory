// Authored synthetic requests. Keep checks outside generation input in both lanes.
import { createHash } from 'node:crypto';

export const benchmarkVersion = 'jems-premium-comparison-v1';
export const scoreAxes = ['clarity', 'polish', 'fidelity', 'feedback', 'funPotential'] as const;
export type Scores = Record<typeof scoreAxes[number], number>;
const anchors: Record<keyof Scores, string[]> = {
  clarity: [
    'Cannot identify a usable first action or objective.', 'First action requires guessing. Success and recovery remain ambiguous.',
    'First action, goal and common feedback become understandable during ordinary play.', 'First action and recovery are legible immediately on both devices.',
    'New actions and later challenges explain themselves through consistent cues and immediate consequences on both devices.',
  ],
  polish: [
    'Subjects or controls are unreadable or obstructed.', 'The scene renders, but inconsistent scale, contrast or placeholders hide action.',
    'Subjects, controls and play space remain readable in a coherent style.', 'Deliberate silhouettes, layering and hierarchy sustain readability across phases.',
    'Composition, transitions, motion and scale reinforce the requested mood through action, progress and payoff on both devices.',
  ],
  fidelity: [
    'The central action or purpose is absent.', 'Theme appears, but several essential actions or the payoff are missing or unobserved.',
    'Core action is visible. Some requested progression, recovery, style or payoff lacks evidence.', 'All case checks are observed, including the defining action and payoff.',
    'All case checks are observed together in a distinctive, cohesive version of the exact idea across desktop and touch.',
  ],
  feedback: [
    'Input has no discernible visual consequence.', 'Changes occur but their cause, direction or timing is unclear.',
    'Most actions promptly yield distinct, legible state changes.', 'Animation makes anticipation, contact, outcome and recovery clear across inputs.',
    'Timing, composition and distinct poses sustain readable cause and effect from first action through the requested payoff.',
  ],
  funPotential: [
    'No visible reason to make another choice.', 'Repetition dominates and choices change little.',
    'One observable choice, challenge or expressive variation supports another attempt.', 'Different choices produce legible tradeoffs and invite retry or experimentation.',
    'Progression or open-ended expression sustains several meaningfully different approaches with satisfying observable responses.',
  ],
};
export function rubricTable() { return scoreAxes.map(axis => ({ axis, anchors: anchors[axis] })); }

export interface BenchmarkCase {
  id: string;
  request: string;
  checks: Record<string, string>;
}

export const cases: BenchmarkCase[] = [
  {
    id: 'fox-and-leaves',
    request: 'My cute cartoon Pokémon-like fox runs sideways in a happy, silly forest. I want to jump over low leaves and duck under high leaves. Make it get trickier as I go. Finish the level after I avoid 100 leaves and make the fox do a big silly celebration!',
    checks: {
      world: 'See the cute cartoon fox travel sideways through a playful forest.',
      jump: 'A low leaf approaches. Jump clears it and progress advances. A mistimed input costs progress or prompts recovery.',
      duck: 'A high leaf approaches. Duck clears it. Jump alone cannot clear both obstacle types.',
      progression: 'Compare early and late play. A visible change to spacing, timing or patterns increases the challenge.',
      finish: 'Show play continuing at 99, the hundredth successful avoidance and only then level completion.',
      celebration: 'The fox visibly celebrates across animation frames, followed by a working replay.',
    },
  },
  {
    id: 'lantern-climber',
    request: 'I am a paper cat climbing lanterns. Let me move left and right, jump from lantern to lantern and ring a bell at the top. The bell takes me to another level with moving lanterns. If I fall, let me try that level again.',
    checks: {
      movement: 'Move both ways and land a jump on a different lantern.',
      level: 'Reach and ring the bell. The next arrangement includes moving platforms.',
      recovery: 'Fall on the second level, recover there and make a different jump.',
    },
  },
  {
    id: 'echo-garden',
    request: 'Three flowers light up in a pattern and I tap them in that order. For the next round add a light to the pattern. If I miss, let me hear and see that same pattern again.',
    checks: {
      sequence: 'See the flowers light in a distinguishable order, then enter that order.',
      mismatch: 'Choose the wrong flower. The game repeats the same sequence and permits another attempt.',
      round: 'A correct sequence leads to a visibly longer sequence.',
    },
  },
  {
    id: 'balancing-bridge',
    request: 'I want to drag planks and supports into a bridge. My little cart has to cross. A wobbly bridge should tip under the weight. Let me move a support and see the cart make it across.',
    checks: {
      build: 'Drag parts into distinct arrangements and see each placement persist.',
      load: 'Run the same cart on an unsupported span and see the span tip as the cart loads it.',
      fix: 'Reposition support and rerun. The changed structure carries the cart across.',
    },
  },
  {
    id: 'star-map',
    request: 'Move my robot around a blocked square to explore a little grid. I want to go back the way I came, choose another path, and reach the star.',
    checks: {
      wall: 'Approach the blocked square. Movement toward it leaves the robot on the accessible side.',
      explore: 'Move away, revisit a previous square, then take another available direction.',
      star: 'Navigate to the star and see arrival trigger the requested goal.',
    },
  },
  {
    id: 'coral-studio',
    request: 'Give me a quiet underwater studio. I can stamp shells in colors and drag them around to make pictures. Let me change my mind and keep decorating without having to win.',
    checks: {
      create: 'Place two differently colored shells at chosen locations.',
      edit: 'Move a shell and see the other shell stay where it was.',
      freeplay: 'After making one picture, keep editing into a visibly different composition in the same session.',
    },
  },
  {
    id: 'moon-parade',
    request: 'I stick three glowing paper wings on a sleepy moon dragon. When all three are on, I ring a gong. Wake the dragon, unfurl its wings, then let it fly around a parade of dancing stars!',
    checks: {
      prepare: 'An early gong cannot start the parade. Three attached wings stay visible.',
      awaken: 'Ring the gong after the third attachment. See the dragon awaken and unfurl its wings in sequence.',
      parade: 'See the dragon moving through space and the stars dancing across distinct animation poses.',
    },
  },
];

export const digest = (text: string) => createHash('sha256').update(text).digest('hex');
export function caseIdentity(item: BenchmarkCase) {
  return {
    requestHash: digest(item.request),
    criteriaHash: digest(JSON.stringify([benchmarkVersion, item.checks, rubricTable()])),
  };
}

export function pairedManifest() {
  return {
    version: benchmarkVersion, actualModelComparison: 'pending', rubric: 'rubric-v1',
    cases: cases.map(item => ({ ...item, ...caseIdentity(item), lanes: ['legacy', 'premium'] })),
  };
}
