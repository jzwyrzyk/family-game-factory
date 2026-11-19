import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const crosswalk = JSON.parse(read("docs/learning-evidence/michigan-grades-1-4-standard-crosswalk.json"));
const rows = crosswalk.standards;
const mathSource = read("src/learning/curriculum.ts");
const elaSource = read("src/language/curriculum.ts");
const MATH_PATTERN = /^[1-4]\.(?:OA|NBT|NF|MD|G)\.[A-D]\.\d+(?:\.[a-z])?$/;
const ELA_PATTERN = /^(?:RL|RI|RF|W|SL|L)\.[1-4]\.\d+(?:\.[a-z])?$/;
const norm=(s,subject)=>{
  const x=s.replace(/^CCSS\.ELA-LITERACY\./i,"").replace(/^CCSS\.MATH\.CONTENT\./i,"").split(".");
  if(subject==="ela")return x.map((a,i)=>i===0?a.toUpperCase():i===3?a.toLowerCase():a).join(".");
  return x.map((a,i)=>i===1||i===2?a.toUpperCase():i===4?a.toLowerCase():a).join(".");
};
const mathSkills=[...mathSource.matchAll(/skill\('([^']+)','([^']+)',(\d+),'([^']+)',\[([^\]]*)\]/g)].map(x=>({id:x[1],grade:Number(x[3]),tags:[...x[5].matchAll(/'([^']+)'/g)].map(y=>norm(y[1],"math"))}));
const elaSkills=[...elaSource.matchAll(/"id":\s*"([^"]+)"[\s\S]*?"title":\s*"([^"]+)"[\s\S]*?"grade":\s*(\d+)[\s\S]*?"domain":\s*"([^"]+)"[\s\S]*?"standards":\s*\[([^\]]*)\]/g)].map(x=>({id:x[1],grade:Number(x[3]),tags:[...x[5].matchAll(/"([^"]+)"/g)].map(y=>norm(y[1],"ela"))}));
const index = new Map(rows.map(x=>[x.subject+":"+x.code,x]));

test("source catalog has 121 distinct practice skill identifiers and mapped tag counts",()=>{
  assert.equal(mathSkills.length,73);
  assert.equal(elaSkills.length,48);
  const ids=mathSkills.concat(elaSkills).map(x=>x.id);
  assert.equal(new Set(ids).size,121);
  for(const [skills,subject] of [[mathSkills,"math"],[elaSkills,"ela"]]){
    for(const sk of skills){
      assert.ok([1,2,3,4].includes(sk.grade));
      for(const tag of sk.tags){
        const row=index.get(subject+":"+tag);
        assert.ok(row, `Orphaned practice tag ${sk.id} ${tag}`);
        assert.equal(row.grade,sk.grade);
        assert.ok(row.exactTaggedPracticeSkillIds.includes(sk.id),`Missing crosswalk for ${sk.id}`);
      }
    }
  }
});

test("complete Michigan catalog snapshot (math independently corroborated)",()=>{
  assert.equal(rows.length,455);
  assert.equal(rows.filter(x=>x.subject==="math").length,126);
  assert.equal(rows.filter(x=>x.subject==="ela").length,329);
  assert.equal(rows.filter(x=>x.level==="standard").length,266);
  assert.equal(rows.filter(x=>x.level==="component").length,189);
  assert.deepEqual([1,2,3,4].map(g=>rows.filter(x=>x.subject==="math"&&x.grade===g).length),[24,28,37,37]);
  assert.deepEqual([1,2,3,4].map(g=>rows.filter(x=>x.subject==="ela"&&x.grade===g).length),[81,71,90,87]);
  assert.equal(new Set(rows.map(x=>x.subject+":"+x.code)).size,rows.length);
});

test("component IDs always have a present parent and child tags do not inherit parent coverage",()=>{
  for(const x of rows){
    assert.match(x.code,x.subject==="math"?MATH_PATTERN:ELA_PATTERN);
    assert.equal(x.grade,Number(x.subject==="math"?x.code.split(".")[0]:x.code.split(".")[1]));
    assert.equal(x.level==="component",Boolean(x.parentCode));
    assert.ok(x.standardReferenceUrl.startsWith("https://www.thecorestandards.org/"));
    assert.equal(x.practiceCoverageConclusion,"unverified_requires_content_and_item_review");
    assert.equal(x.assessmentCoverageConclusion,"no_independent_test_mapping");
    if(x.level!=="component")continue;
    const p=index.get(x.subject+":"+x.parentCode);
    assert.ok(p,`Missing official parent ${x.parentCode}`);
    assert.equal(p.level,"standard");
    for(const id of x.parentOnlyTaggedPracticeSkillIds)assert.ok(p.exactTaggedPracticeSkillIds.includes(id));
    assert.ok(x.exactTaggedPracticeSkillIds.every(id=>!x.parentOnlyTaggedPracticeSkillIds.includes(id)));
  }
});

test("every crosswalk declared practice link references an existing skill in its subject/grade",()=>{
  const lookup=new Map([...mathSkills.map(x=>["math:"+x.id,x]),...elaSkills.map(x=>["ela:"+x.id,x])]);
  for(const row of rows)for(const id of [...row.exactTaggedPracticeSkillIds,...row.parentOnlyTaggedPracticeSkillIds,...row.childExplicitTaggedPracticeSkillIds]){
    const skill=lookup.get(row.subject+":"+id);
    assert.ok(skill,`Unknown practice skill ${row.code}: ${id}`);
    assert.equal(skill.grade,row.grade);
  }
});

test("nonapplicable placeholders are excluded and attribution remains recorded",()=>{
  for(const code of crosswalk.manifest.notApplicableExamples)
    assert.ok(!rows.some(x=>x.code===code),`Nonapplicable code should not appear: ${code}`);
  assert.match(crosswalk.manifest.sourceDataLicense,/CC-BY-4\.0/);
  assert.match(crosswalk.manifest.secondaryMathCorroboration.match,/126\/126/);
  for(const source of crosswalk.manifest.sourceDataFiles)assert.match(source.sha,/^[a-f0-9]{40}$/);
  for(const x of rows){
    assert.ok(!Object.hasOwn(x,"officialText"),"copyright-bearing official text must not be exported");
    assert.ok(!Object.hasOwn(x,"proficiencyCertified"),"no hidden claims of certification");
  }
});

test("educator review queue has one line for every primary standard",()=>{
  const csv=read("docs/learning-evidence/primary-standard-review-queue.csv").trim().split("\n");
  assert.equal(csv.length,267);
  assert.ok(csv[0].includes("reviewer_name"));
  assert.ok(csv[0].includes("independent_assessment_status"));
});
