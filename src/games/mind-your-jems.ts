import './mind-your-jems.css';

/**
 * A local-only, prebuilt mini-game. It never calls the builder, stores child data,
 * fabricates generation progress, or changes a saved project.
 */
export type WorkshopStatus = 'queued' | 'building' | 'testing' | 'ready' | 'failed' | 'cancelled';
export type MinePhase = 'mining' | 'warning' | 'shaking';
export type MineState = Readonly<{
  banked: number; loose: number; lost: number; mined: number;
  shakes: number; holding: boolean; phase: MinePhase;
}>;
export type MineAction =
  | {type:'mine'; value:1|3} | {type:'bank'} | {type:'grab'}
  | {type:'warn'} | {type:'shake'} | {type:'settle'};
export const BAG_CAPACITY = 8;
export const newMineState = ():MineState =>
  ({banked:0,loose:0,lost:0,mined:0,shakes:0,holding:false,phase:'mining'});

/** Side-effect-free rules for tests and eventual game-mode variations. */
export function moveMine(state:MineState,action:MineAction):MineState {
  switch(action.type){
    case 'mine': {
      if(state.phase==='shaking'||state.loose>=BAG_CAPACITY)return state;
      const value=Math.min(action.value,BAG_CAPACITY-state.loose);
      return {...state,loose:state.loose+value,mined:state.mined+value};
    }
    case 'bank':
      return state.phase==='shaking'||!state.loose?state:
        {...state,banked:state.banked+state.loose,loose:0};
    case 'grab':
      return state.phase==='warning'?{...state,holding:true}:state;
    case 'warn':
      return state.phase==='mining'?{...state,phase:'warning',holding:false}:state;
    case 'shake':
      // Only the minecart protects mined gems. Grabbing protects the miner,
      // NOT the loose cargo; losing gems is playful, never a life/health loss.
      return state.phase==='warning'?{...state,phase:'shaking',lost:state.lost+state.loose,loose:0}:state;
    case 'settle':
      return state.phase==='shaking'?{...state,phase:'mining',holding:false,shakes:state.shakes+1}:state;
  }
}

export type ArcadeLaunch = {
  projectName:string;
  status:WorkshopStatus;
  isReady:boolean;
  onPlayReady:()=>void;
};
export type WaitArcade = {
  open:(launch:ArcadeLaunch)=>void;
  update:(status:WorkshopStatus,isReady:boolean)=>void;
  close:()=>void;
  isOpen:()=>boolean;
};

