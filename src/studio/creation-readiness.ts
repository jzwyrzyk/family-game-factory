import type {CoachContext,DesignRecord,PlanField} from './design';
import type {Message,StudioSession} from './notebook';
import {visibleConversation} from './conversation-view';

/** The coach judges coherence. The host verifies whose words support that
 * judgment and that it still describes this exact saved conversation. */
export type CreationStandard=1|2;
export interface CreationReadinessVerdict {
 ready:boolean;
 evidence:{action:string;consequence:string;experience:string;world:string;
  goal?:string;visualStyle?:string;mood?:string};
 unresolved:string[];
}
export interface CreationReview extends CreationReadinessVerdict {
 version:CreationStandard;
 source:'model';
 fingerprint:string;
}
const evidenceKeys=['action','consequence','experience','world'] as const;
const creativeEvidenceKeys=[...evidenceKeys,'goal','visualStyle','mood'] as const;
const requiredEvidenceKeys=(standard:CreationStandard)=>standard===2?creativeEvidenceKeys:evidenceKeys;
const planKeys=['fun','action','goal','setback','score','style','viewpoint','movement','progression','special'] as const;
const isRecord=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const only=(value:Record<string,unknown>,keys:readonly string[])=>Object.keys(value).every(key=>keys.includes(key));

function verdictShape(value:unknown,standard:CreationStandard=1):CreationReadinessVerdict {
 const keys=requiredEvidenceKeys(standard);
 if(!isRecord(value)||!only(value,['ready','evidence','unresolved'])||typeof value.ready!=='boolean'||
  !isRecord(value.evidence)||!only(value.evidence,keys)||Object.keys(value.evidence).length!==keys.length)
  throw Error('Invalid creation review.');
 const evidence=value.evidence;
 if(!keys.every(key=>typeof evidence[key]==='string'&&(evidence[key] as string).length<=700)||
  !Array.isArray(value.unresolved)||value.unresolved.length>8||!value.unresolved.every(item=>typeof item==='string'&&!!item.trim()&&item.length<=350))
  throw Error('Invalid creation review.');
 const verdict=value as unknown as CreationReadinessVerdict;
 if(verdict.ready&&(verdict.unresolved.length||keys.some(key=>!(evidence[key] as string).trim())))
  throw Error('A ready game needs grounded intent and no unresolved design gaps.');
 if(standard===2&&!verdict.ready&&keys.some(key=>evidence[key]!==''))throw Error('Unready creation must have empty evidence.');
 return structuredClone(verdict);
}

function supported(verdict:CreationReadinessVerdict,sources:readonly string[]){
 for(const quote of Object.values(verdict.evidence)){
  if(quote&&!sources.some(source=>source.includes(quote)))throw Error('Creation review needs exact child-authored evidence.');
 }
}

/** Transport validation; a complete-looking set of fields alone is never a
 * readiness verdict. Missing metadata remains compatible but cannot unlock Build. */
export function validateCreationReadiness(value:unknown,context:CoachContext):CreationReadinessVerdict {
 const standard=context.creation?.version;
 if(standard!==1&&standard!==2)throw Error('Creation review was not requested.');
 const verdict=verdictShape(value,standard);
 const sources=[context.message,...context.conversation.filter(message=>message.role==='child').map(message=>message.text),
  ...Object.values(context.plan).filter(field=>field?.origin==='child'&&field.accepted&&!field.delegated).map(field=>field!.value)];
 supported(verdict,sources.filter(source=>!isConversationOnly(source)));
 return verdict;
}

export function validateCreationReview(value:unknown):CreationReview {
 if(!isRecord(value)||!only(value,['version','source','fingerprint','ready','evidence','unresolved'])||![1,2].includes(value.version as number)||value.source!=='model'||
  typeof value.fingerprint!=='string'||!/^creation-v1:[a-f0-9]{16}$/.test(value.fingerprint))throw Error('Invalid saved creation review.');
 return {...verdictShape({ready:value.ready,evidence:value.evidence,unresolved:value.unresolved},value.version as CreationStandard),version:value.version as CreationStandard,source:'model',fingerprint:value.fingerprint};
}

/** Bare assent and whole-plan delegation can be conversation, never a creative source. */
export function isBlanketAssent(text:string):boolean {
 return /^(?:sure|ok(?:ay)?|yes|yep|yeah|(?:please )?(?:you|jems) (?:choose|decide|pick)(?: (?:everything|it all|the rest))?)[.!?, ]*$/i.test(text.trim());
}

/** Narrow conversational requests have no game rule to send to the builder.
 * Preserve other questions; children often invent by asking "Could ...?". */
export function isConversationOnly(text:string):boolean {
 if(isBlanketAssent(text))return true;
 if(/^(?:never mind|nevermind|(?:please )?help me(?: find| choose| think)?(?: ideas)?|explain(?: that| this| what you mean| the relevant game-design choice)?|what do you mean|what does that mean|let me think|let me play|keep playing|choose the rest)[.!? ]*$/i.test(text.trim()))return true;
 return /^(?:(?:i (?:still )?don['’]?t know|i(?:['’]m| am) not sure)|(?:please )?(?:give me|can (?:i have|you give me)) (?:three |3 |some )?ideas(?: (?:for|about|to) [^.!?]+)?|what does [^.!?]+ mean|what is pixel art|stop(?: coaching)?)[.!? ]*$/i.test(text.trim());
}

