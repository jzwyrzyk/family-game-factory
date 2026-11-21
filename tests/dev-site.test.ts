import test,{after,before} from 'node:test';
import assert from 'node:assert/strict';
import {createServer,request,type IncomingHttpHeaders} from 'node:http';
import {mkdtemp,mkdir,writeFile,rm,symlink} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createDevSite,validateDevSiteConfig,type DevSiteConfig} from '../server/dev-site';
import {sitePackageOutput} from '../scripts/development/package-site';

const source='a'.repeat(40),number='234567890123',region='us-east1';
const config:DevSiteConfig={version:1,environment:'development',projectId:'jems-test-dev',
 appOrigin:`https://jems-dev-app-${number}.${region}.run.app`,gatewayServiceOrigin:`https://jems-dev-gateway-${number}.${region}.run.app`,
 previewOrigin:`https://jems-dev-preview-${number}.${region}.run.app`,devAccess:{environment:'development',projectNumber:number,
  iapAudience:`/projects/${number}/locations/${region}/services/jems-dev-app`,
  allowedAdults:[{subject:'accounts.google.com:123456789012345678901',email:'tester@example.com',operatorConfirmedAdult:true}],
  syntheticDataOnly:true,syntheticFamilyId:'dev-synthetic',syntheticWorkspace:'dev-synthetic',
  workerOwner:'test-worker-lab',workerOwnerId:'987654321',maxTotalMicroUsd:5000000}};
