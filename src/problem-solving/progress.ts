import { PROBLEM_SOLVING_KEY, type ProblemSolvingEpisode } from './model';
import './progress.css';

const node=<K extends keyof HTMLElementTagNameMap>(tag:K,text='',className='')=>{const e=document.createElement(tag);e.textContent=text;e.className=className;return e;};

/** Child practice entry. The shared parent dashboard owns all adult reporting. */
export function installProblemSolvingProgress():void {
  if(document.getElementById('problemSolvingLabProgress'))return;
  const FG=(window as any).FG,host=document.getElementById('page-lab');if(!host)return;
  const owner=()=>String(FG.store.current().id),panel=node('section','','panel ps-evidence-panel');
  panel.id='problemSolvingLabProgress';panel.hidden=true;host.append(panel);
  function clear(){panel.hidden=true;panel.replaceChildren();}
  function render(){
    clear();const api=FG.problemSolvingEvidence;if(!api)return;
    const captured=owner();panel.hidden=false;
    const title=node('h2','Try an idea');title.id=panel.id+'Title';panel.setAttribute('aria-labelledby',title.id);
    panel.append(title,node('p','Make a guess. Try a test. Use what happens to choose your next idea.','muted'));
    if(FG.problemSolving?.open){const button=node('button','Choose a little experiment →','btn secondary');button.type='button';button.onclick=()=>{if(owner()===captured)FG.problemSolving.open();};panel.append(button);}
    if(api.warning()){const warning=node('p',api.warning(),'learning-save-warning');warning.setAttribute('role','alert');panel.append(warning);}
    let episodes:ProblemSolvingEpisode[];
    try{episodes=api.list();}catch(error){panel.append(node('p',(error as Error).message,'notice'));return;}
    const practice=episodes.filter(e=>e.kind==='structured-practice'&&(e.status===undefined||e.status==='completed'));
    if(practice.length)panel.append(node('p',`You have ${practice.length} saved ${practice.length===1?'experiment':'experiments'} here. You can try a familiar idea again, or choose another one.`));
    else panel.append(node('p','Your experiments will save here. Take your time, and ask for a hint whenever you need one.','muted'));
  }
  function visible(){if(!host!.classList.contains('hidden'))render();else clear();}
  window.addEventListener('factory-page',event=>{if((event as CustomEvent).detail==='lab')render();else clear();});
  window.addEventListener('factory-profile-changing',clear);
  window.addEventListener('factory-profile',()=>{clear();queueMicrotask(visible);});
  window.addEventListener('factory-problem-solving-updated',visible);
  window.addEventListener('storage',event=>{if(event.key===null||event.key.endsWith(PROBLEM_SOLVING_KEY))visible();});
  visible();
}
