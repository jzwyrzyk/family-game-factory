import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {test} from 'node:test';
import type {IncomingHttpHeaders,IncomingMessage,ServerResponse} from 'node:http';
import {readJsonBody} from '../server/http-json';
import {apiHandler} from '../server/pipeline/http';
import {coachHandler} from '../server/coach/http';
import {workerHandler} from '../server/actions/http';
import {trustedDeviceHandler} from '../server/trusted-devices';
import {sessionHandler} from '../server/sessions';
import {MemoryRepository} from '../server/pipeline/repository';
import {signSession} from '../server/pipeline/auth';
import type {CoachService} from '../server/coach/service';
import type {JobService} from '../server/pipeline/service';
import type {ActionCoordinator} from '../server/actions/coordinator';
import type {WorkerIdentity} from '../server/actions/identity';
import {chunks,ResponseRecorder,streamedRequest} from './http-stream-fixture';

const unicode='Café, 日本語, e\u0301, a dragon 🐉 and a puzzle 🧩';
const origin='https://studio.test',familyId='body-fixture-family';
const sessionKey='synthetic-body-fixture-signing-key-with-sufficient-length';
const session={subject:'synthetic-parent',familyId,role:'parent' as const,expiresAt:Date.now()+600000};
const headers={origin,cookie:'factory_session='+signSession(session,sessionKey),
 'content-type':'application/json','x-factory-request':'1'};
type Handler=(request:IncomingMessage,response:ServerResponse)=>Promise<unknown>;
async function invoke(handler:Handler,path:string,body:Uint8Array[],requestHeaders:IncomingHttpHeaders=headers,method='POST'){
 const response=new ResponseRecorder();
 await handler(streamedRequest(path,chunks(...body),requestHeaders,method),response.response());
 return response;
}
function splitEmoji(value:unknown){
 const body=Buffer.from(JSON.stringify(value)),split=body.indexOf(Buffer.from('🐉'))+2;
 assert.ok(split>2);
 return [body.subarray(0,split),body.subarray(split)];
}
function padded(value:unknown,size:number){
 const json=Buffer.from(JSON.stringify(value));
 assert.ok(json.byteLength<=size);
 return Buffer.concat([json,Buffer.alloc(size-json.byteLength,0x20)]);
}

test('JSON body: preserve two-, three-, four-byte and combining characters at every byte split',async()=>{
 const value={message:unicode},body=Buffer.from(JSON.stringify(value));
 for(let split=1;split<body.byteLength;split++)
  assert.deepEqual(await readJsonBody(chunks(body.subarray(0,split),body.subarray(split)),body.byteLength),value,`split ${split}`);
 assert.deepEqual(await readJsonBody(chunks(...Array.from(body,byte=>Uint8Array.of(byte))),body.byteLength),value);
});

test('JSON body: enforce actual bytes at the inclusive limit and stop before reading the remainder',async()=>{
 const body=Buffer.from(JSON.stringify({message:unicode}));
 assert.ok(body.byteLength>body.toString('utf8').length);
 assert.deepEqual(await readJsonBody(chunks(body),body.byteLength),{message:unicode});
 await assert.rejects(readJsonBody(chunks(body),body.byteLength-1),/^Error: INVALID_REQUEST$/);
 let readRemainder=false,closed=false;
 async function* tooLarge(){try{yield body;readRemainder=true;yield Buffer.alloc(20);}finally{closed=true;}}
 await assert.rejects(readJsonBody(tooLarge(),body.byteLength-1,{limitError:'BODY_LIMIT'}),/^Error: BODY_LIMIT$/);
 assert.equal(readRemainder,false);assert.equal(closed,true);
});

test('JSON body: retain explicit empty-body and malformed-input policies, and propagate stream failure',async()=>{
 assert.deepEqual(await readJsonBody(chunks(),20,{emptyObject:true}),{});
 await assert.rejects(readJsonBody(chunks(),20),SyntaxError);
 await assert.rejects(readJsonBody(chunks(Buffer.from('{')),20,{invalidJsonError:'INVALID_REQUEST'}),/^Error: INVALID_REQUEST$/);
 const disconnected=Error('synthetic body disconnect');
 async function* aborted(){yield Buffer.from('{');throw disconnected;}
 await assert.rejects(readJsonBody(aborted(),20,{invalidJsonError:'INVALID_REQUEST'}),error=>error===disconnected);
});

