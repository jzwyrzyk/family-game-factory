import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair,SignJWT} from 'jose';
import {ActionCoordinator} from '../server/actions/coordinator';
import {GitHubOIDCVerifier,type WorkerIdentity,type WorkerStage} from '../server/actions/identity';
import {JobService,validateBuildRequest} from '../server/pipeline/service';
import {MemoryRepository} from '../server/pipeline/repository';
import type {AgentAdapter,AgentInput} from '../server/pipeline/types';
import type {AgentApproval} from '../server/agent/openai';
import {isGeneratedGame,type GeneratedGame} from '../server/agent/generated';
import {bindQualityReview,type GameQualityEvidence,type GameQualityReview} from '../server/quality/game-quality';
import {stickerLaunchFixture} from '../server/testing/working-game-fixtures';
import {hopper} from '../server/testing/generated-fixtures';
import {syntheticQualityEvidence,syntheticQualityReview,syntheticReviewAnswer} from '../server/testing/presentation-quality-fixtures';
import {productionFixture,compiledPipelineFixture,testedPipelineFixture} from './quality-pipeline-fixtures';

// All provider replies, captures, technical attestations and reviews in this file
// are explicit synthetic fixtures. Assertions establish acceptance policy only.
const idea='Make a pixel game where I attach stickers to a rocket and launch it.';
const actor={subject:'quality-unit-owner',familyId:'quality-pipeline-family',role:'parent' as const,expiresAt:Date.now()+600000};
const approval:AgentApproval={enabled:true,approvalId:'synthetic-quality-policy',model:'synthetic-model',inputUsdPerMillion:1,outputUsdPerMillion:1,maxInputTokens:64000,maxOutputTokens:4000,priceReviewedOn:new Date().toISOString().slice(0,10)};
const identity=(stage:WorkerStage,runId='quality-run-0'):WorkerIdentity=>({stage,runId,repositoryId:'42',sha:'a'.repeat(40)});
const external:AgentAdapter={kind:'metered-api',available:true,generate:async()=>{throw Error('NO_REAL_PROVIDER_IN_UNIT_TEST');}};
const sourceGame=()=>productionFixture(stickerLaunchFixture,idea);
function service(repo:MemoryRepository,agent:AgentAdapter=external,gate:any={test:async()=>{throw Error('NO_REAL_SANDBOX_IN_UNIT_TEST');}}){
 return new JobService(repo,agent,gate,{allowMock:false,maxUnits:1000,timeoutMs:30000,maxRetries:2});
}
async function setup(){
 const repo=new MemoryRepository(),svc=service(repo);await svc.setAllowance(actor,10000,true);
 const ack=await svc.submit(actor,{gameId:'new',baseRevisionId:null,prompt:idea,clientRequestId:'quality-first'});
 const dispatches:Array<{id:string;attempt:number}>=[],coordinator=new ActionCoordinator(repo,{dispatch:async(id,attempt)=>{dispatches.push({id,attempt});}},approval);
 await coordinator.enqueue(ack.jobId);return {repo,svc,coordinator,id:ack.jobId,dispatches};
}
async function generated(h:Awaited<ReturnType<typeof setup>>,game=sourceGame(),attempt=0){
 const gen=identity('generate','quality-run-'+attempt);await h.coordinator.claim(h.id,attempt,'generate',gen);
 const report={candidate:{format:'generated-source-v1',game},usageUnits:11};await h.coordinator.report(h.id,attempt,'generate',gen,report);
 return {game,gen,report};
}
async function tested(h:Awaited<ReturnType<typeof setup>>,game:GeneratedGame,attempt=0){
 const testIdentity=identity('test','quality-run-'+attempt),claim=await h.coordinator.claim(h.id,attempt,'test',testIdentity);
 assert.ok('captureQuality'in claim&&claim.captureQuality===true);
 const compiled=compiledPipelineFixture(game),evidence=syntheticQualityEvidence(compiled);
 const report={ok:true,game:compiled,qualityEvidence:evidence};
 assert.deepEqual(await h.coordinator.report(h.id,attempt,'test',testIdentity,report),{accepted:true,reviewRequired:true});
 return {compiled,evidence,testIdentity,report};
}
function rejectedReview(game:GeneratedGame,evidence:GameQualityEvidence,axis:'visual'|'gameplay',finding:'VISUAL_STYLE_MISMATCH'|'GAMEPLAY_NO_CONSEQUENCE'){
 const answer=syntheticReviewAnswer();return bindQualityReview(game,evidence,{...answer,axes:{...answer.axes,[axis]:'fail'},findings:[finding]});
}

