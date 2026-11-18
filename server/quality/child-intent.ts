/**
 * O1 — Child Intent Contract (research-only).
 *
 * Preserve exactly what a child said, not what an assistant wishes they said.
 * Source offsets are UTF-16 indexes into the unmodified original request.
 * Every proposed fact or relationship carries a verifiable, exact quote.
 * Nothing in this module approves an interpretation, a game design, a model
 * call, a generated artifact, a release, or an edit to an existing version.
 */
import {createHash} from 'node:crypto';

export const CHILD_INTENT_VERSION='jems-child-intent-v1' as const;
export const INTENT_FACETS=[
  'entity-mention','player-action','observable-effect','payoff','goal',
  'negative-constraint','presentation-request','play-mode','unclassified'
] as const;
export type IntentFacet=(typeof INTENT_FACETS)[number];
export const INTENT_UNKNOWNS=[
  'player-action-not-stated','goal-or-payoff-not-stated','unparsed-fragment',
  'contrast-needs-review','referent-needs-review','drawing-role-needs-review',
  'revision-scope-needs-review','depth-meaning-needs-review'
] as const;
export type IntentUnknownCode=(typeof INTENT_UNKNOWNS)[number];
export interface IntentSpan { start:number; end:number; quote:string }
export interface IntentFact {
  id:string; facet:IntentFacet; evidence:IntentSpan;
  annotation:'rule-proposal'|'reviewer-proposal';
}
export interface IntentRelation {
  id:string; from:string; to:string; kind:'sequence'|'causal-claim';
  evidence:IntentSpan; annotation:'rule-proposal'|'reviewer-proposal';
}
export interface IntentUnknown {
  code:IntentUnknownCode; evidence?:IntentSpan;
}
export interface ChildIntentContract {
  version:typeof CHILD_INTENT_VERSION;
  status:'proposed-not-child-confirmed';
  source:{raw:string;sha256:string;offsets:'utf16'};
  revision:{projectId:string|null;baseRevisionId:string|null};
  facts:IntentFact[];
  relations:IntentRelation[];
  unknowns:IntentUnknown[];
}

const MAX_REQUEST=4000;
const MAX_FACTS=32;
const MAX_RELATIONS=24;
const MAX_UNKNOWNS=12;
const ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
const FACT_ID=/^[a-z][a-z0-9-]{0,39}$/;
const error=(code:string):never=>{throw Error('CHILD_INTENT_INVALID_'+code);};
const record=(value:unknown):Record<string,unknown>=>{
  if(!value||typeof value!=='object'||Array.isArray(value))error('SHAPE');
  const obj=value as Record<string,unknown>;
  if(Object.getPrototypeOf(obj)!==Object.prototype&&Object.getPrototypeOf(obj)!==null)error('SHAPE');
  return obj;
};
const keys=(value:Record<string,unknown>,required:readonly string[],optional:readonly string[]=[]):void=>{
  const allowed=new Set([...required,...optional]);
  if(required.some(k=>!Object.hasOwn(value,k))||Object.keys(value).some(k=>!allowed.has(k)))error('FIELDS');
};
const hash=(raw:string)=>createHash('sha256').update(raw,'utf8').digest('hex');
const idOrNull=(value:unknown):string|null=>{
  if(value===null)return null;
  if(typeof value!=='string'||!ID.test(value))error('REVISION_REF');
  return value;
};
const halfSurrogate=(raw:string,index:number):boolean=>
  index>0&&index<raw.length&&raw.charCodeAt(index)>=0xdc00&&raw.charCodeAt(index)<=0xdfff&&
  raw.charCodeAt(index-1)>=0xd800&&raw.charCodeAt(index-1)<=0xdbff;

function validateSpan(value:unknown,raw:string):IntentSpan {
  const span=record(value);
  keys(span,['start','end','quote']);
  const {start,end,quote}=span;
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||
     typeof quote!=='string'||(start as number)<0||(end as number)<=(start as number)||
     (end as number)>raw.length||!quote.trim()||
     halfSurrogate(raw,start as number)||halfSurrogate(raw,end as number)||
     raw.slice(start as number,end as number)!==quote)error('SOURCE_SPAN');
  return {start:start as number,end:end as number,quote};
}

