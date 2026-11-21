import type {CoachContext} from './design';
import type {StudioSession} from './notebook';
import {visibleConversation} from './conversation-view';

/** The coach judges coherence. The host verifies whose words support that
 * judgment and that it still describes this exact saved conversation. */
export interface CreationReadinessVerdict {
 ready:boolean;
 evidence:{action:string;consequence:string;experience:string;world:string};
 unresolved:string[];
}
export interface CreationReview extends CreationReadinessVerdict {
 version:1;
 source:'model';
 fingerprint:string;
}
const evidenceKeys=['action','consequence','experience','world'] as const;
const planKeys=['fun','action','goal','setback','score','style','progression','special'] as const;
const isRecord=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const only=(value:Record<string,unknown>,keys:readonly string[])=>Object.keys(value).every(key=>keys.includes(key));

function verdictShape(value:unknown):CreationReadinessVerdict {
 if(!isRecord(value)||!only(value,['ready','evidence','unresolved'])||typeof value.ready!=='boolean'||
  !isRecord(value.evidence)||!only(value.evidence,evidenceKeys))throw Error('Invalid creation review.');
 const evidence=value.evidence;
 if(!evidenceKeys.every(key=>typeof evidence[key]==='string'&&(evidence[key] as string).length<=700)||
  !Array.isArray(value.unresolved)||value.unresolved.length>8||!value.unresolved.every(item=>typeof item==='string'&&!!item.trim()&&item.length<=350))
  throw Error('Invalid creation review.');
 const verdict=value as unknown as CreationReadinessVerdict;
 if(verdict.ready&&(verdict.unresolved.length||evidenceKeys.some(key=>!verdict.evidence[key].trim())))throw Error('A ready game needs grounded intent and no unresolved design gaps.');
 return structuredClone(verdict);
}

function supported(verdict:CreationReadinessVerdict,sources:readonly string[]){
 for(const key of evidenceKeys){const quote=verdict.evidence[key];if(quote&&!sources.some(source=>source.includes(quote)))throw Error('Creation review needs exact child-authored evidence.');}
}

/** Transport validation; a complete-looking set of fields alone is never a
 * readiness verdict. Missing metadata remains compatible but cannot unlock Build. */
export function validateCreationReadiness(value:unknown,context:CoachContext):CreationReadinessVerdict {
 const verdict=verdictShape(value);
 if(context.creation?.version!==1)throw Error('Creation review was not requested.');
 const sources=[context.message,...context.conversation.filter(message=>message.role==='child').map(message=>message.text),
  ...Object.values(context.plan).filter(field=>field?.origin==='child'&&field.accepted&&!field.delegated).map(field=>field!.value)];
 supported(verdict,sources);
 return verdict;
}

export function validateCreationReview(value:unknown):CreationReview {
 if(!isRecord(value)||!only(value,['version','source','fingerprint','ready','evidence','unresolved'])||value.version!==1||value.source!=='model'||
  typeof value.fingerprint!=='string'||!/^creation-v1:[a-f0-9]{16}$/.test(value.fingerprint))throw Error('Invalid saved creation review.');
 return {...verdictShape({ready:value.ready,evidence:value.evidence,unresolved:value.unresolved}),version:1,source:'model',fingerprint:value.fingerprint};
}

function authoredTurns(session:StudioSession){
 return visibleConversation(session.messages).filter(message=>message.role==='child').map(message=>{
  const source=session.design?.ideas.find(idea=>idea.id==='build-intent:'+message.id)?.origin||
   (session.design?.ideas.some(idea=>idea.origin==='helper'&&idea.text===message.text)||
    Object.values(session.design?.plan||{}).some(field=>field?.origin==='helper'&&field.value===message.text)?'helper':'child');
  const superseded=session.design?.ideas.some(idea=>idea.id==='superseded-turn:'+message.id&&!idea.adopted)||false;
  const index=session.messages.findIndex(item=>item.id===message.id);
  const following=session.messages.slice(index+1).find(item=>item.role==='child'||item.role==='helper');
  const refused=following?.role==='helper'&&following.text.startsWith('I can help with safe game ideas. Let’s try another idea without sharing private details.');
  return {id:message.id,text:message.text,source,superseded,refused};
 });
}

/** A change detector, not a signature or a replacement for paid/auth safeguards.
 * Excludes the draft and helper prose; both may change after the reviewed turn. */
export function creationInputFingerprint(session:StudioSession):string {
 const snapshot=JSON.stringify({owner:session.owner,id:session.id,game:session.game,
  plan:planKeys.map(key=>[key,session.design?.plan[key]||null]),turns:authoredTurns(session)});
 let left=0x811c9dc5,right=0x9e3779b9;
 for(let i=0;i<snapshot.length;i++){const char=snapshot.charCodeAt(i);left=Math.imul(left^char,0x01000193);right=Math.imul(right^char,0x85ebca6b);}
 return 'creation-v1:'+(left>>>0).toString(16).padStart(8,'0')+(right>>>0).toString(16).padStart(8,'0');
}

export function recordCreationReview(session:StudioSession,value:unknown):CreationReview {
 const verdict=verdictShape(value);
 const sources=authoredTurns(session).filter(turn=>turn.source==='child'&&!turn.superseded&&!turn.refused).map(turn=>turn.text);
 for(const field of Object.values(session.design?.plan||{}))if(field?.origin==='child'&&field.accepted&&!field.delegated)sources.push(field.value);
 supported(verdict,sources);
 return {...verdict,version:1,source:'model',fingerprint:creationInputFingerprint(session)};
}

export function creationBuildReadiness(session:StudioSession):{ready:boolean;reason:string} {
 if(session.draft.trim())return {ready:false,reason:'Send your new thought so we can include it in your game.'};
 const review=session.design?.creationReview;
 if(!review)return {ready:false,reason:'Let’s talk through how your game will play.'};
 try{
  validateCreationReview(review);
  if(review.fingerprint!==creationInputFingerprint(session))return {ready:false,reason:'Let’s check your latest changes together.'};
  recordCreationReview(session,{ready:review.ready,evidence:review.evidence,unresolved:review.unresolved});
 }catch{return {ready:false,reason:'Let’s check your game idea together.'};}
 if(!review.ready)return {ready:false,reason:review.unresolved[0]||'Let’s work out the next part of your game.'};
 return {ready:true,reason:''};
}
