import {createHash} from 'node:crypto';
import {PREMIUM_POLICY_VERSION,premiumAttemptReserve,premiumJobReserve,validatePremiumApproval,type PremiumApproval,type StageUsage} from '../agent/model-policy';
import type {Job,PipelineState} from './types';

export interface PremiumPilot {
 approval:PremiumApproval;
 workerSha:string;
}
export interface PremiumPolicyPin {
 version:typeof PREMIUM_POLICY_VERSION;
 fingerprint:string;
 workerSha:string;
}
export interface PremiumUsage {
 calls:(StageUsage&{attempt:number})[];
 imageUsageUnits:number;
 uncertain?:boolean;
}

// Private JSON configuration can be reordered between process starts. A job
// binds the actual settings (including dates, gates and prices) and worker SHA.
function canonical(value:unknown):string {
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0)
  .map(([key,item])=>JSON.stringify(key)+':'+canonical(item)).join(',')+'}';
 return JSON.stringify(value);
}
export function pinPremiumPolicy(pilot:PremiumPilot):PremiumPolicyPin {
 validatePremiumApproval(pilot.approval);
 if(!/^[0-9a-f]{40}$/.test(pilot.workerSha))throw Error('MODEL_POLICY_WORKER_MISMATCH');
 return {version:PREMIUM_POLICY_VERSION,workerSha:pilot.workerSha,
  fingerprint:createHash('sha256').update(canonical(pilot.approval)).digest('hex')};
}
export function requirePinnedPremium(job:Job,pilot?:PremiumPilot):PremiumApproval {
 if(!pilot||!job.adultPilotProfileId||!job.adultPilotSessionId||!job.adultPilotDeviceId)throw Error('MODEL_POLICY_UNAVAILABLE');
 const pin=pinPremiumPolicy(pilot);
 if(pin.version!==job.premiumPolicy?.version||pin.workerSha!==job.premiumPolicy.workerSha||
   pin.fingerprint!==job.premiumPolicy.fingerprint)throw Error('MODEL_POLICY_CHANGED');
 return pilot.approval;
}
// Admission only. In-flight work and settlement use the job's persisted maxUnits.
export function premiumGameCeiling(ceiling:number|undefined):number {
 if(typeof ceiling!=='number'||!Number.isSafeInteger(ceiling)||ceiling<1||ceiling>5_000_000)throw Error('MODEL_POLICY_UNAVAILABLE');
 return ceiling;
}
export function premiumReservation(pilot:PremiumPilot,configured:number|undefined){
 const ceiling=premiumGameCeiling(configured);
 const units=premiumJobReserve(pilot.approval);
 if(!Number.isSafeInteger(units)||units<1||units>ceiling)throw Error('SPENDING_CUTOFF');
 return units;
}
/** Follow durable ownership and provenance links, including pre-pilot records.
 * A fork has a new project ID but retains its source revision. A failed initial
 * Build may have only a job ID, which its explicit retry retains. */
export function committedGameUnits(state:PipelineState,familyId:string,profileId:string|undefined,baseId:string|null,jobId?:string):number {
 if(!baseId&&!jobId)return 0;
 const links=new Map<string,string[]>();
 function connect(a:string,b:string){
  if(!links.has(a))links.set(a,[]);
  if(!links.has(b))links.set(b,[]);
  links.get(a)!.push(b);
  links.get(b)!.push(a);
 }
 for(const rev of state.revisions){
  if(rev.familyId!==familyId||rev.adultPilotProfileId!==profileId)continue;
  const id='revision/'+rev.id;
  connect(id,'project/'+rev.projectId);
  if(rev.sourceRevisionId)connect(id,'revision/'+rev.sourceRevisionId);
 }
 const jobs=state.jobs.filter(j=>j.familyId===familyId&&j.adultPilotProfileId===profileId);
 for(const job of jobs){
  const id='job/'+job.id;
  if(job.baseRevisionId)connect(id,'revision/'+job.baseRevisionId);
  if(job.revisionId)connect(id,'revision/'+job.revisionId);
  if(job.retryOf)connect(id,'job/'+job.retryOf);
 }
 const pending=baseId?['revision/'+baseId]:[];
 if(jobId)pending.push('job/'+jobId);
 const seen=new Set<string>();
 while(pending.length){
  const node=pending.pop()!;
  if(seen.has(node))continue;
  seen.add(node);
  for(const next of links.get(node)||[])pending.push(next);
 }
 let committed=0;
 for(const job of jobs){
  if(!job.premiumPolicy||!seen.has('job/'+job.id))continue;
  const terminal=job.status==='ready'||job.status==='failed'||job.status==='cancelled';
  const units=terminal?job.usedUnits:job.maxUnits;
  if(!Number.isSafeInteger(units)||units<0)throw Error('MODEL_POLICY_UNAVAILABLE');
  committed+=units;
 }
 return committed;
}

/** Called inside the same report transaction that consumes the previous attempt
 * and schedules its successor. A rejected or replayed report cannot add a hold. */
export function fundPremiumEditRepair(state:PipelineState,job:Job,approval:PremiumApproval,configured:number|undefined,assetRepair:boolean,admitExtra?:(amount:number)=>boolean):string|undefined {
 if(job.premiumEditCeilingMicroUsd===undefined)return; // original whole-job hold
 const required=job.usedUnits+premiumAttemptReserve(approval,'repair',assetRepair,assetRepair);
 const extra=required-job.maxUnits;
 if(extra<=0)return;
 let ceiling:number;
 try{ceiling=Math.min(premiumGameCeiling(configured),premiumGameCeiling(job.premiumEditCeilingMicroUsd));}
 catch{return 'MODEL_POLICY_UNAVAILABLE';}
 const committed=committedGameUnits(state,job.familyId,job.adultPilotProfileId,job.baseRevisionId,job.id);
 if(committed+extra>ceiling)return 'GAME_BUDGET_REACHED';
 const ledger=state.ledgers[job.familyId];
 if(!ledger?.paidEnabled||ledger.month!==new Date().toISOString().slice(0,7)||ledger.used+ledger.reserved+extra>ledger.allowance)return 'SPENDING_CUTOFF';
 if(admitExtra&&!admitExtra(extra))return 'SPENDING_CUTOFF';
 ledger.reserved+=extra;
 job.maxUnits=required;
}

/** A verified report closes its paid claim. While a paid claim is outstanding,
 * cancellation, permission loss or a missing receipt can hide a real charge. */
export function settleStoppedJob(state:PipelineState,job:Job){
 const e=job.execution,unknown=!!job.premiumUsage?.uncertain||
  (e?.stage==='generate'&&!e.generateReport)||(e?.stage==='review'&&!e.reviewReport);
 if(job.premiumPolicy&&unknown)(job.premiumUsage??={calls:[],imageUsageUnits:0}).uncertain=true;
 if(!job.premiumPolicy||unknown)job.usedUnits=job.maxUnits;
 const ledger=state.ledgers[job.familyId];
 ledger.reserved-=job.maxUnits;ledger.used+=job.usedUnits;
}
