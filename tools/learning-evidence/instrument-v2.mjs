/**
 * Jems Objective 2 independent assessment kernel (research-only).
 * The PUBLIC repository holds this code and slot plans, NEVER protected test items.
 * No child identity, network, runtime UI, data retention or standardized claims.
 */
const SUBJECTS=new Set(["math","ela"]), FORMATS=new Set(["closed_choice","numeric","short_text","audio_choice","human_rubric"]);
const HELP=new Set(["none","neutral_instructions","adult_help","ai_help","revealed_solution","read_aloud_stimulus","other"]);
const STATES=new Set(["answered","skipped","aborted","technical_invalid"]);
export const RUBRIC_DIMENSIONS=Object.freeze({
  "MATH-REASONING-0-2":["strategy"],
  "ELA-WRITING-4x0-2":["idea","organization","development","language_conventions"],
  "ELA-RESEARCH-4x0-2":["question_source","evidence_selection","integration","communication"]
});
const fail=why=>{throw new Error(why)};
const isObj=x=>!!x&&typeof x==="object"&&!Array.isArray(x);
const clean=x=>String(x??"").normalize("NFKC").trim().replace(/\s+/g," ");
const norm=x=>clean(x).toLocaleLowerCase("en-US").replace(/[.!?]+$/,"");
const uniq=a=>new Set(a).size===a.length;