/** Rejects fabricated or stale source, revision references, fields, and links.
 * Source matching does not prove semantic classification — all labels remain proposals.
 */
export function validateChildIntentContract(value:unknown):ChildIntentContract {
  const data=record(value);
  keys(data,['version','status','source','revision','facts','relations','unknowns']);
  if(data.version!==CHILD_INTENT_VERSION||data.status!=='proposed-not-child-confirmed')error('VERSION');
  const src=record(data.source);
  keys(src,['raw','sha256','offsets']);
  if(typeof src.raw!=='string'||!src.raw.trim()||src.raw.length>MAX_REQUEST||
     src.raw.includes('\0')||src.offsets!=='utf16'||typeof src.sha256!=='string'||
     src.sha256!==hash(src.raw))error('ORIGINAL_SOURCE');
  const rev=record(data.revision);
  keys(rev,['projectId','baseRevisionId']);
  const projectId=idOrNull(rev.projectId),baseRevisionId=idOrNull(rev.baseRevisionId);
  if(!Array.isArray(data.facts)||data.facts.length>MAX_FACTS||
     !Array.isArray(data.relations)||data.relations.length>MAX_RELATIONS||
     !Array.isArray(data.unknowns)||data.unknowns.length>MAX_UNKNOWNS)error('BOUNDS');

  const used=new Set<string>();
  const facts:IntentFact[]=data.facts.map(entry=>{
    const f=record(entry);
    keys(f,['id','facet','evidence','annotation']);
    if(typeof f.id!=='string'||!FACT_ID.test(f.id)||used.has(f.id)||
       !INTENT_FACETS.includes(f.facet as IntentFacet)||
       !['rule-proposal','reviewer-proposal'].includes(f.annotation as string))error('FACT');
    used.add(f.id);
    return {id:f.id,facet:f.facet as IntentFacet,evidence:validateSpan(f.evidence,src.raw as string),
      annotation:f.annotation as IntentFact['annotation']};
  });

  const relationIds=new Set<string>();
  const relations:IntentRelation[]=data.relations.map(entry=>{
    const r=record(entry);
    keys(r,['id','from','to','kind','evidence','annotation']);
    if(typeof r.id!=='string'||!FACT_ID.test(r.id)||relationIds.has(r.id)||
       typeof r.from!=='string'||typeof r.to!=='string'||r.from===r.to||
       !used.has(r.from)||!used.has(r.to)||
       !['sequence','causal-claim'].includes(r.kind as string)||
       !['rule-proposal','reviewer-proposal'].includes(r.annotation as string))error('RELATION');
    relationIds.add(r.id);
    const evidence=validateSpan(r.evidence,src.raw as string);
    // A relation cannot be asserted from an unrelated part of the idea.
    // This lexical gate is not a proof of actual causal semantics.
    if(!/\b(?:then|after|before|so|because|when|until)\b/i.test(evidence.quote))error('RELATION_EVIDENCE');
    return {id:r.id,from:r.from,to:r.to,kind:r.kind as IntentRelation['kind'],evidence,
      annotation:r.annotation as IntentRelation['annotation']};
  });

  const seenUnknowns=new Set<string>();
  const unknowns:IntentUnknown[]=data.unknowns.map(entry=>{
    const u=record(entry);
    keys(u,['code'],['evidence']);
    if(!INTENT_UNKNOWNS.includes(u.code as IntentUnknownCode))error('UNKNOWN_CODE');
    const evidence=u.evidence===undefined?undefined:validateSpan(u.evidence,src.raw as string);
    const key=String(u.code)+':'+(evidence?.start??'')+':'+(evidence?.end??'');
    if(seenUnknowns.has(key))error('UNKNOWN_DUPLICATE');
    seenUnknowns.add(key);
    return evidence?{code:u.code as IntentUnknownCode,evidence}:{code:u.code as IntentUnknownCode};
  });
  return {
    version:CHILD_INTENT_VERSION,status:'proposed-not-child-confirmed',
    source:{raw:src.raw,sha256:src.sha256,offsets:'utf16'},
    revision:{projectId,baseRevisionId},facts,relations,unknowns
  } as ChildIntentContract;
}

