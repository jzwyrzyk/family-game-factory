/** Trusted operator confirmation AFTER an actual external guardian check.
 * This command cannot itself validate age, identity or parental relationship.
 */
import {readFile} from 'node:fs/promises';
import {Firestore} from '@google-cloud/firestore';
import {FirestoreRepository} from '../pipeline/firestore';
import {FileRepository} from '../pipeline/repository';
import {GcsPrivateArtifacts} from '../storage/artifacts';
import {recordExternalGuardianVerification} from './parent-consent';
async function main(){
 if(process.env.GITHUB_ACTIONS||process.env.K_SERVICE||!process.env.FACTORY_PRIVATE_CONFIG||
  process.argv.slice(2).join(' ')!=='--confirm-external-verification')
  throw Error('TRUSTED_OWNER_AND_EXTERNAL_VERIFICATION_REQUIRED');
 const id=process.env.FACTORY_PARENT_CHOICE_ID||'';
 const receipt=process.env.FACTORY_EXTERNAL_GUARDIAN_RECEIPT||'';
 if(!/^[0-9a-f-]{36}$/.test(id)||!/^[\w-]{12,120}$/.test(receipt))
  throw Error('REVIEWED_CHOICE_AND_RECEIPT_REQUIRED');
 const c=JSON.parse(await readFile(process.env.FACTORY_PRIVATE_CONFIG,'utf8')) as {
  familyId:string;workspace:string;projectId?:string;artifactBucket?:string;localFile?:string
 };
 if(!c||!/^[A-Za-z0-9_-]{1,100}$/.test(c.familyId)||
  !/^[A-Za-z0-9_-]{1,100}$/.test(c.workspace)||
  (!c.localFile&&!c.projectId))throw Error('PRIVATE_FAMILY_CONFIG_REQUIRED');
 const repo=c.localFile?await FileRepository.open(c.localFile):
  new FirestoreRepository(new Firestore({projectId:c.projectId}),c.workspace,
   c.artifactBucket?new GcsPrivateArtifacts(c.artifactBucket,c.workspace):undefined);
 const result=await recordExternalGuardianVerification(repo,{
  familyId:c.familyId,choiceId:id,receipt,verifiedByOwner:true
 });
 console.log('Jems parent privacy '+result.status+' for notice '+result.noticeVersion+'. No provider or paid service activated.');
}
if(process.argv.some(x=>/[/\\]owner-verify\.(?:ts|mjs)$/.test(x)))
 void main().catch(()=>{console.error('Parent privacy verification was not recorded; no private data printed.');process.exitCode=1;});
