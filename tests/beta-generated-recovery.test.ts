import {test} from 'node:test';import assert from 'node:assert/strict';import {createHash,randomUUID} from 'node:crypto';
import {betaFixture,fixtureKey} from './beta-fixture';import {FamilyDirectory} from '../server/beta/store';import {signSession,verifySession} from '../server/pipeline/auth';import {cookieValue} from '../server/trusted-devices';import {internalCookies} from '../server/beta/access';import {betaNotice,participationNotice} from '../server/beta/model';import {BACKUP_DOMAINS} from '../src/storage/cloud-recovery';import {generatedRecoveryRequest,runGeneratedCloudRecovery} from '../server/beta/generated-recovery';import {compileArtFixture,pixelGame} from './generated-art-fixtures';import type {BackupScheduleLedger} from '../server/storage/recovery-scheduler';import type {ArtifactRef,PrivateArtifacts} from '../server/storage/artifacts';
async function setup(splitGamePayloads=false,environment='synthetic'){const fixture=await betaFixture(undefined,environment),f=await fixture.enroll('generated-copy'),data=new Map<string,Buffer>(),artifacts:PrivateArtifacts={put:async bytes=>{const sha256=createHash('sha256').update(bytes).digest('hex');data.set(sha256,Buffer.from(bytes));return {storage:'private-artifact-v1',sha256,bytes:bytes.length};},get:async ref=>{const bytes=data.get(ref.sha256);if(!bytes)throw Error('ORIGINAL_ASSET_MISSING');return bytes;}};const d=new FamilyDirectory(fixture.d.db,fixture.d.config,()=>artifacts,{splitGamePayloads},environment==='test'?{familyId:f.id,expiresAt:Date.now()+300000}:undefined),profile=randomUUID();d.config.continuity={enabled:true,notice:'generated-backups-v1',domains:[...BACKUP_DOMAINS],...{generatedRecovery:true,backupSchedule:{enabled:true,intervalMs:60000,maxPointsPerRun:1}}};await d.withFamily(f.id,async(tx,family)=>{family.profiles=[profile];family.storageDomains=[...BACKUP_DOMAINS];tx.set(d.path(f.id),family);tx.set(d.path(f.id)+'/continuity/authorization',{version:1,notice:d.config.continuity!.notice,participation:participationNotice,guardianNotice:betaNotice,renewedAt:family.guardian.participationRenewedAt??0,guardian:family.guardian.id,profiles:[profile],domains:[...BACKUP_DOMAINS]});});const session=verifySession(cookieValue(internalCookies(f.raw),'factory_session'),fixtureKey),cookies=f.cookies+'; __Host-factory_parent='+signSession({...session,role:'parent',expiresAt:Date.now()+600000},fixtureKey);const originals=new Map<string,{sources:Record<string,string|null>;completed:boolean}>(),ledger:BackupScheduleLedger={claim:async(key,make)=>{if(!originals.has(key))originals.set(key,{...await make(),completed:false});return structuredClone(originals.get(key)!);},complete:async key=>{originals.get(key)!.completed=true;}};const call=(path:string,body:object={},raw=cookies)=>generatedRecoveryRequest(d,f.id,raw,fixtureKey,path,{profile,...body},()=>ledger);const raw=pixelGame();raw.source+='\n/*'+ 'original'.repeat(2500)+'*/';const game=compileArtFixture(raw);await d.repository(f.id).transaction(state=>{state.revisions.push({id:'original-generated',familyId:f.id,projectId:'original-project',parentId:null,game});state.active['original-project']='original-generated';return true;});return {fixture,d,f,profile,cookies,session,data,game,call,ledger,artifacts};}
test('actual authorized server copy restores decoded originals after original artifact and revision metadata are lost',async()=>{const x=await setup(),copy=await x.call('capture',{requestId:randomUUID()}) as any;assert.ok(x.data.size);const preview=await x.call('preview',{pointId:copy.pointId}) as any;assert.equal(preview.versions,1);const before=await x.d.repository(x.f.id).snapshot(),without=structuredClone(before);without.revisions=[];without.active={};x.data.clear();await x.d.db.run(async tx=>{const root='factoryWorkspaces/beta-'+x.f.id+'/state/current';tx.set(root,{version:1,chunks:1});tx.set(root+'/chunks/0',{json:JSON.stringify(without)});});const result=await x.call('restore',{pointId:copy.pointId,checksum:preview.checksum,approved:true,attemptId:'11111111-1111-4111-8111-111111111111'}) as any;assert.equal(result.added,1);const restored=await x.d.repository(x.f.id).snapshot();assert.deepEqual(restored.revisions[0].game,x.game);assert.deepEqual(restored.ledgers,before.ledgers);assert.deepEqual(restored.jobs,before.jobs);assert.deepEqual(restored.devices,before.devices);assert.equal((await x.call('restore',{pointId:copy.pointId,checksum:preview.checksum,approved:true,attemptId:'11111111-1111-4111-8111-111111111111'}) as any).alreadyRestored,true);assert.equal((await x.d.db.run(tx=>tx.page('factoryBackupSchedules/beta-'+x.f.id+'/activeOperations','',10),true)).length,0);});
test('backend source gate, guardian, real profile and current all-domain grant are independent requirements',async()=>{const x=await setup();await assert.rejects(x.call('capture',{requestId:randomUUID()},x.f.cookies),/UNAUTHENTICATED/);await assert.rejects(generatedRecoveryRequest(x.d,x.f.id,x.cookies,fixtureKey,'list',{profile:'server-generated',after:''},()=>x.ledger),/DENIED/);(x.d.config.continuity as any).generatedRecovery=false;await assert.rejects(x.call('capture',{requestId:randomUUID()}),/DISABLED/);(x.d.config.continuity as any).generatedRecovery=true;await x.d.db.run(async tx=>{const path=x.d.path(x.f.id)+'/continuity/authorization',grant=await tx.get<any>(path);tx.set(path,{...grant,domains:grant.domains.filter((d:string)=>d!=='artwork')});});await assert.rejects(x.call('list',{after:''}),/DENIED/);});
test('missing source artifacts cannot produce a complete generated snapshot and automatic schedules are idempotent per period',async()=>{const x=await setup();assert.equal((await runGeneratedCloudRecovery(x.d,x.f.id,()=>x.ledger,1)).copied,true);assert.equal((await runGeneratedCloudRecovery(x.d,x.f.id,()=>x.ledger,2)).copied,false);x.data.clear();await assert.rejects(x.call('capture',{requestId:randomUUID()}),/ORIGINAL_ASSET_MISSING/);const copies=await x.call('list',{after:''}) as any;assert.equal(copies.copies.length,1,'failed capture does not publish a second point');});
test('lost committed restore response is reconciled from its atomic receipt without replay or an orphan erasure barrier',async()=>{
 const x=await setup(),copy=await x.call('capture',{requestId:randomUUID()}) as any,run=x.d.db.run.bind(x.d.db);let lost=false,restores=0;
 const inWorkspace=x.d.inWorkspace.bind(x.d);(x.d as any).inWorkspace=async(...args:Parameters<typeof inWorkspace>)=>{if(args[4])restores++;return inWorkspace(...args);};
 x.d.db.run=async(operation,readOnly)=>{let committedRestore=false;const result=await run(tx=>operation({...tx,create:(path,value)=>{if(path.startsWith(x.d.path(x.f.id)+'/generated-restores/'))committedRestore=true;tx.create(path,value);}}),readOnly);if(committedRestore&&!lost){lost=true;throw Error('SYNTHETIC_LOST_COMMIT_REPLY');}return result;};
 const body={pointId:copy.pointId,checksum:copy.checksum,approved:true,attemptId:randomUUID()},operations='factoryBackupSchedules/beta-'+x.f.id+'/activeOperations';
 await assert.rejects(x.call('restore',body),/SYNTHETIC_LOST_COMMIT_REPLY/);assert.equal((await x.d.db.run(tx=>tx.page(operations,'',10),true)).length,1);
 assert.equal((await x.call('restore',body) as any).alreadyRestored,true);assert.equal(restores,1,'receipt recovery must not invoke the mutating workspace callback again');
 assert.equal((await x.d.db.run(tx=>tx.page(operations,'',10),true)).length,0,'positive completion settles the original deterministic barrier');
});
for(const split of [false,true])test('verified recovery repairs only missing original bytes with retained metadata, encoding '+split,async()=>{
 const x=await setup(split),copy=await x.call('capture',{requestId:randomUUID()}) as any,before=await x.d.repository(x.f.id).snapshot();x.data.clear();
 await assert.rejects(x.d.repository(x.f.id).snapshot(),/ORIGINAL_ASSET_MISSING/);
 const body={pointId:copy.pointId,checksum:copy.checksum,approved:true,attemptId:randomUUID()},restored=await x.call('restore',body) as any;
 assert.equal(restored.added,0);assert.equal(restored.attemptId,body.attemptId);assert.deepEqual(await x.d.repository(x.f.id).snapshot(),before);assert.ok(x.data.size);
 x.data.clear();assert.equal((await x.call('restore',body) as any).alreadyRestored,true,'same attempt is a read-only retry');await assert.rejects(x.d.repository(x.f.id).snapshot(),/ORIGINAL_ASSET_MISSING/);
 const later=await x.call('restore',{...body,attemptId:randomUUID()}) as any;assert.equal(later.added,0);assert.deepEqual(await x.d.repository(x.f.id).snapshot(),before,'new reviewed attempt repairs a later loss without changing live state');
});
for(const failure of ['withdrawal','unknown-reply'] as const)test('artifact repair '+failure+' preserves exactly the unresolved erasure barrier',async()=>{
 const x=await setup(),copy=await x.call('capture',{requestId:randomUUID()}) as any,put=x.artifacts.put.bind(x.artifacts);let writes=0;
 x.artifacts.put=async(bytes,options)=>{const ref=await put(bytes,options);writes++;if(failure==='unknown-reply')throw Error('SYNTHETIC_UNKNOWN_ARTIFACT_REPLY');await x.d.db.run(async tx=>{const path=x.d.path(x.f.id)+'/continuity/authorization',grant=await tx.get<any>(path);tx.set(path,{...grant,revokedAt:Date.now()});});return ref;};
 await assert.rejects(x.call('restore',{pointId:copy.pointId,checksum:copy.checksum,approved:true,attemptId:randomUUID()}),failure==='withdrawal'?/BACKUP_SCHEDULE_DENIED/:/SYNTHETIC_UNKNOWN_ARTIFACT_REPLY/);
 assert.equal(writes,1);const pending=await x.d.db.run(tx=>tx.page('factoryBackupSchedules/beta-'+x.f.id+'/activeOperations','',10),true);
 assert.equal(pending.length,failure==='withdrawal'?0:1,'completed puts followed by revoked admission are settled; an unknown write is never presumed finished');
});

