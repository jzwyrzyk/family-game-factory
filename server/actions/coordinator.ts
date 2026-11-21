import {createHash,randomUUID} from 'node:crypto';
import {verifiedParentScope} from '../privacy/parent-consent';
import {adultPilotJobAllowed} from '../adult-pilot';
import {devTestJobAllowed,hasAdultJob,hasDevJob} from '../dev-test-policy';
import type {DevAccessPolicy} from '../dev-access';
import {draftChildIntentContract} from '../quality/child-intent';
import {chooseGameForm} from '../quality/game-form';
import {validateFunctionalGameContract} from '../quality/functional-game-contract';
import {safeRepairDiagnostic,safeFinalRepairCode,type RepairCategory} from '../quality/repair-diagnostics';
import {applyCurrentQualityPolicy,requireProductionCandidate} from '../quality/quality-policy';
import {validateQualityEvidence,validateQualityReview,type GameQualityEvidence} from '../quality/game-quality';
import {validateArtifact} from '../pipeline/artifacts';
import {isGeneratedGame,validateCompiled,type GeneratedGame} from '../agent/generated';
import type {AgentApproval} from '../agent/openai';
import type {Repository,Job,PipelineState,CandidateArtifact,AgentInput} from '../pipeline/types';
import type {WorkerIdentity,WorkerStage} from './identity';
import type {DispatchPort} from './dispatcher';

export interface ActionExecution {
 attempt:number;dispatchPending:boolean;queuedAt?:number;dispatchedAt?:number;runId?:string;stage?:WorkerStage;
 candidate?:CandidateArtifact;qualityEvidence?:GameQualityEvidence;diagnostics?:string;repairCategory?:RepairCategory;
 claimAt?:number;generateReport?:string;testReport?:string;reviewReport?:string;
}
const providerErrors=['PROVIDER_RATE_LIMIT','PROVIDER_REFUSED','OWNER_APPROVAL_REQUIRED','SPENDING_CUTOFF','INPUT_TOKEN_LIMIT',
 'GAME_FORM_UNSUPPORTED','GAME_FORM_REVIEW_REQUIRED','GAME_FORM_BASE_UNVERIFIED','IMAGE_APPROVAL_REQUIRED','IMAGE_ALLOWANCE_EXCEEDED',
 'IMAGE_PROVIDER_RATE_LIMIT','IMAGE_PROVIDER_FAILED','QUALITY_REVIEW_REQUIRED'];