test('coach, pipeline and authenticated worker routes preserve split UTF-8 fields',async()=>{
 const seen:unknown[]=[];
 const model=coachHandler({respond:async(_session:unknown,input:unknown)=>{seen.push(input);return {ok:true};}} as unknown as CoachService,{appOrigin:origin,sessionKey});
 const jobs=apiHandler({registerBase:async(_session:unknown,input:unknown)=>{seen.push(input);return {ok:true};}} as unknown as JobService,
  {appOrigin:origin,sessionKey,previewKey:sessionKey,previewOrigin:'https://preview.test'});
 const worker=workerHandler({report:async(_id:unknown,_attempt:unknown,_stage:unknown,_identity:unknown,input:unknown)=>{seen.push(input);return {ok:true};}} as unknown as ActionCoordinator,
  {verify:async()=>({} as WorkerIdentity)});
 const coachBody={requestId:'utf8-turn',context:{message:unicode}},jobBody={prompt:unicode},report={notes:unicode};
 assert.equal((await invoke(model,'/v1/coach',splitEmoji(coachBody))).statusCode,200);
 assert.equal((await invoke(jobs,'/v1/revisions',splitEmoji(jobBody))).statusCode,200);
 assert.equal((await invoke(worker,'/v1/worker/jobs/fixture/report',splitEmoji({attempt:1,stage:'review',report}),
  {...headers,authorization:'Bearer synthetic-worker-token'})).statusCode,200);
 assert.deepEqual(seen,[coachBody,jobBody,report]);
});

async function deviceFixture(){
 const repo=new MemoryRepository(),invitation='i'.repeat(43);
 await repo.transaction(state=>{state.invitations=[{hash:createHash('sha256').update(invitation).digest('hex'),familyId,
  expiresAt:Date.now()+600000,used:false}];return true;});
 return {repo,invitation,config:{appOrigin:origin,familyId,sessionKey}};
}

test('trusted-device enrollment preserves a split UTF-8 name and passphrase',async()=>{
 const {repo,invitation,config}=await deviceFixture();
 const name='Café 🐉 日本語',passphrase='Synthetic 🐉 passphrase';
 const response=await invoke(trustedDeviceHandler(repo,config),'/v1/sessions/enroll',
  splitEmoji({invitation,deviceName:name,parentPassphrase:passphrase}));
 assert.equal(response.statusCode,200);
 assert.equal((await repo.snapshot()).devices?.[0].name,name);
 // The same bytes must still unlock the newly enrolled parent's account.
 const cookies=(response.headers['set-cookie'] as string[]).map(cookie=>cookie.split(';')[0]).join('; ');
 const unlocked=await invoke(trustedDeviceHandler(repo,config),'/v1/devices/unlock',
  splitEmoji({parentPassphrase:passphrase}),{...headers,cookie:cookies});
 assert.equal(unlocked.statusCode,200);
});

