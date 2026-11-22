import './mind-your-jems.css';
import {BAG_CAPACITY,newMineState,stepMine,retryMine,nextMineLevel,mineDifficulty,isMineSafe,type MineState} from './mind-your-jems-rules';

/** Local illustrated play. The host owns builds, learning, and navigation. */
export type WorkshopStatus = 'queued'|'building'|'testing'|'ready'|'failed'|'cancelled'|'reconnecting';
export type ArcadeLaunch = {projectName:string;status:WorkshopStatus;isReady:boolean;onPlayReady:()=>void;onBackToStudio?:()=>void;onClose?:()=>void};
export type WaitArcade = {open:(launch:ArcadeLaunch)=>void;update:(status:WorkshopStatus,isReady:boolean)=>void;close:()=>void;isOpen:()=>boolean};
export type MiningGame = {
  pause:()=>void;resume:()=>void;restart:()=>void;dispose:()=>void;
  isPlaying:()=>boolean;snapshot:()=>MineState;update:(status:WorkshopStatus,isReady:boolean)=>void;
};
type MountOptions = {onExit?:()=>void;onPlayReady?:()=>void;onBackToStudio?:()=>void;onLevelComplete?:(level:number)=>void};
const ART='./art/mind-your-jems/';
// Contact points traced on the shared silhouette of the four approved rock frames.
// Coordinates are fractions of the sprite square, not a generic circular arc.
const HEAD_SURFACE=[
  [.16,.172],[.20,.153],[.24,.142],[.28,.140],[.32,.107],[.36,.099],[.40,.102],
  [.44,.118],[.48,.150],[.50,.198],[.52,.201],[.56,.196],[.60,.220],
  [.64,.192],[.68,.169],[.72,.158],[.76,.161],[.80,.177],[.84,.220],[.86,.230],
] as const;
const icon=(name:'close'|'left'|'right'|'grip'|'sound'|'muted'|'pause'|'play')=>{
  const paths={close:'M7 7l10 10M17 7 7 17',left:'M19 12H5m6-6-6 6 6 6',right:'M5 12h14m-6-6 6 6-6 6',
    grip:'M8 13V7a2 2 0 0 1 4 0v5-7a2 2 0 0 1 4 0v7-4a2 2 0 0 1 4 0v7c0 5-3 7-7 7-3 0-5-2-7-5l-3-4a2 2 0 0 1 3-3l2 3Z',
    sound:'M4 9h4l5-4v14l-5-4H4ZM17 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14',muted:'M4 9h4l5-4v14l-5-4H4Zm13 0 5 6m0-6-5 6',pause:'M8 5v14M16 5v14',play:'m8 5 11 7-11 7Z'};
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+paths[name]+'"/></svg>';
};
function sprite(file:string,frame:number,cols=4,rows=2){
  return '<span class="myj-sprite" style="--cols:'+cols+';--rows:'+rows+';--sx:'+(frame%cols)+';--sy:'+Math.floor(frame/cols)+'" aria-hidden="true"><img src="'+ART+file+'" alt="" draggable="false"></span>';
}
const html=`<div class="myj-shell">
 <header class="myj-header">
  <img class="myj-logo" src="./jems-logo.svg" alt="jems" draggable="false">
  <span class="myj-build" hidden><span class="myj-build-dot" aria-hidden="true"></span><span class="myj-build-status" role="status"></span></span>
  <div class="myj-toolbar">
   <button class="myj-icon-button myj-sound" type="button" aria-label="Turn on game sounds" aria-pressed="false">${icon('muted')}</button>
   <button class="myj-icon-button myj-pause" type="button" aria-label="Pause game" aria-pressed="false">${icon('pause')}</button>
   <button class="myj-icon-button myj-help-toggle" type="button" aria-label="How to play Mind Your Jems" aria-expanded="false">?</button>
   <button class="myj-icon-button myj-close" type="button" aria-label="Close mini-game">${icon('close')}</button>
  </div>
 </header>
 <div class="myj-main">
  <div class="myj-stage" role="group" tabindex="0" aria-label="Run across the giant’s head and save jems in the bucket">
   <img class="myj-sky" src="${ART}scene-sky.webp" alt="" draggable="false"><div class="myj-sunshine" aria-hidden="true"></div>
   <div class="myj-title"><h2><span>Mind Your</span><em>Jems!</em></h2></div>
   <div class="myj-score" aria-label="This game’s score">
    <div class="myj-score-banked">${sprite('props-atlas.webp',2)}<span>Saved<strong data-myj="banked">0</strong></span></div>
    <div class="myj-score-loose">${sprite('props-atlas.webp',1)}<span>Bag<strong><b data-myj="loose">0</b><small> / ${BAG_CAPACITY}</small></strong></span></div>
   </div>
   <div class="myj-world" aria-hidden="true">
    <div class="myj-head-anchor"><div class="myj-head-motion"><div class="myj-rock" data-expression="idle">${sprite('rock-expressions.webp',0,2,2)}</div></div></div>
    <div class="myj-bridge"></div>
    <div class="myj-cart-hit" data-myj="bank-cart">${sprite('cart-empty.webp',0,1,1)}<img class="myj-cart-brand" src="./jems-mark.svg" alt="" draggable="false"><span class="myj-cart-pile"></span><span class="myj-cart-label">Safe here</span></div>
    <div class="myj-gems"></div>
    <div class="myj-miner-anchor"><div class="myj-miner-shake"><div class="myj-miner" data-pose="idle">${sprite('miner-poses.webp',0,2,2)}</div></div><span class="myj-carry" hidden></span></div>
   </div>
   <div class="myj-warning" role="status" aria-live="polite" hidden></div>
   <div class="myj-effects" aria-hidden="true"></div>
   <div class="myj-result" hidden><h3 data-myj="result-title"></h3><p data-myj="result-copy"></p><button type="button" data-myj="continue"></button></div>
   <div class="myj-paused" hidden><h3>Paused</h3><button type="button" data-myj="resume">Keep playing</button></div>
   <div class="myj-loading" role="status"><span class="myj-loader-gem">${sprite('props-atlas.webp',0)}</span><strong data-myj="loading-copy">Opening the mine…</strong><button type="button" data-myj="retry-art" hidden>Try again</button></div>
  </div>
  <div class="myj-controls">
   <div class="myj-mission"><strong class="myj-level">Level 1</strong><span data-myj="mission">Fill the bucket</span><span data-myj="level-goal">0 / 12</span><div class="myj-goal-track" role="progressbar" aria-label="Bucket fill" aria-valuemin="0" aria-valuemax="12" aria-valuenow="0"><span></span></div></div>
   <div class="myj-actions" role="group" aria-label="Mining controls">
    <button class="myj-action myj-direction" data-myj="left" type="button" aria-label="Move left" aria-pressed="false">${icon('left')}<span>Left</span></button>
    <button class="myj-action myj-direction" data-myj="right" type="button" aria-label="Move right" aria-pressed="false"><span>Right</span>${icon('right')}</button>
    <button class="myj-action myj-action-grab" data-myj="grab" type="button" aria-label="Hold on" aria-pressed="false">${icon('grip')}<span>Hold on</span></button>
   </div>
   <p class="myj-tips" data-myj="tips" role="status" aria-live="polite">Run to jems. Bring them to the bucket.</p>
  </div>
  <div class="myj-help" hidden><h3>Run. Collect. Save!</h3><div class="myj-help-copy"><p>Run into jems to pick them up.</p><p>Bring your bag to the bucket. Fill it to reach the next level.</p><p>Big shake coming? Run to safety, or hold on! Holding saves you, but spills your bag.</p><p><strong>← → or A / D</strong> to run.<br><strong>Hold Space</strong> to cling.</p><p>Saved jems survive a fall. This game’s score resets when you leave; it does not add to My rewards.</p></div><button type="button" data-myj="help-done">Let’s play</button></div>
  <div class="myj-ready" data-myj="ready" hidden><strong>Your game is ready!</strong><button type="button" data-myj="play-ready">Play my game ${icon('right')}</button></div>
  <div class="myj-build-problem" hidden><span></span><button class="myj-exit" type="button">Back to Studio ${icon('right')}</button></div>
 </div>
</div>`;

