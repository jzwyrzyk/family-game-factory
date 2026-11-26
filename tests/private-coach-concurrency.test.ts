import assert from 'node:assert/strict';
import {test} from 'node:test';
import {setImmediate} from 'node:timers/promises';
import {privateCoachHandler,type PrivateCoachRuntime} from '../server/coach/private-executor';
import type {CoachContext} from '../src/studio/design';
import {chunks,deferred,delayedBody,ResponseRecorder,streamedRequest} from './http-stream-fixture';

const proof='x'.repeat(80);
const headers={'content-type':'application/json','x-factory-request':'1',authorization:'Bearer '+proof};
const context:CoachContext={message:'A dragon 🐉 jumps over Café 日本語',mode:'discuss',game:'dragon',plan:{},
 friction:'',helpLevel:0,support:'brief',conversation:[],observations:[],tests:[]};
const reply={move:'clarify',text:'Jumping with the dragon.',question:'What happens when it lands?',
 suggestions:[],proposedChange:null,planSuggestions:[],childDecisions:[],evidenceIds:[]};
const result={reply,usedMicroUsd:21};
const textBody=Buffer.from(JSON.stringify({version:1,context}));
const audio=Buffer.alloc(200);audio.write('OggS');
const audioBody=Buffer.from(JSON.stringify({version:1,audio:audio.toString('base64'),mime:'audio/ogg'}));
function runtime(overrides:Partial<PrivateCoachRuntime>={}):PrivateCoachRuntime{
 return {enabled:true,verifyCaller:async token=>token===proof,
  config:{enabled:true,privacyApproved:true,moderationApproved:true,zdrVerified:true,privateExecutionApproved:true,
   model:'fixture-model',apiKey:'synthetic-private-key-fixture',maxInputChars:16000,maxOutputTokens:600,
   maxTurnMicroUsd:10000,inputMicroUsdPerMillion:1,outputMicroUsdPerMillion:2,pricesReviewedAt:new Date().toISOString()},
  provider:{complete:async()=>result},audio:{transcribe:async()=>'The dragon jumps.'},
  audioConfig:{approved:true,privacyApproved:true,providerApproved:true,parentConsentApproved:true,
   projectId:'synthetic-fixture-project',maxMicroUsd:18000,pricesReviewedAt:new Date().toISOString()},...overrides};
}
type Handler=ReturnType<typeof privateCoachHandler>;
function begin(handler:Handler,body:AsyncIterable<Uint8Array>,isAudio=false,requestHeaders=headers){
 const response=new ResponseRecorder();
 const done=handler(streamedRequest('/v1/private-coach/'+(isAudio?'audio':'complete'),body,requestHeaders),response.response());
 return {response,done};
}
async function request(handler:Handler,body=textBody,isAudio=false){
 const pending=begin(handler,chunks(body),isAudio);await pending.done;return pending.response;
}

test('private coach: delayed bodies cannot oversubscribe the default four provider slots',{timeout:5000},async()=>{
 const release=deferred(),entered=deferred();
 let active=0,peak=0,calls=0;
 const handler=privateCoachHandler(runtime({provider:{complete:async()=>{
  calls++;active++;peak=Math.max(peak,active);if(calls===4)entered.resolve();
  try{await release.promise;return result;}finally{active--;}
 }}}));
 const bodies=Array.from({length:6},()=>delayedBody());
 const pending=bodies.map(body=>begin(handler,body.stream));
 try{
  await Promise.all(bodies.map(body=>body.started));
  assert.equal(calls,0);
  for(const body of bodies)body.resolve(textBody);
  await entered.promise;await setImmediate();
  assert.equal(calls,4);assert.equal(peak,4);
  assert.equal(pending.filter(item=>item.response.statusCode===429).length,2);
  for(const item of pending.filter(item=>item.response.statusCode===429))assert.deepEqual(item.response.json(),{errorCode:'RATE_LIMIT'});
 }finally{release.resolve();await Promise.all(pending.map(item=>item.done));}
 assert.equal(pending.filter(item=>item.response.statusCode===200).length,4);
 assert.equal((await request(handler)).statusCode,200,'completed calls release their slots');
});

