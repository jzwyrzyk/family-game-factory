import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,readdir,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import vm from 'node:vm';
import {environmentRelease,verifyBackend} from '../scripts/beta/environment-release.mjs';
import {hostingPlan} from '../scripts/beta/prepare-hosting.mjs';
import {BuilderClient} from '../src/builder/client';
import {identifyBuildRequest} from '../src/builder/submission';
import {preparePublic} from '../scripts/beta/prepare-public';
import {protectedHousehold} from '../server/beta/owner-host';

const project='demo-jems-isolated',ref='us-east5-docker.pkg.dev/'+project+'/private/';const accounts=['gateway','preview','household'];
const cfg={environment:'test',project,projectNumber:'123456789',region:'us-east5',hub:'hub.example',preview:'games.example',household:'house.example',
 gatewayImage:ref+'gateway@sha256:'+'a'.repeat(64),previewImage:ref+'preview@sha256:'+'b'.repeat(64),
 services:Object.fromEntries(accounts.map(r=>[r,{name:'jems-test-'+r,identity:r+'@'+project+'.iam.gserviceaccount.com',secret:r+'-settings',version:'3'}])),
 backends:Object.fromEntries(['deny','gateway','management','preview','household','machine'].map(k=>[k,'test-'+k]))};
const compute='https://www.googleapis.com/compute/v1/projects/'+project;
function backendFixture(role:string){return {name:cfg.backends[role],selfLink:compute+'/global/backendServices/'+cfg.backends[role],protocol:'HTTP',loadBalancingScheme:'EXTERNAL_MANAGED',iap:{enabled:['management','household'].includes(role)},backends:role==='deny'?[]:[{group:compute+'/regions/'+cfg.region+'/networkEndpointGroups/'+role+'-neg'}]};}
function negFixture(role:string){return {name:role+'-neg',networkEndpointType:'SERVERLESS',region:compute+'/regions/'+cfg.region,cloudRun:{service:cfg.services[role==='management'?'gateway':role==='machine'?'household':role].name}};}
test('release verifies exact project, region and service behind every backend before staging',()=>{
 for(const role of Object.keys(cfg.backends))verifyBackend(backendFixture(role),role,cfg,(args:string[])=>negFixture(args[3].replace(/-neg$/,'')));
 const role='management',backend=backendFixture(role),neg=negFixture(role);
 for(const change of [
  {selfLink:backend.selfLink.replace(project,'other-project')},{enableCDN:true},{protocol:'HTTPS'},
  {loadBalancingScheme:'EXTERNAL'},{iap:{enabled:false}},{backends:[]},{backends:[...backend.backends,...backend.backends]},
  {customRequestHeaders:['Host: another.example']},{customResponseHeaders:['Cache-Control: public']},
  {backends:[{group:backend.backends[0].group.replace(project,'other-project')}]},
  {backends:[{group:backend.backends[0].group.replace(cfg.region,'europe-west1')}]}
 ])assert.throws(()=>verifyBackend({...backend,...change},role,cfg,()=>neg));
 for(const change of [{name:'other-neg'},{networkEndpointType:'GCE_VM_IP_PORT'},{region:neg.region.replace(project,'other-project')},
  {cloudRun:{service:cfg.services.household.name}},{cloudRun:{...neg.cloudRun,urlMask:'<service>.example'}},
  {cloudRun:{...neg.cloudRun,tag:'old'}},{cloudFunction:{function:'unexpected'}}
 ])assert.throws(()=>verifyBackend(backend,role,cfg,()=>({...neg,...change})));
 assert.throws(()=>verifyBackend({...backendFixture('deny'),backends:backend.backends},'deny',cfg,()=>neg));
 assert.throws(()=>verifyBackend({...backendFixture('machine'),iap:{enabled:true}},'machine',cfg,()=>neg));
});
test('DEV/TEST templates require dedicated hosts, identity, numeric secret version and pinned artifacts',()=>{
 const plan=hostingPlan(cfg) as any;
 assert.equal(plan.urlMap.defaultService.endsWith('/test-deny'),true);
 for(const k of accounts){assert.equal(plan[k].metadata.annotations['run.googleapis.com/default-url-disabled'],'true');assert.ok(plan[k].spec.template.spec.containers[0].env.some((e:any)=>e.name==='FACTORY_ACTIONS_APPROVED'&&e.value==='false'));}
 for(const invalid of [{environment:'prod'},{projectNumber:'1054529152893'},{preview:cfg.hub},{preview:'preview.'+cfg.hub},{gatewayImage:ref+'unverified:latest'},
  {services:{...cfg.services,household:cfg.services.gateway}}])assert.throws(()=>hostingPlan({...cfg,...invalid}));
});
test('public retirement artifact contains exactly the approved welcome assets, links and scoped tombstone',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'jems-public-'));
 try{await preparePublic(dir,'https://invited.example','operator@example.invalid');
  const files=(await readdir(dir,{recursive:true})).filter(n=>/\.[a-z0-9]+$/.test(n));
  assert.deepEqual(files.filter(f=>f.endsWith('.js')),['sw.js']);assert.ok(!files.some(f=>/(?:index-|private|\.map$|factory-config)/.test(f)));
  const html=await readFile(dir+'/index.html','utf8');assert.ok(html.includes('https://invited.example/login')&&html.includes('https://invited.example/invitation'));assert.ok(!html.includes('<script'));
  const remaining=new Set(['family-arcade:/jems/:v1','family-arcade:/other/:v1','another-application']);
  const events:Record<string,Function>={};let redirected='',unregistered=false;
  vm.runInNewContext(await readFile(dir+'/sw.js','utf8'),{URL,caches:{keys:async()=>[...remaining],delete:async(k:string)=>remaining.delete(k)},self:{
   addEventListener:(key:string,fn:Function)=>events[key]=fn,registration:{scope:'https://old.example/jems/',unregister:async()=>{unregistered=true;}},
   clients:{claim:async()=>{},matchAll:async()=>[{url:'https://old.example/jems/?game=dragon',navigate:async(url:string)=>{redirected=url;}}]}}});
  await events.activate({waitUntil:(v:Promise<void>)=>v});
  assert.ok(unregistered);assert.equal(redirected,'https://old.example/jems/');assert.deepEqual([...remaining],['family-arcade:/other/:v1','another-application']);assert.equal(events.fetch,undefined);
 }finally{await rm(dir,{recursive:true});}
});
test('owner application files require the dedicated IAP subject on the exact household host',async()=>{
 const owner={audience:'/projects/123/global/backendServices/456',subject:'owner'};
 const host=protectedHousehold({householdPrivateHost:owner,appOrigin:'https://owner.example',gatewayOrigin:'https://owner.example',previewOrigin:'https://games.example',familyId:'existing',workspace:'old-workspace'},'dist-family-beta',async(_req,res)=>{res.end('api');},async assertion=>{if(assertion!=='synthetic-owner')throw Error();return 'owner';});
 async function get(path:string,token?:string,hostname='owner.example'){
  const result={status:200,body:''};const res={headersSent:false,setHeader(){},writeHead(n:number){result.status=n;},end(v:string){result.body=String(v);}};
  await host({url:path,method:'GET',headers:{host:hostname,'x-goog-iap-jwt-assertion':token}} as any,res as any);return result;
 }
 for(const path of ['/','/index.html','/factory-config.json','/assets/index-private.js','/v1/creations'])assert.equal((await get(path)).status,403);
 assert.equal((await get('/factory-config.json','synthetic-owner','alternate.run.app')).status,403);
 assert.ok((await get('/factory-config.json','synthetic-owner')).body.includes('https://owner.example'));
 assert.equal((await get('/sw.js','synthetic-owner')).status,403);
});

