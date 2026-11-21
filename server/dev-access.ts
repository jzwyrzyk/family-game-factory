/** Explicit nonproduction boundary. IAP authenticates an operator-verified
 * adult; it does not establish age, guardian consent, or child-policy approval. */
import {AsyncLocalStorage} from 'node:async_hooks';
import {createHash} from 'node:crypto';
import {createRemoteJWKSet,jwtVerify,type JWTVerifyGetKey} from 'jose';

export interface DevAccessConfig {
 environment:'development';projectNumber:string;iapAudience:string;
 allowedAdults:{subject:string;email:string;operatorConfirmedAdult:true}[];
 syntheticDataOnly:true;syntheticFamilyId:string;syntheticWorkspace:string;
 workerOwner:string;workerOwnerId:string;maxTotalMicroUsd:number;
}
export interface DevAccessScope {
 projectId:string;workspace:string;familyId:string;artifactBucket?:string;
 iapService:'jems-dev-app'|'jems-dev-preview';
}
export interface DevAccessPolicy extends DevAccessConfig {
 projectId:string;policyId:string;adultIdentityHashes:readonly string[];
}
export interface DevAdultIdentity {readonly subjectHash:string;readonly expiresAt:number}
export interface DevCloudTarget {projectId:string;projectNumber:string;region:string}
const policies=new WeakSet<object>(),identities=new WeakSet<object>();
const access=new AsyncLocalStorage<{policy:DevAccessPolicy;identity:DevAdultIdentity}>();
const hash=(input:string)=>createHash('sha256').update(input).digest('hex');
const identityHash=(subject:string,email:string)=>hash(JSON.stringify([subject,email]));
const numeric=(value:unknown):value is string=>typeof value==='string'&&/^[1-9][0-9]{0,19}$/.test(value)&&Number.isSafeInteger(Number(value));
const devName=(value:unknown):value is string=>typeof value==='string'&&/^dev-[a-z0-9][a-z0-9-]{0,79}$/.test(value);
export function validateDevProject(projectId:string,projectNumber:string){
 if(typeof projectId!=='string'||!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId)||
  !/(?:^|-)dev(?:-|$)/.test(projectId)||projectId==='family-game-factory-jzw'||
  !numeric(projectNumber)||projectNumber==='1054529152893')throw Error('DEV_PROJECT_REQUIRED');
 return {projectId,projectNumber};
}
export function validateDevAccess(config:DevAccessConfig,scope:DevAccessScope,
 env:NodeJS.ProcessEnv=process.env):DevAccessPolicy {
 if(!config||typeof config!=='object'||Array.isArray(config)||
  Object.keys(config).some(k=>!['environment','projectNumber','iapAudience','allowedAdults','syntheticDataOnly','syntheticFamilyId','syntheticWorkspace','workerOwner','workerOwnerId','maxTotalMicroUsd'].includes(k))||
  env.FACTORY_ENVIRONMENT!=='development'||config.environment!=='development'||config.syntheticDataOnly!==true)
  throw Error('DEV_ACCESS_CONFIG_REQUIRED');
 validateDevProject(scope.projectId,config.projectNumber);
 if(!devName(config.syntheticFamilyId)||!devName(config.syntheticWorkspace)||
  scope.familyId!==config.syntheticFamilyId||scope.workspace!==config.syntheticWorkspace||
  scope.artifactBucket!==`${scope.projectId}-artifacts`)throw Error('DEV_SYNTHETIC_SCOPE_REQUIRED');
 const audience=config.iapAudience?.match(/^\/projects\/([0-9]+)\/locations\/([a-z][a-z0-9-]{1,40})\/services\/(jems-dev-app|jems-dev-preview)$/);
 if(!audience||audience[1]!==config.projectNumber||audience[3]!==scope.iapService)throw Error('DEV_IAP_AUDIENCE_REQUIRED');
 if(!Array.isArray(config.allowedAdults)||config.allowedAdults.length<1||config.allowedAdults.length>10||
  config.allowedAdults.some(a=>!a||Object.keys(a).length!==3||
   a.operatorConfirmedAdult!==true||typeof a.subject!=='string'||!/^accounts\.google\.com:[0-9]{6,30}$/.test(a.subject)||
   typeof a.email!=='string'||a.email!==a.email.toLowerCase()||a.email.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(a.email))||
  new Set(config.allowedAdults.map(a=>a.subject)).size!==config.allowedAdults.length||
  new Set(config.allowedAdults.map(a=>a.email)).size!==config.allowedAdults.length)
  throw Error('DEV_ADULT_ALLOWLIST_REQUIRED');
 if(typeof config.workerOwner!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/.test(config.workerOwner)||!numeric(config.workerOwnerId))throw Error('DEV_WORKER_OWNER_REQUIRED');
 if(!Number.isSafeInteger(config.maxTotalMicroUsd)||config.maxTotalMicroUsd<1||config.maxTotalMicroUsd>50000000)throw Error('DEV_BUDGET_REQUIRED');
 const allowedAdults=config.allowedAdults.map(a=>Object.freeze({...a}));
 const adultIdentityHashes=Object.freeze(allowedAdults.map(a=>identityHash(a.subject,a.email)).sort());
 // An allowlist or scope change invalidates existing test grants. The budget
 // counter deliberately survives policy changes and month boundaries.
 const policyId=hash(JSON.stringify([scope.projectId,config.projectNumber,config.syntheticFamilyId,config.syntheticWorkspace,adultIdentityHashes]));
 const policy={...config,allowedAdults,projectId:scope.projectId,adultIdentityHashes,policyId};
 Object.freeze(allowedAdults);Object.freeze(policy);policies.add(policy);return policy;
}
export function requireDevPolicy(policy:DevAccessPolicy){if(!policies.has(policy))throw Error('DEV_ACCESS_CONFIG_REQUIRED');}
export function devCloudTarget(policy:DevAccessPolicy):DevCloudTarget{
 requireDevPolicy(policy);return {projectId:policy.projectId,projectNumber:policy.projectNumber,region:policy.iapAudience.split('/')[4]};
}
export function devServiceOrigin(target:DevCloudTarget,service:'app'|'gateway'|'preview'|'coach'){
 validateDevProject(target.projectId,target.projectNumber);
 if(!/^[a-z]+-[a-z]+[0-9]$/.test(target.region))throw Error('DEV_REGION_REQUIRED');
 return `https://jems-dev-${service}-${target.projectNumber}.${target.region}.run.app`;
}
export class DevIapVerifier {
 private keys:JWTVerifyGetKey;
 constructor(private policy:DevAccessPolicy,keys?:JWTVerifyGetKey){
  requireDevPolicy(policy);
  this.keys=keys||createRemoteJWKSet(new URL('https://www.gstatic.com/iap/verify/public_key-jwk'));
 }
 async verify(rawAssertion:string|string[]|undefined,now=Date.now()):Promise<DevAdultIdentity>{
  if(typeof rawAssertion!=='string'||rawAssertion.length>16000||!/^[-A-Za-z0-9_]+\.[-A-Za-z0-9_]+\.[-A-Za-z0-9_]+$/.test(rawAssertion))throw Error('DEV_ADULT_ACCESS_REQUIRED');
  try{
   const {payload}=await jwtVerify(rawAssertion,this.keys,{issuer:'https://cloud.google.com/iap',audience:this.policy.iapAudience,
    algorithms:['ES256'],requiredClaims:['sub','email','aud','iat','exp'],clockTolerance:30,maxTokenAge:'11m',currentDate:new Date(now)});
   if(typeof payload.sub!=='string'||typeof payload.email!=='string'||payload.aud!==this.policy.iapAudience||
    !Number.isSafeInteger(payload.iat)||!Number.isSafeInteger(payload.exp)||payload.exp!<=payload.iat!||payload.exp!-payload.iat!>660||payload.gcip!==undefined)
    throw Error();
   const subjectHash=identityHash(payload.sub,payload.email);
   if(!this.policy.adultIdentityHashes.includes(subjectHash))throw Error();
   const identity=Object.freeze({subjectHash,expiresAt:payload.exp!*1000});identities.add(identity);return identity;
  }catch{throw Error('DEV_ADULT_ACCESS_REQUIRED');}
 }
}
export function runWithDevAccess<T>(policy:DevAccessPolicy,identity:DevAdultIdentity,callback:()=>T):T{
 requireDevPolicy(policy);
 if(!identities.has(identity)||identity.expiresAt<=Date.now()-30000||!policy.adultIdentityHashes.includes(identity.subjectHash))throw Error('DEV_ADULT_ACCESS_REQUIRED');
 return access.run({policy,identity},callback);
}
export function currentDevAccess(){return access.getStore();}

/** Check the actual workload's project, not environment variables that could
 * be copied with a config. Called before opening Firestore or GCS on Cloud Run. */
export async function assertDevProjectBinding(policy:Pick<DevAccessPolicy,'projectId'|'projectNumber'>,
 fetcher:typeof fetch=fetch):Promise<void>{
 validateDevProject(policy.projectId,policy.projectNumber);
 const values=await Promise.all(['project-id','numeric-project-id'].map(async field=>{
  const response=await fetcher(`http://metadata.google.internal/computeMetadata/v1/project/${field}`,{
   headers:{'Metadata-Flavor':'Google'},redirect:'error',signal:AbortSignal.timeout(2000)});
  if(!response.ok||response.headers.get('Metadata-Flavor')!=='Google')throw Error('DEV_PROJECT_BINDING_REQUIRED');
  return (await response.text()).trim();
 }));
 if(values[0]!==policy.projectId||values[1]!==policy.projectNumber)throw Error('DEV_PROJECT_BINDING_REQUIRED');
}