test('private coach: text and audio acquire the same configured slots after delayed bodies',{timeout:5000},async()=>{
 const release=deferred(),entered=deferred();
 let active=0,peak=0;const kinds:string[]=[];
 async function provider(kind:string){
  kinds.push(kind);active++;peak=Math.max(peak,active);if(kinds.length===2)entered.resolve();
  try{await release.promise;}finally{active--;}
 }
 const handler=privateCoachHandler(runtime({maxConcurrent:2,
  provider:{complete:async()=>{await provider('text');return result;}},
  audio:{transcribe:async()=>{await provider('audio');return 'The dragon jumps.';}}}));
 const bodies=Array.from({length:4},()=>delayedBody());
 const pending=bodies.map((body,index)=>begin(handler,body.stream,index%2===1));
 try{
  await Promise.all(bodies.map(body=>body.started));
  bodies.forEach((body,index)=>body.resolve(index%2===1?audioBody:textBody));
  await entered.promise;await setImmediate();
  assert.deepEqual(kinds,['text','audio']);assert.equal(peak,2);
  assert.equal(pending.filter(item=>item.response.statusCode===429).length,2);
 }finally{release.resolve();await Promise.all(pending.map(item=>item.done));}
 assert.equal((await request(handler,audioBody,true)).statusCode,200);
 assert.equal((await request(handler)).statusCode,200);
});

test('private coach: unread, malformed and disconnected bodies do not consume or free provider slots',{timeout:5000},async()=>{
 const entered=deferred(),release=deferred();let calls=0;
 const handler=privateCoachHandler(runtime({maxConcurrent:1,provider:{complete:async()=>{
  calls++;entered.resolve();await release.promise;return result;
 }}}));
 const malformed=delayedBody(),aborted=delayedBody(),closed=delayedBody();
 const pending=[begin(handler,malformed.stream),begin(handler,aborted.stream),begin(handler,closed.stream)];
 await Promise.all([malformed.started,aborted.started,closed.started]);
 const valid=begin(handler,chunks(textBody));
 try{
  await entered.promise;assert.equal(calls,1,'unfinished bodies cannot monopolize provider slots');
  malformed.resolve(Buffer.from('{'));aborted.reject(Error('synthetic body disconnect'));
  pending[2].response.disconnect();closed.resolve(textBody);
  await Promise.all(pending.map(item=>item.done));
  assert.equal(pending[0].response.statusCode,400);assert.deepEqual(pending[0].response.json(),{errorCode:'INVALID_REQUEST'});
  assert.equal(pending[1].response.statusCode,503);assert.equal(pending[2].response.body,'');
  assert.equal(calls,1,'closed response cannot start provider work');
  assert.equal((await request(handler)).statusCode,429,'failed bodies cannot decrement an occupied slot');
 }finally{release.resolve();await valid.done;}
 assert.equal((await request(handler)).statusCode,200);assert.equal(calls,2);
});

test('private coach: disconnect during a provider call aborts it and releases the slot',{timeout:5000},async()=>{
 const entered=deferred();let calls=0,aborted=false;
 const handler=privateCoachHandler(runtime({maxConcurrent:1,provider:{complete:async(_context,signal)=>{
  calls++;
  if(calls===1)await new Promise<void>((_resolve,reject)=>{
   signal.addEventListener('abort',()=>{aborted=true;reject(signal.reason);},{once:true});entered.resolve();
  });
  return result;
 }}}));
 const pending=begin(handler,chunks(textBody));await entered.promise;
 pending.response.disconnect();await pending.done;
 assert.equal(aborted,true);assert.equal(pending.response.body,'');
 assert.equal((await request(handler)).statusCode,200);assert.equal(calls,2);
});

