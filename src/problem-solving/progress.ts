import { APS_SKILLS, APS_SKILL_LABELS, PROBLEM_SOLVING_KEY, type ProblemSolvingEpisode, type ProblemSolvingObservation } from './model';
import { summarizeProblemSolving, type OutcomeCounts } from './evidence';
import './progress.css';

const node=<K extends keyof HTMLElementTagNameMap>(tag:K,text='',className='')=>{const e=document.createElement(tag);e.textContent=text;e.className=className;return e;};
const date=(at:string)=>new Date(at).toLocaleString(undefined,{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});
const counted=(x:OutcomeCounts)=>x.opportunities?`${x.demonstrated} of ${x.opportunities} matched the activity rule`:'Not sampled';
const support=(o:ProblemSolvingObservation)=>o.authorship==='helper'?'Helper-authored':o.authorship==='shared'?'Shared work':
  o.support==='strategy'?'Strategy hint opened':o.support==='solution'?'Answer help opened':o.support==='unknown'||o.authorship==='unknown'?'Help or authorship unknown':
  o.support==='access-only'?'Access help only recorded':'No content help recorded';
function practiceDetail(episode:ProblemSolvingEpisode):HTMLElement {
  const detail=node('details','','ps-observation'),heading=node('summary',`${date(episode.completedAt!)} · ${episode.task.label}`);
  detail.append(heading,node('p',`${episode.task.demand??'Authored practice'} · ${episode.task.exposure==='repeat'?'Repeated activity':episode.task.exposure==='first-seen'?'First recorded exposure':'Exposure unknown'} · ${episode.task.version}`,'muted fine'));
  const list=node('ul');
  for(const skill of APS_SKILLS){
    const o=episode.observations.find(o=>o.skill===skill&&o.outcome!=='unobserved');if(!o)continue;
    const li=node('li');li.append(node('strong',`${APS_SKILL_LABELS[skill]}: `),document.createTextNode(`${o.outcome==='demonstrated'?'matched the rule':'another approach to explore'} · ${support(o)}. ${o.note??''}`));list.append(li);
  }
  detail.append(list);return detail;
}

