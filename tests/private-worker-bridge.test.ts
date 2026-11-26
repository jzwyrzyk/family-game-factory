import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair,SignJWT} from 'jose';
import {paidExecutionAllowed} from '../server/gateway';
import {GitHubDispatcher,workerTag} from '../server/actions/dispatcher';
import {GitHubOIDCVerifier} from '../server/actions/identity';

const SHA='b'.repeat(40);
const PRIVATE='family-game-factory-lab/family-game-factory-worker';
const config={enabled:true,privateWorker:true,repository:PRIVATE,workflow:'factory-private.yml',approvedSha:SHA};
const respond=(sha=SHA,type='commit')=>new Response(JSON.stringify({object:{type,sha}}));
test('org selected workflow dispatches on main only after independent immutable tag and main SHA match',async()=>{
 const requests:{url:string;body?:any}[]=[];
 const dispatcher=new GitHubDispatcher(config,async()=> 'fixture-only-not-real-token',(async(u,init)=>{
  const url=String(u);requests.push({url,body:init?.body?JSON.parse(String(init.body)):undefined});
  if(init?.method==='POST')return new Response(null,{status:204});
  return respond();
 }) as typeof fetch);
 await dispatcher.dispatch('opaque-job',2);
 assert.equal(workerTag(config),'factory-execution-'+SHA);
 assert.deepEqual(requests.map(x=>x.url),[
  'https://api.github.com/repos/'+PRIVATE+'/git/ref/tags/factory-execution-'+SHA,
  'https://api.github.com/repos/'+PRIVATE+'/git/ref/heads/main',
  'https://api.github.com/repos/'+PRIVATE+'/actions/workflows/factory-private.yml/dispatches']);
 assert.deepEqual(requests[2].body,{ref:'main',inputs:{job_id:'opaque-job',attempt:'2'}});
 assert.ok(!JSON.stringify(requests).includes('childIntent'));
});
test('org dispatch rejects tag drift, protected main drift, annotated tag and never dispatches on unsafe ref',async()=>{
 for(const drift of ['tag','main','annotated']){
  let posts=0;
  const d=new GitHubDispatcher(config,async()=> 'fixture',(async(u,init)=>{
   if(init?.method==='POST'){posts++;return new Response(null,{status:204});}
   if(drift==='tag'&&String(u).includes('/tags/'))return respond('c'.repeat(40));
   if(drift==='main'&&String(u).includes('/heads/'))return respond('c'.repeat(40));
   if(drift==='annotated'&&String(u).includes('/tags/'))return respond(SHA,'tag');
   return respond();
  }) as typeof fetch);
  await assert.rejects(d.dispatch('job',0),/APPROVED_WORKER_TAG_CHANGED|APPROVED_WORKER_BRANCH_DRIFT/);
  assert.equal(posts,0);
 }
});
test('org callback accepts only GitHub signed reviewed main workflow in exact org/repo, environment and SHA',async()=>{
 const {publicKey,privateKey}=await generateKeyPair('RS256');
 const policy={audience:'https://gateway.example',repository:PRIVATE,repositoryId:'1458899834',workflow:'factory-private.yml',approvedSha:SHA,privateWorker:true};
 const verifier=new GitHubOIDCVerifier(policy,async()=>publicKey);
 const ref='refs/heads/main';
 const claims={repository:PRIVATE,repository_id:policy.repositoryId,repository_owner:'family-game-factory-lab',repository_owner_id:'357047835',repository_visibility:'private',ref,ref_type:'branch',sha:SHA,workflow_sha:SHA,workflow_ref:PRIVATE+'/.github/workflows/factory-private.yml@'+ref,event_name:'workflow_dispatch',run_attempt:'1',run_id:'119',environment:'factory-generation'};
 const sign=(changes:Record<string,unknown>={})=>new SignJWT({...claims,...changes}).setProtectedHeader({alg:'RS256'}).setIssuer('https://token.actions.githubusercontent.com').setAudience(policy.audience).setIssuedAt().setExpirationTime('5m').sign(privateKey);
 assert.equal((await verifier.verify(await sign())).stage,'generate');
 assert.equal((await verifier.verify(await sign({environment:'factory-sandbox'}))).stage,'test');
 const denied=[
  {repository:'jzwyrzyk/family-game-factory-worker'},
  {repository:'jzwyrzyk/family-game-factory'},
  {repository_id:'1458033181'},
  {repository_owner:'jzwyrzyk'},
  {repository_owner_id:'356692244'},
  {repository_visibility:'public'},
  {sha:'c'.repeat(40)},
  {workflow_sha:'c'.repeat(40)},
  {ref:'refs/tags/factory-execution-'+SHA},
  {ref:'refs/heads/untrusted'},
  {ref_type:'tag'},
  {workflow_ref:PRIVATE+'/.github/workflows/evil.yml@refs/heads/main'},
  {workflow_ref:PRIVATE+'/.github/workflows/factory-private.yml@refs/tags/factory-execution-'+SHA},
  {event_name:'pull_request'},{run_attempt:'2'},{environment:'untrusted'}
 ];
 for(const bad of denied)await assert.rejects(verifier.verify(await sign(bad)),/WORKER_FORBIDDEN/);
});
test('paid execution still needs separate owner config AND runtime authorization, both off by default',()=>{
 assert.equal(paidExecutionAllowed(false,undefined),false);
 assert.equal(paidExecutionAllowed(true,undefined),false);
 assert.equal(paidExecutionAllowed(true,'false'),false);
 assert.equal(paidExecutionAllowed(false,'true'),false);
 assert.equal(paidExecutionAllowed(true,'true'),true);
});

