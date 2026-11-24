import {platformMode,validateBeta,familyOrigin,uuid,type BetaConfig} from './beta/model';
import {mappedHouseholdRepository,type HouseholdBinding} from './beta/household';
import {FamilyDirectory} from './beta/store';
import {firestoreStore} from './beta/documents';
import {betaRouter,type Surface} from './beta/router';
import {betaHosting} from './beta/hosting';
import {assertRunJob} from './beta/worker';
import type {Repository} from './pipeline/types';
import {CoachService} from './coach/service';
import {reconcilePaidReceipts} from './coach/receipts';
import {PrivateCoachBridge,PrivateSpeechBridge,privateCoachOrigin} from './coach/private-bridge';
import {CoachAudioService,speechConfig,type SpeechProvider} from './coach/speech';
import {speechHttpHandler} from './coach/audio-http';
import {NarrationService,narrationConfig,type NarrationProvider} from './coach/narration';
import {narrationHttpHandler} from './coach/narration-http';
import {PrivateNarrationBridge} from './coach/private-narration-bridge';
import {coachConfig,coachHandler} from './coach/http';
import {GcsPrivateArtifacts} from './storage/artifacts';
import {createServer} from 'node:http';
import {loadGatewayConfig} from './private-config';
import {startBootstrap} from './bootstrap';
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
import {isPremiumApproval,validatePremiumApproval,type PremiumApproval} from './agent/model-policy';
import type {PremiumPilot} from './pipeline/premium-policy';
import {sessionHandler} from './sessions';
import {trustedDeviceHandler} from './trusted-devices';
import {adultPilotConfigured,adultPilotFlags} from './adult-pilot';
export interface GatewayConfig {
 platformMode?:'HOUSEHOLD'|'PRIVATE_FAMILY_BETA'|'PUBLIC'; beta?:BetaConfig;householdBudgetBinding?:HouseholdBinding;
 active:boolean;appOrigin:string;gatewayOrigin:string;previewOrigin:string;sessionKey:string;previewKey:string;familyId:string;
 repository:string;repositoryId:string;workflow:string;approvedSha:string;
 workerRepository?:string;workerRepositoryId?:string;workerWorkflow?:string;workerApprovedSha?:string;
 githubAppId:string;githubInstallationId:string;githubPrivateKey:string;githubPrivateKeyFile?:string;
 premiumApproval?:PremiumApproval;premiumWorkerApprovedSha?:string;
 approval:AgentApproval;maxJobMicroUsd:number;workspace:string;projectId?:string;artifactBucket?:string;localFile?:string;schedulerEmail?:string;
 /** Optional private identity-authenticated coach executor URL, never the OpenAI API URL. */
 coachPrivateOrigin?:string;
}
export function paidExecutionAllowed(configActive:boolean,approvalFlag:string|undefined){return configActive&&approvalFlag==='true';}
/** An explicitly requested but unavailable pilot must never select legacy code generation. */
export function approvedPremiumPilot(config:GatewayConfig,requested:boolean,adultAuthorized:boolean,paidEnabled:boolean):PremiumPilot|undefined {
 if(!requested)return undefined;
 if(!adultAuthorized||!paidEnabled||!config.approval.enabled||!config.premiumApproval)throw Error('MODEL_POLICY_UNAVAILABLE');
 if(!config.workerApprovedSha||!config.premiumWorkerApprovedSha||!/^([0-9a-f]{40})$/.test(config.premiumWorkerApprovedSha)||
    config.premiumWorkerApprovedSha!==config.workerApprovedSha)throw Error('MODEL_POLICY_WORKER_MISMATCH');
 validatePremiumApproval(config.premiumApproval);
 return {approval:config.premiumApproval,workerSha:config.premiumWorkerApprovedSha};
}
export async function createGateway(config:GatewayConfig,tenantRepo?:Repository){
 if((platformMode(config.platformMode)==='PRIVATE_FAMILY_BETA')!==!!tenantRepo)throw Error('BETA_GATEWAY_REQUIRED');
 for(const origin of [config.appOrigin,config.gatewayOrigin,config.previewOrigin]){const url=new URL(origin);if(url.origin!==origin||url.protocol!=='https:')throw Error('HTTPS_ORIGINS_REQUIRED');}
 if(new URL(config.previewOrigin).hostname===new URL(config.appOrigin).hostname||new URL(config.previewOrigin).hostname===new URL(config.gatewayOrigin).hostname)throw Error('SEPARATE_PREVIEW_HOST_REQUIRED');
 if(!/^[A-Za-z0-9_-]{1,100}$/.test(config.familyId)||['__proto__','constructor','prototype'].includes(config.familyId))throw Error('FAMILY_ID_REQUIRED');
 // Fail closed on misplaced model credentials. This gateway is deliberately
 // keyless: only the independently approved private generation environment
 // is permitted to execute model calls.
 if(process.env.FACTORY_COACH_API_KEY||process.env.FACTORY_OPENAI_API_KEY||process.env.FACTORY_COACH_PRIVATE_OPENAI_API_KEY)throw Error('MODEL_KEY_FORBIDDEN_IN_GATEWAY');
 const coachTarget=config.coachPrivateOrigin?privateCoachOrigin(config.coachPrivateOrigin):null;
 if(coachTarget&&[config.appOrigin,config.gatewayOrigin,config.previewOrigin].includes(coachTarget))throw Error('COACH_EXECUTOR_MUST_BE_SEPARATE');
 const environment=tenantRepo?{...process.env,FACTORY_ADULT_PILOT_MODE:'false',FACTORY_PREMIUM_BUILDER_APPROVED:'false'}:process.env;
 const adult=adultPilotFlags(environment);
 // The existing public frontend is shared. Only a server-verified, recently
 // unlocked adult profile may use the temporary pilot's paid API routes.
 if(adult.enabled&&!adultPilotConfigured(adult))
  throw Error('ADULT_PILOT_PROFILE_ACCESS_REQUIRED');
 const paidEnabled=paidExecutionAllowed(config.active,process.env.FACTORY_ACTIONS_APPROVED);
 if(!config.approval||isPremiumApproval(config.approval))throw Error('LEGACY_APPROVAL_REQUIRED');
 if(config.active)validateApproval(config.approval);if(!Number.isInteger(config.maxJobMicroUsd)||config.maxJobMicroUsd<1||config.maxJobMicroUsd>1000000)throw Error('JOB_BUDGET_REQUIRED');
 if(process.env.K_SERVICE&&config.localFile)throw Error('CLOUD_RUN_REQUIRES_DURABLE_FIRESTORE');
 let premiumPilot:PremiumPilot|undefined,premiumUnavailable=false;
 try{premiumPilot=approvedPremiumPilot(config,environment.FACTORY_PREMIUM_BUILDER_APPROVED==='true',adultPilotConfigured(adult),paidEnabled);}
 catch{premiumUnavailable=true;} // Refuse new builds while keeping recovery and saved revisions online.
 let mapped:Repository|undefined;
 if(config.householdBudgetBinding){
  const b=config.householdBudgetBinding;
  if(tenantRepo||config.localFile||b.familyId!==config.familyId||b.workspace!==config.workspace||!config.projectId)throw Error('HOUSEHOLD_MAPPING_REQUIRED');
  mapped=mappedHouseholdRepository(firestoreStore(new Firestore({projectId:config.projectId})),b,
   config.artifactBucket?new GcsPrivateArtifacts(config.artifactBucket,b.workspace):undefined);
 }
 const repo=tenantRepo??mapped??(config.localFile?await FileRepository.open(config.localFile):new FirestoreRepository(new Firestore({projectId:config.projectId}),config.workspace,config.artifactBucket?new GcsPrivateArtifacts(config.artifactBucket,config.workspace):undefined));
 await reconcilePaidReceipts(repo);
 const agent={kind:'metered-api' as const,available:paidEnabled,generate:async()=>{throw Error('ACTIONS_WORKER_REQUIRED');}};
 const service=new JobService(repo,agent,{test:async()=>{throw Error('ACTIONS_WORKER_REQUIRED');}},{allowMock:false,maxUnits:config.maxJobMicroUsd,timeoutMs:900000,maxRetries:2,requireVerifiedParentPrivacy:!adult.enabled,adultPilotMode:adult.enabled,premiumPilot,premiumConfigured:!!config.premiumApproval,premiumUnavailable});
 const privateWorker=Boolean(config.workerRepository||config.workerRepositoryId||config.workerWorkflow||config.workerApprovedSha);
 if(privateWorker&&(!config.workerRepository||!config.workerRepositoryId||!config.workerWorkflow||!config.workerApprovedSha||config.workerRepository===config.repository||config.repository!=='jzwyrzyk/family-game-factory'||config.repositoryId!=='1458033181'||config.approvedSha!=='dcb887e6a51ba000fda1ccc42b9d198f8b9895f9'||config.workerRepositoryId!=='1458899834'||!Number.isSafeInteger(Number(config.workerRepositoryId))||Number(config.workerRepositoryId)<1||config.workerRepository!=='family-game-factory-lab/family-game-factory-worker'||config.workerWorkflow!=='factory-private.yml'||config.workerApprovedSha.length!==40||![...config.workerApprovedSha].every(c=>'0123456789abcdef'.includes(c))))throw Error('PRIVATE_WORKER_CONFIG_REQUIRED');
 if(config.active&&!privateWorker)throw Error('PRIVATE_WORKER_REQUIRED_FOR_ACTIVATION');
 const target={repository:config.workerRepository||config.repository,repositoryId:config.workerRepositoryId||config.repositoryId,workflow:config.workerWorkflow||config.workflow,approvedSha:config.workerApprovedSha||config.approvedSha,privateWorker};
 const token=installationTokenProvider({appId:config.githubAppId,installationId:config.githubInstallationId,repositoryId:Number(target.repositoryId)},()=>config.githubPrivateKey);
 const dispatcher=new GitHubDispatcher({enabled:paidEnabled,repository:target.repository,workflow:target.workflow,approvedSha:target.approvedSha,privateWorker,callbackRoute:tenantRepo?config.beta?.workerRoute:undefined},token),coordinator=new ActionCoordinator(repo,dispatcher,{...config.approval,enabled:paidEnabled&&config.approval.enabled},900000,!adult.enabled,adult.enabled,premiumPilot);
 const verifier=new GitHubOIDCVerifier({audience:config.gatewayOrigin,repository:target.repository,repositoryId:target.repositoryId,workflow:target.workflow,approvedSha:target.approvedSha,privateWorker});
 const worker=workerHandler(coordinator,verifier),http={sessionKey:config.sessionKey,previewKey:config.previewKey,appOrigin:config.appOrigin,previewOrigin:config.previewOrigin,dispatch:async(id:string)=>{await coordinator.enqueue(id);await coordinator.tick();},poll:()=>coordinator.tick()};
 const coachService=new CoachService(repo,{...coachConfig(environment),requireVerifiedParentPrivacy:!adult.enabled},
   coachTarget?new PrivateCoachBridge(coachTarget):undefined);
 const coach=coachHandler(coachService,{appOrigin:config.appOrigin,sessionKey:config.sessionKey},repo);
 const offlineSpeech:SpeechProvider={readiness:async()=>false,transcribe:async()=>{throw Error('AUDIO_UNAVAILABLE');}};
 const audio=speechHttpHandler(new CoachAudioService(repo,{...speechConfig(environment),requireVerifiedParentPrivacy:!adult.enabled},
   coachTarget?new PrivateSpeechBridge(coachTarget):offlineSpeech),{appOrigin:config.appOrigin,sessionKey:config.sessionKey},repo);
 const offlineNarration:NarrationProvider={readiness:async()=>false,read:async()=>{throw Error('NARRATION_UNAVAILABLE');}};
 const narration=narrationHttpHandler(new NarrationService(repo,{...narrationConfig(environment),requireVerifiedParentPrivacy:!adult.enabled},
   coachTarget?new PrivateNarrationBridge(coachTarget):offlineNarration),{appOrigin:config.appOrigin,sessionKey:config.sessionKey},repo);
 const api=apiHandler(service,http,repo),sessions=sessionHandler(repo,{appOrigin:config.appOrigin,familyId:config.familyId,sessionKey:config.sessionKey}),trusted=trustedDeviceHandler(repo,{appOrigin:config.appOrigin,familyId:config.familyId,sessionKey:config.sessionKey,adultPilot:adult,firstParty:!!tenantRepo,eraseCoachReceipts:session=>coachService.eraseFamilyReceipts(session)});
 const schedulerKeys=createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
 return {service,repo,coordinator,handler:async(req:Parameters<typeof api>[0],res:Parameters<typeof api>[1])=>{
  const url=new URL(req.url!,config.gatewayOrigin);
  if(url.pathname==='/health'){res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');try{await repo.snapshot();res.end(JSON.stringify({ready:true,paidExecution:paidEnabled}));}catch{res.statusCode=503;res.end(JSON.stringify({ready:false,paidExecution:false}));}return;}
  if(url.pathname.startsWith('/preview/')){res.writeHead(403);res.end('Separate preview origin required');return;}
  if(url.pathname.startsWith('/v1/worker/')){await worker(req,res);queueMicrotask(()=>{void coordinator.tick().catch(()=>{});});return;}
  if(url.pathname==='/v1/internal/dispatch'){
   try{if(req.method!=='POST'||!config.schedulerEmail)throw Error();const token=req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];if(!token)throw Error();const {payload}=await jwtVerify(token,schedulerKeys,{issuer:['https://accounts.google.com','accounts.google.com'],audience:config.gatewayOrigin,algorithms:['RS256']});if(payload.email!==config.schedulerEmail||payload.email_verified!==true)throw Error();await reconcilePaidReceipts(repo);await coordinator.tick();res.writeHead(204);res.end();}catch{res.writeHead(403);res.end();}return;
  }
  if(url.pathname==='/v1/coach/audio'||url.pathname==='/v1/coach/audio/status'){await audio(req,res);return;}
  if(url.pathname==='/v1/coach/narration'||url.pathname==='/v1/coach/narration/status'){await narration(req,res);return;}
  if(url.pathname==='/v1/coach'||url.pathname==='/v1/coach/status'||url.pathname==='/v1/coach/erase'){await coach(req,res);return;}
  if(url.pathname==='/v1/sessions'){await sessions(req,res);return;}
  if(['/v1/sessions/enroll','/v1/sessions/renew','/v1/sessions/status'].includes(url.pathname)||url.pathname.startsWith('/v1/sessions/adult/')||url.pathname==='/v1/devices'||url.pathname.startsWith('/v1/devices/')){await trusted(req,res);return;}
  await api(req,res);
 }};
}
export async function privateBetaGateway(config:GatewayConfig,surface?:Surface){
 const beta=validateBeta(config.beta,config.workspace);
 if(platformMode(config.platformMode)!=='PRIVATE_FAMILY_BETA'||config.appOrigin!==beta.hubOrigin||
    config.gatewayOrigin!==beta.hubOrigin||config.localFile||!config.projectId||!config.artifactBucket||
    new URL(config.previewOrigin).hostname.endsWith('.'+new URL(beta.hubOrigin).hostname)||
    (config.active&&!beta.workerRoute)||config.sessionKey.length<32||config.previewKey.length<32||config.sessionKey===config.previewKey)throw Error('BETA_CONFIGURATION_REQUIRED');
 const db=new Firestore({projectId:config.projectId});
 const d=new FamilyDirectory(firestoreStore(db),beta,workspace=>new GcsPrivateArtifacts(config.artifactBucket!,workspace));
 const runtimes=new Map<string,ReturnType<typeof createGateway>>();
 const runtime=(id:string)=>{
  if(!uuid(id))throw Error('INVALID_FAMILY');
  let result=runtimes.get(id);
  if(!result){
   result=createGateway({...config,familyId:id,workspace:'beta-'+id,appOrigin:familyOrigin(beta,id),
    premiumApproval:undefined,premiumWorkerApprovedSha:undefined},d.repository(id));
   runtimes.set(id,result);void result.catch(()=>runtimes.delete(id));
  }
  return result;
 };
 const verifier=new GitHubOIDCVerifier({audience:config.gatewayOrigin,repository:config.workerRepository??'',repositoryId:config.workerRepositoryId??'',
  workflow:config.workerWorkflow??'',approvedSha:config.workerApprovedSha??'',privateWorker:true});
 const token=installationTokenProvider({appId:config.githubAppId,installationId:config.githubInstallationId,repositoryId:Number(config.workerRepositoryId)},()=>config.githubPrivateKey);
 const schedulerKeys=createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
 return betaRouter(d,config.sessionKey,{preview:{environment:beta.environment,hubOrigin:beta.hubOrigin,previewOrigin:config.previewOrigin,previewKey:config.previewKey},surface:surface??betaHosting('dist-family-beta',beta,config.previewOrigin),runtime:async id=>(await runtime(id)).handler,
  worker:async(req,res)=>{
   const id=req.url?.match(/^\/v1\/worker\/jobs\/([a-f0-9-]+)\/(?:claim|report|status)$/)?.[1];
   const bearer=req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
   if(!uuid(id)||!bearer)throw Error('FORBIDDEN');
   const workerIdentity=await verifier.verify(bearer);
   if(!beta.workerRoute)throw Error('FORBIDDEN');
   const dispatchAttempt=await assertRunJob(workerIdentity,id,config.workerRepository!,token,beta.workerRoute);
   const owner=await d.db.run(tx=>tx.get<{familyId:string}>(d.root+'/jobs/'+id));if(!owner)throw Error('NOT_FOUND');
   const target=await runtime(owner.familyId);
   await workerHandler(target.coordinator,{verify:async()=>({...workerIdentity,dispatchAttempt})})(req,res);
   void target.coordinator.tick().catch(()=>{});
  },
  scheduler:async(req,res)=>{
   const bearer=req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
   if(req.method!=='POST'||!bearer||!config.schedulerEmail)throw Error('FORBIDDEN');
   const {payload}=await jwtVerify(bearer,schedulerKeys,{issuer:['https://accounts.google.com','accounts.google.com'],audience:config.gatewayOrigin,algorithms:['RS256']});
   if(payload.email!==config.schedulerEmail||payload.email_verified!==true)throw Error('FORBIDDEN');
   const index=await d.db.run(tx=>tx.get<{ids:string[]}>(d.root+'/metadata/directory'));
   let failed=false;
   for(const id of index?.ids??[]){
    try{
     const retired=await d.withFamily(id,async(_tx,f)=>f.request?.kind==='deletion'&&['deleting','completed'].includes(f.request.state));
     if(retired)continue;
     const target=await runtime(id);await reconcilePaidReceipts(target.repo);await target.coordinator.tick();
    }catch{failed=true;}
   }
   if(failed)throw Error('RECONCILIATION_INCOMPLETE');
   res.writeHead(204);res.end();
  }});
}
// Configuration file is mounted privately from Secret Manager; never VITE_ or public/factory-config.json.
async function main(){if(process.env.FACTORY_BOOTSTRAP==='true'){startBootstrap();return;}if(!process.env.FACTORY_PRIVATE_CONFIG)throw Error('PRIVATE_CONFIG_REQUIRED');const config=await loadGatewayConfig(process.env.FACTORY_PRIVATE_CONFIG);const handler=platformMode(config.platformMode)==='PRIVATE_FAMILY_BETA'?await privateBetaGateway(config):(await createGateway(config)).handler;createServer((req,res)=>{void handler(req,res).catch(()=>{if(!res.headersSent)res.writeHead(503);res.end('Private service unavailable');});}).listen(Number(process.env.PORT)||8080);}
if(process.argv.some(x=>/[/\\]gateway\.ts$/.test(x)))void main().catch(()=>{console.error('Gateway configuration/startup failed. No credentials are logged.');process.exitCode=1;});
