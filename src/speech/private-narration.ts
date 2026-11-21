/** The configured gateway is the only browser destination for natural speech.
 * No text leaves this tab until an explicit Read tap and an authorized status.
 * Audio lives only in the current narrator's memory; no cache or microphone. */
import {familyFetch} from '../builder/session';
import {adultSessionVersion} from '../adult-pilot/session';
import type {BuilderConfig} from '../builder/client';
import type {NaturalNarrationProvider} from './friendly-narrator';
const MAX_AUDIO_BYTES=2_000_000;
export function createPrivateNarration(config:()=>BuilderConfig,owner:()=>string):NaturalNarrationProvider {
 let approvedScope='',approvedUntil=0;
 const scope=()=>`${owner()}:${adultSessionVersion()}:${config().apiBaseUrl||''}`;
 return {
  async available(cancel){
   approvedScope='';approvedUntil=0;
   const current=config(),at=scope();
   if(current.mode!=='remote'||!current.apiBaseUrl||!owner())return false;
   const signal=AbortSignal.any([cancel,AbortSignal.timeout(5000)]);
   try {
    const response=await familyFetch(current.apiBaseUrl,'/v1/coach/narration/status',{signal,cache:'no-store'});
    if(!response.ok||scope()!==at||signal.aborted)return false;
    const text=await readBytes(response,1000,signal);
    const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(text));
    if(data?.available!==true||data.mode!=='natural'||scope()!==at||signal.aborted)return false;
    approvedScope=at;approvedUntil=Date.now()+10_000;return true;
   }catch{return false;}
  },
  async read(text,cancel){
   const current=config(),at=scope();
   if(current.mode!=='remote'||!current.apiBaseUrl||!owner()||approvedScope!==at||Date.now()>approvedUntil||
    !text.trim()||text.length>2000||new TextEncoder().encode(text).length>4000)throw Error('NARRATION_UNAVAILABLE');
   approvedScope='';approvedUntil=0;
   const signal=AbortSignal.any([cancel,AbortSignal.timeout(25_000)]);signal.throwIfAborted();
   const response=await familyFetch(current.apiBaseUrl,'/v1/coach/narration',{
    method:'POST',signal,cache:'no-store',headers:{'Content-Type':'application/json','X-Factory-Request':'1'},
    body:JSON.stringify({id:crypto.randomUUID(),text})});
   if(!response.ok||scope()!==at||response.headers.get('content-type')?.split(';',1)[0]!=='audio/mpeg'){
    void response.body?.cancel().catch(()=>{});throw Error('NARRATION_UNAVAILABLE');
   }
   const bytes=await readBytes(response,MAX_AUDIO_BYTES,signal);
   if(scope()!==at||signal.aborted||bytes.length<100||
    !(bytes[0]===0x49&&bytes[1]===0x44&&bytes[2]===0x33||bytes[0]===0xff&&(bytes[1]&0xe0)===0xe0))throw Error('NARRATION_UNAVAILABLE');
   return new Blob([bytes.buffer as ArrayBuffer],{type:'audio/mpeg'});
  }
 };
}
async function readBytes(response:Response,max:number,signal:AbortSignal):Promise<Uint8Array> {
 if(!response.body||Number(response.headers.get('content-length')||0)>max||signal.aborted){
  void response.body?.cancel().catch(()=>{});throw Error('NARRATION_UNAVAILABLE');
 }
 const reader=response.body.getReader(),parts:Uint8Array[]=[];let count=0;
 let rejectAbort!:(error:Error)=>void;
 const aborted=new Promise<never>((_,reject)=>{rejectAbort=reject;});
 const abort=()=>{rejectAbort(Error('NARRATION_UNAVAILABLE'));void reader.cancel().catch(()=>{});};signal.addEventListener('abort',abort,{once:true});
 try {
  if(signal.aborted)abort();
  while(true){signal.throwIfAborted();const {done,value}=await Promise.race([reader.read(),aborted]);if(done)break;count+=value.length;if(count>max)throw Error('NARRATION_UNAVAILABLE');parts.push(value);}
  signal.throwIfAborted();const result=new Uint8Array(count);let at=0;for(const part of parts){result.set(part,at);at+=part.length;}return result;
 }finally{signal.removeEventListener('abort',abort);void reader.cancel().catch(()=>{});try{reader.releaseLock();}catch{/* Cancellation owns any pending read. */}}
}
