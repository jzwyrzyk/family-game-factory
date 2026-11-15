import {GcsPrivateArtifacts} from './storage/artifacts';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {Firestore} from '@google-cloud/firestore';
import {createRemoteJWKSet,jwtVerify} from 'jose';
import {JobService} from './pipeline/service';
import {FirestoreRepository} from './pipeline/firestore';
import {FileRepository} from './pipeline/repository';
import {apiHandler} from './pipeline/http';
import {ActionCoordinator} from './actions/coordinator';
import {GitHubDispatcher} from './actions/dispatcher';
import {GitHubOIDCVerifier} from './actions/identity';
import {workerHandler} from './actions/http';
import {installationTokenProvider} from './actions/app-token';
import {validateApproval,type AgentApproval} from './agent/openai';
import {sessionHandler} from './sessions';
export interface GatewayConfig {
 active:boolean;appOrigin:string;gatewayOrigin:string;previewOrigin:string;sessionKey:string;previewKey:string;familyId:string;
 repository:string;repositoryId:string;workflow:string;approvedSha:string;githubAppId:string;githubInstallationId:string;githubPrivateKey:string;
 approval:AgentApproval;maxJobMicroUsd:number;workspace:string;projectId?:string;artifactBucket?:string;localFile?:string;schedulerEmail?:string;
}
export async function createGateway(config:GatewayConfig){
 for(const origin of [config.appOrigin,config.gatewayOrigin,config.previewOrigin]){const url=new URL(origin);if(url.origin!==origin||url.protocol!=='https:')throw Error('HTTPS_ORIGINS_REQUIRED');}
 if(new URL(config.previewOrigin).hostname===new URL(config.appOrigin).hostname||new URL(config.previewOrigin).hostname===new URL(config.gatewayOrigin).hostname)throw Error('SEPARATE_PREVIEW_HOST_REQUIRED');
 if(!/^[A-Za-z0-9_-]{1,100}$/.test(config.familyId)||['__proto__','constructor','prototype'].includes(config.familyId))throw Error('FAMILY_ID_REQUIRED');
 if(config.active)validateApproval(config.approval);if(!Number.isInteger(config.maxJobMicroUsd)||config.maxJobMicroUsd<1||config.maxJobMicroUsd>1000000)throw Error('JOB_BUDGET_REQUIRED');
 if(process.env.K_SERVICE&&config.localFile)throw Error('CLOUD_RUN_REQUIRES_DURABLE_FIRESTORE');
 const repo=config.localFile?await FileRepository.open(config.localFile):new FirestoreRepository(new Firestore({projectId:config.projectId}),config.workspace,config.artifactBucket?new GcsPrivateArtifacts(config.artifactBucket,config.workspace):undefined);
 await repo.snapshot();
 const agent={kind:'metered-api' as const,available:config.active,generate:async()=>{throw Error('ACTIONS_WORKER_REQUIRED');}};
 const service=new JobService(repo,agent,{test:async()=>{throw Error('ACTIONS_WORKER_REQUIRED');}},{allowMock:false,maxUnits:config.maxJobMicroUsd,timeoutMs:900000,maxRetries:2});
 const token=installationTokenProvider({appId:config.githubAppId,installationId:config.githubInstallationId,repositoryId:Number(config.repositoryId)},()=>config.githubPrivateKey);
 const dispatcher=new GitHubDispatcher({enabled:config.active,repository:config.repository,workflow:config.workflow,approvedSha:config.approvedSha},token),coordinator=new ActionCoordinator(repo,dispatcher,{...config.approval,enabled:config.active&&config.approval.enabled});
 const verifier=new GitHubOIDCVerifier({audience:config.gatewayOrigin,repository:config.repository,repositoryId:config.repositoryId,workflow:config.workflow,approvedSha:config.approvedSha});
 const worker=workerHandler(coordinator,verifier),http={sessionKey:config.sessionKey,previewKey:config.previewKey,appOrigin:config.appOrigin,previewOrigin:config.previewOrigin,dispatch:async(id:string)=>{await coordinator.enqueue(id);await coordinator.tick();}};
 const api=apiHandler(service,http),sessions=sessionHandler(repo,{appOrigin:config.appOrigin,familyId:config.familyId,sessionKey:config.sessionKey});
 const schedulerKeys=createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
 return {service,repo,coordinator,handler:async(req:Parameters<typeof api>[0],res:Parameters<typeof api>[1])=>{
  const url=new URL(req.url!,config.gatewayOrigin);
  if(url.pathname==='/health'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ready:true,paidExecution:config.active}));return;}
  if(url.pathname.startsWith('/preview/')){res.writeHead(403);res.end('Separate preview origin required');return;}
  if(url.pathname.startsWith('/v1/worker/')){await worker(req,res);queueMicrotask(()=>{void coordinator.tick().catch(()=>{});});return;}
  if(url.pathname==='/v1/internal/dispatch'){
   try{if(req.method!=='POST'||!config.schedulerEmail)throw Error();const token=req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];if(!token)throw Error();const {payload}=await jwtVerify(token,schedulerKeys,{issuer:['https://accounts.google.com','accounts.google.com'],audience:config.gatewayOrigin,algorithms:['RS256']});if(payload.email!==config.schedulerEmail||payload.email_verified!==true)throw Error();await coordinator.tick();res.writeHead(204);res.end();}catch{res.writeHead(403);res.end();}return;
  }
  if(url.pathname==='/v1/sessions'){await sessions(req,res);return;}
  await api(req,res);
 }};
}
// Configuration file is mounted privately from Secret Manager; never VITE_ or public/factory-config.json.
async function main(){if(!process.env.FACTORY_PRIVATE_CONFIG)throw Error('PRIVATE_CONFIG_REQUIRED');const config=JSON.parse(await readFile(process.env.FACTORY_PRIVATE_CONFIG,'utf8')) as GatewayConfig;const gateway=await createGateway(config);createServer((req,res)=>{void gateway.handler(req,res).catch(()=>{if(!res.headersSent)res.writeHead(503);res.end('Private service unavailable');});}).listen(Number(process.env.PORT)||8080);}
if(process.argv.some(x=>/[/\\]gateway\.ts$/.test(x)))void main().catch(()=>{console.error('Gateway configuration/startup failed. No credentials are logged.');process.exitCode=1;});
