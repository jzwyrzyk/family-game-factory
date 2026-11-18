import {isGeneratedGame,validateCompiled,type GeneratedGame} from '../agent/generated';
import { randomUUID,createHash } from 'node:crypto';
import { requireFamily,type VerifiedSession } from '../contracts/api';
import {assertActiveTrustedDevice} from '../trusted-devices';
import { isGameId,validateConfig } from '../../src/runtime/manifests';
import { validateArtifact } from './artifacts';
import type { AgentAdapter,AuditEvent,BuildRequest,BuiltRevision,Job,JobStatus,PipelineState,Repository,PlayableGame,AgentInput } from './types';
const uuid=()=>randomUUID();
const transitions:Record<JobStatus,readonly JobStatus[]>={draft:['queued','cancelled'],queued:['building','failed','cancelled'],building:['testing','failed','cancelled'],testing:['building','ready','failed','cancelled'],ready:[],failed:[],cancelled:[]};
const safeId=(x:unknown):x is string=>typeof x==='string'&&/^[\w-]{1,100}$/.test(x);
export function validateBuildRequest(value:unknown):BuildRequest{
 const r=value as BuildRequest;
 if(!r||Object.keys(r).some(k=>!['gameId','baseRevisionId','prompt','clientRequestId','retryOf'].includes(k))||!safeId(r.gameId)||(!isGameId(r.gameId)&&!['new','star-catcher','generated-module'].includes(r.gameId))||(r.baseRevisionId!==null&&!safeId(r.baseRevisionId))||typeof r.prompt!=='string'||r.prompt.trim().length<5||r.prompt.length>2000||!safeId(r.clientRequestId)||(r.retryOf!==undefined&&!safeId(r.retryOf)))throw Error('INVALID_REQUEST');
 if(/[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:api[_ -]?key|password|secret)\s*[:=]|https?:\/\/|\b\d{3}[- .]\d{3}[- .]\d{4}\b/i.test(r.prompt))throw Error('PRIVATE_INFORMATION');
 return {...r,prompt:r.prompt.trim()};
}
const month=()=>new Date().toISOString().slice(0,7);
function audit(state:PipelineState,job:Job,status:JobStatus,code?:string){if(!transitions[job.status].includes(status))throw Error('INVALID_TRANSITION');job.status=status;const event:AuditEvent={jobId:job.id,familyId:job.familyId,status,at:new Date().toISOString()};if(code)event.code=code;state.audit.push(event);}
export interface ArtifactGate { test(game:PlayableGame,context?:{signal?:AbortSignal}):Promise<GeneratedGame|void> }
export class JobService {
 private controllers=new Map<string,AbortController>();
 constructor(private repo:Repository,private agent:AgentAdapter,private gate:ArtifactGate,private options:{allowMock:boolean;maxUnits:number;timeoutMs:number;maxRetries:number;maxRepairAttempts?:number}={allowMock:false,maxUnits:10,timeoutMs:30000,maxRetries:2}){}
 private async authorized(session:VerifiedSession,id:string){const state=await this.repo.snapshot(),job=state.jobs.find(j=>j.id===id);if(!job)throw Error('NOT_FOUND');requireFamily(session,job);return job;}
 /** Read-only, family-authorized availability. This is NOT evidence that a job started. */
 async readiness(session:VerifiedSession):Promise<{available:boolean;reason:'READY'|'UNAVAILABLE'|'ALLOWANCE_REQUIRED'}>{
  requireFamily(session,{id:'readiness',familyId:session.familyId});
  if(!this.agent.available||this.agent.kind==='local-rule'||this.agent.kind==='codex-subscription'||(this.agent.kind==='mock'&&!this.options.allowMock))return {available:false,reason:'UNAVAILABLE'};
  const state=await this.repo.snapshot(),ledger=state.ledgers[session.familyId],maxUnits=this.agent.kind==='mock'?0:this.options.maxUnits;
  if(maxUnits&&(!ledger||!ledger.paidEnabled||ledger.month!==month()||ledger.used+ledger.reserved+maxUnits>ledger.allowance))return {available:false,reason:'ALLOWANCE_REQUIRED'};
  return {available:true,reason:'READY'};
 }
 async setAllowance(session:VerifiedSession,allowance:number,paidEnabled:boolean){requireFamily(session,{id:'budget',familyId:session.familyId});if(session.role!=='parent'||!Number.isInteger(allowance)||allowance<0||allowance>50000000)throw Error('FORBIDDEN');await this.repo.transaction(s=>{const old=s.ledgers[session.familyId];s.ledgers[session.familyId]={month:month(),allowance,paidEnabled,used:old?.month===month()?old.used:0,reserved:old?.reserved||0};return true;});}
 async registerBase(session:VerifiedSession,input:unknown){
  requireFamily(session,{id:'base',familyId:session.familyId});const r=input as {gameId:string;localRevisionId:string;config:unknown};
  if(!r||Object.keys(r).some(k=>!['gameId','localRevisionId','config'].includes(k))||!isGameId(r.gameId)||!safeId(r.localRevisionId))throw Error('INVALID_REQUEST');const config=validateConfig(r.gameId,r.config);
  // A server-owned seed ID binds an approved local manifest/config to this family, not a caller-selected foreign resource.
  return this.repo.transaction(s=>{const id='seed-'+createHash('sha256').update(session.familyId+':'+r.localRevisionId).digest('hex');const existing=s.revisions.find(x=>x.id===id);if(existing&&JSON.stringify(existing.config)!==JSON.stringify(config))throw Error('IDEMPOTENCY_CONFLICT');if(!existing)s.revisions.push({id,familyId:session.familyId,parentId:null,projectId:id,game:null,sourceGame:r.gameId,config});return {revisionId:id};});
 }
 async submit(session:VerifiedSession,input:unknown){
  requireFamily(session,{id:'submission',familyId:session.familyId});const r=validateBuildRequest(input);
  if(this.agent.testFixture&&!this.options.allowMock)throw Error('TEST_FIXTURE_FORBIDDEN');
  if(!this.agent.available||this.agent.kind==='codex-subscription'||this.agent.kind==='local-rule'||(this.agent.kind==='mock'&&!this.options.allowMock))throw Error('BUILDER_UNAVAILABLE');
  return this.repo.transaction(s=>{
   assertActiveTrustedDevice(s,session);
   const existing=s.jobs.find(j=>j.familyId===session.familyId&&j.clientRequestId===r.clientRequestId);
   if(existing){if(existing.prompt!==r.prompt||existing.baseRevisionId!==r.baseRevisionId||existing.gameId!==r.gameId)throw Error('IDEMPOTENCY_CONFLICT');return {jobId:existing.id,status:existing.status,adapter:existing.adapter};}
   if(r.baseRevisionId){const base=s.revisions.find(x=>x.id===r.baseRevisionId);if(!base)throw Error('NOT_FOUND');requireFamily(session,base);}else if(r.gameId!=='new')throw Error('INVALID_REQUEST');
   let retryCount=0;if(r.retryOf){const prior=s.jobs.find(j=>j.id===r.retryOf);if(!prior)throw Error('NOT_FOUND');requireFamily(session,prior);if(prior.status!=='failed'||prior.gameId!==r.gameId||prior.prompt!==r.prompt||prior.baseRevisionId!==r.baseRevisionId||prior.retryCount>=this.options.maxRetries)throw Error('RETRY_LIMIT');retryCount=prior.retryCount+1;}
   const recent=s.audit.filter(e=>e.familyId===session.familyId&&e.status==='queued'&&Date.parse(e.at)>Date.now()-60000);if(recent.length>=10)throw Error('RATE_LIMIT');
   let ledger=s.ledgers[session.familyId];if(!ledger||ledger.month!==month())ledger=s.ledgers[session.familyId]={allowance:0,used:0,reserved:ledger?.reserved||0,paidEnabled:false,month:month()};
   const maxUnits=this.agent.kind==='mock'?0:this.options.maxUnits;
   if(maxUnits&&(!ledger.paidEnabled||ledger.used+ledger.reserved+maxUnits>ledger.allowance))throw Error('SPENDING_CUTOFF');
   ledger.reserved+=maxUnits;const job:Job={...r,id:uuid(),familyId:session.familyId,status:'draft',adapter:this.agent.testFixture?'mock':this.agent.kind,maxUnits,usedUnits:0,retryCount};s.jobs.push(job);audit(s,job,'queued');return {jobId:job.id,status:'queued' as JobStatus,adapter:job.adapter};
  });
 }
 async get(session:VerifiedSession,id:string){const j=await this.authorized(session,id);return {jobId:j.id,status:j.status,revisionId:j.revisionId,errorCode:j.errorCode,adapter:j.adapter,phase:j.phase,attempts:j.attempts};}
 async retry(session:VerifiedSession,id:string,clientRequestId:string){const j=await this.authorized(session,id);return this.submit(session,{gameId:j.gameId,baseRevisionId:j.baseRevisionId,prompt:j.prompt,clientRequestId,retryOf:j.id});}
 async cancel(session:VerifiedSession,id:string){await this.authorized(session,id);this.controllers.get(id)?.abort();return this.repo.transaction(s=>{const job=s.jobs.find(j=>j.id===id)!;if(['queued','building','testing'].includes(job.status)){audit(s,job,'cancelled');s.ledgers[job.familyId].reserved-=job.maxUnits;job.usedUnits=job.maxUnits;s.ledgers[job.familyId].used+=job.maxUnits;}return {jobId:id,status:job.status};});}
 async run(id:string){
  const start=await this.repo.transaction(s=>{const job=s.jobs.find(j=>j.id===id);if(!job||job.status!=='queued')return null;audit(s,job,'building');return job;});if(!start)return;
  const controller=new AbortController();this.controllers.set(id,controller);let timeout:ReturnType<typeof setTimeout>|undefined;const deadline=new Promise<never>((_,reject)=>{timeout=setTimeout(()=>{reject(Error('BUILD_TIMEOUT'));controller.abort();},this.options.timeoutMs);controller.signal.addEventListener('abort',()=>reject(Error('CANCELLED')),{once:true});});
  try{
   const state=await this.repo.snapshot(),base=state.revisions.find(r=>r.id===start.baseRevisionId);
   let previous:GeneratedGame|undefined,diagnostics='',used=0,testedGame:PlayableGame|undefined;
   const maximum=Math.min(2,Math.max(0,this.options.maxRepairAttempts??2));
   for(let attempt=0;attempt<=maximum;attempt++){
    const input:AgentInput={gameManifest:{id:start.gameId,allowedMechanics:['declarative-star-catcher','generated-module-v1','generated-module-v2']},baseRevision:{id:base?.id||'new',game:base?.game||undefined,config:base?.config},childIntent:start.prompt,allowedCapabilities:['declarative-star-catcher','generated-module-v1','generated-module-v2'],budget:{maxUnits:start.maxUnits-used,timeoutMs:this.options.timeoutMs},signal:controller.signal};
    await this.repo.transaction(s=>{const job=s.jobs.find(j=>j.id===id)!;if(!['building','testing'].includes(job.status))throw Error('CANCELLED');if(job.status==='testing')audit(s,job,'building');job.phase=attempt?'repairing':'generating';job.attempts=attempt+1;return true;});
    const result=await Promise.race([attempt&&previous&&this.agent.repair?this.agent.repair(input,previous,diagnostics):this.agent.generate(input),deadline]);
    if(!Number.isInteger(result.usageUnits)||result.usageUnits<0||result.usageUnits>input.budget.maxUnits)throw Error('BUDGET_EXCEEDED');used+=result.usageUnits;
    const game=validateArtifact(result.candidate);
    const testing=await this.repo.transaction(s=>{const job=s.jobs.find(j=>j.id===id)!;if(job.status!=='building')return false;job.usedUnits=used;job.phase='testing';audit(s,job,'testing');return true;});if(!testing)return;
    try{
     const built=await Promise.race([this.gate.test(game,{signal:controller.signal}),deadline]);
     testedGame=isGeneratedGame(game)?validateCompiled(game,built as GeneratedGame):game;
     break;
    }catch(error){
     if(!isGeneratedGame(game)||!this.agent.repair||attempt>=maximum||controller.signal.aborted)throw error;
     previous=game;diagnostics=String((error as Error).message).slice(0,1500);
    }
   }
   if(!testedGame)throw Error('REPAIR_EXHAUSTED');
   await this.repo.transaction(s=>{const job=s.jobs.find(j=>j.id===id)!;if(job.status!=='testing')return false;const revision:BuiltRevision={id:uuid(),familyId:job.familyId,parentId:job.baseRevisionId,projectId:base?.projectId||uuid(),game:testedGame!,adapter:job.adapter};s.revisions.push(revision);job.revisionId=revision.id;job.usedUnits=used;job.phase='ready';const ledger=s.ledgers[job.familyId];ledger.reserved-=job.maxUnits;ledger.used+=job.usedUnits;audit(s,job,'ready');return true;});
  }catch(err){await this.repo.transaction(s=>{const job=s.jobs.find(j=>j.id===id)!;if(['building','testing'].includes(job.status)){job.errorCode=(err as Error).message;const ledger=s.ledgers[job.familyId];ledger.reserved-=job.maxUnits;ledger.used+=job.maxUnits;job.usedUnits=job.maxUnits;audit(s,job,'failed',job.errorCode);}return true;});}
  finally{if(timeout)clearTimeout(timeout);this.controllers.delete(id);}
 }
 async revision(session:VerifiedSession,id:string){const r=(await this.repo.snapshot()).revisions.find(r=>r.id===id&&r.game);if(!r)throw Error('NOT_FOUND');requireFamily(session,r);return r;}
 async fork(session:VerifiedSession,id:string,name:string){const source=await this.revision(session,id);if(typeof name!=='string'||name.trim().length<1||name.length>60)throw Error('INVALID_REQUEST');return this.repo.transaction(s=>{const revision={...source,id:uuid(),projectId:uuid(),parentId:null,sourceRevisionId:source.id,name:name.trim()};s.revisions.push(revision);s.active[revision.projectId]=revision.id;return {revisionId:revision.id};});}
 async keep(session:VerifiedSession,id:string){const r=await this.revision(session,id);await this.repo.transaction(s=>{s.active[r.projectId]=id;return true;});return {revisionId:id};}
 async undo(session:VerifiedSession,id:string){const r=await this.revision(session,id);if(!r.parentId)throw Error('NO_PREVIOUS_VERSION');const parent=await this.revision(session,r.parentId);await this.keep(session,parent.id);return {revisionId:parent.id};}
 async list(session:VerifiedSession){requireFamily(session,{id:'list',familyId:session.familyId});const s=await this.repo.snapshot();return s.revisions.filter(r=>r.familyId===session.familyId&&s.active[r.projectId]===r.id);}
 async recover(){return this.repo.transaction(s=>{for(const j of s.jobs)if(['building','testing'].includes(j.status)){const l=s.ledgers[j.familyId];l.reserved-=j.maxUnits;l.used+=j.maxUnits;j.usedUnits=j.maxUnits;j.errorCode='WORKER_RESTARTED';audit(s,j,'failed','WORKER_RESTARTED');}return s.jobs.filter(j=>j.status==='queued').map(j=>j.id);});}
}
