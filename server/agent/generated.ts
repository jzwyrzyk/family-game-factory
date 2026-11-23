import { createHash } from 'node:crypto';
import { runtimeBundle } from '../sandbox/bundle-v2.cjs';
import type { CreationProject } from '../../src/creation/model';
import { validateGeneratedCreationManifest } from '../../src/creation/projects';
import {assetPackHash,validateAssetPack,type GameAssetPack} from './game-assets';
import type {GameQualityReview} from '../quality/game-quality';
import {validateSuggestedPlaythrough,validateGameProductionPlan,type SuggestedPlaythrough,type GameProductionPlan} from '../quality/presentation-plan';
export type GeneratedKind='generated-module-v1'|'generated-module-v2';
export interface GeneratedGame {
 kind:GeneratedKind; title:string; instructions:string; source:string;
 controls:('left'|'right'|'up'|'down'|'action')[];
 /** Optional data-only companion. Old generated games are never inferred into scenes. */
 creationManifest?:CreationProject;
 /** Server-attached, validated raster data. Models reference IDs; they never author these bytes. */
 assets?:GameAssetPack;
 /** Untrusted ordinary UI gestures for exploration; never acceptance assertions or a win hook. */
 playthrough?:SuggestedPlaythrough;
 productionPlan?:GameProductionPlan;
 compiled?:{code:string;sourceHash:string;codeHash:string;runtimeVersion?:string;runtimeHash?:string;assetsHash?:string;quality?:GameQualityReview;tests:{desktop:boolean;mobile:boolean;replay:boolean;isolation:boolean;input?:boolean;resources?:boolean;pause?:boolean;intent?:boolean}};
}
/** A discriminant for values already validated at a trust boundary. */
export function isGeneratedGame(value:unknown):value is GeneratedGame{return !!value&&typeof value==='object'&&['generated-module-v1','generated-module-v2'].includes((value as GeneratedGame).kind);}
export const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
export function validateGenerated(value:unknown):GeneratedGame {
 const g=value as GeneratedGame;
 if(!isGeneratedGame(g)||Object.keys(g).some(k=>!['kind','title','instructions','source','controls','assets','playthrough','productionPlan','creationManifest'].includes(k))||typeof g.title!=='string'||g.title.trim().length<1||g.title.length>60||typeof g.instructions!=='string'||g.instructions.length<5||g.instructions.length>250||typeof g.source!=='string'||Buffer.byteLength(g.source)>30000||g.source.length<30||!Array.isArray(g.controls)||g.controls.length>5||new Set(g.controls).size!==g.controls.length||g.controls.some(k=>!['left','right','up','down','action'].includes(k)))throw Error('GENERATED_ARTIFACT_REJECTED');
 if(g.assets!==undefined&&g.kind!=='generated-module-v2')throw Error('ASSETS_REQUIRE_V2');
 const assets=g.assets===undefined?undefined:validateAssetPack(g.assets);
 const productionPlan=g.productionPlan===undefined?undefined:validateGameProductionPlan(g.productionPlan);
 const premium=productionPlan?.version==='game-production-plan-v2';
 if(premium&&g.kind!=='generated-module-v2')throw Error('PREMIUM_PLAN_REQUIRES_V2');
 const playthrough=g.playthrough===undefined?undefined:validateSuggestedPlaythrough(g.playthrough,premium);
 if(assets&&productionPlan&&assets.style!==productionPlan.presentationStyle)throw Error('ASSET_STYLE_MISMATCH');
 const creationManifest=g.creationManifest==null?undefined:validateGeneratedCreationManifest(g.creationManifest);
 return {kind:g.kind,title:g.title,instructions:g.instructions,source:g.source,controls:[...g.controls],...(assets?{assets}:{}),...(playthrough?{playthrough}:{}),...(productionPlan?{productionPlan}:{}),...(creationManifest?{creationManifest}:{})};
}
export function validateCompiled(game:GeneratedGame,tested:GeneratedGame):GeneratedGame {
 const c=tested?.compiled;
 if(!c||tested.kind!==game.kind||tested.title!==game.title||tested.instructions!==game.instructions||tested.source!==game.source||JSON.stringify(tested.controls)!==JSON.stringify(game.controls)||typeof c.code!=='string'||Buffer.byteLength(c.code)>100000||c.sourceHash!==hash(game.source)||c.codeHash!==hash(c.code)||c.tests?.desktop!==true||c.tests.mobile!==true||c.tests.replay!==true||c.tests.isolation!==true)throw Error('SANDBOX_ATTESTATION_REQUIRED');
 if(JSON.stringify(tested.creationManifest??null)!==JSON.stringify(game.creationManifest??null))throw Error('SANDBOX_ATTESTATION_REQUIRED');
 if(JSON.stringify(tested.playthrough)!==JSON.stringify(game.playthrough))throw Error('SANDBOX_ATTESTATION_REQUIRED');
 if(JSON.stringify(tested.productionPlan)!==JSON.stringify(game.productionPlan))throw Error('SANDBOX_ATTESTATION_REQUIRED');
 const assetsHash=assetPackHash(game.assets);
 if(assetPackHash(tested.assets)!==assetsHash||c.assetsHash!==assetsHash)throw Error('ASSET_ATTESTATION_REQUIRED');
 if(game.kind==='generated-module-v2'){
  const trusted=runtimeBundle();
  if(c.runtimeVersion!==trusted.version||c.runtimeHash!==trusted.hash||c.tests.input!==true||c.tests.resources!==true||c.tests.pause!==true)throw Error('TRUSTED_RUNTIME_ATTESTATION_REQUIRED');
 }
 return {...game,compiled:c};
}
