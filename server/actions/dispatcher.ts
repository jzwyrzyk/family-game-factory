import {testWorkerRepository,testWorkerWorkflow,type TestExecution} from './test-execution';
export interface DispatchPort {dispatch(jobId:string,attempt:number):Promise<void>}
export interface GitHubDispatchConfig {enabled:boolean;repository:string;workflow:string;approvedSha:string;privateWorker?:boolean;testExecution?:TestExecution;callbackRoute?:'beta-dev'|'beta-test'|'beta-prod'}
/** Independent immutable code tag. The selected GitHub workflow runs from protected main. */
export function workerTag(c:GitHubDispatchConfig){return (c.testExecution?'jems-test-execution-':c.privateWorker?'factory-execution-':'factory-worker-')+c.approvedSha;}
/** Token must be an installation token scoped to ONLY the target private repository. */
export class GitHubDispatcher implements DispatchPort {
 constructor(private config:GitHubDispatchConfig,private token:(signal?:AbortSignal)=>Promise<string>,private transport:typeof fetch=fetch){
  if(config.testExecution&&(!config.privateWorker||config.repository!==testWorkerRepository||config.workflow!==testWorkerWorkflow||config.callbackRoute!=='beta-test'))throw Error('TEST_WORKER_ROUTE_REQUIRED');
  if(config.callbackRoute!==undefined&&(!config.privateWorker||!['beta-dev','beta-test','beta-prod'].includes(config.callbackRoute)))throw Error('WORKER_ROUTE_REQUIRED');
  if(config.enabled&&(!/^[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/.test(config.repository)||!/^[A-Za-z0-9_.-]+[.]yml$/.test(config.workflow)||!/^[a-f0-9]{40}$/.test(config.approvedSha)))throw Error('ACTIONS_APPROVAL_REQUIRED');
 }
 async dispatch(jobId:string,attempt:number){
  if(!this.config.enabled||this.config.testExecution&&Date.now()>=this.config.testExecution.expiresAt||!/^[A-Za-z0-9_-]{1,100}$/.test(jobId)||!Number.isInteger(attempt)||attempt<0||attempt>2)throw Error('ACTIONS_UNAVAILABLE');
  const signal=AbortSignal.timeout(30_000);
  const token=await this.token(signal);signal.throwIfAborted();if(!token)throw Error('ACTIONS_CREDENTIAL_MISSING');
  const headers={Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
  const prefix=`https://api.github.com/repos/${this.config.repository}`;
  const tag=workerTag(this.config);
  async function fetchCommitRef(transport:typeof fetch,url:string,strictType:boolean){
   const r=await transport(url,{headers,redirect:'error',signal});
   if(!r.ok)return null;
   const data=await r.json();signal.throwIfAborted();
   return data?.object?.sha&&(strictType?data.object.type==='commit':!data.object.type||data.object.type==='commit')?data.object.sha:null;
  }
  // The code identity remains independently pinned even though selected workflows must use main.
  const tagged=await fetchCommitRef(this.transport,`${prefix}/git/ref/tags/${tag}`,Boolean(this.config.privateWorker));
  if(tagged!==this.config.approvedSha)throw Error('APPROVED_WORKER_TAG_CHANGED');
  if(this.config.privateWorker){
   const head=await fetchCommitRef(this.transport,`${prefix}/git/ref/heads/main`,true);
   if(head!==this.config.approvedSha)throw Error('APPROVED_WORKER_BRANCH_DRIFT');
  }
  if(this.config.testExecution){
   const branch=await this.transport(prefix+'/branches/main',{headers,signal,redirect:'error'});
   if(!branch.ok)throw Error('TEST_PROTECTED_WORKER_REQUIRED');
   const info=await branch.json();
   if(info.name!=='main'||info.protected!==true||info.commit?.sha!==this.config.approvedSha)throw Error('TEST_PROTECTED_WORKER_REQUIRED');
  }
  // Dispatch inputs are opaque. The workflow itself repeats SHA checks; a race fails closed.
  const ref=this.config.privateWorker?'main':tag;
  signal.throwIfAborted();
  if(this.config.testExecution&&Date.now()>=this.config.testExecution.expiresAt)throw Error('TEST_EXECUTION_EXPIRED');
  const r=await this.transport(`${prefix}/actions/workflows/${this.config.workflow}/dispatches`,{method:'POST',redirect:'error',signal,headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({ref,inputs:{job_id:jobId,attempt:String(attempt),...(this.config.testExecution?{provider_mode:this.config.testExecution.providerMode}:{}),...(this.config.callbackRoute?{gateway_route:this.config.callbackRoute}:{})}})});
  signal.throwIfAborted();
  if(r.status!==204)throw Error('ACTIONS_DISPATCH_FAILED');
 }
}
