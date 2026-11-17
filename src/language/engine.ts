import {LANGUAGE_SKILLS, getLanguageSkill} from './curriculum';
import {LANGUAGE_BANK, generateLanguageItem, evaluateLanguageAnswer} from './content';
import {profileGrade} from '../learning/engine';
import type {LanguageContext,LanguageForm,LanguageItem,LanguageProfile,LanguageSkill} from './types';

const DAY=86_400_000;
const MAX_ATTEMPTS=120;
const INTERVALS=[1,2,4,8,14];
const bounded=(v:number)=>Number.isFinite(v)?Math.max(0,Math.min(253_402_300_799_999,v)):Date.now();
const unique=(a:string[],v:string,n:number)=>a.includes(v)?a:[...a,v].slice(-n);
const day=(v:number)=>new Date(v).toISOString().slice(0,10);
const isObject=(x:unknown):x is Record<string,any>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const safeId=(x:unknown)=>typeof x==='string'&&/^[a-z0-9:._-]{1,180}$/.test(x)&&!['__proto__','constructor','prototype'].includes(x);
const safeCount=(x:unknown)=>Number.isSafeInteger(x)&&(x as number)>=0&&(x as number)<1_000_000_000;
const safeTime=(x:unknown)=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=253_402_300_799_999;
const contextOf=(ctx:LanguageContext):StoredContext=>({
  sessionId:String(ctx.sessionId||'').slice(0,120),
  gameId:String(ctx.gameId||'').slice(0,120),
  projectId:String(ctx.projectId||'').slice(0,120),
  versionId:String(ctx.versionId||'').slice(0,120),
  mode:ctx.mode||'checkpoint',
  ...(ctx.opportunity?{opportunity:ctx.opportunity}:{}),
});
export interface StoredContext {
  sessionId:string;gameId:string;projectId:string;versionId:string;mode:string;opportunity?:string;
}
export type LanguageOutcome='open'|'completed'|'shown'|'incorrect'|'interrupted'|'skipped'|'explored';
export interface LanguageResponse {
  raw:string;normalized:string;correct:boolean;at:number;
}
export interface LanguageAttempt {
  id:string;item:LanguageItem;context:StoredContext;startedAt:number;finishedAt?:number;
  answers:LanguageResponse[];hintDepth:number;hints:{step:number;at:number}[];
  readTargetAt?:number;outcome:LanguageOutcome;correct:boolean;independent:boolean;
  draft?:string;
}
interface Recent {independent:boolean;struggled:boolean;at:number}
export interface LanguageEvidence {
  presentations:number;independent:number;assisted:number;incorrectResponses:number;
  shown:number;interrupted:number;skipped:number;explored:number;helpRequests:number;
  independentDays:string[];independentItems:string[];independentForms:LanguageForm[];
  firstIndependentAt:number|null;lastIndependentAt:number|null;lastQualifyingAt:number|null;
  reviewStage:number;dueAt:number|null;delayedSuccesses:number;recent:Recent[];lastAt:number;
}
export interface LanguageState {
  version:1;sequence:number;selectionCount:number;
  attempts:LanguageAttempt[];skills:Record<string,LanguageEvidence>;
  recentItems:string[];recentSkills:string[];
  totals:{presentations:number;independent:number;assisted:number;shown:number;interrupted:number;skipped:number;explored:number};
}
export type LanguageProgress='discovering'|'learning-with-support'|'independent'|'remembered-later';
const blankEvidence=(now:number):LanguageEvidence=>({
  presentations:0,independent:0,assisted:0,incorrectResponses:0,shown:0,interrupted:0,
  skipped:0,explored:0,helpRequests:0,independentDays:[],independentItems:[],independentForms:[],
  firstIndependentAt:null,lastIndependentAt:null,lastQualifyingAt:null,reviewStage:0,
  dueAt:null,delayedSuccesses:0,recent:[],lastAt:now,
});
const empty=():LanguageState=>({
  version:1,sequence:0,selectionCount:0,attempts:[],skills:Object.create(null),
  recentItems:[],recentSkills:[],
  totals:{presentations:0,independent:0,assisted:0,shown:0,interrupted:0,skipped:0,explored:0},
});
function trustedItem(item:unknown):item is LanguageItem {
  if(!isObject(item)||!safeId(item.skillId)||!safeId(item.id)||item.source!=='reviewed-local')return false;
  const match=/^(.+):(\d+)$/.exec(item.id);
  if(!match||match[1]!==item.skillId)return false;
  const template=LANGUAGE_BANK[item.skillId]?.items[Number(match[2])];
  if(!template||template.q!==item.question||template.kind!==item.kind||template.t!==item.tier)return false;
  if(template.kind!=='creative'&&template.a!==item.answer)return false;
  if(template.kind==='creative'&&item.answer!==undefined)return false;
  if(item.passage!==template.passage)return false;
  const skill=LANGUAGE_SKILLS.find(s=>s.id===item.skillId);
  if(!skill||item.grade!==skill.grade||item.domain!==skill.domain)return false;
  if(!Array.isArray(item.hints)||item.hints.length!==3||
      item.hints.some((x:unknown,i:number)=>x!==LANGUAGE_BANK[item.skillId].h[i]))return false;
  if(template.kind==='choice'){
    const choices=item.choices;
    if(!Array.isArray(choices)||choices.length!==4)return false;
    return [template.a,...(template.d||[])].every(v=>choices.some((c:any)=>c?.value===v&&c.label===v));
  }
  if(template.kind==='word-tiles'||template.kind==='sentence-tiles'){
    if(!Array.isArray(item.tiles))return false;
    const expected=template.kind==='word-tiles'?template.a.split(''):template.a.split(/\s+/);
    return JSON.stringify([...item.tiles].sort())===JSON.stringify([...expected].sort());
  }
  return true;
}
function validEvidence(x:unknown):x is LanguageEvidence {
  if(!isObject(x))return false;
  for(const k of ['presentations','independent','assisted','incorrectResponses','shown','interrupted','skipped','explored','helpRequests','reviewStage','delayedSuccesses']){
    if(!safeCount(x[k]))return false;
  }
  if(x.reviewStage>=INTERVALS.length)return false;
  if(!safeTime(x.lastAt))return false;
  for(const k of ['firstIndependentAt','lastIndependentAt','lastQualifyingAt','dueAt']){
    if(x[k]!==null&&!safeTime(x[k]))return false;
  }
  if(!Array.isArray(x.independentDays)||x.independentDays.length>90||x.independentDays.some((d:unknown)=>typeof d!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d)))return false;
  if(!Array.isArray(x.independentItems)||x.independentItems.length>100||x.independentItems.some((s:unknown)=>!safeId(s)))return false;
  if(!Array.isArray(x.independentForms)||x.independentForms.length>5||x.independentForms.some((f:unknown)=>!['pattern','encoding','syntax','comprehension','expression'].includes(String(f))))return false;
  if(!Array.isArray(x.recent)||x.recent.length>8||x.recent.some((v:unknown)=>!isObject(v)||typeof v.independent!=='boolean'||typeof v.struggled!=='boolean'||!safeTime(v.at)))return false;
  return true;
}
function validAttempt(a:unknown):a is LanguageAttempt {
  if(!isObject(a)||!safeId(a.id)||!trustedItem(a.item)||!isObject(a.context)||!safeTime(a.startedAt))return false;
  if(a.finishedAt!==undefined&&!safeTime(a.finishedAt))return false;
  if(!['open','completed','shown','incorrect','interrupted','skipped','explored'].includes(a.outcome)||typeof a.independent!=='boolean'||typeof a.correct!=='boolean')return false;
  if(!safeCount(a.hintDepth)||a.hintDepth>4||!Array.isArray(a.hints)||a.hints.length>4||a.hints.some((h:unknown)=>!isObject(h)||!safeCount(h.step)||!safeTime(h.at)))return false;
  if(a.readTargetAt!==undefined&&!safeTime(a.readTargetAt))return false;
  if(a.draft!==undefined&&(typeof a.draft!=='string'||a.draft.length>1200))return false;
  if(!Array.isArray(a.answers)||a.answers.length>12||a.answers.some((v:unknown)=>!isObject(v)||typeof v.raw!=='string'||v.raw.length>400||typeof v.normalized!=='string'||v.normalized.length>400||typeof v.correct!=='boolean'||!safeTime(v.at)))return false;
  for(const k of ['sessionId','gameId','projectId','versionId','mode'])if(typeof a.context[k]!=='string'||a.context[k].length>120)return false;
  if(a.context.opportunity!==undefined&&!['mid-play','round-end','practice'].includes(a.context.opportunity))return false;
  return true;
}
/** Reject future/corrupt history without overwriting any original backup bytes. */
export function validateLanguage(value:unknown):boolean {
  if(value===undefined)return true;
  if(!isObject(value)||value.version!==1||!safeCount(value.sequence)||!safeCount(value.selectionCount)||!isObject(value.totals)||!isObject(value.skills))return false;
  if(!Array.isArray(value.attempts)||value.attempts.length>MAX_ATTEMPTS||value.attempts.some((x:unknown)=>!validAttempt(x)))return false;
  for(const k of ['presentations','independent','assisted','shown','interrupted','skipped','explored'])if(!safeCount(value.totals[k]))return false;
  for(const [id,x] of Object.entries(value.skills))if(!safeId(id)||!Object.hasOwn(LANGUAGE_BANK,id)||!validEvidence(x))return false;
  for(const k of ['recentItems','recentSkills'])if(!Array.isArray(value[k])||value[k].length>24||value[k].some((v:unknown)=>!safeId(v)))return false;
  return true;
}
export function ensureLanguage(profile:LanguageProfile):LanguageState {
  if(profile.language===undefined)profile.language=empty();
  if(!validateLanguage(profile.language))throw Error('Unsupported language learning history. Preserve your original data and restore a compatible backup.');
  return profile.language as LanguageState;
}
const evidence=(state:LanguageState,id:string,now:number)=>{
  if(!Object.hasOwn(state.skills,id))state.skills[id]=blankEvidence(now);
  return state.skills[id];
};
const findOpen=(state:LanguageState,id:string)=>{
  const attempt=state.attempts.find(a=>a.id===id);
  if(!attempt)throw Error('Unknown language attempt.');
  return attempt;
};
function recent(summary:LanguageEvidence,independent:boolean,struggled:boolean,at:number){
  summary.recent.push({independent,struggled,at});
  summary.recent=summary.recent.slice(-8);
}
function completeSchedule(summary:LanguageEvidence,attempt:LanguageAttempt,now:number){
  summary.firstIndependentAt??=now;
  summary.lastIndependentAt=now;
  summary.independentDays=unique(summary.independentDays,day(now),90);
  summary.independentItems=unique(summary.independentItems,attempt.item.id,100);
  summary.independentForms=unique(summary.independentForms,attempt.item.form,5) as LanguageForm[];
  if(summary.lastQualifyingAt===null){
    summary.lastQualifyingAt=now;summary.dueAt=now+DAY;return;
  }
  if(now-summary.lastQualifyingAt>=DAY&&summary.dueAt!==null&&now>=summary.dueAt){
    summary.reviewStage=Math.min(INTERVALS.length-1,summary.reviewStage+1);
    summary.delayedSuccesses++;
    summary.lastQualifyingAt=now;summary.dueAt=now+INTERVALS[summary.reviewStage]*DAY;
  }
}
export function beginLanguageAttempt(profile:LanguageProfile,item:LanguageItem,context:LanguageContext={}):LanguageAttempt {
  if(!trustedItem(item))throw Error('Unreviewed language question.');
  if(item.grade>profileGrade(profile))throw Error('Language item exceeds parent grade scope.');
  const state=ensureLanguage(profile),now=bounded(context.now??Date.now());
  for(const open of state.attempts.filter(a=>a.outcome==='open'))finishLanguageAttempt(profile,open.id,'interrupted',now);
  const attempt:LanguageAttempt={
    id:'ela:'+(++state.sequence),item,context:contextOf(context),startedAt:now,
    answers:[],hintDepth:0,hints:[],outcome:'open',correct:false,independent:false,
  };
  state.attempts.unshift(attempt);state.attempts=state.attempts.slice(0,MAX_ATTEMPTS);
  state.totals.presentations++;
  evidence(state,item.skillId,now).presentations++;
  state.recentItems=[item.id,...state.recentItems.filter(v=>v!==item.id)].slice(0,24);
  state.recentSkills=[item.skillId,...state.recentSkills.filter(v=>v!==item.skillId)].slice(0,24);
  return attempt;
}
export function submitLanguageAnswer(profile:LanguageProfile,id:string,raw:string,now=Date.now()){
  const state=ensureLanguage(profile),attempt=findOpen(state,id);
  if(attempt.outcome!=='open')return {valid:false,correct:attempt.correct,attempt,message:'This activity has finished.'};
  if(attempt.correct)return {valid:false,correct:true,attempt,message:'This answer was already counted.'};
  if(attempt.answers.length>=12)return {valid:false,correct:false,attempt,message:'Let us try a worked example now.'};
  const check=evaluateLanguageAnswer(attempt.item,raw);
  if(!check.valid)return {...check,attempt};
  attempt.answers.push({raw:raw.slice(0,400),normalized:check.normalized,correct:check.correct,at:bounded(now)});
  if(check.correct){
    attempt.correct=true;
    attempt.independent=attempt.answers.length===1&&attempt.hintDepth===0&&attempt.readTargetAt===undefined;
  } else evidence(state,attempt.item.skillId,bounded(now)).incorrectResponses++;
  return {...check,attempt};
}
export function useLanguageHint(profile:LanguageProfile,id:string,step:number,now=Date.now()){
  const state=ensureLanguage(profile),attempt=findOpen(state,id);
  if(attempt.outcome!=='open'||!Number.isInteger(step)||step<1||step>4)return attempt;
  if(step<=attempt.hintDepth)return attempt;
  attempt.hintDepth=step;attempt.hints.push({step,at:bounded(now)});
  evidence(state,attempt.item.skillId,bounded(now)).helpRequests++;
  attempt.independent=false;return attempt;
}
export function recordLanguageReadAloud(profile:LanguageProfile,id:string,now=Date.now()){
  const state=ensureLanguage(profile),attempt=findOpen(state,id);
  if(attempt.outcome==='open'){attempt.readTargetAt=bounded(now);attempt.independent=false;}
  return attempt;
}
export function finishLanguageAttempt(profile:LanguageProfile,id:string,outcome:Exclude<LanguageOutcome,'open'>,now=Date.now()){
  const state=ensureLanguage(profile),attempt=findOpen(state,id);
  if(attempt.outcome!=='open')return attempt;
  if(outcome==='completed'&&!attempt.correct)throw Error('Cannot award completion for an incorrect answer.');
  if(outcome==='explored'&&attempt.item.kind!=='creative')throw Error('Only open writing is unscored exploration.');
  attempt.outcome=outcome;attempt.finishedAt=bounded(now);
  const summary=evidence(state,attempt.item.skillId,attempt.finishedAt);summary.lastAt=attempt.finishedAt;
  if(outcome==='completed'){
    if(attempt.independent){
      summary.independent++;state.totals.independent++;
      completeSchedule(summary,attempt,attempt.finishedAt);
    }else{
      summary.assisted++;state.totals.assisted++;
      // Helpful practice does not extend an earned review interval.
      if(summary.dueAt!==null)summary.dueAt=Math.min(summary.dueAt,attempt.finishedAt+DAY);
    }
    recent(summary,attempt.independent,!attempt.independent,attempt.finishedAt);
  }else{
    if(outcome==='shown'){summary.shown++;state.totals.shown++;}
    if(outcome==='interrupted'){summary.interrupted++;state.totals.interrupted++;}
    if(outcome==='skipped'){summary.skipped++;state.totals.skipped++;}
    if(outcome==='explored'){summary.explored++;state.totals.explored++;}
    if(outcome==='incorrect'){summary.assisted++;state.totals.assisted++;}
    if(outcome==='shown'||outcome==='incorrect')recent(summary,false,true,attempt.finishedAt);
  }
  return attempt;
}
/** A child may write freely, but writing quality is not automatically graded. */
export function saveCreativeDraft(profile:LanguageProfile,id:string,draft:string,now=Date.now()){
  const state=ensureLanguage(profile),attempt=findOpen(state,id);
  if(attempt.item.kind!=='creative'||attempt.outcome!=='open')throw Error('Not an open writing activity.');
  const text=draft.trim();
  if(!text||text.length>1200)return {valid:false,attempt,message:'Write an idea before continuing (up to 1,200 characters).'};
  attempt.draft=text;return {valid:true,attempt:finishLanguageAttempt(profile,id,'explored',now)};
}
export function languageEvidenceState(summary?:LanguageEvidence):LanguageProgress {
  if(!summary||summary.presentations===0)return 'discovering';
  const latest=summary.recent.slice(-4);
  const stable=latest.length>=3&&latest.filter(x=>x.independent).length>=3;
  const across=summary.independent>=4&&summary.independentDays.length>=2&&summary.independentItems.length>=3&&stable;
  if(across&&summary.independent>=5&&summary.independentDays.length>=3&&
     summary.independentItems.length>=3&&summary.delayedSuccesses>=2&&
     summary.firstIndependentAt!==null&&summary.lastIndependentAt!==null&&
     summary.lastIndependentAt-summary.firstIndependentAt>=7*DAY)return 'remembered-later';
  if(across)return 'independent';
  if(latest.length>=2&&latest.slice(-2).every(x=>x.struggled))return 'learning-with-support';
  return 'discovering';
}
const randomNumber=(fn:()=>number)=>{const n=fn();return Number.isFinite(n)?Math.max(0,Math.min(0.999999,n)):0;};
const select=(items:LanguageSkill[],random:()=>number):LanguageSkill=>items[Math.floor(randomNumber(random)*items.length)];
export function selectLanguageItem(profile:LanguageProfile,context:LanguageContext={}):LanguageItem {
  const state=ensureLanguage(profile),grade=profileGrade(profile),random=context.random||Math.random;
  // Keep extended creative writing for natural breaks or voluntary practice, never a timed mid-game pause.
  const allowed=LANGUAGE_SKILLS.filter(s=>s.grade<=grade&&LANGUAGE_BANK[s.id]?.items.length&&
    (context.opportunity!=='mid-play'||!LANGUAGE_BANK[s.id].items.some(item=>item.kind==='creative')));
  if(!allowed.length)throw Error('No language curriculum available.');
  const preferred=(profile.languageFocus||[]).filter(x=>allowed.some(s=>s.id===x));
  const due=allowed.filter(s=>state.skills[s.id]?.dueAt!==null&&state.skills[s.id]?.dueAt!==undefined&&
    (state.skills[s.id]?.dueAt||Infinity)<=(context.now??Date.now()));
  const needs=allowed.filter(s=>{
    const ev=state.skills[s.id];return ev&&ev.recent.slice(-2).length===2&&ev.recent.slice(-2).every(x=>x.struggled);
  });
  const current=allowed.filter(s=>s.grade===grade);
  const unseen=current.filter(s=>!state.skills[s.id]?.presentations);
  const established=allowed.filter(s=>languageEvidenceState(state.skills[s.id])==='independent');
  const slot=state.selectionCount++%4;
  let purpose:LanguageItem['purpose']='explore',pool:LanguageSkill[]=unseen.length?unseen:current;
  if(slot===2&&due.length){pool=due;purpose='review';}
  else if((slot===0||slot===1)&&preferred.length){pool=allowed.filter(s=>preferred.includes(s.id));purpose='focus';}
  else if(slot===0&&needs.length){pool=needs;purpose='focus';}
  else if(slot===3&&established.length){pool=established;purpose='confidence';}
  if(!pool.length)pool=allowed;
  const last=state.recentSkills.slice(0,2);
  const fresh=pool.filter(s=>!last.includes(s.id));if(fresh.length)pool=fresh;
  let skill=select(pool,random);
  const weak=state.skills[skill.id];
  if(weak&&weak.recent.slice(-2).length===2&&weak.recent.slice(-2).every(x=>x.struggled)&&
      skill.prerequisites.length&&purpose!=='review'){
    const prior=allowed.find(s=>s.id===skill.prerequisites[0]);
    if(prior){skill=prior;purpose='prerequisite';}
  }
  const evidence=state.skills[skill.id];
  const recentIndependent=evidence?.recent.slice(-5).filter(x=>x.independent).length||0;
  const variation=evidence?.independentItems.length||0;
  const struggling=evidence?.recent.slice(-2).some(x=>x.struggled);
  const intensity=profile.intensity||'balanced';
  const tier=struggling?0:intensity==='gentle'?(recentIndependent>=3&&variation>=2?1:0):
    recentIndependent>=4&&variation>=3?2:recentIndependent>=2&&variation>=2?1:intensity==='stretch'?1:0;
  const item=generateLanguageItem(skill.id,{random,tier,excludeIds:state.recentItems.slice(0,8)});
  return {...item,purpose};
}
export function reportLanguage(profile:LanguageProfile,now=Date.now()){
  const state=ensureLanguage(profile);
  return {
    grade:profileGrade(profile),totals:{...state.totals},
    due:LANGUAGE_SKILLS.filter(s=>state.skills[s.id]?.dueAt!==null&&
      state.skills[s.id]?.dueAt!==undefined&&(state.skills[s.id]?.dueAt||Infinity)<=now).map(x=>x.id),
    skills:LANGUAGE_SKILLS.filter(s=>s.grade<=profileGrade(profile)||state.skills[s.id]).map(s=>{
      const ev=state.skills[s.id],status=languageEvidenceState(ev);
      return {id:s.id,title:s.title,grade:s.grade,domain:s.domain,state:status,
        presentations:ev?.presentations||0,independent:ev?.independent||0,assisted:ev?.assisted||0,
        distinctDays:ev?.independentDays.length||0,reviewDue:!!ev?.dueAt&&ev.dueAt<=now,dueAt:ev?.dueAt||null,
        readSupport:state.attempts.filter(a=>a.item.skillId===s.id&&a.readTargetAt!==undefined).length,
        explored:ev?.explored||0};
    }),
    recentAttempts:state.attempts.slice(0,12),
  };
}
