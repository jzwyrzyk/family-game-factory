import {isEarlyGrade} from '../learning/grades';
import type { ProblemSolvingDraft } from './model';

/** Authored, bounded practice. These rules check choices in a known miniature world;
 * they do not estimate a child's general problem-solving ability. */
export type PracticeBand = 'g1-2' | 'g3-4';
export type PracticeFamily = 'robot-stop' | 'gem-delivery' | 'ready-gate';
export type PracticePhase = 'predict' | 'test' | 'interpret' | 'revise';
export type PracticeSkill = 'plan_test' | 'interpret_evidence' | 'revise';
export interface PracticeChoice { id: string; label: string; detail?: string; icon?: string }
export type PracticeScene =
  | { kind: 'robot'; steps: number; stride: number; target: number; slow?: boolean }
  | { kind: 'delivery'; route: 'tunnel' | 'bridge'; parcel: number; tunnelHeight: number; bridgeHeight: number; goalParcel: number }
  | { kind: 'gate'; counts: number[]; rule: 'exactly-three' | 'at-least-three' | 'more-than-two' | 'always'; goal: 'exactly-three' | 'at-least-three' };
export interface PracticeTrial {
  scene: PracticeScene;
  observation: string;
  description: string;
  reachedGoal: boolean;
  outputs: number[] | boolean[];
}
export interface PracticeExperiment extends PracticeChoice { scene: PracticeScene; useful: boolean }
export interface PracticeTask {
  id: string; family: PracticeFamily; version: string; band: PracticeBand;
  title: string; invitation: string; goal: string; setup: string; thumbnail: string;
  initial: PracticeScene;
  prediction: { prompt: string; choices: PracticeChoice[] };
  test: { prompt: string; choices: PracticeExperiment[] };
  interpretation: { prompt: string; choices: PracticeChoice[] };
  revision: { prompt: string; choices: (PracticeChoice & { scene: PracticeScene })[] };
  hints: Record<PracticePhase, string>;
}

const robot = (steps: number, stride: number, target: number, slow = false): PracticeScene => ({ kind: 'robot', steps, stride, target, slow });
const delivery = (route: 'tunnel' | 'bridge', parcel: number, goalParcel = 2): PracticeScene => ({ kind: 'delivery', route, parcel, tunnelHeight: 1, bridgeHeight: 3, goalParcel });
const gate = (counts: number[], rule: 'exactly-three' | 'at-least-three' | 'more-than-two' | 'always', goal: 'exactly-three' | 'at-least-three'): PracticeScene => ({ kind: 'gate', counts, rule, goal });

const robotAnswers: PracticeChoice[] = [
  { id: 'at-gem', label: 'Stops at the gem', icon: '◆' },
  { id: 'past-gem', label: 'Goes past the gem', icon: '→' },
  { id: 'before-gem', label: 'Stops before the gem', icon: '↦' },
];
const deliveryAnswers: PracticeChoice[] = [
  { id: 'delivered', label: 'The whole parcel arrived', icon: '✓' },
  { id: 'blocked', label: 'The parcel got stuck', icon: '▥' },
  { id: 'smaller-parcel', label: 'Only a smaller parcel arrived', icon: '◇' },
];
const earlyGateAnswers: PracticeChoice[] = [
  { id: 'opened', label: 'The gate opened', icon: '↗' },
  { id: 'closed', label: 'The gate stayed closed', icon: '▥' },
];
const lateGateAnswers: PracticeChoice[] = [
  { id: 'boundary-fails', label: '3 works. 4 does not.', detail: 'The rule missed a full box.', icon: '3 / 4' },
  { id: 'only-three', label: '3 works. We have not tried 4.', icon: '3' },
  { id: 'only-empty', label: 'An empty box stays closed.', icon: '0' },
];

