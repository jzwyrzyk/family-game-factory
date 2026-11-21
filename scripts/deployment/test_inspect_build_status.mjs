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
  assert.deepEqual(Object.keys(value),['jobId','status','phase','errorCode','attempt','runId','stage','lastStoredRepairCategory','lastStoredRepairCode','lastStoredRepairFromAttempt','lastStoredRepairFindings','qualityRequired','candidatePresent','testReportPresent','reviewReportPresent']);
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
