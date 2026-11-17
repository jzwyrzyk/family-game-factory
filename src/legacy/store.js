/* Family Game Factory — local-only, versioned state. No network calls. */
import { profileGrade, validateLearning } from '../learning/engine';
import {validateLanguage} from '../language/engine';
import {LANGUAGE_SKILLS} from '../language/curriculum';
(function () {
'use strict';
const FG = window.FG = window.FG || {};
const KEY = 'family-game-factory-state-v1';
const profiles = [
  {id:'player1',name:'Explorer 1',icon:'🌟',age:7,grade:1,focus:'add',intensity:'gentle',rate:3,hints:true,punish:false,skills:{},stats:{},mathWindow:[]},
  {id:'player2',name:'Explorer 2',icon:'🚀',age:9,grade:3,focus:'times8',intensity:'balanced',rate:3,hints:true,punish:false,skills:{},stats:{},mathWindow:[]},
  {id:'player3',name:'Explorer 3',icon:'🦄',age:5,grade:1,focus:'add',intensity:'gentle',rate:2,hints:true,punish:false,skills:{},stats:{},mathWindow:[]}
];
const empty = () => ({version:1,activeProfile:'player1',profiles:JSON.parse(JSON.stringify(profiles)),feedback:[],createdAt:Date.now()});
function validate(value,checkLearning=true){
 if (!value || value.version!==1 || !Array.isArray(value.profiles) || !Array.isArray(value.feedback)) return false;
 if(value.profiles.length<1 || value.profiles.length>6 || value.feedback.length>1000) return false;
 return value.profiles.every(p=> p&&typeof p.id==='string' && typeof p.name==='string' && typeof p.skills==='object' && p.skills!==null && !Array.isArray(p.skills) && typeof p.stats==='object' && p.stats!==null && (p.grade===undefined||[1,2,3,4].includes(p.grade)) && (p.learningSubject===undefined||['math','language'].includes(p.learningSubject)) && (p.allowSubjectSwitch===undefined||typeof p.allowSubjectSwitch==='boolean') && (!checkLearning||(validateLearning(p.learning)&&validateLanguage(p.language))));
}
function normalize(value){for(const p of value.profiles){p.grade=profileGrade(p);p.learningSubject=p.learningSubject==='language'?'language':'math';p.allowSubjectSwitch=p.allowSubjectSwitch===true;p.languageFocus=Array.isArray(p.languageFocus)?p.languageFocus.filter(id=>typeof id==='string'&&LANGUAGE_SKILLS.some(s=>s.id===id)).slice(0,12):[];p.rate=Math.max(1,Math.min(8,Number(p.rate)||3));p.mathModes=Object.fromEntries(Object.entries(p.mathModes||{}).filter(([k,v])=>/^[\w:-]{1,160}$/.test(k)&&!['__proto__','constructor','prototype'].includes(k)&&['checkpoint','interaction','both'].includes(v)));p.skillFocus=Array.isArray(p.skillFocus)?p.skillFocus.filter(v=>typeof v==='string'&&/^g[1-4]-[a-z0-9-]+$/.test(v)).slice(0,12):[];}return value;}
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
let data = load();
function persist(){if(loadError)return false;try{localStorage.setItem(KEY,JSON.stringify(data));return true}catch(e){console.warn('Local saving unavailable',e);return false}}
function current(){return data.profiles.find(p=>p.id===data.activeProfile)||data.profiles[0]}
function choose(id){if(data.profiles.some(p=>p.id===id)){data.activeProfile=id;persist();return true}return false}
function changeProfile(patch){if(Object.hasOwn(patch,'learningSubject')&&!['math','language'].includes(patch.learningSubject))throw Error('Choose Math or Language Arts. Learning cannot be turned off.');if(Object.hasOwn(patch,'allowSubjectSwitch')&&typeof patch.allowSubjectSwitch!=='boolean')throw Error('Choose a valid subject setting.');const p=current(),before=JSON.stringify(p);const safeKeys=['name','age','grade','focus','skillFocus','intensity','rate','hints','punish','factTargets','learningSubject','allowSubjectSwitch','languageFocus'];for(const k of safeKeys){if(Object.prototype.hasOwnProperty.call(patch,k))p[k]=patch[k]}
 p.factTargets=Array.isArray(p.factTargets)?p.factTargets.filter(x=>/^mul:(?:[1-9]|1[0-2])x(?:[1-9]|1[0-2])$/.test(x)).slice(0,20):[];p.name=String(p.name).trim().slice(0,24)||'Explorer';p.age=[5,7,9,11].includes(+p.age)?+p.age:7;p.grade=[1,2,3,4].includes(+p.grade)?+p.grade:1;p.rate=Math.max(1,Math.min(8,Number(p.rate)||1));p.hints=!!p.hints;p.punish=!!p.punish;normalize({profiles:[p]});if(!persist()){for(const key of Object.keys(p))delete p[key];Object.assign(p,JSON.parse(before));throw Error('Learning settings could not be saved. The previous settings are still active.');}}
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
function restore(raw){const value=JSON.parse(raw);if(!validate(value,false))throw Error('Not a valid Family Game Factory v1 backup');for(const p of value.profiles)if(!validateLearning(p.learning)||!validateLanguage(p.language))throw Error('Learning history in this backup is invalid or unsupported. Existing progress is unchanged.');normalize(value);delete value.factoryWorkspace;value.feedback=value.feedback.slice(0,200);try{localStorage.setItem(KEY,JSON.stringify(value))}catch(_){throw Error('Could not restore progress on this device. Existing progress is unchanged.')}data=value;loadError=null;recoveryRaw=null}
FG.store={get data(){return data},get loadError(){return loadError},get recoveryRaw(){return recoveryRaw},current,choose,changeProfile,choosePracticeSubject,addFeedback,recordGame,save:persist,restore,reset:()=>{if(loadError)throw Error('Export the preserved progress or restore a compatible backup before resetting.');data=empty();persist()}};
})();
