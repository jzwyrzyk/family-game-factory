import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,request} from 'node:http';
import {randomUUID} from 'node:crypto';
import type {AddressInfo} from 'node:net';
import {betaFixture,fixtureKey} from './beta-fixture';
import {previewAdmission,familyPreview} from '../server/beta/preview';
import {familyOrigin,betaNotice,defaultCapabilities} from '../server/beta/model';
import {deletionTarget} from '../server/beta/erase';
import {internalCookies,logout,requirePlay} from '../server/beta/access';
import {verifySession} from '../server/pipeline/auth';
import {cookieValue} from '../server/trusted-devices';
import {submitParentPrivacyChoice,verifiedParentScope} from '../server/privacy/parent-consent';

test('private preview requires a family-bound POST, valid play and a live device',async()=>{
 const {d,enroll}=await betaFixture(),a=await enroll('preview-a'),b=await enroll('preview-b');
 const routing={environment:d.config.environment,hubOrigin:d.config.hubOrigin,previewOrigin:'https://preview.example',previewKey:'synthetic-only-preview-key-32-bytes-long'};
 const id=randomUUID();await d.repository(a.id).transaction(s=>{s.revisions.push({id,familyId:a.id,parentId:null,projectId:'mine',game:{kind:'star-catcher-v1',target:5,seconds:15}});});
 const session=(await requirePlay(d,a.id,a.cookies,fixtureKey,'check')).session;
 const foreign=(await requirePlay(d,b.id,b.cookies,fixtureKey,'check')).session;
 await assert.rejects(previewAdmission(d,routing,foreign,b.cookies,id));
 const preview=await previewAdmission(d,routing,session,a.cookies,id);assert.equal(preview.url,routing.previewOrigin+'/family-preview');
 const handle=familyPreview(routing,d.db,()=>undefined),server=createServer((req,res)=>{void handle(req,res);});
 await new Promise<void>(ok=>server.listen(0,'127.0.0.1',ok));
 try{
  const url='http://127.0.0.1:'+(server.address() as AddressInfo).port+'/family-preview';
  const open=(family:string)=>new Promise<Response>((ok,no)=>{
   const req=request(url,{method:'POST',headers:{Host:'preview.example',Origin:familyOrigin(d.config,family),'Content-Type':'application/x-www-form-urlencoded'}},res=>{
    res.resume();ok(new Response(null,{status:res.statusCode,headers:{'content-security-policy':String(res.headers['content-security-policy'])}}));});
   req.on('error',no);req.end(new URLSearchParams({channel:randomUUID(),grant:preview.grant}).toString());
  });
  assert.equal((await fetch(url,{headers:{Host:'preview.example'}})).status,403);
  assert.equal((await open(b.id)).status,403);const valid=await open(a.id);assert.equal(valid.status,200);assert.match(valid.headers.get('content-security-policy')!,/connect-src 'none'/);
  await logout(d,a.id,a.cookies,fixtureKey,false);assert.equal((await open(a.id)).status,403);
 }finally{server.closeAllConnections();await new Promise<void>(ok=>server.close(()=>ok()));}
});
test('verified consent, current provider evidence and family policy are independent and revocable',async()=>{
 const {d,mutate,enroll}=await betaFixture(),a=await enroll('privacy-a'),b=await enroll('privacy-b'),repo=d.repository(a.id),now=Date.now();
 const session=verifySession(cookieValue(internalCookies(a.cookies),'factory_session'),fixtureKey);
 const parent={...session,role:'parent' as const,subject:'fixture-guardian'};
 const choice=await submitParentPrivacyChoice(repo,parent,{guardianAffirmed:true,providerAcknowledged:true,noticeVersion:betaNotice,scopes:{generation:true,conversation:false,remoteSpeech:false}});
 const caps={...defaultCapabilities(),generation:true};
 await mutate('policy',a.id,{capabilities:caps,paused:false,generationPaused:false,monthlyCents:50});
 assert.equal(verifiedParentScope(await repo.snapshot(),a.id,'generation'),false);
 await assert.rejects(mutate('verify-consent',b.id,{choiceId:choice.choiceId,receipt:'fixture-private-receipt'}));
 await mutate('verify-consent',a.id,{choiceId:choice.choiceId,receipt:'fixture-private-receipt'});
 assert.equal(verifiedParentScope(await repo.snapshot(),a.id,'generation'),false);
 d.config.providerEvidence.push({scope:'generation',provider:'openai',notice:betaNotice,expiresAt:now+86400000,privacyDigest:'1'.repeat(64),safetyDigest:'2'.repeat(64),zdrApproved:true});
 assert.equal(verifiedParentScope(await repo.snapshot(),a.id,'generation'),true);
 await repo.transaction(s=>{s.ledgers[a.id].reserved=2000;s.jobs.push({id:randomUUID(),familyId:a.id,status:'building',gameId:'new',baseRevisionId:null,prompt:'synthetic game',clientRequestId:randomUUID(),adapter:'metered-api',maxUnits:2000,usedUnits:0,retryCount:0});});
 await mutate('withdraw',a.id);const state=await repo.snapshot();
 assert.equal(verifiedParentScope(state,a.id,'generation'),false);assert.equal(state.jobs[0].status,'cancelled');assert.equal(state.ledgers[a.id].reserved,0);
 await mutate('request-deletion',a.id);const pending=await d.withFamily(a.id,async(_tx,f)=>f);
 assert.throws(()=>deletionTarget(pending,a.id,pending.request!.id));
 await mutate('confirm-deletion',a.id,{requestId:pending.request!.id,receipt:'synthetic-erasure-verification'});
 const authorized=await d.withFamily(a.id,async(_tx,f)=>f);assert.equal(deletionTarget(authorized,a.id,pending.request!.id),'beta-'+a.id);
 assert.throws(()=>deletionTarget(authorized,b.id,pending.request!.id));await assert.rejects(repo.snapshot());
});

