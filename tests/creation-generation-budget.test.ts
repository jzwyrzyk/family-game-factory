import {test} from 'node:test';
import assert from 'node:assert/strict';
import {transformSync} from 'esbuild';
import {OpenAIResponsesAgent,type AgentApproval,type GenerationContext} from '../server/agent/openai';
import {hash,validateGenerated,type GeneratedGame} from '../server/agent/generated';
import type {AgentInput} from '../server/pipeline/types';
import {privateGenerationPreflight} from '../server/quality/private-generation-preflight';
import {bindGameProductionPlan,presentationBrief} from '../server/quality/presentation-plan';
import {assetPackHash,makeRasterAsset} from '../server/agent/game-assets';
import {runtimeBundle} from '../server/sandbox/bundle-v2.cjs';
import {hopper} from '../server/testing/generated-fixtures';
import {physicalWorkshop} from '../server/testing/quality-generated-fixtures';
import {stickerLaunchFixture} from '../server/testing/working-game-fixtures';
import {fixtureModuleReply,fixturePlanProposal,fixturePlaythrough,syntheticQualityEvidence,syntheticEvidencePng} from '../server/testing/presentation-quality-fixtures';

// The deployment template's 24k/4k caps and the documented owner setup's
// micro-USD rates. This transport is entirely local: no credentials or provider.
const approval:AgentApproval={enabled:true,approvalId:'synthetic-budget-test',model:'fixture-model',
  inputUsdPerMillion:.75,outputUsdPerMillion:4.5,maxInputTokens:24000,maxOutputTokens:4000,
  priceReviewedOn:new Date().toISOString().slice(0,10)};
interface ProviderRequest {
  instructions:string;input:string|Array<{role:string;content:Array<{type:string;text?:string;image_url?:string}>}>;max_output_tokens:number;
  text:{format:{name:string;strict:boolean;schema:{required:string[];properties:Record<string,unknown>;$defs?:unknown}}};
}
function harness(overrides:Partial<AgentApproval>={},reply:GeneratedGame=hopper){
  const requests:ProviderRequest[]=[];let keyReads=0;
  const agent=new OpenAIResponsesAgent({...approval,...overrides},()=>{keyReads++;return 'synthetic-only-no-provider-key';},
    (async(url,options)=>{
      assert.equal(url,'https://api.openai.com/v1/responses');
      const request:ProviderRequest=JSON.parse(String(options?.body));requests.push(request);
      const value=request.text.format.name==='family_game_plan'?fixturePlanProposal(request):
        {...fixtureModuleReply(reply),...(reply.creationManifest?{creationManifest:reply.creationManifest}:{})};
      return new Response(JSON.stringify({status:'completed',usage:{input_tokens:100,output_tokens:100},
        output:[{content:[{type:'output_text',text:JSON.stringify(value)}]}]}));
    }) as typeof fetch);
  return {agent,requests,get keyReads(){return keyReads;}};
}
function input(game:GeneratedGame=hopper,maxUnits=120000):AgentInput {
  return {gameManifest:{id:'new',allowedMechanics:['generated-module-v1','generated-module-v2']},
    baseRevision:{id:'saved-base',game},childIntent:'Keep this game and make the character move faster.',
    allowedCapabilities:['generated-module-v1','generated-module-v2'],
    budget:{maxUnits,timeoutMs:1000},signal:new AbortController().signal};
}
function padded(game:GeneratedGame,bytes:number):GeneratedGame {
  // A valid inert comment isolates prompt size without changing fixture behavior.
  return {...game,source:game.source+'/*'+'x'.repeat(bytes-Buffer.byteLength(game.source)-4)+'*/'};
}
function withCompanion(game:GeneratedGame):GeneratedGame {
  return validateGenerated({...game,creationManifest:{schema:'jems.creation.v1',id:'companion',title:'Dragon companion',
    width:800,height:450,background:'meadow',actors:[{id:'dragon',name:'Dragon',assetId:'dragon',x:120,y:250}],
    programs:[{id:'dance-script',actorId:'dragon',trigger:{type:'tap'},actions:[{id:'dance',type:'dance',durationMs:500}]}],variables:{}}});
}
function contextFor(original:AgentInput):GenerationContext {
  const style=presentationBrief(original).preferredStyle||'flat-2d';
  return {plan:bindGameProductionPlan({presentationStyle:style,playerAction:'Use the ordinary game controls.',
    payoff:'Reach the visible result requested by the child.',variation:'Try different choices and recover.',openEnded:true,artRequests:[]},original),
    assets:{version:'game-assets-v1',style,assets:[]}};
}
function userText(request:ProviderRequest):string {
  return typeof request.input==='string'?request.input:request.input[0].content[0].text!;
}
function captures(request:ProviderRequest){
  return typeof request.input==='string'?[]:request.input[0].content.filter(item=>item.type==='input_image');
}
function bound(request:ProviderRequest):number {
  return Buffer.byteLength(userText(request))+Buffer.byteLength(request.instructions)+Buffer.byteLength(JSON.stringify(request.text.format.schema))+1024+captures(request).length*4096;
}
function worst(request:ProviderRequest):number {
  return Math.ceil(bound(request)*approval.inputUsdPerMillion+request.max_output_tokens*approval.outputUsdPerMillion);
}
function assertLean(request:ProviderRequest,original:AgentInput,game:GeneratedGame,diagnostics:string|null=null,context?:GenerationContext){
  assert.deepEqual(request.text.format.schema.required,['kind','title','instructions','source','controls','playthrough']);
  assert.ok(request.text.format.schema.properties.playthrough);
  assert.equal(request.text.format.schema.properties.creationManifest,undefined);
  assert.equal(request.text.format.schema.$defs,undefined);
  assert.equal(request.text.format.strict,true);
  assert.doesNotMatch(request.instructions,/Optional editable companion/);
  assert.match(request.instructions,/Math is required/);
  assert.match(request.instructions,/Follow the production plan/);
  assert.match(request.instructions,/Include a playthrough/);
  const data=JSON.parse(userText(request));
  assert.equal(data.idea,original.childIntent);
  assert.deepEqual(data.base,{kind:game.kind,title:game.title,instructions:game.instructions,source:game.source,controls:game.controls});
  assert.equal(data.feedback,diagnostics);
  assert.deepEqual(data.gameDesignPreflight,privateGenerationPreflight(original).brief);
  assert.deepEqual(data.presentationBrief,presentationBrief(original));
  assert.deepEqual(data.productionPlan,context?.plan||null);
  assert.deepEqual(data.approvedAssetMetadata,context?.assets?.assets.map(({data,...metadata})=>metadata)||[]);
  assert.equal(request.max_output_tokens,approval.maxOutputTokens);
}

