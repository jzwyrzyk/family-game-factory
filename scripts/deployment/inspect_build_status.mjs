#!/usr/bin/env node
// Read-only status receipt. Never prints prompts, source, keys, tokens, or raw diagnostics.
import {execFileSync} from 'node:child_process';
import {PROJECT,REGION,SERVICE,ORIGIN,CONFIG_FILE,CONFIG_SECRET,binding,servingRevision,ensure}
  from './repair_github_installation.mjs';
const index=process.argv.indexOf('--job-id');
const job=index<0 ? '' : process.argv[index+1];
let stage='VALIDATE_JOB';
const run=(program,args,input)=>execFileSync(program,args,{input,encoding:'utf8',timeout:60000,
  stdio:['pipe','pipe','pipe'],maxBuffer:8*1024*1024}).trim();
const cloud=args=>JSON.parse(run('gcloud',[...args,'--project='+PROJECT]));
const python=[
  'import json,re,sys',
  'from pathlib import Path',
  'sys.path.insert(0,str(Path.home()/"jems-service-release-th7YaSPp/source/scripts/deployment"))',
  'import preactivation_audit as audit',
  'import continuity',
  'payload=json.load(sys.stdin)',
  'state=audit.read_control_state(payload["config"],continuity.command) or {}',
  'jobs=[j for j in state.get("jobs",[]) if j.get("id")==payload["jobId"]]',
  'assert len(jobs)==1',
  'j=jobs[0]; e=j.get("execution") or {}',
  'def token(v):',
  ' return v if isinstance(v,str) and re.fullmatch(r"[A-Za-z][A-Za-z0-9_-]{0,79}",v) else None',
  'feedback=e.get("diagnostics")',
  'm=re.match(r"^([A-Z][A-Z0-9_]+)(?=[:;])",feedback if isinstance(feedback,str) else "")',
  'allowed={"GAME_PRESENTATION_FAILED","GAMEPLAY_DESIGN_FAILED","INTENT_REQUIREMENT_FAILED","INPUT_PRESENTATION_FAILED","GAME_QUALITY_UNVERIFIED","INPUT_RESPONSE_FAILED","GAME_RUNTIME_FAILED","GAME_CONTINUITY_FAILED","GENERATED_SOURCE_INVALID","GAME_RESOURCE_LIMIT","GAME_TEST_FAILED"}',
  'code=m.group(1) if m and m.group(1) in allowed else None',
  'attempt=e.get("attempt"); attempt=attempt if type(attempt) is int and 0<=attempt<=2 else None',
  'run_id=str(e.get("runId") or "")',
  'print(json.dumps({"jobId":payload["jobId"],"status":token(j.get("status")),"phase":token(j.get("phase")),"errorCode":token(j.get("errorCode")),"attempt":attempt,"runId":run_id if re.fullmatch(r"[0-9]{1,20}",run_id) else None,"stage":token(e.get("stage")),"lastStoredRepairCategory":token(e.get("repairCategory")),"lastStoredRepairCode":code,"lastStoredRepairFromAttempt":attempt-1 if code and attempt in (1,2) else None,"qualityRequired":j.get("qualityRequired")=="game-quality-v1","candidatePresent":bool(e.get("candidate")),"testReportPresent":bool(e.get("testReport")),"reviewReportPresent":bool(e.get("reviewReport"))}))',
].join('\n');
try {
  ensure(/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(job),'JOB_ID_INVALID');
  stage='READ_SERVING_REVISION';
  const service=cloud(['run','services','describe',SERVICE,'--region='+REGION,'--format=json']);
  const name=servingRevision(service);
  const revision=cloud(['run','revisions','describe',name,'--region='+REGION,'--format=json']);
  const mount=binding(revision.spec,CONFIG_FILE,CONFIG_SECRET);
  stage='READ_MOUNTED_CONFIG';
  const config=cloud(['secrets','versions','access',mount.version,'--secret='+CONFIG_SECRET]);
  ensure(config.projectId===PROJECT && config.gatewayOrigin===ORIGIN,'CONFIG_IDENTITY_UNEXPECTED');
  stage='READ_JOB_STATUS';
  const result=JSON.parse(run('python3',['-c',python],JSON.stringify({config,jobId:job})));
  console.log('SERVING_REVISION='+name);
  console.log('CONFIG_VERSION='+mount.version);
  console.log('PRIVATE_WORKER_SHA='+(/^[a-f0-9]{40}$/.test(config.workerApprovedSha) ? config.workerApprovedSha : 'UNEXPECTED'));
  console.log('JOB_STATUS='+JSON.stringify(result));
} catch {
  console.log('DIAGNOSTIC_STAGE='+stage);
  console.log('DIAGNOSTIC=SAFE_STATE_READ_FAILED');
  process.exitCode=1;
}
