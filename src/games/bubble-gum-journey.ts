import {OBJECTS, type ObjectId} from './bubble-gum-art';
import {getBlueprint, isReady, readBuild, TOUR_DURATION_MS, type BuildState, type SceneKind} from './bubble-gum-rules';

export const LAUNCH_DURATION_MS = 5_000;
export const JOURNEY_DURATION_MS = TOUR_DURATION_MS;
export type JourneyTier = 0 | 1 | 2;
export type SceneIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export interface JourneyStop { sceneIndex: SceneIndex; caption: string }
export interface PartFinding {
  slotId: string; objectId: ObjectId; role: string; fit: number; detail: string;
  core: boolean; weight: number;
}
export interface BuildEvaluation {
  ready: boolean; score: number; tier: JourneyTier; title: string;
  reason: string; suggestion: string; outcome: string;
  goalDistance: number; distanceLabel: 'gum miles' | 'bubble miles' | 'cheers';
  wobble: number; speed: number; stops: readonly JourneyStop[];
  findings: readonly PartFinding[];
  swap?: {slotId: string; from: ObjectId; to: ObjectId; improvement: number};
}

interface ObjectFit { fit: number; detail: string }
interface RoleProfile {
  label: string; benefit: string; objects: Readonly<Partial<Record<ObjectId, ObjectFit>>>;
}
const fit = (score: number, detail: string): ObjectFit => ({fit: score, detail});

/** Inspectable toy engineering, not a force simulation or a grade for the child.
 * Fits describe an object's visible job: broad wings catch air, a fork moves
 * less water than a spoon, a soft brush makes a quieter beat. Object identity
 * is used directly; tray position, answer order, randomness and taps are absent.
 */
