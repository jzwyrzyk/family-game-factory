#!/usr/bin/env bash
# Verify this file's checksum from the reviewed handoff before executing.
# Usage: bash operations-bootstrap.sh SOURCE_SHA {broker-build|broker-setup|nonprod|github} ARGS...
set -euo pipefail
[[ $# -ge 2 && "$1" =~ ^[0-9a-f]{40}$ ]] || { echo 'Expected immutable source SHA and lane.' >&2; exit 2; }
operations_sha="$1"
operations_lane="$2"
shift 2
case "$operations_lane" in
  broker-build) operations_script=build_request_broker.py ;;
  broker-setup) operations_script=bootstrap_request_diagnostics.py ;;
  nonprod) operations_script=setup_nonproduction.py ;;
  github) operations_script=github_operations.py ;;
  *) echo 'Unsupported operations lane.' >&2; exit 2 ;;
esac
operations_checkout="$(mktemp -d "${TMPDIR:-/tmp}/jems-operations.XXXXXXXX")"
trap 'rm -rf -- "$operations_checkout"' EXIT
git -C "$operations_checkout" init -q
git -C "$operations_checkout" remote add origin https://github.com/jzwyrzyk/family-game-factory.git
git -C "$operations_checkout" fetch --quiet --depth=1 origin "$operations_sha"
git -C "$operations_checkout" checkout --quiet --detach FETCH_HEAD
[[ "$(git -C "$operations_checkout" rev-parse HEAD)" == "$operations_sha" ]]
if [[ "$operations_lane" == github ]]; then
  python3 "$operations_checkout/scripts/ops/$operations_script" "$@"
else
  python3 "$operations_checkout/scripts/ops/$operations_script" --source-sha "$operations_sha" "$@"
fi
