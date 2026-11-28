import type {DevCloudTarget} from '../dev-access';
/** Keyless gateway bridge; only the private service contacts the TTS provider. */
import {privateCoachOrigin,metadataIdentityToken,type IdentityTokenSource} from './private-bridge';
import {validateNarrationText,validateNarrationAudio,NARRATION_MAX_AUDIO_BYTES,type NarrationProvider} from './narration';
import {readNarrationResponse,readNarrationJson} from './narration-transport';
export class PrivateNarrationBridge implements NarrationProvider {
 readonly endpoint:string;
 constructor(origin:string,private identity:IdentityTokenSource=metadataIdentityToken(),private transport:typeof fetch=fetch,development?:DevCloudTarget){this.endpoint=privateCoachOrigin(origin,process.env,development);}
 async readiness(signal:AbortSignal):Promise<boolean> {
  try {
   const token=await this.identity(this.endpoint,signal);
   const response=await this.transport(this.endpoint+'/v1/private-coach/narration/status',{
    headers:{Authorization:'Bearer '+token,'X-Factory-Request':'1'},signal,redirect:'error',cache:'no-store'});
   if(!response.ok){void response.body?.cancel().catch(()=>{});return false;}
   const data=await readNarrationJson(response,1000,signal);
   return data?.available===true&&data.mode==='natural';
  }catch{return false;}
 }
 async read(input:string,signal:AbortSignal):Promise<Uint8Array> {
  const text=validateNarrationText(input),token=await this.identity(this.endpoint,signal);
  const response=await this.transport(this.endpoint+'/v1/private-coach/narration',{
   method:'POST',headers:{Authorization:'Bearer '+token,'X-Factory-Request':'1','Content-Type':'application/json'},
   body:JSON.stringify({version:1,text}),signal,redirect:'error',cache:'no-store'});
  if(!response.ok||response.headers.get('content-type')?.split(';',1)[0]!=='audio/mpeg'){
   void response.body?.cancel().catch(()=>{});throw Error('NARRATION_UNAVAILABLE');
  }
  return validateNarrationAudio(await readNarrationResponse(response,NARRATION_MAX_AUDIO_BYTES,signal));
 }
}
