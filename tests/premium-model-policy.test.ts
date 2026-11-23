import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {OpenAIResponsesAgent} from '../server/agent/openai';
import {
 INITIAL_PREMIUM_MODELS,PREMIUM_POLICY_VERSION,PremiumGenerationError,
 premiumJobReserve,validateApproval,validatePremiumApproval,validateStageUsage,
 type ModelStage,type PremiumApproval,type PremiumStagePolicy,type StageUsage
} from '../server/agent/model-policy';
import type {GeneratedGame} from '../server/agent/generated';
import type {SuggestedPlaythrough} from '../server/quality/presentation-plan';
import {captureHorizon} from '../server/quality/game-quality-evidence.cjs';
import type {AgentInput} from '../server/pipeline/types';
import {fixtureModuleReply,fixturePremiumPlanProposal,syntheticQualityEvidence,syntheticPremiumReviewAnswer} from '../server/testing/presentation-quality-fixtures';
import {hopper} from '../server/testing/generated-fixtures';
import {stickerLaunchFixture} from '../server/testing/working-game-fixtures';
import {compiledPipelineFixture} from './quality-pipeline-fixtures';

const today=new Date().toISOString().slice(0,10);
function policy():PremiumApproval{
 function stage(name:ModelStage):PremiumStagePolicy{
  const model=INITIAL_PREMIUM_MODELS[name],astra=model==='gpt-6.2-astra';
  return {model,reasoningEffort:'high',maxInputTokens:64000,maxOutputTokens:astra?24000:6000,
   inputUsdPerMillion:astra?8:2,outputUsdPerMillion:astra?40:10,priceReviewedOn:today,
   providerAccessReviewedOn:today,lowDetailImageTokens:4096,zdrApproved:true};
 }
 return {version:PREMIUM_POLICY_VERSION,enabled:true,approvalId:'synthetic-policy',maxRepairAttempts:2,
  stages:{planning:stage('planning'),construction:stage('construction'),review:stage('review'),repair:stage('repair')}};
}
const input:AgentInput={gameManifest:{id:'new',allowedMechanics:['generated-module-v2']},baseRevision:{id:'new'},
 childIntent:'Tap to build a sticker rocket, then watch it launch.',allowedCapabilities:['generated-module-v2'],
 budget:{maxUnits:10000000,timeoutMs:60000},signal:new AbortController().signal};
interface Wire {
 model:string;input:unknown;store:boolean;service_tier:string;max_output_tokens:number;instructions:string;
 prompt_cache_options:{mode:string};reasoning:{effort:string};text:{format:{name:string;strict:boolean}};
}
function reply(wire:Wire,overrides:Record<string,unknown>={}){
 const name=wire.text.format.name;
 const value=name==='family_game_plan'?fixturePremiumPlanProposal(wire):name==='family_game_quality'?syntheticPremiumReviewAnswer():{
  ...fixtureModuleReply(stickerLaunchFixture),playthrough:[{type:'hold',control:'action',frames:60}]
 };
 return Response.json({model:wire.model,service_tier:'default',status:'completed',
  output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}],
  usage:{input_tokens:100,output_tokens:700,output_tokens_details:{reasoning_tokens:480}},...overrides});
}
function harness(approval:PremiumApproval=policy(),respond:(wire:Wire)=>Response=reply){
 const sent:Wire[]=[];let keys=0;
 const agent=new OpenAIResponsesAgent(approval,()=>{keys++;return 'locally-mocked-explicit-key';},async(_url,options)=>{
  const wire=JSON.parse(String(options?.body));sent.push(wire);return respond(wire);
 });
 return {agent,sent,get keys(){return keys;}};
}
function usage(result:object):StageUsage[]{
 assert.ok('stageUsage' in result&&Array.isArray(result.stageUsage));
 return result.stageUsage;
}

