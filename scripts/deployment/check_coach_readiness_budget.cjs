#!/usr/bin/env node
/** Exercise the helper against the selected application's actual provider.
 * All transport is local synthetic code; reaching global fetch is a failure. */
'use strict';
const assert=require('node:assert/strict');
const {resolve}=require('node:path');
const {inspect,contexts}=require('./coach_release_budget.cjs');

async function main(){
 const root=resolve(process.argv[2]),source=process.argv[3];
 let networkCalls=0;
 globalThis.fetch=()=>{networkCalls++;throw Error('NETWORK_FORBIDDEN_IN_OFFLINE_CHECK');};
 const {OpenAICoachProvider,coachFailureEvent}=require(resolve(root,'server/coach/private-provider.ts'));
 const {coachConfig}=require(resolve(root,'server/coach/http.ts'));
 const values=Object.fromEntries(['FACTORY_COACH_APPROVED','FACTORY_COACH_PRIVACY_APPROVED',
  'FACTORY_COACH_SAFEGUARDS_APPROVED','FACTORY_COACH_PRIVATE_EXECUTION_APPROVED',
  'FACTORY_ADULT_PILOT_MODE','FACTORY_ADULT_PILOT_OWNER_APPROVED',
  'FACTORY_ADULT_PILOT_PROFILE_ACCESS_VERIFIED'].map(name=>[name,'true']));
 Object.assign(values,{FACTORY_COACH_MODEL:'gpt-5.4-mini-2026-03-17',FACTORY_COACH_INPUT_CHARS:'16000',
  FACTORY_COACH_OUTPUT_TOKENS:'800',FACTORY_COACH_MAX_MICRO_USD:'30000',
  FACTORY_COACH_INPUT_PRICE:'750000',FACTORY_COACH_OUTPUT_PRICE:'4500000',
  FACTORY_COACH_PRICES_REVIEWED:new Date().toISOString()});
 const revision={metadata:{name:'factory-coach-private-chatdiag-b4734b1323de-a14b8b'},spec:{containers:[{env:[
  ...Object.entries(values).map(([name,value])=>({name,value})),
  {name:'FACTORY_COACH_PRIVATE_OPENAI_API_KEY',valueFrom:{secretKeyRef:{name:'PRIVATE_KEY_REFERENCE_CANARY',key:'9'}}},
  {name:'UNRELATED_PRIVATE_SETTING',value:'PRIVATE_VALUE_CANARY'}
 ]}]}};
 const report=inspect(root,source,revision),safe=JSON.stringify(report),examples=contexts();
 assert.equal(report.arithmeticPass,true);
 assert.equal(report.wireBudgetVersion,1);
 assert.equal(report.contextByteAllowance,undefined);
 assert.equal(report.synthetic.length,examples.length);
 assert.equal(safe.includes('PRIVATE_'),false,'Only fixed codes and arithmetic may be returned');
 for(let index=0;index<examples.length;index++){
  const row=report.synthetic[index],context=examples[index];
  const oldStaticReserve=Math.ceil(((report.fixed.inputCeiling+row.contextBytes)*750000+800*4500000)/1e6);
  assert.ok(oldStaticReserve<row.reservationMicroUsd,'The synthetic case must expose the old underestimate');
  const limited=structuredClone(revision);
  limited.spec.containers[0].env.find(entry=>entry.name==='FACTORY_COACH_MAX_MICRO_USD').value=String(row.reservationMicroUsd-1);
  const limitedReport=inspect(root,source,limited);
  assert.equal(limitedReport.arithmeticPass,false);
  assert.equal(limitedReport.synthetic[index].budgetFits,false);
  assert.ok(limitedReport.stopReasons.includes('SYNTHETIC_CONTEXT_EXCEEDS_UNCHANGED_LIMIT'));

  async function probe(cap){
   const requests=[];
   const transport=async(url,options)=>{
    requests.push({url:String(url),body:JSON.parse(options.body)});
    if(String(url).endsWith('/moderations'))return new Response(JSON.stringify({results:[{flagged:false}]}));
    assert.ok(String(url).endsWith('/responses'));
    throw Error('SYNTHETIC_TRANSPORT_STOP');
   };
   const config={...coachConfig(values),maxTurnMicroUsd:cap,apiKey:'synthetic-not-an-api-key'};
   let failure;
   try{await new OpenAICoachProvider(config,transport).complete(context,new AbortController().signal);}
   catch(error){failure=error;}
   assert.ok(failure,'Synthetic inference must stop at the fake transport');
   return {requests,failure};
  }
  const blocked=await probe(row.reservationMicroUsd-1);
  assert.equal(blocked.requests.length,0,'The actual provider must stop before moderation or inference');
  assert.equal(blocked.failure.message,'SPENDING_CUTOFF');
  assert.equal(coachFailureEvent(blocked.failure,'budget',0).reason,'turn_budget');
  const admitted=await probe(row.reservationMicroUsd);
  assert.equal(admitted.requests.length,2);
  assert.equal(admitted.failure.message,'SYNTHETIC_TRANSPORT_STOP');
  const body=admitted.requests[1].body;
  assert.equal(Buffer.byteLength(body.input[1].content),row.modelInputBytes);
  assert.equal(Buffer.byteLength(JSON.stringify(body.text.format.schema)),row.schemaBytes);
  const actualInputCeiling=Buffer.byteLength(body.input[1].content+body.input[0].content+JSON.stringify(body.text.format.schema))+2048;
  assert.equal(actualInputCeiling,row.inputCeiling);
  assert.equal(Math.ceil((actualInputCeiling*750000+body.max_output_tokens*4500000)/1e6),row.reservationMicroUsd);
  assert.equal(body.store,false);
  assert.equal(body.max_output_tokens,800);
 }
 const literal=structuredClone(revision);
 literal.spec.containers[0].env.find(entry=>entry.name==='FACTORY_COACH_PRIVATE_OPENAI_API_KEY').value='PRIVATE_LITERAL_KEY_CANARY';
 const refused=inspect(root,source,literal);
 assert.equal(refused.arithmeticPass,false);
 assert.ok(refused.stopReasons.includes('COACH_KEY_REFERENCE_NOT_PINNED'));
 assert.equal(JSON.stringify(refused).includes('PRIVATE_LITERAL_KEY_CANARY'),false);
 const duplicate=structuredClone(revision);
 duplicate.spec.containers[0].env.push({name:'FACTORY_COACH_MAX_MICRO_USD',value:'30000'});
 assert.throws(()=>inspect(root,source,duplicate),/^Error: ALLOWLISTED_SETTING_NOT_LITERAL$/);
 assert.throws(()=>inspect(root,'f'.repeat(40),revision),/^Error: CHECKOUT_SOURCE_MISMATCH$/);
 assert.equal(networkCalls,0);
 console.log(JSON.stringify({status:'DYNAMIC_BUDGET_OFFLINE_CHECKS_PASSED',networkCalls,syntheticTurns:examples.length}));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
