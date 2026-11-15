import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair,SignJWT} from 'jose';
import {paidExecutionAllowed} from '../server/gateway';
import {GitHubDispatcher,workerTag} from '../server/actions/dispatcher';
import {GitHubOIDCVerifier} from '../server/actions/identity';

const SHA='b'.repeat(40);
const PRIVATE='jzwyrzyk/family-game-factory-worker';
const config={enabled:true,privateWorker:true,repository:PRIVATE,workflow:'factory-private.yml',approvedSha:SHA};
test('private dispatch goes only to trusted worker repo and immutable execution tag with opaque IDs',async()=>{
 const requests:{url:string;body?:any}[]=[];
 const dispatcher=new GitHubDispatcher(config,async()=> 'fixture-only-not-real-token',(async(u,init)=>{
  const url=String(u);requests.push({url,body:init?.body?JSON.parse(String(init.body)):undefined});
  if(init?.method==='POST')return new Response(null,{status:204});
  return new Response(JSON.stringify({object:{type:'commit',sha:SHA}}));
 }) as typeof fetch);
 await dispatcher.dispatch('opaque-job',2);
 assert.equal(workerTag(config),'factory-execution-'+SHA);
 assert.equal(requests.length,2);
 assert.equal(requests[0].url,'https://api.github.com/repos/'+PRIVATE+'/git/ref/tags/factory-execution-'+SHA);
 assert.equal(requests[1].url,'https://api.github.com/repos/'+PRIVATE+'/actions/workflows/factory-private.yml/dispatches');
 assert.deepEqual(requests[1].body,{ref:'factory-execution-'+SHA,inputs:{job_id:'opaque-job',attempt:'2'}});
 assert.ok(!JSON.stringify(requests).includes('childIntent'));
});
test('private dispatch refuses tag drift and has no old public-repo fallback',async()=>{
 const d=new GitHubDispatcher(config,async()=> 'fixture',(async()=>new Response(JSON.stringify({object:{sha:'c'.repeat(40)}}))) as typeof fetch);
 await assert.rejects(d.dispatch('job',0),/APPROVED_WORKER_TAG_CHANGED/);
});
test('private callbacks are signed and reject public repo, wrong private SHA, PR runs, env and reruns',async()=>{
 const {publicKey,privateKey}=await generateKeyPair('RS256');
 const policy={audience:'https://gateway.example',repository:PRIVATE,repositoryId:'1458899834',workflow:'factory-private.yml',approvedSha:SHA,privateWorker:true};
 const verifier=new GitHubOIDCVerifier(policy,async()=>publicKey);
 const tag='refs/tags/factory-execution-'+SHA;
 const claims={repository:PRIVATE,repository_id:policy.repositoryId,ref:tag,sha:SHA,workflow_ref:PRIVATE+'/.github/workflows/factory-private.yml@'+tag,event_name:'workflow_dispatch',run_attempt:'1',run_id:'119',environment:'factory-generation'};
 const sign=(changes:Record<string,unknown>={})=>new SignJWT({...claims,...changes}).setProtectedHeader({alg:'RS256'}).setIssuer('https://token.actions.githubusercontent.com').setAudience(policy.audience).setIssuedAt().setExpirationTime('5m').sign(privateKey);
 assert.equal((await verifier.verify(await sign())).stage,'generate');
 assert.equal((await verifier.verify(await sign({environment:'factory-sandbox'}))).stage,'test');
 for(const bad of [{repository:'jzwyrzyk/family-game-factory'},{repository_id:'1458033181'},{sha:'a'.repeat(40)},{ref:'refs/heads/main'},{workflow_ref:PRIVATE+'/.github/workflows/evil.yml@'+tag},{event_name:'pull_request'},{run_attempt:'2'},{environment:'untrusted'}]){
  await assert.rejects(verifier.verify(await sign(bad)),/WORKER_FORBIDDEN/);
 }
});

test('paid execution requires active private config AND explicit runtime approval (default off)',()=>{
 assert.equal(paidExecutionAllowed(false,undefined),false);
 assert.equal(paidExecutionAllowed(true,undefined),false);
 assert.equal(paidExecutionAllowed(true,'false'),false);
 assert.equal(paidExecutionAllowed(false,'true'),false);
 assert.equal(paidExecutionAllowed(true,'true'),true);
});
