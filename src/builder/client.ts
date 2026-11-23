import {familyFetch} from './session';
import {identifyBuildRequest,validateBuildSubmission,type BuildSubmission} from './submission';
import type {CreationProject} from '../creation/model';
import {validateGeneratedCreationManifest} from '../creation/projects';
export type JobStatus='draft'|'queued'|'building'|'testing'|'ready'|'failed'|'cancelled';
export interface BuilderConfig {version:1;mode:'unavailable'|'remote';apiBaseUrl?:string;previewOrigin?:string}
export interface RequestChange {gameId:string;baseRevisionId:string|null;prompt:string;config?:Record<string,number|boolean>}
export interface JobView {jobId:string;status:JobStatus;revisionId?:string;errorCode?:string;adapter?:string;phase?:string;attempts?:number;retryJobId?:string}
export interface Preview {revisionId:string;projectId?:string;url:string;artifactId:string;expiresAt:number;adapter?:string;kind?:string;title?:string}
export interface CreationManifestResponse {revisionId:string;projectId:string;manifest:CreationProject|null}
const loopback=(url:URL)=>['127.0.0.1','localhost','[::1]'].includes(url.hostname);
export function validateBuilderConfig(input:unknown):BuilderConfig {
 const config=input as BuilderConfig;if(!config||config.version!==1||!['unavailable','remote'].includes(config.mode))throw Error('BUILDER_UNAVAILABLE');if(config.mode==='unavailable')return {version:1,mode:'unavailable'};
 const api=new URL(config.apiBaseUrl!),preview=new URL(config.previewOrigin!);if((api.protocol!=='https:'&&!loopback(api))||(preview.protocol!=='https:'&&!loopback(preview))||api.hostname===preview.hostname||api.username||api.password||preview.username||preview.password)throw Error('UNSAFE_BUILDER_CONFIGURATION');
 return {version:1,mode:'remote',apiBaseUrl:api.href.replace(/\/$/,''),previewOrigin:preview.origin};
}
/** Adaptive polling avoids thousands of status reads during a long build. */
export function buildPollDelay(elapsedMs:number){return elapsedMs<15000?1000:elapsedMs<60000?3000:8000;}
/** A structured gateway rejection is different from a lost response. */
export class BuilderApiError extends Error {
 constructor(code:string,readonly status:number){super(code);this.name='BuilderApiError';}
}
export function isKnownBuildRejection(error:unknown):boolean {
 // REQUEST_REJECTED is the gateway's catch-all, including datastore errors;
 // it cannot prove that a request was never admitted.
 return error instanceof BuilderApiError&&['UNAUTHENTICATED','FORBIDDEN','SPENDING_CUTOFF','BUILDER_UNAVAILABLE','RATE_LIMIT','PRIVATE_INFORMATION','INVALID_REQUEST','NOT_FOUND','RETRY_LIMIT','IDEMPOTENCY_CONFLICT','GAME_FORM_UNSUPPORTED','GAME_FORM_REVIEW_REQUIRED','GAME_FORM_BASE_UNVERIFIED','GUARDIAN_CONSENT_REQUIRED','ADULT_PILOT_ACCESS_REQUIRED'].includes(error.message);
}
const validJobId=(value:unknown):value is string=>typeof value==='string'&&/^[\w-]{1,100}$/.test(value);
function validateJob(value:JobView,expectedId?:string):JobView {
 if(!value||!validJobId(value.jobId)||expectedId&&value.jobId!==expectedId||!['queued','building','testing','ready','failed','cancelled'].includes(value.status)||value.retryJobId!==undefined&&(!validJobId(value.retryJobId)||value.retryJobId===value.jobId))throw Error('INVALID_JOB_RESPONSE');
 return value;
}
export class BuilderClient {
 private generation=0;private request:RequestChange|null=null;private requestId='';private last:JobView|null=null;
 private requests=new AbortController();
 constructor(readonly config:BuilderConfig,private update:(job:JobView,submissionId?:string)=>unknown){}
 async api(path:string,body?:unknown){
  if(this.config.mode!=='remote')throw Error('BUILDER_UNAVAILABLE');
  const signal=AbortSignal.any([this.requests.signal,AbortSignal.timeout(20_000)]);
  const response=await familyFetch(this.config.apiBaseUrl!,path,{method:body===undefined?'GET':'POST',credentials:'include',signal,headers:body===undefined?{}:{'Content-Type':'application/json','X-Factory-Request':'1'},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await response.json();signal.throwIfAborted();
  if(!response.ok){if(typeof data?.errorCode!=='string')throw Error('UNCONFIRMED_BUILD_RESPONSE');throw new BuilderApiError(data.errorCode,response.status);}return data;
 }
 /** Acknowledgement persistence is part of delivery. Await it before polling,
  * and never let an old async callback restart work after a profile switch. */
 private async publish(job:JobView,token:number,submissionId?:string):Promise<boolean>{
  if(token!==this.generation)return false;
  this.last=job;
  try{await this.update(job,submissionId);}catch(error){if(token!==this.generation)return false;throw error;}
  return token===this.generation;
 }
 async submit(input:RequestChange,saveSubmission:(request:BuildSubmission)=>void|Promise<void>){this.request={...input};this.requestId=crypto.randomUUID();this.last=null;return this.send(saveSubmission);}
 /** A missing result is still uncertain: the original POST may be in flight.
  * This lookup never admits or redispatches a paid build. */
 async lookupSubmission(input:BuildSubmission):Promise<JobView|null|undefined>{
  const token=++this.generation,saved=validateBuildSubmission(input),identity=await identifyBuildRequest(saved);
  if(identity.payloadHash!==saved.payloadHash)throw Error('INVALID_SAVED_SUBMISSION');
  if(token!==this.generation)return;
  let result;
  try{result=await this.api('/v1/job-requests/'+saved.clientRequestId+'?payloadHash='+saved.payloadHash);}
  catch(error){if(token!==this.generation)return;throw error;}
  if(token!==this.generation)return;
  if(!result||!Object.hasOwn(result,'job'))throw Error('INVALID_JOB_RESPONSE');
  if(result.job===null)return null;
  let job=validateJob(result.job);
  if(job.retryJobId){const latest=await this.readLatestJob(job.jobId,token);if(!latest)return;job=latest;}
  if(token!==this.generation)return;
  if(!await this.publish(job,token,saved.clientRequestId))return;return job;
 }
 /** Restore the exact saved job, including a retry whose acknowledgement was
  * lost. Looking up or following that chain never submits another paid job. */
 private async readLatestJob(jobId:string,token:number):Promise<JobView|undefined>{
  if(!validJobId(jobId))throw Error('INVALID_JOB');
  const seen=new Set<string>();
  for(let depth=0;depth<12;depth++){
   if(seen.has(jobId))throw Error('INVALID_JOB_RESPONSE');seen.add(jobId);
   const job=validateJob(await this.api('/v1/jobs/'+jobId),jobId);
   if(token!==this.generation)return;
   if(!job.retryJobId)return job;
   jobId=job.retryJobId;
  }
  throw Error('INVALID_JOB_RESPONSE');
 }
 async check(jobId:string){
  const token=++this.generation,job=await this.readLatestJob(jobId,token);
  if(!job||token!==this.generation)return;
  if(!await this.publish(job,token))return;return job;
 }
 async retry(jobId=this.last?.jobId){
  if(!jobId)throw Error('NO_ACKNOWLEDGED_JOB');
  const token=++this.generation,job=await this.readLatestJob(jobId,token);
  if(!job||token!==this.generation)return;
  // An earlier click already created a retry, or the saved status was stale.
  // Recover it; retrying a newly observed failure requires another explicit click.
  if(job.jobId!==jobId||job.status!=='failed'){
   if(!await this.publish(job,token))return;
   if(['queued','building','testing'].includes(job.status))return this.resume(job.jobId);
   return job;
  }
  const ack=validateJob(await this.api('/v1/jobs/'+jobId+'/retry',{clientRequestId:crypto.randomUUID()}));
  if(token!==this.generation)return;
  if(!await this.publish(ack,token))return;
  return this.resume(ack.jobId);
 }
 private async send(saveSubmission:(request:BuildSubmission)=>void|Promise<void>){
  const token=++this.generation,input=this.request!;let baseRevisionId=input.baseRevisionId;
  if(input.config&&baseRevisionId){const base=await this.api('/v1/revisions',{gameId:input.gameId,localRevisionId:baseRevisionId,config:input.config});baseRevisionId=base.revisionId;}
  if(token!==this.generation)return; // Profile changed while registering the starting revision.
  const body={gameId:input.gameId,baseRevisionId,prompt:input.prompt.trim(),clientRequestId:this.requestId};
  const submission=await identifyBuildRequest(body);
  if(token!==this.generation)return;
  await saveSubmission(submission);
  if(token!==this.generation)return;
  const acknowledged=await this.api('/v1/jobs',body);
  if(typeof acknowledged.jobId!=='string'||!/^[\w-]{1,100}$/.test(acknowledged.jobId)||!['queued','building','testing','ready','failed','cancelled'].includes(acknowledged.status))throw Error('INVALID_ACKNOWLEDGEMENT');
  if(!await this.publish(acknowledged,token,body.clientRequestId))return;
  const started=Date.now();for(let i=0;i<3600&&token===this.generation&&Date.now()-started<30*60_000;i++){
   if(['ready','failed','cancelled'].includes(this.last!.status))return this.last;
   await new Promise(resolve=>setTimeout(resolve,buildPollDelay(Date.now()-started)));if(token!==this.generation)return;
   const job=await this.api('/v1/jobs/'+acknowledged.jobId);if(token!==this.generation)return;if(job.jobId!==acknowledged.jobId||!['queued','building','testing','ready','failed','cancelled'].includes(job.status))throw Error('INVALID_JOB_RESPONSE');
   if(!await this.publish(job,token))return;
  }
  if(token!==this.generation)return;throw Error('POLL_TIMEOUT');
 }
 async resume(jobId:string){if(!validJobId(jobId))throw Error('INVALID_JOB');const token=++this.generation,started=Date.now();for(let i=0;i<3600&&token===this.generation&&Date.now()-started<30*60_000;i++){const job=await this.readLatestJob(jobId,token);if(!job||token!==this.generation)return;jobId=job.jobId;if(!await this.publish(job,token))return;if(['ready','failed','cancelled'].includes(job.status))return job;await new Promise(r=>setTimeout(r,buildPollDelay(Date.now()-started)));}if(token!==this.generation)return;throw Error('POLL_TIMEOUT');}
 async cancel(jobId?:string){
  const id=jobId||this.last?.jobId;
  if(!id||!/^[\w-]{1,100}$/.test(id))throw Error('NO_ACKNOWLEDGED_JOB');
  const token=++this.generation;
  const job=this.last?.jobId===id?this.last:await this.api('/v1/jobs/'+id);
  if(token!==this.generation)throw Error('PROFILE_CHANGED');
  if(job?.jobId!==id||!['queued','building','testing','ready','failed','cancelled'].includes(job.status))throw Error('INVALID_JOB_RESPONSE');
  if(['ready','failed','cancelled'].includes(job.status)){
   if(!await this.publish(job,token))throw Error('PROFILE_CHANGED');return job as JobView;
  }
  const response=await this.api('/v1/jobs/'+id+'/cancel',{});
  if(response?.jobId!==id||!['queued','building','testing','ready','failed','cancelled'].includes(response.status))throw Error('INVALID_JOB_RESPONSE');
  if(!await this.publish(response,token))throw Error('PROFILE_CHANGED');return response as JobView;
 }
 disconnect(){++this.generation;this.requests.abort(Error('PROFILE_CHANGED'));this.requests=new AbortController();this.last=null;this.request=null;}
 async creationManifest(revisionId:string):Promise<CreationManifestResponse>{
  if(!/^[\w-]{1,100}$/.test(revisionId))throw Error('INVALID_REVISION');
  const token=this.generation,data=await this.api('/v1/revisions/'+encodeURIComponent(revisionId)+'/creation');
  if(token!==this.generation)throw Error('PROFILE_CHANGED');
  if(!data||data.revisionId!==revisionId||typeof data.projectId!=='string'||!/^[\w-]{1,100}$/.test(data.projectId)||['__proto__','constructor','prototype'].includes(data.projectId)||!Object.hasOwn(data,'manifest'))throw Error('INVALID_CREATION_MANIFEST');
  return {revisionId,projectId:data.projectId,manifest:data.manifest===null?null:validateGeneratedCreationManifest(data.manifest)};
 }
 async preview(revisionId:string):Promise<Preview>{
  if(!/^[\w-]{1,100}$/.test(revisionId))throw Error('UNSAFE_PREVIEW');
  const data=await this.api('/v1/revisions/'+encodeURIComponent(revisionId)+'/preview');const url=new URL(data.url);
  const projectId=data.projectId===undefined?revisionId:data.projectId;
  if(url.origin!==this.config.previewOrigin||typeof data.artifactId!=='string'||!Number.isFinite(data.expiresAt)||data.expiresAt<=Date.now()
    ||typeof projectId!=='string'||!/^[\w-]{1,100}$/.test(projectId)||['__proto__','constructor','prototype'].includes(projectId))throw Error('UNSAFE_PREVIEW');
  return {...data,revisionId,projectId};
 }
}