import {randomUUID} from 'node:crypto';
import {assertRunJob} from '../server/beta/worker';
import {requireTestCallback,testExecution,testWorkerRepository,testWorkerWorkflow} from '../server/actions/test-execution';
import {trialExpiry,testCoachOrigin,testGatewayPrincipal,testHouseholdPrincipal} from '../server/coach/test-identity';
import {dedicatedCoachRuntime,googleCallerVerifier} from '../server/coach/private-executor';
import {privateCoachOrigin} from '../server/coach/private-bridge';
import type {GatewayConfig} from '../server/gateway';

const testPolicy={providerMode:'fixture' as const,publicSourceSha:'c'.repeat(40),expiresAt:Date.now()+3600000};
const testEnv={K_SERVICE:'jems-test-gateway',JEMS_TEST_PROJECT_NUMBER:'1092405124984'};
const testBinding:GatewayConfig={platformMode:'PRIVATE_FAMILY_BETA',active:false,
 appOrigin:'https://test.example',gatewayOrigin:'https://test.example',previewOrigin:'https://games.example',
 sessionKey:'fixture-session-key',previewKey:'fixture-preview-key',familyId:randomUUID(),workspace:'test-household',
 maxJobMicroUsd:100,workflow:'factory-worker.yml',githubAppId:'41',githubInstallationId:'51',githubPrivateKey:'unused',
 approval:{enabled:false,approvalId:'fixture',model:'fixture',inputUsdPerMillion:1,outputUsdPerMillion:1,maxInputTokens:128,maxOutputTokens:128,priceReviewedOn:'2026-11-26'},repository:'jzwyrzyk/family-game-factory',repositoryId:'1458033181',
 approvedSha:testPolicy.publicSourceSha,workerRepository:testWorkerRepository,workerRepositoryId:'2345678999',workerWorkflow:testWorkerWorkflow,workerApprovedSha:SHA,
 beta:{hubOrigin:'https://test.example',ownerActivation:'private-family-beta-v1',operatorContact:'operator@example.test',environment:'test',providerEvidence:[],workerRoute:'beta-test',testReset:{familyId:randomUUID(),subject:'reset'},administrator:{subject:'operator',verifier:{salt:'1'.repeat(32),digest:'2'.repeat(64)},audience:'/projects/1092405124984/global/backendServices/11'}},
 projectId:'jems-jzw-nonprod',artifactBucket:'jems-jzw-nonprod-jems-test-artifacts',testExecution:testPolicy};
