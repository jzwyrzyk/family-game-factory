/** Fixture-only transport/publication evidence. No paid provider or sandbox acceptance is claimed. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { validateGenerated,validateCompiled,hash,type GeneratedGame } from '../server/agent/generated';
import { OpenAIResponsesAgent,type AgentApproval } from '../server/agent/openai';
import { hopper } from '../server/testing/generated-fixtures';
import { stickerLaunchFixture } from '../server/testing/working-game-fixtures';
import { fixturePlanProposal,fixtureModuleReply,syntheticQualityEvidence,syntheticQualityReview } from '../server/testing/presentation-quality-fixtures';
import { productionFixture,compiledPipelineFixture } from './quality-pipeline-fixtures';
import { pixelPack } from './generated-art-fixtures';
import { validateQualityEvidence } from '../server/quality/game-quality';
import { draftChildIntentContract } from '../server/quality/child-intent';
import { chooseGameForm } from '../server/quality/game-form';
import { createFunctionalGameContract } from '../server/quality/functional-game-contract';
import { createStarterProject,validateEditableProject,validateGeneratedCreationManifest,validateSavedCreationManifest } from '../src/creation/projects';
import { DockerArtifactGate } from '../server/sandbox/docker-gate';
import { MemoryRepository } from '../server/pipeline/repository';
import { JobService } from '../server/pipeline/service';
import { apiHandler } from '../server/pipeline/http';
import { signSession } from '../server/pipeline/auth';
import { beginAdultPilotSession,grantAdultPilot } from '../server/adult-pilot';
import { BuilderClient } from '../src/builder/client';
import type { VerifiedSession } from '../server/contracts/api';

const companion=()=>createStarterProject('dragon');
const candidate=()=>validateGenerated({...hopper,creationManifest:companion()});
const compiled=(game:GeneratedGame):GeneratedGame=>({...game,compiled:{code:'fixture-compiled-only',sourceHash:hash(game.source),codeHash:hash('fixture-compiled-only'),tests:{desktop:true,mobile:true,replay:true,isolation:true}}});
const qualityIdea='Make a pixel game: drag three stickers onto a rocket, then press Launch to blast off.';
const qualityCandidate=()=>validateGenerated({...productionFixture(stickerLaunchFixture,qualityIdea),assets:pixelPack(),creationManifest:companion()});
const longCompanion=(count:number,text='a'.repeat(150))=>{
  const scene=companion();
  scene.programs=[{id:'story',actorId:'dragon',trigger:{type:'start'},actions:Array.from({length:count},(_,i)=>({id:`line-${i}`,type:'say' as const,text,durationMs:100}))}];
  return scene;
};

test('generated companion is optional, data-only, asset-bound and always attributed as assisted',()=>{
  assert.deepEqual(validateGenerated(hopper),hopper);
  assert.deepEqual(validateGenerated({...hopper,creationManifest:null}),hopper);
  const scene=companion();scene.provenance={createdBy:'child',sourceProjectId:'invented-source'};
  scene.programs[0].actions[0].origin='child';
  const g=validateGenerated({...hopper,creationManifest:scene});
  assert.deepEqual(g.creationManifest?.provenance,{createdBy:'assisted'});
  assert.ok(g.creationManifest?.programs.every(p=>p.actions.every(b=>b.origin==='assisted')));
  assert.equal(scene.programs[0].actions[0].origin,'child','caller data is not changed');
  assert.throws(()=>validateGenerated({...hopper,creationManifest:{...scene,source:'not allowed'}}),/Unknown field/);
  assert.throws(()=>validateGenerated({...hopper,creationManifest:{...scene,actors:[{...scene.actors[0],assetId:'unreviewed-asset'}]}}));
  assert.throws(()=>validateGenerated({...hopper,creationManifest:{...scene,actors:[{...scene.actors[0],url:'https://example.invalid/image.png'}]}}),/Unknown field/);
});

test('local creative roles preserve private draft aliases and historical public readers', () => {
  for (const [alias, role] of Object.entries({character:'character', scenery:'environment', decoration:'decoration', collectible:'collectible', obstacle:'obstacle'})) {
    const original = createStarterProject('blank');
    const withRole = (field: 'role' | 'creativeRole', value: string) => ({
      ...original, actors: original.actors.map(actor => ({...actor, [field]:value})),
    });
    const draft = withRole('creativeRole', alias);
    const migrated = validateEditableProject(draft);
    assert.equal(migrated.actors[0].role, role);
    assert.equal('creativeRole' in migrated.actors[0], false);
    assert.equal('role' in draft.actors[0], false);
    assert.deepEqual(migrated.programs, original.programs);
    assert.throws(() => validateGeneratedCreationManifest(draft), /Unknown field/);
    assert.throws(() => validateSavedCreationManifest(draft), /Unknown field/);
    const canonical = withRole('role', role);
    assert.equal(validateSavedCreationManifest(canonical).actors[0].role, role);
    assert.throws(() => validateGeneratedCreationManifest(canonical), /roles/);
    assert.throws(() => validateEditableProject({...draft, actors:[{...draft.actors[0],role:'player'}]}), /conflicting roles/);
    assert.deepEqual(validateEditableProject({...draft, actors:[{...draft.actors[0],role}]}).actors, migrated.actors);
  }
});

test('v2 candidates validate companion, raster assets, production plan and ordinary playthrough together',()=>{
  const game=qualityCandidate();
  assert.deepEqual(validateGenerated(game),game);
  assert.equal(game.assets?.assets.length,1);
  assert.equal(game.productionPlan?.presentationStyle,'pixel');
  assert.ok(game.playthrough?.length);
  assert.equal(game.creationManifest?.provenance?.createdBy,'assisted');
  assert.throws(()=>validateGenerated({...game,assets:{...game.assets,style:'illustrated'}}),/ASSET_STYLE_MISMATCH/);
  assert.throws(()=>validateGenerated({...game,assets:{...game.assets,assets:[{...game.assets!.assets[0],sha256:'0'.repeat(64)}]}}),/ASSET_/);
  assert.throws(()=>validateGenerated({...game,productionPlan:{...game.productionPlan,requestHash:'not-a-hash'}}),/PRODUCTION_PLAN/);
  assert.throws(()=>validateGenerated({...game,playthrough:[{type:'win'}]}),/PLAYTHROUGH/);
});

test('test publication cannot replace or drop a reviewed companion manifest',()=>{
  const g=candidate();assert.deepEqual(validateCompiled(g,compiled(g)).creationManifest,g.creationManifest);
  const changed=compiled(g);changed.creationManifest=companion();
  assert.throws(()=>validateCompiled(g,changed),/ATTESTATION/);
  const dropped=compiled(g);delete dropped.creationManifest;
  assert.throws(()=>validateCompiled(g,dropped),/ATTESTATION/);
});

test('companion byte limits include normalized attribution and remain stable across repeated validation',()=>{
  const accepted=validateGeneratedCreationManifest(longCompanion(138));
  assert.ok(Buffer.byteLength(JSON.stringify(accepted))<=32_000);
  assert.deepEqual(validateGeneratedCreationManifest(accepted),accepted);
  const attributionOverflow=longCompanion(139);
  assert.ok(Buffer.byteLength(JSON.stringify(attributionOverflow))<32_000);
  assert.throws(()=>validateGeneratedCreationManifest(attributionOverflow),/too large/);
  const unicodeOverflow=longCompanion(100,'🐉'.repeat(75));
  assert.ok(JSON.stringify(unicodeOverflow).length<32_000);
  assert.ok(Buffer.byteLength(JSON.stringify(unicodeOverflow))>32_000);
  assert.throws(()=>validateGeneratedCreationManifest(unicodeOverflow),/too large/);
});

test('sandbox receives source only and trusted publication retains a large companion unchanged',async()=>{
  const source=hopper.source+'\n/*'+'x'.repeat(28_000-Buffer.byteLength(hopper.source)-5)+'*/';
  const game=validateGenerated({...hopper,source,creationManifest:longCompanion(100)});
  const expected=structuredClone(game.creationManifest);
  assert.ok(Buffer.byteLength(JSON.stringify(game))>50_000,'reproduces the former sandbox stdin overflow');
  const gate=new DockerArtifactGate({image:'sha256:'+'a'.repeat(64),timeoutMs:1000,memoryMb:512,cpus:1});
  let executions=0;
  Object.assign(gate,{execute:async(_args:string[],input?:string)=>{
    if(input===undefined)return '';
    executions++;
    assert.ok(Buffer.byteLength(input)<50_000);
    const request=JSON.parse(input),sourceOnly=request.game;
    assert.equal(request.captureQuality,false);
    assert.equal(Object.hasOwn(sourceOnly,'creationManifest'),false);
    assert.equal(Object.hasOwn(sourceOnly,'compiled'),false);
    assert.equal(sourceOnly.source,source);
    return JSON.stringify({ok:true,game:compiled(sourceOnly)});
  }});
  const tested=await gate.test(game);
  assert.ok(tested);assert.equal(executions,1);
  assert.deepEqual(tested.creationManifest,expected);
  assert.deepEqual(validateCompiled(game,tested).creationManifest,expected);
});