test('private coach: provider failures and invalid output release text and audio slots',async()=>{
 for(const kind of ['text-failure','text-output','text-usage','audio-failure','audio-empty']){
  let calls=0;
  const isAudio=kind.startsWith('audio');
  const handler=privateCoachHandler(runtime({maxConcurrent:1,
   provider:{complete:async()=>{
    if(++calls>1)return result;
    if(kind==='text-failure')throw Error('synthetic provider failure');
    return kind==='text-usage'?{...result,usedMicroUsd:-1}:{...result,reply:{...reply,text:'x'.repeat(1801)}};
   }},
   audio:{transcribe:async()=>{
    if(++calls>1)return 'The dragon jumps.';
    if(kind==='audio-failure')throw Error('synthetic speech failure');
    return '';
   }}}));
  assert.equal((await request(handler,isAudio?audioBody:textBody,isAudio)).statusCode,kind==='audio-empty'?422:503,kind);
  assert.equal((await request(handler,isAudio?audioBody:textBody,isAudio)).statusCode,200,kind);
  assert.equal(calls,2,kind);
 }
});

test('private coach: preserve split UTF-8, both raw-byte caps and identity checks before body consumption',async()=>{
 let calls=0;
 const handler=privateCoachHandler(runtime({provider:{complete:async received=>{
  calls++;assert.deepEqual(received,context);return result;
 }},audio:{transcribe:async received=>{calls++;assert.deepEqual(Buffer.from(received),audio);return 'The dragon jumps.';}}}));
 const split=textBody.indexOf(Buffer.from('🐉'))+2;
 const unicode=begin(handler,chunks(textBody.subarray(0,split),textBody.subarray(split)));await unicode.done;
 assert.equal(unicode.response.statusCode,200);
 for(const isAudio of [false,true]){
  const body=isAudio?audioBody:textBody,limit=isAudio?440000:40000;
  const bounded=Buffer.concat([body,Buffer.alloc(limit-body.byteLength,0x20)]);
  assert.equal((await request(handler,bounded,isAudio)).statusCode,200);
  const overflow=begin(handler,chunks(bounded,Buffer.from(' ')),isAudio);await overflow.done;
  assert.equal(overflow.response.statusCode,400);assert.deepEqual(overflow.response.json(),{errorCode:'INVALID_REQUEST'});
 }
 assert.equal(calls,3);
 let read=false;
 async function* unread(){read=true;yield textBody;}
 const denied=begin(handler,unread(),false,{...headers,authorization:'Bearer '+'z'.repeat(80)});await denied.done;
 assert.equal(denied.response.statusCode,403);assert.equal(read,false);assert.equal(calls,3);
});


test('private coach: unread narration cannot monopolize or release an active text slot',{timeout:5000},async()=>{
 const entered=deferred(),release=deferred();let textCalls=0,narrationCalls=0;
 const mp3=Buffer.alloc(200);mp3.write('ID3');
 const handler=privateCoachHandler(runtime({maxConcurrent:1,
  provider:{complete:async()=>{textCalls++;entered.resolve();await release.promise;return result;}},
  narrationConfig:{approved:true,privacyApproved:true,providerApproved:true,parentConsentApproved:true,projectId:'synthetic-fixture-project',voice:'en-US-Chirp3-HD-Aoede',maxMicroUsd:60000,priceMicroUsdPerMillionChars:30_000_000,pricesReviewedAt:new Date().toISOString()},
  narration:{read:async()=>{narrationCalls++;return mp3;}}}));
 const startNarration=(body:AsyncIterable<Uint8Array>)=>{
  const response=new ResponseRecorder();
  return {response,done:handler(streamedRequest('/v1/private-coach/narration',body,headers),response.response())};
 };
 const malformed=delayedBody(),valid=delayedBody(),body=Buffer.from(JSON.stringify({version:1,text:'Hello.'}));
 const waiting=[startNarration(malformed.stream),startNarration(valid.stream)];
 await Promise.all([malformed.started,valid.started]);
 const textRequest=begin(handler,chunks(textBody));
 try{
  await entered.promise;assert.equal(textCalls,1,'unread narration does not acquire a provider slot');
  malformed.resolve(Buffer.from('{'));valid.resolve(body);await Promise.all(waiting.map(item=>item.done));
  assert.equal(waiting[0].response.statusCode,400);assert.equal(waiting[1].response.statusCode,429);
  assert.equal(narrationCalls,0);assert.equal((await request(handler)).statusCode,429,'rejected narration never releases the text slot');
 }finally{release.resolve();await textRequest.done;}
 const narration=startNarration(chunks(body));await narration.done;
 assert.equal(narration.response.statusCode,200);assert.equal(narrationCalls,1);
});