test('gateway JSON routes keep their byte caps and public rejection codes',async()=>{
 const model=coachHandler({respond:async()=>({ok:true}),eraseFamilyReceipts:async()=>({erased:0})} as unknown as CoachService,{appOrigin:origin,sessionKey});
 const jobs=apiHandler({registerBase:async()=>({ok:true})} as unknown as JobService,
  {appOrigin:origin,sessionKey,previewKey:sessionKey,previewOrigin:'https://preview.test'});
 const worker=workerHandler({report:async()=>({ok:true})} as unknown as ActionCoordinator,{verify:async()=>({} as WorkerIdentity)});
 const routes=[
  {handler:model,path:'/v1/coach',body:{message:unicode},limit:50000,status:400,code:'INVALID_REQUEST',headers},
  {handler:model,path:'/v1/coach/erase',body:{confirm:'ERASE_FAMILY_COACH_RECEIPTS'},limit:1024,status:400,code:'INVALID_REQUEST',headers},
  {handler:jobs,path:'/v1/revisions',body:{prompt:unicode},limit:12000,status:400,code:'REQUEST_REJECTED',headers},
  {handler:worker,path:'/v1/worker/jobs/fixture/report',body:{attempt:1,stage:'review',report:{notes:unicode}},
   limit:10*1024*1024,status:403,code:'WORKER_REQUEST_REJECTED',headers:{...headers,authorization:'Bearer synthetic-worker-token'}}
 ];
 for(const route of routes){
  assert.equal((await invoke(route.handler,route.path,[padded(route.body,route.limit)],route.headers)).statusCode,200,route.path+' exact limit');
  const overflow=await invoke(route.handler,route.path,[padded(route.body,route.limit),Buffer.from(' ')],route.headers);
  assert.equal(overflow.statusCode,route.status,route.path);assert.deepEqual(overflow.json(),{errorCode:route.code},route.path);
 }
 for(const legacy of [false,true])for(const extra of [0,1]){
  const {repo,invitation,config}=await deviceFixture(),limit=legacy?1000:2048;
  const body=legacy?{invitation}:{invitation,deviceName:'🐉 tablet',parentPassphrase:'Synthetic parent phrase'};
  const response=await invoke(legacy?sessionHandler(repo,config):trustedDeviceHandler(repo,config),
   legacy?'/v1/sessions':'/v1/sessions/enroll',[padded(body,limit+extra)]);
  assert.equal(response.statusCode,extra?(legacy?403:400):200);
  assert.equal((await repo.snapshot()).invitations?.[0].used,!extra,'oversized bodies cannot consume invitations');
  if(extra)assert.deepEqual(response.json(),{errorCode:legacy?'INVALID_INVITATION':'INVALID_REQUEST'});
 }
});

test('gateway parsing retains malformed/empty responses and authenticates before reading',async()=>{
 let calls=0;
 const model=coachHandler({respond:async()=>{calls++;return {};},eraseFamilyReceipts:async()=>{calls++;return {};}} as unknown as CoachService,{appOrigin:origin,sessionKey});
 const jobs=apiHandler({registerBase:async(_session:unknown,input:unknown)=>{assert.deepEqual(input,{});calls++;return {};}} as JobService,
  {appOrigin:origin,sessionKey,previewKey:sessionKey,previewOrigin:'https://preview.test'});
 const worker=workerHandler({status:async()=>{calls++;return {};}} as unknown as ActionCoordinator,{verify:async()=>({} as WorkerIdentity)});
 assert.deepEqual((await invoke(model,'/v1/coach',[Buffer.from('{')])).json(),{errorCode:'COACH_UNAVAILABLE'});
 assert.deepEqual((await invoke(model,'/v1/coach/erase',[])).json(),{errorCode:'INVALID_REQUEST'});
 assert.deepEqual((await invoke(jobs,'/v1/revisions',[Buffer.from('{')])).json(),{errorCode:'REQUEST_REJECTED'});
 assert.equal(calls,0);
 assert.equal((await invoke(jobs,'/v1/revisions',[])).statusCode,200);
 assert.equal((await invoke(worker,'/v1/worker/jobs/fixture/status',[],{...headers,authorization:'Bearer synthetic-worker-token'},'GET')).statusCode,200);
 const {repo,config}=await deviceFixture();
 for(const [handler,path] of [[model,'/v1/coach'],[jobs,'/v1/revisions'],[worker,'/v1/worker/jobs/fixture/report'],
  [sessionHandler(repo,config),'/v1/sessions'],[trustedDeviceHandler(repo,config),'/v1/sessions/enroll']] as const){
  let read=false;
  async function* unread(){read=true;yield Buffer.from('{}');}
  const response=new ResponseRecorder();
  await handler(streamedRequest(path,unread(),{'content-type':'application/json','x-factory-request':'1',origin:'https://untrusted.test'}),response.response());
  assert.ok(response.statusCode>=400,path);assert.equal(read,false,path+' must reject before reading the body');
 }
 assert.equal(calls,2);
});