test('sandbox cannot inject a companion or replace source while the host restores trusted scene data',async()=>{
  const game=candidate();
  for(const replacement of ['companion','source'] as const){
    const gate=new DockerArtifactGate({image:'sha256:'+'a'.repeat(64),timeoutMs:1000,memoryMb:512,cpus:1});
    Object.assign(gate,{execute:async(_args:string[],input?:string)=>{
      if(input===undefined)return '';
      const sourceOnly=JSON.parse(input).game,reply=compiled(sourceOnly);
      if(replacement==='companion')reply.creationManifest=companion();
      else reply.source+='\n// changed by sandbox';
      return JSON.stringify({ok:true,game:reply});
    }});
    await assert.rejects(gate.test(game),/ATTESTATION/);
  }
});

test('quality capture retains game assets, plan, playthrough and independent probes while the companion stays host-held',async()=>{
  const game=qualityCandidate(),intent=draftChildIntentContract(qualityIdea);
  const independentIntentPlan=createFunctionalGameContract(intent,chooseGameForm(intent),[{id:'launch',quote:'press Launch'}],[{
    id:'launch-input',covers:['launch'],deterministicReplay:true,actions:[{kind:'press',button:'action'}],
    checkpoints:[{after:1,outcome:'playing',observations:[{kind:'visible',key:'rocket'}]}],
  }]);
  const gate=new DockerArtifactGate({image:'sha256:'+'a'.repeat(64),timeoutMs:1000,memoryMb:512,cpus:1});
  Object.assign(gate,{execute:async(_args:string[],input?:string)=>{
    if(input===undefined)return '';
    const request=JSON.parse(input),sourceOnly=request.game;
    assert.equal(request.captureQuality,true);
    assert.deepEqual(request.independentIntentPlan,independentIntentPlan);
    assert.equal(Object.hasOwn(sourceOnly,'creationManifest'),false);
    assert.deepEqual(sourceOnly.assets,game.assets);
    assert.deepEqual(sourceOnly.productionPlan,game.productionPlan);
    assert.deepEqual(sourceOnly.playthrough,game.playthrough);
    const tested=compiledPipelineFixture(sourceOnly,true);
    return JSON.stringify({ok:true,game:tested,qualityEvidence:syntheticQualityEvidence(tested)});
  }});
  const tested=await gate.test(game,{captureQuality:true,independentIntentPlan});
  assert.ok(tested?.qualityEvidence);
  assert.deepEqual(validateCompiled(game,tested).creationManifest,game.creationManifest);
  assert.deepEqual(validateQualityEvidence(tested,tested.qualityEvidence),tested.qualityEvidence);
  assert.equal(tested.compiled?.tests.intent,true);
});