test('quality policy is server-owned: new real v2 jobs require bound plan, art style and ordinary playthrough',async()=>{
 const h=await setup(),job=(await h.repo.snapshot()).jobs[0];assert.equal(job.qualityRequired,'game-quality-v1');
 assert.throws(()=>validateBuildRequest({gameId:'new',baseRevisionId:null,prompt:idea,clientRequestId:'bypass',qualityRequired:false}),/INVALID_REQUEST/);
 assert.throws(()=>validateBuildRequest({gameId:'new',baseRevisionId:null,prompt:idea,clientRequestId:'forged',qualityEvidence:{pass:true}}),/INVALID_REQUEST/);
 const gen=identity('generate');await h.coordinator.claim(h.id,0,'generate',gen);
 for(const game of [stickerLaunchFixture,{...sourceGame(),assets:undefined},{...sourceGame(),playthrough:undefined},{...sourceGame(),productionPlan:{...sourceGame().productionPlan!,requestHash:'f'.repeat(64)}}]){
  await assert.rejects(h.coordinator.report(h.id,0,'generate',gen,{candidate:{format:'generated-source-v1',game},usageUnits:11}),/PRODUCTION_PLAN/);
 }
 await assert.rejects(h.coordinator.report(h.id,0,'generate',gen,{candidate:{format:'generated-source-v1',game:hopper},usageUnits:11}),/CURRENT_QUALITY_REQUIRES_V2/);
 const state=await h.repo.snapshot();assert.equal(state.revisions.length,0);assert.equal(state.jobs[0].usedUnits,0);assert.equal(state.jobs[0].status,'building');
});

test('older queued metered jobs without a quality flag cannot bypass current claim or report policy',async()=>{
 const h=await setup(),withoutFlag=()=>h.repo.transaction(s=>{delete s.jobs[0].qualityRequired;return true;});
 await withoutFlag();await h.coordinator.claim(h.id,0,'generate',identity('generate'));
 assert.equal((await h.repo.snapshot()).jobs[0].qualityRequired,'game-quality-v1');
 await withoutFlag();await assert.rejects(h.coordinator.report(h.id,0,'generate',identity('generate'),{candidate:{format:'generated-source-v1',game:stickerLaunchFixture},usageUnits:11}),/PRODUCTION_PLAN/);
 const game=sourceGame();await h.coordinator.report(h.id,0,'generate',identity('generate'),{candidate:{format:'generated-source-v1',game},usageUnits:11});
 await withoutFlag();const claim=await h.coordinator.claim(h.id,0,'test',identity('test'));assert.ok('captureQuality'in claim&&claim.captureQuality===true);
 const compiled=compiledPipelineFixture(game);await withoutFlag();await assert.rejects(h.coordinator.report(h.id,0,'test',identity('test'),{ok:true,game:compiled}),/QUALITY_EVIDENCE/);
 await h.coordinator.report(h.id,0,'test',identity('test'),{ok:true,game:compiled,qualityEvidence:syntheticQualityEvidence(compiled)});
 const state=await h.repo.snapshot();assert.equal(state.jobs[0].qualityRequired,'game-quality-v1');assert.equal(state.jobs[0].phase,'reviewing');assert.equal(state.revisions.length,0);
});

test('local recovery of an older queued metered job restores quality policy before compiling it',async()=>{
 const repo=new MemoryRepository(),game=sourceGame();let reviewed=false;
 const adapter:AgentAdapter={kind:'metered-api',available:true,generate:async()=>({candidate:{format:'generated-source-v1',game},usageUnits:11}),async review(_input,compiled,evidence){reviewed=true;return {review:syntheticQualityReview(compiled,evidence),usageUnits:7};}};
 const svc=service(repo,adapter,{test:async(_game:GeneratedGame,context:any)=>{assert.equal(context.captureQuality,true);return compiledPipelineFixture(game);}});await svc.setAllowance(actor,10000,true);
 const ack=await svc.submit(actor,{gameId:'new',baseRevisionId:null,prompt:idea,clientRequestId:'old-local-job'});await repo.transaction(s=>{delete s.jobs[0].qualityRequired;return true;});
 await svc.run(ack.jobId);const state=await repo.snapshot();assert.equal(state.jobs[0].qualityRequired,'game-quality-v1');assert.equal(state.jobs[0].status,'failed');assert.match(state.jobs[0].errorCode||'',/QUALITY_EVIDENCE/);assert.equal(reviewed,false);assert.equal(state.revisions.length,0);
});

