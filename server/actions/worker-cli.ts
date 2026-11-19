// Trusted Actions controller. It never evaluates or logs model output. The test stage has no model key.
import {OpenAIResponsesAgent} from '../agent/openai';
import {DockerArtifactGate} from '../sandbox/docker-gate';
import type {AgentInput} from '../pipeline/types';
import {appendFile} from 'node:fs/promises';
const stage=process.argv[2],id=process.env.FACTORY_JOB_ID,attempt=Number(process.env.FACTORY_ATTEMPT),base=process.env.FACTORY_GATEWAY_URL;
async function main(){
 if(!['generate','test','review'].includes(stage)||!id||!/^[\w-]{1,100}$/.test(id)||!Number.isInteger(attempt)||attempt<0||attempt>2||!base||new URL(base).protocol!=='https:')throw Error('WORKER_CONFIGURATION_REQUIRED');
 const gateway=new URL(base);if(gateway.username||gateway.password||gateway.search||gateway.hash||gateway.pathname!=='/')throw Error('WORKER_CONFIGURATION_REQUIRED');
 async function oidc(){const endpoint=process.env.ACTIONS_ID_TOKEN_REQUEST_URL,credential=process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;if(!endpoint||!credential)throw Error('ACTIONS_OIDC_REQUIRED');const url=new URL(endpoint);if(url.protocol!=='https:'||!url.hostname.endsWith('.actions.githubusercontent.com'))throw Error('OIDC_ENDPOINT_REJECTED');url.searchParams.set('audience',gateway.origin);const r=await fetch(url,{redirect:'error',headers:{Authorization:'Bearer '+credential}});if(!r.ok)throw Error('OIDC_FAILED');return (await r.json()).value as string;}
 async function api(path:string,body?:unknown){const token=await oidc();const r=await fetch(gateway.origin+`/v1/worker/jobs/${id}/`+path,{method:body===undefined?'GET':'POST',redirect:'error',headers:{Authorization:'Bearer '+token,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});if(!r.ok)throw Error('PRIVATE_GATEWAY_REJECTED');return r.json();}
 const controller=new AbortController();process.once('SIGTERM',()=>controller.abort());process.once('SIGINT',()=>controller.abort());const task=await api('claim',{stage,attempt});
 const heartbeat=setInterval(()=>{void api('status').then(s=>{if(['cancelled','failed'].includes(s.status))controller.abort()}).catch(()=>controller.abort());},3000);
 let reportAttempted=false;
 const report=(value:unknown)=>{reportAttempted=true;return api('report',{stage,attempt,report:value});};
 try{
  if(stage==='generate'){
   const agent=new OpenAIResponsesAgent(task.approval,()=>process.env.FACTORY_OPENAI_API_KEY||'');const input:AgentInput={...task.input,signal:controller.signal};const result=attempt&&task.previous?await agent.repair(input,task.previous,task.diagnostics||'Repair the failing game.',{qualityEvidence:task.qualityEvidence}):await agent.generate(input);await report(result);
  }else if(stage==='review'){
   // Hosted private inference only. This process inspects bounded captured
   // evidence; it never launches a browser, imports or evaluates game source.
   const agent=new OpenAIResponsesAgent(task.approval,()=>process.env.FACTORY_OPENAI_API_KEY||'');
   const input:AgentInput={...task.input,signal:controller.signal};
   await report(await agent.review(input,task.game,task.qualityEvidence));
  }else{
   if(process.env.FACTORY_OPENAI_API_KEY)throw Error('MODEL_KEY_FORBIDDEN_IN_TEST_STAGE');const gate=new DockerArtifactGate({image:process.env.FACTORY_SANDBOX_IMAGE||'',timeoutMs:60000,memoryMb:1536,cpus:1});
   let result;
   try{
    await gate.preflight();const tested=await gate.test(task.game,{signal:controller.signal,independentIntentPlan:task.independentIntentPlan,captureQuality:task.captureQuality===true});
    if(!tested)throw Error('SANDBOX_ATTESTATION_REQUIRED');
    const {qualityEvidence,...game}=tested;result={ok:true,game,...(qualityEvidence?{qualityEvidence}:{})};
   }catch(error){result={ok:false,diagnostics:(error as Error).message.slice(0,1500)};}
   const receipt=await report(result);
   if(process.env.GITHUB_OUTPUT)await appendFile(process.env.GITHUB_OUTPUT,'review_required='+(receipt.reviewRequired===true?'true':'false')+'\n');
  }
 }catch(error){const code=(error as Error).message,allowed=['PROVIDER_RATE_LIMIT','PROVIDER_REFUSED','OWNER_APPROVAL_REQUIRED','SPENDING_CUTOFF','INPUT_TOKEN_LIMIT','GAME_FORM_UNSUPPORTED','GAME_FORM_REVIEW_REQUIRED','GAME_FORM_BASE_UNVERIFIED','IMAGE_APPROVAL_REQUIRED','IMAGE_ALLOWANCE_EXCEEDED','IMAGE_PROVIDER_RATE_LIMIT','IMAGE_PROVIDER_FAILED','QUALITY_REVIEW_REQUIRED'];if(stage!=='test'&&!reportAttempted)await report({errorCode:allowed.includes(code)?code:'PROVIDER_FAILED'}).catch(()=>{});throw Error('WORKER_STAGE_FAILED');}finally{clearInterval(heartbeat);}
}
void main().catch(()=>{console.error('Factory worker stage failed; private diagnostics remain in the gateway.');process.exitCode=1;});
