import {earlyInstruction} from './early/audio';
import {mountEarlyMath} from './early/render';
import {isEarlyGrade} from './grades';
import './early/style.css';
import { beginAttempt, finishAttempt, selectItem, submitAnswer, useHint, type Attempt } from './engine';
import type { LearnerProfile, LearningContext, LearningMode, MathItem } from './types';
import { interactionKind, quantityPlaces, renderMathVisual } from './visuals';
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
const placeName = (place: number) => ({1000000:'millions',100000:'hundred thousands',10000:'ten thousands',1000:'thousands',100:'hundreds',10:'tens',1:'ones',.1:'tenths',.01:'hundredths'} as Record<number,string>)[place] || String(place);

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
  // A quantity/fraction construction is an actual mathematical representation,
  // not evidence of unaided symbolic recall. Choice tiles retain the item form.
  const item: MathItem = mode !== 'checkpoint' && (kind === 'quantity' || kind === 'fraction')
    ? {...initial, id: `${initial.id}:constructed`, representation: 'visual'} : initial;
  const attempt = beginAttempt(options.profile, item, {...options.context, mode});
  let disposed = false, done = false, locked = false, errors = 0, hintDepth = 0;
  let completionTimer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new AbortController();
  const root = el('section','math-activity'); root.dataset.answerKind = item.answerKind; root.dataset.skillId = item.skillId;
  const early=isEarlyGrade(item.grade);root.classList.toggle('early-activity',early);
  root.dataset.mode = mode; root.dataset.attemptId = attempt.id; root.dataset.interactionKind = kind;
  root.setAttribute('role','group'); root.setAttribute('aria-labelledby',`${prefix}-question`);
  const title = el('h2',undefined,item.question); title.id = `${prefix}-question`; title.tabIndex = -1;
  root.append(title);
  const instruction=early?earlyInstruction(()=>item.question,String(options.profile.id),()=>!disposed&&!done&&!locked,
    mode=>{if(attempt.promptDelivery!=='grown-up')attempt.promptDelivery=mode;save();}):null;
  const questionReading = instruction??createReadAloudControl({
    text: () => [item.question,...(item.choices || []).map((choice,index) => `Option ${index+1}: ${choice.label}.`)].join(' '),
    canRead: () => !disposed && !done && !locked,
  });
  root.append(questionReading.element);
  // Keep the useful format instruction when this item has no construction mode.
  if(kind==='answer'&&mode==='interaction')root.append(el('p','math-prompt','Write your answer. Hints can help.'));
  if(item.visual)root.append(renderMathVisual(item.visual));

  const tabs = el('div','math-mode-tabs'); tabs.setAttribute('role','group'); tabs.setAttribute('aria-label','How would you like to answer?');
  const typeTab=button('Write an answer'),buildTab=button(kind==='choice'?'Choose a tile':'Build an answer');
  tabs.append(typeTab,buildTab); tabs.hidden=mode!=='both'||kind==='answer'||kind==='choice';
  root.append(tabs);
  const answerArea=el('div','math-answer-area'),interactionArea=el('div','math-interaction-area');
  root.append(answerArea,interactionArea);
  const feedback=el('p','math-feedback'); feedback.id=options.legacyIds?'math-feedback':`${prefix}-feedback`;
  feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');feedback.setAttribute('aria-atomic','true');
  root.append(feedback);
  const support=el('div','math-support-actions'),hintButton=button('Give me a hint'),showButton=button('Show me how');
  hintButton.dataset.action='hint';showButton.dataset.action='show-solution';support.append(hintButton,showButton);root.append(support);
  const hintPanel=el('section','math-hint');hintPanel.hidden=true;
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
  root.append(hintPanel);
  const saveWarning=el('p','math-save-warning','This device could not save your practice. Ask a grown-up before closing this page.');
  saveWarning.hidden=true;saveWarning.setAttribute('role','alert');root.append(saveWarning);
  target.replaceChildren(root);

  function save() {
    try { const result=options.onSave(attempt) as unknown; if(result===false)saveWarning.hidden=false; }
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
    if(done||!reveal(root,'start'))return false;
    title.focus({preventScroll:true});return document.activeElement===title;
  }
  function returnToAnswer() {
    const area=answerArea.hidden?interactionArea:answerArea;
    const control=area.querySelector<HTMLElement>('input:not([hidden]),button:not(:disabled)');
    if(control)focusAndReveal(control);else focusQuestion();
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
    if(completionTimer)clearTimeout(completionTimer);
    finishAttempt(options.profile,attempt.id,outcome==='shown'?'shown':'completed');save();
    root.querySelectorAll<HTMLButtonElement|HTMLInputElement>('button,input').forEach(node=>node.disabled=true);
    options.onComplete({independent,outcome,attemptId:attempt.id,item,mode});
  }
  function showWorked() {
    if(disposed||done||locked)return;
    hintDepth=Math.max(hintDepth,item.hints.length+1);
    useHint(options.profile,attempt.id,hintDepth);save();
    presentHelp('Let’s work it out together',item.workedExample);
    const visual=item.hints.at(-1)?.visual;
    if(visual)hintPanel.append(renderMathVisual(visual));
    const continueButton=button('Continue playing','math-primary');continueButton.dataset.action='continue-supported';
    on(continueButton,'click',()=>complete('shown',false));helpActions.prepend(continueButton);hintPanel.append(helpActions,hintReading.element);
    feedback.textContent='You can use this example. We’ll try a related idea another time.';feedback.dataset.state='support';
    hintButton.disabled=true;showButton.disabled=true;
    helpAnnouncement.textContent='';focusAndReveal(hintTitle,'start');
  }
  function revealHint(requested=false) {
    if(disposed||done||locked)return;
    if(hintDepth>=item.hints.length){showWorked();return;}
    const hint=item.hints[hintDepth++];useHint(options.profile,attempt.id,hintDepth);save();
    presentHelp(`Hint ${hintDepth} of ${item.hints.length}`,hint.text);
    if(hint.visual)hintPanel.append(renderMathVisual(hint.visual));
    hintPanel.append(helpActions,hintReading.element);
    hintButton.textContent=hintDepth<item.hints.length?'Another hint':'Show how to finish';
    if(requested){helpAnnouncement.textContent='';focusAndReveal(hintTitle,'start');}
    else helpAnnouncement.textContent=`Hint ${hintDepth}. ${hint.text}`;
  }
  function submit(raw:string) {
    if(disposed||done||locked||instruction&&!instruction.ready())return;stopReading();
    const result=submitAnswer(options.profile,attempt.id,raw);save();
    if(!result.valid){feedback.dataset.state='input';feedback.textContent=result.message||'Enter an answer, then check it.';return;}
    if(result.correct){
      locked=true;feedback.dataset.state='correct';
      const independent=result.attempt.independent;
      feedback.textContent=independent?'That works!':'You worked it out with help. That counts as practice.';
      root.querySelectorAll<HTMLButtonElement|HTMLInputElement>('button,input').forEach(node=>node.disabled=true);
      completionTimer=setTimeout(()=>complete('completed',independent),450);
      return;
    }
    errors++;feedback.dataset.state='incorrect';feedback.textContent='Not quite yet. Let’s look at a useful step.';
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
  input.placeholder=item.answerKind==='fraction'?'e.g. 1/2':item.answerKind==='text'?'Your answer':'Answer';
  const inputLabel=el('label',undefined,item.answerKind==='fraction'?'Write a fraction, like 1/2':item.unit?`Your answer (${item.unit})`:'Your answer');inputLabel.htmlFor=input.id;
  const submitButton=button('Check answer','math-primary');submitButton.id=options.legacyIds?'math-submit':`${prefix}-submit`;submitButton.type='submit';
  if(early){mountEarlyMath(form,item,submit);}
  else if(item.answerKind==='choice'&&item.choices?.length){
    const choices=el('div','math-choice-grid');choices.setAttribute('role','group');choices.setAttribute('aria-label','Answer choices');
    for(const choice of item.choices){const tile=button(choice.label);tile.dataset.value=choice.value;on(tile,'click',()=>{choices.querySelectorAll('button').forEach(node=>node.setAttribute('aria-pressed',String(node===tile)));submit(choice.value);});choices.append(tile);}
    form.append(choices);input.hidden=true;submitButton.hidden=true;
  }else form.append(inputLabel,input,submitButton);
  on(form,'submit',event=>{event.preventDefault();submit(input.value);});answerArea.append(form);

  if(kind==='quantity') {
    const mission=el('section','math-interaction');mission.append(el('h3',undefined,'Build the amount'),el('p',undefined,'Change the place-value blocks to make your answer.'));
    const places=quantityPlaces(item),digits=places.map(()=>0),controls=el('div','math-quantity-controls'),picture=el('div'),total=el('output','math-built-number','0');
    total.setAttribute('aria-live','polite');total.setAttribute('aria-label','Amount you built');
    const outputs:HTMLOutputElement[]=[],plusButtons:HTMLButtonElement[]=[],minusButtons:HTMLButtonElement[]=[];
    const value=()=>Number(digits.reduce((sum,digit,i)=>sum+digit*places[i],0).toFixed(2));
    function redraw(){const amount=value();total.textContent=amount.toLocaleString('en-US',{maximumFractionDigits:2});mission.dataset.value=String(amount);outputs.forEach((out,i)=>{out.textContent=String(digits[i]);minusButtons[i].disabled=locked||digits[i]===0;plusButtons[i].disabled=locked||digits[i]===9;});picture.replaceChildren(renderMathVisual({kind:'place-value',value:amount}));}
    places.forEach((place,i)=>{
      const column=el('div','math-place'),name=el('span',undefined,placeName(place)),plus=button('+'),minus=button('−'),count=el('output',undefined,'0');
      plus.setAttribute('aria-label',`Add one ${placeName(place)} block`);minus.setAttribute('aria-label',`Remove one ${placeName(place)} block`);plus.dataset.place=String(place);minus.dataset.place=String(place);plus.dataset.delta='1';minus.dataset.delta='-1';
      on(plus,'click',()=>{if(locked||digits[i]>=9)return;digits[i]++;redraw();});on(minus,'click',()=>{if(locked||digits[i]<=0)return;digits[i]--;redraw();});
      column.append(name,plus,count,minus);controls.append(column);outputs.push(count);plusButtons.push(plus);minusButtons.push(minus);
    });
    const check=button('Use this amount','math-primary');check.dataset.action='check-interaction';on(check,'click',()=>submit(String(value())));
    mission.append(controls,total,picture,check);interactionArea.append(mission);redraw();
  } else if(kind==='fraction') {
    const mission=el('section','math-interaction');mission.append(el('h3',undefined,'Build a fraction'),el('p',undefined,'Choose equal parts, then shade the amount you mean.'));
    let numerator=0,denominator=2;const controls=el('div','math-fraction-controls'),picture=el('div'),total=el('output','math-built-number','0/2');
    total.setAttribute('aria-label','Fraction you built');total.setAttribute('aria-live','polite');
    const outputs:HTMLOutputElement[]=[];const refresh=()=>{outputs[0].textContent=String(numerator);outputs[1].textContent=String(denominator);total.textContent=`${numerator}/${denominator}`;mission.dataset.value=`${numerator}/${denominator}`;picture.replaceChildren(renderMathVisual({kind:'fraction',numerator,denominator}));};
    ['Shaded parts','Equal parts per whole'].forEach((name,i)=>{const part=el('div','math-fraction-part'),label=el('label',undefined,name),minus=button('−'),out=el('output',undefined,i?'2':'0'),plus=button('+');
      minus.setAttribute('aria-label',`Decrease ${name.toLowerCase()}`);plus.setAttribute('aria-label',`Increase ${name.toLowerCase()}`);
      for(const [control,delta] of [[minus,-1],[plus,1]] as const){control.dataset.fractionPart=i?'denominator':'numerator';control.dataset.delta=String(delta);on(control,'click',()=>{if(locked)return;if(i)denominator=Math.max(1,Math.min(12,denominator+delta));else numerator=Math.max(0,Math.min(96,numerator+delta));refresh();});}
      part.append(label,minus,out,plus);controls.append(part);outputs.push(out);
    });
    const check=button('Use this fraction','math-primary');check.dataset.action='check-interaction';on(check,'click',()=>submit(`${numerator}/${denominator}`));
    mission.append(controls,total,picture,check);interactionArea.append(mission);refresh();
  }
  function setPath(interactive:boolean){const usable=kind==='quantity'||kind==='fraction';interactionArea.hidden=!interactive||!usable;answerArea.hidden=interactive&&usable;typeTab.setAttribute('aria-pressed',String(!interactive));buildTab.setAttribute('aria-pressed',String(interactive));}
  on(typeTab,'click',()=>{setPath(false);returnToAnswer();});on(buildTab,'click',()=>{setPath(true);returnToAnswer();});
  // Showing the model first makes visual-form evidence truthful in both mode,
  // even when the child later chooses the written response for the same item.
  setPath(mode!=='checkpoint');
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
