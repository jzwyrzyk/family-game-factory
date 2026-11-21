#!/usr/bin/env node
// Read-only status receipt. Never prints prompts, source, keys, tokens, or raw diagnostics.
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {PROJECT,REGION,SERVICE,ORIGIN,CONFIG_FILE,CONFIG_SECRET,binding,servingRevision,ensure}
  from './repair_github_installation.mjs';
const index=process.argv.indexOf('--job-id');
const job=index<0 ? '' : process.argv[index+1];
let stage='VALIDATE_JOB';
const run=(program,args,input)=>execFileSync(program,args,{input,encoding:'utf8',timeout:60000,
  stdio:['pipe','pipe','pipe'],maxBuffer:8*1024*1024}).trim();
const cloud=args=>JSON.parse(run('gcloud',[...args,'--project='+PROJECT]));
export const statusProgram=[
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
  // Only enumerate the bounded FINDINGS field of saved sanitized repair feedback.
  // The existing from-attempt field identifies its provenance; this is not a new review.
  'finding_order=("VISUAL_STYLE_MISMATCH","VISUAL_INCOHERENT_ART","VISUAL_UNREADABLE_LAYOUT","VISUAL_PLACEHOLDER_APPEARANCE","VISUAL_OCCLUSION_OR_SCALE","INTENT_ACTION_MISSING","INTENT_PAYOFF_MISSING","GAMEPLAY_NO_CONSEQUENCE","GAMEPLAY_NO_VARIATION","GAMEPLAY_NO_RECOVERY","INPUT_UNCLEAR_OR_INACCESSIBLE","QUALITY_EVIDENCE_INCOMPLETE")',
  'finding_codes=set(finding_order)',
  'findings=[]',
  'if code and attempt in (1,2) and isinstance(feedback,str):',
  ' field=re.match(r"^[A-Z][A-Z0-9_]+;FINDINGS=([^.;\\r\\n]{1,1024})(?:[.;]|\\Z)",feedback[:2000])',
  ' if field:',
  '  for entry in field.group(1).split(","):',
  '   entry=entry.strip()',
  '   if entry in finding_codes and entry not in findings: findings.append(entry)',
  // New producer metadata is last rejection history, not an inferred final cause.
  // Reconstruct only the typed enum fields; raw reports and extra keys stay private.
  'category_codes={"intent-missing":{"INTENT_REQUIREMENT_FAILED"},"input-unresponsive":{"INPUT_RESPONSE_FAILED","INPUT_PRESENTATION_FAILED"},"runtime-failed":{"GAME_RUNTIME_FAILED"},"replay-failed":{"GAME_CONTINUITY_FAILED"},"syntax-invalid":{"GENERATED_SOURCE_INVALID"},"limits-failed":{"GAME_RESOURCE_LIMIT"},"test-unverified":{"GAME_TEST_FAILED"},"presentation-failed":{"GAME_PRESENTATION_FAILED"},"gameplay-shallow":{"GAMEPLAY_DESIGN_FAILED"},"quality-unverified":{"GAME_QUALITY_UNVERIFIED"}}',
  'def safe_last_failure(raw):',
  ' if not isinstance(raw,dict) or attempt is None: return None',
  ' failed_stage=raw.get("stage"); failed_attempt=raw.get("attempt")',
  ' category=raw.get("category"); failure_code=raw.get("code"); saved_findings=raw.get("findings")',
  ' if failed_stage not in ("test","review") or type(failed_attempt) is not int or not 0<=failed_attempt<=attempt: return None',
  ' if not isinstance(category,str) or not isinstance(failure_code,str) or failure_code not in category_codes.get(category,()): return None',
  ' if not isinstance(saved_findings,list) or len(saved_findings)>len(finding_order): return None',
  ' if any(not isinstance(f,str) or f not in finding_codes for f in saved_findings) or len(set(saved_findings))!=len(saved_findings): return None',
  ' result={"stage":failed_stage,"attempt":failed_attempt,"category":category,"code":failure_code,"findings":[f for f in finding_order if f in saved_findings]}',
  ' if "qualityAxes" in raw:',
  '  axes=raw["qualityAxes"]; names=("visual","intent","gameplay","input")',
  '  if failed_stage!="review" or not isinstance(axes,dict) or set(axes)!=set(names): return None',
  '  if any(axes[name] not in ("pass","fail","not-tested") for name in names): return None',
  '  result["qualityAxes"]={name:axes[name] for name in names}',
  ' return result',
  'last_failure=safe_last_failure(e.get("lastFailure"))',
  'run_id=str(e.get("runId") or "")',
  'print(json.dumps({"jobId":payload["jobId"],"status":token(j.get("status")),"phase":token(j.get("phase")),"errorCode":token(j.get("errorCode")),"attempt":attempt,"runId":run_id if re.fullmatch(r"[0-9]{1,20}",run_id) else None,"stage":token(e.get("stage")),"lastStoredRepairCategory":token(e.get("repairCategory")),"lastStoredRepairCode":code,"lastStoredRepairFromAttempt":attempt-1 if code and attempt in (1,2) else None,"lastStoredRepairFindings":findings,"lastFailure":last_failure,"qualityRequired":j.get("qualityRequired")=="game-quality-v1","candidatePresent":bool(e.get("candidate")),"testReportPresent":bool(e.get("testReport")),"reviewReportPresent":bool(e.get("reviewReport"))}))',
].join('\n');
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
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
  const result=JSON.parse(run('python3',['-c',statusProgram],JSON.stringify({config,jobId:job})));
  console.log('SERVING_REVISION='+name);
  console.log('CONFIG_VERSION='+mount.version);
  console.log('PRIVATE_WORKER_SHA='+(/^[a-f0-9]{40}$/.test(config.workerApprovedSha) ? config.workerApprovedSha : 'UNEXPECTED'));
  console.log('JOB_STATUS='+JSON.stringify(result));
} catch {
  console.log('DIAGNOSTIC_STAGE='+stage);
  console.log('DIAGNOSTIC=SAFE_STATE_READ_FAILED');
  process.exitCode=1;
}
}
