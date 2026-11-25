import {permitsNewArt} from '../quality/presentation-plan';
import {PREMIUM_POLICY_VERSION,premiumAttemptReserve} from '../agent/model-policy';
import {committedGameUnits,premiumGameCeiling,pinPremiumPolicy,premiumReservation,settleStoppedJob,type PremiumPilot} from './premium-policy';
import {isGeneratedGame,validateCompiled,type GeneratedGame} from '../agent/generated';
import {privateGenerationPreflight} from '../quality/private-generation-preflight';
import {draftChildIntentContract} from '../quality/child-intent';
import {chooseGameForm} from '../quality/game-form';
import {validateFunctionalGameContract,type FunctionalGameContract} from '../quality/functional-game-contract';
import {safeRepairDiagnostic,safeFinalRepairCode} from '../quality/repair-diagnostics';
import {needsCurrentQuality,applyCurrentQualityPolicy,requireProductionCandidate,type QualityTestedGame} from '../quality/quality-policy';
import {validateQualityEvidence,validateQualityReview,qualityRepairContext,type GameQualityEvidence} from '../quality/game-quality';
import { randomUUID,createHash } from 'node:crypto';
import { requireFamily,type VerifiedSession } from '../contracts/api';
import {assertActiveTrustedDevice} from '../trusted-devices';
import {verifiedParentScope} from '../privacy/parent-consent';
import {adultPilotAllowed,adultPilotJobAllowed} from '../adult-pilot';
import {requireResourceAudience} from './audience';
import {buildIdentityText} from '../../src/builder/submission';
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
interface BuilderReadiness {
 available:boolean;
 reason:'READY'|'UNAVAILABLE'|'ALLOWANCE_REQUIRED';
 modelPolicy?:{configuredVersion:string;activeVersion:string|null;reason?:'MODEL_POLICY_UNAVAILABLE'};
}
export interface ArtifactGate { test(game:PlayableGame,context?:{signal?:AbortSignal;independentIntentPlan?:FunctionalGameContract;captureQuality?:boolean}):Promise<QualityTestedGame|void> }
export class JobService {
 private controllers=new Map<string,AbortController>();
 constructor(private repo:Repository,private agent:AgentAdapter,private gate:ArtifactGate,private options:{allowMock:boolean;maxUnits:number;premiumMaxJobMicroUsd?:number;timeoutMs:number;maxRetries:number;maxRepairAttempts?:number;requireVerifiedParentPrivacy?:boolean;adultPilotMode?:boolean;premiumPilot?:PremiumPilot;premiumConfigured?:boolean;premiumUnavailable?:boolean}={allowMock:false,maxUnits:10,timeoutMs:30000,maxRetries:2}){
  if(options.premiumPilot&&(!options.adultPilotMode||agent.kind!=='metered-api'||agent.testFixture))throw Error('ADULT_PILOT_ACCESS_REQUIRED');
 }
 private async authorized(session:VerifiedSession,id:string){const state=await this.repo.snapshot(),job=state.jobs.find(j=>j.id===id);if(!job)throw Error('NOT_FOUND');requireResourceAudience(state,session,job);return job;}
 /** A failed job has one retry successor. Its durable reference lets a browser
  * recover a lost retry acknowledgement without submitting another paid job. */
 private retrySuccessor(state:PipelineState,session:VerifiedSession,prior:Job):Job|undefined {
  const audience=prior.adultPilotProfileId||(prior.adultPilotDeviceId?`adult:${prior.adultPilotDeviceId}`:undefined);
  const matches=state.jobs.filter(job=>job.retryOf===prior.id&&job.familyId===prior.familyId&&
   (job.adultPilotProfileId||(job.adultPilotDeviceId?`adult:${job.adultPilotDeviceId}`:undefined))===audience);
  // Older gateways could admit multiple retry children with different request
  // IDs. Do not guess which accepted job represents the user's lost response.
  if(matches.length>1)throw Error('IDEMPOTENCY_CONFLICT');
  const next=matches[0];
  if(!next)return;
  requireResourceAudience(state,session,next);
  if(prior.status!=='failed'||next.gameId!==prior.gameId||next.prompt!==prior.prompt||next.baseRevisionId!==prior.baseRevisionId||next.retryCount!==prior.retryCount+1)throw Error('IDEMPOTENCY_CONFLICT');
  return next;
 }
 private requireJobPermission(state:PipelineState,job:Job){
  if(this.options.requireVerifiedParentPrivacy&&!verifiedParentScope(state,job.familyId,'generation'))throw Error('GUARDIAN_CONSENT_REQUIRED');
  if(this.options.adultPilotMode||job.adultPilotDeviceId||job.adultPilotSessionId||job.adultPilotProfileId){
   if(!this.options.adultPilotMode||!adultPilotJobAllowed(state,job))throw Error('ADULT_PILOT_ACCESS_REQUIRED');
  }
 }
 /** Read-only, family-authorized availability. This is NOT evidence that a job started. */
 async readiness(session:VerifiedSession):Promise<BuilderReadiness>{
  requireFamily(session,{id:'readiness',familyId:session.familyId});
  const state=await this.repo.snapshot();
  const unavailable={available:false,reason:'UNAVAILABLE' as const};
  try{assertActiveTrustedDevice(state,session);}catch{return unavailable;}
  if((session.adultSessionId||session.adultProfileId)&&!this.options.adultPilotMode)return unavailable;
  if(this.options.requireVerifiedParentPrivacy&&!verifiedParentScope(state,session.familyId,'generation'))return unavailable;
  if(this.options.adultPilotMode&&!adultPilotAllowed(state,session))return unavailable;
  const ledger=state.ledgers[session.familyId],pilot=this.options.premiumPilot;
  const eligible=this.agent.available&&this.agent.kind!=='local-rule'&&this.agent.kind!=='codex-subscription'&&(this.agent.kind!=='mock'||this.options.allowMock);
  // This identifies the configured route for an unlocked operator. Admission,
  // worker execution and observed provider usage have separate receipts.
  const diagnostic=(available:boolean)=>this.options.adultPilotMode?{modelPolicy:{
   configuredVersion:pilot||this.options.premiumConfigured?PREMIUM_POLICY_VERSION:'legacy',
   activeVersion:available?(pilot?PREMIUM_POLICY_VERSION:'legacy'):null,
   ...(this.options.premiumUnavailable?{reason:'MODEL_POLICY_UNAVAILABLE' as const}:{})
  }}:{};
  if(!eligible||this.options.premiumUnavailable)return {...unavailable,...diagnostic(false)};
  let maxUnits=this.agent.kind==='mock'?0:this.options.maxUnits;
  if(pilot){
   try{pinPremiumPolicy(pilot);maxUnits=premiumReservation(pilot,this.options.premiumMaxJobMicroUsd);}
   catch(error){
    if((error as Error).message==='SPENDING_CUTOFF')return {available:false,reason:'ALLOWANCE_REQUIRED' as const,...diagnostic(false)};
    return {...unavailable,...diagnostic(false)};
   }
  }
  if(maxUnits&&(!ledger||!ledger.paidEnabled||ledger.month!==month()||ledger.used+ledger.reserved+maxUnits>ledger.allowance))return {available:false,reason:'ALLOWANCE_REQUIRED' as const,...diagnostic(false)};
  return {available:true,reason:'READY' as const,...diagnostic(true)};
 }
 async setAllowance(session:VerifiedSession,allowance:number,paidEnabled:boolean){requireFamily(session,{id:'budget',familyId:session.familyId});if(session.role!=='parent'||!Number.isInteger(allowance)||allowance<0||allowance>50000000)throw Error('FORBIDDEN');await this.repo.transaction(s=>{const old=s.ledgers[session.familyId];s.ledgers[session.familyId]={month:month(),allowance,paidEnabled,used:old?.month===month()?old.used:0,reserved:old?.reserved||0};return true;});}
 async registerBase(session:VerifiedSession,input:unknown){
  requireFamily(session,{id:'base',familyId:session.familyId});const r=input as {gameId:string;localRevisionId:string;config:unknown};
  if(!r||Object.keys(r).some(k=>!['gameId','localRevisionId','config'].includes(k))||!isGameId(r.gameId)||!safeId(r.localRevisionId))throw Error('INVALID_REQUEST');const config=validateConfig(r.gameId,r.config);
  // A server-owned seed ID binds an approved local manifest/config to this family, not a caller-selected foreign resource.
  return this.repo.transaction(s=>{
   assertActiveTrustedDevice(s,session);
   if(this.options.adultPilotMode?!adultPilotAllowed(s,session):!!(session.adultSessionId||session.adultProfileId))throw Error('ADULT_PILOT_ACCESS_REQUIRED');
   const scope=session.adultProfileId?`${session.familyId}:${session.adultProfileId}`:session.familyId;
   const id='seed-'+createHash('sha256').update(scope+':'+r.localRevisionId).digest('hex'),existing=s.revisions.find(x=>x.id===id);
   if(existing){requireResourceAudience(s,session,existing);if(JSON.stringify(existing.config)!==JSON.stringify(config))throw Error('IDEMPOTENCY_CONFLICT');}
   else s.revisions.push({id,familyId:session.familyId,parentId:null,projectId:id,game:null,sourceGame:r.gameId,config,...(session.adultProfileId?{adultPilotProfileId:session.adultProfileId}:{})});
   return {revisionId:id};
  });
 }
 async submit(session:VerifiedSession,input:unknown){
  requireFamily(session,{id:'submission',familyId:session.familyId});const r=validateBuildRequest(input);
  if(this.agent.testFixture&&!this.options.allowMock)throw Error('TEST_FIXTURE_FORBIDDEN');
  if(!this.agent.available||this.agent.kind==='codex-subscription'||this.agent.kind==='local-rule'||(this.agent.kind==='mock'&&!this.options.allowMock))throw Error('BUILDER_UNAVAILABLE');
  return this.repo.transaction(s=>{
   assertActiveTrustedDevice(s,session);
   if((session.adultSessionId||session.adultProfileId)&&!this.options.adultPilotMode)throw Error('ADULT_PILOT_ACCESS_REQUIRED');
   if(this.options.requireVerifiedParentPrivacy&&!verifiedParentScope(s,session.familyId,'generation'))throw Error('GUARDIAN_CONSENT_REQUIRED');
   if(this.options.adultPilotMode&&!adultPilotAllowed(s,session))throw Error('ADULT_PILOT_ACCESS_REQUIRED');
   const existing=s.jobs.find(j=>j.familyId===session.familyId&&j.clientRequestId===r.clientRequestId&&(j.adultPilotProfileId||(j.adultPilotDeviceId?`adult:${j.adultPilotDeviceId}`:undefined))===session.adultProfileId);
   if(existing){requireResourceAudience(s,session,existing);if(existing.prompt!==r.prompt||existing.baseRevisionId!==r.baseRevisionId||existing.gameId!==r.gameId||existing.retryOf!==r.retryOf)throw Error('IDEMPOTENCY_CONFLICT');return {jobId:existing.id,status:existing.status,adapter:existing.adapter};}
   let retryCount=0;
   if(r.retryOf){
    const prior=s.jobs.find(j=>j.id===r.retryOf);if(!prior)throw Error('NOT_FOUND');requireResourceAudience(s,session,prior);
    if(prior.status!=='failed'||prior.gameId!==r.gameId||prior.prompt!==r.prompt||prior.baseRevisionId!==r.baseRevisionId)throw Error('RETRY_LIMIT');
    // Read and reuse inside the same transaction as reservation. Different
    // client request IDs after reload or concurrent clicks cannot fork retries.
    const next=this.retrySuccessor(s,session,prior);
    if(next)return {jobId:next.id,status:next.status,adapter:next.adapter};
    if(prior.premiumPolicy&&!this.options.premiumPilot)throw Error('MODEL_POLICY_UNAVAILABLE');
    if(prior.retryCount>=this.options.maxRetries)throw Error('RETRY_LIMIT');
    retryCount=prior.retryCount+1;
   }
   const base=r.baseRevisionId?s.revisions.find(x=>x.id===r.baseRevisionId):undefined;
   if(r.baseRevisionId){if(!base)throw Error('NOT_FOUND');requireResourceAudience(s,session,base);}else if(r.gameId!=='new')throw Error('INVALID_REQUEST');
   // O4: reject unsupported or contradictory forms BEFORE reserving an
   // allowance or acknowledging an asynchronous paid build. This uses only
   // server-owned, family-authorized revision data; the private worker
   // independently repeats the same check before reading the model key.
   if(this.agent.kind==='metered-api'){
    privateGenerationPreflight({
      gameManifest:{id:r.gameId,allowedMechanics:[]},
      baseRevision:{id:base?.id||'new',game:base?.game||undefined,config:base?.config,sourceGame:base?.sourceGame,projectId:base?.projectId},
      childIntent:r.prompt,allowedCapabilities:[],
      budget:{maxUnits:0,timeoutMs:0},signal:new AbortController().signal
    });
   }
   const recent=s.audit.filter(e=>e.familyId===session.familyId&&e.status==='queued'&&Date.parse(e.at)>Date.now()-60000);if(recent.length>=10)throw Error('RATE_LIMIT');
   let ledger=s.ledgers[session.familyId];if(!ledger||ledger.month!==month())ledger=s.ledgers[session.familyId]={allowance:0,used:0,reserved:ledger?.reserved||0,paidEnabled:false,month:month()};
   if(this.options.premiumUnavailable)throw Error('MODEL_POLICY_UNAVAILABLE');
   const pilot=this.options.premiumPilot;
   // Existing v1 artifacts remain playable. Their gate has no source-bound
   // screenshot review, so a premium edit cannot satisfy acceptance.
   if(pilot&&!needsCurrentQuality(base?.game))throw Error('GAME_FORM_REVIEW_REQUIRED');
   // A saved premium game (including a fork) binds its paid edits to the
   // reviewed construction policy even after an operator rolls back admission.
   if(!pilot&&isGeneratedGame(base?.game)&&base.game.productionPlan?.version==='game-production-plan-v2')throw Error('MODEL_POLICY_UNAVAILABLE');
   let premiumPolicy,premiumEditCeilingMicroUsd;
   let maxUnits=this.agent.kind==='mock'?0:this.options.maxUnits;
   if(pilot){
    try{premiumPolicy=pinPremiumPolicy(pilot);}catch{throw Error('MODEL_POLICY_UNAVAILABLE');}
    if(base||r.retryOf){
     premiumEditCeilingMicroUsd=premiumGameCeiling(this.options.premiumMaxJobMicroUsd);
     const art=permitsNewArt({childIntent:r.prompt,baseRevision:{id:base?.id||'new',game:base?.game||undefined}});
     maxUnits=premiumAttemptReserve(pilot.approval,'construction',true,art);
     const committed=committedGameUnits(s,session.familyId,session.adultProfileId,r.baseRevisionId,r.retryOf);
     if(committed+maxUnits>premiumEditCeilingMicroUsd)throw Error('GAME_BUDGET_REACHED');
    }else maxUnits=premiumReservation(pilot,this.options.premiumMaxJobMicroUsd);
   }
   if(maxUnits&&(!ledger.paidEnabled||ledger.used+ledger.reserved+maxUnits>ledger.allowance))throw Error('SPENDING_CUTOFF');
   const qualityRequired=this.agent.kind==='metered-api'&&!this.agent.testFixture&&needsCurrentQuality(base?.game)?'game-quality-v1' as const:undefined;
   ledger.reserved+=maxUnits;const job:Job={...r,...(premiumPolicy?{premiumPolicy}:{}),...(premiumEditCeilingMicroUsd?{premiumEditCeilingMicroUsd}:{}),...(qualityRequired?{qualityRequired}:{}),...(this.options.adultPilotMode?{adultPilotDeviceId:session.deviceId,adultPilotSessionId:session.adultSessionId,adultPilotProfileId:session.adultProfileId}:{}),id:uuid(),familyId:session.familyId,status:'draft',adapter:this.agent.testFixture?'mock':this.agent.kind,maxUnits,usedUnits:0,retryCount};s.jobs.push(job);audit(s,job,'queued');return {jobId:job.id,status:'queued' as JobStatus,adapter:job.adapter};
  });
 }
 private jobView(state:PipelineState,session:VerifiedSession,j:Job){
  requireResourceAudience(state,session,j);
  const next=this.retrySuccessor(state,session,j);
  const premium=j.premiumPolicy&&this.options.adultPilotMode&&adultPilotAllowed(state,session);
  const calls=j.premiumUsage?.calls||[];
  const diagnostics=premium?{modelPolicy:{version:j.premiumPolicy!.version,stages:calls,
   repairAttempts:Math.max(0,(j.attempts||0)-1),review:j.status==='ready'?'passed':j.execution?.lastFailure?.stage==='review'?'rejected':['failed','cancelled'].includes(j.status)?'not_completed':'pending',
   measuredTextCostMicroUsd:calls.reduce((sum,c)=>sum+c.costMicroUsd,0),
   imageAllowanceMicroUsd:j.premiumUsage?.imageUsageUnits||0,reservationMicroUsd:j.maxUnits,
   accountedMicroUsd:j.usedUnits,usageUncertain:j.premiumUsage?.uncertain===true}}:{};
  return {...diagnostics,jobId:j.id,status:j.status,revisionId:j.revisionId,errorCode:j.errorCode,adapter:j.adapter,phase:j.phase,attempts:j.attempts,...(next?{retryJobId:next.id}:{})};
 }
 async get(session:VerifiedSession,id:string){
  const state=await this.repo.snapshot(),job=state.jobs.find(job=>job.id===id);if(!job)throw Error('NOT_FOUND');
  return this.jobView(state,session,job);
 }
 /** Read-only recovery for an initial POST whose acknowledgement was lost.
  * Absence is not a rejection: a concurrent admission may still commit later.
  */
 async lookupSubmission(session:VerifiedSession,clientRequestId:string,payloadHash:string){
  requireFamily(session,{id:'request-lookup',familyId:session.familyId});
  if(!safeId(clientRequestId)||typeof payloadHash!=='string'||!/^[a-f0-9]{64}$/.test(payloadHash))throw Error('INVALID_REQUEST');
  const state=await this.repo.snapshot();
  assertActiveTrustedDevice(state,session);
  if((session.adultSessionId||session.adultProfileId)&&!adultPilotAllowed(state,session))throw Error('FORBIDDEN');
  const matches=state.jobs.filter(job=>job.familyId===session.familyId&&job.clientRequestId===clientRequestId&&
   (job.adultPilotProfileId||(job.adultPilotDeviceId?`adult:${job.adultPilotDeviceId}`:undefined))===session.adultProfileId);
  if(matches.length>1)throw Error('IDEMPOTENCY_CONFLICT');
  const job=matches[0];if(!job)return {job:null};
  const view=this.jobView(state,session,job);
  if(job.retryOf||createHash('sha256').update(buildIdentityText(job)).digest('hex')!==payloadHash)throw Error('IDEMPOTENCY_CONFLICT');
  return {job:view};
 }
 async retry(session:VerifiedSession,id:string,clientRequestId:string){const j=await this.authorized(session,id);return this.submit(session,{gameId:j.gameId,baseRevisionId:j.baseRevisionId,prompt:j.prompt,clientRequestId,retryOf:j.id});}
 async cancel(session:VerifiedSession,id:string){const result=await this.repo.transaction(s=>{const job=s.jobs.find(j=>j.id===id);if(!job)throw Error('NOT_FOUND');requireResourceAudience(s,session,job);if(['queued','building','testing'].includes(job.status)){audit(s,job,'cancelled');settleStoppedJob(s,job);if(job.execution){delete job.execution.candidate;delete job.execution.qualityEvidence;}}return {jobId:id,status:job.status};});this.controllers.get(id)?.abort();return result;}
 async run(id:string){
  const start=await this.repo.transaction(s=>{const job=s.jobs.find(j=>j.id===id);if(!job||job.status!=='queued')return null;applyCurrentQualityPolicy(job,s.revisions.find(r=>r.id===job.baseRevisionId)?.game);audit(s,job,'building');return job;});if(!start)return;
  const controller=new AbortController();this.controllers.set(id,controller);let timeout:ReturnType<typeof setTimeout>|undefined;const deadline=new Promise<never>((_,reject)=>{timeout=setTimeout(()=>{reject(Error('BUILD_TIMEOUT'));controller.abort();},this.options.timeoutMs);controller.signal.addEventListener('abort',()=>reject(Error('CANCELLED')),{once:true});});
  try{
   const state=await this.repo.snapshot(),base=state.revisions.find(r=>r.id===start.baseRevisionId);
   this.requireJobPermission(state,start);
   if(start.premiumPolicy)throw Error('ACTIONS_WORKER_REQUIRED');
   let previous:GeneratedGame|undefined,previousEvidence:GameQualityEvidence|undefined,diagnostics='',used=0,testedGame:PlayableGame|undefined;
   // The local fallback must enforce the same independently sourced plan as
   // the private Actions coordinator; no browser-supplied contract is trusted.
   let independentIntentPlan:FunctionalGameContract|undefined;
   if(start.independentIntentPlan){
    if(start.baseRevisionId!==null)throw Error('INTENT_PLAN_REVISION_UNSUPPORTED');
    const intent=draftChildIntentContract(start.prompt);
    independentIntentPlan=validateFunctionalGameContract(start.independentIntentPlan,intent,chooseGameForm(intent));
   }
   const maximum=Math.min(2,Math.max(0,this.options.maxRepairAttempts??2));
   for(let attempt=0;attempt<=maximum;attempt++){
    const input:AgentInput={gameManifest:{id:start.gameId,allowedMechanics:['declarative-star-catcher','generated-module-v1','generated-module-v2']},baseRevision:{id:base?.id||'new',game:base?.game||undefined,config:base?.config,sourceGame:base?.sourceGame,projectId:base?.projectId},childIntent:start.prompt,allowedCapabilities:['declarative-star-catcher','generated-module-v1','generated-module-v2'],budget:{maxUnits:start.maxUnits-used,timeoutMs:this.options.timeoutMs},signal:controller.signal};
    await this.repo.transaction(s=>{const job=s.jobs.find(j=>j.id===id)!;if(!['building','testing'].includes(job.status))throw Error('CANCELLED');this.requireJobPermission(s,job);if(job.status==='testing')audit(s,job,'building');job.phase=attempt?'repairing':'generating';job.attempts=attempt+1;return true;});
    const result=await Promise.race([attempt&&previous&&this.agent.repair?this.agent.repair(input,previous,diagnostics,{qualityEvidence:previousEvidence}):this.agent.generate(input),deadline]);
    if(!Number.isInteger(result.usageUnits)||result.usageUnits<0||result.usageUnits>input.budget.maxUnits)throw Error('BUDGET_EXCEEDED');used+=result.usageUnits;
    const game=validateArtifact(result.candidate);requireProductionCandidate(start,game);
    const testing=await this.repo.transaction(s=>{const job=s.jobs.find(j=>j.id===id)!;if(job.status!=='building')return false;this.requireJobPermission(s,job);job.usedUnits=used;job.phase='testing';audit(s,job,'testing');return true;});if(!testing)return;
    let attemptedGame=game,evidence:GameQualityEvidence|undefined,reviewStarted=false,reviewContext:unknown;
    try{
     const built=await Promise.race([this.gate.test(game,{signal:controller.signal,independentIntentPlan,captureQuality:!!start.qualityRequired}),deadline]);
     attemptedGame=isGeneratedGame(game)?validateCompiled(game,built as GeneratedGame):game;
     if(independentIntentPlan && (attemptedGame as GeneratedGame).compiled?.tests?.intent!==true)
      throw Error('INTENT_ATTESTATION_REQUIRED');
     if(start.qualityRequired){
      if(!isGeneratedGame(attemptedGame)||!this.agent.review)throw Error('QUALITY_REVIEW_REQUIRED');
      evidence=validateQualityEvidence(attemptedGame,built?.qualityEvidence);
      await this.repo.transaction(s=>{const job=s.jobs.find(j=>j.id===id)!;if(job.status!=='testing')throw Error('CANCELLED');this.requireJobPermission(s,job);job.phase='reviewing';return true;});
      reviewStarted=true;
      const result=await Promise.race([this.agent.review({...input,budget:{...input.budget,maxUnits:start.maxUnits-used}},attemptedGame,evidence),deadline]);
      if(!Number.isInteger(result.usageUnits)||result.usageUnits<0||result.usageUnits>start.maxUnits-used)throw Error('BUDGET_EXCEEDED');
      used+=result.usageUnits;
      await this.repo.transaction(s=>{const job=s.jobs.find(j=>j.id===id)!;if(job.status!=='testing')throw Error('CANCELLED');this.requireJobPermission(s,job);job.usedUnits=used;return true;});
      const review=validateQualityReview(attemptedGame,evidence,result.review);
      if(review.verdict!=='pass'){
       reviewContext=qualityRepairContext(attemptedGame,review);
       throw Error('QUALITY_REVIEW_FAILED:'+review.findings.join(','));
      }
      attemptedGame={...attemptedGame,compiled:{...attemptedGame.compiled!,quality:review}};
     }
     testedGame=attemptedGame;
     break;
    }catch(error){
     if(!isGeneratedGame(game)||!this.agent.repair||controller.signal.aborted)throw error;
     if(/^(?:ADULT_PILOT_ACCESS_REQUIRED|GUARDIAN_CONSENT_REQUIRED)$/.test((error as Error).message))throw error;
     // An uncertain paid review request is never automatically repeated. A
     // completed, source-bound rejection is eligible for the bounded repair.
     if(reviewStarted&&!/^QUALITY_REVIEW_FAILED:/.test((error as Error).message))throw error;
     if(attempt>=maximum)throw Error(safeFinalRepairCode((error as Error).message,independentIntentPlan));
     previous=isGeneratedGame(attemptedGame)?attemptedGame:game;previousEvidence=evidence;
     diagnostics=safeRepairDiagnostic((error as Error).message,independentIntentPlan,reviewContext).feedback;
    }
   }
   if(!testedGame)throw Error('REPAIR_EXHAUSTED');
   await this.repo.transaction(s=>{const job=s.jobs.find(j=>j.id===id)!;
    this.requireJobPermission(s,job);
    if(job.status!=='testing')return false;const revision:BuiltRevision={id:uuid(),familyId:job.familyId,parentId:job.baseRevisionId,projectId:base?.projectId||uuid(),game:testedGame!,adapter:job.adapter,...(job.adultPilotProfileId?{adultPilotProfileId:job.adultPilotProfileId}:{})};s.revisions.push(revision);job.revisionId=revision.id;job.usedUnits=used;job.phase='ready';const ledger=s.ledgers[job.familyId];ledger.reserved-=job.maxUnits;ledger.used+=job.usedUnits;audit(s,job,'ready');return true;});
  }catch(err){await this.repo.transaction(s=>{const job=s.jobs.find(j=>j.id===id)!;if(['building','testing'].includes(job.status)){job.errorCode=(err as Error).message;job.phase='failed';settleStoppedJob(s,job);if(job.execution){delete job.execution.candidate;delete job.execution.qualityEvidence;}audit(s,job,'failed',job.errorCode);}return true;});}
  finally{if(timeout)clearTimeout(timeout);this.controllers.delete(id);}
 }
 async revision(session:VerifiedSession,id:string){const state=await this.repo.snapshot(),r=state.revisions.find(r=>r.id===id&&r.game);if(!r)throw Error('NOT_FOUND');requireResourceAudience(state,session,r);return r;}
 async fork(session:VerifiedSession,id:string,name:string){if(typeof name!=='string'||name.trim().length<1||name.length>60)throw Error('INVALID_REQUEST');return this.repo.transaction(s=>{const source=s.revisions.find(r=>r.id===id&&r.game);if(!source)throw Error('NOT_FOUND');requireResourceAudience(s,session,source);const revision={...source,id:uuid(),projectId:uuid(),parentId:null,sourceRevisionId:source.id,name:name.trim()};s.revisions.push(revision);s.active[revision.projectId]=revision.id;return {revisionId:revision.id};});}
 async keep(session:VerifiedSession,id:string){await this.repo.transaction(s=>{const r=s.revisions.find(r=>r.id===id&&r.game);if(!r)throw Error('NOT_FOUND');requireResourceAudience(s,session,r);s.active[r.projectId]=id;return true;});return {revisionId:id};}
 async undo(session:VerifiedSession,id:string){const r=await this.revision(session,id);if(!r.parentId)throw Error('NO_PREVIOUS_VERSION');const parent=await this.revision(session,r.parentId);await this.keep(session,parent.id);return {revisionId:parent.id};}
 async list(session:VerifiedSession){requireFamily(session,{id:'list',familyId:session.familyId});const s=await this.repo.snapshot();assertActiveTrustedDevice(s,session);if((session.adultSessionId||session.adultProfileId)&&!adultPilotAllowed(s,session))throw Error('FORBIDDEN');return s.revisions.filter(r=>r.familyId===session.familyId&&r.adultPilotProfileId===session.adultProfileId&&s.active[r.projectId]===r.id);}
 async recover(){return this.repo.transaction(s=>{for(const j of s.jobs)if(['building','testing'].includes(j.status)){settleStoppedJob(s,j);j.errorCode='WORKER_RESTARTED';j.phase='failed';if(j.execution){delete j.execution.candidate;delete j.execution.qualityEvidence;}audit(s,j,'failed','WORKER_RESTARTED');}return s.jobs.filter(j=>j.status==='queued').map(j=>j.id);});}
}