/** Parent-visible audit trail; child view offers practice without an aptitude label. */
export function installProblemSolvingProgress():void {
  if(document.getElementById('problemSolvingParentProgress'))return;
  const FG=(window as any).FG,owner=()=>String(FG.store.current().id),panels=new Map<'lab'|'parent',HTMLElement>();
  for(const view of ['lab','parent'] as const){
    const host=document.getElementById('page-'+view);if(!host)continue;
    const panel=node('section','','panel ps-evidence-panel');panel.id=view==='parent'?'problemSolvingParentProgress':'problemSolvingLabProgress';panel.hidden=true;host.append(panel);panels.set(view,panel);
  }
  function clear(){for(const panel of panels.values()){panel.hidden=true;panel.replaceChildren();}}
  function render(view:'lab'|'parent'){
    clear();const panel=panels.get(view),api=FG.problemSolvingEvidence;if(!panel||!api)return;
    const captured=owner(),parent=view==='parent';panel.hidden=false;
    const title=node('h2',parent?'Problem-solving observations':'Try an idea');title.id=panel.id+'Title';panel.setAttribute('aria-labelledby',title.id);panel.append(title);
    panel.append(node('p',parent?'See what this profile tried, the results they used, and the help recorded at each decision. Practice observations describe these activities; they are not a standardized score.':'Make a guess. Try a test. Use what happens to choose your next idea.','muted'));
    if(FG.problemSolving?.open){const button=node('button',parent?'Open Try an idea':'Choose a little experiment →','btn secondary');button.type='button';button.onclick=()=>{if(owner()===captured)FG.problemSolving.open();};panel.append(button);}
    if(api.warning()){const warning=node('p',api.warning(),'learning-save-warning');warning.setAttribute('role','alert');panel.append(warning);}
    let episodes:ProblemSolvingEpisode[],summary:ReturnType<typeof summarizeProblemSolving>;
    try{episodes=api.list();summary=summarizeProblemSolving(episodes,{discarded:api.retention().discarded});}
    catch(error){panel.append(node('p',(error as Error).message,'notice'));return;}
    const practice=episodes.filter(e=>e.kind==='structured-practice'&&(e.status===undefined||e.status==='completed'));
    if(!parent){
      if(practice.length)panel.append(node('p',`You have ${practice.length} saved ${practice.length===1?'experiment':'experiments'} here. You can try a familiar idea again, or choose another one.`));
      else panel.append(node('p','Your experiments will save here. Take your time, and ask for a hint whenever you need one.','muted'));
      return;
    }
    panel.append(node('h3','What has been observed'));
    const wrap=node('div','','ps-table-wrap'),table=node('table','','ps-evidence-table'),caption=node('caption','Activity-rule results by skill and recorded help');
    const head=node('thead'),headrow=node('tr');['Skill','No content help recorded','Content help or shared work','Help / authorship unknown'].forEach(label=>headrow.append(node('th',label)));head.append(headrow);table.append(caption,head);
    const body=node('tbody');
    for(const skill of APS_SKILLS){const s=summary.bySkill[skill],row=node('tr'),label=node('th',s.label);label.scope='row';row.append(label);
      if(!s.opportunities){const missing=node('td','Not sampled by a completed activity');missing.colSpan=3;row.append(missing);}
      else {row.append(node('td',counted(s.attribution['learner-no-solution-help-observed'])),node('td',counted(s.attribution.supported)),node('td',counted(s.attribution.unknown)));}
      body.append(row);
    }
    table.append(body);wrap.append(table);panel.append(wrap);
    panel.append(node('p','These are prompted practice decisions. “No content help recorded” includes neutral access help and cannot rule out help outside the app. Unanswered or invalid work is not counted as wrong. The first scored response for each skill is retained; revisions are a separate decision.','muted fine'));
    panel.append(node('h3','Earlier and recent practice'));
    if(!practice.length)panel.append(node('p','No completed Try an idea activities yet. Three short activity families currently sample planning a test, interpreting its result, and revising an idea.','muted'));
    else {
      panel.append(node('p','Compare the activity, its version, and recorded help before interpreting a change. Repeating a familiar activity can show rehearsal; these forms have not been equated or normed.','muted fine'));
      const first=practice[0],recent=practice.slice(-5).filter(e=>e.id!==first.id).reverse();
      const earliest=node('div','','ps-history');earliest.append(node('h4','Earliest retained activity'),practiceDetail(first));panel.append(earliest);
      if(recent.length){const latest=node('div','','ps-history');latest.append(node('h4','Most recent activities'));recent.forEach(e=>latest.append(practiceDetail(e)));panel.append(latest);}
    }
    const context=node('details','','ps-source-context');context.append(node('summary','Activity across Math, English, Create & code, and game design'));
    context.append(node('p',`Retained source observations: Math ${summary.contextBySource.math}; English ${summary.contextBySource.language}; scene checks ${summary.contextBySource.creation}; game design ${summary.contextBySource.studio}. These are context records and do not add to the skill results above.`));
    for(const item of summary.recentContext){context.append(node('h4',`${item.label} · ${date(item.at)}`),node('p',item.context??'Source activity recorded.','muted fine'));}
    panel.append(context,node('p',`Saved on this browser and included in Export progress. ${summary.historyTruncated?`${summary.discarded} older middle records have been removed by the retention limit; the earliest and most recent records remain. `:''}Practice results do not change Math or English progression, checkpoints, or rewards.`,'muted fine'));
    const erase=node('button','Clear these observations for this profile','text-btn');erase.type='button';erase.id='clearProblemSolving';
    erase.onclick=()=>{if(owner()!==captured)return;if(!confirm('Clear this profile’s problem-solving observations and unfinished Try an idea activities on this browser?'))return;try{api.clearCurrent();render(view);}catch(error){panel.append(node('p',(error as Error).message,'notice'));}};panel.append(erase);
  }
  function visible(){for(const view of ['lab','parent'] as const)if(!document.getElementById('page-'+view)?.classList.contains('hidden')){render(view);return;}clear();}
  window.addEventListener('factory-page',event=>{const view=(event as CustomEvent).detail;if(view==='lab'||view==='parent')render(view);else clear();});
  window.addEventListener('factory-profile-changing',clear);
  window.addEventListener('factory-profile',()=>{clear();queueMicrotask(visible);});
  window.addEventListener('factory-problem-solving-updated',visible);
  window.addEventListener('storage',event=>{if(event.key?.endsWith(PROBLEM_SOLVING_KEY))visible();});
  visible();
}
