import assert from 'node:assert/strict';
import {test} from 'node:test';
import {generateKeyPair,SignJWT} from 'jose';
import {validateDevAccess,DevIapVerifier,runWithDevAccess,currentDevAccess,assertDevProjectBinding,
 devCloudTarget,devServiceOrigin,type DevAccessConfig} from '../server/dev-access';
import {GitHubOIDCVerifier} from '../server/actions/identity';
import {GitHubDispatcher,workerTag} from '../server/actions/dispatcher';
import {googleCallerVerifier,dedicatedCoachRuntime} from '../server/coach/private-executor';
import {privateCoachOrigin} from '../server/coach/private-bridge';

const config:DevAccessConfig={environment:'development',projectNumber:'234567890123',
 iapAudience:'/projects/234567890123/locations/us-east1/services/jems-dev-app',
 allowedAdults:[{subject:'accounts.google.com:123456789012345678901',email:'adult@example.com',operatorConfirmedAdult:true}],
 syntheticDataOnly:true,syntheticFamilyId:'dev-synthetic',syntheticWorkspace:'dev-synthetic',
 workerOwner:'fixture-lab',workerOwnerId:'987654321',maxTotalMicroUsd:5000000};
const scope={projectId:'jems-fixture-dev',workspace:'dev-synthetic',familyId:'dev-synthetic',artifactBucket:'jems-fixture-dev-artifacts',iapService:'jems-dev-app' as const};
const environment={FACTORY_ENVIRONMENT:'development'};
const policy=()=>validateDevAccess(structuredClone(config),scope,environment);

test('DEV configuration cannot select production, an ambiguous identity, or copied storage scope',()=>{
 assert.equal(policy().maxTotalMicroUsd,5000000);
 for(const change of [{projectNumber:'1054529152893'},{projectNumber:'9007199254740993'},
  {syntheticDataOnly:false},{syntheticFamilyId:'real-family'},{syntheticWorkspace:'other'},
  {maxTotalMicroUsd:0},{maxTotalMicroUsd:50000001},{workerOwnerId:'*'},
  {iapAudience:config.iapAudience.replace('jems-dev-app','jems-dev-preview')},
  {allowedAdults:[{...config.allowedAdults[0],operatorConfirmedAdult:false}]},
  {allowedAdults:[config.allowedAdults[0],config.allowedAdults[0]]},
  {allowedAdults:[{...config.allowedAdults[0],subject:'*'}]},
  {allowedAdults:[{...config.allowedAdults[0],email:'Adult@example.com'}]},
  {trustHeader:true}]){
  assert.throws(()=>validateDevAccess({...config,...change} as DevAccessConfig,scope,environment));
 }
 for(const change of [{projectId:'family-game-factory-jzw'},{workspace:'prod'},
  {familyId:'prod'},{artifactBucket:'production-artifacts'},{artifactBucket:undefined}])
  assert.throws(()=>validateDevAccess(config,{...scope,...change},environment));
 assert.throws(()=>validateDevAccess(config,scope,{}),/DEV_ACCESS_CONFIG_REQUIRED/);
});

