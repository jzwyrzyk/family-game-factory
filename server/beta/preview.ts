import type {IncomingMessage,ServerResponse} from 'node:http';
import {SignJWT,jwtVerify} from 'jose';
import type {FamilyDirectory} from './store';
import type {AtomicStore} from './documents';
import {activeFamily,betaNotice,participationNotice,playIdle,uuid,workspaceOf,familyOrigin,type Family,type Policy} from './model';
import {digest} from './access';
import {cookieValue} from '../trusted-devices';
import type {VerifiedSession} from '../contracts/api';
import {requireResourceAudience} from '../pipeline/audience';
import {readWorkspace} from '../pipeline/workspace-state';
import {isGeneratedGame} from '../agent/generated';
import {renderGenerated} from '../sandbox/preview.cjs';
import {renderPreview} from '../pipeline/artifacts';
import type {PrivateArtifacts} from '../storage/artifacts';

export interface PreviewRouting {environment:string;hubOrigin:string;previewOrigin:string;previewKey:string}
export async function previewAdmission(d:FamilyDirectory,routing:PreviewRouting,session:VerifiedSession,raw:string|undefined,id:string){
 const s=await d.repository(session.familyId).snapshot(),r=s.revisions.find(v=>v.id===id&&v.game);
 if(!r||!session.deviceId)throw Error('NOT_FOUND');
 requireResourceAudience(s,session,r);
 const expiresAt=Math.min(Date.now()+120000,session.expiresAt),play=digest(cookieValue(raw,'__Host-jems-play')??'');
 const grant=await new SignJWT({family:session.familyId,device:session.deviceId,play,revision:id})
  .setProtectedHeader({alg:'HS256',typ:'jems-play-preview'}).setIssuer(routing.hubOrigin).setAudience(routing.previewOrigin)
  .setIssuedAt().setExpirationTime(Math.floor(expiresAt/1000)).sign(new TextEncoder().encode(routing.previewKey));
 return {artifactId:id,projectId:r.projectId,expiresAt,url:routing.previewOrigin+'/family-preview',grant,
  kind:r.game!.kind,title:isGeneratedGame(r.game)?r.game.title:'Catch the Stars',adapter:r.adapter??'metered-api'};
}
export function familyPreview(config:PreviewRouting,db:AtomicStore,artifacts:(workspace:string)=>PrivateArtifacts|undefined){
 if(!/^[-a-z0-9]{1,30}$/.test(config.environment)||config.previewKey.length<32||
  ![config.hubOrigin,config.previewOrigin].every(o=>/^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(o))||
  config.hubOrigin===config.previewOrigin||config.previewOrigin.endsWith('.'+new URL(config.hubOrigin).hostname))throw Error('PREVIEW_CONFIGURATION_REQUIRED');
 return async(req:IncomingMessage,res:ServerResponse)=>{
  res.setHeader('Cache-Control','private, no-store');res.setHeader('Referrer-Policy','no-referrer');
  try{
   if(req.headers.host!==new URL(config.previewOrigin).host)throw Error();
   if(req.url==='/health'&&req.method==='GET'){await db.run(tx=>tx.get('factoryBeta/'+config.environment),true);res.end('{"ready":true}');return;}
   if(req.url!=='/family-preview'||req.method!=='POST'||req.headers['content-type']?.split(';')[0]!=='application/x-www-form-urlencoded')throw Error();
   const chunks:Buffer[]=[];let bytes=0;
   for await(const chunk of req){bytes+=chunk.length;if(bytes>4096)throw Error();chunks.push(Buffer.from(chunk));}
   const form=new URLSearchParams(Buffer.concat(chunks).toString());
   if([...form.keys()].sort().join(',')!=='channel,grant')throw Error();
   const channel=form.get('channel');if(!uuid(channel))throw Error();
   const {payload}=await jwtVerify(form.get('grant')!,new TextEncoder().encode(config.previewKey),{
    algorithms:['HS256'],typ:'jems-play-preview',issuer:config.hubOrigin,audience:config.previewOrigin,maxTokenAge:'2m'});
   const {family,device,play,revision}=payload;
   if(!uuid(family)||!uuid(device)||typeof play!=='string'||!/^[a-f0-9]{64}$/.test(play)||typeof revision!=='string'||!/^[\w-]{1,100}$/.test(revision))throw Error();
   const authorizedOrigin=familyOrigin(config,family);if(req.headers.origin!==authorizedOrigin)throw Error();
   const root='factoryBeta/'+config.environment;
   const artifact=await db.run(async tx=>{
    const f=await tx.get<Family>(root+'/families/'+family),policy=await tx.get<Policy>(root);
    if(!f||f.id!==family||!policy||policy.participation!==true)throw Error();activeFamily(f,policy);
    const now=Date.now(),ack=f.plays.find(a=>a.digest===play&&a.deviceId===device&&a.familyId===family&&a.guardianId===f.guardian.id);
    if(!ack||ack.entryPending||ack.notice!==betaNotice||ack.terms!==participationNotice||ack.expires<=now||ack.lastActive+playIdle<=now)throw Error();
    const workspace=workspaceOf(f),{state}=await readWorkspace(tx,workspace,artifacts(workspace));
    const r=state.revisions.find(r=>r.id===revision&&r.game);if(!r||!r.game)throw Error();
    requireResourceAudience(state,{subject:'family-preview',familyId:family,deviceId:device,role:'designer',expiresAt:payload.exp!*1000},r);
    return isGeneratedGame(r.game)?renderGenerated(r.game,revision,channel):renderPreview(r.game,revision,channel);
   },true);
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','X-Content-Type-Options':'nosniff','Permissions-Policy':'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy':artifact.csp.replace(/frame-ancestors [^;]+/,'frame-ancestors '+authorizedOrigin)});
   res.end(artifact.html);
  }catch{res.writeHead(403,{'Content-Type':'text/plain'});res.end('Private preview unavailable');}
 };
}
