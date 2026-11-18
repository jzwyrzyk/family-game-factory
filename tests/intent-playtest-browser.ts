import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';
import {transformSync} from 'esbuild';
import {runtimeBundle} from '../server/sandbox/bundle-v2.cjs';
import {hash,type GeneratedGame} from '../server/agent/generated';
import {validateSource} from '../server/sandbox/source-validator.cjs';
import {draftChildIntentContract} from '../server/quality/child-intent';
import {chooseGameForm} from '../server/quality/game-form';
import {createFunctionalGameContract} from '../server/quality/functional-game-contract';
import {stickerLaunchFixture,robotRouteFixture} from '../server/testing/working-game-fixtures';
import {suspensionChallenge,focusedControls} from '../server/testing/quality-generated-fixtures';
import {playtestIntentV2} from '../server/sandbox/intent-playtest-v2.cjs';

const stickerIdea='Drag three bubble gum stickers onto a rocket, then press Launch to blast off.';
const robotIdea='Program a robot to follow arrows on a grid around a blocked square and reach the star.';
const carIdea='Drive a car with working suspension toward a star.';
function contract(raw:string,requirements:Array<{id:string;quote:string}>,probes:any[]){
 const intent=draftChildIntentContract(raw),form=chooseGameForm(intent);
 return createFunctionalGameContract(intent,form,requirements,probes);
}
const visual=(key:string)=>({kind:'visible',key});
const pos=(key:string,axis:'x'|'y',operator:'lt'|'gt',value:number)=>
 ({kind:'coordinate',key,axis,operator,value});
const joint=(metric:'joints'|'bodies',operator:'eq'|'gte',value:number)=>
 ({kind:'world',metric,operator,value});
const drag=(x:number,tx:number)=>
 ({kind:'drag',from:{x,y:330},to:{x:tx,y:270}});
