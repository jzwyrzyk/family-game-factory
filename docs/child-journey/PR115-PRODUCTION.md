# PR115: release creation chat and failed-build recovery

This is the bounded production handoff for [PR115](https://github.com/jzwyrzyk/family-game-factory/pull/115). The owner authorized its merge and rollout on November 21, 2026. Source integration, image publication, backend delivery, an actual conversation, and the website cutover each need their own receipt. The [delivery record](../../DELIVERY-STATE.md) now records the completed merge and owner-reported successful backend rollout. The website cutover is now complete; actual conversation acceptance remains unverified.

**Updated release order, November 21, 2026:** while awaiting the Cloud Shell result, the owner directed website cutover immediately after successful backend deployment, followed by diagnosing and checking the actual conversation on the released interface. This supersedes this handoff's earlier requirement to complete the chat check before Pages. All required automated release checks remain. The later Cloud Build verifier stop was recovered through the [PR116 operator's](https://github.com/jzwyrzyk/family-game-factory/pull/116) explicit bridge below, retaining the original tool identity and private journal while executing a separately pinned corrected tool.

## Current deployment receipt — November 21, 2026

The owner returned **`PR115_BACKENDS_SERVING_CONTEXT_CHECK_REQUIRED`** for application `19f5e46ae1141da3df7bf14d682757de7e9aec69`, tested source `986a9118674e1bbd1d4b0873b1993dac245627e9`, existing successful build `5ef640d8-46a7-4bd5-ae41-d00e8296ed2c`, and archive SHA-256 `64f083f46259104023158bee92cd2cad1138f7a9bccb2c5480fc5c3e66a763c5`. Original tool `698c641188b1bf57378ea37d53bfe0073c20136b` remains in the journal; executing recovery tool `804574895d8ab86fe270e590ecfa05fa5d4bc290` is separately recorded. The gateway's pending read-only recovery message was followed by the successful receipt, without resubmitting the existing build or uncertain service operation.

That owner-supplied receipt reports coach `factory-coach-private-pr115-19f5e46ae114-fb5fa6` and gateway `factory-gateway-pr115-19f5e46ae114-fb5fa6` serving at 100%, with `paidExecution:true` and `conversationVerified:false`. The [canonical receipt](../../DELIVERY-STATE.md#november-21-2026--pr115-backends-serving-pages-cutover-in-progress) records both exact immutable images and retained rollback revisions. This session has not independently inspected authenticated Cloud Run configuration.

[Pages run44923270613](https://github.com/jzwyrzyk/family-game-factory/actions/runs/44923270613) was dispatched after that receipt at `2026-11-21T16:12:18Z` and completed successfully on exact `19f5e46ae1141da3df7bf14d682757de7e9aec69` source. The artifact build, all eight regression shards and deploy passed; the deployment action completed at `16:20:42Z` and its job at `16:20:44Z`. Independent public reads at `16:21:04Z` confirmed the exact release marker, clean same-SHA build information, reviewed remote service origins and ready/paid-enabled gateway health. **Website cutover is complete. Do not dispatch another release.** The bootstrap and recovery procedure below document the executed release and its retained recovery path.

The existing browser cache initially kept the old interface after reload. Reopening the site exposed **Update jems**; applying it kept the existing **My new idea** notebook visible and loaded the published `index-4GjIxcqx.js` bundle. Saved contents and record identities were not compared in this browser check. The updated creation view visibly showed **Build my game** disabled for an empty idea, with **Tell me your game idea first**. The reassessment control also existed. The private-parent dialog reported no active family workshop connection in this testing browser, so no real coach reply or paid build was attempted. Actual conversation and game acceptance remain the post-cutover checks in the owner's already-connected session; the [final delivery receipt](../../DELIVERY-STATE.md#november-21-2026--pr115-production-cutover-complete-live-conversation-still-unverified) records these evidence limits.

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

Use the exact three reviewed SHAs supplied with the release receipt. The following is the original bootstrap and deliberately retains one directory for that application source. A mismatched or dirty existing checkout stops instead of resetting it. **The observed release already has a successful build and an existing journal: continue through the recovery section below, not by replacing this bootstrap's tool pin or creating a new state directory.**

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

## Recover the existing successful build

The owner ran original operator `698c641188b1bf57378ea37d53bfe0073c20136b` against application `19f5e46ae1141da3df7bf14d682757de7e9aec69` and tested source `986a9118674e1bbd1d4b0873b1993dac245627e9`. The initial returned receipt reported build **`5ef640d8-46a7-4bd5-ae41-d00e8296ed2c` as `SUCCESS`**, journal build phase `attempted`, and **`serviceStagingStarted:false`**. The operator stopped at `BUILD_EXECUTION_OPTIONS_DIFFER` before staging either service. This historical interruption was subsequently recovered, and the website cutover completed as recorded above.

The planned machine, logging and timeout matched the actual build. The mismatch was Cloud Build's implicit `workerRelease:"legacy"` returned for an omitted selector; its additional empty pool was already normalized. The correction accepts only that implicit `legacy` value, preserving exact checks on any explicit worker selection. A server `artifacts.images` echo is accepted only when its complete object equals the declared image list; additional artifact fields or different/reordered images remain rejected. The comparator does not generally ignore execution options or artifact destinations.

Use the immutable recovery-tool pin supplied in the owner command to create a **separate clean checkout**, for example `tool-recovery-<full recovery-tool SHA>` alongside the original `tool` directory. Preserve the original tool checkout, application checkout and private `state` directory. Do not edit `release.json`, reset its phase or change the source, nonce, build, archive or candidate identities. The corrected tool requires the explicit flag below while using the same existing application and state paths:

```bash
python3 "$JEMS_RECOVERY_TOOL_DIR/scripts/deployment/release_services.py" \
  --reviewed-source-sha "$JEMS_APP_SHA" --tested-source-sha "$JEMS_TESTED_SHA" \
  --application-dir "$JEMS_APP_DIR" --state-dir "$JEMS_STATE_DIR" \
  --recover-build-from-tool 698c641188b1bf57378ea37d53bfe0073c20136b --execute
```

This bridge accepts only the exact original tool, application/tested sources and existing build above. It rejects a fresh journal, a prepared build or a changed build identity. It re-reads the successful build, exact source/archive/image evidence and current service baselines before recording separate recovery provenance and printing `PR115_EXISTING_BUILD_RECOVERY_VERIFIED`. It retains the original `tool` identity and never resubmits this build. The same recovery-tool checkout and flag can resume later recorded staging or promotion phases; an uncertain service operation is observed rather than submitted again. The intermediate recovery message is not a deployment receipt.

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

For the recovered original-`698c641` journal, use the same pinned recovery-tool checkout and retain `--recover-build-from-tool 698c641188b1bf57378ea37d53bfe0073c20136b` when changing `--execute` to `--rollback`.

Backend rollback does not undo saved browser data or publish a website. Older notebook readers reject saved creation-readiness fields, and old Pal readers can reject newly saved roster IDs. After new browser data exists, any frontend fallback needs a compatible reader or separately verified no-loss migration; restoring an old bundle alone is not a safe data rollback.

## Verification boundary

Local operator fixtures cover source/CI gates, full-template preservation, pinned secrets, configuration and IAM drift, staged versus active revisions, exact build provenance, interrupted submission/promotion, derived journal fields and reverse-order rollback. The budget fixtures use the real selected policy and validators to check cap rejection, valid arithmetic, adult approvals, source/dirty-checkout rejection, ambiguous key references and sanitized output. These tests make no cloud writes or provider calls. Hosted source checks and real owner execution must be recorded separately.

After the narrow Cloud Build correction, the complete local deployment suite passed **122 tests**, including **42 operator cases** and the Python adapter that executes **five Node budget fixtures**. The **42 operator cases also passed an independent rerun**. They cover the successful build still journaled as `attempted`, narrow legacy/artifact normalization, rejected mismatches, preserved original identities, no replacement submission, and interruptions around recovery adoption and service staging. The initial full-suite attempt lacked local `tsx`; restoring dependencies from an existing checkout with the identical lockfile resolved that environment failure before the passing rerun. These remain local executable checks; the later owner-supplied rollout receipt is recorded separately above.
