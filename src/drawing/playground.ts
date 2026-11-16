import {World,Vec2,Box,Circle,RevoluteJoint,WeldJoint,WheelJoint,type Body} from 'planck';
import {validateDrawingRig,type DrawingRig} from '../quality/parts';
import type {DrawingAssembly} from './model';
import {assemblyRig} from './model';
const LIMIT=18;
export interface PlayPart {id:string;x:number;y:number;angle:number;w:number;h:number;physical:boolean}
export interface PlayScene {time:number;parts:PlayPart[];contacts:number;origin:{x:number;y:number}}
export interface PlayControls {go?:boolean;jump?:boolean}
/** Physical sandbox for guided imaginary drawings, robots, winged creatures and machines.
 * Movement and joints are real Planck bodies, not CSS animation or a canned GIF.
 * Unusual semantics remain intentionally explicit choices made by the child.
 */
export function createDrawingPlayground(input:DrawingAssembly){
 const rig:DrawingRig=validateDrawingRig(assemblyRig(input)),world=new World(Vec2(0,9));
 const floor=world.createBody({position:Vec2(0,10.8)});
 floor.createFixture(Box(24,.3),{friction:.9});
 const bodies=new Map<string,Body>(),order=rig.components;
 let contactCount=0,time=0,disposed=false,jumpLatch=false;
 world.on('begin-contact',()=>{contactCount++;});
 // Every independently selected moving piece becomes its own physical body.
 for(const c of order){
  if(!c.physical)continue;
  const role=input.pieces.find(p=>p.id===c.id)?.role;
  const pos=Vec2(8+c.offset.x,6+c.offset.y);
  const b=(role==='platform'||role==='obstacle')?world.createBody({position:pos}):world.createDynamicBody({position:pos,linearDamping:.15,angularDamping:.28});
  const def=c.part,fixture=def.collider;
  if(fixture.type==='circle')b.createFixture(Circle(fixture.radius),{density:1,friction:def.friction,restitution:def.restitution});
  else b.createFixture(Box(def.width/2,def.height/2),{density:1,friction:def.friction,restitution:def.restitution});
  bodies.set(c.id,b);
 }
 // A nonphysical decoration is rendered relative to the parent's moving body.
 for(const bind of rig.bindings){
  const a=bodies.get(bind.a),b=bodies.get(bind.b);
  if(!a||!b)continue;
  const child=input.pieces.find(p=>p.id===bind.b)!;
  const p=b.getPosition();
  if(bind.kind==='fixed')world.createJoint(new WeldJoint({collideConnected:false,frequencyHz:0,dampingRatio:.7},a,b,p));
  else if(bind.kind==='suspension')world.createJoint(new WheelJoint({motorSpeed:0,maxMotorTorque:12,enableMotor:true,frequencyHz:4,dampingRatio:.75,collideConnected:false},a,b,p,Vec2(0,1)));
  else world.createJoint(new RevoluteJoint({enableMotor:child.role==='propeller',motorSpeed:child.role==='propeller'?5:0,maxMotorTorque:child.role==='propeller'?3:0,collideConnected:false},a,b,p));
 }
 const root=rig.components.find(c=>c.physical&&c.parentId===null)||rig.components.find(c=>c.physical);
 const main=root?bodies.get(root.id):undefined;
 const original=main?{x:main.getPosition().x,y:main.getPosition().y}:{x:8,y:6};
 return {
  step(dt:number,controls:PlayControls={}){
   if(disposed)return;
   if(!Number.isFinite(dt)||dt<0||dt>.1)throw Error('Invalid drawing simulation step.');
   const iterations=Math.min(5,Math.max(0,Math.round(dt*60)));
   for(let i=0;i<iterations;i++){
    if(main?.isDynamic()){
      if(controls.go)main.applyForce(Vec2(27,0),main.getWorldCenter(),true);
      if(controls.jump&&!jumpLatch)main.applyLinearImpulse(Vec2(0,-Math.min(9,main.getMass()*4)),main.getWorldCenter(),true);
    }
    jumpLatch=!!controls.jump;
    world.step(1/60,8,3);time+=1/60;
   }
  },
  snapshot():PlayScene{
   const parts=order.map(c=>{
    let body=bodies.get(c.id);
    if(!body&&c.parentId)body=bodies.get(c.parentId);
    const p=body?.getPosition()||Vec2(8+c.offset.x,6+c.offset.y);
    const parent=order.find(k=>k.id===c.parentId);
    return {id:c.id,x:p.x+(!c.physical&&parent?c.offset.x-parent.offset.x:0),
      y:p.y+(!c.physical&&parent?c.offset.y-parent.offset.y:0),
      angle:body?.getAngle()||0,w:c.part.width,h:c.part.height,physical:c.physical};
   });
   return {time,parts,contacts:contactCount,origin:original};
  },
  dispose(){disposed=true;bodies.clear();}
 };
}