const gemShapes = [
  {x:31,y:28,color:'pink',value:1},{x:42,y:19,color:'blue',value:1},
  {x:53,y:22,color:'purple',value:1},{x:65,y:25,color:'gold',value:3},
  {x:73,y:35,color:'mint',value:1},{x:39,y:36,color:'gold',value:3}
] as const;
const gemIcon = '<svg viewBox="0 0 90 100" aria-hidden="true"><path d="M17 25 36 6h30l18 19-8 45-31 25L12 69Z" fill="currentColor"/><path d="m17 25 28 10 21-29M45 35l31 35M45 35 12 69M45 35l-1 60M84 25 45 35" fill="none" stroke="#fff" stroke-width="4" stroke-opacity=".55"/><path d="m17 25 19-19 9 29-33 34Z" fill="#fff" opacity=".18"/><path d="m45 35 21-29 18 19-8 45Z" fill="#fff" opacity=".26"/></svg>';
const artwork = [
'<svg class="myj-world" viewBox="0 0 1000 570" aria-hidden="true">',
'<defs>',
'<linearGradient id="myj-sky" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#75cbff"/><stop offset="1" stop-color="#e3d3ff"/></linearGradient>',
'<linearGradient id="myj-stone" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#d5a6ee"/><stop offset=".45" stop-color="#a278c7"/><stop offset="1" stop-color="#6557af"/></linearGradient>',
'<linearGradient id="myj-tuft" x1="0" y1="0" x2=".9" y2="1"><stop stop-color="#ffa3de"/><stop offset="1" stop-color="#fa448b"/></linearGradient>',
'<linearGradient id="myj-mint" x1="0" y1="0" x2=".9" y2="1"><stop stop-color="#9bfce1"/><stop offset="1" stop-color="#05caa2"/></linearGradient>',
'<linearGradient id="myj-crystal" x1="0" y1="0" x2=".9" y2="1"><stop stop-color="#b7f8ff"/><stop offset=".55" stop-color="#8f45ff"/><stop offset="1" stop-color="#ff4faa"/></linearGradient>',
'<filter id="myj-depth" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="12" stdDeviation="12" flood-color="#3b217d" flood-opacity=".25"/></filter>',
'</defs>',
'<path fill="url(#myj-sky)" d="M0 0h1000v570H0z"/>',
'<g fill="#fff" opacity=".75"><ellipse cx="150" cy="145" rx="135" ry="35"/><ellipse cx="170" cy="120" rx="65" ry="46"/><ellipse cx="850" cy="120" rx="120" ry="32"/><ellipse cx="815" cy="99" rx="52" ry="35"/></g>',
'<path fill="#b0abf9" opacity=".5" d="m0 345 132-100 130 90 145-85 130 120 143-105 130 60 120-115 100 130v230H0Z"/>',
'<path fill="#75c9ba" opacity=".55" d="M0 405c110-70 210 55 330-20s245-12 355 14 215-35 315-10v181H0Z"/>',
'<path fill="#5040a0" opacity=".26" d="M0 508c165-45 270 26 440-18 215-57 383-30 560 12v68H0Z"/>',
'<g class="myj-head" filter="url(#myj-depth)">',
'<ellipse cx="510" cy="534" rx="358" ry="306" fill="#574f96" opacity=".35"/>',
'<path d="M182 575C171 378 295 220 472 221c215-30 375 107 372 354Z" fill="url(#myj-stone)" stroke="#745da3" stroke-width="9"/>',
'<path d="M264 425c-16-126 93-215 194-195M682 281c77 25 115 91 129 161" fill="none" stroke="#e8c7f0" stroke-width="13" opacity=".38" stroke-linecap="round"/>',
'<g fill="#9f75c2" opacity=".45"><circle cx="290" cy="380" r="13"/><circle cx="746" cy="402" r="18"/><circle cx="373" cy="257" r="11"/><circle cx="631" cy="263" r="9"/><circle cx="686" cy="474" r="8"/></g>',
'<path d="M322 310c-30-64-78-61-107-96 68 19 103 3 137 20-31-38-38-83-25-106 24 59 80 63 83 144Z" fill="url(#myj-tuft)" stroke="#d84798" stroke-width="8" stroke-linejoin="round"/>',
'<path d="M687 278c14-70 70-78 98-139-4 71-12 101-34 120 42-19 71-12 98-36-16 68-66 92-127 110Z" fill="url(#myj-mint)" stroke="#08ae9c" stroke-width="8" stroke-linejoin="round"/>',
'<path d="M326 412q63-54 124-12M580 402q65-44 120 18" fill="none" stroke="#4c327b" stroke-width="18" stroke-linecap="round"/>',
'<g class="myj-eyes"><ellipse cx="401" cy="482" rx="88" ry="90" fill="#fff9ff"/><ellipse cx="626" cy="482" rx="88" ry="90" fill="#fff9ff"/></g>',
'<g class="myj-pupils"><ellipse cx="425" cy="475" rx="32" ry="47" fill="#3d3979"/><ellipse cx="601" cy="475" rx="32" ry="47" fill="#3d3979"/><circle cx="437" cy="457" r="12" fill="#fff"/><circle cx="612" cy="457" r="12" fill="#fff"/></g>',
'<ellipse cx="314" cy="546" rx="52" ry="23" fill="#ff8eb7" opacity=".75"/><ellipse cx="719" cy="548" rx="52" ry="23" fill="#ff8eb7" opacity=".75"/>',
'<path d="M494 536q19-17 41 0" fill="none" stroke="#9b6397" stroke-width="12" stroke-linecap="round"/>',
'<path d="M452 561q65 32 125 0" fill="none" stroke="#583374" stroke-width="9" stroke-linecap="round"/>',
'</g>',
'<g class="myj-ladder" stroke="#8f4b2e" stroke-width="13" stroke-linecap="round"><path d="m278 539 94-252m-43 262 92-251" fill="none"/><path d="m286 513 51 9m-40-49 53 7m-38-51 54 8m-36-51 55 7m-38-50 55 5m-38-49 55 8" stroke="#ffc46a" stroke-width="12"/></g>',
'<g class="myj-miner" transform="translate(359 276)">',
'<path d="M-7 55 9 65l-13 22M18 56l22 11 10 18" fill="none" stroke="#573660" stroke-width="14" stroke-linecap="round"/>',
'<path d="M-4 16Q8 0 34 16l1 40-42 8Z" fill="#2e6bff" stroke="#143eaa" stroke-width="5"/>',
'<rect x="-21" y="24" width="17" height="30" rx="7" fill="#ff4c83"/><circle cx="-14" cy="38" r="4" fill="#ffe86d"/>',
'<path d="m29 28 31-20" stroke="#f4ae76" stroke-width="12" stroke-linecap="round"/>',
'<path d="m57 9 19-16" stroke="#7c4b37" stroke-width="8" stroke-linecap="round"/>',
'<path d="m59-5 30-12 1 16-34 7Z" fill="#54ccff" stroke="#1750b4" stroke-width="4"/>',
'<circle cx="15" cy="-5" r="26" fill="#ffd2a1" stroke="#c6815d" stroke-width="4"/>',
'<path d="M-13-16q-5-37 29-37 39 0 29 36Z" fill="#ffc43c" stroke="#d88013" stroke-width="5"/>',
'<rect x="-20" y="-21" width="71" height="12" rx="6" fill="#ffdb57" stroke="#d88013" stroke-width="3"/>',
'<circle cx="31" cy="-43" r="11" fill="#fff8cb" stroke="#dc9e2e" stroke-width="5"/>',
'<circle cx="9" cy="-6" r="3" fill="#3e2c65"/><circle cx="26" cy="-6" r="3" fill="#3e2c65"/>',
'<path d="M12 6q8 10 16 0" fill="none" stroke="#b05f5e" stroke-width="4" stroke-linecap="round"/>',
'</g>',
'<g transform="translate(830 396)"><ellipse rx="137" ry="21" fill="#2e346d" opacity=".2"/><rect x="-110" y="-53" width="213" height="77" rx="19" fill="#7c32ed" stroke="#3e298a" stroke-width="9"/><path d="M-110-31h213l-27 58H-85Z" fill="#bd62ff"/><path d="M-123-64H114v25h-237Z" fill="#ffc43c" stroke="#ad6b25" stroke-width="8"/><circle cx="-60" cy="34" r="23" fill="#393777" stroke="#d8b1ff" stroke-width="9"/><circle cx="62" cy="34" r="23" fill="#393777" stroke="#d8b1ff" stroke-width="9"/><path d="m-18-27 15-17 22 4 11 18-24 24Z" fill="url(#myj-crystal)" stroke="#f4eaff" stroke-width="5"/></g>',
'<g fill="#ffce39"><path d="m815 180 9 24 24 9-24 9-9 24-9-24-24-9 24-9Z"/><path d="m176 251 6 15 15 6-15 6-6 15-6-15-15-6 15-6Z"/></g>',
'</svg>'
].join('');

