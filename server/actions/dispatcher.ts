export interface DispatchPort {dispatch(jobId:string,attempt:number):Promise<void>}
export interface GitHubDispatchConfig {enabled:boolean;repository:string;workflow:string;approvedSha:string;privateWorker?:boolean}
/** Independent immutable code tag. The selected GitHub workflow runs from protected main. */
export function workerTag(c:GitHubDispatchConfig){return (c.privateWorker?'factory-execution-':'factory-worker-')+c.approvedSha;}
/** Token must be an installation token scoped to ONLY the target private repository. */
export class GitHubDispatcher implements DispatchPort {
 constructor(private config:GitHubDispatchConfig,private token:(signal?:AbortSignal)=>Promise<string>,private transport:typeof fetch=fetch){
  if(config.enabled&&(!/^[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/.test(config.repository)||!/^[A-Za-z0-9_.-]+[.]yml$/.test(config.workflow)||!/^[a-f0-9]{40}$/.test(config.approvedSha)))throw Error('ACTIONS_APPROVAL_REQUIRED');
 }
 async dispatch(jobId:string,attempt:number){
  if(!this.config.enabled||!/^[A-Za-z0-9_-]{1,100}$/.test(jobId)||!Number.isInteger(attempt)||attempt<0||attempt>2)throw Error('ACTIONS_UNAVAILABLE');
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
  // Dispatch inputs are opaque. The workflow itself repeats SHA checks; a race fails closed.
  const ref=this.config.privateWorker?'main':tag;
  signal.throwIfAborted();
  const r=await this.transport(`${prefix}/actions/workflows/${this.config.workflow}/dispatches`,{method:'POST',redirect:'error',signal,headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({ref,inputs:{job_id:jobId,attempt:String(attempt)}})});
  signal.throwIfAborted();
  if(r.status!==204)throw Error('ACTIONS_DISPATCH_FAILED');
 }
}