export function validateBlueprintCatalog(catalog,allStandards){
  if(!isObj(catalog)||catalog.schema!=="jems.research.blueprint.v2"||!Array.isArray(catalog.forms)||catalog.forms.length!==24)fail("invalid 24-form blueprint catalog");
  const all=new Set((allStandards||[]).map(x=>x.subject+":"+x.code)), ids=new Set();
  const expected={
    "math:1":{oa:13,nbt:9,md:7,g:5}, "math:2":{oa:5,nbt:10,md:16,g:5},
    "math:3":{concepts:19,problem_solving:4,reasoning:8,modeling:5},"math:4":{concepts:19,problem_solving:4,reasoning:8,modeling:5},
    "ela:1":{rl:6,ri:6,rf:9,w:6,l:9},"ela:2":{rl:7,ri:8,rf:6,w:8,l:10},
    "ela:3":{reading:15,writing:13,listening:8,research:8},"ela:4":{reading:15,writing:13,listening:8,research:8}
  };
  for(const form of catalog.forms){
    if(!SUBJECTS.has(form.subject)||![1,2,3,4].includes(form.grade)||!["A","B","C"].includes(form.form))fail("invalid subject/grade/form");
    const id=form.subject+":"+form.grade+":"+form.form;if(ids.has(id))fail("duplicate form");ids.add(id);
    if(form.id!=="JEMS-"+form.subject.toUpperCase()+"-G"+form.grade+"-"+form.form+"-v2")fail("form ID mismatch");
    if(!Array.isArray(form.slots)||form.slots.length!==form.totalItems)fail("form count mismatch");
    let points=0;const counts={},seen=new Set();
    for(const slot of form.slots){
      if(!isObj(slot)||!clean(slot.id)||seen.has(slot.id)||slot.grade!==form.grade||!FORMATS.has(slot.format))fail("invalid slot");
      seen.add(slot.id);
      if(!Number.isInteger(slot.points)||slot.points<1||slot.points>8)fail("invalid points");
      if(!Array.isArray(slot.standardIds)||!slot.standardIds.length||slot.standardIds.some(x=>!all.has(form.subject+":"+x)))fail("unknown standards");
      if(slot.itemContentStatus!=="secure_bank_required")fail("public blueprint must require private item bank");
      if(["prompt","passage","correctValue","correctOptionId","acceptedAnswers","answer","solution","audioTranscript"].some(x=>Object.hasOwn(slot,x)))fail("secret content in public blueprint");
      if(slot.format==="audio_choice"&&(form.subject!=="ela"||slot.accessibility!=="original-stimulus-audio-no-text-transcript"))fail("listening requires hidden transcript");
      if(slot.format==="human_rubric"&&!Object.hasOwn(RUBRIC_DIMENSIONS,slot.scoringGuideId))fail("unrecognized rubric");
      counts[slot.claim.toLowerCase()]=(counts[slot.claim.toLowerCase()]||0)+1;points+=slot.points;
    }
    if(form.possiblePoints!==points)fail("possible points mismatch");
    const required=expected[form.subject+":"+form.grade];if(Object.keys(counts).length!==Object.keys(required).length||Object.entries(required).some(([claim,n])=>counts[claim]!==n))fail("claim quotas mismatch");
    if(form.subject==="math"&&form.grade>=3&&form.slots.filter(x=>x.format==="human_rubric").length<4)fail("unscored mathematical reasoning");
    if(form.subject==="ela"&&form.grade>=3&&form.slots.filter(x=>x.format==="audio_choice").length!==8)fail("listening omitted");
  }
  return {status:"valid_blueprint_not_validated_test",forms:ids.size,slots:catalog.forms.reduce((n,x)=>n+x.slots.length,0)};
}
function rubricMax(id){return id==="MATH-REASONING-0-2"?2:2;}
function validMarks(id,m){
  const dims=RUBRIC_DIMENSIONS[id];return !!dims&&isObj(m)&&Object.keys(m).length===dims.length&&dims.every(x=>Object.hasOwn(m,x)&&Number.isInteger(m[x])&&m[x]>=0&&m[x]<=rubricMax(id));
}
export function validateSecureFormBank(form,bank){
  if(!isObj(bank)||bank.schema!=="jems.secure.bank.v2"||bank.formId!==form.id||!clean(bank.version)||!Array.isArray(bank.items)||bank.items.length!==form.slots.length)fail("private bank does not fill form");
  const slots=new Map(form.slots.map(x=>[x.id,x])),seen=new Set();
  for(const item of bank.items){
    const slot=slots.get(item.slotId);if(!slot||seen.has(item.slotId)||item.format!==slot.format||!clean(item.prompt)||!clean(item.version))fail("invalid private item or duplicate");seen.add(item.slotId);
    if(["closed_choice","audio_choice"].includes(item.format)){
      const opts=item.options;if(!Array.isArray(opts)||opts.length<2||opts.length>6||!uniq(opts.map(x=>x.id))||!uniq(opts.map(x=>clean(x.label)))||opts.some(x=>!clean(x.id)||!clean(x.label)))fail("invalid choice options");
      if(!opts.some(x=>x.id===item.correctOptionId))fail("correct option not found");
      if(item.format==="audio_choice"&&(!clean(item.audioAssetId)||item.transcriptVisible===true))fail("audio missing or transcript exposed");
    }else if(item.format==="numeric"){
      if(!numericValue(item,item.correctValue))fail("invalid numeric key");
      if(item.unitMode&&!["none","optional","required"].includes(item.unitMode))fail("unknown unit policy");
    }else if(item.format==="short_text"){
      if(!Array.isArray(item.acceptedAnswers)||!item.acceptedAnswers.length||item.acceptedAnswers.some(x=>!clean(x)))fail("missing accepted text");
    }else if(item.format==="human_rubric"){
      if(!isObj(item.rubricAnchors)||!validMarks(slot.scoringGuideId,Object.fromEntries(Object.keys(item.rubricAnchors).map(x=>[x,0]))))fail("invalid anchored rubric");
      if(Object.values(item.rubricAnchors).some(x=>!Array.isArray(x)||x.length!==3||x.some(y=>!clean(y))))fail("rubric requires anchors for every score");
    }
  }
  return true;
}
export function childFacingItem(form,bank,itemId){
  validateSecureFormBank(form,bank);
  const slot=form.slots.find(x=>x.id===itemId),item=bank.items.find(x=>x.slotId===itemId);
  if(!slot||!item)fail("unknown item");
  const out={itemId,format:slot.format,prompt:item.prompt,displayAssetIds:item.displayAssetIds||[]};
  if(["closed_choice","audio_choice"].includes(slot.format))out.options=item.options.map(x=>({id:x.id,label:x.label}));
  if(slot.format==="audio_choice")out.audioAssetId=item.audioAssetId;
  return out;
}
const abs=x=>x<0n?-x:x;
export function parseRational(s){
  if(typeof s!=="string"||s.length>80)return null;s=clean(s).replace(/,/g,"");let n,d;
  const mix=/^(-?\d+)\s+(\d+)\/(\d+)$/.exec(s),frac=/^(-?\d+)\/(\d+)$/.exec(s),dec=/^(-?\d+)(?:\.(\d+))?$/.exec(s),leading=/^(-?)\.(\d+)$/.exec(s);
  try{
    if(mix){const w=BigInt(mix[1]),p=BigInt(mix[2]);d=BigInt(mix[3]);if(d===0n||p>=d)return null;n=(mix[1].startsWith("-")?-1n:1n)*(abs(w)*d+p);}
    else if(frac){n=BigInt(frac[1]);d=BigInt(frac[2]);if(d===0n)return null;}
    else if(dec){const w=BigInt(dec[1]),p=dec[2]||"";d=10n**BigInt(p.length);n=w*d+(dec[1].startsWith("-")?-1n:1n)*BigInt(p||"0");}
    else if(leading){const p=leading[2];d=10n**BigInt(p.length);n=(leading[1]==="-"?-1n:1n)*BigInt(p);}
    else return null;
    return {n,d};
  }catch{return null;}
}
function numericValue(item,value){
  if(typeof value!=="string"||value.length>120)return null;
  let s=clean(value),unit=null;
  for(const u of (item.acceptedUnits||[]).slice().sort((a,b)=>b.length-a.length)){
    if(s.toLowerCase().endsWith(" "+u.toLowerCase())){unit=u;s=s.slice(0,s.length-u.length).trim();break;}
  }
  if(item.unitMode==="required"&&!unit)return null;
  if((item.unitMode||"none")==="none"&&unit)return null;
  if(!unit && /[a-z°]/i.test(s))return null;
  return parseRational(s);
}
export function adjudicateRubric(slot,ratings,adjudication){
  if(slot.format!=="human_rubric")fail("not a rubric item");
  if(!Array.isArray(ratings)||ratings.length<2)return {status:"pending_second_rater",points:null};
  if(ratings.length!==2||ratings[0].raterId===ratings[1].raterId||!ratings.every(x=>clean(x.raterId)&&validMarks(slot.scoringGuideId,x.marks)))fail("unblinded, duplicate or incomplete rating");
  const dims=RUBRIC_DIMENSIONS[slot.scoringGuideId],same=dims.every(x=>ratings[0].marks[x]===ratings[1].marks[x]);
  if(!same){
    if(!adjudication)return {status:"adjudication_required",points:null};
    if(!clean(adjudication.reason)||!clean(adjudication.raterId)||[ratings[0].raterId,ratings[1].raterId].includes(adjudication.raterId)||!validMarks(slot.scoringGuideId,adjudication.marks))fail("adjudication requires distinct rater and rationale");
    return {status:"scored",points:Object.values(adjudication.marks).reduce((a,b)=>a+b,0),adjudicated:true};
  }
  return {status:"scored",points:Object.values(ratings[0].marks).reduce((a,b)=>a+b,0),adjudicated:false};
}
export function scoreSecureItem(slot,item,resp){
  if(!isObj(slot)||!isObj(item)||item.slotId!==slot.id||!isObj(resp)||resp.itemId!==slot.id||!STATES.has(resp.status)||!HELP.has(resp.assistance))fail("invalid score envelope");
  const base={itemId:slot.id,maxPoints:slot.points,claim:slot.claim,strand:slot.strand,points:null};
  if(resp.status!=="answered")return {...base,status:resp.status==="skipped"?"missing":resp.status};
  if(resp.answer===null||resp.answer===undefined||(typeof resp.answer==="string"&&!clean(resp.answer)))return {...base,status:"missing"};
  if(!["none","neutral_instructions"].includes(resp.assistance))return {...base,status:"assisted"};
  if(resp.exposedCorrectAnswer===true||resp.usedCoach===true||(slot.format==="audio_choice"&&resp.stimulusTextShown===true))return {...base,status:"contaminated"};
  if(["closed_choice","audio_choice"].includes(slot.format)){
    if(typeof resp.answer!=="string"||!item.options.some(x=>x.id===resp.answer))return {...base,status:"invalid_response"};
    return {...base,status:"scored",points:resp.answer===item.correctOptionId?1:0};
  }
  if(slot.format==="numeric"){
    const v=numericValue(item,resp.answer),key=numericValue(item,item.correctValue);
    if(!key)fail("invalid private numeric key");
    if(!v)return {...base,status:"invalid_response"};
    return {...base,status:"scored",points:v.n*key.d===key.n*v.d?1:0};
  }
  if(slot.format==="short_text"){
    if(typeof resp.answer!=="string"||resp.answer.length>1000)return {...base,status:"invalid_response"};
    return {...base,status:"scored",points:item.acceptedAnswers.map(norm).includes(norm(resp.answer))?1:0};
  }
  if(slot.format==="human_rubric"){
    const r=adjudicateRubric(slot,resp.ratings||[],resp.adjudication);
    if(r.points!==null&&r.points>slot.points)fail("rubric exceeds maximum");
    return {...base,...r};
  }
  fail("unknown format");
}
export function scoreSecureForm(form,bank,responses){
  validateSecureFormBank(form,bank);
  if(!Array.isArray(responses)||responses.length!==form.slots.length)return {status:"incomplete",points:null,notNormed:true,growthClaimAllowed:false};
  const seen=new Map();
  for(const r of responses){if(seen.has(r.itemId))fail("duplicate response");seen.set(r.itemId,r);}
  const results=form.slots.map(slot=>seen.has(slot.id)?scoreSecureItem(slot,bank.items.find(x=>x.slotId===slot.id),seen.get(slot.id)):{itemId:slot.id,status:"missing",points:null,maxPoints:slot.points});
  const excluded=results.filter(x=>x.status!=="scored");
  if(excluded.length)return {status:"incomplete_or_unscorable",points:null,notNormed:true,growthClaimAllowed:false,excluded:excluded.map(x=>({itemId:x.itemId,reason:x.status}))};
  const points=results.reduce((n,x)=>n+x.points,0),possible=results.reduce((n,x)=>n+x.maxPoints,0);
  if(possible!==form.possiblePoints||points>possible||points<0)fail("score bounds");
  return {status:"raw_score_only",formId:form.id,subject:form.subject,grade:form.grade,points,possible,rawFraction:points/possible,notNormed:true,growthClaimAllowed:false,schoolProficiencyClaimAllowed:false,results};
}
