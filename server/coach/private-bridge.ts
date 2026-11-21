/** Keyless gateway -> owner-approved private inference executor.
 * No model secret, prompt, transcript or child identifier is persisted here.
 * The gateway obtains a short-lived Google-signed ID token for an exact,
 * independently reviewed target audience. The private executor MUST verify
 * that identity and be non-public at the infrastructure access boundary.
 */
import type {CoachContext} from '../../src/studio/design';
import {validateAudio,type AudioMime,type SpeechProvider,AUDIO_MAX_BYTES} from './speech';
import type {CoachProvider} from './service';
import {devServiceOrigin,type DevCloudTarget} from '../dev-access';

const METADATA_BASE='http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity';
export function privateCoachOrigin(raw:string,development?:DevCloudTarget):string {
 let u:URL;try{u=new URL(raw);}catch{throw Error('PRIVATE_COACH_ORIGIN_REQUIRED');}
 // An operator typo must not turn the audience-bound bearer token and a child's
 // design context into an HTTP request to an unrelated host. Only the exact
 // dedicated service's canonical Cloud Run URL family is authorized.
 if(u.protocol!=='https:'||u.href!==u.origin+'/'||u.username||u.password||u.search||u.hash||u.port||
  (development?u.origin!==devServiceOrigin(development,'coach'):!u.hostname.startsWith('factory-coach-private-'))||!u.hostname.endsWith('.run.app')||
  !/^[a-z0-9.-]+$/.test(u.hostname))throw Error('PRIVATE_COACH_ORIGIN_REQUIRED');
 return u.origin;
}
export type IdentityTokenSource=(audience:string,signal:AbortSignal)=>Promise<string>;
export function metadataIdentityToken(transport:typeof fetch=fetch):IdentityTokenSource{
 return async(audience,signal)=>{
  // Full-format identity token includes the verified service-account email claim
  // required by privateCoachHandler; standard format can omit that claim.
  const uri=METADATA_BASE+'?audience='+encodeURIComponent(audience)+'&format=full';
  const response=await transport(uri,{method:'GET',headers:{'Metadata-Flavor':'Google'},signal,redirect:'error'});
  if(!response.ok)throw Error('COACH_UNAVAILABLE');
  const token=(await response.text()).trim();
  if(token.length<100||token.length>12000||!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))throw Error('COACH_UNAVAILABLE');
  return token;
 };
}
export class PrivateCoachBridge implements CoachProvider{
 readonly endpoint:string;
 constructor(origin:string,private identity:IdentityTokenSource=metadataIdentityToken(),private transport:typeof fetch=fetch,development?:DevCloudTarget){
  this.endpoint=privateCoachOrigin(origin,development);
 }
 /** This is only a reachability/configuration check, not a live model test.
  * No child prompt, family ID, transcript, audio or API key is included.
  */
 async readiness(signal:AbortSignal):Promise<boolean>{
  try{
   const token=await this.identity(this.endpoint,signal);
   const response=await this.transport(this.endpoint+'/v1/private-coach/status',{
    method:'GET',headers:{Authorization:'Bearer '+token,'X-Factory-Request':'1'},
    redirect:'error',cache:'no-store',signal
   });
   if(!response.ok||Number(response.headers.get('content-length')||0)>1000)return false;
   const raw=await response.text();if(raw.length>1000)return false;
   const data=JSON.parse(raw);
   return !!data&&data.available===true&&data.mode==='model';
  }catch{return false;}
 }
 async complete(context:CoachContext,signal:AbortSignal):Promise<{reply:unknown;usedMicroUsd:number}>{
  const serialized=JSON.stringify(context);
  if(serialized.length>24000)throw Error('INVALID_REQUEST');
  const token=await this.identity(this.endpoint,signal);
  const response=await this.transport(this.endpoint+'/v1/private-coach/complete',{
   method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','X-Factory-Request':'1'},
   body:JSON.stringify({version:1,context}),redirect:'error',cache:'no-store',signal
  });
  if(response.status===403||response.status===401)throw Error('COACH_UNAVAILABLE');
  if(response.status===429)throw Error('RATE_LIMIT');
  if(response.status===422)throw Error('COACH_REFUSED');
  if(!response.ok)throw Error('COACH_UNAVAILABLE');
  // A compromised/misconfigured executor must not return unbounded content.
  if(Number(response.headers.get('content-length')||0)>16000)throw Error('COACH_PROVIDER_FAILED');
  const raw=await response.text();if(raw.length>16000)throw Error('COACH_PROVIDER_FAILED');
  let result:any;try{result=JSON.parse(raw);}catch{throw Error('COACH_PROVIDER_FAILED');}
  if(!result||Object.keys(result).some(k=>!['reply','usedMicroUsd'].includes(k))||
    !Object.hasOwn(result,'reply')||!Number.isSafeInteger(result.usedMicroUsd)||result.usedMicroUsd<0)
    throw Error('COACH_PROVIDER_FAILED');
  return {reply:result.reply,usedMicroUsd:result.usedMicroUsd};
 }
}

/** A separate, narrowly scoped use of the SAME identity-authenticated private
 * service: audio goes only to Google STT inside that service, never to OpenAI.
 */
export class PrivateSpeechBridge implements SpeechProvider{
 readonly endpoint:string;
 constructor(origin:string,private identity:IdentityTokenSource=metadataIdentityToken(),private transport:typeof fetch=fetch,development?:DevCloudTarget){
  this.endpoint=privateCoachOrigin(origin,development);
 }
 async readiness(signal:AbortSignal):Promise<boolean>{
  try{
   const token=await this.identity(this.endpoint,signal);
   const response=await this.transport(this.endpoint+'/v1/private-coach/audio/status',{
    method:'GET',headers:{Authorization:'Bearer '+token,'X-Factory-Request':'1'},
    redirect:'error',cache:'no-store',signal
   });
   if(!response.ok||Number(response.headers.get('content-length')||0)>1000)return false;
   const raw=await response.text();if(raw.length>1000)return false;
   const data=JSON.parse(raw);
   return !!data&&data.available===true&&data.mode==='private';
  }catch{return false;}
 }
 async transcribe(audio:Uint8Array,mime:AudioMime,signal:AbortSignal):Promise<string>{
  validateAudio(audio,mime);
  if(audio.length>AUDIO_MAX_BYTES)throw Error('INVALID_AUDIO');
  const token=await this.identity(this.endpoint,signal);
  const response=await this.transport(this.endpoint+'/v1/private-coach/audio',{
   method:'POST',headers:{Authorization:'Bearer '+token,'X-Factory-Request':'1','Content-Type':'application/json'},
   redirect:'error',cache:'no-store',signal,
   body:JSON.stringify({version:1,mime,audio:Buffer.from(audio).toString('base64')})
  });
  if(response.status===429)throw Error('RATE_LIMIT');
  if(response.status===422)throw Error('AUDIO_NO_SPEECH');
  if(!response.ok)throw Error('AUDIO_UNAVAILABLE');
  if(Number(response.headers.get('content-length')||0)>8000)throw Error('AUDIO_UNAVAILABLE');
  const raw=await response.text();if(raw.length>8000)throw Error('AUDIO_UNAVAILABLE');
  let data:any;try{data=JSON.parse(raw);}catch{throw Error('AUDIO_UNAVAILABLE');}
  if(!data||Object.keys(data).some(x=>x!=='text')||typeof data.text!=='string'||
   !data.text.trim()||data.text.length>2000)throw Error('AUDIO_UNAVAILABLE');
  return data.text;
 }
}
