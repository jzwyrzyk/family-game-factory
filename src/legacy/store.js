/* Family Game Factory — local-only, versioned state. No network calls. */
(function () {
'use strict';
const FG = window.FG = window.FG || {};
const KEY = 'family-game-factory-state-v1';
const profiles = [
  {id:'player1',name:'Explorer 1',icon:'🌟',age:7,focus:'add',intensity:'gentle',rate:3,hints:true,punish:false,skills:{},stats:{},mathWindow:[]},
  {id:'player2',name:'Explorer 2',icon:'🚀',age:9,focus:'times8',intensity:'balanced',rate:3,hints:true,punish:false,skills:{},stats:{},mathWindow:[]},
  {id:'player3',name:'Explorer 3',icon:'🦄',age:5,focus:'add',intensity:'gentle',rate:2,hints:true,punish:false,skills:{},stats:{},mathWindow:[]}
];
const empty = () => ({version:1,activeProfile:'player1',profiles:JSON.parse(JSON.stringify(profiles)),feedback:[],createdAt:Date.now()});
function validate(value){
 if (!value || value.version!==1 || !Array.isArray(value.profiles) || !Array.isArray(value.feedback)) return false;
 if(value.profiles.length<1 || value.profiles.length>6 || value.feedback.length>1000) return false;
 return value.profiles.every(p=> typeof p.id==='string' && typeof p.name==='string' && typeof p.skills==='object' && p.skills!==null && typeof p.stats==='object' && p.stats!==null);
}
function load(){try{const raw=localStorage.getItem(KEY); if(!raw)return empty();const data=JSON.parse(raw);return validate(data)?data:empty()}catch(e){console.warn('Progress could not be loaded',e);return empty()}}
let data = load();
function persist(){try{localStorage.setItem(KEY,JSON.stringify(data));return true}catch(e){console.warn('Local saving unavailable',e);return false}}
function current(){return data.profiles.find(p=>p.id===data.activeProfile)||data.profiles[0]}
function choose(id){if(data.profiles.some(p=>p.id===id)){data.activeProfile=id;persist();return true}return false}
function changeProfile(patch){const p=current();const safeKeys=['name','age','focus','intensity','rate','hints','punish','factTargets'];for(const k of safeKeys){if(Object.prototype.hasOwnProperty.call(patch,k))p[k]=patch[k]}
 p.factTargets=Array.isArray(p.factTargets)?p.factTargets.filter(x=>/^mul:(?:[1-9]|1[0-2])x(?:[1-9]|1[0-2])$/.test(x)).slice(0,20):[];p.name=String(p.name).trim().slice(0,24)||'Explorer';p.age=[5,7,9,11].includes(+p.age)?+p.age:7;p.rate=Math.max(0,Math.min(8,Number(p.rate)||0));p.hints=!!p.hints;p.punish=!!p.punish;persist()}
function addFeedback({game,type,idea}){const t=String(idea||'').trim();if(t.length<5)return false;const previous=data.feedback.slice();data.feedback.unshift({id:Date.now()+'-'+Math.random().toString(36).slice(2,5),game:String(game).slice(0,30),type:String(type).slice(0,30),idea:t.slice(0,1500),profile:current().id,createdAt:new Date().toISOString()});data.feedback=data.feedback.slice(0,200);if(!persist()){data.feedback=previous;return false}return true}
function recordGame(game,won,level){const p=current();const s=p.stats[game] ||= {played:0,wins:0,bestLevel:0};s.played++;if(won)s.wins++;if(won)s.bestLevel=Math.max(s.bestLevel,Number(level)||1);persist()}
function restore(raw){const value=JSON.parse(raw);if(!validate(value))throw Error('Not a valid Family Game Factory v1 backup');delete value.factoryWorkspace;value.feedback=value.feedback.slice(0,200);try{localStorage.setItem(KEY,JSON.stringify(value))}catch(_){throw Error('Could not restore progress on this device. Existing progress is unchanged.')}data=value}
FG.store={get data(){return data},current,choose,changeProfile,addFeedback,recordGame,save:persist,restore,reset:()=>{data=empty();persist()}};
})();
