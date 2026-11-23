import {minimumPremiumTextInput} from './generation-contract';
import {validateImageApproval,type ImageApproval} from './illustrations';

export const PREMIUM_POLICY_VERSION='adult-astra-high-v1' as const;
export const INITIAL_PREMIUM_MODELS={
 planning:'gpt-6.2-sol',construction:'gpt-6.2-astra',review:'gpt-6.2-sol',repair:'gpt-6.2-astra'
} as const;
export type ModelStage=keyof typeof INITIAL_PREMIUM_MODELS;
export type PremiumModel=(typeof INITIAL_PREMIUM_MODELS)[ModelStage];

interface TokenPolicy {
 model:string;
 inputUsdPerMillion:number;
 outputUsdPerMillion:number;
 maxInputTokens:number;
 maxOutputTokens:number;
 priceReviewedOn:string;
}
/** Existing private configuration, retained for the legacy generator. */
export interface AgentApproval extends TokenPolicy {
 enabled:boolean;
 approvalId:string;
 reasoningEffort?:'low'|'medium';
 images?:ImageApproval;
}
export interface PremiumStagePolicy extends TokenPolicy {
 model:PremiumModel;
 reasoningEffort:'high';
 providerAccessReviewedOn:string;
 /** Project-reviewed upper bound for one low-detail capture of the sandbox's supported dimensions. */
 lowDetailImageTokens:number;
 zdrApproved:true;
}
export interface PremiumApproval {
 version:typeof PREMIUM_POLICY_VERSION;
 enabled:boolean;
 approvalId:string;
 maxRepairAttempts:1|2;
 stages:Record<ModelStage,PremiumStagePolicy>;
 images?:ImageApproval;
}
export type GenerationApproval=AgentApproval|PremiumApproval;

export function isPremiumApproval(value:GenerationApproval):value is PremiumApproval {
 return 'version' in value || 'stages' in value;
}
function currentReview(value:unknown,allowNextDay=false):boolean {
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const time=Date.parse(value),now=Date.now();
 return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===value&&now-time<=31*86400000&&time<=now+(allowNextDay?86400000:0);
}
function validLimits(policy:TokenPolicy,maxOutput:number,legacy=false):boolean{
 return typeof policy.model==='string'&&/^[-a-zA-Z0-9.]{1,100}$/.test(policy.model)
  &&Number.isFinite(policy.inputUsdPerMillion)&&policy.inputUsdPerMillion>0
  &&Number.isFinite(policy.outputUsdPerMillion)&&policy.outputUsdPerMillion>0
  &&Number.isSafeInteger(policy.maxInputTokens)&&policy.maxInputTokens>=2000&&policy.maxInputTokens<=64000
  &&Number.isSafeInteger(policy.maxOutputTokens)&&policy.maxOutputTokens>=1000&&policy.maxOutputTokens<=maxOutput
  &&Number.isSafeInteger(stageReserve(policy))&&currentReview(policy.priceReviewedOn,legacy);
}
// Standard, short-context, uncached USD per million tokens. A rate or model change
// requires a new reviewed catalog; an operator still explicitly reviews each stage.
const rates:Record<PremiumModel,{input:number;output:number}>={
 'gpt-6.2-astra':{input:8,output:40},'gpt-6.2-sol':{input:2,output:10}
};
export function premiumModelRates(model:string):Readonly<{input:number;output:number}>|undefined{
 return Object.hasOwn(rates,model)?{...rates[model as PremiumModel]}:undefined;
}
function hasOnlyKeys(value:unknown,keys:readonly string[]):boolean{
 return value!==null&&typeof value==='object'&&!Array.isArray(value)&&
  [Object.prototype,null].includes(Object.getPrototypeOf(value))&&Object.keys(value).every(key=>keys.includes(key));
}
export function validatePremiumApproval(approval:PremiumApproval):void {
 if(!hasOnlyKeys(approval,['version','enabled','approvalId','maxRepairAttempts','stages','images'])||
    approval.version!==PREMIUM_POLICY_VERSION||approval.enabled!==true||
    typeof approval.approvalId!=='string'||!/^[-a-zA-Z0-9._:]{1,100}$/.test(approval.approvalId)||
    ![1,2].includes(approval.maxRepairAttempts)||
    !hasOnlyKeys(approval.stages,Object.keys(INITIAL_PREMIUM_MODELS))||Object.keys(approval.stages).length!==4)
  throw Error('PREMIUM_APPROVAL_REQUIRED');
 for(const stage of Object.keys(INITIAL_PREMIUM_MODELS) as ModelStage[]){
  const policy=approval.stages[stage],coding=stage==='construction'||stage==='repair';
  if(!hasOnlyKeys(policy,['model','reasoningEffort','maxInputTokens','maxOutputTokens','inputUsdPerMillion','outputUsdPerMillion',
     'priceReviewedOn','providerAccessReviewedOn','lowDetailImageTokens','zdrApproved'])||!Object.hasOwn(rates,policy.model)||policy.reasoningEffort!=='high'||
     coding&&policy.model!==INITIAL_PREMIUM_MODELS[stage])throw Error('PREMIUM_MODEL_POLICY_INVALID');
  if(!validLimits(policy,coding?32000:16000)||policy.inputUsdPerMillion!==rates[policy.model].input||
     policy.outputUsdPerMillion!==rates[policy.model].output)throw Error('PREMIUM_PRICING_OR_LIMIT_INVALID');
  if(policy.zdrApproved!==true||!currentReview(policy.providerAccessReviewedOn)||!Number.isSafeInteger(policy.lowDetailImageTokens)||
     policy.lowDetailImageTokens<4096||policy.lowDetailImageTokens>64000)throw Error('PREMIUM_PROVIDER_APPROVAL_REQUIRED');
  // Review always receives at least one initial and one later frame per device.
  const minimumInput=minimumPremiumTextInput[stage]+(stage==='review'?4*policy.lowDetailImageTokens:0);
  if(policy.maxInputTokens<=minimumInput)throw Error('PREMIUM_PRICING_OR_LIMIT_INVALID');
 }
 if(approval.images!==undefined){
  if(!hasOnlyKeys(approval.images,['enabled','approvalId','model','maxImages','maxMicroUsdPerImage','priceReviewedOn'])||
     typeof approval.images.enabled!=='boolean')throw Error('IMAGE_APPROVAL_REQUIRED');
  // Validate even a dormant block before forwarding the private configuration.
  validateImageApproval({...approval.images,enabled:true});
 }
}
export function validateApproval(approval:GenerationApproval):void{
 if(!approval)throw Error('OWNER_APPROVAL_REQUIRED');
 if(isPremiumApproval(approval)){validatePremiumApproval(approval);return;}
 if(approval.enabled!==true||!approval.approvalId||!validLimits(approval,16000,true)||
    (approval.reasoningEffort!==undefined&&!['low','medium'].includes(approval.reasoningEffort)))throw Error('OWNER_APPROVAL_REQUIRED');
}
export function stagePolicy(approval:GenerationApproval,stage:ModelStage):PremiumStagePolicy|AgentApproval{
 return isPremiumApproval(approval)?approval.stages[stage]:approval;
}
export function stageReserve(policy:TokenPolicy,outputTokens=policy.maxOutputTokens):number{
 return Math.ceil(policy.maxInputTokens*policy.inputUsdPerMillion+outputTokens*policy.outputUsdPerMillion);
}
export function premiumJobReserve(approval:PremiumApproval):number {
 validatePremiumApproval(approval);
 const {planning,construction,review,repair}=approval.stages;
 const imageAllowance=approval.images?.enabled?approval.images.maxImages*approval.images.maxMicroUsdPerImage:0;
 // An asset repair may legitimately replan and generate fresh approved images.
 return stageReserve(construction)+approval.maxRepairAttempts*stageReserve(repair)
  +(1+approval.maxRepairAttempts)*(stageReserve(planning)+stageReserve(review)+imageAllowance);
}

