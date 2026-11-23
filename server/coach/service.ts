import {createHash,randomUUID} from 'node:crypto';
import {allowedCoachFamily} from './consent';
import {verifiedParentScope} from '../privacy/parent-consent';
import {adultPilotAllowed,adultPilotConfigured,type AdultPilotFlags} from '../adult-pilot';
import {assertActiveTrustedDevice} from '../trusted-devices';
import {freshDesign,validateDesign,validateCoachReply,type CoachContext,type CoachReply} from '../../src/studio/design';
import type {Repository,PipelineState} from '../pipeline/types';
import type {VerifiedSession} from '../contracts/api';
export interface CoachConfig {
 enabled:boolean;privacyApproved:boolean;moderationApproved:boolean;zdrVerified:boolean;privateExecutionApproved:boolean;model:string;
 requireVerifiedParentPrivacy?:boolean;adultPilot?:AdultPilotFlags;
 maxInputChars:number;maxOutputTokens:number;maxTurnMicroUsd:number;
 inputMicroUsdPerMillion:number;outputMicroUsdPerMillion:number;pricesReviewedAt:string;
}
export interface CoachReceipt {id:string;familyId:string;subject:string;hash:string;month:string;reserved:number;at:number;state:'running'|'ready'|'failed';reply?:CoachReply}
/** Bounded server reply cache: child conversation remains local to the browser. */
export const COACH_RECEIPT_TTL_MS=15*60_000;
export interface CoachProvider {complete(context:CoachContext,signal:AbortSignal):Promise<{reply:unknown;usedMicroUsd:number}>;readiness?(signal:AbortSignal):Promise<boolean>}
export function validateCoachContext(input:any):CoachContext {
 if(!input||typeof input!=='object'||Object.keys(input).some(k=>!['message','mode','game','plan','rules','friction','helpLevel','support','conversation','observations','tests','creation'].includes(k))||typeof input.message!=='string'||input.message.length>2000||!['discuss','ideas','explain','reflect'].includes(input.mode)||typeof input.game!=='string'||input.game.length>120)throw Error('INVALID_REQUEST');
 if(input.creation!==undefined&&(!input.creation||typeof input.creation!=='object'||Array.isArray(input.creation)||Object.keys(input.creation).some(key=>key!=='version')||![1,2].includes(input.creation.version)))throw Error('INVALID_REQUEST');
 validateDesign({...freshDesign(),plan:input.plan,friction:input.friction,helpLevel:input.helpLevel,support:input.support,observations:input.observations});
 if(!Array.isArray(input.conversation)||input.conversation.length>16||!input.conversation.every((m:any)=>m&&Object.keys(m).every(k=>['role','text'].includes(k))&&['child','helper','reflection'].includes(m.role)&&typeof m.text==='string'&&m.text.length<=2200))throw Error('INVALID_REQUEST');
 if(!Array.isArray(input.tests)||input.tests.length>12||!input.tests.every((t:any)=>t&&Object.keys(t).every(k=>['label','title','prediction','notes'].includes(k))&&['label','title','prediction','notes'].every(k=>typeof t[k]==='string'&&t[k].length<=2000)))throw Error('INVALID_REQUEST');
 if(input.rules!==undefined&&(typeof input.rules!=='string'||input.rules.length>2000))throw Error('INVALID_REQUEST');
 return structuredClone(input);
}
export function approved(c:CoachConfig):boolean {
 return c.enabled&&c.privacyApproved&&c.moderationApproved&&
  (c.adultPilot?.enabled===true?adultPilotConfigured(c.adultPilot):c.zdrVerified)&&c.privateExecutionApproved&&/^[a-zA-Z0-9._-]{1,100}$/.test(c.model)&&Number.isSafeInteger(c.maxTurnMicroUsd)&&c.maxTurnMicroUsd>0&&c.maxTurnMicroUsd<=100000&&Number.isInteger(c.maxOutputTokens)&&c.maxOutputTokens>=128&&c.maxOutputTokens<=2000&&Number.isInteger(c.maxInputChars)&&c.maxInputChars>=1000&&c.maxInputChars<=24000&&Number.isSafeInteger(c.inputMicroUsdPerMillion)&&c.inputMicroUsdPerMillion>0&&Number.isSafeInteger(c.outputMicroUsdPerMillion)&&c.outputMicroUsdPerMillion>0&&Date.parse(c.pricesReviewedAt)<=Date.now()&&Date.parse(c.pricesReviewedAt)>Date.now()-31*86400000;
}
export class CoachService {
 constructor(private repo:Repository,private config:CoachConfig,private provider?:CoachProvider){}
 available(){return approved(this.config)&&!!this.provider;}
 private permitted(state:PipelineState,session:VerifiedSession,now=Date.now()):boolean{
  try{assertActiveTrustedDevice(state,session,now);}catch{return false;}
  if(this.config.adultPilot?.enabled===true)return adultPilotAllowed(state,session,now);
  if(session.adultSessionId||session.adultProfileId)return false;
  return allowedCoachFamily(state,session,'model',now)&&
   (!this.config.requireVerifiedParentPrivacy||verifiedParentScope(state,session.familyId,'conversation',now));
 }
 /** Configured isn't enough: the production bridge must answer an authenticated
  * no-inference probe before the UI claims it is reachable. Fixture providers
  * without a probe preserve existing contract tests, never production claims.
  */
 async ready(session?:VerifiedSession):Promise<boolean>{
  if(!this.available()||!session||session.expiresAt<=Date.now())return false;
  try{
   const state=await this.repo.snapshot(),ledger=state.ledgers[session.familyId];
   const month=new Date().toISOString().slice(0,7);
   const permitted=this.permitted(state,session);
   if(!permitted||!ledger?.paidEnabled||ledger.month!==month||
    ledger.used+ledger.reserved+this.config.maxTurnMicroUsd>ledger.allowance)return false;
   if(this.provider?.readiness&&!await this.provider.readiness(AbortSignal.timeout(3000)))return false;
   return this.permitted(await this.repo.snapshot(),session);
  }catch{return false;}
 }
 /** Parent-authenticated erasure of completed coach content. Usage and security
  * audit totals remain for accounting; no child utterances are stored there.
  * Refuse while an inference is in flight to avoid recreating content after erasure.
  */
 async eraseFamilyReceipts(session:VerifiedSession):Promise<{erased:number}>{
  if(!session||session.expiresAt<=Date.now()||session.role!=='parent')throw Error('FORBIDDEN');
  return this.repo.transaction(state=>{
   assertActiveTrustedDevice(state,session);
   if((state.coachReceipts||[]).some(r=>r.familyId===session.familyId&&r.state==='running')||
      (state.audioReceipts||[]).some(r=>r.familyId===session.familyId&&r.state==='running'))
    throw Error('COACH_REQUEST_EXISTS');
   const prior=state.coachReceipts||[],audio=state.audioReceipts||[];
   state.coachReceipts=prior.filter(r=>r.familyId!==session.familyId);
   state.audioReceipts=audio.filter(r=>r.familyId!==session.familyId);
   // Aggregate usage/audit accounting is retained without message/audio content.
   return {erased:prior.length-state.coachReceipts.length+audio.length-state.audioReceipts.length};
  });
 }
 async respond(session:VerifiedSession,input:any):Promise<{reply:CoachReply;mode:'model'}>{
  if(!this.available())throw Error('COACH_UNAVAILABLE');
  if(!session||session.expiresAt<=Date.now()||!['parent','designer'].includes(session.role))throw Error('UNAUTHENTICATED');
  if(!input||Object.keys(input).some(k=>!['requestId','context'].includes(k))||typeof input.requestId!=='string'||!/^[\w-]{1,100}$/.test(input.requestId))throw Error('INVALID_REQUEST');
  const context=validateCoachContext(input.context),serialized=JSON.stringify(context);
  if(serialized.length>this.config.maxInputChars)throw Error('INVALID_REQUEST');
  // Defense in depth, not a privacy guarantee or replacement for approved ZDR/minor safeguards.
  if(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\b(?:sk-|ghp_|github_pat_)\S+|\b\d{3}[- .]\d{3}[- .]\d{4}\b/i.test(serialized))throw Error('PRIVATE_INFORMATION');
  const hash=createHash('sha256').update(serialized).digest('hex');
  // Never reuse a child's cache entry in an adult session, or revive a reply
  // admitted by an adult session that was subsequently locked.
  const subject=session.adultSessionId?`${session.subject}:adult:${session.adultSessionId}`:session.subject;
  const reservation=await this.repo.transaction(state=>{
   // Firestore may wait or retry the transaction; use admission time, not request time.
   const now=Date.now(),month=new Date(now).toISOString().slice(0,7);
   // #42 device revocation must win atomically before a funded model call.
   assertActiveTrustedDevice(state,session,now);
   if(!this.available()||!this.permitted(state,session,now))
    throw Error('COACH_UNAVAILABLE');
   state.coachReceipts=(state.coachReceipts||[]).filter(r=>r.state==='running'||r.at>=now-COACH_RECEIPT_TTL_MS);
   const list=state.coachReceipts;
   const old=list.find(x=>x.id===input.requestId&&x.familyId===session.familyId&&x.subject===subject);
   if(old){if(old.hash!==hash)throw Error('IDEMPOTENCY_CONFLICT');if(old.state==='ready')return {cached:old.reply!};throw Error('COACH_REQUEST_EXISTS');}
   if(list.filter(x=>x.familyId===session.familyId&&x.at>now-60000).length>=10)throw Error('RATE_LIMIT');
   if(list.length>=500)throw Error('COACH_HISTORY_FULL');
   const ledger=state.ledgers[session.familyId];if(!ledger?.paidEnabled||ledger.month!==month||ledger.used+ledger.reserved+this.config.maxTurnMicroUsd>ledger.allowance)throw Error('SPENDING_CUTOFF');
   ledger.reserved+=this.config.maxTurnMicroUsd;list.push({id:input.requestId,familyId:session.familyId,subject,hash,month,reserved:this.config.maxTurnMicroUsd,at:now,state:'running'});
   return {cached:null};
  });
  if(reservation.cached)return {reply:reservation.cached,mode:'model'};
  let usage=this.config.maxTurnMicroUsd,candidate:CoachReply|undefined,failure:unknown;
  try{
   const result=await this.provider!.complete(context,AbortSignal.timeout(25000));
   if(!Number.isSafeInteger(result.usedMicroUsd)||result.usedMicroUsd<0||result.usedMicroUsd>this.config.maxTurnMicroUsd)throw Error('COACH_PROVIDER_FAILED');
   usage=result.usedMicroUsd;candidate=validateCoachReply(result.reply,context);
  }catch(error){failure=error;}
  // The permission check and cache publication share a transaction. A device
  // revocation or profile lock while the provider runs must leave no reply.
  const completion=await this.repo.transaction(state=>{
   const r=state.coachReceipts?.find(x=>x.id===input.requestId&&x.familyId===session.familyId&&x.subject===subject);
   if(!r)throw Error('COACH_UNAVAILABLE');
   const ledger=state.ledgers[session.familyId];
   if(ledger&&ledger.month===r.month){ledger.reserved=Math.max(0,ledger.reserved-r.reserved);ledger.used+=usage;}
   const now=Date.now();let authenticated=true;
   try{assertActiveTrustedDevice(state,session,now);}catch{authenticated=false;}
   const result=!failure&&candidate&&authenticated&&this.permitted(state,session,now)?candidate:null;
   r.state=result?'ready':'failed';if(result)r.reply=result;else delete r.reply;
   state.audit.push({jobId:'coach-'+randomUUID(),familyId:session.familyId,status:result?'ready':'failed',at:new Date().toISOString(),code:'COACH_TURN'});
   return {reply:result,authenticated};
  });
  if(failure)throw failure;
  // Keep the existing authentication error after committing failed completion
  // and usage accounting; throwing inside the transaction would roll them back.
  if(!completion.authenticated)throw Error('UNAUTHENTICATED');
  if(!completion.reply)throw Error('COACH_UNAVAILABLE');
  return {reply:completion.reply,mode:'model'};
 }
}
