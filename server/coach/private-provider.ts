/** Private generation-environment implementation. Not imported or instantiated by
 * the public gateway. It must never ship in browser bundles or a gateway image.
 * Model credentials are injected only into the separately approved private executor.
 */
import {COACH_POLICY,COACH_SCHEMA} from './policy';
import {approved,type CoachConfig,type CoachProvider} from './service';
import type {CoachContext} from '../../src/studio/design';
export type PrivateCoachConfig = CoachConfig & {apiKey:string};

const failureStages=['caller_verification','configuration','readiness','input_validation','budget',
 'input_moderation','inference','output_moderation','usage_validation','reply_validation','unknown'] as const;
const failureReasons=['denied','verification_failed','unavailable','invalid_request','input_limit','private_information',
 'turn_budget','rate_limit','http_error','transport_error','timeout','cancelled','invalid_json','invalid_shape',
 'response_limit','refused','incomplete','output_limit','provider_failed','invalid_usage','reply_invalid',
 'readiness_missing','readiness_invalid','unknown'] as const;
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
   case 'Invalid creation review.':case 'Creation review was not requested.':
   case 'Creation review needs exact child-authored evidence.':
   case 'A ready game needs grounded intent and no unresolved design gaps.':return 'readiness_invalid';
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
 private reservedCost(serialized:string){
  const c=this.config,inputCeiling=Buffer.byteLength(serialized+COACH_POLICY+JSON.stringify(COACH_SCHEMA))+2048;
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
   // UTF-8 bytes are a conservative token ceiling; include policy, schema and envelope overhead.
   stage='budget';reason='turn_budget';
   if(this.reservedCost(serialized)>c.maxTurnMicroUsd)throw Error('SPENDING_CUTOFF');
   await this.moderate(serialized,signal,'input_moderation');
   stage='inference';reason='transport_error';
   const response=await this.transport('https://api.openai.com/v1/responses',{method:'POST',signal,headers:{Authorization:`Bearer ${c.apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model:c.model,store:false,max_output_tokens:c.maxOutputTokens,input:[{role:'developer',content:COACH_POLICY},{role:'user',content:serialized}],text:{format:{type:'json_schema',name:'child_owned_design_coach',strict:true,schema:COACH_SCHEMA}}})});
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
   return {reply:JSON.parse(output),usedMicroUsd};
  }catch(error){
   throw tagCoachFailure(error,{stage,reason:reason==='transport_error'?failureReason(error,stage,signal):reason});
  }
 }
}
