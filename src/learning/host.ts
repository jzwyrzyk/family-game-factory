import { mountMathActivity } from './activity';
import { report, selectItem, type LearningReport } from './engine';
import { SKILLS } from './curriculum';
import { MODE_LABELS, LEARNING_MODES, modeFor, setMode, interpretMathRequest } from './policy';
import type { LearnerProfile, LearningContext, LearningMode } from './types';

const stateNames: Record<string,string> = {
  'not-enough-evidence':'Still discovering', 'learning-with-support':'Learning with help',
  independent:'Solving independently', 'remembered-later':'Remembered later',
};
const create = (tag:string, text='', className='') => { const n=document.createElement(tag);n.textContent=text;n.className=className;return n; };
type Activity = ReturnType<typeof mountMathActivity>;
export function installLearningHost() {
  const FG=(window as any).FG;
  const sessionId=crypto.randomUUID();
  let active:Activity|null=null, activeOwner='', generation=0;
  const seen=new Set<string>();
  function dispose(){generation++;const previous=active;active=null;activeOwner='';previous?.dispose('interrupted');window.dispatchEvent(new CustomEvent('factory-learning-active',{detail:false}));}
  function mount(target:HTMLElement, options:any) {
    if(FG.store.loadError)throw Error(FG.store.loadError);
    dispose();const own=++generation,profile=options.profile||FG.store.current();activeOwner=profile.id||'';
    window.dispatchEvent(new CustomEvent('factory-learning-active',{detail:true}));
    try{active=mountMathActivity(target,{
      ...options,profile,context:{sessionId,...options.context},
      onSave:()=>{if(!FG.store.save()){target.dataset.saveFailed='true';let warning=target.querySelector('.learning-save-warning');if(!warning){warning=create('p','Progress could not be saved. Keep this page open and ask a grown-up to export it.','learning-save-warning');warning.setAttribute('role','alert');target.append(warning);}} options.onSave?.();},
      onComplete:(result:any)=>{if(own!==generation||activeOwner!==FG.store.current().id)return;active=null;activeOwner='';window.dispatchEvent(new CustomEvent('factory-learning-active',{detail:false}));options.onComplete(result);},
    });}catch(error){active=null;activeOwner='';generation++;window.dispatchEvent(new CustomEvent('factory-learning-active',{detail:false}));throw error;}
    return active;
  }
  function checkpoint(target:HTMLElement,context:LearningContext,onComplete:(result:any)=>void,options:{roundId?:string;legacyIds?:boolean;challenge?:boolean}={}) {
    const p: LearnerProfile=FG.store.current();
    const token=options.roundId?`${p.id}:${context.gameId}:${context.versionId}:${options.roundId}`:null;
    if(token&&seen.has(token))return false;
    if(active||!FG.math.canAsk(p))return false;
    const key=context.projectId||context.gameId||'game',mode=context.mode||modeFor(p,key);
    mount(target,{profile:p,context:{...context,mode},mode,legacyIds:options.legacyIds,challenge:options.challenge,onComplete});
    if(token){seen.add(token);if(seen.size>500)seen.delete(seen.values().next().value!);}
    FG.math.didAsk(p);
    return true;
  }
  function saveMode(key:string,value:unknown) {
    const p=FG.store.current(),before=p.mathModes;setMode(p,key,value);
    if(!FG.store.save()){p.mathModes=before;throw Error('Could not save this choice. Your previous setting is still here.');}
    window.dispatchEvent(new CustomEvent('factory-learning-mode',{detail:{key,mode:value}}));
    return value;
  }
  function modeControl(target:HTMLElement,key:string,onChange?:(mode:LearningMode)=>void) {
    const wrap=create('div','','learning-mode-control'),label=create('label','Math in this game');
    const select=document.createElement('select');select.setAttribute('aria-label','Math in this game');
    for(const mode of LEARNING_MODES){const o=document.createElement('option');o.value=mode;o.textContent=MODE_LABELS[mode];select.append(o);}
    select.value=modeFor(FG.store.current(),key);label.append(select);
    const note=create('small','Math is always included. The format can change.');wrap.append(label,note);
    select.onchange=()=>{try{saveMode(key,select.value);onChange?.(select.value as LearningMode);}catch(error){select.value=modeFor(FG.store.current(),key);note.textContent=(error as Error).message;}};
    target.replaceChildren(wrap);return select;
  }
  function renderReport(target:HTMLElement,profile:LearnerProfile=FG.store.current()) {
    target.replaceChildren();let r:LearningReport;
    try{if(FG.store.loadError)throw Error(FG.store.loadError);r=report(profile);}catch(error){target.append(create('p',(error as Error).message,'learning-save-warning'));return;}
    const practiced=r.skills.filter(x=>x.presentations>0);
    target.append(create('p','Progress describes practice here. It is not a school grade or an assessment score.','muted fine'));
    if(!practiced.length){target.append(create('p','We’re discovering what you know. A few questions cannot define your ability.'));return;}
    target.append(create('p',`${r.totals.independent} independently solved · ${r.totals.assisted} solved with help · ${r.due.length} skills ready to revisit`,'learning-report-summary'));
    for(const row of practiced){
      const card=create('article','','learning-progress-card');card.dataset.skillId=row.id;card.dataset.state=row.state;
      card.append(create('strong',`Grade ${row.grade} · ${row.title}`),create('span',stateNames[row.state]||'Collecting learning evidence','learning-state'));
      card.append(create('small',`${row.independent} independent successes · ${row.distinctDays} separate days · ${row.assisted} solved with help`));
      if(row.dueAt)card.append(create('small',row.reviewDue?'Ready for a review':`Review after ${new Date(row.dueAt).toLocaleDateString()}`));
      if(row.migrated)card.append(create('small','Includes older practice counts. Earlier days and answer forms were not recorded.'));
      for(const hypothesis of row.hypotheses)card.append(create('small',hypothesis));
      target.append(card);
    }
  }
  window.addEventListener('factory-profile',dispose);
  window.addEventListener('pagehide',dispose);
  FG.learning={version:2,sessionId,mount,checkpoint,dispose,focus:()=>active?.focus()||false,modeFor:(key:string)=>modeFor(FG.store.current(),key),setMode:saveMode,modeControl,interpretMathRequest,renderReport,report:()=>report(FG.store.current()),skills:SKILLS,selectItem,
    get active(){return !!active;},get activeAttemptId(){return active?.attemptId||null;},get activeItem(){return active?.item||null;}};
}
