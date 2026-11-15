export interface DispatchPort {dispatch(jobId:string,attempt:number):Promise<void>}
export interface GitHubDispatchConfig {enabled:boolean;repository:string;workflow:string;approvedSha:string}
/** Token is a repository-scoped GitHub App installation credential, never a frontend token or PAT. */
export class GitHubDispatcher implements DispatchPort {
 constructor(private config:GitHubDispatchConfig,private token:()=>Promise<string>,private transport:typeof fetch=fetch){if(config.enabled&&(!/^[\w-]+\/[\w.-]+$/.test(config.repository)||!/^[\w.-]+\.yml$/.test(config.workflow)||!/^[a-f0-9]{40}$/.test(config.approvedSha)))throw Error('ACTIONS_APPROVAL_REQUIRED');}
 async dispatch(jobId:string,attempt:number){if(!this.config.enabled||!/^[\w-]{1,100}$/.test(jobId)||!Number.isInteger(attempt)||attempt<0||attempt>2)throw Error('ACTIONS_UNAVAILABLE');const token=await this.token();if(!token)throw Error('ACTIONS_CREDENTIAL_MISSING');const headers={Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
 const ref=await this.transport(`https://api.github.com/repos/${this.config.repository}/git/ref/tags/factory-worker-${this.config.approvedSha}`,{headers,redirect:'error'});if(!ref.ok||(await ref.json()).object?.sha!==this.config.approvedSha)throw Error('APPROVED_WORKER_TAG_CHANGED');
 const r=await this.transport(`https://api.github.com/repos/${this.config.repository}/actions/workflows/${this.config.workflow}/dispatches`,{method:'POST',redirect:'error',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({ref:'factory-worker-'+this.config.approvedSha,inputs:{job_id:jobId,attempt:String(attempt)}})});if(r.status!==204)throw Error('ACTIONS_DISPATCH_FAILED');}
}
