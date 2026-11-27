#!/usr/bin/env bash
# Verify this file's checksum from the reviewed handoff before executing.
# Usage: bash operations-bootstrap.sh SOURCE_SHA {broker-execute|broker-build|broker-setup|broker-continue|broker-iam|nonprod|nonprod-recover|nonprod-verify|github|cleanup|capacity|recovery} ARGS...
set -euo pipefail
[[ $# -ge 2 && "$1" =~ ^[0-9a-f]{40}$ ]] || { echo 'Expected immutable source SHA and lane.' >&2; exit 2; }
operations_sha="$1"
operations_lane="$2"
shift 2
case "$operations_lane" in
  broker-execute) operations_script=native_broker_execution.py ;;
  broker-build) operations_script=build_request_broker.py ;;
  broker-setup) operations_script=bootstrap_request_diagnostics.py ;;
  broker-continue) operations_script=continue_broker_activation.py ;;
  broker-iam) operations_script=audit_request_diagnostics.py ;;
  nonprod) operations_script=setup_nonproduction.py ;;
  nonprod-recover) operations_script=recover_nonproduction.py ;;
  nonprod-verify) operations_script=verify_nonproduction_completion.py ;;
  github) operations_script=github_operations.py ;;
  cleanup) operations_script=cleanup_historical_checkouts.py ;;
  capacity) operations_script=recover_checkout_space.py ;;
  recovery) operations_script=operational_recovery.py ;;
  *) echo 'Unsupported operations lane.' >&2; exit 2 ;;
esac
# Recovery metadata contains only fixed enums, source/build IDs and approval hashes.
# Never capture credentials, environment dumps, command output or raw arguments.
operations_receipt_dir="${JEMS_OPERATIONS_RECEIPT_DIR:-$PWD/work/jems-operations-recovery}"
export PYTHONDONTWRITEBYTECODE=1
JEMS_OPERATION_JOURNAL="$(python3 - "$operations_receipt_dir" "$operations_sha" "$operations_lane" "$@" <<'PY'
import datetime,json,os,re,stat,sys,uuid
from pathlib import Path
os.umask(0o077)
folder=Path(os.path.abspath(sys.argv[1]))
for parent in [*folder.parents,folder]:
    if parent.is_symlink(): raise SystemExit('Receipt path must not contain symlinks')
folder.mkdir(parents=True,exist_ok=True,mode=0o700)
if folder.stat().st_mode & 0o077: raise SystemExit('Receipt directory must be private (mode 700)')
path=folder/('operation-'+uuid.uuid4().hex+'.jsonl')
record={'schema':1,'event':'STARTED','source_sha':sys.argv[2],'lane':sys.argv[3],
        'time_utc':datetime.datetime.now(datetime.timezone.utc).isoformat()}
args=sys.argv[4:]
patterns={'--build-id':r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}',
          '--build-source-sha':r'[a-f0-9]{40}','--approve-plan-sha256':r'[a-f0-9]{64}'}
for key,pattern in patterns.items():
    if key in args and args.index(key)+1<len(args):
        value=args[args.index(key)+1]
        if re.fullmatch(pattern,value): record[key[2:].replace('-','_')]=value
record['modes']=[x for x in ('--check','--diagnose','--submit','--inventory','--plan','--apply','--dispatch','--apply-plan','--restore-plan') if x in args]
with path.open('x') as handle:
    handle.write(json.dumps(record,sort_keys=True)+'\n');handle.flush();os.fsync(handle.fileno())
print(path)
PY
)"
export JEMS_OPERATION_JOURNAL
operations_checkout=''
operations_child_started=false
operations_finish() {
  operations_exit="$?"
  trap - EXIT HUP INT TERM
  operations_cleanup=NOT_CREATED
  if [[ -n "$operations_checkout" && -d "$operations_checkout" ]]; then
    operations_dirty=''
    if [[ "$operations_child_started" == true ]]; then
      operations_dirty="$(git -C "$operations_checkout" status --porcelain --untracked-files=all --ignored 2>/dev/null)" || operations_dirty=UNREADABLE
    fi
    if [[ -z "$operations_dirty" ]]; then
      rm -rf -- "$operations_checkout"
      operations_cleanup=REMOVED
    else
      # Keep unknown/local output in place; record its exact private recovery path.
      operations_cleanup=RETAINED_LOCAL_CHANGES
    fi
  fi
  python3 - "$JEMS_OPERATION_JOURNAL" "$operations_exit" "$operations_cleanup" "$operations_checkout" <<'PY'
import datetime,json,os,sys
record={'event':'FINISHED','exit_code':int(sys.argv[2]),'temporary_checkout':sys.argv[3],
        'time_utc':datetime.datetime.now(datetime.timezone.utc).isoformat()}
if sys.argv[3]=='RETAINED_LOCAL_CHANGES': record['retained_path']=sys.argv[4]
with open(sys.argv[1],'a') as handle:
    handle.write(json.dumps(record,sort_keys=True)+'\n');handle.flush();os.fsync(handle.fileno())
print('Private recovery receipt: '+sys.argv[1],file=sys.stderr)
PY
  exit "$operations_exit"
}
trap operations_finish EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
operations_checkout="$(mktemp -d "${TMPDIR:-/tmp}/jems-operations.XXXXXXXX")"
git -C "$operations_checkout" init -q
git -C "$operations_checkout" remote add origin https://github.com/jzwyrzyk/family-game-factory.git
git -C "$operations_checkout" config remote.origin.promisor true
git -C "$operations_checkout" config remote.origin.partialclonefilter blob:none
git -C "$operations_checkout" sparse-checkout init --cone
git -C "$operations_checkout" sparse-checkout set scripts/ops scripts/deployment scripts/environments infra/nonproduction ops .github/workflows
git -C "$operations_checkout" fetch --quiet --filter=blob:none --depth=1 origin "$operations_sha"
git -C "$operations_checkout" checkout --quiet --detach FETCH_HEAD
[[ "$(git -C "$operations_checkout" rev-parse HEAD)" == "$operations_sha" ]]
operations_child_started=true
if [[ "$operations_lane" == github || "$operations_lane" == cleanup || "$operations_lane" == capacity ]]; then
  python3 "$operations_checkout/scripts/ops/$operations_script" "$@"
else
  python3 "$operations_checkout/scripts/ops/$operations_script" --source-sha "$operations_sha" "$@"
fi
