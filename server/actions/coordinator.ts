import {safeProviderFailure} from './provider-failure';
import {createHash,randomUUID} from 'node:crypto';
import {verifiedParentScope} from '../privacy/parent-consent';
import {adultPilotJobAllowed} from '../adult-pilot';
import {devTestJobAllowed,hasAdultJob,hasDevJob,reserveDevRepair} from '../dev-test-policy';
import type {DevAccessPolicy} from '../dev-access';
import {draftChildIntentContract} from '../quality/child-intent';
import {chooseGameForm} from '../quality/game-form';
import {validateFunctionalGameContract} from '../quality/functional-game-contract';
import {needsAssetRepair,safeRepairDiagnostic,safeFinalRepairCode,type RepairCategory,type RepairCode,type QualityRepairAxes} from '../quality/repair-diagnostics';
import {applyCurrentQualityPolicy,requireProductionCandidate} from '../quality/quality-policy';
import {validateQualityEvidence,validateQualityReview,qualityRepairContext,type GameQualityEvidence,type QualityFinding} from '../quality/game-quality';
import {validateArtifact} from '../pipeline/artifacts';
import {isGeneratedGame,validateCompiled,type GeneratedGame} from '../agent/generated';
import {PREMIUM_POLICY_VERSION,isPremiumApproval,validateStageUsage,type PremiumApproval} from '../agent/model-policy';
import {fundPremiumEditRepair,requirePinnedPremium,settleStoppedJob,type PremiumPilot} from '../pipeline/premium-policy';
import type {AgentApproval} from '../agent/openai';
import type {Repository,Job,PipelineState,CandidateArtifact,AgentInput} from '../pipeline/types';
import type {WorkerIdentity,WorkerStage} from './identity';
import type {DispatchPort} from './dispatcher';

export interface ActionFailure {
 stage:'test'|'review';attempt:0|1|2;category:RepairCategory;code:RepairCode;
 findings:QualityFinding[];qualityAxes?:QualityRepairAxes;
}
interface ReportReceipt {
 attempt:number;runId:string;repositoryId:string;sha:string;stage:WorkerStage;fingerprint:string;reviewRequired:boolean;
}
export interface ActionExecution {
 attempt:number;dispatchPending:boolean;queuedAt?:number;dispatchedAt?:number;runId?:string;stage?:WorkerStage;
 candidate?:CandidateArtifact;qualityEvidence?:GameQualityEvidence;diagnostics?:string;repairCategory?:RepairCategory;
 claimAt?:number;generateReport?:string;testReport?:string;reviewReport?:string;
 lastFailure?:ActionFailure;
 /** Fixed phase deadlines advance only on authenticated work transitions. */
 lease?:{phase:'queued'|WorkerStage|'provisioning'|'review-queued';expiresAt:number};
 deadlineAt?:number;
 /** At most three stages per permitted attempt; survives repair identity changes. */
 reportReceipts?:ReportReceipt[];
}

const WORKFLOW_STAGE_MS=12*60*1000,WORKFLOW_PREPARE_MS=18*60*1000,MAX_ATTEMPTS=3;

