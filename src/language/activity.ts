import {setIconLabel,type IconName} from '../brand/icons';
import {beginLanguageAttempt,finishLanguageAttempt,recordLanguageReadAloud,saveCreativeDraft,
  selectLanguageItem,submitLanguageAnswer,useLanguageHint} from './engine';
import type {LanguageContext,LanguageItem,LanguageProfile,LanguageResult} from './types';
import type {LearningMode} from '../learning/types';

export interface LanguageActivityOptions {
  profile:LanguageProfile;context?:LanguageContext;item?:LanguageItem;mode?:LearningMode;
  onComplete(result:LanguageResult):void;onSave():void;onLeave?:()=>void;legacyIds?:boolean;
}
let sequence=0;
const make=<K extends keyof HTMLElementTagNameMap>(tag:K,cls?:string,text?:string):HTMLElementTagNameMap[K]=>{
  const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;
};
const button=(text:string,cls?:string,icon?:IconName,iconClass='')=>{const b=make('button',cls,text);b.type='button';if(icon)setIconLabel(b,icon,text,iconClass);return b;};
const purposeLabel=(purpose?:string)=>purpose==='review'?'MEMORY QUEST':purpose==='prerequisite'?'BUILD A FOUNDATION':
  purpose==='confidence'?'YOU KNOW THIS ONE':'LANGUAGE QUEST';
