// Isolated TEST household only. Reuses adult-pilot authorization, durable reservations and settlement.
import type {IncomingMessage, ServerResponse} from 'node:http';
import {createHash} from 'node:crypto';
import type {GatewayConfig} from '../gateway';
import type {Repository,PipelineState} from '../pipeline/types';
import type {VerifiedSession} from '../contracts/api';
import {adultPilotAllowed} from '../adult-pilot';
import {verifyBrowserSession} from '../trusted-devices';
import {verifyAdministrator} from './admin';
import {pinPremiumPolicy,committedGameUnits,premiumGameCeiling} from '../pipeline/premium-policy';
import {readJsonBody} from '../http-json';

export interface TestTrialAuthorization {
  sourceSha:string; workerSha:string; policySha256:string; adultProfileId:string;
  startsAt:string; expiresAt:string; limitMicrousd:number; approvalId:string;
}
function reject():never {throw Error('TEST_TRIAL_NOT_AUTHORIZED');}
function check(value:unknown):asserts value {if(!value)reject();}
function canonical(value:TestTrialAuthorization) {
  return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0)));
}
export const isolatedHousehold=(config:GatewayConfig,env:NodeJS.ProcessEnv=process.env)=>config.projectId==='jems-jzw-nonprod'&&config.platformMode==='HOUSEHOLD'&&
  !!config.householdPrivateHost&&env.K_SERVICE==='jems-test-household';
