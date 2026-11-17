import type { LearningContext } from './types';

interface PreviewLearningOptions extends LearningContext {
  channel:string; artifactId:string; ownerId:string;
  onRound?:(result:{won:boolean;score:number})=>void;
  onReadyChange?:(ready:boolean)=>void;
}
type PreviewEvent = {event:'round-complete'|'math-checkpoint';roundId:number;checkpointId?:number;won?:boolean;score?:number};
const boundedId=(value:unknown):value is number=>Number.isInteger(value)&&(value as number)>=1&&(value as number)<=1_000_000;
/** The trusted host owns math. The iframe stays inert until its reviewed renderer
 * confirms the learning protocol; old archives are preserved, never silently upgraded. */
export function attachPreviewLearning(frame:HTMLIFrameElement,options:PreviewLearningOptions) {
  const FG=(window as any).FG,seen=new Set<string>();
  let instanceId=crypto.randomUUID(),alive=true,ready=false,cover:HTMLDivElement|null=null,waiting=false,waitingRound=0,pendingRound:PreviewEvent|null=null;
  let handshakeTimer:ReturnType<typeof setTimeout>|undefined;
  let protocolError:string|null=null,connectionPaused=false;
  const parent=frame.parentElement!,oldPosition=parent.style.position;
  parent.style.position='relative';
  const owns=()=>alive&&options.ownerId===FG.store.current().id;
  const visible=()=>frame.isConnected&&frame.getClientRects().length>0;
  const notifyReady=()=>options.onReadyChange?.(alive&&ready&&!waiting);
  function tell(action:'connect'|'pause'|'resume',focus=false) {
    frame.contentWindow?.postMessage({type:'factory-learning',channel:options.channel,artifactId:options.artifactId,action,...(focus?{focus:true}:{})},'*');
  }
  function makeCover(){
    if(cover)return cover;
    cover=document.createElement('div');cover.className='learning-preview-cover';cover.setAttribute('role','region');cover.setAttribute('aria-label','Game learning');parent.append(cover);return cover;
  }
  function inert(){frame.inert=true;frame.style.pointerEvents='none';}
  function release(restoreFocus=false){
    cover?.remove();cover=null;frame.inert=false;frame.style.pointerEvents='';waiting=false;waitingRound=0;
    notifyReady();
    if(owns()&&ready){tell('resume',restoreFocus&&visible());if(restoreFocus&&visible())frame.focus({preventScroll:true});}
  }
  function remember(token:string){seen.add(token);if(seen.size>500)seen.delete(seen.values().next().value!);}
  function pause(roundId:number){waiting=true;waitingRound=roundId;tell('pause');inert();makeCover();notifyReady();}
  function failed(message:string,retry?:()=>void){
    inert();tell('pause');if(!waiting)connectionPaused=true;notifyReady();const target=makeCover();target.replaceChildren();
    const box=document.createElement('section');box.className='math-activity';
    const title=document.createElement('h2');title.textContent='Your game is paused';title.tabIndex=-1;
    const text=document.createElement('p');text.setAttribute('role','alert');text.textContent=message;box.append(title,text);
    if(retry){const button=document.createElement('button');button.className='math-primary';button.textContent=waiting?'Try learning again':'Try opening the game again';button.onclick=retry;box.append(button);}
    target.append(box);if(owns()&&visible()){title.focus({preventScroll:true});title.scrollIntoView({block:'nearest'});}
  }
  function handshake(){
    clearTimeout(handshakeTimer);ready=false;inert();notifyReady();
    // A renderer's one ready packet can precede the iframe load event. Preserve
    // an explicit rejection until a compatible renderer actually answers; old
    // archives cannot answer connect and must not become a generic timeout.
    if(protocolError){failed(protocolError);tell('connect');return;}
    const target=makeCover();target.replaceChildren();
    const text=document.createElement('p');text.className='math-activity';text.setAttribute('role','status');text.textContent='Opening your game…';target.append(text);
    tell('connect');
    handshakeTimer=setTimeout(()=>{if(owns()&&!ready)failed('The game has not connected yet. Your saved version is safe.',handshake);},10_000);
  }
  function begin(d:PreviewEvent,token:string){
    if(!owns()||!ready)return;
    const complete=()=>{
      if(!owns())return;
      const completed=pendingRound||(d.event==='round-complete'?d:null);pendingRound=null;release(true);
      if(completed)options.onRound?.({won:completed.won!,score:completed.score!});
    };
    try{
      const asked=FG.learning.checkpoint(cover,{gameId:options.gameId||'generated',versionId:options.versionId,projectId:options.projectId||options.gameId||'generated',mode:options.mode},complete,{roundId:`${instanceId}:${token}`});
      if(!asked)complete();
    }catch{
      failed('Learning activity could not open, so this game is paused. Try again, or leave the game and ask a grown-up to check saved progress.',()=>begin(d,token));
    }
  }
  function event(message:MessageEvent) {
    if(!owns()||message.source!==frame.contentWindow)return;
    const d=message.data;
    if(!d||d.type!=='factory-preview'||d.channel!==options.channel||d.artifactId!==options.artifactId)return;
    if(d.event==='ready'){
      if(d.learningProtocol!==1){ready=false;clearTimeout(handshakeTimer);protocolError='This saved preview needs an updated game player to include learning. Leave this preview and ask a grown-up to update the workshop.';failed(protocolError);return;}
      protocolError=null;if(ready)return;
      ready=true;clearTimeout(handshakeTimer);
      if(!waiting){cover?.remove();cover=null;frame.inert=false;frame.style.pointerEvents='';if(connectionPaused){connectionPaused=false;tell('resume');}}
      notifyReady();return;
    }
    if(!ready||!['round-complete','math-checkpoint'].includes(d.event))return;
    if(!boundedId(d.roundId)){
      if(d.roundId===undefined&&!waiting){ready=false;protocolError='This preview needs an updated game player to include learning. Leave this preview and ask a grown-up to update the workshop.';failed(protocolError);}
      return;
    }
    if(d.event==='round-complete'&&(typeof d.won!=='boolean'||!Number.isInteger(d.score)||d.score<0||d.score>1_000_000))return;
    if(d.event==='math-checkpoint'&&!boundedId(d.checkpointId))return;
    const token=d.event==='round-complete'?`round:${d.roundId}`:`checkpoint:${d.roundId}:${d.checkpointId}`;
    if(seen.has(token))return;
    if(waiting){
      // One final in-flight worker reply can finish just after a mid-play pause.
      if(d.event==='round-complete'&&d.roundId===waitingRound&&!pendingRound){remember(token);pendingRound=d;}
      return;
    }
    remember(token);pause(d.roundId);begin(d,token);
  }
  function loaded(){
    if(!owns())return;
    if(waiting)FG.learning.dispose();pendingRound=null;waiting=false;waitingRound=0;
    instanceId=crypto.randomUUID();seen.clear();handshake();
  }
  function dispose(){
    if(!alive)return;alive=false;clearTimeout(handshakeTimer);
    window.removeEventListener('message',event);frame.removeEventListener('load',loaded);
    if(waiting)FG.learning.dispose();pendingRound=null;release();parent.style.position=oldPosition;
  }
  window.addEventListener('message',event);frame.addEventListener('load',loaded);handshake();
  return {dispose,get ready(){return alive&&ready&&!waiting;}};
}
