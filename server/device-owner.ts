/** Trusted-owner device recovery. Uses the existing Firestore workspace and ADC;
 * never runs in a public browser, GitHub Actions or Cloud Run runtime.
 * Does not alter family spending approval, job ledgers, model keys or worker pins.
 */
import {createHash,randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Firestore} from '@google-cloud/firestore';
import {FirestoreRepository} from './pipeline/firestore';
import {FileRepository} from './pipeline/repository';
import {GcsPrivateArtifacts} from './storage/artifacts';
import type {Repository} from './pipeline/types';

interface OwnerDeviceConfig {familyId:string;workspace:string;projectId?:string;artifactBucket?:string;localFile?:string}
export async function mintDeviceInvitation(repo:Repository,familyId:string,now=Date.now()):Promise<string>{
 if(!/^[A-Za-z0-9_-]{1,100}$/.test(familyId)||['__proto__','constructor','prototype'].includes(familyId))throw Error('FAMILY_REQUIRED');
 const value=randomBytes(32).toString('base64url'),hash=createHash('sha256').update(value).digest('hex');
 await repo.transaction(state=>{
  state.invitations??=[];
  state.invitations=state.invitations.filter(x=>x.expiresAt>now&&!x.used);
  state.invitations.push({hash,familyId,expiresAt:now+600000,used:false,purpose:'trusted-device'});
  return true;
 });
 return value;
}
async function main(){
 if(!process.env.FACTORY_PRIVATE_CONFIG||process.env.GITHUB_ACTIONS||process.env.K_SERVICE)throw Error('TRUSTED_OWNER_MACHINE_REQUIRED');
 const cfg=JSON.parse(await readFile(process.env.FACTORY_PRIVATE_CONFIG,'utf8')) as OwnerDeviceConfig;
 if(!/^[A-Za-z0-9_-]{1,100}$/.test(cfg.familyId)||!cfg.workspace)throw Error('OWNER_DEVICE_CONFIG_REQUIRED');
 const repo=cfg.localFile?await FileRepository.open(cfg.localFile):
  new FirestoreRepository(new Firestore({projectId:cfg.projectId}),cfg.workspace,
   cfg.artifactBucket?new GcsPrivateArtifacts(cfg.artifactBucket,cfg.workspace):undefined);
 const args=process.argv.slice(2);
 if(args.length===1&&/^--revoke=[a-f0-9-]{36}$/.test(args[0])){
  const id=args[0].slice('--revoke='.length);
  await repo.transaction(state=>{
   const device=state.devices?.find(d=>d.id===id&&d.familyId===cfg.familyId&&!d.revokedAt);
   if(!device)throw Error('DEVICE_NOT_FOUND');
   device.revokedAt=Date.now();return true;
  });
  console.log('Requested family device revoked. Its current and renewal sessions are denied.');return;
 }
 if(args.length===2&&args[0]==='--reset-parent-and-revoke-devices'&&args[1]==='--confirm'){
  await repo.transaction(state=>{
   for(const device of state.devices||[])if(device.familyId===cfg.familyId&&!device.revokedAt)device.revokedAt=Date.now();
   if(state.parentAuth)delete state.parentAuth[cfg.familyId];
   return true;
  });
  console.log('Parent recovery reset; all prior trusted devices revoked.');
 }else if(args.length!==0)throw Error('UNRECOGNIZED_OWNER_DEVICE_ACTION');
 const invitation=await mintDeviceInvitation(repo,cfg.familyId);
 console.log('One-use family device invitation (10 minutes). Enter directly in Parent Controls; do not share in chat or logs:');
 console.log(invitation);
}
if(process.argv.some(arg=>/[/\\]device-owner\.ts$/.test(arg)))void main().catch(()=>{
 console.error('Trusted-device owner action failed. Verify private configuration and persistence permissions.');
 process.exitCode=1;
});