test('scheduled reconciliation clears expired server coaching replies for an idle suspended family',async()=>{
 const {reconcilePaidReceipts,COACH_RECEIPT_TTL_MS}=await import('../server/coach/receipts');
 const {d,enroll,mutate}=await betaFixture(),family=await enroll('idle-retention'),repo=d.repository(family.id);
 const now=Date.now();
 await repo.transaction(s=>{
  s.coachReceipts=[now-COACH_RECEIPT_TTL_MS-5000,now].map((at,i)=>({
   familyId:family.id,at,id:'fixture-'+i,subject:'designer',hash:'opaque',state:'ready',reserved:0,month:'2026-11',reply:{text:'fixture'} as never
  }));
 });
 await mutate('suspend',family.id);
 await reconcilePaidReceipts(repo);
 const receipts=(await repo.snapshot()).coachReceipts!;
 assert.equal(receipts.length,2);assert.equal(receipts[0].reply,undefined);assert.equal(receipts[1].reply?.text,'fixture');
});

test('local-only family work cannot become a server-side creative record',async()=>{
 const {JobService}=await import('../server/pipeline/service'),{MockAgent}=await import('../server/testing/mock-agent');
 const {defaults}=await import('../src/runtime/manifests');
 const {d,enroll}=await betaFixture(),family=await enroll('local-creations'),repo=d.repository(family.id);
 const session=(await requirePlay(d,family.id,family.cookies,fixtureKey,'check')).session;
 const service=new JobService(repo,new MockAgent(),{test:async()=>{}});
 const original=randomUUID();
 await repo.transaction(s=>s.revisions.push({id:original,familyId:family.id,projectId:original,parentId:null,game:{kind:'star-catcher-v1',target:3,seconds:15}}));
 await assert.rejects(service.registerBase(session,{gameId:'moon',localRevisionId:'local-seed',config:defaults('moon')}),/GUARDIAN_CONSENT_REQUIRED/);
 await assert.rejects(service.fork(session,original,'Workshop copy'),/GUARDIAN_CONSENT_REQUIRED/);
 assert.equal((await repo.snapshot()).revisions.length,1);
});

test('reviewed private uploads require the complete metadata-free pixel stream', async () => {
  const {checkReviewedPng} = await import('../src/family-beta/reviewed-png');
  const {twoColorPNG, animatedPNG} = await import('./generated-art-fixtures');
  const array = (bytes: Buffer) => Uint8Array.from(bytes).buffer;
  const clean = twoColorPNG();
  await checkReviewedPng(array(clean));
  const damaged = Buffer.from(clean);
  damaged[damaged.length - 1] ^= 1;
  for (const invalid of [animatedPNG(), twoColorPNG(6, 6), damaged, clean.subarray(0, 33), Buffer.concat([clean, Buffer.from('extra')])]) {
    await assert.rejects(checkReviewedPng(array(invalid)), /reviewed RGB/);
  }
});
