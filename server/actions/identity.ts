import {createRemoteJWKSet,jwtVerify,type JWTVerifyGetKey} from 'jose';
export interface WorkerIdentity {runId:string;repositoryId:string;sha:string;stage:'generate'|'test'}
export interface WorkerPolicy {audience:string;repository:string;repositoryId:string;workflow:string;approvedSha:string}
export class GitHubOIDCVerifier {
 private keys:JWTVerifyGetKey;
 constructor(private policy:WorkerPolicy,keys?:JWTVerifyGetKey){this.keys=keys||createRemoteJWKSet(new URL('https://token.actions.githubusercontent.com/.well-known/jwks'));}
 async verify(token:string):Promise<WorkerIdentity>{const {payload:p}=await jwtVerify(token,this.keys,{issuer:'https://token.actions.githubusercontent.com',audience:this.policy.audience,algorithms:['RS256'],maxTokenAge:'10 minutes'});
 const stage=p.environment==='factory-generation'?'generate':p.environment==='factory-sandbox'?'test':null;
 if(!stage||p.repository!==this.policy.repository||p.repository_id!==this.policy.repositoryId||p.ref!==`refs/tags/factory-worker-${this.policy.approvedSha}`||p.sha!==this.policy.approvedSha||p.workflow_ref!==`${this.policy.repository}/.github/workflows/${this.policy.workflow}@refs/tags/factory-worker-${this.policy.approvedSha}`||p.event_name!=='workflow_dispatch'||p.run_attempt!=='1'||typeof p.run_id!=='string'||!/^\d+$/.test(p.run_id))throw Error('WORKER_FORBIDDEN');return {runId:p.run_id,repositoryId:this.policy.repositoryId,sha:this.policy.approvedSha,stage};}
}