function robotTask(band: PracticeBand): PracticeTask {
  const early = band === 'g1-2', target = early ? 4 : 6;
  const initial = early ? robot(6, 1, target) : robot(3, 3, target);
  const small = early ? robot(4, 1, target) : robot(3, 2, target);
  const fewer = early ? robot(4, 1, target) : robot(2, 3, target);
  return {
    id: `robot-stop-${band}`, family: 'robot-stop', version: '1', band,
    title: 'A robot with a plan', invitation: 'Help our robot find its stopping spot.',
    goal: 'Stop on the gem.',
    setup: early ? 'The robot starts at 0 and takes 6 little steps. The gem is at 4.' : 'The robot takes 3 jumps of 3 spaces. The gem is at 6.',
    thumbnail: './jems-world-robot.svg', initial,
    prediction: { prompt: 'Where will this plan stop?', choices: robotAnswers },
    test: {
      prompt: early ? 'What could you change to learn where it stops?' : 'Which movement change could help you find the stopping spot?',
      choices: [
        { id: 'smaller-steps', label: early ? 'Take 4 little steps' : 'Make each jump 2 spaces', detail: early ? 'Try fewer steps.' : 'Keep the same 3 jumps.', icon: '↦', scene: small, useful: true },
        { id: 'shorter-trial', label: early ? 'Try 3 little steps' : 'Try 3 jumps of 1 space', detail: 'See where a shorter trip ends.', icon: '↦', scene: robot(3, 1, target), useful: true },
        { id: 'new-colour', label: 'Change the robot’s colour', detail: 'Keep its steps the same.', icon: '◈', scene: initial, useful: false },
      ],
    },
    interpretation: { prompt: 'What did your test show?', choices: robotAnswers },
    revision: { prompt: 'Choose the plan you want to try next.', choices: [
      { id: 'small-steps', label: early ? 'Use 4 little steps' : 'Use 3 jumps of 2 spaces', icon: '↦', scene: small },
      { id: 'old-plan', label: early ? 'Use 6 little steps' : 'Use 3 jumps of 3 spaces', icon: '→', scene: initial },
      { id: 'other-plan', label: early ? 'Use 2 little steps' : 'Use 2 jumps of 3 spaces', icon: '↦', scene: early ? robot(2, 1, target) : fewer },
    ] },
    hints: {
      predict: 'Follow the steps from the start. Notice where the gem is.',
      test: early ? 'Look for a choice that changes where the robot stops.' : 'Change one part of the movement plan, then see where it ends.',
      interpret: 'Look at the robot and the gem after the test. Which picture matches?',
      revise: 'Use what you saw. You can keep a plan that worked or try a different movement.',
    },
  };
}

function deliveryTask(band: PracticeBand): PracticeTask {
  const early = band === 'g1-2';
  return {
    id: `gem-delivery-${band}`, family: 'gem-delivery', version: '1', band,
    title: 'Special delivery', invitation: 'Find a way for a gem parcel to get home.',
    goal: 'Deliver the whole parcel to the gift box.',
    setup: early ? 'A big parcel is ready. The tunnel is small. There is a bridge, too.' : 'Keep both gems in the parcel. The tunnel has room for 1; the bridge has room for 3.',
    thumbnail: './gem-factory-workshop.webp', initial: delivery('tunnel', 2),
    prediction: { prompt: 'What will happen in the tunnel?', choices: deliveryAnswers },
    test: { prompt: early ? 'Which new test could help you learn about the routes?' : 'Which change could help you investigate the blocked delivery?', choices: [
      { id: 'bridge', label: 'Send the whole parcel over the bridge', icon: '⌁', scene: delivery('bridge', 2), useful: true },
      { id: 'tunnel', label: 'Send it through the small tunnel', icon: '∩', scene: delivery('tunnel', 2), useful: false },
      { id: 'small-parcel', label: early ? 'Try one gem in the tunnel' : 'Remove a gem and try the tunnel', detail: 'See whether a smaller parcel fits.', icon: '◇', scene: delivery('tunnel', 1), useful: true },
    ] },
    interpretation: { prompt: 'What arrived at the gift box?', choices: deliveryAnswers },
    revision: { prompt: 'How will you deliver the whole parcel?', choices: [
      { id: 'whole-bridge', label: 'Both gems over the bridge', icon: '⌁', scene: delivery('bridge', 2) },
      { id: 'whole-tunnel', label: 'Both gems through the small tunnel', icon: '∩', scene: delivery('tunnel', 2) },
      { id: 'small-tunnel', label: 'One gem through the tunnel', icon: '◇', scene: delivery('tunnel', 1) },
    ] },
    hints: {
      predict: 'Compare the size of the parcel with the tunnel opening.',
      test: 'You can test another route or a different parcel size. What does that help you find out?',
      interpret: 'Look at the gift box. Did the whole parcel arrive, only part, or nothing?',
      revise: 'Keep both gems together. Choose a route that has room for them.',
    },
  };
}

