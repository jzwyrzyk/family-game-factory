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
