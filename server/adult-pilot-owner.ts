/** Operator-only short adult testing permit for a SINGLE trusted device.
 * This utility is not age verification and may not be used for child pilots.
 * Requires an externally reviewed adult/owner receipt, stored only as hash.
 */
import {readFile} from 'node:fs/promises';
import {Firestore} from '@google-cloud/firestore';
import {FirestoreRepository} from './pipeline/firestore';
import {FileRepository} from './pipeline/repository';
import {GcsPrivateArtifacts} from './storage/artifacts';
import {grantAdultPilot,revokeAdultPilot} from './adult-pilot';
async function main(){
 if(process.env.GITHUB_ACTIONS||process.env.K_SERVICE||!process.env.FACTORY_PRIVATE_CONFIG)
  throw Error('TRUSTED_OPERATOR_MACHINE_REQUIRED');
 const args=new Set(process.argv.slice(2));
 if([...args].some(a=>!['--confirm-adult-owner-review','--revoke'].includes(a))||
  (args.has('--confirm-adult-owner-review')===args.has('--revoke')))
  throw Error('OWNER_APPROVAL_COMMAND_REQUIRED');
 const config=JSON.parse(await readFile(process.env.FACTORY_PRIVATE_CONFIG,'utf8')) as{
  familyId:string;workspace:string;projectId?:string;artifactBucket?:string;localFile?:string
 };
 if(!config||!/^[A-Za-z0-9_-]{1,100}$/.test(config.familyId)||
  !/^[A-Za-z0-9_-]{1,100}$/.test(config.workspace)||
  (!config.localFile&&!config.projectId))throw Error('PRIVATE_OWNER_CONFIG_REQUIRED');
 const deviceId=process.env.FACTORY_ADULT_PILOT_DEVICE_ID||'';
 if(!/^[0-9a-f-]{36}$/.test(deviceId))throw Error('ADULT_PILOT_DEVICE_ID_REQUIRED');
 const repo=config.localFile?await FileRepository.open(config.localFile):
  new FirestoreRepository(new Firestore({projectId:config.projectId}),config.workspace,
   config.artifactBucket?new GcsPrivateArtifacts(config.artifactBucket,config.workspace):undefined);
 if(args.has('--revoke')){
  await revokeAdultPilot(repo,config.familyId,deviceId);
  console.log('Adult development profile permit and sessions revoked for selected trusted device.');
  return;
 }
 const receipt=process.env.FACTORY_ADULT_PILOT_OWNER_RECEIPT||'';
 const days=Number(process.env.FACTORY_ADULT_PILOT_DAYS||7);
 if(!Number.isSafeInteger(days)||days<1||days>14)throw Error('ADULT_PILOT_EXPIRY_REQUIRED');
 const r=await grantAdultPilot(repo,{familyId:config.familyId,deviceId,receipt,
  operatorConfirmedAdult:true,expiresAt:Date.now()+days*86400000});
 console.log('One adult pilot device authorized until '+new Date(r.expiresAt).toISOString()+
  '. Select the Adult profile on the existing site and unlock with the adult passphrase. This does NOT enable any provider.');
}
if(process.argv.some(x=>/[/\\]adult-pilot-owner\.(?:ts|mjs)$/.test(x)))
 void main().catch(()=>{console.error('Adult pilot approval unavailable; no private values printed.');process.exitCode=1;});
