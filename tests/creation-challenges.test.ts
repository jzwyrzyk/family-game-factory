import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  CREATION_CHALLENGES,createChallengeStarter,createChallengeTarget,evaluateChallenge,getCreationChallenge,
} from '../src/creation/challenges';
import {runScene} from '../src/creation/engine';
import {type CreationBlock,type CreationProject,validateCreationProject} from '../src/creation/model';

const fails=(id:string,project:CreationProject,checkId?:string)=>{
  const answer=evaluateChallenge(id,project);
  assert.equal(answer.passed,false,JSON.stringify(answer));
  if(checkId) assert.equal(answer.checks.find(check=>check.id===checkId)?.passed,false,JSON.stringify(answer));
  return answer;
};
const passes=(id:string,project:CreationProject)=>{
  const answer=evaluateChallenge(id,project);
  assert.equal(answer.passed,true,JSON.stringify(answer));
  return answer;
};
const replaceActions=(id:string,actions:CreationBlock[])=>{
  const project=createChallengeTarget(id);
  project.programs[0].actions=actions;
  return project;
};

test('Every published practice target runs and satisfies its stated behavior checks',()=>{
  assert.equal(CREATION_CHALLENGES.length,5);
  for(const challenge of CREATION_CHALLENGES) {
    validateCreationProject(createChallengeStarter(challenge.id));
    validateCreationProject(createChallengeTarget(challenge.id));
    assert.ok(challenge.hint&&challenge.requirements.length&&challenge.testDescription);
    const answer=passes(challenge.id,createChallengeTarget(challenge.id));
    assert.equal(answer.status,'passed');
    assert.deepEqual(answer.evidence,{
      kind:'formative',source:'bounded-scene-runs',assistance:'not-recorded',independentAssessment:false,
      generalThinkingScore:null,observations:answer.checks.filter(check=>check.passed).map(check=>check.feedback),
    });
  }
});

test('Starters have no copied solution; a deliberately wrong debugging starter also fails',()=>{
  for(const challenge of CREATION_CHALLENGES) {
    const starter=createChallengeStarter(challenge.id);
    fails(challenge.id,starter);
    if(challenge.id!=='early-cheer') assert.equal(starter.programs.flatMap(program=>program.actions).length,0);
  }
  const starter=createChallengeStarter('robot-route');
  const target=createChallengeTarget('robot-route');
  target.actors[0].x=999;
  assert.equal(starter.actors[0].x,150);
  assert.equal(createChallengeTarget('robot-route').actors[0].x,150);
});

test('Equivalent relative movement and extra pauses match the route without copying target blocks',()=>{
  const alternate=replaceActions('robot-route',[
    {id:'first-half-up',type:'move',dy:-100,durationMs:300},
    {id:'second-half-up',type:'move',dy:-100,durationMs:300},
    {id:'look-at-gem',type:'wait',durationMs:250},
    {id:'go-right',type:'move',dx:450,durationMs:900},
    {id:'go-down',type:'move',dy:200,durationMs:700},
  ]);
  passes('robot-route',alternate);
});

test('A different path with exactly the target final pose does not pass',()=>{
  const wrong=replaceActions('robot-route',[
    {id:'right-first',type:'move',dx:450,durationMs:800},
    {id:'up-next',type:'move',dy:-200,durationMs:600},
    {id:'down-last',type:'move',dy:200,durationMs:600},
  ]);
  const targetEnd=runScene(createChallengeTarget('robot-route'),{durationMs:6000}).actors[0];
  const wrongEnd=runScene(wrong,{durationMs:6000}).actors[0];
  assert.deepEqual([wrongEnd.x,wrongEnd.y],[targetEnd.x,targetEnd.y]);
  fails('robot-route',wrong,'route-order');
});

test('Visiting the right points after an early detour still does not reproduce the route',()=>{
  const wrong=createChallengeTarget('robot-route');
  wrong.programs[0].actions.unshift(
    {id:'detour',type:'move',dx:150,durationMs:300},
    {id:'return',type:'move',dx:-150,durationMs:300},
  );
  fails('robot-route',wrong,'route-order');
});

test('Instant final-pose jumps and editing the initial actor pose cannot match the route',()=>{
  const teleport=replaceActions('robot-route',[
    {id:'teleport-up',type:'move',x:150,y:120,durationMs:0},
    {id:'teleport-right',type:'move',x:600,y:120,durationMs:0},
    {id:'teleport-down',type:'move',x:600,y:320,durationMs:0},
  ]);
  fails('robot-route',teleport,'visible-travel');
  const posed=createChallengeStarter('robot-route');
  posed.actors[0].x=600;
  fails('robot-route',posed,'starting-scene');
  const substituted=createChallengeTarget('robot-route');
  substituted.actors[0].assetId='dragon';
  fails('robot-route',substituted,'starting-scene');
});

