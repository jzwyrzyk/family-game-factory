import {devTestAllowed,hasAdultSession,devCapacityAvailable,reserveDevSpend} from '../dev-test-policy';
import type {DevAccessPolicy} from '../dev-access';
/** Optional text-to-speech. Authorization, accounting and transient audio stay
 * separate from microphone dictation and model conversation. Disabled by default. */
import {randomUUID} from 'node:crypto';
import type {Repository,PipelineState} from '../pipeline/types';
import type {VerifiedSession} from '../contracts/api';
import {allowedCoachFamily} from './consent';
import {verifiedParentScope} from '../privacy/parent-consent';
import {adultPilotAllowed,adultPilotConfigured,adultPilotFlags,type AdultPilotFlags} from '../adult-pilot';
import {assertActiveTrustedDevice} from '../trusted-devices';

export const NARRATION_MAX_CHARS=2000;
export const NARRATION_MAX_TEXT_BYTES=4000;
export const NARRATION_MAX_AUDIO_BYTES=2_000_000;
export const NARRATION_DEADLINE_MS=20_000;
export const NARRATION_LEASE_MS=60_000;
export const NATURAL_NARRATION_VOICE='en-US-Chirp3-HD-Aoede';
export interface NarrationConfig {
 approved:boolean;privacyApproved:boolean;providerApproved:boolean;parentConsentApproved:boolean;
 requireVerifiedParentPrivacy?:boolean;adultPilot?:AdultPilotFlags;devTestPolicy?:DevAccessPolicy;
 projectId:string;voice:string;maxMicroUsd:number;priceMicroUsdPerMillionChars:number;pricesReviewedAt:string;
}
export interface NarrationReceipt {
 id:string;familyId:string;subject:string;month:string;at:number;leaseUntil:number;
 reservationId:string;reserved:number;state:'running'|'ready'|'failed';
}
export interface NarrationProvider {
 read(text:string,signal:AbortSignal):Promise<Uint8Array>;
 readiness?(signal:AbortSignal):Promise<boolean>;
}
export function narrationConfig(env:NodeJS.ProcessEnv):NarrationConfig {
 return {approved:env.FACTORY_NARRATION_APPROVED==='true',
  privacyApproved:env.FACTORY_NARRATION_PRIVACY_APPROVED==='true',
  providerApproved:env.FACTORY_NARRATION_PROVIDER_VERIFIED==='true',
  parentConsentApproved:env.FACTORY_NARRATION_PARENT_CONSENT_APPROVED==='true',
  adultPilot:adultPilotFlags(env),projectId:env.FACTORY_NARRATION_PROJECT||'',
  voice:env.FACTORY_NARRATION_VOICE||NATURAL_NARRATION_VOICE,
  maxMicroUsd:Number(env.FACTORY_NARRATION_MAX_MICRO_USD||0),
  priceMicroUsdPerMillionChars:Number(env.FACTORY_NARRATION_PRICE_PER_MILLION_CHARS||0),
  pricesReviewedAt:env.FACTORY_NARRATION_PRICES_REVIEWED||''};
}
export function narrationApproved(c:NarrationConfig):boolean {
 const reviewed=Date.parse(c.pricesReviewedAt),now=Date.now();
 return c.approved&&c.privacyApproved&&c.providerApproved&&
  (c.adultPilot?.enabled===true?adultPilotConfigured(c.adultPilot):c.parentConsentApproved)&&
  /^[a-z][a-z0-9-]{4,62}$/.test(c.projectId)&&
  ['en-US-Chirp3-HD-Aoede','en-US-Chirp3-HD-Leda','en-US-Chirp3-HD-Sulafat'].includes(c.voice)&&
  Number.isSafeInteger(c.maxMicroUsd)&&c.maxMicroUsd>=1000&&c.maxMicroUsd<=100000&&
  Number.isSafeInteger(c.priceMicroUsdPerMillionChars)&&c.priceMicroUsdPerMillionChars>0&&
  c.priceMicroUsdPerMillionChars<=50_000_000&&
  Math.ceil(NARRATION_MAX_CHARS*c.priceMicroUsdPerMillionChars/1_000_000)<=c.maxMicroUsd&&
  Number.isFinite(reviewed)&&reviewed<=now&&reviewed>now-31*86400000;
}
export function validateNarrationText(input:unknown):string {
 if(typeof input!=='string'||!input.trim()||input.length>NARRATION_MAX_CHARS||
  Buffer.byteLength(input,'utf8')>NARRATION_MAX_TEXT_BYTES||
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(input))throw Error('INVALID_NARRATION');
 // Same bounded private-information screen as chat. Plain text only; never SSML.
 if(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\b(?:sk-|ghp_|github_pat_)\S+|\b\d{3}[- .]\d{3}[- .]\d{4}\b/i.test(input))
  throw Error('INVALID_NARRATION');
 return input.trim();
}
export function validateNarrationAudio(bytes:Uint8Array):Uint8Array {
 if(!(bytes instanceof Uint8Array)||bytes.length<100||bytes.length>NARRATION_MAX_AUDIO_BYTES||
  !(bytes[0]===0x49&&bytes[1]===0x44&&bytes[2]===0x33||bytes[0]===0xff&&(bytes[1]&0xe0)===0xe0))
  throw Error('NARRATION_UNAVAILABLE');
 return bytes;
}
/** Charge an unknown outcome once. Never replay speech after process loss. */
function settle(state:PipelineState,r:NarrationReceipt,outcome:'ready'|'failed',now=Date.now(),interrupted=false) {
 if(r.state!=='running')return;
 const ledger=state.ledgers[r.familyId];
 // Reservations carry across allowance-month changes; usage belongs to the
 // original month and must not consume the new month's used allowance.
 if(ledger){ledger.reserved=Math.max(0,ledger.reserved-r.reserved);if(ledger.month===r.month)ledger.used+=r.reserved;}
 r.state=outcome;
 state.audit.push({jobId:'narration-'+r.reservationId,familyId:r.familyId,status:outcome,at:new Date(now).toISOString(),
  code:interrupted?'NARRATION_INTERRUPTED':'NARRATION_READ',usage:{kind:'narration',month:r.month,reservedMicroUsd:r.reserved,usedMicroUsd:r.reserved,outcome:interrupted?'interrupted':'settled'}});
}
export function reconcileNarrationReceipts(state:PipelineState,now=Date.now()) {
 for(const r of state.narrationReceipts||[])if(r.state==='running'&&r.leaseUntil<=now)settle(state,r,'failed',now,true);
}
export class NarrationService {
 constructor(private repo:Repository,private config:NarrationConfig,private provider:NarrationProvider){}
 enabled(){return narrationApproved(this.config);}
 private permitted(state:PipelineState,session:VerifiedSession,now=Date.now()):boolean {
  if(!session||session.expiresAt<=now||!['parent','designer'].includes(session.role))return false;
  try{assertActiveTrustedDevice(state,session,now);}catch{return false;}
  if(this.config.devTestPolicy&&now>=this.config.devTestPolicy.allowanceExpiresAt)return false;
  if(session.devTestGrantId!==undefined)return devTestAllowed(state,session,this.config.devTestPolicy,now);
  if(this.config.devTestPolicy&&!hasAdultSession(session))return false;
  if(this.config.adultPilot?.enabled===true)return adultPilotAllowed(state,session,now);
  if(session.adultSessionId||session.adultProfileId)return false;
  return allowedCoachFamily(state,session,'narration',now)&&
   (!this.config.requireVerifiedParentPrivacy||verifiedParentScope(state,session.familyId,'conversation',now));
 }
 async familyAvailable(session:VerifiedSession):Promise<boolean> {
  if(!this.enabled())return false;
  const allowed=await this.repo.transaction(state=>{
   reconcileNarrationReceipts(state);
   const ledger=state.ledgers[session.familyId];
   return this.permitted(state,session)&&!!ledger?.paidEnabled&&ledger.month===new Date().toISOString().slice(0,7)&&
    ledger.used+ledger.reserved+this.config.maxMicroUsd<=ledger.allowance&&devCapacityAvailable(state,this.config.devTestPolicy,this.config.maxMicroUsd);
  });
  if(!allowed)return false;
  if(this.provider.readiness&&!await this.provider.readiness(AbortSignal.timeout(4000)).catch(()=>false))return false;
  return this.permitted(await this.repo.snapshot(),session);
 }
 async read(session:VerifiedSession,input:{id:string;text:string},cancel?:AbortSignal):Promise<Uint8Array> {
  if(!this.enabled())throw Error('NARRATION_UNAVAILABLE');
  if(!input||Object.keys(input).some(k=>!['id','text'].includes(k))||
   typeof input.id!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(input.id))throw Error('INVALID_NARRATION');
  const text=validateNarrationText(input.text);
  if(cancel?.aborted)throw Error('NARRATION_UNAVAILABLE');
  const subject=session?.adultSessionId?`${session.subject}:adult:${session.adultSessionId}`:
   session?.devTestGrantId?`${session.subject}:dev:${session.devTestGrantId}`:session?.subject;
  const reservationId=randomUUID();
  await this.repo.transaction(state=>{
   const now=Date.now();reconcileNarrationReceipts(state,now);
   if(!this.enabled()||!this.permitted(state,session,now)||cancel?.aborted)throw Error('NARRATION_UNAVAILABLE');
   state.narrationReceipts=(state.narrationReceipts||[]).filter(r=>r.state==='running'||r.at>=now-86400000);
   const receipts=state.narrationReceipts;
   if(receipts.some(r=>r.id===input.id&&r.familyId===session.familyId))throw Error('NARRATION_REQUEST_EXISTS');
   if(receipts.filter(r=>r.familyId===session.familyId&&r.at>now-60000).length>=12)throw Error('RATE_LIMIT');
   if(receipts.some(r=>r.familyId===session.familyId&&r.state==='running'))throw Error('NARRATION_REQUEST_EXISTS');
   if(receipts.length>=500)throw Error('NARRATION_UNAVAILABLE');
   const reserved=Math.max(1,Math.ceil(text.length*this.config.priceMicroUsdPerMillionChars/1_000_000));
   const month=new Date(now).toISOString().slice(0,7),ledger=state.ledgers[session.familyId];
   if(reserved>this.config.maxMicroUsd||!ledger?.paidEnabled||ledger.month!==month||
    ledger.used+ledger.reserved+reserved>ledger.allowance)throw Error('SPENDING_CUTOFF');
   reserveDevSpend(state,this.config.devTestPolicy,reserved);
   ledger.reserved+=reserved;
   receipts.push({id:input.id,familyId:session.familyId,subject,month,at:now,leaseUntil:now+NARRATION_LEASE_MS,
    reservationId,reserved,state:'running'});
   return true;
  });
  const signal=cancel?AbortSignal.any([cancel,AbortSignal.timeout(NARRATION_DEADLINE_MS)]):AbortSignal.timeout(NARRATION_DEADLINE_MS);
  let audio:Uint8Array|undefined;
  try {signal.throwIfAborted();audio=validateNarrationAudio(await this.provider.read(text,signal));signal.throwIfAborted();}
  catch {/* No provider error body, text, audio or credentials enter a receipt or log. */}
  const permitted=await this.repo.transaction(state=>{
   const now=Date.now();reconcileNarrationReceipts(state,now);
   const r=state.narrationReceipts?.find(r=>r.id===input.id&&r.familyId===session.familyId&&r.subject===subject&&r.reservationId===reservationId);
   if(!r||r.state!=='running')return false;
   const ready=!!audio&&!signal.aborted&&this.enabled()&&this.permitted(state,session,now);
   settle(state,r,ready?'ready':'failed');return ready;
  });
  if(!permitted||!audio)throw Error('NARRATION_UNAVAILABLE');
  return audio;
 }
}