test('compile success waits for bound captured evidence and a separate all-axis review before Ready',async()=>{
 const h=await setup(),g=await generated(h),testIdentity=identity('test');await h.coordinator.claim(h.id,0,'test',testIdentity);
 const compiled=compiledPipelineFixture(g.game),evidence=syntheticQualityEvidence(compiled);
 await assert.rejects(h.coordinator.report(h.id,0,'test',testIdentity,{ok:true,game:compiled}),/QUALITY_EVIDENCE/);
 await assert.rejects(h.coordinator.report(h.id,0,'test',testIdentity,{ok:true,game:compiled,qualityEvidence:{...evidence,captures:[]}}),/QUALITY_EVIDENCE/);
 await h.coordinator.report(h.id,0,'test',testIdentity,{ok:true,game:compiled,qualityEvidence:evidence});
 const waiting=await h.svc.get(actor,h.id);assert.equal(waiting.status,'testing');assert.equal(waiting.phase,'reviewing');assert.equal((await h.repo.snapshot()).revisions.length,0);
 const reviewIdentity=identity('review'),claim=await h.coordinator.claim(h.id,0,'review',reviewIdentity);
 assert.ok('qualityEvidence'in claim);assert.deepEqual(claim.qualityEvidence,evidence);
 const review=syntheticQualityReview(compiled,evidence);
 await assert.rejects(h.coordinator.report(h.id,0,'review',reviewIdentity,{review:{...review,evidenceHash:'0'.repeat(64)},usageUnits:7}),/QUALITY_REVIEW_BINDING/);
 await assert.rejects(h.coordinator.report(h.id,0,'review',reviewIdentity,{review:{...review,artifactHash:'0'.repeat(64)},usageUnits:7}),/QUALITY_REVIEW_BINDING/);
 const fail=rejectedReview(compiled,evidence,'gameplay','GAMEPLAY_NO_CONSEQUENCE');
 await assert.rejects(h.coordinator.report(h.id,0,'review',reviewIdentity,{review:{...fail,verdict:'pass'},usageUnits:7}),/QUALITY_REVIEW_BINDING/);
 assert.equal((await h.repo.snapshot()).revisions.length,0);
 await h.coordinator.report(h.id,0,'review',reviewIdentity,{review,usageUnits:7});
 const state=await h.repo.snapshot();assert.equal(state.jobs[0].status,'ready');assert.equal(state.revisions.length,1);assert.equal(state.active[state.revisions[0].projectId],undefined,'review never auto-Keeps');
 assert.deepEqual((state.revisions[0].game as GeneratedGame).compiled?.quality,review);assert.equal(state.jobs[0].execution?.qualityEvidence,undefined,'raw screenshots are not retained after acceptance');assert.equal((state.revisions[0].game as any).qualityEvidence,undefined);
});

test('all three stages account once; duplicate reports are idempotent and conflicting reports fail',async()=>{
 const h=await setup();await h.coordinator.tick();assert.deepEqual(h.dispatches,[{id:h.id,attempt:0}]);
 const g=await generated(h);await h.coordinator.report(h.id,0,'generate',g.gen,g.report);
 await assert.rejects(h.coordinator.report(h.id,0,'generate',g.gen,{...g.report,usageUnits:12}),/WORKER_REPORT_CONFLICT/);
 const t=await tested(h,g.game);await h.coordinator.report(h.id,0,'test',t.testIdentity,t.report);
 const reviewIdentity=identity('review'),claim=await h.coordinator.claim(h.id,0,'review',reviewIdentity);
 assert.ok('input'in claim&&claim.input);assert.equal(claim.input.budget.maxUnits,989,'review receives remaining reservation');
 const report={review:syntheticQualityReview(t.compiled,t.evidence),usageUnits:7};await h.coordinator.report(h.id,0,'review',reviewIdentity,report);await h.coordinator.report(h.id,0,'review',reviewIdentity,report);
 const state=await h.repo.snapshot();assert.equal(state.jobs[0].usedUnits,18);assert.equal(state.ledgers[actor.familyId].used,18);assert.equal(state.ledgers[actor.familyId].reserved,0);assert.equal(state.revisions.length,1);
 await assert.rejects(h.coordinator.report(h.id,0,'review',reviewIdentity,{...report,usageUnits:8}),/WORKER_REPORT_CONFLICT/);
});

