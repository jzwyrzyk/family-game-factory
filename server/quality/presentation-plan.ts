/** Style is independent of simulation and quality. These are production plans,
 * never assertions that a rendered game has passed review. */
import {createHash} from 'node:crypto';
import type {AgentInput} from '../pipeline/types';
import {validateAssetPack,type VisualStyle,type RasterAsset} from '../agent/game-assets';

import {choiceSources,validateChoiceSources,validateProductionDesign,productionDesignSchema,type ProductionDesign,type ChoiceSource} from './production-design';
import {captureLimits} from './game-quality-evidence.cjs';

export const PRESENTATION_STYLES=['pixel','flat-2d','illustrated','dimensional','realistic'] as const;
export type SuggestedAction=
 |{type:'tap';x:number;y:number;frames:number}
 |{type:'drag';x:number;y:number;x2:number;y2:number;frames:number}
 |{type:'hold';control:'left'|'right'|'up'|'down'|'action';frames:number}
 |{type:'wait';frames:number};
/** An untrusted suggestion for ORDINARY input exploration. No assertions,
 * callbacks or privileged state injection, and never independent intent proof. */
export type SuggestedPlaythrough=SuggestedAction[];
export interface ArtRequest {id:string;role:RasterAsset['role'];prompt:string;sampling:RasterAsset['sampling']}
interface CommonProductionPlan {
 requestHash:string;baseRevisionId:string;
 presentationStyle:VisualStyle;styleOrigin:'explicit'|'saved'|'chosen';
 playerAction:string;payoff:string;variation:string;openEnded:boolean;artRequests:ArtRequest[];
}
export type GameProductionPlan=CommonProductionPlan&(
 | {version:'game-production-plan-v1'}
 | {version:'game-production-plan-v2'; design:ProductionDesign; choiceSources:ChoiceSource[]}
);
export interface PresentationBrief {
 version:'presentation-brief-v1';requestHash:string;
 preferredStyle:VisualStyle|null;styleOrigin:'explicit'|'saved'|'unspecified';
 literalStyleEvidence:string[];allowedStyles:VisualStyle[];
 criteria:Record<VisualStyle,string>;invariants:string[];
}
const HASH=/^[a-f0-9]{64}$/;
const ID=/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/;
const own=(x:unknown):Record<string,unknown>=>{
 if(!x||typeof x!=='object'||Array.isArray(x)||![Object.prototype,null].includes(Object.getPrototypeOf(x)))throw Error('PRODUCTION_PLAN_INVALID');
 return x as Record<string,unknown>;
};
const exact=(x:Record<string,unknown>,fields:readonly string[])=>{
 if(fields.some(k=>!Object.hasOwn(x,k))||Object.keys(x).some(k=>!fields.includes(k)))throw Error('PRODUCTION_PLAN_INVALID');
};
const bounded=(x:unknown,max:number)=>{
 if(typeof x!=='string'||!x.trim()||x.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(x))throw Error('PRODUCTION_PLAN_INVALID');
 return x;
};
export const presentationRequestHash=(text:string)=>createHash('sha256').update(text).digest('hex');

export function validateSuggestedPlaythrough(value:unknown,premium=false):SuggestedPlaythrough {
 const limits=captureLimits(premium);
 if(!Array.isArray(value)||value.length<1||value.length>limits.actions)throw Error('PLAYTHROUGH_INVALID');
 let total=0;
 const coordinate=(x:unknown,max:number)=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=max;
 const path=value.map(entry=>{
  const a=own(entry);
  if(!Number.isInteger(a.frames)||(a.frames as number)<1||(a.frames as number)>180)throw Error('PLAYTHROUGH_INVALID');
  total+=a.frames as number;
  const fields=a.type==='tap'?['type','x','y','frames']:a.type==='drag'?['type','x','y','x2','y2','frames']:a.type==='hold'?['type','control','frames']:a.type==='wait'?['type','frames']:[];
  if(!fields.length||fields.some(k=>!Object.hasOwn(a,k))||Object.keys(a).some(k=>!fields.includes(k)))throw Error('PLAYTHROUGH_INVALID');
  if((a.type==='tap'||a.type==='drag')&&(!coordinate(a.x,720)||!coordinate(a.y,400)))throw Error('PLAYTHROUGH_INVALID');
  if(a.type==='drag'&&(!coordinate(a.x2,720)||!coordinate(a.y2,400)))throw Error('PLAYTHROUGH_INVALID');
  if(a.type==='hold'&&!['left','right','up','down','action'].includes(String(a.control)))throw Error('PLAYTHROUGH_INVALID');
  return {...a} as unknown as SuggestedAction;
 });
 if(total>limits.frames)throw Error('PLAYTHROUGH_INVALID');
 return path;
}

