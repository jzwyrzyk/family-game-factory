import {mountLanguageActivity} from '../language/activity';
import {celebrateJem} from '../brand/delight';
import {LANGUAGE_SKILLS} from '../language/curriculum';
import {reportLanguage,selectLanguageItem} from '../language/engine';
import { mountMathActivity } from './activity';
import { report, selectItem, type LearningReport } from './engine';
import { SKILLS } from './curriculum';
import { MODE_LABELS, LANGUAGE_MODE_LABELS, LEARNING_MODES, modeFor, setMode, interpretMathRequest, interpretLearningRequest } from './policy';
import type { LearnerProfile, LearningContext, LearningMode } from './types';

const stateNames: Record<string,string> = {
  'not-enough-evidence':'Still discovering', 'learning-with-support':'Learning with help',
  independent:'Solving independently', 'remembered-later':'Remembered later',
};
const create = (tag:string, text='', className='') => { const n=document.createElement(tag);n.textContent=text;n.className=className;return n; };
type Activity = ReturnType<typeof mountMathActivity> | ReturnType<typeof mountLanguageActivity>;
const subjectFor = (profile:LearnerProfile):'math'|'language' => profile.learningSubject==='language'?'language':'math';
export function installLearningHost() {
  const FG=(window as any).FG;
  const sessionId=crypto.randomUUID();
  let active:Activity|null=null, activeOwner='', generation=0;
  // A fully unanswered checkpoint remains a learning obligation. Returning to
  // another game must not turn the old budget receipt into a ten-minute bypass.
  type BudgetReceipt={profile:LearnerProfile;attemptId:string;at:number;subject:'math'|'language'};
  let activeBudget:BudgetReceipt|null=null;
  const seen=new Set<string>();
  // In-memory, per-child/per-subject celebration cadence. Never learning evidence.
  const independentSuccesses=new Map<string,number>();
  function didParticipate(receipt:BudgetReceipt) {
    const state=receipt.subject==='language'?receipt.profile.language:receipt.profile.learning;
    const attempts=(state as any)?.attempts;
    const record=Array.isArray(attempts)?attempts.find((a:any)=>a.id===receipt.attemptId):null;
    // When evidence is unavailable, keep the receipt rather than inventing a refund.
    if(!record)return true;
    return !!(record.answers?.length||record.hintEvents?.length||record.hints?.length||
      record.hintLevel||record.hintDepth||record.readTargetAt!==undefined);
  }
  function refundUnanswered(receipt:BudgetReceipt) {
    if(didParticipate(receipt))return;
    const window=receipt.profile.mathWindow;
    if(!Array.isArray(window))return;
    const at=window.lastIndexOf(receipt.at);
    if(at<0)return;
    const prior=window.slice();
    window.splice(at,1);
    if(!FG.store.save()){
      receipt.profile.mathWindow=prior;
      // Storage failures are already reported by the learning host; no false
      // claim that the new eligibility was durably saved.
    }
  }
  function dispose(){
    generation++;
    const previous=active,receipt=activeBudget;
    active=null;activeOwner='';activeBudget=null;
    previous?.dispose('interrupted');
    if(previous&&receipt)refundUnanswered(receipt);
    window.dispatchEvent(new CustomEvent('factory-learning-active',{detail:false}));
  }
  function mount(target:HTMLElement, options:any) {
    if(FG.store.loadError)throw Error(FG.store.loadError);
    dispose();const own=++generation,profile=options.profile||FG.store.current();activeOwner=profile.id||'';
    window.dispatchEvent(new CustomEvent('factory-learning-active',{detail:true}));
    try{active=(subjectFor(profile)==='language'?mountLanguageActivity:mountMathActivity)(target,{
      ...options,profile,context:{sessionId,...options.context},
      onSave:()=>{if(!FG.store.save()){target.dataset.saveFailed='true';let warning=target.querySelector('.learning-save-warning');if(!warning){warning=create('p','Progress could not be saved. Keep this page open and ask a grown-up to export it.','learning-save-warning');warning.setAttribute('role','alert');target.append(warning);}} options.onSave?.();},
      onComplete:(result:any)=>{
        if(own!==generation||activeOwner!==FG.store.current().id)return;
        active=null;activeOwner='';activeBudget=null;
        window.dispatchEvent(new CustomEvent('factory-learning-active',{detail:false}));
        // First truly completed independent practice, then every fifth. Not every answer.
        if(result?.outcome==='completed'&&result.independent===true&&!target.dataset.saveFailed){
          const key=String(profile.id)+':'+subjectFor(profile);
          const count=(independentSuccesses.get(key)||0)+1;independentSuccesses.set(key,count);
          if(count===1||count%5===0)celebrateJem('practice','labLearningAdventure');
        }
        options.onComplete(result);
      },
    });}catch(error){active=null;activeOwner='';generation++;window.dispatchEvent(new CustomEvent('factory-learning-active',{detail:false}));throw error;}
    return active;
  }
  function checkpoint(target:HTMLElement,context:LearningContext,onComplete:(result:any)=>void,options:{roundId?:string;legacyIds?:boolean;challenge?:boolean;onLeave?:()=>void}={}) {
    const p: LearnerProfile=FG.store.current();
    const token=options.roundId?`${p.id}:${context.gameId}:${context.versionId}:${options.roundId}`:null;
    if(token&&seen.has(token))return false;
    if(active||!FG.math.canAsk(p))return false;
    const key=context.projectId||context.gameId||'game',mode=context.mode||modeFor(p,key);
    const mounted=mount(target,{profile:p,context:{...context,mode},mode,legacyIds:options.legacyIds,challenge:options.challenge,onLeave:options.onLeave,onComplete});
    if(token){seen.add(token);if(seen.size>500)seen.delete(seen.values().next().value!);}
    FG.math.didAsk(p);
    const askedAt=Array.isArray(p.mathWindow)?p.mathWindow.at(-1):undefined;
    if(mounted&&typeof askedAt==='number')activeBudget={profile:p,attemptId:mounted.attemptId,at:askedAt,subject:subjectFor(p)};
    return true;
  }
  function saveMode(key:string,value:unknown) {
    const p=FG.store.current(),before=p.mathModes;setMode(p,key,value);
    if(!FG.store.save()){p.mathModes=before;throw Error('Could not save this choice. Your previous setting is still here.');}
    window.dispatchEvent(new CustomEvent('factory-learning-mode',{detail:{key,mode:value}}));
    return value;
  }
  function modeControl(target:HTMLElement,key:string,onChange?:(mode:LearningMode)=>void) {
    const subject=subjectFor(FG.store.current());
    const heading=subject==='language'?'Language Arts in this game':'Math in this game';
    const wrap=create('div','','learning-mode-control'),label=create('label',heading);
    const select=document.createElement('select');select.setAttribute('aria-label',heading);
    for(const mode of LEARNING_MODES){const o=document.createElement('option');o.value=mode;o.textContent=subject==='language'?LANGUAGE_MODE_LABELS[mode]:MODE_LABELS[mode];select.append(o);}
    select.value=modeFor(FG.store.current(),key);label.append(select);
    const note=create('small','Learning checkpoints are always included. The format can change.');wrap.append(label,note);
    select.onchange=()=>{try{saveMode(key,select.value);onChange?.(select.value as LearningMode);}catch(error){select.value=modeFor(FG.store.current(),key);note.textContent=(error as Error).message;}};
    target.replaceChildren(wrap);return select;
  }
  function renderReport(target:HTMLElement,profile:LearnerProfile=FG.store.current(),shownSubject?:'math'|'language') {
    target.replaceChildren();
    if((shownSubject||subjectFor(profile))==='language'){
      try {
        if(FG.store.loadError)throw Error(FG.store.loadError);
        const data=reportLanguage(profile),practiced=data.skills.filter(x=>x.presentations>0);
        target.append(create('p','Language practice is not a reading diagnosis or a school grade. Independent work, help and listening support stay separate.','muted fine'));
        if(!practiced.length){target.append(create('p','A few activities cannot define your reading ability. We are discovering what to practice.'));return;}
        target.append(create('p',data.totals.independent+' independent · '+data.totals.assisted+' with help · '+data.due.length+' review skills','learning-report-summary'));
        for(const row of practiced){
          const card=create('article','','learning-progress-card');card.dataset.skillId=row.id;card.dataset.state=row.state;
          const label=row.state==='independent'?'Solving independently':row.state==='remembered-later'?'Remembered later':row.state==='learning-with-support'?'Learning with help':'Still discovering';
          card.append(create('strong','Grade '+row.grade+' · '+row.title),create('span',label,'learning-state'));
          card.append(create('small',row.independent+' independent · '+row.assisted+' with help · '+row.distinctDays+' separate days'));
          if(row.readSupport)card.append(create('small','Read-aloud help used in '+row.readSupport+' recent activities'));
          if(row.explored)card.append(create('small',row.explored+' unscored writing practice activities'));
          if(row.dueAt)card.append(create('small',row.reviewDue?'Ready to revisit':'Review after '+new Date(row.dueAt).toLocaleDateString()));
          target.append(card);
        }
      }catch(error){target.append(create('p',(error as Error).message,'learning-save-warning'));}
      return;
    }
    let r:LearningReport;
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
  FG.learning={version:2,sessionId,mount,checkpoint,dispose,focus:()=>active?.focus()||false,modeFor:(key:string)=>modeFor(FG.store.current(),key),setMode:saveMode,modeControl,interpretMathRequest,interpretLearningRequest,renderReport,report:()=>subjectFor(FG.store.current())==='language'?
    reportLanguage(FG.store.current()):report(FG.store.current()),
    mathReport:()=>report(FG.store.current()),selectItem,
    get subject(){return subjectFor(FG.store.current());},get skills(){return subjectFor(FG.store.current())==='language'?LANGUAGE_SKILLS:SKILLS;},mathSkills:SKILLS,languageSkills:LANGUAGE_SKILLS,selectLanguageItem,reportLanguage,
    setSubject:(subject:'math'|'language')=>{if(active)throw Error('Finish this activity before switching subjects.');return FG.store.choosePracticeSubject(subject);},
     get active(){return !!active;},get activeAttemptId(){return active?.attemptId||null;},get activeItem(){return active?.item||null;}};
}
