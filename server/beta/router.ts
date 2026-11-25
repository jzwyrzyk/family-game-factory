import {randomUUID} from 'node:crypto';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {readJsonBody} from '../http-json';
import {verifySession} from '../pipeline/auth';
import {cookieValue,assertActiveTrustedDevice} from '../trusted-devices';
import {acknowledge,exact,internalCookies,liveSession,logout,redeem,requirePlay} from './access';
import {activeFamily,betaNotice,familyOrigin,participationNotice,uuid,type Capabilities} from './model';
import {exportApproved,exportReceiptPage,exportWorkspace} from './portability';
import {previewAdmission,type PreviewRouting} from './preview';
import {BetaAdministration,verifyAdministrator} from './admin';
import type {FamilyDirectory} from './store';

type Handler=(req:IncomingMessage,res:ServerResponse)=>Promise<void>;
export type Surface=(req:IncomingMessage,res:ServerResponse,context:{path:string;family?:string;capabilities?:Capabilities;administrator?:boolean;guardianTool?:boolean;expires?:number;idleUntil?:number;profiles?:string[]})=>Promise<boolean>;
export function json(res:ServerResponse,status:number,data:unknown,cookies?:string[]){
 res.writeHead(status,{'Content-Type':'application/json; charset=utf-8',...(cookies?{'Set-Cookie':cookies}:{})});res.end(JSON.stringify(data));
}
const read=(req:IncomingMessage)=>readJsonBody(req,4096,{invalidJsonError:'INVALID_REQUEST',emptyObject:true});
export function betaRouter(d:FamilyDirectory,key:string,options:{
 runtime:(id:string)=>Promise<Handler>;operatorReadiness?:{jobCeilingMicroUsd:number;generationDispatch:boolean;coachBridge:boolean;speechBridge:boolean};preview?:PreviewRouting;worker?:Handler;scheduler?:Handler;surface?:Surface;adminIdentity?:typeof verifyAdministrator;
}):Handler {
 const hub=new URL(d.config.hubOrigin),admin=new BetaAdministration(d);
 return async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Frame-Options','DENY');res.setHeader('Permissions-Policy','camera=(), geolocation=(), payment=()');
  try{
   const host=req.headers.host??'',origin='https://'+host,raw=req.headers.cookie;
   const id=host.endsWith('.'+hub.host)&&host.startsWith('f-')?host.slice(2,-(hub.host.length+1)):undefined;
   if(host!==hub.host&&(!uuid(id)||origin!==familyOrigin(d.config,id)))throw Error('NOT_FOUND');
   if(!req.url?.startsWith('/')||req.url.startsWith('//')||/[\\%]/.test(req.url.split('?')[0]))throw Error('NOT_FOUND');
   const url=new URL(req.url,origin),path=url.pathname;
   const lookup=/^\/v1\/job-requests\/[\w-]+$/.test(path)&&/^\?payloadHash=[0-9a-f]{64}$/.test(url.search);
   if(url.origin!==origin||url.search&&!lookup)throw Error('NOT_FOUND');
   if(path==='/health'&&req.method==='GET'){await d.db.run(tx=>d.policy(tx));json(res,200,{ready:true,mode:'PRIVATE_FAMILY_BETA'});return;}
   if(!id&&path.startsWith('/v1/worker/')&&options.worker){await options.worker(req,res);return;}
   if(!id&&path==='/v1/internal/dispatch'&&options.scheduler){await options.scheduler(req,res);return;}
   if(req.method!=='GET'&&req.method!=='POST')throw Error('FORBIDDEN');
   if((req.headers.origin&&req.headers.origin!==origin)||(req.method==='POST'&&
    (req.headers.origin!==origin||req.headers['x-factory-request']!=='1'||!(path==='/v1/coach/audio'?/^audio\/(?:webm|mp4|ogg)(?:;|$)/i:/^application\/json(?:;|$)/i).test(req.headers['content-type']??''))))throw Error('FORBIDDEN');
   if(!id&&(path==='/manage'||path.startsWith('/manage/'))){
    const assertion=req.headers['x-goog-iap-jwt-assertion'];
    const sub=await (options.adminIdentity??verifyAdministrator)(typeof assertion==='string'?assertion:undefined,d.config);
    if(req.method==='POST'&&path==='/manage/action'){json(res,200,await admin.change(sub,await read(req)));return;}
    if(req.method==='GET'&&(path==='/manage/state'||path.startsWith('/manage/family/'))){
     const result=await admin.view(sub,path==='/manage/state'?undefined:path.slice('/manage/family/'.length));
     json(res,200,path==='/manage/state'?{...result,runtime:options.operatorReadiness??null}:result);return;
    }
    if(await options.surface?.(req,res,{path,administrator:true}))return;
    throw Error('NOT_FOUND');
   }
   if(req.method==='GET'&&path==='/entry/status'){
    if(!id){json(res,200,{family:false});return;}
    const state=await d.withFamily(id,async(tx,f,p)=>{
     let connected=false;
     try{
      const session=verifySession(cookieValue(internalCookies(raw),'factory_session'),key);
      if(session.deviceId&&session.familyId===id){const s=await d.inWorkspace(tx,f,p,s=>s,false);
       assertActiveTrustedDevice(s,session);connected=true;}
     }catch{/* No authenticated device. */}
     return {family:true,connected,status:connected?f.status:undefined,needsProfile:connected&&!f.profiles?.length,notice:betaNotice,terms:participationNotice};
    });json(res,200,state);return;
   }
   if(req.method==='POST'&&!id&&path==='/entry/workshop'){
    const input:unknown=await read(req);exact(input,['code']);if(!uuid(input.code))throw Error('INVALID_REQUEST');
    json(res,200,{origin:familyOrigin(d.config,input.code)});return;
   }
   if(req.method==='GET'&&['/acknowledge','/grown-ups'].includes(path)){
    if(!id)throw Error('NOT_FOUND');
    try{await d.withFamily(id,async(tx,f,p)=>{activeFamily(f,p);await d.inWorkspace(tx,f,p,s=>liveSession(f,s,internalCookies(raw),key,Date.now()),false);});}
    catch{res.writeHead(303,{Location:'/login'});res.end();return;}
   }
   if(req.method==='GET'&&!path.startsWith('/play/')&&!path.startsWith('/v1/')&&await options.surface?.(req,res,{path,family:id}))return;
   if(!id)throw Error('NOT_FOUND');
   if(req.method==='POST'&&path==='/entry/redeem'){
    const {pairingCode,cookies}=await redeem(d,id,await read(req),key);json(res,200,{pairingCode},cookies);return;
   }
   if(req.method==='POST'&&path==='/entry/acknowledge'){
    const cookie=await acknowledge(d,id,await read(req),internalCookies(raw),key);json(res,200,{enter:'/play/'},[cookie]);return;
   }
   if(req.method==='POST'&&(path==='/entry/logout'||path==='/entry/end')){
    exact(await read(req),[]);json(res,200,{ended:true},await logout(d,id,raw,key,path==='/entry/logout'));return;
   }
   if(path==='/entry/profiles'||path==='/entry/review-art'||['/entry/export','/entry/export-receipts','/entry/export-device.js'].includes(path)){
    const body=req.method==='POST'?await read(req):{};
    exact(body,path==='/entry/review-art'?['digest']:path==='/entry/export-receipts'?['kind','after']:[]);
    const result=await d.withFamily(id,async(tx,f,p)=>{
     activeFamily(f,p);
     const cookies=internalCookies(raw),now=Date.now();
     const session=await d.inWorkspace(tx,f,p,s=>liveSession(f,s,cookies,key,now),false);
     const parent=verifySession(cookieValue(cookies,'factory_parent'),key,now);
     if(parent.role!=='parent'||parent.familyId!==id||parent.deviceId!==session.deviceId)throw Error('FORBIDDEN');
     if(path.startsWith('/entry/export')){
      exportApproved(f,now);
      if(path==='/entry/export-device.js'){if(req.method!=='GET')throw Error('FORBIDDEN');return {guardianTool:true};}
      if(req.method!=='POST')throw Error('FORBIDDEN');
      if(path==='/entry/export-receipts')return exportReceiptPage(tx,d.path(id),f,body.kind,body.after);
      const data=await d.inWorkspace(tx,f,p,s=>exportWorkspace(f,s,now),false);
      f.request!.state='completed';tx.set(d.path(id),f);return data;
     }
     if(path==='/entry/review-art'){
      if(req.method!=='POST'||typeof body.digest!=='string'||!f.capabilities.artwork||!f.approvedArt?.includes(body.digest))throw Error('ART_REVIEW_REQUIRED');
      return {approved:true};
     }
     if(req.method==='POST'){f.profiles??=[];if(f.profiles.length>=6)throw Error('PROFILE_LIMIT');f.profiles.push(randomUUID());tx.set(d.path(id),f);}
     return {ids:f.profiles??[]};
    });
    if(path==='/entry/export-device.js'){if(await options.surface?.(req,res,{path,family:id,guardianTool:true}))return;throw Error('NOT_FOUND');}
    json(res,200,result);return;
   }
   if(path.startsWith('/play/')&&req.method==='GET'){
    let access;
    try{access=await requirePlay(d,id,raw,key,path==='/play/'?'entry':'check');}
    catch(error){
     if(path!=='/play/'||!(error instanceof Error)||error.message!=='PLAY_REQUIRED')throw error;
     await d.withFamily(id,async(tx,f,p)=>{activeFamily(f,p);await d.inWorkspace(tx,f,p,s=>liveSession(f,s,internalCookies(raw),key,Date.now()),false);});
     res.writeHead(303,{Location:'/acknowledge'});res.end();return;
    }
    if(await options.surface?.(req,res,{path,family:id,capabilities:access.capabilities,profiles:access.profiles,expires:access.expires,idleUntil:access.idleUntil}))return;
    throw Error('NOT_FOUND');
   }
   if(path==='/entry/activity'&&req.method==='POST'||path==='/entry/check'&&req.method==='GET'){
    if(req.method==='POST')exact(await read(req),[]);
    const {expires,idleUntil,capabilities}=await requirePlay(d,id,raw,key,req.method==='POST'?'activity':'check');json(res,200,{expires,idleUntil,capabilities});return;
   }
   const entryRoutes=['/v1/sessions/enroll','/v1/sessions/renew','/v1/sessions/status','/v1/devices/unlock','/v1/devices/privacy','/v1/devices/privacy/revoke','/v1/devices','/v1/devices/invite','/v1/devices/revoke'];
   if(!path.startsWith('/v1/')||path==='/v1/sessions'||path.startsWith('/v1/sessions/adult/')||path.startsWith('/v1/worker/')||
    path.startsWith('/v1/internal/')||req.headers['x-factory-adult-session']!==undefined)throw Error('FORBIDDEN');
   if(entryRoutes.includes(path)){
    await d.withFamily(id,async(_tx,f,p)=>{if(path==='/v1/sessions/renew'&&f.status==='pending'&&p.participation)return;
     activeFamily(f,p);if(['/v1/sessions/enroll','/v1/devices/invite'].includes(path)&&!p.invitations)throw Error('INVITATIONS_PAUSED');});
   }else{
    const access=await requirePlay(d,id,raw,key,'check'),preview=path.match(/^\/v1\/revisions\/([\w-]+)\/preview$/);
    if(preview){if(req.method!=='GET'||!options.preview)throw Error('FORBIDDEN');
     json(res,200,await previewAdmission(d,options.preview,access.session,raw,preview[1]));return;}
   }
   req.headers.cookie=internalCookies(raw);
   await (await options.runtime(id))(req,res);
  }catch(e){
   if(res.headersSent){res.end();return;}
   const reason=e instanceof Error?e.message:'';
   const status=reason==='NOT_FOUND'||reason==='FAMILY_UNAVAILABLE'?404:
    ['PLAY_REQUIRED','UNAUTHENTICATED'].includes(reason)?401:['RATE_LIMIT','PARENT_LOCKED'].includes(reason)?429:
    /^(FORBIDDEN|ADMIN_REQUIRED|INVALID_(PARENT_ACCESS|INVITATION)|.*_REQUIRED|FAMILY_ACCESS_PAUSED|INVITATIONS_PAUSED|INVALID_LIFECYCLE|DELETION_PENDING)$/.test(reason)?403:
    /^(INVALID_|BETA_CAPACITY|RECEIPT_REUSED|REQUEST_PENDING)/.test(reason)?400:503;
   json(res,status,{errorCode:status===503?'SERVICE_UNAVAILABLE':reason});
  }
 };
}
