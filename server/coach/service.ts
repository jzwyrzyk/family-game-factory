import {createHash,randomUUID} from 'node:crypto';
import {freshDesign,validateDesign,validateCoachReply,type CoachContext,type CoachReply} from '../../src/studio/design';
import type {Repository} from '../pipeline/types';
import type {VerifiedSession} from '../contracts/api';
import {COACH_POLICY,COACH_SCHEMA} from './policy';
export interface CoachConfig {
 enabled:boolean;privacyApproved:boolean;moderationApproved:boolean;
 zdrApproved?:boolean;familyConsentApproved?:boolean;brokerApproved?:boolean;brokerOrigin?:string;
 model:string;apiKey?:string;
 maxInputChars:number;maxOutputTokens:number;maxTurnMicroUsd:number;
 inputMicroUsdPerMillion:number;outputMicroUsdPerMillion:number;pricesReviewedAt:string;
}
export interface CoachReceipt {id:string;familyId:string;subject:string;hash:string;month:string;reserved:number;at:number;state:'running'|'ready'|'failed';reply?:CoachReply}
export interface CoachProvider {complete(context:CoachContext,signal:AbortSignal):Promise<{reply:unknown;usedMicroUsd:number}>}
export function boundedContext(input:any):CoachContext {
 if(!input||typeof input!=='object'||Object.keys(input).some(k=>!['message','mode','game','plan','rules','friction','helpLevel','support','conversation','observations','tests'].includes(k))||typeof input.message!=='string'||input.message.length>2000||!['discuss','ideas','explain','reflect'].includes(input.mode)||typeof input.game!=='string'||input.game.length>120)throw Error('INVALID_REQUEST');
 validateDesign({...freshDesign(),plan:input.plan,friction:input.friction,helpLevel:input.helpLevel,support:input.support,observations:input.observations});
 if(!Array.isArray(input.conversation)||input.conversation.length>16||!input.conversation.every((m:any)=>m&&Object.keys(m).every(k=>['role','text'].includes(k))&&['child','helper','reflection'].includes(m.role)&&typeof m.text==='string'&&m.text.length<=2200))throw Error('INVALID_REQUEST');
 if(!Array.isArray(input.tests)||input.tests.length>12||!input.tests.every((t:any)=>t&&Object.keys(t).every(k=>['label','title','prediction','notes'].includes(k))&&['label','title','prediction','notes'].every(k=>typeof t[k]==='string'&&t[k].length<=2000)))throw Error('INVALID_REQUEST');
 if(input.rules!==undefined&&(typeof input.rules!=='string'||input.rules.length>2000))throw Error('INVALID_REQUEST');
 return structuredClone(input);
}
export function approved(c:CoachConfig):boolean {
 return c.enabled&&c.privacyApproved&&c.moderationApproved&&
  c.zdrApproved===true&&c.familyConsentApproved===true&&c.brokerApproved===true&&
  typeof c.brokerOrigin==='string'&&/^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.run\.app$/i.test(c.brokerOrigin)&&/^[a-zA-Z0-9._-]{1,100}$/.test(c.model)&&Number.isSafeInteger(c.maxTurnMicroUsd)&&c.maxTurnMicroUsd>0&&c.maxTurnMicroUsd<=100000&&Number.isInteger(c.maxOutputTokens)&&c.maxOutputTokens>=128&&c.maxOutputTokens<=2000&&Number.isInteger(c.maxInputChars)&&c.maxInputChars>=1000&&c.maxInputChars<=24000&&Number.isSafeInteger(c.inputMicroUsdPerMillion)&&c.inputMicroUsdPerMillion>0&&Number.isSafeInteger(c.outputMicroUsdPerMillion)&&c.outputMicroUsdPerMillion>0&&Date.parse(c.pricesReviewedAt)<=Date.now()&&Date.parse(c.pricesReviewedAt)>Date.now()-31*86400000;
}
export class OpenAICoachProvider implements CoachProvider {
 constructor(private config:CoachConfig,private transport:typeof fetch=fetch){}
 private async moderate(input:string,signal:AbortSignal){
  const response=await this.transport('https://api.openai.com/v1/moderations',{method:'POST',signal,headers:{Authorization:`Bearer ${this.config.apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model:'omni-moderation-latest',input})});
  if(!response.ok)throw Error('COACH_PROVIDER_FAILED');const raw=await response.text();if(raw.length>100000)throw Error('COACH_PROVIDER_FAILED');const result=JSON.parse(raw);if(!Array.isArray(result.results)||!result.results.length||result.results.some((r:any)=>typeof r.flagged!=='boolean'||r.flagged))throw Error('COACH_REFUSED');
 }
 async complete(context:CoachContext,signal:AbortSignal){
  if(!approved(this.config)||!this.config.apiKey)throw Error('COACH_UNAVAILABLE');
  const c=this.config,serialized=JSON.stringify(context);
  if(serialized.length>c.maxInputChars)throw Error('INVALID_REQUEST');
  // UTF-8 bytes are a conservative token ceiling; include policy, schema and envelope overhead.
  const inputCeiling=Buffer.byteLength(serialized+COACH_POLICY+JSON.stringify(COACH_SCHEMA))+2048;
  if(Math.ceil((inputCeiling*c.inputMicroUsdPerMillion+c.maxOutputTokens*c.outputMicroUsdPerMillion)/1000000)>c.maxTurnMicroUsd)throw Error('SPENDING_CUTOFF');
  await this.moderate(serialized,signal);
  const response=await this.transport('https://api.openai.com/v1/responses',{method:'POST',signal,headers:{Authorization:`Bearer ${c.apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model:c.model,store:false,max_output_tokens:c.maxOutputTokens,input:[{role:'developer',content:COACH_POLICY},{role:'user',content:serialized}],text:{format:{type:'json_schema',name:'child_owned_design_coach',strict:true,schema:COACH_SCHEMA}}})});
  if(!response.ok)throw Error('COACH_PROVIDER_FAILED');
  const raw=await response.text();if(raw.length>100000)throw Error('COACH_PROVIDER_FAILED');
  const body=JSON.parse(raw);if(body.status!=='completed'||body.output?.some((m:any)=>m.content?.some((c:any)=>c.type==='refusal')))throw Error('COACH_REFUSED');
  const output=body.output?.flatMap((m:any)=>m.type==='message'?m.content||[]:[]).filter((c:any)=>c.type==='output_text').map((c:any)=>c.text).join('');
  const u=body.usage;if(!Number.isSafeInteger(u?.input_tokens)||u.input_tokens<0||!Number.isSafeInteger(u?.output_tokens)||u.output_tokens<0)throw Error('COACH_PROVIDER_FAILED');
  const usedMicroUsd=Math.ceil((u.input_tokens*c.inputMicroUsdPerMillion+u.output_tokens*c.outputMicroUsdPerMillion)/1000000);
  await this.moderate(output,signal);
  return {reply:JSON.parse(output),usedMicroUsd};
 }
}
export class CoachService {
 constructor(private repo:Repository,private config:CoachConfig,private provider:CoachProvider={
  complete:async()=>{throw Error('COACH_UNAVAILABLE');}
 }){}
 available(){return approved(this.config);}
 async respond(session:VerifiedSession,input:any):Promise<{reply:CoachReply;mode:'model'}>{
  if(!this.available())throw Error('COACH_UNAVAILABLE');
  if(!session||session.expiresAt<=Date.now()||!['parent','designer'].includes(session.role))throw Error('UNAUTHENTICATED');
  if(!input||Object.keys(input).some(k=>!['requestId','context'].includes(k))||typeof input.requestId!=='string'||!/^[\w-]{1,100}$/.test(input.requestId))throw Error('INVALID_REQUEST');
  const context=boundedContext(input.context),serialized=JSON.stringify(context);
  if(serialized.length>this.config.maxInputChars)throw Error('INVALID_REQUEST');
  // Defense in depth, not a privacy guarantee or replacement for approved ZDR/minor safeguards.
  if(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\b(?:sk-|ghp_|github_pat_)\S+|\b\d{3}[- .]\d{3}[- .]\d{4}\b/i.test(serialized))throw Error('PRIVATE_INFORMATION');
  const hash=createHash('sha256').update(serialized).digest('hex'),now=Date.now(),month=new Date(now).toISOString().slice(0,7);
  const reservation=await this.repo.transaction(state=>{
   state.coachReceipts ||= [];const list=state.coachReceipts;
   // Hash-only: no child words or model replies retained in server receipts.
    for(let i=list.length-1;i>=0;i--)if(list[i].at<now-7*86400000)list.splice(i,1);
    for(const receipt of list)delete receipt.reply;
    const old=list.find(x=>x.id===input.requestId&&x.familyId===session.familyId&&x.subject===session.subject);
   if(old){if(old.hash!==hash)throw Error('IDEMPOTENCY_CONFLICT');throw Error('COACH_REQUEST_EXISTS');}
   if(list.filter(x=>x.familyId===session.familyId&&x.at>now-60000).length>=10)throw Error('RATE_LIMIT');
   if(list.length>=500)throw Error('COACH_HISTORY_FULL');
   const ledger=state.ledgers[session.familyId];if(!ledger?.paidEnabled||ledger.month!==month||ledger.used+ledger.reserved+this.config.maxTurnMicroUsd>ledger.allowance)throw Error('SPENDING_CUTOFF');
   ledger.reserved+=this.config.maxTurnMicroUsd;list.push({id:input.requestId,familyId:session.familyId,subject:session.subject,hash,month,reserved:this.config.maxTurnMicroUsd,at:now,state:'running'});
   return true;
  });
  void reservation;
  let usage=this.config.maxTurnMicroUsd,reply:CoachReply|undefined;
  try{
   const result=await this.provider.complete(context,AbortSignal.timeout(25000));
   if(!Number.isSafeInteger(result.usedMicroUsd)||result.usedMicroUsd<0||result.usedMicroUsd>this.config.maxTurnMicroUsd)throw Error('COACH_PROVIDER_FAILED');
   usage=result.usedMicroUsd;reply=validateCoachReply(result.reply,context);
   return {reply,mode:'model'};
  }finally{
   await this.repo.transaction(state=>{const r=state.coachReceipts!.find(x=>x.id===input.requestId&&x.familyId===session.familyId&&x.subject===session.subject)!;const ledger=state.ledgers[session.familyId];if(ledger&&ledger.month===r.month){ledger.reserved=Math.max(0,ledger.reserved-r.reserved);ledger.used+=usage;}r.state=reply?'ready':'failed';delete r.reply;state.audit.push({jobId:'coach-'+randomUUID(),familyId:session.familyId,status:reply?'ready':'failed',at:new Date().toISOString(),code:'COACH_TURN'});return true;});
  }
 }
}