export class ActionCoordinator {
 constructor(private repo:Repository,private dispatcher:DispatchPort,private approval:AgentApproval,private leaseMs=900000,private requireVerifiedParentPrivacy=false,private adultPilotMode=false,private premiumPilot?:PremiumPilot,private premiumGameCeiling?:number,private testExecution?:Job['testExecution'],private devTestPolicy?:DevAccessPolicy){
  if(isPremiumApproval(approval))throw Error('LEGACY_APPROVAL_REQUIRED');
 }
 private get stageMs(){return Math.min(this.leaseMs,WORKFLOW_STAGE_MS);}
 private get testHandoffMs(){return Math.min(2*this.leaseMs,WORKFLOW_PREPARE_MS+WORKFLOW_STAGE_MS);}
 private initializeLease(s:PipelineState,j:Job){
  const e=j.execution!;
  // Legacy rows have no phase timestamp for an accepted report. Their original
  // claim bounds the whole handoff; reading a row never gives it a fresh lease.
  const timestamps=[e.queuedAt,e.claimAt,Date.parse(s.audit.find(a=>a.jobId===j.id)?.at||'')].filter((at):at is number=>typeof at==='number'&&Number.isFinite(at));
  const anchor=timestamps.length?Math.min(...timestamps):0;
  // Queue + generation + preparation/test + review, at most three attempts.
  // Test/review claims share the preceding handoff deadline instead of adding
  // another full job allowance after setup has already consumed that time.
  e.deadlineAt??=anchor+MAX_ATTEMPTS*(this.leaseMs+2*this.stageMs+this.testHandoffMs);
  if(e.lease)return;
  const claim=e.claimAt??anchor;
  if(!e.runId)e.lease={phase:'queued',expiresAt:(e.queuedAt??anchor)+this.leaseMs};
  else if(e.stage==='generate'&&e.generateReport)e.lease={phase:'provisioning',expiresAt:claim+this.stageMs+this.testHandoffMs};
  else if(e.stage==='test'&&e.testReport&&j.phase==='reviewing')e.lease={phase:'review-queued',expiresAt:claim+2*this.stageMs};
  else e.lease={phase:e.stage||'generate',expiresAt:claim+this.stageMs};
  e.lease.expiresAt=Math.min(e.lease.expiresAt,e.deadlineAt);
 }
 private advanceLease(j:Job,phase:NonNullable<ActionExecution['lease']>['phase']){
  const e=j.execution!;
  // The private workflow allows 18 minutes to provision and 12 minutes for test
  // setup/execution. Keep that handoff separate from time spent generating.
  const sharesHandoff=phase==='test'&&e.lease?.phase==='provisioning'||phase==='review'&&e.lease?.phase==='review-queued';
  const duration=phase==='queued'?this.leaseMs:phase==='provisioning'?this.testHandoffMs:this.stageMs;
  e.lease={phase,expiresAt:Math.min(Date.now()+duration,sharesHandoff?e.lease!.expiresAt:Infinity,e.deadlineAt!)};
 }
 private leaseError(s:PipelineState,j:Job):string|undefined {
  this.initializeLease(s,j);const e=j.execution!;
  if(Date.now()>=e.deadlineAt!)return 'WORKER_LEASE_EXPIRED';
  if(Date.now()>=e.lease!.expiresAt)return e.lease!.phase==='queued'?'WORKER_QUEUE_EXPIRED':'WORKER_LEASE_EXPIRED';
 }
 async enqueue(id:string){await this.repo.transaction(s=>{const j=s.jobs.find(x=>x.id===id);if(j?.status==='queued'&&!j.execution){j.execution={attempt:0,dispatchPending:true,queuedAt:Date.now()};this.initializeLease(s,j);}return true;});}
 private permissionError(s:PipelineState,j:Job):string|undefined {
  if(this.testExecution||j.testExecution){
   const policy=this.testExecution,pin=j.testExecution;
   if(!pin||!policy||pin.providerMode!==policy.providerMode||pin.publicSourceSha!==policy.publicSourceSha||
    pin.workerSha!==policy.workerSha||pin.expiresAt!==policy.expiresAt||pin.authorizationSha256!==policy.authorizationSha256||
    Date.now()>=pin.expiresAt||pin.providerMode==='funded'&&!j.premiumPolicy||pin.providerMode==='fixture'&&(j.adapter!=='mock'||j.premiumPolicy))return 'TEST_EXECUTION_POLICY_REQUIRED';
  }
  if(s.platformSpendingStopped||this.devTestPolicy&&Date.now()>=this.devTestPolicy.allowanceExpiresAt)return 'SPENDING_CUTOFF';
  if(hasDevJob(j)){if(j.premiumPolicy||this.testExecution)return 'DEV_TEST_ACCESS_REQUIRED';return devTestJobAllowed(s,j,this.devTestPolicy)?undefined:'DEV_TEST_ACCESS_REQUIRED';}
  if(this.devTestPolicy&&!hasAdultJob(j))return 'DEV_TEST_ACCESS_REQUIRED';
  if(j.premiumPolicy){
   if(!this.adultPilotMode)return 'ADULT_PILOT_ACCESS_REQUIRED';
   try{requirePinnedPremium(j,this.premiumPilot);}catch(error){return (error as Error).message;}
  }
  if(this.requireVerifiedParentPrivacy&&!verifiedParentScope(s,j.familyId,'generation'))return 'GUARDIAN_CONSENT_REQUIRED';
  if((this.adultPilotMode||hasAdultJob(j))&&
    (!this.adultPilotMode||!adultPilotJobAllowed(s,j)))return 'ADULT_PILOT_ACCESS_REQUIRED';
 }
 private failure(s:PipelineState,j:Job,code:string){
  if(['ready','failed','cancelled'].includes(j.status))return;
  j.status='failed';j.errorCode=code;j.phase='failed';settleStoppedJob(s,j);
  s.audit.push({jobId:j.id,familyId:j.familyId,status:'failed',code,at:new Date().toISOString()});
  if(j.execution){delete j.execution.candidate;delete j.execution.qualityEvidence;}
 }
 private input(s:PipelineState,j:Job):Omit<AgentInput,'signal'>{
  const base=s.revisions.find(r=>r.id===j.baseRevisionId);
  return {gameManifest:{id:j.gameId,allowedMechanics:['generated-module-v1','generated-module-v2']},
   baseRevision:{id:base?.id||'new',game:base?.game||undefined,config:base?.config,sourceGame:base?.sourceGame,projectId:base?.projectId},
   childIntent:j.prompt,allowedCapabilities:['generated-module-v1','generated-module-v2'],
   budget:{maxUnits:j.maxUnits-j.usedUnits,timeoutMs:Math.min(600000,Math.max(1,(j.execution?.lease?.expiresAt??Date.now()+600000)-Date.now()))}};
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
 private repair(s:PipelineState,j:Job,stage:'test'|'review',diagnostics:unknown,reviewContext?:unknown){
  const e=j.execution!;
  const safe=safeRepairDiagnostic(diagnostics,j.independentIntentPlan,stage==='review'?reviewContext:undefined);
  // Record the actual rejected attempt before exhaustion or retry changes its
  // identity. Existing diagnostics remain the previous repair's feedback.
  if(e.attempt===0||e.attempt===1||e.attempt===2)e.lastFailure={stage,attempt:e.attempt,
   category:safe.category,code:safe.code,findings:[...(safe.findings||[])],
   ...(safe.qualityAxes?{qualityAxes:{...safe.qualityAxes}}:{})};
  const premium=j.premiumPolicy?requirePinnedPremium(j,this.premiumPilot):undefined;
  const maxRepairAttempts=premium?.maxRepairAttempts??2;
  if(e.attempt>=maxRepairAttempts){this.failure(s,j,safeFinalRepairCode(diagnostics,j.independentIntentPlan));return;}
  if(premium){
   const denied=fundPremiumEditRepair(s,j,premium,this.premiumGameCeiling,needsAssetRepair(safe.feedback),extra=>reserveDevRepair(s,this.devTestPolicy,j,extra));
   if(denied){this.failure(s,j,denied);return;}
  }
  e.attempt++;e.queuedAt=Date.now();e.runId=undefined;e.stage=undefined;e.generateReport=undefined;e.testReport=undefined;e.reviewReport=undefined;
  e.claimAt=undefined;e.dispatchedAt=undefined;e.dispatchPending=true;e.diagnostics=safe.feedback;e.repairCategory=safe.category;
  this.advanceLease(j,'queued');
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
    const expired=this.leaseError(s,j);if(expired){this.failure(s,j,expired);continue;}
    if(e.dispatchPending&&(!e.dispatchedAt||Date.now()-e.dispatchedAt>30000)){
     e.dispatchPending=false;e.dispatchedAt=Date.now();ids.push({id:j.id,attempt:e.attempt});
    }else if(!e.runId&&e.dispatchedAt&&Date.now()-e.dispatchedAt>60000)e.dispatchPending=true;
   }return ids;
  });
  for(const p of pending)try{await this.dispatcher.dispatch(p.id,p.attempt);}catch{
   await this.repo.transaction(s=>{const j=s.jobs.find(x=>x.id===p.id);if(j?.execution&&!j.execution.runId)j.execution.dispatchPending=true;return true;});
  }
 }
 async claim(id:string,attempt:number,stage:WorkerStage,identity:WorkerIdentity,workerPolicy?:string){
  const task=await this.repo.transaction(s=>{
   const j=s.jobs.find(x=>x.id===id),e=j?.execution;
   if(identity.stage!==stage||!j||!e||e.attempt!==attempt||['ready','failed','cancelled'].includes(j.status)||e.runId&&e.runId!==identity.runId)throw Error('WORKER_CLAIM_REJECTED');
   const denied=this.permissionError(s,j);if(denied)throw Error(denied);
   const expired=this.leaseError(s,j);if(expired)throw Error(expired);
   if(j.premiumPolicy&&(workerPolicy!==PREMIUM_POLICY_VERSION||identity.sha!==j.premiumPolicy.workerSha)){
    this.failure(s,j,'MODEL_POLICY_WORKER_MISMATCH');return {error:'MODEL_POLICY_WORKER_MISMATCH' as const};
   }
   const approval=j.premiumPolicy?requirePinnedPremium(j,this.premiumPilot):this.approval;
   applyCurrentQualityPolicy(j,s.revisions.find(r=>r.id===j.baseRevisionId)?.game);
   if(stage==='generate'){
    if(!this.approval.enabled||!s.ledgers[j.familyId]?.paidEnabled)throw Error('OWNER_APPROVAL_REQUIRED');
    if(e.stage||!['queued','building'].includes(j.status))throw Error('WORKER_CLAIM_REJECTED');
    e.runId=identity.runId;e.stage=stage;e.claimAt=Date.now();j.status='building';j.phase=attempt?'repairing':'generating';j.attempts=attempt+1;
    this.advanceLease(j,stage);
    s.audit.push({jobId:id,familyId:j.familyId,status:'building',at:new Date().toISOString()});
    return {input:this.input(s,j),approval,previous:e.candidate?.game,diagnostics:e.diagnostics,qualityEvidence:e.qualityEvidence,independentIntentPlan:undefined};
   }
   if(stage==='review'){
    if(!this.approval.enabled||!s.ledgers[j.familyId]?.paidEnabled)throw Error('OWNER_APPROVAL_REQUIRED');
    if(!j.qualityRequired||j.status!=='testing'||j.phase!=='reviewing'||e.stage!=='test'||!e.testReport||!isGeneratedGame(e.candidate?.game)||!e.qualityEvidence)throw Error('WORKER_CLAIM_REJECTED');
    const game=e.candidate.game,evidence=validateQualityEvidence(game,e.qualityEvidence);
    requireProductionCandidate(j,game);e.stage=stage;e.claimAt=Date.now();
    this.advanceLease(j,stage);
    const denied=this.permissionError(s,j);if(denied)throw Error(denied);
    return {input:this.input(s,j),approval,game,qualityEvidence:evidence,independentIntentPlan:undefined};
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
   this.advanceLease(j,stage);
   return {game:e.candidate.game,captureQuality:!!j.qualityRequired,...(independentIntentPlan?{independentIntentPlan}:{})};
  });
  if(task.error)throw Error(task.error);
  return task;
 }
 private recordUsage(job:Job,approval:PremiumApproval,stage:'generate'|'review',report:any,partial:boolean){
  const e=job.execution!;
  const expected=stage==='review'?'review':e.attempt?'repair':'construction';
  const calls=validateStageUsage(approval,report.stageUsage,expected,report.usageUnits,report.imageUsageUnits,partial);
  if(!partial&&expected==='construction'&&!calls.some(call=>call.stage==='planning'))throw Error('MODEL_USAGE_INVALID');
  if(!Number.isSafeInteger(report.usageUnits)||report.usageUnits<0||job.usedUnits+report.usageUnits>job.maxUnits)throw Error('BUDGET_EXCEEDED');
  const usage=job.premiumUsage??={calls:[],imageUsageUnits:0};
  usage.calls.push(...calls.map(call=>({...call,attempt:e.attempt})));
  usage.imageUsageUnits+=report.imageUsageUnits;
 }
 async report(id:string,attempt:number,stage:WorkerStage,identity:WorkerIdentity,report:any){
  const fingerprint=createHash('sha256').update(JSON.stringify(report)).digest('hex');
  return this.repo.transaction(s=>{
   const j=s.jobs.find(x=>x.id===id),e=j?.execution;
   if(identity.stage!==stage||!j||!e)throw Error('WORKER_REPORT_REJECTED');
   const recorded=e.reportReceipts?.find(r=>r.attempt===attempt&&r.stage===stage&&r.runId===identity.runId);
   if(recorded&&(recorded.repositoryId!==identity.repositoryId||recorded.sha!==identity.sha))throw Error('WORKER_REPORT_REJECTED');
   if(recorded&&recorded.fingerprint!==fingerprint)throw Error('WORKER_REPORT_CONFLICT');
   if(!recorded&&(e.attempt!==attempt||e.runId!==identity.runId))throw Error('WORKER_REPORT_REJECTED');
   applyCurrentQualityPolicy(j,s.revisions.find(r=>r.id===j.baseRevisionId)?.game);
   const receipt=()=>{
    if(recorded)return {accepted:true,reviewRequired:recorded.reviewRequired};
    const reviewRequired=stage==='test'&&j.phase==='reviewing';
    e.reportReceipts=[...(e.reportReceipts||[]),{attempt,runId:identity.runId,repositoryId:identity.repositoryId,sha:identity.sha,stage,fingerprint,reviewRequired}].slice(-MAX_ATTEMPTS*3);
    return {accepted:true,reviewRequired};
   };
   const existing=stage==='generate'?e.generateReport:stage==='test'?e.testReport:e.reviewReport;
   if(!recorded&&existing&&existing!==fingerprint)throw Error('WORKER_REPORT_CONFLICT');
   const terminal=['failed','cancelled','ready'].includes(j.status);
   if(!recorded&&!existing&&(terminal||e.stage!==stage))throw Error('WORKER_REPORT_REJECTED');
   // An idempotent receipt cannot keep a still-pending review alive after its
   // original grant is lost. Terminal receipts remain harmless acknowledgments.
   if(!terminal){
    const denied=this.permissionError(s,j)||(!this.approval.enabled||!s.ledgers[j.familyId]?.paidEnabled?'OWNER_APPROVAL_REQUIRED':undefined)||this.leaseError(s,j);
    if(denied){
     this.failure(s,j,denied);
     // Preserve acknowledgments already accepted under valid authority, but
     // never create a new replay receipt for a late or unauthorized result.
     return {accepted:true,reviewRequired:recorded?.reviewRequired??false};
    }
   }
   if(recorded||existing)return receipt();
   if(stage==='generate'||stage==='review'){
    if(!report||report.errorCode){
     if(stage==='generate')e.generateReport=fingerprint;else e.reviewReport=fingerprint;
     if(j.premiumPolicy){
      if(report&&typeof report.usageComplete==='boolean'){
       this.recordUsage(j,requirePinnedPremium(j,this.premiumPilot),stage,report,true);
       j.usedUnits+=report.usageUnits;
      }
      if(report?.usageComplete!==true)(j.premiumUsage??={calls:[],imageUsageUnits:0}).uncertain=true;
     }
     this.failure(s,j,safeProviderFailure(report?.errorCode));return receipt();
    }
    if(j.premiumPolicy)this.recordUsage(j,requirePinnedPremium(j,this.premiumPilot),stage,report,false);
    if(j.testExecution?.providerMode==='fixture'&&report.usageUnits!==0)throw Error('BUDGET_EXCEEDED');
    if(!Number.isInteger(report.usageUnits)||report.usageUnits<0||j.usedUnits+report.usageUnits>j.maxUnits)throw Error('BUDGET_EXCEEDED');
   }
   if(stage==='generate'){
    const game=validateArtifact(report.candidate);if(!isGeneratedGame(game))throw Error('GENERATED_ARTIFACT_REQUIRED');
    requireProductionCandidate(j,game);
    j.usedUnits+=report.usageUnits;e.candidate={format:'generated-source-v1',game};delete e.qualityEvidence;
    e.generateReport=fingerprint;j.status='testing';j.phase='testing';
    this.advanceLease(j,'provisioning');
    s.audit.push({jobId:id,familyId:j.familyId,status:'testing',at:new Date().toISOString()});return receipt();
   }
   if(stage==='review'){
    if(!j.qualityRequired||!isGeneratedGame(e.candidate?.game)||!e.qualityEvidence)throw Error('QUALITY_REVIEW_REQUIRED');
    const game=e.candidate.game,review=validateQualityReview(game,e.qualityEvidence,report.review);
    j.usedUnits+=report.usageUnits;e.reviewReport=fingerprint;
    if(review.verdict==='pass')this.ready(s,j,{...game,compiled:{...game.compiled!,quality:review}});
    else this.repair(s,j,'review','QUALITY_REVIEW_FAILED:'+review.findings.join(','),qualityRepairContext(game,review));
    return receipt();
   }
   if(report.ok){
    if(j.independentIntentPlan&&report.game?.compiled?.tests?.intent!==true)throw Error('INTENT_ATTESTATION_REQUIRED');
    const candidate=e.candidate?.game;if(!isGeneratedGame(candidate))throw Error('GENERATED_ARTIFACT_REQUIRED');
    const game=validateCompiled(candidate,report.game as GeneratedGame);requireProductionCandidate(j,game);
    if(j.qualityRequired){
     const evidence=validateQualityEvidence(game,report.qualityEvidence);
     e.candidate={format:'generated-source-v1',game};e.qualityEvidence=evidence;e.testReport=fingerprint;j.phase='reviewing';
     this.advanceLease(j,'review-queued');
    }else{e.testReport=fingerprint;this.ready(s,j,game);}
   }else this.repair(s,j,'test',report?.diagnostics);
   return receipt();
  });
 }
 async status(id:string,identity:WorkerIdentity){
  const s=await this.repo.snapshot(),j=s.jobs.find(x=>x.id===id);
  if(!j||j.execution?.runId!==identity.runId)throw Error('WORKER_FORBIDDEN');
  if(!['ready','failed','cancelled'].includes(j.status)){
   const denied=this.permissionError(s,j)||(!this.approval.enabled||!s.ledgers[j.familyId]?.paidEnabled?'OWNER_APPROVAL_REQUIRED':undefined)||this.leaseError(s,j);
   if(denied)return {status:'failed',phase:'failed'};
  }
  return {status:j.status,phase:j.phase};
 }
}
