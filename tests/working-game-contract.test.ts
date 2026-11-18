import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {transformSync} from 'esbuild';
import {draftChildIntentContract} from '../server/quality/child-intent';
import {chooseGameForm} from '../server/quality/game-form';
import {
  createFunctionalGameContract,validateFunctionalGameContract,
  type FunctionalAction,type FunctionalCheckpoint,type FunctionalProbe,
  type FunctionalGameContract,type GameObservation
} from '../server/quality/functional-game-contract';
import {stickerLaunchFixture,robotRouteFixture} from '../server/testing/working-game-fixtures';
import {suspensionChallenge,focusedControls} from '../server/testing/quality-generated-fixtures';
import {validateGenerated,type GeneratedGame} from '../server/agent/generated';
import {createCapabilities} from '../server/sandbox/runtime-v2';
import {copyCommands,copyOutcome} from '../server/sandbox/frame-v2';
import {validateSource} from '../server/sandbox/source-validator.cjs';

/**
 * Runs ONLY checked-in, hand-authored fixtures. Node's vm is not a security
 * boundary and MUST NOT be used for LLM/untrusted game source. O4/O5 use the
 * separate approved private runner + actual browser preview for those games.
 */
type Snapshot={
  outcome:{status:'playing'|'won'|'lost';score:number};
  commands:Array<{type:string;key?:string;x?:number;y?:number}>;
  world:{bodies:number;joints:number;ticks:number};
};
type GameHarness={
  snapshot:()=>Snapshot;
  apply:(action:FunctionalAction)=>void;
  dispose:()=>void;
};
function harness(authoredFixture:GeneratedGame):GameHarness{
  const fixture=validateGenerated(authoredFixture);
  validateSource(fixture);
  const compiled=transformSync(fixture.source,{loader:'ts',format:'iife',globalName:'GameModule',target:'es2022'}).code;
  const factory=runInNewContext(compiled+';GameModule.createGame;',Object.create(null),{timeout:1000}) as (api:any)=>any;
  const runtime=createCapabilities(),game=factory(runtime.api);
  let state=game.init();
  const none=()=>({pressed:[] as string[],tap:null as null|{x:number;y:number},
    pointer:{x:0,y:0,down:false,pressed:false,released:false}});
  const step=(input:ReturnType<typeof none>)=>{
    runtime.beginTick();
    state=game.step(state,input,1/60);
    runtime.step();
  };
  return {
    snapshot(){
      return JSON.parse(JSON.stringify({
        outcome:copyOutcome(game.outcome(state)),
        commands:copyCommands(game.draw(state)),
        world:runtime.presentation()
      })) as Snapshot;
    },
    apply(action){
      if(action.kind==='press'){
        const down=none();down.pressed=[action.button];step(down);step(none());
      }else if(action.kind==='hold'){
        for(let i=0;i<action.frames;i++){
          const down=none();down.pressed=[action.button];step(down);
        }
        step(none());
      }else if(action.kind==='tap'){
        const down=none();down.tap={...action.at};
        down.pointer={...action.at,down:true,pressed:true,released:false};
        step(down);
        const up=none();up.pointer={...action.at,down:false,pressed:false,released:true};
        step(up);
      }else if(action.kind==='drag'){
        const down=none();down.pointer={...action.from,down:true,pressed:true,released:false};
        step(down);
        const move=none();move.pointer={...action.to,down:true,pressed:false,released:false};
        step(move);
        const up=none();up.pointer={...action.to,down:false,pressed:false,released:true};
        step(up);
      }else {
        for(let i=0;i<action.frames;i++)step(none());
      }
    },
    dispose(){runtime.dispose();}
  };
}
function findCommand(frame:Snapshot,key:string){
  return frame.commands.find(c=>c.key===key);
}
function checkObservation(current:Snapshot,baseline:Snapshot,expectation:GameObservation){
  if(expectation.kind==='world'){
    const number=current.world[expectation.metric];
    assert.ok(expectation.operator==='eq'?number===expectation.value:number>=expectation.value,
      'world '+expectation.metric+' should be '+expectation.operator+' '+expectation.value+'; observed '+number);
    return;
  }
  const command=findCommand(current,expectation.key);
  if(expectation.kind==='hidden'){
    assert.equal(command,undefined,expectation.key+' must not be visible');
    return;
  }
  assert.ok(command,'missing rendered command: '+expectation.key);
  if(expectation.kind==='visible')return;
  const coordinate=command[expectation.axis];
  assert.equal(typeof coordinate,'number',expectation.key+'.'+expectation.axis+' must be rendered');
  if(expectation.kind==='coordinate'){
    assert.ok(expectation.operator==='lt' ? coordinate!<expectation.value:coordinate!>expectation.value,
      expectation.key+'.'+expectation.axis+' expected '+expectation.operator+' '+expectation.value+' observed '+coordinate);
  }else{
    const base=findCommand(baseline,expectation.key);
    assert.ok(base,'baseline must contain '+expectation.key+' for delta comparison');
    const from=base[expectation.axis];
    assert.equal(typeof from,'number');
    assert.ok(Math.abs(coordinate!-from!)>=expectation.minDelta,
      expectation.key+'.'+expectation.axis+' did not move enough: '+coordinate+' vs '+from);
  }
}
function assertCheckpoint(frame:Snapshot,initial:Snapshot,check:FunctionalCheckpoint,probeId:string){
  assert.equal(frame.outcome.status,check.outcome,probeId+' after='+check.after+' unexpected game outcome');
  for(const o of check.observations)checkObservation(frame,initial,o);
}
function executeProbe(fixture:GeneratedGame,probe:FunctionalProbe){
  const engine=harness(fixture);
  try{
    const initial=engine.snapshot(),frames:Snapshot[]=[initial];
    for(const action of probe.actions){engine.apply(action);frames.push(engine.snapshot());}
    for(const checkpoint of probe.checkpoints){
      assertCheckpoint(frames[checkpoint.after],initial,checkpoint,probe.id);
    }
    return frames;
  }finally{engine.dispose();}
}
function executeContract(fixture:GeneratedGame,contract:FunctionalGameContract){
  assert.equal(contract.status,'authored-unverified-not-release-approved');
  for(const probe of contract.probes){
    const first=executeProbe(fixture,probe);
    const second=executeProbe(fixture,probe);
    assert.deepEqual(first,second,probe.id+' has nondeterministic replay/reset behavior');
  }
}
const stickerIdea='Drag three bubble gum stickers onto a rocket, then press Launch to blast off.';
const robotIdea='Program a robot to follow arrows on a grid around a blocked square and reach the star.';
const carIdea='Drive a car with working suspension toward a star.';
const sSticker=draftChildIntentContract(stickerIdea),fSticker=chooseGameForm(sSticker);
const sRobot=draftChildIntentContract(robotIdea),fRobot=chooseGameForm(sRobot);
const sCar=draftChildIntentContract(carIdea),fCar=chooseGameForm(sCar);
const action=(fromX:number,toX:number):FunctionalAction=>({
  kind:'drag',from:{x:fromX,y:330},to:{x:toX,y:270}
});
const visible=(key:string):GameObservation=>({kind:'visible',key});
const at=(key:string,axis:'x'|'y',operator:'lt'|'gt',value:number):GameObservation=>({
  kind:'coordinate',key,axis,operator,value
});
const world=(metric:'bodies'|'joints',operator:'eq'|'gte',value:number):GameObservation=>({
  kind:'world',metric,operator,value
});
const stickerPlan=createFunctionalGameContract(sSticker,fSticker,[
  {id:'attach',quote:'Drag three bubble gum stickers onto a rocket'},
  {id:'launch-action',quote:'press Launch'},
  {id:'payoff',quote:'blast off'}
],[
  {id:'incomplete-does-not-launch',covers:['attach','launch-action'],actions:[
    {kind:'press',button:'action'}
  ],deterministicReplay:true,checkpoints:[
    {after:0,outcome:'playing',observations:[visible('rocket'),at('rocket','y','gt',210),at('sticker-0','x','lt',100),world('bodies','eq',0)]},
    {after:1,outcome:'playing',observations:[at('rocket','y','gt',210),at('sticker-0','x','lt',100)]}
  ]},
  {id:'wrong-drop-does-not-attach',covers:['attach'],actions:[
    action(60,700)
  ],deterministicReplay:true,checkpoints:[
    {after:1,outcome:'playing',observations:[at('sticker-0','x','lt',100),world('joints','eq',0)]}
  ]},
  {id:'three-attachments-then-launch',covers:['attach','launch-action','payoff'],actions:[
    action(60,310),action(140,360),action(220,410),
    {kind:'press',button:'action'},{kind:'wait',frames:75}
  ],deterministicReplay:true,checkpoints:[
    {after:0,outcome:'playing',observations:[visible('rocket'),at('sticker-0','x','lt',100)]},
    {after:1,outcome:'playing',observations:[at('sticker-0','x','gt',300),at('rocket','y','gt',210)]},
    {after:2,outcome:'playing',observations:[at('sticker-1','x','gt',340)]},
    {after:3,outcome:'playing',observations:[at('sticker-2','x','gt',400),world('bodies','eq',0)]},
    {after:4,outcome:'playing',observations:[at('rocket','y','lt',215)]},
    {after:5,outcome:'won',observations:[at('rocket','y','lt',100),visible('sticker-2')]}
  ]}
]);
const robotPlan=createFunctionalGameContract(sRobot,fRobot,[
  {id:'commands',quote:'follow arrows on a grid'},
  {id:'obstacle',quote:'around a blocked square'},
  {id:'goal',quote:'reach the star'}
],[
  {id:'blocked-cell',covers:['commands','obstacle'],actions:[
    {kind:'press',button:'right'},{kind:'press',button:'down'}
  ],deterministicReplay:true,checkpoints:[
    {after:0,outcome:'playing',observations:[at('robot','x','lt',121),at('robot','y','lt',161)]},
    {after:1,outcome:'playing',observations:[at('robot','x','gt',199)]},
    {after:2,outcome:'playing',observations:[at('robot','y','lt',161),visible('wall')]}
  ]},
  {id:'grid-route-reaches-star',covers:['commands','obstacle','goal'],actions:[
    {kind:'press',button:'right'},{kind:'press',button:'right'},{kind:'press',button:'down'}
  ],deterministicReplay:true,checkpoints:[
    {after:2,outcome:'playing',observations:[at('robot','x','gt',279),at('robot','y','lt',161)]},
    {after:3,outcome:'won',observations:[at('robot','x','gt',279),at('robot','y','gt',239),visible('goal')]}
  ]},
  {id:'held-arrow-is-one-grid-step',covers:['commands'],actions:[
    {kind:'hold',button:'right',frames:30}
  ],deterministicReplay:true,checkpoints:[
    {after:1,outcome:'playing',observations:[at('robot','x','gt',199),at('robot','x','lt',201)]}
  ]}
]);
const carPlan=createFunctionalGameContract(sCar,fCar,[
  {id:'drive',quote:'Drive a car'},
  {id:'suspension',quote:'working suspension'}
],[
  {id:'car-uses-real-physics',covers:['suspension'],actions:[
    {kind:'wait',frames:10}
  ],deterministicReplay:true,checkpoints:[
    {after:0,outcome:'playing',observations:[world('bodies','gte',4),world('joints','gte',2),visible('car'),visible('joint-rearAxle')]},
    {after:1,outcome:'playing',observations:[world('bodies','gte',4),world('joints','gte',2)]}
  ]},
  {id:'driving-changes-position',covers:['drive','suspension'],actions:[
    {kind:'hold',button:'right',frames:80}
  ],deterministicReplay:true,checkpoints:[
    {after:0,outcome:'playing',observations:[world('joints','gte',2),visible('car')]},
    {after:1,outcome:'playing',observations:[{kind:'changed',key:'car',axis:'x',minDelta:5},world('joints','gte',2)]}
  ]}
]);
test('O3 accepted functional contracts bind the exact O1/O2 decision and keep all later gates pending',()=>{
 for(const [intent,form,plan] of [[sSticker,fSticker,stickerPlan],[sRobot,fRobot,robotPlan],[sCar,fCar,carPlan]] as const){
  const validated=validateFunctionalGameContract(plan,intent,form);
  assert.deepEqual(validated,plan);
  assert.equal(plan.sourceSha256,intent.source.sha256);
  assert.equal(plan.formVersion,form.version);
  assert.deepEqual(plan.remainingGates,[
    'real-isolated-browser-preview','learning-and-revision-integration','objective-repair-and-retest'
  ]);
 }
 assert.equal(stickerPlan.expectedSimulation,'rule-driven');
 assert.equal(robotPlan.expectedSimulation,'rule-driven');
 assert.equal(carPlan.expectedSimulation,'physics-2d');
});
test('O3 bubble gum: actual drag attaches pieces, premature launch fails, full launch moves and wins, replay identical',()=>{
 executeContract(stickerLaunchFixture,stickerPlan);
});
test('O3 robot: actual controls enforce grid obstacles, reach goal and do not repeat a held key',()=>{
 executeContract(robotRouteFixture,robotPlan);
});
test('O3 car: existing physical fixture actually creates wheel joints and responds to driving',()=>{
 executeContract(suspensionChallenge,carPlan);
 // Compare motor input against idle on same trusted physics world.
 const baseline=harness(suspensionChallenge),driving=harness(suspensionChallenge);
 try{
  baseline.apply({kind:'wait',frames:80});
  driving.apply({kind:'hold',button:'right',frames:80});
  const idling=findCommand(baseline.snapshot(),'car')!;
  const moving=findCommand(driving.snapshot(),'car')!;
  assert.ok(Math.abs(moving.x!-idling.x!)>5,'driving must differ from gravity-only idle');
 }finally{baseline.dispose();driving.dispose();}
});
test('O3 authored negative: missing requested rocket payoff fails the executable contract',()=>{
 const broken={...stickerLaunchFixture,source:stickerLaunchFixture.source.replace('s.launched=true;api.sound','s.launched=false;api.sound')};
 assert.notEqual(broken.source,stickerLaunchFixture.source);
 assert.throws(()=>executeContract(broken,stickerPlan),/unexpected game outcome|did not move enough|expected lt/);
});
test('O3 authored negative: disconnected robot controls are detected as a functional failure',()=>{
 const broken={...robotRouteFixture,source:robotRouteFixture.source.replace("if(key&&key!==s.held){","if(false&&key&&key!==s.held){")};
 assert.notEqual(broken.source,robotRouteFixture.source);
 assert.throws(()=>executeContract(broken,robotPlan),/expected gt|unexpected game outcome/);
});
test('O3 authored negative: fake scripted car does not pass a physical suspension contract',()=>{
 assert.throws(()=>executeContract(focusedControls,carPlan),/world bodies should be gte|world joints should be gte|missing rendered command/);
});
test('O3 contract validation rejects invented story, unsupported form, forged requirement/probe and unbounded instructions',()=>{
 assert.throws(()=>createFunctionalGameContract(sSticker,fSticker,[{id:'made-up',quote:'a new flying unicorn'}],stickerPlan.probes),/QUOTE_AMBIGUOUS_OR_ABSENT/);
 const corrupted=JSON.parse(JSON.stringify(stickerPlan));
 corrupted.requirements[0].source.quote='magical fireworks'; 
 assert.throws(()=>validateFunctionalGameContract(corrupted,sSticker,fSticker),/WORKING_GAME_CONTRACT_SOURCE_EVIDENCE/);
 const unrelated=JSON.parse(JSON.stringify(stickerPlan));
 unrelated.probes[0].covers=['does-not-exist'];
 assert.throws(()=>validateFunctionalGameContract(unrelated,sSticker,fSticker),/WORKING_GAME_CONTRACT_PROBE/);
 const unbounded=JSON.parse(JSON.stringify(stickerPlan));
 unbounded.probes[0].actions=[{kind:'wait',frames:1000000}];
 assert.throws(()=>validateFunctionalGameContract(unbounded,sSticker,fSticker),/WORKING_GAME_CONTRACT_ACTION/);
 const fabricated=JSON.parse(JSON.stringify(stickerPlan));
 fabricated.status='fun-approved';
 assert.throws(()=>validateFunctionalGameContract(fabricated,sSticker,fSticker),/WORKING_GAME_CONTRACT_SCHEMA/);
 const undercovered=JSON.parse(JSON.stringify(stickerPlan));
 undercovered.probes.forEach((p:any)=>{p.covers=p.covers.filter((x:string)=>x!=='payoff')});
 assert.throws(()=>validateFunctionalGameContract(undercovered,sSticker,fSticker),/WORKING_GAME_CONTRACT_UNCOVERED_REQUIREMENT/);
 const unsupportedIntent=draftChildIntentContract('Make a 3D game where I fly through space.');
 assert.throws(()=>createFunctionalGameContract(unsupportedIntent,chooseGameForm(unsupportedIntent),
   [{id:'flight',quote:'fly through space'}],stickerPlan.probes),/WORKING_GAME_CONTRACT_FORM_NOT_SUPPORTED/);
 const malformed=JSON.parse(JSON.stringify(stickerPlan));
 malformed.probes[0].checkpoints[0].observations[0]={kind:'fun',value:100};
 assert.throws(()=>validateFunctionalGameContract(malformed,sSticker,fSticker),/WORKING_GAME_CONTRACT_OBSERVATION/);
});
