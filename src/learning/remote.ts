import type { LearningContext } from './types';

interface PreviewLearningOptions extends LearningContext {
  channel:string; artifactId:string; ownerId:string;
  onRound?:(result:{won:boolean;score:number})=>void;
}
type PreviewEvent = {event:'round-complete'|'math-checkpoint';roundId:number;checkpointId?:number;won?:boolean;score?:number};
const boundedId=(value:unknown):value is number=>Number.isInteger(value)&&(value as number)>=1&&(value as number)<=1_000_000;
/** The trusted host owns math. Sandboxed game code never receives learner records or grading authority. */
export function attachPreviewLearning(frame:HTMLIFrameElement,options:PreviewLearningOptions) {
  const FG=(window as any).FG,seen=new Set<string>();
  let instanceId=crypto.randomUUID(),alive=true,cover:HTMLDivElement|null=null,waiting=false,waitingRound=0,pendingRound:PreviewEvent|null=null;
  const parent=frame.parentElement!,oldPosition=parent.style.position;
  parent.style.position='relative';
  function tell(action:'connect'|'pause'|'resume') {
    frame.contentWindow?.postMessage({type:'factory-learning',channel:options.channel,artifactId:options.artifactId,action},'*');
  }
  function release(){cover?.remove();cover=null;frame.inert=false;frame.style.pointerEvents='';waiting=false;waitingRound=0;tell('resume');}
  function remember(token:string){seen.add(token);if(seen.size>500)seen.delete(seen.values().next().value!);}
  function pause(roundId:number){
    waiting=true;waitingRound=roundId;tell('pause');frame.inert=true;frame.style.pointerEvents='none';
    cover=document.createElement('div');cover.className='learning-preview-cover';cover.setAttribute('role','region');cover.setAttribute('aria-label','Math activity');parent.append(cover);
  }
  function failed(message:string,retry?:()=>void){
    if(!cover)pause(0);cover!.replaceChildren();
    const box=document.createElement('section');box.className='math-activity';
    const text=document.createElement('p');text.setAttribute('role','alert');text.textContent=message;box.append(text);
    if(retry){const button=document.createElement('button');button.className='math-primary';button.textContent='Try math again';button.onclick=retry;box.append(button);}
    cover!.append(box);
  }
  function begin(d:PreviewEvent,token:string){
    if(!alive||options.ownerId!==FG.store.current().id)return;
    const complete=()=>{
      if(!alive||options.ownerId!==FG.store.current().id)return;
      const completed=pendingRound||(d.event==='round-complete'?d:null);pendingRound=null;release();
      if(completed)options.onRound?.({won:completed.won!,score:completed.score!});
    };
    try{
      const asked=FG.learning.checkpoint(cover,{gameId:options.gameId||'generated',versionId:options.versionId,projectId:options.projectId||options.gameId||'generated',mode:options.mode},complete,{roundId:`${instanceId}:${token}`});
      if(!asked)complete();
    }catch{
      failed('Math could not open, so this game is paused. Try again, or leave the game and ask a grown-up to check saved progress.',()=>begin(d,token));
    }
  }
  function event(message:MessageEvent) {
    if(!alive||options.ownerId!==FG.store.current().id||message.source!==frame.contentWindow)return;
    const d=message.data;
    if(!d||d.type!=='factory-preview'||d.channel!==options.channel||d.artifactId!==options.artifactId)return;
    if(d.event==='ready'){tell('connect');return;}
    if(!['round-complete','math-checkpoint'].includes(d.event))return;
    if(!boundedId(d.roundId)){
      // A stale renderer must not silently become a math-free game.
      if(d.roundId===undefined&&!waiting)failed('This preview needs an updated game player to include math. Leave this preview and ask a grown-up to update the workshop.');
      return;
    }
    if(d.event==='round-complete'&&(typeof d.won!=='boolean'||!Number.isInteger(d.score)||d.score<0||d.score>1_000_000))return;
    if(d.event==='math-checkpoint'&&!boundedId(d.checkpointId))return;
    const token=d.event==='round-complete'?`round:${d.roundId}`:`checkpoint:${d.roundId}:${d.checkpointId}`;
    if(seen.has(token))return;
    if(waiting){
      // A final in-flight worker reply can finish the round just after a mid-play pause.
      if(d.event==='round-complete'&&d.roundId===waitingRound&&!pendingRound){remember(token);pendingRound=d;}
      return;
    }
    remember(token);pause(d.roundId);begin(d,token);
  }
  function loaded(){
    if(!alive)return;
    if(waiting){FG.learning.dispose();pendingRound=null;release();}
    instanceId=crypto.randomUUID();seen.clear();tell('connect');
  }
  function dispose(){
    if(!alive)return;alive=false;
    window.removeEventListener('message',event);frame.removeEventListener('load',loaded);
    if(waiting)FG.learning.dispose();pendingRound=null;release();parent.style.position=oldPosition;
  }
  window.addEventListener('message',event);frame.addEventListener('load',loaded);tell('connect');
  return {dispose};
}
