#!/usr/bin/env bash
# Pinned Cloud Shell entry point for the separately approved PR124 coach rollout.
set -euo pipefail
umask 077

[[ $# == 3 && "$1" =~ ^[a-f0-9]{40}$ && "$2" =~ ^[a-f0-9]{40}$ ]] || {
  echo 'Usage: run_coach_diagnostics.sh OPERATOR_SHA MERGED_APPLICATION_SHA plan|execute|rollback' >&2
  exit 2
}
JEMS_COACH_TOOL_SHA="$1"
JEMS_COACH_SOURCE_SHA="$2"
JEMS_COACH_MODE="$3"
case "$JEMS_COACH_MODE" in plan|execute|rollback) ;; *) echo 'UNKNOWN_RELEASE_MODE' >&2; exit 2 ;; esac
JEMS_COACH_TESTED_SHA='5688bb3f6a01a766af8b78c783faccd8cce8f89c'
JEMS_COACH_DEPLOYED_SHA='19f5e46ae1141da3df7bf14d682757de7e9aec69'
JEMS_COACH_PRIMITIVES_SHA='804574895d8ab86fe270e590ecfa05fa5d4bc290'
JEMS_COACH_REMOTE='https://github.com/jzwyrzyk/family-game-factory.git'
JEMS_COACH_RELEASE_DIR="$HOME/jems-releases/coach-diagnostics-$JEMS_COACH_SOURCE_SHA"
JEMS_COACH_TOOL_DIR="$JEMS_COACH_RELEASE_DIR/tool-$JEMS_COACH_TOOL_SHA"
JEMS_COACH_APP_DIR="$JEMS_COACH_RELEASE_DIR/application-$JEMS_COACH_SOURCE_SHA"
JEMS_COACH_PRIMITIVES_DIR="$JEMS_COACH_RELEASE_DIR/primitives-$JEMS_COACH_PRIMITIVES_SHA"
JEMS_COACH_STATE_DIR="$JEMS_COACH_RELEASE_DIR/state"

JEMS_COACH_PROGRAMS=(git gcloud python3 flock)
if [[ "$JEMS_COACH_MODE" != rollback ]]; then JEMS_COACH_PROGRAMS+=(gh node npm); fi
for JEMS_COACH_PROGRAM in "${JEMS_COACH_PROGRAMS[@]}"; do
  command -v "$JEMS_COACH_PROGRAM" >/dev/null || { echo "REQUIRED_TOOL_MISSING_$JEMS_COACH_PROGRAM" >&2; exit 2; }
done
[[ ! -L "$JEMS_COACH_RELEASE_DIR" ]] || { echo 'RELEASE_DIRECTORY_MUST_NOT_BE_SYMLINK' >&2; exit 2; }
mkdir -p "$JEMS_COACH_RELEASE_DIR"
exec {JEMS_COACH_LOCK_FD}> "$JEMS_COACH_RELEASE_DIR/bootstrap.lock"
flock -n "$JEMS_COACH_LOCK_FD" || { echo 'COACH_RELEASE_ALREADY_RUNNING' >&2; exit 2; }

jems_coach_checkout() {
  local jems_dir="$1" jems_sha="$2" jems_head
  [[ ! -L "$jems_dir" ]] || { echo 'CHECKOUT_MUST_NOT_BE_SYMLINK' >&2; exit 2; }
  if [[ ! -d "$jems_dir/.git" ]]; then
    [[ "$JEMS_COACH_MODE" != rollback ]] || { echo 'ROLLBACK_REQUIRES_EXISTING_PINNED_CHECKOUTS' >&2; exit 2; }
    [[ ! -e "$jems_dir" ]] || { echo 'EXISTING_NONREPOSITORY_DIRECTORY' >&2; exit 2; }
    git init --quiet "$jems_dir"
    git -C "$jems_dir" remote add origin "$JEMS_COACH_REMOTE"
  fi
  [[ "$(git -C "$jems_dir" remote get-url origin)" == "$JEMS_COACH_REMOTE" ]] || { echo 'CHECKOUT_REMOTE_DIFFERS' >&2; exit 2; }
  [[ -z "$(git -C "$jems_dir" status --porcelain)" ]] || { echo 'CLEAN_CHECKOUT_REQUIRED' >&2; exit 2; }
  jems_head="$(git -C "$jems_dir" rev-parse --verify HEAD 2>/dev/null || true)"
  [[ -z "$jems_head" || "$jems_head" == "$jems_sha" ]] || { echo 'CHECKOUT_SOURCE_DIFFERS' >&2; exit 2; }
  if [[ "$jems_head" == "$jems_sha" ]]; then return; fi
  [[ "$JEMS_COACH_MODE" != rollback ]] || { echo 'ROLLBACK_REQUIRES_EXISTING_PINNED_CHECKOUTS' >&2; exit 2; }
  git -C "$jems_dir" fetch --quiet --no-tags --depth=1 origin "$jems_sha"
  git -C "$jems_dir" checkout --quiet --detach "$jems_sha"
  [[ "$(git -C "$jems_dir" rev-parse HEAD)" == "$jems_sha" ]] || { echo 'CHECKOUT_SOURCE_DIFFERS' >&2; exit 2; }
}

jems_coach_checkout "$JEMS_COACH_TOOL_DIR" "$JEMS_COACH_TOOL_SHA"
jems_coach_checkout "$JEMS_COACH_APP_DIR" "$JEMS_COACH_SOURCE_SHA"
jems_coach_checkout "$JEMS_COACH_PRIMITIVES_DIR" "$JEMS_COACH_PRIMITIVES_SHA"
if [[ "$JEMS_COACH_MODE" != rollback ]]; then
  git -C "$JEMS_COACH_TOOL_DIR" fetch --quiet --no-tags --depth=1 origin \
    "$JEMS_COACH_SOURCE_SHA" "$JEMS_COACH_TESTED_SHA" "$JEMS_COACH_DEPLOYED_SHA"
fi

# tsx is needed only for local, synthetic budget arithmetic. No install scripts run.
if [[ "$JEMS_COACH_MODE" != rollback ]]; then
  JEMS_COACH_DEPS_RECEIPT="$JEMS_COACH_RELEASE_DIR/dependencies-$JEMS_COACH_SOURCE_SHA.ready"
  if [[ ! -f "$JEMS_COACH_DEPS_RECEIPT" || ! -x "$JEMS_COACH_APP_DIR/node_modules/.bin/tsx" ]]; then
    rm -f "$JEMS_COACH_DEPS_RECEIPT"
    (cd "$JEMS_COACH_APP_DIR" && npm ci --include=dev --ignore-scripts --no-audit --no-fund)
    printf '%s\n' "$JEMS_COACH_SOURCE_SHA" > "$JEMS_COACH_DEPS_RECEIPT"
  fi
fi

JEMS_COACH_MODE_ARGS=()
case "$JEMS_COACH_MODE" in
  execute) JEMS_COACH_MODE_ARGS=(--execute) ;;
  rollback) JEMS_COACH_MODE_ARGS=(--rollback) ;;
esac
python3 "$JEMS_COACH_TOOL_DIR/scripts/deployment/release_coach_diagnostics.py" \
  --reviewed-source-sha "$JEMS_COACH_SOURCE_SHA" \
  --tested-source-sha "$JEMS_COACH_TESTED_SHA" \
  --application-dir "$JEMS_COACH_APP_DIR" \
  --primitives-dir "$JEMS_COACH_PRIMITIVES_DIR" \
  --state-dir "$JEMS_COACH_STATE_DIR" \
  "${JEMS_COACH_MODE_ARGS[@]}"
