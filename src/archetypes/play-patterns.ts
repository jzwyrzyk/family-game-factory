/**
 * A large differentiation library WITHOUT pretending there are 88 finished games.
 * 22 structural archetypes x 4 authored, distinct gameplay patterns = 88
 * RESEARCH HYPOTHESES. Themes are child-owned and are never used to score novelty.
 * Promotion to an executable game requires browser/sandbox and fidelity evidence.
 */
import {archetypeById,mechanicById,type Input} from './catalog';
import {validateExperienceSignature,type ExperienceSignature,type PlayerVerb,type Challenge,type Goal,type Pace} from './diversity';

export interface PlayPattern {
 readonly id:string;readonly archetypeId:string;readonly title:string;
 readonly signature:ExperienceSignature;
 readonly maturity:'design-only';
}
type Row=readonly [string,string,string,PlayerVerb,Challenge,Goal,Pace,readonly string[],string];
const rows:readonly Row[]=[
 ["platformer","star-hop","Star-hop expedition","collect","hazard","collect","continuous",["collect-item","score-counter"],"The character gathers stars and the collection is visible"],
 ["platformer","timed-rescue","Timed platform rescue","navigate","time-pressure","reach","timed",["countdown","checkpoint"],"The player escapes the platform course before time expires"],
 ["platformer","shield-quest","Shielded platform quest","reflect","enemy","defeat","staged",["reflect-projectile","shield-window","health-damage"],"A bounced enemy spell strikes its owner and defeats the attacker"],
 ["platformer","bounce-maze","Bouncy platform puzzle","navigate","logic","solve","self-paced",["bounce","win-zone"],"A bounce sequence unlocks a route to the destination"],
 ["endless-runner","snack-dash","Snack dash","collect","hazard","collect","continuous",["collect-item","score-counter"],"Picked up snacks count while the runner avoids obstacles"],
 ["endless-runner","meteor-escape","Meteor escape","avoid","hazard","survive","continuous",["collision","health-damage"],"The runner survives repeated falling hazards"],
 ["endless-runner","spring-marathon","Spring marathon","navigate","precision","reach","staged",["bounce","checkpoint"],"Bounces carry the runner to a new finish area"],
 ["endless-runner","giant-cat","Grow until giant","grow","resources","grow","staged",["collect-item","grow-on-collect"],"The avatar visibly grows with each collected donut"],
 ["side-driving","rock-crawler","Rock crawler","drive","terrain","reach","staged",["vehicle-traction","vehicle-suspension"],"The car climbs difficult terrain without getting stuck"],
 ["side-driving","egg-courier","Dinosaur egg courier","collect","precision","deliver","staged",["collect-item","score-counter"],"The truck brings gathered eggs safely to the delivery area"],
 ["side-driving","hill-sprint","Hill sprint","race","time-pressure","reach","timed",["countdown","checkpoint"],"The car reaches the finish before the timer ends"],
 ["side-driving","stunt-cart","Stunt cart","balance","precision","score","staged",["launch-force","load-balance"],"The vehicle performs a controllable airborne stunt"],
 ["top-driving","traffic-dodge","Traffic dodge","steer","hazard","survive","continuous",["collision","health-damage"],"The driver survives traffic without crashing"],
 ["top-driving","circuit-record","Circuit record","race","time-pressure","score","timed",["checkpoint","countdown"],"Lap completion produces a timed result"],
 ["top-driving","parking-test","Parking test","steer","precision","reach","self-paced",["win-zone","collision"],"The car parks inside a marked target without hitting obstacles"],
 ["top-driving","pursuit-escape","Pursuit escape","chase","enemy","reach","staged",["follow-target","checkpoint"],"The player escapes pursuing cars and reaches safety"],
 ["flight-dodge","asteroid-flight","Asteroid flight","avoid","hazard","survive","continuous",["collision","health-damage"],"The spacecraft survives a field of moving asteroids"],
 ["flight-dodge","star-scooper","Star scooper","collect","time-pressure","collect","timed",["collect-item","countdown"],"The ship gathers enough stars before the timer runs out"],
 ["flight-dodge","laser-reflector","Laser reflector","reflect","enemy","defeat","staged",["reflect-projectile","health-damage"],"The shield returns a laser into the alien"],
 ["flight-dodge","flight-course","Precision flight course","fly","precision","reach","self-paced",["win-zone","checkpoint"],"The spacecraft passes through narrow gates to finish"],
 ["roaming-arcade","treasure-search","Treasure search","explore","exploration","collect","staged",["collect-item","inventory"],"The explorer finds and keeps hidden treasures"],
 ["roaming-arcade","tag-chase","Tag chase","chase","enemy","score","timed",["follow-target","countdown"],"The chaser tags targets to score before time runs out"],
 ["roaming-arcade","rescue-map","Rescue map","navigate","hazard","deliver","staged",["win-zone","checkpoint"],"A lost character reaches a safe destination"],
 ["roaming-arcade","creative-explorer","Creative explorer","build","resources","create","self-paced",["craft-recipe","inventory"],"Gathered ingredients become a player-built object"],
 ["projectile-defense","dragon-mirror","Dragon mirror shield","reflect","enemy","defeat","staged",["reflect-projectile","shield-window","health-damage"],"The dragon is hit by its own reflected fireball"],
 ["projectile-defense","archery-range","Archery range","aim","precision","score","self-paced",["aim-direction","fire-projectile","score-counter"],"An aimed arrow strikes the selected target"],
 ["projectile-defense","castle-guard","Castle guard","protect","enemy","protect","continuous",["enemy-waves","health-damage"],"The island withstands waves of incoming attacks"],
 ["projectile-defense","charge-storm","Charged spell survival","shoot","time-pressure","survive","timed",["charge-action","fire-projectile","countdown"],"A charged spell clears hazards before the time limit"],
 ["sports-ball","goal-shot","Goal shot","aim","precision","score","staged",["aim-direction","score-counter"],"A well-aimed ball enters the goal and raises the score"],
 ["sports-ball","wall-pinball","Wall pinball","balance","hazard","survive","continuous",["bounce","collision"],"The ball survives successive wall bounces"],
 ["sports-ball","basket-tricks","Basket tricks","throw","precision","score","self-paced",["throw-object","score-counter"],"The thrown object lands in the chosen basket"],
 ["sports-ball","speed-hoops","Speed hoops","shoot","time-pressure","score","timed",["countdown","score-counter"],"Successful shots accumulate before the clock ends"],
 ["tower-waves","castle-last-stand","Castle last stand","protect","enemy","survive","continuous",["enemy-waves","health-damage"],"The player's defenses stop repeated enemies"],
 ["tower-waves","turret-upgrades","Upgrade the towers","manage","resources","protect","staged",["upgrade-choice","resource-economy"],"Earned resources improve the towers against later waves"],
 ["tower-waves","path-blockade","Path blockade","build","logic","protect","turn-based",["grid-obstacle","enemy-waves"],"Placed defenses redirect the route that enemies take"],
 ["tower-waves","final-barrage","Final barrage","shoot","time-pressure","survive","timed",["fire-projectile","countdown"],"Shots prevent the last enemy wave before time expires"],
 ["grid-navigation","robot-exit","Robot exit","navigate","logic","reach","staged",["grid-step","grid-obstacle"],"The robot reaches the end of an obstacle grid"],
 ["grid-navigation","portal-grid","Portal grid","solve","logic","reach","self-paced",["paired-portals","grid-step"],"The robot uses a portal to bypass an impassable corridor"],
 ["grid-navigation","speed-maze","Speed maze","navigate","time-pressure","reach","timed",["countdown","win-zone"],"The player exits the maze before time runs out"],
 ["grid-navigation","maze-treasure","Maze treasure hunt","collect","hidden-information","collect","staged",["collect-item","inventory"],"Found objects remain collected while the maze is explored"],
 ["hidden-grid","safe-cells","Safe cells","reveal","hidden-information","solve","self-paced",["reveal-hidden","retry-reset"],"Careful cell reveals distinguish safe spaces from hazards"],
 ["hidden-grid","clue-tiles","Clue tiles","solve","logic","solve","staged",["hint-reveal","reveal-hidden"],"Each useful clue helps identify the next safe square"],
 ["hidden-grid","memory-tiles","Memory tiles","match","memory","solve","turn-based",["match-pairs","reveal-hidden"],"Remembered matching tile pairs stay revealed"],
 ["hidden-grid","reveal-rush","Reveal rush","reveal","time-pressure","score","timed",["countdown","score-counter"],"Correct hidden tiles score before the timer ends"],
 ["matching-sorting","color-lab","Color sorting lab","sort","logic","solve","self-paced",["sort-by-rule","drag-place"],"Each object ends in its matching color location"],
 ["matching-sorting","merge-garden","Merge garden","merge","resources","grow","staged",["merge-objects","resource-economy"],"Combined seeds become a visibly bigger plant"],
 ["matching-sorting","memory-pairs","Memory pairs","match","memory","solve","turn-based",["match-pairs","reveal-hidden"],"Every correctly matched pair stays discovered"],
 ["matching-sorting","conveyor-sort","Conveyor sorting race","sort","time-pressure","score","timed",["sort-by-rule","countdown"],"Correct sorts score as the conveyor continues moving"],
 ["route-programming","robot-coder","Robot coder","program","logic","reach","self-paced",["program-route","route-playback"],"The robot executes the player's instructions to reach the star"],
 ["route-programming","portal-algorithm","Portal algorithm","program","logic","solve","staged",["paired-portals","program-route"],"A planned route successfully uses portals to solve a maze"],
 ["route-programming","delivery-script","Delivery script","program","precision","deliver","staged",["program-route","inventory"],"The robot follows a programmed delivery route carrying an item"],
 ["route-programming","timed-algorithm","Timed algorithm","time","time-pressure","reach","timed",["program-route","countdown"],"A completed program reaches its target before a deadline"],
 ["turn-strategy","turn-duel","Turn duel","choose","enemy","defeat","turn-based",["turn-taking","health-damage"],"A sequence of decisions defeats a rival"],
 ["turn-strategy","tactical-grid","Tactical grid","navigate","logic","reach","turn-based",["turn-taking","grid-step"],"Planned moves reach the desired square"],
 ["turn-strategy","trading-strategy","Trading strategy","trade","resources","manage","turn-based",["resource-economy","turn-taking"],"A sequence of trades produces a sustainable resource reserve"],
 ["turn-strategy","defense-council","Defense council","protect","enemy","protect","staged",["turn-taking","enemy-waves"],"Successive strategic choices repel advancing enemies"],
 ["words-trivia","word-builder","Word builder","solve","logic","solve","staged",["word-answer","level-sequence"],"Correctly formed words unlock the next challenge"],
 ["words-trivia","lightning-quiz","Lightning quiz","time","time-pressure","score","timed",["word-answer","countdown"],"Correct answers accumulate before the time limit"],
 ["words-trivia","clue-word","Clue word discovery","reveal","hidden-information","discover","self-paced",["hint-reveal","word-answer"],"A useful clue leads to the hidden word"],
 ["words-trivia","sentence-sort","Sentence sorting","sort","logic","solve","self-paced",["sort-by-rule","word-answer"],"Words are arranged into a correct sentence"],
 ["drag-creation","sticker-rocket","Sticker rocket","assemble","expression","create","self-paced",["sticker-decorate","launch-animation"],"The player's decorated rocket visibly takes off"],
 ["drag-creation","dress-up","Dress-up scene","decorate","expression","create","self-paced",["decorate-scene","color-customize"],"The character wears and keeps the child's chosen pieces"],
 ["drag-creation","dancing-robot","Build a dancing robot","assemble","construction","perform","staged",["snap-assemble","celebration"],"The completed robot animates a dance"],
 ["drag-creation","drawn-mural","Draw a mural","build","expression","create","self-paced",["draw-asset","decorate-scene"],"The child's drawing remains on the scene"],
 ["physical-construction","bridge-maker","Bridge maker","build","construction","deliver","staged",["joint-attach","load-balance"],"A load crosses the completed bridge without collapse"],
 ["physical-construction","wobbly-stack","Wobbly tower","balance","precision","survive","self-paced",["stack-parts","joint-break"],"The player's structure withstands a changing load"],
 ["physical-construction","flying-contraption","Flying contraption","launch","construction","reach","staged",["launch-force","gravity"],"The built machine launches to an elevated destination"],
 ["physical-construction","wheel-workshop","Wheel workshop","assemble","terrain","reach","staged",["rotating-wheel","vehicle-suspension"],"A constructed vehicle rolls across terrain"],
 ["physics-puzzle","catapult-angle","Catapult angle","aim","precision","reach","staged",["launch-force","gravity"],"The launched ball lands in a distant target"],
 ["physics-puzzle","domino-fall","Domino fall","balance","construction","solve","self-paced",["stack-parts","collision"],"A chain of contacts knocks down the desired pieces"],
 ["physics-puzzle","lift-challenge","Lift challenge","build","terrain","reach","self-paced",["launch-force","load-balance"],"Changing the balance lifts an object over an obstacle"],
 ["physics-puzzle","gap-bridge","Gap bridge","navigate","precision","deliver","staged",["joint-attach","load-balance"],"A moving load crosses the player's balanced bridge"],
 ["rhythm-reaction","beat-tap","Beat tap","time","coordination","perform","staged",["rhythm-beat","timed-action"],"On-beat actions complete a musical pattern"],
 ["rhythm-reaction","rhythm-shield","Rhythm shield","reflect","enemy","survive","timed",["shield-window","reflect-projectile"],"A well-timed shield deflects attacks"],
 ["rhythm-reaction","catch-the-beat","Catch the beat","catch","time-pressure","score","timed",["timed-action","collect-item"],"Timed catches build a score before the clock ends"],
 ["rhythm-reaction","music-sequence","Music sequence","program","logic","perform","self-paced",["program-route","rhythm-beat"],"The chosen sequence plays back as a musical pattern"],
 ["choice-discovery","splash-choice","Splash choice","choose","hidden-information","survive","staged",["reveal-hidden","branch-choice"],"Selecting a bucket reveals a surprising result"],
 ["choice-discovery","mystery-doors","Mystery doors","choose","exploration","discover","self-paced",["branch-choice","inventory"],"Each door reveals a different space and item"],
 ["choice-discovery","clue-guess","Clue guessing","solve","logic","discover","staged",["hint-reveal","branch-choice"],"Following a clue leads to the correct surprise"],
 ["choice-discovery","branching-fable","Branching fable","choose","exploration","perform","turn-based",["narrative-dialogue","branch-choice"],"A story unfolds differently from the child's choices"],
 ["interactive-adventure","treasure-quest","Treasure quest","explore","exploration","collect","staged",["inventory","collect-item"],"Found treasures fill an inventory that can be used"],
 ["interactive-adventure","conversation-quest","Conversation quest","choose","logic","discover","turn-based",["narrative-dialogue","branch-choice"],"Conversations open distinct branches of the story"],
 ["interactive-adventure","rescue-adventure","Rescue adventure","navigate","enemy","deliver","staged",["follow-target","checkpoint"],"A lost character is guided past danger to safety"],
 ["interactive-adventure","crafting-journey","Crafting journey","build","resources","create","self-paced",["craft-recipe","inventory"],"Collected materials become a crafted tool"],
 ["nurture-management","pet-companion","Pet companion","care","care","care","self-paced",["care-meter","upgrade-choice"],"Careful actions improve the pet's condition"],
 ["nurture-management","tiny-bakery","Tiny bakery","manage","resources","manage","staged",["resource-economy","craft-recipe"],"Baked items become usable shop resources"],
 ["nurture-management","seed-garden","Seed garden","grow","resources","grow","staged",["collect-item","resource-economy"],"A planted garden produces a harvest to collect"],
 ["nurture-management","village-builder","Village builder","build","construction","create","self-paced",["snap-assemble","resource-economy"],"Placed and connected buildings form a village"],
];
export const playPatterns:readonly PlayPattern[]=Object.freeze(rows.map(([archetypeId,slug,title,verb,challenge,goal,pace,extras,payoff])=>{
 const archetype=archetypeById.get(archetypeId);
 if(!archetype)throw Error('PLAY_PATTERN_ARCHETYPE_MISSING_'+archetypeId);
 const allMechanics=[...new Set([...archetype.coreMechanics,...extras])];
 const signature:ExperienceSignature=Object.freeze({
  archetypeId,verb,control:archetype.input as Input,challenge,goal,pace,
  mechanics:Object.freeze(allMechanics),payoff
 });
 validateExperienceSignature(signature);
 return Object.freeze({id:archetypeId+'/'+slug,archetypeId,title,signature,maturity:'design-only' as const});
}));
export const playPatternById:ReadonlyMap<string,PlayPattern>=new Map(playPatterns.map(p=>[p.id,p]));
export function validatePlayPatterns():void{
 if(playPatterns.length!==88||playPatternById.size!==playPatterns.length)throw Error('PLAY_PATTERN_LIBRARY_SIZE_OR_ID');
 for(const a of archetypeById.values()){
  const group=playPatterns.filter(p=>p.archetypeId===a.id);
  if(group.length!==4)throw Error('PLAY_PATTERN_ARCHETYPE_DENSITY_'+a.id);
  const sig=(p:PlayPattern)=>JSON.stringify({verb:p.signature.verb,challenge:p.signature.challenge,goal:p.signature.goal,
   pace:p.signature.pace,mechanics:[...p.signature.mechanics].sort()});
  if(new Set(group.map(sig)).size!==group.length)throw Error('PLAY_PATTERN_REPEAT_'+a.id);
  // Warn the author if four entries are merely four names for one fixed action.
  if(new Set(group.map(p=>p.signature.verb)).size<2||new Set(group.map(p=>p.signature.goal)).size<2)
   throw Error('PLAY_PATTERN_TOO_NARROW_'+a.id);
 }
 for(const p of playPatterns)for(const id of p.signature.mechanics)if(!mechanicById.has(id))throw Error('PLAY_PATTERN_MISSING_MECHANIC_'+id);
}
validatePlayPatterns();
