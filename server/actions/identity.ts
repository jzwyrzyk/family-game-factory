import {createRemoteJWKSet,jwtVerify,type JWTVerifyGetKey} from 'jose';
export type WorkerStage='generate'|'test'|'review';
export interface WorkerIdentity {runId:string;repositoryId:string;sha:string;stage:WorkerStage}
export interface WorkerPolicy {audience:string;repository:string;repositoryId:string;workflow:string;approvedSha:string;privateWorker?:boolean;
 /** Only the separately validated DEV gateway sets this exact owner tuple. */
 development?:{owner:string;ownerId:string};}
export class GitHubOIDCVerifier {
 private keys:JWTVerifyGetKey;
 constructor(private policy:WorkerPolicy,keys?:JWTVerifyGetKey){
  if(policy.development){
   const d=policy.development;
   if(!policy.privateWorker||!/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(d.owner)||!(/^[1-9][0-9]*$/).test(d.ownerId)||
    !Number.isSafeInteger(Number(d.ownerId))||Number(d.ownerId)<1||
    !new RegExp('^'+d.owner+'/[A-Za-z0-9_.-]+-dev$').test(policy.repository)||
    ['family-game-factory-lab/family-game-factory-worker','jzwyrzyk/family-game-factory'].includes(policy.repository)||
    !/^[1-9][0-9]*$/.test(policy.repositoryId)||!Number.isSafeInteger(Number(policy.repositoryId))||
    ['1458899834','1458033181'].includes(policy.repositoryId)||policy.workflow!=='factory-private-dev.yml'||
    !/^[a-f0-9]{40}$/.test(policy.approvedSha)||!/^https:\/\/jems-dev-gateway-[0-9]+\.[a-z]+-[a-z]+[0-9]\.run\.app$/.test(policy.audience))
    throw Error('DEV_WORKER_IDENTITY_REQUIRED');
  }
  this.keys=keys||createRemoteJWKSet(new URL('https://token.actions.githubusercontent.com/.well-known/jwks'));
 }
 async verify(token:string):Promise<WorkerIdentity>{
  const {payload:p}=await jwtVerify(token,this.keys,{issuer:'https://token.actions.githubusercontent.com',audience:this.policy.audience,algorithms:['RS256'],maxTokenAge:'10 minutes'});
  const ref=this.policy.privateWorker?'refs/heads/main':'refs/tags/factory-worker-'+this.policy.approvedSha;
  const prefix=this.policy.development?'jems-dev-':'factory-';
  const stage=p.environment===prefix+'generation'?'generate':p.environment===prefix+'sandbox'?'test':p.environment===prefix+'quality'?'review':null;
  const identityValid=Boolean(stage)&&p.repository===this.policy.repository&&p.repository_id===this.policy.repositoryId&&p.ref===ref&&p.sha===this.policy.approvedSha&&
   p.workflow_ref===`${this.policy.repository}/.github/workflows/${this.policy.workflow}@${ref}`&&
   p.event_name==='workflow_dispatch'&&p.run_attempt==='1'&&typeof p.run_id==='string'&&/^[0-9]+$/.test(p.run_id);
  // The branch is for runner-group allowlisting; separate SHA and owner/repo IDs bind approved code.
  const orgValid=!this.policy.privateWorker||
   (p.repository_owner===(this.policy.development?.owner||'family-game-factory-lab')&&p.repository_owner_id===(this.policy.development?.ownerId||'357047835')&&
    p.repository_visibility==='private'&&p.ref_type==='branch'&&p.workflow_sha===this.policy.approvedSha);
  if(!identityValid||!orgValid)throw Error('WORKER_FORBIDDEN');
  return {runId:p.run_id as string,repositoryId:this.policy.repositoryId,sha:this.policy.approvedSha,stage:stage as WorkerStage};
 }
}
