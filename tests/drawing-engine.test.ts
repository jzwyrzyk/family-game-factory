import test from 'node:test';
import assert from 'node:assert/strict';
import {validateAssembly,vehicleGeometry,assemblyRig,type DrawingAssembly} from '../src/drawing/model';
import {suggestParts} from '../src/drawing/segmentation';
import {createVehicle} from '../src/quality/physics';
import {createDrawingPlayground} from '../src/drawing/playground';
const hash='a'.repeat(64);
const sample:DrawingAssembly={
 schemaVersion:1,sourceId:'drawing-one',sourceSha256:hash,kind:'car',notes:'',revision:1,
 pieces:[
  {id:'car_body',name:'Body',role:'body',parentId:null,physical:true,region:{x:.14,y:.22,w:.72,h:.46,shape:'rect'}},
  {id:'rear_wheel',name:'Back wheel',role:'wheel',parentId:'car_body',physical:true,region:{x:.25,y:.58,w:.16,h:.27,shape:'ellipse'}},
  {id:'front_wheel',name:'Front wheel',role:'wheel',parentId:'car_body',physical:true,region:{x:.65,y:.58,w:.16,h:.27,shape:'ellipse'}},
 ]};
test('Drawing rigs preserve validated child-defined components and create real suspension bindings',()=>{
 const rig=assemblyRig(sample);assert.equal(rig.components.length,3);
 assert.equal(rig.bindings.length,2);assert.ok(rig.bindings.every(b=>b.kind==='suspension'));
 assert.deepEqual(validateAssembly(sample),sample);
});
test("Changing the child's wheel geometry changes the actual Planck world",()=>{
 const original=vehicleGeometry(sample),shifted=structuredClone(sample);
 shifted.pieces[1].region.x=.16;shifted.pieces[1].region.w=.20;
 const revised=vehicleGeometry(shifted);
 assert.notDeepEqual(revised.wheels,original.wheels);
 const a=createVehicle({},'meadow',original),b=createVehicle({},'meadow',revised);
 try{
  const sa=a.snapshot(),sb=b.snapshot();
  assert.notEqual(sa.bodies[1].x,sb.bodies[1].x,'wheel anchor differs in actual physics');
  assert.notEqual(sa.bodies[1].width,sb.bodies[1].width,'radius differs in actual wheel collider');
  assert.equal(sa.joints.length,2);assert.equal(sb.joints.length,2);
  for(let i=0;i<240;i++){a.step(1/60,{throttle:1});b.step(1/60,{throttle:1});}
  assert.ok(Number.isFinite(a.snapshot().distance)&&Number.isFinite(b.snapshot().distance));
 }finally{a.dispose();b.dispose();}
});
test('Invalid, overlapping or impossible drawing rigs fail explicitly',()=>{
 const duplicate=structuredClone(sample);duplicate.pieces[2].id=duplicate.pieces[1].id;
 assert.throws(()=>validateAssembly(duplicate));
 const cycle=structuredClone(sample);cycle.pieces[0].parentId='rear_wheel';assert.throws(()=>assemblyRig(cycle));
 const bound=structuredClone(sample);bound.pieces[0].region.w=1.2;assert.throws(()=>validateAssembly(bound));
 const wheels=structuredClone(sample);wheels.pieces[2].region.x=.28;assert.throws(()=>vehicleGeometry(wheels));
});
test('Shape proposals remain honest offline suggestions and work without a model',()=>{
 const data={width:100,height:70,data:new Uint8ClampedArray(100*70*4)} as ImageData;
 for(let i=0;i<data.data.length;i+=4){data.data[i]=data.data[i+1]=data.data[i+2]=255;data.data[i+3]=255;}
 const result=suggestParts(data,'car');assert.equal(result.method,'layout-guess');assert.equal(result.pieces.length,3);
 assert.match(result.explanation,/starting guess/i);
 const creature=suggestParts(data,'character');assert.equal(creature.pieces.length,1);
});
test('Other child-created objects instantiate actual independent bodies and joints',()=>{
 const machine:DrawingAssembly={...sample,kind:'machine',pieces:[
  {...sample.pieces[0],id:'machine_body',name:'Engine'},
  {id:'propeller',name:'Spinning arm',role:'propeller',parentId:'machine_body',physical:true,
   region:{x:.4,y:.05,w:.2,h:.26,shape:'rect'}}
 ]};
 const rig=assemblyRig(machine);assert.equal(rig.bindings[0].kind,'axle');
 const world=createDrawingPlayground(machine);
 try{
  const before=world.snapshot();
  for(let i=0;i<120;i++)world.step(1/60,{go:true,jump:i===3});
  const after=world.snapshot();
  assert.ok(after.time>1);assert.notEqual(before.parts[0].x,after.parts[0].x);
  assert.ok(after.parts.every(p=>Number.isFinite(p.angle)));
 }finally{world.dispose();}
});
