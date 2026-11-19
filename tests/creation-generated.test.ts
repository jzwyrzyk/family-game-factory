/** Fixture-only transport/publication evidence. No paid provider or sandbox acceptance is claimed. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { validateGenerated,validateCompiled,hash,type GeneratedGame } from '../server/agent/generated';
import { OpenAIResponsesAgent,type AgentApproval } from '../server/agent/openai';
import { hopper } from '../server/testing/generated-fixtures';
import { createStarterProject } from '../src/creation/projects';
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

test('test publication cannot replace or drop a reviewed companion manifest',()=>{
  const g=candidate();assert.deepEqual(validateCompiled(g,compiled(g)).creationManifest,g.creationManifest);
  const changed=compiled(g);changed.creationManifest=companion();
  assert.throws(()=>validateCompiled(g,changed),/ATTESTATION/);
  const dropped=compiled(g);delete dropped.creationManifest;
  assert.throws(()=>validateCompiled(g,dropped),/ATTESTATION/);
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
    assert.ok(schema.properties.creationManifest.anyOf.some((s:any)=>s.type==='null'));
    assert.equal(schema.properties.creationManifest.anyOf[0].additionalProperties,false);
    assert.ok(schema.$defs.creationBlock);assert.match(body.instructions,/separate editable scene/);
    return new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({...hopper,creationManifest:companion()})}]}],usage:{input_tokens:100,output_tokens:100}}),{status:200});
  });
  const input={gameManifest:{id:'new',allowedMechanics:['generated-module-v2']},baseRevision:{id:'new'},childIntent:'Make a dragon dance when tapped',allowedCapabilities:['generated-module-v2'],budget:{maxUnits:100000,timeoutMs:1000},signal:new AbortController().signal};
  const result=await agent.generate(input);assert.equal((result.candidate.game as GeneratedGame).creationManifest?.schema,'jems.creation.v1');assert.equal(requests,1);
  await assert.rejects(agent.generate({...input,budget:{...input.budget,maxUnits:100}}),/SPENDING_CUTOFF/);assert.equal(requests,1);
});
