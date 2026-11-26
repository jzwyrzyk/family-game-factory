import {withinGrade, type Grade} from '../learning/grades';
import {validateCreationProject,type CreationBlock,type CreationProject} from './model';
import {SceneEngine} from './engine';

/** Open practice scenes, not protected assessment items or a measure of general ability. */
export type CreationChallengeId = 'robot-route' | 'dragon-bounces' | 'robot-taps' | 'early-cheer' | 'bucket-rule' | 'first-step' | 'fix-direction' | 'turn-the-corner' | 'meadow-corner';
export interface ChallengeInput {timeMs:number; type:'tap'; actorId:string}
export interface CreationChallenge {
  id:CreationChallengeId;
  grade?:Grade;
  prerequisites?:readonly CreationChallengeId[];
  title:string;
  brief:string;
  requirements:readonly string[];
  concepts:readonly string[];
  hint:string;
  extension:string;
  durationMs:number;
  previewInputs:readonly ChallengeInput[];
  testDescription:string;
}
export interface ChallengeCheck {id:string; label:string; passed:boolean; feedback:string}
export interface CreationChallengeResult {
  challengeId:string;
  status:'passed'|'needs-work'|'invalid';
  passed:boolean;
  feedback:string;
  checks:ChallengeCheck[];
  evidence:{
    kind:'formative';
    source:'bounded-scene-runs';
    assistance:'not-recorded';
    independentAssessment:false;
    generalThinkingScore:null;
    observations:string[];
  };
}

const earlyRoutes = {
 'first-step': [[80,0]],
 'fix-direction': [[-80,0]],
 'turn-the-corner': [[80,0],[0,-80]],
 'meadow-corner': [[80,0],[0,-80]]
} as const;
type EarlyRoute = keyof typeof earlyRoutes;
const isEarlyRoute = (id:string):id is EarlyRoute => Object.hasOwn(earlyRoutes,id);
function earlyChallenge(id:EarlyRoute,title:string,grade:Grade,brief:string,concepts:string[],prerequisites:CreationChallengeId[]):CreationChallenge{
 return {id,title,grade,brief,concepts,prerequisites,requirements:[brief,'Keep the other objects still.'],
  hint:'Watch the character. Follow the first arrow with your finger.',extension:'Try a different path in a copy.',
  durationMs:4500,previewInputs:[],testDescription:'We watch the path and where the character stops.'};
}
export const CREATION_CHALLENGES:readonly CreationChallenge[] = [
  earlyChallenge('first-step','One step right',-1,'Move the dragon one step to the right.',['movement','cause and effect'],[]),
  earlyChallenge('fix-direction','Turn it around',-1,'The dragon goes the wrong way. Make it go one step left.',['debugging','direction'],['first-step']),
  earlyChallenge('turn-the-corner','Around the corner',0,'Move the robot right, then up.',['sequence','direction'],['first-step']),
  earlyChallenge('meadow-corner','Try it in the meadow',0,'Make the dragon follow the same path. Right, then up.',['sequence','transfer'],['turn-the-corner']),
  {
    id:'robot-route', title:'Robot’s gem route',
    brief:'Watch the robot go up to the gem, across above the bucket, and down to the bucket. Make that route.',
    requirements:['Keep the objects in their original places.', 'Go up, then right, then down, following the target route.', 'Make each move visible, and finish at the blue bucket within 6 seconds.'],
    concepts:['sequence','prediction'],
    hint:'Look at the robot’s position before each turn. Which coordinate needs to change first?',
    extension:'After matching the route, make your own route in a copy of the scene.',
    durationMs:6000, previewInputs:[],
    testDescription:'We watch the whole route, including its turns. The final position alone does not match it.'
  },
  {
    id:'dragon-bounces', grade:0, title:'Three dragon bounces',
    brief:'Make the dragon bounce three times in the same spot, with a little rest between bounces.',
    requirements:['Keep the original scene and starting place.', 'Make three clear upward bounces, returning to the ground between them.', 'Stay in the same spot and finish resting on the ground within 5 seconds.'],
    concepts:['repetition','patterns'],
    hint:'Find the little pattern that happens again. You can repeat that pattern or write it out three times.',
    extension:'Try four bounces in a copy. What is the smallest change you can make?',
    durationMs:5000, previewInputs:[],
    testDescription:'A repeat block and three separately written bounces both work. We count the visible bounces.'
  },
  {
    id:'robot-taps', grade:0, title:'One tap, one step',
    brief:'The robot waits for you. Each time you tap it, it moves 120 steps to the right.',
    requirements:['Start in the original place and wait until the robot is tapped.', 'Move 120 steps right for each tap, then wait again.', 'The rule must work when the taps come at different times.'],
    concepts:['events','cause and effect'],
    hint:'What should begin the movement: starting the scene, or tapping the robot?',
    extension:'In a copy, make the bucket react to a tap in a different way.',
    durationMs:4600,
    previewInputs:[{timeMs:800,type:'tap',actorId:'robot'},{timeMs:2400,type:'tap',actorId:'robot'}],
    testDescription:'We try no taps, then two different tap schedules. Extra automatic steps do not match.'
  },
  {
    id:'early-cheer', title:'Fix the early cheer',
    brief:'The dragon cheers too soon. Watch the target, then change the program so it reaches the bucket before saying “Hooray!”',
    requirements:['Keep the original scene and starting place.', 'Move the dragon visibly to the bucket before it cheers.', 'Let us see “Hooray!” at the bucket, then finish there within 5 seconds.'],
    concepts:['debugging','order','testing'],
    hint:'Find the first moment that differs from the target. What should happen before the cheer?',
    extension:'In a copy, give the dragon a different celebration after it arrives.',
    durationMs:5000, previewInputs:[],
    testDescription:'We check when and where the cheer happens, not just where the dragon ends.'
  },
  {
    id:'bucket-rule', title:'Ready for three gems',
    brief:'Tap the bucket. With fewer than 3 gems it says “More”; with 3 or more it says “Ready”.',
    requirements:['Wait for a tap on the bucket.', 'Say “More” for 0 or 2 gems, and “Ready” for 3 or 5 gems.', 'Use the gem count you are given; do not change it.'],
    concepts:['conditions','variables','boundary testing'],
    hint:'Compare the gems variable with 3. What should the bucket do on each side of that boundary?',
    extension:'In a copy, choose a new number of gems and predict when the message will change.',
    durationMs:2200, previewInputs:[{timeMs:700,type:'tap',actorId:'bucket'}],
    testDescription:'We try counts of 0, 2, 3 and 5, with different tap times and no tap. The preview starts with 2 gems.'
  }
];

