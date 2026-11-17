import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createServer} from 'node:http';
import {disabledPolicy,deniedCapabilities,validateSafetyPolicy,ALL_CAPABILITIES} from '../server/policy/contract';
import {DenyPolicyReader,SafetyGate} from '../server/policy/guard';
import {FirestoreSafetyPolicyReader} from '../server/policy/firestore';
import {nextEmergencyPolicy,parseStopArguments} from '../server/policy/owner-stop';
import {ActionCoordinator} from '../server/actions/coordinator';
import {MemoryRepository} from '../server/pipeline/repository';
import {JobService} from '../server/pipeline/service';
import {apiHandler,previewHandler} from '../server/pipeline/http';
import {signSession} from '../server/pipeline/auth';
import {MockAgent} from '../server/testing/mock-agent';

const make=(now=Date.now(),generation=true,preview=true)=>({
 ...disabledPolicy(now,7),emergencyStop:false,
 capabilities:{...deniedCapabilities(),cloud_generation:generation,private_preview:preview}
});
const gate=(read:()=>Promise<unknown>)=>new SafetyGate({read});
test('S00: immutable capability names and denied future features',()=>{
 assert.equal(new Set(ALL_CAPABILITIES).size,ALL_CAPABILITIES.length);
 assert.deepEqual(ALL_CAPABILITIES.filter(k=>!['cloud_generation','private_preview'].includes(k)),[
  'cloud_coach','remote_vision','new_family_enrollment','public_sharing','messaging',
  'crowdsourced_favorites','behavioral_ads','child_checkout'
 ]);
 for(const key of ALL_CAPABILITIES){
  const proposed=make();(proposed.capabilities as Record<string,boolean>)[key]=true;
  assert.equal(validateSafetyPolicy(proposed)!==null,['cloud_generation','private_preview'].includes(key),key);
 }
 assert.equal(validateSafetyPolicy({...make(),capabilities:{...make().capabilities,new_experimental_feature:true}}),null);
 assert.equal(validateSafetyPolicy({...make(),secret:'from-client'}),null);
 assert.equal(validateSafetyPolicy({...make(),scope:'public'}),null);
});
test('S00: strict timestamps, epochs, payloads and emergency-stop precedence',()=>{
 const now=Date.now();
 assert.equal(validateSafetyPolicy(make(now),now)?.epoch,7);
 assert.equal(validateSafetyPolicy({...make(now),epoch:0},now),null);
 assert.equal(validateSafetyPolicy({...make(now),epoch:1.3},now),null);
 assert.equal(validateSafetyPolicy({...make(now),expiresAt:now},now),null);
 assert.equal(validateSafetyPolicy({...make(now),expiresAt:now+45*86400000},now),null);
 assert.equal(validateSafetyPolicy({...make(now),updatedAt:now+120000},now),null);
 assert.equal(validateSafetyPolicy({...make(now),capabilities:{...make(now).capabilities,messaging:'false'}},now),null);
 assert.equal(validateSafetyPolicy(JSON.parse('{"__proto__":true}'),now),null);
});
test('S01: gateway policy fails closed for absence, corrupt reads, outages, stop, and revoked epoch',async()=>{
 const absent=new SafetyGate(new DenyPolicyReader());
 await assert.rejects(absent.require('cloud_generation'),/SAFETY_POLICY_BLOCKED/);
 for(const read of [async()=>{throw Error('database down');},async()=>null,async()=>({version:100}),async()=>disabledPolicy()]){
  const p=gate(read);assert.equal(await p.check('cloud_generation'),null);await assert.rejects(p.require('private_preview'),/SAFETY_POLICY_BLOCKED/);
 }
 let policy=make();const p=gate(async()=>policy);
 assert.equal((await p.require('cloud_generation')).epoch,7);
 assert.equal((await p.require('private_preview')).epoch,7);
 await assert.rejects(p.require('cloud_coach'),/SAFETY_POLICY_BLOCKED/);
 await p.requireEpoch('cloud_generation',7);
 policy=make();policy.epoch=8;
 await assert.rejects(p.requireEpoch('cloud_generation',7),/SAFETY_POLICY_BLOCKED/);
 policy.emergencyStop=true;
 assert.equal(await p.check('cloud_generation'),null);
});
test('S01: Firestore reader uses an IAM-only workspace policy document',async()=>{
 let path='';
 const reader=new FirestoreSafetyPolicyReader({doc:(p:string)=>{path=p;return {get:async()=>({exists:true,data:()=>make()})};}} as any,'owner-pilot');
 assert.equal((await reader.read() as any).epoch,7);
 assert.equal(path,'factorySafetyPolicies/owner-pilot');
 assert.throws(()=>new FirestoreSafetyPolicyReader({} as any,'../other'));
 assert.throws(()=>new FirestoreSafetyPolicyReader({} as any,'__proto__'));
});
test('S01: emergency CLI is stop-only, dry-run by default, and bumps epoch',()=>{
 const args=['--project=factory-example-001','--workspace=owner-pilot','--reason=SAFETY_INCIDENT'];
 assert.deepEqual(parseStopArguments(args),{project:'factory-example-001',workspace:'owner-pilot',reason:'SAFETY_INCIDENT',execute:false});
 assert.equal(parseStopArguments([...args,'--execute']).execute,true);
 for(const malicious of [[...args,'--enable'],[...args,'--workspace=other'],[...args,'--execute=true'],
  ['--project=x','--workspace=x','--reason=INCIDENT'],[...args,'--reason=child name']])
  assert.throws(()=>parseStopArguments(malicious));
 const stopped=nextEmergencyPolicy(make(),Date.now());
 assert.equal(stopped.epoch,8);assert.equal(stopped.emergencyStop,true);
 assert.ok(Object.values(stopped.capabilities).every(value=>value===false));
 assert.equal(nextEmergencyPolicy(null,1234567890000).epoch,1234567890000);
});
test('S01: queued jobs never dispatch and late worker claims never receive child prompts after stop',async()=>{
 let policy=make(),dispatches=0;
 const safety=gate(async()=>policy),repo=new MemoryRepository();
 await repo.transaction(s=>{
  s.ledgers.family={allowance:5000,used:0,reserved:100,paidEnabled:true,month:new Date().toISOString().slice(0,7)};
  s.jobs.push({id:'job-7',familyId:'family',policyEpoch:7,gameId:'new',baseRevisionId:null,prompt:'a child idea',
   clientRequestId:'test-7',status:'queued',adapter:'metered-api',maxUnits:100,usedUnits:0,retryCount:0});
  return true;
 });
 const approval:any={enabled:true,model:'fixture',approvalId:'synthetic',inputUsdPerMillion:1,outputUsdPerMillion:1,
   maxInputTokens:10000,maxOutputTokens:2000,priceReviewedOn:new Date().toISOString().slice(0,10)};
 const coordinator=new ActionCoordinator(repo,{dispatch:async()=>{dispatches++;}},approval,900000,safety);
 policy=nextEmergencyPolicy(policy);
 await coordinator.tick();
 assert.equal(dispatches,0);
 assert.equal((await repo.snapshot()).jobs[0].status,'failed');
 assert.equal((await repo.snapshot()).jobs[0].errorCode,'SAFETY_POLICY_BLOCKED');
 assert.equal((await repo.snapshot()).ledgers.family.reserved,0);
 await assert.rejects(coordinator.claim('job-7',0,'generate',{stage:'generate',runId:'run',repositoryId:'r',sha:'a'.repeat(40)} as any),/SAFETY_POLICY_BLOCKED/);
 policy=make();policy.epoch=9;
 await assert.rejects(coordinator.report('job-7',0,'test',{stage:'test',runId:'run',repositoryId:'r',sha:'a'.repeat(40)} as any,{ok:true}),/SAFETY_POLICY_BLOCKED/);
 assert.equal((await repo.snapshot()).revisions.length,0);
});
test('S01: HTTP job and private-read gates block before request persistence or provider invocation',async()=>{
 const repo=new MemoryRepository(),sessionKey='synthetic-signing-key-not-production-123456';
 const service=new JobService(repo,new MockAgent(),{test:async()=>{}},{allowMock:true,maxUnits:0,timeoutMs:2000,maxRetries:0});
 const origin='http://127.0.0.1:7777',session=signSession({subject:'child-fixture',familyId:'family',role:'designer',expiresAt:Date.now()+60000},sessionKey);
 let policy=disabledPolicy();
 const handler=apiHandler(service,{sessionKey,previewKey:sessionKey,appOrigin:origin,previewOrigin:'https://preview.example',safety:gate(async()=>policy)});
 const srv=createServer((req,res)=>{void handler(req,res);});await new Promise<void>(r=>srv.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+(srv.address() as {port:number}).port;
 const headers={Origin:origin,Cookie:'factory_session='+session,'Content-Type':'application/json','X-Factory-Request':'1'};
 try{
  const denied=await fetch(base+'/v1/jobs',{method:'POST',headers,body:JSON.stringify({gameId:'new',baseRevisionId:null,prompt:'make a dragon game',clientRequestId:'job-test'})});
  assert.equal(denied.status,503);assert.equal((await denied.json()).errorCode,'SAFETY_POLICY_BLOCKED');
  assert.equal((await repo.snapshot()).jobs.length,0);
  assert.equal((await fetch(base+'/v1/creations',{headers})).status,503);
  assert.equal((await fetch(base+'/v1/revisions',{method:'POST',headers,body:'{}'})).status,503);
  policy=make();
  const accepted=await fetch(base+'/v1/jobs',{method:'POST',headers,body:JSON.stringify({gameId:'new',baseRevisionId:null,prompt:'make a dragon game',clientRequestId:'job-test'})});
  assert.equal(accepted.status,202);
  assert.equal((await repo.snapshot()).jobs[0].policyEpoch,7);
  policy=nextEmergencyPolicy(policy);
  assert.equal((await fetch(base+'/v1/creations',{headers})).status,503);
 }finally{await new Promise<void>(r=>srv.close(()=>r()));}
});
test('S01: separate-origin preview checks policy before fetching generated game data',async()=>{
 const sessionKey='fixture-preview-key-1234567890-abcdef',id='private-game',family='family';
 const expires=Date.now()+60000,fields=[id,family,expires].join('\n');
 const cap=createHmac('sha256',sessionKey).update(fields).digest('base64url');
 let lookups=0;const service={revision:async()=>{lookups++;throw Error('NOT_FOUND');}};
 const handler=previewHandler(service as any,{sessionKey,previewKey:sessionKey,appOrigin:'https://app.example',
  previewOrigin:'https://preview.example',safety:gate(async()=>disabledPolicy())} as any);
 const srv=createServer((req,res)=>{void handler(req,res);});await new Promise<void>(r=>srv.listen(0,'127.0.0.1',r));
 const url='http://127.0.0.1:'+(srv.address() as {port:number}).port+'/preview/'+id+'?scope='+family+'&expires='+expires+'&cap='+cap+'&channel=chan';
 try{assert.equal((await fetch(url)).status,403);assert.equal(lookups,0);}
 finally{await new Promise<void>(r=>srv.close(()=>r()));}
});
