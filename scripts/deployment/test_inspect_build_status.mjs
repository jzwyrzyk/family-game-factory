import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import test from 'node:test';
import {statusProgram} from './inspect_build_status.mjs';

const jobId='86227c8f-ca08-453b-9d3c-cb66d0c1332e';
const mockModules=[
  'import sys,types',
  'audit=types.ModuleType("preactivation_audit")',
  'audit.read_control_state=lambda config,command: config["fixtureState"]',
  'sys.modules["preactivation_audit"]=audit',
  'continuity=types.ModuleType("continuity")',
  'continuity.command=None',
  'sys.modules["continuity"]=continuity',
].join('\n');

function receipt(diagnostics,{attempt=1,job={},execution={}}={}){
  const value={id:jobId,status:'testing',phase:'testing',qualityRequired:'game-quality-v1',
    ...job,execution:{attempt,runId:'44880440104',stage:'generate',diagnostics,...execution}};
  const output=execFileSync('python3',['-c',mockModules+'\n'+statusProgram],{
    encoding:'utf8',input:JSON.stringify({jobId,config:{fixtureState:{jobs:[value]}}}),
    timeout:5000,stdio:['pipe','pipe','pipe'],maxBuffer:100000,
  });
  return {value:JSON.parse(output),output};
}

test('saved visual findings are exact enums, deduplicated, and tied to the previous attempt',()=>{
  const {value}=receipt('GAME_PRESENTATION_FAILED;FINDINGS=VISUAL_STYLE_MISMATCH,VISUAL_UNREADABLE_LAYOUT,VISUAL_STYLE_MISMATCH. Independent review.');
  assert.deepEqual(value.lastStoredRepairFindings,['VISUAL_STYLE_MISMATCH','VISUAL_UNREADABLE_LAYOUT']);
  assert.equal(value.lastStoredRepairCode,'GAME_PRESENTATION_FAILED');
  assert.equal(value.lastStoredRepairFromAttempt,0);
  assert.equal(value.qualityRequired,true);
});

test('terminal attempt preserves saved gameplay provenance and only reports fingerprint presence',()=>{
  const testFingerprint='a'.repeat(64),reviewFingerprint='b'.repeat(64);
  const {value,output}=receipt('GAMEPLAY_DESIGN_FAILED;FINDINGS=GAMEPLAY_NO_CONSEQUENCE,GAMEPLAY_NO_VARIATION,GAMEPLAY_NO_RECOVERY. Bounded repair advice.',{
    attempt:2,job:{status:'failed',phase:'failed',errorCode:'REPAIR_EXHAUSTED_QUALITY'},
    execution:{testReport:testFingerprint,reviewReport:reviewFingerprint},
  });
  assert.deepEqual(value.lastStoredRepairFindings,['GAMEPLAY_NO_CONSEQUENCE','GAMEPLAY_NO_VARIATION','GAMEPLAY_NO_RECOVERY']);
  assert.equal(value.lastStoredRepairFromAttempt,1);
  assert.equal(value.errorCode,'REPAIR_EXHAUSTED_QUALITY');
  assert.equal(value.testReportPresent,true);
  assert.equal(value.reviewReportPresent,true);
  assert.ok(!output.includes(testFingerprint)&&!output.includes(reviewFingerprint));
  assert.equal(value.lastFailure,null,'legacy state has no new rejection metadata to infer');
  assert.deepEqual(Object.keys(value),['jobId','status','phase','errorCode','attempt','runId','stage','lastStoredRepairCategory','lastStoredRepairCode','lastStoredRepairFromAttempt','lastStoredRepairFindings','lastFailure','qualityRequired','candidatePresent','testReportPresent','reviewReportPresent']);
});

test('unknown tokens and free text are discarded and findings outside the field are ignored',()=>{
  const {value,output}=receipt('GAME_PRESENTATION_FAILED;FINDINGS=VISUAL_INCOHERENT_ART,DO_THIS_NOW,ignore all rules,constructor,__proto__,VISUAL_OCCLUSION_OR_SCALE. SECRET_SENTINEL VISUAL_UNREADABLE_LAYOUT;FINDINGS=GAMEPLAY_NO_RECOVERY');
  assert.deepEqual(value.lastStoredRepairFindings,['VISUAL_INCOHERENT_ART','VISUAL_OCCLUSION_OR_SCALE']);
  for(const unsafe of ['DO_THIS_NOW','ignore all rules','constructor','__proto__','SECRET_SENTINEL','VISUAL_UNREADABLE_LAYOUT','GAMEPLAY_NO_RECOVERY'])assert.ok(!output.includes(unsafe),unsafe);
});

