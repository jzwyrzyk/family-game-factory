# Operational activation recovery

November 26, 2026. This supplements [permanent setup](PERMANENT_CLOUD_SETUP.md).
It does not approve deletion or regenerate any saved Terraform plan.

## Consolidated partial-activation and disk recovery

Use the current reviewed immutable tooling SHA and its launcher checksum from the
PR #222 handoff. The `recovery` lane performs only reads and private local receipt
writes. It independently collects:

- The exact view's recent CreateView Admin Activity failures, plus matching existing
  gcloud error lines. Exact messages stay private; output contains redacted diagnostic
  vocabulary, hints and hashes, never whole logs, credentials or request payloads.
- Fresh source/build/registry and infrastructure checks. Successful inventory reuses
  only exact accounts/role/pool/provider/binding configurations and prepares the
  remaining actions. The prior INVALID_ARGUMENT remains an explicit apply blocker;
  a new plan hash alone is not permission to repeat creation.
- The existing source-file cleanup dry-run, now including bounded suffixed checkout
  names; and a separate capacity plan for Git packs/dependencies.
- Integrity of the original nonproduction binding, saved binary plan and approval
  hash, without invoking Terraform or modifying state. Supply `--nonprod-state-dir`
  if the original durable directory differs from `$HOME/work/jems-nonprod-state`.

```sh
bash "$p" "$r" recovery --home-dir "$HOME" \
  --receipt-dir "$HOME/work/jems-recovery-review"
```

