'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {mkdtempSync,mkdirSync,writeFileSync,appendFileSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {resolve,join}=require('node:path');
const {execFileSync,spawnSync}=require('node:child_process');
const sourceRoot=resolve(process.env.JEMS_COACH_BUDGET_SOURCE_ROOT||join(__dirname,'..'));
const helper=resolve(process.env.JEMS_COACH_BUDGET_HELPER||join(__dirname,'coach-release-budget.cjs'));
const {inspect}=require(helper);
const sha=execFileSync('git',['rev-parse','HEAD'],{cwd:sourceRoot,encoding:'utf8'}).trim();
const sentinel='private-fixture-sentinel-do-not-print';
function fixture(cap='40000'){
 const values={FACTORY_COACH_APPROVED:'true',FACTORY_COACH_PRIVACY_APPROVED:'true',FACTORY_COACH_SAFEGUARDS_APPROVED:'true',
  FACTORY_COACH_ZDR_VERIFIED:'true',FACTORY_COACH_PRIVATE_EXECUTION_APPROVED:'true',FACTORY_COACH_MODEL:'fixture-approved-model',
  FACTORY_COACH_OUTPUT_TOKENS:'2000',FACTORY_COACH_MAX_MICRO_USD:cap,FACTORY_COACH_INPUT_PRICE:'750000',
  FACTORY_COACH_OUTPUT_PRICE:'4500000',FACTORY_COACH_PRICES_REVIEWED:new Date().toISOString().slice(0,10)};
 return {metadata:{name:'factory-coach-private-synthetic-fixture'},spec:{containers:[{env:[
  ...Object.entries(values).map(([name,value])=>({name,value})),
  {name:'FACTORY_COACH_PRIVATE_OPENAI_API_KEY',valueFrom:{secretKeyRef:{name:sentinel,key:'1'}}},
  {name:'UNRELATED_PRIVATE_SETTING',value:sentinel}]}]}};
}
const env=revision=>revision.spec.containers[0].env;
const set=(revision,name,value)=>{const entry=env(revision).find(row=>row.name===name);if(entry)entry.value=value;else env(revision).push({name,value});};
function cli(revision,root=sourceRoot,source=sha){
 return spawnSync(process.execPath,['--import','tsx',helper,root,source],
  {cwd:sourceRoot,input:JSON.stringify(revision),encoding:'utf8'});
}
test('actual selected policy rejects a 20k fixture cap before inference and fits an adequate unchanged fixture cap',()=>{
 const low=inspect(sourceRoot,sha,fixture('20000'));
 assert.equal(low.fixed.inputCeiling,14922);assert.equal(low.fixed.reservationMicroUsd,20192);
 assert.equal(low.arithmeticPass,false);assert.ok(low.stopReasons.includes('FIXED_RESERVATION_EXCEEDS_UNCHANGED_TURN_CAP'));
 assert.equal(low.contextByteAllowance,-256);
 const high=inspect(sourceRoot,sha,fixture());assert.equal(high.arithmeticPass,true);
 assert.equal(high.synthetic[0].reservationMicroUsd,20568);assert.equal(high.servingTrafficVerified,false);
 const onlyFixed=inspect(sourceRoot,sha,fixture('20192'));
 assert.ok(!onlyFixed.stopReasons.includes('FIXED_RESERVATION_EXCEEDS_UNCHANGED_TURN_CAP'));
 assert.ok(onlyFixed.stopReasons.includes('SYNTHETIC_CONTEXT_EXCEEDS_UNCHANGED_LIMIT'));
 assert.equal(onlyFixed.contextByteAllowance,0);
});
test('adult availability follows the selected source flags without requiring a child ZDR flag',()=>{
 const revision=fixture();set(revision,'FACTORY_COACH_ZDR_VERIFIED','false');
 for(const name of ['FACTORY_ADULT_PILOT_MODE','FACTORY_ADULT_PILOT_OWNER_APPROVED','FACTORY_ADULT_PILOT_PROFILE_ACCESS_VERIFIED'])set(revision,name,'true');
 assert.equal(inspect(sourceRoot,sha,revision).configurationApproved,true);
 set(revision,'FACTORY_ADULT_PILOT_PROFILE_ACCESS_VERIFIED','false');
 assert.equal(inspect(sourceRoot,sha,revision).configurationApproved,false);
 set(revision,'FACTORY_ADULT_PILOT_PROFILE_ACCESS_VERIFIED','true');set(revision,'FACTORY_COACH_PRIVACY_APPROVED','false');
 assert.equal(inspect(sourceRoot,sha,revision).configurationApproved,false,'adult scope does not bypass privacy approval');
});
test('private key metadata must be one unambiguous pinned reference; no payload is needed',()=>{
 const duplicate=fixture();env(duplicate).push({...env(duplicate).find(row=>row.name==='FACTORY_COACH_PRIVATE_OPENAI_API_KEY')});
 const duplicated=inspect(sourceRoot,sha,duplicate);
 assert.equal(duplicated.keyReferencePinned,false);assert.ok(duplicated.stopReasons.includes('COACH_KEY_REFERENCE_AMBIGUOUS'));
 const latest=fixture();env(latest).find(row=>row.name==='FACTORY_COACH_PRIVATE_OPENAI_API_KEY').valueFrom.secretKeyRef.key='latest';
 assert.equal(inspect(sourceRoot,sha,latest).arithmeticPass,false);
 const literal=fixture();env(literal).find(row=>row.name==='FACTORY_COACH_PRIVATE_OPENAI_API_KEY').value=sentinel;
 assert.equal(inspect(sourceRoot,sha,literal).arithmeticPass,false);
 const duplicateNumeric=fixture();env(duplicateNumeric).push({name:'FACTORY_COACH_OUTPUT_TOKENS',value:'128'});
 assert.throws(()=>inspect(sourceRoot,sha,duplicateNumeric),/ALLOWLISTED_SETTING_NOT_LITERAL/);
});
test('wrong source and dirty selected source fail without printing source or metadata contents',()=>{
 const wrong=cli(fixture(),sourceRoot,'0'.repeat(40));assert.equal(wrong.status,1);assert.match(wrong.stderr,/CHECKOUT_SOURCE_MISMATCH/);
 const directory=mkdtempSync(join(tmpdir(),'jems-coach-budget-source-'));
 try{
  const git=args=>execFileSync('git',args,{cwd:directory,stdio:'ignore'});
  git(['init','-q']);mkdirSync(join(directory,'server/coach'),{recursive:true});
  writeFileSync(join(directory,'server/coach/policy.ts'),'export const fixture = true;\n');git(['add','.']);
  git(['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','fixture source']);
  const dirtySha=execFileSync('git',['rev-parse','HEAD'],{cwd:directory,encoding:'utf8'}).trim();
  appendFileSync(join(directory,'server/coach/policy.ts'),'// '+sentinel+'\n');
  const dirty=cli(fixture(),directory,dirtySha);assert.equal(dirty.status,1);assert.match(dirty.stderr,/READ_ONLY_BUDGET_CHECK_FAILED/);
  assert.ok(!(dirty.stdout+dirty.stderr).includes(sentinel));
 }finally{rmSync(directory,{recursive:true,force:true});}
 assert.ok(!(wrong.stdout+wrong.stderr).includes(sentinel));
});
test('CLI emits only sanitized arithmetic for successful and rejected configurations',()=>{
 for(const cap of ['20000','40000']){
  const result=cli(fixture(cap));assert.equal(result.status,cap==='20000'?2:0);
  const output=result.stdout+result.stderr;assert.ok(!output.includes(sentinel));assert.ok(!output.includes('secretKeyRef'));
  assert.equal(JSON.parse(result.stdout).sourceSha,sha);
 }
});
