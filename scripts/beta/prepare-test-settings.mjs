// Render isolated TEST Secret Manager inputs in the administrator's private directory.
import {lstat,readFile,mkdir,realpath,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash,createPrivateKey} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {validateBeta} from '../../server/beta/model.ts';
import {familyPreview} from '../../server/beta/preview.ts';
import {ownerPreview} from '../../server/beta/owner-preview.ts';
import {protectedHousehold} from '../../server/beta/owner-host.ts';
import {testExecution,testWorkerRepository} from '../../server/actions/test-execution.ts';

function need(ok){if(!ok)throw Error('Invalid isolated TEST settings');}
async function privateFile(path){
 path=resolve(path);const stat=await lstat(path);
 need(stat.isFile()&&stat.nlink===1&&stat.uid===process.getuid()&&!(stat.mode&0o077)&&await realpath(path)===path);
 return JSON.parse(await readFile(path,'utf8'));
}
export function render(source,b,incoming,now=Date.now()){
 need(/^[a-f0-9]{40}$/.test(source)&&b.project==='jems-jzw-nonprod'&&b.projectNumber==='1092405124984'&&
  b.artifactBucket==='jems-jzw-nonprod-jems-test-artifacts'&&b.database==='(default)'&&
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
 testExecution(household,{...env,K_SERVICE:'jems-test-household'});
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