export function exactIntentSpan(raw:string,quote:string,occurrence?:number):IntentSpan {
  if(typeof raw!=='string'||typeof quote!=='string'||!quote.trim())error('QUOTE');
  if(occurrence!==undefined&&(!Number.isSafeInteger(occurrence)||occurrence<0))error('QUOTE_INDEX');
  const indices:number[]=[];
  let at=0;
  while(at<=raw.length-quote.length){
    const index=raw.indexOf(quote,at);
    if(index<0)break;
    indices.push(index);
    at=index+Math.max(1,quote.length);
  }
  if(indices.length===0||occurrence===undefined&&indices.length!==1||
     occurrence!==undefined&&occurrence>=indices.length)error('QUOTE_AMBIGUOUS_OR_ABSENT');
  const start=indices[occurrence??0],end=start+quote.length;
  return validateSpan({start,end,quote},raw);
}

export interface IntentDraftContext {projectId?:string|null;baseRevisionId?:string|null}
interface Clause {span:IntentSpan; preceding?:IntentSpan}

function draftClauses(raw:string):Clause[] {
  // "and" is a boundary only when a recognizable second action follows.
  // Never split a compound subject such as "red and blue socks".
  const splitter=/[,;.!?]+\s*(?:and\s+)?then\s+|\s+and\s+then\s+|\s+then\s+|\s+and\s+(?=(?:(?:it|they|the\s+\w+)\s+)?(?:blast(?:s)?|launch(?:es)?|grow(?:s)?|get(?:s)?|explode(?:s)?|dance(?:s)?|change(?:s)?|move(?:s)?|eat(?:s)?|jump(?:s)?|drive(?:s)?|fly|find(?:s)?|press|stick(?:s)?|turn(?:s)?)\b)|\s+but\s+|[,;.!?\n]+/gi;
  const result:Clause[]=[];
  let cursor=0,preceding:IntentSpan|undefined;
  const append=(from:number,to:number)=>{
    const segment=raw.slice(from,to);
    const left=segment.length-segment.trimStart().length;
    const right=segment.trimEnd().length;
    let start=from+left,end=from+right;
    if(start>=end)return;
    // Conventional "make a game where" is a framing request, not gameplay.
    const unframed=raw.slice(start,end).match(/^(?:(?:please|can you|could you)\s+)?(?:make|create|build|invent)(?:\s+me)?\s+(?:a|an|the)\s+game\s+(?:where|in which|about|with)\s+/i);
    if(unframed)start+=unframed[0].length;
    if(start<end)result.push({span:{start,end,quote:raw.slice(start,end)},preceding});
  };
  for(const match of raw.matchAll(splitter)){
    append(cursor,match.index);
    preceding={start:match.index,end:match.index+match[0].length,quote:match[0]};
    cursor=match.index+match[0].length;
  }
  append(cursor,raw.length);
  if(result.length>MAX_FACTS)error('FACT_LIMIT');
  return result;
}

