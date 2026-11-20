import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {produceGameArt,type ImageApproval} from '../server/agent/illustrations';

const approval:ImageApproval={enabled:true,approvalId:'synthetic-image-test',model:'approved-image-fixture',maxImages:2,maxMicroUsdPerImage:40000,priceReviewedOn:new Date().toISOString().slice(0,10)};
const plan={presentationStyle:'illustrated' as const,artRequests:[{id:'helper',role:'actor' as const,prompt:'A friendly mint robot helper, standalone transparent character.',sampling:'smooth' as const}]};
const bytes=readFileSync(new URL('../public/gem-factory-helper.webp',import.meta.url));
test('image production requires scoped approval and full remaining allowance before key or paid request',async()=>{
 let keys=0,posts=0;const key=()=>{keys++;return 'synthetic-key-not-live';},transport=(async()=>{posts++;throw Error('unexpected');}) as typeof fetch;
 await assert.rejects(produceGameArt({plan,budgetMicroUsd:999999,signal:new AbortController().signal,key,transport}),/IMAGE_APPROVAL/);
 await assert.rejects(produceGameArt({plan,approval,budgetMicroUsd:39999,signal:new AbortController().signal,key,transport}),/SPENDING/);
 assert.equal(keys,0);assert.equal(posts,0);
});
test('approved image bytes are attached separately, accounted conservatively, and reused exactly',async()=>{
 let posts=0;const transport=(async(url:any,options:any)=>{
  posts++;assert.equal(url,'https://api.openai.com/v1/images/generations');assert.equal(options.redirect,'error');
  const body=JSON.parse(options.body);assert.equal(body.background,'transparent');assert.equal(body.output_format,'webp');assert.equal(body.n,1);
  assert.match(body.prompt,/illustrated/i);assert.match(body.prompt,/No text/);
  return new Response(JSON.stringify({data:[{b64_json:bytes.toString('base64')}]}));
 }) as typeof fetch;
 const input={plan,approval,budgetMicroUsd:80000,signal:new AbortController().signal,key:()=> 'synthetic-key-not-live',transport};
 const first=await produceGameArt(input);assert.equal(first.usageUnits,40000);assert.equal(first.assets.assets[0].data,bytes.toString('base64'));
 assert.equal(first.assets.assets[0].provenance.kind,'generated');
 const reused=await produceGameArt({...input,baseAssets:first.assets,budgetMicroUsd:0});assert.deepEqual(reused.assets,first.assets);assert.equal(reused.usageUnits,0);assert.equal(posts,1);
 const procedural=await produceGameArt({...input,plan:{presentationStyle:'pixel',artRequests:[]},approval:undefined,budgetMicroUsd:0});
 assert.equal(procedural.assets.style,'pixel');assert.deepEqual(procedural.assets.assets,[]);assert.equal(posts,1);
});
test('provider URLs, unknown paid outcomes and corrupt data never become executable assets or automatic retries',async()=>{
 for(const response of [()=>new Response(JSON.stringify({data:[{url:'https://example.invalid/private.png'}]})),()=>new Response(JSON.stringify({data:[{b64_json:Buffer.from('<svg onload="bad"/>').toString('base64')}]})),()=>{throw Error('uncertain-network-outcome');}]){
  let posts=0;
  await assert.rejects(produceGameArt({plan,approval,budgetMicroUsd:80000,signal:new AbortController().signal,key:()=> 'synthetic-key-not-live',transport:(async()=>{posts++;return response();}) as typeof fetch}));
  assert.equal(posts,1);
 }
});
