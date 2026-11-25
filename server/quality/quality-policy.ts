import {isGeneratedGame,type GeneratedGame} from '../agent/generated';
import type {Job,PlayableGame} from '../pipeline/types';
import {choiceSources} from './production-design';
import {presentationRequestHash,validateGameProductionPlan} from './presentation-plan';

/** Existing v1 revisions retain their legacy repair contract. Every new real
 * game and every v2 revision receives the current independent quality gate. */
export function needsCurrentQuality(base:PlayableGame|null|undefined):boolean {
 return !(isGeneratedGame(base)&&base.kind==='generated-module-v1');
}
/** Queued jobs created before the policy rollout cannot retain a weaker gate.
 * Explicit test fixtures have the mock adapter recorded at submission. */
export function applyCurrentQualityPolicy(job:Job,base:PlayableGame|null|undefined):void {
 if(job.adapter==='metered-api'&&needsCurrentQuality(base))job.qualityRequired='game-quality-v1';
}
export function requireProductionCandidate(job:Pick<Job,'qualityRequired'|'prompt'|'baseRevisionId'|'premiumPolicy'>,game:PlayableGame):void {
 if(!job.qualityRequired){
  if(isGeneratedGame(game)&&game.productionPlan?.version==='game-production-plan-v2')throw Error('PRODUCTION_PLAN_BINDING_MISMATCH');
  return;
 }
 if(!isGeneratedGame(game)||game.kind!=='generated-module-v2')throw Error('CURRENT_QUALITY_REQUIRES_V2');
 const plan=validateGameProductionPlan(game.productionPlan);
 const premium=!!job.premiumPolicy;
 if(premium!==(plan.version==='game-production-plan-v2')||plan.version==='game-production-plan-v2'&&JSON.stringify(plan.choiceSources)!==JSON.stringify(choiceSources(job.prompt))||
    plan.requestHash!==presentationRequestHash(job.prompt)||plan.baseRevisionId!==(job.baseRevisionId||'new')||
    !game.assets||game.assets.style!==plan.presentationStyle||!game.playthrough?.length)
  throw Error('PRODUCTION_PLAN_BINDING_MISMATCH');
}
/** Read raw capture evidence only through the trusted gate's result channel;
 * it is never a permitted field on the generated candidate itself. */
export type QualityTestedGame=GeneratedGame&{qualityEvidence?:import('./game-quality').GameQualityEvidence};
