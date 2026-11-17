import type {GameContext,GameInstance} from '../runtime/types';

/** Curated original game. Fully local: no assets, model calls or timers outside this instance. */
type Donut={x:number;y:number};
type Meteor={x:number;y:number;speed:number};
const make=(tag:string,className:string,text='')=>{const e=document.createElement(tag);e.className=className;e.textContent=text;return e;};
export default class MoonDonutDash implements GameInstance {
 private root=make('section','favorite-game favorite-moon');
 private canvas=document.createElement('canvas');
 private ctx:CanvasRenderingContext2D;
 private hud=make('p','favorite-hud');
 private note=make('p','favorite-note','Collect the donuts! Jump over meteors. Your cat has three hearts.');
 private left=false;private right=false;private jumpHeld=false;private pressed=new Set<string>();
 private heldPointers=new Map<number,string>();private abort=new AbortController();
 private raf=0;private last=0;private accumulator=0;private level=1;private frame=0;
 private x=75;private y=398;private vy=0;private collected=0;private hearts=3;private invulnerable=0;
 private donuts:Donut[]=[];private meteors:Meteor[]=[];private ended=false;private stopped=false;private hostPaused=false;
 private readonly goal:number;private readonly gravity:number;private readonly rate:number;
 constructor(target:HTMLElement,private context:GameContext) {
  this.goal=Number(context.config.donutGoal);this.gravity=Number(context.config.moonGravity);
  this.rate=Number(context.config.meteorRate);
  this.canvas.width=900;this.canvas.height=480;this.canvas.className='favorite-canvas';this.canvas.tabIndex=0;
  this.canvas.setAttribute('role','img');this.canvas.setAttribute('aria-label','Moon donut course with cat, donuts and falling meteors');
  this.ctx=this.canvas.getContext('2d')!;
  this.root.setAttribute('aria-label','Moon Donut Dash');
  const title=make('h2','favorite-title','🌙 Moon Donut Dash');
  const caption=make('p','favorite-subtitle','Run, jump, collect and dodge on the moon!');
  const controls=make('div','favorite-controls');
  for(const [action,label] of [['left','◀ Left'],['jump','↑ Jump'],['right','Right ▶']]){
   const button=make('button','favorite-control',label) as HTMLButtonElement;button.type='button';
   button.dataset.action=action;button.setAttribute('aria-label',action==='jump'?'Jump':action==='left'?'Move left':'Move right');
   button.addEventListener('pointerdown',e=>{if(this.ended||this.hostPaused)return;button.setPointerCapture(e.pointerId);this.heldPointers.set(e.pointerId,action);if(action==='jump')this.jump();},{signal:this.abort.signal});
   for(const event of ['pointerup','pointercancel','lostpointercapture'] as const)button.addEventListener(event,e=>{this.heldPointers.delete((e as PointerEvent).pointerId);},{signal:this.abort.signal});
   controls.append(button);
  }
  const restart=make('button','favorite-control','↺ Restart') as HTMLButtonElement;restart.type='button';restart.addEventListener('click',()=>this.restart(),{signal:this.abort.signal});controls.append(restart);
  this.root.append(title,caption,this.hud,this.canvas,controls,this.note);target.replaceChildren(this.root);
  window.addEventListener('keydown',e=>{if(this.hostPaused||this.ended||!/^(ArrowLeft|ArrowRight|ArrowUp| |a|d|w)$/i.test(e.key)||/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName))return;e.preventDefault();this.pressed.add(e.key.toLowerCase());if(e.key===' '||e.key==='ArrowUp'||e.key.toLowerCase()==='w')this.jump();},{signal:this.abort.signal});
  window.addEventListener('keyup',e=>this.pressed.delete(e.key.toLowerCase()),{signal:this.abort.signal});
  window.addEventListener('blur',()=>{this.pressed.clear();this.heldPointers.clear();},{signal:this.abort.signal});
  this.reset();
  const saved=context.persistence?.load() as any;
  if(saved&&saved.schema==='moon-donuts-v1'&&Number.isInteger(saved.level)&&saved.level>=1&&saved.level<=50
    &&typeof saved.x==='number'&&saved.x>=25&&saved.x<=875
    &&typeof saved.y==='number'&&saved.y>=0&&saved.y<=398
    &&Number.isInteger(saved.hearts)&&saved.hearts>=1&&saved.hearts<=3
    &&Number.isInteger(saved.collected)&&saved.collected>=0&&saved.collected<this.goal
    &&Array.isArray(saved.donuts)&&saved.donuts.length>0&&saved.donuts.length<=3
    &&saved.donuts.every((d:any)=>d&&Number.isFinite(d.x)&&d.x>=50&&d.x<=850&&d.y===388)){
     this.level=saved.level;this.x=saved.x;this.y=saved.y;this.hearts=saved.hearts;
     this.collected=saved.collected;this.donuts=saved.donuts.map((d:Donut)=>({...d}));
     this.hud.textContent='🍩 '+this.collected+' / '+this.goal+'     '+('❤️'.repeat(this.hearts))+'     Level '+this.level;
     this.note.textContent='Welcome back! Your moon donut mission is saved.';
  }
  this.raf=requestAnimationFrame(this.loop);
 }
 private save(){
  const ok=this.context.persistence?.save({schema:'moon-donuts-v1',level:this.level,
   x:this.x,y:this.y,collected:this.collected,hearts:this.hearts,donuts:this.donuts.map(d=>({...d}))});
  if(ok===false)this.note.textContent='Could not save your mission. Keep this page open and ask a grown-up to export progress.';
 }
 private reset(){
  this.x=75;this.y=398;this.vy=0;this.frame=0;this.collected=0;this.hearts=3;this.invulnerable=0;
  this.ended=false;this.hostPaused=false;this.pressed.clear();this.heldPointers.clear();this.donuts=[{x:160,y:388},{x:350,y:388},{x:565,y:388}];this.meteors=[];
  this.hud.textContent='🍩 0 / '+this.goal+'     ❤️❤️❤️     Level '+this.level;
  this.note.textContent='Collect donuts, avoid falling rocks. Jump using ↑, Space or the button.';
  this.last=0;this.accumulator=0;this.draw();
 }
 private jump(){if(this.y>=397&&!this.ended&&!this.hostPaused){this.vy=-11.4;this.y=396;}}
 private update(){
  if(this.ended||this.hostPaused)return;
  this.frame++;
  if(this.frame%90===0)this.save();
  const left=this.pressed.has('arrowleft')||this.pressed.has('a')||[...this.heldPointers.values()].includes('left');
  const right=this.pressed.has('arrowright')||this.pressed.has('d')||[...this.heldPointers.values()].includes('right');
  this.x=Math.max(25,Math.min(875,this.x+(Number(right)-Number(left))*4.1));
  this.vy=Math.min(10,this.vy+this.gravity);this.y=Math.min(398,this.y+this.vy);if(this.y>=398)this.vy=0;
  if(this.invulnerable>0)this.invulnerable--;
  for(let i=this.donuts.length-1;i>=0;i--){
   const d=this.donuts[i];if(Math.hypot(this.x-d.x,this.y-d.y)<36){
    this.donuts.splice(i,1);this.collected++;this.save();
    if(this.collected>=this.goal){this.ended=true;this.context.finish({won:true,level:this.level,title:'Donut explorer!',description:'You collected '+this.collected+' moon donuts.'});break;}
    this.donuts.push({x:100+Math.floor(Math.random()*690),y:388});
   }
  }
  if(this.ended)return;
  const interval=Math.max(75,Math.round(160/(this.rate*(1+(this.level-1)*.08))));
  if(this.frame%interval===0)this.meteors.push({x:55+Math.random()*790,y:-24,speed:2.7*this.rate});
  for(let i=this.meteors.length-1;i>=0;i--){
   const m=this.meteors[i];m.y+=m.speed;
   if(m.y>465){this.meteors.splice(i,1);continue;}
   if(this.invulnerable===0&&Math.hypot(this.x-m.x,this.y-m.y)<34){
    this.meteors.splice(i,1);this.hearts--;this.invulnerable=85;this.save();
    this.note.textContent=this.hearts?'A meteor bounced you! You can try again.':'The meteors caught you. Choose Retry to try again.';
    if(this.hearts===0){this.ended=true;this.context.finish({won:false,level:this.level,title:'Moon mission paused',description:'You collected '+this.collected+' donuts. Try a new route!'});break;}
   }
  }
  this.hud.textContent='🍩 '+this.collected+' / '+this.goal+'     '+('❤️'.repeat(this.hearts)||'♡')+'     Level '+this.level;
 }
 private draw(){
  const c=this.ctx;c.clearRect(0,0,900,480);
  const g=c.createLinearGradient(0,0,0,480);g.addColorStop(0,'#152447');g.addColorStop(1,'#445b85');c.fillStyle=g;c.fillRect(0,0,900,480);
  for(let i=0;i<55;i++){const x=(i*157+83)%900,y=(i*97+24)%330;c.fillStyle=i%4?'#d7e2fa':'#fff4a8';c.beginPath();c.arc(x,y,i%6===0?2.5:1.3,0,Math.PI*2);c.fill();}
  c.fillStyle='#f4e6be';c.beginPath();c.arc(762,91,53,0,Math.PI*2);c.fill();
  c.fillStyle='#d4c69f';for(const [x,y,r] of [[748,73,12],[786,101,9],[753,112,6]]){c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();}
  c.fillStyle='#a5b5c6';c.beginPath();c.moveTo(0,412);for(let x=0;x<=900;x+=40)c.lineTo(x,410+Math.sin(x*.018)*12);c.lineTo(900,480);c.lineTo(0,480);c.fill();
  for(const d of this.donuts){c.fillStyle='#e2a75a';c.beginPath();c.arc(d.x,d.y,18,0,Math.PI*2);c.fill();
   c.fillStyle='#fa8fb4';c.beginPath();c.arc(d.x,d.y,15,Math.PI*1.05,Math.PI*2.95);c.fill();
   c.fillStyle='#45567d';c.beginPath();c.arc(d.x,d.y,7,0,Math.PI*2);c.fill();
  }
  for(const m of this.meteors){c.fillStyle='#d39a6e';c.beginPath();c.arc(m.x,m.y,19,0,Math.PI*2);c.fill();
   c.fillStyle='#a46d56';c.beginPath();c.arc(m.x-5,m.y+3,7,0,Math.PI*2);c.fill();}
  if(this.invulnerable%8<4){c.save();c.translate(this.x,this.y);c.fillStyle='#ffe1ab';
   c.beginPath();c.ellipse(0,0,22,21,0,0,Math.PI*2);c.fill();
   c.beginPath();c.moveTo(-18,-13);c.lineTo(-14,-35);c.lineTo(-2,-18);c.closePath();c.fill();
   c.beginPath();c.moveTo(18,-13);c.lineTo(14,-35);c.lineTo(2,-18);c.closePath();c.fill();
   c.fillStyle='#2c3a53';for(const x of [-8,8]){c.beginPath();c.arc(x,-3,2.7,0,Math.PI*2);c.fill();}
   c.strokeStyle='#2c3a53';c.lineWidth=2;c.beginPath();c.arc(0,5,5,0,Math.PI);c.stroke();c.restore();}
 }
 private loop=(time:number)=>{
  if(this.stopped)return;
  if(!this.last)this.last=time;
  const dt=Math.min(50,time-this.last);this.last=time;
  if(!this.hostPaused&&!this.ended){this.accumulator+=dt;let steps=0;while(this.accumulator>=1000/60&&steps++<4){this.update();this.accumulator-=1000/60;}}
  this.draw();this.raf=requestAnimationFrame(this.loop);
 };
 next(){if(this.hostPaused||this.stopped)return;this.level++;this.reset();this.save();}
 restart(){if(this.hostPaused||this.stopped)return;this.level=1;this.reset();this.save();}
 retry(){this.restart();}
 isPlaying(){return !this.stopped&&!this.ended&&!this.hostPaused;}
 pause(){if(!this.isPlaying())return false;this.hostPaused=true;this.pressed.clear();this.heldPointers.clear();return true;}
 resume(){if(!this.stopped){this.hostPaused=false;this.last=0;this.accumulator=0;}}
 snapshot(){return {level:this.level,donuts:this.collected,goal:this.goal,hearts:this.hearts,x:this.x,y:this.y,hostPaused:this.hostPaused};}
 unmount(){this.save();this.stopped=true;cancelAnimationFrame(this.raf);this.abort.abort();this.root.remove();}
}
