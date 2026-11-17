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
test('Mask corrections are bounded and cannot overwrite or masquerade as source art',()=>{
 const edited=structuredClone(sample);
 edited.pieces[0].maskStrokes=[
  {action:'exclude',radius:.018,points:[{x:.4,y:.4},{x:.5,y:.5}]},
  {action:'include',radius:.011,points:[{x:.5,y:.5}]}
 ];
 assert.equal(validateAssembly(edited).pieces[0].maskStrokes?.length,2);
 const bad=structuredClone(edited);bad.pieces[0].maskStrokes![0].points[0].x=-.3;
 assert.throws(()=>validateAssembly(bad));
 const over=structuredClone(edited);over.pieces[0].maskStrokes=Array.from({length:49},()=>({action:'include',radius:.01,points:[{x:.5,y:.5}]}));
 assert.throws(()=>validateAssembly(over));
 const unknown=structuredClone(edited) as any;unknown.pieces[0].maskStrokes[0].javascript='alert(1)';
 assert.throws(()=>validateAssembly(unknown));
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
test('Hinge placement is validated and changes actual revolute joint location',()=>{
 const machine:DrawingAssembly={...sample,kind:'machine',pieces:[
  {...sample.pieces[0],id:'machine_body',name:'Engine'},
  {id:'propeller',name:'Propeller',role:'propeller',parentId:'machine_body',physical:true,
   region:{x:.4,y:.05,w:.2,h:.26,shape:'rect'},pivot:{x:.02,y:.5}}
 ]};
 const left=assemblyRig(machine);
 assert.equal(left.bindings[0].attachmentB,'pivot');
 assert.ok(left.components[1].part.pivot.x<0);
 const origin=createDrawingPlayground(machine);
 const alternate=structuredClone(machine);alternate.pieces[1].pivot={x:.98,y:.5};
 const right=createDrawingPlayground(alternate);
 try{
  assert.notEqual(origin.snapshot().joints[0].x,right.snapshot().joints[0].x,
    'the true Planck joint anchor follows the child-selected hinge');
  assert.equal(origin.snapshot().joints[0].kind,'axle');
 }finally{origin.dispose();right.dispose();}
 const bad=structuredClone(machine);bad.pieces[1].pivot={x:1.2,y:.5};
 assert.throws(()=>validateAssembly(bad));
});
test('A drawn wing flaps through a bounded physics motor, not by rotating a picture',()=>{
 const creature:DrawingAssembly={...sample,kind:'character',pieces:[
  {...sample.pieces[0],id:'dragon_body',name:'Dragon'},
  {id:'wing',name:'Wing',role:'wing',parentId:'dragon_body',physical:true,
   pivot:{x:.08,y:.5},region:{x:.50,y:.05,w:.22,h:.30,shape:'rect'}}
 ]};
 const world=createDrawingPlayground(creature);
 try{
  const angles:number[]=[];
  for(let i=0;i<180;i++){world.step(1/60);if(i%10===0)angles.push(world.snapshot().parts[1].angle);}
  assert.ok(angles.every(Number.isFinite));
  assert.ok(Math.max(...angles)-Math.min(...angles)>.05,'wing actually moves through physics');
  assert.equal(world.snapshot().joints[0].kind,'axle');
 }finally{world.dispose();}
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
