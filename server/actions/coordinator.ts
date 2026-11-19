import {createHash,randomUUID} from 'node:crypto';
import {verifiedParentScope} from '../privacy/parent-consent';
import {adultPilotJobAllowed} from '../adult-pilot';
import {draftChildIntentContract} from '../quality/child-intent';
import {chooseGameForm} from '../quality/game-form';
import {validateFunctionalGameContract} from '../quality/functional-game-contract';
import {safeRepairDiagnostic,safeFinalRepairCode,type RepairCategory} from '../quality/repair-diagnostics';
import {validateArtifact} from '../pipeline/artifacts';
import {isGeneratedGame,validateCompiled,type GeneratedGame} from '../agent/generated';
import type {AgentApproval} from '../agent/openai';
import type {Repository,Job,PipelineState,CandidateArtifact} from '../pipeline/types';
import type {WorkerIdentity} from './identity';
import type {DispatchPort} from './dispatcher';
export interface ActionExecution {attempt:number;dispatchPending:boolean;queuedAt?:number;dispatchedAt?:number;runId?:string;stage?:'generate'|'test';candidate?:CandidateArtifact;diagnostics?:string;repairCategory?:RepairCategory;claimAt?:number;generateReport?:string;testReport?:string}
export class ActionCoordinator {
 constructor(private repo:Repository,private dispatcher:DispatchPort,private approval:AgentApproval,private leaseMs=900000,private requireVerifiedParentPrivacy=false,private adultPilotMode=false){}
 async enqueue(id:string){await this.repo.transaction(s=>{const j=s.jobs.find(x=>x.id===id);if(j?.status==='queued'&&!j.execution)j.execution={attempt:0,dispatchPending:true,queuedAt:Date.now()};return true;});}
 private failure(s:PipelineState,j:Job,code:string){if(['ready','failed','cancelled'].includes(j.status))return;j.status='failed';j.errorCode=code;j.phase='failed';const l=s.ledgers[j.familyId];l.reserved-=j.maxUnits;l.used+=j.maxUnits;j.usedUnits=j.maxUnits;s.audit.push({jobId:j.id,familyId:j.familyId,status:'failed',code,at:new Date().toISOString()});if(j.execution)delete j.execution.candidate;}
 async tick(){const pending=await this.repo.transaction(s=>{const ids:{id:string;attempt:number}[]=[];for(const j of s.jobs){if(j.status==='queued'&&!j.execution)j.execution={attempt:0,dispatchPending:true,queuedAt:Date.now()};const e=j.execution;if(!e||['ready','failed','cancelled'].includes(j.status))continue;if(!this.approval.enabled||!s.ledgers[j.familyId]?.paidEnabled){this.failure(s,j,'OWNER_APPROVAL_REQUIRED');continue;}
 if(this.requireVerifiedParentPrivacy&&!verifiedParentScope(s,j.familyId,'generation')){this.failure(s,j,'GUARDIAN_CONSENT_REQUIRED');continue;}
 if(this.adultPilotMode&&!adultPilotJobAllowed(s,j)){this.failure(s,j,'ADULT_PILOT_ACCESS_REQUIRED');continue;}if(!e.runId&&e.queuedAt&&Date.now()-e.queuedAt>this.leaseMs){this.failure(s,j,'WORKER_QUEUE_EXPIRED');continue;}if(e.claimAt&&Date.now()-e.claimAt>this.leaseMs){this.failure(s,j,'WORKER_LEASE_EXPIRED');continue;}if(e.dispatchPending&&(!e.dispatchedAt||Date.now()-e.dispatchedAt>30000)){e.dispatchPending=false;e.dispatchedAt=Date.now();ids.push({id:j.id,attempt:e.attempt});}else if(!e.runId&&e.dispatchedAt&&Date.now()-e.dispatchedAt>60000)e.dispatchPending=true;}return ids;});
 for(const p of pending)try{await this.dispatcher.dispatch(p.id,p.attempt);}catch{await this.repo.transaction(s=>{const j=s.jobs.find(x=>x.id===p.id);if(j?.execution&&!j.execution.runId)j.execution.dispatchPending=true;return true;});}}
 async claim(id:string,attempt:number,stage:'generate'|'test',identity:WorkerIdentity){return this.repo.transaction(s=>{const j=s.jobs.find(x=>x.id===id),e=j?.execution;if(identity.stage!==stage||!j||!e||e.attempt!==attempt||['ready','failed','cancelled'].includes(j.status)||e.runId&&e.runId!==identity.runId)throw Error('WORKER_CLAIM_REJECTED');
 if(this.requireVerifiedParentPrivacy&&!verifiedParentScope(s,j.familyId,'generation'))throw Error('GUARDIAN_CONSENT_REQUIRED');
 if(this.adultPilotMode&&!adultPilotJobAllowed(s,j))throw Error('ADULT_PILOT_ACCESS_REQUIRED');
 if(stage==='generate'){if(!this.approval.enabled||!s.ledgers[j.familyId]?.paidEnabled)throw Error('OWNER_APPROVAL_REQUIRED');if(e.stage||!['queued','building'].includes(j.status))throw Error('WORKER_CLAIM_REJECTED');e.runId=identity.runId;e.stage=stage;e.claimAt=Date.now();j.status='building';j.phase=attempt?'repairing':'generating';j.attempts=attempt+1;s.audit.push({jobId:id,familyId:j.familyId,status:'building',at:new Date().toISOString()});const base=s.revisions.find(r=>r.id===j.baseRevisionId);return {input:{gameManifest:{id:j.gameId,allowedMechanics:['generated-module-v1','generated-module-v2']},baseRevision:{id:base?.id||'new',game:base?.game||undefined,config:base?.config,sourceGame:base?.sourceGame,projectId:base?.projectId},childIntent:j.prompt,allowedCapabilities:['generated-module-v1','generated-module-v2'],budget:{maxUnits:j.maxUnits-j.usedUnits,timeoutMs:600000}},approval:this.approval,previous:e.candidate?.game,diagnostics:e.diagnostics};}
 if(e.runId!==identity.runId||j.status!=='testing'||!e.candidate||e.stage!=='generate'||!e.generateReport)throw Error('WORKER_CLAIM_REJECTED');
 // Only the authenticated server can attach an independent intent plan.
 // Never accept one from the provider response or public BuildRequest.
 // At O5, only new-game plans are admitted: saved revision migration requires
 // an additional verified base, which the research plan doesn't yet model.
 let independentIntentPlan;
 if(j.independentIntentPlan){
  if(j.baseRevisionId!==null)throw Error('INTENT_PLAN_REVISION_UNSUPPORTED');
  const intent=draftChildIntentContract(j.prompt);
  independentIntentPlan=validateFunctionalGameContract(
    j.independentIntentPlan,intent,chooseGameForm(intent)
  );
 }
 e.stage=stage;e.claimAt=Date.now();
 return {game:e.candidate.game,...(independentIntentPlan?{independentIntentPlan}:{})};});}
 async report(id:string,attempt:number,stage:'generate'|'test',identity:WorkerIdentity,report:any){const fingerprint=createHash('sha256').update(JSON.stringify(report)).digest('hex');return this.repo.transaction(s=>{const j=s.jobs.find(x=>x.id===id),e=j?.execution;if(identity.stage!==stage||!j||!e||e.attempt!==attempt||e.runId!==identity.runId)throw Error('WORKER_REPORT_REJECTED');const existing=stage==='generate'?e.generateReport:e.testReport;if(existing){if(existing!==fingerprint)throw Error('WORKER_REPORT_CONFLICT');return {accepted:true};}if(['failed','cancelled','ready'].includes(j.status)||e.stage!==stage)throw Error('WORKER_REPORT_REJECTED');
 if(this.requireVerifiedParentPrivacy&&!verifiedParentScope(s,j.familyId,'generation')){this.failure(s,j,'GUARDIAN_CONSENT_REQUIRED');return {accepted:true};}
 if(this.adultPilotMode&&!adultPilotJobAllowed(s,j)){this.failure(s,j,'ADULT_PILOT_ACCESS_REQUIRED');return {accepted:true};}
 if(stage==='generate'){if(!report||report.errorCode){e.generateReport=fingerprint;this.failure(s,j,['PROVIDER_RATE_LIMIT','PROVIDER_REFUSED','OWNER_APPROVAL_REQUIRED','SPENDING_CUTOFF','INPUT_TOKEN_LIMIT','GAME_FORM_UNSUPPORTED','GAME_FORM_REVIEW_REQUIRED','GAME_FORM_BASE_UNVERIFIED'].includes(report?.errorCode)?report.errorCode:'PROVIDER_FAILED');return {accepted:true};}if(!Number.isInteger(report.usageUnits)||report.usageUnits<0||j.usedUnits+report.usageUnits>j.maxUnits)throw Error('BUDGET_EXCEEDED');const game=validateArtifact(report.candidate);if(!isGeneratedGame(game))throw Error('GENERATED_ARTIFACT_REQUIRED');j.usedUnits+=report.usageUnits;e.candidate={format:'generated-source-v1',game};e.generateReport=fingerprint;j.status='testing';j.phase='testing';s.audit.push({jobId:id,familyId:j.familyId,status:'testing',at:new Date().toISOString()});return {accepted:true};}
 if(report.ok){
  if(j.independentIntentPlan&&report.game?.compiled?.tests?.intent!==true)
   throw Error('INTENT_ATTESTATION_REQUIRED');
  const candidate=e.candidate?.game;if(!isGeneratedGame(candidate))throw Error('GENERATED_ARTIFACT_REQUIRED');const game=validateCompiled(candidate,report.game as GeneratedGame),base=s.revisions.find(r=>r.id===j.baseRevisionId),revision={id:randomUUID(),familyId:j.familyId,parentId:j.baseRevisionId,projectId:base?.projectId||randomUUID(),game,adapter:j.adapter};s.revisions.push(revision);j.revisionId=revision.id;j.status='ready';j.phase='ready';e.testReport=fingerprint;delete e.candidate;const l=s.ledgers[j.familyId];l.reserved-=j.maxUnits;l.used+=j.usedUnits;s.audit.push({jobId:id,familyId:j.familyId,status:'ready',at:new Date().toISOString()});}
 else if(e.attempt<2){e.attempt++;e.queuedAt=Date.now();e.runId=undefined;e.stage=undefined;e.generateReport=undefined;e.testReport=undefined;e.claimAt=undefined;e.dispatchedAt=undefined;e.dispatchPending=true;const safe=safeRepairDiagnostic(report?.diagnostics,j.independentIntentPlan);
 e.diagnostics=safe.feedback;e.repairCategory=safe.category;j.status='building';j.phase='repairing';s.audit.push({jobId:id,familyId:j.familyId,status:'building',code:'AUTOMATIC_REPAIR',at:new Date().toISOString()});}else{e.testReport=fingerprint;this.failure(s,j,safeFinalRepairCode(report?.diagnostics,j.independentIntentPlan));}return {accepted:true};});}
 async status(id:string,identity:WorkerIdentity){const j=(await this.repo.snapshot()).jobs.find(x=>x.id===id);if(!j||j.execution?.runId!==identity.runId)throw Error('WORKER_FORBIDDEN');return {status:j.status,phase:j.phase};}
}
