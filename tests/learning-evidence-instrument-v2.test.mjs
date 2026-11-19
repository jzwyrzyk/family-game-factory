import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 validateBlueprintCatalog,validateSecureFormBank,childFacingItem,parseRational,
 scoreSecureItem,adjudicateRubric,scoreSecureForm
} from "../tools/learning-evidence/instrument-v2.mjs";

const read=p=>JSON.parse(readFileSync(new URL("../"+p,import.meta.url),"utf8"));
const blueprint=read("docs/learning-evidence/objective-2/form-blueprints.v2.json");
const standards=read("docs/learning-evidence/michigan-grades-1-4-standard-crosswalk.json").standards;
const numericSlot={id:"NUM",subject:"math",grade:3,strand:"NF",claim:"concepts",format:"numeric",points:1};
const choiceSlot={id:"CHOICE",subject:"math",grade:3,strand:"OA",claim:"concepts",format:"closed_choice",points:1};
const humanSlot={id:"HUMAN",subject:"math",grade:3,strand:"OA",claim:"reasoning",format:"human_rubric",scoringGuideId:"MATH-REASONING-0-2",points:2};
const form={id:"DEV-DEMO",subject:"math",grade:3,slots:[numericSlot,choiceSlot,humanSlot],possiblePoints:4};
const bank={schema:"jems.secure.bank.v2",formId:form.id,version:"demo-2026-v1",items:[
  {slotId:"NUM",version:"1",format:"numeric",prompt:"What is three fourths as a decimal?",correctValue:"3/4"},
  {slotId:"CHOICE",version:"1",format:"closed_choice",prompt:"Which equation is true?",options:[{id:"a",label:"4×3=12"},{id:"b",label:"4×3=11"}],correctOptionId:"a"},
  {slotId:"HUMAN",version:"1",format:"human_rubric",prompt:"Explain how you know.",rubricAnchors:{strategy:["No strategy","Partly valid strategy","Correct strategy and result"]}}
]};
const resp=(itemId,answer,extra={})=>({itemId,status:"answered",answer,assistance:"none",...extra});
const score=(slot,item,r)=>scoreSecureItem(slot,item,r);
test("24 independent instruments, 915 required slots and external standard IDs",()=>{
 assert.deepEqual(validateBlueprintCatalog(blueprint,standards),{status:"valid_blueprint_not_validated_test",forms:24,slots:915});
 const all=new Set(blueprint.forms.flatMap(x=>x.slots.map(y=>y.id)));assert.equal(all.size,915);
 const data=JSON.parse(JSON.stringify(blueprint));
 data.forms[0].slots[0].standardIds=["1.OA.A.999"];
 assert.throws(()=>validateBlueprintCatalog(data,standards),/unknown standards/);
 data.forms[0].slots[0].standardIds=blueprint.forms[0].slots[0].standardIds;
 data.forms[0].slots[0].correctValue="99";
 assert.throws(()=>validateBlueprintCatalog(data,standards),/secret content/);
});

test("secure bank validation and key redaction are required for delivery",()=>{
 assert.equal(validateSecureFormBank(form,bank),true);
 const delivered=childFacingItem(form,bank,"CHOICE");
 assert.deepEqual(delivered.options,[{id:"a",label:"4×3=12"},{id:"b",label:"4×3=11"}]);
 assert.ok(!JSON.stringify(delivered).includes("correctOptionId"));
 const bad=structuredClone(bank);bad.items[1].correctOptionId="missing";
 assert.throws(()=>validateSecureFormBank(form,bad),/correct option/);
 assert.throws(()=>validateSecureFormBank(form,{...bank,items:[bank.items[0]]}),/does not fill/);
});

test("exact rational numeric scoring accepts equivalent fractions and decimals",()=>{
 for(const [value,expected] of [["0.75",1],["6/8",1],[".75",1],["3/4",1],["1 1/2",0],["0.5",0]]){
  const r=score(numericSlot,bank.items[0],resp("NUM",value));
  assert.equal(r.points,expected===null?null:expected,value);
 }
 assert.equal(parseRational("1 1/2").n.toString(),"3");
 assert.equal(parseRational("-0.5").n.toString(),"-5");
 assert.equal(parseRational("-.5").n.toString(),"-5");
 assert.equal(parseRational("3/0"),null);
 assert.equal(parseRational("1e8"),null);
});