/** Mount the very same scene in a native game host or the temporary wait wrapper. */
export function mountMindYourJems(root:HTMLElement,options:MountOptions={}):MiningGame {
  root.classList.add('myj-arcade');
  if(root.tagName!=='DIALOG')root.classList.add('myj-embedded');
  root.innerHTML=html;
  const el=<T extends HTMLElement=HTMLElement>(selector:string)=>root.querySelector<T>(selector)!;
  const button=(key:string)=>el<HTMLButtonElement>('[data-myj="'+key+'"]');
  const stage=el('.myj-stage'),miner=el('.myj-miner'),player=el('.myj-miner-anchor'),cart=el('.myj-cart-hit'),help=el('.myj-help');
  const abort=new AbortController(),signal=abort.signal,reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  let state=newMineState(Math.floor(Math.random()*0x7fffffff)+1),disposed=false,paused=false,helpWasPaused=false;
  let assets:'loading'|'ready'|'failed'='loading',artworkPromise:Promise<void>|null=null;
  let frame=0,lastTime=0,resumeGrace=0,noticeUntil=0,noticeText='',celebrateUntil=0,collectUntil=0,fallFromHold=false;
  let ready=false,soundOn=false,audioContext:AudioContext|null=null;
  const keys=new Set<string>(),pointers=new Map<number,'left'|'right'|'hold'>(),gemNodes=new Map<number,HTMLElement>();
  let enterAction:string|null=null;
  let geometry={left:0,headTop:0,headSize:1,cartX:0,cartSize:1,cartFoot:0,playerSize:1};
  let lastRender='',lastAnnouncement='';
  const listen=(target:EventTarget,name:string,fn:EventListener,extra:AddEventListenerOptions={})=>target.addEventListener(name,fn,{...extra,signal});
  const input=()=>({left:keys.has('ArrowLeft')||keys.has('KeyA')||[...pointers.values()].includes('left'),right:keys.has('ArrowRight')||keys.has('KeyD')||[...pointers.values()].includes('right'),hold:keys.has('Space')||[...pointers.values()].includes('hold')});
  function clearInput(){keys.clear();pointers.clear();enterAction=null;state={...state,holding:false};}
  function stopSound(){const old=audioContext;audioContext=null;if(old)void old.close().catch(()=>{});}
  function sound(kind:'collect'|'bank'|'warn'|'win'){
    if(!soundOn||document.hidden||disposed)return;
    try{
      audioContext??=new AudioContext();void audioContext.resume().catch(()=>{});
      const context=audioContext,notes={collect:[660,880],bank:[523,659,784],warn:[392,440],win:[523,659,784,1047]}[kind];
      notes.forEach((frequency,i)=>{const tone=context.createOscillator(),gain=context.createGain(),at=context.currentTime+i*.075;
        tone.frequency.value=frequency;gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(.04,at+.01);gain.gain.exponentialRampToValueAtTime(.001,at+.16);
        tone.connect(gain);gain.connect(context.destination);tone.onended=()=>{tone.disconnect();gain.disconnect();};tone.start(at);tone.stop(at+.18);
      });
    }catch{/* Optional sound never blocks play. */}
  }
  function point(x:number):{x:number;y:number}{
    const {left,headTop,headSize,cartX,cartSize,cartFoot}=geometry;
    if(x<=80){
      const u=Math.min(.86,.16+.00875*x);
      const index=Math.max(1,HEAD_SURFACE.findIndex(([at])=>at>=u));
      const [a,b]=[HEAD_SURFACE[index-1],HEAD_SURFACE[index]];
      const v=a[1]+(b[1]-a[1])*(u-a[0])/(b[0]-a[0]);
      return {x:left+.00875*headSize*x,y:headTop+(v+.006)*headSize};
    }
    const edge={x:cartX+.13*cartSize,y:cartFoot};
    if(x<88){const from=point(80),t=(x-80)/8;return {x:from.x+(edge.x-from.x)*t,y:from.y+(edge.y-from.y)*t};}
    return {x:edge.x+((x-88)/12)*.69*cartSize,y:cartFoot};
  }
  function place(node:HTMLElement,x:number,y:number,size:number){node.style.left=x+'px';node.style.top=y+'px';node.style.width=size+'px';node.style.height=size+'px';}
  function layout(){
    const w=stage.clientWidth,h=stage.clientHeight;if(!w||!h)return;
    const landscape=window.matchMedia('(orientation: landscape)').matches;
    const portrait=!landscape&&(w<600||w<h*1.15),shallow=h<300,shortPortrait=portrait&&h<440;
    const bottomExtent=shallow||shortPortrait?.84:portrait?.90:.94;
    const topClear=portrait?(window.matchMedia('(max-width:760px)').matches?174:132):shallow?20:40;
    const playerAt=(size:number)=>Math.max(64,Math.min(size*(portrait?.25:.225),shallow?83:portrait?104:174));
    const cartAt=(size:number)=>Math.max(72,size*(portrait?.36:.32));
    const widthAt=(size:number)=>.76*playerAt(size)+24+.75*size+Math.max(.87*cartAt(size),.69*cartAt(size)+.52*playerAt(size));
    // Fit the standing miner, complete mouth and visible safe ledge together.
    // Short screens may crop the chin; the face and controls stay readable.
    let low=0,high=Math.min(w*(portrait?1.19:.68),h*1.12);
    for(let i=0;i<20;i++){
      const size=(low+high)/2;
      if(widthAt(size)<=w&&topClear+.94*playerAt(size)+(bottomExtent-.10)*size+8<=h)low=size;else high=size;
    }
    const size=low,playerSize=playerAt(size),cartSize=cartAt(size);
    const start=(w-widthAt(size))/2+.76*playerSize+12,headLeft=start-size*.16;
    const bottomAligned=h-8-bottomExtent*size,minimumTop=topClear+.94*playerSize-.105*size;
    const headTop=bottomAligned-(portrait?Math.max(0,bottomAligned-minimumTop)*.5:0);
    const cartX=start+.75*size-.13*cartSize,cartFoot=headTop+size*.29;
    geometry={left:start,headTop,headSize:size,cartX,cartSize,cartFoot,playerSize};
    place(el('.myj-head-anchor'),headLeft,headTop,size);
    place(cart,cartX,cartFoot-cartSize*.66,cartSize);
    const bridge=el('.myj-bridge'),from=point(80),to=point(88),dx=to.x-from.x,dy=to.y-from.y;
    bridge.style.left=from.x+'px';bridge.style.top=from.y+'px';bridge.style.width=Math.hypot(dx,dy)+'px';bridge.style.transform='rotate('+Math.atan2(dy,dx)+'rad)';
    renderPosition();renderGems();
  }
  function renderPosition(){
    const p=point(state.playerX),size=geometry.playerSize;
    const gripping=state.holding||fallFromHold&&['falling','retry'].includes(state.phase);
    place(player,p.x-size*(gripping?(state.facing===1?.76:.24):.48),p.y-size*(gripping?.33:.94),size);
    player.style.setProperty('--facing',String(state.facing));
    player.dataset.safe=String(isMineSafe(state.playerX));
    const carry=el('.myj-carry');carry.hidden=state.loose===0;if(carry.textContent!==String(state.loose))carry.textContent=String(state.loose);
  }
  function renderGems(){
    const live=new Set(state.gems.map(g=>g.id));
    for(const [id,node] of gemNodes)if(!live.has(id)){node.remove();gemNodes.delete(id);}
    for(const gem of state.gems){
      let node=gemNodes.get(gem.id);
      if(!node){node=document.createElement('span');node.className='myj-gem';node.dataset.crystal=String(gem.id);node.dataset.x=String(gem.x);node.innerHTML=sprite('props-atlas.webp',gem.frame);el('.myj-gems').append(node);gemNodes.set(gem.id,node);}
      const p=point(gem.x),size=Math.max(26,Math.min(geometry.headSize*.10,64));place(node,p.x-size/2,p.y-size*.94,size);
    }
  }
  function particles(points:{x:number;y:number;frame:number}[],banking=false){
    if(reduced.matches)return;
    for(const [i,p] of points.slice(0,14).entries()){
      const node=document.createElement('span');node.className='myj-flying-gem';node.innerHTML=sprite('props-atlas.webp',p.frame);
      node.style.left=p.x+'px';node.style.top=p.y+'px';
      const destination=banking?point(96):{x:p.x+(i%2?90:-90),y:stage.clientHeight+50};
      node.style.setProperty('--fly-x',destination.x-p.x+'px');node.style.setProperty('--fly-y',destination.y-p.y+'px');
      node.addEventListener('animationend',()=>node.remove(),{once:true,signal});el('.myj-effects').append(node);
    }
  }
  function notice(text:string){noticeText=text;noticeUntil=state.elapsedMs+2300;}
  function render(){
    root.dataset.phase=state.phase;root.dataset.holding=String(state.holding);root.dataset.assets=assets;
    root.dataset.playerX=state.playerX.toFixed(3);root.dataset.level=String(state.level);root.dataset.safe=String(isMineSafe(state.playerX));root.dataset.phaseMs=String(Math.round(state.phaseMs));root.dataset.paused=String(paused);
    const moving=input(),active=assets==='ready'&&!paused&&help.hidden;
    root.classList.toggle('myj-is-warning',state.phase==='warning');root.classList.toggle('myj-is-shaking',state.phase==='shaking'||state.phase==='falling');root.classList.toggle('myj-is-paused',paused||!help.hidden);
    const pose=state.phase==='falling'||state.phase==='retry'?'slipping':state.holding?'holding':state.phase==='level-complete'||state.elapsedMs<celebrateUntil?'celebrate':state.elapsedMs<collectUntil?'mining':active&&moving.left!==moving.right?'running':'idle';
    miner.dataset.pose=pose;
    el('.myj-rock').dataset.expression=['warning','shaking','falling'].includes(state.phase)?'warning':pose==='celebrate'?'happy':state.shakes?'recovery':'idle';
    renderPosition();renderGems();
    for(const [name,pressed] of [['left',moving.left],['right',moving.right],['grab',moving.hold]] as const){const b=button(name);b.setAttribute('aria-pressed',String(pressed));b.disabled=assets!=='ready'||!help.hidden||['falling','retry','level-complete'].includes(state.phase);}
    const diff=mineDifficulty(state.level),signature=[state.banked,state.loose,state.levelBanked,state.level,state.phase,paused,assets,help.hidden].join(':');
    if(signature!==lastRender){
      lastRender=signature;
      button('continue').textContent=state.phase==='level-complete'?'Next level':'Try again';
      el('[data-myj="banked"]').textContent=String(state.banked);el('[data-myj="loose"]').textContent=String(state.loose);
      el('.myj-level').textContent='Level '+state.level;el('[data-myj="level-goal"]').textContent=Math.min(diff.goal,state.levelBanked)+' / '+diff.goal;
      const track=el('.myj-goal-track');track.setAttribute('aria-valuemax',String(diff.goal));track.setAttribute('aria-valuenow',String(Math.min(diff.goal,state.levelBanked)));el('.myj-goal-track span').style.width=Math.min(100,state.levelBanked/diff.goal*100)+'%';
      el('.myj-result').hidden=state.phase!=='retry'&&state.phase!=='level-complete';
      el('[data-myj="result-title"]').textContent=state.phase==='level-complete'?'Bucket full!':'You slipped!';
      el('[data-myj="result-copy"]').textContent=state.phase==='level-complete'?'Level '+state.level+' complete.':'Your saved jems are safe.';
      const pile=el('.myj-cart-pile'),count=Math.min(6,Math.ceil(state.levelBanked/diff.goal*6));pile.innerHTML=Array.from({length:count},(_,i)=>sprite('props-atlas.webp',i)).join('');
      el('.myj-paused').hidden=!paused||!help.hidden;el('.myj-pause').setAttribute('aria-label',paused?'Resume game':'Pause game');el('.myj-pause').setAttribute('aria-pressed',String(paused));el('.myj-pause').innerHTML=icon(paused?'play':'pause');
      el('.myj-loading').hidden=assets==='ready';el('[data-myj="loading-copy"]').textContent=assets==='failed'?'The artwork needs another try.':'Opening the mine…';button('retry-art').hidden=assets!=='failed';stage.setAttribute('aria-busy',String(assets==='loading'));
    }
    const warning=el('.myj-warning');warning.hidden=!['warning','shaking'].includes(state.phase);
    const warningCopy=state.phase==='warning'?'Shake in '+Math.ceil(state.phaseMs/1000)+'!':state.holding?'Hold tight!':isMineSafe(state.playerX)?'Safe in the mine!':'Big shake!';
    if(warning.textContent!==warningCopy)warning.textContent=warningCopy;
    const message=resumeGrace>0?'Get ready. Hold on!':state.elapsedMs<noticeUntil?noticeText:state.phase==='warning'?'Run to safety, or hold on!':state.phase==='shaking'?(isMineSafe(state.playerX)?'Your jems are safe.':state.holding?'Keep holding!':'Hold on!'):state.loose===BAG_CAPACITY?'Bag full! Run to the bucket.':'Run to jems. Bring them to the bucket.';
    if(lastAnnouncement!==message){lastAnnouncement=message;el('[data-myj="tips"]').textContent=message;}
  }
  function frameTick(now:number){
    if(disposed)return;
    const dt=lastTime?Math.min(100,now-lastTime):0;lastTime=now;
    if(assets==='ready'&&!paused&&help.hidden&&!document.hidden){
      if(resumeGrace>0)resumeGrace=Math.max(0,resumeGrace-dt);
      else {
        const before=state;state=stepMine(state,input(),dt);
        if(state.phase==='falling'&&before.phase!=='falling')fallFromHold=before.holding;
        if(state.mined>before.mined){collectUntil=state.elapsedMs+260;sound('collect');}
        if(state.banked>before.banked){const p=point(before.playerX);particles(Array.from({length:before.loose},(_,i)=>({...p,frame:i%6})),true);notice('+'+(state.banked-before.banked)+' saved!');celebrateUntil=state.elapsedMs+650;sound('bank');}
        if(state.phase==='warning'&&before.phase!=='warning')sound('warn');
        if(state.lost>before.lost||before.gems.length&&state.gems.length===0&&state.phase!==before.phase){particles([...before.gems.map(g=>({...point(g.x),frame:g.frame})),...Array.from({length:state.lost-before.lost},(_,i)=>({...point(before.playerX),frame:i%6}))]);if(state.lost>before.lost)notice('Your bag spilled. Saved jems are safe.');}
        if(state.phase==='level-complete'&&before.phase!=='level-complete'){clearInput();sound('win');options.onLevelComplete?.(state.level);if(disposed)return;render();button('continue').focus({preventScroll:true});}
        if(state.phase==='retry'&&before.phase!=='retry'){clearInput();render();button('continue').focus({preventScroll:true});}
      }
    }
    render();frame=requestAnimationFrame(frameTick);
  }
  function pause(){if(disposed)return;paused=true;clearInput();stopSound();render();}
  function resume(){if(disposed)return;paused=false;lastTime=0;resumeGrace=['warning','shaking'].includes(state.phase)&&!isMineSafe(state.playerX)?900:0;render();stage.focus({preventScroll:true});}
  function restart(){state=newMineState();clearInput();paused=false;resumeGrace=0;fallFromHold=false;noticeUntil=celebrateUntil=collectUntil=0;el('.myj-effects').replaceChildren();render();}
  function setHelp(open:boolean){
    if(open){helpWasPaused=paused;clearInput();stopSound();help.hidden=false;stage.inert=true;el('.myj-header').inert=true;button('help-done').focus({preventScroll:true});}
    else {el('.myj-header').inert=false;help.hidden=true;stage.inert=false;if(!helpWasPaused)resume();else button('resume').focus({preventScroll:true});}
    el('.myj-help-toggle').setAttribute('aria-expanded',String(open));render();
  }
  async function prepareArtwork(){
    if(artworkPromise||disposed)return;
    assets='loading';render();
    const images=[...root.querySelectorAll<HTMLImageElement>('img')];
    artworkPromise=Promise.all(images.map(img=>img.decode())).then(()=>{if(!disposed)assets='ready';}).catch(()=>{if(!disposed)assets='failed';}).finally(()=>{artworkPromise=null;if(!disposed){layout();render();}});
    await artworkPromise;
  }
  for(const [name,action] of [['left','left'],['right','right'],['grab','hold']] as const){
    const b=button(name);
    listen(b,'pointerdown',event=>{const e=event as PointerEvent;if(b.disabled||e.button!==0)return;e.preventDefault();b.focus({preventScroll:true});pointers.set(e.pointerId,action);b.setPointerCapture(e.pointerId);render();});
    for(const name of ['pointerup','pointercancel','lostpointercapture'])listen(b,name,event=>{pointers.delete((event as PointerEvent).pointerId);render();});
    listen(b,'contextmenu',event=>event.preventDefault());
    // Native keyboard activation of a focused touch control is held, not a toggle.
    listen(b,'keydown',event=>{const e=event as KeyboardEvent;if(e.code==='Enter'&&!b.disabled){e.preventDefault();enterAction=action==='left'?'ArrowLeft':action==='right'?'ArrowRight':'Space';keys.add(enterAction);}});
    listen(b,'blur',()=>{if(enterAction){keys.delete(enterAction);enterAction=null;}});
  }
  function acceptsKeys(event:KeyboardEvent){
    const node=event.target instanceof Element?event.target:null;
    if(!help.hidden||disposed||assets!=='ready')return false;
    if(root.tagName!=='DIALOG'&&(!node||!root.contains(node)))return false;
    if(node?.closest('input,textarea,select,[contenteditable=true]'))return false;
    return !node?.closest('button')||!!node.closest('.myj-actions');
  }
  listen(window,'keydown',event=>{const e=event as KeyboardEvent;if(!['ArrowLeft','ArrowRight','KeyA','KeyD','Space'].includes(e.code)||!acceptsKeys(e))return;e.preventDefault();keys.add(e.code);});
  listen(window,'keyup',event=>{const e=event as KeyboardEvent;if(e.code==='Enter'&&enterAction){keys.delete(enterAction);enterAction=null;e.preventDefault();}if(keys.delete(e.code))e.preventDefault();});
  listen(window,'blur',()=>{if(!disposed)pause();});
  listen(document,'visibilitychange',()=>{if(document.hidden)pause();});
  listen(el('.myj-pause'),'click',()=>paused?resume():pause());listen(button('resume'),'click',resume);
  listen(el('.myj-help-toggle'),'click',()=>setHelp(help.hidden));listen(button('help-done'),'click',()=>setHelp(false));
  listen(el('.myj-close'),'click',()=>options.onExit?.());el('.myj-close').hidden=!options.onExit;
  listen(button('continue'),'click',()=>{state=state.phase==='level-complete'?nextMineLevel(state):retryMine(state);clearInput();noticeUntil=0;el('.myj-effects').replaceChildren();render();button('left').focus({preventScroll:true});});
  listen(button('play-ready'),'click',()=>{if(ready)options.onPlayReady?.();});listen(el('.myj-exit'),'click',()=>options.onBackToStudio?.());
  listen(button('retry-art'),'click',()=>{for(const image of root.querySelectorAll<HTMLImageElement>('img'))if(!image.naturalWidth)image.src=image.src;void prepareArtwork();});
  listen(el('.myj-sound'),'click',()=>{soundOn=!soundOn;const b=el('.myj-sound');b.setAttribute('aria-pressed',String(soundOn));b.setAttribute('aria-label',soundOn?'Mute game sounds':'Turn on game sounds');b.innerHTML=icon(soundOn?'sound':'muted');if(soundOn)sound('collect');else stopSound();});
  const resize=new ResizeObserver(layout);resize.observe(stage);
  layout();render();void prepareArtwork();frame=requestAnimationFrame(frameTick);
  return {pause,resume,restart,snapshot:()=>state,isPlaying:()=>!disposed&&!paused&&help.hidden&&assets==='ready'&&!['retry','falling','level-complete'].includes(state.phase),
    update(status,isReady){
      ready=isReady;root.dataset.build=status;root.dataset.ready=String(isReady);el('.myj-build').hidden=false;
      const copy:Record<WorkshopStatus,string>={queued:'Your game is queued',building:'Your game is building',testing:'Testing your game',ready:isReady?'Your game is ready!':'Checking your game',failed:'Your build needs a hand',cancelled:'Your build was cancelled',reconnecting:'Reconnecting to your build'};
      el('.myj-build-status').textContent=copy[status];el('[data-myj="ready"]').hidden=!isReady;
      el('.myj-build-problem').hidden=status!=='failed'&&status!=='cancelled';el('.myj-build-problem span').textContent=status==='failed'?'Your other game needs a hand.':'Your other build was cancelled.';
    },
    dispose(){if(disposed)return;disposed=true;abort.abort();resize.disconnect();cancelAnimationFrame(frame);clearInput();stopSound();root.replaceChildren();}
  };
}

