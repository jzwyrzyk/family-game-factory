import type {IncomingMessage,ServerResponse} from 'node:http';
import {verifySession} from '../pipeline/auth';
import {CoachService,type CoachConfig} from './service';
export function coachConfig(env:NodeJS.ProcessEnv):CoachConfig {
 return {enabled:env.FACTORY_COACH_APPROVED==='true',privacyApproved:env.FACTORY_COACH_PRIVACY_APPROVED==='true',moderationApproved:env.FACTORY_COACH_SAFEGUARDS_APPROVED==='true',zdrVerified:env.FACTORY_COACH_ZDR_VERIFIED==='true',privateExecutionApproved:env.FACTORY_COACH_PRIVATE_EXECUTION_APPROVED==='true',model:env.FACTORY_COACH_MODEL||'',maxInputChars:Number(env.FACTORY_COACH_INPUT_CHARS||16000),maxOutputTokens:Number(env.FACTORY_COACH_OUTPUT_TOKENS||800),maxTurnMicroUsd:Number(env.FACTORY_COACH_MAX_MICRO_USD||0),inputMicroUsdPerMillion:Number(env.FACTORY_COACH_INPUT_PRICE||0),outputMicroUsdPerMillion:Number(env.FACTORY_COACH_OUTPUT_PRICE||0),pricesReviewedAt:env.FACTORY_COACH_PRICES_REVIEWED||''};
}
export function coachHandler(service:CoachService,config:{appOrigin:string;sessionKey:string}){
 return async(req:IncomingMessage,res:ServerResponse)=>{
  const send=(code:number,data:unknown)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
  try{
   if(req.headers.origin!==config.appOrigin)throw Error('FORBIDDEN');
   res.setHeader('Access-Control-Allow-Origin',config.appOrigin);res.setHeader('Access-Control-Allow-Credentials','true');res.setHeader('Vary','Origin');
   if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Headers','Content-Type,X-Factory-Request');res.setHeader('Access-Control-Allow-Methods','GET,POST');res.writeHead(204);res.end();return;}
   const token=req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith('factory_session='))?.slice(16);
   const session=verifySession(token,config.sessionKey);const path=new URL(req.url!,'http://internal').pathname;
   if(path==='/v1/coach/status'&&req.method==='GET')return send(200,{available:service.available(),mode:service.available()?'model':'unavailable'});
   if(path!=='/v1/coach'||req.method!=='POST')return send(404,{errorCode:'NOT_FOUND'});
   if(req.headers['x-factory-request']!=='1'||!req.headers['content-type']?.startsWith('application/json'))throw Error('FORBIDDEN');
   let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>50000)throw Error('INVALID_REQUEST');}
   send(200,await service.respond(session,JSON.parse(body)));
  }catch(err){const c=(err as Error).message;const permitted=['FORBIDDEN','UNAUTHENTICATED','COACH_UNAVAILABLE','SPENDING_CUTOFF','RATE_LIMIT','IDEMPOTENCY_CONFLICT','COACH_REQUEST_EXISTS','COACH_REFUSED','PRIVATE_INFORMATION','COACH_HISTORY_FULL','INVALID_REQUEST'];send(c==='UNAUTHENTICATED'?401:c==='FORBIDDEN'?403:c==='COACH_UNAVAILABLE'?503:400,{errorCode:permitted.includes(c)?c:'COACH_UNAVAILABLE'});}
 };
}