export function challengesForGrade(grade:Grade){
 return CREATION_CHALLENGES.filter(challenge=>withinGrade(challenge.grade??1,grade));
}
export function getCreationChallenge(id:string):CreationChallenge|undefined {
  return CREATION_CHALLENGES.find(challenge=>challenge.id===id);
}

const block = <T extends Omit<CreationBlock,'id'>>(id:string, value:T):CreationBlock => ({id,...value} as CreationBlock);
const program = (id:string, actorId:string, trigger:'start'|'tap', actions:CreationBlock[]) => ({id,actorId,trigger:{type:trigger},actions});

function baseProject(id:CreationChallengeId, target:boolean):CreationProject {
  const challenge=getCreationChallenge(id);
  if(!challenge) throw new RangeError('Choose an available creation challenge.');
  const robot=id==='turn-the-corner'||id==='robot-route'||id==='robot-taps';
  return {
    schema:'jems.creation.v1', id:`challenge-${id}-${target?'target':'work'}`,
    title:challenge.title,width:800,height:450,background:robot?'world-workshop-v1':'world-forest-v1',world:{edition:'jems.world.v1'},
    actors:[
      {id:robot?'robot':'dragon',name:robot?'Robot':'Dragon',assetId:robot?'robot':'dragon',x:150,y:320,size:82,visible:true},
      {id:'bucket',name:'Blue bucket',assetId:'bucket-blue',x:600,y:320,size:84,visible:true},
      ...(id==='robot-route'?[{id:'gem',name:'Gem',assetId:'gem',x:150,y:120,size:42,visible:true}]:[])
    ],
    programs:[], variables:id==='bucket-rule'?{gems:2}:{}, provenance:{createdBy:'starter'}
  };
}