test('a companion remains available when the complete request fits the existing caps',async()=>{
  const game=withCompanion(hopper),h=harness({},game);
  const result=await h.agent.generate(input(game));
  assert.equal(h.keyReads,1);assert.equal(h.requests.length,1);
  const request=h.requests[0];
  assert.ok(request.text.format.schema.properties.creationManifest);
  assert.ok(request.text.format.schema.$defs);
  assert.match(request.instructions,/Optional editable companion/);
  assert.deepEqual(JSON.parse(userText(request)).base.creationManifest,game.creationManifest);
  assert.deepEqual((result.candidate.game as GeneratedGame).creationManifest,game.creationManifest);
  assert.ok(bound(request)<approval.maxInputTokens);
});

for(const [name,game] of [['rule-driven 8k source',padded(hopper,8000)],['physical 6.5k source',padded(physicalWorkshop,6500)]] as const){
  test(`${name} still generates under the default 24k cap by omitting the optional companion`,async()=>{
    const original=input(game),context=game.kind==='generated-module-v2'?contextFor(original):undefined,h=harness({},game);
    await h.agent.generate(original,context);
    assert.equal(h.keyReads,1);assert.equal(h.requests.length,1);
    assertLean(h.requests[0],original,game,null,context);
    assert.ok(bound(h.requests[0])<=24000);
    assert.ok(worst(h.requests[0])<=original.budget.maxUnits);
    if(name.startsWith('physical'))assert.match(h.requests[0].instructions,/physics.part/);
    else assert.doesNotMatch(h.requests[0].instructions,/physics.part/);
  });
}

test('a 7k repair preserves source, original intent, preflight and bounded diagnostics without a stale companion',async()=>{
  const previous=withCompanion(padded(hopper,7000)),original=input(),diagnostics='Observed repair failure: '+'d'.repeat(1700),h=harness();
  const result=await h.agent.repair(original,previous,diagnostics);
  assert.equal(h.keyReads,1);assert.equal(h.requests.length,1);
  assertLean(h.requests[0],original,previous,diagnostics.slice(0,1500));
  assert.equal((result.candidate.game as GeneratedGame).creationManifest,undefined);
  assert.ok(bound(h.requests[0])<=24000);
  assert.equal(original.baseRevision.game,hopper);
});

test('remaining spending allowance selects the lean request without another provider call or a cap increase',async()=>{
  const game=withCompanion(padded(hopper,2000)),original=input(game,32000),h=harness();
  const complete=harness();await complete.agent.generate(input(game));
  assert.ok(complete.requests[0].text.format.schema.properties.creationManifest);
  assert.ok(bound(complete.requests[0])<=24000,'the spending case must fit the input cap');
  assert.ok(worst(complete.requests[0])>original.budget.maxUnits);
  const result=await h.agent.generate(original);
  assert.equal(h.keyReads,1);assert.equal(h.requests.length,1);
  assertLean(h.requests[0],original,game);
  assert.ok(worst(h.requests[0])<=32000);
  assert.equal(result.usageUnits,525);
  assert.equal((result.candidate.game as GeneratedGame).creationManifest,undefined);
});

