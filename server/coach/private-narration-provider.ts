/** Private service only: natural female speech through Google Cloud IAM.
 * No API key, microphone, conversation history, storage or generated-game access. */
import {privateGoogleAccessToken} from './cloud-token';
import {narrationApproved,validateNarrationText,validateNarrationAudio,NARRATION_MAX_AUDIO_BYTES,
 type NarrationConfig,type NarrationProvider} from './narration';
import {readNarrationJson} from './narration-transport';
export class GooglePrivateNarration implements NarrationProvider {
 constructor(private config:NarrationConfig,private transport:typeof fetch=fetch,
  private token:(signal:AbortSignal)=>Promise<string>=privateGoogleAccessToken){}
 async read(input:string,signal:AbortSignal):Promise<Uint8Array> {
  if(!narrationApproved(this.config))throw Error('NARRATION_UNAVAILABLE');
  const text=validateNarrationText(input),bearer=await this.token(signal);
  if(bearer.length<40||bearer.length>3500)throw Error('NARRATION_UNAVAILABLE');
  const response=await this.transport('https://texttospeech.googleapis.com/v1/text:synthesize',{
   method:'POST',signal,redirect:'error',cache:'no-store',
   headers:{Authorization:'Bearer '+bearer,'Content-Type':'application/json','x-goog-user-project':this.config.projectId},
   body:JSON.stringify({input:{text},voice:{languageCode:'en-US',name:this.config.voice},audioConfig:{audioEncoding:'MP3'}})
  });
  if(!response.ok){void response.body?.cancel().catch(()=>{});throw Error('NARRATION_UNAVAILABLE');}
  const data=await readNarrationJson(response,Math.ceil(NARRATION_MAX_AUDIO_BYTES*4/3)+1000,signal);
  if(!data||typeof data.audioContent!=='string'||!/^[A-Za-z0-9+/]+={0,2}$/.test(data.audioContent))throw Error('NARRATION_UNAVAILABLE');
  const bytes=Buffer.from(data.audioContent,'base64');
  if(bytes.toString('base64')!==data.audioContent)throw Error('NARRATION_UNAVAILABLE');
  return validateNarrationAudio(bytes);
 }
}
