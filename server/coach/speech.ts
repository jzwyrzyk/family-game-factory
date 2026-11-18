/** Short, explicit, parent-approved voice dictation.
 * Gateway performs authentication, consent and atomic spending admission.
 * Audio is never stored in Firestore, logged, replayed, or placed in previews.
 */
import type {Repository} from '../pipeline/types';
import type {VerifiedSession} from '../contracts/api';
import {allowedCoachFamily} from './consent';
import {privateGoogleAccessToken} from './cloud-token';

export type AudioMime='audio/webm'|'audio/mp4'|'audio/ogg';
export const AUDIO_MAX_BYTES=320000;
export interface AudioReceipt {
 id:string; familyId:string; subject:string; month:string;
 at:number; reserved:number; state:'running'|'ready'|'failed';
}
export interface SpeechConfig {
 approved:boolean;privacyApproved:boolean;providerApproved:boolean;parentConsentApproved:boolean;
 projectId:string;maxMicroUsd:number;pricesReviewedAt:string;
}
export function audioMime(raw:string):AudioMime|null {
 const type=raw.toLowerCase().split(';',1)[0].trim();
 return type==='audio/webm'||type==='audio/mp4'||type==='audio/ogg'?type:null;
}
export function validateAudio(bytes:Uint8Array,contentType:string):AudioMime {
 const type=audioMime(contentType);
 if(!type||bytes.length<100||bytes.length>AUDIO_MAX_BYTES)throw Error('INVALID_AUDIO');
 const prefix=String.fromCharCode(...bytes.subarray(0,4));
 const good=type==='audio/webm'&&prefix===String.fromCharCode(0x1a,0x45,0xdf,0xa3)||
  type==='audio/ogg'&&prefix==='OggS'||
  type==='audio/mp4'&&String.fromCharCode(...bytes.subarray(4,8))==='ftyp';
 if(!good)throw Error('INVALID_AUDIO');
 return type;
}
export function speechConfig(env:NodeJS.ProcessEnv):SpeechConfig{
 return {
  approved:env.FACTORY_COACH_AUDIO_APPROVED==='true',
  privacyApproved:env.FACTORY_COACH_AUDIO_PRIVACY_APPROVED==='true',
  providerApproved:env.FACTORY_COACH_AUDIO_PROVIDER_VERIFIED==='true',
  parentConsentApproved:env.FACTORY_COACH_AUDIO_PARENT_CONSENT_APPROVED==='true',
  projectId:env.FACTORY_COACH_AUDIO_PROJECT||'',
  maxMicroUsd:Number(env.FACTORY_COACH_AUDIO_MAX_MICRO_USD||0),
  pricesReviewedAt:env.FACTORY_COACH_AUDIO_PRICES_REVIEWED||''
 };
}
export function speechApproved(config:SpeechConfig):boolean {
 const at=Date.parse(config.pricesReviewedAt),now=Date.now();
 return config.approved&&config.privacyApproved&&config.providerApproved&&config.parentConsentApproved&&
  /^[a-z][a-z0-9-]{4,62}$/.test(config.projectId)&&
  Number.isSafeInteger(config.maxMicroUsd)&&config.maxMicroUsd>=1000&&config.maxMicroUsd<=100000&&
  Number.isFinite(at)&&at<=now&&at>now-31*86400000;
}
export interface SpeechProvider {
 transcribe(audio:Uint8Array,mime:AudioMime,signal:AbortSignal):Promise<string>;
 readiness?(signal:AbortSignal):Promise<boolean>;
}
/** Only the private Cloud Run service has Google Speech V2 permissions.
 * The gateway must use PrivateSpeechBridge, never this adapter.
 */
export class GooglePrivateSpeech implements SpeechProvider {
 constructor(private projectId:string,private transport:typeof fetch=fetch,
  private token:(signal:AbortSignal)=>Promise<string>=privateGoogleAccessToken){}
 async transcribe(audio:Uint8Array,mime:AudioMime,signal:AbortSignal):Promise<string> {
  validateAudio(audio,mime);
  if(!/^[a-z][a-z0-9-]{4,62}$/.test(this.projectId))throw Error('AUDIO_PROVIDER_FAILED');
  const bearer=await this.token(signal);
  if(bearer.length<40||bearer.length>3500)throw Error('AUDIO_PROVIDER_FAILED');
  const response=await this.transport('https://us-speech.googleapis.com/v2/projects/'+this.projectId+
   '/locations/us/recognizers/_:recognize',{
   method:'POST',redirect:'error',cache:'no-store',signal,
   headers:{Authorization:'Bearer '+bearer,'Content-Type':'application/json'},
   body:JSON.stringify({config:{autoDecodingConfig:{},languageCodes:['en-US'],model:'short'},
    content:Buffer.from(audio).toString('base64')})
  });
  if(!response.ok)throw Error(response.status===429?'RATE_LIMIT':'AUDIO_PROVIDER_FAILED');
  const raw=await response.text();
  if(raw.length>20000)throw Error('AUDIO_PROVIDER_FAILED');
  let data:any;try{data=JSON.parse(raw);}catch{throw Error('AUDIO_PROVIDER_FAILED');}
  if(!Array.isArray(data?.results))throw Error('AUDIO_PROVIDER_FAILED');
  const words=data.results.map((r:any)=>r?.alternatives?.[0]?.transcript);
  if(!words.length||words.some((x:unknown)=>typeof x!=='string'))throw Error('AUDIO_NO_SPEECH');
  const text=words.join(' ').trim();
  if(text.length<1||text.length>2000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text))
   throw Error('AUDIO_NO_SPEECH');
  return text;
 }
}
/** Conservative per-family accounting: a provider failure may still incur a charge,
 * so every submitted request consumes at most the pre-approved maximum.
 */
