import type {WorkerIdentity} from '../actions/identity';
import {uuid} from './model';

/** The pinned private workflow includes its opaque job and attempt in the run name. */
export async function assertRunJob(identity:WorkerIdentity,jobId:string,repository:string,token:()=>Promise<string>,route:'beta-dev'|'beta-test'|'beta-prod',transport:typeof fetch=fetch){
 if(!uuid(jobId)||!/^\d+$/.test(identity.runId)||repository!=='family-game-factory-lab/family-game-factory-worker')throw Error('WORKER_FORBIDDEN');
 const r=await transport(`https://api.github.com/repos/${repository}/actions/runs/${identity.runId}`,{redirect:'error',signal:AbortSignal.timeout(8000),
  headers:{Authorization:'Bearer '+await token(),Accept:'application/vnd.github+json'}});
 if(!r.ok)throw Error('WORKER_RUN_UNAVAILABLE');
 const run=await r.json();
 if(String(run.id)!==identity.runId||String(run.repository?.id)!==identity.repositoryId||run.head_sha!==identity.sha||run.run_attempt!==1||
  run.event!=='workflow_dispatch'||![0,1,2].some(n=>run.display_title===`Private factory job ${jobId} / ${route} / ${n}`))throw Error('WORKER_FORBIDDEN');
 return Number(run.display_title.slice(-1));
}
