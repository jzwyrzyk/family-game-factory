import './mind-your-jems.css';
import {BAG_CAPACITY,newMineState,moveMine,type MineAction,type MineState} from './mind-your-jems-rules';

/** Prebuilt, local play. Artwork ships with the app; scores never leave this session. */
export type WorkshopStatus = 'queued'|'building'|'testing'|'ready'|'failed'|'cancelled'|'reconnecting';
export type ArcadeLaunch = {
  projectName:string;
  status:WorkshopStatus;
  isReady:boolean;
  onPlayReady:()=>void;
  onBackToStudio?:()=>void;
  onClose?:()=>void;
};
export type WaitArcade = {
  open:(launch:ArcadeLaunch)=>void;
  update:(status:WorkshopStatus,isReady:boolean)=>void;
  close:()=>void;
  isOpen:()=>boolean;
};

const ART='./art/mind-your-jems/';
const gemShapes=[
  {x:39,y:18,frame:1,value:1,label:'Pink'},
  {x:52,y:14,frame:0,value:1,label:'Blue'},
  {x:66,y:20,frame:2,value:1,label:'Purple'},
  {x:76,y:28,frame:3,value:3,label:'Golden'},
  {x:57,y:26,frame:4,value:1,label:'Mint'},
  {x:44,y:29,frame:5,value:3,label:'Sunset'}
] as const;
const icon=(name:'close'|'arrow'|'spark'|'grip'|'cart'|'sound'|'muted')=>{
  const paths={
    close:'<path d="m7 7 10 10M17 7 7 17"/>',
    arrow:'<path d="M4 12h15m-6-6 6 6-6 6"/>',
    spark:'<path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z"/>',
    grip:'<path d="M8 13V7a2 2 0 0 1 4 0v5-7a2 2 0 0 1 4 0v7-4a2 2 0 0 1 4 0v7c0 5-3 7-7 7-3 0-5-2-7-5l-3-4a2 2 0 0 1 3-3l2 3Z"/>',
    cart:'<path d="M3 5h2l2 11h12l2-8H6M9 20h.01M18 20h.01"/>',
    sound:'<path d="M4 9h4l5-4v14l-5-4H4ZM17 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14"/>',
    muted:'<path d="M4 9h4l5-4v14l-5-4H4Zm13 0 5 6m0-6-5 6"/>'
  };
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths[name]+'</svg>';
};
function sprite(file:string,frame:number,cols=4,rows=2,extra=''){
  return '<span class="myj-sprite '+extra+'" style="--cols:'+cols+';--rows:'+rows+';--sx:'+(frame%cols)+';--sy:'+Math.floor(frame/cols)+'" aria-hidden="true"><img src="'+ART+file+'" alt="" loading="lazy" draggable="false"></span>';
}
const html=[
 '<div class="myj-shell">',
 '<header class="myj-header"><img class="myj-logo" src="./jems-logo.svg" alt="jems · The Game Factory" draggable="false">',
 '<span class="myj-wait-pill">'+icon('spark')+'<span>Play while you wait</span></span>',
 '<span class="myj-build"><span class="myj-build-dot" aria-hidden="true"></span><span class="myj-build-status" role="status" aria-live="polite"></span></span>',
 '<button class="myj-icon-button myj-sound" type="button" aria-label="Turn on game sounds" aria-pressed="false">'+icon('muted')+'</button>',
 '<button class="myj-icon-button myj-close" type="button" aria-label="Close mini-game">'+icon('close')+'</button></header>',
 '<div class="myj-main">',
 '<div class="myj-stage" role="group" aria-label="Mine crystals on the friendly idea mountain">',
 '<img class="myj-sky" src="'+ART+'scene-sky.webp" alt="" loading="lazy" draggable="false">',
 '<div class="myj-sunshine" aria-hidden="true"></div>',
 '<div class="myj-title"><h2 id="myjTitle"><span>Mind Your</span><em>Jems!</em></h2><span class="myj-title-spark" aria-hidden="true">✦</span></div>',
 '<div class="myj-score" aria-label="Your Jems"><div class="myj-score-banked">'+sprite('props-atlas.webp',2)+'<span>Banked<strong data-myj="banked">0</strong></span></div><div class="myj-score-loose">'+sprite('props-atlas.webp',1)+'<span>In your bag<strong><b data-myj="loose">0</b><small> / 8</small></strong></span></div></div>',
 '<div class="myj-head-anchor"><div class="myj-head-motion">',
 '<div class="myj-rock" data-expression="idle">'+sprite('rock-expressions.webp',0,2,2)+'</div>',
 '<div class="myj-ladder">'+sprite('props-atlas.webp',7)+'</div>',
 '<div class="myj-miner-anchor"><div class="myj-miner" data-pose="idle">'+sprite('miner-poses.webp',0,2,2)+'</div></div>',
 '<div class="myj-gems">',
 ...gemShapes.map((g,i)=>'<button class="myj-gem" type="button" data-crystal="'+i+'" style="--gx:'+g.x+'%;--gy:'+g.y+'%;--gem-tilt:'+(i%2?-8:7)+'deg" aria-label="Mine '+(g.value===3?'rare three-Jem':'one-Jem')+' crystal: '+g.label+'">'+sprite('props-atlas.webp',g.frame)+'<span class="myj-gem-glint" aria-hidden="true">✦</span>'+(g.value===3?'<span class="myj-gem-value" aria-hidden="true">+3</span>':'')+'</button>'),
 '</div></div></div>',
 '<div class="myj-speech" data-myj="speech" aria-hidden="true"><span>Ooh, a<br><strong>BIG idea!</strong></span></div>',
 '<button class="myj-cart-hit" data-myj="bank-cart" type="button" aria-label="Bank the Jems you are carrying">'+sprite('cart-empty.webp',0,1,1)+'<img class="myj-cart-brand" src="./jems-mark.svg" alt="" aria-hidden="true" draggable="false"><span class="myj-cart-pile" aria-hidden="true"></span><span class="myj-cart-label">Bank Jems '+icon('arrow')+'</span></button>',
 '<div class="myj-notice" data-myj="alert" role="status" aria-live="polite" aria-atomic="true"></div>',
 '<div class="myj-effects" aria-hidden="true"></div>',
 '<div class="myj-loading" role="status"><span class="myj-loader-gem">'+sprite('props-atlas.webp',0)+'</span><strong data-myj="loading-copy">Opening the crystal garden…</strong><button type="button" data-myj="retry-art" hidden>Try again</button></div>',
 '</div>',
 '<div class="myj-controls">',
 '<div class="myj-mission"><span class="myj-mission-icon" aria-hidden="true">✦</span><div><strong data-myj="mission">Let’s bank 25 Jems!</strong><div class="myj-goal-track" role="progressbar" aria-label="Jems banked toward the next star" aria-valuemin="0" aria-valuemax="25" aria-valuenow="0"><span></span></div></div></div>',
 '<div class="myj-actions"><button class="myj-action myj-action-bank" data-myj="bank" type="button">'+icon('cart')+'<span>Bank my Jems</span>'+icon('arrow')+'</button><button class="myj-action myj-action-grab" data-myj="grab" type="button" hidden>'+icon('grip')+'<span>Grab on!</span></button></div>',
 '<button class="myj-help-toggle" type="button" aria-label="How to play Mind Your Jems" aria-expanded="false" aria-controls="myjHelp">?</button>',
 '<p class="myj-tips" id="myjInstructions" data-myj="tips">Tap crystals to mine. Bank your Jems before a big idea shakes them loose!</p>',
 '<div class="myj-help" id="myjHelp" hidden><strong>A little mining adventure</strong><p>Tap a crystal to collect Jems. Golden and sunset crystals give you 3. Your bag holds 8.</p><p>Bank your Jems in the cart to keep them safe. When the mountain has a BIG idea, grab the hair! Loose Jems still fly away.</p><p>Use Tab and Enter on a keyboard. Your other game keeps building while you play.</p><button type="button" data-myj="help-done">Let’s play</button></div>',
 '</div>',
 '<div class="myj-ready" data-myj="ready" hidden><span class="myj-ready-star" aria-hidden="true">★</span><span><strong>Your game is ready!</strong><small>Finish your turn, or jump in.</small></span><button type="button" data-myj="play-ready">Play my game '+icon('arrow')+'</button></div>',
 '<div class="myj-build-problem" hidden><span></span><button class="myj-exit" type="button">Back to Studio '+icon('arrow')+'</button></div>',
 '</div></div>'
].join('');

