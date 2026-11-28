#!/usr/bin/env bash
# Download this file from the reviewed commit and verify its SHA-256 before running.
# Usage: bash helper SOURCE_SHA IMMUTABLE_IMAGE [--check | --apply --approve-plan-sha256 HASH]
set -euo pipefail
[[ $# -ge 2 && "$1" =~ ^[0-9a-f]{40}$ ]] || { echo 'Expected immutable source SHA and image digest.' >&2; exit 2; }
source_sha="$1"
image_digest="$2"
shift 2
setup_checkout="$(mktemp -d "${TMPDIR:-/tmp}/jems-diagnostics.XXXXXXXX")"
trap 'rm -rf -- "$setup_checkout"' EXIT
git -C "$setup_checkout" init -q
git -C "$setup_checkout" remote add origin https://github.com/jzwyrzyk/family-game-factory.git
git -C "$setup_checkout" fetch --quiet --depth=1 origin "$source_sha"
git -C "$setup_checkout" checkout --quiet --detach FETCH_HEAD
[[ "$(git -C "$setup_checkout" rev-parse HEAD)" == "$source_sha" ]]
python3 "$setup_checkout/scripts/ops/bootstrap_request_diagnostics.py" \
  --source-sha "$source_sha" --image "$image_digest" "$@"
