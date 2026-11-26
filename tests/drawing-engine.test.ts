import test from 'node:test';
import assert from 'node:assert/strict';
import {validateAssembly,vehicleGeometry,vehicleParts,assemblyRig,type DrawingAssembly} from '../src/drawing/model';
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
test('Malformed imported vehicle geometry is rejected before physics allocation instead of using a stock fallback',()=>{
 const geometry=vehicleGeometry(sample);
 for(const invalid of [
  {...geometry,chassisWidth:NaN},
  {...geometry,chassisHeight:Infinity},
  {...geometry,wheels:[]},
  {...geometry,wheels:[geometry.wheels[0],{...geometry.wheels[1],radius:-1}]},
  {...geometry,wheels:[geometry.wheels[0],{...geometry.wheels[1],x:3}]},
  {...geometry,wheels:[null,geometry.wheels[1]]},
 ])assert.throws(()=>createVehicle({},'meadow',invalid as any),/INVALID_DRAWN_VEHICLE_GEOMETRY/);
});
test('Rally preserves fixed body decorations and rejects every unsupported independent part explicitly',()=>{
 const decorated=structuredClone(sample);
 decorated.pieces.push({id:'flag',name:'My flag',role:'decoration',parentId:'car_body',physical:false,
   region:{x:.42,y:.04,w:.18,h:.25,shape:'rect'}});
 assert.deepEqual(vehicleGeometry(decorated),vehicleGeometry(sample),'fixed art leaves the three-body physics unchanged');
 assert.equal(vehicleParts(decorated).decorations[0].id,'flag');
 const extraBody=structuredClone(decorated);extraBody.pieces.push({...sample.pieces[0],id:'second_body'});
 assert.throws(()=>vehicleGeometry(extraBody),/exactly one body/);
 for(const overrides of [{physical:true},{role:'wing' as const,physical:true},{parentId:null},{parentId:'rear_wheel'}]){
  const unsupported=structuredClone(decorated);Object.assign(unsupported.pieces[3],overrides);
  assert.throws(()=>vehicleGeometry(unsupported),/extra pieces must be Decorations attached to the body/);
  assert.doesNotThrow(()=>assemblyRig({...unsupported,kind:'machine'}),'generic rigs continue to support the other arrangements');
 }
 for(const index of [0,1,2]){
  const fixed=structuredClone(sample);fixed.pieces[index].physical=false;
  assert.throws(()=>vehicleGeometry(fixed),/both moving wheels attached/);
 }
 const detached=structuredClone(sample);detached.pieces[1].parentId=null;
 assert.throws(()=>vehicleGeometry(detached),/both moving wheels attached/);
});
test('Rally sprites and colliders use the same wheel center ordering even for unequal outlines',()=>{
 const unusual=structuredClone(sample);
 unusual.pieces[1].region={x:.3,y:.58,w:.65,h:.27,shape:'ellipse'};
 unusual.pieces[2].region={x:.35,y:.58,w:.10,h:.27,shape:'ellipse'};
 const parts=vehicleParts(unusual),geometry=vehicleGeometry(unusual);
 assert.equal(parts.wheels[0].id,'front_wheel');assert.equal(parts.wheels[1].id,'rear_wheel');
 assert.ok(geometry.wheels[0].x<geometry.wheels[1].x);
});
test('A 600 by 420 drawing retains one pixel scale for chassis, tires and actual wheel anchors',()=>{
 const width=600,height=420,geometry=vehicleGeometry(sample,width/height);
 const close=(actual:number,expected:number)=>assert.ok(Math.abs(actual-expected)<1e-9,`${actual} must equal ${expected}`);
 const pixelsToWorld=geometry.chassisWidth/(sample.pieces[0].region.w*width);
 close(geometry.chassisWidth,3.15);close(geometry.chassisHeight,1.40875);
 close(geometry.chassisHeight,sample.pieces[0].region.h*height*pixelsToWorld);
 close(geometry.wheels[0].x,-.74375);close(geometry.wheels[0].y,.8115625);
 close(geometry.wheels[1].x,1.00625);close(geometry.wheels[0].radius,.35);
 const world=createVehicle({},'meadow',geometry);
 try{
  const snapshot=world.snapshot(),body=snapshot.bodies[0],region=sample.pieces[0].region;
  for(const [i,wheel]of snapshot.bodies.slice(1).entries()){
   const r=sample.pieces[i+1].region;
   close(wheel.x-body.x,((r.x+r.w/2)-(region.x+region.w/2))*width*pixelsToWorld);
   close(wheel.y-body.y,((r.y+r.h/2)-(region.y+region.h/2))*height*pixelsToWorld);
   close(wheel.width,Math.min(r.w*width,r.h*height)*pixelsToWorld);
  }
 }finally{world.dispose();}
});
test('Explicit square sources retain existing proportions when the legacy calibration already fits safely',()=>{
 const square=structuredClone(sample);square.pieces[0].region.h=.34;
 for(const wheel of square.pieces.slice(1))Object.assign(wheel.region,{w:.2,h:.2,y:.55});
 const legacy=vehicleGeometry(square),faithful=vehicleGeometry(square,1);
 for(const key of ['chassisWidth','chassisHeight'] as const)assert.ok(Math.abs(legacy[key]-faithful[key])<1e-9);
 for(const [i,wheel]of faithful.wheels.entries())for(const key of ['x','y','radius'] as const)assert.ok(Math.abs(wheel[key]-legacy.wheels[i][key])<1e-9);
 for(const aspect of [0,-1,NaN,Infinity])assert.throws(()=>vehicleGeometry(square,aspect),/unsupported dimensions/);
 assert.throws(()=>vehicleGeometry(square,.05),/cannot keep their proportions/,'an impossible source is rejected rather than stretched');
});
test('Faithful geometry at the wheel-separation safety boundary survives floating-point rounding',()=>{
 const narrow=structuredClone(sample);
 narrow.pieces[0].region={x:.2,y:.3,w:.5,h:.2,shape:'rect'};
 narrow.pieces[1].region={x:.3,y:.5,w:.2,h:.2,shape:'ellipse'};
 narrow.pieces[2].region={x:.375,y:.5,w:.2,h:.2,shape:'ellipse'};
 const geometry=vehicleGeometry(narrow,1);
 assert.ok(Math.abs(geometry.wheels[1].x-geometry.wheels[0].x-.45)<1e-9);
 const world=createVehicle({},'meadow',geometry);world.dispose();
});
test('Rectangular character and machine artwork keeps its proportions in real playground bodies and hinges',()=>{
 const machine:DrawingAssembly={...sample,kind:'machine',pieces:[
  {id:'body',name:'Body',role:'body',parentId:null,physical:true,region:{x:.2,y:.2,w:.6,h:.5,shape:'rect'}},
  {id:'wing',name:'Wing',role:'wing',parentId:'body',physical:true,pivot:{x:.1,y:.2},region:{x:.55,y:.1,w:.2,h:.25,shape:'rect'}}
 ]};
 const aspect=600/420,rig=assemblyRig(machine,aspect),root=rig.components[0],wing=rig.components[1];
 const close=(actual:number,expected:number)=>assert.ok(Math.abs(actual-expected)<1e-9,`${actual} must equal ${expected}`);
 const pixelsToWorld=root.part.width/(.6*600);
 close(root.part.height,.5*420*pixelsToWorld);close(wing.part.height,.25*420*pixelsToWorld);
 close(wing.offset.x,.15*600*pixelsToWorld);close(wing.offset.y,-.225*420*pixelsToWorld);
 const world=createDrawingPlayground(machine,aspect);
 try{
  const actual=world.snapshot(),body=actual.parts[0],part=actual.parts[1];
  close(part.w,wing.part.width);close(part.h,wing.part.height);
  close(part.x-body.x,wing.offset.x);close(part.y-body.y,wing.offset.y);
  close(actual.joints[0].x,part.x+wing.part.pivot.x);close(actual.joints[0].y,part.y+wing.part.pivot.y);
 }finally{world.dispose();}
 assert.throws(()=>assemblyRig(machine,4096),/very different sizes/);
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
test('Reshaping a drawn car body changes its real collider and mass, not only the picture',()=>{
 const long=structuredClone(sample);
 long.pieces[0].region.w=.84;
 const base=vehicleGeometry(sample),changed=vehicleGeometry(long);
 assert.ok(changed.chassisWidth>base.chassisWidth);
 const a=createVehicle({},'meadow',base),b=createVehicle({},'meadow',changed);
 try{
  const left=a.snapshot().bodies[0],right=b.snapshot().bodies[0];
  assert.ok(right.width>left.width);
  assert.ok(right.mass>left.mass);
 }finally{a.dispose();b.dispose();}
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

test('child animation paths interpolate, preserve original rig versions and compile to relative scene steps', async () => {
  const { validateMotion, sampleMotion, placeDrawingMotion } = await import('../src/drawing/motion');
  const motion = { stepMs: 700, stops: [{ x: 0, y: 0 }, { x: 1, y: .5 }] };
  const actor = { x: 0, y: 0, size: 100 }, stage = { width: 800, height: 450 };
  let count = 0;
  const steps = placeDrawingMotion(motion, actor, stage, () => 'step-' + ++count);
  assert.deepEqual(actor, { x: 400, y: 225, size: 100 });
  assert.deepEqual(steps, [
    { id: 'step-1', type: 'move', dx: -350, dy: -175, origin: 'child', durationMs: 700 },
    { id: 'step-2', type: 'move', dx: 700, dy: 175, origin: 'child', durationMs: 700 },
  ]);
  assert.deepEqual(sampleMotion(motion, 350), { x: .25, y: .25 });
  assert.deepEqual(sampleMotion(motion, Infinity), motion.stops[1]);
  for (const stops of [[], Array(13).fill({x: 1, y: 1}), [{x: -1, y: 0}], [{x: 1, y: NaN}], [null], [{x: .4, y: .2, url: 'bad'}]])
    assert.throws(() => validateMotion({ stepMs: 700, stops }));
  assert.throws(() => validateMotion({ ...motion, stepMs: Infinity }));
});