export const ROLE_PROFILES = {
  airBody: {label: 'light body', benefit: 'a lighter body', objects: {
    bottle: fit(95, 'keeps the body light'), can: fit(55, 'makes a heavier body'),
    cup: fit(85, 'keeps the body light'), teacup: fit(30, 'makes a heavier body'), basket: fit(55, 'carries a roomy basket'),
  }},
  hull: {label: 'floating body', benefit: 'a smoother swim', objects: {
    bottle: fit(95, 'slides through the water'), can: fit(75, 'makes a sturdy hull'),
    sponge: fit(90, 'bobs on the water'), basket: fit(35, 'lets water splash through'),
  }},
  fishBody: {label: 'swimming body', benefit: 'a smoother swim', objects: {
    spoon: fit(95, 'glides through the water'), brush: fit(35, 'makes a splashy swim'),
  }},
  roadBody: {label: 'rolling frame', benefit: 'a steadier frame', objects: {
    shoe: fit(90, 'makes a steady base'), box: fit(55, 'makes a bouncy body'),
    can: fit(85, 'makes a sturdy frame'), carton: fit(45, 'makes a flexible frame'),
  }},
  board: {label: 'board', benefit: 'a steadier board', objects: {
    ruler: fit(95, 'makes a wide board'), 'craft-stick': fit(65, 'makes a narrow board'),
  }},
  stageBody: {label: 'dancing frame', benefit: 'a steadier dance', objects: {
    box: fit(90, 'holds a steady pose'), carton: fit(55, 'makes a bouncy body'), basket: fit(70, 'makes a springy body'),
  }},
  head: {label: 'balanced head', benefit: 'a lighter head', objects: {
    can: fit(70, 'holds its head steady'), bowl: fit(35, 'makes a top-heavy wobble'),
    cup: fit(90, 'keeps its head light'), teacup: fit(45, 'makes a top-heavy wobble'),
  }},
  nose: {label: 'nose', benefit: 'smoother airflow', objects: {
    funnel: fit(90, 'guides the air smoothly'), cup: fit(35, 'catches the passing air'),
  }},
  wing: {label: 'wing', benefit: 'more lift', objects: {
    'paper-wing': fit(100, 'catches plenty of air'), ruler: fit(25, 'makes a narrow wing'),
  }},
  booster: {label: 'booster', benefit: 'a stronger puff', objects: {
    tube: fit(95, 'gives a strong puff'), cup: fit(35, 'gives a gentle puff'),
  }},
  airDrive: {label: 'propeller', benefit: 'more air push', objects: {
    fan: fit(100, 'pushes the air along'), comb: fit(25, 'gives a gentle flutter'),
  }},
  waterDrive: {label: 'swimming tail', benefit: 'more water push', objects: {
    fan: fit(100, 'pushes the water along'), 'paper-wing': fit(40, 'gives a gentle swish'),
  }},
  fin: {label: 'fin', benefit: 'a steadier swim', objects: {
    'paper-wing': fit(90, 'makes a broad fin'), comb: fit(35, 'lets water slip through'), fork: fit(20, 'lets water slip through'),
    'paper-sail': fit(80, 'makes a broad fin'), sock: fit(35, 'makes a floppy fin'),
  }},
  paddle: {label: 'paddle', benefit: 'more paddle push', objects: {
    spoon: fit(95, 'scoops a big paddleful'), fork: fit(25, 'lets water slip through'),
  }},
  scope: {label: 'periscope', benefit: 'a taller lookout', objects: {
    straw: fit(90, 'makes a tall lookout'), tube: fit(50, 'makes a short lookout'),
  }},
  mast: {label: 'mast', benefit: 'a steadier sail', objects: {
    ruler: fit(95, 'holds the sail steady'), 'craft-stick': fit(85, 'holds the sail upright'),
  }},
  sail: {label: 'sail', benefit: 'more wind push', objects: {
    'paper-sail': fit(100, 'catches the wind'), sock: fit(25, 'makes a floppy sail'),
  }},
  flag: {label: 'flag', benefit: 'a brighter flutter', objects: {
    'paper-wing': fit(85, 'makes a light flag'), comb: fit(35, 'makes a heavy flag'),
    'paper-sail': fit(90, 'makes a bright flutter'), sock: fit(45, 'makes a floppy flag'),
  }},
  wheel: {label: 'wheel', benefit: 'a steadier roll', objects: {
    wheel: fit(100, 'grips as it rolls'), cd: fit(60, 'makes a slippery wheel'),
    lid: fit(75, 'grips with its edges'), button: fit(20, 'makes a tiny wheel'),
  }},
  handle: {label: 'handle', benefit: 'steadier steering', objects: {
    ruler: fit(95, 'makes a firm handle'), straw: fit(70, 'makes a light handle'), spring: fit(25, 'makes a wiggly handle'),
  }},
  spoiler: {label: 'steering tail', benefit: 'steadier steering', objects: {
    'paper-wing': fit(85, 'catches the passing air'), spoon: fit(35, 'makes a heavier tail'), fork: fit(25, 'makes a narrow tail'),
  }},
  airTail: {label: 'rudder', benefit: 'steadier steering', objects: {
    spoon: fit(75, 'makes a broad rudder'), fork: fit(35, 'makes a narrow rudder'),
  }},
  pipe: {label: 'tail pipe', benefit: 'a stronger puff', objects: {
    straw: fit(65, 'gives a gentle puff'), tube: fit(85, 'gives a strong puff'),
  }},
  roof: {label: 'roof', benefit: 'a steadier roof', objects: {
    box: fit(75, 'makes a light roof'), bowl: fit(45, 'makes a heavier roof'),
  }},
  horn: {label: 'horn', benefit: 'a bigger toot', objects: {
    funnel: fit(90, 'makes a big toot'), cup: fit(65, 'makes a little toot'), lid: fit(55, 'makes a little ring'),
  }},
  drum: {label: 'drum', benefit: 'a bigger beat', objects: {
    can: fit(95, 'makes a ringing drum'), bowl: fit(80, 'makes a deep drumbeat'),
  }},
  drumstick: {label: 'drumstick', benefit: 'a clearer beat', objects: {
    'craft-stick': fit(100, 'taps a clear beat'), spoon: fit(90, 'taps a big beat'),
    fork: fit(60, 'taps a tinkly beat'), brush: fit(25, 'makes a soft shuffle'),
  }},
  arm: {label: 'dancing arm', benefit: 'a bigger swing', objects: {
    spoon: fit(85, 'makes a big swing'), fork: fit(65, 'makes a little swing'),
    brush: fit(30, 'makes a soft swish'), spring: fit(95, 'makes a bouncy arm'),
  }},
  feet: {label: 'dancing feet', benefit: 'steadier feet', objects: {
    shoe: fit(95, 'holds a steady step'), comb: fit(30, 'makes a tippy step'), sock: fit(40, 'makes a soft shuffle'),
  }},
  lift: {label: 'floating lift', benefit: 'more floating lift', objects: {
    balloon: fit(100, 'gives a floating lift'), 'paper-wing': fit(20, 'catches a little breeze'), fan: fit(30, 'gives a breezy push'),
  }},
  support: {label: 'lift support', benefit: 'steadier supports', objects: {
    straw: fit(75, 'makes a light support'), 'craft-stick': fit(95, 'makes a firm support'), spring: fit(35, 'makes a bouncy support'),
  }},
  window: {label: 'window', benefit: 'a wider window', objects: {
    lid: fit(80, 'makes a wide window'), button: fit(65, 'makes a tiny window'), cork: fit(55, 'makes a little lookout'),
  }},
  eye: {label: 'eye', benefit: 'a bright little eye', objects: {
    button: fit(90, 'makes a bright eye'), lid: fit(65, 'makes a big round eye'),
  }},
  seat: {label: 'seat', benefit: 'a lighter seat', objects: {
    cup: fit(85, 'makes a light seat'), teacup: fit(60, 'makes a roomy seat'),
  }},
  passenger: {label: 'passenger', benefit: 'a lighter passenger', objects: {
    cork: fit(85, 'makes a light passenger'), button: fit(70, 'makes a tiny passenger'),
  }},
  signal: {label: 'antenna', benefit: 'a taller antenna', objects: {
    straw: fit(80, 'makes a tall antenna'), spring: fit(45, 'makes a bouncy antenna'),
  }},
  decoration: {label: 'finishing touch', benefit: 'a new finishing touch', objects: {
    button: fit(70, 'adds a little sparkle'), lid: fit(80, 'adds a round sparkle'), cork: fit(75, 'adds a little bounce'),
    funnel: fit(85, 'adds a tall flourish'), cup: fit(65, 'adds a playful flourish'), bowl: fit(60, 'adds a round flourish'),
    comb: fit(75, 'adds a spiky flourish'), fan: fit(85, 'adds a spinning flourish'), cd: fit(90, 'catches the light'),
    sock: fit(55, 'adds a floppy flourish'), brush: fit(60, 'adds a fluffy flourish'),
    'paper-sail': fit(85, 'adds a light flutter'),
  }},
} as const satisfies Record<string, RoleProfile>;
export type PartRole = keyof typeof ROLE_PROFILES;
interface SlotRole { role: PartRole; weight: number; core: boolean }
interface BalancePair { left: string; right: string; behavior: 'air' | 'lift' | 'roll' | 'swim' | 'dance' }
interface RecipeRoles { slots: Readonly<Record<string, SlotRole>>; pair?: BalancePair }
const recipe = (core: readonly [string, PartRole, number][], extras: readonly [string, PartRole][], pair?: BalancePair): RecipeRoles => ({
  slots: Object.fromEntries([...core.map(([id, role, weight]) => [id, {role, weight, core: true}]),
    ...extras.map(([id, role]) => [id, {role, weight: 0, core: false}])]), ...(pair ? {pair} : {}),
});

