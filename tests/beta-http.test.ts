import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {createServer,request} from 'node:http';
import type {AddressInfo} from 'node:net';
import {betaFixture,fixtureKey,parent} from './beta-fixture';
import {familyOrigin} from '../server/beta/model';
import {betaRouter} from '../server/beta/router';
import {trustedDeviceHandler} from '../server/trusted-devices';
import {apiHandler} from '../server/pipeline/http';
import {JobService} from '../server/pipeline/service';

test('first-party API protects real revision and job identifiers on read, change, cancel, enrollment and renewal',async()=>{
 const {d,enroll,mutate}=await betaFixture(),a=await enroll('api-family-a'),b=await enroll('api-family-b');
 const revision=randomUUID(),job=randomUUID();
 await d.repository(a.id).transaction(s=>{
  s.revisions.push({id:revision,familyId:a.id,projectId:'mine',parentId:null,game:{kind:'star-catcher-v1',target:5,seconds:15}});
  s.jobs.push({id:job,familyId:a.id,status:'ready',gameId:'mine',baseRevisionId:null,prompt:'synthetic',clientRequestId:randomUUID(),adapter:'metered-api',maxUnits:500,usedUnits:0,retryCount:0});
 });
 const route=betaRouter(d,fixtureKey,{runtime:async id=>{
  const appOrigin=familyOrigin(d.config,id),repo=d.repository(id),service=new JobService(repo,{kind:'metered-api',available:false,generate:async()=>{throw Error();}},{test:async()=>{throw Error();}});
  const api=apiHandler(service,{appOrigin,previewOrigin:'https://games.example',sessionKey:fixtureKey,previewKey:'synthetic-preview-key-for-fixture-only'},repo);
  const devices=trustedDeviceHandler(repo,{familyId:id,sessionKey:fixtureKey,appOrigin,firstParty:true});
  return (req,res)=>/^\/v1\/(?:devices|sessions)/.test(req.url!)?devices(req,res):api(req,res);
 }});
 const server=createServer((req,res)=>{void route(req,res);});await new Promise<void>(ok=>server.listen(0,'127.0.0.1',ok));
 const port=(server.address() as AddressInfo).port;
 const call=(family:typeof a,path:string,body?:unknown,cookie=family.cookies)=>new Promise<{status:number;json:any;cookie:string[]}>((ok,fail)=>{
  const host=new URL(familyOrigin(d.config,family.id)).host,req=request({host:'127.0.0.1',port,path,method:body===undefined?'GET':'POST',headers:{
   Host:host,Cookie:cookie,Origin:'https://'+host,'X-Factory-Request':'1','Content-Type':'application/json'}},res=>{
   const chunks:Buffer[]=[];res.on('data',b=>chunks.push(b));res.on('end',()=>ok({status:res.statusCode!,json:JSON.parse(Buffer.concat(chunks).toString()),cookie:res.headers['set-cookie']??[]}));
  });req.on('error',fail);req.end(body===undefined?'':JSON.stringify(body));
 });
 try{
  assert.equal((await call(a,'/v1/revisions/'+revision)).status,200);
  for(const [path,payload] of [['/v1/revisions/'+revision,undefined],['/v1/revisions/'+revision+'/keep',{}],['/v1/revisions/'+revision+'/fork',{name:'change'}],['/v1/jobs/'+job,undefined],['/v1/jobs/'+job+'/cancel',{}]] as const)assert.ok((await call(b,path,payload)).status>=400);
  assert.ok((await call(b,'/v1/creations',undefined,a.cookies)).status>=400);assert.deepEqual((await call(b,'/v1/creations')).json,[]);
  assert.ok((await call(a,'/v1/sessions/adult/unlock',{passphrase:parent})).status>=400);
  const unlocked=await call(a,'/v1/devices/unlock',{parentPassphrase:parent});assert.equal(unlocked.status,200);
  const cookie=a.cookies+'; '+unlocked.cookie.map(v=>v.split(';')[0]).join('; ');
  const added=await call(a,'/v1/devices/invite',{},cookie);assert.equal(added.status,200);
  const payload={invitation:added.json.invitation,parentPassphrase:parent,deviceName:'Synthetic tablet'};
  assert.ok((await call(b,'/v1/sessions/enroll',payload,'')).status>=400);
  const paired=await call(a,'/v1/sessions/enroll',payload,'');assert.equal(paired.status,200);
  const fresh=paired.cookie.map(v=>v.split(';')[0]).join('; ');
  assert.ok((await call(b,'/v1/sessions/renew',{},fresh)).status>=400);
  assert.equal((await call(a,'/v1/sessions/renew',{},fresh)).status,200);
  await mutate('suspend',a.id);assert.ok((await call(a,'/v1/revisions/'+revision)).status>=400);
  assert.equal((await d.repository(a.id).snapshot()).jobs[0].status,'ready');
 }finally{server.closeAllConnections();await new Promise<void>(ok=>server.close(()=>ok()));}
});
