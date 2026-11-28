/** Explicit trusted-operator erasure of completed model/speech metadata only.
 * This is a recovery/admin path until PR #42 parent device login supports the
 * separately reviewed parent-authorized erase endpoint. It does not erase
 * device-local child notebooks, remote game revisions, backups or provider logs.
 */
import {readFile} from 'node:fs/promises';
import {databaseFor} from '../storage/database';
import {FirestoreRepository} from '../pipeline/firestore';
import {FileRepository} from '../pipeline/repository';
import {CoachService,type CoachConfig} from './service';
interface OwnerConfig {familyId:string;workspace:string;projectId?:string;artifactBucket?:string;localFile?:string}
async function main(){
 if(!process.env.FACTORY_PRIVATE_CONFIG||process.env.GITHUB_ACTIONS||process.env.K_SERVICE)
  throw Error('TRUSTED_OWNER_MACHINE_REQUIRED');
 const args=process.argv.slice(2);
 if(args.length!==2||!args.includes('--confirm=ERASE_COACH_RECEIPTS'))
  throw Error('EXPLICIT_ERASURE_CONFIRMATION_REQUIRED');
 const requested=args.find(x=>x.startsWith('--family='))?.slice('--family='.length)||'';
 if(!/^[A-Za-z0-9_-]{1,100}$/.test(requested))throw Error('EXACT_FAMILY_REQUIRED');
 const config=JSON.parse(await readFile(process.env.FACTORY_PRIVATE_CONFIG,'utf8')) as OwnerConfig;
 if(!config||config.familyId!==requested||
  !/^[A-Za-z0-9_-]{1,100}$/.test(config.workspace))throw Error('ERASURE_FAMILY_MISMATCH');
 const repo=config.localFile?await FileRepository.open(config.localFile):
  new FirestoreRepository(databaseFor(config),config.workspace);
 const disabled:CoachConfig={
  enabled:false,privacyApproved:false,moderationApproved:false,zdrVerified:false,
  privateExecutionApproved:false,model:'',maxInputChars:16000,maxOutputTokens:500,
  maxTurnMicroUsd:0,inputMicroUsdPerMillion:0,outputMicroUsdPerMillion:0,pricesReviewedAt:''
 };
 const result=await new CoachService(repo,disabled).eraseFamilyReceipts({
  subject:'owner-operator',familyId:requested,role:'parent',expiresAt:Date.now()+60000
 });
 console.log('Erased '+result.erased+' completed model/audio receipts for the selected family. No game or learning data was changed.');
}
if(process.argv.some(x=>/[/\\]owner-erase\.(?:ts|mjs)$/.test(x)))
 void main().catch(()=>{console.error('Owner erasure denied; no child or credential data printed.');process.exitCode=1;});
