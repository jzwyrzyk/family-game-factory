import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {test,type TestContext} from 'node:test';
import {GitHubDispatcher} from '../server/actions/dispatcher';
import {installationTokenProvider} from '../server/actions/app-token';

const sha='a'.repeat(40),config={enabled:true,repository:'fixture/private-worker',workflow:'private.yml',approvedSha:sha,privateWorker:true};
const timeout=()=>new DOMException('Synthetic GitHub deadline','TimeoutError');
function deferred<T=void>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return {promise,resolve};}
function deadlines(t:TestContext){
 const scheduled:{ms:number;controller:AbortController}[]=[];
 t.mock.method(AbortSignal,'timeout',(ms:number)=>{const controller=new AbortController();scheduled.push({ms,controller});return controller.signal;});
 return (ms:number)=>{const entry=[...scheduled].reverse().find(item=>item.ms===ms&&!item.controller.signal.aborted);assert.ok(entry);entry.controller.abort(timeout());};
}
function hung<T>(signal:AbortSignal|undefined|null):Promise<T>{
 assert.ok(signal);
 return new Promise((_resolve,reject)=>{if(signal.aborted)reject(signal.reason);else signal.addEventListener('abort',()=>reject(signal.reason),{once:true});});
}

test('one dispatch deadline covers token, tag, protected head and dispatch without transport retries',async t=>{
 const expire=deadlines(t);
 for(const phase of ['token','tag','head','dispatch']){
  const started=deferred();let posts=0,calls=0;
  const transport:typeof fetch=async(input,init)=>{
   calls++;const url=String(input),kind=init?.method==='POST'?'dispatch':url.includes('/tags/')?'tag':'head';
   assert.equal(init?.redirect,'error');if(kind==='dispatch')posts++;
   if(kind===phase){started.resolve();return hung<Response>(init?.signal);}
   return kind==='dispatch'?new Response(null,{status:204}):new Response(JSON.stringify({object:{type:'commit',sha}}));
  };
  const dispatcher=new GitHubDispatcher(config,async signal=>{
   if(phase==='token'){started.resolve();return hung<string>(signal);}return 'synthetic-installation-token';
  },transport);
  const result=dispatcher.dispatch('opaque-job',0);
  const rejected=assert.rejects(result,error=>error instanceof DOMException&&error.name==='TimeoutError');
  await started.promise;expire(30000);await rejected;
  assert.equal(posts,phase==='dispatch'?1:0,phase+' never retries an uncertain dispatch');
  assert.equal(calls,{token:0,tag:1,head:2,dispatch:3}[phase],phase);
 }
});

test('installation token deadline includes a stalled response body, never caches failure, and honors cancellation',async t=>{
 const expire=deadlines(t),started=deferred();let calls=0;
 const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 const key=privateKey.export({format:'pem',type:'pkcs8'}).toString();
 const token=installationTokenProvider({appId:'123',installationId:'456',repositoryId:789},()=>key,async(_input,init)=>{
  calls++;
  if(calls>1)return new Response(JSON.stringify({token:'synthetic-cached-token',expires_at:new Date(Date.now()+3600000).toISOString()}));
  assert.ok(init?.signal);const signal=init.signal;
  return new Response(new ReadableStream({start(controller){
   controller.enqueue(new TextEncoder().encode('{"token":'));
   signal.addEventListener('abort',()=>controller.error(signal.reason),{once:true});started.resolve();
  }}));
 });
 const result=token(),rejected=assert.rejects(result,error=>error instanceof DOMException&&error.name==='TimeoutError');
 await started.promise;expire(10000);await rejected;
 assert.equal(await token(),'synthetic-cached-token');assert.equal(calls,2);
 assert.equal(await token(),'synthetic-cached-token');assert.equal(calls,2,'only successful token responses are cached');
 const stopped=new AbortController();stopped.abort(timeout());
 await assert.rejects(token(stopped.signal),error=>error instanceof DOMException&&error.name==='TimeoutError');
 assert.equal(calls,2,'cancelled callers cannot acquire a cached token');
});
