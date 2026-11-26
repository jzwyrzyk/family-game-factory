import {planMathModel, mountMathModel} from './workspace/math';
import {createNumericKeypad, createScratchpad} from './workspace/support';
import {createLearningWorkspace} from './workspace/shell';
import {earlyInstruction} from './early/audio';
import {mountEarlyMath} from './early/render';
import {isEarlyGrade} from './grades';
import { profileGrade, beginAttempt, finishAttempt, selectItem, submitAnswer, useHint, type Attempt } from './engine';
import type { LearnerProfile, LearningContext, LearningMode, MathItem } from './types';
import { interactionKind, renderMathVisual } from './visuals';
import {createReadAloudControl} from '../speech/read-aloud-control';

export interface MathActivityResult {
  independent: boolean;
  outcome: 'completed' | 'shown' | 'incorrect';
  attemptId: string;
  item: MathItem;
  mode: LearningMode;
}
export interface MathActivityOptions {
  profile: LearnerProfile;
  context?: LearningContext;
  item?: MathItem;
  mode?: LearningMode;
  onComplete(result: MathActivityResult): void;
  onSave(attempt: Attempt): void;
  legacyIds?: boolean;
  challenge?: boolean;
  onLeave?:()=>void;
  leaveLabel?:string;
}
let nextActivity = 0;
function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function button(text: string, className?: string): HTMLButtonElement {
  const node = el('button', className, text); node.type = 'button'; return node;
}
/**
 * One host-owned learning opportunity. Both input paths submit the same item and
 * attempt, so changing representation cannot create duplicate learning credit.
 * The host owns pausing, continuation, the family budget, and game consequences.
 */