function gateTask(band: PracticeBand): PracticeTask {
  const early = band === 'g1-2', goal = early ? 'exactly-three' : 'at-least-three';
  return {
    id: `ready-gate-${band}`, family: 'ready-gate', version: '1', band,
    title: early ? 'Ready, set, gems!' : 'The nearly-ready gate',
    invitation: early ? 'Help a three-gem gift get through.' : 'Try the edge of a rule. Will it still work?',
    goal: early ? 'Make a gift with exactly 3 gems.' : 'Open for 3 or more gems. Stay closed for fewer.',
    setup: early ? 'The gate opens for exactly 3 gems. This box has 2.' : 'The current rule says “open for exactly 3”. A box with 4 arrives.',
    thumbnail: './jems-workbench.svg', initial: gate([early ? 2 : 4], 'exactly-three', goal),
    prediction: { prompt: 'What will the gate do with this box?', choices: earlyGateAnswers },
    test: early ? {
      prompt: 'What could test when the gate opens?', choices: [
        { id: 'add-one', label: 'Add one gem', icon: '+ 1', scene: gate([3], 'exactly-three', goal), useful: true },
        { id: 'add-two', label: 'Add two gems', detail: 'See what happens with a bigger box.', icon: '+ 2', scene: gate([4], 'exactly-three', goal), useful: true },
        { id: 'ribbon', label: 'Change the ribbon', detail: 'Keep the same 2 gems.', icon: '⋈', scene: gate([2], 'exactly-three', goal), useful: false },
      ],
    } : {
      prompt: 'Which test could find the gap in this rule?', choices: [
        { id: 'compare-boundary', label: 'Try 3, then try 4', detail: 'Keep the gate rule the same.', icon: '3 / 4', scene: gate([3, 4], 'exactly-three', goal), useful: true },
        { id: 'three-only', label: 'Try 3 twice', detail: 'Keep the gate rule the same.', icon: '3 / 3', scene: gate([3, 3], 'exactly-three', goal), useful: false },
        { id: 'empty-only', label: 'Try an empty box', detail: 'Keep the gate rule the same.', icon: '0', scene: gate([0], 'exactly-three', goal), useful: false },
      ],
    },
    interpretation: { prompt: 'What do these results tell you?', choices: early ? earlyGateAnswers : lateGateAnswers },
    revision: early ? {
      prompt: 'Choose a gift for the gate.', choices: [
        { id: 'three-gems', label: 'A gift with 3 gems', icon: '3 ◆', scene: gate([3], 'exactly-three', goal) },
        { id: 'two-gems', label: 'A gift with 2 gems', icon: '2 ◆', scene: gate([2], 'exactly-three', goal) },
        { id: 'four-gems', label: 'A gift with 4 gems', icon: '4 ◆', scene: gate([4], 'exactly-three', goal) },
      ],
    } : {
      prompt: 'Which rule would work for every box here?', choices: [
        { id: 'at-least-three', label: 'Open for 3 or more', icon: '≥ 3', scene: gate([0, 2, 3, 4], 'at-least-three', goal) },
        { id: 'exactly-three', label: 'Open for exactly 3', icon: '= 3', scene: gate([0, 2, 3, 4], 'exactly-three', goal) },
        { id: 'more-than-two', label: 'Open for more than 2', detail: 'These boxes hold whole gems.', icon: '> 2', scene: gate([0, 2, 3, 4], 'more-than-two', goal) },
      ],
    },
    hints: {
      predict: 'Read the current gate rule. Then count the gems in the box.',
      test: early ? 'Try a different number of gems. A gate that stays closed tells you something, too.' : 'The goal includes boxes bigger than 3. Make sure your test includes one.',
      interpret: 'Look at each box you tested and whether its gate opened.',
      revise: early ? 'Count the gems and match the gate’s rule.' : 'Check a small box, a box of 3, and a bigger box. The rule needs to handle all of them.',
    },
  };
}

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
export const PROBLEM_SOLVING_PRACTICE: readonly PracticeTask[] = freeze(
  (['g1-2', 'g3-4'] as const).flatMap(band => [robotTask(band), deliveryTask(band), gateTask(band)]),
);
export const practiceBandForGrade = (grade: number): PracticeBand => grade >= 3 ? 'g3-4' : 'g1-2';
export const practiceTasksForGrade = (grade: number): readonly PracticeTask[] => isEarlyGrade(grade) ? [] : PROBLEM_SOLVING_PRACTICE.filter(task => task.band === practiceBandForGrade(grade));
export function getPracticeTask(id: string): PracticeTask {
  const task = PROBLEM_SOLVING_PRACTICE.find(item => item.id === id);
  if (!task) throw Error('This little experiment is not available. Choose another idea.');
  return task;
}