test('an unobserved axis and an over-budget review cannot be accepted as a passing game',async()=>{
 const h=await setup(),g=await generated(h),t=await tested(h,g.game);await h.coordinator.claim(h.id,0,'review',identity('review'));
 await assert.rejects(h.coordinator.report(h.id,0,'review',identity('review'),{review:syntheticQualityReview(t.compiled,t.evidence),usageUnits:990}),/BUDGET_EXCEEDED/);
 assert.equal((await h.repo.snapshot()).jobs[0].usedUnits,11);
 const answer=syntheticReviewAnswer(),review=bindQualityReview(t.compiled,t.evidence,{...answer,axes:{...answer.axes,gameplay:'not-tested'}});
 assert.equal(review.verdict,'unverified');await h.coordinator.report(h.id,0,'review',identity('review'),{review,usageUnits:7});
 const state=await h.repo.snapshot();assert.equal(state.jobs[0].phase,'repairing');assert.equal(state.jobs[0].execution?.repairCategory,'quality-unverified');assert.equal(state.revisions.length,0);assert.match(state.jobs[0].execution?.diagnostics||'',/GAME_QUALITY_UNVERIFIED/);
});

test('style and shallow-play rejection reuse the bounded repair loop with exact failed screenshots',async()=>{
 const h=await setup(),g=await generated(h),t=await tested(h,g.game);await h.coordinator.claim(h.id,0,'review',identity('review'));
 await h.coordinator.report(h.id,0,'review',identity('review'),{review:rejectedReview(t.compiled,t.evidence,'visual','VISUAL_STYLE_MISMATCH'),usageUnits:7});
 let state=await h.repo.snapshot();assert.equal(state.jobs[0].phase,'repairing');assert.equal(state.jobs[0].execution?.attempt,1);assert.equal(state.revisions.length,0);
 const next=await h.coordinator.claim(h.id,1,'generate',identity('generate','quality-run-1'));assert.ok('input'in next&&next.input);assert.equal(next.input.childIntent,idea);assert.deepEqual(next.qualityEvidence,t.evidence);assert.equal((next.previous as GeneratedGame).source,g.game.source);assert.match(next.diagnostics||'',/VISUAL_STYLE_MISMATCH/);
 const repaired={...g.game,source:g.game.source+'\n// changed after synthetic visual rejection'};
 await h.coordinator.report(h.id,1,'generate',identity('generate','quality-run-1'),{candidate:{format:'generated-source-v1',game:repaired},usageUnits:11});
 assert.equal((await h.repo.snapshot()).jobs[0].execution?.qualityEvidence,undefined,'old screenshots discarded on new candidate');
 const second=await tested(h,repaired,1);await h.coordinator.claim(h.id,1,'review',identity('review','quality-run-1'));
 await h.coordinator.report(h.id,1,'review',identity('review','quality-run-1'),{review:rejectedReview(second.compiled,second.evidence,'gameplay','GAMEPLAY_NO_CONSEQUENCE'),usageUnits:7});
 const last=await h.coordinator.claim(h.id,2,'generate',identity('generate','quality-run-2'));assert.ok('diagnostics'in last);assert.match(last.diagnostics||'',/GAMEPLAY_NO_CONSEQUENCE/);assert.deepEqual(last.qualityEvidence,second.evidence);
 await h.coordinator.report(h.id,2,'generate',identity('generate','quality-run-2'),{candidate:{format:'generated-source-v1',game:repaired},usageUnits:11});
 const third=await tested(h,repaired,2);await h.coordinator.claim(h.id,2,'review',identity('review','quality-run-2'));
 await h.coordinator.report(h.id,2,'review',identity('review','quality-run-2'),{review:rejectedReview(third.compiled,third.evidence,'gameplay','GAMEPLAY_NO_CONSEQUENCE'),usageUnits:7});
 state=await h.repo.snapshot();assert.equal(state.jobs[0].status,'failed');assert.equal(state.jobs[0].attempts,3);assert.equal(state.jobs[0].errorCode,'REPAIR_EXHAUSTED_QUALITY');assert.equal(state.revisions.length,0);assert.equal(state.jobs[0].execution?.qualityEvidence,undefined);assert.equal(state.audit.filter(e=>e.code==='AUTOMATIC_REPAIR').length,2);
 await assert.rejects(h.coordinator.claim(h.id,3,'generate',identity('generate','quality-run-3')),/WORKER_CLAIM_REJECTED/);
});

