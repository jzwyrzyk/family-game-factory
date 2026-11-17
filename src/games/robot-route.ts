import type {GameContext,GameInstance} from '../runtime/types';

/** Curated original logic game: children author the route, the game never supplies a solution. */
type Point={x:number;y:number};
type Direction='up'|'right'|'down'|'left';
type Mission={start:Point;goal:Point;walls:string[];name:string};
const missions:Mission[]=[
 {name:'The moon mail run',start:{x:0,y:4},goal:{x:4,y:0},walls:['2,1','2,2','2,3']},
 {name:'The zigzag workshop',start:{x:0,y:4},goal:{x:4,y:0},walls:['1,4','1,3','3,1','3,2']},
 {name:'The robot rescue',start:{x:0,y:4},goal:{x:4,y:0},walls:['1,1','1,2','2,2','3,2']},
];
const delta:Record<Direction,Point>={up:{x:0,y:-1},right:{x:1,y:0},down:{x:0,y:1},left:{x:-1,y:0}};
const move=(p:Point,d:Direction):Point=>({x:p.x+delta[d].x,y:p.y+delta[d].y});
const key=(p:Point)=>p.x+','+p.y;
const make=(tag:string,className:string,text='')=>{const e=document.createElement(tag);e.className=className;e.textContent=text;return e;};
export default class RobotRoute implements GameInstance {
 private root=make('section','favorite-game favorite-robot');
 private canvas=document.createElement('canvas');
 private ctx:CanvasRenderingContext2D;
 private hud=make('p','favorite-hud');
 private instructions=make('p','favorite-note');
 private commands=make('div','favorite-command-list');
 private abort=new AbortController();
 private plan:Direction[]=[];private trail:Point[]=[];private position:Point={x:0,y:4};
 private level=1;private index=0;private running=false;private ended=false;private stopped=false;private hostPaused=false;
 private last=0;private accumulator=0;private raf=0;
 private readonly showTrail:boolean;private readonly speed:number;
 constructor(target:HTMLElement,private context:GameContext){
  this.speed=Number(context.config.robotSpeed);this.showTrail=Boolean(context.config.showTrail);
  this.canvas.width=620;this.canvas.height=500;this.canvas.className='favorite-canvas';
  this.canvas.tabIndex=0;this.canvas.setAttribute('role','img');this.canvas.setAttribute('aria-label','Robot grid. Choose arrow commands, then press Run my plan.');
  this.ctx=this.canvas.getContext('2d')!;
  this.root.setAttribute('aria-label','Robot Route Lab');
  const title=make('h2','favorite-title','🤖 Robot Route Lab');
  const subtitle=make('p','favorite-subtitle','Plan a path. Test it. Figure out what to change.');
  const controls=make('div','favorite-controls'),actions=make('div','favorite-controls');
  for(const [direction,label] of [['up','↑ Up'],['left','← Left'],['down','↓ Down'],['right','Right →']] as const){
   const b=make('button','favorite-control',label) as HTMLButtonElement;b.type='button';
   b.dataset.direction=direction;b.addEventListener('click',()=>this.add(direction),{signal:this.abort.signal});controls.append(b);
  }
  const action=(label:string,fn:()=>void)=>{
   const b=make('button','favorite-control',label) as HTMLButtonElement;b.type='button';
   b.addEventListener('click',fn,{signal:this.abort.signal});actions.append(b);return b;
  };
  const run=action('▶ Run my plan',()=>this.run());run.classList.add('favorite-control-primary');
  action('↶ Undo arrow',()=>{if(!this.running&&!this.hostPaused&&this.plan.length&&!this.ended){this.plan.pop();this.renderPlan();this.save();}});
  action('↺ Clear arrows',()=>{if(!this.hostPaused){this.plan=[];this.running=false;this.position={...this.mission().start};this.index=0;this.trail=[{...this.position}];this.renderPlan();this.save();}});
  this.canvas.addEventListener('keydown',e=>{const direction:Record<string,Direction>={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right'};if(direction[e.key]){e.preventDefault();this.add(direction[e.key]);}},{signal:this.abort.signal});
  this.root.append(title,subtitle,this.hud,this.canvas,this.instructions,controls,this.commands,actions);target.replaceChildren(this.root);
  this.reset();
  // Reopening a test restores the child's route, not a fabricated solved result.
  const saved=context.persistence?.load() as any;
  if(saved&&saved.schema==='robot-route-v1'&&Number.isInteger(saved.level)&&saved.level>=1&&saved.level<=50
    &&Array.isArray(saved.plan)&&saved.plan.length<=24&&saved.plan.every((d:unknown)=>typeof d==='string'&&Object.hasOwn(delta,d))){
   this.level=saved.level;this.reset();this.plan=[...saved.plan];this.renderPlan();
   this.instructions.textContent='Your arrow plan is saved. Run it, or try another idea!';
  }
  this.raf=requestAnimationFrame(this.loop);
 }
 private mission(){return missions[(this.level-1)%missions.length];}
 private legal(p:Point){return p.x>=0&&p.x<5&&p.y>=0&&p.y<5&&!this.mission().walls.includes(key(p));}
 private save(){
  const ok=this.context.persistence?.save({schema:'robot-route-v1',level:this.level,plan:[...this.plan]});
  if(ok===false)this.instructions.textContent='Could not save your arrows. Keep this page open and ask a grown-up to export progress.';
 }
 private add(d:Direction){
  if(this.hostPaused||this.ended||this.running||this.plan.length>=24)return;
  this.plan.push(d);this.renderPlan();this.save();
 }
 private renderPlan(){
  this.commands.textContent=this.plan.length?'My arrows: '+this.plan.map(d=>({up:'↑',down:'↓',left:'←',right:'→'}[d])).join(' '):'Choose arrows for your robot.';
  if(this.plan.length===24)this.instructions.textContent='That is a long route! Run it, undo arrows, or start again.';
  this.draw();
 }
 private reset(){
  this.ended=false;this.hostPaused=false;this.running=false;this.index=0;this.last=0;this.accumulator=0;
  this.plan=[];this.position={...this.mission().start};this.trail=[{...this.position}];
  this.hud.textContent='Mission '+this.level+' · '+this.mission().name;
  this.instructions.textContent='Guide your robot to the ⭐. The dark squares are walls. You invent the path!';
  this.renderPlan();
 }
 private run(){
  if(this.ended||this.hostPaused||this.running||!this.plan.length)return;
  this.running=true;this.index=0;this.position={...this.mission().start};this.trail=[{...this.position}];
  this.instructions.textContent='Testing your plan…';this.accumulator=0;this.last=0;this.save();
 }
 private step(){
  if(!this.running||this.hostPaused)return;
  if(this.index>=this.plan.length){this.running=false;this.instructions.textContent='Not there yet. What arrow would you change or add?';return;}
  const next=move(this.position,this.plan[this.index++]);
  if(!this.legal(next)){this.running=false;this.instructions.textContent='Bonk! Your robot hit a wall. Undo a move or try a different route.';return;}
  this.position=next;this.trail.push({...next});this.save();
  const goal=this.mission().goal;
  if(next.x===goal.x&&next.y===goal.y){
   this.running=false;this.ended=true;this.instructions.textContent='Great route! Choose Next to try a new puzzle.';
   this.context.finish({won:true,level:this.level,title:'The robot made it!',description:'Your '+this.index+'-move plan reached the star.'});
  }else if(this.index>=this.plan.length){this.running=false;this.instructions.textContent='Your robot stopped safely. Add arrows to reach the star.';}
 }
 private draw(){
  const c=this.ctx;c.clearRect(0,0,620,500);
  c.fillStyle='#18283a';c.fillRect(0,0,620,500);
  const walls=new Set(this.mission().walls);
  const size=79,x0=112,y0=44;
  for(let y=0;y<5;y++)for(let x=0;x<5;x++){
   const px=x0+x*size,py=y0+y*size,wall=walls.has(key({x,y}));
   c.fillStyle=wall?'#46566f':'#d7ece4';c.fillRect(px+3,py+3,size-7,size-7);
   if(wall){c.fillStyle='#7a91a9';c.fillRect(px+22,py+22,size-44,size-44);}
  }
  if(this.showTrail&&this.trail.length>1){
   c.strokeStyle='#5a9ed6';c.lineWidth=7;c.lineJoin='round';c.beginPath();
   this.trail.forEach((p,i)=>i?c.lineTo(x0+p.x*size+size/2,y0+p.y*size+size/2):c.moveTo(x0+p.x*size+size/2,y0+p.y*size+size/2));c.stroke();
  }
  const goal=this.mission().goal;c.fillStyle='#eba944';c.font='44px system-ui';c.textAlign='center';c.textBaseline='middle';
  c.fillText('⭐',x0+goal.x*size+size/2,y0+goal.y*size+size/2);
  const r=this.position,px=x0+r.x*size+size/2,py=y0+r.y*size+size/2;
  c.fillStyle='#f5a67c';c.beginPath();c.roundRect(px-25,py-24,50,48,10);c.fill();
  c.fillStyle='#23384f';for(const ex of [-11,11]){c.beginPath();c.arc(px+ex,py-5,5,0,Math.PI*2);c.fill();}
  c.strokeStyle='#e1d0a7';c.lineWidth=4;c.beginPath();c.moveTo(px,py-24);c.lineTo(px,py-35);c.stroke();
  c.fillStyle='#fff';c.font='16px system-ui';c.fillText('START',x0+38,y0+4*size+size-8);
 }
 private loop=(time:number)=>{
  if(this.stopped)return;
  if(!this.last)this.last=time;
  const elapsed=Math.min(50,time-this.last);this.last=time;
  if(this.running&&!this.hostPaused&&!this.ended){
   this.accumulator+=elapsed;const interval=440/this.speed;
   if(this.accumulator>=interval){this.accumulator-=interval;this.step();}
  }
  this.draw();this.raf=requestAnimationFrame(this.loop);
 };
 next(){if(this.hostPaused||this.stopped)return;this.level++;this.reset();this.save();}
 restart(){if(this.hostPaused||this.stopped)return;this.level=1;this.reset();this.save();}
 retry(){if(this.hostPaused||this.stopped)return;this.reset();this.save();}
 isPlaying(){return !this.stopped&&!this.ended&&!this.hostPaused;}
 pause(){if(!this.isPlaying())return false;this.hostPaused=true;return true;}
 resume(){if(!this.stopped){this.hostPaused=false;this.last=0;}}
 snapshot(){return {level:this.level,planLength:this.plan.length,index:this.index,running:this.running,position:{...this.position},hostPaused:this.hostPaused};}
 unmount(){this.save();this.stopped=true;cancelAnimationFrame(this.raf);this.abort.abort();this.root.remove();}
}
