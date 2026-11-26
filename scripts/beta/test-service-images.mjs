// Exact TEST image production contract for the existing environment and release controllers.
import {execFileSync} from 'node:child_process';
import {isDeepStrictEqual} from 'node:util';
import {pathToFileURL} from 'node:url';

const project='jems-jzw-nonprod', region='us-east5';
const remote='https://github.com/jzwyrzyk/family-game-factory';
const registry=region+'-docker.pkg.dev/'+project+'/jems-test-services';
const account='projects/'+project+'/serviceAccounts/jems-test-builder@'+project+'.iam.gserviceaccount.com';
const recipes={gateway:'infra/nonproduction/family-beta/Dockerfile',preview:'server/Dockerfile.preview',coach:'server/Dockerfile.coach'};
const roles=Object.keys(recipes);
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const connection=new RegExp('^projects/('+project+'|1092405124984)/locations/'+region+'/connections/[a-zA-Z0-9_-]+/repositories/[a-zA-Z0-9_-]+$');
function need(value,message){if(!value)throw Error(message);}
function cloud(args){return JSON.parse(execFileSync('gcloud',[...args,'--quiet','--format=json'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:180000}));}
function canonicalRemote(url){return url===remote||url===remote+'.git';}
function validSource(source){need(/^[0-9a-f]{40}$/.test(source),'Exact source SHA required');}
export function triggerFor(source,repository){
 validSource(source);
 need(connection.test(repository),'Reviewed regional Cloud Build repository required');
 const images=roles.map(role=>registry+'/'+role+':'+source);
 const steps=roles.map((role,i)=>({name:'gcr.io/cloud-builders/docker',args:[
  'build','--pull','--label','org.opencontainers.image.revision='+source,'--label','org.opencontainers.image.source='+remote,
  '--file',recipes[role],'--tag',images[i],'.']}));
 return {name:'jems-test-services-'+source.slice(0,12),sourceToBuild:{repository,ref:'refs/heads/main',repoType:'GITHUB'},
  serviceAccount:account,approvalConfig:{approvalRequired:true},build:{steps,images,timeout:'2400s',
  options:{logging:'CLOUD_LOGGING_ONLY',requestedVerifyOption:'VERIFIED'},tags:['jems-integrated-test','source-'+source]}};
}
const omit=(object,fields)=>Object.fromEntries(Object.entries(object).filter(([k])=>!fields.includes(k)));
export function verifyImages(source,triggerId,buildId,io=cloud){
 validSource(source);need(uuid.test(triggerId)&&uuid.test(buildId),'Immutable trigger and build IDs required');
 const common=['--region',region,'--project',project];
 const t=io(['builds','triggers','describe',triggerId,...common]);
 const b=io(['builds','describe',buildId,...common]);
 const repository=t.sourceToBuild?.repository,expected=triggerFor(source,repository);
 need(t.id===triggerId&&t.name===expected.name&&t.serviceAccount===account&&!t.disabled&&t.approvalConfig?.approvalRequired===true&&
  isDeepStrictEqual(t.sourceToBuild,expected.sourceToBuild)&&isDeepStrictEqual(t.build,expected.build)&&
  !['github','repositoryEventConfig','triggerTemplate','pubsubConfig','webhookConfig','filename','gitFileSource','substitutions'].some(k=>t[k]),'Manual approved trigger changed');
 const [,,location,regionId,,connectionId,,repoId]=repository.split('/');
 need(location==='locations'&&regionId===region,'Unexpected source location');
 const linked=io(['builds','repositories','describe',repoId,'--connection',connectionId,...common]);
 need(canonicalRemote(linked.remoteUri),'Connected repository remote changed');
 const p=b.sourceProvenance,connected=p?.resolvedConnectedRepository,git=p?.resolvedGitSource;
 need(connected?connected.repository===repository&&connected.revision===source&&!connected.dir:
  git&&canonicalRemote(git.url)&&git.revision===source&&!git.dir,'Resolved Cloud Build source differs');
 need(b.id===buildId&&b.projectId===project&&b.buildTriggerId===triggerId&&b.status==='SUCCESS'&&
  b.approval?.state==='APPROVED'&&b.serviceAccount===account&&b.options?.requestedVerifyOption==='VERIFIED'&&
  b.options?.logging==='CLOUD_LOGGING_ONLY'&&!b.options?.env?.length&&!b.options?.secretEnv?.length&&!b.options?.volumes?.length&&
  !b.options?.pool?.name&&!b.availableSecrets&&!b.secrets?.length&&!b.artifacts?.objects&&
  isDeepStrictEqual(b.images,expected.build.images)&&
  isDeepStrictEqual(b.steps?.map(s=>omit(s,['status','timing','pullTiming','exitCode'])),expected.build.steps),
  'Unapproved Cloud Build execution or image recipe');
 const results=b.results?.images??[],images={};
 need(results.length===roles.length,'Missing or unexpected image');
 for(const [i,role] of roles.entries()){
  const matches=results.filter(r=>r.name===expected.build.images[i]);
  need(matches.length===1&&/^sha256:[0-9a-f]{64}$/.test(matches[0].digest),'Image result lacks an exact digest');
  const digest=matches[0].digest,ref=registry+'/'+role+'@'+digest;
  const observed=io(['artifacts','docker','images','describe',ref,'--project',project]);
  need(observed.image_summary?.digest===digest,'Registry readback differs from Cloud Build');
  images[role]=ref;
 }
 return {source,trigger:triggerId,build:buildId,images};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const [action,source,...args]=process.argv.slice(2);
  let result;
  if(action==='render'&&args.length===1)result=triggerFor(source,args[0]);
  else if(action==='verify'&&args.length===2)result=verifyImages(source,...args);
  else throw Error('Use render SOURCE CONNECTED_REPOSITORY or verify SOURCE TRIGGER_ID BUILD_ID');
  console.log(JSON.stringify(result,null,2));
 }catch(e){console.error(e.status===undefined?e.message:'Cloud Build/registry evidence unavailable');process.exitCode=1;}
}