import {generateKeyPair,SignJWT} from 'jose';
import {googleCallerVerifier} from '../server/coach/private-executor';
import {testCoachOrigin,testGatewayPrincipal,testHouseholdPrincipal} from '../server/coach/test-identity';
import {syntheticCoachReply,syntheticCoachContext,requireSyntheticContext} from '../server/coach/synthetic-scenario';

test('TEST authenticated synthetic coach cannot invoke the funded handler or receive family content',async()=>{
 const {publicKey,privateKey}=await generateKeyPair('RS256');
 const env={K_SERVICE:'jems-test-coach',JEMS_TEST_PROJECT_NUMBER:'1092405124984',JEMS_TEST_FUNDED_HOUSEHOLD:'true',
  JEMS_TEST_TRIAL_AUTHORIZATION_SHA256:'a'.repeat(64),JEMS_TEST_TRIAL_EXPIRES_AT:new Date(Date.now()+50000).toISOString()};
 const audience=testCoachOrigin(env),verified=(account:string,scope=env)=>googleCallerVerifier(audience,account,scope,async()=>publicKey);
 const sign=(account:string,aud=audience)=>new SignJWT({email:account,email_verified:true}).setProtectedHeader({alg:'RS256'}).setIssuer('https://accounts.google.com').setAudience(aud).setIssuedAt().setExpirationTime('5m').sign(privateKey);
 const token=await sign(testGatewayPrincipal),paidToken=await sign(testHouseholdPrincipal);
 let calls=0;
 const handler=privateCoachHandler(runtime({verifyCaller:verified(testHouseholdPrincipal),syntheticCaller:verified(testGatewayPrincipal),provider:{complete:async()=>{calls++;return result;}}}));
 const hit=async(path:string,body:unknown,bearer:string)=>{
  const response=new ResponseRecorder();
  await handler(streamedRequest(path,chunks(Buffer.from(JSON.stringify(body))),{...headers,authorization:'Bearer '+bearer}),response.response());
  return response;
 };
 const scenario={version:1,scenario:'moon-hopper'},path='/v1/private-coach/synthetic';
 assert.deepEqual((await hit(path,scenario,token)).json(),{reply:syntheticCoachReply,usedMicroUsd:0});
 assert.notEqual((await hit(path,{...scenario,context},token)).statusCode,200);
 assert.notEqual((await hit(path,scenario,paidToken)).statusCode,200);
 assert.notEqual((await hit(path,scenario,await sign(testGatewayPrincipal,'https://other.example'))).statusCode,200);
 assert.notEqual((await hit('/v1/private-coach/complete',{version:1,context},token)).statusCode,200);
 assert.equal(calls,0);
 assert.ok(!await verified(testHouseholdPrincipal,{...env,JEMS_TEST_TRIAL_EXPIRES_AT:new Date(Date.now()-1000).toISOString()})(paidToken));
 requireSyntheticContext(syntheticCoachContext);
 assert.throws(()=>requireSyntheticContext({...syntheticCoachContext,conversation:[{role:'child',text:'Private'}]}),/INVALID_REQUEST/);
});
