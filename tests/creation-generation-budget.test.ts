import {test} from 'node:test';
import assert from 'node:assert/strict';
import {OpenAIResponsesAgent,type AgentApproval} from '../server/agent/openai';
import {validateGenerated,type GeneratedGame} from '../server/agent/generated';
import type {AgentInput} from '../server/pipeline/types';
import {privateGenerationPreflight} from '../server/quality/private-generation-preflight';
import {hopper} from '../server/testing/generated-fixtures';
import {physicalWorkshop} from '../server/testing/quality-generated-fixtures';

// The deployment template's 24k/4k caps and the documented owner setup's
// micro-USD rates. This transport is entirely local: no credentials or provider.
const approval:AgentApproval={enabled:true,approvalId:'synthetic-budget-test',model:'fixture-model',
  inputUsdPerMillion:.75,outputUsdPerMillion:4.5,maxInputTokens:24000,maxOutputTokens:4000,
  priceReviewedOn:new Date().toISOString().slice(0,10)};
interface ProviderRequest {
  instructions:string;input:string;max_output_tokens:number;
  text:{format:{strict:boolean;schema:{required:string[];properties:Record<string,unknown>;$defs?:unknown}}};
}
function harness(overrides:Partial<AgentApproval>={},reply:unknown=hopper){
  const requests:ProviderRequest[]=[];let keyReads=0;
  const agent=new OpenAIResponsesAgent({...approval,...overrides},()=>{keyReads++;return 'synthetic-only-no-provider-key';},
    (async(url,options)=>{
      assert.equal(url,'https://api.openai.com/v1/responses');
      requests.push(JSON.parse(String(options?.body)));
      return new Response(JSON.stringify({status:'completed',usage:{input_tokens:100,output_tokens:100},
        output:[{content:[{type:'output_text',text:JSON.stringify(reply)}]}]}));
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
function bound(request:ProviderRequest):number {
  return Buffer.byteLength(request.input)+Buffer.byteLength(request.instructions)+Buffer.byteLength(JSON.stringify(request.text.format.schema))+1024;
}
function worst(request:ProviderRequest):number {
  return Math.ceil(bound(request)*approval.inputUsdPerMillion+request.max_output_tokens*approval.outputUsdPerMillion);
}
function assertLean(request:ProviderRequest,original:AgentInput,game:GeneratedGame,diagnostics:string|null=null){
  assert.deepEqual(request.text.format.schema.required,['kind','title','instructions','source','controls']);
  assert.equal(request.text.format.schema.properties.creationManifest,undefined);
  assert.equal(request.text.format.schema.$defs,undefined);
  assert.equal(request.text.format.strict,true);
  assert.doesNotMatch(request.instructions,/Optional editable companion/);
  assert.match(request.instructions,/Math is required/);
  const data=JSON.parse(request.input);
  assert.equal(data.idea,original.childIntent);
  assert.deepEqual(data.base,{kind:game.kind,title:game.title,instructions:game.instructions,source:game.source,controls:game.controls});
  assert.equal(data.feedback,diagnostics);
  assert.deepEqual(data.gameDesignPreflight,privateGenerationPreflight(original).brief);
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
  assert.deepEqual(JSON.parse(request.input).base.creationManifest,game.creationManifest);
  assert.deepEqual((result.candidate.game as GeneratedGame).creationManifest,game.creationManifest);
  assert.ok(bound(request)<approval.maxInputTokens);
});

for(const [name,game] of [['rule-driven 8k source',padded(hopper,8000)],['physical 6.5k source',padded(physicalWorkshop,6500)]] as const){
  test(`${name} still generates under the default 24k cap by omitting the optional companion`,async()=>{
    const original=input(game),h=harness();await h.agent.generate(original);
    assert.equal(h.keyReads,1);assert.equal(h.requests.length,1);
    assertLean(h.requests[0],original,game);
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
  const game=withCompanion(padded(hopper,7000)),original=input(game,32000),h=harness();
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
