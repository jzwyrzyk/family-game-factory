import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,readdir,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import vm from 'node:vm';
import {hostingPlan} from '../scripts/beta/prepare-hosting.mjs';
import {preparePublic} from '../scripts/beta/prepare-public';
import {protectedHousehold} from '../server/beta/owner-host';

const project='demo-jems-isolated',ref='us-east5-docker.pkg.dev/'+project+'/private/';const accounts=['gateway','preview','household'];
const cfg={environment:'test',project,projectNumber:'123456789',region:'us-east5',hub:'hub.example',preview:'games.example',household:'house.example',
 gatewayImage:ref+'gateway@sha256:'+'a'.repeat(64),previewImage:ref+'preview@sha256:'+'b'.repeat(64),
 services:Object.fromEntries(accounts.map(r=>[r,{name:'jems-test-'+r,identity:r+'@'+project+'.iam.gserviceaccount.com',secret:r+'-settings',version:'3'}])),
 backends:Object.fromEntries(['deny','gateway','management','preview','household','machine'].map(k=>[k,'test-'+k]))};
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
