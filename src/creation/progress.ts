/** Read-only observations from actual scene checks; never a general thinking score. */
import { profileStorage } from '../adult-pilot/storage';
import { CreationStore, CREATION_KEY } from './storage';
import { getCreationChallenge } from './challenges';

export interface CreationObservation {
  projectId:string;revisionId:string;title:string;challengeId:string;
  passed:boolean;hintUsed:boolean;checkedAt:string;
}

/** Restrict before joining history. Use the title of the version that was actually checked. */
export function recentCreationObservations(store:CreationStore,owner:string):CreationObservation[] {
  const projects=new Set(store.list(owner).map(project=>project.id)),data=store.read();
  const revisions=new Map(data.revisions.filter(revision=>projects.has(revision.projectId)).map(revision=>[revision.id,revision]));
  return data.attempts.filter(attempt=>projects.has(attempt.projectId))
    .sort((a,b)=>Date.parse(b.checkedAt)-Date.parse(a.checkedAt)).slice(0,5)
    .map(attempt=>({projectId:attempt.projectId,revisionId:attempt.revisionId,
      title:revisions.get(attempt.revisionId)!.scene.title,challengeId:attempt.challengeId,
      passed:attempt.passed,hintUsed:attempt.hintUsed,checkedAt:attempt.checkedAt}));
}

const node=<K extends keyof HTMLElementTagNameMap>(tag:K,text='',className='')=>{
  const element=document.createElement(tag);element.textContent=text;element.className=className;return element;
};

export function installCreationProgress():void {
  if(document.getElementById('creationLabProgress'))return;
  const FG=(window as any).FG,owner=()=>String(FG.store.current().id);
  const panels=new Map<'lab'|'parent',HTMLElement>();
  for(const view of ['lab','parent'] as const){
    const host=document.getElementById('page-'+view);if(!host)continue;
    const panel=node('section','','panel');panel.id=view==='lab'?'creationLabProgress':'creationParentProgress';
    panel.hidden=true;panel.style.marginBlockStart='24px';host.append(panel);panels.set(view,panel);
  }
  function clear(){for(const panel of panels.values()){panel.hidden=true;panel.replaceChildren();}}
  function render(view:'lab'|'parent'){
    clear();const panel=panels.get(view);if(!panel)return;
    const capturedOwner=owner(),parent=view==='parent';
    panel.hidden=false;
    const heading=node('h2',parent?'Scene challenge observations':'My scene experiments');
    heading.id=panel.id+'Title';panel.setAttribute('aria-labelledby',heading.id);panel.append(heading);
    panel.append(node('p',parent?
      'Recent scene checks for the selected profile. Each result describes whether that saved version matched a specific scene goal. It does not establish general coding or thinking mastery; starter or assisted blocks may be included.':
      'Your recent scene checks. Open a scene to try another idea.', 'muted'));
    let observations:CreationObservation[];
    try{observations=recentCreationObservations(new CreationStore(profileStorage(localStorage),owner),capturedOwner);}
    catch(error){panel.append(node('p',(error as Error).message,'notice'));return;}
    if(!observations.length){panel.append(node('p',parent?'No scene challenge checks have been saved for this profile yet.':'Try a scene challenge, then check what your blocks make happen.','muted'));return;}
    const list=node('ul');list.style.listStyle='none';list.style.padding='0';list.style.margin='0';
    for(const observation of observations){
      const row=node('li','','idea');row.dataset.projectId=observation.projectId;row.dataset.revisionId=observation.revisionId;
      const title=node('h3',observation.title);title.style.marginBlock='0 6px';
      const goal=getCreationChallenge(observation.challengeId);
      const outcome=node('p',(observation.passed?'Matched this goal':'Still trying this goal')+(goal?' · '+goal.title:''));
      const support=node('p',observation.hintUsed?'A hint was opened for this scene.':'No hint was recorded for this scene.','muted fine');
      const time=node('time',new Date(observation.checkedAt).toLocaleString(undefined,{year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit',timeZoneName:'short'}),'muted fine');
      time.dateTime=observation.checkedAt;time.title=observation.checkedAt;
      const actions=node('div','','idea-actions'),open=node('button','Open this scene →','btn secondary small');open.type='button';
      open.onclick=()=>{if(owner()!==capturedOwner){clear();return;}FG.creation?.open(observation.projectId);};
      actions.append(open);row.append(title,outcome,support,time,actions);list.append(row);
    }
    panel.append(list);
    if(parent)panel.append(node('p','Hint history records support opened in this scene, including an earlier visit. “No hint recorded” does not mean the work was unaided.','muted fine'));
  }
  function renderVisible(){for(const view of ['lab','parent'] as const)if(!document.getElementById('page-'+view)?.classList.contains('hidden')){render(view);return;}clear();}
  window.addEventListener('factory-page',event=>{const view=(event as CustomEvent).detail;if(view==='lab'||view==='parent')render(view);else clear();});
  window.addEventListener('factory-profile-changing',clear);
  window.addEventListener('factory-profile',()=>{clear();queueMicrotask(renderVisible);});
  window.addEventListener('storage',event=>{if(event.key?.endsWith(CREATION_KEY))renderVisible();});
  renderVisible();
}
