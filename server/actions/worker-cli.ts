// Trusted Actions controller. It never evaluates or logs model output.
import {safeProviderFailure} from './provider-failure';
import {appendFile} from 'node:fs/promises';
import {OpenAIResponsesAgent} from '../agent/openai';
import {PremiumGenerationError} from '../agent/model-policy';
import {isGeneratedGame} from '../agent/generated';
import {DockerArtifactGate} from '../sandbox/docker-gate';
import type {AgentInput} from '../pipeline/types';
import type {WorkerStage} from './identity';
import {WorkerGateway,WorkerTransportError,coordinateWorkerStage} from './worker-transport';



async function main(){
 const stage=process.argv[2] as WorkerStage,attempt=Number(process.env.FACTORY_ATTEMPT);
 const gateway=new WorkerGateway({stage,attempt,jobId:process.env.FACTORY_JOB_ID||'',gateway:process.env.FACTORY_GATEWAY_URL||'',
  oidcEndpoint:process.env.ACTIONS_ID_TOKEN_REQUEST_URL||'',oidcCredential:process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN||''});
 if(stage==='test'&&process.env.FACTORY_OPENAI_API_KEY)throw Error('MODEL_KEY_FORBIDDEN_IN_TEST_STAGE');
 const controller=new AbortController(),abort=()=>controller.abort();
 process.once('SIGTERM',abort);process.once('SIGINT',abort);
 let stageFailed=false;
 try{
  const receipt=await coordinateWorkerStage(gateway,async(task,signal)=>{
   try{
    if(stage==='generate'||stage==='review'){
     if(!task.input||!task.approval)throw Error('WORKER_CLAIM_INVALID');
     const agent=new OpenAIResponsesAgent(task.approval,()=>process.env.FACTORY_OPENAI_API_KEY||'');
     const input:AgentInput={...task.input,signal};
     if(stage==='review'){
      // Hosted inference inspects bounded captured evidence without executing source.
      if(!task.game||!task.qualityEvidence)throw Error('WORKER_CLAIM_INVALID');
      return await agent.review(input,task.game,task.qualityEvidence);
     }
     if(attempt){
      if(!isGeneratedGame(task.previous))throw Error('WORKER_CLAIM_INVALID');
      return await agent.repair(input,task.previous,task.diagnostics||'Repair the failing game.',{qualityEvidence:task.qualityEvidence});
     }
     return await agent.generate(input);
    }
    if(!task.game)throw Error('WORKER_CLAIM_INVALID');
    const gate=new DockerArtifactGate({image:process.env.FACTORY_SANDBOX_IMAGE||'',timeoutMs:60000,premiumCaptureTimeoutMs:300000,memoryMb:1536,cpus:1});
    await gate.preflight();signal.throwIfAborted();
    const tested=await gate.test(task.game,{signal,independentIntentPlan:task.independentIntentPlan,captureQuality:'captureQuality'in task&&task.captureQuality===true});
    if(!tested)throw Error('SANDBOX_ATTESTATION_REQUIRED');
    const {qualityEvidence,...game}=tested;
    return {ok:true,game,...(qualityEvidence?{qualityEvidence}:{})};
   }catch(error){
    signal.throwIfAborted();
    if(stage==='test')return {ok:false,diagnostics:(error as Error).message.slice(0,1500)};
    stageFailed=true;
    const code=(error as Error).message;
    return {errorCode:safeProviderFailure(code),
     ...(error instanceof PremiumGenerationError?{usageComplete:error.usageComplete,stageUsage:error.stageUsage,
      imageUsageUnits:error.imageUsageUnits,usageUnits:error.usageUnits}:{})};
   }
  },controller.signal);
  if(stage==='test'&&process.env.GITHUB_OUTPUT)await appendFile(process.env.GITHUB_OUTPUT,`review_required=${receipt.reviewRequired?'true':'false'}\n`);
  if(stageFailed)throw Error('WORKER_STAGE_FAILED');
 }finally{process.removeListener('SIGTERM',abort);process.removeListener('SIGINT',abort);}
}

void main().catch(error=>{
 console.error(error instanceof WorkerTransportError&&error.message==='WORKER_REPORT_UNCONFIRMED'
  ?'Factory worker report could not be confirmed. No generation was replayed.'
  :'Factory worker stage failed; private diagnostics remain in the gateway.');
 process.exitCode=1;
});
