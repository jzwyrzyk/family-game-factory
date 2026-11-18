import type {GameContext,GameInstance} from '../runtime/types';
import './sticker-builder.css';

/**
 * Sticker-first, physics-free play. The legacy physical workshop remains available
 * through qualityVersion=1 and retains its separate persistence slot.
 * No external art, network requests, random physics or unbounded animation loops.
 */
type MissionId='rocket'|'sub'|'robot';
type Phase='stick'|'launch'|'done';
type Saved={schema:'gum-stickers-v1';mission:MissionId;placed:Record<string,string>};
type Slot={id:string;name:string;x:number;y:number};
type Mission={id:MissionId;title:string;tagline:string;verb:string;outcome:string;slots:Slot[];art:string};
type Sticker={id:string;name:string;shape:string};
const make=(tag:string,css='',text='')=>{const n=document.createElement(tag);n.className=css;n.textContent=text;return n;};
const art=(shape:string)=>'<svg viewBox="0 0 96 96" role="presentation" focusable="false" aria-hidden="true"><circle cx="48" cy="48" r="41" fill="#fff" stroke="#8b6ee8" stroke-width="3"/>'+shape+'</svg>';
const STICKERS:Sticker[]=[
 {id:'star',name:'Super star',shape:'<path d="M48 13 58 36 82 40 64 57 69 82 48 70 27 82 32 57 14 40 38 36Z" fill="#ffca40" stroke="#cc7b10" stroke-width="4" stroke-linejoin="round"/><circle cx="40" cy="47" r="2.5" fill="#543e83"/><circle cx="55" cy="47" r="2.5" fill="#543e83"/>'},
 {id:'heart',name:'Love power',shape:'<path d="M48 77C23 59 12 50 16 34 20 19 39 18 48 33 57 18 77 19 80 34 84 50 73 59 48 77Z" fill="#ff608b" stroke="#d43f6a" stroke-width="4"/><path d="M29 33q4-7 11-5" stroke="#fff" stroke-width="5" stroke-linecap="round" fill="none"/>'},
 {id:'eyes',name:'Googly eyes',shape:'<ellipse cx="34" cy="45" rx="18" ry="24" fill="#fff" stroke="#294b9a" stroke-width="3"/><ellipse cx="63" cy="45" rx="18" ry="24" fill="#fff" stroke="#294b9a" stroke-width="3"/><circle cx="39" cy="50" r="8" fill="#292e6b"/><circle cx="69" cy="50" r="8" fill="#292e6b"/><circle cx="42" cy="46" r="3" fill="#fff"/><circle cx="72" cy="46" r="3" fill="#fff"/>'},
 {id:'bolt',name:'Zoom bolt',shape:'<path d="M51 9 25 51h21l-7 36 34-48H51Z" fill="#40d8c6" stroke="#158a98" stroke-width="4" stroke-linejoin="round"/><path d="M47 25 39 43" stroke="#fff" stroke-linecap="round" stroke-width="4"/>'},
 {id:'flower',name:'Happy flower',shape:'<g fill="#c09fff" stroke="#7553cc" stroke-width="2"><ellipse cx="48" cy="28" rx="13" ry="17"/><ellipse cx="48" cy="68" rx="13" ry="17"/><ellipse cx="28" cy="48" rx="17" ry="13"/><ellipse cx="68" cy="48" rx="17" ry="13"/></g><circle cx="48" cy="48" r="18" fill="#ffcf55" stroke="#d78d2d" stroke-width="3"/><path d="M39 50q9 11 18 0" fill="none" stroke="#4e3f65" stroke-width="3" stroke-linecap="round"/>'},
 {id:'bubble',name:'Mega bubble',shape:'<circle cx="46" cy="45" r="30" fill="#8ee8f8" stroke="#3f99c6" stroke-width="4"/><ellipse cx="34" cy="31" rx="11" ry="6" transform="rotate(-30 34 31)" fill="#fff" opacity=".85"/><circle cx="73" cy="74" r="9" fill="#d0b3fa" stroke="#8964de" stroke-width="2"/>'},
 {id:'rainbow',name:'Rainbow zoom',shape:'<path d="M19 64a29 29 0 0 1 58 0" fill="none" stroke="#ff729f" stroke-width="10"/><path d="M27 64a21 21 0 0 1 42 0" fill="none" stroke="#ffc248" stroke-width="9"/><path d="M35 64a13 13 0 0 1 26 0" fill="none" stroke="#43ccbb" stroke-width="8"/><path d="M43 65a5 5 0 0 1 10 0" fill="none" stroke="#6764df" stroke-width="7"/>'},
 {id:'candy',name:'Candy button',shape:'<path d="M30 34 13 26l-4 21 21 14M66 34l17-8 4 21-21 14" fill="#46cbec" stroke="#1475a9" stroke-width="3"/><rect x="27" y="30" width="42" height="34" rx="17" fill="#ff8bb9" stroke="#d85291" stroke-width="4"/><path d="M38 34 57 60" stroke="#fff" stroke-width="5" stroke-linecap="round"/>'},
 {id:'cloud',name:'Cloud puff',shape:'<path d="M24 67Q8 65 12 50q3-14 19-13 0-20 22-20 21 0 24 21 18 1 17 17-1 16-20 16Z" fill="#c5eaff" stroke="#6caad8" stroke-width="4"/><path d="M31 46q4-10 15-10" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round"/>'},
 {id:'moon',name:'Moon cookie',shape:'<path d="M58 10Q21 23 27 53q7 27 40 26-23 21-48-5-25-31-1-60Q37-6 58 10Z" fill="#ffc85c" stroke="#d48a32" stroke-width="4"/><circle cx="39" cy="40" r="6" fill="#e99b58"/><circle cx="42" cy="62" r="4" fill="#e99b58"/>'},
 {id:'donut',name:'Donut drive',shape:'<circle cx="48" cy="48" r="30" fill="#d49b61" stroke="#a9655c" stroke-width="4"/><path d="M19 46q-2-30 30-28 34 2 29 34-4 13-12 19-1-15-15-14-14-1-16 16-13-7-16-27Z" fill="#ff89bb"/><circle cx="48" cy="48" r="12" fill="#fff" stroke="#bb7a6b" stroke-width="4"/><g stroke-width="4" stroke-linecap="round"><path d="M29 37l7 5" stroke="#fff"/><path d="M62 34l7 4" stroke="#73d6e0"/><path d="M60 66l6-3" stroke="#ffe06b"/></g>'},
 {id:'wheel',name:'Bubble wheel',shape:'<circle cx="48" cy="48" r="30" fill="#5e66c4" stroke="#343f91" stroke-width="5"/><circle cx="48" cy="48" r="19" fill="#c7bbff" stroke="#a98adf" stroke-width="4"/><circle cx="48" cy="48" r="9" fill="#ffe091" stroke="#c49742" stroke-width="4"/><path d="M48 30v8M66 48h-8M48 66v-8M30 48h8" stroke="#fff" stroke-width="4" stroke-linecap="round"/>'}
];
const base=(svg:string)=>'<svg class="gum-machine-svg" viewBox="0 0 620 420" focusable="false" aria-hidden="true"><defs><linearGradient id="gumShine" x1="0" x2="1"><stop stop-color="#fff"/><stop offset=".55" stop-color="#c7f0ff"/><stop offset="1" stop-color="#97b8ff"/></linearGradient></defs>'+svg+'</svg>';
const MISSIONS:Mission[]=[
 {id:'rocket',title:'Rocket Pop',tagline:'Dress up your rocket and send it to the stars!',verb:'🚀 BLAST OFF!',outcome:'Your bubblegum rocket zoomed into the stars!',slots:[
  {id:'top',name:'Top',x:51,y:23},{id:'middle',name:'Window',x:37,y:56},{id:'boost',name:'Boost',x:65,y:72}
 ],art:base('<ellipse cx="310" cy="382" rx="102" ry="15" fill="#6575cf" opacity=".18"/><path d="M273 245 221 308 276 296M347 245l52 63-55-12" fill="#ff689e" stroke="#aa3e90" stroke-width="8" stroke-linejoin="round"/><path d="M312 63c-65 66-73 154-56 236h112c16-82 9-170-56-236Z" fill="url(#gumShine)" stroke="#3a54ae" stroke-width="9" stroke-linejoin="round"/><path d="M312 63c-27 28-40 59-48 83h96c-8-24-21-55-48-83Z" fill="#946aff" stroke="#6544ca" stroke-width="5"/><circle cx="312" cy="202" r="44" fill="#42c9e9" stroke="#5365cb" stroke-width="9"/><circle cx="304" cy="194" r="25" fill="#c5f7ff" opacity=".8"/><path d="M275 299h74l-11 40h-52Z" fill="#7b62f1" stroke="#4c44a8" stroke-width="7"/><path d="M304 341q-25 24 8 62 33-38 8-62Z" fill="#ffbe4b" stroke="#f07653" stroke-width="7"/><path d="M307 344q-14 18 5 40 19-22 5-40Z" fill="#fff3a3"/>')},
 {id:'sub',title:'Bubble Sub',tagline:'Make a silly sub and cruise through the bubble sea!',verb:'🐠 DIVE AWAY!',outcome:'Your bubblegum submarine made a splash and sailed away!',slots:[
  {id:'top',name:'Top',x:48,y:19},{id:'middle',name:'Window',x:32,y:53},{id:'boost',name:'Tail',x:76,y:61}
 ],art:base('<ellipse cx="312" cy="350" rx="190" ry="16" fill="#5f9ec7" opacity=".17"/><path d="M310 181V118h65v63" fill="#9c7bfa" stroke="#4c51a8" stroke-width="8"/><rect x="294" y="111" width="92" height="24" rx="11" fill="#ffd064" stroke="#bb7691" stroke-width="6"/><path d="M135 219q-2-79 170-92 173-1 189 97 5 104-191 106-170 0-168-111Z" fill="#ffca60" stroke="#cd7b53" stroke-width="9"/><path d="M475 208 550 165v127l-75-53" fill="#ed73b8" stroke="#ae4c9a" stroke-width="8"/><circle cx="235" cy="224" r="46" fill="#6bdef2" stroke="#7757d5" stroke-width="9"/><circle cx="350" cy="224" r="46" fill="#6bdef2" stroke="#7757d5" stroke-width="9"/><circle cx="228" cy="216" r="20" fill="#fff" opacity=".58"/><circle cx="343" cy="216" r="20" fill="#fff" opacity=".58"/><path d="M272 284q26 15 49 0" stroke="#a64c77" stroke-width="5" fill="none" stroke-linecap="round"/>')},
 {id:'robot',title:'Silly Bot',tagline:'Give your robot a personality, then make it dance!',verb:'🤖 DANCE TIME!',outcome:'Your sticker-powered robot did the happiest dance!',slots:[
  {id:'top',name:'Head',x:51,y:24},{id:'middle',name:'Heart',x:51,y:62},{id:'boost',name:'Arm',x:74,y:46}
 ],art:base('<ellipse cx="313" cy="379" rx="130" ry="16" fill="#5965c2" opacity=".2"/><path d="M228 244 182 287M395 244l51 43" stroke="#7554d9" stroke-width="24" stroke-linecap="round"/><circle cx="180" cy="291" r="21" fill="#ffcc61" stroke="#b57db0" stroke-width="7"/><circle cx="447" cy="291" r="21" fill="#ffcc61" stroke="#b57db0" stroke-width="7"/><path d="M268 337 259 376M362 337l11 39" stroke="#5977d9" stroke-width="24" stroke-linecap="round"/><rect x="221" y="208" width="185" height="132" rx="36" fill="#70e1cf" stroke="#4764b1" stroke-width="9"/><rect x="220" y="93" width="185" height="128" rx="39" fill="url(#gumShine)" stroke="#4764b1" stroke-width="9"/><circle cx="276" cy="151" r="22" fill="#6c56d9"/><circle cx="352" cy="151" r="22" fill="#6c56d9"/><circle cx="281" cy="144" r="7" fill="#fff"/><circle cx="357" cy="144" r="7" fill="#fff"/><path d="M285 185q26 23 56 0" stroke="#b567a1" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M312 91V59" stroke="#4764b1" stroke-width="8"/><circle cx="312" cy="52" r="16" fill="#ffcb49" stroke="#bc7c34" stroke-width="5"/>')}
];
const missionBy=(id:string)=>MISSIONS.find(x=>x.id===id)||MISSIONS[0];
const stickerBy=(id:string)=>STICKERS.find(x=>x.id===id);
const cloned=(x:Record<string,string>)=>Object.assign(Object.create(null) as Record<string,string>,x);
export default class StickerBuilder implements GameInstance {
 private root=make('section','gum-play');
 private mission:Mission=MISSIONS[0];
 private placed:Record<string,string>=Object.create(null);
 private selected:string|null=null;
 private history:Record<string,string>[]=[];
 private phase:Phase='stick';
 private paused=false;
 private disposed=false;
 private storageBlocked=false;
 private saveFailed=false;
 private timer:ReturnType<typeof setTimeout>|null=null;
 private timerAt=0;
 private remaining=0;
 private dragging:{id:string;pointer:number;x:number;y:number;ghost:HTMLElement;moved:boolean}|null=null;
 private ignoreClick=false;
 private reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 constructor(private mount:HTMLElement,private context:GameContext){
  this.root.setAttribute('aria-label','Bubblegum sticker building game');
  this.root.dataset.qualityGame='gum-stickers';
  const raw=context.persistence?.load();
  if(raw!==undefined&&raw!==null){
    try{this.read(raw);}catch{this.storageBlocked=true;}
  }
  mount.replaceChildren(this.root);
  this.render();
 }
 private read(raw:unknown){
  const s=raw as Saved;
  if(!s||s.schema!=='gum-stickers-v1'||!MISSIONS.some(x=>x.id===s.mission)||!s.placed||typeof s.placed!=='object'||Array.isArray(s.placed)||Object.keys(s.placed).length>3)throw Error('Unsupported sticker save');
  const mission=missionBy(s.mission);
  for(const [slot,id] of Object.entries(s.placed))if(!mission.slots.some(x=>x.id===slot)||!stickerBy(id))throw Error('Invalid sticker');
  this.mission=mission;this.placed=cloned(s.placed);
 }
 private save(){
  if(this.storageBlocked)return;
  const saved:Saved={schema:'gum-stickers-v1',mission:this.mission.id,placed:{...this.placed}};
  this.saveFailed=!!this.context.persistence&&!this.context.persistence.save(saved);
 }
 private button(label:string,css:string,fn:()=>void){
  const b=make('button',css,label) as HTMLButtonElement;b.type='button';b.onclick=fn;return b;
 }
 private select(id:string){if(this.paused||this.phase!=='stick'||this.storageBlocked)return;this.selected=id;this.render();}
 private place(slotId:string,id=this.selected){
  if(this.paused||this.phase!=='stick'||this.storageBlocked||!id||!stickerBy(id)||!this.mission.slots.some(x=>x.id===slotId))return;
  this.history.push(cloned(this.placed));if(this.history.length>20)this.history.shift();
  this.placed[slotId]=id;this.selected=null;this.save();
  this.context.emit?.({type:'mechanic',name:'bubblegum-sticker',value:Object.keys(this.placed).length});
  this.render();
 }
 private reset(id:MissionId,explicit=false){
  if(this.storageBlocked&&!explicit)return;
  this.stopTimer();this.mission=missionBy(id);this.placed=Object.create(null);this.history=[];this.selected=null;this.phase='stick';this.storageBlocked=false;this.paused=false;this.save();this.render();
 }
 private undo(){
  if(this.paused||this.phase!=='stick'||!this.history.length)return;
  this.placed=this.history.pop()!;this.save();this.render();
 }
 private stopTimer(){if(this.timer!==null)clearTimeout(this.timer);this.timer=null;this.remaining=0;}
 private countdown(duration:number){
  this.remaining=duration;this.timerAt=performance.now();
  this.timer=setTimeout(()=>{this.timer=null;this.remaining=0;this.finish();},duration);
 }
 private launch(){
  if(this.phase!=='stick'||this.paused||this.storageBlocked||this.mission.slots.some(x=>!this.placed[x.id]))return;
  this.phase='launch';this.selected=null;this.render();
  this.context.emit?.({type:'mechanic',name:'bubblegum-launch',value:1});
  this.countdown(this.reduced?250:1850);
 }
 private finish(){
  if(this.disposed||this.paused||this.phase!=='launch')return;
  this.phase='done';
  // The native host already offers the mandatory round-end learning check.
  // Do not also emit a checkpoint here; that would race the host result overlay.
  this.context.finish({won:true,level:MISSIONS.indexOf(this.mission)+1,title:this.mission.title,description:this.mission.outcome+' You chose all three stickers.'});
 }
 private beginDrag(button:HTMLButtonElement,sticker:Sticker,event:PointerEvent){
  if(this.paused||this.phase!=='stick'||this.storageBlocked||event.button!==0)return;
  const ghost=make('div','gum-drag-ghost');ghost.innerHTML=art(sticker.shape);
  ghost.style.left=event.clientX+'px';ghost.style.top=event.clientY+'px';
  document.body.append(ghost);
  this.dragging={id:sticker.id,pointer:event.pointerId,x:event.clientX,y:event.clientY,ghost,moved:false};
  button.setPointerCapture(event.pointerId);
 }
 private moveDrag(event:PointerEvent){
  const d=this.dragging;if(!d||d.pointer!==event.pointerId)return;
  if(Math.hypot(event.clientX-d.x,event.clientY-d.y)>9)d.moved=true;
  d.ghost.style.left=event.clientX+'px';d.ghost.style.top=event.clientY+'px';
 }
 private endDrag(event:PointerEvent,cancelled=false){
  const d=this.dragging;if(!d||d.pointer!==event.pointerId)return;
  this.dragging=null;d.ghost.remove();
  if(!cancelled&&d.moved){
    const target=document.elementFromPoint(event.clientX,event.clientY)?.closest<HTMLElement>('[data-gum-slot]');
    if(target?.dataset.gumSlot)this.place(target.dataset.gumSlot,d.id);else this.select(d.id);
    this.ignoreClick=true;
    setTimeout(()=>{this.ignoreClick=false;},0);
  }
 }
 private render(){
  if(this.disposed)return;
  const ready=this.mission.slots.every(x=>!!this.placed[x.id]);
  this.root.replaceChildren();
  this.root.dataset.mission=this.mission.id;
  const head=make('div','gum-play-head');
  const title=make('div','gum-play-title');
  title.append(make('span','gum-badge','🫧 BUBBLEGUM WORKSHOP'),make('h2','','Stick it. Build it. GO!'));
  head.append(title);
  const missions=make('div','gum-missions');missions.setAttribute('role','group');missions.setAttribute('aria-label','Choose an invention');
  for(const m of MISSIONS){
    const label=m.id==='rocket'?'🚀 Rocket':m.id==='sub'?'🐠 Submarine':'🤖 Robot';
    const b=this.button(label,'gum-mission'+(m.id===this.mission.id?' current':''),()=>this.reset(m.id));
    b.setAttribute('aria-pressed',String(m.id===this.mission.id));b.disabled=this.paused||this.phase==='launch';missions.append(b);
  }
  head.append(missions);this.root.append(head);
  const step=make('p','gum-play-instructions',this.phase==='stick'?'1. Pick a sticker     2. Stick it on a bubble     3. Make it GO!':
    this.phase==='launch'?'Your invention is moving!':'You made something wonderful!');
  this.root.append(step);
  const layout=make('div','gum-play-layout');
  const scene=make('div','gum-scene');scene.dataset.mission=this.mission.id;
  if(this.phase!=='stick')scene.classList.add('launched');
  if(this.paused)scene.classList.add('paused');
  scene.setAttribute('aria-label',this.mission.title+' sticker stage');
  const sky=make('div','gum-sky-stars','✦   ✧      ✨       ✦');sky.setAttribute('aria-hidden','true');scene.append(sky);
  const motion=make('div','gum-motion');motion.innerHTML=this.mission.art;
  const slots=make('div','gum-slots');
  for(const s of this.mission.slots){
    const item=this.placed[s.id]?stickerBy(this.placed[s.id]):undefined;
    const b=this.button('','gum-slot'+(item?' filled':' empty')+(this.selected?' target':''),()=>this.place(s.id));
    b.dataset.gumSlot=s.id;b.style.left=s.x+'%';b.style.top=s.y+'%';
    b.setAttribute('aria-label',item?'Change '+s.name+' sticker. Currently '+item.name:'Put a sticker on '+s.name);
    b.disabled=this.phase!=='stick'||this.paused||this.storageBlocked;
    if(item)b.innerHTML=art(item.shape);
    else b.append(make('span','gum-slot-plus','+'));
    b.append(make('small','gum-slot-label',s.name));
    slots.append(b);
  }
  motion.append(slots);scene.append(motion);
  const prompt=make('div','gum-stage-caption',this.mission.tagline);scene.append(prompt);
  const confetti=make('div','gum-celebration','✦   ✧   ✨   ✦   ★');confetti.setAttribute('aria-hidden','true');scene.append(confetti);
  layout.append(scene);
  const side=make('div','gum-tray');
  side.append(make('h3','','🎨 Pick your stickers'));
  const chooser=make('div','gum-stickers');chooser.setAttribute('role','group');chooser.setAttribute('aria-label','Choose a sticker to stick on your invention');
  const extra=Math.min(6,Number(this.context.config.extraDecoys)||0);
  for(const sticker of STICKERS.slice(0,6+extra)){
    const b=this.button('','gum-sticker'+(this.selected===sticker.id?' picked':''),()=>{
      if(this.ignoreClick)return;this.select(sticker.id);
    });
    b.setAttribute('aria-label','Select '+sticker.name);b.setAttribute('aria-pressed',String(this.selected===sticker.id));
    b.disabled=this.phase!=='stick'||this.paused||this.storageBlocked;
    b.innerHTML=art(sticker.shape);
    b.append(make('span','',sticker.name));
    b.style.touchAction='none';
    b.onpointerdown=e=>this.beginDrag(b,sticker,e);
    b.onpointermove=e=>this.moveDrag(e);
    b.onpointerup=e=>this.endDrag(e);
    b.onpointercancel=e=>this.endDrag(e,true);
    b.onlostpointercapture=e=>this.endDrag(e,true);
    chooser.append(b);
  }
  side.append(chooser);
  const count=Object.keys(this.placed).length;
  const progress=make('div','gum-steps');
  progress.append(make('strong','',count+' of 3 stickers on!'));
  const dots=make('span','gum-step-dots');for(let i=0;i<3;i++)dots.append(make('i',i<count?'done':''));
  progress.append(dots);side.append(progress);
  const launch=this.button(ready?'✨ '+this.mission.verb:'Put on 3 stickers to GO','gum-launch',()=>this.launch());
  launch.disabled=!ready||this.phase!=='stick'||this.paused||this.storageBlocked;
  side.append(launch);
  const small=make('div','gum-secondary-actions');
  small.append(this.button('↶ Undo','gum-link',()=>this.undo()),this.button('Start fresh','gum-link',()=>this.reset(this.mission.id,true)));
  small.firstElementChild!.toggleAttribute('disabled',!this.history.length||this.phase!=='stick'||this.paused);
  side.append(small);
  if(this.storageBlocked)side.append(make('p','gum-warning','An older save was found. It has not been replaced. Choose Start fresh to begin new sticker play.'));
  if(this.saveFailed)side.append(make('p','gum-warning','Could not save your stickers. Keep this page open and ask a grown-up for help.'));
  const notice=make('p','gum-live',this.phase==='launch'?'Whoosh! Your stickers are flying!':this.selected?'Sticker selected. Now tap a bubble on your machine.':'');
  notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');side.append(notice);
  layout.append(side);this.root.append(layout);
 }
 next(){this.reset(MISSIONS[(MISSIONS.indexOf(this.mission)+1)%MISSIONS.length].id,true);}
 restart(){this.reset(this.mission.id,true);}
 retry(){this.restart();}
 isPlaying(){return !this.paused&&!this.disposed&&this.phase!=='done';}
 pause(){
  if(this.paused||this.disposed||this.phase==='done')return false;
  this.paused=true;
  if(this.timer!==null){clearTimeout(this.timer);this.timer=null;this.remaining=Math.max(0,this.remaining-(performance.now()-this.timerAt));}
  this.root.classList.add('paused');this.root.querySelector('.gum-scene')?.classList.add('paused');
  return true;
 }
 resume(){
  if(this.disposed||!this.paused)return;
  this.paused=false;this.root.classList.remove('paused');this.root.querySelector('.gum-scene')?.classList.remove('paused');
  if(this.phase==='launch'&&this.remaining>0)this.countdown(this.remaining);
 }
 snapshot(){return {mode:'stickers',mission:this.mission.id,stage:this.phase,stickers:cloned(this.placed),stickersPlaced:Object.keys(this.placed).length,saveFailed:this.saveFailed};}
 unmount(){this.disposed=true;this.stopTimer();this.dragging?.ghost.remove();this.dragging=null;this.mount.replaceChildren();}
}