export interface StageUsage {
 stage:ModelStage;
 model:PremiumModel;
 reasoningEffort:'high';
 inputTokens:number;
 cachedInputTokens:number;
 outputTokens:number;
 reasoningTokens:number;
 costMicroUsd:number;
}
function tokenCount(value:unknown,limit:number):value is number{
 return typeof value==='number'&&Number.isSafeInteger(value)&&value>=0&&value<=limit;
}
export function validateStageUsage(approval:PremiumApproval,receipts:unknown,expected:Exclude<ModelStage,'planning'>,
                                  usageUnits:unknown,imageUsageUnits:unknown,partial=false):StageUsage[] {
 if(!Array.isArray(receipts)||receipts.length>(expected==='review'?1:2))throw Error('PREMIUM_USAGE_INVALID');
 const result:StageUsage[]=[];
 for(const item of receipts){
  if(!item||typeof item!=='object')throw Error('PREMIUM_USAGE_INVALID');
  const stage=item.stage;
  if(stage!==expected&&!(stage==='planning'&&expected!=='review')||result.length&&result[0].stage!=='planning'||
     result.some(row=>row.stage===stage))throw Error('PREMIUM_USAGE_INVALID');
  const policy=approval.stages[stage as ModelStage];
  if(item.model!==policy.model||item.reasoningEffort!==policy.reasoningEffort||!tokenCount(item.inputTokens,policy.maxInputTokens)||
     !tokenCount(item.outputTokens,policy.maxOutputTokens)||!tokenCount(item.reasoningTokens,item.outputTokens)||
     item.cachedInputTokens!==0||item.costMicroUsd!==Math.ceil(item.inputTokens*policy.inputUsdPerMillion+item.outputTokens*policy.outputUsdPerMillion))
   throw Error('PREMIUM_USAGE_INVALID');
  // Reconstruct a strict public-safe receipt; reject unexpected content.
  const row:StageUsage={stage,model:policy.model,reasoningEffort:'high',inputTokens:item.inputTokens,cachedInputTokens:0,
   outputTokens:item.outputTokens,reasoningTokens:item.reasoningTokens,costMicroUsd:item.costMicroUsd};
  if(Object.keys(item).some(key=>!Object.hasOwn(row,key)))throw Error('PREMIUM_USAGE_INVALID');
  result.push(row);
 }
 if(!partial&&result.at(-1)?.stage!==expected)throw Error('PREMIUM_USAGE_INVALID');
 const art=expected!=='review'&&approval.images?.enabled?approval.images:undefined;
 if(!tokenCount(imageUsageUnits,art?art.maxImages*art.maxMicroUsdPerImage:0)||
    art&&imageUsageUnits%art.maxMicroUsdPerImage!==0||
    usageUnits!==result.reduce((sum,row)=>sum+row.costMicroUsd,imageUsageUnits))throw Error('PREMIUM_USAGE_INVALID');
 return result;
}

export class PremiumGenerationError extends Error{
 constructor(message:string,readonly stageUsage:StageUsage[],readonly imageUsageUnits:number,readonly usageComplete:boolean){super(message);}
 get usageUnits(){return this.stageUsage.reduce((total,row)=>total+row.costMicroUsd,this.imageUsageUnits);}
}
