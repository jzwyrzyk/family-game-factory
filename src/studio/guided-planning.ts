import {PLAN_FIELDS, type DesignField, type DesignRecord, type PlanField} from './design';
import type {Message} from './notebook';

/** Limited local reflection prompts. They never establish that a game is ready to build. */
export const GUIDED_PLAN_ORDER:readonly PlanField[]=['action','fun','style','goal','setback','score','progression','special'];
export const GUIDED_PLAN_QUESTIONS:Record<PlanField,string>={
 action:'What does the player do?',
 fun:'How should it feel?',
 style:'How should it look?',
 goal:'What are you trying to do?',
 setback:'What happens if something goes wrong?',
 score:'Do you want points?',
 progression:'What changes as you play?',
 special:'Any special rules?'
};
export function nextGuidedField(design:DesignRecord):PlanField|null {
 return GUIDED_PLAN_ORDER.find(field=>{
  const choice=design.plan[field];
  return !choice?.accepted||choice.origin!=='child'||choice.delegated||!choice.value.trim();
 })??null;
}

export function guidedDelegation(text:string):'field'|'remaining'|null {
 const value=text.toLowerCase().replace(/[.!?]+$/,'').trim();
 if(/^(?:please )?(?:(?:you|jems) (?:choose|decide|pick)(?: the)? (?:rest|remaining(?: details)?)|choose the rest|skip (?:the rest|all))$/.test(value))return 'remaining';
 if(/^(?:please )?(?:(?:you|jems) (?:choose|decide|pick)|surprise me|skip(?: this)?|i don['’]?t mind)$/.test(value))return 'field';
 return null;
}

export function isGuidanceHelp(text:string):boolean {
 return /\?|^(?:what|why|how|explain|help|give me|can you|could you)\b|\b(?:don['’]?t know|not sure|stuck)\b/i.test(text.trim());
}

export function isExplicitPlanRevision(text:string):boolean {
 return /\b(?:actually|instead|rather than)\b|^(?:(?:please|now)\s+)?(?:make|change|switch|replace|use|turn)\b|^i (?:now )?(?:want|prefer)\b/i.test(text.trim());
}

/** Only carry literal expressed choices forward; never infer a child's mood or intentions. */
export function explicitPlanChoices(text:string):Partial<Record<PlanField,DesignField>> {
 const result:Partial<Record<PlanField,DesignField>>={};
 if(isGuidanceHelp(text)&&!isExplicitPlanRevision(text)||guidedDelegation(text))return result;
 const patterns:Partial<Record<PlanField,RegExp>>={
  action:/\b(?:jump(?:s|ing)?|hop(?:s|ping)?|run(?:s|ning)?|race(?:s)?|racing|fly|flies|flying|collect(?:s|ing)?|deliver(?:s|ing)?|bounce(?:s)?|bouncing|dodge(?:s)?|dodging|catch(?:es|ing)?|eat(?:s|ing)?|draw(?:s|ing)?|explore(?:s)?|exploring)\b/i,
  fun:/\b(?:funny|silly|exciting|calm|relaxing|spooky|surprising|surprises|cozy)\b/i,
  style:/\b(?:cartoon|pixel art|watercolo(?:u)?r|3d|2d|realistic|painted|colo(?:u)?rful)\b/i,
  goal:/\b(?:win by|goal (?:is|should)|finish when|rescue|deliver all|collect all|no (?:winning|goal)|just explore)\b/i,
  setback:/\b(?:no losing|never lose|lose when|try again|respawn|start over)\b/i,
  score:/\b(?:points|scoring|score)\b/i,
  progression:/\b(?:levels|gets? harder|harder as|level up|new worlds)\b/i,
  special:/\b(?:special rule|no extra rules)\b/i
 };
 for(const sentence of text.match(/[^.!?\n]+[.!?]?/g)||[]){
  const quote=sentence.trim();if(!quote||quote.length>700)continue;
  for(const field of GUIDED_PLAN_ORDER)if(!result[field]&&patterns[field]?.test(quote))result[field]={value:quote,origin:'child',accepted:true,delegated:false};
 }
 return result;
}

export function isRejectedChildTurn(messages:readonly Message[],index:number,design?:DesignRecord):boolean {
 if(messages[index]?.role!=='child')return false;
 if(design?.ideas.some(idea=>idea.id==='refused-turn:'+messages[index].id&&!idea.adopted))return true;
 for(const next of messages.slice(index+1)){
  if(next.role==='child')break;
  if(next.role==='helper'&&next.text.startsWith('I can help with safe game ideas. Let’s try another idea without sharing private details.'))return true;
 }
 return false;
}

export function isHelperAuthoredTurn(message:Message,design:DesignRecord):boolean {
 const recorded=design.ideas.find(idea=>idea.id==='build-intent:'+message.id||idea.id==='helper-turn:'+message.id);
 return recorded?.origin==='helper'||design.ideas.some(idea=>idea.origin==='helper'&&idea.text.trim()===message.text.trim())||
  Object.values(design.plan).some(choice=>choice?.origin==='helper'&&choice.value.trim()===message.text.trim());
}

/** Follow-up statements are kept even without command words (e.g. clouds are trampolines).
 * Known guided answers are represented by the current plan, rather than revived after revision.
 */
export function authoredFollowupIntents(messages:readonly Message[],design:DesignRecord):string[]{
 const result:string[]=[];let sawIdea=false;
 for(let index=0;index<messages.length;index++){
  const message=messages[index];if(message.role!=='child'||isHelperAuthoredTurn(message,design)||isRejectedChildTurn(messages,index,design)||design.ideas.some(idea=>idea.id==='superseded-turn:'+message.id&&!idea.adopted))continue;
  const text=message.text.trim();
  if(!text||guidedDelegation(text)||['Build my game','Build this plan'].includes(text))continue;
  if(!sawIdea){sawIdea=true;continue;}
  // A question before a child turn does not make that turn a field answer.
  // Only an answer actually saved by the host may be omitted here. This keeps
  // new mechanics phrased as questions, including "Could clouds be trampolines?".
  if(design.ideas.some(idea=>idea.id==='plan-answer:'+message.id&&idea.adopted&&idea.text.trim()===text))continue;
  if(Object.values(design.plan).some(choice=>!choice?.delegated&&choice?.value.trim()===text))continue;
  // These are requests to the helper, not additional game rules. A creative
  // question such as "Could the clouds be trampolines?" remains useful intent.
  if(/^(?:hi|hello|hey|thanks|thank you|okay|ok|yes|no|cool|great|never mind|nevermind|stop)[.! ]*$/i.test(text)||
   /^(?:please )?(?:help me(?: find| choose| think)?(?: ideas)?|give me ideas|explain(?: that| this| what you mean)?|what do you mean|what does that mean|i don['’]?t know|i(?:['’]m| am) not sure|let me think|let me play|keep playing)[.!? ]*$/i.test(text)||
   /^Please help me find ideas[.! ]*$|^Explain the relevant game-design choice[.! ]*$/i.test(text))continue;
  if(!result.includes(text))result.push(text);
 }
 return result;
}

/** Keep every distinct authored choice intact. The existing job API is bounded at 2,000 chars. */
export function compileGuidedBuild(idea:string,design:DesignRecord,latestIntent='',followups:readonly string[]=[]):string {
 // A bound contextual coach review is checked by the caller. Resolved fields,
 // delegation and the legacy approvedPlan flag are never build permission.
 const original=idea.trim(),latest=latestIntent.trim();
 if(!original&&!latest)throw Error('Tell me your game idea first.');
 const lines:string[]=[];
 if(original)lines.push(original);
 const choices:string[]=[];
 for(const field of PLAN_FIELDS){
  const choice=design.plan[field];
  if(!choice?.accepted||choice.delegated||choice.origin!=='child')continue;
  const value=choice.value.trim();
  if(original.includes(value))continue;
  choices.push(field+': '+value);
 }
 if(choices.length)lines.push('Current choices (these replace earlier choices):',...choices);
 const more=[...new Set([...followups,latest].map(value=>value.trim()))].filter(value=>value&&value!==original&&value!=='Build my game'&&value!=='Build this plan'&&!Object.values(design.plan).some(choice=>!choice?.delegated&&choice?.value.trim()===value));
 if(more.length)lines.push('Later ideas, in order; newer changes take priority:',...more.map(value=>'Also: '+value));
 const payload=lines.join('\n');
 if(payload.length>2000)throw Error(more.length?'That is a lot for one build. Start a new idea with the details you want to keep. This idea stays saved.':'That is a lot of detail for one build. Open More choices and shorten your game plan, then try again.');
 if(payload.length<5)throw Error('Tell me your game idea first.');
 return payload;
}
