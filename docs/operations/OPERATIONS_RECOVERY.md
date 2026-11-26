# Operational activation recovery

November 26, 2026. This supplements [permanent setup](PERMANENT_CLOUD_SETUP.md).
It does not approve deletion or regenerate any saved Terraform plan.

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

The initial inventory invocation below stopped with a generic validation error;
it produced no plan or approval hash. Use the corrective immutable tooling SHA from
the latest reviewed PR #222 handoff for the next read. Keep the original build/image
identities below unchanged. The launcher checksum is unchanged.

The corrective error output includes `stage`, `code`, allowlisted `provider_codes`,
`cli_category` and completed read statuses. `READ_OK` records a completed read only;
`NOT_PROVISIONED` identifies explicit absence, never verified permission denial.
CLI message hints are diagnostic only and cannot authorize resource creation.
Raw errors, token values and provider bodies remain suppressed. No new plan exists
until the complete check succeeds.

Initial inventory command (superseded tooling pin; see the reviewed handoff):

```sh
(
  set -euo pipefail
  r=7867b4e44e78adaec2e0d1152b51e3e789664a13
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
attributes are preserved. Symlink paths, linked worktrees, active Git locks,
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
