/** Non-blocking, brand-specific celebrations for real accomplishments only.
 * No scores, child names, attention telemetry, rewards, network calls or persisted badges. */
export type JemMilestone = 'idea' | 'playable' | 'kept' | 'copied' | 'practice';
const messages:Record<JemMilestone,string> = {
  idea: 'Your idea is saved!',
  playable: 'Your new game test is ready!',
  kept: 'You made this version yours!',
  copied: 'Your new jem is saved!',
  practice: 'You worked it out!'
};
const names:readonly JemMilestone[] = ['idea','playable','kept','copied','practice'];
/** Call only after the underlying user action is verified and durably saved. */
export function celebrateJem(kind:JemMilestone,anchorId?:string):void {
  window.dispatchEvent(new CustomEvent('jems:milestone',{detail:{kind,anchorId}}));
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
  window.addEventListener('factory-profile',clear);
  window.addEventListener('jems:milestone',(raw)=>{
    const detail=(raw as CustomEvent<{kind?:string;anchorId?:string}>).detail;
    if(!detail||!names.includes(detail.kind as JemMilestone))return;
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
    const emblem=document.createElement('img');
    emblem.src='./jems-mark.svg';emblem.alt='';emblem.setAttribute('aria-hidden','true');
    const label=document.createElement('span');label.textContent=messages[kind];
    toast.append(emblem,label);host.append(toast);
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
    timer=setTimeout(()=>{host.replaceChildren();timer=undefined;},2600);
  });
}