test('IAP authorization verifies signature, exact audience, issuer, adult identity and bounded lifetime',async()=>{
 const p=policy(),pair=await generateKeyPair('ES256'),other=await generateKeyPair('ES256');
 const verifier=new DevIapVerifier(p,async()=>pair.publicKey),now=Math.floor(Date.now()/1000);
 const claims={iss:'https://cloud.google.com/iap',aud:p.iapAudience,sub:config.allowedAdults[0].subject,
  email:config.allowedAdults[0].email,iat:now,exp:now+600};
 const sign=(changes:Record<string,unknown>={},key=pair.privateKey)=>new SignJWT({...claims,...changes}).setProtectedHeader({alg:'ES256'}).sign(key);
 const identity=await verifier.verify(await sign());
 assert.ok(!JSON.stringify(identity).includes('adult@example.com'));
 assert.equal(runWithDevAccess(p,identity,()=>currentDevAccess()?.identity.subjectHash),identity.subjectHash);
 assert.equal(currentDevAccess(),undefined,'verified request context cannot leak to the next request');
 for(const change of [{iss:'accounts.google.com'},{aud:p.iapAudience+'-other'},
  {aud:[p.iapAudience,'another-audience']},{sub:'accounts.google.com:999999999999'},
  {email:'another@example.com'},{iat:now+60},{exp:now-60},{exp:now+661},
  {iat:undefined},{exp:undefined},{iat:now+.5},{gcip:{}}])
  await assert.rejects(verifier.verify(await sign(change)),/DEV_ADULT_ACCESS_REQUIRED/);
 await assert.rejects(verifier.verify(await sign({},other.privateKey)),/DEV_ADULT_ACCESS_REQUIRED/);
 for(const raw of [undefined,'accounts.google.com:adult@example.com',['one','two'],'Bearer arbitrary'])
  await assert.rejects(verifier.verify(raw),/DEV_ADULT_ACCESS_REQUIRED/);
 assert.throws(()=>runWithDevAccess(p,{subjectHash:identity.subjectHash,expiresAt:Date.now()+10000},()=>true),/DEV_ADULT_ACCESS_REQUIRED/);
});

test('actual metadata project ID and number must both bind before any DEV cloud state is used',async()=>{
 const p=policy();let reads=0;
 const metadata=(id:string,number:string,flavor='Google')=>async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
  assert.match(String(input),/^http:\/\/metadata\.google\.internal\/computeMetadata\/v1\/project\/(project-id|numeric-project-id)$/);
  assert.deepEqual(init?.headers,{'Metadata-Flavor':'Google'});assert.equal(init?.redirect,'error');reads++;
  return new Response(String(input).endsWith('/project-id')?id:number,{headers:{'Metadata-Flavor':flavor}});
 };
 await assertDevProjectBinding(p,metadata(p.projectId,p.projectNumber));assert.equal(reads,2);
 await assert.rejects(assertDevProjectBinding(p,metadata('family-game-factory-jzw',p.projectNumber)),/DEV_PROJECT_BINDING_REQUIRED/);
 await assert.rejects(assertDevProjectBinding(p,metadata(p.projectId,'1054529152893')),/DEV_PROJECT_BINDING_REQUIRED/);
 await assert.rejects(assertDevProjectBinding(p,metadata(p.projectId,p.projectNumber,'')),/DEV_PROJECT_BINDING_REQUIRED/);
});