/** Core weights name the visible jobs, not their position in an answer array.
 * Later optional pieces add at most two points each and never introduce a new
 * complexity penalty. Every five-part invention can reach every journey band.
 */
export const RECIPE_ROLES: Readonly<Record<string, RecipeRoles>> = {
  'rocket-pop': recipe([['body','airBody',1],['nose','nose',1],['left-wing','wing',2],['right-wing','wing',2],['booster','booster',2]],
    [['window','window'],['antenna','signal'],['flag','flag']], {left:'left-wing',right:'right-wing',behavior:'air'}),
  'bubble-sub': recipe([['body','hull',1.5],['periscope','scope',1],['tail','waterDrive',2],['window','window',.5],['paddle','paddle',2]],
    [['second-window','window'],['top-light','decoration'],['side-fin','fin']]),
  'silly-bot': recipe([['body','stageBody',2],['head','head',1],['left-arm','arm',1],['right-arm','arm',1],['feet','feet',2]],
    [['heart','decoration'],['hat','decoration'],['hand','decoration']], {left:'left-arm',right:'right-arm',behavior:'dance'}),
  'sneaker-scoot': recipe([['body','roadBody',1.5],['front-wheel','wheel',2],['back-wheel','wheel',2],['handle','handle',1],['spoiler','spoiler',.5]],
    [['lamp','decoration'],['flag','flag'],['bell','horn']], {left:'front-wheel',right:'back-wheel',behavior:'roll'}),
  'teacup-glider': recipe([['body','airBody',1.5],['left-wing','wing',2],['right-wing','wing',2],['propeller','airDrive',2],['tail','airTail',1]],
    [['pilot','passenger'],['left-tip','decoration'],['right-tip','decoration']], {left:'left-wing',right:'right-wing',behavior:'air'}),
  'sponge-sailor': recipe([['body','hull',2],['mast','mast',1],['sail','sail',2],['paddle','paddle',1.5],['flag','flag',.5]],
    [['passenger','seat'],['buoy','decoration'],['bow','decoration']]),
  'tin-can-taxi': recipe([['body','roadBody',1],['front-wheel','wheel',2],['back-wheel','wheel',2],['roof','roof',1],['horn','horn',.5]],
    [['window','window'],['flag','flag'],['tail','pipe']], {left:'front-wheel',right:'back-wheel',behavior:'roll'}),
  'kitchen-drummer': recipe([['body','drum',2],['head','head',1],['left-stick','drumstick',1],['right-stick','drumstick',1],['feet','feet',2]],
    [['badge','decoration'],['hat','decoration'],['cymbal','decoration']], {left:'left-stick',right:'right-stick',behavior:'dance'}),
  'balloon-buggy': recipe([['body','airBody',1.5],['left-rope','support',1],['left-balloon','lift',2.5],['right-rope','support',1],['right-balloon','lift',2.5]],
    [['pilot','passenger'],['rudder','airTail'],['banner','flag']], {left:'left-balloon',right:'right-balloon',behavior:'lift'}),
  'spoon-fish': recipe([['body','fishBody',2],['tail','waterDrive',2],['top-fin','fin',1],['bottom-fin','fin',1],['eye','eye',.5]],
    [['mouth','decoration'],['small-fin','fin'],['crown','decoration']], {left:'top-fin',right:'bottom-fin',behavior:'swim'}),
  'ruler-roller': recipe([['body','board',1.5],['front-wheel','wheel',2],['back-wheel','wheel',2],['seat','seat',.5],['handle','handle',1]],
    [['passenger','passenger'],['bell','horn'],['tail','decoration']], {left:'front-wheel',right:'back-wheel',behavior:'roll'}),
  'basket-boogie': recipe([['body','stageBody',2],['head','head',1],['left-arm','arm',1],['right-arm','arm',1],['feet','feet',2]],
    [['badge','decoration'],['hair','decoration'],['hand','decoration']], {left:'left-arm',right:'right-arm',behavior:'dance'}),
};

