import type {IncomingMessage,ServerResponse} from 'node:http';
import type {Repository} from '../pipeline/types';
import {verifyBrowserSession} from '../trusted-devices';
import {NarrationService} from './narration';
import {readNarrationRequest} from './narration-transport';
export function narrationHttpHandler(service:NarrationService,config:{appOrigin:string;sessionKey:string},repo:Repository){
 return async(req:IncomingMessage,res:ServerResponse)=>{
  const abort=new AbortController();res.once('close',()=>{if(!res.writableEnded)abort.abort();});
  const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
  const json=(status:number,data:unknown)=>{if(res.headersSent||res.writableEnded||res.destroyed)return;res.writeHead(status,{...headers,'Content-Type':'application/json'});res.end(JSON.stringify(data));};
  try {
   if(req.headers.origin&&req.headers.origin!==config.appOrigin||req.method!=='GET'&&req.headers.origin!==config.appOrigin)throw Error('FORBIDDEN');
   res.setHeader('Access-Control-Allow-Origin',config.appOrigin);res.setHeader('Access-Control-Allow-Credentials','true');res.setHeader('Vary','Origin');
   if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Headers','Content-Type,X-Factory-Adult-Session,X-Factory-Request');res.setHeader('Access-Control-Allow-Methods','GET,POST');res.writeHead(204);res.end();return;}
   const session=await verifyBrowserSession(repo,req.headers.cookie,config.sessionKey,Date.now(),req.headers['x-factory-adult-session']);
   const path=new URL(req.url||'','http://gateway').pathname;
   if(path==='/v1/coach/narration/status'&&req.method==='GET'){
    const available=await service.familyAvailable(session);json(200,{available,mode:available?'natural':'unavailable'});return;
   }
   if(path!=='/v1/coach/narration'||req.method!=='POST'||req.headers['x-factory-request']!=='1'||
    !String(req.headers['content-type']||'').startsWith('application/json'))throw Error('FORBIDDEN');
   if(!service.enabled())throw Error('NARRATION_UNAVAILABLE');
   const input=await readNarrationRequest(req,13000);
   if(!input||typeof input!=='object'||Array.isArray(input))throw Error('INVALID_NARRATION');
   const audio=await service.read(session,input as {id:string;text:string},abort.signal);
   if(res.destroyed||res.writableEnded)return;
   res.writeHead(200,{...headers,'Content-Type':'audio/mpeg','Content-Length':audio.length});res.end(Buffer.from(audio));
  }catch(error){
   const code=(error as Error).message;
   const known=['FORBIDDEN','UNAUTHENTICATED','ADULT_PILOT_ACCESS_REQUIRED','INVALID_NARRATION','NARRATION_REQUEST_EXISTS','RATE_LIMIT','SPENDING_CUTOFF'];
   json(code==='UNAUTHENTICATED'?401:code==='FORBIDDEN'||code==='ADULT_PILOT_ACCESS_REQUIRED'?403:code==='RATE_LIMIT'?429:
    code==='INVALID_NARRATION'?400:code==='NARRATION_REQUEST_EXISTS'?409:503,{errorCode:known.includes(code)?code:'NARRATION_UNAVAILABLE'});
  }
 };
}
