import {createIcon,setIconLabel} from '../brand/icons';
import iconStyles from '../brand/icons.css?inline';
import { createFixedClock } from '../quality/clock';
// Adapted from checksum-pinned recovered original; native scoped DOM, shared lifecycle.
export default class Original { constructor(mount,host){
 this.next=()=>{};this.restart=()=>{};this.unmount=()=>{};this.snapshot=()=>({});
 const element=document.createElement('div'),root=element.attachShadow({mode:'open'});mount.append(element);
 const nativeDocument=document;
 const scopeDocument={createElement:(...a)=>nativeDocument.createElement(...a),getElementById:id=>root.getElementById(id),querySelector:s=>root.querySelector(s),querySelectorAll:s=>root.querySelectorAll(s)};
 let alive=true,raf=0;const listeners=[],timers=[];
 const listen=(type,fn)=>{window.addEventListener(type,fn);listeners.push([type,fn])};
 const frame=fn=>{if(alive)raf=requestAnimationFrame(fn)};
 const later=(fn,ms)=>{const id=setTimeout(()=>{if(alive)fn()},ms);timers.push(id);return id};
 root.innerHTML="<style>\n  :host{--ink:#26304f;--paper:#fff8ea;--sky:#b9ddf7;--yellow:#ffd763;--red:#e65a58;--green:#84c86f}\n  *{box-sizing:border-box}html,body{margin:0;min-height:100%;background:var(--sky);font-family:Trebuchet MS,Arial,sans-serif;color:var(--ink)}\n  body{display:flex;justify-content:center;align-items:center;padding:10px}\n  #app{width:min(1240px,100%)}\n  .top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 8px}\n  .title{font-size:clamp(24px,4vw,46px);font-weight:1000;letter-spacing:-1px;text-shadow:2px 2px 0 #fff1b7}\n  .title span{color:var(--red)}\n  .btn,.small{appearance:none;border:3px solid var(--ink);background:var(--paper);border-radius:15px;box-shadow:4px 4px 0 var(--ink);padding:10px 18px;font-weight:900;color:var(--ink);cursor:pointer}\n  .small{padding:8px 12px;font-size:15px}\n  .wrap{position:relative;border:5px solid var(--ink);border-radius:24px;box-shadow:8px 8px 0 #5f7f9c;overflow:hidden;background:linear-gradient(#bfe7ff,#c7ebff)}\n  canvas{display:block;width:100%;height:auto;aspect-ratio:1200/720;touch-action:none}\n  #hud{position:absolute;inset:10px 10px auto 10px;display:flex;justify-content:space-between;align-items:flex-start;pointer-events:none;gap:10px}\n  .hudside{display:flex;gap:10px;flex-wrap:wrap}\n  .pill{background:#fff8eced;border:3px solid var(--ink);border-radius:999px;box-shadow:3px 3px 0 var(--ink);padding:7px 12px;font-weight:1000;font-size:clamp(13px,1.5vw,20px);display:flex;align-items:center;gap:8px;white-space:nowrap}\n  .bar{width:120px;height:16px;background:#d7d7d7;border-radius:999px;border:2px solid var(--ink);overflow:hidden}.bar i{display:block;height:100%;width:100%;background:linear-gradient(90deg,#fd7a68,#e25856)}\n  .overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:15px;background:rgba(38,48,79,.35)}\n  .hidden{display:none!important}\n  .panel{width:min(900px,100%);background:#fff9edf2;border:5px solid var(--ink);border-radius:26px;box-shadow:8px 8px 0 var(--ink);padding:18px;text-align:center;max-height:96%;overflow:auto}\n  .panel h1{margin:0 0 6px;font-size:clamp(30px,4.8vw,62px);line-height:1.02;letter-spacing:-1px}\n  .panel h1 b{color:var(--red)}\n  .panel p{margin:8px 0;font-weight:900;font-size:clamp(13px,1.8vw,22px)}\n  .heroes{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:12px 0 14px}\n  .heroCard{background:white;border:3px solid var(--ink);border-radius:17px;box-shadow:4px 4px 0 var(--ink);padding:10px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:6px}\n  .heroCard.selected{background:#fff2bc;border-color:#d95459;box-shadow:0 0 0 5px #ffe175,4px 4px 0 var(--ink);transform:translateY(-3px)}\n  .heroCard canvas,.heroCard img{width:100%;height:120px;object-fit:contain}\n  .heroCard strong{font-size:clamp(12px,1.7vw,19px)}\n  .inst{font-size:clamp(12px,1.3vw,17px);font-weight:900;line-height:1.4}\n  .key{display:inline-flex;align-items:center;justify-content:center;border:2px solid var(--ink);border-radius:10px;background:white;padding:2px 9px;min-width:34px;margin:0 2px;box-shadow:2px 2px 0 var(--ink)}\n  #toast{position:absolute;left:50%;top:16%;transform:translateX(-50%) rotate(-2deg);background:#fff2a9;border:4px solid var(--ink);border-radius:22px;box-shadow:5px 5px 0 var(--ink);font-size:clamp(22px,3.6vw,46px);font-weight:1000;padding:10px 24px;pointer-events:none}\n  #touch{display:none;gap:10px;justify-content:space-between;margin-top:10px}\n  .touchgroup{display:flex;gap:8px;flex-wrap:wrap}\n  #touch button{border:3px solid var(--ink);background:var(--paper);box-shadow:3px 3px 0 var(--ink);border-radius:15px;min-width:62px;min-height:58px;font-size:24px;font-weight:1000;color:var(--ink)}\n  .foot{font-size:12px;text-align:center;margin-top:8px;color:#3c5771;font-weight:700}\n  @media (max-width:920px){.heroes{grid-template-columns:repeat(2,1fr)} #touch{display:flex}}\n\n:host{display:block;width:100%;font-family:system-ui;color:#26304f} @media(max-width:600px){#hud{position:relative;inset:auto;gap:3px;flex-wrap:wrap}.pill{font-size:12px;padding:4px}.top{flex-wrap:wrap}.title{font-size:24px}}.touch,#touch{display:flex;flex-wrap:wrap}button{min-height:44px}canvas{max-width:100%}.foot{display:none}</style>\n<div id=\"app\">\n  <div class=\"top\">\n    <div class=\"title\">\ud83d\udc09 DRAGON <span>ISLAND</span> RESCUE!</div>\n    <div style=\"display:flex;gap:10px\"><button class=\"small\" id=\"soundBtn\">\ud83d\udd0a Sound on</button><button class=\"small\" id=\"pauseBtn\">Pause</button></div>\n  </div>\n  <div class=\"wrap\">\n    <canvas id=\"game\" width=\"1200\" height=\"720\"></canvas>\n    <div id=\"hud\">\n      <div class=\"hudside\">\n        <div class=\"pill\">\ud83d\udc51 <span id=\"heroHUD\">Queen</span></div>\n        <div class=\"pill\">\ud83d\udc32 <span id=\"levelHUD\">Level 1</span></div>\n      </div>\n      <div class=\"hudside\">\n        <div class=\"pill\">Dragon <span class=\"bar\"><i id=\"dragonBar\"></i></span></div>\n        <div class=\"pill\">Island <span id=\"islandHUD\">100%</span></div>\n        <div class=\"pill\">\ud83c\udfc6 <span id=\"bestHUD\">0</span></div>\n      </div>\n    </div>\n    <div id=\"toast\" class=\"hidden\">Level 1!</div>\n\n    <div id=\"menu\" class=\"overlay\">\n      <div class=\"panel\">\n        <h1>Dragon Island <b>Rescue!</b></h1>\n        <p>Pick your hero! All four are here, but <b>only YOU can bounce fireballs back</b>.</p>\n        <div class=\"heroes\" id=\"heroCards\"></div>\n        <button class=\"btn\" id=\"startBtn\">\u25b6 Start Game</button>\n        <p class=\"inst\">\n          <span class=\"key\">\u2190</span><span class=\"key\">\u2192</span> move &nbsp;\n          <span class=\"key\">\u2191</span> jump &nbsp;\n          <span class=\"key\">\u2193</span> duck &nbsp;\n          <span class=\"key\">SPACE</span> shield hop / cheer<br>\n          The dragon launches fireballs <b>up into the sky</b>. Jump into them to bounce them back!\n        </p>\n      </div>\n    </div>\n\n    <div id=\"pausePanel\" class=\"overlay hidden\"><div class=\"panel\"><h1>\u23f8 Paused</h1><p>Take a break, then save the island!</p><button class=\"btn\" id=\"resumeBtn\">\u25b6 Resume</button></div></div>\n    <div id=\"victoryPanel\" class=\"overlay hidden\"><div class=\"panel\"><h1>\u2728 YOU WON! \u2728</h1><p id=\"victoryText\">The dragon is defeated!</p><p>Next level loading...</p></div></div>\n    <div id=\"losePanel\" class=\"overlay hidden\"><div class=\"panel\"><h1>\ud83c\udf5d SAUCE STORM!</h1><p id=\"loseText\">The dragon broke the island and the red clouds poured sauce everywhere!</p><p id=\"loseScore\">You reached level 1.</p><button class=\"btn\" id=\"againBtn\">\u21bb Try Again</button><button class=\"small\" id=\"pickBtn\" style=\"margin-left:12px\">Pick Hero</button></div></div>\n  </div>\n\n  <div id=\"touch\">\n    <div class=\"touchgroup\">\n      <button data-key=\"ArrowLeft\">\u2190</button>\n      <button data-key=\"ArrowRight\">\u2192</button>\n      <button data-key=\"ArrowDown\">\u2193</button>\n    </div>\n    <div class=\"touchgroup\">\n      <button data-key=\"ArrowUp\">\u2191</button>\n      <button data-key=\"Space\">\u2605</button>\n    </div>\n  </div>\n  <div class=\"foot\">All original drawings are embedded inside this single HTML file. Works offline\u2014no extra artwork folder needed.</div>\n</div>\n";
 const iconStyle=nativeDocument.createElement('style');iconStyle.textContent=iconStyles;root.append(iconStyle);
 for(const [id,icon,label] of [['soundBtn','volume','Sound on'],['pauseBtn','pause','Pause'],['startBtn','play','Start Game'],['resumeBtn','play','Resume'],['againBtn','retry','Try Again']])setIconLabel(root.getElementById(id),icon,label);
 root.getElementById('soundBtn').setAttribute('aria-pressed','true');
 const introPrompt=root.querySelector('#menu .panel > p');introPrompt.textContent='Your game is getting ready.';introPrompt.setAttribute('role','status');
 const startButton=root.getElementById('startBtn');startButton.disabled=true;startButton.setAttribute('aria-busy','true');setIconLabel(startButton,'play','Getting ready…');
 setIconLabel(root.querySelector('#pausePanel h1'),'pause','Paused');
 for(const [key,label,icon,variant] of [['ArrowLeft','Move left','arrow','jems-icon--back'],['ArrowRight','Move right','arrow',''],['ArrowDown','Duck','arrow','jems-icon--down'],['ArrowUp','Jump','arrow','jems-icon--up'],['Space','Shield hop','shield','']]){
  const control=root.querySelector(`[data-key="${key}"]`);control.replaceChildren(createIcon(icon,variant));control.setAttribute('aria-label',label);
 }
 function run(document){

'use strict';

const $ = s=>document.querySelector(s);
const canvas = $('#game'), ctx = canvas.getContext('2d');
const W=canvas.width, H=canvas.height;
ctx.imageSmoothingEnabled = true;

const HERO_DEFS = [
  {id:'queen', label:'Queen', menu:'dragon_island_assets/queen.png', upper:'dragon_island_assets/queen_upper.png', legL:'dragon_island_assets/queen_leg_0.png', legR:'dragon_island_assets/queen_leg_1.png', color:'#7cb7ff'},
  {id:'king', label:'King', menu:'dragon_island_assets/king.png', upper:'dragon_island_assets/king_upper.png', legL:'dragon_island_assets/king_leg_0.png', legR:'dragon_island_assets/king_leg_1.png', color:'#ffb26d'},
  {id:'princess_wand', label:'Princess (Wand)', menu:'dragon_island_assets/princess_wand.png', upper:'dragon_island_assets/princess_wand_upper.png', legL:'dragon_island_assets/princess_wand_leg_0.png', legR:'dragon_island_assets/princess_wand_leg_1.png', color:'#d89aff'},
  {id:'princess_bow', label:'Princess (Bow)', menu:'dragon_island_assets/princess_bow.png', upper:'dragon_island_assets/princess_bow_upper.png', legL:'dragon_island_assets/princess_bow_leg_0.png', legR:'dragon_island_assets/princess_bow_leg_1.png', color:'#f3a3da'}
];
const SCENE_ASSETS = {
  dragon:'dragon_island_assets/dragon.png', castle:'dragon_island_assets/castle.png', camper:'dragon_island_assets/camper.png',
  f1:'dragon_island_assets/flower_one.png', f2:'dragon_island_assets/flower_two.png', f3:'dragon_island_assets/flower_three.png'
};
const processed = {};
function safeBest(){return window.FG.store.current().stats.dragon?.bestLevel||0}
function saveBest(score){}
let best = safeBest();
$('#bestHUD').textContent = best;

function sampleBg(data,w,h){
  let pts=[];
  for(let x=0;x<w;x+=Math.max(1,Math.floor(w/20))){ pts.push((0*w+x)*4); pts.push(((h-1)*w+x)*4);}
  for(let y=0;y<h;y+=Math.max(1,Math.floor(h/20))){ pts.push((y*w+0)*4); pts.push((y*w+w-1)*4);}
  let r=0,g=0,b=0,n=0;
  for(const i of pts){ const br=(data[i]+data[i+1]+data[i+2])/3; if(br>120){r+=data[i];g+=data[i+1];b+=data[i+2];n++;} }
  return n? [r/n,g/n,b/n] : [245,245,235];
}
function keyImage(img){
  const c=document.createElement('canvas'); c.width=img.naturalWidth; c.height=img.naturalHeight; const g=c.getContext('2d');
  g.drawImage(img,0,0);
  const id=g.getImageData(0,0,c.width,c.height); const d=id.data; const [br,bg,bb]=sampleBg(d,c.width,c.height);
  const w=c.width,h=c.height; const seen=new Uint8Array(w*h); const bgmask=new Uint8Array(w*h); const qx=[],qy=[];
  function maybePush(x,y){ if(x<0||y<0||x>=w||y>=h) return; const idx=y*w+x; if(seen[idx]) return; seen[idx]=1; const i=idx*4; const dr=d[i]-br,dg=d[i+1]-bg,db=d[i+2]-bb; const dist=Math.hypot(dr,dg,db); const bright=(d[i]+d[i+1]+d[i+2])/3;
    if(dist<62 && bright>115){ bgmask[idx]=1; qx.push(x); qy.push(y);} }
  for(let x=0;x<w;x++){ maybePush(x,0); maybePush(x,h-1);} for(let y=0;y<h;y++){ maybePush(0,y); maybePush(w-1,y);}
  for(let qi=0; qi<qx.length; qi++){
    const x=qx[qi], y=qy[qi]; maybePush(x+1,y); maybePush(x-1,y); maybePush(x,y+1); maybePush(x,y-1);
  }
  let minX=w,minY=h,maxX=0,maxY=0;
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    const idx=y*w+x; const i=idx*4; if(bgmask[idx]){ d[i+3]=0; continue; }
    if(d[i+3]>10){ if(x<minX)minX=x; if(y<minY)minY=y; if(x>maxX)maxX=x; if(y>maxY)maxY=y; }
  }
  g.putImageData(id,0,0);
  if(maxX<=minX||maxY<=minY) return c;
  const t=document.createElement('canvas'); t.width=maxX-minX+1; t.height=maxY-minY+1; t.getContext('2d').drawImage(c,minX,minY,t.width,t.height,0,0,t.width,t.height);
  return t;
}
function loadOne(src){
  return new Promise((resolve,reject)=>{
    const img = new Image(); img.onload=()=>resolve(img); img.onerror=reject; img.src=import.meta.env.BASE_URL+"assets/original-dragon/"+src.split("/").pop();
  });
}
async function loadAssets(){
  const all=[];
  for(const h of HERO_DEFS){ for(const k of ['menu','upper','legL','legR']) all.push([h.id+'_'+k,h[k]]); }
  for(const [k,v] of Object.entries(SCENE_ASSETS)) all.push([k,v]);
  await Promise.all(all.map(async ([key,src])=> processed[key]=await loadOne(src)));
}

let selected = 'queen';
let mode='loading',hostPaused=false;
let muted=false;
const keys={};
let clock; let jumpBuffer=0;
const clearInput=()=>{Object.keys(keys).forEach(k=>delete keys[k]);jumpBuffer=0};
listen('keydown',e=>{
  if(hostPaused||mode!=='playing')return;
  // Shadow events retarget to the host. Text/editor controls retain every key;
  // native sound/pause tools retain Space/Enter while movement and Escape keep
  // working after those buttons are used. Outside-game UI owns its own keys.
  const path=e.composedPath().filter(target=>target instanceof HTMLElement);
  if(path.some(target=>target.matches('input,textarea,select,[contenteditable]')))return;
  const control=path.find(target=>target.matches('button,a[href],summary'));
  const nativeControl=control&&root.contains(control)&&(['soundBtn','pauseBtn','resumeBtn'].includes(control.id)||control.matches('#touch button'));
  if(control&&(!nativeControl||['Space','Enter'].includes(e.code)))return;
  if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space'].includes(e.code))e.preventDefault();
  if(!e.repeat&&(e.code==='Space'||e.code==='ArrowUp'))jumpBuffer=.12;
  keys[e.code]=true;if(e.code==='Space')keys.Space=true;if(e.code==='Escape')pause();
});
listen('keyup',e=>{ keys[e.code]=false; if(e.code==='Space') keys.Space=false;});
document.querySelectorAll('#touch button').forEach(btn=>{
  const key=btn.dataset.key;
  const down=e=>{e.preventDefault(); if(hostPaused||mode!=='playing')return; if(key==='Space'||key==='ArrowUp')jumpBuffer=.12; keys[key]=true; if(key==='Space') keys.Space=true;};
  const up=e=>{e.preventDefault(); keys[key]=false; if(key==='Space') keys.Space=false;};
  btn.addEventListener('pointerdown',down); btn.addEventListener('pointerup',up); btn.addEventListener('pointerleave',up); btn.addEventListener('pointercancel',up);
  btn.addEventListener('keydown',e=>{if(e.code==='Space'||e.code==='Enter'){e.preventDefault();e.stopPropagation();if(!e.repeat)down(e);}});
  btn.addEventListener('keyup',e=>{if(e.code==='Space'||e.code==='Enter'){e.preventDefault();e.stopPropagation();up(e);}});
  btn.addEventListener('blur',up);
});

function playTone(freq=440,dur=.08,type='sine',vol=.04){ if(muted||!window.AudioContext) return; try{ const ac=playTone.ac||(playTone.ac=new AudioContext()); const o=ac.createOscillator(), gn=ac.createGain(); o.type=type; o.frequency.value=freq; gn.gain.value=vol; o.connect(gn); gn.connect(ac.destination); o.start(); gn.gain.exponentialRampToValueAtTime(0.0001,ac.currentTime+dur); o.stop(ac.currentTime+dur); }catch(e){} }

const game={ level:1, levelSeed:null, bg:null, islandHP:100, dragonHP:3, dragonMax:3, dragonX:1010, dragonY:338, dragonFireT:0, dragonHurt:0, caveOpen:1, heroes:[], fireballs:[], sparks:[], sauceDrops:[], cracks:[], toastT:0, timer:0, loseT:0, victoryT:0, leader:null };

function rrange(a,b){ return a + Math.random()*(b-a); }
function irange(a,b){ return Math.floor(rrange(a,b+1)); }
function randomBg(){
  const sky = `hsl(${irange(195,210)} ${irange(65,85)}% ${irange(80,90)}%)`;
  const hill = `hsl(${irange(92,110)} ${irange(35,50)}% ${irange(62,72)}%)`;
  const hill2 = `hsl(${irange(98,112)} ${irange(40,55)}% ${irange(55,67)}%)`;
  const sunX = irange(100,260), sunY=irange(90,180), sunR=irange(42,64);
  const clouds = Array.from({length:5+irange(0,2)},()=>({x:rrange(40,W-200),y:rrange(60,210),s:rrange(.7,1.45)}));
  const flowers = [
    {key:'f1',x:rrange(730,890),scale:rrange(.70,1.0)},
    {key:'f2',x:rrange(840,980),scale:rrange(.72,1.0)},
    {key:'f3',x:rrange(920,1080),scale:rrange(.78,1.05)}
  ];
  return {sky,hill,hill2,sunX,sunY,sunR,clouds,castleX:rrange(420,560),castleScale:rrange(.72,.95),camperX:rrange(55,150),camperScale:rrange(.55,.72),flowers};
}
function buildHeroes(){
  const order = HERO_DEFS.slice();
  const chosenIndex = order.findIndex(h=>h.id===selected);
  const arranged=[order[chosenIndex], ...order.filter(h=>h.id!==selected)];
  const offsets=[0,-88,82,160];
  return arranged.map((def,i)=>({ def, isPlayer:i===0, x:300+offsets[i], y:548, vx:0, vy:0, grounded:true, jumpCooldown:0, walkT:Math.random()*10, facing:1, jumpGlow:0, bob:0, sauce:0 }));
}
function showToast(txt,t=1.7){ const el=$('#toast'); el.textContent=txt; el.classList.remove('hidden'); game.toastT=t; }
function setMode(m){ mode=m; setIconLabel($('#pauseBtn'),m==='pause'?'play':'pause',m==='pause'?'Resume':'Pause'); $('#menu').classList.toggle('hidden',m!=='menu'); $('#pausePanel').classList.toggle('hidden',m!=='pause'); $('#victoryPanel').classList.toggle('hidden',m!=='victoryPanel'); $('#losePanel').classList.toggle('hidden',m!=='losePanel'); clock?.invalidate(); }
function startGame(resetLevel=true){ if(hostPaused||mode==='loading')return; clock?.resume('user'); clearInput(); if(resetLevel){ game.level=1; } game.levelSeed=Math.random(); game.bg=randomBg(); game.heroes=buildHeroes(); game.leader=game.heroes[0]; startLevel(game.level); setMode('playing'); }
function startLevel(lv){ game.timer=0; game.islandHP=host.config.groundResilience; game.dragonMax = Math.min(6, 2 + Math.floor((lv-1)/2)); game.dragonHP = game.dragonMax; game.dragonX=1035; game.dragonY=342; game.dragonFireT=2.2; game.fireballs=[]; game.sparks=[]; game.sauceDrops=[]; game.cracks=[]; game.loseT=0; game.victoryT=0; game.bg=randomBg(); game.heroes.forEach((h,idx)=>{ h.x=300+idx*78; h.y=548; h.previousX=h.x; h.previousY=h.y; h.vx=0; h.vy=0; h.grounded=true; h.jumpCooldown=0; h.sauce=0; }); updateHUD(); showToast('Level '+lv+'!'); playTone(660,.11,'triangle'); }
function updateHUD(){ $('#heroHUD').textContent = HERO_DEFS.find(h=>h.id===selected).label; $('#levelHUD').textContent = 'Level '+game.level; $('#islandHUD').textContent = Math.max(0,Math.round(game.islandHP))+'%'; $('#dragonBar').style.width = (100*game.dragonHP/game.dragonMax)+'%'; $('#bestHUD').textContent = best; }
function pause(){ clearInput(); if(mode==='playing'){setMode('pause'); clock?.pause('user');} }
function resume(){if(hostPaused)return;if(mode==='pause'){clearInput();clock?.resume('user');setMode('playing');}}
$('#pauseBtn').onclick=()=>{ if(mode==='playing') pause(); else if(mode==='pause') resume(); };
$('#resumeBtn').onclick=resume;
$('#againBtn').onclick=()=>{ startGame(true); };
$('#pickBtn').onclick=()=>{ mode='menu'; setMode('menu'); };
$('#soundBtn').onclick=()=>{ muted=!muted; setIconLabel($('#soundBtn'),'volume',muted?'Sound off':'Sound on'); $('#soundBtn').setAttribute('aria-pressed',String(!muted)); };

function makeHeroCard(def){
  const card=document.createElement('button'); card.type='button'; card.className='heroCard'+(def.id===selected?' selected':'');
  card.setAttribute('aria-label','Choose '+def.label); card.setAttribute('aria-pressed',String(def.id===selected));
  const cv=document.createElement('canvas'); cv.width=130; cv.height=120; card.append(cv);
  const g=cv.getContext('2d');
  const img=processed[def.id+'_menu'];
  if(img){ const s=Math.min(cv.width/img.width,cv.height/img.height)*0.9; const w=img.width*s,h=img.height*s; g.drawImage(img,(cv.width-w)/2,(cv.height-h)/2,w,h); }
  const title=document.createElement('strong'); title.textContent=def.label; card.append(title);
  const sub=document.createElement('div'); sub.textContent='You control this hero'; sub.style.fontWeight='900'; sub.style.fontSize='13px'; card.append(sub);
  card.onclick=()=>{ selected=def.id; renderHeroCards(); $('#heroCards').querySelector('[aria-pressed="true"]')?.focus({preventScroll:true}); };
  return card;
}
function renderHeroCards(){ const box=$('#heroCards'); box.innerHTML=''; HERO_DEFS.forEach(def=>box.append(makeHeroCard(def))); [...box.children].forEach((el,i)=>el.classList.toggle('selected', HERO_DEFS[i].id===selected)); }
$('#startBtn').onclick=()=>{ startGame(true); };

function heroShieldActive(hero){ return hero.isPlayer && (!hero.grounded || keys.Space || hero.jumpGlow>0); }
function jumpHero(hero,boost=11.8){ if(hero.grounded && hero.jumpCooldown<=0){ hero.vy=-boost; hero.grounded=false; hero.jumpCooldown=.25; hero.jumpGlow=.35; playTone(hero.isPlayer?620:560,.07,'square',0.03); } }
function spawnFireball(){
  // A true vertical launch first; then the fireball floats toward a reachable landing zone.
  // It does NOT directly target or hit the hero at launch.
  const mx=game.dragonX-120, my=game.dragonY+15;
  const heroX=game.leader?game.leader.x:400;
  const landingX=Math.max(190,Math.min(820,heroX+rrange(-90,100)));
  game.fireballs.push({x:mx,y:my,vx:0,vy:-7.8,r:17,reflected:false,ttl:10,trail:[],phase:'rise',riseFrames:35,targetX:landingX});
  playTone(210,.12,'sawtooth',0.03);
}
function reflectBall(ball,hero){
  ball.reflected=true; const tx=game.dragonX-110, ty=game.dragonY-20; const dx=tx-ball.x, dy=ty-ball.y; const mag=Math.hypot(dx,dy)||1; ball.vx=dx/mag*7.4; ball.vy=dy/mag*7.4; hero.vy=Math.min(hero.vy,-8.6); hero.jumpGlow=.38; for(let i=0;i<10;i++) game.sparks.push({x:ball.x,y:ball.y,vx:rrange(-2.5,2.5),vy:rrange(-2.2,1),life:.45,color:'#ffe15d'}); playTone(790,.12,'triangle',0.04);
}
function damageDragon(){ game.dragonHP--; game.dragonHurt=.28; playTone(190,.18,'square',0.05); for(let i=0;i<18;i++) game.sparks.push({x:game.dragonX-130,y:game.dragonY+10,vx:rrange(-4,2),vy:rrange(-3,3),life:.6,color:['#ff6f6f','#ffd44d','#fff6aa'][i%3]}); if(game.dragonHP<=0){ best=Math.max(best, game.level); saveBest(best); updateHUD(); mode='victory'; game.victoryT=2.3; $('#victoryText').textContent='You beat Dragon Level '+game.level+'!'; setMode('victoryPanel'); host.finish({won:true,level:game.level,title:'Island rescued!',description:'Your shield reflected the fireballs. The island is safe.'}); }}
function damageIsland(x){ const damage=Math.min(34,23 + 2*(game.level-1)); game.islandHP=Math.max(0,game.islandHP-damage); game.cracks.push({x,life:99,size:rrange(25,65)}); updateHUD(); playTone(120,.1,'triangle',0.04); if(game.islandHP<=0){ mode='loseAnim'; game.loseT=2.5; for(let i=0;i<90;i++) game.sauceDrops.push({x:rrange(40,W-40),y:rrange(-H*0.2,60),vy:rrange(4,9),len:rrange(20,70),w:rrange(8,22),life:3}); }}

function update(dt){
  for(const object of [...game.heroes,...game.fireballs]){object.previousX=object.x;object.previousY=object.y;}
  jumpBuffer=Math.max(0,jumpBuffer-dt);
  if(game.toastT>0){ game.toastT-=dt; if(game.toastT<=0) $('#toast').classList.add('hidden'); }
  if(mode==='playing'){
    game.timer+=dt; updateHUD();
    const leader=game.heroes[0];
    if(keys.ArrowLeft) { leader.vx=Math.max(leader.vx-0.8,-4.2); leader.facing=-1; }
    if(keys.ArrowRight){ leader.vx=Math.min(leader.vx+0.8,4.2); leader.facing=1; }
    if(!keys.ArrowLeft && !keys.ArrowRight) leader.vx*=0.82;
    if((keys.ArrowUp||keys.Space||jumpBuffer>0) && leader.grounded){jumpHero(leader,12.1);jumpBuffer=0;}
    if(keys.ArrowDown && !leader.grounded) leader.vy += 0.25;

    // Companions are visible friends, but cannot jump into fireballs or repair the island.
    game.heroes.forEach((h,i)=>{
      if(i>0){ const targetX = leader.x + [-80,80,155][i-1]; const dx=targetX-h.x; h.vx += Math.max(-0.25,Math.min(0.25,dx*0.03)); h.facing = dx>=0 ? 1 : -1; }
      h.vx*=0.92;
      h.vy += 0.55;
      h.x += h.vx; h.y += h.vy;
      h.x = Math.max(110, Math.min(870, h.x));
      if(h.y>=548){ h.y=548; h.vy=0; h.grounded=true; } else h.grounded=false;
      h.jumpCooldown=Math.max(0,h.jumpCooldown-dt); h.jumpGlow=Math.max(0,h.jumpGlow-dt); h.walkT += dt*(1+Math.abs(h.vx));
    });

    game.dragonFireT -= dt;
    if(game.dragonFireT<=0){ spawnFireball(); game.dragonFireT = Math.max(1.9,2.85 - (game.level-1)*0.11)/host.config.fireballCadence; }
    game.dragonX = 1050 - 60*Math.sin(game.timer*0.6)**2 - 28*game.dragonHurt;
    game.dragonHurt=Math.max(0, game.dragonHurt-dt*1.7);

    for(let i=game.fireballs.length-1;i>=0;i--){
      const b=game.fireballs[i]; b.ttl-=dt; b.trail.push([b.x,b.y]); if(b.trail.length>10) b.trail.shift();
      if(!b.reflected){
        if(b.phase==='rise'){
          b.y += b.vy; b.riseFrames--;
          if(b.riseFrames<=0){ b.phase='fall'; b.vy=1.8; b.vx=(b.targetX-b.x)/62; }
        } else {
          b.vy += 0.21; b.x += b.vx; b.y += b.vy;
        }
      }
      else { b.x += b.vx; b.y += b.vy; } // Shield return travels directly toward the dragon.

      // The selected player alone can reflect a fireball with a jump/shield.
      const h=game.leader; const dx=b.x-h.x, dy=b.y-(h.y-42); const rad=host.config.shieldRadius;
      if(!b.reflected && heroShieldActive(h) && dx*dx+dy*dy < (rad+b.r)*(rad+b.r)){ reflectBall(b,h); }
      // hit dragon
      if(b.reflected && b.x>game.dragonX-210 && b.x<game.dragonX-25 && b.y>game.dragonY-120 && b.y<game.dragonY+125){ game.fireballs.splice(i,1); damageDragon(); continue; }
      // land on island
      if(!b.reflected && b.y+b.r>=548 && b.x>75 && b.x<1135){ game.fireballs.splice(i,1); damageIsland(b.x); continue; }
      if(b.ttl<=0 || b.y>H+40 || b.x<-40 || b.x>W+40){ game.fireballs.splice(i,1); }
    }
    for(let i=game.sparks.length-1;i>=0;i--){ const s=game.sparks[i]; s.x+=s.vx; s.y+=s.vy; s.vy+=0.08; s.life-=dt; if(s.life<=0) game.sparks.splice(i,1); }
  } else if(mode==='victoryPanel'){
    // Shared result/math overlay owns advancement.
  } else if(mode==='loseAnim'){
    game.loseT -= dt;
    game.sauceDrops.forEach(d=>{ d.y += d.vy; });
    game.heroes.forEach(h=>{ h.sauce = Math.min(1, h.sauce + dt*0.5); h.vx*=0.9; });
    if(game.loseT<=0){ mode='losePanel'; $('#loseScore').textContent='You reached level '+game.level+'.'; setMode('losePanel'); host.finish({won:false,level:game.level,title:'Sauce storm!',description:game.cracks.length+' missed fireballs damaged the island. Jump into a falling fireball with your shield.'}); best=Math.max(best,game.level-1); saveBest(best); updateHUD(); }
  }
}

function drawCloud(x,y,s,redness=0){ ctx.save(); ctx.translate(x,y); ctx.scale(s,s); ctx.fillStyle=redness?`rgba(${230+redness*12},${230-redness*110},${235-redness*120},0.95)`:'rgba(255,255,255,0.72)'; for(const p of [[0,20,36],[35,0,46],[80,16,39],[118,22,30]]){ ctx.beginPath(); ctx.arc(p[0],p[1],p[2],0,Math.PI*2); ctx.fill(); } ctx.restore(); }
function drawScene(){
  // sky
  ctx.fillStyle = game.bg.sky; ctx.fillRect(0,0,W,H);
  // sun and clouds
  ctx.fillStyle='#f1d269'; ctx.beginPath(); ctx.arc(game.bg.sunX,game.bg.sunY,game.bg.sunR,0,Math.PI*2); ctx.fill(); ctx.strokeStyle='#f8d35a'; ctx.lineWidth=5; for(let a=0;a<Math.PI*2;a+=Math.PI/6){ ctx.beginPath(); ctx.moveTo(game.bg.sunX+Math.cos(a)*(game.bg.sunR+14),game.bg.sunY+Math.sin(a)*(game.bg.sunR+14)); ctx.lineTo(game.bg.sunX+Math.cos(a)*(game.bg.sunR+32),game.bg.sunY+Math.sin(a)*(game.bg.sunR+32)); ctx.stroke(); }
  game.bg.clouds.forEach(c=>drawCloud(c.x,c.y,c.s, mode==='loseAnim'||mode==='losePanel'? 1 : 0));
  // hills
  ctx.fillStyle=game.bg.hill; ctx.beginPath(); ctx.ellipse(410,550,390,95,0,Math.PI,0,true); ctx.fill();
  ctx.fillStyle=game.bg.hill2; ctx.beginPath(); ctx.ellipse(710,560,430,88,0,Math.PI,0,true); ctx.fill();
  // camper, castle, flowers
  function drawAsset(key,x,y,scale,center=false){ const im=processed[key]; if(!im) return; const w=im.width*scale,h=im.height*scale; const dx=center?x-w/2:x; const dy=y-h; ctx.drawImage(im,dx,dy,w,h); }
  drawAsset('camper',game.bg.camperX,548,game.bg.camperScale);
  drawAsset('castle',game.bg.castleX,545,game.bg.castleScale);
  game.bg.flowers.forEach(f=>drawAsset(f.key,f.x,553,f.scale));

  // cave cliff
  ctx.fillStyle='#7b7b89'; ctx.beginPath(); ctx.moveTo(945,560); ctx.lineTo(1138,560); ctx.lineTo(1198,342); ctx.lineTo(1198,560); ctx.lineTo(1200,700); ctx.lineTo(930,700); ctx.closePath(); ctx.fill();
  ctx.fillStyle='#434557'; ctx.beginPath(); ctx.ellipse(1090,464,110,145,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#2d2f3f'; ctx.beginPath(); ctx.ellipse(1090,464,84,112,0,0,Math.PI*2); ctx.fill();
  // island top and underside
  const segW=88,startX=72,topY=548;
  for(let i=0;i<12;i++){
    const x=startX+i*segW; const cracked=game.cracks.some(c=>Math.abs(c.x-(x+segW/2))<55);
    ctx.fillStyle='#81c45f'; ctx.beginPath(); ctx.moveTo(x,topY); ctx.lineTo(x+segW-8,topY); ctx.lineTo(x+segW-14,topY+22); ctx.lineTo(x+7,topY+22); ctx.closePath(); ctx.fill();
    ctx.fillStyle='#a8794d'; ctx.beginPath(); ctx.moveTo(x+2,topY+22); ctx.lineTo(x+segW-14,topY+22); ctx.lineTo(x+segW-18,topY+118); ctx.lineTo(x+segW-42,topY+136); ctx.lineTo(x+10,topY+112); ctx.closePath(); ctx.fill();
    ctx.strokeStyle='#6f4f33'; ctx.lineWidth=2; ctx.stroke();
    ctx.strokeStyle='#5ca447'; ctx.beginPath(); for(let gx=x+8;gx<x+segW-18;gx+=18){ ctx.moveTo(gx,topY+10); ctx.lineTo(gx+6,topY+15); ctx.lineTo(gx+12,topY+10);} ctx.stroke();
    if(cracked){ ctx.strokeStyle='#243047'; ctx.lineWidth=4; ctx.beginPath(); ctx.moveTo(x+segW*0.55,topY+5); ctx.lineTo(x+segW*0.49,topY+24); ctx.lineTo(x+segW*0.57,topY+41); ctx.lineTo(x+segW*0.44,topY+62); ctx.stroke(); }
  }
  // red sauce rain on lose
  if(mode==='loseAnim'||mode==='losePanel'){
    ctx.save(); ctx.globalAlpha=.94;
    for(const d of game.sauceDrops){ ctx.strokeStyle='#e93f45'; ctx.lineWidth=d.w; ctx.lineCap='round'; ctx.beginPath(); ctx.moveTo(d.x,d.y-d.len); ctx.lineTo(d.x,d.y); ctx.stroke(); ctx.fillStyle='#cf252d'; ctx.beginPath(); ctx.arc(d.x,d.y, d.w*0.45,0,Math.PI*2); ctx.fill(); }
    ctx.restore();
  }
}
function drawDragon(){
  const im=processed.dragon; if(!im) return; const scale=0.62; const w=im.width*scale,h=im.height*scale; ctx.save(); ctx.translate(game.dragonX,game.dragonY+(game.dragonHurt? -10: Math.sin(game.timer*1.8)*4)); ctx.scale(-1,1); ctx.drawImage(im,-w/2,-h/2,w,h); ctx.restore();
}
function drawHero(hero){
  const def=hero.def, upper=processed[def.id+'_upper'], legL=processed[def.id+'_legL'], legR=processed[def.id+'_legR'];
  if(!upper) return;
  // Every segment retains the ORIGINAL photo's pixel-coordinate system.  Rotating each
  // leg around its traced hip gives real hinge motion without a detached/paper-doll look.
  const subjectCenter={queen:382,king:151,princess_wand:145,princess_bow:160}[def.id];
  const hipPositions={queen:[[346,520],[408,518]],king:[[120,490],[172,491]],princess_wand:[[115,413],[184,413]],princess_bow:[[123,402],[195,402]]}[def.id];
  const imageH=upper.height;
  const s=158/imageH;
  const x=hero.x, y=hero.y;
  const speed=Math.min(1,Math.abs(hero.vx)/2.8);
  const stride=Math.sin(hero.walkT*8)*0.42*speed;
  const bounce=Math.sin(hero.walkT*8)*1.1*speed;
  ctx.save(); ctx.translate(x,y);
  ctx.globalAlpha=.15; ctx.fillStyle='#27334d';ctx.beginPath();ctx.ellipse(0,5,24,6,0,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
  // Only the selected hero has a shield. The friends are visual companions.
  if(hero.isPlayer){
    ctx.strokeStyle=heroShieldActive(hero)?'rgba(255,235,103,.98)':'rgba(242,242,178,.38)';
    ctx.fillStyle='rgba(255,255,255,.045)';
    ctx.lineWidth=heroShieldActive(hero)?4:2;
    ctx.beginPath(); ctx.ellipse(0,-82,44,80,0,0,Math.PI*2);ctx.fill();ctx.stroke();
  }
  function limb(im,hip,angle){
    if(!im) return;
    const hx=(hip[0]-subjectCenter)*s, hy=(hip[1]-imageH)*s;
    ctx.save(); ctx.translate(hx,hy); ctx.rotate(angle);
    // Place the segment with its original in-photo hip at the rotation origin.
    ctx.drawImage(im,-hip[0]*s,-hip[1]*s,im.width*s,im.height*s);
    ctx.restore();
  }
  limb(legL,hipPositions[0],stride);
  limb(legR,hipPositions[1],-stride);
  ctx.save();ctx.translate(0,bounce);
  ctx.rotate(!hero.grounded ? -hero.vy*0.006: stride*0.08);
  ctx.drawImage(upper,-subjectCenter*s,-imageH*s,upper.width*s,upper.height*s);
  ctx.restore();
  if(hero.isPlayer){ctx.fillStyle='#ffe46f';ctx.strokeStyle='#243451';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,-175);ctx.lineTo(-12,-153);ctx.lineTo(12,-153);ctx.closePath();ctx.fill();ctx.stroke();}
  if(hero.sauce>0){
    ctx.fillStyle=`rgba(205,40,44,${hero.sauce*0.62})`;
    ctx.beginPath();ctx.ellipse(0,-81,30,65,0,0,Math.PI*2);ctx.fill();
    for(let i=0;i<5;i++){ctx.beginPath();ctx.arc(-20+i*10,-45+(i%2)*8,10,0,Math.PI*2);ctx.fill();}
  }
  ctx.restore();
}
function drawFireballs(){
  for(const b of game.fireballs){
    for(let j=0;j<b.trail.length;j++){ const p=b.trail[j], a=(j+1)/b.trail.length*0.25; ctx.fillStyle=b.reflected?`rgba(255,228,95,${a})`:`rgba(255,108,72,${a})`; ctx.beginPath(); ctx.arc(p[0],p[1], b.r*(0.35+j/b.trail.length*0.45),0,Math.PI*2); ctx.fill(); }
    ctx.fillStyle = b.reflected ? '#ffe150' : '#ff7e55'; ctx.strokeStyle=b.reflected ? '#ffea8a' : '#ffcc70'; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(b.x,b.y,b.r,0,Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = b.reflected ? '#fff7c4' : '#ffd06e'; ctx.beginPath(); ctx.arc(b.x-4,b.y-4,b.r*0.38,0,Math.PI*2); ctx.fill();
  }
  for(const s of game.sparks){ ctx.fillStyle=s.color; ctx.globalAlpha=Math.max(0,s.life/0.6); ctx.fillRect(s.x,s.y,4,4); ctx.globalAlpha=1; }
}
function drawUIState(){
  if(mode==='victory'){ ctx.fillStyle='rgba(255,255,255,.16)'; ctx.fillRect(0,0,W,H); for(let i=0;i<24;i++){ const x=(i*49+game.timer*140)%W; const y=120+Math.sin(i+game.timer*5)*38; ctx.fillStyle=['#ffdf63','#ff91a1','#95d8ff','#abf1a7'][i%4]; ctx.fillRect(x,y,8,18); }}
}
function render(alpha=1){
  const moved=[...game.heroes,...game.fireballs].map(o=>({o,x:o.x,y:o.y}));
  if(mode==='playing')for(const {o,x,y} of moved){o.x=(o.previousX??x)+(x-(o.previousX??x))*alpha;o.y=(o.previousY??y)+(y-(o.previousY??y))*alpha;}
  ctx.clearRect(0,0,W,H);drawScene();drawDragon();game.heroes.forEach(h=>drawHero(h));drawFireballs();drawUIState();
  for(const {o,x,y} of moved){o.x=x;o.y=y;}
}
clock=createFixedClock({update,render,onPause:()=>{clearInput();playTone.ac?.suspend().catch(()=>{});host.emit?.({type:'pause',name:'dragon'});if(!hostPaused)pause();},onResume:()=>{clearInput();playTone.ac?.resume().catch(()=>{});host.emit?.({type:'resume',name:'dragon'});}});

(async function init(){
  renderHeroCards();
  await loadAssets(); if(!alive)return;
  renderHeroCards();
  game.bg=randomBg(); game.heroes=buildHeroes(); game.leader=game.heroes[0];
  setMode('menu'); mode='menu';
  clock.start();
  introPrompt.textContent='Pick your hero!';setIconLabel(startButton,'play','Start Game');startButton.removeAttribute('aria-busy');startButton.disabled=false;
})().catch(()=>{if(alive){introPrompt.textContent='The artwork could not load. Go back and reopen this game.';startButton.textContent='Game unavailable';startButton.removeAttribute('aria-busy');startButton.disabled=true;}});

this.isPlaying=()=>alive&&mode==='playing'&&!hostPaused&&!clock.paused;this.pause=()=>{if(!alive||hostPaused)return false;hostPaused=true;clearInput();clock.pause('host');return true;};this.resume=()=>{if(!hostPaused)return;hostPaused=false;clearInput();clock.resume('host');};this.next=()=>{clock.resume('user');clearInput();game.level++;startLevel(game.level);setMode('playing')};this.restart=()=>{clock.resume('user');clearInput();startLevel(game.level);setMode('playing')};this.snapshot=()=>({level:game.level,mode,time:game.timer,paused:clock.paused,clock:clock.stats,islandHP:game.islandHP,dragonHP:game.dragonHP,player:game.leader,fireballs:game.fireballs,cracks:game.cracks.length,assets:Object.keys(processed).length});this.unmount=()=>{alive=false;clock.dispose();clearInput();cancelAnimationFrame(raf);listeners.forEach(([t,f])=>window.removeEventListener(t,f));timers.forEach(clearTimeout);playTone.ac?.close();mount.replaceChildren()};
}
run.call(this,scopeDocument);
}
}
