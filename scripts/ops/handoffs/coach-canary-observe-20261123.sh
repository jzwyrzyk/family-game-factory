#!/usr/bin/env bash
# Read-only canary metadata and next Gateway release inputs. No paid request.
set -euo pipefail
umask 077
export GH_DEBUG= GH_PROMPT_DISABLED=1 CLOUDSDK_CORE_LOG_HTTP=false CLOUDSDK_CORE_DISABLE_PROMPTS=1 PYTHONDONTWRITEBYTECODE=1
jems_expected_main='2765dc042bf8760e2b930b0f83f6759c63429a95'
jems_workspace=/home/jzwyrzyk/jems-production-activation.lekdl0n2
jems_dir=$(mktemp -d "$jems_workspace/coach-canary-observation.XXXXXX")
jems_read_main() {
  gh api --hostname github.com repos/jzwyrzyk/family-game-factory/git/ref/heads/main --jq .object.sha
}
test "$(jems_read_main)" = "$jems_expected_main"
for jems_name in inspect_coach_runtime release; do
  case "$jems_name" in
    inspect_coach_runtime) jems_source=scripts/deployment/inspect_coach_runtime.py ;;
    release) jems_source=scripts/ops/release.py ;;
  esac
  gh api --hostname github.com -H 'Accept: application/vnd.github.raw+json' \
    "repos/jzwyrzyk/family-game-factory/contents/$jems_source?ref=c63c5a01e9b74b0adff660ea3a763775723da534" \
    > "$jems_dir/$jems_name.py"
done
printf '%s  %s\n' \
  708ca587a15537b2da8a7ac2a6f52ed7a9fc4be7ec86b7bd8204bfa527c6cf2c "$jems_dir/inspect_coach_runtime.py" \
  81e520fae28de860e662e050f8de5a0611e006c8b5e25d3323579957e5d4da1d "$jems_dir/release.py" \
  | sha256sum --check -
python3 - "$jems_dir" "$jems_expected_main" <<'PY'
from datetime import datetime, timezone
import hashlib, json, pathlib, subprocess, sys
folder=pathlib.Path(sys.argv[1])
report={'status':'READ_ONLY_CANARY_OBSERVATION_BLOCKED','mutations':0,
        'release_commit':sys.argv[2], 'private_output':str(folder),
        'limits':'No paid request. Request status metadata is not a review of conversation content. No promotion or rollback.'}
try:
    for key, args in (
        ('runtime', ['inspect_coach_runtime.py']),
        ('gateway_release_input', ['release.py','--inspect-service','factory-gateway'])):
        result=subprocess.run([sys.executable,str(folder/args[0]),*args[1:]],
                              stdin=subprocess.DEVNULL,capture_output=True,timeout=240)
        if len(result.stdout)>1000000:
            raise RuntimeError('BOUNDED_OUTPUT_EXCEEDED')
        report[key]=json.loads(result.stdout)
        if result.returncode:
            raise RuntimeError('READ_COMMAND_FAILED')
    coach=next(row for row in report['runtime']['services'] if row['service']=='factory-coach-private')
    observed={row['revision']:row['percent'] for row in coach['serving']}
    expected={'factory-coach-private-chatready-1996c1b382a7-9c98a0':95,
              'factory-coach-private-r-890188092e3f4396dab0':5}
    if observed!=expected or coach['trafficTotalPercent']!=100:
        raise RuntimeError('CANARY_TRAFFIC_MISMATCH')
    if report['gateway_release_input']['matchesServingConfiguration'] is not True:
        raise RuntimeError('GATEWAY_CONFIGURATION_MISMATCH')
    current=subprocess.run(['gh','api','--hostname','github.com',
        'repos/jzwyrzyk/family-game-factory/git/ref/heads/main','--jq','.object.sha'],
        stdin=subprocess.DEVNULL,capture_output=True,text=True,timeout=60,check=True)
    if current.stdout.strip()!=report['release_commit']:
        raise RuntimeError('MAIN_CHANGED_DURING_OBSERVATION')
    report['status']='READ_ONLY_CANARY_OBSERVATION_COMPLETE'
except Exception as error:
    report['error_code']=str(error) if type(error) is RuntimeError else 'CHECK_FAILED_RAW_ERROR_SUPPRESSED'
report['observed_at']=datetime.now(timezone.utc).isoformat()
raw=(json.dumps(report,sort_keys=True,indent=2)+'\n').encode()
with (folder/'completion.json').open('xb') as stream:
    stream.write(raw)
report['completion_sha256']=hashlib.sha256(raw).hexdigest()
print(json.dumps(report,sort_keys=True,indent=2))
sys.exit(0 if report['status']=='READ_ONLY_CANARY_OBSERVATION_COMPLETE' else 2)
PY
