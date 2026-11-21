#!/usr/bin/env bash
# PR108 only: recover/finish staging, promote, then start normal Pages.
set -euo pipefail
umask 077

JEMS_RELEASE_STATE="${1:?Supply the existing private PR108 staging directory.}"
JEMS_SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
JEMS_REPO='jzwyrzyk/family-game-factory'
JEMS_APP_SOURCE='c43a18148421ea22edfba5f7e891530678ad4f4f'
JEMS_ATTEMPT="$JEMS_RELEASE_STATE/pages-dispatch.attempted.json"

test -d "$JEMS_RELEASE_STATE"

if [[ -e "$JEMS_ATTEMPT" ]]; then
  echo 'A Pages dispatch was already attempted. Listing runs; no backend change or second dispatch.'
  gh run list --repo "$JEMS_REPO" --workflow pages.yml --event workflow_dispatch \
    --limit 8 --json databaseId,headSha,createdAt,status,conclusion,url
  exit 0
fi

# Check the existing authenticated GitHub route and the reviewed workflow before
# any backend switch. The application source remains independently pinned.
JEMS_PAGES_BLOB="$(gh api "repos/$JEMS_REPO/contents/.github/workflows/pages.yml?ref=main" --jq '.sha')"
JEMS_REGRESSIONS_BLOB="$(gh api "repos/$JEMS_REPO/contents/scripts/deployment/regressions.py?ref=main" --jq '.sha')"
[[ "$JEMS_PAGES_BLOB" == '829f5995de534cd308608d9347f1b7c26c32993d' ]] || {
  echo 'Reviewed Pages workflow changed; no backend switch or dispatch attempted.'; exit 2;
}
[[ "$JEMS_REGRESSIONS_BLOB" == '6860d1c3fc4d454ec30b6cde7079bd4853536040' ]] || {
  echo 'Reviewed Pages regression helper changed; no backend switch or dispatch attempted.'; exit 2;
}

# Staging expects the original traffic. Once promotion has started, its own
# journal safely recovers a partial coach/gateway switch without restaging.
if [[ ! -e "$JEMS_RELEASE_STATE/factory-coach-private.promotion.json" &&
      ! -e "$JEMS_RELEASE_STATE/factory-gateway.promotion.json" ]]; then
  python3 "$JEMS_SCRIPT_DIR/pr108_stage.py" \
    --state-dir "$JEMS_RELEASE_STATE" --execute
fi

python3 "$JEMS_SCRIPT_DIR/pr108_promote.py" \
  --state-dir "$JEMS_RELEASE_STATE" --execute

# A successful promotion exit proves both current routes and canonical health.
# No paid/model or manual conversation hold occurs before dispatch.
gh run list --repo "$JEMS_REPO" --workflow pages.yml --event workflow_dispatch \
  --limit 20 --json databaseId,headSha,createdAt,status,conclusion,url \
  > "$JEMS_RELEASE_STATE/pages-before.json"

# Record the attempt atomically BEFORE the remote POST. If its response is lost,
# subsequent invocations list runs instead of starting a duplicate release.
(
  set -o noclobber
  printf '{"sourceSha":"%s","attemptedAt":"%s"}\n' \
    "$JEMS_APP_SOURCE" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$JEMS_ATTEMPT"
)

echo 'Backends verified. Starting the normal website release now.'
gh workflow run pages.yml --repo "$JEMS_REPO" --ref main \
  -f "source_sha=$JEMS_APP_SOURCE" \
  -f gateway_origin=https://factory-gateway-ola734esta-ul.a.run.app \
  -f preview_origin=https://factory-preview-ola734esta-ul.a.run.app

echo 'PAGES_DISPATCH=ACCEPTED; publication follows the normal automated checks.'
gh run list --repo "$JEMS_REPO" --workflow pages.yml --event workflow_dispatch \
  --limit 5 --json databaseId,headSha,createdAt,status,conclusion,url