/** Compatibility wrapper until Studio routes wait play through the native host. */
export function createMindYourJems():WaitArcade {
  const dialog=document.createElement('dialog');dialog.className='myj-arcade';dialog.setAttribute('aria-label','Mind Your Jems');document.body.append(dialog);
  let game:MiningGame|null=null,current:ArcadeLaunch|null=null,bodyOverflow='';
  function close(){if(!dialog.open)return;const callback=current?.onClose;current=null;game?.dispose();game=null;dialog.close();document.body.style.overflow=bodyOverflow;callback?.();}
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  dialog.addEventListener('close',()=>{if(!dialog.open&&current){const callback=current.onClose;current=null;game?.dispose();game=null;document.body.style.overflow=bodyOverflow;callback?.();}});
  return {open(launch){
    current=launch;if(dialog.open){game?.update(launch.status,launch.isReady);return;}
    bodyOverflow=document.body.style.overflow;document.body.style.overflow='hidden';dialog.showModal();
    game=mountMindYourJems(dialog,{onExit:close,onPlayReady:()=>{const callback=current?.isReady?current.onPlayReady:null;if(callback){close();callback();}},onBackToStudio:()=>{const callback=current?.onBackToStudio;close();callback?.();}});
    game.update(launch.status,launch.isReady);dialog.querySelector<HTMLElement>('[data-myj="left"]')?.focus({preventScroll:true});
  },update(status,isReady){if(current){current={...current,status,isReady};game?.update(status,isReady);}},close,isOpen:()=>dialog.open};
}
