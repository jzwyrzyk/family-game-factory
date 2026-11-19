/** Synthetic binding/attestation helpers for pipeline unit tests only.
 * They prove coordinator policy, never observed visual quality or gameplay. */
import {transformSync} from 'esbuild';
import {hash,type GeneratedGame} from '../server/agent/generated';
import {assetPackHash} from '../server/agent/game-assets';
import type {AgentInput} from '../server/pipeline/types';
import {bindGameProductionPlan,presentationBrief} from '../server/quality/presentation-plan';
import {runtimeBundle} from '../server/sandbox/bundle-v2.cjs';
import {fixturePlanProposal,fixturePlaythrough,syntheticQualityEvidence} from '../server/testing/presentation-quality-fixtures';

export function productionFixture(game:GeneratedGame,prompt:string,baseRevisionId='new'):GeneratedGame {
 if(game.kind!=='generated-module-v2')throw Error('PRODUCTION_FIXTURE_REQUIRES_V2');
 const input:AgentInput={gameManifest:{id:'new',allowedMechanics:['generated-module-v2']},baseRevision:{id:baseRevisionId},
  childIntent:prompt,allowedCapabilities:['generated-module-v2'],budget:{maxUnits:10000,timeoutMs:30000},signal:new AbortController().signal};
 const brief=presentationBrief(input),plan=bindGameProductionPlan(fixturePlanProposal({input:JSON.stringify({presentationBrief:brief})}),input);
 return {...game,assets:{version:'game-assets-v1',style:plan.presentationStyle,assets:[]},productionPlan:plan,playthrough:fixturePlaythrough};
}
export function compiledPipelineFixture(game:GeneratedGame,intent=false):GeneratedGame {
 const code=transformSync(game.source,{loader:'ts',format:'iife',globalName:'GameModule'}).code,runtime=runtimeBundle();
 return {...game,compiled:{code,sourceHash:hash(game.source),codeHash:hash(code),...(game.kind==='generated-module-v2'?{runtimeVersion:runtime.version,runtimeHash:runtime.hash,...(game.assets?{assetsHash:assetPackHash(game.assets)}:{})}:{}),
  tests:{desktop:true,mobile:true,replay:true,isolation:true,...(game.kind==='generated-module-v2'?{input:true,resources:true,pause:true}:{}),...(intent?{intent:true}:{})}}};
}
export function testedPipelineFixture(game:GeneratedGame,intent=false){
 const compiled=compiledPipelineFixture(game,intent);
 return {...compiled,qualityEvidence:syntheticQualityEvidence(compiled)};
}
