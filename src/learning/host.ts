import {mountLanguageActivity} from '../language/activity';
import {stageLearningReward} from '../rewards/integration';
import {notifyRewardSourceSaved} from '../rewards/service';
import {assertRewardSourceWritable} from '../rewards/write-guard';
import {LANGUAGE_SKILLS} from '../language/curriculum';
import {reportLanguage,selectLanguageItem,ensureLanguage} from '../language/engine';
import { mountMathActivity } from './activity';
import { report, selectItem, ensureLearning } from './engine';
import { renderParentInsights } from './insights';
import './insights.css';
import { SKILLS } from './curriculum';
import { MODE_LABELS, LANGUAGE_MODE_LABELS, LEARNING_MODES, modeFor, setMode, interpretMathRequest, interpretLearningRequest } from './policy';
import type { LearnerProfile, LearningContext, LearningMode } from './types';
import type { Attempt } from './engine';
import type { LanguageAttempt } from '../language/engine';
import { publishSourceEvidence } from '../problem-solving/signals';

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
    assertRewardSourceWritable();
    if(FG.store.loadError)throw Error(FG.store.loadError);
    dispose();const own=++generation,profile=options.profile||FG.store.current(),subject=subjectFor(profile);activeOwner=profile.id||'';
    window.dispatchEvent(new CustomEvent('factory-learning-active',{detail:true}));
    try{active=(subjectFor(profile)==='language'?mountLanguageActivity:mountMathActivity)(target,{
      ...options,profile,context:{sessionId,...options.context},
      onSave:(attempt:Attempt|LanguageAttempt)=>{
        if(profile.id!==FG.store.current().id)return;
        assertRewardSourceWritable();
        const attemptId=attempt?.id||target.querySelector<HTMLElement>('[data-attempt-id]')?.dataset.attemptId||'';
        let pending=false;
        try{pending=!!stageLearningReward(profile,subject,attemptId);}catch(error){
          target.dataset.saveFailed='true';throw error;
        }
        if(!FG.store.save()){
          target.dataset.saveFailed='true';let warning=target.querySelector('.learning-save-warning');
          if(!warning){warning=create('p','Progress could not be saved. Keep this page open and ask a grown-up to export it.','learning-save-warning');warning.setAttribute('role','alert');target.append(warning);}
        }else{
          delete target.dataset.saveFailed;target.querySelector('.learning-save-warning')?.remove();
          if(attempt&&attempt.outcome!=='open'){
            // The attempt and reward outbox are now durable. The optional
            // observer cannot change subject results or prevent reward delivery.
            if(subject==='language')publishSourceEvidence({kind:'language',owner:String(profile.id),attempt:attempt as LanguageAttempt});
            else publishSourceEvidence({kind:'math',owner:String(profile.id),attempt:attempt as Attempt});
          }
          if(pending)notifyRewardSourceSaved(String(profile.id));
        }
        options.onSave?.();
      },
      onComplete:(result:any)=>{
        if(own!==generation||activeOwner!==FG.store.current().id)return;
        active=null;activeOwner='';activeBudget=null;
        window.dispatchEvent(new CustomEvent('factory-learning-active',{detail:false}));
        options.onComplete(result);
      },
    });}catch(error){active=null;activeOwner='';generation++;window.dispatchEvent(new CustomEvent('factory-learning-active',{detail:false}));throw error;}
    return active;
  }
  function checkpoint(target:HTMLElement,context:LearningContext,onComplete:(result:any)=>void,options:{roundId?:string;legacyIds?:boolean;challenge?:boolean;onLeave?:()=>void;leaveLabel?:string}={}) {
    const p: LearnerProfile=FG.store.current();
    const token=options.roundId?`${p.id}:${context.gameId}:${context.versionId}:${options.roundId}`:null;
    if(token&&seen.has(token))return false;
    if(active||!FG.math.canAsk(p))return false;
    const key=context.projectId||context.gameId||'game',mode=context.mode||modeFor(p,key);
    const mounted=mount(target,{profile:p,context:{...context,mode},mode,legacyIds:options.legacyIds,challenge:options.challenge,onLeave:options.onLeave,leaveLabel:options.leaveLabel,onComplete});
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
    try {
      if(FG.store.loadError)throw Error(FG.store.loadError);
      const subject=shownSubject||subjectFor(profile);
      if(subject==='language'){
        renderParentInsights(target,'language',reportLanguage(profile),ensureLanguage(profile).attempts);
      }else{
        renderParentInsights(target,'math',report(profile),ensureLearning(profile).attempts);
      }
    }catch(error){
      target.append(create('p',(error as Error).message,'learning-save-warning'));
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