export class CoachAudioService {
 constructor(private repo:Repository,private config:SpeechConfig,private provider:SpeechProvider){}
 enabled(){return speechApproved(this.config);}
 async familyAvailable(session:VerifiedSession):Promise<boolean>{
  if(!this.enabled()||!session||session.expiresAt<=Date.now()||!['parent','designer'].includes(session.role))return false;
  const state=await this.repo.snapshot(),month=new Date().toISOString().slice(0,7);
  const ledger=state.ledgers[session.familyId];
  if(!allowedCoachFamily(state,session,'audio')||!ledger?.paidEnabled||ledger.month!==month||
    ledger.used+ledger.reserved+this.config.maxMicroUsd>ledger.allowance)return false;
  if(this.provider.readiness){
   try{return await this.provider.readiness(AbortSignal.timeout(3000));}catch{return false;}
  }
  return true;
 }
 async transcribe(session:VerifiedSession,input:{id:string;mime:string;audio:Uint8Array},cancel?:AbortSignal):Promise<{text:string}>{
  if(!this.enabled())throw Error('AUDIO_UNAVAILABLE');
  if(!session||session.expiresAt<=Date.now()||!['parent','designer'].includes(session.role))throw Error('UNAUTHENTICATED');
  if(!input||typeof input.id!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(input.id))throw Error('INVALID_AUDIO');
  const mime=validateAudio(input.audio,input.mime),now=Date.now(),month=new Date(now).toISOString().slice(0,7);
  const id='audio-'+input.id;
  await this.repo.transaction(state=>{
   if(!allowedCoachFamily(state,session,'audio',now))throw Error('AUDIO_UNAVAILABLE');
   state.audioReceipts=(state.audioReceipts||[]).filter(x=>x.state==='running'||x.at>=now-86400000);
   const receipts=state.audioReceipts;
   if(receipts.some(x=>x.id===id))throw Error('AUDIO_REQUEST_EXISTS');
   if(receipts.filter(x=>x.familyId===session.familyId&&x.at>now-60000).length>=4)throw Error('RATE_LIMIT');
   if(receipts.length>=400)throw Error('AUDIO_UNAVAILABLE');
   const ledger=state.ledgers[session.familyId];
   if(!ledger?.paidEnabled||ledger.month!==month||
    ledger.used+ledger.reserved+this.config.maxMicroUsd>ledger.allowance)throw Error('SPENDING_CUTOFF');
   ledger.reserved+=this.config.maxMicroUsd;
   receipts.push({id,familyId:session.familyId,subject:session.subject,month,at:now,
    reserved:this.config.maxMicroUsd,state:'running'});
   return true;
  });
  let successful=false;
  try{
   const signal=cancel?AbortSignal.any([cancel,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000);
   const text=await this.provider.transcribe(input.audio,mime,signal);
   if(typeof text!=='string'||!text.trim()||text.length>2000)throw Error('AUDIO_NO_SPEECH');
   // Consent may have been revoked while a provider request was running.
   if(!allowedCoachFamily(await this.repo.snapshot(),session,'audio'))throw Error('AUDIO_UNAVAILABLE');
   successful=true;return {text};
  }finally{
   await this.repo.transaction(state=>{
    const receipt=state.audioReceipts?.find(x=>x.id===id&&x.familyId===session.familyId&&x.subject===session.subject);
    if(!receipt)throw Error('AUDIO_UNAVAILABLE');
    const ledger=state.ledgers[session.familyId];
    if(ledger&&ledger.month===receipt.month){
     ledger.reserved=Math.max(0,ledger.reserved-receipt.reserved);
     ledger.used+=receipt.reserved;
    }
    receipt.state=successful?'ready':'failed';return true;
   });
  }
 }
}
