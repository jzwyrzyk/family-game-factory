/** Private-only Google Speech V2 IAM adapter; never bundled into the gateway. */
import {validateAudio,type AudioMime,type SpeechProvider} from './speech';
import {privateGoogleAccessToken} from './cloud-token';
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