const stop = (sceneIndex: SceneIndex, caption: string): JourneyStop => ({sceneIndex, caption});
interface WorldJourney { titles: readonly [string,string,string]; outcomes: readonly [string,string,string]; stops: readonly [readonly JourneyStop[],readonly JourneyStop[],readonly JourneyStop[]] }
export const WORLD_JOURNEYS: Readonly<Record<SceneKind, WorldJourney>> = {
  sky: {
    titles: ['Cloud Looper','Moon Explorer','Galaxy Voyager'],
    outcomes: ['Your invention made a happy loop around the rainbow.','Your invention flew all the way to the Moon.','Your invention zoomed past a comet to a sparkling galaxy.'],
    stops: [
      [stop(0,'Up through the clouds'),stop(1,'Hello, rainbow!'),stop(0,'A happy cloud loop'),stop(1,'A rainbow celebration')],
      [stop(0,'Up through the clouds'),stop(1,'Past the rainbow'),stop(2,'The Moon is close!'),stop(2,'A loop around the Moon')],
      [stop(0,'Up through the clouds'),stop(1,'Past the rainbow'),stop(2,'Hello, Moon!'),stop(3,'Through the stars'),stop(4,'Round the ringed planet'),stop(5,'Chasing a comet'),stop(6,'Hello, galaxy!')],
    ],
  },
  sea: {
    titles: ['Bubble Bay','Palace Explorer','Deep-sea Glow'],
    outcomes: ['Your invention joined the happy parade in Bubble Bay.','Your invention discovered the sunken palace.','Your invention swam with a whale to the glowing deep sea.'],
    stops: [
      [stop(0,'Splash into Bubble Bay'),stop(1,'Hello, little fish!'),stop(2,'Past the shallow coral'),stop(3,'A bubbly bay parade')],
      [stop(0,'Splash into the sea'),stop(1,'Hello, little fish!'),stop(2,'Through the coral'),stop(3,'Following the bubbles'),stop(4,'The sunken palace!')],
      [stop(0,'Splash into the sea'),stop(1,'Hello, little fish!'),stop(2,'Through the coral'),stop(3,'Following the bubbles'),stop(4,'The sunken palace!'),stop(5,'Hello, friendly whale!'),stop(6,'The glowing deep sea!')],
    ],
  },
  road: {
    titles: ['Neighborhood Tour','Rainbow Bridge','Mountain Festival'],
    outcomes: ['Your invention joined a cheerful neighborhood parade.','Your invention rolled over the rainbow bridge.','Your invention climbed past town to the mountain festival.'],
    stops: [
      [stop(0,'Down the little lane'),stop(1,'Over a small hill'),stop(2,'Hello, meadow!'),stop(3,'The neighborhood parade')],
      [stop(0,'Off down the lane'),stop(1,'Over the little hill'),stop(2,'Through the meadow'),stop(3,'Past the town parade'),stop(4,'Over the rainbow bridge!')],
      [stop(0,'Off down the lane'),stop(1,'Over the little hill'),stop(2,'Through the meadow'),stop(3,'Past the town parade'),stop(4,'Over the rainbow bridge!'),stop(5,'The hilltop town!'),stop(6,'The mountain festival!')],
    ],
  },
  stage: {
    titles: ['Playroom Boogie','Theater Show','Star Festival'],
    outcomes: ['Your invention made the playroom dance along.','Your invention performed in the grand theater.','Your invention led a musical parade into the star festival.'],
    stops: [
      [stop(0,'Into the little spotlight'),stop(1,'A little wiggle'),stop(2,'A happy dance'),stop(3,'Take a bow!')],
      [stop(0,'Step into the spotlight'),stop(1,'A little wiggle'),stop(2,'A big happy dance'),stop(3,'Take a bow!'),stop(4,'The grand theater!')],
      [stop(0,'Step into the spotlight'),stop(1,'A little wiggle'),stop(2,'A big happy dance'),stop(3,'Take a bow!'),stop(4,'The grand theater!'),stop(5,'Lead the musical parade'),stop(6,'The star festival!')],
    ],
  },
};

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const tierOf = (score: number): JourneyTier => score >= 82 ? 2 : score >= 65 ? 1 : 0;

