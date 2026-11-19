import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");

test("all 73 math curriculum units have deterministic generator switch cases",()=>{
 const curriculum=read("src/learning/curriculum.ts"),content=read("src/learning/content.ts");
 const ids=[...curriculum.matchAll(/skill\('([^']+)'/g)].map(x=>x[1]);
 const cases=[...content.matchAll(/\bcase\s+'([^']+)'/g)].map(x=>x[1]);
 assert.equal(ids.length,73);
 assert.equal(new Set(ids).size,73);
 assert.equal(new Set(cases).size,73);
 assert.deepEqual([...new Set(ids)].sort(),[...new Set(cases)].sort());
});

test("ELA authored v1 footprint remains explicitly reviewable, not a standardized test",()=>{
 let total=0,types={},passages=[],skills=0;
 for(let g=1;g<=4;g++){
  const ts=read(`src/language/data-g${g}.ts`);
  const bank=JSON.parse(ts.slice(ts.indexOf("{",ts.indexOf("LANGUAGE_G")),ts.lastIndexOf("};")+1));
  const values=Object.values(bank);
  assert.equal(values.length,12);
  skills+=values.length;
  const items=values.flatMap(x=>x.items);
  assert.equal(items.length,48);
  total+=items.length;
  for(const item of items){
    types[item.kind]=(types[item.kind]||0)+1;
    if(item.passage)passages.push(item.passage.trim().split(/\s+/).length);
  }
 }
 assert.equal(skills,48);
 assert.equal(total,192);
 assert.deepEqual(types,{"choice":178,"word-tiles":6,"edit":2,"sentence-tiles":2,"creative":4});
 assert.equal(passages.length,44);
 assert.equal(Math.min(...passages),9);
 assert.equal(Math.max(...passages),27);
});

test("content footprint includes all 121 curriculum skills and a nonvalidated assessment status",()=>{
 const csv=read("docs/learning-evidence/practice-content-footprint.csv").trim().split("\n");
 assert.equal(csv.length,122);
 assert.ok(csv[0].includes("independent_assessment_verified"));
 for(const line of csv.slice(1))assert.ok(line.includes('"no"'));
});