// A selection uses the existing idea record. The plan keeps the child's literal
// choice; the idea keeps the earlier helper phrase and the selecting turn ID.
export function selectionId(field:PlanField,index:number,messageId:string){return 'selection:'+field+':'+index+':'+messageId;}
function selectingTurnId(id:string){return id.startsWith('selection:')?id.split(':').slice(3).join(':'):undefined;}

export function isHelperAuthoredTurn(message:Message,design?:DesignRecord):boolean {
 const recorded=design?.ideas.find(idea=>idea.id==='build-intent:'+message.id||idea.id==='helper-turn:'+message.id);
 if(recorded)return recorded.origin==='helper';
 if(design?.ideas.some(idea=>idea.adopted&&idea.origin==='helper'&&selectingTurnId(idea.id)===message.id))return false;
 return !!design?.ideas.some(idea=>idea.origin==='helper'&&idea.text.trim()===message.text.trim())||
  Object.values(design?.plan||{}).some(choice=>choice?.origin==='helper'&&choice.value.trim()===message.text.trim());
}

function authoredTurns(session:StudioSession){
 return visibleConversation(session.messages).filter(message=>message.role==='child').map(message=>{
  const source=isHelperAuthoredTurn(message,session.design)?'helper':'child';
  const superseded=session.design?.ideas.some(idea=>idea.id==='superseded-turn:'+message.id&&!idea.adopted)||false;
  const index=session.messages.findIndex(item=>item.id===message.id);
  let refused=session.design?.ideas.some(idea=>idea.id==='refused-turn:'+message.id&&!idea.adopted)||false;
  for(const following of session.messages.slice(index+1)){
   if(following.role==='child')break;
   if(following.role==='helper'&&following.text.startsWith('I can help with safe game ideas. Let’s try another idea without sharing private details.'))refused=true;
  }
  return {id:message.id,text:message.text,source,superseded,refused};
 });
}

/** Only a live, accepted field backed by a particular eligible child turn can
 * carry an earlier helper phrase into the build. Old accepted flags alone cannot. */
export interface SelectedSuggestion {offer:string; helperIndex:number; childIndex:number}
export function selectedSuggestions(session:StudioSession,visible=visibleConversation(session.messages),
 eligible=new Set(authoredTurns(session).filter(turn=>turn.source==='child'&&!turn.refused&&!turn.superseded).map(turn=>turn.id))
):Partial<Record<PlanField,SelectedSuggestion[]>> {
 const selected:Partial<Record<PlanField,SelectedSuggestion[]>>={};
 for(const field of planKeys){
  const choice=session.design?.plan[field];
  if(choice?.origin!=='helper'||!choice.accepted||choice.delegated||!choice.value.trim())continue;
  const markers=session.design!.ideas.filter(idea=>idea.origin==='helper'&&idea.adopted&&idea.id.startsWith('selection:'+field+':'));
  if(!markers.length)continue;
  const turnId=selectingTurnId(markers[0].id);
  const childIndex=visible.findIndex(message=>message.id===turnId&&eligible.has(message.id));
  if(childIndex<0||isConversationOnly(visible[childIndex].text)||!visible[childIndex].text.includes(choice.value))continue;
  const priorReplies=visible.slice(0,childIndex);
  const offers=markers.map(marker=>({offer:marker.text,childIndex,
   helperIndex:priorReplies.findIndex(message=>message.role==='helper'&&message.text.includes(marker.text))}));
  if(markers.every(marker=>selectingTurnId(marker.id)===turnId&&marker.text.trim())&&offers.every(item=>item.helperIndex>=0))selected[field]=offers;
 }
 return selected;
}

/** Keep the source ID when an explicit check revisits an earlier eligible turn. */
export function lastCreationTurn(session:StudioSession){
 return authoredTurns(session).filter(turn=>turn.source==='child'&&!turn.superseded&&!turn.refused&&turn.text.length<=2200).at(-1);
}

/** A later explicit check can refuse a turn after a technical-failure note.
 * Keep saved work, but do not send its extracted quotes back to the model or
 * compiler through plan fields. A separate accepted child turn can support them.
 */
export function creationPlan(session:StudioSession):DesignRecord['plan'] {
 const turns=authoredTurns(session),refused=turns.filter(turn=>turn.refused),accepted=turns.filter(turn=>turn.source==='child'&&!turn.refused&&!turn.superseded);
 return Object.fromEntries(Object.entries(session.design?.plan||{}).filter(([,field])=>!field||!field.value.trim()||
  !refused.some(turn=>turn.text.includes(field.value))||accepted.some(turn=>turn.text.includes(field.value))));
}