test('independent DEV worker identity never authorizes a production, fork, public, stale or wrong-stage callback',async()=>{
 const pair=await generateKeyPair('RS256'),sha='b'.repeat(40),repo='fixture-lab/worker-dev';
 const p={audience:devServiceOrigin(devCloudTarget(policy()),'gateway'),repository:repo,repositoryId:'2222222222',
  workflow:'factory-private-dev.yml',approvedSha:sha,privateWorker:true,development:{owner:'fixture-lab',ownerId:'987654321'}};
 const verifier=new GitHubOIDCVerifier(p,async()=>pair.publicKey);
 const claims={repository:repo,repository_id:p.repositoryId,repository_owner:'fixture-lab',repository_owner_id:'987654321',
  repository_visibility:'private',ref:'refs/heads/main',ref_type:'branch',sha,workflow_sha:sha,
  workflow_ref:repo+'/.github/workflows/factory-private-dev.yml@refs/heads/main',event_name:'workflow_dispatch',
  run_attempt:'1',run_id:'123',environment:'jems-dev-generation'};
 const sign=(changes:Record<string,unknown>={},audience=p.audience)=>new SignJWT({...claims,...changes}).setProtectedHeader({alg:'RS256'})
  .setIssuer('https://token.actions.githubusercontent.com').setAudience(audience).setIssuedAt().setExpirationTime('5m').sign(pair.privateKey);
 for(const [environment,stage] of [['jems-dev-generation','generate'],['jems-dev-sandbox','test'],['jems-dev-quality','review']])
  assert.equal((await verifier.verify(await sign({environment}))).stage,stage);
 for(const change of [{repository:'family-game-factory-lab/family-game-factory-worker'},{repository_id:'1458899834'},
  {repository:'attacker/worker-dev'},{repository_owner:'attacker'},{repository_owner_id:'1'},{repository_visibility:'public'},
  {sha:'c'.repeat(40)},{workflow_sha:'c'.repeat(40)},{ref:'refs/heads/feature'},
  {workflow_ref:repo+'/.github/workflows/factory-private.yml@refs/heads/main'},
  {event_name:'pull_request'},{run_attempt:'2'},{environment:'untrusted'},{environment:'factory-generation'}])
  await assert.rejects(verifier.verify(await sign(change)),/WORKER_FORBIDDEN/);
 await assert.rejects(verifier.verify(await sign({},'https://production.example')));
 const production=new GitHubOIDCVerifier({audience:p.audience,repository:'family-game-factory-lab/family-game-factory-worker',
  repositoryId:'1458899834',workflow:'factory-private.yml',approvedSha:sha,privateWorker:true},async()=>pair.publicKey);
 await assert.rejects(production.verify(await sign()),/WORKER_FORBIDDEN/);
 for(const change of [{repositoryId:'1458899834'},{repository:'fixture-lab/worker'},
  {workflow:'factory-private.yml'},{privateWorker:false},{development:{owner:'*',ownerId:'987654321'}}])
  assert.throws(()=>new GitHubOIDCVerifier({...p,...change}),/DEV_WORKER_IDENTITY_REQUIRED/);
});

test('DEV dispatch observes only its own immutable release and protected main',async()=>{
 const sha='b'.repeat(40),seen:string[]=[],repository='fixture-lab/worker-dev';
 const dispatchConfig={enabled:true,repository,workflow:'factory-private-dev.yml',approvedSha:sha,privateWorker:true,development:policy()};
 const dispatcher=new GitHubDispatcher(dispatchConfig,
  async()=>'fixture-token',async(input,init)=>{
   const url=String(input);seen.push(url);assert.ok(url.startsWith('https://api.github.com/repos/'+repository+'/'));
   if(init?.method==='POST'){
    assert.deepEqual(JSON.parse(String(init.body)),{ref:'main',inputs:{job_id:'synthetic-job',attempt:'0'}});
    return new Response(null,{status:204});
   }
   return new Response(JSON.stringify({object:{type:'commit',sha}}));
  });
 await dispatcher.dispatch('synthetic-job',0);assert.equal(seen.length,3);
 assert.equal(workerTag(dispatchConfig),'jems-dev-execution-'+sha);
 assert.ok(seen[0].endsWith('/git/ref/tags/jems-dev-execution-'+sha));
 assert.ok(seen[1].endsWith('/git/ref/heads/main'));
 assert.ok(seen[2].endsWith('/actions/workflows/factory-private-dev.yml/dispatches'));
});

test('DEV dispatch requires its validated policy and cannot select a production or another owner target',()=>{
 const c={enabled:true,repository:'fixture-lab/worker-dev',workflow:'factory-private-dev.yml',approvedSha:'b'.repeat(40),privateWorker:true,development:policy()};
 for(const changes of [{development:undefined},{development:{...c.development}},
  {repository:'family-game-factory-lab/family-game-factory-worker'},{repository:'attacker/worker-dev'},
  {repository:'fixture-lab/worker'},{workflow:'factory-private.yml'},{privateWorker:false}])
  assert.throws(()=>new GitHubDispatcher({...c,...changes},async()=>'unused-fixture'),/DEV_ACCESS_CONFIG_REQUIRED|DEV_WORKER_DISPATCH_REQUIRED/);
 const {development,...production}=c;
 assert.equal(workerTag({...production,repository:'family-game-factory-lab/family-game-factory-worker',workflow:'factory-private.yml'}),'factory-execution-'+c.approvedSha);
 assert.equal(workerTag({...production,privateWorker:false,repository:'jzwyrzyk/family-game-factory',workflow:'factory-agent.yml'}),'factory-worker-'+c.approvedSha);
});