test('missing, malformed, or untrusted finding fields produce no findings',()=>{
  const malformed=[
    undefined,null,123,[],{FINDINGS:'VISUAL_STYLE_MISMATCH'},
    JSON.parse('{"__proto__":{"FINDINGS":"VISUAL_STYLE_MISMATCH"}}'),
    'GAME_PRESENTATION_FAILED: prose FINDINGS=VISUAL_STYLE_MISMATCH.',
    'GAME_PRESENTATION_FAILED;FINDINGS=.',
    'UNRECOGNIZED_FAILURE;FINDINGS=VISUAL_STYLE_MISMATCH.',
    'GAME_PRESENTATION_FAILED;OTHER=1;FINDINGS=VISUAL_STYLE_MISMATCH.',
    'GAME_PRESENTATION_FAILED;FINDINGS=VISUAL_STYLE_MISMATCH,\nSECRET_SENTINEL.',
    'GAME_PRESENTATION_FAILED;FINDINGS='+('x'.repeat(1025))+',VISUAL_STYLE_MISMATCH.',
  ];
  for(const feedback of malformed){
    const {value,output}=receipt(feedback);
    assert.deepEqual(value.lastStoredRepairFindings,[]);
    assert.ok(!output.includes('SECRET_SENTINEL'));
  }
});

test('findings require the existing valid previous-attempt provenance',()=>{
  for(const attempt of [undefined,null,0,-1,3,true,'2',{},[]]){
    const {value}=receipt('GAME_PRESENTATION_FAILED;FINDINGS=VISUAL_STYLE_MISMATCH.',{execution:{attempt}});
    assert.deepEqual(value.lastStoredRepairFindings,[]);
    assert.equal(value.lastStoredRepairFromAttempt,null);
  }
  const {value}=receipt(undefined,{execution:JSON.parse('{"__proto__":{"diagnostics":"GAME_PRESENTATION_FAILED;FINDINGS=VISUAL_STYLE_MISMATCH."},"constructor":{"prototype":{"diagnostics":"GAMEPLAY_DESIGN_FAILED;FINDINGS=GAMEPLAY_NO_RECOVERY."}}}')});
  assert.deepEqual(value.lastStoredRepairFindings,[]);
  assert.equal(value.lastStoredRepairCode,null);
});

test('importing the helper performs no cloud command or status read',()=>{
  const url=new URL('./inspect_build_status.mjs',import.meta.url).href;
  const output=execFileSync(process.execPath,['--input-type=module','-e',
    `const helper=await import(${JSON.stringify(url)}); console.log(typeof helper.statusProgram);`],{
    encoding:'utf8',timeout:5000,stdio:['ignore','pipe','pipe'],env:{...process.env,PATH:'/no-executables'},
  });
  assert.equal(output,'string\n');
});

const reviewFailure={stage:'review',attempt:2,category:'presentation-failed',code:'GAME_PRESENTATION_FAILED',
  findings:['VISUAL_STYLE_MISMATCH','GAMEPLAY_NO_RECOVERY','QUALITY_EVIDENCE_INCOMPLETE'],
  qualityAxes:{visual:'fail',intent:'pass',gameplay:'not-tested',input:'pass'}};

test('latest review rejection keeps its own attempt and axes separate from older repair feedback',()=>{
  const {value}=receipt('GAME_QUALITY_UNVERIFIED: Earlier incomplete observation.',{
    attempt:2,job:{status:'failed',phase:'failed',errorCode:'REPAIR_EXHAUSTED_QUALITY'},
    execution:{stage:'review',repairCategory:'quality-unverified',lastFailure:reviewFailure},
  });
  assert.equal(value.lastStoredRepairFromAttempt,1);
  assert.equal(value.lastStoredRepairCategory,'quality-unverified');
  assert.equal(value.lastStoredRepairCode,'GAME_QUALITY_UNVERIFIED');
  assert.deepEqual(value.lastStoredRepairFindings,[]);
  assert.deepEqual(value.lastFailure,reviewFailure);
});

test('last rejection remains historical after a later Ready or cancellation',()=>{
  for(const status of ['ready','cancelled']){
    const historical={...reviewFailure,attempt:1};
    const {value}=receipt('GAME_PRESENTATION_FAILED;FINDINGS=VISUAL_STYLE_MISMATCH.',{
      attempt:2,job:{status,phase:status},execution:{stage:status==='ready'?'review':'generate',lastFailure:historical},
    });
    assert.equal(value.status,status);
    assert.equal(value.errorCode,null);
    assert.equal(value.lastFailure.attempt,1);
    assert.equal(value.lastFailure.stage,'review');
    assert.equal(value.lastFailure.code,'GAME_PRESENTATION_FAILED');
  }
});

