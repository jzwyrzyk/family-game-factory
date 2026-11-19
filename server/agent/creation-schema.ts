/** Closed, code-free companion scene schema for optional provider output. */
import { CREATION_ASSETS } from '../../src/creation/projects';
const object=(properties:Record<string,unknown>)=>({type:'object',additionalProperties:false,required:Object.keys(properties),properties});
const string={type:'string'},number={type:'number'},integer={type:'integer'};
const blockRef={$ref:'#/$defs/creationBlock'},blocks={type:'array',items:blockRef};
const block=(type:string,fields:Record<string,unknown>={})=>object({id:string,type:{type:'string',const:type},...fields});
export const creationManifestDefinitions={
  creationBlock:{anyOf:[
    block('move',{x:number,y:number,durationMs:integer}),block('wait',{durationMs:integer}),
    block('say',{text:string,durationMs:integer}),block('dance',{durationMs:integer}),
    block('jump',{height:number,durationMs:integer}),block('show'),block('hide'),
    block('repeat',{count:integer,actions:blocks}),
    block('if',{condition:{$ref:'#/$defs/creationCondition'},then:blocks,else:blocks}),
    block('set',{variable:string,value:number}),block('change',{variable:string,amount:number}),block('emit',{name:string}),
  ]},
  creationCondition:{anyOf:[
    object({type:{type:'string',const:'variable'},variable:string,operator:{type:'string',enum:['eq','neq','lt','lte','gt','gte']},value:number}),
    object({type:{type:'string',const:'position'},axis:{type:'string',enum:['x','y']},operator:{type:'string',enum:['eq','neq','lt','lte','gt','gte']},value:number}),
    object({type:{type:'string',const:'touching'},actorId:string}),
  ]},
};
export const creationManifestSchema=object({
  schema:{type:'string',const:'jems.creation.v1'},id:string,title:string,width:{type:'integer',const:800},height:{type:'integer',const:450},
  background:{type:'string',enum:['meadow','night','workshop','sky']},
  actors:{type:'array',items:object({id:string,name:string,assetId:{type:'string',enum:CREATION_ASSETS.map(asset=>asset.id)},x:number,y:number,size:number,visible:{type:'boolean'}})},
  programs:{type:'array',items:object({id:string,actorId:string,trigger:{anyOf:[object({type:{type:'string',enum:['start','tap']}}),object({type:{type:'string',const:'event'},name:string})]},actions:blocks})},
  // Named variables are represented by a closed object in strict provider output.
  // Host validation accepts this subset; children can add their own names later.
  variables:object({score:number,counter:number}),
});
export const creationManifestInstructions=`Optional editable companion: include creationManifest when a short animated companion fits the child's dragon, bucket, robot, story or compatible game; otherwise set it to null. The playable source remains authoritative and must satisfy the game request. This manifest is a separate editable scene, not a claim that arbitrary source or its artwork has been translated. Use only the assetId values in the response schema; these are reviewed jems characters/art. Never claim a generic catalogue asset is the child's custom drawing. Reuse a supplied compatible companion when extending it, but keep the requested game behavior intact. Use a few concrete, visible actions so the child can direct what happens next. Maximum 16 actors, 48 programs, 300 total blocks, nesting depth 6, repeat count 0..50, action durations 0..10000ms, speech 160 characters, size16..240, positions within800x450. All IDs are unique plain identifiers beginning with a letter or number. Each actor has at most one program per trigger/event name. Declare score and counter variables; any set/change/variable condition must use one of those names. The service records all supplied blocks as AI-assisted. Do not include source code, URLs, image data, credentials, private information or invented source-provenance claims in the manifest.`;
