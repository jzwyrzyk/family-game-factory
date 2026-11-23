import {createHash} from 'node:crypto';
import {PREMIUM_POLICY_VERSION,premiumJobReserve,validatePremiumApproval,type PremiumApproval,type StageUsage} from '../agent/model-policy';
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
export function premiumReservation(pilot:PremiumPilot,ceiling:number){
 const units=premiumJobReserve(pilot.approval);
 if(!Number.isSafeInteger(units)||units<1||units>ceiling)throw Error('SPENDING_CUTOFF');
 return units;
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
