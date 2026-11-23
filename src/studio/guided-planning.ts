import {PLAN_FIELDS, type CoachReply, type DesignField, type DesignRecord, type PlanField} from './design';
import {isConversationOnly,isHelperAuthoredTurn,type SelectedSuggestion} from './creation-readiness';
export {isHelperAuthoredTurn,isConversationOnly} from './creation-readiness';
import type {Message} from './notebook';

/** Limited local reflection prompts. They never establish that a game is ready to build. */
export const GUIDED_PLAN_ORDER:readonly PlanField[]=['action','goal','fun','style','viewpoint','movement','setback','score','progression','special'];
export const GUIDED_PLAN_QUESTIONS:Record<PlanField,string>={
 action:'What does the player do?',
 fun:'How should it feel?',
 style:'How should it look?',
 viewpoint:'Where do you picture yourself watching from?',
 movement:'How does your character move?',
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
 if(/^(?:please )?(?:(?:you|jems) (?:choose|decide|pick)(?: the)? (?:rest|everything|remaining(?: details)?)|choose the rest|skip (?:the rest|all))$/.test(value))return 'remaining';
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
  fun:/\b(?:funny|silly|exciting|calm|relaxing|spooky|surprising|surprises|cozy|cute|cool|happy|cheerful|scary|edgy|lighthearted)\b/i,
  style:/\b(?:cartoon|pixel art|pixelated|storybook|hand[- ]drawn|watercolo(?:u)?r|3d|2d|realistic|painted|colo(?:u)?rful)\b/i,
  viewpoint:/\b(?:side[- ]scroll(?:ing|er)?|top[- ]down|overhead|first[- ]person|third[- ]person|from behind|from above|from the side)\b/i,
  movement:/\b(?:auto[- ]run|always runs?|gallop|dash|swim|walk|tap to jump|drag to move|tilt to steer|swipe to dodge|arrow keys|joystick)\b/i,
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

/** Match a contextual model decision to an earlier offer. A paraphrase can
 * use the field's paired literal helper phrase. A directly named offer needs
 * no extra metadata. Never use an example the coach is only now introducing. */
export function suggestionsBehindChoice(
 field:PlanField,quote:string,prior:DesignField|undefined,
 earlier:readonly Message[],reported:CoachReply['planSuggestions'],ideas:DesignRecord['ideas']
):string[] {
 const appearedInReply=(phrase:string)=>earlier.some(message=>message.role==='helper'&&message.text.includes(phrase));
 const paired=reported.filter(p=>p.field===field&&p.value.trim()&&appearedInReply(p.value)).map(p=>p.value);
 if(paired.length)return [...new Set(paired)];
 const offers=ideas.filter(idea=>idea.origin==='helper'&&(!idea.adopted||idea.id.startsWith('selection:'))).map(idea=>idea.text);
 if(prior?.origin==='helper'&&!prior.accepted&&!prior.delegated)offers.push(prior.value);
 const named=[...new Set(offers)].filter(phrase=>phrase.trim()&&quote.toLowerCase().includes(phrase.toLowerCase())&&appearedInReply(phrase));
 if(named.length)return named;
 // Older replies sometimes gave examples only in prose. Preserve the origin
 // of an exact phrase first introduced by jems without importing the rest.
 const firstMention=earlier.find(message=>message.role!=='reflection'&&message.text.includes(quote));
 return firstMention?.role==='helper'?[quote]:[];
}

/** Follow-up statements are kept even without command words (e.g. clouds are trampolines).
 * Known guided answers are represented by the current plan, rather than revived after revision.
 */
export function authoredFollowupIntents(messages:readonly Message[],design:DesignRecord):string[]{
 const result:string[]=[];let sawIdea=false;
 for(let index=0;index<messages.length;index++){
  const message=messages[index];if(message.role!=='child'||isHelperAuthoredTurn(message,design)||isRejectedChildTurn(messages,index,design)||design.ideas.some(idea=>idea.id==='superseded-turn:'+message.id&&!idea.adopted))continue;
  const text=message.text.trim();
  if(!text||isConversationOnly(text)||guidedDelegation(text)||['Build my game','Build this plan'].includes(text))continue;
  if(!sawIdea){sawIdea=true;continue;}
  // A question before a child turn does not make that turn a field answer.
  // Only an answer actually saved by the host may be omitted here. This keeps
  // new mechanics phrased as questions, including "Could clouds be trampolines?".
  if(design.ideas.some(idea=>idea.id==='plan-answer:'+message.id&&idea.adopted&&idea.text.trim()===text))continue;
  if(Object.values(design.plan).some(choice=>!choice?.delegated&&choice?.value.trim()===text))continue;
  if(/^(?:hi|hello|hey|thanks|thank you|no|cool|great)[.! ]*$/i.test(text))continue;
  if(!result.includes(text))result.push(text);
 }
 return result;
}

/** Keep every distinct authored choice intact. The existing job API is bounded at 2,000 chars. */
export function compileGuidedBuild(idea:string,design:DesignRecord,latestIntent='',followups:readonly string[]=[],
 history?:{messages:readonly Message[];selected:Partial<Record<PlanField,SelectedSuggestion[]>>}):string {
 const original=idea.trim(),latest=latestIntent.trim();
 if(!original&&!latest)throw Error('Tell me your game idea first.');
 const messages=history?.messages||[];
 const turns=messages.map(message=>message.role==='child'?message.text:'');
 const details:{order:number;text:string}[]=[];
 for(const field of PLAN_FIELDS){
  const choice=design.plan[field];
  if(!choice?.accepted||choice.delegated)continue;
  const value=choice.value.trim();
  if(!value)continue;
  const selected=history?.selected[field];
  if(choice.origin==='helper'&&!selected?.length)continue;
  const source=turns.map(text=>text.includes(value)).lastIndexOf(true);
  if(!selected&&original.includes(value)&&source<=turns.indexOf(original))continue;
  const label=selected?field+' (jems suggested '+selected.map(item=>JSON.stringify(item.offer)).join(' + ')+', child chose)':field;
  details.push({order:selected?.[0].childIndex??(source<0?Infinity:source),text:label+': '+value});
 }
 const more=[...new Set([...followups,latest].map(value=>value.trim()))].filter(value=>
  value&&value!==original&&!isConversationOnly(value)&&!guidedDelegation(value)&&!['Build my game','Build this plan'].includes(value)&&
  !Object.values(design.plan).some(choice=>!choice?.delegated&&choice?.value.trim()===value));
 for(const value of more){
  const index=turns.lastIndexOf(value);
  details.push({order:index<0?Infinity:index,text:'Also: '+value});
 }
 const lines=original?[original]:[];
 if(details.length){
  lines.push('Game choices in order (newer changes take priority):');
  for(const detail of details.sort((a,b)=>a.order===b.order?0:a.order-b.order))lines.push(detail.text);
 }
 const payload=lines.join('\n');
 if(payload.length>2000)throw Error(more.length?'That is a lot for one build. Start a new idea with the details you want to keep. This idea stays saved.':'That is a lot of detail for one build. Open More choices and shorten your game plan, then try again.');
 if(payload.length<5)throw Error('Tell me your game idea first.');
 return payload;
}
