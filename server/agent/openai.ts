import type { AgentAdapter,AgentInput,CandidateArtifact } from '../pipeline/types';
import { privateGenerationPreflight } from '../quality/private-generation-preflight';
import { isGeneratedGame,validateGenerated,type GeneratedGame } from './generated';
import {requirePlannedAssets} from '../quality/art-direction';
import {validateAssetPack,type GameAssetPack} from './game-assets';
import {produceGameArt,validateImageApproval} from './illustrations';
import {presentationBrief,permitsNewArt,bindGameProductionPlan,assertProductionPlanBinding,productionPlanSchema,premiumProductionPlanSchema,type GameProductionPlan} from '../quality/presentation-plan';
import {bindProviderQualityReview,validateQualityEvidence,qualityReviewInstructions,qualityReviewSchema,premiumQualityReviewSchema,QUALITY_FINDINGS,type QualityFinding,type GameQualityEvidence} from '../quality/game-quality';
import {isPremiumApproval,stagePolicy,stageReserve,validateApproval,PremiumGenerationError,
 type GenerationApproval,type ModelStage,type PremiumStagePolicy,type StageUsage} from './model-policy';
export {validateApproval,type AgentApproval} from './model-policy';
import {premiumPlanningInstructions,premiumConstructionInstructions,premiumRepairInstructions,premiumReviewInstructions} from './premium-production';
import {generationInstructionsForForm,planningInstructions,gameSchema,companionGameSchema,premiumGameSchema,premiumCompanionSchema,fixedInputBound} from './generation-contract';
export {generationInstructions,generationInstructionsForForm} from './generation-contract';

