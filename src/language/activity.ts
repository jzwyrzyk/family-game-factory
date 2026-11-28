import {createLearningWorkspace} from '../learning/workspace/shell';
import {profileGrade} from '../learning/engine';
import {decodingDescriptions,positionDescriptions} from './picture-access';
import {mountTileBoard} from './tile-board';
import {literacyInteraction, mountBeatCounter, mountPassage} from './reading-workspace';
import {earlyInstruction} from '../learning/early/audio';
import {picture,hasPicture} from '../learning/early/pictures';
import {isEarlyGrade} from '../learning/grades';
import {setIconLabel,type IconName} from '../brand/icons';
import {beginLanguageAttempt,finishLanguageAttempt,recordLanguageReadAloud,saveCreativeDraft,
  selectLanguageItem,submitLanguageAnswer,useLanguageHint,type LanguageAttempt} from './engine';
import type {LanguageContext,LanguageItem,LanguageProfile,LanguageResult} from './types';
import type {LearningMode} from '../learning/types';
import {createReadAloudControl} from '../speech/read-aloud-control';

export interface LanguageActivityOptions {
  profile:LanguageProfile;context?:LanguageContext;item?:LanguageItem;mode?:LearningMode;
  onComplete(result:LanguageResult):void;onSave(attempt:LanguageAttempt):void;onLeave?:()=>void;leaveLabel?:string;legacyIds?:boolean;
}
let sequence=0;
const make=<K extends keyof HTMLElementTagNameMap>(tag:K,cls?:string,text?:string):HTMLElementTagNameMap[K]=>{
  const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;
};
const button=(text:string,cls?:string,icon?:IconName,iconClass='')=>{const b=make('button',cls,text);b.type='button';if(icon)setIconLabel(b,icon,text,iconClass);return b;};
/** Only the host may mount an educational opportunity or record credit. */
export function mountLanguageActivity(target:HTMLElement,options:LanguageActivityOptions) {
  const prefix='ela-'+(++sequence),mode=options.mode||options.context?.mode||'checkpoint';
  const item=options.item||selectLanguageItem(options.profile,options.context);
  const attempt=beginLanguageAttempt(options.profile,item,{...options.context,mode});
  let disposed=false,done=false,locked=false,wrong=0,hintDepth=0;
  let timer:ReturnType<typeof setTimeout>|undefined;
  const listeners=new AbortController();
  const on=(node:EventTarget,event:string,handler:EventListener)=>node.addEventListener(event,handler,{signal:listeners.signal});
  const interaction= literacyInteraction(item);
  const titleText = interaction === 'punctuation' ? 'Which mark ends this sentence?' : item.question;
  const shell=createLearningWorkspace({subject:'language',grade:profileGrade(options.profile),title:titleText,id:prefix+'-title',
    owner:String(options.profile.id??''),gameId:options.context?.gameId,leaveLabel:options.leaveLabel,onLeave:options.onLeave,signal:listeners.signal});
  const {root,title,work,feedback,helpPanel:hintPanel}=shell;
  root.dataset.skillId=item.skillId;root.dataset.kind=item.kind;root.dataset.interaction=interaction;
  root.dataset.mode=mode;root.dataset.attemptId=attempt.id;
  feedback.id=prefix+'-feedback';
  if(item.passage && interaction!=='fill-gap') mountPassage(shell.stimulus,item,listeners.signal,submit);
  const early=isEarlyGrade(item.grade);root.classList.toggle('early-activity',isEarlyGrade(profileGrade(options.profile)));root.classList.toggle('language-early-item',early);
  if(item.stimulus){
    const stimulus=make('span','early-word');
    if(item.stimulus.startsWith('picture:')){
      const name=item.stimulus.slice(8);
      const illustration=picture(name);
      if(interaction==='fill-gap')illustration.alt=decodingDescriptions[name];
      stimulus.append(illustration);
    } else {
      stimulus.textContent=item.stimulus;
      if(item.domain==='early-reading'){
        stimulus.setAttribute('role','img');
        stimulus.setAttribute('aria-label','Letters '+item.stimulus.toUpperCase().split('').join(', '));
      }
    }
    shell.stimulus.append(stimulus);
  }
  const instruction=early?earlyInstruction(()=>item.question,String(options.profile.id),()=>!disposed&&!done&&!locked,
    mode=>{if(attempt.promptDelivery!=='grown-up')attempt.promptDelivery=mode;save();}):null;
  const directions = interaction==='select-word' ? 'Tap the word in the sentence, then check it.' :
    interaction==='evidence' ? 'Choose a line in the passage. Then check your evidence.' :
    interaction==='creative' ? 'Write your own idea and save your writing.' :
    interaction==='edit' ? 'Read the sentence. Write your corrected sentence, then check it.' :
    item.tiles ? 'Tap the pieces in order. Then check your work.' :
    interaction==='fill-gap'||interaction==='punctuation' ? titleText : 'Read the question and choose your answer.';
  const questionReading=instruction??createReadAloudControl({
    text:()=>directions, label:'Hear directions',canRead:()=>!disposed&&!done&&!locked,
  });
  questionReading.element.classList.add('language-reading-row');
  shell.header.append(questionReading.element);
  const helpControls=make('div','language-help-controls');
  const hintButton=button('Help','language-secondary','help');
  hintButton.dataset.action='hint';
  const showButton=button('Show an example','language-secondary','book');
  showButton.dataset.action='show-solution';helpControls.append(hintButton,showButton);shell.footer.append(helpControls);
  const targetReading=early?null:createReadAloudControl({
    text:()=> [item.question,item.passage,...(item.choices??[]).map(choice=>choice.label)]
      .filter(Boolean).map(part => String(part).replace(/\b(ai|ay|ee|ea|oa|oo|sh|ch|th|wh)\b/gi,
        letters=>'letters '+letters.toUpperCase().split('').join(', '))).join('. '),
    label:'Read with me',canRead:()=>!disposed&&!done&&!locked,
    onStarted:()=>{recordLanguageReadAloud(options.profile,attempt.id);save();},
  });
  if(targetReading){
    targetReading.button.dataset.action='read-target';
    targetReading.notice.classList.add('language-reading-notice');
    shell.footer.append(targetReading.element);
  }
  shell.connectHelp(hintButton);
  const hintTitle=make('h3');hintTitle.id=prefix+'-hint-title';hintTitle.tabIndex=-1;
  const hintText=make('p');hintPanel.append(hintTitle,hintText);
  const hintReading=createReadAloudControl({text:()=>hintTitle.textContent+'. '+hintText.textContent,
    label:'Read the help',buttonClass:'language-secondary',canRead:()=>!disposed&&!done&&!locked&&!hintPanel.hidden});
  hintReading.button.dataset.action='read-help';
  const stopReading=()=>{questionReading.stop();targetReading?.stop();hintReading.stop();};
  const saving=make('p','language-save-warning','Practice could not be saved. Ask a grown-up before leaving this page.');
  saving.hidden=true;saving.setAttribute('role','alert');root.append(saving);
  target.replaceChildren(root);
  on(root,'keydown',event=>event.stopPropagation());
  on(root,'keyup',event=>event.stopPropagation());
  function save() {
    try { const result=options.onSave(attempt) as unknown;saving.hidden=result!==false; }
    catch {saving.hidden=false;}
  }
  save();
  function focus(node:HTMLElement, block:ScrollLogicalPosition='nearest'){
    if(!root.isConnected||!root.getClientRects().length)return;
    node.scrollIntoView({block,inline:'nearest',behavior:'instant'});
    node.focus({preventScroll:true});
  }
  function complete(outcome:LanguageResult['outcome'],independent=false){
    if(disposed||done)return;done=true;locked=true;
    if(timer)clearTimeout(timer);
    const state=outcome==='explored'?'explored':outcome==='shown'?'shown':outcome==='incorrect'?'incorrect':'completed';
    finishLanguageAttempt(options.profile,attempt.id,state);save();
    root.querySelectorAll<HTMLButtonElement|HTMLInputElement|HTMLTextAreaElement>('button,input,textarea').forEach(n=>n.disabled=true);
    stopReading();shell.dispose();
    options.onComplete({independent,outcome,attemptId:attempt.id,item,mode});
  }
  function showWorked(){
    if(disposed||done||locked)return;
    stopReading();shell.setHelpState(true);hintDepth=4;useLanguageHint(options.profile,attempt.id,4);save();
    hintPanel.hidden=false;hintTitle.textContent='Here is how to solve it';hintText.textContent=item.explanation;
    const go=button('Continue my game','language-primary','play');go.dataset.action='continue-supported';
    on(go,'click',()=>complete('shown',false));hintPanel.replaceChildren(hintTitle,hintText,go,hintReading.element);
    hintButton.disabled=true;showButton.disabled=true;
    shell.setFeedback('support','You explored this idea.');
    work.inert=true;shell.stimulus.inert=true;
    focus(hintTitle);
  }
  function hint(explicit=true){
    if(disposed||done||locked)return;
    if(hintDepth>=3){showWorked();return;}
    stopReading();shell.setHelpState(false);hintDepth++;useLanguageHint(options.profile,attempt.id,hintDepth);save();
    root.dataset.languageHint=String(hintDepth);hintPanel.hidden=false;hintTitle.textContent='Hint '+hintDepth+' of 3';
    hintText.textContent=item.hints[hintDepth-1];hintPanel.replaceChildren(hintTitle,hintText,hintReading.element);
    setIconLabel(hintButton,'help',hintDepth>=3?'Show how':'Another hint');
    if(explicit)focus(hintTitle);
  }
  on(hintButton,'click',()=>hint());
  on(showButton,'click',showWorked);
  function submit(raw:string){
    if(disposed||done||locked||hintDepth===4||instruction&&!instruction.ready())return;stopReading();
    const result=submitLanguageAnswer(options.profile,attempt.id,raw);save();
    if(!result.valid){shell.setFeedback('input',result.message||'Choose an answer first.');return;}
    if(result.correct){
      locked=true;shell.setFeedback('correct',result.attempt.independent?'You figured it out!':'You worked through it!');
      root.querySelectorAll<HTMLButtonElement|HTMLInputElement|HTMLTextAreaElement>('button,input,textarea').forEach(n=>n.disabled=true);
      timer=setTimeout(()=>complete('completed',result.attempt.independent),650);
      return;
    }
    wrong++;shell.setFeedback('incorrect',wrong===1?'Try another way.':'A hint can help.');
    if(wrong>=3){showWorked();return;}
    if(options.profile.hints!==false)hint(false);
  }
  if(interaction==='sound-taps'){
    mountBeatCounter(work,item,listeners.signal,submit);
  } else if(interaction==='evidence'||interaction==='select-word'){
    // The reviewable response is submitted directly from the visible passage.
  } else if(item.kind==='choice'&&item.choices){
    const grid=make('div','language-choice-grid');grid.setAttribute('role','group');grid.setAttribute('aria-label','Choose an answer');
    let slot:HTMLElement|undefined, check:HTMLButtonElement|undefined, selected='';
    if(interaction==='fill-gap'||interaction==='punctuation'){
      const text=interaction==='fill-gap'?item.passage!:item.question.split(': ').slice(1).join(': ')+'__';
      const [first,rest]=text.split('__');
      const pattern=make('p','language-pattern');slot=make('span','language-gap','…');
      pattern.append(first,slot,rest??'');shell.stimulus.append(pattern);
      check=button('Check','language-primary','check');check.disabled=true;
      check.dataset.action='check-gap';
      on(check,'click',()=>submit(selected));
    }
    for(const choice of item.choices){
      const b=button(choice.label,'language-choice');
      if(early&&hasPicture(choice.value)){
        const illustration=picture(choice.value);
        if(item.skillId==='k-ela-printed-word')illustration.alt=decodingDescriptions[choice.value];
        b.replaceChildren(illustration);
      }
      if(item.skillId==='k-ela-common-word'){
        b.setAttribute('aria-label',positionDescriptions[choice.value]);
        if(choice.value==='up'||choice.value==='down')b.textContent=choice.value==='up'?'↑':'↓';
        else {b.textContent='';const box=make('span','early-box');box.dataset.position=choice.value;box.append(picture('ball'));b.append(box);}
      }
      b.dataset.value=choice.value;b.setAttribute('aria-pressed','false');
      on(b,'click',()=>{
        for(const other of grid.querySelectorAll('button'))other.setAttribute('aria-pressed',String(other===b));
        if(slot && check){selected=choice.value;slot.textContent=selected;check.disabled=false;}
        else submit(choice.value);
      });
      grid.append(b);
    }
    work.append(grid);if(check)work.append(check);
  } else if((item.kind==='picture-order'||item.kind==='word-tiles'||item.kind==='sentence-tiles')&&item.tiles){
    mountTileBoard(work,item,listeners.signal,()=>!locked&&!done&&!disposed,submit);
  } else if(item.kind==='edit'){
    const form=make('form','language-edit-form');form.noValidate=true;
    const label=make('label',undefined,'Write the corrected sentence');
    const field=make('textarea','language-edit-input');field.id=prefix+'-edit';field.rows=3;field.spellcheck=false;field.autocapitalize='off';
    field.autocomplete='off';field.maxLength=200;field.setAttribute('aria-describedby',feedback.id);
    label.htmlFor=field.id;
    // Only an explicit source sentence from the question may seed the revision.
    const sourceSentence=item.question.split(': ')[1];
    if(sourceSentence && sourceSentence!==item.answer)field.value=sourceSentence;
    const check=button('Check my sentence','language-primary','check');check.type='submit';
    on(form,'submit',ev=>{ev.preventDefault();submit(field.value);});
    form.append(label,field,check);work.append(form);
  } else if(item.kind==='creative'){
    helpControls.hidden=true;
    const form=make('form','language-creative-form');form.noValidate=true;
    const label=make('label',undefined,'Your writing');
    const field=make('textarea','language-creative-input');field.id=prefix+'-write';
    field.maxLength=1200;field.rows=5;label.htmlFor=field.id;
    const go=button('Save my writing and keep playing','language-primary','save');go.type='submit';
    on(form,'submit',ev=>{
      ev.preventDefault();
      const result=saveCreativeDraft(options.profile,attempt.id,field.value);
      if(!result.valid){shell.setFeedback('input',result.message||'Write your idea first.');return;}
      save();complete('explored',false);
    });
    form.append(label,field,go);work.append(form);
  } else throw Error('Unsupported reviewed language interaction.');
  // Focus the question, not the input: no surprise software keyboard on tablets.
  // When My Powers opens a question below the fold, leave room for the
  // passage or construction controls beneath it on the first screen.
  const initialBlock = target.closest('#page-lab') && work.getBoundingClientRect().top >= innerHeight ? 'start' : 'nearest';
  focus(title, initialBlock);
  return {
    item,attemptId:attempt.id,focus:()=>{focus(title);return true;},
    dispose(reason:'interrupted'='interrupted'){
      if(disposed)return;disposed=true;
      if(timer)clearTimeout(timer);listeners.abort();
      questionReading.dispose();targetReading?.dispose();hintReading.dispose();shell.dispose();
      if(!done){finishLanguageAttempt(options.profile,attempt.id,reason);save();}
      root.remove();
    },
  };
}
