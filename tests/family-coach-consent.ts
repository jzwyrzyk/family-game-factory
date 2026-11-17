import assert from 'node:assert/strict';
import {MemoryRepository} from '../server/pipeline/repository';
import {allowedCoachFamily,setOwnerCoachConsent} from '../server/coach/consent';
import {prepareOwnerAccess} from '../server/owner-setup';

const family='family-verified-pilot';
const guardian={subject:'account-owner-setup',familyId:family,role:'parent' as const,expiresAt:Date.now()+60000};
const child={subject:'child-one',familyId:family,role:'designer' as const,expiresAt:Date.now()+60000};
const other={...child,familyId:'different-family'};
const consent={familyId:family,model:true,audio:false,verifiedByAdult:true,
 verificationReceipt:'external-guardian-proof-001',expiresAt:Date.now()+30*86400000};
let count=0;
async function test(name:string,fn:()=>Promise<unknown>|unknown){await fn();count++;console.log('PASS '+name);}
async function main(){
 const repo=new MemoryRepository();
 await test('model/audio scopes default deny without family-level adult authorization',async()=>{
  assert.equal(allowedCoachFamily(await repo.snapshot(),child,'model'),false);
  assert.equal(allowedCoachFamily(await repo.snapshot(),child,'audio'),false);
 });
 await test('only verified adult parent session can provision consent',async()=>{
  await assert.rejects(setOwnerCoachConsent(repo,child,consent),/VERIFIED_GUARDIAN_APPROVAL_REQUIRED/);
  await assert.rejects(setOwnerCoachConsent(repo,guardian,{...consent,verifiedByAdult:false}),/VERIFIED_GUARDIAN_APPROVAL_REQUIRED/);
  await assert.rejects(setOwnerCoachConsent(repo,guardian,{...consent,verificationReceipt:'short'}),/VERIFIED_GUARDIAN_APPROVAL_REQUIRED/);
  await assert.rejects(setOwnerCoachConsent(repo,guardian,{...consent,expiresAt:Date.now()+91*86400000}),/VERIFIED_GUARDIAN_APPROVAL_REQUIRED/);
  assert.equal((await repo.snapshot()).coachConsent?.length||0,0);
 });
 await test('scope changes affect only the verified family and never self-elevate audio',async()=>{
  await setOwnerCoachConsent(repo,guardian,consent);
  assert.equal(allowedCoachFamily(await repo.snapshot(),child,'model'),true);
  assert.equal(allowedCoachFamily(await repo.snapshot(),child,'audio'),false);
  assert.equal(allowedCoachFamily(await repo.snapshot(),other,'model'),false);
  await assert.rejects(setOwnerCoachConsent(repo,guardian,{...consent,model:false,audio:true}),/VERIFIED_GUARDIAN_APPROVAL_REQUIRED/);
 });
 await test('a trusted parent may separately grant remote audio; consent expires and is revocable',async()=>{
  await setOwnerCoachConsent(repo,guardian,{...consent,model:true,audio:true});
  const record=(await repo.snapshot()).coachConsent![0];
  assert.equal(allowedCoachFamily(await repo.snapshot(),child,'audio'),true);
  assert.equal(allowedCoachFamily(await repo.snapshot(),child,'model',record.expiresAt+1),false);
  await setOwnerCoachConsent(repo,guardian,{...consent,model:false,audio:false});
  assert.equal(allowedCoachFamily(await repo.snapshot(),child,'model'),false);
  assert.equal(allowedCoachFamily(await repo.snapshot(),child,'audio'),false);
 });
 await test('trusted owner setup can explicitly provision only with verified external proof',async()=>{
  const good=new MemoryRepository();
  await prepareOwnerAccess({active:true,familyId:family,workspace:'trusted-pilot',
   coachConsent:{guardianVerifiedExternally:true,verificationReceipt:'external-guardian-proof-002',
    text:true,audio:false,validDays:30}},0,good);
  assert.equal(allowedCoachFamily(await good.snapshot(),child,'model'),true);
  assert.equal(allowedCoachFamily(await good.snapshot(),child,'audio'),false);
  const bad=new MemoryRepository();
  await assert.rejects(prepareOwnerAccess({active:true,familyId:family,workspace:'trusted-pilot',
   coachConsent:{guardianVerifiedExternally:false,verificationReceipt:'external-guardian-proof-003',
    text:true,audio:true,validDays:30}},0,bad),/VERIFIED_GUARDIAN_APPROVAL_REQUIRED/);
  assert.equal(allowedCoachFamily(await bad.snapshot(),child,'model'),false);
 });
 console.log(count+' family authorization tests passed; synthetic guardian references, no child data.');
}
void main().catch(e=>{console.error(e);process.exitCode=1;});