test('protected nonproduction controller verifies build evidence and stages each approved revision once with serving traffic preserved',async()=>{
 const source='c'.repeat(40),id='11111111-1111-4111-8111-111111111111',trigger='22222222-2222-4222-8222-222222222222';
 const record={descriptor:cfg,source,builds:{gateway:{id,trigger},preview:{id:id.replace(/^1/,'3'),trigger}}};
 const plan=hostingPlan(cfg) as Record<string,any>,controller={enabled:true,projectId:cfg.project,projectNumber:cfg.projectNumber,region:cfg.region};
 const revisions=new Map<string,any[]>(),staged:string[]=[];let wrongImage=false,missingProvenance=false,wrongRuntime=false,wrongScale=false,wrongBackendProject=false,wrongUrlHeaders=false;
 function io(args:string[]){
  const group=args.slice(0,3).join(' ');
  if(group==='builds triggers describe')return {id:trigger,github:{owner:'jzwyrzyk',name:'family-game-factory'}};
  if(args[0]==='builds'){
   const img=args[2]===id?cfg.gatewayImage:cfg.previewImage;
   return {id:args[2],buildTriggerId:trigger,status:'SUCCESS',sourceProvenance:missingProvenance?{}:{resolvedRepoSource:{commitSha:source,repoName:'github_jzwyrzyk_family-game-factory'}},substitutions:{COMMIT_SHA:source,REPO_FULL_NAME:'jzwyrzyk/family-game-factory'},
    results:{images:[{name:img.split('@')[0]+':approved',digest:wrongImage?'sha256:'+'f'.repeat(64):img.split('@')[1]}]}};
  }
  if(group==='compute url-maps describe')return wrongBackendProject?{...plan.urlMap,defaultService:plan.urlMap.defaultService.replace(cfg.project,'other-isolated-project')}:wrongUrlHeaders?{...plan.urlMap,headerAction:{requestHeadersToAdd:[{headerName:'Host',headerValue:'other.example',replace:true}]}}:plan.urlMap;
  if(group==='compute backend-services describe')return backendFixture(Object.keys(cfg.backends).find(role=>cfg.backends[role]===args[3])!);
  if(group==='compute network-endpoint-groups describe')return negFixture(args[3].replace(/-neg$/,''));
  if(group==='run services describe'){
   const found=accounts.find(r=>cfg.services[r].name===args[3])!;
   return {...plan[found],status:{traffic:[{revisionName:args[3]+'-prior',percent:100}]}};
  }
  if(group==='run revisions list')return (revisions.get(args[4])??[]).map(r=>wrongRuntime?{...r,spec:{...r.spec,serviceAccountName:'unreviewed'}}:wrongScale?{...r,metadata:{...r.metadata,annotations:{...r.metadata.annotations,'autoscaling.knative.dev/maxScale':'9'}}}:r);
  if(group==='run services update'){
   assert.ok(args.includes('--no-traffic'));const service=args[3],image=args[args.indexOf('--image')+1],suffix=args[args.indexOf('--revision-suffix')+1];
   revisions.set(service,[{spec:plan[accounts.find(r=>cfg.services[r].name===service)!].spec.template.spec,metadata:{annotations:plan[accounts.find(r=>cfg.services[r].name===service)!].spec.template.metadata.annotations,name:service+'-'+suffix,labels:{'serving.knative.dev/service':service}},status:{imageDigest:image,conditions:[{type:'Ready',status:'True'}]}}]);staged.push(service);return {};
  }
  throw Error('Unexpected command');
 }
 const opts={environment:'test',source,mode:'verify'};await environmentRelease(record,controller,opts,io);assert.equal(staged.length,0);
 wrongBackendProject=true;await assert.rejects(environmentRelease(record,controller,{...opts,mode:'stage'},io),/routing/);assert.equal(staged.length,0);wrongBackendProject=false;
 wrongUrlHeaders=true;await assert.rejects(environmentRelease(record,controller,{...opts,mode:'stage'},io),/routing/);assert.equal(staged.length,0);wrongUrlHeaders=false;
 missingProvenance=true;await assert.rejects(environmentRelease(record,controller,{...opts,mode:'stage'},io),/source|provenance/);assert.equal(staged.length,0);missingProvenance=false;
 wrongImage=true;await assert.rejects(environmentRelease(record,controller,{...opts,mode:'stage'},io),/digest/);assert.equal(staged.length,0);wrongImage=false;
 await assert.rejects(environmentRelease(record,{...controller,enabled:false},{...opts,mode:'stage'},io));
 for(let i=0;i<2;i++){const receipt=await environmentRelease(record,controller,{...opts,mode:'stage'},io);assert.ok(receipt.services.every((r:any)=>r.revision&&r.currentTrafficPreserved));}
 assert.deepEqual(staged,['preview','gateway','household'].map(r=>cfg.services[r].name));
 wrongScale=true;await assert.rejects(environmentRelease(record,controller,{...opts,mode:'stage'},io),/scaling/);wrongScale=false;
 wrongRuntime=true;await assert.rejects(environmentRelease(record,controller,{...opts,mode:'stage'},io),/identity/);
 assert.equal(staged.length,3);
});

test('manual lost-response recovery resends only the original durable build identity',async()=>{
 const id='demo-build-request',request=await identifyBuildRequest({gameId:'generated-module',baseRevisionId:null,prompt:'Make a shape puzzle',clientRequestId:id});
 const client=new BuilderClient({version:1,mode:'unavailable'},()=>{}),writes:unknown[]=[];
 let accepted=false;client.api=async(path,body)=>{
  if(path.startsWith('/v1/job-requests/'))return {job:accepted?{jobId:'same-job',status:'queued'}:null};
  if(path==='/v1/jobs'){writes.push(body);accepted=true;return {jobId:'same-job',status:'queued'};}
  throw Error('unexpected request');
 };
 assert.equal((await client.resendSavedSubmission(request))?.jobId,'same-job');
 assert.equal((await client.resendSavedSubmission(request))?.jobId,'same-job');
 assert.deepEqual(writes,[{gameId:request.gameId,baseRevisionId:null,prompt:request.prompt,clientRequestId:id}]);
 await assert.rejects(client.resendSavedSubmission({...request,prompt:'changed'}));
});
