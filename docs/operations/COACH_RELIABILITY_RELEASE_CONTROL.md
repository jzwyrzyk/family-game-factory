# Coach, reliability and storage release control

This record covers the owner-authorized integration of PR135 and PR123, preservation of components PR118–122, storage integrity review, Cloud Shell cleanup assessment and superseded documentation reconciliation. It does not authorize production deployment, paid activation, IAM changes, storage migration, PR106 or the isolated DEV environment.

## Source gate and merge receipts

Source integration and final hosted checks are in progress. Starting protected main: `3a6fcca34b2e9d15bb2d6596153069db57056a04`. PR134 and PR136 were already merged and have not been reopened or repeated. Final merge identities and tested trees will be recorded before publishing this report.

## Storage acceptance and remaining F06 work

PR123 preserves authoritative owner/head checks, immutable revisions, linked full conversation history, exact backups and recovery, conservative pending Build identities and compensation that only removes unchanged writes owned by the failed operation. The [five-component matrix and F06 implementation plan](../child-continuity/RELIABILITY-2026-11-23.md) records each implementation, overlap, test, storage contract and rollback limitation; final hosted evidence accompanies the merge receipts.

F06 remains **partial**. Archiving hides work and does not free capacity. Synchronous compensation is not crash-atomic cross-key storage. Retention/deletion policy, durable cross-store creation/copy journals, profile-copy capacity, remote-copy reconciliation and atomic response persistence remain separately gated. A response can exceed remaining design capacity or quota after an earlier preflight; never replay paid inference merely because the reply or save was lost. Existing data and drafts must remain recoverable.

The optional PR13 private artifact adapter and Firestore encoding remain compatible; no bucket, IAM, adapter activation or child-data migration was performed. Artifact hashes, bounded payloads, legacy inline reads and exact metadata/references are covered by the integrity tests. Dropping a reference is not blob garbage collection. Adapter activation and retention policy remain separate decisions.

## Superseded documentation evidence

PR87 and PR117's unique historical receipts are preserved in the [receipt archive](../evidence/pr87-pr117-historical-receipts.md), including original immutable source links, Pal publication evidence, exact image-byte verification and incomplete live UAT. Newer main's architecture, source history and release instructions remain authoritative. Original branches are retained.

## Cloud Shell cleanup — blocked, not completed

Operational/API observations in this section were collected November 23, 2026, around 12:30 a.m. America/New_York (`2026-11-23T05:30Z`). They are dated metadata checks, not continuous live monitoring.

The deployment/API and access observations were refreshed at `2026-11-23T06:16:30Z` (1:16:30 a.m. America/New_York): Pages deployment/source/run, private worker source/pin, inaccessible worker variable, blocked website/Cloud Shell routes and unavailable cloud identity/configuration were unchanged. The workspace disk/inode figures below remain the earlier measurement.

The selected Codex workspace is a different environment from the owner's historical 4.8 GB Cloud Shell home volume. Its `/workspace` filesystem measured 63 GB total, 2.1 GB used, 58 GB available (4%); inode total 4,194,304, used 8,114, free 4,186,190 at this check. These are **not** Cloud Shell before/after measurements. The root's earlier workspace observation was about 60 GB available before worktrees/dependencies, not a Cloud Shell cleanup result.

Exact access evidence:

- Cloud environment status reports no configured secrets, runtime variables or outbound identities.
- `gcloud` is absent from PATH, although an SDK is already installed at `/workspace/.family-game-factory-tools/google-cloud-cli-594.0.0/bin/gcloud`. The repository's read-only `python3 scripts/ops/diagnose.py --self-check --json` exited 2 with `GCLOUD_NOT_INSTALLED`; it reported zero mutations and `identity_account_verification: not_verified`. Follow-up normal read-only calls to that exact installed binary (`auth list --filter=status:ACTIVE --format=value(account)` and `config get-value project`) both failed because `/home/agent/.config/gcloud` is on a read-only filesystem and gcloud could not initialize its normal credentials database/log directory. No active account or project was returned. No tokens/configuration contents were printed or default configuration changed.
- Cloud desktop inventory contained no existing Chrome tabs or authenticated Cloud Shell session. Opening `https://shell.cloud.google.com/` failed before navigation with `Browser Use could not read requirements`; the resulting tab remained blank. No Cloud Shell command was entered.
- An ordinary HTTPS request to that exact Cloud Shell origin failed at the configured proxy: `CONNECT tunnel failed, response 403` / HTTP status `000`. This is a workspace connectivity restriction, not evidence of a Google account denial, site outage or bot block.

