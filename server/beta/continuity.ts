import type {IncomingMessage,ServerResponse} from 'node:http';
import {createHash,randomUUID} from 'node:crypto';
import {readJsonBody} from '../http-json';
import {verifySession} from '../pipeline/auth';
import {cookieValue} from '../trusted-devices';
import {ContinuityService,DocumentContinuityRepository} from '../storage/continuity';
import {storageDomains,requiredStorageDomains,type StorageDomain} from '../../src/storage/sync-contract';
import {recordId,scopeKey,type RecordOperation,type RecordScope} from '../../src/storage/record-contract';
import {activeFamily,betaNotice,participationNotice,familyOrigin,workspaceOf,type Family} from './model';
import {exact,internalCookies,metadataSession,metadataPlay} from './access';
import type {FamilyDirectory} from './store';
import type {Documents} from './documents';

interface StorageGrant {id:string;version:1;notice:string;participation:string;guardianNotice:string;renewedAt:number;guardian:string;profiles:string[];domains:StorageDomain[];at:number;revokedAt?:number}
const renewed=(f:Family)=>(f.guardian as Family['guardian']&{participationRenewedAt?:number}).participationRenewedAt??0;
const grantPath=(d:FamilyDirectory,id:string)=>d.path(id)+'/continuity/authorization';
const epoch=(grant:StorageGrant)=>grant.id+'-'+createHash('sha256').update(JSON.stringify([grant.notice,grant.participation,grant.guardianNotice,grant.renewedAt,grant.profiles.slice().sort(),grant.domains.slice().sort()])).digest('hex');
function policy(d:FamilyDirectory){const c=d.config.continuity;if(!c?.enabled)throw Error('CONTINUITY_DISABLED');return c;}
function allowed(g:StorageGrant|undefined,f:Family,notice:string,profile:string){
 if(!g||g.version!==1||g.notice!==notice||g.participation!==participationNotice||g.guardianNotice!==betaNotice||g.renewedAt!==renewed(f)||g.guardian!==f.guardian.id||g.revokedAt!==undefined||!g.profiles.includes(profile)||!f.profiles?.includes(profile))throw Error('STORAGE_CONSENT_REQUIRED');return g;
}
async function parent(d:FamilyDirectory,tx:Documents,f:Family,raw:string|undefined,key:string,now:number){
 const session=await metadataSession(d,tx,f,raw,key,now),grant=verifySession(cookieValue(internalCookies(raw),'factory_parent'),key,now);
 if(grant.role!=='parent'||grant.familyId!==f.id||grant.deviceId!==session.deviceId)throw Error('FORBIDDEN');
 return grant;
}
/** Guardian UI can narrow or withdraw separately authorized cloud-copy domains.
 * Feature activation remains a deployment policy; no checkbox turns it on. */
