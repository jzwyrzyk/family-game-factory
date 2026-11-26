// Account-owner-only setup on a trusted machine with authorized ADC. Never run in Actions logs.
import {randomBytes,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {databaseFor} from './storage/database';
import {FirestoreRepository} from './pipeline/firestore';
import {FileRepository} from './pipeline/repository';
import {GcsPrivateArtifacts} from './storage/artifacts';
import {JobService} from './pipeline/service';
import type {Repository} from './pipeline/types';
interface OwnerConfig {active:boolean;familyId:string;workspace:string;projectId?:string;artifactBucket?:string;localFile?:string}
/** Budget/invitation setup needs persistence access, never the GitHub App PEM or a model key. */
export async function prepareOwnerAccess(config:OwnerConfig,allowance:number,repo:Repository){
 if(!Number.isInteger(allowance)||allowance<0||allowance>50000000||typeof config.active!=='boolean'||!/^[A-Za-z0-9_-]{1,100}$/.test(config.familyId)||['__proto__','constructor','prototype'].includes(config.familyId))throw Error('EXPLICIT_OWNER_CONFIGURATION_REQUIRED');
 const service=new JobService(repo,{kind:'metered-api',available:false,generate:async()=>{throw Error('OWNER_SETUP_CANNOT_GENERATE');}},{test:async()=>{throw Error('OWNER_SETUP_CANNOT_EXECUTE');}});
 await service.setAllowance({subject:'account-owner-setup',familyId:config.familyId,role:'parent',expiresAt:Date.now()+60000},allowance,config.active);
 const token=randomBytes(32).toString('base64url'),hash=createHash('sha256').update(token).digest('hex');
 await repo.transaction(s=>{s.invitations??=[];s.invitations=s.invitations.filter(x=>x.expiresAt>Date.now()&&!x.used);s.invitations.push({hash,familyId:config.familyId,expiresAt:Date.now()+600000,used:false});return true;});
 return token;
}
async function main(){
 if(!process.env.FACTORY_PRIVATE_CONFIG||process.env.GITHUB_ACTIONS)throw Error('TRUSTED_OWNER_MACHINE_REQUIRED');
 const config=JSON.parse(await readFile(process.env.FACTORY_PRIVATE_CONFIG,'utf8')) as OwnerConfig;
 if(process.env.K_SERVICE&&config.localFile)throw Error('CLOUD_RUN_REQUIRES_DURABLE_FIRESTORE');
 const repo=config.localFile?await FileRepository.open(config.localFile):new FirestoreRepository(databaseFor(config),config.workspace,config.artifactBucket?new GcsPrivateArtifacts(config.artifactBucket,config.workspace):undefined);
 const token=await prepareOwnerAccess(config,Number(process.argv[2]),repo);
 console.log('One-use invitation (expires in 10 minutes). Enter only in the Grown-ups connection form. Do not share publicly:');console.log(token);
}
if(process.argv.some(x=>/[/\\]owner-setup\.ts$/.test(x)))void main().catch(()=>{console.error('Owner setup failed. Check persistence access, private configuration, and explicit allowance.');process.exitCode=1;});