let directory:string;const oldEnvironment=process.env.FACTORY_ENVIRONMENT;
before(async()=>{process.env.FACTORY_ENVIRONMENT='development';directory=await mkdtemp(path.join(os.tmpdir(),'jems-dev-site-'));
 await mkdir(path.join(directory,'assets'));await writeFile(path.join(directory,'assets','build-info.json'),JSON.stringify({sha:source,dirty:false}));
 await writeFile(path.join(directory,'assets','index.html'),'<!doctype html><html><head></head><body><main>Jems</main></body></html>');
 await writeFile(path.join(directory,'private.txt'),'must never be served');await symlink(path.join(directory,'private.txt'),path.join(directory,'assets','escape.txt'));
});
after(async()=>{if(oldEnvironment===undefined)delete process.env.FACTORY_ENVIRONMENT;else process.env.FACTORY_ENVIRONMENT=oldEnvironment;await rm(directory,{recursive:true,force:true});});
async function site(fetchGateway:typeof fetch=async()=>new Response('{}')){
 const handler=await createDevSite(config,path.join(directory,'assets'),{verifier:{verify:async token=>{if(token!=='verified-fixture')throw Error('DENIED');}},fetchGateway});
 const server=createServer((req,res)=>void handler(req,res));await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const port=(server.address() as {port:number}).port;
 async function call(url:string,options:{method?:string;headers?:Record<string,string>;body?:string}={}){
  return new Promise<{status:number;headers:IncomingHttpHeaders;body:string}>((resolve,reject)=>{
   const req=request({hostname:'127.0.0.1',port,path:url,method:options.method||'GET',headers:{host:new URL(config.appOrigin).host,...options.headers}},res=>{
    const parts:Buffer[]=[];res.on('data',part=>parts.push(part));res.on('end',()=>resolve({status:res.statusCode!,headers:res.headers,body:Buffer.concat(parts).toString()}));
   });req.on('error',reject);req.end(options.body);
  });
 }
 return {call,port,close:()=>new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()))};
}
const signed={'x-goog-iap-jwt-assertion':'verified-fixture'};
test('shell, configuration and assets require an approved cryptographic gate before serving',async()=>{
 const app=await site();try{
  for(const url of ['/','/factory-config.json','/build-info.json','/jems-dev.json','/sw.js']){
   const reply=await app.call(url);assert.equal(reply.status,403);assert.doesNotMatch(reply.body,/Jems|remote|sourceSha/);
  }
  assert.equal((await app.call('/',{headers:{...signed,host:'jzwyrzyk.github.io'}})).status,403);
  const page=await app.call('/',{headers:signed});assert.equal(page.status,200);assert.match(page.body,/DEV · Adults only · Synthetic test profiles/);
  assert.match(String(page.headers['cache-control']),/no-store/);assert.match(String(page.headers['content-security-policy']),/connect-src 'self'/);
  const publicConfig=await app.call('/factory-config.json',{headers:signed});assert.deepEqual(JSON.parse(publicConfig.body),{version:1,mode:'remote',apiBaseUrl:config.appOrigin,previewOrigin:config.previewOrigin});
  assert.doesNotMatch(publicConfig.body,/subject|tester@example|private|worker/);
 }finally{await app.close();}
});
test('static paths cannot escape assets and shared DEV never installs an offline auth bypass',async()=>{
 const app=await site();try{
  for(const url of ['/../private.txt','/%2e%2e/private.txt','/%252e%252e/private.txt','/.env','/escape.txt'])assert.notEqual((await app.call(url,{headers:signed})).status,200);
  const worker=await app.call('/sw.js',{headers:signed});assert.equal(worker.status,200);assert.match(worker.body,/registration\.unregister/);assert.doesNotMatch(worker.body,/addEventListener\('fetch'/);
 }finally{await app.close();}
});
test('same-origin proxy preserves Jems sessions, strips unrelated credentials and never exposes machine routes',async()=>{
 let calls=0;let observed:{url:string;options:RequestInit}|undefined;
 const app=await site(async(input,options)=>{calls++;observed={url:String(input),options:options!};return new Response('{"connected":true}',{headers:{'Content-Type':'application/json','Set-Cookie':'factory_session=next; Path=/v1; Secure; HttpOnly; SameSite=None; Partitioned'}});});
 try{
  const reply=await app.call('/v1/sessions/renew',{method:'POST',body:'{}',headers:{...signed,origin:config.appOrigin,'content-type':'application/json','x-factory-request':'1',authorization:'Bearer must-not-forward',cookie:'IAP_AUTH_TOKEN=never; factory_device=device; factory_session=session; factory_adult=adult'}});
  assert.equal(reply.status,200);assert.equal(calls,1);assert.equal(observed!.url,config.gatewayServiceOrigin+'/v1/sessions/renew');
  const headers=observed!.options.headers as Headers;assert.equal(headers.get('cookie'),'factory_device=device; factory_session=session; factory_adult=adult');assert.equal(headers.get('authorization'),null);
  assert.equal(headers.get('x-goog-iap-jwt-assertion'),'verified-fixture');assert.equal(observed!.options.redirect,'manual');assert.equal(reply.headers['set-cookie']?.length,1);
  for(const url of ['/v1/worker/claim','/v1/internal/dispatch','/v1/%77orker/claim'])assert.equal((await app.call(url,{method:'POST',headers:{...signed,origin:config.appOrigin}})).status,403);
  assert.equal(calls,1);
 }finally{await app.close();}
});
test('cross-origin and oversized POSTs stop before gateway or paid execution',async()=>{
 let calls=0;const app=await site(async()=>{calls++;return new Response('{}');});try{
  assert.equal((await app.call('/v1/jobs',{method:'POST',headers:signed,body:'{}'})).status,403);
  assert.equal((await app.call('/v1/jobs',{method:'POST',headers:{...signed,origin:'https://evil.example'},body:'{}'})).status,403);
  assert.equal((await app.call('/v1/jobs',{method:'POST',headers:{...signed,origin:config.appOrigin,'content-length':'1048577'},body:'{}'})).status,413);
  assert.equal(calls,0);
 }finally{await app.close();}
});
test('redirects, uncertain failures and response-cookie domain overrides never replay a request',async()=>{
 for(const mode of ['redirect','failure','cookie'] as const){let calls=0;const app=await site(async()=>{calls++;if(mode==='failure')throw Error('timeout');return mode==='redirect'?new Response(null,{status:307,headers:{location:'https://evil.example'}}):new Response('{}',{headers:{'Set-Cookie':'factory_session=x; Domain=evil.example; Path=/v1'}});});
  try{const reply=await app.call('/v1/jobs',{method:'POST',body:'{}',headers:{...signed,origin:config.appOrigin}});assert.equal(reply.status,mode==='redirect'?502:503);assert.equal(calls,1);assert.doesNotMatch(reply.body,/timeout|evil\.example/);}finally{await app.close();}
 }
});
test('closing a browser request cancels its upstream operation without replay',async()=>{
 let calls=0;let started!:()=>void;const pending=new Promise<void>(resolve=>{started=resolve;});
 let aborted!:()=>void;const cancelled=new Promise<void>(resolve=>{aborted=resolve;});
 const app=await site(async(_input,options)=>{calls++;started();return await new Promise<Response>((_resolve,reject)=>{
  options!.signal!.addEventListener('abort',()=>{aborted();reject(Error('cancelled'));},{once:true});
 });});
 try{
  const req=request({hostname:'127.0.0.1',port:app.port,path:'/v1/coach/audio',method:'POST',
   headers:{host:new URL(config.appOrigin).host,...signed,origin:config.appOrigin,'content-type':'audio/webm'}});
  req.on('error',()=>{});req.end('synthetic audio');await pending;req.destroy();
  await Promise.race([cancelled,new Promise((_,reject)=>setTimeout(()=>reject(Error('upstream was not cancelled')),2000).unref())]);
  assert.equal(calls,1);
 }finally{await app.close();}
});
test('disconnecting during identity verification cannot start a late gateway request',async()=>{
 let entered!:()=>void,release!:()=>void,closed!:()=>void,finished!:()=>void,calls=0;
 const verifying=new Promise<void>(resolve=>{entered=resolve;}),verified=new Promise<void>(resolve=>{release=resolve;});
 const disconnected=new Promise<void>(resolve=>{closed=resolve;}),complete=new Promise<void>(resolve=>{finished=resolve;});
 const handler=await createDevSite(config,path.join(directory,'assets'),{
  verifier:{verify:async()=>{entered();await verified;}},fetchGateway:async()=>{calls++;return new Response('{}');}});
 const server=createServer((req,res)=>{res.once('close',closed);void handler(req,res).finally(finished);});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const req=request({hostname:'127.0.0.1',port:(server.address() as {port:number}).port,path:'/v1/jobs',method:'POST',
   headers:{host:new URL(config.appOrigin).host,...signed,origin:config.appOrigin,'content-type':'application/json'}});
  req.on('error',()=>{});req.end('{}');await verifying;req.destroy();await disconnected;release();await complete;
  assert.equal(calls,0);
 }finally{release();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});
test('DEV site refuses production targets, unbound origins, dirty builds and unsafe package paths',async()=>{
 assert.throws(()=>validateDevSiteConfig({...config,gatewayServiceOrigin:'https://factory-gateway-ola734esta-ul.a.run.app'}));
 assert.throws(()=>validateDevSiteConfig({...config,appOrigin:'https://jzwyrzyk.github.io'}));
 assert.throws(()=>validateDevSiteConfig({...config,projectId:'family-game-factory-jzw'}));
 const dirty=path.join(directory,'dirty');await mkdir(dirty);await writeFile(path.join(dirty,'build-info.json'),JSON.stringify({sha:source,dirty:true}));
 await assert.rejects(createDevSite(config,dirty),/CLEAN_BUILD_REQUIRED/);
 await assert.rejects(sitePackageOutput(directory,'dist'),/DEDICATED_DIRECTORY/);
 await mkdir(path.join(directory,'.factory-deployment'));await symlink(path.join(directory,'assets'),path.join(directory,'.factory-deployment','dev-site'));
 await assert.rejects(sitePackageOutput(directory,'.factory-deployment/dev-site/test'),/SYMLINK/);
});