test('DEV dispatch denies missing or drifted DEV tag and main without falling back to a matching production tag',async()=>{
 const sha='b'.repeat(40),c={enabled:true,repository:'fixture-lab/worker-dev',workflow:'factory-private-dev.yml',approvedSha:sha,privateWorker:true,development:policy()};
 for(const mode of ['production-tag-only','tag-drift','main-drift','annotated-tag'] as const){
  let posts=0;const seen:string[]=[];
  const dispatcher=new GitHubDispatcher(c,async()=>'fixture-token',async(input,init)=>{
   const url=String(input);seen.push(url);
   if(init?.method==='POST'){posts++;return new Response(null,{status:204});}
   if(mode==='production-tag-only'&&url.endsWith('/git/ref/tags/jems-dev-execution-'+sha))return new Response(null,{status:404});
   const tag=url.includes('/git/ref/tags/');
   return new Response(JSON.stringify({object:{
    type:mode==='annotated-tag'&&tag?'tag':'commit',
    sha:(mode==='tag-drift'&&tag)||(mode==='main-drift'&&!tag)?'c'.repeat(40):sha
   }}));
  });
  await assert.rejects(dispatcher.dispatch('synthetic-job',0),/APPROVED_WORKER_TAG_CHANGED|APPROVED_WORKER_BRANCH_DRIFT/);
  assert.equal(posts,0);
  assert.equal(seen[0],'https://api.github.com/repos/'+c.repository+'/git/ref/tags/jems-dev-execution-'+sha);
  assert.ok(seen.every(url=>!url.includes('/git/ref/tags/factory-execution-')));
 }
});

test('private coach defaults remain production-specific; DEV requires its own exact project, caller and service',()=>{
 const target=devCloudTarget(policy()),origin=devServiceOrigin(target,'coach');
 assert.equal(privateCoachOrigin(origin,target),origin);
 assert.throws(()=>privateCoachOrigin(origin),/PRIVATE_COACH_ORIGIN_REQUIRED/);
 assert.throws(()=>privateCoachOrigin('https://factory-coach-private-fixture.run.app',target),/PRIVATE_COACH_ORIGIN_REQUIRED/);
 const caller=`jems-dev-gateway@${target.projectId}.iam.gserviceaccount.com`;
 assert.throws(()=>googleCallerVerifier(origin,caller),/PRIVATE_COACH_IDENTITY_REQUIRED/);
 assert.equal(typeof googleCallerVerifier(origin,caller,target),'function');
 assert.throws(()=>googleCallerVerifier(origin,'factory-gateway@family-game-factory-jzw.iam.gserviceaccount.com',target),/PRIVATE_COACH_IDENTITY_REQUIRED/);
 const env={FACTORY_ENVIRONMENT:'development',FACTORY_DEV_PROJECT_ID:target.projectId,FACTORY_DEV_PROJECT_NUMBER:target.projectNumber,
  FACTORY_DEV_REGION:target.region,K_SERVICE:'jems-dev-coach',FACTORY_COACH_EXECUTION_ENV:'dedicated-cloud-run'};
 assert.equal(dedicatedCoachRuntime(env).enabled,false);
 assert.throws(()=>dedicatedCoachRuntime({...env,K_SERVICE:'factory-coach-private'}),/DEDICATED_PRIVATE_CLOUD_RUN_REQUIRED/);
 assert.throws(()=>dedicatedCoachRuntime({...env,FACTORY_DEV_PROJECT_NUMBER:'1054529152893'}),/DEV_PROJECT_REQUIRED/);
 assert.throws(()=>dedicatedCoachRuntime({...env,FACTORY_ENVIRONMENT:undefined}),/DEV_ACCESS_CONFIG_REQUIRED/);
});
