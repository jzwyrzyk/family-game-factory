import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {RUBRIC_DIMENSIONS,validateSecureFormBank,childFacingItem,scoreSecureForm} from "../tools/learning-evidence/instrument-v2.mjs";
const catalog=JSON.parse(readFileSync(new URL("../docs/learning-evidence/objective-2/form-blueprints.v2.json",import.meta.url),"utf8"));
/**
 * Every mock prompt is deliberate NONCONTENT. It must never be interpreted as a
 * test, never pushed to the browser, and never counted as student achievement.
 */
function fixture(form){
  const bank={schema:"jems.secure.bank.v2",formId:form.id,version:"synthetic-fixture-non-assessment",items:[]},responses=[],trustedRatings={};
  for(const slot of form.slots){
    const common={slotId:slot.id,format:slot.format,version:"test-only-v1",prompt:"SYNTHETIC ENGINE CHECK -- NOT AN EDUCATIONAL QUESTION: "+slot.id};
    const response={itemId:slot.id,status:"answered",assistance:"none"};
    if(slot.format==="numeric"){common.correctValue="1/2";response.answer="2/4";}
    else if(slot.format==="short_text"){common.acceptedAnswers=["test answer"];response.answer="Test Answer";}
    else if(slot.format==="human_rubric"){
      common.rubricAnchors=Object.fromEntries(RUBRIC_DIMENSIONS[slot.scoringGuideId].map(dim=>[dim,["No evidence","Partial evidence","Full evidence"]]));
      response.answer="Synthetic narrative for scorer testing only";
      const marks=Object.fromEntries(RUBRIC_DIMENSIONS[slot.scoringGuideId].map(dim=>[dim,2]));
      trustedRatings[slot.id]={trustedServerSource:true,ratings:[{raterId:"blind-r1",marks},{raterId:"blind-r2",marks}]};
    }else{
      common.options=[{id:"a",label:"Option one"},{id:"b",label:"Option two"}];common.correctOptionId="a";
      if(slot.format==="audio_choice"){common.audioAssetId="synthetic-audio-only:"+slot.id;common.transcriptVisible=false;}
      response.answer="a";
    }
    bank.items.push(common);responses.push(response);
  }
  return {bank,responses,trustedRatings};
}
test("all 24 full-form draft blueprints have fillable, independently gradable slots",()=>{
  let total=0;
  for(const form of catalog.forms){
    const {bank,responses,trustedRatings}=fixture(form);
    assert.equal(validateSecureFormBank(form,bank),true);
    for(const s of form.slots){
      const delivered=childFacingItem(form,bank,s.id);
      assert.ok(!Object.hasOwn(delivered,"correctValue"));
      assert.ok(!Object.hasOwn(delivered,"acceptedAnswers"));
      assert.ok(!Object.hasOwn(delivered,"correctOptionId"));
      assert.ok(!Object.hasOwn(delivered,"rubricAnchors"));
      assert.ok(!Object.hasOwn(delivered,"transcript"));
    }
    const result=scoreSecureForm(form,bank,responses,trustedRatings);
    assert.equal(result.status,"raw_score_only");
    assert.equal(result.possible,form.possiblePoints);
    assert.equal(result.points,form.possiblePoints);
    if(form.slots.some(x=>x.format==="human_rubric"))assert.equal(scoreSecureForm(form,bank,responses).points,null);
    assert.equal(result.schoolProficiencyClaimAllowed,false);
    total+=form.slots.length;
  }
  assert.equal(total,915);
});
test("multiple 915-slot negative form changes cannot silently produce successful evidence",()=>{
  for(const form of catalog.forms){
    const {bank,responses}=fixture(form);
    const assisted=responses.map((r,i)=>i===0?{...r,assistance:"ai_help"}:r);
    assert.equal(scoreSecureForm(form,bank,assisted,trustedRatings).points,null);
    assert.equal(scoreSecureForm(form,bank,responses.slice(1)).status,"incomplete");
    const skipped=responses.map((r,i)=>i===0?{...r,status:"skipped"}:r);
    assert.equal(scoreSecureForm(form,bank,skipped,trustedRatings).points,null);
  }
});
test("audio-only source protects listening test from accidental transcript delivery",()=>{
  for(const form of catalog.forms.filter(x=>x.subject==="ela"&&x.grade>=3)){
    const {bank,responses}=fixture(form);
    const audio=form.slots.find(x=>x.format==="audio_choice");
    assert.ok(audio);
    const i=form.slots.findIndex(x=>x.id===audio.id);
    const bad=responses.map((r,j)=>i===j?{...r,stimulusTextShown:true}:r);
    assert.equal(scoreSecureForm(form,bank,bad,trustedRatings).points,null);
    const leaked=structuredClone(bank);leaked.items[i].transcriptVisible=true;
    assert.throws(()=>validateSecureFormBank(form,leaked),/transcript/);
  }
});
