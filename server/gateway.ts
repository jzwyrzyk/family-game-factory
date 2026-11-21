import {CoachService} from './coach/service';
import {PrivateCoachBridge,PrivateSpeechBridge,privateCoachOrigin} from './coach/private-bridge';
import {CoachAudioService,speechConfig,type SpeechProvider} from './coach/speech';
import {speechHttpHandler} from './coach/audio-http';
import {coachConfig,coachHandler} from './coach/http';
import {GcsPrivateArtifacts} from './storage/artifacts';
import {createServer} from 'node:http';
import {loadGatewayConfig} from './private-config';
import {startBootstrap} from './bootstrap';
import {Firestore} from '@google-cloud/firestore';
import {createRemoteJWKSet,jwtVerify,type JWTVerifyGetKey} from 'jose';
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
import {trustedDeviceHandler} from './trusted-devices';
import {adultPilotConfigured,adultPilotFlags} from './adult-pilot';
import {validateDevAccess,DevIapVerifier,runWithDevAccess,assertDevProjectBinding,devCloudTarget,devServiceOrigin,type DevAccessConfig} from './dev-access';
export interface GatewayConfig {
 active:boolean;appOrigin:string;gatewayOrigin:string;previewOrigin:string;sessionKey:string;previewKey:string;familyId:string;
 repository:string;repositoryId:string;workflow:string;approvedSha:string;
 workerRepository?:string;workerRepositoryId?:string;workerWorkflow?:string;workerApprovedSha?:string;
 githubAppId:string;githubInstallationId:string;githubPrivateKey:string;githubPrivateKeyFile?:string;
 approval:AgentApproval;maxJobMicroUsd:number;workspace:string;projectId?:string;artifactBucket?:string;localFile?:string;schedulerEmail?:string;
 /** Optional private identity-authenticated coach executor URL, never the OpenAI API URL. */
 coachPrivateOrigin?:string;
 /** Absent in production. This opt-in requires a distinct cloud project and worker. */
 devAccess?:DevAccessConfig;
}
export function paidExecutionAllowed(configActive:boolean,approvalFlag:string|undefined){return configActive&&approvalFlag==='true';}
export async function createGateway(config:GatewayConfig,fixtures?:{iapKeys?:JWTVerifyGetKey}){
 if(fixtures?.iapKeys&&(!config.localFile||process.env.K_SERVICE))throw Error('DEV_TEST_KEYS_FORBIDDEN_IN_CLOUD');
 for(const origin of [config.appOrigin,config.gatewayOrigin,config.previewOrigin]){const url=new URL(origin);if(url.origin!==origin||url.protocol!=='https:')throw Error('HTTPS_ORIGINS_REQUIRED');}
 if(new URL(config.previewOrigin).hostname===new URL(config.appOrigin).hostname||new URL(config.previewOrigin).hostname===new URL(config.gatewayOrigin).hostname)throw Error('SEPARATE_PREVIEW_HOST_REQUIRED');
 if(!/^[A-Za-z0-9_-]{1,100}$/.test(config.familyId)||['__proto__','constructor','prototype'].includes(config.familyId))throw Error('FAMILY_ID_REQUIRED');
 const dev=config.devAccess!==undefined||process.env.FACTORY_ENVIRONMENT==='development'?
  validateDevAccess(config.devAccess!,{projectId:config.projectId!,workspace:config.workspace,familyId:config.familyId,artifactBucket:config.artifactBucket,iapService:'jems-dev-app'}):undefined;
 const devTarget=dev?devCloudTarget(dev):undefined;
 if(devTarget){
  if(config.appOrigin!==devServiceOrigin(devTarget,'app')||config.gatewayOrigin!==devServiceOrigin(devTarget,'gateway')||config.previewOrigin!==devServiceOrigin(devTarget,'preview'))throw Error('DEV_ORIGINS_REQUIRED');
  if(config.sessionKey===config.previewKey||config.sessionKey.length<32||config.previewKey.length<32)throw Error('DEV_DISTINCT_KEYS_REQUIRED');
  if(process.env.FACTORY_COACH_AUDIO_PROJECT&&process.env.FACTORY_COACH_AUDIO_PROJECT!==devTarget.projectId)throw Error('DEV_SPEECH_PROJECT_REQUIRED');
  if(config.schedulerEmail!==undefined&&config.schedulerEmail!==`jems-dev-scheduler@${devTarget.projectId}.iam.gserviceaccount.com`)throw Error('DEV_SCHEDULER_IDENTITY_REQUIRED');
 }
 // Fail closed on misplaced model credentials. This gateway is deliberately
 // keyless: only the independently approved private generation environment
 // is permitted to execute model calls.
 if(process.env.FACTORY_COACH_API_KEY||process.env.FACTORY_OPENAI_API_KEY||process.env.FACTORY_COACH_PRIVATE_OPENAI_API_KEY)throw Error('MODEL_KEY_FORBIDDEN_IN_GATEWAY');
 const coachTarget=config.coachPrivateOrigin?privateCoachOrigin(config.coachPrivateOrigin,devTarget):null;
 if(coachTarget&&[config.appOrigin,config.gatewayOrigin,config.previewOrigin].includes(coachTarget))throw Error('COACH_EXECUTOR_MUST_BE_SEPARATE');
 const adult=adultPilotFlags(process.env);
 // The existing public frontend is shared. Only a server-verified, recently
 // unlocked adult profile may use the temporary pilot's paid API routes.
 if((adult.enabled||dev)&&!adultPilotConfigured(adult))
  throw Error('ADULT_PILOT_PROFILE_ACCESS_REQUIRED');
 const paidEnabled=paidExecutionAllowed(config.active,process.env.FACTORY_ACTIONS_APPROVED);
 if(config.active)validateApproval(config.approval);if(!Number.isInteger(config.maxJobMicroUsd)||config.maxJobMicroUsd<1||config.maxJobMicroUsd>1000000)throw Error('JOB_BUDGET_REQUIRED');
 if(process.env.K_SERVICE&&config.localFile)throw Error('CLOUD_RUN_REQUIRES_DURABLE_FIRESTORE');
 const privateWorker=Boolean(config.workerRepository||config.workerRepositoryId||config.workerWorkflow||config.workerApprovedSha);
 const completeWorker=!!config.workerRepository&&!!config.workerRepositoryId&&!!config.workerWorkflow&&!!config.workerApprovedSha&&
  config.workerRepository!==config.repository&&Number.isSafeInteger(Number(config.workerRepositoryId))&&Number(config.workerRepositoryId)>0&&
  config.workerWorkflow===(dev?'factory-private-dev.yml':'factory-private.yml')&&/^[a-f0-9]{40}$/.test(config.workerApprovedSha);
 if(dev){
  if(!completeWorker||config.repository!=='jzwyrzyk/family-game-factory'||config.repositoryId!=='1458033181'||!/^[a-f0-9]{40}$/.test(config.approvedSha))throw Error('DEV_PRIVATE_WORKER_REQUIRED');
 }else if(privateWorker&&(!completeWorker||config.repository!=='jzwyrzyk/family-game-factory'||config.repositoryId!=='1458033181'||config.approvedSha!=='dcb887e6a51ba000fda1ccc42b9d198f8b9895f9'||config.workerRepositoryId!=='1458899834'||config.workerRepository!=='family-game-factory-lab/family-game-factory-worker'))throw Error('PRIVATE_WORKER_CONFIG_REQUIRED');
 if(config.active&&!privateWorker)throw Error('PRIVATE_WORKER_REQUIRED_FOR_ACTIVATION');
 const target={repository:config.workerRepository||config.repository,repositoryId:config.workerRepositoryId||config.repositoryId,workflow:config.workerWorkflow||config.workflow,approvedSha:config.workerApprovedSha||config.approvedSha,privateWorker};
 const verifier=new GitHubOIDCVerifier({audience:config.gatewayOrigin,...target,...(dev?{development:{owner:dev.workerOwner,ownerId:dev.workerOwnerId}}:{})});
 const iap=dev?new DevIapVerifier(dev,fixtures?.iapKeys):undefined;
 if(dev&&!config.localFile){
  if(process.env.K_SERVICE!=='jems-dev-gateway')throw Error('DEV_GATEWAY_SERVICE_REQUIRED');
  await assertDevProjectBinding(dev);
 }
 const repo=config.localFile?await FileRepository.open(config.localFile):new FirestoreRepository(new Firestore({projectId:config.projectId}),config.workspace,config.artifactBucket?new GcsPrivateArtifacts(config.artifactBucket,config.workspace):undefined);
 await repo.snapshot();
 const agent={kind:'metered-api' as const,available:paidEnabled,generate:async()=>{throw Error('ACTIONS_WORKER_REQUIRED');}};
 const service=new JobService(repo,agent,{test:async()=>{throw Error('ACTIONS_WORKER_REQUIRED');}},{allowMock:false,maxUnits:config.maxJobMicroUsd,timeoutMs:900000,maxRetries:2,requireVerifiedParentPrivacy:!adult.enabled,adultPilotMode:adult.enabled,devTestPolicy:dev});
 const token=installationTokenProvider({appId:config.githubAppId,installationId:config.githubInstallationId,repositoryId:Number(target.repositoryId)},()=>config.githubPrivateKey);
 const dispatcher=new GitHubDispatcher({enabled:paidEnabled,repository:target.repository,workflow:target.workflow,approvedSha:target.approvedSha,privateWorker,development:dev},token),coordinator=new ActionCoordinator(repo,dispatcher,{...config.approval,enabled:paidEnabled&&config.approval.enabled},900000,!adult.enabled,adult.enabled,dev);
 const worker=workerHandler(coordinator,verifier),http={sessionKey:config.sessionKey,previewKey:config.previewKey,appOrigin:config.appOrigin,previewOrigin:config.previewOrigin,dispatch:async(id:string)=>{await coordinator.enqueue(id);await coordinator.tick();},poll:()=>coordinator.tick()};
 const coachService=new CoachService(repo,{...coachConfig(process.env),requireVerifiedParentPrivacy:!adult.enabled,devTestPolicy:dev},
   coachTarget?new PrivateCoachBridge(coachTarget,undefined,undefined,devTarget):undefined);
 const coach=coachHandler(coachService,{appOrigin:config.appOrigin,sessionKey:config.sessionKey},repo);
 const offlineSpeech:SpeechProvider={readiness:async()=>false,transcribe:async()=>{throw Error('AUDIO_UNAVAILABLE');}};
 const audio=speechHttpHandler(new CoachAudioService(repo,{...speechConfig(process.env),requireVerifiedParentPrivacy:!adult.enabled,devTestPolicy:dev},
   coachTarget?new PrivateSpeechBridge(coachTarget,undefined,undefined,devTarget):offlineSpeech),{appOrigin:config.appOrigin,sessionKey:config.sessionKey},repo);
 const api=apiHandler(service,http,repo),sessions=sessionHandler(repo,{appOrigin:config.appOrigin,familyId:config.familyId,sessionKey:config.sessionKey}),trusted=trustedDeviceHandler(repo,{appOrigin:config.appOrigin,familyId:config.familyId,sessionKey:config.sessionKey,adultPilot:adult,eraseCoachReceipts:session=>coachService.eraseFamilyReceipts(session)});
 const schedulerKeys=createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
 return {service,repo,coordinator,handler:async(req:Parameters<typeof api>[0],res:Parameters<typeof api>[1])=>{
  if(dev&&req.headers.host!==new URL(config.gatewayOrigin).host){res.writeHead(403);res.end();return;}
  const url=new URL(req.url!,config.gatewayOrigin);
  if(url.pathname==='/health'){res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');try{await repo.snapshot();res.end(JSON.stringify({ready:true,paidExecution:paidEnabled}));}catch{res.statusCode=503;res.end(JSON.stringify({ready:false,paidExecution:false}));}return;}
  if(url.pathname.startsWith('/preview/')){res.writeHead(403);res.end('Separate preview origin required');return;}
  if(url.pathname.startsWith('/v1/worker/')){await worker(req,res);queueMicrotask(()=>{void coordinator.tick().catch(()=>{});});return;}
  if(url.pathname==='/v1/internal/dispatch'){
   try{if(req.method!=='POST'||!config.schedulerEmail)throw Error();const token=req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];if(!token)throw Error();const {payload}=await jwtVerify(token,schedulerKeys,{issuer:['https://accounts.google.com','accounts.google.com'],audience:config.gatewayOrigin,algorithms:['RS256']});if(payload.email!==config.schedulerEmail||payload.email_verified!==true)throw Error();await coordinator.tick();res.writeHead(204);res.end();}catch{res.writeHead(403);res.end();}return;
  }
  const browser=async()=>{
  if(url.pathname==='/v1/coach/audio'||url.pathname==='/v1/coach/audio/status'){await audio(req,res);return;}
  if(url.pathname==='/v1/coach'||url.pathname==='/v1/coach/status'||url.pathname==='/v1/coach/erase'){await coach(req,res);return;}
  if(url.pathname==='/v1/sessions'){await sessions(req,res);return;}
  if(['/v1/sessions/enroll','/v1/sessions/renew','/v1/sessions/status'].includes(url.pathname)||url.pathname.startsWith('/v1/sessions/adult/')||url.pathname==='/v1/devices'||url.pathname.startsWith('/v1/devices/')){await trusted(req,res);return;}
  await api(req,res);
  };
  if(dev&&iap){
   let identity;try{identity=await iap.verify(req.headers['x-goog-iap-jwt-assertion']);}
   catch{res.writeHead(403,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({errorCode:'DEV_ADULT_ACCESS_REQUIRED'}));return;}
   await runWithDevAccess(dev,identity,browser);
  }else await browser();
 }};
}
// Configuration file is mounted privately from Secret Manager; never VITE_ or public/factory-config.json.
async function main(){if(process.env.FACTORY_BOOTSTRAP==='true'){startBootstrap();return;}if(!process.env.FACTORY_PRIVATE_CONFIG)throw Error('PRIVATE_CONFIG_REQUIRED');const config=await loadGatewayConfig(process.env.FACTORY_PRIVATE_CONFIG);const gateway=await createGateway(config);createServer((req,res)=>{void gateway.handler(req,res).catch(()=>{if(!res.headersSent)res.writeHead(503);res.end('Private service unavailable');});}).listen(Number(process.env.PORT)||8080);}
if(process.argv.some(x=>/[/\\]gateway\.ts$/.test(x)))void main().catch(()=>{console.error('Gateway configuration/startup failed. No credentials are logged.');process.exitCode=1;});