test('TEST execution rejects household, production projects, unrelated id/origin, mutable sources and implicit funding at startup',()=>{
 assert.deepEqual(testExecution(testBinding,testEnv),testPolicy);
 for(const changes of [{projectId:'family-game-factory-jzw'},{artifactBucket:'household-originals'},{localFile:'state.json'},{workerRepository:PRIVATE},
  {workerRepositoryId:'1458899834'},{workerApprovedSha:'main'},{approvedSha:SHA},{workerWorkflow:'factory-private.yml'},{testExecution:undefined},{active:true},
  {approval:{enabled:true}},{testExecution:{...testPolicy,providerMode:'funded'}}]){
  assert.throws(()=>testExecution({...testBinding,...changes} as GatewayConfig,testEnv),/REQUIRED/);
 }
 for(const changes of [{K_SERVICE:'legacy'},{K_SERVICE:'jems-test-household'},{JEMS_TEST_PROJECT_NUMBER:'1054529152893'},{JEMS_TEST_PROJECT_NUMBER:'123'},{FACTORY_ACTIONS_APPROVED:'true'},{FACTORY_COACH_APPROVED:'true'}])
  assert.throws(()=>testExecution(testBinding,{...testEnv,...changes}),/REQUIRED/);
 const origin=testCoachOrigin(testEnv);
 assert.equal(privateCoachOrigin(origin,testEnv),origin);
 assert.throws(()=>privateCoachOrigin('https://factory-coach-private-old.run.app',testEnv));
 assert.throws(()=>privateCoachOrigin(origin,{}));
 const coach={...testEnv,K_SERVICE:'jems-test-coach',FACTORY_COACH_EXECUTION_ENV:'dedicated-cloud-run',FACTORY_COACH_PRIVATE_AUDIENCE:origin,FACTORY_COACH_GATEWAY_SERVICE_ACCOUNT:testGatewayPrincipal};
 assert.equal(dedicatedCoachRuntime(coach).enabled,false);
 assert.throws(()=>dedicatedCoachRuntime({...coach,FACTORY_COACH_PRIVATE_AUDIENCE:origin.replace('1092405124984','222222222')}));
 assert.throws(()=>googleCallerVerifier(origin,testHouseholdPrincipal,coach));
 const grant={JEMS_TEST_FUNDED_HOUSEHOLD:'true',JEMS_TEST_TRIAL_AUTHORIZATION_SHA256:'f'.repeat(64),JEMS_TEST_TRIAL_EXPIRES_AT:new Date(testPolicy.expiresAt).toISOString()};
 assert.equal(trialExpiry(grant),testPolicy.expiresAt);assert.doesNotThrow(()=>googleCallerVerifier(origin,testHouseholdPrincipal,{...coach,...grant}));
 assert.throws(()=>trialExpiry({...grant,JEMS_TEST_TRIAL_AUTHORIZATION_SHA256:'abc'}));
});
test('TEST dispatcher independently verifies protected main and code tag; callback binds exact job, mode and attempt',async()=>{
 const job=randomUUID(),mode='fixture',route='beta-test';
 const dc={enabled:true,privateWorker:true,repository:testWorkerRepository,workflow:testWorkerWorkflow,approvedSha:SHA,callbackRoute:route,testExecution:testPolicy} as const;
 for(const protectedMain of [false,true]){
  const requests:{url:string;body?:unknown}[]=[];
  const d=new GitHubDispatcher(dc,async()=> 'simulation',async(u,init)=>{
   const url=String(u);requests.push({url,body:init?.body?JSON.parse(String(init.body)):undefined});
   if(init?.method==='POST')return new Response(null,{status:204});
   if(url.endsWith('/branches/main'))return Response.json({protected:protectedMain,name:'main',commit:{sha:SHA}});
   return respond();
  });
  if(protectedMain){
   await d.dispatch(job,2);assert.deepEqual(requests.at(-1)?.body,{ref:'main',inputs:{job_id:job,attempt:'2',gateway_route:route,provider_mode:mode}});
   assert.ok(requests.some(r=>r.url.endsWith('/tags/jems-test-execution-'+SHA)));
  }else{await assert.rejects(d.dispatch(job,1),/PROTECTED_WORKER/);assert.ok(requests.every(r=>!r.body));}
 }
 const identity={runId:'499',repositoryId:testBinding.workerRepositoryId!,sha:SHA,stage:'generate' as const};
 const title='Private factory job '+job+' / beta-test / 2 / fixture',response={id:499,repository:{id:identity.repositoryId},run_attempt:1,event:'workflow_dispatch',head_sha:SHA,display_title:title};
 const verify=(data:object)=>assertRunJob(identity,job,testWorkerRepository,async()=> 'simulation',route,async()=>Response.json({...response,...data}),mode);
 assert.equal(await verify({}),2);
 for(const delta of [{display_title:title.replace('fixture','funded')},{display_title:title.replace(job,randomUUID())},{run_attempt:2},{head_sha:'d'.repeat(40)},{repository:{id:'1458899834'}}])await assert.rejects(verify(delta),/FORBIDDEN/);
});
test('TEST OIDC binds actual signed claims to exact workflow, environment, runner class and immutable repo id',async()=>{
 const {publicKey,privateKey}=await generateKeyPair('RS256'),audience='https://family-test.example';
 const verifier=new GitHubOIDCVerifier({audience,repository:testWorkerRepository,repositoryId:'4242',workflow:testWorkerWorkflow,approvedSha:SHA,privateWorker:true,testExecution:testPolicy},async()=>publicKey);
 const claims={repository:testWorkerRepository,repository_id:'4242',repository_owner:'family-game-factory-lab',repository_owner_id:'357047835',repository_visibility:'private',ref:'refs/heads/main',ref_type:'branch',sha:SHA,workflow_sha:SHA,
  workflow_ref:testWorkerRepository+'/.github/workflows/'+testWorkerWorkflow+'@refs/heads/main',event_name:'workflow_dispatch',run_attempt:'1',run_id:'449',environment:'jems-test-generation',runner_environment:'github-hosted'};
 const sign=(delta:Record<string,unknown>)=>new SignJWT({...claims,...delta}).setProtectedHeader({alg:'RS256'}).setIssuer('https://token.actions.githubusercontent.com').setAudience(audience).setIssuedAt().setExpirationTime('5m').sign(privateKey);
 assert.equal((await verifier.verify(await sign({}))).stage,'generate');
 assert.equal((await verifier.verify(await sign({environment:'jems-test-sandbox',runner_environment:'self-hosted'}))).stage,'test');
 for(const delta of [{environment:'factory-generation'},{environment:'jems-test-sandbox'},{runner_environment:'self-hosted'},{repository_id:'1458899834'},{run_attempt:'2'},{repository_visibility:'public'},{workflow_sha:'d'.repeat(40)}])
  await assert.rejects(verifier.verify(await sign(delta)),/FORBIDDEN/);
});

test('test callback admits only the selected app source and separately bound trial authorization',()=>{
 const headers={'x-jems-test-public-source':testPolicy.publicSourceSha},funded={...testPolicy,providerMode:'funded' as const,authorizationSha256:'5'.repeat(64)};
 requireTestCallback(testPolicy,headers);
 requireTestCallback(funded,{...headers,'x-jems-test-trial-authorization':funded.authorizationSha256});
 assert.throws(()=>requireTestCallback(testPolicy,{}));
 assert.throws(()=>requireTestCallback(testPolicy,{'x-jems-test-public-source':SHA}));
 assert.throws(()=>requireTestCallback(testPolicy,{...headers,'x-jems-test-trial-authorization':funded.authorizationSha256}));
 assert.throws(()=>requireTestCallback(funded,headers));
 assert.throws(()=>requireTestCallback(funded,{...headers,'x-jems-test-trial-authorization':'3'.repeat(64)}));
});
