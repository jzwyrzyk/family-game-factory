# PR115: release creation chat and failed-build recovery

This is the bounded production handoff for [PR115](https://github.com/jzwyrzyk/family-game-factory/pull/115). The owner authorized its merge and rollout on November 21, 2026. Source integration, backend delivery, an actual conversation, and the website cutover each need their own receipt. The operator below does not claim that any of them has already happened.

**Updated release order, November 21, 2026:** while awaiting the Cloud Shell result, the owner directed website cutover immediately after successful backend deployment, followed by diagnosing and checking the actual conversation on the released interface. This supersedes this handoff's earlier requirement to complete the chat check before Pages. The [PR116 operator](https://github.com/jzwyrzyk/family-game-factory/pull/116), its existing recovery journal and all required automated release checks remain unchanged.

## Release scope

Update the gateway and private coach from the exact reviewed application source, preserving their currently serving configuration. After the successful backend receipt, proceed directly to the selected-source Pages release with its required automated checks. Check the authenticated creation conversation after website cutover. Preserve the newer PR112 gateway repair and any subsequently merged Pal packaging dependencies. The existing generation worker, sandbox, preview service, permissions, approvals, model, token limits, spending limits and numeric secret versions remain outside this image-only update.

The earlier PR109 release pins PR108 and must not be replayed over the newer gateway. The PR113 gateway-only operator pins the older coach, so it cannot coordinate this two-service change.

## Immutable inputs and prerequisites

The release uses three full commit SHAs:

- **Application source:** the merged PR115 source, or a separately verified combined source if a concurrent change has landed. It must remain in protected main's history with no newer service-source changes left out.
- **Tested source:** the successful exact-tree CI source. PR115 was tested at `986a9118674e1bbd1d4b0873b1993dac245627e9`, tree `d2adea3eec77eff3ed6782936356bcbbc4afb70d`. A different combined tree needs its own tested source.
- **Operator source:** the immutable reviewed commit containing this handoff and its release helper. Pin this independently of the application.

Use the existing authenticated owner Cloud Shell with `gcloud`, `gh`, Git, Python 3.12 or later, and Node 22. The script requires the already approved Cloud Build and Cloud Run permissions. It creates no account, grant, API enablement, credential, secret version or provider approval. The assistant workspace used for this handoff had working GitHub connector access, but no authenticated Google Cloud CLI identity; its Cloud Console browser route returned an access error.

The tool and application checkouts must be clean and pinned. Install the application's lockfile dependencies with `npm ci --ignore-scripts --no-audit --no-fund`. Use a stable private state directory outside both checkouts, with mode `0700`. Retain that same directory across interrupted attempts; it contains private configuration metadata and must not be pasted into chat or committed.

## What the operator checks and changes

[`release_services.py`](../../scripts/deployment/release_services.py) defaults to a read-only remote plan. It checks repository/project identity, protected-main ancestry, exact tested-tree equality, completed successful required CI, and current service source before allowing writes. It snapshots each service's settled 100% traffic revision, full template, IAM and pinned active secret references. It resolves the gateway's consumed configuration mount and verifies its private-coach origin against the coach's audience and approved gateway caller. It reads that gateway config in memory without printing or saving its contents.

The [budget helper](../../scripts/deployment/coach_release_budget.cjs) imports policy, schema, validation and approval rules from the selected application checkout. It evaluates the actual serving coach settings without a provider request or secret-key read. The allowance must fit the fixed policy/schema/envelope/output reservation and the synthetic first-turn context. A failure stops before Cloud Build and prints only allowlisted arithmetic and fixed reason codes. It never raises a spending limit to make a check pass. This calculation does not establish model connectivity, and a real second-turn context includes the actual first reply.

With `--execute`, one journaled Cloud Build publishes gateway and coach images from the deterministic application archive. Both images are loaded as non-root without network access. The operator verifies the exact build steps, source identity, immutable image digests and registry receipts. It stages both revisions at zero traffic, then promotes **coach first, gateway second**, retaining previous revisions. Every service write uses the observed resource version, validates its request and rechecks the peer/configuration before mutation. Any concurrent drift stops the operation.

Before each attempted mutation, the private journal is written atomically. An interrupted submission is recovered from its unique build identity or observed service state; an uncertain operation is not submitted again. Loaded journals are checked against derived source/candidate/configuration fields, and recorded Cloud Build/image provenance is re-read before further normal writes. A same-command resume may perform a later, not-yet-attempted phase after the earlier phase is verified.

## Stable Cloud Shell bootstrap

Use the exact three reviewed SHAs supplied with the release receipt. The following bootstrap deliberately retains one directory for that application source. A mismatched or dirty existing checkout stops instead of resetting it.

```bash
(
  set -euo pipefail
  umask 077
  JEMS_APP_SHA='<full merged application SHA>'
  JEMS_TESTED_SHA='<full tested same-tree SHA>'
  JEMS_TOOL_SHA='<full reviewed operator SHA>'
  JEMS_RELEASE_DIR="$HOME/jems-releases/pr115-$JEMS_APP_SHA"
  JEMS_TOOL_DIR="$JEMS_RELEASE_DIR/tool"
  JEMS_APP_DIR="$JEMS_RELEASE_DIR/application"
  JEMS_STATE_DIR="$JEMS_RELEASE_DIR/state"
  mkdir -p "$JEMS_RELEASE_DIR"
  if [ ! -d "$JEMS_TOOL_DIR/.git" ]; then
    test ! -e "$JEMS_TOOL_DIR"
    git clone --filter=blob:none --no-checkout \
      https://github.com/jzwyrzyk/family-game-factory.git "$JEMS_TOOL_DIR"
    git -C "$JEMS_TOOL_DIR" fetch --no-tags origin \
      "$JEMS_TOOL_SHA" "$JEMS_APP_SHA" "$JEMS_TESTED_SHA"
    git -C "$JEMS_TOOL_DIR" checkout --detach "$JEMS_TOOL_SHA"
  fi
  test "$(git -C "$JEMS_TOOL_DIR" rev-parse HEAD)" = "$JEMS_TOOL_SHA"
  test -z "$(git -C "$JEMS_TOOL_DIR" status --porcelain)"
  if [ ! -e "$JEMS_APP_DIR" ]; then
    git -C "$JEMS_TOOL_DIR" worktree add --detach "$JEMS_APP_DIR" "$JEMS_APP_SHA"
  fi
  test "$(git -C "$JEMS_APP_DIR" rev-parse HEAD)" = "$JEMS_APP_SHA"
  test -z "$(git -C "$JEMS_APP_DIR" status --porcelain)"
  (cd "$JEMS_APP_DIR" && npm ci --ignore-scripts --no-audit --no-fund)
  python3 "$JEMS_TOOL_DIR/scripts/deployment/release_services.py" \
    --reviewed-source-sha "$JEMS_APP_SHA" --tested-source-sha "$JEMS_TESTED_SHA" \
    --application-dir "$JEMS_APP_DIR" --state-dir "$JEMS_STATE_DIR" --execute
)
```

Omit `--execute` for a remote-read-only plan. The executing form is covered by the owner's release authorization; it does not require a second approval merely because it uses a helper. If a command fails, preserve the same directories and report its sanitized fixed error or status. Do not start a fresh journal to bypass an uncertain attempt or a failed configuration/source gate.

A successful backend result is `PR115_BACKENDS_SERVING_CONTEXT_CHECK_REQUIRED`. It includes exact source/build/image/revision/rollback identities and truthfully retains `conversationVerified:false` and `pagesDispatched:false`. The receipt name is unchanged in the already pinned helper; under the owner's updated order, its outstanding conversation check follows Pages cutover. Share that sanitized result, not `release.json`, SDK credential output, private configuration, passphrases or session headers.

## Website cutover

After the successful backend receipt, inspect current main, related PRs and running/pending Pages runs again, then proceed to the authorized website release. A concurrently merged Pal change must be preserved; the manual workflow serializes releases but does not itself prevent an older selected source from becoming the final website. Resolve the combined source and any changed service archive before dispatching.

Dispatch `.github/workflows/pages.yml` on `main` once, using the full merged reviewed `source_sha`, gateway origin `https://factory-gateway-ola734esta-ul.a.run.app`, and preview origin `https://factory-preview-ola734esta-ul.a.run.app`. Recover an uncertain dispatch by finding its existing run instead of dispatching again. The exact-source artifact build and all eight complete regression shards must pass before deploy. Then verify the public release marker and build information identify that exact clean source and the correct origins.

## Conversation and game checks after cutover

Use the existing authorized adult profile through the released Jems interface. The chat check is post-cutover acceptance, not an additional prerequisite for the authorized Pages release. A health response does not establish actual conversation success. Require the authenticated coach status to report available before spending either bounded synthetic turn.

1. Send one complete synthetic idea: **I tilt a sleepy owl to keep it balanced on a branch while its lantern charges. If the owl falls, the round ends.**
2. Only after a validated model response, inspect its readiness and wording. It should recognize a playable first version, retain the chosen action/stakes and avoid another optional-detail interview. Then send the explicit correction: **Make the owl a sleepy fox instead; keep the same balancing game and lantern.** Verify that the correction is retained without losing the mechanic.

Use at most these two explicit metered admissions within the existing allowance. Stop the chat check after the first unavailable, refused, malformed, timed-out or indeterminate reply; do not automatically repeat a POST. There is no game Build in this chat check. Record source/revision, authenticated status, validated model mode/readiness, observed continuity and outcome without credentials or private transcripts. Diagnose any failed connection on the released interface while preserving existing access, permissions and spending limits.

On the released interface, verify actual connected chat, readiness, visible Build, and an explicit bounded build/recovery journey. A successful fixture, health check, image deployment or chat turn alone does not close [issue93](https://github.com/jzwyrzyk/family-game-factory/issues/93): its real Build → Review → Play → Edit/Keep → Reload continuity remains separate evidence. Append the observed receipts to [Delivery state](../../DELIVERY-STATE.md).

## Rollback and interruption

Run the same pinned operator with the same source, tested source, application directory and private state directory, replacing `--execute` with `--rollback`. This performs traffic rollback **gateway first, coach second**, verifying the previous active revision before proceeding. It requires the original private journal and cloud authority, but no fresh CI, image build, npm installation or healthy coach endpoint. It does not reset configuration or silently retry a failed rollout. After rollback the journal rejects automatic re-promotion.

Backend rollback does not undo saved browser data or publish a website. Older notebook readers reject saved creation-readiness fields, and old Pal readers can reject newly saved roster IDs. After new browser data exists, any frontend fallback needs a compatible reader or separately verified no-loss migration; restoring an old bundle alone is not a safe data rollback.

## Verification boundary

Local operator fixtures cover source/CI gates, full-template preservation, pinned secrets, configuration and IAM drift, staged versus active revisions, exact build provenance, interrupted submission/promotion, derived journal fields and reverse-order rollback. The budget fixtures use the real selected policy and validators to check cap rejection, valid arithmetic, adult approvals, source/dirty-checkout rejection, ambiguous key references and sanitized output. These tests make no cloud writes or provider calls. Hosted source checks and real owner execution must be recorded separately.
