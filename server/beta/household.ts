import type {AtomicStore,Documents} from './documents';
import type {PipelineState,Repository} from '../pipeline/types';
import {readWorkspace,writeWorkspace} from '../pipeline/workspace-state';
import type {PrivateArtifacts} from '../storage/artifacts';
import {closedPolicy,type Policy} from './model';
import type {Usage} from './store';

export interface HouseholdBinding {environment:string;familyId:string;workspace:string}
function location(b:HouseholdBinding){
 if(!/^[a-z0-9-]{1,30}$/.test(b.environment)||![b.workspace,b.familyId].every(v=>typeof v==='string'&&/^[\w-]{1,100}$/.test(v)&&!['constructor','prototype','__proto__'].includes(v))||
  b.workspace.startsWith('beta-'))throw Error('HOUSEHOLD_MAPPING_REQUIRED');
 return 'factoryBeta/'+b.environment;
}
function checkOwnership(s:PipelineState,b:HouseholdBinding){
 if([...s.jobs,...s.revisions,...s.devices??[],...s.invitations??[],...s.audit,...s.parentPrivacyChoices??[],...s.adultPilotPermits??[]].some(r=>r.familyId!==b.familyId)||
  [...Object.keys(s.ledgers),...Object.keys(s.parentAuth??{})].some(k=>k!==b.familyId))throw Error('HOUSEHOLD_OWNER_MISMATCH');
}
export async function bindHousehold(db:AtomicStore,b:HouseholdBinding,apply:boolean,artifacts?:PrivateArtifacts){
 const root=location(b);
 return db.run(async tx=>{
  const existing=await tx.get<HouseholdBinding>(root+'/metadata/household');
  if(existing&&(existing.workspace!==b.workspace||existing.familyId!==b.familyId))throw Error('HOUSEHOLD_MAPPING_CONFLICT');
  const workspace=await readWorkspace(tx,b.workspace,artifacts);
  if(!workspace.chunks)throw Error('EXISTING_HOUSEHOLD_REQUIRED');
  checkOwnership(workspace.state,b);const ledger=workspace.state.ledgers[b.familyId];
  if(!ledger||!/^\d{4}-\d{2}$/.test(ledger.month)||ledger.reserved!==0||!Number.isSafeInteger(ledger.used)||ledger.used<0)throw Error('QUIESCENT_HOUSEHOLD_LEDGER_REQUIRED');
  if(apply&&!existing){
   const path=root+'/usage/'+ledger.month,total=await tx.get<Usage>(path)??{used:0,reserved:0};
   tx.create(root+'/metadata/household',b);tx.set(path,{used:total.used+ledger.used,reserved:total.reserved});
   tx.set(root+'/householdUsage/'+ledger.month,{used:ledger.used,reserved:0});
  }
  return {mapped:!!existing||apply,workspace:b.workspace,familyId:b.familyId,devices:workspace.state.devices?.length??0,
   savedRevisions:workspace.state.revisions.length,adultPermits:workspace.state.adultPilotPermits?.length??0};
 });
}
export function mappedHouseholdRepository(db:AtomicStore,b:HouseholdBinding,artifacts?:PrivateArtifacts):Repository{
 const root=location(b);
 async function run<T>(tx:Documents,operation:(s:PipelineState)=>T,write:boolean){
  const binding=await tx.get<HouseholdBinding>(root+'/metadata/household');
  if(binding?.familyId!==b.familyId||binding.workspace!==b.workspace)throw Error('HOUSEHOLD_MAPPING_REQUIRED');
  const p=await tx.get<Policy>(root)??closedPolicy();
  const loaded=await readWorkspace(tx,b.workspace,artifacts),s=loaded.state;checkOwnership(s,b);
  const old=s.ledgers[b.familyId],original=old?{...old}:undefined;
  const open=p.version===1&&p.stop===false&&Number.isSafeInteger(p.monthlyLimit)&&p.monthlyLimit>=0;
  s.platformSpendingStopped=!open;if(old&&!open)old.paidEnabled=false;
  const result=operation(s);
  if(write){
   const next=s.ledgers[b.familyId];if(!next||!original||!/^\d{4}-\d{2}$/.test(next.month)||!Number.isSafeInteger(next.used)||!Number.isSafeInteger(next.reserved)||next.used<0||next.reserved<0)throw Error('INVALID_LEDGER');
   if(original.month!==next.month&&original.reserved)throw Error('RESERVATIONS_PENDING');
   const delta={used:next.used-(next.month===original.month?original.used:0),reserved:next.reserved-(next.month===original.month?original.reserved:0)};
   if(delta.used<0)throw Error('INVALID_LEDGER');
   if(delta.used||delta.reserved){
    const path=root+'/usage/'+next.month,total=await tx.get<Usage>(path)??{used:0,reserved:0};
    const usage={used:total.used+delta.used,reserved:total.reserved+delta.reserved};
    if(usage.reserved<0||delta.reserved>0&&(!open||usage.used+usage.reserved>p.monthlyLimit))throw Error('SPENDING_CUTOFF');
    tx.set(path,usage);tx.set(root+'/householdUsage/'+next.month,{used:next.used,reserved:next.reserved});
   }
   if(!open)next.paidEnabled=original.paidEnabled;
   delete s.platformSpendingStopped;await writeWorkspace(tx,loaded,artifacts);
  }
  return result;
 }
 return {snapshot:()=>db.run(tx=>run(tx,s=>s,false),true),transaction:update=>db.run(tx=>run(tx,update,true))};
}
