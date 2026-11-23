import assert from 'node:assert/strict';
import {test} from 'node:test';
import {PassThrough} from 'node:stream';
import {EventEmitter} from 'node:events';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {MemoryRepository} from '../server/pipeline/repository';
import {signSession} from '../server/pipeline/auth';
import {setOwnerCoachConsent} from '../server/coach/consent';
import {narrationHttpHandler} from '../server/coach/narration-http';
import {NarrationService,NATURAL_NARRATION_VOICE,type NarrationConfig} from '../server/coach/narration';
import {privateCoachHandler} from '../server/coach/private-executor';
const origin='https://studio.test',key='synthetic-signing-key-with-enough-entropy'.repeat(3);
const config=():NarrationConfig=>({approved:true,privacyApproved:true,providerApproved:true,parentConsentApproved:true,
 projectId:'family-game-factory-jzw',voice:NATURAL_NARRATION_VOICE,maxMicroUsd:60000,
 priceMicroUsdPerMillionChars:30_000_000,pricesReviewedAt:new Date().toISOString()});
const audio=Buffer.alloc(200);audio.write('ID3');
class ResponseFixture extends EventEmitter {
 headers:Record<string,unknown>={};statusCode=200;headersSent=false;writableEnded=false;destroyed=false;body=Buffer.alloc(0);
 setHeader(key:string,value:unknown){this.headers[key.toLowerCase()]=value;}
 writeHead(status:number,headers:Record<string,unknown>={}){this.statusCode=status;for(const [k,v] of Object.entries(headers))this.setHeader(k,v);this.headersSent=true;return this;}
 end(body?:any){this.body=Buffer.from(body??'');this.writableEnded=true;this.emit('close');return this;}
}
async function request(handler:(req:IncomingMessage,res:ServerResponse)=>Promise<unknown>,path:string,headers:Record<string,string>={},body?:unknown){
 const req=new PassThrough() as unknown as IncomingMessage;
 Object.assign(req,{url:path,method:body===undefined?'GET':'POST',headers});
 const res=new ResponseFixture();
 const pending=handler(req,res as unknown as ServerResponse);
 (req as unknown as PassThrough).end(body===undefined?'':typeof body==='string'?body:JSON.stringify(body));
 await pending;return res;
}
test('gateway narration authenticates, rejects CSRF/wrong-origin/bad body, then returns uncached MP3',async()=>{
 const repo=new MemoryRepository();const user={subject:'synthetic-parent',familyId:'narration-http',role:'parent' as const,expiresAt:Date.now()+3600000};
 await repo.transaction(s=>{s.ledgers[user.familyId]={allowance:1_000_000,used:0,reserved:0,paidEnabled:true,month:new Date().toISOString().slice(0,7)};return true;});
 await setOwnerCoachConsent(repo,user,{familyId:user.familyId,model:false,audio:false,narration:true,verifiedByAdult:true,verificationReceipt:'verified_synthetic_only',expiresAt:Date.now()+3600000});
 let calls=0;const handler=narrationHttpHandler(new NarrationService(repo,config(),{read:async()=>{calls++;return audio;}}),{appOrigin:origin,sessionKey:key},repo);
 const headers={origin,cookie:'factory_session='+signSession(user,key),'content-type':'application/json','x-factory-request':'1'};
 assert.equal((await request(handler,'/v1/coach/narration/status',{origin})).statusCode,401);
 assert.equal((await request(handler,'/v1/coach/narration/status',{...headers,origin:'https://wrong.test'})).statusCode,403);
 const status=await request(handler,'/v1/coach/narration/status',headers);assert.equal(status.statusCode,200);assert.deepEqual(JSON.parse(status.body.toString()),{available:true,mode:'natural'});assert.equal(calls,0);
 assert.equal((await request(handler,'/v1/coach/narration',{...headers,'x-factory-request':'0'},{id:'csrf-ignored',text:'Hello'})).statusCode,403);
 assert.equal((await request(handler,'/v1/coach/narration',headers,'{bad-json')).statusCode,400);
 assert.equal((await request(handler,'/v1/coach/narration',headers,{id:'bad-extra',text:'Hello',voice:'hijack'})).statusCode,400);
 assert.equal(calls,0);
 const result=await request(handler,'/v1/coach/narration',headers,{id:'real-read-fixture',text:'Hello'});
 assert.equal(result.statusCode,200);assert.equal(result.headers['cache-control'],'no-store');assert.equal(result.headers['content-type'],'audio/mpeg');assert.deepEqual(result.body,audio);assert.equal(calls,1);
 assert.equal((await request(handler,'/v1/coach/narration',headers,{id:'real-read-fixture',text:'Hello'})).statusCode,409);assert.equal(calls,1);
});
test('private narration requires exact caller verification and its own approval; never invokes chat',async()=>{
 let reads=0,chats=0;
 const handler=privateCoachHandler({config:{} as any,enabled:false,verifyCaller:async token=>token==='x'.repeat(60),
  provider:{complete:async()=>{chats++;throw Error('must not run');}},narrationConfig:config(),narration:{read:async()=>{reads++;return audio;}}});
 const headers={authorization:'Bearer '+'x'.repeat(60),'content-type':'application/json','x-factory-request':'1'};
 assert.equal((await request(handler,'/v1/private-coach/narration/status',{'x-factory-request':'1'})).statusCode,403);
 assert.equal((await request(handler,'/v1/private-coach/narration/status',{...headers,origin})).statusCode,403);
 assert.deepEqual(JSON.parse((await request(handler,'/v1/private-coach/narration/status',headers)).body.toString()),{available:true,mode:'natural'});
 assert.equal((await request(handler,'/v1/private-coach/narration',headers,{version:1,text:'Hello',voice:'hijack'})).statusCode,400);
 const result=await request(handler,'/v1/private-coach/narration',headers,{version:1,text:'Hello'});
 assert.equal(result.statusCode,200);assert.deepEqual(result.body,audio);assert.equal(reads,1);assert.equal(chats,0);
});
