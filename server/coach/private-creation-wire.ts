import type {CoachContext} from '../../src/studio/design';

const evidenceKeys=['action','consequence','experience','world'] as const;
const creativeEvidenceKeys=[...evidenceKeys,'goal','visualStyle','mood'] as const;
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const exactKeys=(value:Record<string,unknown>,keys:readonly string[])=>Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const invalid=(message='Invalid creation review.'):never=>{throw Error(message);};
const object=(properties:Record<string,unknown>)=>({type:'object',additionalProperties:false,properties,required:Object.keys(properties)});
const evidence=(item:object)=>object(Object.fromEntries(evidenceKeys.map(key=>[key,item])));

/** Preserve each UTF-16 character, including whitespace and surrogate pairs.
 * Prefer an existing sentence/phrase boundary once a chunk is substantial.
 * The ceiling matches the unchanged public quote/plan contract. */
function chunks(text:string):string[] {
 const result:string[]=[];let start=0;
 while(start<text.length){
  let end=Math.min(start+700,text.length),cut=0;
  const part=text.slice(start,end);
  for(const match of part.matchAll(/[.!?]["')\]]*\s+|[,;:]\s+|\n+/g)){
   const boundary=match.index!+match[0].length;
   if(boundary>=256){cut=boundary;break;}
  }
  if(cut)end=start+cut;
  else if(end<text.length){
   for(let index=part.length-1;index>=256;index--)if(/\s/.test(part[index])){end=start+index+1;break;}
  }
  if(end<text.length&&/[\uD800-\uDBFF]/.test(text[end-1])&&/[\uDC00-\uDFFF]/.test(text[end]))end--;
  result.push(text.slice(start,end));start=end;
 }
 return result;
}

export interface PreparedCreationWire {
 input:unknown;
 schema:object;
 decode(value:unknown):unknown;
}

/** Private provider protocol only. Catalog IDs never cross the public boundary.
 * The model judges readiness; IDs merely bind its evidence to existing words.
 * The unchanged public validator must still validate the decoded reply. */
export function prepareCreationWire(context:CoachContext,baseSchema:object):PreparedCreationWire {
 if(context.creation?.version!==1&&context.creation?.version!==2)return {input:context,schema:baseSchema,decode:value=>value};
  const reviewKeys=context.creation.version===2?creativeEvidenceKeys:evidenceKeys;
 const sources:{id:string;text:string;childDecision:boolean}[]=[],byText=new Map<string,typeof sources[number]>();
 const reference=(text:string,childDecision:boolean)=>{
  const sourceIds=chunks(text).map(part=>{
   let source=byText.get(part);
   if(!source){
    // Four readiness enums stay below the provider's total enum-value
    // ceiling, including the ordinary response enums.
    if(sources.length>=(context.creation!.version===2?110:160))throw Error('INVALID_REQUEST');
    source={id:'s'+sources.length,text:part,childDecision:childDecision&&!!part.trim()};
    sources.push(source);byText.set(part,source);
   }else if(childDecision&&part.trim())source.childDecision=true;
   return source.id;
  });
  return {sourceIds};
 };
 const input=structuredClone(context) as unknown as Record<string,unknown>;
 input.message=reference(context.message,true);
 input.conversation=context.conversation.map(turn=>({...turn,text:turn.role==='child'?reference(turn.text,true):turn.text}));
 input.plan=Object.fromEntries(Object.entries(context.plan).map(([field,value])=>[
  field,value?{...value,value:value.origin==='child'&&value.accepted&&!value.delegated?reference(value.value,false):value.value}:value
 ]));
 input.creationSources=sources;
 const byId=new Map(sources.map(source=>[source.id,source]));
 const readyIds=sources.filter(source=>source.text.trim()).map(source=>source.id);
 // JSON Schema counts code points; the unchanged host counts UTF-16 units.
 // This provider limit also fits the host's 350-unit bound for astral text.
 const gap={type:'string',minLength:1,maxLength:175,pattern:'\\S'};
 const branches=[object({ready:{type:'boolean',enum:[false]},evidence:object(Object.fromEntries(reviewKeys.map(key=>[key,{type:'string',enum:['']}]))),
  unresolved:{type:'array',maxItems:8,items:gap}})];
 if(readyIds.length)branches.push(object({ready:{type:'boolean',enum:[true]},evidence:object(Object.fromEntries(reviewKeys.map(key=>[key,{type:'string',enum:readyIds}]))),
  unresolved:{type:'array',maxItems:0,items:gap}}));
 const schema=structuredClone(baseSchema) as Record<string,unknown>;
 if(!record(schema.properties))throw Error('INVALID_REQUEST');
 schema.properties.creationReadiness={anyOf:branches};

 const decode=(value:unknown):unknown=>{
  if(!record(value))return invalid();
  const verdict=value.creationReadiness;
  if(verdict===undefined||verdict===null)return invalid('CREATION_REVIEW_MISSING');
  if(!record(verdict)||!exactKeys(verdict,['ready','evidence','unresolved'])||typeof verdict.ready!=='boolean'||
   !record(verdict.evidence)||!exactKeys(verdict.evidence,reviewKeys)||
   !reviewKeys.every(key=>typeof (verdict.evidence as Record<string,unknown>)[key]==='string')||
   !Array.isArray(verdict.unresolved)||verdict.unresolved.length>8||
   !verdict.unresolved.every(item=>typeof item==='string'&&!!item.trim()&&item.length<=350&&Array.from(item).length<=175))return invalid();
  const quoted=verdict.evidence;
  if(verdict.ready&&(verdict.unresolved.length||reviewKeys.some(key=>quoted[key]==='')))
   return invalid('A ready game needs grounded intent and no unresolved design gaps.');
  const restored=Object.fromEntries(reviewKeys.map(key=>{
   const id=quoted[key] as string;
   if(!verdict.ready){if(id!=='')return invalid();return [key,''];}
   const source=byId.get(id);
   if(!source?.text.trim())return invalid('Invalid creation evidence reference.');
   return [key,source.text];
  }));
  // Child decisions retain their existing literal short-quote contract.
  // Expanding a choice to a whole catalog chunk can conflate independent
  // decisions when a later correction supersedes only one plan field.
  return structuredClone({...value,creationReadiness:{ready:verdict.ready,evidence:restored,unresolved:verdict.unresolved}});
 };
 return {input,schema,decode};
}