test('Three separate jump instructions count just like a repeat',()=>{
  const actions:CreationBlock[]=[];
  for(let index=0;index<3;index++) actions.push(
    {id:`bounce-${index}`,type:'jump',height:60,durationMs:500},
    {id:`rest-${index}`,type:'wait',durationMs:200},
  );
  passes('dragon-bounces',replaceActions('dragon-bounces',actions));
});

test('Three visible up/down movements also count as bounces without a jump block',()=>{
  const actions:CreationBlock[]=[];
  for(let index=0;index<3;index++) actions.push(
    {id:`up-${index}`,type:'move',dy:-65,durationMs:250},
    {id:`down-${index}`,type:'move',dy:65,durationMs:250},
    {id:`rest-${index}`,type:'wait',durationMs:200},
  );
  passes('dragon-bounces',replaceActions('dragon-bounces',actions));
});

test('Two bounces, four bounces, and three invisible bounces do not count as the target pattern',()=>{
  for(const count of [2,4]) {
    const wrong=createChallengeTarget('dragon-bounces');
    const repeated=wrong.programs[0].actions[0];
    assert.equal(repeated.type,'repeat');
    if(repeated.type==='repeat') repeated.count=count;
    fails('dragon-bounces',wrong,'three-bounces');
  }
  const tiny=replaceActions('dragon-bounces',[
    {id:'three-tiny',type:'repeat',count:3,actions:[
      {id:'tiny',type:'jump',height:8,durationMs:500},{id:'rest',type:'wait',durationMs:200},
    ]},
  ]);
  fails('dragon-bounces',tiny,'three-bounces');
});

test('A bounce program must finish on the ground rather than merely pass through three peaks',()=>{
  const wrong=createChallengeTarget('dragon-bounces');
  wrong.programs[0].actions.push({id:'float-away',type:'move',dy:-100,durationMs:700});
  fails('dragon-bounces',wrong,'bounce-returns');
});

test('The tap challenge accepts an equivalent event-message implementation',()=>{
  const alternate=createChallengeTarget('robot-taps');
  alternate.programs[0].actions=[{id:'request-step',type:'emit',name:'step-now'}];
  alternate.programs.push({id:'move-on-message',actorId:'robot',trigger:{type:'event',name:'step-now'},actions:[
    {id:'half-step',type:'move',dx:60,durationMs:200},
    {id:'other-half-step',type:'move',dx:60,durationMs:200},
  ]});
  passes('robot-taps',alternate);
});

test('Automatic timed movement fails even if it happens to match the preview tap schedule',()=>{
  const automatic=replaceActions('robot-taps',[
    {id:'wait-for-preview',type:'wait',durationMs:800},
    {id:'first-step',type:'move',dx:120,durationMs:450},
    {id:'wait-again',type:'wait',durationMs:1150},
    {id:'second-step',type:'move',dx:120,durationMs:450},
  ]);
  automatic.programs[0].trigger={type:'start'};
  fails('robot-taps',automatic,'wait-for-tap');
});

test('The tap challenge checks each response; one absolute destination does not work twice',()=>{
  const wrong=replaceActions('robot-taps',[{id:'same-destination',type:'move',x:270,durationMs:450}]);
  fails('robot-taps',wrong,'one-step-per-tap');
  const double=replaceActions('robot-taps',[{id:'double-step',type:'move',dx:240,durationMs:450}]);
  fails('robot-taps',double,'one-step-per-tap');
});

test('An early cheer fails even with the same ending position and the same total duration',()=>{
  const wrong=createChallengeStarter('early-cheer');
  const correct=createChallengeTarget('early-cheer');
  const wrongEnd=runScene(wrong,{durationMs:4500}).actors[0];
  const correctEnd=runScene(correct,{durationMs:4500}).actors[0];
  assert.deepEqual([wrongEnd.x,wrongEnd.y,wrongEnd.speech],[correctEnd.x,correctEnd.y,correctEnd.speech]);
  fails('early-cheer',wrong,'arrive-before-cheer');
});

test('A split journey and a reasonable pause before cheering preserve the goal',()=>{
  const alternate=replaceActions('early-cheer',[
    {id:'part-one',type:'move',dx:200,durationMs:500},
    {id:'part-two',type:'move',dx:250,durationMs:600},
    {id:'pause',type:'wait',durationMs:300},
    {id:'celebrate',type:'say',text:'Hooray',durationMs:800},
  ]);
  passes('early-cheer',alternate);
});

