// Account-owner-only setup on a trusted machine with authorized ADC. Never run in Actions logs.
import {randomBytes,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Firestore} from '@google-cloud/firestore';
import {FirestoreRepository} from './pipeline/firestore';
import {FileRepository} from './pipeline/repository';
import {GcsPrivateArtifacts} from './storage/artifacts';
import {JobService} from './pipeline/service';
import {setOwnerCoachConsent} from './coach/consent';
import type {Repository} from './pipeline/types';
interface OwnerConfig {active:boolean;familyId:string;workspace:string;projectId?:string;artifactBucket?:string;localFile?:string;
 // Optional owner-machine ONLY; cannot be submitted by an unverified public session.
 coachConsent?:{guardianVerifiedExternally:boolean;verificationReceipt:string;
  text:boolean;audio:boolean;validDays:number};
}
/** Budget/invitation setup needs persistence access, never the GitHub App PEM or a model key. */
export async function prepareOwnerAccess(config:OwnerConfig,allowance:number,repo:Repository){
 if(!Number.isInteger(allowance)||allowance<0||allowance>50000000||typeof config.active!=='boolean'||!/^[A-Za-z0-9_-]{1,100}$/.test(config.familyId)||['__proto__','constructor','prototype'].includes(config.familyId))throw Error('EXPLICIT_OWNER_CONFIGURATION_REQUIRED');
 const service=new JobService(repo,{kind:'metered-api',available:false,generate:async()=>{throw Error('OWNER_SETUP_CANNOT_GENERATE');}},{test:async()=>{throw Error('OWNER_SETUP_CANNOT_EXECUTE');}});
 const owner={subject:'account-owner-setup',familyId:config.familyId,role:'parent' as const,expiresAt:Date.now()+60000};
 await service.setAllowance(owner,allowance,config.active);
 if(config.coachConsent){
  const consent=config.coachConsent;
  if(!config.active||!Number.isInteger(consent.validDays)||consent.validDays<1||consent.validDays>90)
   throw Error('VERIFIED_GUARDIAN_APPROVAL_REQUIRED');
  await setOwnerCoachConsent(repo,owner,{
   familyId:config.familyId,model:consent.text,audio:consent.audio,
   verifiedByAdult:consent.guardianVerifiedExternally===true,
   verificationReceipt:consent.verificationReceipt,
   expiresAt:Date.now()+consent.validDays*86400000
  });
 }
 const token=randomBytes(32).toString('base64url'),hash=createHash('sha256').update(token).digest('hex');
 await repo.transaction(s=>{s.invitations??=[];s.invitations=s.invitations.filter(x=>x.expiresAt>Date.now()&&!x.used);s.invitations.push({hash,familyId:config.familyId,expiresAt:Date.now()+600000,used:false});return true;});
 return token;
}
async function main(){
 if(!process.env.FACTORY_PRIVATE_CONFIG||process.env.GITHUB_ACTIONS)throw Error('TRUSTED_OWNER_MACHINE_REQUIRED');
 const config=JSON.parse(await readFile(process.env.FACTORY_PRIVATE_CONFIG,'utf8')) as OwnerConfig;
 if(process.env.K_SERVICE&&config.localFile)throw Error('CLOUD_RUN_REQUIRES_DURABLE_FIRESTORE');
 const repo=config.localFile?await FileRepository.open(config.localFile):new FirestoreRepository(new Firestore({projectId:config.projectId}),config.workspace,config.artifactBucket?new GcsPrivateArtifacts(config.artifactBucket,config.workspace):undefined);
 const token=await prepareOwnerAccess(config,Number(process.argv[2]),repo);
 console.log('One-use invitation (expires in 10 minutes). Enter only in the Grown-ups connection form. Do not share publicly:');console.log(token);
}
if(process.argv.some(x=>/[/\\]owner-setup\.ts$/.test(x)))void main().catch(()=>{console.error('Owner setup failed. Check persistence access, private configuration, and explicit allowance.');process.exitCode=1;});
