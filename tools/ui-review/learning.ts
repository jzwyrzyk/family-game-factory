/** Offline owner review only. Exercise trusted curriculum, attempts, and DOM controls. */
import {generateItem} from '../../src/learning/content';
import {generateLanguageItem} from '../../src/language/content';

export type LearningSample = {
  action:string; label:string; subject:'math'|'language'; grade:number; skill:string;
  tier?:number; random?:number; state?:'selected'|'incorrect'|'correct'|'hint'|'worked'|'voice'|'save-failure'|'tools';
};
const themes = new Set(['math-lab','factory','mining','gum','dragon']);

export function openLearningSample(sample:LearningSample, theme:string, grade:number) {
  const fg=(window as any).FG;
  const profile=fg.store.current();
  profile.grade=grade;
  profile.learningSubject=sample.subject;
  profile.allowSubjectSwitch=true;
  fg.app.page('lab');
  const target=document.getElementById('lab-question')!;
  document.getElementById('lab-controls')!.replaceChildren();
  const options={random:()=>sample.random??0.41,tier:sample.tier??0};
  const item=sample.subject==='math'
    ? generateItem(sample.skill,{...options,representation:'visual'})
    : generateLanguageItem(sample.skill,options);
  const gameId=themes.has(theme)?theme:'math-lab';

  // This failure injection lives only inside the synthetic iframe. Exercise
  // ordinary save warning, retry, and recovery through the learning host.
  const originalSave=fg.store.save;
  if(sample.state==='save-failure')fg.store.save=()=>false;
  try {
    const start=performance.now();
    fg.learning.mount(target,{
      profile,item,mode:'both',context:{mode:'both',opportunity:'practice',gameId},
      onLeave:()=>{fg.learning.dispose();fg.studio.home();},
      onComplete:()=>{
        const again=document.createElement('button');
        again.className='btn primary';again.textContent='Try again';
        again.onclick=()=>openLearningSample(sample,theme,grade);
        document.getElementById('lab-controls')!.replaceChildren(again);
      }
    });
    performance.clearMeasures('review-learning-mount');
    performance.measure('review-learning-mount',{start,end:performance.now()});
  } finally {
    if(sample.state==='save-failure')fg.store.save=originalSave;
  }

  const action=(selector:string)=>{
    const button=target.querySelector<HTMLButtonElement>(selector);
    if(!button)throw Error('Review control missing for '+sample.action+': '+selector);
    button.click();
  };
  switch(sample.state){
    case 'hint': action('[data-action="hint"]');break;
    case 'worked': action('[data-action="show-solution"]');break;
    case 'voice': action('[data-action="read-aloud"]');break;
    case 'tools': {
      const changeEntry=target.querySelector<HTMLButtonElement>('.math-mode-tabs:not([hidden]) button');
      changeEntry?.click();
      action('.learning-scratchpad summary');
      break;
    }
    case 'selected': action('[data-tile]');break;
    case 'incorrect':
    case 'correct': {
      const choice=item.choices?.find(choice=>(choice.value===item.answer)===(sample.state==='correct'));
      if(!choice)throw Error('Review stimulus has no matching choice.');
      action('[data-value="'+CSS.escape(choice.value)+'"]');
      break;
    }
  }
}