Actual Cloud Shell disk, inode, process, repository/worktree, file ownership, recoverability and active-reference state therefore remain unmeasured. Files removed: **none**. Bytes recovered: **not measured; no cleanup performed**. All operational journals and rollback records were left untouched; continued existence/integrity on the inaccessible Cloud Shell cannot be freshly attested.

### Concrete inventory handoff

Reuse the existing reviewed helper from immutable repository commit `a035e4dfc5a28fb1018c624ba7693dea3c4608ab`, without merging that operations branch:

- Helper: `scripts/deployment/inspect_jems_storage.py`.
- SHA-256: `fa4b93a33c1cccfe9be74f14bc9fffe85d1b092647943f380d93ac3decabbc31`.
- Instructions: `docs/operations/CLOUD_SHELL_STORAGE_REVIEW.md` at that commit.
- Validation rerun here: **16/16 offline fixtures passed** with `python3 -B check_jems_storage_audit.py`. Cases cover redaction, read-only Git/index metadata, symlinks/mounts/hardlinks, external-filter suppression, shared worktrees, dirty/stashed/unknown work, release journals, active references, and explicit truncation. This tests the helper, not Cloud Shell contents.
- The exact read-only wrapper is included below. It creates an owner-only `/tmp/jems-storage-audit.*` directory, downloads and checks the immutable helper, prints actual disk/inode usage, then writes a sanitized private metadata report there. It does not delete anything. Preserve its full report and return only the sanitized terminal block; inspect retained sections where terminal truncation is nonzero.

The helper scans all accessible HOME entries and owner-controlled `jems*`/`factory*` temporary entries, records sizes, Git dependency information and process references, preserves opaque private/configuration/history areas, and classifies `KEEP`, `REGENERABLE_CANDIDATE_REVIEW`, `CHECKOUT_REVIEW`, `UNKNOWN_KEEP`. Keep the complete inventory, ordinary path metadata and private recovery evidence out of this public repository. The sanitized terminal summary excludes content and sensitive names but does not anonymize every ordinary path; review it before sharing. Classification is advisory. Before an exact candidate can be removed, verify its absolute resolved path, owner, symlink/mount status, tracked/untracked/ignored content, current open/cwd/process references, remote publication and reproducibility, and that no journal/receipt/rollback or shared-object dependency uses it. Missing visibility, unknown files, stale cached refs or race observations require KEEP. Re-run disk/inode measurements and integrity checks after any later authorized narrow cleanup.

Preservation checklist carried from existing evidence, with no current existence claim:

- Entire unresolved `~/jems-releases/coach-diagnostics-b4734b1323de87dfee96bb91769cbab3cff432e6/`, including `bootstrap.lock`, `state/release.lock`, `state/release.json` if present. Empty lock files still preserve serialization identity.
- `/tmp/jems-coach-lowspace-*`, `/tmp/jems-coach-recovery.*`, `/tmp/jems-chat-rollout.*` (including the referenced `jems-chat-rollout.qfgeyx` Node provider).
- `/tmp/jems-access-recovery.CbqLURFt/verification.json`: historical read-only verify receipt, temporary not durable off-machine archival. Do not replay `apply-gcp` to reconstruct it.
- Original PR115 private state, journal identity, rollback provenance, linked application worktree and original tool checkout/shared Git objects.
- `jems-access-review.*`, `jems-gateway-repair-tool-*`, `jems-service-release-*`: candidates only for detailed review, never disposable by name or size.
- Credentials, auth/config directories, personal history, unknown data and private child/application data stay private and preserved. No broad cache prune, `git clean`, Git GC or recursive home/tmp cleanup.

## Published website evidence

GitHub Pages API reports `status: built`, workflow-based publication and HTTPS enforcement. Latest deployment is `7967192841`, source `6cc9c3801ccb7ae53d8eb9f708ae851699ac3f2d`, created `2026-11-21T17:59:53Z`, successful at `2026-11-21T18:00:16Z` (November 21, 1:00:16 p.m. America/New_York). Environment URL: `https://jzwyrzyk.github.io/family-game-factory/`.