test('quality capture rejects changed game bindings and stale evidence before restoring the companion',async()=>{
  const game=qualityCandidate();
  for(const change of ['assets','plan','playthrough','evidence'] as const){
    const gate=new DockerArtifactGate({image:'sha256:'+'a'.repeat(64),timeoutMs:1000,memoryMb:512,cpus:1});
    Object.assign(gate,{execute:async(_args:string[],input?:string)=>{
      if(input===undefined)return '';
      const reply=compiledPipelineFixture(JSON.parse(input).game),evidence=syntheticQualityEvidence(reply);
      if(change==='assets')reply.assets!.assets[0].role='object';
      else if(change==='plan')reply.productionPlan!.payoff='A different payoff';
      else if(change==='playthrough')reply.playthrough![0].frames=59;
      else evidence.artifactHash='0'.repeat(64);
      return JSON.stringify({ok:true,game:reply,qualityEvidence:evidence});
    }});
    await assert.rejects(gate.test(game,{captureQuality:true}),/ATTESTATION_REQUIRED|QUALITY_EVIDENCE_BINDING/);
  }
});

test('mandatory quality review publishes the tested game and its unchanged companion together',async()=>{
  const repo=new MemoryRepository(),game=qualityCandidate();
  const session:VerifiedSession={subject:'quality-fixture',familyId:'family-creation-quality',role:'parent',expiresAt:Date.now()+60000};
  let captures=0,reviews=0;
  const gate=new DockerArtifactGate({image:'sha256:'+'a'.repeat(64),timeoutMs:1000,memoryMb:512,cpus:1});
  Object.assign(gate,{execute:async(_args:string[],input?:string)=>{
    if(input===undefined)return '';
    const request=JSON.parse(input);assert.equal(request.captureQuality,true);
    assert.equal(Object.hasOwn(request.game,'creationManifest'),false);captures++;
    const tested=compiledPipelineFixture(request.game);
    return JSON.stringify({ok:true,game:tested,qualityEvidence:syntheticQualityEvidence(tested)});
  }});
  const service=new JobService(repo,{kind:'metered-api',available:true,
    generate:async()=>({candidate:{format:'generated-source-v1',game},usageUnits:11}),
    review:async(_input,tested,evidence)=>{
      reviews++;
      assert.deepEqual(tested.creationManifest,game.creationManifest);
      assert.deepEqual(tested.assets,game.assets);
      assert.deepEqual(tested.productionPlan,game.productionPlan);
      assert.deepEqual(tested.playthrough,game.playthrough);
      return {review:syntheticQualityReview(tested,evidence),usageUnits:7};
    },
  },gate,{allowMock:false,maxUnits:1000,timeoutMs:10000,maxRetries:1});
  await service.setAllowance(session,10000,true);
  const job=await service.submit(session,{gameId:'new',baseRevisionId:null,prompt:qualityIdea,clientRequestId:'creation-quality-publication'});
  await service.run(job.jobId);
  const ready=await service.get(session,job.jobId);assert.equal(ready.status,'ready');
  assert.equal(captures,1);assert.equal(reviews,1);
  const published=(await service.revision(session,ready.revisionId!)).game as GeneratedGame;
  assert.deepEqual(published.creationManifest,game.creationManifest);
  assert.deepEqual(published.assets,game.assets);
  assert.deepEqual(published.productionPlan,game.productionPlan);
  assert.deepEqual(published.playthrough,game.playthrough);
  assert.equal(published.compiled?.quality?.verdict,'pass');
  assert.equal(Object.hasOwn(published,'qualityEvidence'),false);
});

