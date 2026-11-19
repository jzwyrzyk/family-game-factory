/**
 * Jems Archetype Library v1 — a taxonomy and capability inventory, NOT 22 playable games.
 * Child intent remains authoritative. "native-example" means one of the six existing
 * games demonstrates a behavior, not that its code can be composed into another game.
 * These declarative records are safe to inspect in client or server contexts.
 */
import type {GameId} from '../runtime/types';

export type Family = 'action'|'puzzle'|'construction'|'story';
export type Engine = 'rules'|'physics-2d'|'either';
export type Input = 'tap'|'keyboard'|'drag'|'grid'|'steer'|'timed'|'choice';
export type MechanicSystem = 'movement'|'physics'|'combat'|'progress'|'puzzle'|'creation'|'presentation';
export type Maturity = 'catalogued'|'native-only'|'shared-prototype';
export interface MechanicDefinition {
  readonly id:string; readonly label:string; readonly system:MechanicSystem;
  readonly engine:Engine; readonly maturity:Maturity; readonly nativeExamples:readonly GameId[];
}
export interface ArchetypeDefinition {
  readonly id:string;readonly title:string;readonly family:Family;readonly input:Input;
  readonly engine:Engine;readonly loop:string;
  /** Examples of common rules, NOT mandatory features for every child or variant. */
  readonly coreMechanics:readonly string[];
  readonly nativeExample?:GameId;
}

