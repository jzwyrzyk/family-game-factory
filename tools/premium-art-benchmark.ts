// Offline authored games only. Every transport response is constructed here; the worker
// receives its browser path and the game. No secrets, endpoint selectors or remote input.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {compareSchedule} from './premium-art-scheduling';
import {artCases,authoredCase,type ArtCase} from './premium-art-cases';
import {OpenAIResponsesAgent} from '../server/agent/openai';
import {validateCompiled,type GeneratedGame} from '../server/agent/generated';
import {qualityEvidenceHash,validateQualityEvidence} from '../server/quality/game-quality';
import {renderGeneratedV2} from '../server/sandbox/preview-v2.cjs';
import {INITIAL_PREMIUM_MODELS,premiumModelRates,premiumJobReserve,type ModelStage,type PremiumApproval} from '../server/agent/model-policy';
import {fixedInputBound} from '../server/agent/generation-contract';
const sha=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex');
export function fixtureApproval():PremiumApproval{
 const today=new Date().toISOString().slice(0,10);
 const stages=Object.fromEntries(Object.entries(INITIAL_PREMIUM_MODELS).map(([name,model])=>{
  const rate=premiumModelRates(model)!;
  return [name,{model,reasoningEffort:'high',priceReviewedOn:today,providerAccessReviewedOn:today,zdrApproved:true,
   maxInputTokens:64000,maxOutputTokens:model===INITIAL_PREMIUM_MODELS.repair?6000:3000,inputUsdPerMillion:rate.input,
   outputUsdPerMillion:rate.output,lowDetailImageTokens:4096}];
 })) as PremiumApproval['stages'];
 return {version:'adult-astra-high-v1',enabled:true,approvalId:'offline-only',stages,maxRepairAttempts:1,
  images:{approvalId:'synthetic-images',enabled:true,model:'offline-image-fixture',maxImages:2,maxMicroUsdPerImage:50000,priceReviewedOn:today,sheetFormat:'rgba8-png-grid-v1'}};
}
async function trial(id:ArtCase,directory:string) {
 const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 const verifySource=()=>execFileSync('git',['diff','--quiet',sourceCommit,'--','server','src','tools','package.json','package-lock.json']);
 verifySource();
 const start=performance.now(),sample=authoredCase(id),approval=fixtureApproval();
 const input={gameManifest:{id:'new',allowedMechanics:['generated-module-v2']},baseRevision:{id:'new'},childIntent:sample.request,
  allowedCapabilities:['generated-module-v2'],signal:new AbortController().signal,budget:{maxUnits:premiumJobReserve(approval),timeoutMs:300000}};
 const bounds:{stage:ModelStage;images:number;textBytesAndFraming:number;screenshotTokens:number;inputBound:number}[]=[];
 const marks:{stage:string;elapsedMs:number}[]=[];
 const mark=(stage:string)=>marks.push({stage,elapsedMs:Math.round(performance.now()-start)});
 let repair=false,imageRequests=0;
 const adapter=new OpenAIResponsesAgent(approval,()=>'offline-transport-only',async(url,init)=>{
  const w=JSON.parse(String(init?.body));
  if(String(url).endsWith('/images/generations')){
   imageRequests++;mark('mock image '+imageRequests);
   return Response.json({data:[{b64_json:(w.output_format==='png'?sample.sheet:sample.scene).toString('base64')}]});
  }
  const name=w.text.format.name,stage:ModelStage=name==='family_game_plan'?'planning':name==='family_game_quality'?'review':repair?'repair':'construction';
  const parts=Array.isArray(w.input)?w.input[0].content:[{type:'input_text',text:w.input}];
  const images=parts.filter((p:any)=>p.type==='input_image').length;
  const textBytesAndFraming=fixedInputBound(w.instructions,w.text.format.schema)+parts.reduce((n:number,p:any)=>n+(p.type==='input_text'?Buffer.byteLength(p.text):0),0);
  bounds.push({stage,images,textBytesAndFraming,screenshotTokens:4096*images,inputBound:textBytesAndFraming+4096*images});
  const axes=['visual','intent','gameplay','input'];
  const value=stage==='planning'?sample.proposal:stage==='review'?{axes:Object.fromEntries(axes.map(k=>[k,'not-tested'])),
   findings:['QUALITY_EVIDENCE_INCOMPLETE'],evidenceByAxis:Object.fromEntries(axes.map(k=>[k,[]])),observations:[]}:sample.module;
  mark('mock '+stage);
  return Response.json({model:w.model,status:'completed',service_tier:'default',usage:{input_tokens:10,output_tokens:10,output_tokens_details:{reasoning_tokens:1}},
   output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]});
 });
 mark('fixture setup');
 const result=await adapter.generate(input),game=result.candidate.game as GeneratedGame;
 assert.equal(imageRequests,2);assert.ok('imageUsageUnits' in result);assert.equal(result.imageUsageUnits,100000);
 assert.equal(game.assets?.assets.length,1+sample.proposal.artDirection.subjects.length);
 mark('assembled candidate');
 const raw=JSON.parse(execFileSync(process.execPath,['server/sandbox/worker.cjs'],{input:JSON.stringify({game,captureQuality:true}),
  env:{HOME:'/tmp',PATH:process.env.PATH,WORKER_BROWSER_PATH:process.env.CHROMIUM_PATH||chromium.executablePath()},
  timeout:300000,maxBuffer:10*1024*1024}).toString());
 assert.equal(raw.ok,true,raw.diagnostics);
 const tested=validateCompiled(game,raw.game),e=validateQualityEvidence(tested,raw.qualityEvidence);
 mark('isolated browser test and capture');
 const dir=join(directory,id);mkdirSync(dir,{recursive:true});
 for(const c of e.captures)writeFileSync(join(dir,c.id+'.png'),Buffer.from(c.data,'base64'));
 assert.deepEqual(e.sessions.map(s=>s.outcome),['won','won'],JSON.stringify(e.sessions.map(s=>[s.device,s.outcome,s.actionTrace.length])));
 for(const session of e.sessions)for(const k of game.controls)assert.ok(session.actionTrace.some(t=>t.action.type==='hold'&&t.action.control===k&&t.beforeHash!==t.afterHash));
 const review=await adapter.review(input,tested,e);
 assert.equal(review.review.verdict,'unverified');
 repair=true;await adapter.repair(input,tested,'QUALITY_EVIDENCE_INCOMPLETE',{qualityEvidence:e});
 assert.equal(imageRequests,2,'mechanic repair preserves existing art');
 // Also measure the actual planning envelope used if a visual repair needs a fresh plan.
 await adapter.plan(input,{previous:tested,assetRepair:true,imagesAvailable:true,maxImages:2,qualityEvidence:e,findings:['VISUAL_INCOHERENT_ART']});
 mark('fixture repair and replan complete');
 const sized=structuredClone(approval);
 for(const stage of Object.keys(sized.stages) as ModelStage[])sized.stages[stage].maxInputTokens=Math.max(...bounds.filter(b=>b.stage===stage).map(b=>b.inputBound));
 const html=renderGeneratedV2(tested,'authored-'+id,'preview-authored-'+id).html;
 writeFileSync(join(dir,'play.html'),html);
 const schedules=[];
 for(const mode of ['serial','overlap','overlap','serial'] as const)schedules.push(await compareSchedule(id,mode,input.signal));
 assert.equal(new Set(schedules.map(s=>s.codeHash)).size,1);
 assert.equal(new Set(schedules.map(s=>s.assetsHash)).size,1);
 const firstPassMicroUsd=bounds.slice(0,3).reduce((total,b)=>{
  const policy=approval.stages[b.stage];
  return total+b.inputBound*policy.inputUsdPerMillion+policy.maxOutputTokens*policy.outputUsdPerMillion;
 },100000);
 verifySource();
 const receipt={schedules,firstPassMicroUsd,workerTimingsMs:raw.timings,version:'premium-art-trial-v1',sourceCommit,id,
  pairedCase:sample.pairedCase,requestHash:sha(sample.request),fixtureHash:sha(JSON.stringify(sample.proposal)),sourceHash:e.sourceHash,
  codeHash:e.codeHash,runtimeHash:e.runtimeHash,artifactHash:e.artifactHash,assetsHash:tested.compiled!.assetsHash,htmlHash:sha(html),
  dependencies:sha(readFileSync('package-lock.json')),sandboxDependencies:sha(readFileSync('server/sandbox/package-lock.json')),
  sceneHash:sha(sample.scene),sheetHash:sha(sample.sheet),assetIds:game.assets!.assets.map(({id,sha256,width,height})=>({id,sha256,width,height})),
  evidenceHash:qualityEvidenceHash(e),tests:tested.compiled!.tests,captures:e.captures.map(({data,...m})=>m),sessions:e.sessions,
  origin:'authored-fixture-mock-provider',paidCalls:0,actualProviderCharges:null,measuredAcceptance:null,queueMs:null,
  marks,bounds,stageCeilings:Object.fromEntries(Object.entries(sized.stages).map(([k,v])=>[k,{input:v.maxInputTokens,output:v.maxOutputTokens}])),
  assumedImageMicroUsd:50000,wholeJobReservationMicroUsd:premiumJobReserve(sized),capMicroUsd:1000000};
 writeFileSync(join(dir,'receipts.json'),JSON.stringify(receipt,null,2)+'\n');
 console.log(id,receipt.wholeJobReservationMicroUsd,receipt.sessions.map(s=>s.outcome).join('/'));
}
async function main(){
 const requested=process.argv[2];if(requested&&!artCases.includes(requested as ArtCase))throw Error('UNKNOWN_AUTHORED_FIXTURE');
 for(const id of artCases)if(!requested||requested===id)await trial(id,'test-results/premium-art');
}
if(process.argv[1]?.endsWith('premium-art-benchmark.ts'))void main().catch(e=>{console.error(e);process.exitCode=1;});