test('stale artifacts, stale evidence, wrong runs and cross-stage identities cannot approve a candidate',async()=>{
 const h=await setup();await assert.rejects(h.coordinator.claim(h.id,0,'review',identity('review')),/WORKER_CLAIM_REJECTED/);
 const g=await generated(h);await assert.rejects(h.coordinator.claim(h.id,0,'test',identity('generate')),/WORKER_CLAIM_REJECTED/);await assert.rejects(h.coordinator.claim(h.id,0,'test',identity('test','other-run')),/WORKER_CLAIM_REJECTED/);
 await h.coordinator.claim(h.id,0,'test',identity('test'));
 const compiled=compiledPipelineFixture(g.game),evidence=syntheticQualityEvidence(compiled),changed=compiledPipelineFixture({...g.game,source:g.game.source+'\n// different artifact'});
 await assert.rejects(h.coordinator.report(h.id,0,'test',identity('test'),{ok:true,game:changed,qualityEvidence:syntheticQualityEvidence(changed)}),/ATTESTATION_REQUIRED/);
 await assert.rejects(h.coordinator.report(h.id,0,'test',identity('test'),{ok:true,game:compiled,qualityEvidence:syntheticQualityEvidence(changed)}),/QUALITY_EVIDENCE_BINDING/);
 await assert.rejects(h.coordinator.report(h.id,0,'test',identity('review'),{ok:true,game:compiled,qualityEvidence:evidence}),/WORKER_REPORT_REJECTED/);
 await h.coordinator.report(h.id,0,'test',identity('test'),{ok:true,game:compiled,qualityEvidence:evidence});
 await assert.rejects(h.coordinator.claim(h.id,0,'review',identity('test')),/WORKER_CLAIM_REJECTED/);
 await h.coordinator.claim(h.id,0,'review',identity('review'));
 await assert.rejects(h.coordinator.report(h.id,0,'review',identity('review','other-run'),{review:syntheticQualityReview(compiled,evidence),usageUnits:7}),/WORKER_REPORT_REJECTED/);
 await assert.rejects(h.coordinator.report(h.id,1,'review',identity('review'),{review:syntheticQualityReview(compiled,evidence),usageUnits:7}),/WORKER_REPORT_REJECTED/);
 assert.equal((await h.repo.snapshot()).revisions.length,0);
});

test('OIDC quality reviewer requires exact approved private workflow, repository and environment',async()=>{
 const {publicKey,privateKey}=await generateKeyPair('RS256'),policy={audience:'https://gateway.example',repository:'family-game-factory-lab/worker',repositoryId:'42',workflow:'factory-private.yml',approvedSha:'a'.repeat(40),privateWorker:true};
 const verifier=new GitHubOIDCVerifier(policy,async()=>publicKey),claims={repository:policy.repository,repository_id:'42',repository_owner:'family-game-factory-lab',repository_owner_id:'357047835',repository_visibility:'private',ref_type:'branch',ref:'refs/heads/main',sha:policy.approvedSha,workflow_sha:policy.approvedSha,workflow_ref:policy.repository+'/.github/workflows/'+policy.workflow+'@refs/heads/main',event_name:'workflow_dispatch',run_attempt:'1',run_id:'991',environment:'factory-quality'};
 const token=(patch={})=>new SignJWT({...claims,...patch}).setProtectedHeader({alg:'RS256'}).setIssuer('https://token.actions.githubusercontent.com').setAudience(policy.audience).setIssuedAt().setExpirationTime('5m').sign(privateKey);
 assert.equal((await verifier.verify(await token())).stage,'review');
 for(const patch of [{environment:'anything-else'},{repository:'outsider/fork'},{repository_id:'43'},{repository_visibility:'public'},{workflow_sha:'b'.repeat(40)},{sha:'b'.repeat(40)},{ref:'refs/heads/unreviewed'},{run_attempt:'2'}])await assert.rejects(verifier.verify(await token(patch)),/WORKER_FORBIDDEN/);
 assert.equal((await verifier.verify(await token({environment:'factory-sandbox'}))).stage,'test','a sandbox identity cannot become a reviewer identity');
});

