/**
 * Gateway-side, keyless provider. All model credentials remain outside
 * Cloud Run's gateway, browser, previews and sandbox processes.
 *
 * The private coach is an independently authenticated IAM-protected service.
 * A gateway workload identity token is audience-bound to its exact origin.
 * There is no tunnel, browser-token forwarding, or caller-selected URL.
 */
import type {CoachContext} from '../../src/studio/design';
import type {CoachProvider} from './service';

export interface CoachBrokerSettings {
 origin:string;
}
export function validPrivateCoachOrigin(origin:string):boolean {
 try{
  const url=new URL(origin);
  return url.protocol==='https:' && url.origin===origin && url.username==='' && url.password==='' &&
   url.pathname==='/' && url.search==='' && url.hash==='' && url.port==='' &&
   /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.run\.app$/i.test(url.hostname);
 }catch{return false;}
}
export async function googleGatewayIdentity(audience:string,signal:AbortSignal,transport:typeof fetch=fetch):Promise<string>{
 if(!validPrivateCoachOrigin(audience))throw Error('COACH_UNAVAILABLE');
 const target='http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience='+encodeURIComponent(audience)+'&format=full';
 const response=await transport(target,{method:'GET',redirect:'error',signal,headers:{'Metadata-Flavor':'Google'}});
 if(!response.ok)throw Error('COACH_UNAVAILABLE');
 const raw=await response.text();
 if(raw.length>6000||!/^[-\w]+\.[-\w]+\.[-\w]+$/.test(raw.trim()))throw Error('COACH_UNAVAILABLE');
 return raw.trim();
}
export class PrivateCoachBroker implements CoachProvider {
 constructor(private settings:CoachBrokerSettings,private transport:typeof fetch=fetch,
  private identity:(audience:string,signal:AbortSignal)=>Promise<string>=googleGatewayIdentity){}
 async complete(context:CoachContext,signal:AbortSignal){
  const {origin}=this.settings;
  if(!validPrivateCoachOrigin(origin))throw Error('COACH_UNAVAILABLE');
  const token=await this.identity(origin,signal);
  if(!token||token.length>6000)throw Error('COACH_UNAVAILABLE');
  const response=await this.transport(origin+'/internal/coach/turn',{
   method:'POST',redirect:'error',signal,cache:'no-store',
   headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json','Accept':'application/json'},
   body:JSON.stringify({context})
  });
  if(!response.ok)throw Error(response.status===429?'RATE_LIMIT':response.status===403?'COACH_UNAVAILABLE':response.status===422?'COACH_REFUSED':'COACH_PROVIDER_FAILED');
  const raw=await response.text();
  if(raw.length>15000)throw Error('COACH_PROVIDER_FAILED');
  const result=JSON.parse(raw);
  if(!result||Object.keys(result).some(k=>!['reply','usedMicroUsd'].includes(k))||
     !Number.isSafeInteger(result.usedMicroUsd)||result.usedMicroUsd<0)throw Error('COACH_PROVIDER_FAILED');
  return {reply:result.reply,usedMicroUsd:result.usedMicroUsd};
 }
}
