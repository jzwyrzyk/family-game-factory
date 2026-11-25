import test from 'node:test';
import assert from 'node:assert/strict';
import {acknowledge,internalCookies,redeem,requirePlay,logout} from '../server/beta/access';
import {verifiedParentScope} from '../server/privacy/parent-consent';
import {assertRunJob} from '../server/beta/worker';
import {defaultCapabilities,playIdle,playLifetime} from '../server/beta/model';
import {acknowledgments,betaFixture,cookieHeader,fixtureKey,redemption} from './beta-fixture';

test('one-time invitation, separate contact verification, play consent and device authority',async()=>{
 const {invite,mutate,d,admin}=await betaFixture(),a=await invite('adult-a'),b=await invite('adult-b');
 await assert.rejects(redeem(d,b.id,redemption(a.invitation),fixtureKey),/INVALID_INVITATION/);
 await assert.rejects(redeem(d,a.id,redemption(a.invitation,'recovery'),fixtureKey),/INVALID_INVITATION/);
 await assert.rejects(redeem(d,a.id,redemption(a.invitation),fixtureKey,Date.now()+86400001),/INVALID_INVITATION/);
 const [x,y]=await Promise.allSettled([1,2].map(()=>redeem(d,a.id,redemption(a.invitation),fixtureKey)));
 assert.equal([x,y].filter(v=>v.status==='fulfilled').length,1);
 const enrolled=(x.status==='fulfilled'?x:y as typeof x&{status:'fulfilled'}).value;
 const raw=cookieHeader(enrolled.cookies),internal=internalCookies(raw);
 await assert.rejects(acknowledge(d,a.id,acknowledgments,internal,fixtureKey),/PAUSED/);
 await assert.rejects(mutate('verify',a.id,{pairingCode:'unrelated-pairing',receipt:'external-synthetic-A'}),/VERIFICATION/);
 await mutate('verify',a.id,{pairingCode:enrolled.pairingCode,receipt:'external-synthetic-A'});
 await assert.rejects(acknowledge(d,a.id,{...acknowledgments,adult:false},internal,fixtureKey),/ACKNOWLEDGMENT/);
 await assert.rejects(acknowledge(d,a.id,{...acknowledgments,passphrase:'wrong parent secret'},internal,fixtureKey),/PARENT_ACCESS/);
 const cookie=await acknowledge(d,a.id,acknowledgments,internal,fixtureKey);
 const play=raw+'; '+cookieHeader([cookie]);await requirePlay(d,a.id,play,fixtureKey,'entry');
 await assert.rejects(requirePlay(d,a.id,play,fixtureKey,'entry'),/PLAY_REQUIRED/);
 assert.equal((await requirePlay(d,a.id,play,fixtureKey,'check')).familyId,a.id);
 await assert.rejects(requirePlay(d,b.id,play,fixtureKey,'check'));
 await assert.rejects(requirePlay(d,a.id,play,fixtureKey,'check',Date.now()+playIdle+1));
 await assert.rejects(requirePlay(d,a.id,play,fixtureKey,'check',Date.now()+playLifetime+1));
 assert.equal(verifiedParentScope(await d.repository(a.id).snapshot(),a.id,'generation'),false);
 await assert.rejects(admin.view('ordinary-parent'),/ADMIN_REQUIRED/);
 const metadata=JSON.stringify(await admin.view('test-owner',a.id));for(const sensitive of [a.invitation,enrolled.pairingCode,'external-synthetic-A','secretHash'])assert.ok(!metadata.includes(sensitive));
 await mutate('revoke-invite',b.id);await assert.rejects(redeem(d,b.id,redemption(b.invitation),fixtureKey));
 await mutate('suspend',a.id);await assert.rejects(requirePlay(d,a.id,play,fixtureKey,'check'));
});
test('concurrent family reservations share one global ceiling, settlement survives stop',async()=>{
 const {d,enroll,mutate}=await betaFixture(),a=await enroll('family-a'),b=await enroll('family-b');
 for(const f of [a,b])await mutate('policy',f.id,{capabilities:defaultCapabilities(),paused:false,generationPaused:false,monthlyCents:100});
 const reserve=(id:string,amount:number)=>d.repository(id).transaction(s=>{s.ledgers[id].reserved+=amount;return true;});
 const results=await Promise.allSettled([reserve(a.id,650000),reserve(b.id,650000)]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
 const owner=results[0].status==='fulfilled'?a:b,other=owner===a?b:a;
 assert.equal((await d.repository(other.id).snapshot()).ledgers[other.id].reserved,0);
 await mutate('platform','platform',{invitations:false,participation:true,stop:true,monthlyCents:100});
 await assert.rejects(reserve(other.id,1),/SPENDING_CUTOFF/);
 await d.repository(owner.id).transaction(s=>{s.ledgers[owner.id].reserved=0;s.ledgers[owner.id].used=50000;});
 const month=new Date().toISOString().slice(0,7);
 assert.deepEqual(await d.db.run(tx=>tx.get(d.root+'/usage/'+month)),{used:50000,reserved:0});
});
test('recovery invalidates prior devices, requires a new pairing and preserves saved revisions',async()=>{
 const {d,enroll,mutate}=await betaFixture(),f=await enroll('recovery-family');
 await d.repository(f.id).transaction(s=>{s.revisions.push({id:'saved',familyId:f.id,projectId:'project',parentId:null,game:null});});
 const recovered=await mutate('recover',f.id);
 await assert.rejects(requirePlay(d,f.id,f.cookies,fixtureKey,'check'));
 await assert.rejects(redeem(d,f.id,redemption(String(recovered.invitation)),fixtureKey));
 await redeem(d,f.id,redemption(String(recovered.invitation),'recovery'),fixtureKey);
 assert.equal((await d.repository(f.id).snapshot()).revisions[0].id,'saved');
 const next=await enroll('logout-family');await logout(d,next.id,next.cookies,fixtureKey,true);
 await assert.rejects(requirePlay(d,next.id,next.cookies,fixtureKey,'check'));
});
test('callback identity is bound to the private workflow run for this job',async()=>{
 const job='11000000-0000-4000-8000-000000000001',other='22000000-0000-4000-8000-000000000002';
 const identity={runId:'123',repositoryId:'456',sha:'a'.repeat(40),stage:'generate' as const};
 const fetcher=async()=>Response.json({id:123,repository:{id:456},head_sha:identity.sha,run_attempt:1,event:'workflow_dispatch',display_title:'Private factory job '+job+' / beta-test / 0'});
 await assertRunJob(identity,job,'family-game-factory-lab/family-game-factory-worker',async()=>'fixture','beta-test',fetcher);
 await assert.rejects(assertRunJob(identity,other,'family-game-factory-lab/family-game-factory-worker',async()=>'fixture','beta-test',fetcher));
});

test('family allowances are entered in whole cents with safe micro-dollar accounting',async()=>{
 const {enroll,mutate}=await betaFixture(),f=await enroll('budget-policy');
 const policy={capabilities:defaultCapabilities(),paused:true,generationPaused:true,monthlyCents:10000};
 await mutate('policy',f.id,policy);
 for(const value of [-1,0.5,Number.MAX_SAFE_INTEGER])await assert.rejects(mutate('policy',f.id,{...policy,monthlyCents:value}));
});