test('cancelling during review retains kept version, clears raw evidence and rejects late approval',async()=>{
 const h=await setup();await h.repo.transaction(s=>{s.revisions.push({id:'kept',familyId:actor.familyId,parentId:null,projectId:'favorite',game:compiledPipelineFixture(stickerLaunchFixture)});s.active.favorite='kept';return true;});
 const g=await generated(h),t=await tested(h,g.game);await h.coordinator.claim(h.id,0,'review',identity('review'));
 await h.svc.cancel(actor,h.id);await assert.rejects(h.coordinator.report(h.id,0,'review',identity('review'),{review:syntheticQualityReview(t.compiled,t.evidence),usageUnits:7}),/WORKER_REPORT_REJECTED/);
 const state=await h.repo.snapshot();assert.equal(state.jobs[0].status,'cancelled');assert.equal(state.revisions.length,1);assert.equal(state.active.favorite,'kept');assert.equal(state.jobs[0].execution?.candidate,undefined);assert.equal(state.jobs[0].execution?.qualityEvidence,undefined);assert.equal(state.ledgers[actor.familyId].reserved,0);assert.equal(state.ledgers[actor.familyId].used,1000,'uncertain cancelled work keeps the existing conservative reservation policy');
});

test('restart recovery clears interrupted candidates and screenshots while retaining kept and queued work',async()=>{
 const h=await setup(),kept={id:'kept-before-restart',familyId:actor.familyId,parentId:null,projectId:'favorite',game:compiledPipelineFixture(stickerLaunchFixture)};
 await h.repo.transaction(s=>{s.revisions.push(kept);s.active.favorite=kept.id;return true;});
 const g=await generated(h),t=await tested(h,g.game);await h.coordinator.claim(h.id,0,'review',identity('review'));
 const queued=await h.svc.submit(actor,{gameId:'new',baseRevisionId:null,prompt:idea,clientRequestId:'queued-after-restart'});
 const restarted=service(h.repo);assert.deepEqual(await restarted.recover(),[queued.jobId]);
 const state=await h.repo.snapshot(),interrupted=state.jobs.find(j=>j.id===h.id)!;assert.equal(interrupted.status,'failed');assert.equal(interrupted.errorCode,'WORKER_RESTARTED');assert.equal(interrupted.execution?.candidate,undefined);assert.equal(interrupted.execution?.qualityEvidence,undefined);assert.deepEqual(state.revisions,[kept]);assert.equal(state.active.favorite,kept.id);assert.equal(state.jobs.find(j=>j.id===queued.jobId)?.status,'queued');assert.equal(state.ledgers[actor.familyId].used,1000);assert.equal(state.ledgers[actor.familyId].reserved,1000);
 await assert.rejects(h.coordinator.report(h.id,0,'review',identity('review'),{review:syntheticQualityReview(t.compiled,t.evidence),usageUnits:7}),/WORKER_REPORT_REJECTED/);
});

test('owner spending cutoff also blocks queued quality review and removes its retained screenshots',async()=>{
 const h=await setup(),g=await generated(h);await tested(h,g.game);await h.svc.setAllowance(actor,10000,false);
 await assert.rejects(h.coordinator.claim(h.id,0,'review',identity('review')),/OWNER_APPROVAL_REQUIRED/);
 await h.coordinator.tick();const state=await h.repo.snapshot();assert.equal(state.jobs[0].status,'failed');assert.equal(state.jobs[0].errorCode,'OWNER_APPROVAL_REQUIRED');assert.equal(state.jobs[0].execution?.qualityEvidence,undefined);assert.equal(state.revisions.length,0);
});