/** Keep the original idea and recent authored decisions in the existing bounded
 * conversation contract. A coach's separate reflection/question must not evict
 * the child's game after only three or four turns. No paraphrase becomes evidence.
 * Accepted plan values travel separately; this is a bounded view, not a summary.
 */
export function creationConversation(session:StudioSession,maxChars=12000):CoachContext['conversation'] {
 const visible=visibleConversation(session.messages);
 const authored=new Set(authoredTurns(session).filter(turn=>turn.source==='child'&&!turn.superseded&&!turn.refused).map(turn=>turn.id));
 const children=visible.flatMap((message,index)=>message.role==='child'&&authored.has(message.id)?[index]:[]);
 const helpers=visible.flatMap((message,index)=>message.role==='helper'?[index]:[]);
 const selected=new Set<number>();let used=2;
 const add=(index:number|undefined)=>{
  if(index===undefined||selected.has(index)||selected.size>=16)return;
  const {role,text}=visible[index],size=JSON.stringify({role,text}).length+1;
  if(text.length>2200||used+size>maxChars)return;
  selected.add(index);used+=size;
 };
 // The current message also travels as context.message. Reserve the original
 // first, then recent child decisions and the last coach question.
 add(children[0]);add(children.at(-1));add(helpers.at(-1));
 for(const index of children.slice(-4).reverse())add(index);
 // Retain recent question/answer pairs so the coach can change the kind of
 // help and recognize its own earlier examples, even during a long session.
 for(const choice of Object.values(selectedSuggestions(session,visible,authored)).flat()){
  add(choice.childIndex);add(choice.helperIndex);
 }
 for(const index of helpers.slice(-5).reverse())add(index);
 for(const index of children.slice().reverse())add(index);
 return [...selected].sort((left,right)=>left-right).map(index=>({role:visible[index].role,text:visible[index].text}));
}

export type CreationReadinessIssue='draft'|'thinking'|'unsaved'|'missing-review'|'stale-review'|'invalid-review'|'unresolved'|'review-unavailable';
export interface CreationBuildReadiness {ready:boolean;reason:string;issue?:CreationReadinessIssue}

/** A change detector, not a signature or a replacement for paid/auth safeguards.
 * Excludes the draft and helper prose; both may change after the reviewed turn. */
export function creationInputFingerprint(session:StudioSession):string {
 const selections=session.design?.ideas.filter(idea=>idea.id.startsWith('selection:'));
 const snapshot=JSON.stringify({...(selections?.length?{selections}:{}),owner:session.owner,id:session.id,game:session.game,
  plan:planKeys.map(key=>[key,session.design?.plan[key]||null]),turns:authoredTurns(session)});
 let left=0x811c9dc5,right=0x9e3779b9;
 for(let i=0;i<snapshot.length;i++){const char=snapshot.charCodeAt(i);left=Math.imul(left^char,0x01000193);right=Math.imul(right^char,0x85ebca6b);}
 return 'creation-v1:'+(left>>>0).toString(16).padStart(8,'0')+(right>>>0).toString(16).padStart(8,'0');
}

export function recordCreationReview(session:StudioSession,value:unknown,standard:CreationStandard=1):CreationReview {
 const verdict=verdictShape(value,standard);
 if(verdict.ready&&standard===2){
  const selected=selectedSuggestions(session);
  for(const [key,field] of Object.entries(creationPlan(session))){
   if(field?.origin==='helper'&&field.accepted&&!field.delegated&&
    session.design?.ideas.some(idea=>idea.id.startsWith('selection:'+key+':'))&&!selected[key as PlanField])
    throw Error('The selected suggestion needs its original offer and child choice.');
  }
 }
 const sources=authoredTurns(session).filter(turn=>turn.source==='child'&&!turn.superseded&&!turn.refused).map(turn=>turn.text);
 for(const field of Object.values(creationPlan(session)))if(field?.origin==='child'&&field.accepted&&!field.delegated)sources.push(field.value);
 supported(verdict,sources.filter(source=>!isConversationOnly(source)));
 return {...verdict,version:standard,source:'model',fingerprint:creationInputFingerprint(session)};
}

export function creationBuildReadiness(session:StudioSession,standard:CreationStandard=1):CreationBuildReadiness {
 if(session.draft.trim())return {ready:false,reason:'Send your new thought so we can include it in your game.',issue:'draft'};
 const review=session.design?.creationReview;
 if(!review)return {ready:false,reason:'Let’s check how your game will play.',issue:'missing-review'};
 try{
  validateCreationReview(review);
  if(review.version!==standard)return {ready:false,reason:'Let’s check how your game should look and play.',issue:'stale-review'};
  if(review.fingerprint!==creationInputFingerprint(session))return {ready:false,reason:'Let’s check your latest changes together.',issue:'stale-review'};
  recordCreationReview(session,{ready:review.ready,evidence:review.evidence,unresolved:review.unresolved},standard);
 }catch{return {ready:false,reason:'Let’s check your game idea together.',issue:'invalid-review'};}
 if(!review.ready)return {ready:false,reason:review.unresolved[0]||'Let’s work out the next part of your game.',issue:'unresolved'};
 return {ready:true,reason:''};
}
