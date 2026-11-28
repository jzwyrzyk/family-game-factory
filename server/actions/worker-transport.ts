import {setTimeout as delay} from 'node:timers/promises';
import {PREMIUM_POLICY_VERSION} from '../agent/model-policy';
import type {ActionCoordinator} from './coordinator';
import type {WorkerStage} from './identity';

type WorkerTask=Awaited<ReturnType<ActionCoordinator['claim']>>;
export interface WorkerStatus {status:'queued'|'building'|'testing'|'ready'|'failed'|'cancelled';phase?:string}
export interface WorkerReceipt {accepted:true;reviewRequired:boolean}
export interface WorkerClient {
 claim(signal?:AbortSignal):Promise<WorkerTask>;
 status(signal?:AbortSignal):Promise<WorkerStatus>;
 report(value:unknown,signal?:AbortSignal):Promise<WorkerReceipt>;
}
export class WorkerTransportError extends Error {
 constructor(message:string,readonly retryable:boolean){super(message);}
}

function interrupted<T>(promise:Promise<T>,signal:AbortSignal):Promise<T>{
 return new Promise((resolve,reject)=>{
  const abort=()=>reject(signal.reason);
  signal.addEventListener('abort',abort,{once:true});
  promise.then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
  if(signal.aborted)abort();
 });
}
function deadline(ms:number,parent?:AbortSignal){
 const controller=new AbortController();
 const abort=()=>controller.abort(parent?.reason||new WorkerTransportError('WORKER_STOPPED',false));
 const timer=setTimeout(()=>controller.abort(new WorkerTransportError('WORKER_TRANSPORT_TIMEOUT',true)),ms);
 parent?.addEventListener('abort',abort,{once:true});if(parent?.aborted)abort();
 return {signal:controller.signal,close:()=>{clearTimeout(timer);parent?.removeEventListener('abort',abort);}};
}
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
async function jsonResponse(fetcher:typeof fetch,url:string,init:RequestInit,signal:AbortSignal,maxBytes:number):Promise<unknown>{
 signal.throwIfAborted();
 const response=await interrupted(fetcher(url,{...init,redirect:'error',signal}),signal);
 if(!response.ok){
  void response.body?.cancel().catch(()=>{});
  const retryable=response.status===408||response.status===429||response.status>=500;
  throw new WorkerTransportError(retryable?'WORKER_GATEWAY_UNAVAILABLE':'WORKER_GATEWAY_REJECTED',retryable);
 }
 const reader=response.body?.getReader();if(!reader)throw new WorkerTransportError('WORKER_RESPONSE_INVALID',true);
 const chunks:Uint8Array[]=[];let bytes=0,complete=false;
 try{
  if(Number(response.headers.get('content-length'))>maxBytes)throw new WorkerTransportError('WORKER_RESPONSE_TOO_LARGE',false);
  while(true){
   const part=await interrupted(reader.read(),signal);if(part.done){complete=true;break;}
   bytes+=part.value.byteLength;if(bytes>maxBytes)throw new WorkerTransportError('WORKER_RESPONSE_TOO_LARGE',false);
   chunks.push(part.value);
  }
  try{return JSON.parse(Buffer.concat(chunks,bytes).toString('utf8'));}
  catch{throw new WorkerTransportError('WORKER_RESPONSE_INVALID',true);}
 }finally{
  if(!complete)void reader.cancel().catch(()=>{});
  reader.releaseLock();
 }
}