test('private premium requests use independent verified profiles, strict schemas, uncached Standard tier and full reasoning-inclusive ceilings',async()=>{
 const approval=policy();
 approval.stages.planning={...approval.stages.construction,maxOutputTokens:9000};
 const h=harness(approval),generated=await h.agent.generate(input);
 const game=generated.candidate.game as GeneratedGame;
 assert.equal(game.productionPlan?.version,'game-production-plan-v2');
 const repaired=await h.agent.repair(input,game,'Repair the missing visible response.');
 const compiled=compiledPipelineFixture(game),reviewed=await h.agent.review(input,compiled,syntheticQualityEvidence(compiled));
 assert.deepEqual(h.sent.map(w=>[w.text.format.name,w.model,w.reasoning.effort,w.max_output_tokens]),[
  ['family_game_plan','gpt-6.2-astra','high',9000],['family_game_module','gpt-6.2-astra','high',24000],
  ['family_game_module','gpt-6.2-astra','high',24000],['family_game_quality','gpt-6.2-sol','high',6000]
 ]);
 for(const w of h.sent){
  assert.equal(w.store,false);assert.equal(w.service_tier,'default');assert.equal(w.text.format.strict,true);
  assert.deepEqual(w.prompt_cache_options,{mode:'explicit'});
 }
 assert.deepEqual(usage(generated).map(row=>row.stage),['planning','construction']);
 assert.deepEqual(usage(repaired).map(row=>row.stage),['repair']);
 assert.deepEqual(usage(reviewed).map(row=>row.stage),['review']);
 const rows=validateStageUsage(approval,usage(generated),'construction',generated.usageUnits,0);
 assert.equal(rows[1].outputTokens,700);assert.equal(rows[1].reasoningTokens,480);
 assert.equal(generated.usageUnits,2*(100*8+700*40));
 assert.equal(reviewed.usageUnits,100*2+700*10);
 assert.equal(h.keys,4);
 const codeInstructions=h.sent[1].instructions;
 assert.match(codeInstructions,/playthrough of 1\.\.128/);
 assert.doesNotMatch(codeInstructions,/playthrough of 1\.\.16|<=600 total/);
});

test('fixed coding selection rejects every downgrade, extra effort, stale access, wrong rates and unreviewed bounds before credentials',()=>{
 const invalid:Array<(a:PremiumApproval)=>unknown>=[
  a=>Object.assign(a.stages.construction,{model:'gpt-6.2-sol'}),
  a=>Object.assign(a.stages.repair,{model:'gpt-5.4-mini'}),
  ...['low','medium','xhigh','max','pro'].map(effort=>(a:PremiumApproval)=>Object.assign(a.stages.repair,{reasoningEffort:effort})),
  a=>Object.assign(a.stages.planning,{model:'__proto__'}),
  a=>Object.assign(a.stages.review,{model:'unknown'}),
  a=>Object.assign(a.stages.review,{providerAccessReviewedOn:'2000-01-01'}),
  a=>Object.assign(a.stages.planning,{zdrApproved:false}),
  a=>Object.assign(a.stages.construction,{inputUsdPerMillion:0.01}),
  a=>Object.assign(a.stages.construction,{priceReviewedOn:'2026-02-30'}),
  a=>Object.assign(a.stages.planning,{maxOutputTokens:16001}),
  a=>Object.assign(a.stages.repair,{maxOutputTokens:32001}),
  a=>Object.assign(a.stages.review,{lowDetailImageTokens:0}),
  a=>Object.assign(a.stages.review,{maxInputTokens:4*4096}),
  a=>Object.assign(a.stages.construction,{maxInputTokens:2000}),
  a=>Object.assign(a.stages.review,{lowDetailImageTokens:20000}),
  a=>Object.assign(a,{maxRepairAttempts:3}),
  a=>Object.assign(a,{unexpectedCredential:'synthetic'}),
  a=>Object.assign(a.stages.planning,{untrustedPrivateData:'synthetic'})
 ];
 for(const mutate of invalid){
  const a=policy();mutate(a);assert.throws(()=>harness(a),/PREMIUM_/);
 }
 const legacy={...policy().stages.construction,enabled:true,approvalId:'legacy',maxOutputTokens:16000,reasoningEffort:'low' as const};
 assert.doesNotThrow(()=>validateApproval(legacy));
 assert.throws(()=>validateApproval({...legacy,maxOutputTokens:16001}),/OWNER_APPROVAL/);
 assert.throws(()=>validateApproval({...legacy,reasoningEffort:'xhigh' as 'low'}),/OWNER_APPROVAL/);
});

test('whole-job reservation covers all permitted plans, coding, reviews, asset repairs and separately priced images',()=>{
 const a=policy();a.maxRepairAttempts=1;
 a.images={enabled:true,approvalId:'unit-image',model:'mock-images',maxImages:2,maxMicroUsdPerImage:10000,priceReviewedOn:today};
 const astra=64000*8+24000*40,sol=64000*2+6000*10;
 assert.equal(premiumJobReserve(a),2*(astra+2*sol+20000));
 a.maxRepairAttempts=2;assert.equal(premiumJobReserve(a),3*(astra+2*sol+20000));
 assert.throws(()=>validatePremiumApproval({...a,enabled:false}),/APPROVAL/);
});

