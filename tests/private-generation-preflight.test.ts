import {test} from 'node:test';
import assert from 'node:assert/strict';
import {transformSync} from 'esbuild';
import {privateGenerationPreflight} from '../server/quality/private-generation-preflight';
import {OpenAIResponsesAgent,type AgentApproval} from '../server/agent/openai';
import {draftChildIntentContract} from '../server/quality/child-intent';
import {chooseGameForm} from '../server/quality/game-form';
import {stickerLaunchFixture,robotRouteFixture} from '../server/testing/working-game-fixtures';
import {suspensionChallenge,physicalWorkshop} from '../server/testing/quality-generated-fixtures';
import {hopper} from '../server/testing/generated-fixtures';
import {MemoryRepository} from '../server/pipeline/repository';
import {JobService} from '../server/pipeline/service';
import {runtimeBundle} from '../server/sandbox/bundle-v2.cjs';
import {hash,isGeneratedGame,type GeneratedGame,validateCompiled} from '../server/agent/generated';
import {validateSource} from '../server/sandbox/source-validator.cjs';
import {defaults} from '../src/runtime/manifests';
import type {AgentInput} from '../server/pipeline/types';
const idea='Drag three bubble gum stickers onto a rocket, then press Launch to blast off.';
const approval:AgentApproval={
  enabled:true,approvalId:'synthetic-only',model:'fixture-contract-2026',reasoningEffort:'low',
  inputUsdPerMillion:1,outputUsdPerMillion:1,
  maxInputTokens:64000,maxOutputTokens:6000,
  priceReviewedOn:new Date().toISOString().slice(0,10)
};
function input(childIntent:string,baseRevision:AgentInput['baseRevision']={id:'new'}):AgentInput {
 return {childIntent,baseRevision,
  gameManifest:{id:'new',allowedMechanics:['generated-module-v1','generated-module-v2']},
  allowedCapabilities:['generated-module-v1','generated-module-v2'],
  budget:{maxUnits:200000,timeoutMs:60000},signal:new AbortController().signal};
}
function fixtureResponse(fixture:GeneratedGame){
 return new Response(JSON.stringify({status:'completed',output:[{content:[
  {type:'output_text',text:JSON.stringify(fixture)}
 ]}],usage:{input_tokens:500,output_tokens:1000}}));
}
test('O4: canonical private preflight retains O1 literal evidence and O2 form; O3 checks remain NOT TESTED',()=>{
 const plan=privateGenerationPreflight(input(idea));
 const intent=draftChildIntentContract(idea),form=chooseGameForm(intent);
 assert.equal(plan.brief.sourceSha256,intent.source.sha256);
 assert.equal(plan.brief.intentVersion,intent.version);
 assert.equal(plan.brief.form.version,form.version);
 assert.equal(plan.brief.form.rendering,'2d-canvas');
 assert.equal(plan.brief.form.simulation,'rule-driven');
 assert.equal(plan.brief.form.primaryInput,'drag-and-drop');
 assert.ok(plan.brief.form.additionalInputs.includes('tap-and-react'));
 assert.equal(plan.brief.status,'PROPOSED_NOT_CHILD_CONFIRMED');
 assert.equal(plan.brief.workability.status,'NOT_TESTED');
 assert.ok(plan.brief.workability.mandatoryChecks.some(c=>c.includes('actual')||c.includes('Actual')));
 assert.equal(plan.instructionsMode,'rule-driven');
 assert.equal(plan.priorSourceKind,'none');
 for(const evidence of plan.brief.sourceEvidence) {
  assert.equal(idea.slice(evidence.start,evidence.end),evidence.quote);
 }
 for(const signal of plan.brief.form.evidence) {
  assert.equal(idea.slice(signal.source.start,signal.source.end),signal.source.quote);
 }
 assert.ok(!JSON.stringify(plan.brief).includes('fun-approved'));
});
test('O4: model sees real physical instructions only when needed and does not get unnecessary provider calls',async()=>{
 const seen:any[]=[];let keyReads=0;
 const adapter=new OpenAIResponsesAgent(approval,()=>{keyReads++;return 'synthetic-unit-provider-key-not-a-secret';},
  (async(_url,init)=>{seen.push(JSON.parse(String(init?.body)));return fixtureResponse(stickerLaunchFixture);}) as typeof fetch);
 await adapter.generate(input(idea));
 await adapter.generate(input('Drive a car over bumpy hills with working suspension.'));
 assert.equal(seen.length,2);
 assert.equal(keyReads,2);
 const [sticker,hill]=seen;
 for(const req of seen){
  assert.equal(req.store,false);
  assert.equal(req.text.format.strict,true);
  assert.equal(req.max_output_tokens,6000);
  const data=JSON.parse(req.input);
  assert.equal(data.gameDesignPreflight.workability.status,'NOT_TESTED');
  assert.equal(data.gameDesignPreflight.status,'PROPOSED_NOT_CHILD_CONFIRMED');
 }
 assert.equal(JSON.parse(sticker.input).idea,idea);
 assert.equal(JSON.parse(sticker.input).gameDesignPreflight.motion,'rule-driven');
 assert.ok(sticker.instructions.includes('Do not call api.physics'));
 assert.doesNotMatch(sticker.instructions,/physics.join\(\{id/);
 assert.equal(JSON.parse(hill.input).gameDesignPreflight.motion,'physics-2d');
 assert.match(hill.instructions,/physics.join\(\{id/);
});
test('O4: explicit unsupported true 3D, conflicting requirements, and uninspected bases stop BEFORE key or paid transport',async()=>{
 let keyReads=0,networkCalls=0;
 const adapter=new OpenAIResponsesAgent(approval,()=>{keyReads++;return 'synthetic-unit-provider-key-not-a-secret';},
  (async()=>{networkCalls++;return fixtureResponse(stickerLaunchFixture);}) as typeof fetch);
 await assert.rejects(adapter.generate(input('Make a true 3D space game where I fly in depth.')),/GAME_FORM_UNSUPPORTED/);
 await assert.rejects(adapter.generate(input('Make a rocket with no physics, but simulate gravity and momentum.')),/GAME_FORM_REVIEW_REQUIRED/);
 await assert.rejects(adapter.generate(input('Make it faster.',{id:'saved-but-uninspected'})),/GAME_FORM_BASE_UNVERIFIED/);
 assert.equal(keyReads,0);assert.equal(networkCalls,0);
});
test('O4: saved v2 physics remains physics on an ordinary edit; physical-to-scripted and scripted-to-physical changes require review',()=>{
 const phys={id:'physical-1',game:suspensionChallenge,projectId:'project-a'};
 const normal=privateGenerationPreflight(input('Make the car faster.',phys));
 assert.equal(normal.instructionsMode,'physics-2d');
 assert.equal(normal.brief.form.simulation,'physics-2d');
 assert.equal(normal.priorSourceKind,'v2');
 assert.throws(()=>privateGenerationPreflight(input('Remove physics and make it a sticker game.',phys)),/GAME_FORM_REVIEW_REQUIRED/);
 assert.throws(()=>privateGenerationPreflight(input('Add realistic gravity to this game.',{
  id:'scripted-1',game:stickerLaunchFixture,projectId:'project-a'
 })),/GAME_FORM_REVIEW_REQUIRED/);
 const legacy=privateGenerationPreflight(input('Make it faster.',{id:'legacy-1',game:hopper,projectId:'project-a'}));
 assert.equal(legacy.priorSourceKind,'v1');
 assert.equal(legacy.instructionsMode,'rule-driven');
});
test('O4: native seed provenance preserves hill/gum physics and legacy gum rules without trusting a client-selected shape',()=>{
 for(const [sourceGame,simulation] of [['hill','physics-2d'],['gum','physics-2d'],['robot','rule-driven']] as const){
  const base={id:'seed-'+sourceGame,sourceGame,config:defaults(sourceGame),projectId:'seed-project'};
  const plan=privateGenerationPreflight(input('Make the game a little faster.',base));
  assert.equal(plan.brief.form.simulation,simulation);
 }
 const legacyGum={...defaults('gum'),qualityVersion:0};
 const old=privateGenerationPreflight(input('Make the game a little faster.',{
  id:'seed-gum-old',sourceGame:'gum',config:legacyGum,projectId:'seed-project'
 }));
 assert.equal(old.instructionsMode,'rule-driven');
 assert.throws(()=>privateGenerationPreflight(input('Make the game a little faster.',{
  id:'seed-unknown',sourceGame:'invented',config:{speed:1}
 })),/GAME_FORM_BASE_UNVERIFIED/);
});
test('O4: a failed unrequested physics candidate cannot hijack an ordinary rule-driven repair',async()=>{
 const calls:any[]=[];
 const adapter=new OpenAIResponsesAgent(approval,()=> 'synthetic-unit-provider-key-not-a-secret',
  (async(_url,init)=>{calls.push(JSON.parse(String(init?.body)));return fixtureResponse(stickerLaunchFixture);}) as typeof fetch);
 await adapter.repair(input('Make a moon construction game'),physicalWorkshop,'The unneeded physics behavior is unstable');
 assert.equal(calls.length,1);
 assert.equal(JSON.parse(calls[0].input).gameDesignPreflight.form.simulation,'rule-driven');
 assert.match(JSON.parse(calls[0].input).base.source,/api.physics/);
 assert.doesNotMatch(calls[0].instructions,/physics.part/);
 assert.match(JSON.parse(calls[0].input).feedback,/unneeded physics/);
});
/**
 * This gate is a synthetic contract stub, NOT a real sandbox attestation.
 * Real security/isolation and child-device checks stay in the existing browser
 * and private gVisor CI suites. Only authored source is allowed here.
 */
function fixtureCompiled(game:GeneratedGame):GeneratedGame{
 if(![stickerLaunchFixture.source,robotRouteFixture.source].includes(game.source))
  throw Error('O4_AUTHORED_FIXTURE_ONLY');
 validateSource(game);
 const code=transformSync(game.source,{loader:'ts',format:'iife',globalName:'GameModule'}).code;
 const rt=runtimeBundle();
 const tested={...game,compiled:{
  code,sourceHash:hash(game.source),codeHash:hash(code),
  runtimeVersion:rt.version,runtimeHash:rt.hash,
  tests:{desktop:true,mobile:true,replay:true,isolation:true,input:true,resources:true,pause:true}
 }};
 return validateCompiled(game,tested);
}
test('O4: existing JobService makes fixture-backed Create → Playable Revision → Revise → Keep → Undo/Fork without losing source',async()=>{
 const seen:any[]=[],repo=new MemoryRepository();
 const revised={...stickerLaunchFixture,source:stickerLaunchFixture.source.replace('150*dt','220*dt')};
 assert.notEqual(revised.source,stickerLaunchFixture.source);
 // Only allow BOTH frozen, authored forms in the synthetic local gate.
 const approvedSources=new Set([stickerLaunchFixture.source,revised.source]);
 const gate={test:async(game:unknown)=>{
  assert.ok(isGeneratedGame(game));
  const g=game as GeneratedGame;
  if(!approvedSources.has(g.source))throw Error('O4_AUTHORED_FIXTURE_ONLY');
  const code=transformSync(g.source,{loader:'ts',format:'iife',globalName:'GameModule'}).code;
  validateSource(g);const rt=runtimeBundle();
  return validateCompiled(g,{...g,compiled:{code,sourceHash:hash(g.source),codeHash:hash(code),
    runtimeVersion:rt.version,runtimeHash:rt.hash,
    tests:{desktop:true,mobile:true,replay:true,isolation:true,input:true,resources:true,pause:true}}});
 }};
 let providerRequests=0;
 const adapter=new OpenAIResponsesAgent(approval,()=> 'synthetic-unit-provider-key-not-a-secret',
  (async(_url,init)=>{
    const req=JSON.parse(String(init?.body));seen.push(JSON.parse(req.input));providerRequests++;
    return fixtureResponse(providerRequests===1?stickerLaunchFixture:revised);
  }) as typeof fetch);
 const parent={subject:'fixture-parent',familyId:'fixture-family',role:'parent' as const,expiresAt:Date.now()+60000};
 const other={...parent,familyId:'unrelated-family'};
 const service=new JobService(repo,adapter,gate,{allowMock:false,maxUnits:100000,timeoutMs:60000,maxRetries:2});
 await service.setAllowance(parent,500000,true);
 const first=await service.submit(parent,{gameId:'new',baseRevisionId:null,prompt:idea,clientRequestId:'new-game'});
 assert.equal(first.status,'queued');
 assert.equal((await service.get(parent,first.jobId)).status,'queued');
 await service.run(first.jobId);
 const built=await service.get(parent,first.jobId);
 assert.equal(built.status,'ready');
 const initial=await service.revision(parent,built.revisionId!);
 assert.equal(initial.game?.kind,'generated-module-v2');
 assert.equal(seen[0].gameDesignPreflight.form.simulation,'rule-driven');
 assert.equal(seen[0].idea,idea);
 const kept=await service.keep(parent,initial.id);
 assert.equal(kept.revisionId,initial.id);
 assert.equal((await service.list(parent)).length,1);
 await assert.rejects(service.revision(other,initial.id),/Forbidden/);
 await assert.rejects(service.keep(other,initial.id),/Forbidden/);
 const revisedAck=await service.submit(parent,{
  gameId:'new',baseRevisionId:initial.id,
  prompt:'Make the rocket launch faster.',clientRequestId:'rev-1'
 });
 await service.run(revisedAck.jobId);
 const ready=await service.get(parent,revisedAck.jobId);
 assert.equal(ready.status,'ready');
 const updated=await service.revision(parent,ready.revisionId!);
 assert.equal(updated.parentId,initial.id);
 assert.equal(updated.projectId,initial.projectId);
 assert.equal((updated.game as GeneratedGame).source,revised.source);
 assert.notEqual((initial.game as GeneratedGame).source,(updated.game as GeneratedGame).source);
 assert.equal((await service.list(parent))[0].id,initial.id,'candidate is not automatically kept');
 assert.equal(seen[1].gameDesignPreflight.status,'PROPOSED_NOT_CHILD_CONFIRMED');
 assert.equal(seen[1].gameDesignPreflight.workability.status,'NOT_TESTED');
 assert.equal(seen[1].base.source,(initial.game as GeneratedGame).source);
 await service.keep(parent,updated.id);
 assert.equal((await service.list(parent))[0].id,updated.id);
 const undone=await service.undo(parent,updated.id);
 assert.equal(undone.revisionId,initial.id);
 const fork=await service.fork(parent,updated.id,'A second rocket');
 assert.notEqual(fork.revisionId,updated.id);
 assert.equal((await service.list(parent)).length,2);
 const state=await repo.snapshot();
 assert.equal(state.jobs.length,2);
 assert.ok(state.audit.every(event=>!JSON.stringify(event).includes(idea)));
 assert.equal(state.ledgers[parent.familyId].reserved,0);
});