export class ActionCoordinator {
 constructor(private repo:Repository,private dispatcher:DispatchPort,private approval:AgentApproval,private leaseMs=900000,private requireVerifiedParentPrivacy=false,private adultPilotMode=false,private devTestPolicy?:DevAccessPolicy){}
 async enqueue(id:string){await this.repo.transaction(s=>{const j=s.jobs.find(x=>x.id===id);if(j?.status==='queued'&&!j.execution)j.execution={attempt:0,dispatchPending:true,queuedAt:Date.now()};return true;});}
 private permissionError(s:PipelineState,j:Job):string|undefined {
  if(hasDevJob(j))return devTestJobAllowed(s,j,this.devTestPolicy)?undefined:'DEV_TEST_ACCESS_REQUIRED';
  if(this.devTestPolicy&&!hasAdultJob(j))return 'DEV_TEST_ACCESS_REQUIRED';
  if(this.requireVerifiedParentPrivacy&&!verifiedParentScope(s,j.familyId,'generation'))return 'GUARDIAN_CONSENT_REQUIRED';
  if((this.adultPilotMode||hasAdultJob(j))&&
    (!this.adultPilotMode||!adultPilotJobAllowed(s,j)))return 'ADULT_PILOT_ACCESS_REQUIRED';
 }
 private failure(s:PipelineState,j:Job,code:string){
  if(['ready','failed','cancelled'].includes(j.status))return;
  j.status='failed';j.errorCode=code;j.phase='failed';const ledger=s.ledgers[j.familyId];
  ledger.reserved-=j.maxUnits;ledger.used+=j.maxUnits;j.usedUnits=j.maxUnits;
  s.audit.push({jobId:j.id,familyId:j.familyId,status:'failed',code,at:new Date().toISOString()});
  if(j.execution){delete j.execution.candidate;delete j.execution.qualityEvidence;}
 }
 private input(s:PipelineState,j:Job):Omit<AgentInput,'signal'>{
  const base=s.revisions.find(r=>r.id===j.baseRevisionId);
  return {gameManifest:{id:j.gameId,allowedMechanics:['generated-module-v1','generated-module-v2']},
   baseRevision:{id:base?.id||'new',game:base?.game||undefined,config:base?.config,sourceGame:base?.sourceGame,projectId:base?.projectId},
   childIntent:j.prompt,allowedCapabilities:['generated-module-v1','generated-module-v2'],
   budget:{maxUnits:j.maxUnits-j.usedUnits,timeoutMs:600000}};
 }
 private ready(s:PipelineState,j:Job,game:GeneratedGame){
  // Review cannot publish under a replacement unlock or a consent/grant that
  // expired while its artifact and screenshot bindings were being validated.
  const denied=this.permissionError(s,j);if(denied){this.failure(s,j,denied);return;}
  const base=s.revisions.find(r=>r.id===j.baseRevisionId);
  const revision={id:randomUUID(),familyId:j.familyId,parentId:j.baseRevisionId,projectId:base?.projectId||randomUUID(),game,adapter:j.adapter,...(j.adultPilotProfileId?{adultPilotProfileId:j.adultPilotProfileId}:{}),...(j.devTestPolicyId?{devTestPolicyId:j.devTestPolicyId}:{})};
  s.revisions.push(revision);j.revisionId=revision.id;j.status='ready';j.phase='ready';
  if(j.execution){delete j.execution.candidate;delete j.execution.qualityEvidence;}
  const ledger=s.ledgers[j.familyId];ledger.reserved-=j.maxUnits;ledger.used+=j.usedUnits;
  s.audit.push({jobId:j.id,familyId:j.familyId,status:'ready',at:new Date().toISOString()});
 }
 private repair(s:PipelineState,j:Job,diagnostics:unknown){
  const e=j.execution!;
  if(e.attempt>=2){this.failure(s,j,safeFinalRepairCode(diagnostics,j.independentIntentPlan));return;}
  const safe=safeRepairDiagnostic(diagnostics,j.independentIntentPlan);
  e.attempt++;e.queuedAt=Date.now();e.runId=undefined;e.stage=undefined;e.generateReport=undefined;e.testReport=undefined;e.reviewReport=undefined;
  e.claimAt=undefined;e.dispatchedAt=undefined;e.dispatchPending=true;e.diagnostics=safe.feedback;e.repairCategory=safe.category;
  // Retain rejected candidate evidence for a targeted private repair. A new
  // candidate report discards the old screenshots; they never enter a revision.
  j.status='building';j.phase='repairing';
  s.audit.push({jobId:j.id,familyId:j.familyId,status:'building',code:'AUTOMATIC_REPAIR',at:new Date().toISOString()});
 }
 async tick(){
  const pending=await this.repo.transaction(s=>{
   const ids:{id:string;attempt:number}[]=[];
   for(const j of s.jobs){
    if(j.status==='queued'&&!j.execution)j.execution={attempt:0,dispatchPending:true,queuedAt:Date.now()};
    const e=j.execution;if(!e||['ready','failed','cancelled'].includes(j.status))continue;
    if(!this.approval.enabled||!s.ledgers[j.familyId]?.paidEnabled){this.failure(s,j,'OWNER_APPROVAL_REQUIRED');continue;}
    const denied=this.permissionError(s,j);if(denied){this.failure(s,j,denied);continue;}
    if(!e.runId&&e.queuedAt&&Date.now()-e.queuedAt>this.leaseMs){this.failure(s,j,'WORKER_QUEUE_EXPIRED');continue;}
    if(e.claimAt&&Date.now()-e.claimAt>this.leaseMs){this.failure(s,j,'WORKER_LEASE_EXPIRED');continue;}
    if(e.dispatchPending&&(!e.dispatchedAt||Date.now()-e.dispatchedAt>30000)){
     e.dispatchPending=false;e.dispatchedAt=Date.now();ids.push({id:j.id,attempt:e.attempt});
    }else if(!e.runId&&e.dispatchedAt&&Date.now()-e.dispatchedAt>60000)e.dispatchPending=true;
   }return ids;
  });
  for(const p of pending)try{await this.dispatcher.dispatch(p.id,p.attempt);}catch{
   await this.repo.transaction(s=>{const j=s.jobs.find(x=>x.id===p.id);if(j?.execution&&!j.execution.runId)j.execution.dispatchPending=true;return true;});
  }
 }
 async claim(id:string,attempt:number,stage:WorkerStage,identity:WorkerIdentity){
  return this.repo.transaction(s=>{
   const j=s.jobs.find(x=>x.id===id),e=j?.execution;
   if(identity.stage!==stage||!j||!e||e.attempt!==attempt||['ready','failed','cancelled'].includes(j.status)||e.runId&&e.runId!==identity.runId)throw Error('WORKER_CLAIM_REJECTED');
   const denied=this.permissionError(s,j);if(denied)throw Error(denied);
   applyCurrentQualityPolicy(j,s.revisions.find(r=>r.id===j.baseRevisionId)?.game);
   if(stage==='generate'){
    if(!this.approval.enabled||!s.ledgers[j.familyId]?.paidEnabled)throw Error('OWNER_APPROVAL_REQUIRED');
    if(e.stage||!['queued','building'].includes(j.status))throw Error('WORKER_CLAIM_REJECTED');
    e.runId=identity.runId;e.stage=stage;e.claimAt=Date.now();j.status='building';j.phase=attempt?'repairing':'generating';j.attempts=attempt+1;
    s.audit.push({jobId:id,familyId:j.familyId,status:'building',at:new Date().toISOString()});
    return {input:this.input(s,j),approval:this.approval,previous:e.candidate?.game,diagnostics:e.diagnostics,qualityEvidence:e.qualityEvidence,independentIntentPlan:undefined};
   }
   if(stage==='review'){
    if(!this.approval.enabled||!s.ledgers[j.familyId]?.paidEnabled)throw Error('OWNER_APPROVAL_REQUIRED');
    if(!j.qualityRequired||j.status!=='testing'||j.phase!=='reviewing'||e.stage!=='test'||!e.testReport||!isGeneratedGame(e.candidate?.game)||!e.qualityEvidence)throw Error('WORKER_CLAIM_REJECTED');
    const game=e.candidate.game,evidence=validateQualityEvidence(game,e.qualityEvidence);
    requireProductionCandidate(j,game);e.stage=stage;e.claimAt=Date.now();
    const denied=this.permissionError(s,j);if(denied)throw Error(denied);
    return {input:this.input(s,j),approval:this.approval,game,qualityEvidence:evidence,independentIntentPlan:undefined};
   }
   if(e.runId!==identity.runId||j.status!=='testing'||!e.candidate||e.stage!=='generate'||!e.generateReport)throw Error('WORKER_CLAIM_REJECTED');
   // Generated source and public callers never author independent expectations.
   let independentIntentPlan;
   if(j.independentIntentPlan){
    if(j.baseRevisionId!==null)throw Error('INTENT_PLAN_REVISION_UNSUPPORTED');
    const intent=draftChildIntentContract(j.prompt);
    independentIntentPlan=validateFunctionalGameContract(j.independentIntentPlan,intent,chooseGameForm(intent));
   }
   e.stage=stage;e.claimAt=Date.now();
   return {game:e.candidate.game,captureQuality:!!j.qualityRequired,...(independentIntentPlan?{independentIntentPlan}:{})};
  });
 }
 async report(id:string,attempt:number,stage:WorkerStage,identity:WorkerIdentity,report:any){
  const fingerprint=createHash('sha256').update(JSON.stringify(report)).digest('hex');
  return this.repo.transaction(s=>{
   const j=s.jobs.find(x=>x.id===id),e=j?.execution;
   if(identity.stage!==stage||!j||!e||e.attempt!==attempt||e.runId!==identity.runId)throw Error('WORKER_REPORT_REJECTED');
   applyCurrentQualityPolicy(j,s.revisions.find(r=>r.id===j.baseRevisionId)?.game);
   const receipt=()=>({accepted:true,reviewRequired:stage==='test'&&j.phase==='reviewing'});
   const existing=stage==='generate'?e.generateReport:stage==='test'?e.testReport:e.reviewReport;
   if(existing&&existing!==fingerprint)throw Error('WORKER_REPORT_CONFLICT');
   const terminal=['failed','cancelled','ready'].includes(j.status);
   if(!existing&&(terminal||e.stage!==stage))throw Error('WORKER_REPORT_REJECTED');
   // An idempotent receipt cannot keep a still-pending review alive after its
   // original grant is lost. Terminal receipts remain harmless acknowledgments.
   if(!terminal){const denied=this.permissionError(s,j);if(denied){this.failure(s,j,denied);return receipt();}}
   if(existing)return receipt();
   if(stage==='generate'||stage==='review'){
    if(!report||report.errorCode){
     if(stage==='generate')e.generateReport=fingerprint;else e.reviewReport=fingerprint;
     this.failure(s,j,providerErrors.includes(report?.errorCode)?report.errorCode:'PROVIDER_FAILED');return receipt();
    }
    if(!Number.isInteger(report.usageUnits)||report.usageUnits<0||j.usedUnits+report.usageUnits>j.maxUnits)throw Error('BUDGET_EXCEEDED');
   }
   if(stage==='generate'){
    const game=validateArtifact(report.candidate);if(!isGeneratedGame(game))throw Error('GENERATED_ARTIFACT_REQUIRED');
    requireProductionCandidate(j,game);
    j.usedUnits+=report.usageUnits;e.candidate={format:'generated-source-v1',game};delete e.qualityEvidence;
    e.generateReport=fingerprint;j.status='testing';j.phase='testing';
    s.audit.push({jobId:id,familyId:j.familyId,status:'testing',at:new Date().toISOString()});return receipt();
   }
   if(stage==='review'){
    if(!j.qualityRequired||!isGeneratedGame(e.candidate?.game)||!e.qualityEvidence)throw Error('QUALITY_REVIEW_REQUIRED');
    const game=e.candidate.game,review=validateQualityReview(game,e.qualityEvidence,report.review);
    j.usedUnits+=report.usageUnits;e.reviewReport=fingerprint;
    if(review.verdict==='pass')this.ready(s,j,{...game,compiled:{...game.compiled!,quality:review}});
    else this.repair(s,j,'QUALITY_REVIEW_FAILED:'+review.findings.join(','));
    return receipt();
   }
   if(report.ok){
    if(j.independentIntentPlan&&report.game?.compiled?.tests?.intent!==true)throw Error('INTENT_ATTESTATION_REQUIRED');
    const candidate=e.candidate?.game;if(!isGeneratedGame(candidate))throw Error('GENERATED_ARTIFACT_REQUIRED');
    const game=validateCompiled(candidate,report.game as GeneratedGame);requireProductionCandidate(j,game);
    if(j.qualityRequired){
     const evidence=validateQualityEvidence(game,report.qualityEvidence);
     e.candidate={format:'generated-source-v1',game};e.qualityEvidence=evidence;e.testReport=fingerprint;j.phase='reviewing';
    }else{e.testReport=fingerprint;this.ready(s,j,game);}
   }else this.repair(s,j,report?.diagnostics);
   return receipt();
  });
 }
 async status(id:string,identity:WorkerIdentity){
  const j=(await this.repo.snapshot()).jobs.find(x=>x.id===id);
  if(!j||j.execution?.runId!==identity.runId)throw Error('WORKER_FORBIDDEN');return {status:j.status,phase:j.phase};
 }
}
