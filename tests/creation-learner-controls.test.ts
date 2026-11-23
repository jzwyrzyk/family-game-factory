import {test} from 'node:test';
import assert from 'node:assert/strict';
import {directionMove,firstStepsSummary,simpleMove,type MoveDirection} from '../src/creation/learner-controls';
import {SceneEngine} from '../src/creation/engine';
import type {CreationBlock,CreationProject} from '../src/creation/model';

type Move=Extract<CreationBlock,{type:'move'}>;
const scene=(action:Move):CreationProject=>({
  schema:'jems.creation.v1',id:'learner-scene',title:'My directions',width:800,height:450,background:'meadow',
  actors:[{id:'robot',name:'Robot',assetId:'robot',x:400,y:225,size:90}],variables:{},
  programs:[{id:'on-play',actorId:'robot',trigger:{type:'start'},actions:[action]}],
});

for(const [direction,x,y] of [
  ['right',537,225],['left',263,225],['up',400,88],['down',400,362],
] as const){
  test(`first-learner ${direction} controls produce the real ${direction} trajectory`,()=>{
    const action:Move={id:'move',type:'move',...directionMove(direction,137),durationMs:730,origin:'child'};
    const engine=new SceneEngine(scene(action));engine.start();
    const halfway=engine.advance(360).actors[0];
    assert.ok(direction==='right'?halfway.x>400&&halfway.x<x:
      direction==='left'?halfway.x<400&&halfway.x>x:
      direction==='up'?halfway.y<225&&halfway.y>y:halfway.y>225&&halfway.y<y);
    const finished=engine.advance(370);
    assert.equal(finished.actors[0].x,x);assert.equal(finished.actors[0].y,y);
    assert.equal(finished.status,'completed');
    assert.equal(finished.trace.find(entry=>entry.type==='complete')?.timeMs,730,'unrounded authored duration remains authoritative');
    assert.deepEqual(simpleMove(action),{direction,steps:137});
  });
}

test('zero movement stays a real no-op for each direction',()=>{
  for(const direction of ['right','left','up','down'] as MoveDirection[]){
    const engine=new SceneEngine(scene({id:'still',type:'move',...directionMove(direction,0),durationMs:250}));
    engine.start();const after=engine.advance(250);
    assert.equal(after.actors[0].x,400);assert.equal(after.actors[0].y,225);
    assert.equal(after.status,'completed');
  }
});

test('absolute and diagonal saved paths do not masquerade as simple directional moves',()=>{
  for(const movement of [{x:417,y:222},{x:0},{y:0},{dx:60,dy:-40}]){
    const action=Object.freeze({id:'custom-path',type:'move' as const,...movement,durationMs:1370,origin:'child' as const});
    const original=JSON.stringify(action);
    assert.equal(simpleMove(action),null);
    assert.equal(firstStepsSummary(action),'A saved path');
    assert.equal(JSON.stringify(action),original,'viewing cannot convert or quantize an old path');
  }
});

test('reading a fractional saved move preserves exact values and metadata',()=>{
  const action=Object.freeze({id:'fine-move',type:'move' as const,dx:0,dy:-93.5,durationMs:1370,origin:'assisted' as const});
  const before=JSON.stringify(action);
  assert.deepEqual(simpleMove(action),{direction:'up',steps:93.5});
  assert.equal(firstStepsSummary(action),'93.5 steps up');
  assert.equal(JSON.stringify(action),before);
});

test('compact summaries leave nested rules, durations and authored text intact',()=>{
  const actions:CreationBlock[]=[
    {id:'repeat',type:'repeat',count:37,actions:[{id:'pause',type:'wait',durationMs:1330,origin:'child'}]},
    {id:'speech',type:'say',text:'I chose my own words.',durationMs:1710,origin:'child'},
    {id:'rule',type:'if',condition:{type:'variable',variable:'gems',operator:'gte',value:3},then:[],else:[],origin:'child'},
  ];
  const before=structuredClone(actions);
  assert.deepEqual(actions.map(firstStepsSummary),['37 times','“I chose my own words.”','Check gems']);
  assert.deepEqual(actions,before);
});