test('v2 companion fallback preserves production, approved art and both repair-device captures',async()=>{
  const original=input(stickerLaunchFixture),context=contextFor(original);
  context.assets!.assets.push(makeRasterAsset({id:'room',role:'background',mime:'image/png',bytes:syntheticEvidencePng(30),
    provenance:{kind:'approved-library',sourceId:'synthetic-budget-room'}}));
  const previous=withCompanion({...stickerLaunchFixture,productionPlan:context.plan,assets:context.assets,playthrough:fixturePlaythrough});
  const code=transformSync(previous.source,{loader:'ts',format:'iife',globalName:'GameModule'}).code,rt=runtimeBundle();
  previous.compiled={code,sourceHash:hash(previous.source),codeHash:hash(code),runtimeVersion:rt.version,runtimeHash:rt.hash,
    assetsHash:assetPackHash(previous.assets),tests:{desktop:true,mobile:true,replay:true,isolation:true,input:true,resources:true,pause:true}};
  context.qualityEvidence=syntheticQualityEvidence(previous);
  const diagnostics='INPUT_RESPONSE_FAILED',h=harness({maxInputTokens:28000},stickerLaunchFixture);
  const result=await h.agent.repair(original,previous,diagnostics,context);
  assert.equal(h.keyReads,1);assert.equal(h.requests.length,1,'a supplied request-bound plan and art need only the selected source request');
  const request=h.requests[0];assertLean(request,original,previous,diagnostics,context);
  assert.equal(captures(request).length,2);
  assert.ok(bound(request)<=28000);
  const evidence=context.qualityEvidence;
  assert.deepEqual(JSON.parse(userText(request)).previousPlayEvidence,{sessions:evidence.sessions,captures:evidence.captures.map(({data,...metadata})=>metadata)});
  assert.ok(Array.isArray(request.input));
  const imageMetadata=request.input[0].content.slice(1).filter(item=>item.type==='input_text').map(item=>JSON.parse(item.text!));
  assert.deepEqual(imageMetadata.map(metadata=>[metadata.device,metadata.phase]),[['desktop','progress'],['tablet','progress']]);
  const game=result.candidate.game as GeneratedGame;
  assert.deepEqual(game.productionPlan,context.plan);assert.deepEqual(game.assets,context.assets);assert.deepEqual(game.playthrough,fixturePlaythrough);
  assert.equal(game.creationManifest,undefined);
  const insufficient=harness({maxInputTokens:bound(request)-1},stickerLaunchFixture);
  await assert.rejects(insufficient.agent.repair(original,previous,diagnostics,context),/INPUT_TOKEN_LIMIT/);
  assert.equal(insufficient.keyReads,0);assert.equal(insufficient.requests.length,0,'the adapter cannot drop the second device to fit a cap');
});

test('an already oversized game still fails the input cap before any secret read or provider call',async()=>{
  const h=harness();await assert.rejects(h.agent.generate(input(padded(hopper,15000))),/INPUT_TOKEN_LIMIT/);
  assert.equal(h.keyReads,0);assert.equal(h.requests.length,0);
});

test('an insufficient lean spending allowance still fails closed before any secret read or provider call',async()=>{
  const h=harness();await assert.rejects(h.agent.generate(input(hopper,1000)),/SPENDING_CUTOFF/);
  assert.equal(h.keyReads,0);assert.equal(h.requests.length,0);
});

test('lean input and spending checks include the schema bytes rather than restoring the former undercount',async()=>{
  const original=input(padded(hopper,8000)),sample=harness();await sample.agent.generate(original);
  assertLean(sample.requests[0],original,original.baseRevision.game as GeneratedGame);
  const actualBound=bound(sample.requests[0]),actualWorst=worst(sample.requests[0]);
  const inputLimited=harness({maxInputTokens:actualBound-1});
  await assert.rejects(inputLimited.agent.generate(original),/INPUT_TOKEN_LIMIT/);
  assert.equal(inputLimited.keyReads,0);assert.equal(inputLimited.requests.length,0);
  const spendLimited=harness();
  await assert.rejects(spendLimited.agent.generate({...original,budget:{...original.budget,maxUnits:actualWorst-1}}),/SPENDING_CUTOFF/);
  assert.equal(spendLimited.keyReads,0);assert.equal(spendLimited.requests.length,0);
});
