import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {hostingPlan} from './prepare-hosting.mjs';
const requireState=(condition,reason)=>{if(!condition)throw Error(reason);};
const uuid=/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/;
const cloud=args=>JSON.parse(execFileSync('gcloud',[...args,'--format=json','--quiet'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:180000,maxBuffer:8*1024*1024}));
export function verifyBuild(build,record,source,image,trigger){
 requireState(uuid.test(record.id)&&uuid.test(record.trigger)&&build.id===record.id&&build.buildTriggerId===record.trigger&&build.status==='SUCCESS','Reviewed Cloud Build trigger and successful build required.');
 const provenance=build.sourceProvenance;
 const git=provenance?.resolvedGitSource;
 const resolved=git?.revision??provenance?.resolvedRepoSource?.commitSha;
 const repository='https://github.com/jzwyrzyk/family-game-factory';
 const bound=git ? [repository,repository+'.git'].includes(git.url) :
  provenance?.resolvedRepoSource?.repoName==='github_jzwyrzyk_family-game-factory'&&trigger?.id===record.trigger&&trigger?.github?.owner==='jzwyrzyk'&&trigger?.github?.name==='family-game-factory';
 requireState(bound,'Verified build repository provenance required.');
 requireState(resolved===source&&build.substitutions?.REPO_FULL_NAME==='jzwyrzyk/family-game-factory','Build source does not match the reviewed repository and commit.');
 requireState(build.results?.images?.some(i=>i.name.replace(/:[^/:]+$/,'')+'@'+i.digest===image),'Build output digest differs from the reviewed image.');
}
function verifyRuntime(spec,desired){
 const container=spec?.containers?.[0],approved=desired.containers[0];
 requireState(spec?.serviceAccountName===desired.serviceAccountName&&spec.containers?.length===1&&container&&!container.command?.length&&!container.args?.length,'Runtime identity or command differs.');
 requireState(spec.containerConcurrency===desired.containerConcurrency&&spec.timeoutSeconds===desired.timeoutSeconds&&
  container.ports?.length===1&&container.ports[0].containerPort===approved.ports[0].containerPort&&
  (!container.ports[0].name||container.ports[0].name==='http1')&&(!container.ports[0].protocol||container.ports[0].protocol==='TCP')&&container.resources?.limits?.cpu===approved.resources.limits.cpu&&container.resources?.limits?.memory===approved.resources.limits.memory,
  'Runtime capacity or listener differs.');
 const env=container.env??[];
 requireState(env.length===approved.env.length&&approved.env.every(e=>env.some(row=>row.name===e.name&&row.value===e.value&&!row.valueFrom)),'Runtime environment differs.');
 const volumes=spec.volumes??[],secret=volumes[0]?.secret,target=desired.volumes[0].secret,mounts=container.volumeMounts??[];
 requireState(volumes.length===1&&volumes[0].name==='config'&&secret?.secretName===target.secretName&&secret.items?.length===1&&secret.items[0].key===target.items[0].key&&secret.items[0].path==='config.json'&&mounts.length===1&&mounts[0].name==='config'&&mounts[0].mountPath==='/var/run/jems'&&!mounts[0].subPath,'Immutable configuration mount differs.');
}
function verifyScaling(actual,expected){
 for(const key of ['autoscaling.knative.dev/minScale','autoscaling.knative.dev/maxScale'])
  requireState(String(actual?.annotations?.[key])===expected.annotations[key],'Runtime scaling policy differs.');
}
export function verifyService(actual,expected){
 const name=expected.metadata.name,spec=actual.spec?.template?.spec,desired=expected.spec.template.spec;
 requireState(actual.metadata?.name===name&&String(actual.metadata.namespace)===expected.metadata.namespace&&actual.metadata.labels?.['cloud.googleapis.com/location']===expected.metadata.labels['cloud.googleapis.com/location']&&actual.metadata.labels?.['jems-environment']===expected.metadata.labels['jems-environment'],'Existing dedicated service identity required.');
 for(const [key,val] of Object.entries(expected.metadata.annotations))requireState(actual.metadata.annotations?.[key]===val,'Existing ingress or direct URL policy differs.');
 requireState(spec?.serviceAccountName===desired.serviceAccountName&&spec.containers?.length===1,'Existing runtime principal or capacity differs.');
 verifyScaling(actual.spec.template.metadata,expected.spec.template.metadata);
 verifyRuntime(spec,desired);
 const serving=(actual.status?.traffic??[]).filter(t=>(t.percent??0)>0).map(t=>[t.revisionName,t.percent]).sort();
 requireState(serving.length&&serving.every(t=>typeof t[0]==='string'&&t[0].length>0)&&serving.reduce((n,t)=>n+t[1],0)===100,'Explicit, healthy current traffic required.');
 return JSON.stringify(serving);
}
function backendResource(value){
 const match=typeof value==='string'&&value.match(/^(?:https:\/\/(?:www\.googleapis\.com|compute\.googleapis\.com)\/compute\/v1\/)?(projects\/[a-z0-9-]+\/global\/backendServices\/[a-z0-9-]+)$/);
 requireState(match,'Reviewed global backend resource required.');return match[1];
}
function checkRouting(url,expected){
 const canonical=u=>({default:backendResource(u.defaultService),hosts:u.hostRules.map(h=>[h.pathMatcher,h.hosts.slice().sort()]).sort(),paths:u.pathMatchers.map(p=>[p.name,backendResource(p.defaultService),(p.pathRules??[]).map(r=>[r.paths.slice().sort(),backendResource(r.service)]).sort()]).sort()});
 requireState(JSON.stringify(canonical(url))===JSON.stringify(canonical(expected))&&!url.defaultRouteAction&&!url.defaultUrlRedirect&&!url.headerAction&&url.pathMatchers.every(p=>!p.routeRules?.length&&!p.defaultRouteAction&&!p.defaultUrlRedirect&&!p.headerAction&&(p.pathRules??[]).every(r=>!r.routeAction&&!r.urlRedirect&&!r.headerAction)),'Live host and path routing differs.');
}
export function verifyBackend(backend,role,c,io){
 const name=c.backends[role],resource='projects/'+c.project+'/global/backendServices/'+name;
 requireState(backend.name===name&&backendResource(backend.selfLink)===resource&&!backend.enableCDN&&
  backend.protocol==='HTTP'&&backend.loadBalancingScheme==='EXTERNAL_MANAGED'&&
  !backend.customRequestHeaders?.length&&!backend.customResponseHeaders?.length,'Unexpected backend identity, protocol, headers or caching.');
 const guarded=role==='management'||role==='household';
 requireState((backend.iap?.enabled===true)===guarded,'Backend IAP boundary differs.');
 const targets=backend.backends??[];
 // Unknown hosts must have no route to any application, even if its handler would reject them.
 if(role==='deny'){requireState(targets.length===0,'Default deny backend must have no serving targets.');return;}
 requireState(targets.length===1,'Exactly one reviewed serverless backend target required.');
 const match=typeof targets[0].group==='string'&&targets[0].group.match(/^(?:https:\/\/(?:www\.googleapis\.com|compute\.googleapis\.com)\/compute\/v1\/)?projects\/([a-z0-9-]+)\/regions\/([a-z0-9-]+)\/networkEndpointGroups\/([a-z0-9-]+)$/);
 requireState(match&&match[1]===c.project&&match[2]===c.region,'Backend target project or region differs.');
 const neg=io(['compute','network-endpoint-groups','describe',match[3],'--project',c.project,'--region',c.region]);
 const serviceRole=role==='management'?'gateway':role==='machine'?'household':role;
 requireState(neg.name===match[3]&&neg.networkEndpointType==='SERVERLESS'&&
  neg.region?.endsWith('/projects/'+c.project+'/regions/'+c.region)&&
  neg.cloudRun?.service===c.services[serviceRole].name&&!neg.cloudRun.urlMask&&!neg.cloudRun.tag&&
  !neg.appEngine&&!neg.cloudFunction,'Backend does not target the exact reviewed Cloud Run service.');
}
export function candidateRevisionSuffix(c,role,source,service){
 const image=service.spec.template.spec.containers[0].image;
 const prefix='b-'+source.slice(0,10)+'-'+image.slice(-6);
 if(c.project!=='jems-jzw-nonprod'||c.environment!=='test')return prefix;
 // A reviewed secret version or spending policy change needs a new immutable
 // revision even when both source and container image stayed identical.
 const policy=structuredClone(service.spec.template);
 policy.spec.containers[0].env.sort((a,b)=>a.name.localeCompare(b.name));
 const digest=createHash('sha256').update(JSON.stringify([role,source,policy])).digest('hex');
 return prefix+'-'+digest.slice(0,12);
}
export async function environmentRelease(release,controller,options,io=cloud){
 const {descriptor:c,source,builds}=release,plan=hostingPlan(c),env=options.environment,mode=options.mode;
 requireState(['dev','test'].includes(env)&&env===c.environment&&['verify','stage'].includes(mode)&&/^[a-f\d]{40}$/.test(source)&&source===options.source,'Explicit DEV/TEST source and operation required.');
 requireState(controller.enabled===true&&controller.projectId===c.project&&String(controller.projectNumber)===c.projectNumber&&controller.region===c.region,'Configure and enable the separate nonproduction controller first.');
 const common=['--project',c.project,'--region',c.region],regionless=['--project',c.project,'--global'];
 for(const role of ['gateway','preview']){
  const b=builds?.[role];requireState(b&&uuid.test(b.id)&&uuid.test(b.trigger),'Missing approved builder identity.');
  verifyBuild(io(['builds','describe',b.id,...common]),b,source,c[role+'Image'],io(['builds','triggers','describe',b.trigger,...common]));
 }
 checkRouting(io(['compute','url-maps','describe',plan.urlMap.name,...regionless]),plan.urlMap);
 for(const [role,name] of Object.entries(c.backends)){
  verifyBackend(io(['compute','backend-services','describe',name,...regionless]),role,c,io);
 }
 const roles=['preview','gateway','household'],before={},receipt={source,environment:env,mode,services:[]};
 const service=role=>io(['run','services','describe',c.services[role].name,...common]);
 for(const role of roles)before[role]=verifyService(service(role),plan[role]);
 for(const role of roles){
  const serviceName=c.services[role].name,image=plan[role].spec.template.spec.containers[0].image;
  const suffix=candidateRevisionSuffix(c,role,source,plan[role]),revision=serviceName+'-'+suffix;
  requireState(revision.length<=63,'Shorter reviewed service name required for an immutable revision.');
  const revisions=()=>io(['run','revisions','list','--service',serviceName,...common]);
  let candidate=revisions().find(r=>r.metadata.name===revision);
  if(mode==='stage'&&!candidate){
   requireState(verifyService(service(role),plan[role])===before[role],'Serving state changed during review.');
   io(['run','services','update',serviceName,'--image',image,'--revision-suffix',suffix,'--no-traffic',...common]);
   candidate=revisions().find(r=>r.metadata.name===revision);
  }
  if(candidate){verifyRuntime(candidate.spec,plan[role].spec.template.spec);verifyScaling(candidate.metadata,plan[role].spec.template.metadata);}
  if(mode==='stage'||candidate)requireState(candidate?.metadata?.labels?.['serving.knative.dev/service']===serviceName&&candidate.status?.conditions?.some(v=>v.type==='Ready'&&v.status==='True')&&
    (candidate.status.imageDigest===image||candidate.status.imageDigest===image.split('@')[1]),'Candidate image or readiness differs.');
  requireState(verifyService(service(role),plan[role])===before[role],'Serving percentages changed. Freeze and review existing revisions.');
  receipt.services.push({role,revision:candidate?revision:null,digest:image.split('@')[1],currentTrafficPreserved:true});
 }
 return receipt;
}
async function main(){
 try{
  const [file,mode,environment,source,out]=process.argv.slice(2);
  const receipt=await environmentRelease(JSON.parse(readFileSync(file)),JSON.parse(readFileSync('ops/environments.json')),{mode,environment,source});
  writeFileSync(out,JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600});console.log('Completed nonproduction candidate '+mode+'. See the metadata receipt.');
 }catch(e){console.error(e instanceof Error&&e.constructor===Error&&!('status' in e)?e.message:'Nonproduction evidence unavailable. Review the protected controller configuration and IAM.');process.exitCode=1;}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)void main();
