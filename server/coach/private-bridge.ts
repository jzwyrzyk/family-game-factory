/** Keyless gateway -> owner-approved private inference executor.
 * No model secret, prompt, transcript or child identifier is persisted here.
 * The gateway obtains a short-lived Google-signed ID token for an exact,
 * independently reviewed target audience. The private executor MUST verify
 * that identity and be non-public at the infrastructure access boundary.
 */
import type {CoachContext} from '../../src/studio/design';
import type {CoachProvider} from './service';

const METADATA_BASE='http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity';
export function privateCoachOrigin(raw:string):string {
 let u:URL;try{u=new URL(raw);}catch{throw Error('PRIVATE_COACH_ORIGIN_REQUIRED');}
 if(u.protocol!=='https:'||u.href!==u.origin+'/'||u.username||u.password||u.search||u.hash||u.port||u.hostname==='localhost'||u.hostname.endsWith('.invalid')||!u.hostname.includes('.'))throw Error('PRIVATE_COACH_ORIGIN_REQUIRED');
 return u.origin;
}
export type IdentityTokenSource=(audience:string,signal:AbortSignal)=>Promise<string>;
export function metadataIdentityToken(transport:typeof fetch=fetch):IdentityTokenSource{
 return async(audience,signal)=>{
  const uri=METADATA_BASE+'?audience='+encodeURIComponent(audience);
  const response=await transport(uri,{method:'GET',headers:{'Metadata-Flavor':'Google'},signal,redirect:'error'});
  if(!response.ok)throw Error('COACH_UNAVAILABLE');
  const token=(await response.text()).trim();
  if(token.length<100||token.length>12000||!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))throw Error('COACH_UNAVAILABLE');
  return token;
 };
}
export class PrivateCoachBridge implements CoachProvider{
 readonly endpoint:string;
 constructor(origin:string,private identity:IdentityTokenSource=metadataIdentityToken(),private transport:typeof fetch=fetch){
  this.endpoint=privateCoachOrigin(origin);
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