interface StructuredRequest {stage:ModelStage;instructions:string;data:unknown;schema:unknown;name:string;images?:GameQualityEvidence['captures'];outputTokens?:number}
interface RequestMeter {stageUsage:StageUsage[];imageUsageUnits:number;unsettled:boolean}
// Premium request data already carries the full validated capture metadata.
// Label each adjacent image by that identity without repeating its dimensions,
// device and tick. Legacy requests retain their existing wire representation.
function imageLabel(image:GameQualityEvidence['captures'][number],premium:boolean){
 return JSON.stringify(premium?{captureId:image.id}:{captureId:image.id,device:image.device,phase:image.phase,tick:image.tick,width:image.width,height:image.height});
}
export interface GenerationContext {plan?:GameProductionPlan;assets?:GameAssetPack;qualityEvidence?:GameQualityEvidence}
export interface ProductionPlanOptions {imagesAvailable?:boolean;maxImages?:number;assetRepair?:boolean;previous?:GeneratedGame;qualityEvidence?:GameQualityEvidence;findings?:QualityFinding[]}
// Eight retained captures include an initial frame on each device. Every
// distinct essential interaction must have its own later image on both devices.
const observableInteractionsPerDevice=(8-2)/2;
function requireReviewCapacity(plan:GameProductionPlan){
 if(plan.version==='game-production-plan-v2'&&plan.design.interactions.length>observableInteractionsPerDevice)
  throw Error('QUALITY_EVIDENCE_CAPACITY_EXCEEDED');
}
// Both premium device traces have already been bound to the same indexed
// playthrough. Send the actual action data once, with every device-specific
// observation. The independent binder still receives the full original hashes.
function playEvidenceForProvider(evidence:GameQualityEvidence,premium:boolean){
 const captures=evidence.captures.map(({data,...metadata})=>metadata);
 if(!premium)return {sessions:evidence.sessions,captures};
 const longest=evidence.sessions.reduce((left,right)=>left.actionTrace.length>=right.actionTrace.length?left:right);
 return {captures,observedActions:longest.actionTrace.map(trace=>trace.action),
  traceColumns:['actionIndex','startTick','endTick','sceneChanged'],
  sessions:evidence.sessions.map(({actionTrace,...session})=>({...session,actionTrace:actionTrace.map(trace=>
   [trace.index,trace.startTick,trace.endTick,trace.beforeHash!==trace.afterHash])}))};
}
/** Real Responses API transport. Constructed only on the server after explicit owner approval. No subscription claims. */
export class OpenAIResponsesAgent implements AgentAdapter {
 readonly kind='metered-api' as const;readonly available:boolean;
 constructor(private approval:GenerationApproval,private key:()=>string,private transport:typeof fetch=fetch){
  this.approval=structuredClone(approval);
  this.available=approval.enabled===true;
  if(this.available)validateApproval(this.approval);
 }
 private checkRevisionPolicy(input:AgentInput,previous?:GeneratedGame){
  const base=input.baseRevision.game,premium=isPremiumApproval(this.approval);
  if(premium&&isGeneratedGame(base)&&base.kind==='generated-module-v1')throw Error('PREMIUM_V2_REQUIRED');
  if(!premium&&[base,previous].some(game=>isGeneratedGame(game)&&game.productionPlan?.version==='game-production-plan-v2'))
   throw Error('MODEL_POLICY_UNAVAILABLE');
 }
 private async metered<T>(action:(meter:RequestMeter)=>Promise<T>){
  const meter:RequestMeter={stageUsage:[],imageUsageUnits:0,unsettled:false};
  try{
   const result=await action(meter);
   return isPremiumApproval(this.approval)?{...result,stageUsage:meter.stageUsage,imageUsageUnits:meter.imageUsageUnits}:result;
  }catch(error){
   if(!isPremiumApproval(this.approval))throw error;
   let code='PROVIDER_REQUEST_FAILED';
   if(error instanceof Error){
    if(error.name==='TimeoutError')code='PROVIDER_TIMEOUT';
    else if(error.name==='AbortError')code='CANCELLED';
    else if(/^[A-Z][A-Z0-9_]{1,80}$/.test(error.message))code=error.message;
   }
   throw new PremiumGenerationError(code,meter.stageUsage,meter.imageUsageUnits,!meter.unsettled);
  }
 }
 private admission(options:StructuredRequest){
  const policy=stagePolicy(this.approval,options.stage);
  const user=JSON.stringify(options.data),instructions=options.instructions,images=options.images||[];
  const perImage='lowDetailImageTokens' in policy?policy.lowDetailImageTokens:4096;
  const imageMetadataBytes=isPremiumApproval(this.approval)?images.reduce((bytes,image)=>
   bytes+Buffer.byteLength(imageLabel(image,true)),0):0;
  const inputBound=Buffer.byteLength(user)+fixedInputBound(instructions,options.schema)+images.length*perImage+imageMetadataBytes;
  const outputTokens=Math.min(policy.maxOutputTokens,options.outputTokens??policy.maxOutputTokens);
  const worst=Math.ceil(inputBound*policy.inputUsdPerMillion+outputTokens*policy.outputUsdPerMillion);
  return {policy,user,instructions,images,inputBound,perImage,outputTokens,worst};
 }
 private async structured(input:AgentInput,options:StructuredRequest,meter:RequestMeter){
  validateApproval(this.approval);if(input.signal.aborted)throw Error('CANCELLED');
  const {policy,user,instructions,images,inputBound,outputTokens,worst}=this.admission(options);
  if(inputBound>policy.maxInputTokens)throw Error('INPUT_TOKEN_LIMIT');
  if(!Number.isSafeInteger(input.budget.maxUnits)||worst>input.budget.maxUnits)throw Error('SPENDING_CUTOFF');
  if(!Number.isInteger(input.budget.timeoutMs)||input.budget.timeoutMs<1000||input.budget.timeoutMs>900000)throw Error('REQUEST_TIMEOUT_REQUIRED');
  const secret=this.key();if(!secret||secret.length<16)throw Error('PROVIDER_KEY_MISSING');
  const signal=AbortSignal.any([input.signal,AbortSignal.timeout(Math.min(input.budget.timeoutMs,600000))]);
  const content=images.flatMap(image=>[{type:'input_text',text:imageLabel(image,isPremiumApproval(this.approval))},{type:'input_image',image_url:'data:image/png;base64,'+image.data,detail:'low'}]);
  const providerInput=images.length?[{role:'user',content:[{type:'input_text',text:user},...content]}]:user;
  const premium=isPremiumApproval(this.approval);
  const body=JSON.stringify({model:policy.model,store:false,instructions,input:providerInput,max_output_tokens:outputTokens,
   ...(policy.reasoningEffort?{reasoning:{effort:policy.reasoningEffort}}:{}),
   ...(premium?{service_tier:'default',prompt_cache_options:{mode:'explicit'}}:{}),
   text:{format:{type:'json_schema',name:options.name,strict:true,schema:options.schema}}});
  meter.unsettled=true;
  const response=await this.transport('https://api.openai.com/v1/responses',{method:'POST',redirect:'error',signal,headers:{'Content-Type':'application/json',Authorization:'Bearer '+secret},body});
  if(!response.ok){
   if([400,401,403,404,429].includes(response.status))meter.unsettled=false;
   if(response.status===429)throw Error('PROVIDER_RATE_LIMIT');
   if(premium&&[403,404].includes(response.status))throw Error('MODEL_ACCESS_UNAVAILABLE');
   throw Error('PROVIDER_REQUEST_FAILED');
  }
  const reader=response.body?.getReader();if(!reader)throw Error('PROVIDER_RESPONSE_INVALID');let raw='',bytes=0;const decoder=new TextDecoder();
  try{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>200000)throw Error('PROVIDER_RESPONSE_TOO_LARGE');raw+=decoder.decode(part.value,{stream:true});}raw+=decoder.decode();}finally{await reader.cancel().catch(()=>{});}
  const result=JSON.parse(raw);
  const used=result?.usage,inn=used?.input_tokens,out=used?.output_tokens;
  const validUsage=Number.isSafeInteger(inn)&&inn>=0&&inn<=inputBound&&Number.isSafeInteger(out)&&out>=0&&out<=outputTokens;
  const usageUnits=Math.ceil(inn*policy.inputUsdPerMillion+out*policy.outputUsdPerMillion);
  if(premium){
   if(result?.model!==policy.model||result.service_tier!=='default'||
      (result.reasoning?.effort!==undefined&&result.reasoning.effort!=='high'))throw Error('MODEL_POLICY_MISMATCH');
   const details=used?.input_tokens_details,write=details?.cache_write_tokens_details,reasoningTokens=used?.output_tokens_details?.reasoning_tokens;
   if(!validUsage||!Number.isSafeInteger(reasoningTokens)||reasoningTokens<0||reasoningTokens>out||
      [details?.cached_tokens,details?.cache_write_tokens,write?.ttl_30m_tokens,write?.ttl_12h_tokens].some(count=>count!==undefined&&count!==0))
    throw Error('PROVIDER_USAGE_INVALID');
   meter.stageUsage.push({stage:options.stage,model:(policy as PremiumStagePolicy).model,reasoningEffort:'high',
    inputTokens:inn,cachedInputTokens:0,outputTokens:out,reasoningTokens,costMicroUsd:usageUnits});
   meter.unsettled=false;
  }
  if(result.status!=='completed'||!Array.isArray(result.output))throw Error('PROVIDER_INCOMPLETE');
  const responseContent=result.output.flatMap((x:any)=>x.content||[]);if(responseContent.some((x:any)=>x.type==='refusal'))throw Error('PROVIDER_REFUSED');
  const text=responseContent.filter((x:any)=>x.type==='output_text').map((x:any)=>x.text).join('');
  if(!validUsage)throw Error('PROVIDER_USAGE_INVALID');
  return {value:JSON.parse(text) as unknown,usageUnits};
 }
 plan(input:AgentInput,options:ProductionPlanOptions={}){
  return this.metered(meter=>this.planRequest(input,options,meter));
 }
 private async planRequest(input:AgentInput,options:ProductionPlanOptions,meter:RequestMeter){
  this.checkRevisionPolicy(input,options.previous);
  const premium=isPremiumApproval(this.approval);
  const preflight=privateGenerationPreflight(input),brief=presentationBrief(input);
  const base=input.baseRevision.game;
  const existing=isGeneratedGame(base)?{title:base.title,instructions:base.instructions,source:base.source,productionPlan:base.productionPlan||null,assets:base.assets?.assets.map(({data,...metadata})=>metadata)||[]}:input.baseRevision.config||null;
  const imagesAvailable=options.imagesAvailable===true&&(options.assetRepair===true||permitsNewArt(input));
  const maxImages=imagesAvailable?Math.min(2,Math.max(0,options.maxImages??2)):0;
  const evidence=options.qualityEvidence&&options.previous?validateQualityEvidence(options.previous,options.qualityEvidence):undefined;
  if(options.qualityEvidence&&!evidence)throw Error('QUALITY_EVIDENCE_BINDING_MISMATCH');
  const images=evidence?(['desktop','tablet'] as const).map(device=>evidence.captures.filter(c=>c.device===device&&c.phase!=='initial').at(-1)!):undefined;
  const findings=options.findings?.filter(f=>QUALITY_FINDINGS.includes(f))||[];
  const result=await this.structured(input,{stage:'planning',instructions:planningInstructions+(premium?premiumPlanningInstructions:''),data:{idea:input.childIntent,base:existing,gameDesignPreflight:preflight.brief,presentationBrief:brief,imagesAvailable,maxImages,...(premium?{sheetRouteAvailable:imagesAvailable&&this.approval.images?.sheetFormat==='rgba8-png-grid-v1'}:{}),preserveApprovedArt:!permitsNewArt(input)&&options.assetRepair!==true,assetRepair:options.assetRepair===true,
   assetRepairEvidence:options.assetRepair?{findings,failedAssets:options.previous?.assets?.assets.map(({data,...metadata})=>metadata)||[],captures:images?.map(({data,...metadata})=>metadata)||[]}:null},schema:premium?premiumProductionPlanSchema:productionPlanSchema,name:'family_game_plan',outputTokens:premium?undefined:2400,images},meter);
  const plan=bindGameProductionPlan(result.value,input,premium);
  if(plan.version==='game-production-plan-v2'&&plan.artDirection?.sheetId&&this.approval.images?.sheetFormat!=='rgba8-png-grid-v1')throw Error('ART_PLAN_UNAVAILABLE');
  requireReviewCapacity(plan);
  if(plan.artRequests.length>maxImages)throw Error('ART_PLAN_UNAVAILABLE');
  return {plan,usageUnits:result.usageUnits};
 }
 private async request(input:AgentInput,meter:RequestMeter,previous?:GeneratedGame,diagnostics?:string,context:GenerationContext={}){
  validateApproval(this.approval);const preflight=privateGenerationPreflight(input);
  const premium=isPremiumApproval(this.approval),stage=previous?'repair':'construction',policy=stagePolicy(this.approval,stage);
  if(input.signal.aborted)throw Error('CANCELLED');
  if(!Number.isInteger(input.budget.timeoutMs)||input.budget.timeoutMs<1000||input.budget.timeoutMs>900000)throw Error('REQUEST_TIMEOUT_REQUIRED');
  const signal=AbortSignal.any([input.signal,AbortSignal.timeout(input.budget.timeoutMs)]),started=Date.now();
  let used=0;
  const remaining=():AgentInput=>({...input,signal,budget:{maxUnits:input.budget.maxUnits-used,timeoutMs:Math.max(1000,input.budget.timeoutMs-(Date.now()-started))}});
  const original=previous||input.baseRevision.game,legacy=isGeneratedGame(input.baseRevision.game)&&input.baseRevision.game.kind==='generated-module-v1';
  this.checkRevisionPolicy(input,previous);
  if(previous&&previous.kind!==(legacy?'generated-module-v1':'generated-module-v2'))throw Error('GENERATED_KIND_CHANGED');
  const evidence=context.qualityEvidence?(previous?validateQualityEvidence(previous,context.qualityEvidence):(()=>{throw Error('QUALITY_EVIDENCE_BINDING_MISMATCH')})()):undefined;
  let plan:GameProductionPlan|undefined,assets:GameAssetPack|undefined;
  if(!legacy){
   const assetRepair=/\b(?:VISUAL_INCOHERENT_ART|VISUAL_PLACEHOLDER_APPEARANCE)\b/.test(diagnostics||'');
   if(context.plan)plan=assertProductionPlanBinding(context.plan,input,premium);
   else if(previous?.productionPlan&&!assetRepair)plan=assertProductionPlanBinding(previous.productionPlan,input,premium);
   else{
    if(this.approval.images?.enabled)validateImageApproval(this.approval.images);
    const findings=QUALITY_FINDINGS.filter(f=>(diagnostics||'').includes(f));
    const planned=await this.planRequest(remaining(),{imagesAvailable:this.approval.images?.enabled===true,maxImages:this.approval.images?.maxImages,assetRepair,previous,qualityEvidence:assetRepair?evidence:undefined,findings},meter);
    plan=planned.plan;used+=planned.usageUnits;
   }
   requireReviewCapacity(plan);
   if(context.assets){assets=validateAssetPack(context.assets);if(assets.style!==plan.presentationStyle)throw Error('ASSET_STYLE_MISMATCH');}
   else if(previous?.assets&&!assetRepair){assets=validateAssetPack(previous.assets);if(assets.style!==plan.presentationStyle)throw Error('ASSET_STYLE_MISMATCH');}
   else{
    // Reserve source generation and mandatory visual review BEFORE any new
    // paid image request. The producer separately recognizes byte-identical
    // cached artwork, which can be reused even when no image allowance remains.
    const sourceReserve=stageReserve(policy),reviewPolicy=stagePolicy(this.approval,'review');
    const reviewReserve=stageReserve(reviewPolicy,premium?reviewPolicy.maxOutputTokens:Math.min(2000,reviewPolicy.maxOutputTokens));
    const imageBudget=plan.artRequests.length?Math.max(0,input.budget.maxUnits-used-sourceReserve-reviewReserve):input.budget.maxUnits-used;
    const produced=await produceGameArt({plan,baseAssets:isGeneratedGame(original)?original.assets:undefined,approval:this.approval.images,budgetMicroUsd:imageBudget,signal,key:this.key,
     transport:async(url,init)=>{meter.unsettled=true;return this.transport(url,init);},
     onImageCharge:charge=>{meter.imageUsageUnits+=charge;meter.unsettled=false;}});
    assets=produced.assets;used+=produced.usageUnits;
   }
   const direction=plan.version==='game-production-plan-v2'?plan.artDirection:undefined;
   requirePlannedAssets(plan.artRequests,direction,assets.assets);
  }
  const base=isGeneratedGame(original)?{kind:original.kind,title:original.title,instructions:original.instructions,source:original.source,controls:original.controls}:original||input.baseRevision.config||null;
  const verified=input.baseRevision.game;
  const verifiedBase=premium&&previous&&isGeneratedGame(verified)?{revisionId:input.baseRevision.id,kind:verified.kind,
   title:verified.title,instructions:verified.instructions,controls:verified.controls,
   ...(previous.source===verified.source?{sourceMatchesCandidate:true}:{source:verified.source}),
   approvedAssetMetadata:verified.assets?.assets.map(({data,...metadata})=>metadata)||[]}:undefined;
  // A failed candidate can have a visible response to one input while never
  // exercising another named control. Report only what the receipts establish.
  const priorDesign=previous?.productionPlan?.version==='game-production-plan-v2'?previous.productionPlan.design:undefined;
  const missingChangedInputReceipts=premium&&priorDesign&&evidence?evidence.sessions.flatMap(session=>
   priorDesign.interactions.flatMap((interaction,index)=>{
    const observed=session.actionTrace.some(trace=>trace.endTick>trace.startTick&&trace.beforeHash!==trace.afterHash&&
     (trace.action.type==='hold'?trace.action.control:trace.action.type)===interaction.input);
    return observed?[]:[{interaction:index,device:session.device,input:interaction.input}];
   })):undefined;
  const data={idea:input.childIntent,base,...(verifiedBase?{verifiedBase}:{}),gameDesignPreflight:preflight.brief,presentationBrief:presentationBrief(input),productionPlan:plan||null,
   approvedAssetMetadata:assets?.assets.map(({data,...metadata})=>metadata)||[],feedback:diagnostics?.slice(0,1500)||null,
   previousPlayEvidence:evidence?{...playEvidenceForProvider(evidence,premium),...(missingChangedInputReceipts?{missingChangedInputReceipts}:{})}:null};
  const legacyInstructions=legacy?'\nThis is a verified saved legacy-v1 revision. Preserve generated-module-v1 and use only the legacy contract.':'';
  const premiumV2=premium&&!legacy;
  const extraInstructions=premiumV2?premiumConstructionInstructions+(previous?premiumRepairInstructions:''):'';
  const sourceSchema=premiumV2?premiumGameSchema:gameSchema;
  const companionSchema=premiumV2?premiumCompanionSchema:companionGameSchema;
  const gameRequest:StructuredRequest={stage,instructions:generationInstructionsForForm(preflight.instructionsMode!=='rule-driven',false,premiumV2)+legacyInstructions+extraInstructions,
   data,schema:sourceSchema,name:'family_game_module'};
  // Retain the source, production plan, approved art and actual repair evidence.
  // Choose device captures against the game-only request so optional companion
  // overhead cannot displace evidence. Keep at least one image per device;
  // if even those do not fit, structured() will refuse before its key/transport.
  // The independent review itself still receives every validated capture.
  if(evidence){
   const first=(['desktop','tablet'] as const).map(device=>evidence.captures.filter(c=>c.device===device&&c.phase!=='initial').at(-1)!);
   const ordered=[...first,...evidence.captures.filter(c=>!first.includes(c))];
   const selected=ordered.slice(0,2);
   for(const image of ordered.slice(2)){
    if(this.admission({...gameRequest,images:[...selected,image]}).inputBound>policy.maxInputTokens)break;
    selected.push(image);
   }
   gameRequest.images=selected;
  }
  const companion=isGeneratedGame(original)?original.creationManifest:undefined;
  let sourceRequest:StructuredRequest={...gameRequest,schema:companionSchema,
   instructions:generationInstructionsForForm(preflight.instructionsMode!=='rule-driven',true,premiumV2)+legacyInstructions+extraInstructions,
   data:{...data,base:companion?{...base,creationManifest:companion}:base}};
  const sourceInput=remaining(),complete=this.admission(sourceRequest);
  // Preserve the complete game request within its existing caps. This selects
  // one source-generation request, adding no retry, provider call or stale scene.
  // Earlier planning/art stages retain their own approval and spending checks.
  if(complete.inputBound>policy.maxInputTokens||complete.worst>sourceInput.budget.maxUnits)sourceRequest=gameRequest;
  const result=await this.structured(sourceInput,sourceRequest,meter);used+=result.usageUnits;
  const raw=result.value as Record<string,unknown>;
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!['kind','title','instructions','source','controls','playthrough','creationManifest'].includes(k)))throw Error('GENERATED_ARTIFACT_REJECTED');
  if(raw.kind!==(legacy?'generated-module-v1':'generated-module-v2'))throw Error('GENERATED_KIND_CHANGED');
  if(!legacy&&!raw.playthrough)throw Error('PLAYTHROUGH_REQUIRED');
  const game=validateGenerated({...raw,...(plan?{productionPlan:plan}:{}),...(assets?{assets}:{})});
  return {candidate:{format:'generated-source-v1',game} as CandidateArtifact,usageUnits:used};
 }
 review(input:AgentInput,game:GeneratedGame,evidenceValue:GameQualityEvidence){
  return this.metered(meter=>this.reviewRequest(input,game,evidenceValue,meter));
 }
 private async reviewRequest(input:AgentInput,game:GeneratedGame,evidenceValue:GameQualityEvidence,meter:RequestMeter){
  const premium=isPremiumApproval(this.approval);
  this.checkRevisionPolicy(input,game);
  privateGenerationPreflight(input);
  const evidence=validateQualityEvidence(game,evidenceValue);
  const plan=game.productionPlan?assertProductionPlanBinding(game.productionPlan,input,premium):undefined;
  if(premium&&!plan)throw Error('PRODUCTION_PLAN_BINDING_MISMATCH');
  const base=input.baseRevision.game;
  const result=await this.structured(input,{stage:'review',instructions:qualityReviewInstructions+(premium?premiumReviewInstructions:''),
   schema:premium?premiumQualityReviewSchema:qualityReviewSchema,name:'family_game_quality',outputTokens:premium?undefined:2000,
   data:{originalChildRequest:input.childIntent,presentationBrief:presentationBrief(input),productionPlan:plan||null,
    verifiedBase:isGeneratedGame(base)?{title:base.title,instructions:base.instructions,productionPlan:base.productionPlan||null}:input.baseRevision.config||null,
    candidate:{title:game.title,instructions:game.instructions,controls:game.controls,visualStyle:game.assets?.style||null},
    evidence:{...evidence,...playEvidenceForProvider(evidence,premium)}},images:evidence.captures},meter);
  return {review:bindProviderQualityReview(game,evidence,result.value),usageUnits:result.usageUnits};
 }
 generate(input:AgentInput,context?:GenerationContext){return this.metered(meter=>this.request(input,meter,undefined,undefined,context));}
 repair(input:AgentInput,previous:GeneratedGame,diagnostics:string,context?:GenerationContext){return this.metered(meter=>this.request(input,meter,previous,diagnostics,context));}
}