const html = [
'<div class="myj-shell">',
'<header class="myj-header"><img class="myj-logo" src="./jems-logo.svg" alt="jems · The Game Factory">',
'<span class="myj-wait-pill">🎮 Play while you wait</span>',
'<span class="myj-build-status" role="status" aria-live="polite"></span>',
'<button class="myj-close" type="button" aria-label="Close mini-game">✕</button></header>',
'<main class="myj-main">',
'<div class="myj-title"><span class="myj-kicker">THE LITTLE GAME WITH BIG IDEAS</span><h2 id="myjTitle">Mind Your <em>Jems!</em></h2><p>Mine ideas. Bank Jems. Hold on!</p></div>',
'<div class="myj-score" aria-label="Gem scores"><span>💎 Banked <b data-myj="banked">0</b></span><span>✨ Loose <b data-myj="loose">0</b>/8</span></div>',
'<div class="myj-stage">',artwork,
'<div class="myj-deposited" aria-hidden="true">💎💜💎</div>',
'<div class="myj-gems">',
...gemShapes.map((g,i)=>'<button type="button" class="myj-gem myj-'+g.color+'" data-crystal="'+i+'" style="--gx:'+g.x+'%;--gy:'+g.y+'%" aria-label="Mine '+(g.value===3?'rare three-Jem':'one-Jem')+' crystal">'+gemIcon+'</button>'),
'</div>',
'<div class="myj-bag" aria-label="Your carrying bag">🎒 <strong data-myj="bag">0 / 8</strong></div>',
'<div class="myj-alert" data-myj="alert" role="status" aria-live="polite"></div>',
'<button type="button" class="myj-cart-hit" data-myj="bank-cart" aria-label="Bank the Jems you are carrying"><span>⬇ Deposit here</span></button>',
'</div>',
'<div class="myj-actions"><button class="myj-action myj-action-bank" data-myj="bank" type="button">🛒 Bank my Jems <span>→</span></button>',
'<button class="myj-action myj-action-grab" data-myj="grab" type="button" disabled>✊ Grab the hair!</button></div>',
'<p class="myj-tips" data-myj="tips">Tap colorful crystals to mine. Bank your Jems before the head shakes!</p>',
'<div class="myj-ready" data-myj="ready" hidden><span>🌟 Your real game is ready!</span><button type="button" data-myj="play-ready">▶ Play my game</button></div>',
'</main><footer class="myj-footer"><span>💡 Your Jems score is just for fun. Your build keeps running separately.</span><button class="myj-exit" type="button">Back to my game</button></footer>',
'</div>'
].join('');

