import {stopJobs} from './stop-jobs';
import type {AtomicStore,Documents} from './documents';
import {closedPolicy,remoteAllowed,remoteScopes,uuid,workspaceOf,type BetaConfig,type Family,type Policy} from './model';
import type {PipelineState,Repository} from '../pipeline/types';
import type {PrivateArtifacts} from '../storage/artifacts';
import {readWorkspace,writeWorkspace} from '../pipeline/workspace-state';

export interface Usage {used:number;reserved:number}
export class FamilyDirectory {
 readonly root:string;
 constructor(readonly db:AtomicStore,readonly config:BetaConfig,private artifacts:(workspace:string)=>PrivateArtifacts|undefined=()=>undefined){
  this.root='factoryBeta/'+config.environment;
 }
 path(id:string){if(!uuid(id))throw Error('INVALID_FAMILY');return this.root+'/families/'+id;}
 async family(tx:Documents,id:string){
  const f=await tx.get<Family>(this.path(id));
  if(!f||f.id!==id)throw Error('FAMILY_UNAVAILABLE');
  workspaceOf(f);return f;
 }
 async policy(tx:Documents){
  const p=await tx.get<Policy>(this.root)??closedPolicy();
  if(p.version!==1||!['invitations','participation','stop'].every(k=>typeof p[k as keyof Policy]==='boolean')||
    !Number.isSafeInteger(p.monthlyLimit)||p.monthlyLimit<0)throw Error('INVALID_PLATFORM_POLICY');
  return p;
 }
 withFamily<T>(id:string,op:(tx:Documents,f:Family,p:Policy)=>Promise<T>){
  return this.db.run(async tx=>op(tx,await this.family(tx,id),await this.policy(tx)));
 }
 async inWorkspace<T>(tx:Documents,f:Family,p:Policy,update:(s:PipelineState)=>T,write:boolean){
  if(f.request?.kind==='deletion'&&['deleting','completed'].includes(f.request.state))throw Error('FAMILY_UNAVAILABLE');
  const workspace=workspaceOf(f),art=this.artifacts(workspace);
  const loaded=await readWorkspace(tx,workspace,art),s=loaded.state;
  const assertOwnership=()=>{const owned=[...s.jobs,...s.revisions,...s.audit,...s.devices??[],...s.invitations??[],...s.parentPrivacyChoices??[],
   ...s.coachConsent??[],...s.audioReceipts??[],...s.coachReceipts??[],...s.narrationReceipts??[]];
  if(owned.some(row=>row.familyId!==f.id)||Object.keys(s.ledgers).some(id=>id!==f.id)||
    Object.keys(s.parentAuth??{}).some(id=>id!==f.id)||s.adultPilotPermits?.length||s.adultPilotSessions?.length)throw Error('WORKSPACE_OWNER_MISMATCH');};
  assertOwnership();
  const now=Date.now(),month=new Date(now).toISOString().slice(0,7);
  const previous=s.ledgers[f.id],period=previous?.reserved?previous.month:month;
  const previousMonth=previous?.month===period;
  const before={used:previousMonth?previous!.used:0,reserved:previousMonth?previous!.reserved:0};
  const globalPath=this.root+'/usage/'+period;
  const total=await tx.get<Usage>(globalPath)??{used:0,reserved:0};
  s.ledgers[f.id]={...before,month:period,allowance:f.allowance,paidEnabled:!p.stop&&!f.paused&&p.participation&&f.status==='active'};
  s.betaScopes=Object.fromEntries(remoteScopes.map(scope=>[scope,remoteAllowed(f,p,this.config.providerEvidence,scope,now)])) as PipelineState['betaScopes'];
  const deviceStatus=()=>(s.devices??[]).map(({id,familyId,expiresAt,lastSeenAt,revokedAt})=>({id,familyId,expiresAt,lastSeenAt,revokedAt:revokedAt??null}));
  const devicesBefore=JSON.stringify(deviceStatus());
  const consentChoices=()=>JSON.stringify((s.parentPrivacyChoices??[]).map(c=>[c.id,c.revokedAt??null]));
  const priorConsent=consentChoices();
  const count=s.jobs.length,result=update(s);
  if(write){
   assertOwnership();
   if(priorConsent!==consentChoices())stopJobs(s);
   const ledger=s.ledgers[f.id],used=ledger.used-before.used,reserved=ledger.reserved-before.reserved;
   if(ledger.month!==period||ledger.allowance!==f.allowance||!Number.isSafeInteger(ledger.reserved)||!Number.isSafeInteger(ledger.used)||
    ledger.reserved<0||used<0)throw Error('INVALID_LEDGER');
   if(used||reserved){
    const next={used:total.used+used,reserved:total.reserved+reserved};
    if(!Number.isSafeInteger(next.used)||!Number.isSafeInteger(next.reserved)||next.reserved<0||
     (reserved>0&&(!ledger.paidEnabled||period!==month||next.used+next.reserved>p.monthlyLimit||ledger.used+ledger.reserved>f.allowance)))throw Error('SPENDING_CUTOFF');
    tx.set(globalPath,next);
    tx.set(this.path(f.id)+'/usage/'+period,{used:ledger.used,reserved:ledger.reserved});
   }
   for(const job of s.jobs.slice(count)){
    if(job.familyId!==f.id||!uuid(job.id))throw Error('JOB_OWNER_MISMATCH');
    tx.create(this.root+'/jobs/'+job.id,{familyId:f.id});
   }
   const devices=deviceStatus();
   if(JSON.stringify(devices)!==devicesBefore)tx.set(this.path(f.id)+'/metadata/devices',{devices});
   delete s.betaScopes;
   await writeWorkspace(tx,loaded,art);
  }
  return result;
 }
 repository(id:string):Repository {
  return {
   snapshot:()=>this.withFamily(id,(tx,f,p)=>this.inWorkspace(tx,f,p,s=>s,false)),
   transaction:update=>this.withFamily(id,(tx,f,p)=>this.inWorkspace(tx,f,p,update,true))
  };
 }
}
