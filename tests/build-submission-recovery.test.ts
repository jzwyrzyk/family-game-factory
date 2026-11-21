import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createServer} from 'node:http';
import {BuilderClient,type JobView} from '../src/builder/client';
import {identifyBuildRequest,type BuildSubmission} from '../src/builder/submission';
import {StudioNotebook,validateNotebook} from '../src/studio/notebook';
import {MemoryRepository} from '../server/pipeline/repository';
import {JobService} from '../server/pipeline/service';
import {apiHandler} from '../server/pipeline/http';
import {signSession} from '../server/pipeline/auth';
import {defaults} from '../src/runtime/manifests';
import type {AgentAdapter} from '../server/pipeline/types';

const config={version:1 as const,mode:'remote' as const,apiBaseUrl:'https://fixture-api.test',previewOrigin:'https://fixture-preview.test'};
const input={gameId:'new',baseRevisionId:null,prompt:'Attach stickers to a rocket and launch it.'};
class Storage {
 data=new Map<string,string>();fail=false;
 getItem(key:string){return this.data.get(key)??null;}
 setItem(key:string,value:string){if(this.fail)throw Error('quota');this.data.set(key,value);}
}
async function fixture(){
 const repo=new MemoryRepository(),session={subject:'fixture-parent',familyId:'fixture-family',role:'parent' as const,expiresAt:Date.now()+3600000};
 let providerCalls=0;
 const agent:AgentAdapter={available:true,kind:'metered-api',generate:async()=>{providerCalls++;throw Error('PROVIDER_MUST_NOT_RUN');}};
 const service=new JobService(repo,agent,{test:async()=>{}},{allowMock:false,maxUnits:5,timeoutMs:1000,maxRetries:2});
 await service.setAllowance(session,100,true);
 const storage=new Storage(),notebook=new StudioNotebook(storage),project=notebook.create('fixture-player','new','Saved idea');
 const save=(request:BuildSubmission)=>notebook.update(project.id,project.owner,s=>{
  if(s.pendingSubmission)throw Error('UNCONFIRMED_BUILD_RESPONSE');
  s.pendingSubmission={owner:s.owner,workspace:s.id,api:config.apiBaseUrl,request};
 });
 return {repo,service,session,storage,notebook,project,save,providerCalls:()=>providerCalls};
}

test('lost initial acknowledgement survives notebook reload and two read-only reconciliations with one reservation',async()=>{
 const f=await fixture();let posts=0,acceptedId='';
 const initial=new BuilderClient(config,()=>assert.fail('no acknowledgement reached the browser'));
 initial.api=async(path,body)=>{
  assert.equal(path,'/v1/jobs');posts++;
  const saved=f.notebook.get(f.project.id,f.project.owner).pendingSubmission!;
  assert.equal(saved.request.clientRequestId,(body as any).clientRequestId,'identity is durable before dispatch');
  acceptedId=(await f.service.submit(f.session,body)).jobId;
  throw Error('CONNECTION_LOST_AFTER_ADMISSION');
 };
 await assert.rejects(initial.submit(input,request=>{f.save(request);}),/CONNECTION_LOST_AFTER_ADMISSION/);
 const reloaded=new StudioNotebook(f.storage),saved=reloaded.get(f.project.id,f.project.owner).pendingSubmission!;
 const events:JobView[]=[],recovery=new BuilderClient(config,job=>events.push(job));let reads=0;
 recovery.api=async(path,body)=>{
  assert.equal(body,undefined);reads++;
  const url=new URL(path,config.apiBaseUrl);
  return f.service.lookupSubmission(f.session,url.pathname.split('/').at(-1)!,url.searchParams.get('payloadHash')!);
 };
 const before=await f.repo.snapshot();
 assert.equal((await recovery.lookupSubmission(saved.request))?.jobId,acceptedId);
 assert.equal((await recovery.lookupSubmission(saved.request))?.jobId,acceptedId);
 assert.deepEqual(await f.repo.snapshot(),before);
 assert.equal(reads,2);assert.equal(posts,1);assert.equal(events.length,2);
 assert.equal(before.jobs.length,1);assert.equal(before.ledgers[f.session.familyId].reserved,5);
 assert.equal(f.providerCalls(),0,'lookup never executes a provider');
 assert.deepEqual(saved.request,await identifyBuildRequest({...input,clientRequestId:saved.request.clientRequestId}));
});

