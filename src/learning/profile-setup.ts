/// <reference types="vite/client" />
import {selectableGrades, gradeLabel, parseGradeOption} from './grades';
import {profileGrade} from './engine';
import type {LearnerProfile} from './types';
import './profile-setup.css';

const difficulties = {gentle:'Gentle', balanced:'Balanced', stretch:'Stretch'} as const;
const node = <K extends keyof HTMLElementTagNameMap>(tag:K, text='') => {
  const element=document.createElement(tag);element.textContent=text;return element;
};

/** One small editor of the existing profile, not a second settings store. */
export function installLearningProfileSetup() {
  const FG=(window as any).FG;
  if(!FG?.store||FG.learningProfiles)return FG?.learningProfiles;
  const summary=node('section');summary.id='learningProfileSummary';summary.className='learning-profile-summary';
  summary.setAttribute('aria-label','Learning level for this player');
  const description=node('p'),edit=node('button');edit.type='button';edit.id='learningProfileEdit';
  summary.append(description,edit);
  document.getElementById('profile-choices')?.append(summary);

  const dialog=node('dialog');dialog.id='learningProfileDialog';dialog.className='learning-profile-dialog';
  dialog.setAttribute('aria-labelledby','learningProfileTitle');
  const title=node('h2');title.id='learningProfileTitle';
  const form=node('form');form.noValidate=false;
  const gradeFieldLabel=node('label','Learning grade');gradeFieldLabel.htmlFor='learningProfileGrade';
  const grade=node('select');grade.id='learningProfileGrade';grade.required=true;
  for(const value of selectableGrades(import.meta.env.MODE === "early-preview")){const option=node('option',gradeLabel(value));option.value=String(value);grade.append(option);}
  const difficultyLabel=node('label','Learning difficulty');difficultyLabel.htmlFor='learningProfileDifficulty';
  const difficulty=node('select');difficulty.id='learningProfileDifficulty';difficulty.required=true;
  for(const [value,label] of Object.entries(difficulties)){const option=node('option',label);option.value=value;difficulty.append(option);}
  const explanation=node('p','For Math and English. Questions stay at or below this grade, even on Stretch.');
  explanation.id='learningProfileHelp';grade.setAttribute('aria-describedby',explanation.id);difficulty.setAttribute('aria-describedby',explanation.id);
  const error=node('p');error.id='learningProfileError';error.setAttribute('role','alert');error.hidden=true;
  const actions=node('div');actions.className='learning-profile-actions';
  const cancel=node('button','Not now');cancel.type='button';cancel.id='learningProfileCancel';
  const save=node('button','Save learning level');save.type='submit';save.id='learningProfileSave';save.className='learning-profile-save';
  actions.append(cancel,save);form.append(gradeFieldLabel,grade,difficultyLabel,difficulty,explanation,error,actions);dialog.append(title,form);document.body.append(dialog);
  let owner='',priorFocus:HTMLElement|null=null;

  function refresh() {
    // Profile buttons are rebuilt after selection/renaming; retain this one control.
    document.getElementById('profile-choices')?.append(summary);
    const profile:LearnerProfile=FG.store.current();
    const adult=!!FG.store.adultProfileId;
    summary.hidden=adult;
    description.textContent=`${gradeLabel(profileGrade(profile))} · ${difficulties[profile.intensity as keyof typeof difficulties]||'Gentle'}`;
    edit.textContent=profile.learningSetupComplete?'Change learning level':'Set learning level';
    edit.setAttribute('aria-label',`${edit.textContent} for ${profile.name||'this player'}. ${description.textContent}`);
    edit.disabled=!!FG.store.loadError||!!FG.learning?.active;
    edit.title=FG.learning?.active?'Finish or leave this activity before changing the learning level.':'';
    const heading=document.getElementById('parentLearningProfile'),note=document.getElementById('parentLearningSummary');
    if(heading)heading.textContent=`Learning settings for ${profile.name||'this player'}`;
    if(note)note.textContent=description.textContent+(profile.learningSetupComplete?'':' · Choose a level and save to finish setup.');
  }
  function close(restoreFocus=true) {
    if(dialog.open)dialog.close();
    owner='';
    if(restoreFocus&&priorFocus?.isConnected&&!priorFocus.closest('[hidden],.hidden'))priorFocus.focus({preventScroll:true});
    priorFocus=null;
  }
  function open() {
    if(FG.store.loadError||FG.store.adultProfileId||FG.learning?.active)return false;
    const profile:LearnerProfile=FG.store.current();owner=String(profile.id);
    priorFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
    title.textContent=`Learning level for ${profile.name||'this player'}`;
    grade.value=String(profileGrade(profile));difficulty.value=profile.intensity&&Object.hasOwn(difficulties,profile.intensity)?profile.intensity:'gentle';
    error.hidden=true;error.textContent='';
    if(!dialog.open)dialog.showModal();grade.focus();return true;
  }
  edit.onclick=open;cancel.onclick=()=>close();
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  // A late save can never target the next child or the separate Adult workspace.
  window.addEventListener('factory-profile-changing',()=>close(false));
  window.addEventListener('factory-profile',()=>{close(false);refresh();});
  window.addEventListener('factory-profile-choices',refresh);
  window.addEventListener('factory-learning-settings',refresh);
  window.addEventListener('factory-learning-active',refresh);
  form.onsubmit=async event=>{
    event.preventDefault();
    if(!owner||owner!==String(FG.store.current().id)||FG.store.adultProfileId){close(false);return;}
    try{
      await FG.store.changeLearningProfile({grade:parseGradeOption(grade.value),intensity:difficulty.value,learningSetupComplete:true});
      FG.parentDashboard?.refresh();refresh();close();
    }catch(cause){error.textContent=cause instanceof Error?cause.message:'Could not save this level. Try again.';error.hidden=false;}
  };
  refresh();
  FG.learningProfiles={open,refresh};
  return FG.learningProfiles;
}
