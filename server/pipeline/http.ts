import {isGeneratedGame} from '../agent/generated';
import {renderGenerated} from '../sandbox/preview.cjs';
import type { IncomingMessage,ServerResponse } from 'node:http';
import { createHmac,timingSafeEqual } from 'node:crypto';
import { verifySession } from './auth';
import { renderPreview } from './artifacts';
import { JobService } from './service';
interface HttpConfig {sessionKey:string;previewKey:string;appOrigin:string;previewOrigin:string;dispatch?:(id:string)=>Promise<void>;poll?:()=>Promise<void>}
function json(response:ServerResponse,status:number,value:unknown){response.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});response.end(JSON.stringify(value));}
async function body(request:IncomingMessage){let text='';for await(const chunk of request){text+=chunk;if(Buffer.byteLength(text)>12000)throw Error('REQUEST_TOO_LARGE');}return JSON.parse(text||'{}');}
const signature=(key:string,fields:string)=>createHmac('sha256',key).update(fields).digest('base64url');
const equal=(a:string,b:string)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
export function apiHandler(service:JobService,config:HttpConfig){
 if(config.sessionKey.length<32||config.previewKey.length<32)throw Error('Server signing keys are not configured');
 return async(request:IncomingMessage,response:ServerResponse)=>{
  try{
   const origin=request.headers.origin;
   if(origin&&origin!==config.appOrigin)throw Error('FORBIDDEN');
   if(origin){response.setHeader('Access-Control-Allow-Origin',config.appOrigin);response.setHeader('Access-Control-Allow-Credentials','true');response.setHeader('Vary','Origin');}
   if(request.method==='OPTIONS'){response.setHeader('Access-Control-Allow-Headers','Content-Type,X-Factory-Request');response.setHeader('Access-Control-Allow-Methods','GET,POST');response.writeHead(204);response.end();return;}
   if(request.method==='POST'&&(request.headers['x-factory-request']!=='1'||origin!==config.appOrigin||!request.headers['content-type']?.startsWith('application/json')))throw Error('FORBIDDEN');
   const cookie=request.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith('factory_session='))?.slice('factory_session='.length);
   const session=verifySession(cookie,config.sessionKey);const path=new URL(request.url!,'http://internal').pathname;
   if(path==='/v1/builder/status'&&request.method==='GET')return json(response,200,await service.readiness(session));
   if(path==='/v1/revisions'&&request.method==='POST')return json(response,200,await service.registerBase(session,await body(request)));
   if(path==='/v1/jobs'&&request.method==='POST'){
    const ack=await service.submit(session,await body(request));json(response,202,ack);if(ack.status==='queued')setImmediate(()=>{void (config.dispatch?config.dispatch(ack.jobId):service.run(ack.jobId)).catch(()=>{});});return;
   }
   let match=path.match(/^\/v1\/jobs\/([\w-]+)(\/(?:cancel|retry))?$/);
   if(match){if(match[2]==='/retry'&&request.method==='POST'){const input=await body(request),ack=await service.retry(session,match[1],input.clientRequestId);json(response,202,ack);if(config.dispatch)void config.dispatch(ack.jobId).catch(()=>{});else void service.run(ack.jobId).catch(()=>{});return;}if(match[2]==='/cancel'&&request.method==='POST')return json(response,200,await service.cancel(session,match[1]));if(!match[2]&&request.method==='GET'){await service.get(session,match[1]);await config.poll?.();return json(response,200,await service.get(session,match[1]));}}
   if(/^\/v1\/revisions\/[\w-]+$/.test(path)&&request.method==='GET'){const r=await service.revision(session,path.split('/').at(-1)!);return json(response,200,{id:r.id,projectId:r.projectId,parentId:r.parentId,game:isGeneratedGame(r.game)?{kind:r.game.kind,title:r.game.title,instructions:r.game.instructions,controls:r.game.controls}:r.game,name:r.name});}
   if(path==='/v1/creations'&&request.method==='GET')return json(response,200,(await service.list(session)).map(r=>({...r,game:isGeneratedGame(r.game)?{kind:r.game.kind,title:r.game.title,instructions:r.game.instructions,controls:r.game.controls}:r.game})));
   match=path.match(/^\/v1\/revisions\/([\w-]+)\/(preview|keep|undo|fork)$/);
   if(match){const id=match[1];if(match[2]==='preview'&&request.method==='GET'){
     const revision=await service.revision(session,id);const expiresAt=Date.now()+120000,fields=`${id}\n${session.familyId}\n${expiresAt}`,url=new URL('/preview/'+id,config.previewOrigin);url.searchParams.set('scope',session.familyId);url.searchParams.set('expires',String(expiresAt));url.searchParams.set('cap',signature(config.previewKey,fields));return json(response,200,{artifactId:id,projectId:revision.projectId,expiresAt,url:url.href,adapter:revision.adapter,kind:revision.game?.kind,title:isGeneratedGame(revision.game)?revision.game.title:'Catch the Stars'});
    }if(request.method==='POST'&&match[2]==='fork'){const input=await body(request);if(Object.keys(input).some(k=>k!=='name'))throw Error('INVALID_REQUEST');return json(response,200,await service.fork(session,id,input.name));}if(request.method==='POST'&&match[2]==='keep')return json(response,200,await service.keep(session,id));if(request.method==='POST'&&match[2]==='undo')return json(response,200,await service.undo(session,id));
   }
   json(response,404,{errorCode:'NOT_FOUND'});
  }catch(error){const raw=(error as Error).message,code=raw==='Forbidden'?'FORBIDDEN':raw;const allowed=['UNAUTHENTICATED','FORBIDDEN','NOT_FOUND','BUILDER_UNAVAILABLE','INVALID_REQUEST','PRIVATE_INFORMATION','SPENDING_CUTOFF','RATE_LIMIT','RETRY_LIMIT','IDEMPOTENCY_CONFLICT','NO_PREVIOUS_VERSION','GAME_FORM_UNSUPPORTED','GAME_FORM_REVIEW_REQUIRED','GAME_FORM_BASE_UNVERIFIED'];json(response,code==='UNAUTHENTICATED'?401:code==='FORBIDDEN'?403:code==='NOT_FOUND'?404:code==='BUILDER_UNAVAILABLE'?503:400,{errorCode:allowed.includes(code)?code:'REQUEST_REJECTED'});}
 };
}
export function previewHandler(service:Pick<JobService,'revision'>,config:Pick<HttpConfig,'previewKey'|'previewOrigin'>){
 if(config.previewKey.length<32)throw Error('Server signing keys are not configured');
 return async(request:IncomingMessage,response:ServerResponse)=>{
  try{
   const url=new URL(request.url!,'http://preview'),id=url.pathname.match(/^\/preview\/([\w-]+)$/)?.[1],familyId=url.searchParams.get('scope'),expiresAt=Number(url.searchParams.get('expires')),cap=url.searchParams.get('cap'),channel=url.searchParams.get('channel');
   if(!id||!familyId||!cap||!channel||expiresAt<=Date.now()||expiresAt>Date.now()+120000||!equal(cap,signature(config.previewKey,`${id}\n${familyId}\n${expiresAt}`)))throw Error('Forbidden');
   const revision=await service.revision({subject:'preview-capability',familyId,role:'designer',expiresAt},id);if(!revision.game)throw Error('Forbidden');const artifact=isGeneratedGame(revision.game)?renderGenerated(revision.game,id,channel):renderPreview(revision.game,id,channel);
   response.writeHead(200,{'Content-Type':'text/html','Content-Security-Policy':artifact.csp,'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Permissions-Policy':'camera=(), microphone=(), geolocation=()'});response.end(artifact.html);
  }catch{response.writeHead(403,{'Content-Type':'text/plain','Cache-Control':'no-store'});response.end('Private preview unavailable');}
 };
}