/** Only the host may mount an educational opportunity or record credit. */
export function mountLanguageActivity(target:HTMLElement,options:LanguageActivityOptions) {
  const prefix='ela-'+(++sequence),mode=options.mode||options.context?.mode||'checkpoint';
  const item=options.item||selectLanguageItem(options.profile,options.context);
  const attempt=beginLanguageAttempt(options.profile,item,{...options.context,mode});
  let disposed=false,done=false,locked=false,wrong=0,hintDepth=0;
  let timer:ReturnType<typeof setTimeout>|undefined;
  const listeners=new AbortController();
  const on=(node:EventTarget,event:string,handler:EventListener)=>node.addEventListener(event,handler,{signal:listeners.signal});
  const root=make('section','language-activity');
  root.dataset.subject='language';root.dataset.skillId=item.skillId;root.dataset.kind=item.kind;
  root.dataset.mode=mode;root.dataset.attemptId=attempt.id;
  root.setAttribute('role','group');root.setAttribute('aria-labelledby',prefix+'-title');
  const eyebrow=make('div','language-eyebrow',mode==='interaction'?'WORD POWER MISSION':purposeLabel(item.purpose));
  const title=make('h2','language-question',item.question);title.id=prefix+'-title';title.tabIndex=-1;
  const subtitle=make('p','language-skill','Grade '+item.grade+' · '+item.title);
  const lead=make('p','language-lead',item.kind==='creative'?
    'Your ideas are yours. This writing adventure has no right-or-wrong grade.':
    'Think it through. Help is always here if you need it.');
  if(options.onLeave){
    const top=make('div','language-topbar');
    const leave=button('Back to Games','language-leave','arrow','jems-icon--back');leave.dataset.action='leave-game';
    on(leave,'click',()=>{if(!disposed&&!done)options.onLeave?.();});
    top.append(leave);root.append(top);
  }
  root.append(eyebrow,subtitle,title,lead);
  if(item.passage){
    const story=make('section','language-passage');
    story.setAttribute('aria-label','Read this passage');
    const passageLabel=make('p','language-passage-label');setIconLabel(passageLabel,'book','READ THE CLUE');
    story.append(passageLabel,make('p','language-story-text',item.passage));
    root.append(story);
  }
  const support=make('div','language-reading-row');
  const readBtn=button('Read this to me','language-secondary','volume');
  readBtn.dataset.action='read-aloud';
  const speechAvailable=typeof window.speechSynthesis!=='undefined'&&typeof window.SpeechSynthesisUtterance!=='undefined';
  if(speechAvailable) {
    const note=make('small',undefined,'Reading support is recorded separately from independent reading.');
    on(readBtn,'click',()=>{
      if(disposed||done)return;
      try {
        window.speechSynthesis.cancel();
        const choices=item.choices?.map((choice,index)=>
          ' Option '+(index+1)+': '+choice.label+'.').join('')||'';
        const utterance=new SpeechSynthesisUtterance(
          (item.passage?item.passage+'. ':'')+item.question+'.'+choices);
        utterance.lang='en-US';utterance.rate=.85;
        window.speechSynthesis.speak(utterance);
        recordLanguageReadAloud(options.profile,attempt.id);save();
      } catch {readingNotice.textContent='Audio could not start. You can still read the text or ask a grown-up.';}
    });
    support.append(readBtn,note);
  }
  const readingNotice=make('p','language-reading-notice');
  root.append(support,readingNotice);
  const work=make('div','language-work');root.append(work);
  const feedback=make('p','language-feedback');feedback.id=prefix+'-feedback';
  feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
  root.append(feedback);
  const helpControls=make('div','language-help-controls');
  const hintButton=button('A little hint','language-secondary','help');
  hintButton.dataset.action='hint';
  const showButton=button('Show an example','language-secondary','book');
  showButton.dataset.action='show-solution';helpControls.append(hintButton,showButton);root.append(helpControls);
  const hintPanel=make('section','language-hint');hintPanel.hidden=true;
  const hintTitle=make('h3');hintTitle.id=prefix+'-hint-title';hintTitle.tabIndex=-1;
  const hintText=make('p');hintPanel.append(hintTitle,hintText);
  root.append(hintPanel);
  const saving=make('p','language-save-warning','Practice could not be saved. Ask a grown-up before leaving this page.');
  saving.hidden=true;saving.setAttribute('role','alert');root.append(saving);
  target.replaceChildren(root);
  on(root,'keydown',event=>event.stopPropagation());
  on(root,'keyup',event=>event.stopPropagation());
  function save() {
    try { const result=options.onSave() as unknown;if(result===false)saving.hidden=false; }
    catch {saving.hidden=false;}
  }
  save();
  function focus(node:HTMLElement){
    if(!root.isConnected||!root.getClientRects().length)return;
    node.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
    node.focus({preventScroll:true});
  }
  function complete(outcome:LanguageResult['outcome'],independent=false){
    if(disposed||done)return;done=true;locked=true;
    if(timer)clearTimeout(timer);
    const state=outcome==='explored'?'explored':outcome==='shown'?'shown':outcome==='incorrect'?'incorrect':'completed';
    finishLanguageAttempt(options.profile,attempt.id,state);save();
    root.querySelectorAll<HTMLButtonElement|HTMLInputElement|HTMLTextAreaElement>('button,input,textarea').forEach(n=>n.disabled=true);
    window.speechSynthesis?.cancel();
    options.onComplete({independent,outcome,attemptId:attempt.id,item,mode});
  }
  function showWorked(){
    if(disposed||done||locked)return;
    hintDepth=4;useLanguageHint(options.profile,attempt.id,4);save();
    hintPanel.hidden=false;hintTitle.textContent='Here is how to solve it';hintText.textContent=item.explanation;
    const go=button('Continue my game','language-primary','play');go.dataset.action='continue-supported';
    on(go,'click',()=>complete('shown',false));hintPanel.replaceChildren(hintTitle,hintText,go);
    hintButton.disabled=true;showButton.disabled=true;
    feedback.dataset.state='support';feedback.textContent='You explored this idea. You can try a new one another time.';
    focus(hintTitle);
  }
  function hint(explicit=true){
    if(disposed||done||locked)return;
    if(hintDepth>=3){showWorked();return;}
    hintDepth++;useLanguageHint(options.profile,attempt.id,hintDepth);save();
    hintPanel.hidden=false;hintTitle.textContent='Hint '+hintDepth+' of 3';
    hintText.textContent=item.hints[hintDepth-1];hintPanel.replaceChildren(hintTitle,hintText);
    setIconLabel(hintButton,'help',hintDepth>=3?'Show how':'Another hint');
    if(explicit)focus(hintTitle);
  }
  on(hintButton,'click',()=>hint());
  on(showButton,'click',showWorked);
  function submit(raw:string){
    if(disposed||done||locked)return;
    const result=submitLanguageAnswer(options.profile,attempt.id,raw);save();
    if(!result.valid){feedback.dataset.state='input';feedback.textContent=result.message||'Choose an answer first.';return;}
    if(result.correct){
      locked=true;feedback.dataset.state='correct';
      setIconLabel(feedback,'check',result.attempt.independent?'You figured it out!':'Nice work exploring that with help!');
      root.querySelectorAll<HTMLButtonElement|HTMLInputElement|HTMLTextAreaElement>('button,input,textarea').forEach(n=>n.disabled=true);
      timer=setTimeout(()=>complete('completed',result.attempt.independent),650);
      return;
    }
    wrong++;feedback.dataset.state='incorrect';
    feedback.textContent=wrong===1?'Not quite. Try looking at the clue again.':'Still learning! A hint can help.';
    if(wrong>=3){showWorked();return;}
    if(options.profile.hints!==false)hint(false);
  }
  if(item.kind==='choice'&&item.choices){
    const grid=make('div','language-choice-grid');grid.setAttribute('role','group');grid.setAttribute('aria-label','Choose an answer');
    for(const choice of item.choices){
      const b=button(choice.label,'language-choice');
      b.dataset.value=choice.value;
      on(b,'click',()=>{
        for(const other of grid.querySelectorAll('button'))other.setAttribute('aria-pressed',String(other===b));
        submit(choice.value);
      });
      grid.append(b);
    }
    work.append(grid);
  } else if((item.kind==='word-tiles'||item.kind==='sentence-tiles')&&item.tiles){
    const sentence=item.kind==='sentence-tiles';
    const selected:number[]=[];const tray=make('div','language-tile-tray');
    const output=make('output','language-built');output.setAttribute('aria-live','polite');
    output.setAttribute('aria-label',sentence?'Sentence you built':'Word you built');
    const hint=make('p','language-tile-instruction',sentence?'Tap the words in the order they belong.':'Tap the letters to build the word.');
    const tiles=item.tiles.map((token,i)=>{
      const b=button(token,'language-tile');b.dataset.tile=String(i);
      on(b,'click',()=>{if(locked||selected.includes(i))return;selected.push(i);redraw();});
      tray.append(b);return b;
    });
    function assembled(){return selected.map(i=>item.tiles![i]).join(sentence?' ':'');}
    function redraw(){
      const text=assembled();output.textContent=text||'Your '+(sentence?'sentence':'word')+' will appear here';
      tiles.forEach((b,i)=>b.disabled=locked||selected.includes(i));
      check.disabled=locked||selected.length===0;
      undo.disabled=locked||selected.length===0;
      clear.disabled=locked||selected.length===0;
    }
    const controls=make('div','language-tile-actions');
    const undo=button('Undo last','language-secondary','undo'),clear=button('Clear','language-secondary','close');
    const check=button('Check my '+(sentence?'sentence':'word'),'language-primary','check');
    check.dataset.action='check-tiles';
    on(undo,'click',()=>{selected.pop();redraw();});
    on(clear,'click',()=>{selected.length=0;redraw();});
    on(check,'click',()=>submit(assembled()));
    controls.append(undo,clear,check);work.append(hint,output,tray,controls);redraw();
  } else if(item.kind==='edit'){
    const form=make('form','language-edit-form');form.noValidate=true;
    const label=make('label',undefined,'Write the corrected sentence');
    const field=make('input','language-edit-input');field.id=prefix+'-edit';field.type='text';
    field.autocomplete='off';field.maxLength=200;field.setAttribute('aria-describedby',feedback.id);
    label.htmlFor=field.id;
    const check=button('Check my sentence','language-primary','check');check.type='submit';
    on(form,'submit',ev=>{ev.preventDefault();submit(field.value);});
    form.append(label,field,check);work.append(form);
  } else if(item.kind==='creative'){
    helpControls.hidden=true;
    const form=make('form','language-creative-form');form.noValidate=true;
    const label=make('label',undefined,'Write your idea (no grade)');
    const field=make('textarea','language-creative-input');field.id=prefix+'-write';
    field.maxLength=1200;field.rows=5;label.htmlFor=field.id;
    const note=make('p','language-creative-note','You are the author. There is no automatic score for imagination or writing quality.');
    const go=button('Save my writing and keep playing','language-primary','save');go.type='submit';
    on(form,'submit',ev=>{
      ev.preventDefault();
      const result=saveCreativeDraft(options.profile,attempt.id,field.value);
      if(!result.valid){feedback.dataset.state='input';feedback.textContent=result.message||'Write your idea first.';return;}
      save();complete('explored',false);
    });
    form.append(label,field,note,go);work.append(form);
  } else throw Error('Unsupported reviewed language interaction.');
  // Focus the question, not the input: no surprise software keyboard on tablets.
  focus(title);
  return {
    item,attemptId:attempt.id,focus:()=>{focus(title);return true;},
    dispose(reason:'interrupted'='interrupted'){
      if(disposed)return;disposed=true;
      if(timer)clearTimeout(timer);listeners.abort();
      window.speechSynthesis?.cancel();
      if(!done){finishLanguageAttempt(options.profile,attempt.id,reason);save();}
      root.remove();
    },
  };
}