import {acknowledge,requirePlay} from '../server/beta/access';
import {acknowledgments,cookieHeader} from './beta-fixture';
import {defaultCapabilities} from '../server/beta/model';
import {submitParentPrivacyChoice,recordExternalGuardianVerification} from '../server/privacy/parent-consent';
import {ActionCoordinator} from '../server/actions/coordinator';
import {JobService} from '../server/pipeline/service';
import {resetSyntheticProject} from '../server/beta/test-reset';
import {fixtureRunEvidence} from '../server/actions/test-execution';
import {existsSync} from 'node:fs';
import {FixtureOnlyGate} from '../server/testing/fixture-gate';
import {hopper} from '../server/testing/generated-fixtures';

test('TEST admitted fixture jobs reserve, play, Keep, reset, recover and replay without disturbing accounting or unselected games',async()=>{
 const x=await setup(true,'test'),repo=x.d.repository(x.f.id),deadline=Date.now()+300000;
 x.d.config.testReset={familyId:x.f.id,subject:'synthetic-reset'};
 assert.deepEqual(x.d.config.providerEvidence,[]);
 await x.fixture.mutate('policy',x.f.id,{capabilities:{...defaultCapabilities(),generation:true},paused:false,generationPaused:false,monthlyCents:100});
 const choice=await submitParentPrivacyChoice(repo,{...x.session,role:'parent'},{noticeVersion:betaNotice,guardianAffirmed:true,providerAcknowledged:true,scopes:{generation:true,conversation:false,remoteSpeech:false}});
 await recordExternalGuardianVerification(repo,{familyId:x.f.id,choiceId:choice.choiceId,receipt:'synthetic-scope-proof',verifiedByOwner:true});
 const gate=new FixtureOnlyGate(process.env.CHROMIUM_PATH||['/usr/bin/chromium','/usr/bin/google-chrome'].find(existsSync)),privateSha='a'.repeat(40),repoId='42';
 const jobPolicy={providerMode:'fixture' as const,publicSourceSha:'f'.repeat(40),expiresAt:deadline,workerSha:privateSha};
 const service=new JobService(repo,{kind:'metered-api',testFixture:true,available:true,generate:async()=>{throw Error('EXPECTED_WORKER');}},{test:async()=>{throw Error('EXPECTED_WORKER');}},{allowMock:true,syntheticFixture:true,testExecution:jobPolicy,maxUnits:100,timeoutMs:900000,maxRetries:2,requireVerifiedParentPrivacy:true});
 const approval={enabled:true,approvalId:'TEST-fixture-only',model:'fixture',inputUsdPerMillion:1,outputUsdPerMillion:1,maxInputTokens:128,maxOutputTokens:128,priceReviewedOn:new Date().toISOString().slice(0,10)};
 const coordinator=new ActionCoordinator(repo,{dispatch:async()=>{}},approval,900000,true,false,undefined,undefined,jobPolicy);
 const build=(gameId:string,prompt:string,baseRevisionId:string|null)=>service.submit(x.session,{gameId,prompt,baseRevisionId,clientRequestId:randomUUID()});
 await assert.rejects(build('new','Please submit a real game',null),/INVALID_REQUEST/);
 let run=100;
 async function finish(baseRevisionId:string|null){
  const edit=baseRevisionId!==null,job=await build(edit?'generated-module':'new',edit?'Change Moon Hopper to four hops':'Build Moon Hopper',baseRevisionId);
  assert.equal((await repo.snapshot()).ledgers[x.f.id].reserved,100);
  await coordinator.enqueue(job.jobId);await coordinator.tick();
  const worker={runId:String(++run),repositoryId:repoId,sha:privateSha,stage:'generate' as const};
  const task=await coordinator.claim(job.jobId,0,'generate',worker) as any;
  if(edit)assert.equal(task.input.baseRevision.game.source,hopper.source);
  const game=edit?{...hopper,source:hopper.source.replace('s.hops>=3','s.hops>=4'),title:'Moon Hopper: Four Hops',instructions:hopper.instructions.replace('three times','four times')}:hopper;
  await coordinator.report(job.jobId,0,'generate',worker,{candidate:{format:'generated-source-v1',game},usageUnits:0});
  const tester={...worker,stage:'test' as const},candidate=await coordinator.claim(job.jobId,0,'test',tester) as any;
  const tested=await gate.test(candidate.game);
  await coordinator.report(job.jobId,0,'test',tester,{ok:true,game:tested});
  const state=await repo.snapshot(),proof=fixtureRunEvidence(state,x.session,job.jobId,repoId,privateSha);
  assert.equal(proof.runId,worker.runId);assert.equal(state.ledgers[x.f.id].reserved,0);
  assert.throws(()=>fixtureRunEvidence(state,x.session,job.jobId,'other',privateSha),/EVIDENCE_REQUIRED/);
  await service.keep(x.session,proof.revisionId);
  return proof.revisionId;
 }
 const original=await finish(null),edited=await finish(original);
 const before=await repo.snapshot(),projectId=before.revisions.find(r=>r.id===edited)!.projectId;
 const play=await acknowledge(x.d,x.f.id,acknowledgments,internalCookies(x.f.raw),fixtureKey);
 const raw=x.f.raw+'; '+cookieHeader([play])+'; __Host-factory_parent='+signSession({...x.session,role:'parent',expiresAt:deadline},fixtureKey);
 await requirePlay(x.d,x.f.id,raw,fixtureKey,'entry');
 const copy=await x.call('capture',{requestId:randomUUID()},raw) as any;
 const request={familyId:x.f.id,projectId,requestId:randomUUID(),expectedRevisions:[original,edited],profile:x.profile,pointId:copy.pointId,checksum:copy.checksum};
 const reset=(input:unknown=request,sub='synthetic-reset')=>resetSyntheticProject(x.d,sub,input,deadline);
 await assert.rejects(reset(request,'test-owner'),/FORBIDDEN/);
 await assert.rejects(reset({...request,familyId:randomUUID()}),/FORBIDDEN/);
 await assert.rejects(reset({...request,expectedRevisions:[original]}),/CONFLICT/);
 await assert.rejects(reset({...request,checksum:'0'.repeat(64)}),/CONFLICT/);
 const operations='factoryBackupSchedules/beta-'+x.f.id+'/activeOperations/fixture';
 await x.d.db.run(async tx=>tx.create(operations,{pending:true}));
 await assert.rejects(reset(),/BUSY/);await x.d.db.run(async tx=>tx.delete(operations));
 // Both a zero-cost outstanding call and an unrelated reserved amount block reset.
 await repo.transaction(s=>{s.ledgers[x.f.id].reserved+=12;});
 await assert.rejects(reset(),/BUSY/);await repo.transaction(s=>{s.ledgers[x.f.id].reserved-=12;});
 const month=new Date().toISOString().slice(0,7);
 await repo.transaction(s=>{s.coachReceipts=[{id:randomUUID(),familyId:x.f.id,subject:'fixture',month,reserved:0,at:Date.now(),state:'running',hash:'a'.repeat(64)}];});
 await assert.rejects(reset(),/BUSY/);
 await repo.transaction(s=>{s.coachReceipts![0].state='ready';s.ledgers[x.f.id].used+=123;});
 const settled=await repo.snapshot(),artifacts=[...x.data.keys()].sort();
 const usage=()=>x.d.db.run(tx=>tx.get(x.d.root+'/usage/'+month),true);
 const global=await usage(),removed=await reset();
 assert.equal(removed.removed,2);assert.deepEqual(await reset(),removed);
 const cleared=await repo.snapshot();assert.deepEqual(cleared.jobs,settled.jobs);assert.deepEqual(cleared.ledgers,settled.ledgers);
 assert.deepEqual(cleared.audit,settled.audit);assert.deepEqual(cleared.coachReceipts,settled.coachReceipts);
 assert.deepEqual(cleared.revisions,settled.revisions.filter(r=>r.projectId!==projectId));
 assert.equal(cleared.active[projectId],undefined);assert.deepEqual(await usage(),global);assert.deepEqual([...x.data.keys()].sort(),artifacts);
 await x.call('restore',{pointId:copy.pointId,checksum:copy.checksum,approved:true,attemptId:randomUUID()},raw);
 const restored=await repo.snapshot();assert.deepEqual(restored,settled);
 assert.deepEqual(await reset(),removed,'replaying a committed reset cannot delete restored games');
 for(const id of [original,edited]){
  const game=restored.revisions.find(r=>r.id===id)!.game;
  assert.ok(game?.kind==='generated-module-v1'&&game.compiled);
  const replay=await gate.test(game);
  assert.equal(replay.compiled!.codeHash,game.compiled.codeHash);assert.ok(replay.compiled!.tests.replay);
 }
});
