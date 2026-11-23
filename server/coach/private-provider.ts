/** Private generation-environment implementation. Not imported or instantiated by
 * the public gateway. It must never ship in browser bundles or a gateway image.
 * Model credentials are injected only into the separately approved private executor.
 */
import {COACH_POLICY,COACH_SCHEMA} from './policy';
import {prepareCreationWire} from './private-creation-wire';
import {approved,type CoachConfig,type CoachProvider} from './service';
import {PLAN_FIELDS,coachReplyFields,type CoachContext} from '../../src/studio/design';
export type PrivateCoachConfig = CoachConfig & {apiKey:string};

/** Lossy recovery for non-authoritative model metadata only.
 * Text has already passed output moderation when it reaches this boundary.
 * Never infer child intent, alter readiness evidence, invent a plan or retry inference.
 * Public host validation still runs AFTER this; malformed mandatory fields fail shut.
 */
export function normalizePrivateCoachReply(value:unknown,context:CoachContext):unknown {
 if(!value||typeof value!=='object'||Array.isArray(value))return value;
 const r=structuredClone(value) as Record<string,unknown>;
 const object=(item:unknown):item is Record<string,unknown>=>!!item&&typeof item==='object'&&!Array.isArray(item);
 const exact=(item:Record<string,unknown>,allowed:string[])=>Object.keys(item).length===allowed.length&&
  allowed.every(key=>Object.hasOwn(item,key));
 const authored=[context.message,...context.conversation.filter(turn=>turn.role==='child').map(turn=>turn.text)];
 const fields=coachReplyFields(context);
 const childQuote=(item:unknown):item is {field:typeof PLAN_FIELDS[number];quote:string}=>
  object(item)&&exact(item,['field','quote'])&&fields.includes(item.field as any)&&
  typeof item.quote==='string'&&!!item.quote.trim()&&item.quote.length<=700&&
  authored.some(text=>text.includes(item.quote as string));
 const suggestion=(item:unknown):item is {field:typeof PLAN_FIELDS[number];value:string}=>
  object(item)&&exact(item,['field','value'])&&fields.includes(item.field as any)&&
  typeof item.value==='string'&&item.value.length<=700;
 // False observations and nonliteral child choices cannot be promoted into
 // authored decisions. Dropping them is safer than losing the entire reply.
 if(Array.isArray(r.evidenceIds)){
  const ids=new Set(context.observations.map(item=>item.id));
  r.evidenceIds=r.evidenceIds.filter((item):item is string=>typeof item==='string'&&ids.has(item)).slice(0,8);
 }
 if(Array.isArray(r.childDecisions))
  r.childDecisions=r.childDecisions.filter(childQuote).slice(0,8);
 if(Array.isArray(r.planSuggestions))
  r.planSuggestions=r.planSuggestions.filter(suggestion).slice(0,8);
 if(Array.isArray(r.suggestions))
  r.suggestions=r.suggestions.filter((item):item is string=>typeof item==='string'&&item.length<=500).slice(0,4);
 if(Object.hasOwn(r,'proposedChange')&&r.proposedChange!==null&&(!object(r.proposedChange)||
   !exact(r.proposedChange,['title','request','depth'])||
   typeof r.proposedChange.title!=='string'||r.proposedChange.title.length>120||
   typeof r.proposedChange.request!=='string'||r.proposedChange.request.length>2000||
   !['tune','redesign','rethink'].includes(String(r.proposedChange.depth))))
  r.proposedChange=null;
 // A second question is not a reason to discard a moderated conversation.
 // Keep the first complete question, rather than joining several into a quiz.
 const keepOneQuestion=(text:string)=>{
  let seen=false;
  return text.replace(/\?/g,()=>{if(seen)return '.';seen=true;return '?';});
 };
 if(typeof r.text==='string'&&r.text.includes('?')){
  r.text=keepOneQuestion(r.text);
  if(typeof r.question==='string'||r.question===null)r.question=null;
 }
 if(typeof r.question==='string'){
  const question=keepOneQuestion(r.question);
  r.question=question.length>350?null:question;
 }
 if(context.mode==='reflect'&&r.move==='propose'&&r.proposedChange===null)r.move='reflect';
 // Crucially, never adjust creationReadiness, its sources or unresolved gaps.
 return r;
}


const failureStages=['caller_verification','configuration','readiness','input_validation','budget',
 'input_moderation','inference','output_moderation','usage_validation','reply_validation','unknown'] as const;
const failureReasons=['denied','verification_failed','unavailable','invalid_request','input_limit','private_information',
 'turn_budget','rate_limit','http_error','transport_error','timeout','cancelled','invalid_json','invalid_shape',
 'response_limit','refused','incomplete','output_limit','provider_failed','invalid_usage','reply_invalid','reply_shape_invalid','reply_proposal_invalid','reply_quote_invalid','reply_question_invalid',
 'readiness_missing','readiness_invalid','readiness_shape_invalid','readiness_evidence_invalid',
 'readiness_inconsistent','readiness_context_invalid','readiness_reference_invalid','unknown'] as const;