test('saved v1 repairs retain their verified legacy path while new v1 downgrades are rejected',async()=>{
 const repo=new MemoryRepository(),svc=service(repo);await svc.setAllowance(actor,10000,true);
 await repo.transaction(s=>{s.revisions.push({id:'legacy-kept',familyId:actor.familyId,parentId:null,projectId:'legacy-project',game:compiledPipelineFixture(hopper)});s.active['legacy-project']='legacy-kept';return true;});
 const job=await svc.submit(actor,{gameId:'generated-module',baseRevisionId:'legacy-kept',prompt:'Make the existing hopping game a little faster.',clientRequestId:'legacy-repair'}),coordinator=new ActionCoordinator(repo,{dispatch:async()=>{}},approval);
 assert.equal((await repo.snapshot()).jobs[0].qualityRequired,undefined);await coordinator.enqueue(job.jobId);await coordinator.claim(job.jobId,0,'generate',identity('generate'));
 await coordinator.report(job.jobId,0,'generate',identity('generate'),{candidate:{format:'generated-source-v1',game:hopper},usageUnits:11});const task=await coordinator.claim(job.jobId,0,'test',identity('test'));assert.ok('captureQuality'in task&&task.captureQuality===false);
 await coordinator.report(job.jobId,0,'test',identity('test'),{ok:true,game:compiledPipelineFixture(hopper)});const state=await repo.snapshot();assert.equal(state.jobs[0].status,'ready');assert.equal(state.revisions.length,2);assert.equal(state.active['legacy-project'],'legacy-kept');assert.equal(state.revisions[1].parentId,'legacy-kept');
 const fresh=await setup();await fresh.coordinator.claim(fresh.id,0,'generate',identity('generate'));await assert.rejects(fresh.coordinator.report(fresh.id,0,'generate',identity('generate'),{candidate:{format:'generated-source-v1',game:hopper},usageUnits:11}),/CURRENT_QUALITY_REQUIRES_V2/);
});

test('an existing v2 revision still requires quality review and binds its new plan to that exact base',async()=>{
 const repo=new MemoryRepository(),svc=service(repo);await svc.setAllowance(actor,10000,true);
 await repo.transaction(s=>{s.revisions.push({id:'saved-v2',familyId:actor.familyId,parentId:null,projectId:'rocket-project',game:compiledPipelineFixture(sourceGame())});s.active['rocket-project']='saved-v2';return true;});
 const prompt='Make the rocket launch faster.',ack=await svc.submit(actor,{gameId:'generated-module',baseRevisionId:'saved-v2',prompt,clientRequestId:'edit-v2'}),coordinator=new ActionCoordinator(repo,{dispatch:async()=>{}},approval);
 assert.equal((await repo.snapshot()).jobs[0].qualityRequired,'game-quality-v1');await coordinator.enqueue(ack.jobId);await coordinator.claim(ack.jobId,0,'generate',identity('generate'));
 await assert.rejects(coordinator.report(ack.jobId,0,'generate',identity('generate'),{candidate:{format:'generated-source-v1',game:productionFixture(stickerLaunchFixture,prompt)},usageUnits:11}),/PRODUCTION_PLAN_BINDING_MISMATCH/);
 const game=productionFixture(stickerLaunchFixture,prompt,'saved-v2');await coordinator.report(ack.jobId,0,'generate',identity('generate'),{candidate:{format:'generated-source-v1',game},usageUnits:11});await coordinator.claim(ack.jobId,0,'test',identity('test'));
 const compiled=compiledPipelineFixture(game);await coordinator.report(ack.jobId,0,'test',identity('test'),{ok:true,game:compiled,qualityEvidence:syntheticQualityEvidence(compiled)});
 const state=await repo.snapshot();assert.equal(state.jobs[0].phase,'reviewing');assert.equal(state.revisions.length,1);assert.equal(state.active['rocket-project'],'saved-v2');
});

