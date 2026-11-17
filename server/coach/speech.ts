/**
 * Optional, disabled-by-default private STT for devices that cannot do
 * verified local speech. Audio is an in-memory request body, never persisted.
 * The owner must separately verify Cloud Speech-to-Text logging is OFF,
 * adult consent, data processing terms, correct US endpoint and spending.
 */
import {createHash} from 'node:crypto';
import type {Repository} from '../pipeline/types';
import type {VerifiedSession} from '../contracts/api';
import {vertexAccessToken} from './vertex';
import {allowedCoachFamily} from './consent';

export type AudioMime='audio/webm'|'audio/mp4'|'audio/ogg';
const MAX_BYTES=320000,MIN_BYTES=100;
export function audioMime(input:string):AudioMime|null{
 const bare=input.toLowerCase().split(';',1)[0].trim();
 return bare==='audio/webm'||bare==='audio/mp4'||bare==='audio/ogg'?bare:null;
}
export function validateAudio(bytes:Uint8Array,mime:string):AudioMime{
 const kind=audioMime(mime);
 if(!kind||bytes.length<MIN_BYTES||bytes.length>MAX_BYTES)throw Error('INVALID_AUDIO');
 const signature=kind==='audio/webm'&&bytes[0]===0x1a&&bytes[1]===0x45&&bytes[2]===0xdf&&bytes[3]===0xa3||
  kind==='audio/ogg'&&String.fromCharCode(...bytes.slice(0,4))==='OggS'||
  kind==='audio/mp4'&&String.fromCharCode(...bytes.slice(4,8))==='ftyp';
 if(!signature)throw Error('INVALID_AUDIO');
 return kind;
}
export interface PrivateAudioProvider {
 transcribe(audio:Uint8Array,mime:AudioMime,signal:AbortSignal):Promise<string>;
}
export interface SpeechConfig {
 approved:boolean;privacyApproved:boolean;parentApproved:boolean;
 projectId:string;maxMicroUsd:number;brokerApproved:boolean;brokerOrigin:string;
}
export function audioApproved(c:SpeechConfig):boolean {
 return c.approved===true&&c.privacyApproved===true&&c.parentApproved===true&&c.brokerApproved===true&&
  c.brokerOrigin.startsWith('https://')&&/^[a-z][a-z0-9-]{4,62}$/.test(c.projectId)&&
  Number.isSafeInteger(c.maxMicroUsd)&&c.maxMicroUsd>=1000&&c.maxMicroUsd<=100000;
}
export class GooglePrivateSpeech implements PrivateAudioProvider{
 constructor(private projectId:string,private transport:typeof fetch=fetch,
  private getToken:(signal:AbortSignal)=>Promise<string>=vertexAccessToken){}
 async transcribe(bytes:Uint8Array,mime:AudioMime,signal:AbortSignal):Promise<string>{
  validateAudio(bytes,mime);
  if(!/^[a-z][a-z0-9-]{4,62}$/.test(this.projectId))throw Error('AUDIO_UNAVAILABLE');
  const token=await this.getToken(signal);
  if(token.length<20||token.length>4000)throw Error('AUDIO_UNAVAILABLE');
  // US multi-region synchronous recognition; no URI/GCS persistence or async jobs.
  const url='https://us-speech.googleapis.com/v2/projects/'+this.projectId+'/locations/us/recognizers/_:recognize';
  const response=await this.transport(url,{
   method:'POST',redirect:'error',cache:'no-store',signal,
   headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json'},
   body:JSON.stringify({config:{autoDecodingConfig:{},languageCodes:['en-US'],model:'short'},
    content:Buffer.from(bytes).toString('base64')})
  });
  if(!response.ok)throw Error(response.status===429?'RATE_LIMIT':'AUDIO_PROVIDER_FAILED');
  const body=await response.text();if(body.length>20000)throw Error('AUDIO_PROVIDER_FAILED');
  const data=JSON.parse(body);
  const lines=(data.results||[]).map((r:any)=>r.alternatives?.[0]?.transcript);
  if(!Array.isArray(data.results)||!lines.length||lines.some((x:unknown)=>typeof x!=='string'))throw Error('AUDIO_NO_SPEECH');
  const text=lines.join(' ').trim();
  if(text.length<1||text.length>2000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text))throw Error('AUDIO_NO_SPEECH');
  return text;
 }
}
/** Conservative admission charging. STT pricing is reviewed separately;
 * this ledger is a hard maximum, not a claim of exact Google invoice cost. */
