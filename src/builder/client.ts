export type JobStatus='draft'|'queued'|'building'|'testing'|'ready'|'failed'|'cancelled';
export interface BuilderConfig {version:1;mode:'unavailable'|'remote';apiBaseUrl?:string;previewOrigin?:string}
export interface RequestChange {gameId:string;baseRevisionId:string|null;prompt:string;config?:Record<string,number|boolean>}
export interface JobView {jobId:string;status:JobStatus;revisionId?:string;errorCode?:string;adapter?:string;phase?:string;attempts?:number}
export interface Preview {revisionId:string;projectId?:string;url:string;artifactId:string;expiresAt:number;adapter?:string;kind?:string;title?:string}
const loopback=(url:URL)=>['127.0.0.1','localhost','[::1]'].includes(url.hostname);
export function validateBuilderConfig(input:unknown):BuilderConfig {
 const config=input as BuilderConfig;if(!config||config.version!==1||!['unavailable','remote'].includes(config.mode))throw Error('BUILDER_UNAVAILABLE');if(config.mode==='unavailable')return {version:1,mode:'unavailable'};
 const api=new URL(config.apiBaseUrl!),preview=new URL(config.previewOrigin!);if((api.protocol!=='https:'&&!loopback(api))||(preview.protocol!=='https:'&&!loopback(preview))||api.hostname===preview.hostname||api.username||api.password||preview.username||preview.password)throw Error('UNSAFE_BUILDER_CONFIGURATION');
 return {version:1,mode:'remote',apiBaseUrl:api.href.replace(/\/$/,''),previewOrigin:preview.origin};
}
export class BuilderClient {
 private generation=0;private request:RequestChange|null=null;private requestId='';private retryOf:string|undefined;private last:JobView|null=null;
 constructor(readonly config:BuilderConfig,private update:(job:JobView)=>void){}
 async api(path:string,body?:unknown){
  if(this.config.mode!=='remote')throw Error('BUILDER_UNAVAILABLE');const response=await fetch(this.config.apiBaseUrl+path,{method:body===undefined?'GET':'POST',credentials:'include',headers:body===undefined?{}:{'Content-Type':'application/json','X-Factory-Request':'1'},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await response.json();if(!response.ok){if(data?.errorCode==='SAFETY_POLICY_BLOCKED')throw Error('Building is paused right now. Your saved game is safe. You can keep playing.');throw Error(data.errorCode||'BUILDER_UNAVAILABLE');}return data;
 }
 async submit(input:RequestChange){this.request={...input};this.requestId=crypto.randomUUID();this.retryOf=undefined;this.last=null;return this.send();}
 async retry(){if(!this.request){if(this.last?.status!=='failed')throw Error('NO_REQUEST');const ack=await this.api('/v1/jobs/'+this.last.jobId+'/retry',{clientRequestId:crypto.randomUUID()});return this.resume(ack.jobId);}if(this.last?.status==='failed'){this.retryOf=this.last.jobId;this.requestId=crypto.randomUUID();}return this.send();}
 private async send(){
  const token=++this.generation,input=this.request!;let baseRevisionId=input.baseRevisionId;
  if(input.config&&baseRevisionId){const base=await this.api('/v1/revisions',{gameId:input.gameId,localRevisionId:baseRevisionId,config:input.config});baseRevisionId=base.revisionId;}
  const acknowledged=await this.api('/v1/jobs',{gameId:input.gameId,baseRevisionId,prompt:input.prompt,clientRequestId:this.requestId,...(this.retryOf?{retryOf:this.retryOf}:{})});
  if(typeof acknowledged.jobId!=='string'||!/^[\w-]{1,100}$/.test(acknowledged.jobId)||!['queued','building','testing','ready','failed','cancelled'].includes(acknowledged.status))throw Error('INVALID_ACKNOWLEDGEMENT');
  if(token!==this.generation)return;this.last=acknowledged;this.update(this.last!);
  for(let i=0;i<3600&&token===this.generation;i++){
   if(['ready','failed','cancelled'].includes(this.last!.status))return this.last;
   await new Promise(resolve=>setTimeout(resolve,250));if(token!==this.generation)return;
   const job=await this.api('/v1/jobs/'+acknowledged.jobId);if(token!==this.generation)return;if(job.jobId!==acknowledged.jobId||!['queued','building','testing','ready','failed','cancelled'].includes(job.status))throw Error('INVALID_JOB_RESPONSE');
   this.last=job;this.update(job);
  }
  if(token!==this.generation)return;throw Error('POLL_TIMEOUT');
 }
 async resume(jobId:string){if(!/^[\w-]{1,100}$/.test(jobId))throw Error('INVALID_JOB');const token=++this.generation;for(let i=0;i<3600&&token===this.generation;i++){const job=await this.api('/v1/jobs/'+jobId);if(token!==this.generation)return;if(job.jobId!==jobId||!['queued','building','testing','ready','failed','cancelled'].includes(job.status))throw Error('INVALID_JOB_RESPONSE');this.last=job;this.update(job);if(['ready','failed','cancelled'].includes(job.status))return job;await new Promise(r=>setTimeout(r,250));}if(token!==this.generation)return;throw Error('POLL_TIMEOUT');}
 async cancel(){const job=this.last;if(!job)throw Error('NO_ACKNOWLEDGED_JOB');++this.generation;const response=await this.api('/v1/jobs/'+job.jobId+'/cancel',{});this.last=response;this.update(response);}
 disconnect(){++this.generation;this.last=null;this.request=null;}
 async preview(revisionId:string):Promise<Preview>{
  if(!/^[\w-]{1,100}$/.test(revisionId))throw Error('UNSAFE_PREVIEW');
  const data=await this.api('/v1/revisions/'+encodeURIComponent(revisionId)+'/preview');const url=new URL(data.url);
  const projectId=data.projectId===undefined?revisionId:data.projectId;
  if(url.origin!==this.config.previewOrigin||typeof data.artifactId!=='string'||!Number.isFinite(data.expiresAt)||data.expiresAt<=Date.now()
    ||typeof projectId!=='string'||!/^[\w-]{1,100}$/.test(projectId)||['__proto__','constructor','prototype'].includes(projectId))throw Error('UNSAFE_PREVIEW');
  return {...data,revisionId,projectId};
 }
}