test('budget denial, cancellation and inactive policies stop before a credential lookup or POST',async()=>{
 const h=harness();
 for(const override of [{budget:{...input.budget,maxUnits:10}},{signal:AbortSignal.abort()}])
  await assert.rejects(h.agent.generate({...input,...override}),error=>error instanceof PremiumGenerationError&&error.usageComplete&&error.usageUnits===0);
 assert.equal(h.keys,0);assert.equal(h.sent.length,0);
 const off=harness({...policy(),enabled:false});
 await assert.rejects(off.agent.generate(input),/APPROVAL/);
 assert.equal(off.keys,0);assert.equal(off.sent.length,0);
});

test('failed or interrupted construction never selects an alternate model or replays a paid request',async()=>{
 for(const [status,code] of [[403,'MODEL_ACCESS_UNAVAILABLE'],[404,'MODEL_ACCESS_UNAVAILABLE'],[429,'PROVIDER_RATE_LIMIT'],[503,'PROVIDER_REQUEST_FAILED']] as const){
  const h=harness(policy(),wire=>wire.text.format.name==='family_game_plan'?reply(wire):new Response(null,{status}));
  await assert.rejects(h.agent.generate(input),error=>{
   assert.ok(error instanceof PremiumGenerationError);assert.equal(error.message,code);
   assert.equal(error.usageComplete,status!==503);assert.equal(error.usageUnits,7200);
   assert.deepEqual(error.stageUsage.map(row=>row.stage),['planning']);return true;
  });
  assert.deepEqual(h.sent.map(w=>w.model),['gpt-6.2-sol','gpt-6.2-astra']);
 }
});

test('completed billing survives incomplete content; disputed model, tier, metering or cache usage stays uncertain',async()=>{
 for(const [override,complete,code] of [
  [{status:'incomplete',output:[]},true,'PROVIDER_INCOMPLETE'],
  [{model:'gpt-6.2-sol'},false,'MODEL_POLICY_MISMATCH'],
  [{service_tier:'priority'},false,'MODEL_POLICY_MISMATCH'],
  [{reasoning:{effort:'medium'}},false,'MODEL_POLICY_MISMATCH'],
  [{usage:{input_tokens:100,output_tokens:800,output_tokens_details:{reasoning_tokens:900}}},false,'PROVIDER_USAGE_INVALID'],
  [{usage:{input_tokens:100,output_tokens:800,output_tokens_details:{reasoning_tokens:50},input_tokens_details:{cache_write_tokens:10}}},false,'PROVIDER_USAGE_INVALID']
 ] as const){
  const h=harness(policy(),wire=>reply(wire,wire.text.format.name==='family_game_module'?override:{}));
  await assert.rejects(h.agent.generate(input),error=>{
   assert.ok(error instanceof PremiumGenerationError);assert.equal(error.message,code);assert.equal(error.usageComplete,complete);
   assert.equal(error.usageUnits,7200+(complete?28800:0));return true;
  });
  assert.equal(h.sent.length,2);
 }
});

test('receipt settlement rejects stage substitution, duplicated receipts, rate forgery, extra content and unapproved image charges',async()=>{
 const a=policy(),h=harness(a),generated=await h.agent.generate(input),rows=usage(generated);
 for(const forged of [[rows[0],rows[0]],[...rows].reverse(),[rows[0],{...rows[1],model:'gpt-6.2-sol'}],
  [{...rows[0],privatePrompt:'invalid'},rows[1]],[rows[0],{...rows[1],costMicroUsd:1}]]){
  assert.throws(()=>validateStageUsage(a,forged,'construction',generated.usageUnits,0),/PREMIUM_USAGE_INVALID/);
 }
 assert.throws(()=>validateStageUsage(a,rows,'construction',generated.usageUnits+1,1),/PREMIUM_USAGE_INVALID/);
 assert.throws(()=>validateStageUsage(a,rows,'review',generated.usageUnits,0),/PREMIUM_USAGE_INVALID/);
 assert.doesNotThrow(()=>validateStageUsage(a,[rows[0]],'construction',rows[0].costMicroUsd,0,true));
});


