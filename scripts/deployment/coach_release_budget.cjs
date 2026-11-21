#!/usr/bin/env node
/** Read-only release arithmetic. Run with `node --import tsx` from an exact
 * reviewed checkout. Stdin is one Cloud Run REVISION describe JSON; obtain the
 * revision name from observed serving traffic, not latestCreatedRevisionName.
 * No network call, credential access, configuration write, or inference occurs.
 * Only allowlisted non-secret settings and arithmetic reach stdout. */
'use strict';
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const {execFileSync}=require('node:child_process');

const SAFE_ENV=[
 'FACTORY_COACH_APPROVED','FACTORY_COACH_PRIVACY_APPROVED','FACTORY_COACH_SAFEGUARDS_APPROVED',
 'FACTORY_COACH_ZDR_VERIFIED','FACTORY_COACH_PRIVATE_EXECUTION_APPROVED','FACTORY_COACH_MODEL',
 'FACTORY_COACH_INPUT_CHARS','FACTORY_COACH_OUTPUT_TOKENS','FACTORY_COACH_MAX_MICRO_USD',
 'FACTORY_COACH_INPUT_PRICE','FACTORY_COACH_OUTPUT_PRICE','FACTORY_COACH_PRICES_REVIEWED',
 'FACTORY_ADULT_PILOT_MODE','FACTORY_ADULT_PILOT_OWNER_APPROVED','FACTORY_ADULT_PILOT_PROFILE_ACCESS_VERIFIED'
];
const SYNTHETIC_IDEA='I tilt a sleepy owl to keep it balanced on a branch while its lantern charges. If the owl falls, the round ends.';
const SYNTHETIC_CORRECTION='Make the owl a sleepy fox instead; keep the same balancing game and lantern.';
function contexts(){
 const base={mode:'discuss',game:'new',plan:{},rules:'New game: rules are being agreed; do not invent recorded outcomes.',
  friction:'',helpLevel:0,support:'balanced',observations:[],tests:[],creation:{version:1}};
 return [
  {...base,message:SYNTHETIC_IDEA,conversation:[{role:'child',text:SYNTHETIC_IDEA}]},
  {...base,message:SYNTHETIC_CORRECTION,conversation:[{role:'child',text:SYNTHETIC_IDEA},{role:'child',text:SYNTHETIC_CORRECTION}]}
 ];
}
function inspect(root,sourceSha,revision){
 if(!/^[a-f0-9]{40}$/.test(sourceSha))throw Error('EXACT_SOURCE_SHA_REQUIRED');
 const actual=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
 if(actual!==sourceSha)throw Error('CHECKOUT_SOURCE_MISMATCH');
 execFileSync('git',['diff','--quiet','HEAD','--','server/coach','server/adult-pilot.ts','src/studio/design.ts','src/studio/creation-readiness.ts'],{cwd:root,stdio:'ignore'});
 const name=revision?.metadata?.name;
 if(typeof name!=='string'||!name.startsWith('factory-coach-private-')||revision?.spec?.containers?.length!==1)throw Error('PRIVATE_COACH_REVISION_REQUIRED');
 const env=Object.create(null),entries=revision.spec.containers[0].env||[];
 for(const entry of entries){
  if(!SAFE_ENV.includes(entry.name))continue;
  if(Object.hasOwn(env,entry.name)||typeof entry.value!=='string'||entry.valueFrom)throw Error('ALLOWLISTED_SETTING_NOT_LITERAL');
  env[entry.name]=entry.value;
 }
 const {COACH_POLICY,COACH_SCHEMA}=require(resolve(root,'server/coach/policy.ts'));
 const {coachConfig}=require(resolve(root,'server/coach/http.ts'));
 const {approved,validateCoachContext}=require(resolve(root,'server/coach/service.ts'));
 const c=coachConfig(env),policyBytes=Buffer.byteLength(COACH_POLICY),schemaBytes=Buffer.byteLength(JSON.stringify(COACH_SCHEMA));
 const fixedInputCeiling=policyBytes+schemaBytes+2048;
 const reserve=bytes=>Math.ceil(((fixedInputCeiling+bytes)*c.inputMicroUsdPerMillion+c.maxOutputTokens*c.outputMicroUsdPerMillion)/1e6);
 const synthetic=contexts().map((context,index)=>{
  validateCoachContext(context);const text=JSON.stringify(context),bytes=Buffer.byteLength(text),required=reserve(bytes);
  return {turn:index+1,contextChars:text.length,contextBytes:bytes,reservationMicroUsd:required,
   inputFits:text.length<=c.maxInputChars,budgetFits:required<=c.maxTurnMicroUsd};
 });
 const minimum=reserve(0),configurationApproved=approved(c);
 const keys=entries.filter(entry=>entry.name==='FACTORY_COACH_PRIVATE_OPENAI_API_KEY'),key=keys.length===1?keys[0]:undefined;
 const keyReferencePinned=!!key?.valueFrom?.secretKeyRef&&/^[1-9][0-9]*$/.test(key.valueFrom.secretKeyRef.key)&&!Object.hasOwn(key,'value');
 const stop=[];
 if(!configurationApproved)stop.push('APPROVAL_OR_NUMERIC_CONFIGURATION_INVALID');
 if(!keyReferencePinned)stop.push(keys.length>1?'COACH_KEY_REFERENCE_AMBIGUOUS':'COACH_KEY_REFERENCE_NOT_PINNED');
 if(minimum>c.maxTurnMicroUsd)stop.push('FIXED_RESERVATION_EXCEEDS_UNCHANGED_TURN_CAP');
 if(synthetic.some(turn=>!turn.inputFits||!turn.budgetFits))stop.push('SYNTHETIC_CONTEXT_EXCEEDS_UNCHANGED_LIMIT');
 return {sourceSha,revision:name,servingTrafficVerified:false,configurationApproved,keyReferencePinned,
  fixed:{policyBytes,schemaBytes,envelopeBytes:2048,inputCeiling:fixedInputCeiling,reservationMicroUsd:minimum},
  limits:{maxInputChars:c.maxInputChars,maxOutputTokens:c.maxOutputTokens,maxTurnMicroUsd:c.maxTurnMicroUsd},
  contextByteAllowance:Math.floor((c.maxTurnMicroUsd*1e6-c.maxOutputTokens*c.outputMicroUsdPerMillion)/c.inputMicroUsdPerMillion)-fixedInputCeiling,
  synthetic,stopReasons:stop,arithmeticPass:stop.length===0,
  scope:'No runtime/provider connectivity is established. Synthetic contexts are lower bounds; check each actual request including its saved plan and prior reply before sending it.'};
}
module.exports={inspect,contexts};
if(require.main===module){
 try{
  const root=resolve(process.argv[2]||'.'),sha=process.argv[3]||'';
  const result=inspect(root,sha,JSON.parse(readFileSync(0,'utf8')));
  console.log(JSON.stringify(result,null,2));if(!result.arithmeticPass)process.exitCode=2;
 }catch(error){
  const safe=['EXACT_SOURCE_SHA_REQUIRED','CHECKOUT_SOURCE_MISMATCH','PRIVATE_COACH_REVISION_REQUIRED','ALLOWLISTED_SETTING_NOT_LITERAL'];
  console.error(JSON.stringify({error:safe.includes(error?.message)?error.message:'READ_ONLY_BUDGET_CHECK_FAILED'}));process.exitCode=1;
 }
}
