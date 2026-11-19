import test from "node:test";
import assert from "node:assert/strict";
import {validateItem,scoreItem,summarizeForm} from "../tools/learning-evidence/scoring.mjs";

const objective={id:"demo-math-1",formId:"demo-A",domain:"math",grade:3,strand:"fractions",kind:"objective",maxPoints:1,acceptedAnswers:["0.5","1/2"]};
const response=(changes={})=>({itemId:objective.id,status:"answered",firstResponse:"1/2",assistance:"none",...changes});

test("objective score accepts explicitly declared equivalent response",()=>{
  assert.equal(validateItem(objective),true);
  assert.equal(scoreItem(objective,response({firstResponse:" 0.5 " })).points,1);
  assert.equal(scoreItem(objective,response({firstResponse:"2/4"})).points,0); // equivalence is NOT inferred
});

test("wrong response is zero; skipped or empty response is missing, not zero",()=>{
  assert.deepEqual([scoreItem(objective,response({firstResponse:"0.25"})).points,scoreItem(objective,response({status:"skipped"})).points,scoreItem(objective,response({firstResponse:" "})).points],[0,null,null]);
});

test("assisted or technical invalid cannot establish independent score",()=>{
  assert.equal(scoreItem(objective,response({assistance:"ai_help"})).validity,"assisted");
  assert.equal(scoreItem(objective,response({assistance:"adult_help"})).points,null);
  assert.equal(scoreItem(objective,response({status:"technical_invalid"})).validity,"technical_invalid");
  assert.equal(scoreItem(objective,response({assistance:"neutral_instructions"})).points,1);
});

test("rubric scores must be complete and bound to max",()=>{
  const rubric={id:"demo-aps-1",formId:"demo-A",domain:"active_problem_solving",grade:3,strand:"design",kind:"rubric",maxPoints:6,criteria:[{id:"define",maxPoints:3},{id:"evidence",maxPoints:3}]};
  const base={itemId:rubric.id,status:"answered",firstResponse:"Compare two trials",assistance:"none"};
  assert.equal(scoreItem(rubric,{...base,rubricMarks:{define:2,evidence:3}}).points,5);
  assert.equal(scoreItem(rubric,base).validity,"scoring_pending");
  assert.equal(scoreItem(rubric,{...base,firstResponse:{selectedDesign:"bridgeB",tests:[1,2]},rubricMarks:{define:2,evidence:3}}).points,5); // touch-first APS response
  assert.throws(()=>scoreItem(rubric,{...base,rubricMarks:{define:4,evidence:2}}),/out of range/);
  assert.throws(()=>scoreItem(rubric,{...base,rubricMarks:{define:2}}),/incomplete/);
});

test("form summary is one grade/form/domain, uncalibrated, never a growth claim",()=>{
  const one=scoreItem(objective,response());
  const two={...one,itemId:"demo-math-2",points:0};
  const s=summarizeForm([one,two],[one.itemId,two.itemId]);
  assert.equal(s.status,"complete");
  assert.equal(s.points,1);
  assert.equal(s.possible,2);
  assert.equal(s.rawFraction,0.5);
  assert.equal(s.scale,"uncalibrated_raw");
  assert.equal(s.growthClaimAllowed,false);
  assert.throws(()=>summarizeForm([one,{...two,grade:4}],[one.itemId,two.itemId]),/mixed/);
});

test("partial and contaminated forms return no numeric total",()=>{
  const one=scoreItem(objective,response());
  assert.equal(summarizeForm([one],["demo-math-1","demo-math-2"]).points,null);
  const assisted=scoreItem(objective,response({assistance:"ai_help"}));
  assert.equal(summarizeForm([assisted],["demo-math-1"]).points,null);
  assert.throws(()=>summarizeForm([one,one],["demo-math-1"]),/duplicate/);
});

test("invalid grading schema is rejected before attempting to score",()=>{
  assert.throws(()=>validateItem({...objective,grade:7}),/grade/);
  assert.throws(()=>validateItem({...objective,acceptedAnswers:["2"," 2 "]}),/duplicate/);
  assert.throws(()=>validateItem({...objective,maxPoints:2}),/invalid objective/);
});