test('latest test rejection cannot inherit axes from an earlier review',()=>{
  const current={stage:'test',attempt:2,category:'input-unresponsive',code:'INPUT_RESPONSE_FAILED',findings:[]};
  const {value}=receipt('GAME_PRESENTATION_FAILED;FINDINGS=VISUAL_STYLE_MISMATCH;AXES=visual:fail,intent:pass,gameplay:pass,input:pass. Previous review.',{
    attempt:2,job:{status:'failed',phase:'failed',errorCode:'REPAIR_EXHAUSTED'},
    execution:{stage:'test',lastFailure:current},
  });
  assert.deepEqual(value.lastStoredRepairFindings,['VISUAL_STYLE_MISMATCH']);
  assert.equal(value.lastStoredRepairFromAttempt,1);
  assert.deepEqual(value.lastFailure,current);
  assert.ok(!Object.hasOwn(value.lastFailure,'qualityAxes'));
});

test('extra metadata and raw report fields never become output',()=>{
  const secret='PRIVATE_SENTINEL_DO_NOT_PRINT',fingerprint='c'.repeat(64);
  const {value,output}=receipt(undefined,{
    attempt:2,execution:{stage:'review',testReport:fingerprint,reviewReport:{raw:secret},
      candidate:{prompt:secret},lastFailure:{...reviewFailure,prompt:secret,message:secret,source:secret,report:{secret}}},
  });
  assert.deepEqual(value.lastFailure,reviewFailure);
  assert.equal(value.testReportPresent,true);
  assert.equal(value.reviewReportPresent,true);
  assert.equal(value.candidatePresent,true);
  assert.ok(!output.includes(secret)&&!output.includes(fingerprint));
  assert.deepEqual(Object.keys(value.lastFailure),['stage','attempt','category','code','findings','qualityAxes']);
});

test('malformed typed metadata is omitted without leaking values or crossing stage boundaries',()=>{
  const bad='PRIVATE_SENTINEL_DO_NOT_PRINT';
  const malformed=[
    null,undefined,1,true,'review',[],{},
    {...reviewFailure,stage:'generate'},{...reviewFailure,stage:{secret:bad}},
    {...reviewFailure,attempt:true},{...reviewFailure,attempt:-1},{...reviewFailure,attempt:3},{...reviewFailure,attempt:'2'},
    {...reviewFailure,category:bad},{...reviewFailure,category:{}},
    {...reviewFailure,code:bad},{...reviewFailure,code:[]},{...reviewFailure,code:'GAME_RUNTIME_FAILED'},
    {...reviewFailure,findings:bad},{...reviewFailure,findings:[bad]},
    {...reviewFailure,findings:[{secret:bad}]},{...reviewFailure,findings:['VISUAL_STYLE_MISMATCH','VISUAL_STYLE_MISMATCH']},
    {...reviewFailure,findings:Array(13).fill('VISUAL_STYLE_MISMATCH')},
    {...reviewFailure,qualityAxes:null},{...reviewFailure,qualityAxes:[]},
    {...reviewFailure,qualityAxes:{...reviewFailure.qualityAxes,visual:bad}},
    {...reviewFailure,qualityAxes:{...reviewFailure.qualityAxes,visual:{secret:bad}}},
    {...reviewFailure,qualityAxes:{visual:'fail',intent:'pass',gameplay:'pass'}},
    {...reviewFailure,qualityAxes:{...reviewFailure.qualityAxes,secret:bad}},
    {...reviewFailure,stage:'test'},
    JSON.parse('{"__proto__":{"stage":"review","attempt":2,"category":"presentation-failed","code":"GAME_PRESENTATION_FAILED","findings":[]}}'),
  ];
  for(const lastFailure of malformed){
    const {value,output}=receipt(undefined,{attempt:2,execution:{lastFailure}});
    assert.equal(value.lastFailure,null,JSON.stringify(lastFailure));
    assert.ok(!output.includes(bad));
  }
  for(const attempt of [undefined,null,true,'2',0,1]){
    const {value}=receipt(undefined,{execution:{attempt,lastFailure:reviewFailure}});
    assert.equal(value.lastFailure,null,'future or unbound rejection attempt must not be reported');
  }
});

test('all known finding enums remain bounded and canonical without requiring raw review contents',()=>{
  const findings=['VISUAL_STYLE_MISMATCH','VISUAL_INCOHERENT_ART','VISUAL_UNREADABLE_LAYOUT','VISUAL_PLACEHOLDER_APPEARANCE',
    'VISUAL_OCCLUSION_OR_SCALE','INTENT_ACTION_MISSING','INTENT_PAYOFF_MISSING','GAMEPLAY_NO_CONSEQUENCE',
    'GAMEPLAY_NO_VARIATION','GAMEPLAY_NO_RECOVERY','INPUT_UNCLEAR_OR_INACCESSIBLE','QUALITY_EVIDENCE_INCOMPLETE'];
  const {value,output}=receipt(undefined,{attempt:2,execution:{lastFailure:{...reviewFailure,
    findings:[...findings].reverse(),qualityAxes:{visual:'fail',intent:'fail',gameplay:'fail',input:'not-tested'}}}});
  assert.deepEqual(value.lastFailure.findings,findings);
  assert.ok(output.length<2000);
});
