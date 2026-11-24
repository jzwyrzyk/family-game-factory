import {randomUUID} from 'node:crypto';
import {PARENT_PRIVACY_NOTICE_VERSION} from '../privacy/parent-consent';
import type {FamilyParentAuth} from '../trusted-devices';

export const scopes=['games','learning','coding','problemSolving','conversation','generation','remoteSpeech','artwork','adultImport','adultPrivate'] as const;
export type Capability=typeof scopes[number];
export type Capabilities=Record<Capability,boolean>;
export const localCapabilities:Capability[]=['games','learning','coding','problemSolving'];
export const remoteScopes=['conversation','generation','remoteSpeech'] as const;
export type RemoteScope=typeof remoteScopes[number];
export const defaultCapabilities=():Capabilities=>Object.fromEntries(scopes.map(s=>[s,localCapabilities.includes(s)])) as Capabilities;
export const betaNotice=PARENT_PRIVACY_NOTICE_VERSION;
export const participationNotice='family-pilot-2026-11-v1';
export const playLifetime=4*60*60000,playIdle=30*60000;
export const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
export function platformMode(value:unknown):'HOUSEHOLD'|'PRIVATE_FAMILY_BETA'{
 if(value===undefined||value==='HOUSEHOLD')return 'HOUSEHOLD';
 if(value==='PRIVATE_FAMILY_BETA')return value;
 throw Error('PLATFORM_MODE_UNAVAILABLE');
}
export interface Invitation {id:string;purpose:'new-family'|'recovery';digest:string;expiresAt:number;issuedAt:number;usedAt?:number;revokedAt?:number}
export interface Guardian {id:string;contactRef:string;pairedDevice?:string;pairingDigest?:string;participationVersion?:string;verifiedAt?:number;receiptDigest?:string}
export interface Play {digest:string;familyId:string;guardianId:string;deviceId:string;notice:string;terms:string;at:number;lastActive:number;expires:number;entryPending:boolean}
export interface Family {
 id:string;workspace:string;status:'invited'|'pending'|'active'|'suspended'|'revoked';
 guardian:Guardian;capabilities:Capabilities;allowance:number;paused:boolean;generationPaused:boolean;
 invitation?:Invitation;plays:Play[];createdAt:number;profiles?:string[];approvedArt?:string[];
 request?:{id:string;kind:'export'|'deletion';at:number;state:'requested'|'completed'};
}
export interface Policy {version:1;invitations:boolean;participation:boolean;stop:boolean;monthlyLimit:number}
export const closedPolicy=():Policy=>({version:1,invitations:false,participation:false,stop:true,monthlyLimit:0});
export interface ProviderEvidence {notice:string;expiresAt:number;provider:'openai'|'google-cloud';privacyDigest:string;safetyDigest:string;scope:RemoteScope;zdrApproved?:boolean}
export interface BetaConfig {
 environment:string;hubOrigin:string;administrator:{audience:string;subject:string;verifier:Pick<FamilyParentAuth,'salt'|'digest'>};
 ownerActivation:string;operatorContact:string;providerEvidence:ProviderEvidence[];
}
export function validateBeta(config:BetaConfig|undefined,householdWorkspace:string){
 if(!config||config.ownerActivation!=='private-family-beta-v1'||!/^[-a-z0-9]{1,30}$/.test(config.environment)||
  !/^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(config.hubOrigin)||
  !/^[^\s@<>]+@[^\s@<>]+\.[A-Za-z]{2,}$/.test(config.operatorContact)||
  householdWorkspace.startsWith('beta-')||!/^\/projects\/\d+\/global\/backendServices\/\d+$/.test(config.administrator?.audience)||
  !/^[\w:.@-]{1,200}$/.test(config.administrator?.subject)||!/^([a-f0-9]{32})$/.test(config.administrator?.verifier?.salt)||
  !/^[a-f0-9]{64}$/.test(config.administrator?.verifier?.digest)||!Array.isArray(config.providerEvidence))throw Error('BETA_CONFIGURATION_REQUIRED');
 for(const e of config.providerEvidence)if(!remoteScopes.includes(e.scope)||e.notice!==betaNotice||
  e.provider!==(e.scope==='remoteSpeech'?'google-cloud':'openai')||!Number.isSafeInteger(e.expiresAt)||
  !/^[a-f0-9]{64}$/.test(e.privacyDigest)||!/^[a-f0-9]{64}$/.test(e.safetyDigest)||
  (e.provider==='openai'&&e.zdrApproved!==true))throw Error('PROVIDER_EVIDENCE_REJECTED');
 return config;
}
export function createFamily(contactRef:string,now=Date.now()):Family{
 const id=randomUUID();
 return {id,workspace:'beta-'+id,status:'invited',guardian:{id:randomUUID(),contactRef},capabilities:defaultCapabilities(),
  allowance:0,paused:true,generationPaused:true,plays:[],createdAt:now};
}
export function familyOrigin(config:Pick<BetaConfig,'hubOrigin'>,id:string){
 if(!uuid(id))throw Error('INVALID_FAMILY');
 return 'https://f-'+id+'.'+new URL(config.hubOrigin).host;
}
export function workspaceOf(family:Family){
 if(!uuid(family.id)||family.workspace!=='beta-'+family.id)throw Error('FAMILY_MAPPING_REJECTED');
 return family.workspace;
}
export function remoteAllowed(family:Family,policy:Policy,evidence:ProviderEvidence[],scope:RemoteScope,now:number){
 return policy.participation===true&&policy.stop===false&&family.status==='active'&&!family.paused&&
  family.guardian.participationVersion===participationNotice&&!!family.guardian.receiptDigest&&
  family.capabilities[scope]===true&&(scope!=='generation'||!family.generationPaused)&&
  evidence.some(e=>e.scope===scope&&e.expiresAt>now&&e.notice===betaNotice);
}
export function activeFamily(family:Family,policy:Policy){
 if(!policy.participation||family.status!=='active'||!family.guardian.verifiedAt||!family.guardian.receiptDigest||
    family.guardian.participationVersion!==participationNotice)throw Error('FAMILY_ACCESS_PAUSED');
}
