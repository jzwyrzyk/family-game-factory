import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {trialAuthorization,settledTrial} from '../../server/beta/test-trial';
import type {GatewayConfig} from '../../server/gateway';
import type {PremiumApproval,ModelStage} from '../../server/agent/model-policy';
import {PREMIUM_POLICY_VERSION,INITIAL_PREMIUM_MODELS,premiumModelRates} from '../../server/agent/model-policy';
import {pinPremiumPolicy} from '../../server/pipeline/premium-policy';

const now=Date.now(),day=new Date(now).toISOString().slice(0,10);
const sha='d'.repeat(40),familyId='fixture',deviceId=randomUUID(),sid=randomUUID();
const session={familyId,deviceId,subject:'family-designer',role:'designer' as const,adultProfileId:'adult:'+deviceId,adultSessionId:sid,expiresAt:now+600000};
const approval:PremiumApproval={enabled:true,version:PREMIUM_POLICY_VERSION,approvalId:'offline-trial',maxRepairAttempts:1,stages:
 Object.fromEntries((Object.keys(INITIAL_PREMIUM_MODELS) as ModelStage[]).map(k=>[k,{model:INITIAL_PREMIUM_MODELS[k],reasoningEffort:'high',inputUsdPerMillion:premiumModelRates(INITIAL_PREMIUM_MODELS[k])!.input,outputUsdPerMillion:premiumModelRates(INITIAL_PREMIUM_MODELS[k])!.output,maxInputTokens:64000,maxOutputTokens:12000,priceReviewedOn:day,providerAccessReviewedOn:day,zdrApproved:true,lowDetailImageTokens:4096}])) as PremiumApproval['stages']};
const pin=pinPremiumPolicy({approval,workerSha:sha}),t={sourceSha:sha,workerSha:sha,policySha256:pin.fingerprint,adultProfileId:session.adultProfileId,startsAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+600000).toISOString(),limitMicrousd:5000000,approvalId:approval.approvalId};
const config={projectId:'jems-jzw-nonprod',platformMode:'HOUSEHOLD',householdPrivateHost:{audience:'/projects/1/global/backendServices/2',subject:'test'},testTrial:t,approvedSha:sha,workerApprovedSha:sha,premiumWorkerApprovedSha:sha,premiumMaxJobMicroUsd:t.limitMicrousd,premiumApproval:approval} as GatewayConfig;
const checksum=createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.entries(t).sort(([a],[b])=>a<b?-1:1)))).digest('hex');
const env={K_SERVICE:'jems-test-household',JEMS_TEST_FUNDED_HOUSEHOLD:'true',JEMS_TEST_TRIAL_AUTHORIZATION_SHA256:checksum,JEMS_TEST_TRIAL_EXPIRES_AT:t.expiresAt};
test('trial authorization binds reviewed identity, expiry, policy, cap and isolated household',()=>{
 assert.equal(trialAuthorization(config,now,env).hash,checksum);
 for(const c of [{projectId:'family-game-factory-jzw'},{approvedSha:'b'.repeat(40)},{premiumWorkerApprovedSha:'b'.repeat(40)},{premiumMaxJobMicroUsd:4999999},
  {testTrial:{...t,limitMicrousd:5000001}},{testTrial:{...t,policySha256:'0'.repeat(64)}}])assert.throws(()=>trialAuthorization({...config,...c},now,env));
 for(const e of [{K_SERVICE:'jems-test-gateway'},{JEMS_TEST_FUNDED_HOUSEHOLD:'false'},{JEMS_TEST_TRIAL_AUTHORIZATION_SHA256:'0'.repeat(64)}])assert.throws(()=>trialAuthorization(config,now,{...env,...e}));
 assert.throws(()=>trialAuthorization(config,Date.parse(t.expiresAt),env));
});
test('content-free settlement derives real lineage, closed reservations and independent Coach audit',()=>{
 const bid=randomUUID(),eid=randomUUID(),cid=randomUUID(),r1=randomUUID(),r2=randomUUID(),project=randomUUID(),reservationId=randomUUID(),ids={build:bid,edit:eid,coach:cid};
 const job=(id:string,baseRevisionId:string|null,revisionId:string)=>({id,baseRevisionId,revisionId,familyId,adultPilotProfileId:session.adultProfileId,adultPilotDeviceId:deviceId,adultPilotSessionId:sid,
  status:'ready',adapter:'metered-api',premiumPolicy:pin,premiumUsage:{calls:[{stage:'construction',costMicroUsd:5},{stage:'review',costMicroUsd:5}],imageUsageUnits:0},maxUnits:100,usedUnits:10});
 const state:any={jobs:[job(bid,null,r1),job(eid,r1,r2)],revisions:[{id:r1,projectId:project,familyId,adultPilotProfileId:session.adultProfileId,game:{}},{id:r2,parentId:r1,projectId:project,familyId,adultPilotProfileId:session.adultProfileId,game:{}}],
  active:{[project]:r2},coachReceipts:[{id:cid,familyId,subject:session.subject+':adult:'+sid,state:'ready',at:now,reservationId}],audit:[...([bid,eid].flatMap(jobId=>['queued','ready'].map(status=>({jobId,at:new Date(now).toISOString(),status})))),
  {jobId:'coach-'+reservationId,familyId,status:'ready',usage:{kind:'coach',outcome:'settled',usedMicroUsd:5}}],ledgers:{[familyId]:{reserved:0,used:25}}};
 assert.equal(settledTrial(state,session,t,ids).spendMicrousd,25);
 for(const change of [(v:any)=>v.jobs[0].premiumUsage.uncertain=true,(v:any)=>v.jobs[0].premiumUsage.imageUsageUnits=3,(v:any)=>v.jobs[1].baseRevisionId=null,(v:any)=>v.jobs[0].adultPilotDeviceId='other',
  (v:any)=>v.coachReceipts[0].subject='someone-else',(v:any)=>v.audit.pop(),(v:any)=>v.active[project]=r1,(v:any)=>v.ledgers[familyId].reserved=1,(v:any)=>v.ledgers[familyId].used=5000001]){
  const v=structuredClone(state);change(v);assert.throws(()=>settledTrial(v,session,t,ids));
 }
});