export class CoachAudioService {
 constructor(private repo:Repository,private config:SpeechConfig,private provider:PrivateAudioProvider){}
 enabled(){return audioApproved(this.config);}
 async familyAvailable(session:VerifiedSession):Promise<boolean>{
  if(!this.enabled())return false;
  return allowedCoachFamily(await this.repo.snapshot(),session,'audio');
 }
 async transcribe(session:VerifiedSession,input:{id:string;mime:string;audio:Uint8Array}):Promise<{text:string}>{
  if(!this.enabled())throw Error('AUDIO_UNAVAILABLE');
  if(!session||session.expiresAt<=Date.now()||!['parent','designer'].includes(session.role))throw Error('UNAUTHENTICATED');
  if(!input||typeof input.id!=='string'||!/^[a-zA-Z0-9_-]{8,100}$/.test(input.id))throw Error('INVALID_AUDIO');
  const mime=validateAudio(input.audio,input.mime),now=Date.now(),month=new Date(now).toISOString().slice(0,7);
  const id='audio-'+input.id;
  // Never hash/store the voice bytes or the resulting transcript.
  const hash=createHash('sha256').update(id).digest('hex');
  await this.repo.transaction(state=>{
   if(!allowedCoachFamily(state,session,'audio',now))throw Error('AUDIO_UNAVAILABLE');
   state.coachReceipts ||= [];
   for(let i=state.coachReceipts.length-1;i>=0;i--)if(state.coachReceipts[i].at<now-7*86400000)state.coachReceipts.splice(i,1);
   const list=state.coachReceipts;
   const old=list.find(r=>r.id===id&&r.familyId===session.familyId&&r.subject===session.subject);
   if(old)throw Error('AUDIO_REQUEST_EXISTS');
   if(list.some(r=>r.id===id))throw Error('AUDIO_REQUEST_EXISTS');
   if(list.filter(r=>r.familyId===session.familyId&&r.id.startsWith('audio-')&&r.at>now-60000).length>=4)throw Error('RATE_LIMIT');
   if(list.length>=500)throw Error('AUDIO_UNAVAILABLE');
   const ledger=state.ledgers[session.familyId];
   if(!ledger?.paidEnabled||ledger.month!==month||
      ledger.used+ledger.reserved+this.config.maxMicroUsd>ledger.allowance)throw Error('SPENDING_CUTOFF');
   ledger.reserved+=this.config.maxMicroUsd;
   list.push({id,familyId:session.familyId,subject:session.subject,hash,month,reserved:this.config.maxMicroUsd,at:now,state:'running'});
   return true;
  });
  let success=false;
  try{
   const text=await this.provider.transcribe(input.audio,mime,AbortSignal.timeout(15000));
   if(typeof text!=='string'||text.length<1||text.length>2000)throw Error('AUDIO_NO_SPEECH');
   success=true;return {text};
  }finally{
   await this.repo.transaction(state=>{
    const receipt=state.coachReceipts?.find(x=>x.id===id&&x.familyId===session.familyId&&x.subject===session.subject);
    if(!receipt)throw Error('AUDIO_UNAVAILABLE');
    const ledger=state.ledgers[session.familyId];
    if(ledger&&ledger.month===month){
     ledger.reserved=Math.max(0,ledger.reserved-receipt.reserved);
     ledger.used+=receipt.reserved; // conservative maximum reservation, even for unknown failures
    }
    receipt.state=success?'ready':'failed';delete receipt.reply;
    return true;
   });
  }
 }
}
