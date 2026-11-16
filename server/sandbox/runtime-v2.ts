/** Trusted worker capabilities. Generated source receives only frozen handles, never Planck objects.
 * Version this contract when changing behavior; old generated-module-v1 runs unchanged.
 */
import {World,Vec2,Box,Circle,Polygon,DistanceJoint,WeldJoint,RevoluteJoint,WheelJoint,MouseJoint} from 'planck';
import type {Body,Joint} from 'planck';
import {PARTS} from '../../src/quality/parts';

export const VERSION='quality-runtime-v2.0.3';
export const LIMITS=Object.freeze({bodies:40,joints:60,events:24,commands:240,steps:4});
const SCALE=40, STEP=1/60;
const number=(v:unknown,min:number,max:number,fallback?:number):number=>{if(v===undefined&&fallback!==undefined)return fallback;if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw Error('CAPABILITY_NUMBER_LIMIT');return v;};
const id=(v:unknown):string=>{if(typeof v!=='string'||! /^[a-zA-Z][\w-]{0,39}$/.test(v))throw Error('CAPABILITY_ID_LIMIT');return v;};
const spriteIds=new Set([...Object.keys(PARTS),'chassis','star','hero']);
const sprite=(v:unknown):string=>{if(typeof v!=='string'||!spriteIds.has(v))throw Error('SPRITE_NOT_APPROVED');return v;};
const plain=(v:any,keys:string[])=>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error('CAPABILITY_SHAPE_REJECTED');const names=Object.keys(v);if(names.length>keys.length||names.some(k=>!keys.includes(k)))throw Error('CAPABILITY_SHAPE_REJECTED');const result:Record<string,unknown>=Object.create(null);for(const key of names){const descriptor=Object.getOwnPropertyDescriptor(v,key);if(!descriptor||!Object.hasOwn(descriptor,'value'))throw Error('CAPABILITY_ACCESSOR_REJECTED');result[key]=descriptor.value;}return result;};
type View={id:string;spriteId:string;width:number;height:number;body:Body};
type Link={id:string;a:string;b:string;joint:Joint;strength:number;overload:number};
export function createCapabilities(){
 let world=new World(Vec2(0,10)),bodies=new Map<string,View>(),links=new Map<string,Link>(),events:any[]=[],sounds:any[]=[],camera={x:0,y:0,zoom:1},musicMode='off',drag:MouseJoint|undefined,ground=world.createBody();let clock=0,dead=false,operations=0;
 const guard=()=>{if(dead)throw Error('WORLD_DISPOSED');if(++operations>500)throw Error('CAPABILITY_OPERATION_LIMIT');};
 const get=(key:string)=>{const item=bodies.get(id(key));if(!item)throw Error('BODY_NOT_FOUND');return item;};
 const emit=(event:any)=>{if(events.length<LIMITS.events)events.push(event);};
 const watch=()=>world.on('post-solve',(contact,impulse)=>{const hit=Math.max(...impulse.normalImpulses);if(hit>.5){const a=contact.getFixtureA().getBody().getUserData(),b=contact.getFixtureB().getBody().getUserData();emit({type:'contact',a:typeof a==='string'?a:'ground',b:typeof b==='string'?b:'ground',impact:Math.min(10,hit)});}});
 watch();
 function reset(options:any={}){guard();options=plain(options,['gravityX','gravityY']);world=new World(Vec2(number(options.gravityX,-20,20,0),number(options.gravityY,-20,20,10)));ground=world.createBody();bodies.clear();links.clear();events=[];sounds=[];drag=undefined;watch();}
 function body(options:any){
  guard();options=plain(options,['id','type','shape','x','y','width','height','radius','mass','angle','friction','restitution','spriteId']);const key=id(options.id);
  if(!['dynamic','static','kinematic',undefined].includes(options.type)||!['box','circle'].includes(options.shape))throw Error('BODY_KIND_REJECTED');
  const x=number(options.x,-4000,4000)/SCALE,y=number(options.y,-4000,4000)/SCALE,angle=number(options.angle,-Math.PI*8,Math.PI*8,0),mass=number(options.mass,.1,20,1);
  const width=options.shape==='circle'?number(options.radius,4,300)*2:number(options.width,4,600),height=options.shape==='circle'?width:number(options.height,4,600),spriteId=sprite(options.spriteId||'carton'),friction=number(options.friction,0,2,.6),restitution=number(options.restitution,0,.8,.1);
  if(bodies.size>=LIMITS.bodies||bodies.has(key))throw Error('BODY_LIMIT');const b=world.createBody({type:options.type||'dynamic',position:Vec2(x,y),angle,bullet:true,userData:key});
  const area=options.shape==='circle'?Math.PI*(width/2/SCALE)**2:width*height/SCALE**2;
  b.createFixture(options.shape==='circle'?Circle(width/2/SCALE):Box(width/2/SCALE,height/2/SCALE),{density:mass/area,friction,restitution});
  bodies.set(key,{id:key,spriteId,width,height,body:b});return key;
 }
 function part(options:any){
  guard();options=plain(options,['id','part','x','y','angle','massScale']);if(typeof options.part!=='string'||!Object.hasOwn(PARTS,options.part))throw Error('PART_NOT_APPROVED');const p=(PARTS as any)[options.part],massScale=number(options.massScale,.5,2,1);
  const key=id(options.id);if(bodies.size>=LIMITS.bodies||bodies.has(key))throw Error('BODY_LIMIT');
  const b=world.createBody({type:'dynamic',position:Vec2(number(options.x,-4000,4000)/SCALE,number(options.y,-4000,4000)/SCALE),angle:number(options.angle,-Math.PI*8,Math.PI*8,0),bullet:true,userData:key});
  const shape=p.collider.type==='circle'?Circle(p.collider.radius):p.collider.type==='polygon'?Polygon(p.collider.vertices.map((v:any)=>Vec2(v.x,v.y))):Box(p.collider.width/2,p.collider.height/2);
  b.createFixture(shape,{density:1,friction:p.friction,restitution:p.restitution});const md={mass:0,center:Vec2(),I:0};b.getMassData(md);const ratio=p.mass*massScale/Math.max(.001,md.mass);b.setMassData({mass:md.mass*ratio,center:md.center,I:md.I*ratio});
  bodies.set(key,{id:key,spriteId:p.spriteId,width:p.width*SCALE,height:p.height*SCALE,body:b});return key;
 }
 function join(options:any){
  guard();options=plain(options,['id','type','a','b','x','y','x2','y2','frequency','damping','strength','motorSpeed','motorTorque']);const key=id(options.id);if(links.size>=LIMITS.joints||links.has(key))throw Error('JOINT_LIMIT');
  const a=get(options.a),b=get(options.b);if(a===b)throw Error('JOINT_SELF_LINK');const p=Vec2(number(options.x,-4000,4000)/SCALE,number(options.y,-4000,4000)/SCALE),frequency=number(options.frequency,.5,12,4),damping=number(options.damping,.1,1,.7),strength=number(options.strength,1,500,100);
  let joint:Joint|null;
  if(options.type==='spring')joint=world.createJoint(new DistanceJoint({frequencyHz:frequency,dampingRatio:damping,collideConnected:false},a.body,b.body,p,Vec2(number(options.x2,-4000,4000,options.x)/SCALE,number(options.y2,-4000,4000,options.y)/SCALE)));
  else if(options.type==='weld')joint=world.createJoint(new WeldJoint({frequencyHz:frequency,dampingRatio:damping,collideConnected:false},a.body,b.body,p));
  else if(options.type==='hinge')joint=world.createJoint(new RevoluteJoint({collideConnected:false},a.body,b.body,p));
  else if(options.type==='wheel')joint=world.createJoint(new WheelJoint({frequencyHz:frequency,dampingRatio:damping,enableMotor:true,motorSpeed:number(options.motorSpeed,-40,40,0),maxMotorTorque:number(options.motorTorque,0,100,20),collideConnected:false},a.body,b.body,p,Vec2(0,1)));
  else throw Error('JOINT_KIND_REJECTED');if(!joint)throw Error('JOINT_FAILED');links.set(key,{id:key,a:a.id,b:b.id,joint,strength,overload:0});return key;
 }
 function transform(key:string){guard();const b=get(key).body,p=b.getPosition(),v=b.getLinearVelocity();return Object.freeze({x:p.x*SCALE,y:p.y*SCALE,angle:b.getAngle(),vx:v.x*SCALE,vy:v.y*SCALE,angularVelocity:b.getAngularVelocity()});}
 const physics=Object.freeze({reset,body,part,join,transform,
  force(key:string,x:number,y:number){guard();const b=get(key).body;b.applyForceToCenter(Vec2(number(x,-200,200),number(y,-200,200)),true);},
  thrust(key:string,power:number,localAngle=0){guard();const b=get(key).body,angle=b.getAngle()+number(localAngle,-Math.PI*2,Math.PI*2);b.applyForceToCenter(Vec2(Math.sin(angle)*number(power,-100,100),-Math.cos(angle)*power),true);},
  impulse(key:string,x:number,y:number){guard();get(key).body.applyLinearImpulse(Vec2(number(x,-30,30),number(y,-30,30)),get(key).body.getWorldCenter(),true);},
  torque(key:string,value:number){guard();get(key).body.applyTorque(number(value,-50,50),true);},
  motor(key:string,speed:number){guard();const link=links.get(id(key));if(!link||!(link.joint instanceof WheelJoint))throw Error('WHEEL_JOINT_REQUIRED');(link.joint as WheelJoint).setMotorSpeed(number(speed,-40,40));},
  drag(key:string|null,x?:number,y?:number){guard();if(key===null){if(drag)world.destroyJoint(drag);drag=undefined;return;}const target=Vec2(number(x,-4000,4000)/SCALE,number(y,-4000,4000)/SCALE),b=get(key).body;if(!b.isDynamic())throw Error('DYNAMIC_DRAG_REQUIRED');if(!drag||drag.getBodyB()!==b){if(drag)world.destroyJoint(drag);drag=world.createJoint(new MouseJoint({maxForce:Math.min(1000,100*b.getMass()),frequencyHz:5,dampingRatio:.8},ground,b,target))||undefined;}drag?.setTarget(target);b.setAwake(true);},
  remove(key:string){guard();const b=get(key).body;if(drag?.getBodyB()===b){world.destroyJoint(drag);drag=undefined;}for(const [name,link]of links)if(link.a===key||link.b===key)links.delete(name);world.destroyBody(b);bodies.delete(key);},
  sprites(){guard();return [...bodies.values()].map(v=>{const p=v.body.getPosition();return {type:'sprite',key:v.id,spriteId:v.spriteId,x:p.x*SCALE,y:p.y*SCALE,width:v.width,height:v.height,angle:v.body.getAngle()};});},
  links(){guard();return [...links.values()].map(v=>{const a=v.joint.getAnchorA(),b=v.joint.getAnchorB();return {type:'line',key:'joint-'+v.id,x:a.x*SCALE,y:a.y*SCALE,x2:b.x*SCALE,y2:b.y*SCALE,width:6,color:v.overload>0?'#f3a73b':'#ea6f9a'};});},
  events(){guard();const copy=events.map(e=>Object.freeze({...e}));events=[];return copy;}
 });
 const soundIds=new Set(['attach','snap','impact','bounce','success','boost','pickup']);
 const api=Object.freeze({version:VERSION,physics,
  sound(name:string,volume=.5,pitch=1){guard();if(!soundIds.has(name)||sounds.length>=8)throw Error('AUDIO_LIMIT');sounds.push({id:name,volume:number(volume,0,1),pitch:number(pitch,.5,2)});},
  camera(x:number,y:number,zoom=1){guard();camera={x:number(x,-4000,4000),y:number(y,-4000,4000),zoom:number(zoom,.5,2)};},
  music(mode:string){guard();if(!['off','build','play'].includes(mode))throw Error('MUSIC_NOT_APPROVED');musicMode=mode;},
 });
 return {api,
  beginTick(){operations=0;},
  step(){if(bodies.size>LIMITS.bodies||links.size>LIMITS.joints||world.getBodyCount()!==bodies.size+1||world.getJointCount()!==links.size+(drag?1:0))throw Error('WORLD_RESOURCE_INVARIANT');world.step(STEP,8,3);clock+=STEP;for(const [key,l]of links){const f=l.joint.getReactionForce(60),load=Math.hypot(f.x,f.y)+Math.abs(l.joint.getReactionTorque(60))*2;l.overload=load>l.strength?l.overload+STEP:Math.max(0,l.overload-STEP*2);if(l.overload>.08){world.destroyJoint(l.joint);links.delete(key);emit({type:'snap',id:key,a:l.a,b:l.b});}}for(const v of bodies.values()){const p=v.body.getPosition();if(!Number.isFinite(p.x+p.y)||Math.abs(p.x)>250||Math.abs(p.y)>250)throw Error('WORLD_BOUNDS');}},
  presentation(){const result={sounds:sounds.splice(0,8),music:musicMode,camera:{...camera},bodies:bodies.size,joints:links.size,ticks:Math.round(clock*60)};return result;},
  dispose(){dead=true;drag=undefined;bodies.clear();links.clear();events=[];sounds=[];}
 };
}
