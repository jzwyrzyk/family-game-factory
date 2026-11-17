/**
 * Gateway HTTP boundary for separately authorized, transient child speech.
 * Never store, log or upload raw audio outside the short-lived private path.
 * No audio request is allowed without an authenticated family session.
 */
import type {IncomingMessage,ServerResponse} from 'node:http';
import {verifySession} from '../pipeline/auth';
import {CoachAudioService,type SpeechConfig,audioMime} from './speech';
export function speechConfig(env:NodeJS.ProcessEnv):SpeechConfig{
 return {
  approved:env.FACTORY_COACH_AUDIO_APPROVED==='true',
  privacyApproved:env.FACTORY_COACH_AUDIO_PRIVACY_APPROVED==='true',
  parentApproved:env.FACTORY_COACH_AUDIO_PARENT_CONSENT_APPROVED==='true',
  brokerApproved:env.FACTORY_COACH_PRIVATE_BROKER_APPROVED==='true',
  brokerOrigin:env.FACTORY_COACH_BROKER_ORIGIN||'',
  projectId:env.FACTORY_COACH_VERTEX_PROJECT||'',
  maxMicroUsd:Number(env.FACTORY_COACH_AUDIO_MAX_MICRO_USD||0)
 };
}
export function speechHttpHandler(service:CoachAudioService,config:{appOrigin:string;sessionKey:string}){
 return async(req:IncomingMessage,res:ServerResponse)=>{
  const reply=(status:number,body:unknown)=>{
   res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
   res.end(JSON.stringify(body));
  };
  try{
   if(req.headers.origin!==config.appOrigin)throw Error('FORBIDDEN');
   res.setHeader('Access-Control-Allow-Origin',config.appOrigin);
   res.setHeader('Access-Control-Allow-Credentials','true');res.setHeader('Vary','Origin');
   if(req.method==='OPTIONS'){
    res.setHeader('Access-Control-Allow-Headers','Content-Type,X-Factory-Request,X-Factory-Audio-Id');
    res.setHeader('Access-Control-Allow-Methods','GET,POST');
    res.writeHead(204);res.end();return;
   }
   const token=req.headers.cookie?.split(';').map(x=>x.trim())
    .find(x=>x.startsWith('factory_session='))?.slice(16);
   const session=verifySession(token,config.sessionKey);
   if(req.url==='/v1/coach/audio/status'&&req.method==='GET'){
    const available=await service.familyAvailable(session);
    reply(200,{available,mode:available?'private':'unavailable'});return;
   }
   if(req.url!=='/v1/coach/audio'||req.method!=='POST'||
    req.headers['x-factory-request']!=='1')throw Error('FORBIDDEN');
   if(!service.enabled())throw Error('AUDIO_UNAVAILABLE');
   const mime=req.headers['content-type'];
   if(typeof mime!=='string'||!audioMime(mime))throw Error('INVALID_AUDIO');
   const id=req.headers['x-factory-audio-id'];
   if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{8,100}$/.test(id))throw Error('INVALID_AUDIO');
   let size=0;const chunks:Buffer[]=[];
   for await(const data of req){
    const part=Buffer.from(data);size+=part.length;
    if(size>320000)throw Error('INVALID_AUDIO');chunks.push(part);
   }
   const result=await service.transcribe(session,{id,mime,audio:Buffer.concat(chunks)});
   reply(200,result);
  }catch(e){
   const reason=(e as Error).message;
   const permitted=['AUDIO_UNAVAILABLE','UNAUTHENTICATED','FORBIDDEN','INVALID_AUDIO',
    'AUDIO_NO_SPEECH','RATE_LIMIT','AUDIO_REQUEST_EXISTS','SPENDING_CUTOFF'];
   const code=permitted.includes(reason)?reason:'AUDIO_UNAVAILABLE';
   reply(reason==='UNAUTHENTICATED'?401:reason==='FORBIDDEN'?403:
    reason==='AUDIO_UNAVAILABLE'?503:reason==='RATE_LIMIT'?429:400,{errorCode:code});
  }
 };
}
