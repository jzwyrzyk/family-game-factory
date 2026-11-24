// Server-owned offsets point into the original private build request. The stored
// artifact needs neither a second transcript nor model-invented author credits.
export const interactionInputs=['tap','drag','left','right','up','down','action'] as const;
export type InteractionInput=typeof interactionInputs[number];
export interface ProductionInteraction {action:string; input:InteractionInput; consequence:string}
const designFields=['consequence','purpose','world','mood','controls','feedback','recovery'] as const;
export type ProductionDesign=Record<typeof designFields[number],string>&{
 payoffState:'won'|'playing'; interactions:ProductionInteraction[]
};
export interface ChoiceSource {origin:'request'|'child-choice'|'helper-suggested-child-chose'; start:number; end:number}

function invalid():never {throw Error('PRODUCTION_PLAN_INVALID');}
function object(value:unknown,fields:readonly string[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))||
    fields.some(key=>!Object.hasOwn(value,key))||Object.keys(value).some(key=>!fields.includes(key)))invalid();
 return value as Record<string,unknown>;
}
function phrase(value:unknown,max:number):string{
 if(typeof value!=='string'||!value.trim()||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))invalid();
 return value;
}

export function validateProductionDesign(value:unknown):ProductionDesign{
 const design=object(value,[...designFields,'interactions','payoffState']);
 if(design.payoffState!=='playing'&&design.payoffState!=='won')invalid();
 if(!Array.isArray(design.interactions)||design.interactions.length<1||design.interactions.length>8)invalid();
 const interactions=design.interactions.map(value=>{
  const entry=object(value,['action','input','consequence']);
  if(!interactionInputs.includes(entry.input as InteractionInput))invalid();
  return {action:phrase(entry.action,200),input:entry.input as InteractionInput,consequence:phrase(entry.consequence,240)};
 });
 return {consequence:phrase(design.consequence,320),purpose:phrase(design.purpose,320),world:phrase(design.world,320),mood:phrase(design.mood,320),
  controls:phrase(design.controls,320),feedback:phrase(design.feedback,320),recovery:phrase(design.recovery,320),interactions,payoffState:design.payoffState};
}

// compileGuidedBuild keeps offers quoted with JSON.stringify (including escaped
// newlines). Keep its literal label and all multiline values; raw freeform edits
// carry no inferred author identity. These are reported origins, not auth data.
const header='\nGame choices in order (newer changes take priority):\n';
const quotedOffer=String.raw`"(?:[^"\\\n]|\\.)*"`;
// Wire labels emitted by compileGuidedBuild. The worker/preview cannot import
// the Studio application. The contract test covers every current Studio field.
const fields='fun|action|goal|setback|score|style|viewpoint|movement|progression|special';
const label=new RegExp('^(?:('+fields+')(?:( \\(jems suggested '+quotedOffer+'(?: \\+ '+quotedOffer+')*, child chose\\)))?|Also): ','gm');
export function choiceSources(request:string):ChoiceSource[]{
 const split=request.indexOf(header);
 if(split<0)return [{origin:'request',start:0,end:request.length}];
 const offset=split+header.length;
 const matches=[...request.slice(offset).matchAll(label)];
 if(!matches.length||matches[0].index!==0)return [{origin:'request',start:0,end:request.length}];
 const spans:ChoiceSource[]=split>0?[{origin:'request',start:0,end:split}]:[];
 for(const [index,match] of matches.entries()){
  spans.push({origin:match[2]?'helper-suggested-child-chose':'child-choice',start:offset+match.index!,
   end:matches[index+1]?offset+matches[index+1].index!-1:request.length});
 }
 return spans;
}
export function validateChoiceSources(value:unknown):ChoiceSource[]{
 if(!Array.isArray(value)||!value.length||value.length>512)invalid();
 let previousEnd=0;
 return value.map(entry=>{
  const span=object(entry,['origin','start','end']),{start,end,origin}=span;
  if(typeof start!=='number'||!Number.isInteger(start)||start<previousEnd||typeof end!=='number'||!Number.isInteger(end)||end<=start||end>4000||
    (origin!=='request'&&origin!=='child-choice'&&origin!=='helper-suggested-child-chose'))invalid();
  previousEnd=end;return {origin,start,end};
 });
}

const textSchema={type:'string',minLength:1,maxLength:320};
export const productionDesignSchema={type:'object',additionalProperties:false,required:[...designFields,'payoffState','interactions'],properties:{
 ...Object.fromEntries(designFields.map(field=>[field,textSchema])),
 payoffState:{type:'string',enum:['playing','won']},
 interactions:{type:'array',minItems:1,maxItems:8,items:{type:'object',additionalProperties:false,required:['action','input','consequence'],
  properties:{action:{type:'string',minLength:1,maxLength:200},input:{type:'string',enum:interactionInputs},consequence:{type:'string',minLength:1,maxLength:240}}}}
}};