test('premium v2 repairs preserve the verified pre-edit source alongside a rejected candidate',async()=>{
 const h=harness(),original={...stickerLaunchFixture,source:stickerLaunchFixture.source+'\n// Family verified revision.'};
 const edit={...input,baseRevision:{id:'verified-base',game:original}};
 const {candidate}=await h.agent.generate(edit);
 const previous=candidate.game as GeneratedGame;
 await h.agent.repair(edit,previous,'INPUT_UNCLEAR');
 const data=JSON.parse(h.sent.at(-1)!.input as string);
 assert.equal(data.verifiedBase.revisionId,'verified-base');assert.equal(data.verifiedBase.source,original.source);
 assert.equal(data.base.source,previous.source);assert.equal(data.verifiedBase.compiled,undefined);
});

test('saved v1 cannot enter the premium-only v2 acceptance contract or spend on a replacement',async()=>{
 const h=harness();
 await assert.rejects(h.agent.generate({...input,baseRevision:{id:'saved-v1',game:hopper}}),/PREMIUM_V2_REQUIRED/);
 assert.equal(h.keys,0);assert.equal(h.sent.length,0);
});

test('an interrupted second approved image retains the first flat image allowance and the measured plan',async()=>{
 const a=policy();a.images={enabled:true,approvalId:'synthetic-art',model:'mock-image',maxImages:2,
  maxMicroUsdPerImage:25000,priceReviewedOn:today};
 let images=0;
 const agent=new OpenAIResponsesAgent(a,()=>'synthetic-private-test-key',async(url,init)=>{
  const wire=JSON.parse(String(init?.body));
  if(String(url).endsWith('/images/generations')){
   images++;
   if(images===2)throw Error('interrupted');
   const bytes=readFileSync(new URL('../public/gem-factory-helper.webp',import.meta.url));
   return Response.json({data:[{b64_json:bytes.toString('base64')}]});
  }
  const design={...fixturePremiumPlanProposal(wire),artRequests:['rocket','sticker'].map(id=>({
   id,role:'object',sampling:'smooth',prompt:'Isolated bright cutout to use as a separate game object.'
  }))};
  return reply(wire,{output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(design)}]}]});
 });
 await assert.rejects(agent.generate(input),error=>{
  assert.ok(error instanceof PremiumGenerationError);assert.equal(error.usageComplete,false);
  assert.equal(error.imageUsageUnits,25000);assert.equal(error.usageUnits,32200);
  assert.deepEqual(error.stageUsage.map(row=>row.stage),['planning']);return true;
 });
 assert.equal(images,2);
});

test('legacy workers cannot replan or recode a premium revision during rollback',async()=>{
 const premium=harness(),{candidate}=await premium.agent.generate(input);
 let keys=0,calls=0;
 const legacy=new OpenAIResponsesAgent({enabled:true,approvalId:'legacy-approval',model:'legacy-fixture',
  inputUsdPerMillion:1,outputUsdPerMillion:2,maxInputTokens:64000,maxOutputTokens:4000,priceReviewedOn:today},()=>{
  keys++;return 'local-only-test-key';},async()=>{calls++;throw Error('UNEXPECTED_PROVIDER_REQUEST');});
 const game=candidate.game as GeneratedGame,edit={...input,baseRevision:{id:'kept-premium',game}};
 await assert.rejects(legacy.generate(edit),/MODEL_POLICY_UNAVAILABLE/);
 await assert.rejects(legacy.plan(edit),/MODEL_POLICY_UNAVAILABLE/);
 await assert.rejects(legacy.repair(input,game,'VISUAL_PLACEHOLDER_APPEARANCE'),/MODEL_POLICY_UNAVAILABLE/);
 assert.equal(keys,0);assert.equal(calls,0);
});

test('review admits all 128 actual input receipts per device and all eight captures under the 64k stage limit',async()=>{
 const h=harness(),{candidate}=await h.agent.generate(input);
 const playthrough:SuggestedPlaythrough=Array.from({length:128},(_,index)=>index===0?
  {type:'hold',control:'action',frames:45}:{type:'drag',x:24+index,y:68,x2:500,y2:130+index,frames:45});
 const game=compiledPipelineFixture({...candidate.game as GeneratedGame,playthrough});
 const evidence=syntheticQualityEvidence(game);
 for(const session of evidence.sessions){
  const {beforeHash,afterHash}=session.actionTrace[0];
  session.actionTrace=playthrough.map((action,index)=>({index,action,startTick:index*45,endTick:(index+1)*45,beforeHash,afterHash}));
  session.simulatedTicks=captureHorizon(game);session.inputs=128;session.visibleChanges=128;
 }
 for(const image of [...evidence.captures]){
  if(image.phase==='progress')image.tick=45;
  evidence.captures.push({...image,id:image.id+'-more',phase:'interaction',tick:1200});
 }
 const review=await h.agent.review(input,game,evidence);
 assert.equal(usage(review)[0].stage,'review');
 const wire=h.sent.at(-1)!.input as Array<{content:Array<{type:string;text?:string}>}>;
 assert.equal(wire[0].content.filter(row=>row.type==='input_image').length,8);
 const payload=JSON.parse(wire[0].content[0].text!).evidence;
 assert.deepEqual(payload.observedActions,playthrough);
 assert.deepEqual(payload.traceColumns,['actionIndex','startTick','endTick','sceneChanged']);
 for(const session of payload.sessions){
  assert.equal(session.actionTrace.length,128);
  assert.deepEqual(session.actionTrace[127],[127,5715,5760,true]);
 }
 assert.equal(evidence.sessions[0].actionTrace[127].afterHash.length,64);
 assert.ok(!wire[0].content[0].text!.includes(evidence.sessions[0].actionTrace[127].afterHash));
});