export type CoachFailureStage=typeof failureStages[number];
export type CoachFailureReason=typeof failureReasons[number];
export interface CoachFailureDetail {
 stage:CoachFailureStage;
 reason:CoachFailureReason;
 providerHttpStatus?:number;
 incompleteReason?:'max_output_tokens'|'content_filter'|'other';
}
export interface CoachFailureEvent extends CoachFailureDetail {
 event:'jems_private_coach_failure';version:1;elapsedMs:number;
}
// Diagnostics are private process metadata, never properties on the error or a
// wire response. Preserve the original error identity/message and public mapping.
const failureDetails=new WeakMap<object,CoachFailureDetail>();
function safeDetail(detail:CoachFailureDetail):CoachFailureDetail {
 const {stage,reason,providerHttpStatus,incompleteReason}=detail;
 return {
  stage:failureStages.includes(stage)?stage:'unknown',
  reason:failureReasons.includes(reason)?reason:'unknown',
  ...(typeof providerHttpStatus==='number'&&Number.isInteger(providerHttpStatus)&&providerHttpStatus>=100&&providerHttpStatus<=599?
   {providerHttpStatus}:{}),
  ...(['max_output_tokens','content_filter','other'].includes(incompleteReason||'')?{incompleteReason}:{})
 };
}
export function tagCoachFailure<T>(error:T,detail:CoachFailureDetail):T {
 if(error!==null&&(typeof error==='object'||typeof error==='function')&&!failureDetails.has(error))
  failureDetails.set(error,safeDetail(detail));
 return error;
}
function failureReason(error:unknown,stage:CoachFailureStage,signal?:AbortSignal):CoachFailureReason {
 if(signal?.aborted)return signal.reason instanceof Error&&signal.reason.name==='TimeoutError'?'timeout':'cancelled';
 if(error instanceof Error){
  if(error.name==='TimeoutError')return 'timeout';
  if(error.name==='AbortError')return 'cancelled';
  // Exact matches choose fixed categories; the original string is never emitted.
  switch(error.message){
   case 'FORBIDDEN':return 'denied';
   case 'COACH_UNAVAILABLE':return 'unavailable';
   case 'INVALID_REQUEST':return 'invalid_request';
   case 'PRIVATE_INFORMATION':return 'private_information';
   case 'SPENDING_CUTOFF':return 'turn_budget';
   case 'RATE_LIMIT':return 'rate_limit';
   case 'COACH_REFUSED':return 'refused';
   case 'CREATION_REVIEW_MISSING':return 'readiness_missing';
   case 'Invalid coach response.':return 'reply_shape_invalid';
   case 'Invalid proposed experiment.':return 'reply_proposal_invalid';
   case 'Child decision needs an exact child-authored quote.':return 'reply_quote_invalid';
   case 'Missing proposal.':return 'reply_proposal_invalid';
   case 'Ask one useful question at a time.':return 'reply_question_invalid';
   case 'Invalid creation review.':return 'readiness_shape_invalid';
   case 'Creation review was not requested.':return 'readiness_context_invalid';
   case 'Creation review needs exact child-authored evidence.':return 'readiness_evidence_invalid';
   case 'A ready game needs grounded intent and no unresolved design gaps.':return 'readiness_inconsistent';
   case 'Invalid creation evidence reference.':return 'readiness_reference_invalid';
  }
 }
 if(stage==='caller_verification')return 'verification_failed';
 if(stage==='input_validation')return 'invalid_request';
 if(stage==='usage_validation')return 'invalid_usage';
 if(stage==='reply_validation')return 'reply_invalid';
 if(['input_moderation','inference','output_moderation'].includes(stage))return 'transport_error';
 return 'unknown';
}
/** Construct only allowlisted primitives. Never serialize an Error, response,
 * request, identity, provider text, headers, stack or cause into diagnostics. */
export function coachFailureEvent(error:unknown,stage:CoachFailureStage,elapsedMs:number,signal?:AbortSignal):CoachFailureEvent {
 const tagged=error!==null&&(typeof error==='object'||typeof error==='function')?failureDetails.get(error):undefined;
 const detail=safeDetail(tagged||{stage,reason:failureReason(error,stage,signal)});
 return {event:'jems_private_coach_failure',version:1,...detail,
  elapsedMs:Number.isFinite(elapsedMs)?Math.max(0,Math.min(3600000,Math.round(elapsedMs))):0};
}
function fail(message:string,detail:CoachFailureDetail):never {throw tagCoachFailure(Error(message),detail);}