export function createMindYourJems():WaitArcade {
  const dialog=document.createElement('dialog');
  dialog.className='myj-arcade';
  dialog.setAttribute('aria-labelledby','myjTitle');
  dialog.setAttribute('aria-describedby','myjInstructions');
  dialog.innerHTML=html;
  document.body.append(dialog);
  const el=<T extends Element=HTMLElement>(selector:string)=>dialog.querySelector<T>(selector)!;
  const btn=(selector:string)=>el<HTMLButtonElement>(selector);
  const bank=btn('[data-myj="bank"]'),grab=btn('[data-myj="grab"]'),cart=btn('[data-myj="bank-cart"]');
  const crystals=Array.from(dialog.querySelectorAll<HTMLButtonElement>('[data-crystal]'));
  const stage=el('.myj-stage'),miner=el('.myj-miner'),rock=el('.myj-rock');
  const timers=new Set<number>();
  let state:MineState=newMineState(),current:ArcadeLaunch|null=null;
  let session=0,noticeTimer=0,poseTimer=0,shakeTimer=0;
  let pose:'idle'|'mining'|'holding'|'slipping'|'celebrate'='idle';
  let assets:'idle'|'loading'|'ready'|'failed'='idle';
  let artworkPromise:Promise<void>|null=null,bodyOverflow='';
  let soundOn=false,audioContext:AudioContext|null=null;
  const activeTones=new Set<OscillatorNode>();
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  const later=(fn:()=>void,delay:number)=>{
    const at=session;
    const id=window.setTimeout(()=>{timers.delete(id);if(at===session&&dialog.open&&!document.hidden)fn();},delay);
    timers.add(id);return id;
  };
  function cancelTimer(id:number){clearTimeout(id);timers.delete(id);}
  function clearEffects(){el('.myj-effects').replaceChildren();crystals.forEach(c=>c.classList.remove('myj-picked'));cart.classList.remove('myj-banked');}
  function cancelTimers(){timers.forEach(id=>clearTimeout(id));timers.clear();noticeTimer=poseTimer=shakeTimer=0;clearEffects();}
  function stopSound(){
    activeTones.forEach(tone=>{try{tone.stop();}catch{/* Already ended. */}});activeTones.clear();
    const context=audioContext;audioContext=null;if(context)void context.close().catch(()=>{});
  }
  function sound(kind:'mine'|'bank'|'warn'|'ready'){
    if(!soundOn||document.hidden)return;
    try{
      audioContext??=new AudioContext();void audioContext.resume().catch(()=>{});
      const notes={mine:[660,880],bank:[523,659,784],warn:[392,440],ready:[523,659,784,1047]}[kind];
      notes.forEach((frequency,i)=>{
        const oscillator=audioContext!.createOscillator(),gain=audioContext!.createGain();
        const at=audioContext!.currentTime+i*.075;
        oscillator.type='sine';oscillator.frequency.value=frequency;gain.gain.setValueAtTime(0,at);
        gain.gain.linearRampToValueAtTime(.045,at+.01);gain.gain.exponentialRampToValueAtTime(.001,at+.16);
        activeTones.add(oscillator);oscillator.onended=()=>{activeTones.delete(oscillator);oscillator.disconnect();gain.disconnect();};
        oscillator.connect(gain);gain.connect(audioContext!.destination);oscillator.start(at);oscillator.stop(at+.18);
      });
    }catch{/* Optional sound never prevents playing. */}
  }
  function tipsForState():string{
    return state.phase==='warning'?'Big idea coming! Bank your bag, then grab on!':
      state.phase==='shaking'?(state.holding?'Nice grip! Your banked Jems are safe.':'Wheee! Banked Jems stay safe.'):
      state.loose===BAG_CAPACITY?'Bag full! Tap the cart to bank your Jems.':
      'Tap crystals to mine. Bank your Jems before a big idea shakes them loose!';
  }
  function notice(message:string,duration=2800){
    const alert=el('[data-myj="alert"]'),tips=el('[data-myj="tips"]');
    // Short portrait phones move ready-state messages into the footer.
    const compactReady=dialog.dataset.ready==='true'&&
      window.matchMedia('(max-width:600px) and (max-height:720px) and (orientation:portrait)').matches;
    const footerFeedback=compactReady&&!!message;
    alert.textContent=footerFeedback?'':message;
    alert.classList.toggle('myj-notice-visible',!!message&&!footerFeedback);
    tips.textContent=footerFeedback?message:tipsForState();
    tips.classList.toggle('myj-tips-feedback',footerFeedback);
    cancelTimer(noticeTimer);
    noticeTimer=later(()=>{
      alert.textContent='';alert.classList.remove('myj-notice-visible');
      tips.textContent=tipsForState();tips.classList.remove('myj-tips-feedback');
    },duration);
  }
  function setPose(next:typeof pose,duration=0){
    cancelTimer(poseTimer);pose=next;draw();
    if(duration)poseTimer=later(()=>{pose='idle';draw();},duration);
  }
  function draw(){
    dialog.dataset.phase=state.phase;dialog.dataset.holding=String(state.holding);dialog.dataset.assets=assets;
    dialog.classList.toggle('myj-is-warning',state.phase==='warning');dialog.classList.toggle('myj-is-shaking',state.phase==='shaking');
    stage.setAttribute('aria-busy',String(assets==='loading'));
    el('[data-myj="banked"]').textContent=String(state.banked);el('[data-myj="loose"]').textContent=String(state.loose);
    const busy=assets!=='ready'||state.phase==='shaking'||!help.hidden;
    bank.disabled=busy||state.loose===0;cart.disabled=bank.disabled;
    grab.hidden=state.phase==='mining';grab.disabled=assets!=='ready'||state.phase!=='warning'||state.holding;
    grab.querySelector('span')!.textContent=state.holding?'Holding tight!':'Grab on!';
    for(const crystal of crystals)crystal.disabled=busy||state.loose>=BAG_CAPACITY;
    const actualPose=state.phase==='shaking'?(state.holding?'holding':'slipping'):state.holding?'holding':pose;
    miner.dataset.pose=actualPose;
    rock.dataset.expression=state.phase!=='mining'?'warning':pose==='celebrate'?'happy':state.shakes?'recovery':'idle';
    const target=(Math.floor(state.banked/25)+1)*25,progress=state.banked%25;
    el('[data-myj="mission"]').textContent=state.banked>=25?'Star '+Math.floor(state.banked/25)+' earned! Next: '+target:'Let’s bank 25 Jems!';
    el('.myj-goal-track').setAttribute('aria-valuenow',String(progress));
    el<HTMLElement>('.myj-goal-track span').style.width=(progress/25*100)+'%';
    const pile=el('.myj-cart-pile'),desired=Math.min(6,Math.ceil(state.banked/4));
    if(pile.childElementCount!==desired){pile.innerHTML=Array.from({length:desired},(_,i)=>sprite('props-atlas.webp',i)).join('');}
    // Keep short ready-state feedback until its timer expires. Other notices
    // must not replace the current contextual instruction.
    if(!el('[data-myj="tips"]').classList.contains('myj-tips-feedback'))
      el('[data-myj="tips"]').textContent=tipsForState();
    el('.myj-loading').hidden=assets==='ready';
    el('[data-myj="loading-copy"]').textContent=assets==='failed'?'The artwork needs another try.':'Opening the crystal garden…';
    btn('[data-myj="retry-art"]').hidden=assets!=='failed';
  }
  function move(action:MineAction){const before=state;state=moveMine(state,action);draw();return before!==state;}
  function particle(from:DOMRect,to:DOMRect,frame:number,delay=0){
    if(reduced.matches)return;
    const bounds=stage.getBoundingClientRect();
    const item=document.createElement('span');item.className='myj-flying-gem';item.innerHTML=sprite('props-atlas.webp',frame);
    item.style.left=(from.x+from.width/2-bounds.x)+'px';item.style.top=(from.y+from.height/2-bounds.y)+'px';
    item.style.setProperty('--fly-x',(to.x+to.width/2-from.x-from.width/2)+'px');
    item.style.setProperty('--fly-y',(to.y+to.height/2-from.y-from.height/2)+'px');item.style.animationDelay=delay+'ms';
    el('.myj-effects').append(item);later(()=>item.remove(),delay+900);
  }
  function nextShake(){
    cancelTimer(shakeTimer);
    if(!dialog.open||document.hidden||assets!=='ready'||!help.hidden)return;
    shakeTimer=later(()=>{
      if(!move({type:'warn'}))return;
      pose='idle';draw();sound('warn');notice('Ooh, a BIG idea! Bank, then grab on!',3600);
      shakeTimer=later(()=>{
        const dropped=state.loose,held=state.holding;if(!move({type:'shake'}))return;
        const from=el('.myj-head-anchor').getBoundingClientRect(),bounds=stage.getBoundingClientRect();
        for(let i=0;i<dropped;i++)particle(new DOMRect(from.x+from.width*.45,from.y+from.height*.2,20,20),new DOMRect(bounds.x+(i%2?1.1:-.1)*bounds.width,bounds.bottom+70,20,20),i%6,i*35);
        notice(dropped?(held?'You held on! '+dropped+' loose Jems flew away.':'Whoops! '+dropped+' loose Jems flew away.'):'All banked Jems are safe!',2200);
        shakeTimer=later(()=>{move({type:'settle'});pose='idle';draw();nextShake();},1250);
      },3600);
    },11000+Math.random()*7000);
  }
  function prepareArtwork(){
    if(assets==='ready')return Promise.resolve();
    if(artworkPromise)return artworkPromise;
    assets='loading';draw();
    const images=Array.from(dialog.querySelectorAll<HTMLImageElement>('img'));
    images.forEach(img=>{img.loading='eager';});
    artworkPromise=Promise.all(images.map(img=>img.decode())).then(()=>{assets='ready';}).catch(()=>{assets='failed';}).finally(()=>{artworkPromise=null;if(dialog.open){draw();if(assets==='ready')nextShake();}});
    return artworkPromise;
  }
  function update(status:WorkshopStatus,isReady:boolean){
    if(!current)return;
    const becameReady=!current.isReady&&isReady;
    current={...current,status,isReady};dialog.dataset.build=status;dialog.dataset.ready=String(isReady);
    const copy:Record<WorkshopStatus,string>={queued:'Your game is in the queue',building:'Your game is building',testing:'Testing your game',ready:isReady?'Your game is ready!':'Checking your game',failed:'Your build needs a hand',cancelled:'Your build was cancelled',reconnecting:'Reconnecting to your build'};
    el('.myj-build-status').textContent=copy[status];
    el('[data-myj="ready"]').hidden=!isReady;
    const problem=el('.myj-build-problem');problem.hidden=status!=='failed'&&status!=='cancelled';
    problem.querySelector('span')!.textContent=status==='failed'?'Your other game needs a hand. You can keep mining.':'Your other build was cancelled. You can keep mining.';
    if(becameReady){setPose('celebrate',2100);sound('ready');notice('');}
  }
  function stop(){
    ++session;cancelTimers();stopSound();
    pose='idle';state=newMineState();current=null;dialog.classList.remove('myj-is-warning','myj-is-shaking','myj-is-paused');
    document.body.style.overflow=bodyOverflow;
  }
  function close(){
    if(!dialog.open)return;
    const onClose=current?.onClose;stop();dialog.close();onClose?.();
  }
  // Cleanup is synchronous. A delayed native close event cannot reset a reopened session.
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  dialog.addEventListener('close',()=>{if(!dialog.open&&current){const onClose=current.onClose;stop();onClose?.();}});
  btn('.myj-close').addEventListener('click',close);
  btn('.myj-exit').addEventListener('click',()=>{
    const callback=current?.onBackToStudio;
    close();callback?.();
  });
  bank.addEventListener('click',()=>{
    const count=state.loose,before=state.banked;if(!move({type:'bank'}))return;
    const from=el('.myj-score-loose').getBoundingClientRect(),to=cart.getBoundingClientRect();
    for(let i=0;i<Math.min(count,8);i++)particle(from,to,i%6,i*55);
    cart.classList.remove('myj-banked');void cart.offsetWidth;cart.classList.add('myj-banked');later(()=>cart.classList.remove('myj-banked'),700);
    sound('bank');setPose('celebrate',1100);
    const milestone=Math.floor(state.banked/25)>Math.floor(before/25);
    notice(milestone?'Brilliant! '+state.banked+' Jems banked. You earned a star!':'+'+count+' safe in the cart!',2300);
  });
  cart.addEventListener('click',()=>bank.click());
  grab.addEventListener('click',()=>{if(move({type:'grab'})){setPose('holding');notice('Holding tight! Banked Jems stay safe.',1800);}});
  crystals.forEach((crystal,i)=>crystal.addEventListener('click',()=>{
    const value=gemShapes[i].value,before=state.loose;if(!move({type:'mine',value}))return;
    const earned=state.loose-before;setPose('mining',420);sound('mine');
    crystal.classList.remove('myj-picked');void crystal.offsetWidth;crystal.classList.add('myj-picked');later(()=>crystal.classList.remove('myj-picked'),420);
    particle(crystal.getBoundingClientRect(),el('.myj-score-loose').getBoundingClientRect(),gemShapes[i].frame);
    if(state.loose===BAG_CAPACITY)notice('Bag full! Time to bank your Jems.');
    else if(earned===3)notice('A brilliant find! +3 Jems',1400);
  }));
  btn('[data-myj="play-ready"]').addEventListener('click',()=>{const callback=current?.isReady?current.onPlayReady:null;if(callback){close();callback();}});
  btn('[data-myj="retry-art"]').addEventListener('click',()=>{dialog.querySelectorAll<HTMLImageElement>('img').forEach(img=>{if(!img.naturalWidth)img.src=img.src;});void prepareArtwork();});
  const help=el('#myjHelp'),helpToggle=btn('.myj-help-toggle');
  function setHelp(open:boolean){
    help.hidden=!open;helpToggle.setAttribute('aria-expanded',String(open));stage.inert=open;
    if(open){
      cancelTimers();stopSound();pose='idle';
      if(state.phase==='warning')state={...state,phase:'mining',holding:false};
      else if(state.phase==='shaking')state=moveMine(state,{type:'settle'});
      el('[data-myj="alert"]').textContent='';el('[data-myj="alert"]').classList.remove('myj-notice-visible');
      btn('[data-myj="help-done"]').focus();
    }else{helpToggle.focus();nextShake();}
    draw();
  }
  helpToggle.addEventListener('click',()=>setHelp(help.hidden));btn('[data-myj="help-done"]').addEventListener('click',()=>setHelp(false));
  btn('.myj-sound').addEventListener('click',()=>{
    soundOn=!soundOn;const button=btn('.myj-sound');button.setAttribute('aria-pressed',String(soundOn));button.setAttribute('aria-label',soundOn?'Mute game sounds':'Turn on game sounds');button.innerHTML=icon(soundOn?'sound':'muted');
    if(soundOn)sound('mine');else stopSound();
  });
  document.addEventListener('visibilitychange',()=>{
    if(!dialog.open)return;
    dialog.classList.toggle('myj-is-paused',document.hidden);
    if(document.hidden){
      cancelTimers();pose='idle';stopSound();
      if(state.phase==='warning')state={...state,phase:'mining',holding:false};
      else if(state.phase==='shaking')state=moveMine(state,{type:'settle'});
      el('[data-myj="alert"]').textContent='';el('[data-myj="alert"]').classList.remove('myj-notice-visible');draw();
    }else{nextShake();notice('Welcome back! Your banked Jems are safe.',1800);}
  });
  return {
    open(launch){
      if(dialog.open){current={...launch,isReady:current?.isReady??false};update(launch.status,launch.isReady);return;}
      ++session;cancelTimers();bodyOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
      current={...launch,isReady:false};state=newMineState();pose='idle';
      help.hidden=true;stage.inert=false;helpToggle.setAttribute('aria-expanded','false');dialog.classList.remove('myj-is-paused');
      el('[data-myj="alert"]').textContent='';el('[data-myj="alert"]').classList.remove('myj-notice-visible');draw();
      dialog.showModal();update(launch.status,launch.isReady);btn('.myj-close').focus({preventScroll:true});
      if(assets==='ready')nextShake();else void prepareArtwork();
    },update,close,isOpen:()=>dialog.open
  };
}
