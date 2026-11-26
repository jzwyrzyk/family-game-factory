import assert from 'node:assert/strict';
import {test} from 'node:test';
import {defaultAssembly,validateAssembly} from '../src/drawing/model';
import {MOTION_LABELS,motionPose,validateDrawingMotion,type DrawingMotion,type MotionMove} from '../src/drawing/animation-path';

const makeMotion=(move:MotionMove):DrawingMotion=>({
  move,durationMs:1600,sprite:'original',world:'meadow',
  ...(move==='path'?{points:[{x:.2,y:.2},{x:.5,y:.85},{x:.8,y:.2}]}:{}),
});
test('nine motions have bounded independent poses and retain the original image contract',()=>{
  const described=new Set<string>();
  for(const key of Object.keys(MOTION_LABELS) as MotionMove[]){
    const motion=validateDrawingMotion(makeMotion(key)), values=[];
    for(let i=0;i<=20;i++){
      const pose=motionPose(motion,i/20);
      assert.ok(pose.x>=0 && pose.x<=1 && pose.y>=0 && pose.y<=1 && Number.isFinite(pose.rotation));
      values.push(pose);
    }
    assert.ok(new Set(values.map(value=>JSON.stringify(value))).size>1);
    described.add(JSON.stringify(values));
  }
  assert.equal(described.size,9);
  assert.deepEqual(motionPose(makeMotion('path'),.5),{x:.5,y:.85,rotation:0});
  assert.equal(motionPose(makeMotion('spin'),.25).rotation,90);
});
test('old assemblies keep their shape, motion remains bounded on import and assembly validation clones its points',()=>{
  const drawing=defaultAssembly({id:'stone',sha256:'a'.repeat(64)},'character',[{
    id:'picture',name:'My drawing',role:'decoration',region:{x:0,y:0,w:1,h:1,shape:'rect'},parentId:null,physical:false,
  }]);
  assert.deepEqual(validateAssembly(drawing),drawing);
  assert.ok(!Object.hasOwn(validateAssembly(drawing),'motion'));
  const motion=makeMotion('path'),updated=validateAssembly({...drawing,motion});
  motion.points![0].x=1;
  assert.equal(updated.motion?.points?.[0].x,.2);
  for(const invalid of [
    {...motion,points:[]},{...motion,points:[{x:0,y:0},{x:0,y:0}]},
    {...motion,points:Array(33).fill({x:.5,y:.5})},{...motion,points:[{x:0,y:0},{x:NaN,y:1}]},
    {...motion,world:'unrestricted'},{...motion,durationMs:-1},{...motion,sprite:'redrawn'},
    {...motion,move:'jump'}, {...motion,url:'fixture.png'},
  ])assert.throws(()=>validateAssembly({...drawing,motion:invalid}));
});