export function trialAuthorization(config:GatewayConfig,now=Date.now(),env:NodeJS.ProcessEnv=process.env) {
  const t=config.testTrial;
  check(isolatedHousehold(config,env)&&t&&Object.keys(t).sort().join(',')==='adultProfileId,approvalId,expiresAt,limitMicrousd,policySha256,sourceSha,startsAt,workerSha');
  check(/^[a-f0-9]{40}$/.test(t.sourceSha)&&/^[a-f0-9]{40}$/.test(t.workerSha)&&/^[\w:-]{1,100}$/.test(t.adultProfileId)&&
    /^[\w.-]{1,100}$/.test(t.approvalId)&&/^[a-f0-9]{64}$/.test(t.policySha256)&&Date.parse(t.startsAt)<=now&&
    now<Date.parse(t.expiresAt)&&Date.parse(t.expiresAt)-Date.parse(t.startsAt)<=24*3600000);
  check(config.premiumApproval&&config.premiumApproval.approvalId===t.approvalId&&!config.premiumApproval.images?.enabled&&
    config.premiumWorkerApprovedSha===t.workerSha&&config.workerApprovedSha===t.workerSha&&
    pinPremiumPolicy({approval:config.premiumApproval,workerSha:t.workerSha}).fingerprint===t.policySha256&&
    premiumGameCeiling(config.premiumMaxJobMicroUsd)===t.limitMicrousd);
  const hash=createHash('sha256').update(canonical(t)).digest('hex');
  check(config.approvedSha===t.sourceSha&&env.JEMS_TEST_FUNDED_HOUSEHOLD==='true'&&
    env.JEMS_TEST_TRIAL_AUTHORIZATION_SHA256===hash&&Date.parse(env.JEMS_TEST_TRIAL_EXPIRES_AT||'')===Date.parse(t.expiresAt));
  return {t,hash};
}
export async function trialContext(config:GatewayConfig,repo:Repository,req:IncomingMessage) {
  const {t,hash}=trialAuthorization(config);
  check(req.method==='POST'&&req.headers.host===new URL(config.appOrigin).host&&req.headers.origin===config.appOrigin&&
    req.headers['x-factory-request']==='1'&&req.headers['content-type']?.startsWith('application/json')&&
    req.headers['x-jems-trial-authorization']===hash);
  const assertion=req.headers['x-goog-iap-jwt-assertion'];
  await verifyAdministrator(typeof assertion==='string'?assertion:undefined,{administrator:config.householdPrivateHost!});
  const s=await verifyBrowserSession(repo,req.headers.cookie,config.sessionKey,Date.now(),req.headers['x-factory-adult-session']);
  const state=await repo.snapshot(),ledger=state.ledgers[s.familyId];
  check(s.familyId===config.familyId&&s.adultProfileId===t.adultProfileId&&adultPilotAllowed(state,s)&&ledger&&ledger.paidEnabled&&
    !state.platformSpendingStopped&&ledger.month===new Date().toISOString().slice(0,7)&&Number.isSafeInteger(ledger.allowance)&&
    ledger.allowance>0&&ledger.allowance<=t.limitMicrousd&&ledger.used+ledger.reserved<=ledger.allowance);
  return {t,hash,s,state,ledger};
}
export function settledTrial(state:PipelineState,s:VerifiedSession,t:TestTrialAuthorization,ids:{build:string;edit:string;coach:string}) {
  check(Object.keys(ids).sort().join(',')==='build,coach,edit'&&new Set(Object.values(ids)).size===3&&Object.values(ids).every(id=>/^[a-f0-9-]{36}$/.test(id)));
  const jobs=[ids.build,ids.edit].map(id=>state.jobs.find(j=>j.id===id));
  const [build,edit]=jobs;check(build&&edit&&build.baseRevisionId===null&&build.revisionId&&edit.baseRevisionId===build.revisionId&&edit.revisionId);
  for(const j of [build,edit]) {
    const calls=j.premiumUsage?.calls||[];
    check(j.familyId===s.familyId&&j.adultPilotProfileId===s.adultProfileId&&j.adultPilotDeviceId===s.deviceId&&
      j.adultPilotSessionId===s.adultSessionId&&j.status==='ready'&&j.adapter==='metered-api'&&j.premiumPolicy?.workerSha===t.workerSha&&
      j.premiumPolicy.fingerprint===t.policySha256&&j.premiumUsage?.imageUsageUnits===0&&!j.premiumUsage.uncertain&&
      calls.some(c=>c.stage==='construction')&&calls.some(c=>c.stage==='review')&&
      calls.every(c=>Number.isSafeInteger(c.costMicroUsd)&&c.costMicroUsd>=0)&&j.usedUnits>0&&j.usedUnits<=j.maxUnits&&
      calls.reduce((sum,c)=>sum+c.costMicroUsd,0)===j.usedUnits&&
      ['queued','ready'].every(status=>state.audit.some(a=>a.jobId===j.id&&a.status===status&&Date.parse(a.at)>=Date.parse(t.startsAt)&&Date.parse(a.at)<Date.parse(t.expiresAt))));
  }
  const revision=state.revisions.find(r=>r.id===edit.revisionId&&r.familyId===s.familyId&&r.adultPilotProfileId===s.adultProfileId);
  check(revision?.game&&revision.parentId===build.revisionId&&state.active[revision.projectId]===edit.revisionId);
  const turn=state.coachReceipts?.find(r=>r.id===ids.coach&&r.familyId===s.familyId&&r.subject===s.subject+':adult:'+s.adultSessionId&&r.state==='ready');
  check(turn?.reservationId&&turn.at>=Date.parse(t.startsAt)&&turn.at<Date.parse(t.expiresAt));
  const audit=state.audit.find(a=>a.jobId==='coach-'+turn.reservationId&&a.familyId===s.familyId&&a.status==='ready'&&a.usage?.kind==='coach'&&a.usage.outcome==='settled');
  const coach=audit?.usage?.usedMicroUsd;
  check(coach&&Number.isSafeInteger(coach)&&coach>0);
  const lineage=committedGameUnits(state,s.familyId,s.adultProfileId,edit.revisionId);
  const spendMicrousd=lineage+coach,ledger=state.ledgers[s.familyId];
  check(ledger.reserved===0&&lineage>=build.usedUnits+edit.usedUnits&&spendMicrousd<=ledger.used&&ledger.used<=t.limitMicrousd);
  const repairAttempts=[build,edit].reduce((n,j)=>n+(j.premiumUsage?.calls.filter(c=>c.stage==='repair').length||0),0);
  return {spendMicrousd,limitMicrousd:t.limitMicrousd,coachMicrousd:coach,lineageMicrousd:lineage,
    revisionIds:[build.revisionId,edit.revisionId],repairAttempts};
}
export async function trialReadback(config:GatewayConfig,repo:Repository,req:IncomingMessage,res:ServerResponse) {
  const {t,s,state,hash,ledger}=await trialContext(config,repo,req);
  const ids=await readJsonBody(req,2048);
  const result=req.url==='/v1/test-trial/preflight'?{allowanceMicrousd:ledger.allowance,usedMicrousd:ledger.used,reservedMicrousd:ledger.reserved}:settledTrial(state,s,t,ids);
  res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
  res.end(JSON.stringify({...result,authorizationSha256:hash,sourceSha:t.sourceSha,workerSha:t.workerSha}));
}