export async function storageConsent(d:FamilyDirectory,id:string,raw:string|undefined,key:string,input?:unknown,now=Date.now()){
 return d.withFamily(id,async(tx,f,p)=>{
  activeFamily(f,p);if(f.request?.kind==='deletion')throw Error('DELETION_PENDING');await parent(d,tx,f,raw,key,now);
  const config=d.config.continuity,current=await tx.get<StorageGrant>(grantPath(d,id));
  if(input!==undefined){
   exact(input,['notice','profiles','domains','acknowledged']);
   if(input.acknowledged===true&&Array.isArray(input.profiles)&&!input.profiles.length&&Array.isArray(input.domains)&&!input.domains.length){
    if(input.notice!==(config?.notice??current?.notice??null))throw Error('STORAGE_CONSENT_REQUIRED');
    if(current){const withdrawn={...current,id:randomUUID(),profiles:[],domains:[],revokedAt:now};tx.set(grantPath(d,id),withdrawn);tx.create(d.path(id)+'/storage-consents/'+randomUUID(),withdrawn);}
    return {enabled:config?.enabled===true,notice:config?.notice??current?.notice??null,available:[],profiles:f.profiles??[],selected:null};
   }
   const enabled=policy(d);
   if(input.notice!==enabled.notice||input.acknowledged!==true||!Array.isArray(input.profiles)||!Array.isArray(input.domains)||
    input.profiles.length>6||new Set(input.profiles).size!==input.profiles.length||new Set(input.domains).size!==input.domains.length||
    input.profiles.some(v=>typeof v!=='string'||!f.profiles?.includes(v))||input.domains.some(v=>!enabled.domains.includes(v as StorageDomain)||!f.storageDomains?.includes(v as StorageDomain)))throw Error('STORAGE_CONSENT_REQUIRED');
   const grant:StorageGrant={id:randomUUID(),version:1,notice:enabled.notice,participation:participationNotice,guardianNotice:betaNotice,renewedAt:renewed(f),guardian:f.guardian.id,profiles:input.profiles as string[],domains:input.domains as StorageDomain[],at:now};
   if(!grant.domains.length||!grant.profiles.length)grant.revokedAt=now;
   tx.set(grantPath(d,id),grant);
   tx.create(d.path(id)+'/storage-consents/'+randomUUID(),grant);
   return {enabled:true,notice:enabled.notice,available:enabled.domains.filter(x=>f.storageDomains?.includes(x)),profiles:f.profiles??[],selected:grant};
  }
  return {enabled:config?.enabled===true,notice:config?.notice??current?.notice??null,available:config?.enabled?config.domains.filter(x=>f.storageDomains?.includes(x)):[],profiles:f.profiles??[],selected:current??null};
 });
}
export async function continuityRequest(d:FamilyDirectory,id:string,raw:string|undefined,key:string,path:string,input:unknown,now=Date.now()){
 const config=policy(d);
 if(!input||typeof input!=='object'||!('profile' in input)||!recordId(input.profile))throw Error('INVALID_REQUEST');
 const profile=input.profile,scope:RecordScope={family:id,profile};
 const body=input as Record<string,unknown>;
 const authorize=async(tx:Documents,collections:string[])=>{
  const f=await d.family(tx,id),p=await d.policy(tx);activeFamily(f,p);
  if(f.request?.kind==='deletion')throw Error('FAMILY_ACCESS_PAUSED');
  await metadataPlay(d,tx,f,raw,key,Math.max(now,Date.now()));
  const grant=allowed(await tx.get<StorageGrant>(grantPath(d,id)),f,config.notice,profile);
  for(const collection of collections)for(const domain of requiredStorageDomains(collection))if(!config.domains.includes(domain)||!f.storageDomains?.includes(domain)||!grant.domains.includes(domain))throw Error('STORAGE_DOMAIN_DENIED');
  if(collections.some(c=>requiredStorageDomains(c).includes('backups'))){
   if(!f.profiles?.length||f.profiles.some(p=>!grant.profiles.includes(p)))throw Error('STORAGE_CONSENT_REQUIRED');
   await parent(d,tx,f,raw,key,now);
   if(path==='/v1/storage/commit')for(const change of (body.operation as RecordOperation).changes)if(change.collection==='recovery-points'){
    const root=change.value as any,owners=root?.manifest?.scope?.owners;
    if(root?.schema!=='jems.cloud-recovery.v1'||root.manifest.scope.audience!=='family'||root.manifest.scope.origin!==familyOrigin(d.config,id)||!Array.isArray(owners)||!owners.length||owners.some((p:unknown)=>typeof p!=='string'||!f.profiles?.includes(p)||!grant.profiles.includes(p)))throw Error('STORAGE_SCOPE_DENIED');
   }
  }
  return {...grant,domains:grant.domains.filter(x=>f.storageDomains?.includes(x)&&config.domains.includes(x))};
 };
 let collections:string[]=[];
 if(path==='/v1/storage/commit'){
  exact(body,['profile','operation']);const operation=body.operation as RecordOperation;
  if(!operation||operation.scope?.family!==id||operation.scope.profile!==profile||!Array.isArray(operation.changes))throw Error('CONTINUITY_DENIED');
  collections=operation.changes.map(c=>c?.collection);
 }else if(path==='/v1/storage/page'){exact(body,['profile','collection','after','limit']);collections=[body.collection as string];}
 else if(path==='/v1/storage/read'){exact(body,['profile','collection','id','version']);collections=[body.collection as string];}
 else if(path==='/v1/storage/lookup')exact(body,['profile','operation']);
 else if(path==='/v1/storage/changes')exact(body,['profile','after','limit','epoch']);
 else if(path==='/v1/storage/status')exact(body,['profile']);
 else throw Error('NOT_FOUND');
 if(path==='/v1/storage/status')return d.db.run(async tx=>{const grant=await authorize(tx,[]);let guardian=false,guardianUntil=0;try{guardianUntil=(await parent(d,tx,await d.family(tx,id),raw,key,now)).expiresAt;guardian=true;}catch{}return {version:1,epoch:epoch({...grant,domains:grant.domains.filter(x=>x!=='backups'||guardian)}),family:id,profile,profiles:grant.profiles,guardian,guardianUntil,domains:grant.domains.filter(x=>config.domains.includes(x)&&(x!=='backups'||guardian))};});
 const repository=new DocumentContinuityRepository(d.db,'beta-'+id,async tx=>{
  const grant=await authorize(tx,collections);
  if(path==='/v1/storage/lookup'){
   const receiptKey='receipt:'+scopeKey(scope)+':'+body.operation,path='factoryContinuity/beta-'+id+'/continuityRecordsV1/'+createHash('sha256').update(receiptKey).digest('hex');
   const receipt=await tx.get<{value:{versions:{collection:string}[]}}>(path);
   for(const row of receipt?.value.versions??[])for(const domain of requiredStorageDomains(row.collection))if(!grant.domains.includes(domain))throw Error('STORAGE_DOMAIN_DENIED');
   if(receipt?.value.versions.some(r=>requiredStorageDomains(r.collection).includes('backups')))await parent(d,tx,await d.family(tx,id),raw,key,now);
  }
 });
 const service=new ContinuityService(repository,true);
 if(path==='/v1/storage/commit')return service.commit(scope,body.operation as RecordOperation);
 if(path==='/v1/storage/page')return service.page(scope,scope,body.collection as string,body.after as string,body.limit as number);
 if(path==='/v1/storage/read')return service.read(scope,scope,body.collection as string,body.id as string,body.version===null?undefined:body.version as number);
 if(path==='/v1/storage/lookup')return service.lookup(scope,scope,body.operation as string);
 // Filtering unauthorized feed rows must neither disclose their content nor
 // stall the cursor. Grant checks and feed read share one transaction.
 let domains:readonly StorageDomain[]=[],guardian=false;
 const feed=new ContinuityService(new DocumentContinuityRepository(d.db,'beta-'+id,async tx=>{const grant=await authorize(tx,[]);try{await parent(d,tx,await d.family(tx,id),raw,key,now);guardian=true;}catch{}domains=grant.domains.filter(x=>config.domains.includes(x)&&(x!=='backups'||guardian));if(body.epoch!==epoch({...grant,domains:[...domains]}))throw Error('STORAGE_CONSENT_CHANGED');}),true);
 const page=await feed.changes(scope,scope,body.after as string,body.limit as number);
 return {...page,records:page.records.filter(r=>requiredStorageDomains(r.collection).every(domain=>domains.includes(domain)&&(domain!=='backups'||guardian)))};
}
export async function continuityHttp(d:FamilyDirectory,id:string,raw:string|undefined,key:string,req:IncomingMessage,res:ServerResponse){
 if(req.method!=='POST')throw Error('FORBIDDEN');
 const input=await readJsonBody(req,1024*1024,{invalidJsonError:'INVALID_REQUEST'});
 const result=await continuityRequest(d,id,raw,key,new URL(req.url!,'https://unused.invalid').pathname,input);
 res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(result));
}