test('local pipeline exposes reviewing, cannot accept compile alone, and passes exact failed evidence to repair',async()=>{
 const repo=new MemoryRepository(),game=sourceGame();let reviews=0,repairs=0,svc:JobService;
 const agent:AgentAdapter={kind:'metered-api',available:true,
  async generate(){return {candidate:{format:'generated-source-v1',game},usageUnits:11};},
  async repair(input,previous,diagnostics,context){repairs++;assert.equal(input.childIntent,idea);assert.match(diagnostics,/GAMEPLAY_NO_CONSEQUENCE/);assert.equal(previous.source,game.source);assert.deepEqual(context?.qualityEvidence,syntheticQualityEvidence(compiledPipelineFixture(game)));return {candidate:{format:'generated-source-v1',game},usageUnits:13};},
  async review(input,compiled,evidence){reviews++;const state=await repo.snapshot();assert.equal(state.jobs[0].phase,'reviewing');assert.equal(state.revisions.length,0);assert.equal(input.budget.maxUnits,reviews===1?989:969);return {review:reviews===1?rejectedReview(compiled,evidence,'gameplay','GAMEPLAY_NO_CONSEQUENCE'):syntheticQualityReview(compiled,evidence),usageUnits:7};}
 };
 svc=service(repo,agent,{test:async(g:GeneratedGame,context:any)=>{assert.equal(context.captureQuality,true);return testedPipelineFixture(g);}});await svc.setAllowance(actor,10000,true);
 const job=await svc.submit(actor,{gameId:'new',baseRevisionId:null,prompt:idea,clientRequestId:'local-review'});await svc.run(job.jobId);
 const state=await repo.snapshot();assert.equal(state.jobs[0].status,'ready');assert.equal(reviews,2);assert.equal(repairs,1);assert.equal(state.ledgers[actor.familyId].used,38);assert.equal(state.revisions.length,1);assert.equal((state.revisions[0].game as GeneratedGame).compiled?.quality?.verdict,'pass');
});

test('local missing review or evidence cannot become Ready',async()=>{
 for(const missing of ['review','evidence'] as const){
  const repo=new MemoryRepository(),game=sourceGame(),agent:AgentAdapter={kind:'metered-api',available:true,generate:async()=>({candidate:{format:'generated-source-v1',game},usageUnits:11}),...(missing==='evidence'?{review:async(_input:AgentInput,compiled:GeneratedGame,evidence:GameQualityEvidence)=>({review:syntheticQualityReview(compiled,evidence),usageUnits:7})}:{})};
  const svc=service(repo,agent,{test:async()=>missing==='evidence'?compiledPipelineFixture(game):testedPipelineFixture(game)});await svc.setAllowance(actor,10000,true);const job=await svc.submit(actor,{gameId:'new',baseRevisionId:null,prompt:idea,clientRequestId:'missing-'+missing});await svc.run(job.jobId);const state=await repo.snapshot();assert.equal(state.jobs[0].status,'failed');assert.match(state.jobs[0].errorCode||'',missing==='review'?/QUALITY_REVIEW_REQUIRED/:/QUALITY_EVIDENCE/);assert.equal(state.revisions.length,0);
 }
});

test('local cancellation aborts a pending review without publishing a late result or charging twice',async()=>{
 const repo=new MemoryRepository(),game=sourceGame();let release!:(value:{review:GameQualityReview;usageUnits:number})=>void,started!:()=>void;
 const began=new Promise<void>(resolve=>{started=resolve;}),pending=new Promise<{review:GameQualityReview;usageUnits:number}>(resolve=>{release=resolve;});
 const agent:AgentAdapter={kind:'metered-api',available:true,generate:async()=>({candidate:{format:'generated-source-v1',game},usageUnits:11}),async review(){started();return pending;}};
 const svc=service(repo,agent,{test:async()=>testedPipelineFixture(game)});await svc.setAllowance(actor,10000,true);await repo.transaction(s=>{s.revisions.push({id:'kept-local',familyId:actor.familyId,parentId:null,projectId:'favorite',game:compiledPipelineFixture(stickerLaunchFixture)});s.active.favorite='kept-local';return true;});
 const job=await svc.submit(actor,{gameId:'new',baseRevisionId:null,prompt:idea,clientRequestId:'cancel-local'}),running=svc.run(job.jobId);await began;await svc.cancel(actor,job.jobId);release({review:syntheticQualityReview(compiledPipelineFixture(game)),usageUnits:7});await running;
 const state=await repo.snapshot();assert.equal(state.jobs[0].status,'cancelled');assert.equal(state.revisions.length,1);assert.equal(state.active.favorite,'kept-local');assert.equal(state.ledgers[actor.familyId].used,1000);assert.equal(state.ledgers[actor.familyId].reserved,0);
});
