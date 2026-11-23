/** IAM access token for narrowly permitted Google Cloud Speech V2 calls.
 * Lives only in the dedicated private coach runtime; never in browser/gateway.
 */
import {readMetadataText} from './metadata-body';
export async function privateGoogleAccessToken(signal:AbortSignal,transport:typeof fetch=fetch):Promise<string>{
 signal.throwIfAborted();
 const response=await transport('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',{
  method:'GET',redirect:'error',signal,headers:{'Metadata-Flavor':'Google'}
 });
 const body=await readMetadataText(response,4000,signal,'AUDIO_PROVIDER_FAILED');
 let data:any;try{data=JSON.parse(body);}catch{throw Error('AUDIO_PROVIDER_FAILED');}
 if(!data||typeof data.access_token!=='string'||data.access_token.length<40||data.access_token.length>3500||
  !Number.isFinite(data.expires_in)||data.expires_in<10)throw Error('AUDIO_PROVIDER_FAILED');
 return data.access_token;
}
