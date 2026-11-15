import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer,request as httpRequest} from 'node:http';
import {loadGatewayConfig} from '../server/private-config';
import {startBootstrap} from '../server/bootstrap';
import {createPreview} from '../server/preview-server';

test('gateway resolves separate RSA PEM mount, preserves inline compatibility and rejects ambiguous sources',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'factory-config-test-'));
 try{
  const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});const pem=privateKey.export({type:'pkcs8',format:'pem'}).toString();
  const key=join(dir,'key.pem'),config=join(dir,'config.json');await writeFile(key,pem,{mode:0o600});
  await writeFile(config,JSON.stringify({githubPrivateKeyFile:key,active:false}));
  assert.equal((await loadGatewayConfig(config)).githubPrivateKey,pem);
  await writeFile(config,JSON.stringify({githubPrivateKey:pem}));assert.equal((await loadGatewayConfig(config)).githubPrivateKey,pem);
  await writeFile(config,JSON.stringify({githubPrivateKey:pem,githubPrivateKeyFile:key}));await assert.rejects(loadGatewayConfig(config),/AMBIGUOUS/);
  await writeFile(config,JSON.stringify({githubPrivateKeyFile:'relative.pem'}));await assert.rejects(loadGatewayConfig(config),/INVALID/);
  await writeFile(config,JSON.stringify({githubPrivateKeyFile:join(dir,'missing.pem')}));await assert.rejects(loadGatewayConfig(config));
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('preview readiness probes persistence and exposes no private content; wrong host/capability fails closed',async()=>{
 assert.throws(()=>createPreview({previewOrigin:'https://preview.example',previewKey:'p'.repeat(48),projectId:'fixture',workspace:'family-001',sessionKey:'must-never-mount'} as any,{snapshot:async()=>{throw Error('must not read')}}),/GATEWAY_SECRETS/);
 let fail=false,reads=0;
 const handler=createPreview({previewOrigin:'https://preview.example',previewKey:'p'.repeat(48),projectId:'fixture',workspace:'family-001'}, {snapshot:async()=>{reads++;if(fail)throw Error('sensitive database diagnostic');return {version:1,jobs:[],revisions:[],active:{},ledgers:{},audit:[]};}});
 const server=createServer((req,res)=>{void handler(req,res)});await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const address=server.address() as {port:number},url='http://127.0.0.1:'+address.port;
 try{
  const request=(path:string,host='preview.example')=>new Promise<{status:number;headers:Record<string,any>;text:string;json:any}>((resolve,reject)=>{const req=httpRequest(url+path,{headers:{Host:host}},res=>{let text='';res.on('data',chunk=>text+=chunk);res.on('end',()=>resolve({status:res.statusCode!,headers:res.headers,text,json:text.startsWith('{')?JSON.parse(text):null}));});req.on('error',reject);req.end();});
  const ready=await request('/health');assert.equal(ready.status,200);assert.deepEqual(ready.json,{ready:true,paidExecution:false});assert.equal(ready.headers['cache-control'],'no-store');
  fail=true;const unavailable=await request('/health');assert.equal(unavailable.status,503);assert.equal(unavailable.text.includes('sensitive'),false);
  const before=reads;assert.equal((await request('/health','gateway.example')).status,403);assert.equal(reads,before);
  assert.equal((await request('/preview/private?cap=invalid')).status,403);
 }finally{await new Promise<void>(r=>server.close(()=>r()));}
});

test('URL bootstrap starts with no private config and exposes status only',async()=>{
 const server=startBootstrap(0);await new Promise<void>(r=>server.once('listening',r));
 const url='http://127.0.0.1:'+(server.address() as {port:number}).port;
 try{
  const health=await fetch(url+'/health');assert.equal(health.status,200);assert.deepEqual(await health.json(),{ready:false,bootstrap:true,paidExecution:false});
  for(const path of ['/v1/sessions','/v1/worker/job/claim','/preview/revision'])assert.equal((await fetch(url+path,{method:'POST'})).status,503);
 }finally{await new Promise<void>(r=>server.close(()=>r()));}
});
