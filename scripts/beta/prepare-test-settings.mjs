// Render isolated TEST Secret Manager inputs in the administrator's private directory.
import {lstat,readFile,mkdir,realpath,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash,createPrivateKey,randomBytes,randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
require('tsx/cjs');
const {newParentAuth}=require('../../server/trusted-devices.ts');
const {storageDomains}=require('../../src/storage/sync-contract.ts');
const {validateBeta}=require('../../server/beta/model.ts');
const {familyPreview}=require('../../server/beta/preview.ts');
const {ownerPreview}=require('../../server/beta/owner-preview.ts');
const {protectedHousehold}=require('../../server/beta/owner-host.ts');
const {testExecution,testWorkerRepository}=require('../../server/actions/test-execution.ts');

function need(ok){if(!ok)throw Error('Invalid isolated TEST settings');}
async function privateFile(path){
 path=resolve(path);const stat=await lstat(path);
 need(stat.isFile()&&stat.nlink===1&&stat.uid===process.getuid()&&!(stat.mode&0o077)&&await realpath(path)===path);
 return JSON.parse(await readFile(path,'utf8'));
}
// Run once for a new dedicated TEST installation. Persist the generated signing keys
// for every later preparation, including rebinds, version changes and trial closure.
export function initialInputs(identity){
 const {githubAppId,githubInstallationId,githubPrivateKey,managementSubject,resetSubject,householdSubject,operatorContact,managementPassphrase}=identity;
 need(![managementSubject,householdSubject].includes(resetSubject)&&managementSubject&&householdSubject&&resetSubject&&
  /^[1-9][0-9]*$/.test(githubAppId)&&/^[1-9][0-9]*$/.test(githubInstallationId)&&createPrivateKey(githubPrivateKey).asymmetricKeyType==='rsa');
 const secret=()=>randomBytes(48).toString('base64url');
 const {salt,digest}=newParentAuth(managementPassphrase);
 const common={githubAppId,githubInstallationId,githubPrivateKey,active:false,workflow:'factory-agent.yml',
  maxJobMicroUsd:1000000,approval:{enabled:false},storageEncoding:'private-game-v2'};
 const id=randomUUID(),workspace='test-household-'+id,fixtureId=identity.fixtureFamilyId??randomUUID();
 const gateway={...common,familyId:'test-gateway',workspace:'test-gateway',sessionKey:secret(),previewKey:secret(),
  beta:{ownerActivation:'private-family-beta-v1',operatorContact,providerEvidence:[],administrator:{subject:managementSubject,verifier:{salt,digest}},
   testReset:{familyId:fixtureId,subject:resetSubject},continuity:{enabled:true,notice:'test-recovery-v1',domains:storageDomains,generatedRecovery:true}}};
 const household={...common,familyId:id,workspace,householdPrivateHost:{subject:householdSubject},sessionKey:secret(),previewKey:secret(),
  householdBudgetBinding:{environment:'test',workspace,familyId:id}};
 return {gateway,household,fixtureExpiresAt:identity.fixtureExpiresAt};
}

export function render(source,b,incoming,now=Date.now()){
 need(/^[a-f0-9]{40}$/.test(source)&&b.project==='jems-jzw-nonprod'&&b.projectNumber==='1092405124984'&&
  b.artifactBucket==='jems-jzw-nonprod-jems-test-artifacts'&&b.database==='jems-test'&&
  b.worker.repository===testWorkerRepository&&/^[0-9a-f]{40}$/.test(b.worker.source)&&
  b.worker.callback==='https://'+b.hosts.hub);
 const {gateway,household,trial}=structuredClone(incoming);
 const funded=!!trial;
 const hub='https://'+b.hosts.hub,house='https://'+b.hosts.household,play='https://'+b.hosts.preview;
 need(new Set([hub,house,play]).size===3&&gateway.active===false&&household.active===funded);
 const keys=[gateway.previewKey,gateway.sessionKey,household.previewKey,household.sessionKey];
 need(keys.every(k=>typeof k==='string'&&k.length>=32)&&new Set(keys).size===4);
 for(const c of [gateway,household]){
  need(!c.localFile&&!c.githubPrivateKeyFile&&typeof c.githubPrivateKey==='string'&&
   createPrivateKey(c.githubPrivateKey).asymmetricKeyType==='rsa'&&/^[1-9][0-9]*$/.test(c.githubAppId)&&/^[1-9][0-9]*$/.test(c.githubInstallationId));
  Object.assign(c,{projectId:b.project,artifactBucket:b.artifactBucket,previewOrigin:play,approvedSha:source,repository:'jzwyrzyk/family-game-factory',
   repositoryId:'1458033181',coachPrivateOrigin:b.coachOrigin});
 }
 Object.assign(gateway,{appOrigin:hub,gatewayOrigin:hub,platformMode:'PRIVATE_FAMILY_BETA'});
 Object.assign(household,{appOrigin:house,gatewayOrigin:house,platformMode:'HOUSEHOLD'});
 gateway.beta.hubOrigin=hub;gateway.beta.environment='test';gateway.beta.workerRoute='beta-test';
 gateway.beta.administrator.audience=b.iapAssertionAudiences.management;
 household.householdPrivateHost.audience=b.iapAssertionAudiences.household;
 validateBeta(gateway.beta,gateway.workspace);
 need(gateway.beta.testReset&&gateway.beta.providerEvidence.length===0&&gateway.maxJobMicroUsd>0&&gateway.maxJobMicroUsd<=1_000_000);
 need(!gateway.householdPrivateHost&&!household.beta&&!gateway.premiumApproval&&!gateway.approval?.enabled);
 const worker={workerRepository:testWorkerRepository,workerRepositoryId:b.worker.repositoryId,workerWorkflow:'factory-private-test.yml',workerApprovedSha:b.worker.source};
 Object.assign(gateway,worker);
 gateway.testExecution={providerMode:'fixture',publicSourceSha:source,expiresAt:incoming.fixtureExpiresAt};
 need(gateway.testExecution.expiresAt>now);
 const env={JEMS_TEST_PROJECT_NUMBER:b.projectNumber};
 testExecution(gateway,{...env,K_SERVICE:'jems-test-gateway'});
 if(funded){
  const expires=Date.parse(trial.expiresAt);
  need(trial.limitMicrousd===5_000_000&&expires>now&&/^[a-f0-9]{64}$/.test(trial.authorizationSha256)&&household.premiumApproval?.enabled);
  Object.assign(household,worker,{premiumWorkerApprovedSha:b.worker.source,testExecution:{providerMode:'funded',publicSourceSha:source,
   expiresAt:expires,authorizationSha256:trial.authorizationSha256}});
  Object.assign(env,{JEMS_TEST_FUNDED_HOUSEHOLD:'true',JEMS_TEST_TRIAL_AUTHORIZATION_SHA256:trial.authorizationSha256,JEMS_TEST_TRIAL_EXPIRES_AT:trial.expiresAt});
 }else need(!household.approval?.enabled&&!household.premiumApproval&&!household.testExecution&&!household.workerRepository);
 const householdEnv={...env,K_SERVICE:'jems-test-household'};
 testExecution(household,householdEnv);
 if(funded){
  const {trialAuthorization}=require('../../server/beta/test-trial.ts');
  const authorized=trialAuthorization(household,now,householdEnv);
  need(authorized.hash===trial.authorizationSha256&&authorized.t.limitMicrousd===trial.limitMicrousd);
 }

 protectedHousehold(household,'unused',()=>{});
 const viewer={appOrigin:house,workspace:household.workspace,familyId:household.familyId,previewKey:household.previewKey};
 const preview={platformMode:'PRIVATE_FAMILY_BETA',environment:'test',hubOrigin:hub,previewOrigin:play,previewKey:gateway.previewKey,
  projectId:b.project,artifactBucket:b.artifactBucket,householdViewer:viewer};
 familyPreview(preview,undefined,()=>undefined);ownerPreview(viewer,play,undefined,()=>undefined);
 return {gateway,household,preview};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  process.umask(0o077);
  const [source,outputs,privateInput,destination]=process.argv.slice(2);
  if(source==='initialize-new-secrets'&&!destination){
   const inputs=initialInputs(await privateFile(outputs));
   await writeFile(resolve(privateInput),JSON.stringify(inputs)+'\n',{flag:'wx',mode:0o600});
   console.log('Created private TEST seeds. Retain the file and persist the same keys for subsequent renders.');
   process.exit(0);
  }
  const b=(await privateFile(outputs)).test_bindings.value,configs=render(source,b,await privateFile(privateInput));
  const dir=resolve(destination);await mkdir(dir,{mode:0o700});need(await realpath(dir)===dir);
  const hashes={};
  for(const [role,value] of Object.entries(configs)){
   const bytes=JSON.stringify(value)+'\n';await writeFile(join(dir,role+'.json'),bytes,{flag:'wx',mode:0o600});
   hashes[role]=createHash('sha256').update(bytes).digest('hex');
  }
  console.log(JSON.stringify({source,hashes,paid:configs.household.active}));
 }catch{console.error('TEST settings rejected. Inspect private inputs and use an empty destination.');process.exitCode=1;}
}
