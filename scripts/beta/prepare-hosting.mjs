import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const projectPattern=/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const namePattern=/^[a-z][a-z0-9-]{1,48}[a-z0-9]$/;
const hostPattern=/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/;
const assert=(ok,msg)=>{if(!ok)throw Error(msg);};
function exact(obj,keys){assert(obj&&Object.keys(obj).sort().join()===keys.sort().join(),'Unexpected plan fields');}
export function hostingPlan(c){
 exact(c,['environment','project','projectNumber','region','hub','preview','household','gatewayImage','previewImage','services','backends']);
 assert(['dev','test'].includes(c.environment)&&projectPattern.test(c.project)&&c.project!=='family-game-factory-jzw'&&/^\d{6,16}$/.test(c.projectNumber)&&c.projectNumber!=='1054529152893','Dedicated nonproduction project and environment required');
 assert(/^[a-z]+-[a-z]+\d$/.test(c.region),'Invalid region');const origins=[c.hub,c.preview,c.household];
 assert(origins.every(o=>hostPattern.test(o)&&!o.startsWith('f-'))&&new Set(origins).size===3&&!origins.some(a=>origins.some(b=>a!==b&&a.endsWith('.'+b))),'Independent exact hosts required');
 for(const image of [c.gatewayImage,c.previewImage])assert(image.startsWith(c.region+'-docker.pkg.dev/'+c.project+'/')&&/^[a-z0-9./_-]+@sha256:[a-f0-9]{64}$/.test(image),'Digest-pinned nonproduction image required');
 assert(c.gatewayImage!==c.previewImage,'Gateway and preview images must be distinct');
 const roles=['gateway','preview','household'];exact(c.services,roles.slice());
 exact(c.backends,['deny','gateway','management','preview','household','machine']);
 assert(Object.values(c.backends).every(n=>namePattern.test(n))&&new Set(Object.values(c.backends)).size===6,'Distinct existing backends required');
 const names=new Set(),accounts=new Set(),secrets=new Set(),out={};
 for(const role of roles){
  const s=c.services[role];exact(s,['name','identity','secret','version']);
  assert(namePattern.test(s.name)&&s.name.includes(c.environment)&&namePattern.test(s.secret)&&typeof s.version==='string'&&/^[1-9]\d*$/.test(s.version)&&s.identity.endsWith('@'+c.project+'.iam.gserviceaccount.com')&&namePattern.test(s.identity.split('@')[0]),'Reviewed service, identity and immutable secret version required');
  names.add(s.name);accounts.add(s.identity);secrets.add(s.secret);
  out[role]={apiVersion:'serving.knative.dev/v1',kind:'Service',metadata:{name:s.name,namespace:c.projectNumber,labels:{'cloud.googleapis.com/location':c.region,'jems-environment':c.environment},annotations:{'run.googleapis.com/ingress':'internal-and-cloud-load-balancing','run.googleapis.com/default-url-disabled':'true'}},spec:{template:{metadata:{annotations:{'autoscaling.knative.dev/minScale':'0','autoscaling.knative.dev/maxScale':'1'}},spec:{
   serviceAccountName:s.identity,containerConcurrency:20,timeoutSeconds:60,containers:[{image:role==='preview'?c.previewImage:c.gatewayImage,ports:[{containerPort:8080}],resources:{limits:{cpu:'1',memory:'1Gi'}},
    env:[{name:'FACTORY_PRIVATE_CONFIG',value:'/var/run/jems/config.json'},{name:'FACTORY_ACTIONS_APPROVED',value:'false'},{name:'FACTORY_PREMIUM_BUILDER_APPROVED',value:'false'}],
    volumeMounts:[{name:'config',mountPath:'/var/run/jems'}]}],volumes:[{name:'config',secret:{secretName:s.secret,items:[{key:s.version,path:'config.json'}]}}]}}}};
 }
 assert(names.size===3&&accounts.size===3&&secrets.size===3,'Services may not share identities, configurations or names');
 const backend=role=>'https://www.googleapis.com/compute/v1/projects/'+c.project+'/global/backendServices/'+c.backends[role];
 out.urlMap={kind:'compute#urlMap',name:'jems-'+c.environment+'-private-origins',defaultService:backend('deny'),hostRules:[
  {hosts:[c.hub],pathMatcher:'public-hub'},{hosts:['*.'+c.hub],pathMatcher:'workshops'},{hosts:[c.preview],pathMatcher:'preview'},{hosts:[c.household],pathMatcher:'household'}],
  pathMatchers:[{name:'public-hub',defaultService:backend('gateway'),pathRules:[{paths:['/manage','/manage/*'],service:backend('management')}]},
   {name:'workshops',defaultService:backend('gateway')},{name:'preview',defaultService:backend('preview')},
   {name:'household',defaultService:backend('household'),pathRules:[{paths:['/v1/worker/jobs/*','/v1/internal/dispatch'],service:backend('machine')}]}]};
 return out;
}
async function main(){
 const [config,output,...extra]=process.argv.slice(2);if(!config||!output||extra.length)throw Error('Supply one reviewed JSON configuration and an empty output directory.');
 const plan=hostingPlan(JSON.parse(await readFile(config,'utf8')));await mkdir(output,{recursive:true});if((await readdir(output)).length)throw Error('Choose an empty output directory.');
 for(const [name,value] of Object.entries(plan))await writeFile(output+'/'+name+'.json',JSON.stringify(value,null,2)+'\n',{flag:'wx'});
 console.log('Prepared three service manifests and a URL map. No resources or traffic were changed.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
