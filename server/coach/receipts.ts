import {randomUUID} from 'node:crypto';
import type {PipelineState,Repository} from '../pipeline/types';
import type {VerifiedSession} from '../contracts/api';
import {assertActiveTrustedDevice} from '../trusted-devices';

/** Longer than either provider deadline (25s text / 15s speech), but finite
 * across gateway restarts. It is never renewed by polling or a provider retry.
 */
export const COACH_RECEIPT_TTL_MS=15*60_000;
export const PAID_RECEIPT_LEASE_MS=60_000;
export interface PaidReceipt {
 id:string;familyId:string;subject:string;month:string;reserved:number;at:number;
 state:'running'|'ready'|'failed';
 /** Optional for receipts written before lease recovery was introduced. */
 reservationId?:string;leaseUntil?:number;recoveredAt?:number;
}

function expired(receipt:PaidReceipt,now:number):boolean {
 return receipt.state==='running'&&now>=(receipt.leaseUntil??receipt.at+PAID_RECEIPT_LEASE_MS);
}

/** The receipt state and allowance settlement commit together. The ledger
 * carries reservations across month changes; old usage belongs to its original
 * month in the content-free audit, not to the current month's used allowance.
 */
export function settlePaidReceipt(state:PipelineState,receipt:PaidReceipt,kind:'coach'|'audio',
 status:'ready'|'failed',used:number,now:number,interrupted=false):boolean {
 if(receipt.state!=='running')return false;
 const ledger=state.ledgers[receipt.familyId];
 if(ledger){
  ledger.reserved=Math.max(0,ledger.reserved-receipt.reserved);
  if(ledger.month===receipt.month)ledger.used+=used;
 }
 receipt.state=status;
 if(interrupted)receipt.recoveredAt=now;
 state.audit.push({jobId:kind+'-'+(receipt.reservationId??randomUUID()),familyId:receipt.familyId,
  status,at:new Date(now).toISOString(),code:kind.toUpperCase()+(interrupted?'_INTERRUPTED':'_TURN'),
  usage:{kind,month:receipt.month,reservedMicroUsd:receipt.reserved,usedMicroUsd:used,
   outcome:interrupted?'interrupted':'settled'}});
 return true;
}

export function expirePaidReceipts(state:PipelineState,now=Date.now(),familyId?:string):number {
 let recovered=0;
 for(const kind of ['coach','audio'] as const){
  const receipts=kind==='coach'?state.coachReceipts:state.audioReceipts;
  for(const receipt of receipts??[]){
   if((familyId!==undefined&&receipt.familyId!==familyId)||!expired(receipt,now))continue;
   // An interrupted provider may already have charged. Never refund or replay
   // it automatically, and never preserve a reply from an unfinished request.
   settlePaidReceipt(state,receipt,kind,'failed',receipt.reserved,now,true);
   if('reply' in receipt)delete receipt.reply;
   recovered++;
  }
 }
 return recovered;
}

/** Readiness/admission/erasure recover only the authenticated family. Startup
 * and the authenticated scheduler can recover all families without inference.
 * A read without expired receipts needs no extra database write.
 */
export async function reconcilePaidReceipts(repo:Repository,session?:VerifiedSession):Promise<PipelineState> {
 const state=await repo.snapshot(),now=Date.now();
 if(session){
  if(session.expiresAt<=now)throw Error('UNAUTHENTICATED');
  assertActiveTrustedDevice(state,session,now);
 }
 const receipts=[...(state.coachReceipts??[]),...(state.audioReceipts??[])];
 const expiredReply=(r:NonNullable<PipelineState['coachReceipts']>[number],at:number)=>
  !!r.reply && r.state!=='running' && (r.recoveredAt??r.at)<at-COACH_RECEIPT_TTL_MS && (!session||r.familyId===session.familyId);
 const cleanup=!!state.betaScopes&&state.coachReceipts?.some(r=>expiredReply(r,now));
 if(!cleanup&&!receipts.some(r=>(!session||r.familyId===session.familyId)&&expired(r,now)))return state;
 return repo.transaction(current=>{
  const now=Date.now();
  if(session){
   if(session.expiresAt<=now)throw Error('UNAUTHENTICATED');
   assertActiveTrustedDevice(current,session,now);
  }
  expirePaidReceipts(current,now,session?.familyId);
  if(current.betaScopes)for(const r of current.coachReceipts??[])if(expiredReply(r,now))delete r.reply;
  return current;
 });
}
