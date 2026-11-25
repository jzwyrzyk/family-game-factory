import {isGrade,isEarlyGrade} from '../learning/grades';
import {getSkill} from '../learning/curriculum';
import {validateFamilyState as validate} from '../storage/family-state';
/* Family Game Factory — local-only, versioned state. No network calls. */
import { profileGrade, validateLearning } from '../learning/engine';
import {validateLanguage} from '../language/engine';
import {LANGUAGE_SKILLS} from '../language/curriculum';
import {adultStorageKey,setAdultWorkspace} from '../adult-pilot/storage';
import {validateLearningRewardOutbox} from '../rewards/integration';
import {validateRewardOutbox,rewardFactId} from '../rewards/model';
import {assertRewardSourceWritable} from '../rewards/write-guard';
(function () {
'use strict';
const FG = window.FG = window.FG || {};
const KEY = 'family-game-factory-state-v1';
const earlyPreview=import.meta.env?.MODE==='early-preview';
const heldGrade=grade=>isEarlyGrade(grade)&&!earlyPreview;
const previewMessage='This learning level needs the early learning preview. A grown-up can switch players or restore a supported backup.';

const profiles = [
  {id:'player1',name:'Explorer 1',icon:'🌟',age:7,grade:1,focus:'add',intensity:'gentle',rate:3,hints:true,punish:false,skills:{},stats:{},mathWindow:[],learningSetupComplete:false},
  {id:'player2',name:'Explorer 2',icon:'🚀',age:9,grade:1,focus:'adaptive',intensity:'gentle',rate:3,hints:true,punish:false,skills:{},stats:{},mathWindow:[],learningSetupComplete:false},
  {id:'player3',name:'Explorer 3',icon:'🦄',age:5,grade:1,focus:'add',intensity:'gentle',rate:2,hints:true,punish:false,skills:{},stats:{},mathWindow:[],learningSetupComplete:false}
];
const learningIntensities = ['gentle','balanced','stretch'];
const empty = () => ({version:1,activeProfile:'player1',profiles:JSON.parse(JSON.stringify(profiles)),feedback:[],createdAt:Date.now()});
function normalize(value){for(const p of value.profiles){p.grade=profileGrade(p);p.intensity=learningIntensities.includes(p.intensity)?p.intensity:'gentle';p.learningSetupComplete=p.learningSetupComplete===true;p.learningSubject=p.learningSubject==='language'?'language':'math';p.allowSubjectSwitch=p.allowSubjectSwitch===true;p.languageFocus=Array.isArray(p.languageFocus)?p.languageFocus.filter(id=>typeof id==='string'&&LANGUAGE_SKILLS.some(s=>s.id===id)).slice(0,12):[];p.rate=Math.max(1,Math.min(8,Number(p.rate)||3));p.mathModes=Object.fromEntries(Object.entries(p.mathModes||{}).filter(([k,v])=>/^[\w:-]{1,160}$/.test(k)&&!['__proto__','constructor','prototype'].includes(k)&&['checkpoint','interaction','both'].includes(v)));p.skillFocus=Array.isArray(p.skillFocus)?p.skillFocus.filter(v=>typeof v==='string'&&getSkill(v)).slice(0,12):[];}return value;}
let loadError=null,recoveryRaw=null;
function load(){
 try{
  const raw=localStorage.getItem(KEY);if(!raw)return empty();recoveryRaw=raw;
  const stored=JSON.parse(raw);
  if(!validate(stored)){
   loadError='Saved progress uses an unsupported format or contains damaged learning history. It has not been reset or overwritten. Export the saved data before restoring a compatible backup.';
   return validate(stored,false)?stored:empty();
  }
  recoveryRaw=null;return normalize(stored);
 }catch(e){
  loadError='Progress could not be loaded. Existing saved data has not been overwritten. Export the saved data or restore a compatible backup before continuing.';
  console.warn('Progress could not be loaded',e);return empty();
 }
}
let data = load(),familyData=null,adultProfileId=null;
function persist(){if(loadError)return false;try{assertRewardSourceWritable();localStorage.setItem(adultStorageKey(KEY),JSON.stringify(data));return true}catch(e){console.warn('Local saving unavailable',e);return false}}
function pendingRewards(owner){if(loadError)throw Error(loadError);const raw=localStorage.getItem(adultStorageKey(KEY));if(!raw)return [];const saved=JSON.parse(raw);if(!validate(saved))throw Error('Saved learning rewards need recovery.');const p=saved.profiles.find(profile=>profile.id===owner);return p?validateRewardOutbox(p.rewardOutbox):[];}
function acknowledgeRewards(owner,ids){assertRewardSourceWritable();const p=data.profiles.find(profile=>profile.id===owner);if(!p)throw Error('Choose the player who earned these rewards.');const prior=p.rewardOutbox;const removed=new Set(ids),next=validateRewardOutbox(prior).filter(fact=>!removed.has(rewardFactId(fact)));if(next.length===validateRewardOutbox(prior).length)return;p.rewardOutbox=next;if(!persist()){p.rewardOutbox=prior;throw Error('The reward was saved, but its activity receipt still needs a retry.');}}
function current(){return data.profiles.find(p=>p.id===data.activeProfile)||data.profiles[0]}
function familyProfiles(){return (familyData||data).profiles;}
// Authorization cleanup changes memory only and must remain possible after a tab
// releases saving ownership. Every durable source write is still guarded.
function leaveAdultProfile(){if(!adultProfileId)return;data=familyData;familyData=null;adultProfileId=null;setAdultWorkspace(null);}
function enterAdultProfile(id){
 assertRewardSourceWritable();
 if(!/^adult:[a-f0-9-]{36}$/i.test(id)||loadError)throw Error('Adult profile could not open.');
 const raw=localStorage.getItem(adultStorageKey(KEY,id));
 const next=raw?JSON.parse(raw):{version:1,activeProfile:id,profiles:[{...JSON.parse(JSON.stringify(profiles[0])),id,name:'Adult',icon:'🛠️',age:18,grade:4,learningSetupComplete:true,learningSubject:'math',allowSubjectSwitch:true}],feedback:[],createdAt:Date.now()};
 if(!validate(next)||next.profiles.length!==1||next.profiles[0].id!==id||next.activeProfile!==id)throw Error('The saved adult workspace needs recovery. Family data has not changed.');
 if(!familyData)familyData=data;
 data=normalize(next);adultProfileId=id;setAdultWorkspace(id);
}
function choose(id){assertRewardSourceWritable();
 const family=familyData||data;
 if(!family.profiles.some(p=>p.id===id))return false;
 if(!window.dispatchEvent(new CustomEvent('factory-profile-before-change',{cancelable:true,detail:{profileId:id}})))return false;
 window.dispatchEvent(new CustomEvent('factory-profile-changing',{detail:{profileId:id}}));
 leaveAdultProfile();data.activeProfile=id;persist();return true;
}
async function changeLearningProfile(patch,stillOpen=()=>true){
 const owner=current();
 if(Object.hasOwn(patch,'grade')&&heldGrade(patch.grade))throw Error(previewMessage);
 if(Object.hasOwn(patch,'grade') && patch.grade!==owner.grade){
 if(!isGrade(patch.grade))throw Error('Choose a listed learning grade.');
 if(!FG.verifyParentSettings)throw Error('Unlock Parent Controls on a trusted family device to change the learning level.');
 await FG.verifyParentSettings();
 }
 if(owner!==current()||!stillOpen()||FG.learning?.active)throw Error('The player or activity changed. Open settings again.');
 applyProfile(patch);
}
function changeProfile(patch){
 if(Object.hasOwn(patch,'grade')&&!isGrade(patch.grade))throw Error('Choose a listed learning grade.');
 if(Object.hasOwn(patch,'grade') && patch.grade!==current().grade)throw Error('Use grown-up settings to change grade.');
 applyProfile(patch);
}
function applyProfile(patch){if(Object.hasOwn(patch,'age')&&(!Number.isInteger(patch.age)||patch.age<3||patch.age>120))throw Error('Choose a valid age.');if(Object.hasOwn(patch,'grade')&&!isGrade(patch.grade))throw Error('Choose a listed learning grade.');if(Object.hasOwn(patch,'intensity')&&!learningIntensities.includes(patch.intensity))throw Error('Choose Gentle, Balanced, or Stretch learning difficulty.');if(Object.hasOwn(patch,'learningSetupComplete')&&typeof patch.learningSetupComplete!=='boolean')throw Error('Choose a valid learning setup state.');if(Object.hasOwn(patch,'learningSubject')&&!['math','language'].includes(patch.learningSubject))throw Error('Choose Math or Language Arts. Learning cannot be turned off.');if(Object.hasOwn(patch,'allowSubjectSwitch')&&typeof patch.allowSubjectSwitch!=='boolean')throw Error('Choose a valid subject setting.');const p=current(),before=JSON.stringify(p);const safeKeys=['name','age','grade','focus','skillFocus','intensity','rate','hints','punish','factTargets','learningSubject','allowSubjectSwitch','languageFocus','learningSetupComplete'];for(const k of safeKeys){if(Object.prototype.hasOwnProperty.call(patch,k))p[k]=patch[k]}
 p.factTargets=Array.isArray(p.factTargets)?p.factTargets.filter(x=>/^mul:(?:[1-9]|1[0-2])x(?:[1-9]|1[0-2])$/.test(x)).slice(0,20):[];p.name=String(p.name).trim().slice(0,24)||'Explorer';p.rate=Math.max(1,Math.min(8,Number(p.rate)||1));p.hints=!!p.hints;p.punish=!!p.punish;normalize({profiles:[p]});if(!persist()){for(const key of Object.keys(p))delete p[key];Object.assign(p,JSON.parse(before));throw Error('Learning settings could not be saved. The previous settings are still active.');}window.dispatchEvent?.(new CustomEvent('factory-learning-settings',{detail:{profileId:p.id}}));}
function choosePracticeSubject(subject){
 if(!['math','language'].includes(subject))throw Error('Choose Math or English.');
 if(loadError)throw Error(loadError);
 if(FG.learning?.active)throw Error('Finish this activity before switching subjects.');
 const p=current();
 if(!p.allowSubjectSwitch)throw Error('A grown-up can enable both subjects in Parent Controls.');
 if(p.learningSubject===subject)return subject;
 const prior=p.learningSubject;p.learningSubject=subject;
 if(!persist()){p.learningSubject=prior;throw Error('Could not save your choice. Try again.');}
 window.dispatchEvent(new CustomEvent('factory-learning-subject',{detail:{profileId:p.id,subject}}));
 return subject;
}
function addFeedback({game,type,idea}){const t=String(idea||'').trim();if(t.length<5)return false;const previous=data.feedback.slice();data.feedback.unshift({id:Date.now()+'-'+Math.random().toString(36).slice(2,5),game:String(game).slice(0,30),type:String(type).slice(0,30),idea:t.slice(0,1500),profile:current().id,createdAt:new Date().toISOString()});data.feedback=data.feedback.slice(0,200);if(!persist()){data.feedback=previous;return false}return true}
function recordGame(game,won,level){const p=current();const s=p.stats[game] ||= {played:0,wins:0,bestLevel:0};s.played++;if(won)s.wins++;if(won)s.bestLevel=Math.max(s.bestLevel,Number(level)||1);persist()}
function validateBackup(raw){const value=JSON.parse(raw);if(!validate(value,false))throw Error('Not a valid Family Game Factory v1 backup');if(new Set(value.profiles.map(p=>p.id)).size!==value.profiles.length)throw Error('This backup repeats a player.');for(const p of value.profiles)if(!validateLearning(p.learning)||!validateLanguage(p.language))throw Error('Learning history in this backup is invalid or unsupported. Existing progress is unchanged.');return normalize(value);}
function backupChangesGrades(value){
 if(value.profiles.some(p=>heldGrade(p.grade)))throw Error(previewMessage);
 return value.profiles.some(p=>{const existing=familyProfiles().find(candidate=>candidate.id===p.id);return !existing||profileGrade(existing)!==profileGrade(p);});
}
function restore(raw){assertRewardSourceWritable();if(adultProfileId)throw Error('Switch to a family profile before restoring a family backup.');const value=validateBackup(raw);if(backupChangesGrades(value))throw Error('Use grown-up backup import to restore learning grades.');delete value.factoryWorkspace;delete value.factoryStudio;delete value.factoryCreation;delete value.factoryCreationRecoveryRaw;delete value.factoryProblemSolving;delete value.factoryProblemSolvingRecoveryRaw;delete value.factoryRewards;delete value.factoryRewardsRecovery;delete value.factoryPals;delete value.factoryPalsRecovery;value.feedback=value.feedback.slice(0,200);try{localStorage.setItem(KEY,JSON.stringify(value))}catch(_){throw Error('Could not restore progress on this device. Existing progress is unchanged.')}data=value;loadError=null;recoveryRaw=null}
FG.store={get data(){return data},get adultProfileId(){return adultProfileId},get loadError(){return loadError||(heldGrade(current()?.grade)?previewMessage:null)},get recoveryRaw(){return recoveryRaw},current,choose,familyProfiles,enterAdultProfile,leaveAdultProfile,changeProfile,changeLearningProfile,choosePracticeSubject,addFeedback,recordGame,pendingRewards,acknowledgeRewards,validateBackup,backupChangesGrades,emptyBackup:()=>normalize(empty()),save:persist,restore,reset:()=>{assertRewardSourceWritable();if(adultProfileId)throw Error('Switch to a family profile before resetting family data.');if(loadError)throw Error('Export the preserved progress or restore a compatible backup before resetting.');const prior=data;data=empty();if(!persist()){data=prior;throw Error('Progress could not be reset. Your saved data is still here.');}}};
})();
