import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {internalCookies} from './access';
import {verifyAdministrator} from './admin';
import type {GatewayConfig} from '../gateway';

export interface HouseholdHost {audience:string;subject:string;sourceOrigin?:string}
type Handler=(req:IncomingMessage,res:ServerResponse)=>Promise<void>;
const types:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.gif':'image/gif','.woff':'font/woff','.woff2':'font/woff2','.jpg':'image/jpeg','.mp3':'audio/mpeg','.wav':'audio/wav'};
export function protectedHousehold(config:Pick<GatewayConfig,'platformMode'|'householdPrivateHost'|'appOrigin'|'gatewayOrigin'|'previewOrigin'|'familyId'|'workspace'>,directory:string,api:Handler,identify=verifyAdministrator):Handler{
 const owner=config.householdPrivateHost;
 if(!owner||config.platformMode==='PRIVATE_FAMILY_BETA'||config.platformMode==='PUBLIC'||config.appOrigin!==config.gatewayOrigin||
  !/^https:\/\/[a-z0-9.-]+$/.test(config.appOrigin)||/^https:\/\/f-[a-f0-9-]{36}\./.test(config.appOrigin)||
  config.appOrigin===config.previewOrigin||!/^\/projects\/\d+\/global\/backendServices\/\d+$/.test(owner.audience)||
  !/^[\w:.@-]{1,200}$/.test(owner.subject)||
  (owner.sourceOrigin!==undefined&&(!/^https:\/\/[a-z0-9.-]+$/.test(owner.sourceOrigin)||owner.sourceOrigin===config.appOrigin)))throw Error('HOUSEHOLD_PRIVATE_HOST_REQUIRED');
 const root=resolve(directory);
 return async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');
  try{
   if(req.headers.host!==new URL(config.appOrigin).host||!req.url?.startsWith('/')||req.url.startsWith('//')||/[\\%]/.test(req.url.split('?')[0]))throw Error();
   const path=new URL(req.url,config.appOrigin).pathname;
   // Machine callers keep their existing independent scheduler/worker identity checks.
   if(/^\/v1\/worker\/jobs\/[a-f0-9-]+\/(?:claim|report|status)$/.test(path)||path==='/v1/internal/dispatch'){await api(req,res);return;}
   const token=req.headers['x-goog-iap-jwt-assertion'];
   await identify(typeof token==='string'?token:undefined,{administrator:owner});
   if(path==='/health'||path.startsWith('/v1/')){
    if(req.method==='GET'&&path.startsWith('/v1/')&&!req.headers.origin)req.headers.origin=config.appOrigin;
    req.headers.cookie=internalCookies(req.headers.cookie);await api(req,res);return;
   }
   if(req.method!=='GET')throw Error();
   res.setHeader('Referrer-Policy','strict-origin');
   res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob: data:; worker-src 'self' blob:; connect-src 'self'; frame-src "+config.previewOrigin+"; frame-ancestors 'none'; form-action 'self' "+config.previewOrigin+"; object-src 'none'; base-uri 'none'");
   let file=path.slice(1);
   if(path==='/factory-config.json'){
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify({version:1,mode:'remote',apiBaseUrl:config.gatewayOrigin,previewOrigin:config.previewOrigin}));return;
   }
   if(path.startsWith('/household-transfer/')){
    if(!owner.sourceOrigin)throw Error();
    if(path==='/household-transfer/mapping.json'){
     res.setHeader('Content-Type','application/json');res.end(JSON.stringify({familyId:config.familyId,workspace:config.workspace,sourceOrigin:owner.sourceOrigin,targetOrigin:config.appOrigin}));return;
    }
    if(!['/household-transfer/','/household-transfer/transfer.js','/household-transfer/household-vault.js'].includes(path))throw Error();
    file='entry/'+(path==='/household-transfer/'?'transfer.html':path.split('/').pop());
   }else if(path==='/'||path==='/index.html'){
    let html=await readFile(resolve(root,'index.html'),'utf8');
    html=html.replace('<html lang="en">','<html lang="en" data-household-protected>').replace(/<link rel="manifest"[^>]*>/g,'').replace('</head>','<script defer src="/owner-session.js"></script></head>');
    res.setHeader('Content-Type',types['.html']);res.end(html);return;
   }else if(path==='/owner-session.js')file='entry/owner-session.js';
   else if(/^play\/(?:fonts|art)\/[\w/-]+\.(?:webp|gif|svg|jpg|png|woff2?)$/.test(file))file=file.slice(5);
   else if(!/^(?:assets\/index-[\w-]+\.(?:js|css)|[\w/-]+\.(?:webp|gif|svg|jpg|png|mp3|wav|woff2?)|jems-pals\/manifest\.json)$/.test(file))throw Error();
   const name=resolve(root,file);
   if(!name.startsWith(root+sep)||!types[extname(name)]||!(await stat(name)).isFile())throw Error();
   res.setHeader('Content-Type',types[extname(name)]);res.end(await readFile(name));
  }catch{if(!res.headersSent)res.writeHead(403);res.end('Private household access required.');}
 };
}