/** Native-only reflects existing implementation; portable compatibility is NOT implied. */
const m=(id:string,label:string,system:MechanicSystem,engine:Engine='rules',nativeExamples:readonly GameId[]=[],sharedPrototype=false):MechanicDefinition=>Object.freeze({
 id,label,system,engine,maturity:sharedPrototype?'shared-prototype':nativeExamples.length?'native-only':'catalogued',nativeExamples:Object.freeze([...nativeExamples])
});
export const mechanics:readonly MechanicDefinition[]=Object.freeze([
 // Player movement and controls
 m('move-horizontal','Move left and right','movement','rules',['moon','dragon']),
 m('platform-jump','Jump onto platforms','movement','rules',['moon','dragon']),
 m('double-jump','Double jump','movement'),
 m('runner-scroll','Continuous forward scrolling','movement','rules',['moon']),
 m('drive-throttle','Accelerate and brake','movement','physics-2d',['hill']),
 m('drive-steer','Steer a vehicle','movement'),
 m('fly-vertical','Fly up and down','movement'),
 m('topdown-move','Move freely from above','movement'),
 m('grid-step','Move one grid tile','movement','rules',['robot']),
 m('program-route','Queue and execute commands','movement','rules',['robot']),
 m('follow-target','Follow a target','movement'),
 m('dash','Short burst of movement','movement'),
 m('teleport','Teleport between locations','movement','rules',['robot']),
 m('swim','Swim with buoyancy-like motion','movement'),
 m('camera-follow','Follow the player with the view','movement','rules',['hill']),
 // Object dynamics and constructions
 m('gravity','Gravity affects motion','physics','either',['hill','gum','moon']),
 m('bounce','Bounce on contact','physics','either',['moon']),
 m('collision','Detect object collision','physics','either',['moon','dragon','hill']),
 m('terrain-hills','Uneven driving terrain','physics','physics-2d',['hill']),
 m('vehicle-suspension','Wheel suspension','physics','physics-2d',['hill']),
 m('vehicle-traction','Wheel grip and slip','physics','physics-2d',['hill']),
 m('rotating-wheel','Independent wheel rotation','physics','physics-2d',['hill']),
 m('load-balance','Load changes balance','physics','physics-2d',['gum']),
 m('joint-attach','Attach parts with joints','physics','physics-2d',['gum']),
 m('joint-break','Break overstressed connections','physics','physics-2d',['gum']),
 m('launch-force','Launch with an impulse','physics','physics-2d',['gum']),
 m('push-block','Push a movable block','physics','either'),
 m('stack-parts','Stack movable pieces','physics','physics-2d',['gum']),
 // Actions, offense, defense, timing
 m('fire-projectile','Fire a projectile','combat','rules',['dragon']),
 m('reflect-projectile','Reverse a projectile toward its attacker','combat','rules',['dragon'],true),
 m('shield-window','Activate a timed shield','combat','rules',['dragon']),
 m('aim-direction','Aim a projectile','combat'),
 m('homing-projectile','Projectile follows target','combat'),
 m('area-attack','Attack an area','combat'),
 m('tap-target','Tap a target to act','combat'),
 m('throw-object','Throw a carried object','combat'),
 m('charge-action','Charge power before release','combat'),
 m('timed-action','Act inside a timing window','combat'),
 // Goals and progression
 m('collect-item','Collect an object','progress','rules',['moon'],true),
 m('score-counter','Track score or points','progress','rules',['moon','buckets']),
 m('grow-on-collect','Grow after collecting','progress','rules',[],true),
 m('health-damage','Lose health when hit','progress','rules',['dragon'],true),
 m('enemy-waves','Spawn repeated waves','progress'),
 m('checkpoint','Restart from a checkpoint','progress'),
 m('countdown','Time-limited goal','progress'),
 m('win-zone','Win by reaching a destination','progress','rules',['robot']),
 m('retry-reset','Reset a failed attempt','progress','rules',['robot','moon','hill']),
 m('level-sequence','Advance through levels','progress','rules',['robot','hill']),
 m('upgrade-choice','Select a gameplay upgrade','progress'),
 m('transform-payoff','Transform on reaching a goal','progress'),
 // Puzzles, choice and sequences
 m('grid-obstacle','Block movement on a grid','puzzle','rules',['robot']),
 m('route-playback','Animate a programmed route','puzzle','rules',['robot']),
 m('paired-portals','Connected portal destinations','puzzle','rules',['robot']),
 m('reveal-hidden','Reveal a concealed result','puzzle','rules',['buckets']),
 m('match-pairs','Match two items','puzzle'),
 m('sort-by-rule','Sort by shared properties','puzzle'),
 m('merge-objects','Combine matching objects','puzzle'),
 m('turn-taking','Alternate turns','puzzle'),
 m('branch-choice','Select an outcome path','puzzle','rules',['buckets']),
 m('inventory','Keep found items','puzzle'),
 m('logic-gate','Toggle a switch to change rules','puzzle'),
 m('word-answer','Enter or select a word answer','puzzle'),
 // Making and visible feedback
 m('drag-place','Drag objects to locations','creation','rules',['gum']),
 m('sticker-decorate','Decorate an object','creation','rules',['gum']),
 m('snap-assemble','Snap pieces together','creation','rules',['gum']),
 m('color-customize','Change colors or appearances','creation','rules',['hill']),
 m('draw-asset','Draw and retain an asset','creation'),
 m('decorate-scene','Arrange a scene freely','creation'),
 m('craft-recipe','Combine ingredients or parts','creation'),
 m('care-meter','Maintain a virtual character','creation'),
 m('resource-economy','Earn and spend resources','creation'),
 m('launch-animation','Animate a completed creation','presentation','rules',['gum']),
 m('celebration','Celebrate a completed objective','presentation','rules',['moon','robot']),
 m('narrative-dialogue','Show narrative choices and reactions','presentation'),
 m('rhythm-beat','Respond to rhythmic cues','presentation'),
 m('sound-effect','Trigger feedback sounds','presentation','rules',['hill','gum']),
 m('hint-reveal','Optional clue or hint','presentation','rules',['buckets'])
]);
const a=(id:string,title:string,family:Family,input:Input,engine:Engine,loop:string,coreMechanics:readonly string[],nativeExample?:GameId):ArchetypeDefinition=>Object.freeze({
 id,title,family,input,engine,loop,coreMechanics:Object.freeze([...coreMechanics]),...(nativeExample?{nativeExample}:{})
});
/** The 22 hypotheses in the research charter; coverage must be measured, not asserted. */
export const archetypes:readonly ArchetypeDefinition[]=Object.freeze([
 a('platformer','Side-scrolling platformer','action','keyboard','rules','Traverse platforms, avoid hazards and reach a goal',['move-horizontal','platform-jump','collision','win-zone']),
 a('endless-runner','Endless runner','action','keyboard','rules','Advance, avoid and collect',['runner-scroll','platform-jump','collect-item','retry-reset'],'moon'),
 a('side-driving','Side-view driving','action','steer','physics-2d','Drive across terrain and manage momentum',['drive-throttle','terrain-hills','vehicle-suspension','vehicle-traction'],'hill'),
 a('top-driving','Top-down driving','action','steer','rules','Steer, race and avoid obstacles',['drive-steer','collision','checkpoint']),
 a('flight-dodge','Flying and dodging','action','keyboard','rules','Fly through moving obstacles and collect objects',['fly-vertical','collision','collect-item']),
 a('roaming-arcade','Free-roaming arcade','action','keyboard','rules','Explore, chase or escape',['topdown-move','follow-target','win-zone']),
 a('projectile-defense','Projectile and defense','action','timed','rules','Defend, return attacks and win',['fire-projectile','reflect-projectile','shield-window','health-damage'],'dragon'),
 a('sports-ball','Sports and ball games','action','timed','either','Control a ball toward a goal',['collision','bounce','score-counter']),
 a('tower-waves','Wave and tower defense','action','tap','rules','Place defenses to stop waves',['enemy-waves','health-damage','score-counter']),
 a('grid-navigation','Grid navigation','puzzle','grid','rules','Navigate a constrained maze',['grid-step','grid-obstacle','win-zone'],'robot'),
 a('hidden-grid','Hidden-information puzzle','puzzle','tap','rules','Reveal safely using clues',['reveal-hidden','hint-reveal','retry-reset']),
 a('matching-sorting','Matching and sorting','puzzle','drag','rules','Recognize and combine patterns',['match-pairs','sort-by-rule','merge-objects']),
 a('route-programming','Programming and sequences','puzzle','grid','rules','Create commands then inspect their result',['program-route','grid-obstacle','route-playback'],'robot'),
 a('turn-strategy','Turn-based strategy','puzzle','choice','rules','Plan a sequence of decisions against constraints',['turn-taking','health-damage','score-counter']),
 a('words-trivia','Quizzes and word games','puzzle','choice','rules','Answer, learn and progress',['word-answer','score-counter','level-sequence']),
 a('drag-creation','Drag-and-drop creation','construction','drag','rules','Arrange objects and see an outcome',['drag-place','sticker-decorate','launch-animation'],'gum'),
 a('physical-construction','Physical construction','construction','drag','physics-2d','Attach, test and repair structures',['joint-attach','joint-break','load-balance'],'gum'),
 a('physics-puzzle','Physics puzzles','construction','drag','physics-2d','Use forces, mass and collisions to solve',['gravity','collision','launch-force']),
 a('rhythm-reaction','Rhythm and reaction','action','timed','rules','Act in sync with signals',['rhythm-beat','timed-action','score-counter']),
 a('choice-discovery','Choices and discovery','story','choice','rules','Choose and reveal surprising outcomes',['branch-choice','reveal-hidden','retry-reset'],'buckets'),
 a('interactive-adventure','Interactive adventure','story','choice','rules','Explore, interact and decide',['narrative-dialogue','inventory','branch-choice']),
 a('nurture-management','Nurturing and management','story','tap','rules','Care, create and manage resources',['care-meter','resource-economy','upgrade-choice'])
]);

export const mechanicById:ReadonlyMap<string,MechanicDefinition>=new Map(mechanics.map(x=>[x.id,x]));
export const archetypeById:ReadonlyMap<string,ArchetypeDefinition>=new Map(archetypes.map(x=>[x.id,x]));
export function validateArchetypeCatalog():void {
 const distinct=(a:readonly string[])=>new Set(a).size===a.length;
 if(archetypes.length!==22||!distinct(archetypes.map(x=>x.id))||!distinct(mechanics.map(x=>x.id)))throw Error('ARCHETYPE_CATALOG_DUPLICATE_OR_COUNT');
 for(const a of archetypes){
  if(!a.loop||!a.coreMechanics.length||!distinct(a.coreMechanics)||a.coreMechanics.some(k=>!mechanicById.has(k)))throw Error('ARCHETYPE_CATALOG_INVALID_'+a.id);
  if(a.engine==='rules'&&a.coreMechanics.some(k=>mechanicById.get(k)!.engine==='physics-2d'))throw Error('ARCHETYPE_ENGINE_MISMATCH_'+a.id);
 }
}
validateArchetypeCatalog();