interface GatewayOptions {
 gateway:string;jobId:string;attempt:number;stage:WorkerStage;oidcEndpoint:string;oidcCredential:string;
 requestTimeoutMs?:number;reportWindowMs?:number;reportAttempts?:number;retryDelayMs?:number;
}
/** Coordination requests only. This client never sends or retries paid model work. */
export class WorkerGateway implements WorkerClient {
 private gateway:URL;private oidc:URL;
 constructor(private options:GatewayOptions,private fetcher:typeof fetch=fetch){
  const o=options;this.gateway=new URL(o.gateway);this.oidc=new URL(o.oidcEndpoint);
  if(!['generate','test','review'].includes(o.stage)||!/^[-\w]{1,100}$/.test(o.jobId)||!Number.isInteger(o.attempt)||o.attempt<0||o.attempt>2||
   this.gateway.protocol!=='https:'||this.gateway.username||this.gateway.password||this.gateway.search||this.gateway.hash||this.gateway.pathname!=='/')throw Error('WORKER_CONFIGURATION_REQUIRED');
  if(!o.oidcCredential||this.oidc.protocol!=='https:'||!this.oidc.hostname.endsWith('.actions.githubusercontent.com')||this.oidc.username||this.oidc.password||this.oidc.hash)throw Error('OIDC_ENDPOINT_REJECTED');
  this.oidc.searchParams.set('audience',this.gateway.origin);
 }
 private async api(path:'claim'|'status'|'report',body:string|undefined,parent?:AbortSignal){
  const operation=deadline(Math.min(this.options.requestTimeoutMs??15000,15000),parent);
  try{
   const token=await jsonResponse(this.fetcher,this.oidc.href,{headers:{Authorization:'Bearer '+this.options.oidcCredential}},operation.signal,32*1024);
   if(!object(token)||typeof token.value!=='string'||token.value.length>16384||!/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token.value))throw new WorkerTransportError('OIDC_RESPONSE_INVALID',false);
   return await jsonResponse(this.fetcher,`${this.gateway.origin}/v1/worker/jobs/${this.options.jobId}/${path}`,{
    method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token.value,
     ...(process.env.JEMS_TEST_PUBLIC_SOURCE_SHA?{'X-Jems-Test-Public-Source':process.env.JEMS_TEST_PUBLIC_SOURCE_SHA}:{}),
     ...(process.env.JEMS_TEST_TRIAL_AUTHORIZATION_SHA256?{'X-Jems-Test-Trial-Authorization':process.env.JEMS_TEST_TRIAL_AUTHORIZATION_SHA256}:{}),
     ...(path==='claim'?{'X-Factory-Model-Policy':PREMIUM_POLICY_VERSION}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},body,
   },operation.signal,path==='claim'?10*1024*1024:16*1024);
  }catch(error){
   if(operation.signal.aborted)throw operation.signal.reason;
   if(error instanceof WorkerTransportError)throw error;
   throw new WorkerTransportError('WORKER_GATEWAY_UNAVAILABLE',true);
  }finally{operation.close();}
 }
 async claim(signal?:AbortSignal):Promise<WorkerTask>{
  // A lost claim acknowledgment is uncertain ownership. Never replay it or
  // begin generation without a received task.
  const task=await this.api('claim',JSON.stringify({stage:this.options.stage,attempt:this.options.attempt}),signal);
  if(!object(task))throw new WorkerTransportError('WORKER_CLAIM_INVALID',false);
  return task as WorkerTask;
 }
 async status(signal?:AbortSignal):Promise<WorkerStatus>{
  const result=await this.api('status',undefined,signal);
  if(!object(result)||typeof result.status!=='string'||!['queued','building','testing','ready','failed','cancelled'].includes(result.status)||result.phase!==undefined&&typeof result.phase!=='string')throw new WorkerTransportError('WORKER_STATUS_INVALID',true);
  return {status:result.status as WorkerStatus['status'],...(result.phase!==undefined?{phase:result.phase as string}:{})};
 }
 async report(value:unknown,parent?:AbortSignal):Promise<WorkerReceipt>{
  // Freeze the wire payload once. The gateway fingerprints this exact report
  // and retains its receipt even if accepting it starts the next repair.
  const body=JSON.stringify({stage:this.options.stage,attempt:this.options.attempt,report:value});
  if(Buffer.byteLength(body)>10*1024*1024)throw new WorkerTransportError('WORKER_REPORT_TOO_LARGE',false);
  const operation=deadline(Math.min(this.options.reportWindowMs??45000,45000),parent),attempts=Math.min(3,this.options.reportAttempts??3);
  try{
   for(let attempt=0;attempt<attempts;attempt++){
    try{
     const receipt=await this.api('report',body,operation.signal);
     if(!object(receipt)||receipt.accepted!==true||typeof receipt.reviewRequired!=='boolean')throw new WorkerTransportError('WORKER_RECEIPT_INVALID',true);
     return {accepted:true,reviewRequired:receipt.reviewRequired};
    }catch(error){
     if(operation.signal.aborted)throw operation.signal.reason;
     if(!(error instanceof WorkerTransportError)||!error.retryable)throw error;
     if(attempt+1<attempts)await delay((this.options.retryDelayMs??500)*(attempt+1),undefined,{signal:operation.signal});
    }
   }
   throw new WorkerTransportError('WORKER_REPORT_UNCONFIRMED',false);
  }catch(error){
   if(parent?.aborted)throw parent.reason;
   if(operation.signal.aborted)throw new WorkerTransportError('WORKER_REPORT_UNCONFIRMED',false);
   throw error;
  }finally{operation.close();}
 }
}

export function startWorkerHeartbeat(client:Pick<WorkerClient,'status'>,work:AbortController,options:{intervalMs?:number;unreachableMs?:number}={}){
 const stopped=new AbortController(),signal=AbortSignal.any([stopped.signal,work.signal]);
 const abortUnreachable=()=>work.abort(new WorkerTransportError('WORKER_STATUS_UNREACHABLE',false));
 let watchdog=setTimeout(abortUnreachable,options.unreachableMs??45000);
 const loop=(async()=>{
  try{
   while(!signal.aborted){
    await delay(options.intervalMs??3000,undefined,{signal});
    try{
     const status=await interrupted(client.status(signal),signal);
     if(['failed','cancelled','ready'].includes(status.status)){
      work.abort(new WorkerTransportError('WORKER_TERMINAL_'+status.status.toUpperCase(),false));return;
     }
     clearTimeout(watchdog);watchdog=setTimeout(abortUnreachable,options.unreachableMs??45000);
    }catch(error){
     if(signal.aborted)return;
     if(!(error instanceof WorkerTransportError)||!error.retryable){work.abort(error);return;}
     // A transient status outage is not an authoritative cancellation. Keep
     // one serial poll in flight; the watchdog bounds lost visibility.
    }
   }
  }catch(error){if(!signal.aborted)work.abort(error);}
  finally{clearTimeout(watchdog);}
 })();
 return {stop:async()=>{stopped.abort();clearTimeout(watchdog);await loop;}};
}

/** One claim, one execution, then bounded reconciliation of that single result. */
export async function coordinateWorkerStage(client:WorkerClient,execute:(task:WorkerTask,signal:AbortSignal)=>Promise<unknown>,parent?:AbortSignal){
 const task=await client.claim(parent),work=new AbortController();
 const abort=()=>work.abort(parent?.reason);parent?.addEventListener('abort',abort,{once:true});if(parent?.aborted)abort();
 const heartbeat=startWorkerHeartbeat(client,work);
 try{
  work.signal.throwIfAborted();
  const result=await interrupted(execute(task,work.signal),work.signal);
  await heartbeat.stop();work.signal.throwIfAborted();
  // Stop status polling before report: an accepted test/review failure may
  // change run/attempt immediately, making that old status identity obsolete.
  return await client.report(result,parent);
 }finally{await heartbeat.stop();parent?.removeEventListener('abort',abort);}
}