/** The target is a separate preview project. Never copy its scripts into the child's starter. */
export function createChallengeTarget(id:string):CreationProject {
  const challenge=getCreationChallenge(id);
  if(!challenge) throw new RangeError('Choose an available creation challenge.');
  const project=baseProject(challenge.id,true);
  if(isEarlyRoute(challenge.id)){
    const actions=earlyRoutes[challenge.id].map(([dx,dy],i)=>block('step-'+i,{type:'move',dx,dy,durationMs:800}));
    project.programs=[program('follow-path',project.actors[0].id,'start',actions)];return project;
  }
  switch(challenge.id) {
    case 'robot-route':
      project.programs=[program('route','robot','start',[
        block('up',{type:'move',x:150,y:120,durationMs:650}),
        block('across',{type:'move',x:600,y:120,durationMs:1100}),
        block('down',{type:'move',x:600,y:320,durationMs:650})
      ])];break;
    case 'dragon-bounces':
      project.programs=[program('bounces','dragon','start',[
        block('three',{type:'repeat',count:3,actions:[
          block('bounce',{type:'jump',height:72,durationMs:600}),
          block('rest',{type:'wait',durationMs:200})
        ]})
      ])];break;
    case 'robot-taps':
      project.programs=[program('step-on-tap','robot','tap',[
        block('step',{type:'move',dx:120,durationMs:450})
      ])];break;
    case 'early-cheer':
      project.programs=[program('arrive-then-cheer','dragon','start',[
        block('arrive',{type:'move',x:600,y:320,durationMs:1300}),
        block('cheer',{type:'say',text:'Hooray!',durationMs:1100})
      ])];break;
    case 'bucket-rule':
      project.programs=[program('answer-on-tap','bucket','tap',[
        block('enough-gems',{type:'if',condition:{type:'variable',variable:'gems',operator:'gte',value:3},
          then:[block('ready',{type:'say',text:'Ready',durationMs:1000})],
          else:[block('more',{type:'say',text:'More',durationMs:1000})]})
      ])];break;
  }
  return project;
}

export function createChallengeStarter(id:string):CreationProject {
  const challenge=getCreationChallenge(id);
  if(!challenge) throw new RangeError('Choose an available creation challenge.');
  const project=baseProject(challenge.id,false);
  const actorId=challenge.id==='bucket-rule'?'bucket':challenge.id==='turn-the-corner'||challenge.id==='robot-route'||challenge.id==='robot-taps'?'robot':'dragon';
  project.programs=[program('my-program',actorId,'start',[])];
  if(challenge.id==='fix-direction')project.programs[0].actions=[block('wrong-way',{type:'move',dx:80,dy:0,durationMs:800})];
  if(challenge.id==='early-cheer') {
    project.programs[0].actions=[
      block('cheer-too-early',{type:'say',text:'Hooray!',durationMs:1100}),
      block('arrive-after-cheering',{type:'move',x:600,y:320,durationMs:1300})
    ];
  }
  return project;
}

type Snapshot=ReturnType<SceneEngine['snapshot']>;
type Actor=Snapshot['actors'][number];
interface Frame {elapsedMs:number; snapshot:Snapshot}
interface ObservedRun {frames:Frame[]; limitReached:boolean}
const SAMPLE_MS=50;
const POSITION_TOLERANCE=14;

function observe(project:CreationProject,durationMs:number,inputs:readonly ChallengeInput[]=[]):ObservedRun {
  const engine=new SceneEngine(project);
  engine.start();
  const frames:Frame[]=[];
  const schedule=[...inputs].sort((a,b)=>a.timeMs-b.timeMs);
  let inputIndex=0;
  // Test clock advances even while the event-driven scene is idle. The engine's own
  // deterministic tick and execution limits remain in force; no real timer is used.
  for(let elapsedMs=0;elapsedMs<=durationMs;elapsedMs+=SAMPLE_MS) {
    while(inputIndex<schedule.length&&schedule[inputIndex].timeMs<=elapsedMs) {
      engine.tap(schedule[inputIndex].actorId);inputIndex++;
    }
    frames.push({elapsedMs,snapshot:engine.snapshot()});
    if(elapsedMs<durationMs) engine.step(SAMPLE_MS);
  }
  return {frames,limitReached:frames.some(frame=>frame.snapshot.trace.some(entry=>entry.type==='limit'))};
}

