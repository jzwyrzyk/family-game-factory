/** Gateway-only family/session boundary for explicit short speech dictation.
 * Content is transported in the request body, never stored/logged or sent to
 * public GitHub, previews, AI generation, or the model coach.
 */
import type {IncomingMessage,ServerResponse} from 'node:http';
import {verifySession} from '../pipeline/auth';
import {CoachAudioService,AUDIO_MAX_BYTES,audioMime} from './speech';
export function speechHttpHandler(service:CoachAudioService,config:{appOrigin:string;sessionKey:string}){
 return async(req:IncomingMessage,res:ServerResponse)=>{
  const abort=new AbortController();
  res.once('close',()=>{if(!res.writableEnded)abort.abort();});
  const send=(status:number,data:unknown)=>{
   if(res.headersSent||res.writableEnded)return;
   res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
   res.end(JSON.stringify(data));
  };
  try{
   if(req.headers.origin!==config.appOrigin)throw Error('FORBIDDEN');
   res.setHeader('Access-Control-Allow-Origin',config.appOrigin);
   res.setHeader('Access-Control-Allow-Credentials','true');res.setHeader('Vary','Origin');
   if(req.method==='OPTIONS'){
    res.setHeader('Access-Control-Allow-Headers','Content-Type,X-Factory-Request,X-Factory-Audio-Id');
    res.setHeader('Access-Control-Allow-Methods','GET,POST');res.writeHead(204);res.end();return;
   }
   const token=req.headers.cookie?.split(';').map(x=>x.trim())
    .find(x=>x.startsWith('factory_session='))?.slice(16);
   const session=verifySession(token,config.sessionKey);
   const path=new URL(req.url||'','http://gateway').pathname;
   if(path==='/v1/coach/audio/status'&&req.method==='GET'){
    const available=await service.familyAvailable(session);
    send(200,{available,mode:available?'private':'unavailable'});return;
   }
   if(path!=='/v1/coach/audio'||req.method!=='POST'||req.headers['x-factory-request']!=='1')
    throw Error('FORBIDDEN');
   if(!service.enabled())throw Error('AUDIO_UNAVAILABLE');
   const rawMime=req.headers['content-type'];
   if(typeof rawMime!=='string'||!audioMime(rawMime))throw Error('INVALID_AUDIO');
   const id=req.headers['x-factory-audio-id'];
   if(typeof id!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(id))throw Error('INVALID_AUDIO');
   const claimed=Number(req.headers['content-length']);
   if(req.headers['content-length']!==undefined&&(!Number.isSafeInteger(claimed)||claimed<100||claimed>AUDIO_MAX_BYTES))
    throw Error('INVALID_AUDIO');
   let count=0;const chunks:Buffer[]=[];
   for await(const data of req){
    const part=Buffer.from(data);
    count+=part.length;if(count>AUDIO_MAX_BYTES)throw Error('INVALID_AUDIO');
    chunks.push(part);
   }
   const result=await service.transcribe(session,{id,mime:rawMime,audio:Buffer.concat(chunks)},abort.signal);
   send(200,result);
  }catch(err){
   const code=(err as Error).message;
   const permitted=['AUDIO_UNAVAILABLE','UNAUTHENTICATED','FORBIDDEN','INVALID_AUDIO',
    'AUDIO_NO_SPEECH','RATE_LIMIT','AUDIO_REQUEST_EXISTS','SPENDING_CUTOFF'];
   send(code==='UNAUTHENTICATED'?401:code==='FORBIDDEN'?403:
    code==='AUDIO_UNAVAILABLE'?503:code==='RATE_LIMIT'?429:400,
    {errorCode:permitted.includes(code)?code:'AUDIO_UNAVAILABLE'});
  }
 };
}