test('existing generation pipeline retains the validated companion through immutable publication and fork',async()=>{
  const repo=new MemoryRepository(),session:VerifiedSession={subject:'fixture',familyId:'family-creation',role:'designer',expiresAt:Date.now()+60000};
  const game=candidate();
  const service=new JobService(repo,{kind:'mock',available:true,generate:async()=>({candidate:{format:'generated-source-v1',game},usageUnits:0})},
    {test:async input=>compiled(input as GeneratedGame)},{allowMock:true,maxUnits:0,timeoutMs:2000,maxRetries:1});
  const job=await service.submit(session,{gameId:'new',baseRevisionId:null,prompt:'Make a dragon dance when tapped',clientRequestId:'creation-publication'});
  await service.run(job.jobId);const ready=await service.get(session,job.jobId);assert.equal(ready.status,'ready');
  const original=await service.revision(session,ready.revisionId!);assert.deepEqual((original.game as GeneratedGame).creationManifest,game.creationManifest);
  const copied=await service.fork(session,original.id,'Another dragon');
  assert.deepEqual((await service.revision(session,copied.revisionId)).game,original.game);
});

test('authenticated companion retrieval preserves family/adult audience and returns no executable source',async()=>{
  const repo=new MemoryRepository(),at=Date.now(),deviceId='11111111-2222-3333-4444-555555555555';
  const child:VerifiedSession={subject:'fixture',familyId:'family-creation',deviceId,role:'designer',expiresAt:at+600000};
  await repo.transaction(s=>{s.devices=[{id:deviceId,familyId:child.familyId,name:'Synthetic device',secretHash:'a'.repeat(64),rotation:0,createdAt:at-1000,lastSeenAt:at,expiresAt:at+600000}];return true;});
  await grantAdultPilot(repo,{familyId:child.familyId,deviceId,receipt:'synthetic-manifest-authority',operatorConfirmedAdult:true,expiresAt:at+600000});
  const unlocked=await repo.transaction(s=>beginAdultPilotSession(s,child));
  await repo.transaction(s=>{s.revisions.push(
    {id:'child-revision',familyId:child.familyId,projectId:'child-project',parentId:null,game:compiled(candidate())},
    {id:'old-revision',familyId:child.familyId,projectId:'old-project',parentId:null,game:compiled(hopper)},
    {id:'adult-revision',familyId:child.familyId,projectId:'adult-project',parentId:null,game:compiled(candidate()),adultPilotProfileId:`adult:${deviceId}`},
  );return true;});
  const service=new JobService(repo,{kind:'mock',available:true,generate:async()=>{throw Error('No provider call');}},{test:async()=>{}},{allowMock:true,maxUnits:0,timeoutMs:1000,maxRetries:1});
  const key='synthetic-creation-session-key-not-a-secret',origin='https://studio.example';
  const api=apiHandler(service,{appOrigin:origin,previewOrigin:'https://preview.example',sessionKey:key,previewKey:'synthetic-preview-key-not-a-secret-long'},repo);
  const server=createServer((req,res)=>void api(req,res));await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+(server.address() as {port:number}).port;
  const headers={Origin:origin,Cookie:`factory_session=${signSession(child,key)}; factory_adult=${unlocked.cookieValue}`};
  const adultHeaders={...headers,'X-Factory-Adult-Session':unlocked.sessionToken};
  try{
    const response=await fetch(base+'/v1/revisions/child-revision/creation',{headers});assert.equal(response.status,200);
    assert.equal(response.headers.get('cache-control'),'no-store');const data=await response.json();
    assert.equal(data.revisionId,'child-revision');assert.equal(data.projectId,'child-project');assert.equal(data.manifest.schema,'jems.creation.v1');
    assert.deepEqual(Object.keys(data).sort(),['manifest','projectId','revisionId']);assert.doesNotMatch(JSON.stringify(data),/createGame|fixture-compiled-only/);
    assert.equal((await (await fetch(base+'/v1/revisions/old-revision/creation',{headers})).json()).manifest,null);
    assert.equal((await fetch(base+'/v1/revisions/child-revision/creation')).status,401);
    assert.equal((await fetch(base+'/v1/revisions/child-revision/creation',{headers:{...headers,Origin:'https://other.example'}})).status,403);
    assert.equal((await fetch(base+'/v1/revisions/child-revision/creation',{headers:{Origin:origin,Cookie:'factory_session='+signSession({...child,familyId:'other',deviceId:undefined},key)}})).status,403);
    assert.equal((await fetch(base+'/v1/revisions/adult-revision/creation',{headers})).status,403);
    assert.equal((await fetch(base+'/v1/revisions/adult-revision/creation',{headers:adultHeaders})).status,200);
    assert.equal((await fetch(base+'/v1/revisions/child-revision/creation',{headers:adultHeaders})).status,403);
    await repo.transaction(s=>{s.adultPilotSessions![0].revokedAt=Date.now();return true;});
    assert.equal((await fetch(base+'/v1/revisions/adult-revision/creation',{headers:adultHeaders})).status,403);
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test('browser client rejects swapped revisions, unsafe manifests and late results after profile change',async()=>{
  const client=new BuilderClient({version:1,mode:'remote',apiBaseUrl:'https://api.example',previewOrigin:'https://preview.example'},()=>{});
  client.api=async()=>({revisionId:'revision-one',projectId:'project-one',manifest:companion()});
  assert.equal((await client.creationManifest('revision-one')).manifest?.provenance?.createdBy,'assisted');
  client.api=async()=>({revisionId:'revision-two',projectId:'project-one',manifest:companion()});await assert.rejects(client.creationManifest('revision-one'),/INVALID_CREATION/);
  client.api=async()=>({revisionId:'revision-one',projectId:'project-one',manifest:{...companion(),code:'not allowed'}});await assert.rejects(client.creationManifest('revision-one'),/Unknown field/);
  let finish!:(value:unknown)=>void;client.api=()=>new Promise(resolve=>{finish=resolve;});
  const pending=client.creationManifest('revision-one');client.disconnect();finish({revisionId:'revision-one',projectId:'project-one',manifest:companion()});
  await assert.rejects(pending,/PROFILE_CHANGED/);
});

test('provider transport offers a nullable closed companion schema and bounds its full request cost',async()=>{
  const approval:AgentApproval={enabled:true,approvalId:'fixture-approval',model:'fixture-model',inputUsdPerMillion:1,outputUsdPerMillion:1,maxInputTokens:64000,maxOutputTokens:4000,priceReviewedOn:new Date().toISOString().slice(0,10)};
  let requests=0;
  const agent=new OpenAIResponsesAgent(approval,()=> 'synthetic-provider-key-not-real',async(_url,init)=>{
    requests++;const body=JSON.parse(String(init?.body)),schema=body.text.format.schema;
    if(body.text.format.name==='family_game_plan')return new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(fixturePlanProposal(body))}]}],usage:{input_tokens:100,output_tokens:100}}),{status:200});
    assert.equal(body.text.format.name,'family_game_module');
    assert.ok(schema.properties.creationManifest.anyOf.some((s:any)=>s.type==='null'));
    assert.equal(schema.properties.creationManifest.anyOf[0].additionalProperties,false);
    assert.ok(schema.$defs.creationBlock);assert.match(body.instructions,/separate editable scene/);
    return new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({...fixtureModuleReply(stickerLaunchFixture),creationManifest:companion()})}]}],usage:{input_tokens:100,output_tokens:100}}),{status:200});
  });
  const input={gameManifest:{id:'new',allowedMechanics:['generated-module-v2']},baseRevision:{id:'new'},childIntent:'Make a dragon dance when tapped',allowedCapabilities:['generated-module-v2'],budget:{maxUnits:100000,timeoutMs:1000},signal:new AbortController().signal};
  const result=await agent.generate(input);assert.equal((result.candidate.game as GeneratedGame).creationManifest?.schema,'jems.creation.v1');assert.equal(requests,2);
  assert.ok((result.candidate.game as GeneratedGame).productionPlan);
  assert.ok((result.candidate.game as GeneratedGame).assets);
  assert.ok((result.candidate.game as GeneratedGame).playthrough);
  await assert.rejects(agent.generate({...input,budget:{...input.budget,maxUnits:100}}),/SPENDING_CUTOFF/);assert.equal(requests,2);
});