const actorAt=(frame:Frame,id:string):Actor|undefined=>frame.snapshot.actors.find(actor=>actor.id===id);
export const movementChoices=['left','right','up','down','still'] as const;
export type MovementChoice=typeof movementChoices[number];
export interface MovementPrediction {choice:MovementChoice;observed:MovementChoice}
export function predictActor(id:string){
 if(!Object.hasOwn(earlyRoutes,id))return null;
 return id==='turn-the-corner'?'robot':'dragon';
}
/** The first visibly displaced position in this bounded run. A diagonal tie
 * or disappearing actor cannot establish a single directional observation. */
export function firstMovement(project:CreationProject,id:string):MovementChoice|null{
 const actorId=predictActor(id),goal=getCreationChallenge(id);if(!actorId||!goal)return null;
 const run=observe(project,goal.durationMs,goal.previewInputs),origin=actorAt(run.frames[0],actorId);
 if(!origin?.visible||run.limitReached)return null;
 for(const frame of run.frames){
  const actor=actorAt(frame,actorId);if(!actor?.visible)return null;
  const x=actor.x-origin.x,y=actor.y-origin.y;
  if(Math.max(Math.abs(x),Math.abs(y))<3)continue;
  if(Math.abs(Math.abs(x)-Math.abs(y))<1)return null;
  return Math.abs(x)>Math.abs(y)?(x<0?'left':'right'):(y<0?'up':'down');
 }
 return 'still';
}
const near=(actual:number,expected:number,tolerance=POSITION_TOLERANCE)=>Math.abs(actual-expected)<=tolerance;
const at=(actor:Actor|undefined,x:number,y:number)=>!!actor&&actor.visible&&near(actor.x,x)&&near(actor.y,y);
const normalSpeech=(speech:string|null|undefined)=>(speech??'').trim().toLowerCase().replace(/[.!?]+$/,'');
const check=(id:string,label:string,passed:boolean,success:string,failure:string):ChallengeCheck=>({id,label,passed,feedback:passed?success:failure});

function result(id:string,checks:ChallengeCheck[],invalid=false):CreationChallengeResult {
  const passed=!invalid&&checks.length>0&&checks.every(item=>item.passed);
  return {
    challengeId:id,status:invalid?'invalid':passed?'passed':'needs-work',passed,
    feedback:passed?'Your scene matches these goals. You can keep creating or try the extension.':checks.find(item=>!item.passed)?.feedback??'Choose a challenge to try.',
    checks,
    evidence:{kind:'formative',source:'bounded-scene-runs',assistance:'not-recorded',independentAssessment:false,generalThinkingScore:null,
      observations:checks.filter(item=>item.passed).map(item=>item.feedback)}
  };
}

function sceneMatches(id:CreationChallengeId,project:CreationProject):boolean {
  const expected=baseProject(id,false);
  if(project.width!==expected.width||project.height!==expected.height||!Array.isArray(project.actors)) return false;
  return expected.actors.every(original=>{
    const matches=project.actors.filter(actor=>actor.id===original.id);
    return matches.length===1&&matches[0].assetId===original.assetId&&matches[0].visible!==false
      &&Math.abs(matches[0].x-original.x)<0.01&&Math.abs(matches[0].y-original.y)<0.01;
  });
}

function landmarksStayPut(id:CreationChallengeId,run:ObservedRun):boolean {
  const moving=id==='bucket-rule'?'bucket':id==='turn-the-corner'||id==='robot-route'||id==='robot-taps'?'robot':'dragon';
  const landmarks=baseProject(id,false).actors.filter(actor=>actor.id!==moving);
  return run.frames.every(frame=>landmarks.every(landmark=>at(actorAt(frame,landmark.id),landmark.x,landmark.y)));
}

const landmarkCheck=(passed:boolean)=>check('scene-landmarks','Keep the scene’s landmarks',passed,
  'The scene’s other objects stayed in their places.','Keep the other objects visible in their original places while your character follows the goal.');

interface Point{x:number;y:number}
function distanceToSegment(point:Point,start:Point,end:Point):number {
  const dx=end.x-start.x,dy=end.y-start.y;
  const fraction=Math.max(0,Math.min(1,((point.x-start.x)*dx+(point.y-start.y)*dy)/(dx*dx+dy*dy)));
  return Math.hypot(point.x-(start.x+fraction*dx),point.y-(start.y+fraction*dy));
}

