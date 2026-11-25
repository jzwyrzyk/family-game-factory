import {randomUUID} from 'node:crypto';
import {createRemoteJWKSet,jwtVerify} from 'jose';
import {checkParentPassphrase,type FamilyParentAuth} from '../trusted-devices';
import {privacyStatus,recordExternalGuardianVerification} from '../privacy/parent-consent';
import type {PipelineState,Repository} from '../pipeline/types';
import {pendingReservations} from './portability';
import {stopJobs} from './stop-jobs';
import {createFamily,familyOrigin,scopes,type BetaConfig,type Capability,type Family,type Policy,uuid} from './model';
import {digest,exact,issueInvitation,verifyParticipation} from './access';
import type {FamilyDirectory,Usage} from './store';
import type {Documents} from './documents';

const iapKeys=createRemoteJWKSet(new URL('https://www.gstatic.com/iap/verify/public_key-jwk'));
export async function verifyAdministrator(assertion:string|undefined,config:{administrator:Pick<BetaConfig['administrator'],'audience'|'subject'>}){
 if(!assertion||assertion.length>16384)throw Error('ADMIN_REQUIRED');
 const {payload}=await jwtVerify(assertion,iapKeys,{issuer:'https://cloud.google.com/iap',audience:config.administrator.audience,algorithms:['ES256'],maxTokenAge:'11m'});
 if(payload.sub!==config.administrator.subject)throw Error('ADMIN_REQUIRED');
 return payload.sub;
}
function publicFamily(f:Family){
 return {id:f.id,status:f.status,contactRef:f.guardian.contactRef,verifiedAt:f.guardian.verifiedAt??null,
  capabilities:f.capabilities,paused:f.paused,generationPaused:f.generationPaused,allowance:f.allowance,
  invitation:f.invitation?{id:f.invitation.id,expiresAt:f.invitation.expiresAt,used:!!f.invitation.usedAt,revoked:!!f.invitation.revokedAt}:null,
  request:f.request??null};
}
const cents=(x:unknown)=>{if(typeof x!=='number'||!Number.isSafeInteger(x)||x<0||x>5000)throw Error('INVALID_AMOUNT');return x*10000;};
function bool(x:unknown){if(typeof x!=='boolean')throw Error('INVALID_REQUEST');return x;}
async function throttle(tx:Documents,path:string,limit:number,now:number){
 const last=await tx.get<{start:number;count:number}>(path);
 const slot=last&&now-last.start<60000?last:{start:now,count:0};
 if(slot.count>=limit)throw Error('RATE_LIMIT');
 return {...slot,count:slot.count+1};
}
function revokeConsent(s:PipelineState,id:string,now:number){
 for(const c of s.parentPrivacyChoices??[])if(c.familyId===id&&!c.revokedAt)c.revokedAt=now;
 s.coachConsent=[];stopJobs(s);
}
export class BetaAdministration {
 constructor(private d:FamilyDirectory){}
 async view(subject:string,id?:string,now=Date.now()){
  if(subject!==this.d.config.administrator.subject)throw Error('ADMIN_REQUIRED');
  return this.d.db.run(async tx=>{
   const policy=await this.d.policy(tx);
   const ids=await tx.get<{ids:string[]}>(this.d.root+'/metadata/directory');
   const binding=await tx.get(this.d.root+'/metadata/household');
   const globalUsage=await tx.get<Usage>(this.d.root+'/usage/'+new Date(now).toISOString().slice(0,7));
   if(!id)return {householdMapped:!!binding,globalUsage:globalUsage??{used:0,reserved:0},mode:'PRIVATE_FAMILY_BETA',policy,evidence:this.d.config.providerEvidence.map(e=>({scope:e.scope,provider:e.provider,expiresAt:e.expiresAt,current:e.expiresAt>now})),
    families:await Promise.all((ids?.ids??[]).map(async k=>publicFamily(await this.d.family(tx,k))))};
   const f=await this.d.family(tx,id);
   const usage=await Promise.all(Array.from({length:13},async(_,i)=>{
    const date=new Date(now),month=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()-i,1)).toISOString().slice(0,7);
    const u=await tx.get<Usage>(this.d.path(id)+'/usage/'+month);return {month,used:u?.used??0,reserved:u?.reserved??0};
   }));
   if(f.request?.kind==='deletion'&&['deleting','completed'].includes(f.request.state))return {...publicFamily(f),origin:familyOrigin(this.d.config,id),privacy:{status:'withdrawn',noticeVersion:null,scopes:{}},devices:[],pending:[],usage};
   const detail=await this.d.inWorkspace(tx,f,policy,s=>({pending:pendingReservations(s),privacy:privacyStatus(s,id,now),devices:(s.devices??[]).map(d=>({id:d.id,name:d.name,expiresAt:d.expiresAt,revoked:!!d.revokedAt}))}),false);
   return {...publicFamily(f),origin:familyOrigin(this.d.config,id),...detail,usage};
  });
 }
 async change(subject:string,input:unknown,now=Date.now()){
  if(subject!==this.d.config.administrator.subject)throw Error('ADMIN_REQUIRED');
  exact(input,['action','target','confirm','passphrase','params']);
  const {action,target,passphrase,params}=input;
  if(typeof action!=='string'||typeof target!=='string'||input.confirm!==action+' '+target||
     typeof passphrase!=='string'||passphrase.length<12||passphrase.length>128)throw Error('CONFIRMATION_REQUIRED');
  const adminPath=this.d.root+'/operators/'+digest(subject);
  // Persist the rate limit and failed reauthentication even when the mutation is refused.
  const allowed=await this.d.db.run(async tx=>{
   const slot=await throttle(tx,adminPath+'/limits/mutations',30,now);
   const attempts=await tx.get<{failedAttempts:number;lockedUntil:number}>(adminPath);
   const auth:FamilyParentAuth={...this.d.config.administrator.verifier,failedAttempts:attempts?.failedAttempts??0,lockedUntil:attempts?.lockedUntil??0};
   const ok=checkParentPassphrase(auth,passphrase,now);
   tx.set(adminPath,{failedAttempts:auth.failedAttempts,lockedUntil:auth.lockedUntil});tx.set(adminPath+'/limits/mutations',slot);
   if(!ok)tx.create(this.d.root+'/audit/'+randomUUID(),{actor:digest(subject),action:'reauth-denied',at:now});
   return ok;
  });
  if(!allowed)throw Error('ADMIN_REQUIRED');
  return this.d.db.run(async tx=>{
   const p=await this.d.policy(tx);let result:Record<string,unknown>={ok:true};
   if(action==='platform'){
    exact(params,['invitations','participation','stop','monthlyCents']);if(target!=='platform')throw Error('INVALID_REQUEST');
    const policy:Policy={version:1,invitations:bool(params.invitations),participation:bool(params.participation),stop:bool(params.stop),monthlyLimit:cents(params.monthlyCents)};
    if(policy.participation&&!(await tx.get(this.d.root+'/metadata/household')))throw Error('HOUSEHOLD_MAPPING_REQUIRED');
    tx.set(this.d.root,policy);
   }else if(action==='create'){
    exact(params,['contactRef']);if(target!=='new'||typeof params.contactRef!=='string'||!/^[-\w]{3,48}$/.test(params.contactRef))throw Error('INVALID_CONTACT_REFERENCE');
    const index=this.d.root+'/metadata/directory',ids=(await tx.get<{ids:string[]}>(index))?.ids??[];
    if(ids.length>=40)throw Error('BETA_CAPACITY');
    const f=createFamily(params.contactRef,now);tx.create(this.d.path(f.id),f);tx.set(index,{ids:[...ids,f.id]});result={familyId:f.id};
   }else{
    const f=await this.d.family(tx,target);
    if(f.request?.kind==='deletion'&&['deleting','completed'].includes(f.request.state))throw Error('INVALID_LIFECYCLE');
    if(action==='invite'||action==='recover'){
     exact(params,[]);if(!p.invitations||!p.participation||f.status==='revoked')throw Error('INVITATIONS_PAUSED');
     if(action==='recover'){
      if(!['active','suspended','pending'].includes(f.status))throw Error('INVALID_LIFECYCLE');
      await this.d.inWorkspace(tx,f,p,s=>{for(const d of s.devices??[])d.revokedAt=now;s.parentAuth={};s.invitations=[];revokeConsent(s,f.id,now);},true);
      f.status='invited';f.plays=[];f.paused=true;delete f.guardian.receiptDigest;delete f.guardian.verifiedAt;delete f.guardian.pairingDigest;
     }
     result={...issueInvitation(f,action==='recover'||f.guardian.pairedDevice?'recovery':'new-family',now),origin:familyOrigin(this.d.config,f.id),purpose:f.invitation!.purpose};
    }else if(action==='revoke-invite'){
     exact(params,[]);if(!f.invitation||f.invitation.usedAt)throw Error('INVALID_LIFECYCLE');f.invitation.revokedAt=now;
    }else if(action==='verify'){
     exact(params,['pairingCode','receipt']);verifyParticipation(f,params.pairingCode,params.receipt,now);
     tx.create(this.d.root+'/verification/'+f.guardian.receiptDigest,{familyId:f.id,at:now});
    }else if(action==='policy'){
     exact(params,['capabilities','monthlyCents','paused','generationPaused']);exact(params.capabilities,[...scopes]);
     const caps=Object.fromEntries(scopes.map(k=>[k,bool((params.capabilities as Record<string,unknown>)[k])])) as Record<Capability,boolean>;
     if(caps.adultPrivate||caps.adultImport)throw Error('FEATURE_RELEASE_REQUIRED');
     const paused=bool(params.paused),generationPaused=bool(params.generationPaused);
     if(paused||generationPaused||!caps.generation)await this.d.inWorkspace(tx,f,p,s=>stopJobs(s),true);
     f.capabilities=caps;f.allowance=cents(params.monthlyCents);f.paused=paused;f.generationPaused=generationPaused;f.plays=[];
    }else if(action==='suspend'||action==='revoke'||action==='resume'){
     exact(params,[]);if(f.status==='revoked'||(action==='resume'&&(f.status!=='suspended'||!f.guardian.verifiedAt)))throw Error('INVALID_LIFECYCLE');
     if(action!=='resume')await this.d.inWorkspace(tx,f,p,s=>{revokeConsent(s,f.id,now);if(action==='revoke')for(const d of s.devices??[])d.revokedAt=now;},true);
     f.status=action==='resume'?'active':action==='suspend'?'suspended':'revoked';f.plays=[];
    }else if(action==='approve-art'){
     exact(params,['digest']);if(typeof params.digest!=='string'||!/^[0-9a-f]{64}$/.test(params.digest))throw Error('INVALID_REQUEST');
     f.approvedArt??=[];if(f.approvedArt.length>=32)throw Error('BETA_CAPACITY');
     if(!f.approvedArt.includes(params.digest))f.approvedArt.push(params.digest);
    }else if(action==='withdraw'){
     exact(params,[]);await this.d.inWorkspace(tx,f,p,s=>revokeConsent(s,f.id,now),true);
    }else if(action==='verify-consent'){
     exact(params,['choiceId','receipt']);if(!uuid(params.choiceId)||typeof params.receipt!=='string'||f.status!=='active')throw Error('VERIFICATION_REQUIRED');
     const {choiceId,receipt}=params;
     const repository:Repository={transaction:fn=>this.d.inWorkspace(tx,f,p,fn,true),snapshot:()=>this.d.inWorkspace(tx,f,p,s=>s,false)};
     await recordExternalGuardianVerification(repository,{familyId:f.id,choiceId,receipt,verifiedByOwner:true},now);
     tx.create(this.d.root+'/verification/'+digest(receipt),{familyId:f.id,at:now});
    }else if(action==='revoke-device'){
     exact(params,['deviceId']);if(!uuid(params.deviceId))throw Error('INVALID_REQUEST');
     await this.d.inWorkspace(tx,f,p,s=>{const device=s.devices?.find(d=>d.id===params.deviceId);if(!device)throw Error('NOT_FOUND');device.revokedAt=now;},true);
     f.plays=f.plays.filter(play=>play.deviceId!==params.deviceId);
    }else if(action==='release-export'||action==='confirm-deletion'){
     exact(params,['requestId','receipt']);
     const kind=action==='release-export'?'export':'deletion';
     if(!f.request||f.request.kind!==kind||f.request.state!=='requested'||params.requestId!==f.request.id||typeof params.receipt!=='string'||!/^[-\w]{12,120}$/.test(params.receipt))throw Error('VERIFICATION_REQUIRED');
     if(kind==='deletion'){
      const reserved=await this.d.inWorkspace(tx,f,p,s=>s.ledgers[f.id].reserved,false);
      if(reserved)throw Error('RESERVATIONS_PENDING');
      f.status='revoked';f.plays=[];
     }
     f.request.state=kind==='export'?'ready':'deleting';f.request.approvedAt=now;
     tx.create(this.d.root+'/verification/'+digest(params.receipt),{familyId:f.id,at:now});
    }else if(action==='request-export'||action==='request-deletion'){
     exact(params,[]);if(f.request&&f.request.state!=='completed'&&!(f.request.kind==='export'&&f.request.approvedAt&&f.request.approvedAt+86400000<=now))throw Error('REQUEST_PENDING');
     f.request={id:randomUUID(),kind:action==='request-export'?'export':'deletion',at:now,state:'requested'};
     if(action==='request-deletion'){await this.d.inWorkspace(tx,f,p,s=>revokeConsent(s,f.id,now),true);f.status='suspended';f.plays=[];}
    }else throw Error('UNKNOWN_ACTION');
    tx.set(this.d.path(target),f);
   }
   tx.create(this.d.root+'/audit/'+randomUUID(),{actor:digest(subject),action,target,at:now});
   return result;
  });
 }
}