test('A fixed answer cannot satisfy the variable rule across input cases',()=>{
  for(const text of ['More','Ready']) {
    const fixed=replaceActions('bucket-rule',[{id:'always-same',type:'say',text,durationMs:1000}]);
    fails('bucket-rule',fixed,text==='More'?'gems-3':'gems-0');
  }
});

test('The condition boundary includes exactly three and values beyond three',()=>{
  const strict=createChallengeTarget('bucket-rule');
  const condition=strict.programs[0].actions[0];
  assert.equal(condition.type,'if');
  if(condition.type==='if'&&condition.condition.type==='variable') condition.condition.operator='gt';
  fails('bucket-rule',strict,'gems-3');
  const equalOnly=createChallengeTarget('bucket-rule');
  const equals=equalOnly.programs[0].actions[0];
  if(equals.type==='if'&&equals.condition.type==='variable') equals.condition.operator='eq';
  fails('bucket-rule',equalOnly,'gems-5');
});

test('An inverted condition with swapped branches is equally valid',()=>{
  const alternate=createChallengeTarget('bucket-rule');
  const rule=alternate.programs[0].actions[0];
  if(rule.type==='if'&&rule.condition.type==='variable') {
    rule.condition.operator='lt';
    const ready=rule.then;rule.then=rule.else!;rule.else=ready;
  }
  passes('bucket-rule',alternate);
});

test('Changing given state or answering before the tap is detected',()=>{
  const rewritten=createChallengeTarget('bucket-rule');
  rewritten.programs[0].actions.unshift({id:'overwrite-input',type:'set',variable:'gems',value:2});
  fails('bucket-rule',rewritten,'preserve-gems');
  const automatic=createChallengeTarget('bucket-rule');
  automatic.programs[0].trigger={type:'start'};
  fails('bucket-rule',automatic,'bucket-waits');
});

test('Evaluating does not mutate the child project or turn it into its target',()=>{
  for(const challenge of CREATION_CHALLENGES) {
    const project=createChallengeTarget(challenge.id);
    const before=structuredClone(project);
    evaluateChallenge(challenge.id,project);
    assert.deepEqual(project,before);
  }
});

test('Moving a landmark during playback cannot turn a different scene into a match',()=>{
  const wrong=createChallengeTarget('robot-route');
  wrong.programs.push({id:'move-bucket',actorId:'bucket',trigger:{type:'start'},actions:[
    {id:'bucket-goes-away',type:'move',x:300,y:320,durationMs:400},
  ]});
  fails('robot-route',wrong,'scene-landmarks');
});

test('A correct prefix followed by a very delayed wrong ending is not a finished scene',()=>{
  const wrong=createChallengeTarget('robot-route');
  wrong.programs[0].actions.push(
    {id:'delay-beyond-check',type:'wait',durationMs:10000},
    {id:'leave-bucket',type:'move',dx:-100,durationMs:400},
  );
  fails('robot-route',wrong,'finished-in-time');
});

test('The bucket rule must respond to taps, not a timed automatic answer after both tap times',()=>{
  const automatic=createChallengeTarget('bucket-rule');
  automatic.programs[0].trigger={type:'start'};
  automatic.programs[0].actions.unshift({id:'wait-to-fake-tap',type:'wait',durationMs:1250});
  fails('bucket-rule',automatic,'bucket-waits');
});

test('Malformed imported scene data gives a recoverable invalid result',()=>{
  const malformed=createChallengeTarget('robot-route');
  (malformed as any).actors=[null];
  assert.equal(evaluateChallenge('robot-route',malformed).status,'invalid');
  assert.equal(evaluateChallenge('robot-route',null as any).status,'invalid');
});

test('Invalid scenes, unknown IDs, and safety limits never produce completion evidence',()=>{
  assert.equal(getCreationChallenge('not-a-challenge'),undefined);
  assert.throws(()=>createChallengeStarter('not-a-challenge'),/available creation challenge/);
  const unknown=evaluateChallenge('not-a-challenge',createChallengeTarget('robot-route'));
  assert.equal(unknown.status,'invalid');
  const malformed=createChallengeTarget('robot-route');
  malformed.programs[0].actions[0]={id:'bad-number',type:'move',dx:NaN,durationMs:300};
  assert.equal(fails('robot-route',malformed).status,'invalid');
  const infinite=createChallengeTarget('early-cheer');
  infinite.programs.push({id:'recursive',actorId:'bucket',trigger:{type:'event',name:'again'},actions:[{id:'repeat-event',type:'emit',name:'again'}]});
  infinite.programs[0].actions.push({id:'start-event-loop',type:'emit',name:'again'});
  fails('early-cheer',infinite,'run-completed');
});
