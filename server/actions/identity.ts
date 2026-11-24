import {createRemoteJWKSet,jwtVerify,type JWTVerifyGetKey} from 'jose';
export type WorkerStage='generate'|'test'|'review';
export interface WorkerIdentity {dispatchAttempt?:number;runId:string;repositoryId:string;sha:string;stage:WorkerStage}
export interface WorkerPolicy {audience:string;repository:string;repositoryId:string;workflow:string;approvedSha:string;privateWorker?:boolean}
export class GitHubOIDCVerifier {
 private keys:JWTVerifyGetKey;
 constructor(private policy:WorkerPolicy,keys?:JWTVerifyGetKey){this.keys=keys||createRemoteJWKSet(new URL('https://token.actions.githubusercontent.com/.well-known/jwks'));}
 async verify(token:string):Promise<WorkerIdentity>{
  const {payload:p}=await jwtVerify(token,this.keys,{issuer:'https://token.actions.githubusercontent.com',audience:this.policy.audience,algorithms:['RS256'],maxTokenAge:'10 minutes'});
  const ref=this.policy.privateWorker?'refs/heads/main':'refs/tags/factory-worker-'+this.policy.approvedSha;
  const stage=p.environment==='factory-generation'?'generate':p.environment==='factory-sandbox'?'test':p.environment==='factory-quality'?'review':null;
  const identityValid=Boolean(stage)&&p.repository===this.policy.repository&&p.repository_id===this.policy.repositoryId&&p.ref===ref&&p.sha===this.policy.approvedSha&&
   p.workflow_ref===`${this.policy.repository}/.github/workflows/${this.policy.workflow}@${ref}`&&
   p.event_name==='workflow_dispatch'&&p.run_attempt==='1'&&typeof p.run_id==='string'&&/^[0-9]+$/.test(p.run_id);
  // The branch is for runner-group allowlisting; separate SHA and owner/repo IDs bind approved code.
  const orgValid=!this.policy.privateWorker||
   (p.repository_owner==='family-game-factory-lab'&&p.repository_owner_id==='357047835'&&
    p.repository_visibility==='private'&&p.ref_type==='branch'&&p.workflow_sha===this.policy.approvedSha);
  if(!identityValid||!orgValid)throw Error('WORKER_FORBIDDEN');
  return {runId:p.run_id as string,repositoryId:this.policy.repositoryId,sha:this.policy.approvedSha,stage:stage as WorkerStage};
 }
}