test('loss before admission stays unknown and later admission is recoverable without another POST',async()=>{
 const f=await fixture(),client=new BuilderClient(config,()=>{});
 client.api=async()=>{throw Error('CONNECTION_LOST_BEFORE_ADMISSION');};
 await assert.rejects(client.submit(input,request=>{f.save(request);}),/CONNECTION_LOST_BEFORE_ADMISSION/);
 const pending=new StudioNotebook(f.storage).get(f.project.id,f.project.owner).pendingSubmission!;
 const recovery=new BuilderClient(config,()=>{});
 recovery.api=async(path,body)=>{assert.equal(body,undefined);return f.service.lookupSubmission(f.session,pending.request.clientRequestId,pending.request.payloadHash);};
 assert.equal(await recovery.lookupSubmission(pending.request),null);
 assert.equal((await f.repo.snapshot()).jobs.length,0);
 assert.ok(new StudioNotebook(f.storage).get(f.project.id,f.project.owner).pendingSubmission,'absence does not discard uncertainty');
 const {operation:_operation,payloadHash:_hash,...body}=pending.request;
 const admitted=await f.service.submit(f.session,body);
 assert.equal((await recovery.lookupSubmission(pending.request))?.jobId,admitted.jobId);
 assert.equal((await f.repo.snapshot()).jobs.length,1);
});

test('failed durable save or profile change before sending prevents a paid POST',async()=>{
 const f=await fixture();let calls=0;
 const client=new BuilderClient(config,()=>{});client.api=async()=>{calls++;throw Error('MUST_NOT_SEND');};
 f.storage.fail=true;
 await assert.rejects(client.submit(input,request=>{f.save(request);}),/Could not save/);
 assert.equal(calls,0);
 f.storage.fail=false;
 await client.submit(input,request=>{f.save(request);client.disconnect();});
 assert.equal(calls,0);
 assert.equal((await f.repo.snapshot()).jobs.length,0);
});

test('identity uses the registered server base and exact normalized payload before the initial POST',async()=>{
 const f=await fixture();let saved:BuildSubmission|undefined;
 const client=new BuilderClient(config,()=>{});
 client.api=async(path,body)=>{
  if(path==='/v1/revisions')return f.service.registerBase(f.session,body);
  assert.equal(path,'/v1/jobs');assert.ok(saved);
  assert.match(saved.baseRevisionId!,/^seed-/);
  assert.equal(saved.prompt,input.prompt);
  assert.equal(saved.payloadHash,(await identifyBuildRequest(body as any)).payloadHash);
  throw Error('STOP_AFTER_DURABLE_IDENTITY');
 };
 await assert.rejects(client.submit({...input,gameId:'moon',baseRevisionId:'local-source',config:defaults('moon'),prompt:'  '+input.prompt+'  '},request=>{saved=request;}),/STOP_AFTER_DURABLE_IDENTITY/);
});

test('acknowledgement save failure exits polling immediately and remains recoverable by the saved request',async()=>{
 const f=await fixture();let posts=0;
 const client=new BuilderClient(config,async job=>{
  f.storage.fail=true;
  f.notebook.update(f.project.id,f.project.owner,s=>{s.job={id:job.jobId,status:'queued',api:config.apiBaseUrl};s.pendingSubmission=null;});
 });
 client.api=async(path,body)=>{
  assert.equal(path,'/v1/jobs','a failed ACK save must return control before any status-poll wait');posts++;
  return f.service.submit(f.session,body);
 };
 await assert.rejects(client.submit(input,request=>{f.save(request);}),/Could not save/);
 const pending=f.notebook.get(f.project.id,f.project.owner).pendingSubmission!;
 assert.ok(pending);assert.equal(posts,1);
 f.storage.fail=false;
 const recovery=new BuilderClient(config,async job=>{
  f.notebook.update(f.project.id,f.project.owner,s=>{s.job={id:job.jobId,status:'queued',api:config.apiBaseUrl};s.pendingSubmission=null;});
 });
 recovery.api=async()=>f.service.lookupSubmission(f.session,pending.request.clientRequestId,pending.request.payloadHash);
 await recovery.lookupSubmission(pending.request);
 const saved=f.notebook.get(f.project.id,f.project.owner);
 assert.ok(saved.job);assert.equal(saved.pendingSubmission,null);
 assert.equal((await f.repo.snapshot()).jobs.length,1);
});

test('request hash, family, device and session checks fence lookup without writing or disclosing a foreign job',async()=>{
 const f=await fixture(),request=await identifyBuildRequest({...input,clientRequestId:'bound-request'});
 const ack=await f.service.submit(f.session,{...input,clientRequestId:request.clientRequestId});
 const before=await f.repo.snapshot();
 assert.equal((await f.service.lookupSubmission(f.session,request.clientRequestId,request.payloadHash)).job?.jobId,ack.jobId);
 assert.deepEqual(await f.service.lookupSubmission({...f.session,familyId:'other-family'},request.clientRequestId,request.payloadHash),{job:null});
 await assert.rejects(f.service.lookupSubmission(f.session,request.clientRequestId,'0'.repeat(64)),/IDEMPOTENCY_CONFLICT/);
 await assert.rejects(f.service.lookupSubmission({...f.session,expiresAt:0},request.clientRequestId,request.payloadHash),/Forbidden/);
 await assert.rejects(f.service.lookupSubmission({...f.session,deviceId:'revoked-or-unknown'},request.clientRequestId,request.payloadHash),/UNAUTHENTICATED/);
 assert.deepEqual(await f.repo.snapshot(),before);
});