const sticker=contract(stickerIdea,[
 {id:'attach',quote:'Drag three bubble gum stickers onto a rocket'},
 {id:'launch',quote:'press Launch'}, {id:'payoff',quote:'blast off'}
],[
 {id:'premature-launch',covers:['attach','launch'],deterministicReplay:true,
  actions:[{kind:'press',button:'action'}],
  checkpoints:[
   {after:0,outcome:'playing',observations:[pos('sticker-0','x','lt',100),joint('bodies','eq',0)]},
   {after:1,outcome:'playing',observations:[pos('rocket','y','gt',210),pos('sticker-0','x','lt',100)]}
  ]},
 {id:'attach-then-launch',covers:['attach','launch','payoff'],deterministicReplay:true,
  actions:[drag(60,310),drag(140,360),drag(220,410),{kind:'press',button:'action'},{kind:'wait',frames:75}],
  checkpoints:[
   {after:0,outcome:'playing',observations:[pos('sticker-0','x','lt',100),visual('rocket')]},
   {after:1,outcome:'playing',observations:[pos('sticker-0','x','gt',300)]},
   {after:2,outcome:'playing',observations:[pos('sticker-1','x','gt',340)]},
   {after:3,outcome:'playing',observations:[pos('sticker-2','x','gt',400),joint('bodies','eq',0)]},
   {after:4,outcome:'playing',observations:[pos('rocket','y','lt',215)]},
   {after:5,outcome:'won',observations:[pos('rocket','y','lt',100),visual('sticker-2')]}
  ]}
]);
const robot=contract(robotIdea,[
 {id:'commands',quote:'follow arrows on a grid'},
 {id:'wall',quote:'around a blocked square'}, {id:'goal',quote:'reach the star'}
],[
 {id:'blocked-square',covers:['commands','wall'],deterministicReplay:true,
  actions:[{kind:'press',button:'right'},{kind:'press',button:'down'}],
  checkpoints:[
   {after:1,outcome:'playing',observations:[pos('robot','x','gt',199)]},
   {after:2,outcome:'playing',observations:[pos('robot','y','lt',161),visual('wall')]}
  ]},
 {id:'reachable-grid-goal',covers:['commands','wall','goal'],deterministicReplay:true,
  actions:[{kind:'press',button:'right'},{kind:'press',button:'right'},{kind:'press',button:'down'}],
  checkpoints:[
   {after:2,outcome:'playing',observations:[pos('robot','x','gt',279),pos('robot','y','lt',161)]},
   {after:3,outcome:'won',observations:[pos('robot','x','gt',279),pos('robot','y','gt',239),visual('goal')]}
  ]}
]);
const car=contract(carIdea,[
 {id:'drive',quote:'Drive a car'},{id:'suspension',quote:'working suspension'}
],[
 {id:'real-wheel-drive',covers:['drive','suspension'],deterministicReplay:true,
  actions:[{kind:'hold',button:'right',frames:80}],
  checkpoints:[
   {after:0,outcome:'playing',observations:[joint('bodies','gte',4),joint('joints','gte',2),visual('car')]},
   {after:1,outcome:'playing',observations:[joint('joints','gte',2),{kind:'changed',key:'car',axis:'x',minDelta:5}]}
  ]}
]);
const allowed=[
 stickerLaunchFixture.source,robotRouteFixture.source,suspensionChallenge.source,
 focusedControls.source,
 stickerLaunchFixture.source.replace('s.launched=true;api.sound','s.launched=false;api.sound'),
 robotRouteFixture.source.replace("if(key&&key!==s.held){","if(false&&key&&key!==s.held){")
];
function compiled(fixture:GeneratedGame):GeneratedGame{
 if(!allowed.includes(fixture.source))throw Error('INTENT_FIXTURE_SOURCE_NOT_ALLOWED');
 validateSource(fixture);
 const code=transformSync(fixture.source,{loader:'ts',format:'iife',globalName:'GameModule'}).code;
 const trusted=runtimeBundle();
 return {...fixture,compiled:{code,sourceHash:hash(fixture.source),codeHash:hash(code),
  runtimeVersion:trusted.version,runtimeHash:trusted.hash,
  tests:{desktop:true,mobile:true,replay:true,isolation:true,input:true,resources:true,pause:true}}};
}
async function main(){
 const browser=await chromium.launch({
  executablePath:process.env.CHROMIUM_PATH||(!process.env.CI&&existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),
  headless:true,args:['--no-sandbox']
 });
 try{
  for(const [device,viewport] of [['desktop',{width:1024,height:900}],['mobile',{width:375,height:812}]] as const){
   const context=await browser.newContext({viewport,hasTouch:device==='mobile'});
   const page=await context.newPage();
   try{
    const untested=await playtestIntentV2(page,compiled(stickerLaunchFixture),undefined,{touch:device==='mobile'});
    assert.equal(untested.status,'not-tested','no source-grounded plan means NO fidelity claim');
    const samples=[
     ['sticker',stickerLaunchFixture,sticker],
     ['robot',robotRouteFixture,robot],
     ['real-car',suspensionChallenge,car]
    ] as const;
    for(const [name,fixture,plan] of samples){
     const result=await playtestIntentV2(page,compiled(fixture),plan,{touch:device==='mobile'});
     assert.equal(result.status,'pass',name+' '+device);
     assert.equal(result.passed,plan.probes.length);
     assert.equal(result.failed,0);
     assert.equal(result.sourceSha256,plan.sourceSha256);
     assert.equal(result.method,'independent-rendered-input-and-outcome');
     assert.ok(!JSON.stringify(result).includes(stickerIdea),'report may not leak the original prompt');
     console.log('PASS O5 independent observable gameplay:',device,name,result.passed+' probes');
    }
    // These are separate, authored negative fixtures; they are NOT generated
    // code accepted into a Node VM. They must fail real preview interaction.
    const negatives=[
     ['rocket-payoff-missing',{
       ...stickerLaunchFixture,source:stickerLaunchFixture.source.replace('s.launched=true;api.sound','s.launched=false;api.sound')
      },sticker],
     ['robot-ignores-controls',{
       ...robotRouteFixture,source:robotRouteFixture.source.replace("if(key&&key!==s.held){","if(false&&key&&key!==s.held){")
      },robot],
     ['fake-physical-car',focusedControls,car]
    ] as const;
    for(const [name,fixture,plan] of negatives){
     await assert.rejects(()=>playtestIntentV2(page,compiled(fixture),plan,{touch:device==='mobile'}),
      /INTENT_PLAYTEST_FAILED/,name+' must not fake a pass');
     console.log('PASS O5 deliberately broken gameplay rejected:',device,name);
    }
   }finally{await context.close();}
  }
 }finally{await browser.close();}
}
void main().catch(e=>{console.error(e);process.exitCode=1;});