export function createMindYourJems():WaitArcade {
  const dialog=document.createElement('dialog');
  dialog.className='myj-arcade';dialog.setAttribute('aria-labelledby','myjTitle');
  dialog.innerHTML=html;document.body.append(dialog);
  const el=<T extends Element=HTMLElement>(selector:string)=>dialog.querySelector<T>(selector)!;
  const btn=(selector:string)=>el<HTMLButtonElement>(selector);
  const bank=btn('[data-myj="bank"]'),grab=btn('[data-myj="grab"]');
  const readyButton=btn('[data-myj="play-ready"]');
  const crystals=Array.from(dialog.querySelectorAll<HTMLButtonElement>('[data-crystal]'));
  let state:MineState=newMineState();
  let current:ArcadeLaunch|null=null;
  const timers=new Set<number>();
  const later=(fn:()=>void,delay:number)=>{
    const id=window.setTimeout(()=>{timers.delete(id);if(dialog.open)fn();},delay);
    timers.add(id);return id;
  };
  const cancelTimers=()=>{for(const id of timers)clearTimeout(id);timers.clear();};
  let noticeTimeout=0;
  function notice(msg:string){
    const alert=el('[data-myj="alert"]');alert.textContent=msg;
    clearTimeout(noticeTimeout);
    noticeTimeout=window.setTimeout(()=>{if(alert.textContent===msg)alert.textContent='';},3200);
  }
  function draw(){
    el('[data-myj="banked"]').textContent=String(state.banked);
    el('[data-myj="loose"]').textContent=String(state.loose);
    el('[data-myj="bag"]').textContent=state.loose+' / '+BAG_CAPACITY;
    bank.disabled=state.loose===0||state.phase==='shaking';
    grab.disabled=state.phase!=='warning'||state.holding;
    grab.textContent=state.holding?'✅ Holding tight!':'✊ Grab the hair!';
    dialog.classList.toggle('myj-is-warning',state.phase==='warning');
    dialog.classList.toggle('myj-is-shaking',state.phase==='shaking');
    el('[data-myj="tips"]').textContent=state.phase==='warning'?
      'Big idea incoming! Bank loose Jems now, then grab the hair!':
      state.phase==='shaking'?'Wheeeee! Only banked Jems stay safe!':
      state.loose===BAG_CAPACITY?'Bag full! Bank your Jems before mining more.':
      'Tap colorful crystals to mine. Bank your Jems before the head shakes!';
    for(const crystal of crystals)crystal.disabled=state.phase==='shaking'||state.loose>=BAG_CAPACITY;
  }
  function move(action:MineAction){
    const before=state;state=moveMine(state,action);draw();
    return before!==state;
  }
  function nextShake(){
    if(!dialog.open||document.hidden)return;
    later(()=>{
      if(!move({type:'warn'}))return;
      notice('💡 Ooh, a BIG idea! Grab on!');
      later(()=>{
        const dropped=state.loose,held=state.holding;
        if(!move({type:'shake'}))return;
        for(let i=0;i<Math.min(dropped,8);i++){
          const p=document.createElement('span');p.className='myj-flying-gem';p.textContent=['💎','💜','✨'][i%3];
          p.style.setProperty('--fly-x',(i-4)*35+'px');
          p.style.setProperty('--fly-y',(-100-(i%3)*55)+'px');
          el('.myj-stage').append(p);later(()=>p.remove(),1300);
        }
        notice(dropped?(held?'You held on! '+dropped+' loose Jems flew away.':'Whoooops! '+dropped+' loose Jems flew away!'):(held?'Nice grip! All banked Jems are safe!':'Big shake! Your banked Jems are safe!'));
        later(()=>{move({type:'settle'});nextShake();},1250);
      },3600);
    },11000+Math.random()*7000);
  }
  function update(status:WorkshopStatus,isReady:boolean){
    if(!current)return;
    current={...current,status,isReady};
    const messages:Record<WorkshopStatus,string>={
      queued:'Your game is queued',building:'Your game is building',testing:'Jems is testing your game',
      ready:isReady?'Your game is ready!':'Checking your game preview',
      failed:'Your build needs help',cancelled:'Build was cancelled'
    };
    el('.myj-build-status').textContent=messages[status];
    el<HTMLElement>('[data-myj="ready"]').hidden=!isReady;
    readyButton.hidden=!isReady;
    if(isReady)notice('🎉 Your game is ready! You can jump over whenever you want.');
  }
  function stop(){
    cancelTimers();clearTimeout(noticeTimeout);dialog.querySelectorAll('.myj-flying-gem').forEach(n=>n.remove());
    state=newMineState();current=null;
  }
  function close(){if(dialog.open)dialog.close();else stop();}
  dialog.addEventListener('close',stop);
  dialog.querySelectorAll<HTMLButtonElement>('.myj-close,.myj-exit').forEach(b=>b.addEventListener('click',close));
  bank.addEventListener('click',()=>{
    const count=state.loose;const before=state.banked;
    if(move({type:'bank'}))notice(state.banked>=25&&Math.floor(before/25)<Math.floor(state.banked/25)?
      '🌟 Idea power! '+state.banked+' Jems banked! Keep mining!':'💎 '+count+' Jems are safe in the minecart!');
  });
  btn('[data-myj="bank-cart"]').addEventListener('click',()=>bank.click());
  grab.addEventListener('click',()=>{
    if(move({type:'grab'}))notice('✊ Hanging on tight! Banked Jems stay safe.');
  });
  crystals.forEach((crystal,i)=>crystal.addEventListener('click',()=>{
    const value=gemShapes[i].value;
    if(!move({type:'mine',value}))return;
    crystal.classList.remove('myj-picked');void crystal.offsetWidth;crystal.classList.add('myj-picked');
    later(()=>crystal.classList.remove('myj-picked'),380);
    if(value===3)notice('✨ Rare idea Jem! +3');
    else if(state.loose===BAG_CAPACITY)notice('🎒 Bag full! Bank those Jems!');
  }));
  readyButton.addEventListener('click',()=>{const callback=current?.isReady?current.onPlayReady:null;if(callback){close();callback();}});
  document.addEventListener('visibilitychange',()=>{
    if(!dialog.open)return;
    if(document.hidden){
      cancelTimers();
      // A background tab cannot surprise a child with a loss on return.
      if(state.phase==='warning'){state={...state,phase:'mining',holding:false};draw();}
      if(state.phase==='shaking')move({type:'settle'});
    }else nextShake();
  });
  return {
    open(launch){
      close();current=launch;state=newMineState();draw();
      el('[data-myj="alert"]').textContent='';
      dialog.classList.remove('myj-is-warning','myj-is-shaking');
      dialog.showModal();update(launch.status,launch.isReady);
      notice('💎 Tap a glowing crystal to mine your first Jem!');
      nextShake();
      btn('.myj-close').focus();
    },
    update,close,isOpen:()=>dialog.open
  };
}