export class OpenAICoachProvider implements CoachProvider {
 constructor(private config:PrivateCoachConfig,private transport:typeof fetch=fetch){}
 private reservedCost(serialized:string,schema:object=COACH_SCHEMA){
  const c=this.config,inputCeiling=Buffer.byteLength(serialized+COACH_POLICY+JSON.stringify(schema))+2048;
  return Math.ceil((inputCeiling*c.inputMicroUsdPerMillion+c.maxOutputTokens*c.outputMicroUsdPerMillion)/1000000);
 }
 /** Local configuration arithmetic only. A key/reachable service is not usable
  * if even its fixed prompt cannot fit the already-approved turn allowance. */
 async readiness(_signal:AbortSignal):Promise<boolean>{
  return approved(this.config)&&!!this.config.apiKey&&this.config.apiKey.length>=16&&this.reservedCost('')<=this.config.maxTurnMicroUsd;
 }
 private async moderate(input:string,signal:AbortSignal,stage:'input_moderation'|'output_moderation'){
  let reason:CoachFailureReason='transport_error';
  try{
   const response=await this.transport('https://api.openai.com/v1/moderations',{method:'POST',signal,headers:{Authorization:`Bearer ${this.config.apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model:'omni-moderation-latest',input})});
   // Do not read a provider error body: it can contain request or account data.
   if(!response.ok)fail('COACH_PROVIDER_FAILED',{stage,reason:'http_error',providerHttpStatus:response.status});
   const raw=await response.text();if(raw.length>100000)fail('COACH_PROVIDER_FAILED',{stage,reason:'response_limit'});
   reason='invalid_json';const result=JSON.parse(raw);reason='invalid_shape';
   if(!Array.isArray(result.results)||!result.results.length||result.results.some((r:any)=>typeof r.flagged!=='boolean'||r.flagged))
    fail('COACH_REFUSED',{stage,reason:Array.isArray(result.results)&&result.results.some((r:any)=>r?.flagged===true)?'refused':'invalid_shape'});
  }catch(error){
   throw tagCoachFailure(error,{stage,reason:reason==='transport_error'?failureReason(error,stage,signal):reason});
  }
 }
 async complete(context:CoachContext,signal:AbortSignal){
  let stage:CoachFailureStage='configuration',reason:CoachFailureReason='unavailable';
  try{
   if(!approved(this.config)||!this.config.apiKey||this.config.apiKey.length<16)throw Error('COACH_UNAVAILABLE');
   stage='input_validation';reason='invalid_request';
   const c=this.config,serialized=JSON.stringify(context);
   if(serialized.length>c.maxInputChars)fail('INVALID_REQUEST',{stage,reason:'input_limit'});
   const wire=prepareCreationWire(context,COACH_SCHEMA),modelInput=JSON.stringify(wire.input);
   // UTF-8 bytes are a conservative token ceiling; include policy, schema and envelope overhead.
   stage='budget';reason='turn_budget';
   if(this.reservedCost(modelInput,wire.schema)>c.maxTurnMicroUsd)throw Error('SPENDING_CUTOFF');
   await this.moderate(serialized,signal,'input_moderation');
   stage='inference';reason='transport_error';
   const response=await this.transport('https://api.openai.com/v1/responses',{method:'POST',signal,headers:{Authorization:`Bearer ${c.apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model:c.model,store:false,max_output_tokens:c.maxOutputTokens,input:[{role:'developer',content:COACH_POLICY},{role:'user',content:modelInput}],text:{format:{type:'json_schema',name:'child_owned_design_coach',strict:true,schema:wire.schema}}})});
   if(!response.ok)fail('COACH_PROVIDER_FAILED',{stage,reason:'http_error',providerHttpStatus:response.status});
   const raw=await response.text();if(raw.length>100000)fail('COACH_PROVIDER_FAILED',{stage,reason:'response_limit'});
   reason='invalid_json';const body=JSON.parse(raw);reason='invalid_shape';
   if(body.incomplete_details?.reason==='content_filter'||body.output?.some((m:any)=>m.content?.some((c:any)=>c.type==='refusal')))
    fail('COACH_REFUSED',{stage,reason:'refused',...(body.incomplete_details?.reason==='content_filter'?{incompleteReason:'content_filter' as const}:{})});
   // An exhausted output allowance remains a technical failure, not a refusal
   // or permission to retry another metered request.
   if(body.status!=='completed'){
    const incompleteReason=body.incomplete_details?.reason==='max_output_tokens'?'max_output_tokens':'other';
    fail('COACH_PROVIDER_FAILED',{stage,reason:incompleteReason==='max_output_tokens'?'output_limit':body.status==='failed'?'provider_failed':'incomplete',incompleteReason});
   }
   const output=body.output?.flatMap((m:any)=>m.type==='message'?m.content||[]:[]).filter((c:any)=>c.type==='output_text').map((c:any)=>c.text).join('');
   stage='usage_validation';reason='invalid_usage';
   const u=body.usage;if(!Number.isSafeInteger(u?.input_tokens)||u.input_tokens<0||!Number.isSafeInteger(u?.output_tokens)||u.output_tokens<0)throw Error('COACH_PROVIDER_FAILED');
   const usedMicroUsd=Math.ceil((u.input_tokens*c.inputMicroUsdPerMillion+u.output_tokens*c.outputMicroUsdPerMillion)/1000000);
   await this.moderate(output,signal,'output_moderation');
   stage='reply_validation';reason='invalid_json';
   const parsed=JSON.parse(output);reason='reply_invalid';
   return {reply:wire.decode(parsed),usedMicroUsd};
  }catch(error){
   throw tagCoachFailure(error,{stage,reason:reason==='transport_error'||reason==='reply_invalid'?failureReason(error,stage,signal):reason});
  }
 }
}