function earlyPathChecks(id:EarlyRoute,run:ObservedRun):ChallengeCheck[] {
  const actorId=id==='turn-the-corner'?'robot':'dragon',route=earlyRoutes[id];
  let x=150,y=320,index=0,visibleTravel=false,matched=true;
  for(const frame of run.frames){
    const actor=actorAt(frame,actorId);
    if(!actor?.visible){matched=false;continue;}
    if(index===route.length){matched &&= at(actor,x,y);continue;}
    const [dx,dy]=route[index],end={x:x+dx,y:y+dy};
    matched &&= distanceToSegment(actor,{x,y},end)<=POSITION_TOLERANCE;
    if(Math.hypot(actor.x-x,actor.y-y)>18 && Math.hypot(actor.x-end.x,actor.y-end.y)>18)visibleTravel=true;
    if(at(actor,end.x,end.y)){matched &&= visibleTravel;index++;x=end.x;y=end.y;visibleTravel=false;}
  }
  return [check('follow-path','Follow the pictured path',matched&&index===route.length,'The character followed each leg of the path.','Watch again. Where does the path change direction?')];
}
function routeChecks(run:ObservedRun):ChallengeCheck[] {
  const route=[{x:150,y:320},{x:150,y:120},{x:600,y:120},{x:600,y:320}];
  let segment=0,stayedOnRoute=true;
  const visibleMoves=[false,false,false];
  for(const frame of run.frames) {
    const actor=actorAt(frame,'robot');
    if(!actor?.visible) {stayedOnRoute=false;continue;}
    if(segment===3) {
      if(!at(actor,600,320)) stayedOnRoute=false;
      continue;
    }
    const start=route[segment],end=route[segment+1];
    if(distanceToSegment(actor,start,end)>POSITION_TOLERANCE) stayedOnRoute=false;
    if(Math.hypot(actor.x-start.x,actor.y-start.y)>30&&Math.hypot(actor.x-end.x,actor.y-end.y)>30) visibleMoves[segment]=true;
    if(at(actor,end.x,end.y)) segment++;
  }
  return [
    check('route-order','Up, across, then down',stayedOnRoute&&segment===3,'The robot followed all three parts of the route in order.','Follow the target’s turns: go up to the gem before moving across, then go down to the bucket.'),
    check('visible-travel','Visible movement',visibleMoves.every(Boolean),'We could see the robot travel along each part of the route.','Give each move some time so we can watch the robot travel; jumping straight to a position does not show the route.'),
    check('route-finish','Finish at the bucket',at(actorAt(run.frames.at(-1)!,'robot'),600,320),'The robot finished at the bucket.','The robot should finish at the blue bucket, at x 600 and y 320.')
  ];
}

function bounceChecks(run:ObservedRun):ChallengeCheck[] {
  let bounces=0,inAir=false,groundFrames=0,clearReturns=true,staysInPlace=true;
  for(const frame of run.frames) {
    const actor=actorAt(frame,'dragon');
    if(!actor?.visible||!near(actor.x,150)) {staysInPlace=false;continue;}
    const height=320-(actor.y+actor.jumpOffset);
    if(height< -POSITION_TOLERANCE) staysInPlace=false;
    if(height>=32&&!inAir) {
      if(bounces>0&&groundFrames<2) clearReturns=false;
      bounces++;inAir=true;groundFrames=0;
    }
    if(height<=8) {
      inAir=false;groundFrames++;
    }
  }
  const last=actorAt(run.frames.at(-1)!,'dragon');
  const resting=!!last&&at(last,150,320)&&Math.abs(last.jumpOffset)<1;
  return [
    check('three-bounces','Three clear bounces',bounces===3, 'The dragon made three clear bounces.',`We saw ${bounces} clear ${bounces===1?'bounce':'bounces'}. Make three bounces that rise at least 32 steps.`),
    check('bounce-returns','A rest between bounces',bounces>=2&&clearReturns&&resting,'The dragon returned to the ground between bounces and finished resting.','Return to the ground and pause briefly between bounces, then finish on the ground.'),
    check('bounce-place','Bounce in one spot',staysInPlace,'The dragon stayed in its own spot.','Keep the dragon in its starting spot while it bounces.')
  ];
}

