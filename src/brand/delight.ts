import {createJourneyRankThumbnail,type JourneyCharacter} from './journey';
/** Non-blocking, brand-specific celebrations for real accomplishments only.
 * No scores, child names, attention telemetry, rewards, network calls or persisted badges. */
export type JemMilestone = 'idea' | 'playable' | 'kept' | 'copied' | 'practice' | 'gem-cut' | 'gem-polished' | 'builder-maker' | 'builder-cut' | 'builder-polished' | 'builder-master';
const messages:Record<JemMilestone,string> = {
  idea: 'Your idea is saved!',
  playable: 'Your new game test is ready!',
  kept: 'You made this version yours!',
  copied: 'Your new jem is saved!',
  practice: 'You worked it out!',
  'gem-cut': 'A new facet! You tested your idea.',
  'gem-polished': 'Your jem shines! You kept an improvement.',
  'builder-maker': 'Gem Maker',
  'builder-cut': 'Gem Cutter',
  'builder-polished': 'Gem Polisher',
  'builder-master': 'Gem Master'
};
const names=Object.keys(messages) as JemMilestone[];
const levels:Partial<Record<JemMilestone,number>>={'builder-maker':1,'builder-cut':2,'builder-polished':3,'builder-master':4};
export type JemCelebrationArtwork={character?:JourneyCharacter|null;level?:number};
/** Call only after the underlying user action is verified and durably saved. */
export function celebrateJem(kind:JemMilestone,anchorId?:string,artwork:JemCelebrationArtwork={}):void {
  window.dispatchEvent(new CustomEvent('jems:milestone',{detail:{kind,anchorId,...artwork}}));
}
export function installJemsDelight():void {
  if(document.getElementById('jems-delight-host'))return;
  const host=document.createElement('div');
  host.id='jems-delight-host';host.className='jems-delight-host';
  host.setAttribute('aria-label','Small celebration');
  document.body.append(host);
  const last=new Map<JemMilestone,number>();
  let timer:ReturnType<typeof setTimeout>|undefined;
  const offsets=[[-69,-27],[-48,-82],[4,-105],[69,-70],[88,0],[44,55],[-28,63],[-92,19]];
  const colors=['blue','gold','mint','purple','coral','gold','purple','blue'];
  const clear=()=>{if(timer!==undefined)clearTimeout(timer);host.replaceChildren();};
  window.addEventListener('factory-profile',()=>{clear();last.clear();});
  // A successful cosmetic change must not leave the previous human in an
  // already visible celebration. It does not replay or alter an achievement.
  window.addEventListener('jems:maker-changed',clear);
  window.addEventListener('jems:milestone',(raw)=>{
    const detail=(raw as CustomEvent<{kind?:string;anchorId?:string;character?:string;level?:number}>).detail;
    if(!detail||!names.includes(detail.kind as JemMilestone))return;
    // A fitted game keeps its controls visible. Durable progress is recorded by
    // the source before this cosmetic event; suppressed artwork is not replayed.
    if(document.body.classList.contains('studio-playing'))return;
    const kind=detail.kind as JemMilestone, now=Date.now();
    if(now-(last.get(kind)||0)<1600||document.visibilityState==='hidden')return;
    last.set(kind,now);
    clear();
    const toast=document.createElement('div');
    toast.className='jems-delight-toast';
    toast.dataset.kind=kind;
    toast.setAttribute('role','status');
    toast.setAttribute('aria-live','polite');
    toast.setAttribute('aria-atomic','true');
    const unlockedLevel=levels[kind],character=detail.character==='spark'||detail.character==='nova'?detail.character:null;
    const suppliedLevel=typeof detail.level==='number'&&Number.isInteger(detail.level)&&detail.level>=1&&detail.level<=4?detail.level:undefined;
    const projectLevel=kind==='gem-cut'?2:kind==='gem-polished'?3:undefined;
    // A new project facet does not put an already experienced maker in an older outfit.
    const level=unlockedLevel??suppliedLevel??projectLevel;
    if(level){
      toast.classList.add('has-rank-thumbnail');toast.classList.toggle('is-level-up',!!unlockedLevel);toast.dataset.level=String(level);
      const art=createJourneyRankThumbnail(character,level);
      const copy=document.createElement('span');copy.className='jems-delight-copy';
      const kicker=document.createElement('small');kicker.textContent=unlockedLevel?'Level '+unlockedLevel+' unlocked':'Your making journey';
      const label=document.createElement('strong');label.textContent=messages[kind];copy.append(kicker,label);
      toast.append(art,copy);
    }else{
      const emblem=document.createElement('img');
      emblem.src='./jems-mark.svg';emblem.alt='';emblem.setAttribute('aria-hidden','true');
      const label=document.createElement('span');label.textContent=messages[kind];toast.append(emblem,label);
    }
    host.append(toast);
    // Ambient geometry never blocks controls, steals focus or pauses the game.
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(!reduced){
      const id=detail.anchorId;
      const anchor=typeof id==='string'&&/^[a-zA-Z][\w-]{0,64}$/.test(id)?document.getElementById(id):null;
      const bounds=anchor?.getBoundingClientRect();
      const x=bounds&&bounds.width>0&&bounds.top<innerHeight&&bounds.bottom>0?
        Math.min(innerWidth-40,Math.max(40,bounds.left+bounds.width/2)):innerWidth/2;
      const y=bounds&&bounds.height>0&&bounds.top<innerHeight&&bounds.bottom>0?
        Math.min(innerHeight-85,Math.max(75,bounds.top+bounds.height/2)):innerHeight*.38;
      const sparks=document.createElement('div');sparks.className='jems-delight-sparks';
      sparks.style.left=x+'px';sparks.style.top=y+'px';sparks.setAttribute('aria-hidden','true');
      offsets.forEach(([dx,dy],i)=>{
        const piece=document.createElement('span');
        piece.className='jems-delight-piece jems-delight-'+colors[i]+(i%3===0?' is-spark':' is-facet');
        piece.style.setProperty('--x',dx+'px');
        piece.style.setProperty('--y',dy+'px');
        piece.style.setProperty('--rotation',((i%2?1:-1)*(55+i*17))+'deg');
        piece.style.animationDelay=(i*20)+'ms';
        sparks.append(piece);
      });
      host.append(sparks);
    }
    timer=setTimeout(()=>{host.replaceChildren();timer=undefined;},unlockedLevel?3600:2600);
  });
}