function assess(state: BuildState) {
  const blueprint = getBlueprint(state), plan = RECIPE_ROLES[blueprint.id];
  if (!plan) throw Error('Missing journey roles');
  const findings: PartFinding[] = [];
  let weightedFit = 0, totalWeight = 0, extraBonus = 0;
  for (const slot of blueprint.slots) {
    const rule = plan.slots[slot.id];
    if (!rule) throw Error('Missing journey slot role');
    if (rule.core) totalWeight += rule.weight;
    const objectId = state.placed[slot.id];
    if (!objectId) continue;
    const profile: RoleProfile = ROLE_PROFILES[rule.role], choice = profile.objects[objectId];
    if (!choice) throw Error(`Missing object role: ${blueprint.id}/${slot.id}/${objectId}`);
    findings.push({slotId: slot.id, objectId, role: profile.label, fit: choice.fit, detail: choice.detail, core: rule.core, weight: rule.weight});
    if (rule.core) weightedFit += choice.fit * rule.weight;
    else extraBonus += choice.fit / 50;
  }
  const left = findings.find(item => item.slotId === plan.pair?.left), right = findings.find(item => item.slotId === plan.pair?.right);
  const imbalance = left && right ? Math.abs(left.fit - right.fit) : 0;
  const score = Math.round(clamp(weightedFit / totalWeight - imbalance * .12 + extraBonus, 0, 100));
  return {blueprint, plan, findings, score, imbalance, left, right};
}