function tapChecks(project:CreationProject):{checks:ChallengeCheck[];limited:boolean} {
  const quiet=observe(project,4600);
  const schedules=[[800,2400],[1400,3200]];
  let responds=true,waits=true,visible=true,limited=quiet.limitReached,landmarks=landmarksStayPut('robot-taps',quiet);
  for(const schedule of schedules) {
    const run=observe(project,4600,schedule.map(timeMs=>({timeMs,type:'tap',actorId:'robot'})));
    limited ||= run.limitReached;
    landmarks &&= landmarksStayPut('robot-taps',run);
    for(const frame of run.frames) {
      const actor=actorAt(frame,'robot');
      if(!actor?.visible||!near(actor.y,320)) {responds=false;continue;}
      const recentTap=schedule.filter(time=>time<=frame.elapsedMs).length;
      const sinceTap=recentTap?frame.elapsedMs-schedule[recentTap-1]:Infinity;
      const expectedX=150+recentTap*120;
      if(recentTap===0&&!near(actor.x,150)) waits=false;
      if(recentTap>0&&sinceTap>=750&&!near(actor.x,expectedX)) responds=false;
      if(recentTap>0&&(actor.x<expectedX-120-POSITION_TOLERANCE||actor.x>expectedX+POSITION_TOLERANCE)) responds=false;
    }
    for(let index=0;index<schedule.length;index++) {
      const startX=150+index*120;
      if(!run.frames.some(frame=>frame.elapsedMs>=schedule[index]&&frame.elapsedMs<schedule[index]+750
        &&!!actorAt(frame,'robot')&&actorAt(frame,'robot')!.x>startX+15&&actorAt(frame,'robot')!.x<startX+105)) visible=false;
    }
  }
  waits &&= quiet.frames.every(frame=>at(actorAt(frame,'robot'),150,320));
  return {limited,checks:[
    landmarkCheck(landmarks),
    check('wait-for-tap','Wait for a tap',waits,'The robot did not move without a tap.','The robot moved without a tap. Put the movement under the robot’s tap event.'),
    check('one-step-per-tap','One step for each tap',responds,'Each tap moved the robot 120 steps right, even when the tap times changed.','Each tap should move the robot 120 steps right and finish within 750 ms, then wait for the next tap.'),
    check('tap-motion-visible','Show the step',visible,'We could see each step happen.','Give each step time to move visibly instead of jumping straight to the new position.')
  ]};
}

function cheerChecks(run:ObservedRun):ChallengeCheck[] {
  let visibleCheerFrames=0,earlyCheer=false;
  for(const frame of run.frames) {
    const actor=actorAt(frame,'dragon');
    if(normalSpeech(actor?.speech)==='hooray') {
      if(!at(actor,600,320)) earlyCheer=true;
      if(actor?.visible) visibleCheerFrames++;
    }
  }
  return [
    check('visible-arrival','Show the journey',run.frames.some(frame=>{
      const actor=actorAt(frame,'dragon');
      return !!actor?.visible&&actor.x>180&&actor.x<570&&near(actor.y,320);
    }),'We could see the dragon travel to the bucket.','Give the dragon time to travel visibly to the bucket before its celebration.'),
    check('arrive-before-cheer','Arrive before cheering',visibleCheerFrames>0&&!earlyCheer,'The dragon waited until it reached the bucket to cheer.',earlyCheer?'The dragon said “Hooray!” before reaching the bucket. Move that celebration after its journey.':'Let the dragon reach the bucket, then show its “Hooray!” celebration.'),
    check('visible-cheer','Show the celebration',visibleCheerFrames>=4,'“Hooray!” stayed visible long enough to see.','Let the dragon say “Hooray!” for at least 200 ms at the bucket.'),
    check('cheer-finish','Finish at the bucket',at(actorAt(run.frames.at(-1)!,'dragon'),600,320),'The dragon finished beside the bucket.','Move the dragon to the blue bucket and finish there.')
  ];
}