function classify(quote:string):IntentFacet {
  const s=quote.toLowerCase();
  if(/\b(?:no|without|never|don't|do not|avoid|skip|must not)\b/.test(s))return 'negative-constraint';
  if(/\b(?:free\s*play|endless|sandbox|no\s+win\s+screen)\b/.test(s))return 'play-mode';
  if(/\b(?:blast(?:s|ing)?\s+(?:off|away)|launch(?:es|ed|ing)?\s+(?:off|away|into)|explode(?:s|d|ing)?\s+into|celebrat(?:e|es|ion)|dance(?:s|d|ing)?|reveals?\s+(?:a|the)|win(?:s|ning)?\s+(?:when|after))\b/.test(s))return 'payoff';
  if(/\b(?:grow(?:s|ing)?|get(?:s)?\s+(?:big|bigger|giant)|change(?:s|d)?\s+colou?r|turn(?:s)?\s+(?:big|giant|pink|blue)|stick(?:s)?\s+together|snap(?:s)?\s+apart)\b/.test(s))return 'observable-effect';
  if(/\b(?:reach(?:es)?\s+(?:the|a)|finish(?:es)?\s+(?:the|a)|score\s+\d+|win\s+the\s+game)\b/.test(s))return 'goal';
  if(/\b(?:drag(?:ging)?|drop(?:ping)?|put|stick|assemble|place|move|drive|jump|eat(?:s|ing)?|catch|collect(?:s|ing)?|tap|choose|steer|draw|paint|press|program|tell|follow|run|fly|guide|turn|shoot|build\s+a)\b/.test(s))return 'player-action';
  if(/\b(?:2d|3d|three[- ]dimensional|top[- ]down|side[- ]view|cartoon|pixel[- ]art|purple|colorful|colourful)\b/.test(s))return 'presentation-request';
  if(/\b(?:cat|robot|rocket|socks?|donuts?|moon|car|truck|castle|dragon|ball|submarine|boat|dog|spaceship)\b/.test(s))return 'entity-mention';
  return 'unclassified';
}

/**
 * Conservative no-provider proposal from words alone. The raw request is
 * unchanged; unrecognized semantics are marked unknown, never supplied by AI.
 * Subsequent O2/O3/O4 stages must not mistake these tags for child approval.
 */
export function draftChildIntentContract(raw:string,context:IntentDraftContext={}):ChildIntentContract {
  if(typeof raw!=='string'||!raw.trim()||raw.length>MAX_REQUEST||raw.includes('\0'))error('ORIGINAL_SOURCE');
  const clauses=draftClauses(raw);
  const facts:IntentFact[]=clauses.map((clause,i)=>({
    id:'f'+(i+1),facet:classify(clause.span.quote),evidence:clause.span,
    annotation:'rule-proposal'
  }));
  // Objects/characters are explicit mentions, NOT a recommendation to create
  // them (a noun may occur in a prohibition). Preserve the exact source span.
  const mentions=/\b(?:bubble\s+gum|gum|socks?|robots?|rockets?|cats?|donuts?|moons?|cars?|trucks?|castles?|dragons?|balls?|submarines?|boats?|dogs?|spaceships?|wheels?|springs?)\b/gi;
  for(const m of raw.matchAll(mentions)){
    if(facts.length>=MAX_FACTS)error('FACT_LIMIT');
    const start=m.index,end=start+m[0].length;
    facts.push({id:'f'+(facts.length+1),facet:'entity-mention',
      evidence:{start,end,quote:m[0]},annotation:'rule-proposal'});
  }
  const relations:IntentRelation[]=[];
  clauses.forEach((clause,index)=>{
    if(index===0||!clause.preceding||!/\bthen\b/i.test(clause.preceding.quote))return;
    if(relations.length<MAX_RELATIONS)relations.push({
      id:'l'+(relations.length+1),kind:'sequence',
      from:facts[index-1].id,to:facts[index].id,evidence:clause.preceding,
      annotation:'rule-proposal'
    });
  });
  const unknowns:IntentUnknown[]=[];
  const add=(code:IntentUnknownCode,evidence?:IntentSpan)=>{
    if(unknowns.length<MAX_UNKNOWNS)unknowns.push(evidence?{code,evidence}:{code});
  };
  if(!facts.some(f=>f.facet==='player-action'))add('player-action-not-stated');
  if(!facts.some(f=>f.facet==='goal'||f.facet==='payoff'||f.facet==='play-mode'))add('goal-or-payoff-not-stated');
  if(facts.some(f=>f.facet==='unclassified'))add('unparsed-fragment');
  if(/\bbut\b/i.test(raw)){
    const index=raw.search(/\bbut\b/i);
    add('contrast-needs-review',{start:index,end:index+3,quote:raw.slice(index,index+3)});
  }
  if(/\b(?:draw|drawing|paint)\b[\s\S]{0,100}\bwheels?\b/i.test(raw))
    add('drawing-role-needs-review');
  if(/\b(?:3d|three[- ]dimensional)\b/i.test(raw))add('depth-meaning-needs-review');
  if(context.baseRevisionId&&/\b(?:better|fix it|change it|improve it)\b/i.test(raw))
    add('revision-scope-needs-review');
  const projectId=context.projectId===undefined?null:context.projectId;
  const baseRevisionId=context.baseRevisionId===undefined?null:context.baseRevisionId;
  return validateChildIntentContract({
    version:CHILD_INTENT_VERSION,status:'proposed-not-child-confirmed',
    source:{raw,sha256:hash(raw),offsets:'utf16'},
    revision:{projectId,baseRevisionId},
    facts,relations,unknowns
  });
}