const criteria:PresentationBrief['criteria']={
 pixel:'Deliberate, consistent pixel scale; crisp silhouettes; readable sprites and contrasting play zones. Pixel art is a complete valid style, not a draft requiring realistic textures.',
 'flat-2d':'Intentional shapes, clean edges, clear hierarchy, coherent color and responsive animation. Assess composition and expressiveness, not the amount of shading or image generation.',
 illustrated:'Coherent drawn or painted world, readable subjects, deliberate lighting/color and clean separation of interactive pieces from scenery. Avoid an illustrated poster with inert controls.',
 dimensional:'Consistent depth, lighting and occlusion; objects meet their visible surfaces; readable interaction. A dimensional appearance does not require true 3D rendering or physical simulation.',
 realistic:'Consistent materials, scale and lighting with clearly legible interactive subjects. Photographic detail is optional; the requested realism must be visible without obscuring play.'
};
const stylePatterns:Array<[VisualStyle,RegExp]>=[
 ['pixel',/\b(?:pixel[- ]art|pixel(?:ated)?\s+(?:style|graphics|sprites?|look|games?)|8[- ]bit|16[- ]bit|retro[- ]sprites?)\b/gi],
 ['flat-2d',/\b(?:flat(?:[- ]2d|[- ]art|[- ]vector|[- ]style|[- ]design|[- ]illustration)|vector(?:[- ]art)?|simple 2d|digital 2d)\b/gi],
 ['illustrated',/\b(?:illustrated|storybook|watercolou?r|hand[- ]drawn|painted|picture[- ]book)\b/gi],
 ['dimensional',/\b(?:2\.5d|isometric|clay(?:[- ]style)?|diorama|dimensional\s+(?:art|style|look|design)|3d[- ]looking)\b/gi],
 ['realistic',/\b(?:photorealistic|photo[- ]realistic|realistic(?:[- ]art|[- ]look|[- ]style|[- ]visuals)?|lifelike)\b/gi]
];
export function presentationBrief(input:AgentInput):PresentationBrief {
 if(typeof input.childIntent!=='string'||!input.childIntent.trim()||input.childIntent.length>4000)throw Error('PRODUCTION_PLAN_INVALID');
 const hits:Array<{style:VisualStyle;quote:string;index:number}>=[];
 for(const [style,pattern]of stylePatterns){
  for(const match of input.childIntent.matchAll(pattern)){
   const at=match.index??0,before=input.childIntent.slice(Math.max(0,at-38),at),after=input.childIntent.slice(at+match[0].length,at+match[0].length+40);
   // Physical realism and explicitly rejected styles must not overwrite art.
   if(style==='realistic'&&/^\s+(?:physics|gravity|momentum|collisions?|suspension|friction|weight|movement|motion)\b/i.test(after))continue;
   if(style==='pixel'&&/^[- ]perfect\b/i.test(after))continue;
   if(/\b(?:no|not|without|avoid|don't (?:use|want)|do not (?:use|want))\s+(?:any\s+|the\s+)?$/i.test(before))continue;
   hits.push({style,quote:match[0],index:at});
  }
 }
 const distinct=[...new Set(hits.map(x=>x.style))];
 // Multiple explicit styles are not forced into a guessed family. The full
 // literal request reaches both planner and reviewer for the requested blend.
 let preferredStyle:VisualStyle|null=distinct.length===1?distinct[0]:null;
 let styleOrigin:PresentationBrief['styleOrigin']=preferredStyle?'explicit':'unspecified';
 if(!hits.length&&input.baseRevision.game&&'assets'in input.baseRevision.game&&input.baseRevision.game.assets){
  preferredStyle=validateAssetPack(input.baseRevision.game.assets).style;styleOrigin='saved';
 }
 return {version:'presentation-brief-v1',requestHash:presentationRequestHash(input.childIntent),preferredStyle,styleOrigin,
  literalStyleEvidence:hits.sort((a,b)=>a.index-b.index).map(x=>x.quote),allowedStyles:[...PRESENTATION_STYLES],criteria:{...criteria},
  invariants:[
   'Preserve the child idea, requested style and recognizable approved characters. Quality never means converting every game into the same illustrated factory.',
   'Choose presentation, interaction, simulation and play mode independently. A simple well-composed 2D or pixel game can meet the same quality standard.',
   'Separate scenery, interactive objects and interface. Anything the child must move or change needs a live representation.',
   'Make actions visibly consequential. Challenge modes need age-appropriate skill or choice and variation; open-ended toys need meaningful exploration or expression.',
   'Plan readable tablet and desktop composition, clear action cues, meaningful feedback and kind recovery. Preserve host-owned learning.',
   'Art uploads and automatic drawing rigging are not enabled by this plan. Do not invent access to the child art library.',
   'A plan is an unverified proposal. Only actual captured play and independent review can support acceptance; no automated claim of fun or learning.'
  ]};
}

/** Conservative art preservation for saved edits. A model cannot spend an art
 * allowance to redraw an approved world during an unrelated rules change.
 * Unusual art requests remain in the literal idea and may fail explicitly;
 * this heuristic is not a claim of universal natural-language understanding. */
export function permitsNewArt(input:AgentInput):boolean {
 const game=input.baseRevision.game;
 if(!game||!('assets'in game)||!game.assets||validateAssetPack(game.assets).assets.length===0)return true;
 const brief=presentationBrief(input),savedStyle=validateAssetPack(game.assets).style;
 if(brief.preferredStyle&&brief.preferredStyle!==savedStyle)return true;
 return /\b(?:art|artwork|appearance|visuals?|style|palette|colou?rs?|texture|background|scenery|character|sprite|look|redraw|draw|paint|recolou?r|illustrat\w*|theme|replace|instead|transform|turn\b.{0,40}\binto|add\s+(?:a|an|new))\b/i.test(input.childIntent)||
  /\b(?:make|turn|change)\b.{0,60}\b(?:red|orange|yellow|green|blue|purple|pink|black|white)\s*(?:[.!?]|$|and\b)/i.test(input.childIntent);
}

export function validateGameProductionPlan(value:unknown):GameProductionPlan {
 const p=own(value),premium=p.version==='game-production-plan-v2';
 exact(p,['version','requestHash','baseRevisionId','presentationStyle','styleOrigin','playerAction','payoff','variation','openEnded','artRequests',...(premium?['design','choiceSources']:[])]);
 if(!premium&&p.version!=='game-production-plan-v1'||typeof p.requestHash!=='string'||!HASH.test(p.requestHash)||typeof p.baseRevisionId!=='string'||!/^[\w-]{1,100}$/.test(p.baseRevisionId)||
  !PRESENTATION_STYLES.includes(p.presentationStyle as VisualStyle)||!['explicit','saved','chosen'].includes(String(p.styleOrigin))||typeof p.openEnded!=='boolean'||!Array.isArray(p.artRequests)||p.artRequests.length>2)throw Error('PRODUCTION_PLAN_INVALID');
 const ids=new Set<string>();
 const artRequests=p.artRequests.map(value=>{
  const a=own(value);exact(a,['id','role','prompt','sampling']);
  if(typeof a.id!=='string'||!ID.test(a.id)||ids.has(a.id)||!['background','actor','object','effect'].includes(String(a.role))||!['pixelated','smooth'].includes(String(a.sampling)))throw Error('PRODUCTION_PLAN_INVALID');
  ids.add(a.id);return {id:a.id,role:a.role as ArtRequest['role'],prompt:bounded(a.prompt,1200),sampling:a.sampling as ArtRequest['sampling']};
 });
 const contract=premium?{version:'game-production-plan-v2' as const,design:validateProductionDesign(p.design),choiceSources:validateChoiceSources(p.choiceSources)}:{version:'game-production-plan-v1' as const};
 if(contract.version==='game-production-plan-v2'&&p.openEnded&&contract.design.payoffState==='won')throw Error('PRODUCTION_PLAN_INVALID');
 return {...contract,requestHash:p.requestHash,baseRevisionId:p.baseRevisionId,presentationStyle:p.presentationStyle as VisualStyle,styleOrigin:p.styleOrigin as GameProductionPlan['styleOrigin'],playerAction:bounded(p.playerAction,500),payoff:bounded(p.payoff,500),variation:bounded(p.variation,500),openEnded:p.openEnded,artRequests};
}

/** Bind a model proposal to independently sourced request/base metadata. */
export function bindGameProductionPlan(value:unknown,input:AgentInput,premium=false):GameProductionPlan {
 const raw=own(value);exact(raw,['presentationStyle','playerAction','payoff','variation','openEnded','artRequests',...(premium?['design']:[])]);
 const brief=presentationBrief(input);
 if(brief.preferredStyle&&raw.presentationStyle!==brief.preferredStyle)throw Error('PRESENTATION_STYLE_CHANGED');
 const binding=premium?{version:'game-production-plan-v2',choiceSources:choiceSources(input.childIntent)}:{version:'game-production-plan-v1'};
 return validateGameProductionPlan({...raw,...binding,requestHash:brief.requestHash,baseRevisionId:input.baseRevision.id,styleOrigin:brief.styleOrigin==='unspecified'?'chosen':brief.styleOrigin});
}

export function assertProductionPlanBinding(plan:GameProductionPlan,input:AgentInput,premium?:boolean):GameProductionPlan {
 const p=validateGameProductionPlan(plan),brief=presentationBrief(input);
 if((premium!==undefined&&premium!==(p.version==='game-production-plan-v2'))||p.requestHash!==brief.requestHash||p.baseRevisionId!==input.baseRevision.id||
    p.version==='game-production-plan-v2'&&JSON.stringify(p.choiceSources)!==JSON.stringify(choiceSources(input.childIntent)))throw Error('PRODUCTION_PLAN_BINDING_MISMATCH');
 if(brief.preferredStyle&&p.presentationStyle!==brief.preferredStyle)throw Error('PRESENTATION_STYLE_CHANGED');
 return p;
}

export const suggestedPlaythroughSchema={type:'array',minItems:1,maxItems:16,items:{anyOf:[
 {type:'object',additionalProperties:false,required:['type','x','y','frames'],properties:{type:{type:'string',enum:['tap']},x:{type:'number'},y:{type:'number'},frames:{type:'integer'}}},
 {type:'object',additionalProperties:false,required:['type','x','y','x2','y2','frames'],properties:{type:{type:'string',enum:['drag']},x:{type:'number'},y:{type:'number'},x2:{type:'number'},y2:{type:'number'},frames:{type:'integer'}}},
 {type:'object',additionalProperties:false,required:['type','control','frames'],properties:{type:{type:'string',enum:['hold']},control:{type:'string',enum:['left','right','up','down','action']},frames:{type:'integer'}}},
 {type:'object',additionalProperties:false,required:['type','frames'],properties:{type:{type:'string',enum:['wait']},frames:{type:'integer'}}}
]}};
export const productionPlanSchema={type:'object',additionalProperties:false,required:['presentationStyle','playerAction','payoff','variation','openEnded','artRequests'],properties:{
 presentationStyle:{type:'string',enum:PRESENTATION_STYLES},playerAction:{type:'string'},payoff:{type:'string'},variation:{type:'string'},openEnded:{type:'boolean'},
 artRequests:{type:'array',maxItems:2,items:{type:'object',additionalProperties:false,required:['id','role','prompt','sampling'],properties:{id:{type:'string'},role:{type:'string',enum:['background','actor','object','effect']},prompt:{type:'string'},sampling:{type:'string',enum:['pixelated','smooth']}}}}
}};

export const premiumProductionPlanSchema={...productionPlanSchema,required:[...productionPlanSchema.required,'design'],properties:{...productionPlanSchema.properties,design:productionDesignSchema}};
export const premiumPlaythroughSchema={...suggestedPlaythroughSchema,maxItems:captureLimits(true).actions};