function bucketChecks(project:CreationProject):{checks:ChallengeCheck[];limited:boolean} {
  let quiet=true,preserved=true,limited=false,landmarks=true;
  const caseChecks:ChallengeCheck[]=[];
  for(const [index,gems] of [0,2,3,5].entries()) {
    const testProject=structuredClone(project);
    testProject.variables={...testProject.variables,gems};
    const tapTime=index%2===0?700:1200;
    const run=observe(testProject,2200,[{timeMs:tapTime,type:'tap',actorId:'bucket'}]);
    const untapped=observe(testProject,2200);
    limited ||= run.limitReached||untapped.limitReached;
    landmarks &&= landmarksStayPut('bucket-rule',run)&&landmarksStayPut('bucket-rule',untapped);
    quiet &&= untapped.frames.every(frame=>normalSpeech(actorAt(frame,'bucket')?.speech)==='');
    const expected=gems>=3?'ready':'more';
    let correctFrames=0,wrongMessage=false;
    for(const frame of run.frames) {
      const actor=actorAt(frame,'bucket');
      const speech=normalSpeech(actor?.speech);
      if(frame.elapsedMs<tapTime&&speech!=='') quiet=false;
      if(frame.elapsedMs>=tapTime&&speech!==''&&speech!==expected) wrongMessage=true;
      if(frame.elapsedMs>=tapTime&&frame.elapsedMs<=tapTime+750&&speech===expected&&actor?.visible) correctFrames++;
      if(frame.snapshot.variables.gems!==gems) preserved=false;
    }
    preserved &&= [...run.frames, ...untapped.frames].every(frame=>frame.snapshot.variables.gems===gems);
    caseChecks.push(check(`gems-${gems}`,`${gems} gems: ${expected==='ready'?'Ready':'More'}`,correctFrames>=4&&!wrongMessage,
      `With ${gems} gems, the bucket correctly said “${expected==='ready'?'Ready':'More'}”.`,
      `With ${gems} gems, the bucket should say “${expected==='ready'?'Ready':'More'}” after a tap. Show the answer for at least 200 ms, within 750 ms of the tap.`));
  }
  return {limited,checks:[
    landmarkCheck(landmarks),
    check('bucket-waits','Wait for the bucket tap',quiet,'The bucket stayed silent until a tap.','The bucket should wait for a tap before saying anything.'),
    ...caseChecks,
    check('preserve-gems','Keep the given gem count',preserved,'The rule used each given gem count without changing it.','Read the gems variable for this challenge; leave its value unchanged.')
  ]};
}

/** Runs observable behavior, never matching program text, block counts, or block shapes. */
export function evaluateChallenge(id:string,project:CreationProject):CreationChallengeResult {
  const challenge=getCreationChallenge(id);
  if(!challenge) return result(id,[check('challenge','Available challenge',false,'','Choose one of the available challenges.')],true);
  try {
    validateCreationProject(project);
    if(!sceneMatches(challenge.id,project)) {
      return result(id,[check('starting-scene','Original starting scene',false,'','Restore the original actors and their starting places. Make the behavior with your program rather than moving the scene into its final pose.')]);
    }
    let checks:ChallengeCheck[],limited=false;
    if(challenge.id==='robot-taps') {
      const tested=tapChecks(project);checks=tested.checks;limited=tested.limited;
    } else if(challenge.id==='bucket-rule') {
      const tested=bucketChecks(project);checks=tested.checks;limited=tested.limited;
    } else {
      const run=observe(project,challenge.durationMs,challenge.previewInputs);limited=run.limitReached;
      checks=isEarlyRoute(challenge.id)?earlyPathChecks(challenge.id,run):challenge.id==='robot-route'?routeChecks(run):challenge.id==='dragon-bounces'?bounceChecks(run):cheerChecks(run);
      checks.unshift(landmarkCheck(landmarksStayPut(challenge.id,run)));
      checks.push(check('finished-in-time','Finish the short scene',run.frames.at(-1)!.snapshot.status==='completed',
        'The whole program finished within the scene’s time.',`Finish this scene within ${challenge.durationMs/1000} seconds. A long wait or more actions are still running.`));
    }
    checks.unshift(check('run-completed','Scene ran within its limits',!limited,'The scene ran within the practice limits.','This program reached the scene’s safety limit. Shorten a long repeat or event chain, then try again.'));
    return result(id,checks);
  } catch {
    return result(id,[check('valid-program','Runnable program',false,'','This program could not run. Check its blocks, actor references, and number values, then try again.')],true);
  }
}
