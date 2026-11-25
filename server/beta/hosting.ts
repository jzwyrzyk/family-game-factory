import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import type {ServerResponse} from 'node:http';
import type {Surface} from './router';
import {localCapabilities,type BetaConfig,type Capability} from './model';
import {page,publicPage} from './pages';

const publicAssets=new Set(['jems-logo.svg','fonts/jems/Nunito-Variable.woff','fonts/jems/Inter-Variable.woff',
 'art/mind-your-jems/scene-sky.webp','art/mind-your-jems/rock-expressions.webp','art/mind-your-jems/miner-poses.webp','art/mind-your-jems/cart-empty.webp']);
const mime:Record<string,string>={'.woff':'font/woff','.woff2':'font/woff2','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg','.gif':'image/gif','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.mp3':'audio/mpeg','.wav':'audio/wav'};
const html=(res:ServerResponse,body:string)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(body);return true;};
export function betaHosting(directory:string,config:BetaConfig,previewOrigin:string):Surface{
 const root=resolve(directory);
 async function file(res:ServerResponse,name:string){
  if(!/^[\w./-]+$/.test(name)||name.split('/').some(s=>s.startsWith('.')||!s))throw Error('NOT_FOUND');
  const path=resolve(root,name),type=mime[extname(path)];
  if(!path.startsWith(root+sep)||!type)throw Error('NOT_FOUND');
  const info=await stat(path).catch(()=>null);if(!info?.isFile()||info.size>25*1024*1024)throw Error('NOT_FOUND');
  const data=await readFile(path);res.writeHead(200,{'Content-Type':type});res.end(data);return true;
 }
 return async(req,res,c)=>{
  if(req.method!=='GET')return false;
  const {path}=c;
  const inPlay=!!c.capabilities;
  // A preview form POST needs the browser's exact Origin. Never send an application path.
  if(inPlay)res.setHeader('Referrer-Policy','strict-origin');
  res.setHeader('Content-Security-Policy',inPlay?
   `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob: data:; worker-src 'self' blob:; connect-src 'self'; frame-src ${previewOrigin}; frame-ancestors 'none'; form-action 'self' ${previewOrigin}; object-src 'none'; base-uri 'none'`:
   "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
  if(c.guardianTool&&path==='/entry/export-device.js')return file(res,'entry/household-vault.js');
  if(c.administrator){
   if(path==='/manage')return html(res,page('Family administration','<h1>Family administration</h1><div id="console"></div>',{script:'/manage/client.js'}));
   if(path==='/manage/client.js')return file(res,'entry/manage.js');
   return false;
  }
  if(path==='/entry.css'||path==='/entry.js')return file(res,'entry/'+path.slice(1));
  if(path.startsWith('/welcome-assets/')){const name=path.slice('/welcome-assets/'.length);if(!publicAssets.has(name))throw Error('NOT_FOUND');return file(res,name);}
  if(!inPlay){const body=publicPage(path,config,!!c.family);return body?html(res,body):false;}
  const caps=c.capabilities!,full=localCapabilities.every(k=>caps[k]);
  if(path==='/play/'){
   if(!c.profiles?.length){res.writeHead(303,{Location:'/grown-ups'});res.end();return true;}
   const attributes=`data-private-beta="true" data-expires="${c.expires}" data-idle="${c.idleUntil}" data-family-profiles='${JSON.stringify(c.profiles)}' data-capabilities='${JSON.stringify(caps)}'`;
   const controls='<aside class="family-session-controls"><a href="/grown-ups">Family controls</a> <button id="endFamilyPlay">End play</button> <button id="forgetFamilyDevice">Forget device</button> <span id="familyExitStatus" role="status"></span></aside>';
   let body=full?await readFile(resolve(root,'index.html'),'utf8'):page('Family workshop','<h1>Your family workshop</h1><section id="familyTools"></section><section id="familyActivity" hidden></section><button id="familyHome">My workshop</button>',{script:'/play/features/shell.js'});
   body=body.replace('<meta name="referrer" content="no-referrer">','<meta name="referrer" content="strict-origin">').replace('This is a local prototype, not a secure parental login. It stores no child accounts or cloud data. Use a generic nickname and supervise device access.','Use workshop nicknames and supervise each activity. Your family controls describe optional online features and privacy choices.');
   body=body.replace('<html lang="en">','<html lang="en" '+attributes+'>').replace('<head>','<head><script defer src="/play/session.js"></script><link rel="stylesheet" href="/play/family.css">')
    .replace(/<link rel="manifest"[^>]*>/g,'').replace('</body>',controls+(caps.artwork?'<label>Grown-ups · authorize this upload<input id="reviewedArtPassphrase" type="password" autocomplete="current-password" placeholder="Parent passphrase"></label><label>Reviewed artwork<input type="file" id="betaReviewedArt" accept="image/png"></label><script type="module" src="/play/features/artwork.js"></script>':'')+'</body>');
   if(!full)for(const k of localCapabilities.filter(k=>caps[k]))body=body.replace('</head>','<link rel="stylesheet" href="/play/features/'+k+'.css"></head>');
   return html(res,body);
  }
  if(path==='/play/session.js')return file(res,'entry/play-session.js');
  if(path==='/play/family.css')return file(res,'entry/family.css');
  if(path==='/play/factory-config.json'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({version:1,mode:'remote',apiBaseUrl:'https://'+req.headers.host,previewOrigin}));return true;}
  const name=path.slice('/play/'.length);
  if(name.startsWith('features/')){
   const feature=/^features\/(shell|games|coding|learning|problemSolving|artwork|remote)\.(js|css)$/.exec(name)?.[1];
   const available=feature==='shell'?!full:feature==='remote'?caps.conversation||caps.generation||caps.remoteSpeech:!!caps[feature as Capability];
   if(!feature||!available)throw Error('FORBIDDEN');
   return file(res,name);
  }
  if(/^assets\/index-[\w-]+\.(js|css)$/.test(name)){if(!full)throw Error('FORBIDDEN');return file(res,name);}
  if(!/\.(?:svg|webp|png|jpg|gif|woff2?|mp3|wav)$/.test(name)&&name!=='jems-pals/manifest.json')throw Error('NOT_FOUND');
  return file(res,name);
 };
}