export function mountMathActivity(target: HTMLElement, options: MathActivityOptions) {
  const prefix = `math-${++nextActivity}`;
  const mode = options.mode || options.context?.mode || 'checkpoint';
  const initial = options.item || selectItem(options.profile, options.context);
  const kind = interactionKind(initial);
  const availableModel = planMathModel(initial);
  // A checkpoint keeps its authored representation. A symbolic checkpoint can
  // offer a model after a recorded hint, without relabeling symbolic evidence.
  const quantityFallback = mode !== 'checkpoint' && !isEarlyGrade(initial.grade) && kind==='quantity'
    ? {kind:'blocks', role:'answer'} as const : undefined;
  const plan = mode !== 'checkpoint' || initial.representation==='visual' ? availableModel ?? quantityFallback : undefined;
  const constructsAnswer = plan?.role === 'answer';
  const arrayWithBlocks = plan?.kind === 'arrays' && initial.parameters.operation === 'multiply'
    && initial.answerKind === 'number' && mode !== 'checkpoint' && !options.challenge;
  // A quantity/fraction construction is an actual mathematical representation,
  // not evidence of unaided symbolic recall. Choice tiles retain the item form.
  const item: MathItem = !isEarlyGrade(initial.grade) && mode !== 'checkpoint' && plan
    ? {...initial, id: `${initial.id}:constructed`, representation: 'visual'} : initial;
  const attempt = beginAttempt(options.profile, item, {...options.context, mode});
  let disposed = false, done = false, locked = false, errors = 0, hintDepth = 0;
  let completionTimer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new AbortController();
  const shell = createLearningWorkspace({subject:'math', grade:profileGrade(options.profile),
    title:item.question, id:`${prefix}-question`, owner:String(options.profile.id ?? ''), gameId:options.context?.gameId,
    signal:listeners.signal, leaveLabel:options.leaveLabel, onLeave:options.onLeave && (()=>{ if(!disposed&&!done) options.onLeave?.(); })});
  const {root,title,feedback,helpPanel:hintPanel} = shell;
  root.dataset.answerKind = item.answerKind; root.dataset.skillId = item.skillId;
  const early=isEarlyGrade(item.grade);root.classList.toggle('early-activity',early);
  root.dataset.mode = mode; root.dataset.attemptId = attempt.id; root.dataset.interactionKind = kind;
  const instruction=early?earlyInstruction(()=>item.question,String(options.profile.id),()=>!disposed&&!done&&!locked,
    mode=>{if(attempt.promptDelivery!=='grown-up')attempt.promptDelivery=mode;save();}):null;
  const questionReading = instruction??createReadAloudControl({
    text: () => [item.question,...(item.choices || []).map((choice,index) => `Option ${index+1}: ${choice.label}.`)].join(' '),
    canRead: () => !disposed && !done && !locked,
  });
  shell.header.append(questionReading.element);
  if(item.visual && plan?.kind !== 'chart' && plan?.kind !== 'shapes') {
    if(item.skillId==='g3-fraction-number' && item.visual.kind==='number-line') {
      shell.stimulus.append(renderMathVisual({...item.visual,jumps:[]},{divisions:Number(item.parameters.d)}));
    } else {
      shell.stimulus.append(renderMathVisual(item.visual));
    }
  }

  const tabs = el('div','math-mode-tabs'); tabs.setAttribute('role','group'); tabs.setAttribute('aria-label','How would you like to answer?');
  const typeTab=button('Write an answer'),buildTab=button(kind==='choice'?'Choose a tile':'Build an answer');
  tabs.append(typeTab,buildTab); tabs.hidden=!arrayWithBlocks && (!constructsAnswer || !(mode==='both'||(mode==='checkpoint'&&plan)));
  shell.work.append(tabs);
  const answerArea=el('div','math-answer-area'),interactionArea=el('div','math-interaction-area');
  const blockAnswer = el('div','math-block-answer');
  blockAnswer.hidden = true;
  shell.work.append(interactionArea,answerArea);
  if (arrayWithBlocks) shell.work.append(blockAnswer);
  feedback.id=options.legacyIds?'math-feedback':`${prefix}-feedback`;
  const support=el('div','math-support-actions'),hintButton=button('Give me a hint'),showButton=button('Show me how');
  hintButton.dataset.action='hint';showButton.dataset.action='show-solution';
  support.append(hintButton,showButton);shell.footer.append(support);
  shell.connectHelp(hintButton);
  const hintTitle=el('h3'),hintText=el('p'),helpActions=el('div','math-help-actions');
  const hintReading=createReadAloudControl({text:()=>hintTitle.textContent+'. '+hintText.textContent,
    label:'Read the help',canRead:()=>!disposed&&!done&&!locked&&!hintPanel.hidden});
  hintReading.button.dataset.action='read-help';
  const stopReading=()=>{questionReading.stop();hintReading.stop();};
  hintTitle.id=`${prefix}-help-title`;hintTitle.tabIndex=-1;hintText.id=`${prefix}-help-text`;
  hintTitle.setAttribute('aria-describedby',hintText.id);hintPanel.setAttribute('aria-labelledby',hintTitle.id);
  // Automatic hints announce their reasoning without moving an answer control.
  // Explicit help moves to the described heading so its text is read once.
  const helpAnnouncement=el('div','math-sr-only');helpAnnouncement.dataset.mathAnnouncement='help';
  helpAnnouncement.setAttribute('role','status');helpAnnouncement.setAttribute('aria-live','polite');helpAnnouncement.setAttribute('aria-atomic','true');
  root.append(helpAnnouncement);

  const saveWarning=el('p','math-save-warning','This device could not save your practice. Ask a grown-up before closing this page.');
  saveWarning.hidden=true;saveWarning.setAttribute('role','alert');root.append(saveWarning);
  target.replaceChildren(root);

  function save() {
    try { const result=options.onSave(attempt) as unknown; saveWarning.hidden=result!==false; }
    catch { saveWarning.hidden=false; }
  }
  save();
  const on = <T extends EventTarget>(node:T,event:string,handler:EventListener) => node.addEventListener(event,handler,{signal:listeners.signal});
  // Math controls keep their native keyboard behavior without also sending
  // Space, Enter, or arrow keys to the paused game's document handlers.
  on(root,'keydown',event=>event.stopPropagation());on(root,'keyup',event=>event.stopPropagation());
  function reveal(node:HTMLElement,block:ScrollLogicalPosition='nearest') {
    if(disposed||!root.isConnected||!root.getClientRects().length)return false;
    node.scrollIntoView({block,inline:'nearest',behavior:'instant'});return true;
  }
  function focusAndReveal(node:HTMLElement,block:ScrollLogicalPosition='nearest') {
    if(!reveal(node,block))return false;
    node.focus({preventScroll:true});return document.activeElement===node;
  }
  function focusQuestion() {
    if(done||!reveal(title,'start'))return false;
    title.focus({preventScroll:true});return document.activeElement===title;
  }
  function returnToAnswer() {
    const area=!blockAnswer.hidden?blockAnswer:answerArea.hidden?interactionArea:answerArea;
    const control=area.querySelector<HTMLElement>('input:not([hidden]),button:not(:disabled)');
    if(control)focusAndReveal(control,'center');else focusQuestion();
  }
  function presentHelp(heading:string,text:string) {
    stopReading();hintPanel.hidden=false;hintTitle.textContent=heading;hintText.textContent=text;
    helpActions.replaceChildren();hintPanel.replaceChildren(hintTitle,hintText);
    const back=button('Back to my answer');back.dataset.action='back-to-answer';
    on(back,'click',returnToAnswer);helpActions.append(back);
  }
  function complete(outcome:MathActivityResult['outcome'], independent=false) {
    if(disposed||done)return;
    done=true;locked=true;stopReading();
    listeners.abort();questionReading.dispose();hintReading.dispose();
    if(completionTimer)clearTimeout(completionTimer);
    finishAttempt(options.profile,attempt.id,outcome==='shown'?'shown':'completed');save();
    root.querySelectorAll<HTMLButtonElement|HTMLInputElement>('button,input').forEach(node=>node.disabled=true);
    options.onComplete({independent,outcome,attemptId:attempt.id,item,mode});
  }
  function showWorked() {
    if(disposed||done||locked)return;
    hintDepth=Math.max(hintDepth,item.hints.length+1);
    useHint(options.profile,attempt.id,hintDepth);save();
    shell.setHelpState(true);presentHelp('Let’s work it out together',item.workedExample);
    const visual=item.hints.at(-1)?.visual;
    if(visual)hintPanel.append(renderMathVisual(visual));
    const continueButton=button('Continue playing','math-primary');continueButton.dataset.action='continue-supported';
    on(continueButton,'click',()=>complete('shown',false));helpActions.prepend(continueButton);hintPanel.append(helpActions,hintReading.element);
    shell.setFeedback('support', 'Try this idea next time.');
    hintButton.disabled=true;showButton.disabled=true;
    helpAnnouncement.textContent='';focusAndReveal(hintTitle,'start');
  }
  function revealHint(requested=false) {
    if(disposed||done||locked)return;
    if(hintDepth>=item.hints.length){showWorked();return;}
    const hint=item.hints[hintDepth++];useHint(options.profile,attempt.id,hintDepth);save();
    shell.setHelpState(false);presentHelp(`Hint ${hintDepth} of ${item.hints.length}`,hint.text);
    if(hint.visual)hintPanel.append(renderMathVisual(hint.visual));
    if(availableModel && !plan && hintDepth===2 && !options.challenge) {
      mountMathModel(hintPanel,item,availableModel,{submit,isLocked:()=>disposed||done||locked,signal:listeners.signal});
    }
    hintPanel.append(helpActions,hintReading.element);
    hintButton.textContent=hintDepth<item.hints.length?'Another hint':'Show how to finish';
    if(requested){helpAnnouncement.textContent='';focusAndReveal(hintTitle,'start');}
    else helpAnnouncement.textContent=`Hint ${hintDepth}. ${hint.text}`;
  }
  function submit(raw:string) {
    if(disposed||done||locked||instruction&&!instruction.ready())return;stopReading();
    const result=submitAnswer(options.profile,attempt.id,raw);save();
    if(!result.valid){shell.setFeedback('input',result.message||'Enter an answer, then check it.');return;}
    if(result.correct){
      locked=true;
      const independent=result.attempt.independent;
      shell.setFeedback('correct', independent?'That works!':'You worked it out!');
      root.querySelectorAll<HTMLButtonElement|HTMLInputElement>('button,input').forEach(node=>node.disabled=true);
      completionTimer=setTimeout(()=>complete('completed',independent),450);
      return;
    }
    errors++;shell.setFeedback('incorrect','Try another way.');
    if(options.challenge && !early){complete('incorrect',false);return;}
    if(errors>=3){showWorked();return;}
    if(options.profile.hints!==false)revealHint();
  }
  on(hintButton,'click',()=>revealHint(true));on(showButton,'click',showWorked);

  const form=el('form','math-answer-form');form.noValidate=true;
  const input=el('input','math-answer-input');input.id=options.legacyIds?'math-answer':`${prefix}-answer`;
  input.type='text';input.autocomplete='off';input.spellcheck=false;input.maxLength=80;
  input.inputMode=item.answerKind==='number'?'decimal':item.answerKind==='fraction'?'text':'text';
  input.setAttribute('aria-describedby',feedback.id);input.setAttribute('aria-label','Math answer');
  input.placeholder='';
  const inputLabel=el('label',undefined,item.answerKind==='fraction'?'Your fraction':item.unit?`Your answer (${item.unit})`:'Your answer');inputLabel.htmlFor=input.id;
  const submitButton=button('Check answer','math-primary');submitButton.id=options.legacyIds?'math-submit':`${prefix}-submit`;submitButton.type='submit';
  if(early){mountEarlyMath(form,item,submit,options.context?.gameId);}
  else if(item.answerKind==='choice'&&item.choices?.length){
    const choices=el('div','math-choice-grid');choices.setAttribute('role','group');choices.setAttribute('aria-label','Answer choices');
    for(const choice of item.choices){const tile=button(choice.label);tile.dataset.value=choice.value;on(tile,'click',()=>{choices.querySelectorAll('button').forEach(node=>node.setAttribute('aria-pressed',String(node===tile)));submit(choice.value);});choices.append(tile);}
    form.append(choices);input.hidden=true;submitButton.hidden=true;
  }else {
    form.append(inputLabel,input,submitButton);
    if(item.answerKind==='number'||item.answerKind==='fraction') {
      const pad=createNumericKeypad(input,item.answerKind,listeners.signal);
      form.append(pad);
    }
  }
  if(!early && !options.challenge) shell.tools.append(createScratchpad(listeners.signal));
  on(form,'submit',event=>{event.preventDefault();submit(input.value);});answerArea.append(form);

  if(plan) {
    mountMathModel(interactionArea,item,plan,{submit,isLocked:()=>locked||disposed||done,signal:listeners.signal});
  }
  function setPath(interactive:boolean) {
    if (arrayWithBlocks) {
      interactionArea.hidden = false;
      answerArea.hidden = interactive;
      blockAnswer.hidden = !interactive;
      if (interactive && !blockAnswer.childElementCount) {
        mountMathModel(blockAnswer,item,{kind:'blocks',role:'answer'},{submit,isLocked:()=>locked||disposed||done,signal:listeners.signal});
      }
    } else {
      interactionArea.hidden=!interactive || !plan;
      answerArea.hidden=interactive && constructsAnswer;
    }
    // A frame with given counters and an empty fraction line already present
    // their stimulus in the model. Keep the given visible on the written path.
    shell.stimulus.hidden=interactive && (
      (plan?.kind==='frames' && item.parameters.operation==='missing-addend')
      || (plan?.kind==='numberLine' && item.skillId==='g3-fraction-number')
    );
    typeTab.setAttribute('aria-pressed',String(!interactive));
    buildTab.setAttribute('aria-pressed',String(interactive));
  }
  on(typeTab,'click',()=>{setPath(false);returnToAnswer();});on(buildTab,'click',()=>{setPath(true);returnToAnswer();});
  // Showing the model first makes visual-form evidence truthful in both mode,
  // even when the child later chooses the written response for the same item.
  setPath(!arrayWithBlocks && (mode!=='checkpoint'||plan?.role==='explore'));
  // A question is the entry point, including on touch devices. Focusing a text
  // input here would open the software keyboard before the child can read it.
  focusQuestion();

  return {
    item, attemptId:attempt.id, focus:focusQuestion,
    dispose(reason:'interrupted'='interrupted') {
      if(disposed)return;disposed=true;if(completionTimer)clearTimeout(completionTimer);listeners.abort();questionReading.dispose();hintReading.dispose();
      if(!done){finishAttempt(options.profile,attempt.id,reason);save();}
      root.remove();
    },
  };
}
