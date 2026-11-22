/** Owner-controlled consent receipt setup (NOT adult identity verification).
 * Requires a previously verified adult/consent record outside the app. This
 * trusted operator utility cannot authenticate the adult or supply a receipt.
 */
import {readFile} from 'node:fs/promises';
import {Firestore} from '@google-cloud/firestore';
import {FirestoreRepository} from '../pipeline/firestore';
import {FileRepository} from '../pipeline/repository';
import {setOwnerCoachConsent} from './consent';
interface OwnerConfig {familyId:string;workspace:string;projectId?:string;localFile?:string}
async function main(){
 if(!process.env.FACTORY_PRIVATE_CONFIG||process.env.GITHUB_ACTIONS||process.env.K_SERVICE)
  throw Error('TRUSTED_OWNER_MACHINE_REQUIRED');
 const args=new Set(process.argv.slice(2));
 if([...args].some(a=>!['--allow-model','--allow-audio','--allow-narration','--revoke','--confirm-external-verification'].includes(a)))
  throw Error('INVALID_CONSENT_COMMAND');
 // Emergency revocation must remain possible even without a new consent record.
 if(!args.has('--revoke')&&!args.has('--confirm-external-verification'))throw Error('EXTERNAL_VERIFICATION_REQUIRED');
 const config=JSON.parse(await readFile(process.env.FACTORY_PRIVATE_CONFIG,'utf8')) as OwnerConfig;
 if(!config||!/^[A-Za-z0-9_-]{1,100}$/.test(config.familyId)||!/^[A-Za-z0-9_-]{1,100}$/.test(config.workspace))
  throw Error('OWNER_FAMILY_OR_WORKSPACE_REQUIRED');
 const repo=config.localFile?await FileRepository.open(config.localFile):
  new FirestoreRepository(new Firestore({projectId:config.projectId}),config.workspace);
 const revoke=args.has('--revoke');
 if(revoke&&(args.has('--allow-model')||args.has('--allow-audio')||args.has('--allow-narration')))throw Error('INVALID_CONSENT_COMMAND');
 if(revoke){
  await repo.transaction(s=>{s.coachConsent=(s.coachConsent||[]).filter(x=>x.familyId!==config.familyId);return true;});
  console.log('Selected family coach/audio/narration consent revoked. Existing pending requests must fail closed.');
  return;
 }
 const receipt=process.env.FACTORY_EXTERNAL_GUARDIAN_RECEIPT||'';
 if(!/^[A-Za-z0-9_-]{12,120}$/.test(receipt))throw Error('EXTERNAL_VERIFICATION_RECEIPT_REQUIRED');
 const durationDays=Number(process.env.FACTORY_CONSENT_DAYS||30);
 if(!Number.isSafeInteger(durationDays)||durationDays<1||durationDays>90)throw Error('CONSENT_EXPIRY_REQUIRED');
 if(!args.has('--allow-model')&&!args.has('--allow-audio')&&!args.has('--allow-narration'))throw Error('EXPLICIT_MODEL_OR_AUDIO_CHOICE_REQUIRED');
 await setOwnerCoachConsent(repo,{
  subject:'verified-owner-operator',familyId:config.familyId,role:'parent',expiresAt:Date.now()+60000
 },{familyId:config.familyId,model:args.has('--allow-model'),audio:args.has('--allow-audio'),narration:args.has('--allow-narration'),
  verifiedByAdult:true,verificationReceipt:receipt,expiresAt:Date.now()+durationDays*86400000});
 console.log('Consent scopes recorded for this family. Independent verification and provider approvals remain operator responsibilities.');
}
if(process.argv.some(x=>/[/\\]owner-consent\.(?:ts|mjs)$/.test(x)))
 void main().catch(()=>{console.error('Owner consent setup denied; no private details printed.');process.exitCode=1;});