/** No random outcome, timers, model output, or generated game messages participate. */
export function runPracticeScene(scene: PracticeScene): PracticeTrial {
  if (scene.kind === 'robot') {
    const stop = scene.steps * scene.stride;
    const observation = stop === scene.target ? 'at-gem' : stop > scene.target ? 'past-gem' : 'before-gem';
    return { scene, observation, description: `The robot stopped at ${stop}. The gem is at ${scene.target}.`, reachedGoal: stop === scene.target, outputs: Array.from({ length: scene.steps + 1 }, (_, i) => i * scene.stride) };
  }
  if (scene.kind === 'delivery') {
    const fits = scene.parcel <= (scene.route === 'bridge' ? scene.bridgeHeight : scene.tunnelHeight);
    const whole = scene.parcel === scene.goalParcel;
    return { scene, observation: !fits ? 'blocked' : whole ? 'delivered' : 'smaller-parcel', description: !fits ? 'The parcel stopped at the tunnel. It did not fit.' : whole ? 'Both gems arrived together at the gift box.' : 'One gem arrived. The gift still needs the other gem.', reachedGoal: fits && whole, outputs: [fits ? scene.parcel : 0] };
  }
  const opens = (count: number) => scene.rule === 'always' || (scene.rule === 'exactly-three' ? count === 3 : scene.rule === 'at-least-three' ? count >= 3 : count > 2);
  const outputs = scene.counts.map(opens);
  const reachedGoal = scene.goal === 'exactly-three'
    ? scene.counts.length > 0 && scene.counts.every(count => count === 3) && outputs.every(Boolean)
    : [0, 2, 3, 4].every(count => opens(count) === (count >= 3));
  const observation = scene.counts.length === 1 ? outputs[0] ? 'opened' : 'closed'
    : scene.counts.includes(4) && !opens(4) ? 'boundary-fails'
    : scene.counts.every(count => count === 3) ? 'only-three' : 'rule-works';
  return { scene, observation: scene.goal === 'at-least-three' && scene.counts.length === 1 && scene.counts[0] === 0 ? 'only-empty' : observation,
    description: scene.counts.map((count, i) => `${count} ${count === 1 ? 'gem' : 'gems'}: gate ${outputs[i] ? 'opened' : 'stayed closed'}.`).join(' '), reachedGoal, outputs };
}

