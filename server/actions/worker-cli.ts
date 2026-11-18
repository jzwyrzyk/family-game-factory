// Trusted Actions controller. It never evaluates or logs model output. The test stage has no model key.
import {OpenAIResponsesAgent} from '../agent/openai';
import {DockerArtifactGate} from '../sandbox/docker-gate';
import type {AgentInput} from '../pipeline/types';
const stage=process.argv[2],id=process.env.FACTORY_JOB_ID,attempt=Number(process.env.FACTORY_ATTEMPT),base=process.env.FACTORY_GATEWAY_URL;
async function main(){
 if(!['generate','test'].includes(stage)||!id||!/^[\w-]{1,100}$/.test(id)||!Number.isInteger(attempt)||attempt<0||attempt>2||!base||new URL(base).protocol!=='https:')throw Error('WORKER_CONFIGURATION_REQUIRED');
 const gateway=new URL(base);if(gateway.username||gateway.password||gateway.search||gateway.hash||gateway.pathname!=='/')throw Error('WORKER_CONFIGURATION_REQUIRED');
 async function oidc(){const endpoint=process.env.ACTIONS_ID_TOKEN_REQUEST_URL,credential=process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;if(!endpoint||!credential)throw Error('ACTIONS_OIDC_REQUIRED');const url=new URL(endpoint);if(url.protocol!=='https:'||!url.hostname.endsWith('.actions.githubusercontent.com'))throw Error('OIDC_ENDPOINT_REJECTED');url.searchParams.set('audience',gateway.origin);const r=await fetch(url,{redirect:'error',headers:{Authorization:'Bearer '+credential}});if(!r.ok)throw Error('OIDC_FAILED');return (await r.json()).value as string;}
 async function api(path:string,body?:unknown){const token=await oidc();const r=await fetch(gateway.origin+`/v1/worker/jobs/${id}/`+path,{method:body===undefined?'GET':'POST',redirect:'error',headers:{Authorization:'Bearer '+token,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});if(!r.ok)throw Error('PRIVATE_GATEWAY_REJECTED');return r.json();}
 const controller=new AbortController();process.once('SIGTERM',()=>controller.abort());process.once('SIGINT',()=>controller.abort());const task=await api('claim',{stage,attempt});
 const heartbeat=setInterval(()=>{void api('status').then(s=>{if(['cancelled','failed'].includes(s.status))controller.abort()}).catch(()=>controller.abort());},3000);
 try{
  if(stage==='generate'){
   const agent=new OpenAIResponsesAgent(task.approval,()=>process.env.FACTORY_OPENAI_API_KEY||'');const input:AgentInput={...task.input,signal:controller.signal};const result=attempt&&task.previous?await agent.repair(input,task.previous,task.diagnostics||'Repair the failing game.'):await agent.generate(input);await api('report',{stage,attempt,report:result});
  }else{
   if(process.env.FACTORY_OPENAI_API_KEY)throw Error('MODEL_KEY_FORBIDDEN_IN_TEST_STAGE');const gate=new DockerArtifactGate({image:process.env.FACTORY_SANDBOX_IMAGE||'',timeoutMs:60000,memoryMb:1536,cpus:1});
   try{await gate.preflight();const game=await gate.test(task.game,{signal:controller.signal});await api('report',{stage,attempt,report:{ok:true,game}});}catch(error){await api('report',{stage,attempt,report:{ok:false,diagnostics:(error as Error).message.slice(0,1500)}});}
  }
 }catch(error){const code=(error as Error).message,allowed=['PROVIDER_RATE_LIMIT','PROVIDER_REFUSED','OWNER_APPROVAL_REQUIRED','SPENDING_CUTOFF','INPUT_TOKEN_LIMIT','GAME_FORM_UNSUPPORTED','GAME_FORM_REVIEW_REQUIRED','GAME_FORM_BASE_UNVERIFIED'];if(stage==='generate')await api('report',{stage,attempt,report:{errorCode:allowed.includes(code)?code:'PROVIDER_FAILED'}}).catch(()=>{});throw Error('WORKER_STAGE_FAILED');}finally{clearInterval(heartbeat);}
}
void main().catch(()=>{console.error('Factory worker stage failed; private diagnostics remain in the gateway.');process.exitCode=1;});
