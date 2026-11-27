#!/usr/bin/env bash
# Reviewed implementation: 6aa51091a2f061393c265e9d445ecca151808abd (scoped correction on PR222).
# This file's SHA-256 is an integrity checksum, NOT a Terraform approval.
# Approval hash: unavailable until the private-state/cloud planning checks pass.
#
# Exact correction:
# - WIF display name: Jems protected main controller (30 chars); disabled=true.
# - Budget-only alias: project=billing_project=jems-jzw-nonprod and
#   user_project_override=true; preserve existing USD15/month scope/thresholds.
# - Retire the uncreated project IAP binding; keep the existing controller's
#   per-service roles/run.invoker grant. No project-wide replacement role.
# - Verify the recorded Google-managed IAP identity and live API enablement.
#   DEV still requires its service-level access and authenticated invocation gates.
# Expected: 2 creates, 25 no-ops, no update/replace/destroy. Exact no-op imports
# replace creations if uncertain prior operations already succeeded.
# Preserve original state/plans/apply-started/receipts; use a new successor state.
# Federation, registry cleanup, application deployment and live AI stay off.
set -euo pipefail
umask 077
export JEMS_OPERATIONS_RECEIPT_DIR="${JEMS_OPERATIONS_RECEIPT_DIR:-$HOME/work/jems-operations-recovery}"
recovery_source=6aa51091a2f061393c265e9d445ecca151808abd
recovery_launcher_sha256=c0248cabdeb6ea195051b3b3c17eb0a30cf7e0567e9af5eff104a2c521620071
if [[ ${1:-} == --help ]]; then
  cat <<'HELP'
Read-only planning (default):
  bash nonproduction-recovery.sh
  bash nonproduction-recovery.sh --plan --state-dir "$HOME/work/jems-nonprod-state"

After successful reconciliation, review the emitted private receipt and exact
approve_plan_sha256. Only then use this executable with the returned hash:
  bash nonproduction-recovery.sh --apply-receipt /absolute/attempt/reviewed-recovery.json --approve-plan-sha256 HASH

Requires the existing authorized user ADC, gcloud, git, curl, Python3, Terraform
1.13.5 and the original private state directory on the operator's computer.
No credential setup, expanded permissions or automatic apply occurs. Missing
state/permissions produces a specific sanitized failure code. The attached Codex
computer currently reports STATE_DIRECTORY_MISSING. Never replay the original
plan, remove either apply-started marker or discard successor state after failure.

Production broker run 45869033203 reached the deployed broker but returned
UNAVAILABLE/COVERAGE_UNVERIFIED. Effective-IAM and dated coverage attestation
remain required. The scope-default bug is fixed in this source; the workflow
correction is not merged or deployed by this handoff.
HELP
  exit 0
fi
if [[ $# == 0 ]]; then set -- --plan; fi
case "$1" in
  --plan|--apply-receipt) ;;
  *) echo 'RECOVERY_MODE_REQUIRED: use --plan or --apply-receipt; see --help.' >&2; exit 2 ;;
esac
recovery_launcher=$(mktemp "${TMPDIR:-/tmp}/jems-partial-recovery.XXXXXXXX")
trap 'rm -f -- "$recovery_launcher"' EXIT
curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
  "https://raw.githubusercontent.com/jzwyrzyk/family-game-factory/$recovery_source/scripts/ops/handoffs/operations-bootstrap.sh" \
  -o "$recovery_launcher"
printf '%s  %s\n' "$recovery_launcher_sha256" "$recovery_launcher" | sha256sum --check --status
bash "$recovery_launcher" "$recovery_source" nonprod-recover "$@"