test('tampered local payload and a profile switch during lookup cannot update the new profile',async()=>{
 const request=await identifyBuildRequest({...input,clientRequestId:'saved-request'}),events:JobView[]=[];
 const client=new BuilderClient(config,job=>events.push(job));let reads=0,release!:(value:unknown)=>void;
 client.api=async()=>{reads++;return new Promise(resolve=>{release=resolve;});};
 await assert.rejects(client.lookupSubmission({...request,prompt:'Different child request'}),/INVALID_SAVED_SUBMISSION/);
 assert.equal(reads,0);
 const lookup=client.lookupSubmission(request);
 while(!reads)await new Promise(resolve=>setImmediate(resolve));
 client.disconnect();release({job:{jobId:'old-job',status:'queued'}});await lookup;
 assert.equal(events.length,0);
});

test('a stale rejected lookup is suppressed after disconnect',async()=>{
 const request=await identifyBuildRequest({...input,clientRequestId:'old-lookup'});
 const client=new BuilderClient(config,()=>assert.fail('old lookup cannot update a profile'));
 let reject!:(error:Error)=>void,started!:(value:void)=>void;
 const reached=new Promise<void>(resolve=>{started=resolve;});
 client.api=async()=>{started();return new Promise((_resolve,fail)=>{reject=fail;});};
 const old=client.lookupSubmission(request);await reached;
 client.disconnect();reject(Error('OLD_NETWORK_FAILURE'));
 assert.equal(await old,undefined);
});

for(const path of ['queued','failed'] as const){
 test(`disconnect while saving a ${path} retry status cannot restart polling or supersede a newer operation`,async()=>{
  let release!:(value:void)=>void,started!:(value:void)=>void,calls=0;
  const reached=new Promise<void>(resolve=>{started=resolve;});
  const client=new BuilderClient(config,async()=>{started();await new Promise<void>(resolve=>{release=resolve;});});
  client.api=async(_path,body)=>{
   calls++;
   if(body!==undefined)return {jobId:'new-retry',status:'queued'};
   return {jobId:'saved-failed',status:path};
  };
  const retry=client.retry('saved-failed');await reached;
  client.disconnect();const before=calls;release();
  assert.equal(await retry,undefined);assert.equal(calls,before);
  assert.equal(calls,path==='queued'?1:2,'only the already explicit retry may POST');
 });
}

test('notebook backup binds pending identity to owner and workspace; copying does not copy the paid request',async()=>{
 const f=await fixture(),request=await identifyBuildRequest({...input,clientRequestId:'saved-request'});
 f.save(request);
 const original=f.notebook.read(),restored=validateNotebook(JSON.parse(JSON.stringify(original)));
 assert.deepEqual(restored,original);
 for(const field of ['owner','workspace'] as const){
  const invalid=structuredClone(original);invalid.sessions[0].pendingSubmission![field]='other';
  assert.throws(()=>validateNotebook(invalid),/Invalid pending submission/);
 }
 assert.throws(()=>f.notebook.archive(f.project.id,f.project.owner),/Check your saved request/);
 assert.throws(()=>f.notebook.clearConversation(f.project.id,f.project.owner),/Finish or cancel/);
 const copied=f.notebook.fork(f.project.id,f.project.owner,'Copied idea',null,null);
 assert.equal(copied.pendingSubmission,null);
 assert.deepEqual(f.notebook.get(f.project.id,f.project.owner).pendingSubmission,original.sessions[0].pendingSubmission);
});

test('authenticated lookup HTTP route is read-only and never calls dispatch or status-poll work',async t=>{
 const f=await fixture(),request=await identifyBuildRequest({...input,clientRequestId:'http-request'});
 const ack=await f.service.submit(f.session,{...input,clientRequestId:request.clientRequestId});
 const key='fixture-signing-key-with-more-than-thirty-two-characters';let dispatches=0,polls=0;
 const handler=apiHandler(f.service,{sessionKey:key,previewKey:key,appOrigin:'https://app.test',previewOrigin:config.previewOrigin,
  dispatch:async()=>{dispatches++;},poll:async()=>{polls++;}},f.repo);
 const server=createServer((req,res)=>{void handler(req,res);});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise<void>(resolve=>server.close(()=>resolve())));
 const base='http://127.0.0.1:'+(server.address() as any).port;
 const url=base+'/v1/job-requests/'+request.clientRequestId+'?payloadHash='+request.payloadHash;
 assert.equal((await fetch(url)).status,401);
 const response=await fetch(url,{headers:{Cookie:'factory_session='+signSession(f.session,key)}});
 assert.equal(response.status,200);assert.equal((await response.json()).job.jobId,ack.jobId);
 assert.equal(response.headers.get('cache-control'),'no-store');
 assert.equal(dispatches,0);assert.equal(polls,0);assert.equal(f.providerCalls(),0);
});
