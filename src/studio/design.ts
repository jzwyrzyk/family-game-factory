/** Child-authored intentions, independent experiments and bounded coach contracts.
 * No credentials, executable code, learning scores or inferred emotions belong here.
 */
import type {Candidate} from './notebook';
export const PLAN_FIELDS = ['fun','action','goal','setback','score','style','progression','special'] as const;
export type PlanField = typeof PLAN_FIELDS[number];
export type Origin = 'child'|'helper';
export interface DesignField {value:string; origin:Origin; accepted:boolean; delegated:boolean}
export interface Idea {id:string; text:string; origin:Origin; adopted:boolean}
export interface Observation {id:string; experimentId:string|null; text:string; source:'runtime'|'child'; at:string}
export interface DesignRecord {
 version:1; plan:Partial<Record<PlanField,DesignField>>; friction:string;
 ideas:Idea[]; observations:Observation[]; helpLevel:number;
 support:'brief'|'balanced'|'detailed'; paused:boolean; approvedPlan:boolean;
}
export interface Experiment {
 id:string; label:string; title:string; baseId:string|null; parents:string[];
 candidate:Candidate; depth:'tune'|'redesign'|'rethink'; origin:Origin;
 prediction:string; notes:string; createdAt:string;
}
export interface CoachContext {
 message:string; mode:'discuss'|'ideas'|'explain'|'reflect'; game:string;
 plan:DesignRecord['plan']; rules?:string; friction:string; helpLevel:number; support:DesignRecord['support'];
 conversation:{role:'child'|'helper'|'reflection';text:string}[];
 observations:Observation[]; tests:{label:string;title:string;prediction:string;notes:string}[];
}
export interface CoachReply {
 move:'listen'|'clarify'|'inspire'|'explain'|'reflect'|'propose'|'repair'|'play';
 text:string; question:string|null; suggestions:string[];
 proposedChange:{title:string;request:string;depth:'tune'|'redesign'|'rethink'}|null;
 planSuggestions:{field:PlanField;value:string}[]; childDecisions?:{field:PlanField;quote:string}[]; evidenceIds:string[];
}
const text=(x:unknown,n:number):x is string=>typeof x==='string'&&x.length<=n;
const id=(x:unknown):x is string=>text(x,160)&&/^[\w:-]+$/.test(x)&&!['__proto__','constructor','prototype'].includes(x);
const copy=<T>(x:T):T=>JSON.parse(JSON.stringify(x));
const keys=(v:object,allowed:string[])=>Object.keys(v).every(k=>allowed.includes(k));
export function freshDesign():DesignRecord {return {version:1,plan:{},friction:'',ideas:[],observations:[],helpLevel:0,support:'balanced',paused:false,approvedPlan:false};}
export function validateDesign(input:unknown):DesignRecord {
 const d=input as DesignRecord;
 if(!d||d.version!==1||!keys(d,['version','plan','friction','ideas','observations','helpLevel','support','paused','approvedPlan'])||!d.plan||typeof d.plan!=='object'||Array.isArray(d.plan)||!keys(d.plan,[...PLAN_FIELDS])||!text(d.friction,1000)||!Number.isInteger(d.helpLevel)||d.helpLevel<0||d.helpLevel>3||!['brief','balanced','detailed'].includes(d.support)||typeof d.paused!=='boolean'||typeof d.approvedPlan!=='boolean')throw Error('Invalid design record.');
 for(const field of Object.values(d.plan)){if(!field||!keys(field,['value','origin','accepted','delegated'])||!text(field.value,700)||!['child','helper'].includes(field.origin)||typeof field.accepted!=='boolean'||typeof field.delegated!=='boolean')throw Error('Invalid plan field.');}
 if(!Array.isArray(d.ideas)||d.ideas.length>100||!d.ideas.every(i=>i&&keys(i,['id','text','origin','adopted'])&&id(i.id)&&text(i.text,1000)&&['child','helper'].includes(i.origin)&&typeof i.adopted==='boolean')||new Set(d.ideas.map(i=>i.id)).size!==d.ideas.length)throw Error('Invalid idea provenance.');
 if(!Array.isArray(d.observations)||d.observations.length>300||!d.observations.every(o=>o&&keys(o,['id','experimentId','text','source','at'])&&id(o.id)&&(o.experimentId===null||id(o.experimentId))&&text(o.text,1200)&&['runtime','child'].includes(o.source)&&text(o.at,40)&&Number.isFinite(Date.parse(o.at)))||new Set(d.observations.map(o=>o.id)).size!==d.observations.length)throw Error('Invalid observation.');
 return copy(d);
}
export function validateExperiments(input:unknown):Experiment[] {
 if(!Array.isArray(input)||input.length>100)throw Error('Invalid experiment shelf.');
 const ids=new Set<string>();
 for(const e of input as Experiment[]){
  if(!e||!keys(e,['id','label','title','baseId','parents','candidate','depth','origin','prediction','notes','createdAt'])||!id(e.id)||ids.has(e.id)||!text(e.label,20)||!text(e.title,120)||(e.baseId!==null&&!id(e.baseId))||!Array.isArray(e.parents)||e.parents.length>10||!e.parents.every(p=>ids.has(p))||new Set(e.parents).size!==e.parents.length||!['tune','redesign','rethink'].includes(e.depth)||!['child','helper'].includes(e.origin)||!text(e.prediction,700)||!text(e.notes,2000)||!text(e.createdAt,40)||!Number.isFinite(Date.parse(e.createdAt)))throw Error('Invalid experiment provenance.');
  const c=e.candidate;if(!c||!keys(c,['id','baseId','config','remoteId','prompt','summary'])||c.id!==e.id||(c.baseId!==null&&!id(c.baseId))||!text(c.prompt,2000)||!text(c.summary,2200)||!!c.config===!!c.remoteId||c.remoteId&&!id(c.remoteId))throw Error('Invalid experimental version.');
  if(c.config&&(typeof c.config!=='object'||Array.isArray(c.config)||Object.keys(c.config).length>100||!Object.entries(c.config).every(([k,v])=>/^[a-zA-Z][\w]*$/.test(k)&&(typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v)))))throw Error('Invalid experiment settings.');
  ids.add(e.id);
 }
 return copy(input);
}
export function labelFor(n:number):string {let label='',i=n;do{label=String.fromCharCode(65+i%26)+label;i=Math.floor(i/26)-1;}while(i>=0);return 'Test '+label;}
export function experiment(candidate:Candidate,shelf:Experiment[],parents:string[]=[],depth:Experiment['depth']='tune',origin:Origin='child',prediction=''):Experiment {
 const e:Experiment={id:candidate.id,label:labelFor(shelf.length),title:candidate.prompt.slice(0,120),baseId:candidate.baseId,parents:[...parents],candidate:copy(candidate),depth,origin,prediction,notes:'',createdAt:new Date().toISOString()};
 validateExperiments([...shelf,e]);return e;
}
export function missingPlan(d:DesignRecord):PlanField[] {
 // Scoring and loss can explicitly be "none"; no requirement that every game has either.
 return PLAN_FIELDS.filter(k=>!d.plan[k]||(!d.plan[k]!.value.trim()&&!d.plan[k]!.delegated)||d.plan[k]!.origin==='helper'&&!d.plan[k]!.accepted&&!d.plan[k]!.delegated);
}
export function planBrief(d:DesignRecord):string {return PLAN_FIELDS.map(k=>`${k}: ${d.plan[k]?.value|| (d.plan[k]?.delegated?'Choose a sensible option and report it.':'Not specified.')}`).join('\n');}
export function validateCoachReply(value:unknown,context:CoachContext):CoachReply {
 const r=value as CoachReply;
 if(!r||!keys(r,['move','text','question','suggestions','proposedChange','planSuggestions','childDecisions','evidenceIds'])||!['listen','clarify','inspire','explain','reflect','propose','repair','play'].includes(r.move)||!text(r.text,1800)||!(r.question===null||text(r.question,350))||!Array.isArray(r.suggestions)||r.suggestions.length>4||!r.suggestions.every(t=>text(t,500))||!Array.isArray(r.planSuggestions)||r.planSuggestions.length>8||!r.planSuggestions.every(p=>p&&keys(p,['field','value'])&&PLAN_FIELDS.includes(p.field)&&text(p.value,700))||!Array.isArray(r.evidenceIds)||r.evidenceIds.length>8||!r.evidenceIds.every(x=>context.observations.some(o=>o.id===x)))throw Error('Invalid coach response.');
 if(r.proposedChange!==null&&(!r.proposedChange||!keys(r.proposedChange,['title','request','depth'])||!text(r.proposedChange.title,120)||!text(r.proposedChange.request,2000)||!['tune','redesign','rethink'].includes(r.proposedChange.depth)))throw Error('Invalid proposed experiment.');
 if(r.childDecisions!==undefined&&(!Array.isArray(r.childDecisions)||r.childDecisions.length>8||!r.childDecisions.every(d=>d&&keys(d,['field','quote'])&&PLAN_FIELDS.includes(d.field)&&text(d.quote,700)&&d.quote.trim().length>0&&[context.message,...context.conversation.filter(m=>m.role==='child').map(m=>m.text)].some(t=>t.includes(d.quote)))))throw Error('Child decision needs an exact child-authored quote.');
 // No response can mutate a game, promote a version, or assert secret tool execution.
 if(context.mode==='reflect'&&r.move==='propose'&&r.proposedChange===null)throw Error('Missing proposal.');
 if(((r.text+' '+(r.question||'')).match(/\?/g)||[]).length>1)throw Error('Ask one useful question at a time.');
 return copy(r);
}
export const PLAN_LABELS:Record<PlanField,string>={fun:'What would make it fun?',action:'What does the player do?',goal:'What is the goal?',setback:'What happens when things go wrong?',score:'Points or rewards — or none?',style:'How should it look and feel?',progression:'What changes as you get better?',special:'Any special rules — or none?'};
/** A deliberately limited offline aid, not an LLM and never a build command. */
export function localCoach(c:CoachContext):CoachReply {
 let message='Your idea is saved. You choose what we try.',question:string|null=null,suggestions:string[]=[],move:CoachReply['move']='listen';
 if(c.mode==='ideas'){
  move='inspire';message='Here are starting points, not answers you have to choose.';
  suggestions=c.helpLevel>=2?['Replace the hardest action with something your character already does well.','Let a mistake cause a funny surprise instead of ending the round.','Try a different goal while keeping the part you enjoy.']:['Keep the goal, but change the action.','Change the warning or feedback, not just the difficulty.','Imagine a different kind of fun.'];question='Does one of these spark your own idea?';
 }else if(c.mode==='explain'){
  move='explain';message='Tuning changes how an action behaves. Redesigning changes the action itself. Rethinking questions the goal. A win alone does not tell us which feels more fun.';question='Which part would you like to explore?';
 }else if(c.mode==='reflect'){
  move='reflect';message=c.plan.fun?.value?`You wanted: ${c.plan.fun.value}. Your preference matters, not just the score.`:'One play is an observation, not proof that a version is better.';question='What worked, or what would you change?';
 }else if(/\b(win|won|winning|victory|beat|finish)\b/i.test(c.message)&&/\b(every|always|too easy|each time)\b/i.test(c.message)){
  move='clarify';message='It sounds like winning happens a lot. You get to decide whether this game should be relaxing or more challenging.';question='Should we add a tricky part, or do you like winning every time?';
 }else if(/\b(seal|penguin|dragon|cat|robot)\b/i.test(c.message)&&/\b(game|jump|ice|moon|pizza|make|create|build|want|bounc)\b/i.test(c.message)){
  move='clarify';message='I saved the idea you described. We can figure out how the character plays before choosing Build my game.';question='What is the most fun thing your character should do?';
 }else if(/\b(don.t know|stuck|help)\b/i.test(c.message)){
  move='clarify';question=c.helpLevel===0?'Which moment felt tricky?':c.helpLevel===1?'Was it the controls, understanding what happened, or something else?':'Would an example or a completely different direction help?';message='We can make the question smaller, or you can ask for ideas.';
 }else if(/\b(aim(?:ing)?|control(?:s)?|buttons|shoot(?:ing)?)\b/i.test(c.message)&&/\b(hard|hate|difficult|can.t|don.t like)\b/i.test(c.message)){
  move='clarify';message='We can question the action itself, not only make it easier.';question='Does your character need to do that action, or could you reach the goal another way?';
 }else if(/\b(boring|not fun|don.t like|hate)\b/i.test(c.message)){
  move='clarify';question='Which part would you want to do differently?';message='Making it easier is only one possibility. We can also change the action or goal.';
 }else if(/\b(hello|hi|hey)\b/i.test(c.message)){
  move='listen';message='Hi! We can talk about your game or any silly idea for it.';question='What is on your mind?';
 }else if(/\b(what if|imagine|could|maybe|sneeze|spaghetti|silly|funny)\b/i.test(c.message)){
  move='listen';message='That is an idea worth exploring. I will not change your game unless you choose Try a change.';question='What happens next in your idea?';
 }else{move='listen';message='I am listening. You can keep talking or choose to try a change when you want.';question=null;}
 return {move,text:message,question,suggestions,proposedChange:null,planSuggestions:[],evidenceIds:[]};
}
