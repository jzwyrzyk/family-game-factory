/** Authenticated DEV shell and same-origin browser API transport.
 * No provider/GitHub key, execution callback or arbitrary proxy destination is
 * accepted here. Production continues to use its existing Pages publication.
 */
import {createServer,type IncomingMessage,type ServerResponse} from 'node:http';
import {readFile,realpath,stat} from 'node:fs/promises';
import path from 'node:path';
import {DevIapVerifier,assertDevProjectBinding,validateDevAccess,type DevAccessConfig} from './dev-access';

export interface DevSiteConfig {
 version:1;environment:'development';projectId:string;appOrigin:string;gatewayServiceOrigin:string;previewOrigin:string;
 devAccess:DevAccessConfig;
}
type AdultVerifier={verify(assertion:string|string[]|undefined):Promise<unknown>};
const allowedCookies=new Set(['factory_session','factory_device','factory_parent','factory_adult']);
const mime:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
 '.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml',
 '.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg','.ico':'image/x-icon',
 '.woff':'font/woff','.woff2':'font/woff2','.mp3':'audio/mpeg','.wav':'audio/wav','.webm':'video/webm'};
const maxRequestBytes=1024*1024,maxResponseBytes=16*1024*1024;
const noOfflineWorker=`self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('family-arcade:')).map(k=>caches.delete(k)))).then(()=>self.clients.claim()).then(()=>self.registration.unregister())));`;
const bannerStyle=`.jems-dev-notice{position:relative;z-index:2147483647;display:flex;align-items:center;justify-content:center;gap:.75rem;flex-wrap:wrap;padding:.55rem 1rem;background:#172554;color:#fff;font:600 14px/1.4 system-ui,sans-serif;border-bottom:3px solid #fbbf24}.jems-dev-notice a{color:#fff;text-decoration:underline}.jems-dev-notice code{font-size:12px}`;
function canonicalOrigin(value:unknown):string{
 if(typeof value!=='string')throw Error('DEV_SITE_ORIGIN_REQUIRED');
 const u=new URL(value);if(u.protocol!=='https:'||u.origin!==value||u.username||u.password)throw Error('DEV_SITE_ORIGIN_REQUIRED');return value;
}
export function validateDevSiteConfig(value:unknown):DevSiteConfig{
 const c=value as DevSiteConfig;
 if(!c||Object.keys(c).some(k=>!['version','environment','projectId','appOrigin','gatewayServiceOrigin','previewOrigin','devAccess'].includes(k))||
  c.version!==1||c.environment!=='development')throw Error('DEV_SITE_CONFIG_REQUIRED');
 for(const origin of [c.appOrigin,c.gatewayServiceOrigin,c.previewOrigin])canonicalOrigin(origin);
 if(new Set([c.appOrigin,c.gatewayServiceOrigin,c.previewOrigin]).size!==3)throw Error('DEV_SITE_SEPARATE_ORIGINS_REQUIRED');
 // Scope validation also rejects production project/workspace/worker tuples.
 validateDevAccess(c.devAccess,{projectId:c.projectId,workspace:c.devAccess.syntheticWorkspace,
  familyId:c.devAccess.syntheticFamilyId,artifactBucket:c.projectId+'-artifacts',iapService:'jems-dev-app'});
 const audience=c.devAccess.iapAudience.match(/^\/projects\/(\d+)\/locations\/([a-z]+-[a-z]+\d)\/services\/jems-dev-app$/);
 if(!audience||c.appOrigin!==`https://jems-dev-app-${audience[1]}.${audience[2]}.run.app`||
  c.previewOrigin!==`https://jems-dev-preview-${audience[1]}.${audience[2]}.run.app`||
  c.gatewayServiceOrigin!==`https://jems-dev-gateway-${audience[1]}.${audience[2]}.run.app`)
  throw Error('DEV_SITE_GATEWAY_TARGET_REQUIRED');
 return structuredClone(c);
}
function fail(res:ServerResponse,status:number,code:string){
 if(res.destroyed||res.writableEnded)return;
 if(res.headersSent){res.destroy();return;}
 res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'});
 res.end(JSON.stringify({errorCode:code}));
}
function requestPath(req:IncomingMessage):URL{
 const raw=req.url||'';
 if(!raw.startsWith('/')||raw.startsWith('//')||/[\\\u0000-\u0020]/.test(raw))throw Error('INVALID_PATH');
 const decoded=decodeURIComponent(raw.split('?')[0]);
 if(decoded.includes('\\')||decoded.split('/').some(x=>x==='..'||x==='.'||x.startsWith('.'))||/%(?:2f|5c|2e)/i.test(decoded))throw Error('INVALID_PATH');
 return new URL(raw,'https://dev.invalid');
}
function browserHeaders(req:IncomingMessage,assertion:string):Headers{
 const headers=new Headers({'x-goog-iap-jwt-assertion':assertion});
 for(const key of ['accept','content-type','origin','x-factory-request','x-factory-adult-session','x-factory-audio-id']){
  const value=req.headers[key];if(typeof value==='string')headers.set(key,value);
 }
 const cookies=(req.headers.cookie||'').split(';').map(s=>s.trim()).filter(s=>allowedCookies.has(s.split('=',1)[0]));
 if(cookies.length)headers.set('cookie',cookies.join('; '));
 return headers;
}
async function body(req:IncomingMessage):Promise<Buffer|undefined>{
 if(req.method==='GET'||req.method==='HEAD')return undefined;
 const claimed=req.headers['content-length'];
 if(claimed!==undefined&&(!/^\d+$/.test(claimed)||Number(claimed)>maxRequestBytes))throw Error('REQUEST_TOO_LARGE');
 const chunks:Buffer[]=[];let length=0;
 for await(const chunk of req){const part=Buffer.from(chunk);length+=part.length;if(length>maxRequestBytes)throw Error('REQUEST_TOO_LARGE');chunks.push(part);}
 return Buffer.concat(chunks);
}
async function responseBody(response:Response):Promise<Buffer>{
 const parts:Uint8Array[]=[];let length=0;
 if(response.body)for await(const part of response.body as unknown as AsyncIterable<Uint8Array>){length+=part.length;if(length>maxResponseBytes)throw Error('RESPONSE_TOO_LARGE');parts.push(part);}
 return Buffer.concat(parts);
}
export async function createDevSite(config:DevSiteConfig,assetDirectory:string,
 options:{verifier?:AdultVerifier;fetchGateway?:typeof fetch}={}){
 const c=validateDevSiteConfig(config),assets=await realpath(assetDirectory);
 const info=JSON.parse(await readFile(path.join(assets,'build-info.json'),'utf8')) as {sha:string;dirty:boolean};
 if(!/^[a-f0-9]{40}$/.test(info.sha)||info.dirty!==false)throw Error('DEV_SITE_CLEAN_BUILD_REQUIRED');
 const policy=validateDevAccess(c.devAccess,{projectId:c.projectId,workspace:c.devAccess.syntheticWorkspace,
  familyId:c.devAccess.syntheticFamilyId,artifactBucket:c.projectId+'-artifacts',iapService:'jems-dev-app'});
 const verifier=options.verifier||new DevIapVerifier(policy),fetchGateway=options.fetchGateway||fetch;
 const publicConfig=JSON.stringify({version:1,mode:'remote',apiBaseUrl:c.appOrigin,previewOrigin:c.previewOrigin});
 const siteInfo=JSON.stringify({version:1,environment:'development',sourceSha:info.sha,adultsOnly:true,
  syntheticProfilesOnly:true,experiences:['child','adult'],backendStatus:'check-authorized-readiness'});
 const csp=["default-src 'self'","script-src 'self' 'wasm-unsafe-eval'","style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:","media-src 'self' blob:","font-src 'self'","connect-src 'self'",
  `frame-src ${c.previewOrigin} blob:`,"worker-src 'self' blob:","object-src 'none'","base-uri 'self'",
  "frame-ancestors 'none'","form-action 'self'"].join('; ');
 return async(req:IncomingMessage,res:ServerResponse)=>{
  try{
   if(req.headers.host!==new URL(c.appOrigin).host){fail(res,403,'DEV_SITE_HOST_REQUIRED');return;}
   const url=requestPath(req);
   // A minimal liveness path contains no source/configuration or user data.
   if(url.pathname==='/health'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end('{"ready":true,"environment":"development"}');return;}
   const assertion=req.headers['x-goog-iap-jwt-assertion'];
   try{await verifier.verify(assertion);}catch{fail(res,403,'DEV_ADULT_ACCESS_REQUIRED');return;}
   if(typeof assertion!=='string'){fail(res,403,'DEV_ADULT_ACCESS_REQUIRED');return;}
   if(url.pathname.startsWith('/v1/')){
    const decoded=decodeURIComponent(url.pathname);
    if(decoded.startsWith('/v1/worker/')||decoded.startsWith('/v1/internal/')||
      !['GET','POST','OPTIONS'].includes(req.method||'')){fail(res,403,'DEV_BROWSER_ROUTE_REQUIRED');return;}
    if((req.headers.origin&&req.headers.origin!==c.appOrigin)||(req.method==='POST'&&req.headers.origin!==c.appOrigin)){
     fail(res,403,'DEV_BROWSER_ORIGIN_REQUIRED');return;
    }
    const requestBody=await body(req);
    if(res.destroyed||res.writableEnded)return;
    // A single request. Redirects and ambiguous paid requests are never replayed.
    const disconnected=new AbortController();
    const close=()=>{if(!res.writableEnded)disconnected.abort();};
    res.once('close',close);
    let upstream:Response,bytes:Buffer;
    try{
     upstream=await fetchGateway(c.gatewayServiceOrigin+url.pathname+url.search,{method:req.method,
      headers:browserHeaders(req,assertion),body:requestBody?new Uint8Array(requestBody):undefined,redirect:'manual',
      signal:AbortSignal.any([disconnected.signal,AbortSignal.timeout(60000)])});
     if(upstream.status>=300&&upstream.status<400){await upstream.body?.cancel();fail(res,502,'DEV_GATEWAY_REDIRECT_REJECTED');return;}
     bytes=await responseBody(upstream);
    }finally{res.removeListener('close',close);}
    if(res.destroyed||res.writableEnded)return;
    const headers:Record<string,string|string[]>={'Content-Type':upstream.headers.get('content-type')||'application/json',
     'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
    const cookies=upstream.headers.getSetCookie();
    if(cookies.length){
     if(cookies.some(cookie=>!allowedCookies.has(cookie.split('=',1)[0])||/;\s*domain=/i.test(cookie)))throw Error('UNSAFE_UPSTREAM_COOKIE');
     headers['Set-Cookie']=cookies;
    }
    res.writeHead(upstream.status,headers);res.end(bytes);return;
   }
   if(!['GET','HEAD'].includes(req.method||'')){fail(res,405,'METHOD_NOT_ALLOWED');return;}
   let bytes:Buffer,type:string;
   if(url.pathname==='/factory-config.json'){bytes=Buffer.from(publicConfig);type=mime['.json'];}
   else if(url.pathname==='/jems-dev.json'){bytes=Buffer.from(siteInfo);type=mime['.json'];}
   else if(url.pathname==='/jems-dev.css'){bytes=Buffer.from(bannerStyle);type=mime['.css'];}
   else if(url.pathname==='/sw.js'){bytes=Buffer.from(noOfflineWorker);type=mime['.js'];}
   else{
    const relative=decodeURIComponent(url.pathname)==='/'?'index.html':decodeURIComponent(url.pathname).slice(1);
    let filename:string;
    try{filename=await realpath(path.join(assets,relative));}catch{fail(res,404,'NOT_FOUND');return;}
    if(!filename.startsWith(assets+path.sep)||!(await stat(filename)).isFile()){fail(res,404,'NOT_FOUND');return;}
    type=mime[path.extname(filename).toLowerCase()]||'application/octet-stream';bytes=await readFile(filename);
    if(path.extname(filename)==='.html'){
     const label=`<aside class="jems-dev-notice" aria-label="Development environment">DEV · Adults only · Synthetic test profiles <code>${info.sha.slice(0,12)}</code> <a href="${c.previewOrigin}/health" target="_blank" rel="noopener noreferrer">Open game test host</a></aside>`;
     bytes=Buffer.from(bytes.toString('utf8').replace('</head>','<link rel="stylesheet" href="/jems-dev.css"></head>').replace(/(<body\b[^>]*>)/i,'$1'+label));
    }
   }
   res.writeHead(200,{'Content-Type':type,'Content-Length':bytes.length,'Cache-Control':'private, no-store',
    'Content-Security-Policy':csp,'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
    'X-Robots-Tag':'noindex, nofollow','Permissions-Policy':'camera=(), geolocation=()'});
   res.end(req.method==='HEAD'?undefined:bytes);
  }catch(error){fail(res,(error as Error).message==='REQUEST_TOO_LARGE'?413:503,'DEV_SITE_UNAVAILABLE');}
 };
}
async function main(){
 if(!process.env.JEMS_DEV_SITE_CONFIG||!process.env.JEMS_DEV_ASSETS)throw Error('DEV_SITE_PRIVATE_CONFIG_REQUIRED');
 if(process.env.FACTORY_OPENAI_API_KEY||process.env.FACTORY_COACH_API_KEY||process.env.FACTORY_COACH_PRIVATE_OPENAI_API_KEY)
  throw Error('MODEL_KEY_FORBIDDEN_IN_DEV_SITE');
 const config=validateDevSiteConfig(JSON.parse(await readFile(process.env.JEMS_DEV_SITE_CONFIG,'utf8')));
 await assertDevProjectBinding(validateDevAccess(config.devAccess,{projectId:config.projectId,
  workspace:config.devAccess.syntheticWorkspace,familyId:config.devAccess.syntheticFamilyId,
  artifactBucket:config.projectId+'-artifacts',iapService:'jems-dev-app'}));
 const handler=await createDevSite(config,process.env.JEMS_DEV_ASSETS);
 createServer((req,res)=>void handler(req,res)).listen(Number(process.env.PORT)||8080);
}
if(process.argv.some(x=>/[/\\]dev-site\.(?:ts|mjs)$/.test(x)))void main().catch(()=>{
 console.error('DEV site startup refused; no credentials or private configuration logged.');process.exitCode=1;
});
