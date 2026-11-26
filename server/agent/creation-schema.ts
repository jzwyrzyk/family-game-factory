import {ILLUSTRATED_WORLDS} from '../../src/creation/illustrated-art';
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
  background:{type:'string',enum:['meadow','night','workshop','sky',...ILLUSTRATED_WORLDS.map(world=>world.id)]},
  actors:{type:'array',items:object({id:string,name:string,assetId:{type:'string',enum:CREATION_ASSETS.map(asset=>asset.id)},x:number,y:number,size:number,visible:{type:'boolean'}})},
  programs:{type:'array',items:object({id:string,actorId:string,trigger:{anyOf:[object({type:{type:'string',enum:['start','tap']}}),object({type:{type:'string',const:'event'},name:string})]},actions:blocks})},
  // Named variables are represented by a closed object in strict provider output.
  // Host validation accepts this subset; children can add their own names later.
  variables:object({score:number,counter:number}),
});
export const creationManifestInstructions=`Optional editable companion: creationManifest is a separate editable scene when a short animation fits, else null. Deliver the requested playable game in source. Use visible actions and schema asset IDs. Pick an illustrated world for a new scene; preserve compatible saved scenes on edits. Never substitute catalogue art for a child's drawing. Limits: 16 actors, 48 programs, 300 blocks, depth 6, repeats 0..50, durations 0..10000ms, speech 160 characters, size 16..240, stage 800x450. Unique IDs start with a letter or number. One program per actor/trigger/event. Declare score and counter; only use these in variable blocks. All supplied blocks are AI-assisted. Exclude source code, URLs, image data, credentials, private information and invented provenance.`;