test('worker deadlines and user aborts retain uncertain paid accounting without a transport retry',async()=>{
 for(const [name,code] of [['TimeoutError','PROVIDER_TIMEOUT'],['AbortError','CANCELLED']]){
  const h=harness(policy(),wire=>{
   if(wire.text.format.name==='family_game_plan')return reply(wire);
   throw new DOMException('transport detail',name);
  });
  await assert.rejects(h.agent.generate(input),error=>{
   assert.ok(error instanceof PremiumGenerationError);assert.equal(error.message,code);
   assert.equal(error.usageComplete,false);assert.equal(error.usageUnits,7200);return true;
  });
  assert.equal(h.sent.length,2);
 }
});

test('a well-formed but ungrounded independent pass yields a measured unverified review and does not replay inference',async()=>{
 const h=harness(policy(),wire=>{
  if(wire.text.format.name!=='family_game_quality')return reply(wire);
  const answer={...syntheticPremiumReviewAnswer(),observations:[]};
  return reply(wire,{output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(answer)}]}]});
 });
 const {candidate}=await h.agent.generate(input),game=compiledPipelineFixture(candidate.game as GeneratedGame);
 const result=await h.agent.review(input,game,syntheticQualityEvidence(game));
 assert.equal(result.review.verdict,'unverified');assert.ok(result.review.findings.includes('QUALITY_EVIDENCE_INCOMPLETE'));
 assert.equal(result.usageUnits,7200);assert.equal(usage(result)[0].stage,'review');
 assert.equal(h.sent.filter(w=>w.text.format.name==='family_game_quality').length,1);
});

test('repair identifies an agreed control with no changed input receipt on each tested device',async()=>{
 const h=harness(),{candidate}=await h.agent.generate(input),tap={type:'tap' as const,x:240,y:120,frames:60};
 const game=compiledPipelineFixture({...candidate.game as GeneratedGame,playthrough:[tap]});
 const evidence=syntheticQualityEvidence(game);
 for(const session of evidence.sessions)session.actionTrace[0].action=tap;
 await h.agent.repair(input,game,'QUALITY_EVIDENCE_INCOMPLETE',{qualityEvidence:evidence});
 const content=(h.sent.at(-1)!.input as Array<{content:Array<{text:string}>}>)[0].content;
 const previous=JSON.parse(content[0].text).previousPlayEvidence;
 assert.deepEqual(previous.missingChangedInputReceipts,[
  {interaction:0,device:'desktop',input:'action'},{interaction:0,device:'tablet',input:'action'}
 ]);
 assert.deepEqual(previous.observedActions,[tap]);
});

test('a plan requiring more distinct proof than the eight captures can provide stops before code or art',async()=>{
 const h=harness(policy(),wire=>{
  const plan=fixturePremiumPlanProposal(wire);
  const interactions=['action','down','tap','drag'].map(control=>({action:'Use the '+control+' input.',input:control,consequence:'The requested object moves.'}));
  const value={...plan,design:{...plan.design,interactions}};
  return reply(wire,{output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]});
 });
 await assert.rejects(h.agent.generate(input),error=>{
  assert.ok(error instanceof PremiumGenerationError);
  assert.equal(error.message,'QUALITY_EVIDENCE_CAPACITY_EXCEEDED');assert.equal(error.usageComplete,true);
  assert.equal(error.usageUnits,7200);assert.deepEqual(error.stageUsage.map(row=>row.stage),['planning']);return true;
 });
 assert.equal(h.sent.length,1);assert.equal(h.keys,1);
});