Administrator readback at `057daa43ab9c2f4da5510f6987b0c3743e8cce98` verified the
first six resources/bindings and left four remaining actions. Preserve all partial
resources. Audit reading was unavailable and local evidence did not identify the
provider rejection. The revised reader selects the protobuf Any payload at its
LogEntry boundary, reports sanitized HTTP failures, and also examines bounded SDK
JSON errors. This is a diagnostic correction, not a confirmed failure diagnosis. Google
[flexible-filter documentation](https://docs.cloud.google.com/logging/docs/logs-views#filters)
and the older [REST filter description](https://docs.cloud.google.com/logging/docs/reference/v2/rest/v2/projects.locations.buckets.views)
differ. Do not infer that dropping OR, labels or service restrictions is permitted.
No log view, bucket or sink is created as a syntax experiment. Keep the original
image unless actual provider evidence establishes that its embedded exact-filter
contract must change; such a change needs a reviewed source diff, new build
approval and complete new immutable-image qualification.

Log-view [getIamPolicy](https://docs.cloud.google.com/logging/docs/reference/v2/rest/v2/projects.locations.buckets.views/getIamPolicy)
is POST with a JSON options body, not GET. setIamPolicy remains POST with fresh
etag/exact grants. Cloud Run uses service-level min/max annotations separately
from revision-level minimum/CPU-throttling annotations; readiness also requires
observed generation and intended traffic. These tooling corrections do not rebuild
the broker.

## Capacity recovery beyond source files

The `capacity` lane creates private exact plans and does nothing destructive by
itself. It recognizes only `jems-releases` and the known `jems-access-review`,
`jems-gateway-repair-tool`, `jems-service-release` families with bounded generated
suffixes. Registered linked-worktree groups can now be inventoried when the common
Git directory and every registered checkout exist within the approved historical
families. Their pointer/backpointer, registration and layout are checked; common
objects are counted once and all indexes, refs and reflogs are preserved. A missing,
active or out-of-scope group member blocks the group. Symlink roots, Git locks,
submodules, alternate object stores and the active checkout remain blocked. Git
locks are never removed or assumed stale. Blocked directories receive a bounded
stat-only size inventory marked **recoverability not verified**, not a deletion plan.

**Low-space option:** byte-identical Git pack/index/reverse-index files on the same
filesystem can share a private canonical inode. This retains every object byte,
including unpushed commits, stashes and dangling objects; it never runs GC/prune or
changes refs, reflogs, index, configuration, worktree files or credentials. The
private object vault must be retained. Plans compare hashes, identities, modes and
Git metadata again before mutation; captures and replacements are journaled.

After reviewing the actual plan, stop all processes using those historical checkouts
and give explicit approval for that exact hash:

```sh
bash "$p" "$r" capacity --home-dir "$HOME" --receipt-dir "$CAPACITY_RECEIPTS" \
  --dedup-plan "$EXACT_DEDUP_PLAN" --approve-plan-sha256 "$APPROVED_DEDUP_HASH" --confirm-inactive
```

**If verified duplicates are insufficient:** prepare a separately reviewed archive
plan with `capacity --archive-dir "$PRIVATE_OFF_DISK_DIRECTORY"`. It must be a
private same-owner existing storage destination on another filesystem, outside
source paths and known volatile directories. No storage resource or network upload
is created. Approve its destination, privacy and any storage cost separately. Git
objects can contain historical sensitive data. Named credentials, journals,
Terraform and recovery records stay in place. Dependency bytes are archived as-is;
a lockfile is not a reproducibility proof.

```sh
# Separate archive approval: stream directly off-disk, verify every member/hash;
# source files remain in place. No home-directory archive-sized staging copy.
bash "$p" "$r" capacity --home-dir "$HOME" --receipt-dir "$CAPACITY_RECEIPTS" \
  --create-archive "$EXACT_ARCHIVE_PLAN" --approve-plan-sha256 "$APPROVED_ARCHIVE_HASH" --confirm-inactive
# Only after reviewing the verified archive receipt, separately approve deletion.
bash "$p" "$r" capacity --home-dir "$HOME" --receipt-dir "$CAPACITY_RECEIPTS" \
  --delete-archived "$EXACT_ARCHIVE_PLAN" --archive-receipt "$VERIFIED_ARCHIVE_RECEIPT" \
  --approve-plan-sha256 "$SEPARATE_DELETION_HASH" --confirm-inactive
```

Archived repositories/dependencies can be unusable until restored. Preserve the
archive and private plan/receipt. `--restore-archive PLAN --archive-receipt RECEIPT`
restores missing files only, preferring captured local content and never overwriting
new files. `--restore-dedup PLAN` recovers interrupted captures. A STARTED-only
journal is uncertain: no automatic replay. Keep existing files and captured unique
bytes for review when both are present.

The administrator run at `057daa4` found 595,752,069 source bytes, zero exact-pack
deduplication savings and 598,904,832 Git-object bytes in the then-eligible roots.
The locked repository, registered historical worktree group and one Git-read
failure were excluded. The newer closed-group inventory must be run before claiming
additional savings. No private off-disk archive destination is approved.

The target is 2 GiB where safe evidence supports it. Report the actual capacity
shortfall; do not invent savings, sum alternative plans or loosen preservation
rules to meet it. Filesystem block-sharing and concurrent activity can affect net
free space, so post-apply free-space observations are distinct from plan estimates.


## Existing broker build: exact fault and narrow correction

Build `7fcac19a-8444-4c17-955a-1a381006069e` used original source
`446a245e624f44c36e1e3847ae7779477272d899`. The administrator's bounded probe reported
only **BUILD_ARTIFACTS_UNEXPECTED**. Cloud Build returned an `artifacts` object
containing exactly `images`, with the same list as the approved top-level `images`.
No additional artifact fields were present. The old verifier rejected every nonempty
`artifacts` object, including this provider mirror.

The correction accepts absent/empty artifacts or exactly
`{"images": expected_images}`. Extra fields (even empty additional artifact types),
other destinations, duplicate or different images still fail. All original checks
for effective builder selection, source, executable steps/options, secrets,
substitutions, resolved source generation, source archive hash and result digest
remain. The observed archive SHA256 was
`3b61c3cc67b59f96019796fdd3979870c3f576926f7010cdcc4920bf56cdedb1`.
Every other build predicate passed in the initial administrator probe. The owner
then executed the corrected verifier from `7867b4e44e78adaec2e0d1152b51e3e789664a13`
and received **BUILD_VERIFIED_NOT_DEPLOYED**, including registry digest verification:

`us-east5-docker.pkg.dev/family-game-factory-jzw/factory-services/request-broker@sha256:4373d65ae39fdf0ea10f2f3a4afe5ce57ab9962d97779a56cdde67a919659c3e`

No build was resubmitted. [The dated ledger](PERMANENT_CLOUD_LEDGER.md) records the
original source/build/archive/builder identities and the limits of this evidence.

Use the final recovery commit as `RECOVERY_SHA`, fetch its launcher and check the
checksum supplied in the reviewed handoff. Then:

```sh
bash /tmp/jems-operations-recovery.sh "$RECOVERY_SHA" broker-build \
  --build-id 7fcac19a-8444-4c17-955a-1a381006069e \
  --build-source-sha 446a245e624f44c36e1e3847ae7779477272d899
```

This performs only reads. Expect `BUILD_VERIFIED_NOT_DEPLOYED` and an immutable image
only if both Cloud Build and registry checks pass. Otherwise the tool emits a fixed
stage/predicate code; it never prints raw provider data. Do not use `--submit`.
Subsequent broker `--check`/approved `--apply` must include the same `--build-id` and
`--build-source-sha` plus its verified image. The bootstrap independently checks all
four original broker files byte-for-byte against current source before accepting an
older build. Changing an image's source label to a newer tool SHA is forbidden.

## Next broker inventory (read-only)

The first inventory at `7867b4e…` hid the failed read. Instrumented source
`9e598d7…` identified `BROKER_SERVICE` / `CANNOT_FIND_SERVICE_MESSAGE` with no
structured provider status. Its completed reads found the dedicated accounts,
role, pool and view not yet provisioned. No plan was emitted.

The correction confirms absence with one fixed Cloud Run v2 GET only for that
exact CLI failure with no structured provider error. It reuses the administrator
token in memory with TLS verification and no redirects. Only HTTP 404 permits a
creation proposal. Every success/denial/redirect/transport failure stops; response
bodies are never read. The plan hash binds the explicit REST-404 absence basis.
Use corrective immutable source `9072b7d5fe280eb10ffdfe6c3a5ae414ab47c245` for this
next read; retain the same verified image, original build/source and launcher checksum.

The error output includes `stage`, `code`, allowlisted `provider_codes`,
`cli_category`, bounded `http_status` and completed read statuses. `READ_OK` means
a completed read only; `NOT_PROVISIONED` is absence, never verified denial.
No plan exists until the complete inventory succeeds.

Read-only diagnostic inventory command:

```sh
(
  set -euo pipefail
  r=9072b7d5fe280eb10ffdfe6c3a5ae414ab47c245
  p=$(mktemp /tmp/jems-broker-plan.XXXXXXXX)
  trap 'rm -f -- "$p"' EXIT
  curl -fsSL "https://raw.githubusercontent.com/jzwyrzyk/family-game-factory/$r/scripts/ops/handoffs/operations-bootstrap.sh" -o "$p"
  printf '%s  %s\n' fdfefd869abeb1876102e9086ceba26998725ef0cc9a856a43adc7900fb6ddb4 "$p" | sha256sum -c -
  bash "$p" "$r" broker-setup \
    --image us-east5-docker.pkg.dev/family-game-factory-jzw/factory-services/request-broker@sha256:4373d65ae39fdf0ea10f2f3a4afe5ce57ab9962d97779a56cdde67a919659c3e \
    --build-id 7fcac19a-8444-4c17-955a-1a381006069e \
    --build-source-sha 446a245e624f44c36e1e3847ae7779477272d899 --check
)
```

This repeats build/source/registry verification and reads actual administrator
inventory. It emits the exact proposed infrastructure changes and
`approve_plan_sha256`, without applying them. Do not substitute the existing
**nonproduction Terraform** approval hash for this separate **broker** plan.

## Guarded historical-checkout cleanup

Cloud Shell's reported 95% disk usage is not permission to recursively delete the
four historical directories. The utility scans only these roots beneath the explicit
`--home-dir`: `jems-releases`, `jems-access-review.DHFCAZKH`,
`jems-gateway-repair-tool`, `jems-service-release`. It recognizes nested independent
repositories, verifies the exact origin and fetches each HEAD into a fresh small
blob-filtered temporary object database to prove remote recoverability.

Only regular, singly linked tracked source files identical to both HEAD and the
index can be proposed for deletion. Modified/staged files, all untracked/ignored
content, Git metadata/objects/stashes/reflogs, credential/configuration files,
journals, receipts, recovery records, state, Terraform and files with extended
attributes are preserved. Symlink paths, unverified worktree groups, active Git locks,
unrecoverable commits and the executing/current checkout stop that repository's
cleanup. Permissions and content hashes are recorded privately. The utility does
not delete dependency directories or Git packs merely because they look reproducible.
It may reclaim less than the reported 3.4 GB; the actual dry-run estimate is authoritative.

Run from Cloud Shell's home, outside the historical checkouts:

```sh
bash /tmp/jems-operations-recovery.sh "$RECOVERY_SHA" cleanup \
  --home-dir "$HOME" --receipt-dir "$HOME/work/jems-cleanup-recovery"
```

Dry-run creates a private plan with selected files, recovery source identities,
estimated bytes, preserved categories, blocked repositories and the exact approval
hash. It deletes nothing. Review that private plan. **Explicit deletion approval is
required** before this separate command:

```sh
bash /tmp/jems-operations-recovery.sh "$RECOVERY_SHA" cleanup \
  --home-dir "$HOME" --receipt-dir "$HOME/work/jems-cleanup-recovery" \
  --apply-plan "$CLEANUP_PLAN_FILE" --approve-plan-sha256 "$CLEANUP_APPROVAL_HASH"
```

Close editors and other processes using those historical checkouts first. Apply
rechecks remote source availability, HEAD/index and all selected file fingerprints
before deleting anything. Each file is atomically captured in a private quarantine,
then rehashed before unlinking; a changed capture is retained. Every intent and result
is fsynced to a private deletion journal. An interruption blocks blind replay. Git
metadata, remaining files and directories stay intact; this is source dehydration,
not deletion of the repository or its history. Git will show the selected deletions.

To recover, use the **same saved plan** (no overwrites):

```sh
bash /tmp/jems-operations-recovery.sh "$RECOVERY_SHA" cleanup \
  --home-dir "$HOME" --receipt-dir "$HOME/work/jems-cleanup-recovery" \
  --restore-plan "$CLEANUP_PLAN_FILE"
```

Recovery prefers retained quarantine bytes, including unexpected local edits, then
restores other missing selected files from verified Git blobs. Existing paths are
never overwritten. Keep the plan/journal and any quarantine until recovery is
reviewed. Do not run `git reset --hard`, `git clean`, broad `rm -rf`, or package-cache
cleanup to bypass a blocked repository.

## Future handoffs and lightweight receipts

The consolidated launcher now uses a sparse/blob-filtered temporary checkout. It
creates a private append-only journal before fetching source, recording the source
SHA, lane, fixed mode flags and validated build/approval IDs. It records exit status
and cleanup outcome on normal exit or handled HUP/INT/TERM. SIGKILL/power loss cannot
run a trap; a STARTED-only journal identifies an uncertain operation. Never replay
an uncertain submission or mutation automatically.

Default receipt directory: `$PWD/work/jems-operations-recovery`; override with
`JEMS_OPERATIONS_RECEIPT_DIR` pointing to a private persistent directory outside
checkout cleanup scope. Directories must be mode 700. Journals contain no raw
command output, environment dump, credentials, provider responses or arbitrary
arguments. New broker publications fsync a submission intent, returned build ID and
verified image/source identifiers before reporting them. A receipt write failure
stops the workflow; an existing cloud operation may still need inspection.

A clean temporary checkout is removed on success/failure. Unexpected modified,
untracked or ignored output causes retention at its original path, recorded in the
private journal. Python bytecode writes are disabled. Temporary checkout retention
is intentional preservation, not permission to delete unknown files later.

## Independent DEV/TEST next step

The administrator verified `jems-jzw-nonprod`, project number `1092405124984`, ACTIVE,
with matching approved billing. All 28 expected Terraform resources were planned
and integrity checked using Terraform 1.13.5. The plan remains **unapplied**.

Keep the exact original files/state and binding to source
`446a245e624f44c36e1e3847ae7779477272d899`, with approval hash
`821d722ee140ffdef4c8ae4ba4e1fed89307e6c997153b3a8597f726a8caaad6`.
Neither the corrected broker verifier nor cleanup changes those Terraform files.
Do not run `--plan` again merely to pick up recovery-tool changes, change its binding,
remove its marker/state, or substitute the latest engineering main SHA.

Once that exact apply is authorized, its original-source command is independent of
broker qualification (use the actual existing state directory if different):

```sh
bash /tmp/jems-operations-recovery.sh 446a245e624f44c36e1e3847ae7779477272d899 nonprod \
  --apply --state-dir "$HOME/work/jems-nonprod-state" \
  --approve-plan-sha256 821d722ee140ffdef4c8ae4ba4e1fed89307e6c997153b3a8597f726a8caaad6
```

The newer launcher can run that older immutable source and still retain a basic
start/finish recovery journal. Original Terraform guards recheck the saved-plan
hash, binding, project/billing and fresh cloud diff. Apply does not enable federation,
registry deletion, live AI, application traffic or full TEST backend. Subsequent IAP
setup and reviewed controller configuration use the existing owner access plan.
