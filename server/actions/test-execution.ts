import {testCoachOrigin,trialExpiry} from '../coach/test-identity';
import {requireResourceAudience} from '../pipeline/audience';
import type {PipelineState} from '../pipeline/types';
import type {VerifiedSession} from '../contracts/api';
import type {GatewayConfig} from '../gateway';

export const testWorkerRepository='family-game-factory-lab/family-game-factory-worker-test';
export const testWorkerWorkflow='factory-private-test.yml';
export type TestProvider='fixture'|'funded';
export interface TestExecution {providerMode:TestProvider;publicSourceSha:string;expiresAt:number;authorizationSha256?:string}

/** Secret Manager selects this contract. The service name, database, bucket,
 * GitHub installation repository and immutable public/private pins must agree. */
export function testExecution(config:GatewayConfig,env:NodeJS.ProcessEnv=process.env){
 const policy=config.testExecution,service=env.K_SERVICE;
 if(service==='jems-test-gateway'||service==='jems-test-household'){
  testCoachOrigin(env);
  const family=service==='jems-test-gateway',admin=family?config.beta?.administrator:config.householdPrivateHost;
  if(config.projectId!=='jems-jzw-nonprod'||config.artifactBucket!=='jems-jzw-nonprod-jems-test-artifacts'||config.localFile||
    !admin?.audience.startsWith('/projects/'+env.JEMS_TEST_PROJECT_NUMBER+'/global/backendServices/')||
    family&&(config.platformMode!=='PRIVATE_FAMILY_BETA'||config.beta?.environment!=='test')||
    !family&&(config.platformMode!=='HOUSEHOLD'||!config.householdPrivateHost))throw Error('TEST_RUNTIME_ISOLATION_REQUIRED');
 }
 if(!policy){
  if(config.beta?.testReset||config.workerRepository===testWorkerRepository||
   (service==='jems-test-gateway'||service==='jems-test-household')&&(config.active||config.workerRepository||[env.FACTORY_ACTIONS_APPROVED,env.FACTORY_PREMIUM_BUILDER_APPROVED,env.FACTORY_COACH_APPROVED,env.FACTORY_COACH_AUDIO_APPROVED,env.FACTORY_NARRATION_APPROVED].includes('true')))throw Error('TEST_EXECUTION_POLICY_REQUIRED');
  return;
 }
 const family=config.platformMode==='PRIVATE_FAMILY_BETA';
 testCoachOrigin(env);
 if(service!==(family?'jems-test-gateway':'jems-test-household')||config.localFile||
   config.projectId!=='jems-jzw-nonprod'||config.artifactBucket!=='jems-jzw-nonprod-jems-test-artifacts'||
   config.repository!=='jzwyrzyk/family-game-factory'||config.repositoryId!=='1458033181'||
   config.workerRepository!==testWorkerRepository||config.workerWorkflow!==testWorkerWorkflow||
   !/^[1-9]\d*$/.test(config.workerRepositoryId??'')||!Number.isSafeInteger(Number(config.workerRepositoryId))||
   ['1458899834','1458033181'].includes(config.workerRepositoryId!)||!/^[0-9a-f]{40}$/.test(config.workerApprovedSha??'')||
   !/^[0-9a-f]{40}$/.test(policy.publicSourceSha)||config.approvedSha!==policy.publicSourceSha||
   !Number.isSafeInteger(policy.expiresAt)||!['fixture','funded'].includes(policy.providerMode))throw Error('TEST_EXECUTION_POLICY_REQUIRED');
 if(policy.providerMode==='fixture'){
  if(!family||config.beta?.environment!=='test'||config.beta.workerRoute!=='beta-test'||!config.beta.testReset||config.beta.providerEvidence?.length!==0||
     config.active||config.approval?.enabled||config.premiumApproval||env.FACTORY_ACTIONS_APPROVED==='true'||
     [env.FACTORY_COACH_APPROVED,env.FACTORY_COACH_AUDIO_APPROVED,env.FACTORY_NARRATION_APPROVED].includes('true'))throw Error('TEST_FIXTURE_BOUNDARY_REQUIRED');
 }else if(!config.active&&env.FACTORY_COACH_APPROVED==='true'||config.active&&(policy.expiresAt!==trialExpiry(env)||policy.authorizationSha256!==env.JEMS_TEST_TRIAL_AUTHORIZATION_SHA256)||
   family||!config.householdPrivateHost||!config.premiumApproval||config.premiumWorkerApprovedSha!==config.workerApprovedSha||
   config.appOrigin!==config.gatewayOrigin)throw Error('TEST_FUNDED_BOUNDARY_REQUIRED');
 return policy;
}

export function fixtureRunEvidence(state:PipelineState,session:VerifiedSession,jobId:string,workerRepositoryId:string,workerSha:string){
 const job=state.jobs.find(j=>j.id===jobId);
 if(!job)throw Error('NOT_FOUND');
 requireResourceAudience(state,session,job);
 const e=job.execution;
 if(job.status!=='ready'||job.testExecution?.providerMode!=='fixture'||job.testExecution.workerSha!==workerSha||job.adapter!=='mock'||job.usedUnits!==0||job.premiumPolicy||!job.revisionId||!e?.runId||
   !['generate','test'].every(stage=>e.reportReceipts?.some(r=>r.stage===stage&&r.attempt===e.attempt&&r.runId===e.runId&&r.repositoryId===workerRepositoryId&&r.sha===workerSha)))throw Error('TEST_WORKER_EVIDENCE_REQUIRED');
 return {jobId,revisionId:job.revisionId,runId:e.runId,runAttempt:1,dispatchAttempt:e.attempt,workerSha,workerRepositoryId};
}