function choiceIn<T extends PracticeChoice>(choices: readonly T[], id: string): T {
  const choice = choices.find(item => item.id === id);
  if (!choice) throw Error('Choose one of the ideas shown here.');
  return choice;
}
export function runPracticeTest(taskId: string, choiceId: string): PracticeTrial {
  const task = getPracticeTask(taskId);
  return runPracticeScene(choiceIn(task.test.choices, choiceId).scene);
}
export function runPracticeRevision(taskId: string, choiceId: string): PracticeTrial {
  const task = getPracticeTask(taskId);
  return runPracticeScene(choiceIn(task.revision.choices, choiceId).scene);
}
export function evaluatePracticeChoice(taskId: string, phase: PracticePhase, choiceId: string, testChoiceId?: string): {
  outcome: 'demonstrated' | 'not-yet' | 'unobserved'; skill: PracticeSkill; note: string; predictionMatched?: boolean;
} {
  const task = getPracticeTask(taskId);
  if (!['predict', 'test', 'interpret', 'revise'].includes(phase)) throw Error('This practice step is not available.');
  if (phase === 'predict') {
    choiceIn(task.prediction.choices, choiceId);
    return { outcome: 'unobserved', skill: 'plan_test', note: 'Prediction recorded before the test. Prediction accuracy alone is not a problem-solving judgment.', predictionMatched: runPracticeScene(task.initial).observation === choiceId };
  }
  if (phase === 'test') {
    const choice = choiceIn(task.test.choices, choiceId);
    return { outcome: choice.useful ? 'demonstrated' : 'not-yet', skill: 'plan_test', note: choice.useful ? 'Selected a relevant change or discriminating comparison in this authored scene; the trial need not reach the final goal.' : 'Selected a cosmetic change, unchanged repeat, or a comparison that missed the stated boundary in this authored scene.' };
  }
  if (phase === 'interpret') {
    choiceIn(task.interpretation.choices, choiceId);
    if (!testChoiceId) throw Error('Try a test before describing its result.');
    const correct = runPracticeTest(taskId, testChoiceId).observation === choiceId;
    return { outcome: correct ? 'demonstrated' : 'not-yet', skill: 'interpret_evidence', note: correct ? 'Matched the observed outcome of the selected test.' : 'The selected description did not match the observed outcome of this test.' };
  }
  if (!testChoiceId) throw Error('Try a test before choosing a revision.');
  runPracticeTest(taskId, testChoiceId);
  const trial = runPracticeRevision(taskId, choiceId);
  return { outcome: trial.reachedGoal ? 'demonstrated' : 'not-yet', skill: 'revise', note: trial.reachedGoal ? 'Selected a functionally suitable plan after seeing a test result.' : 'The selected plan still missed this stated goal.' };
}

/** Restored drafts must still match this authored task, its oracle and UI order.
 * Generic workspace validation deliberately does not know this catalog. */
export function validatePracticeDraft(draft: ProblemSolvingDraft): void {
  function fail(): never { throw Error('This saved experiment cannot be resumed in this version. Its saved data has not been changed.'); }
  const { episode, stepIndex } = draft, task = getPracticeTask(episode.task.id);
  if (episode.source !== 'practice' || episode.kind !== 'structured-practice' || episode.completedAt
    || episode.task.family !== task.family || episode.task.version !== task.version || episode.task.variant !== task.band || episode.task.demand !== task.band) fail();
  const answers: Partial<Record<PracticePhase, string>> = {};
  let revisions = 0;
  for (const observation of episode.observations) {
    if (!observation.responseId) fail();
    const [phase, id, extra] = observation.responseId.split(':');
    if (!id || extra !== undefined) fail();
    if (phase === 'hint' || phase === 'narration') {
      if (!['predict','test','interpret','revise'].includes(id) || observation.outcome !== 'unobserved') fail();
      continue;
    }
    if (!['predict','test','interpret','revise'].includes(phase)) fail();
    const key = phase as PracticePhase;
    if (key === 'predict' && (answers.predict || answers.test) || key === 'test' && (!answers.predict || answers.test)
      || key === 'interpret' && (!answers.test || answers.interpret) || key === 'revise' && !answers.interpret) fail();
    const result = evaluatePracticeChoice(task.id, key, id, answers.test);
    if (observation.outcome !== result.outcome || observation.skill !== result.skill) fail();
    answers[key] = id; if (key === 'revise') revisions++;
  }
  if (stepIndex === 0 && answers.predict || stepIndex === 1 && (!answers.predict || answers.test)
    || (stepIndex === 2 || stepIndex === 3) && (!answers.test || answers.interpret)
    || stepIndex === 4 && (!answers.interpret || revisions)
    || stepIndex >= 5 && (revisions !== stepIndex - 4 || revisions > 3)
    || stepIndex < 0 || stepIndex > 7) fail();
}

/** An in-memory continuation cannot recreate data removed by reset/restore elsewhere.
 * Fresh activity creation uses a separate initial save in the UI. */
export function assertPracticeContinuation(active: ProblemSolvingDraft, saved: ProblemSolvingDraft | null): void {
  const stable = (value: unknown): unknown => Array.isArray(value) ? value.map(stable)
    : value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)]))
      : value;
  if (!saved || JSON.stringify(stable(saved)) !== JSON.stringify(stable(active))) {
    throw Error('This experiment was cleared or changed elsewhere. Open an idea to continue from what is saved.');
  }
}