The corresponding successful [Pages run44932334132](https://github.com/jzwyrzyk/family-game-factory/actions/runs/44932334132) includes build, all eight regression shards and deploy. The actual [build job136931468865](https://github.com/jzwyrzyk/family-game-factory/actions/runs/44932334132/job/136931468865) emitted `PAGES_BUILD_SOURCE_VERIFIED=6cc9c3801ccb7ae53d8eb9f708ae851699ac3f2d`; the workflow asserts clean `build-info.json` and stamps `jems-release.json`. This distinguishes the selected application source from merely the workflow head. [Deploy job136933666456](https://github.com/jzwyrzyk/family-game-factory/actions/runs/44932334132/job/136933666456) and deployment-status API agree on success.

The current Pages run inventory contains no later publication. Deployment API returned zero records for four-experience merge `afa5251cde97fda1865e42dbaed5fae08a2a4061` and starting main `3a6fcca34b2e9d15bb2d6596153069db57056a04`. The release source predates PR134 and is not its descendant. Therefore **PR134's four-experience release is not in the latest GitHub-recorded production Pages deployment**.

Direct retrieval of production `build-info.json` was blocked by the workspace proxy (`CONNECT ... 403`, status `000`). The live CDN bytes and current rendered product cannot be independently attested from this environment. Do not label deployment metadata as a fresh live-browser smoke. Separate private Sites previews are not the production Jems Pages deployment.

The current Pages workflow is manual `workflow_dispatch` with an exact merged source SHA and two exact production origins. Source merges do not automatically deploy. No workflow was dispatched by this review.

## Gateway, private coach, worker and acceptance boundaries

Live Cloud Run revision/image/traffic identities and configuration are unverified because no approved managed GCP identity is configured and the installed SDK's normal configuration path is inaccessible. No backend compatibility claim is inferred from merged code or historical serving receipts.

Source rollout dependencies:

1. Coach v2 requires compatible gateway validators, private coach and web app. Deploy and verify the compatible backends before the dependent frontend. Old gateway/executor versions reject new creation context; old replies without valid readiness must not authorize Build. Preserve selected-helper attribution/compiler support in rollback.
2. Reliability needs the additive authenticated read-only admitted-request lookup on the gateway before frontend recovery uses it. Unknown paid outcomes must remain conservative, with no automatic paid POST replay.
3. The gateway implements fixed worker phase/whole-job leases and idempotent report receipts while preserving the old worker callback shape. The worker CLI’s bounded heartbeat, transport and identical-report retries additionally require a separately reviewed private worker release and pin rotation, with retained source/image/rollback receipts. An unchanged old worker does not gain those CLI protections from a gateway or public-source merge.
4. New notebook readiness/chapter/pending-request metadata needs compatible rollback readers; pre-change strict readers can reject new records. Preserve full conversations, selected-helper provenance and pending identities rather than stripping fields for rollback. Broader migrations/cloud storage activation remain separately gated.

Retain compatible gateway/worker versions on rollback, or drain all in-flight generation/test/review and coach/audio work before returning to older versions. The old coordinator ignores fixed deadlines and cannot reproduce repair-report receipts; old coach/audio completions lack `reservationId` fencing. Do not overlap those completions with new recovery, erasure or reused receipt identities. Preserve tombstones, accounting and rollback evidence; no uncertain paid request may be replayed.

Refreshed private worker Git main is `dddf53dbc76796be19782c1bb5bbb99b86e99909`; its workflow source still explicitly checks out public `b472c224f7e8ef8ab0986ce6f755728d7cc63d46`. The owner-controlled `FACTORY_PRIVATE_WORKER_SHA` variable read returned GitHub 403 `Resource not accessible by integration`, so its current configured value and all effective WIF/activation conditions remain unverified. Recent successful worker workflow records do not establish a current pin/configuration or product acceptance. No workflow was dispatched or worker checkout changed beyond read-only fetch of remote history.

The requested actual adult **Build → Review → Play → Keep → Reload** acceptance was not run: no paid Build was authorized for this assessment, live site access is blocked, and service identities cannot be confirmed. Fixture browser suites and historical workflow passes must remain labeled as synthetic-service evidence. A later operational release requires approved service deployment/pin and source selection, authenticated protocol and rollback verification, and separately authorized bounded adult/live-provider acceptance. Physical-device audio/fullscreen, real-model coach quality, observed-child usability and learning efficacy are not established by this source work.

## Read-only Cloud Shell inventory command

Run only in the intended authenticated Cloud Shell. It downloads the immutable helper, checks its hash and records private metadata; it contains no deletion or production action.

```bash
#!/usr/bin/env bash
# Run in the intended Google Cloud Shell, not the Codex workspace.
# Downloads a hash-pinned, reviewed metadata inventory and writes its report only
# to a new owner-only /tmp directory. Does not delete or change source/config/data.
set -euo pipefail
umask 077
JEMS_STORAGE_AUDIT_DIR="$(mktemp -d /tmp/jems-storage-audit.XXXXXXXX)"
JEMS_STORAGE_AUDIT_SHA='a035e4dfc5a28fb1018c624ba7693dea3c4608ab'
JEMS_STORAGE_AUDIT_HASH='fa4b93a33c1cccfe9be74f14bc9fffe85d1b092647943f380d93ac3decabbc31'
curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' \
  "https://raw.githubusercontent.com/jzwyrzyk/family-game-factory/${JEMS_STORAGE_AUDIT_SHA}/scripts/deployment/inspect_jems_storage.py" \
  --output "$JEMS_STORAGE_AUDIT_DIR/inspect_jems_storage.py"
printf '%s  %s\n' "$JEMS_STORAGE_AUDIT_HASH" "$JEMS_STORAGE_AUDIT_DIR/inspect_jems_storage.py" | sha256sum --check --strict
date -u +%Y-%m-%dT%H:%M:%SZ
df -h -- "$HOME" /tmp
df -i -- "$HOME" /tmp
python3 -B "$JEMS_STORAGE_AUDIT_DIR/inspect_jems_storage.py" \
  --output-dir "$JEMS_STORAGE_AUDIT_DIR"
printf 'PRIVATE_INVENTORY_DIRECTORY=%s\n' "$JEMS_STORAGE_AUDIT_DIR"
# Retain the report. Review every candidate and all truncated/unknown metadata
# before proposing any cleanup. No deletion command is included intentionally.
```

## Exact remaining operational gates

| Next action | Authorization / blocker | Completion evidence |
| --- | --- | --- |
| Intended Cloud Shell inventory and narrow cleanup | Already authorized by this assignment; blocked by unavailable authenticated access. No renewed cleanup approval is needed for verified disposable material within that scope. | Private full inventory; exact candidate paths/owners/references/recoverability; removal receipt; actual disk/inode before and after; journal/worktree integrity. |
| Read current production identities | Read-only review already authorized; approved existing GCP identity/usable CLI configuration, worker-variable access and live-site route unavailable here. Do not expand IAM merely to obtain visibility. | Actual Cloud Run revision/image/traffic and configuration metadata, effective worker pin, live release marker and retained receipts. |
| Release compatible services and frontend | Separate production release authorization required. Choose immutable reviewed sources/images, preserve identities/configuration/budgets and approve staged rollout plus rollback. | Compatible gateway/private coach before dependent frontend; all exact-source release shards; actual serving and published source receipts. |
| Change private worker source/workflow pin | Separate reviewed worker release authorization required; current pin stays unchanged. | Workflow/source/trust/image compatibility, drain or safe in-flight transition, bounded transport/report acceptance and rollback evidence. |
| Adult Build → Review → Play → Keep → Reload | Separate bounded paid UAT authorization with provider/spend limits required. | Actual admitted request, accepted review, playable result, explicit Keep and exact reload/ownership evidence. |
| Broader F06 architecture or optional cloud storage | Separate retention/design/implementation/activation or migration gate. | Versioned no-loss storage and rollback design, fault injection at every write boundary, capacity/uncertain-copy tests and exact backup/restore before rollout. |

No production release, paid request, IAM/bucket change, data migration or deletion of uncertain material was performed by this assignment. Synthetic browser viewports do not establish physical-device behavior; fixture providers do not establish model quality, child comprehension or educational efficacy.
