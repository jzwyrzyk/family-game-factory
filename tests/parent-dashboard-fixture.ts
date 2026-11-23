/** Synthetic records for UI regression and screenshots; never loaded by the product. */
import {generateItem} from '../src/learning/content';
import {beginAttempt, submitAnswer, useHint, finishAttempt} from '../src/learning/engine';
import {generateLanguageItem} from '../src/language/content';
import {beginLanguageAttempt, submitLanguageAnswer, useLanguageHint, finishLanguageAttempt, recordLanguageReadAloud, saveCreativeDraft} from '../src/language/engine';
import type {LearnerProfile} from '../src/learning/types';
import {CreationStore} from '../src/creation/storage';
import {createChallengeTarget} from '../src/creation/challenges';
import {emptyProblemSolvingWorkspace, validateProblemSolvingEpisode} from '../src/problem-solving/model';

const DAY = 86_400_000;
export function parentDashboardFixture(now = Date.now()) {
  const profile: LearnerProfile = {
    id:'player1', name:'Demo Explorer', icon:'🌟', grade:4, age:9, focus:'adaptive',
    intensity:'balanced', rate:3, hints:true, punish:false, skills:{}, stats:{},
    mathWindow:[], learningSubject:'math', allowSubjectSwitch:true,
  };
  const context = (at:number) => ({now:at, sessionId:'demo-'+at, gameId:'gem-factory', projectId:'demo-factory', versionId:'demo-v1'});
  for (let i=0;i<24;i++) {
    // Keep the oldest synthetic record inside 30 calendar days, including at UTC midnight.
    const at=now-(28-i)*DAY-300_000;
    const item=generateItem(i%3===0?'g2-hundreds':'g3-multiply',{
      representation:i%2?'symbolic':'visual', random:()=>0.12+(i%7)*0.11,
      ...(i%3===0?{}:{factId:'mul:8x'+(2+i%9)}),
    });
    const attempt=beginAttempt(profile,item,context(at));
    if(i%6===0) { useHint(profile,attempt.id,1,at+1000); }
    if(i%7===0) submitAnswer(profile,attempt.id,'999',at+2000);
    submitAnswer(profile,attempt.id,String(item.answer),at+4000);
  }
  for(let i=0;i<11;i++) {
    const at=now-(12-i)*DAY-200_000;
    const item=generateLanguageItem(i%2?'g3-main-idea':'g2-cause-effect',{tier:0,random:()=>0.12+(i%5)*0.16});
    const attempt=beginLanguageAttempt(profile,item,context(at));
    if(i%4===0)useLanguageHint(profile,attempt.id,1,at+1000);
    if(i===9)recordLanguageReadAloud(profile,attempt.id,at+1500);
    submitLanguageAnswer(profile,attempt.id,item.answer!,at+3500);
    finishLanguageAttempt(profile,attempt.id,'completed',at+4000);
  }
  const writing=generateLanguageItem('g4-revision',{tier:0,random:()=>0.1});
  const writingAttempt=beginLanguageAttempt(profile,writing,context(now-DAY-10_000));
  saveCreativeDraft(profile,writingAttempt.id,'Demo story: The moon dragon built a rocket from leaves.',now-DAY-5000);
  const abandoned=beginAttempt(profile,generateItem('g3-multiply',{random:()=>0.3}),context(now-DAY));
  finishAttempt(profile,abandoned.id,'interrupted',now-DAY+1000);
  const storage=new Map<string,string>();
  const store=new CreationStore({getItem:key=>storage.get(key)??null,setItem:(key,value)=>{storage.set(key,value);}});
  const scene=createChallengeTarget('robot-taps');scene.title='Demo: Dance on a click';
  const project=store.create('player1',scene,{challengeId:'robot-taps'});
  store.recordAttempt(project.id,'player1',project.headId,{challengeId:'robot-taps',passed:true,hintUsed:true});
  // Duplicate checks must remain in the journal without inflating the summary.
  store.recordAttempt(project.id,'player1',project.headId,{challengeId:'robot-taps',passed:true,hintUsed:true});
  const siblingScene=createChallengeTarget('robot-route');siblingScene.title='PRIVATE SIBLING SCENE';
  const sibling=store.create('player2',siblingScene,{challengeId:'robot-route'});
  store.recordAttempt(sibling.id,'player2',sibling.headId,{challengeId:'robot-route',passed:true,hintUsed:false});
  const workspace=store.read();
  // Dates are fixed relative to the test clock, and the graph is still validated by the product.
  for(const p of workspace.projects){p.createdAt=new Date(now-3*DAY).toISOString();p.updatedAt=p.createdAt;}
  for(const r of workspace.revisions)r.createdAt=new Date(now-3*DAY).toISOString();
  workspace.attempts.forEach((a,i)=>{a.checkedAt=new Date(now-2*DAY+i*1000).toISOString();});
  const other={id:'player2',name:'Demo Sibling',icon:'🚀',grade:2,age:7,focus:'adaptive',intensity:'gentle',rate:3,hints:true,punish:false,skills:{},stats:{},mathWindow:[],learningSubject:'math',allowSubjectSwitch:false};
  const problemSolving=emptyProblemSolvingWorkspace(),at=now-DAY;
  const practice=validateProblemSolvingEpisode({schema:'jems.problem-solving.episode.v1',id:'demo-aps',owner:'player1',sessionId:'demo-session',source:'practice',kind:'structured-practice',
    startedAt:new Date(at).toISOString(),completedAt:new Date(at+5000).toISOString(),status:'completed',
    task:{id:'demo-robot',family:'robot-stop',version:'v1',label:'Demo: Test where the robot stops',demand:'Compare one changed step count',exposure:'first-seen',firstAttempt:true},
    observations:[
      {id:'demo-plan',skill:'plan_test',outcome:'demonstrated',authorship:'learner',support:'none-observed',elicitation:'prompted',observedAt:new Date(at+1000).toISOString(),note:'Chose a relevant change to compare.'},
      {id:'demo-result',skill:'interpret_evidence',outcome:'not-yet',authorship:'learner',support:'none-observed',elicitation:'prompted',observedAt:new Date(at+2000).toISOString(),note:'The selected explanation did not match this result.'},
      {id:'demo-revise',skill:'revise',outcome:'demonstrated',authorship:'learner',support:'strategy',elicitation:'prompted',observedAt:new Date(at+3000).toISOString(),note:'Selected a revision after opening a strategy hint.'},
    ]});
  const source=validateProblemSolvingEpisode({...practice,id:'demo-aps-context',source:'math',kind:'context-only',observations:[],
    task:{...practice.task,id:'demo-math-source',family:'math-source',label:'Demo: Math activity context',exposure:'unknown',firstAttempt:false},
    context:'A Math activity was completed. This source record does not infer general problem-solving skill.'});
  problemSolving.episodes.push(practice,source);
  return {state:{version:1,activeProfile:'player1',profiles:[profile,other],feedback:[],createdAt:now-30*DAY},creation:workspace,problemSolving};
}