function reasonFor(assessment: ReturnType<typeof assess>, ready: boolean) {
  const {findings, left, right, imbalance, plan, score} = assessment;
  if (!ready) return findings.length ? `${OBJECTS[findings[0].objectId].name} is in place. Keep shaping your invention.` : 'Choose a piece to start your invention.';
  if (left && right && imbalance >= 35) {
    const names = `${OBJECTS[left.objectId].name} and ${OBJECTS[right.objectId].name}`;
    const behavior = {
      air: 'catch different amounts of air.', lift: 'lift differently, adding a playful wobble.',
      roll: 'roll differently, adding a playful wobble.', swim: 'push differently, making a wiggly swim.',
      dance: 'swing differently, making a wiggly dance.',
    };
    return `${names} ${behavior[plan.pair!.behavior]}`;
  }
  const ranked = findings.filter(item => item.core).sort((a,b) => score >= 82
    ? b.fit * b.weight - a.fit * a.weight : (100 - b.fit) * b.weight - (100 - a.fit) * a.weight);
  const first = ranked[0], second = ranked.find(item => item.objectId !== first.objectId) || ranked[1];
  return `${OBJECTS[first.objectId].name} ${first.detail}. ${OBJECTS[second.objectId].name} ${second.detail}.`;
}

/** Re-evaluation after a replay, save/restore, gum color change or button mash
 * produces the same route. Only the chosen objects and their authored roles
 * affect reach; every valid invention still gets the entire 29-second outing.
 */
export function evaluateBuild(input: BuildState): BuildEvaluation {
  const state = readBuild(input), assessment = assess(state), ready = isReady(state);
  const {blueprint, plan, score, findings, imbalance} = assessment;
  const tier = tierOf(score), journey = WORLD_JOURNEYS[blueprint.world];
  const result: BuildEvaluation = {
    ready, score, tier, title: journey.titles[tier], reason: reasonFor(assessment, ready),
    suggestion: 'Add the next piece, then give it a wiggle.', outcome: journey.outcomes[tier],
    goalDistance: ([28,62,100] as const)[tier], distanceLabel: blueprint.world === 'sea' ? 'bubble miles' : blueprint.world === 'stage' ? 'cheers' : 'gum miles',
    wobble: Number(clamp(.08 + (100-score)/125 + imbalance/250, .08, .95).toFixed(3)),
    speed: Number((.68 + score/100*.64).toFixed(3)),
    stops: journey.stops[tier].map(item => ({...item})), findings,
  };
  if (!ready) return result;
  const swaps = blueprint.slots.flatMap(slot => slot.accepts.filter(to => to !== state.placed[slot.id]).map(to => {
    const candidate = {...state, placed: {...state.placed, [slot.id]: to}};
    return {slotId: slot.id, from: state.placed[slot.id], to, improvement: assess(candidate).score - score, core: plan.slots[slot.id].core};
  }));
  swaps.sort((a,b) => b.improvement - a.improvement || Number(b.core) - Number(a.core) || a.slotId.localeCompare(b.slotId) || a.to.localeCompare(b.to));
  const best = swaps.find(item => item.improvement > 0) || swaps.find(item => item.core) || swaps[0];
  if (best) {
    const {slotId, from, to, improvement} = best;
    result.swap = {slotId, from, to, improvement};
    const benefit = improvement > 0 ? ROLE_PROFILES[plan.slots[slotId].role].benefit : 'another adventure';
    result.suggestion = `Try ${OBJECTS[to].name} instead of ${OBJECTS[from].name} for ${benefit}.`;
  }
  return result;
}