test("read aloud is not an unassisted reading result; AI help not scored zero",()=>{
 const audioSlot={id:"AUDIO",format:"audio_choice",scoringGuideId:"OBJECTIVE-EXACT-v2",points:1};
 const item={slotId:"AUDIO",format:"audio_choice",version:"1",prompt:"Listen and choose.",audioAssetId:"protected:asset1",transcriptVisible:false,options:[{id:"a",label:"a"},{id:"b",label:"b"}],correctOptionId:"b"};
 assert.equal(score(audioSlot,item,resp("AUDIO","b",{stimulusTextShown:true})).status,"contaminated");
 assert.equal(score(audioSlot,item,resp("AUDIO","b",{assistance:"adult_help"})).status,"assisted");
 assert.equal(score(audioSlot,item,resp("AUDIO","b",{assistance:"neutral_instructions"})).points,1);
});

test("blank, aborted and invalid answers do not silently become incorrect",()=>{
 assert.equal(score(numericSlot,bank.items[0],resp("NUM","")).status,"missing");
 assert.equal(score(numericSlot,bank.items[0],resp("NUM","0/0")).status,"invalid_response");
 assert.equal(score(choiceSlot,bank.items[1],resp("CHOICE","not-in-options")).status,"invalid_response");
 assert.equal(score(choiceSlot,bank.items[1],{itemId:"CHOICE",status:"aborted",assistance:"none"}).status,"aborted");
 assert.equal(score(numericSlot,bank.items[0],resp("NUM","0.75",{usedCoach:true})).status,"contaminated");
});

test("human response scoring needs two blind raters; no auto-score for essay",()=>{
 const r1={raterId:"one",marks:{strategy:2}},r2={raterId:"two",marks:{strategy:2}};
 assert.equal(adjudicateRubric(humanSlot,[r1]).status,"pending_second_rater");
 assert.deepEqual(adjudicateRubric(humanSlot,[r1,r2]),{status:"scored",points:2,adjudicated:false});
 const disagreement=[r1,{raterId:"two",marks:{strategy:1}}];
 assert.equal(adjudicateRubric(humanSlot,disagreement).status,"adjudication_required");
 assert.deepEqual(adjudicateRubric(humanSlot,disagreement,{raterId:"third",marks:{strategy:1},reason:"anchor reviewed"}),{status:"scored",points:1,adjudicated:true});
 assert.throws(()=>adjudicateRubric(humanSlot,[r1,{...r1}]),/duplicate/);
});

test("full-form scoring never declares proficiency or growth and refuses contaminated samples",()=>{
 const ratings=[{raterId:"one",marks:{strategy:2}},{raterId:"two",marks:{strategy:2}}];
 const rs=[resp("NUM","0.75"),resp("CHOICE","b"),resp("HUMAN","A drawing")];
 const trustedRatings={HUMAN:{trustedServerSource:true,ratings}};
 assert.equal(scoreSecureForm(form,bank,rs).points,null); // child cannot submit its own rating
 assert.equal(scoreSecureForm(form,bank,[...rs.slice(0,2),resp("HUMAN","A drawing",{ratings})]).points,null); // forged child ratings ignored
 const good=scoreSecureForm(form,bank,rs,trustedRatings);
 assert.equal(good.status,"raw_score_only");
 assert.equal(good.points,3);
 assert.equal(good.possible,4);
 assert.equal(good.growthClaimAllowed,false);
 assert.equal(good.schoolProficiencyClaimAllowed,false);
 assert.equal(good.notNormed,true);
 assert.equal(scoreSecureForm(form,bank,rs.slice(0,2)).points,null);
 assert.equal(scoreSecureForm(form,bank,[...rs.slice(0,2),resp("HUMAN","A drawing",{assistance:"ai_help",ratings})],trustedRatings).points,null);
});

test("rubric formats separate Math reasoning, ELA writing, and ELA research",()=>{
 const ela={id:"ELA",format:"human_rubric",points:8,scoringGuideId:"ELA-WRITING-4x0-2"};
 const marks={idea:2,organization:1,development:2,language_conventions:1};
 assert.equal(adjudicateRubric(ela,[{raterId:"a",marks},{raterId:"b",marks}]).points,6);
 const research={id:"RES",format:"human_rubric",points:8,scoringGuideId:"ELA-RESEARCH-4x0-2"};
 assert.equal(adjudicateRubric(research,[{raterId:"a",marks:{question_source:2,evidence_selection:2,integration:1,communication:1}},{raterId:"b",marks:{question_source:2,evidence_selection:2,integration:1,communication:1}}]).points,6);
});
