# Permanent cloud operations delivery ledger

## November 26, 2026 — broker inventory stopped before a plan

The administrator ran `broker-setup --check` from tooling `7867b4e…` against the
already qualified image, build ID and original source recorded below. It returned
`STOPPED` with the generic `Source or response validation failed` message. No plan
or approval hash was produced. This read-only invocation did not deploy resources;
the private recovery receipt stays in Cloud Shell. The result alone cannot establish
which local operation, provider read or response validation failed. The prior image
qualification remains valid for its observed source and digest; inventory acceptance
remains incomplete.

The corrective setup tool now emits fixed `stage`, `code`, allowlisted
`provider_codes` and `cli_category` fields plus completed read statuses. It suppresses
exception text, credentials and provider bodies. `READ_OK` means the read completed,
not that all subsequent validations or effective IAM checks passed. Explicit missing
resources are `NOT_PROVISIONED`; CLI text hints, denied access, malformed JSON and
successful `null` responses do not authorize treating resources as absent.
No inventory predicate, provenance rule or approval requirement was relaxed.
The broker-local CLI adapter preserves the frozen diagnostic/activation dependency
bytes. The original broker image files and nonproduction Terraform inputs remain
unchanged. A checksum-verified administrator read must identify the actual failed
stage before any evidence-based repair or infrastructure approval can proceed.

Corrective executable source: `9e598d7aa7d7929601b7ba40270ca396348f69f4`.
Local validation: **311 operations tests** and **113 environment tests** passed,
including CLI failures, strict absence, malformed provider responses,
source/provenance stops, read-only planning and redaction. The source-only preflight
passed with identity and live access explicitly unchecked.

An actual checksum-verified sparse launcher at this source was exercised with a
**synthetic CLI**, fictional build/digest and no Google requests. It fetched and
compared the original committed broker source, returned `BROKER_ACCOUNT_METADATA` /
`GCLOUD_COMMAND_FAILED` / `PERMISSION_DENIED` for the injected failure, suppressed
the private marker and removed the temporary checkout after exit 2. This tests the
handoff and error reporting; it does not identify the actual administrator failure.
Hosted [operations](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45848404911),
[environment](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45848404863)
and [documentation](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45848405081)
checks passed at this source. Broader candidate checks were still running at this
checkpoint; the actual administrator inventory remains unqualified.


## November 26, 2026 — existing broker image qualified by administrator

The owner supplied the corrected verifier's **BUILD_VERIFIED_NOT_DEPLOYED** result
from Cloud Shell, executed from tools source
`7867b4e44e78adaec2e0d1152b51e3e789664a13`. It qualified existing build
`7fcac19a-8444-4c17-955a-1a381006069e`, original build source
`446a245e624f44c36e1e3847ae7779477272d899`, archive SHA256
`3b61c3cc67b59f96019796fdd3979870c3f576926f7010cdcc4920bf56cdedb1`, and builder
`factory-service-builder@family-game-factory-jzw.iam.gserviceaccount.com`.

Verified immutable registry image:

`us-east5-docker.pkg.dev/family-game-factory-jzw/factory-services/request-broker@sha256:4373d65ae39fdf0ea10f2f3a4afe5ce57ab9962d97779a56cdde67a919659c3e`

This closes the observed artifact-mirror verification blocker and includes the
separate registry digest check. The source-bound result is administrator-supplied
provider evidence, not a direct managed Codex identity qualification or a deployment
receipt. The private lightweight recovery journal remains in Cloud Shell; its
contents/path are not copied into this public ledger. No rebuild was performed.
Next is read-only broker administrator inventory using this exact image, build ID,
and original source, then approval of the resulting exact infrastructure plan.
Broker deployment, effective IAM/coverage and GitHub request-evidence acceptance
remain incomplete. The preserved 28-resource nonproduction Terraform plan and
cleanup dry-run/deletion approval are separate; this receipt does not apply either.

Hosted validation independently read back for source `7867b4e…`: all eight workflow
runs completed successfully on attempt 1, with **30 successful checks and one
intentional skip**, no failures or pending checks. [Operations contracts](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45840304669),
[environment contracts](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45840304477),
[Arcade journeys](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45840304744),
[visual review](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45840304393).
These source checks are distinct from cloud activation and owner visual acceptance.

## Recovery verification and integration checkpoint

The recovery candidate was reconciled with engineering main
`652bf9e312fc0776e37b7ef7893835e0fd8136d4`, preserving its concise root-reference
routing and CI foundation. No release workflow, release intent or frozen artifact
identity differs from that main due to this task. The original nonproduction
`main.tf`, provider lockfile and `setup_nonproduction.py` remain byte-identical to
source `446a245e624f44c36e1e3847ae7779477272d899`; the saved plan is not rebound.

The original independently computed archive hash matches the administrator's
`3b61c3cc67b59f96019796fdd3979870c3f576926f7010cdcc4920bf56cdedb1` exactly.
The source regression checks cover the observed exact artifact-image mirror and
reject altered images, additional artifact types/fields, executable changes and
source mismatches. Registry qualification was subsequently completed by the administrator; see the dated result above.

Local checks passed: **301 operations tests**, **113 environment tests**, **122 CI
contract tests**, **18 documentation tests**, and documentation/reference checks.
The broad local `check:changed` run stopped at a missing Playwright executable;
the failed desktop/phone browser check then passed with the supported system
Chromium setting. Hosted candidate workflows subsequently passed as recorded above. Historical cleanup has
been exercised only on synthetic repositories, including changed/staged files,
failed remote proof, Git locks, links, interrupted quarantine recovery and
no-overwrite restoration. No real Cloud Shell directory was deleted.

## November 26, 2026 — administrator activation checkpoint; build verification pending

Owner reports all six GitHub restrictions applied. This task independently reread
all three exact main-only environment policies: no remaining actions. Current main
advanced separately to `652bf9e312fc0776e37b7ef7893835e0fd8136d4`; no application or
release identity was changed by this operations task.

Administrator-reported nonproduction project is ACTIVE: `jems-jzw-nonprod`, number
`1092405124984`, matching existing approved billing. Terraform 1.13.5 produced all
28 expected resources; plan integrity checked, **not applied**. Preserve source
`446a245e624f44c36e1e3847ae7779477272d899`, current files/state and approval hash
`821d722ee140ffdef4c8ae4ba4e1fed89307e6c997153b3a8597f726a8caaad6`.

Existing broker Cloud Build `7fcac19a-8444-4c17-955a-1a381006069e` reports SUCCESS
but verification stops. The tool now emits fixed predicate/stage failure codes and
supports a read-only all-predicate probe with the original build source. No build
was resubmitted, no provenance check relaxed, and no image accepted. This task has
no attached Google identity; exact live failure attribution needs the administrator
probe. Existing GitHub release observation does not authorize arbitrary build reads.
The administrator's one bounded probe returned the exact sole failed predicate:
`BUILD_ARTIFACTS_UNEXPECTED`, with `artifacts_is_exact_images_mirror:true` and no
other artifact fields. All source/build/security predicates passed; source archive
SHA256 is `3b61c3cc67b59f96019796fdd3979870c3f576926f7010cdcc4920bf56cdedb1`.
The correction accepts only that exact provider image-list mirror, not arbitrary
artifacts. Registry digest verification remains unperformed in this task.

Guarded historical-source cleanup and durable lightweight handoff journals are now
implemented with regression coverage. Cleanup defaults to a private dry-run, verifies
remote recoverability, preserves Git/unique/local/operational/Terraform content,
requires explicit deletion approval, captures then rehashes files before unlinking,
and supports no-overwrite restoration. Sparse temporary handoffs remove clean source
and retain unexpected local changes. No historical file, credential, journal,
receipt, recovery record or Terraform state has been deleted. The original 28-resource
Terraform files and plan binding remain unchanged; broker verification does not gate
their independently approved apply. [Recovery handoff](../../docs/operations/OPERATIONS_RECOVERY.md).

## November 26, 2026 — operational priority realignment and live GitHub observation

The PR #222 candidate incorporates independent managed-auth correction
`34fd728919e79e90b63f00933d87a265d6d0ac86` (including `a449cfa`). Its regressions and
fail-closed boundaries are preserved. Direct SDK authoritative identity qualification
remains **incomplete**; no denied identity endpoint was retried. It no longer gates
GitHub or nonproduction preparation. Earlier separate-task success below is historical
finite evidence, not current direct SDK live acceptance.

**Independent live GitHub qualification:** [run 45764873156](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45764873156),
at frozen source `bc602f1ede502f398308ad56f973c4bf7997ff08`, completed the existing
`observe=true` path at `2026-11-26T05:57:44.342294Z`. The observer verified
`jems-cloud-run-release@family-game-factory-jzw.iam.gserviceaccount.com` and reported
`READ_ONLY_RELEASE_OBSERVATION_COMPLETE`, zero mutations. Gateway
`factory-gateway-r-eaf5effa06d031818f52`, private Coach
`factory-coach-private-r-890188092e3f4396dab0`, and Preview `factory-preview-00006-5lk`
were Ready/reconciled, with matching serving configurations and intended revisions
at 100% traffic. The plan and transition jobs were skipped. This is authenticated
GitHub metadata acceptance, not broker log coverage, direct SDK acceptance, paid
request replay or user-visible product acceptance. Managed connection credentials
and internal diagnostic receipts were not published.

Authenticated GitHub inventory found the diagnostics environment unrestricted and
both nonproduction environments absent. Six exact main-only settings changes are
prepared; none applied. Repository OIDC remains unchanged. Actions dispatch works
through this task's existing connection; variables reads returned 403 and were not
interpreted as absence. CLI log retrieval was unavailable; the supported GitHub
connector retrieved the observer's sanitized source-bound result.

Authenticated retrieval also requalified the existing failed PR153 artifact
`14888098788` from run `45323244621` using the supported connector fallback, its
GitHub SHA256 `99c5e7ee3b96fd025182e807f9c412c7c94a5c48364c4e7239ca906ed19e55bd`,
source `2c4751611cbd40ef04a85432845cd260528f5a56`, attempt 1 and exact scope.
The new classifier correctly returned `UNAVAILABLE/IDENTITY_UNAVAILABLE`, unknown
counts and no rollback. This establishes authenticated retrieval/validation of a
failure artifact, not successful broker execution. The artifact payload stays private.

New executable source adds broker build/source/archive/digest verification through
the existing builder and registry, mandatory build proof before broker apply, guarded
GitHub setup/dispatch/artifact validation and automated 401 triage, plus a checksum
verified consolidated Cloud Shell launcher. The nonproduction saved-plan helper
binds source/project/billing, rejects destructive or replacement initial plans,
rechecks drift and preserves private durable state. Terraform separates DEV and TEST
static runtime accounts, keeps federation disabled and cleanup in dry-run, and adds
project-only $15 monthly alerts. The owner's target is `jems-jzw-nonprod`, `us-east5`,
with their specified Google account for IAP and live AI disabled. No personal email
or billing identity needs public publication.

Local validation: **286 operations tests**, **113 environment tests**, and Terraform
validation passed. No Cloud Build, broker provisioning, project creation, billing
change, nonproduction apply, new IAM grant or application deployment occurred.
Project global availability/billing and exact administrator cloud inventory remain
unverified. Broker live acceptance and full TEST backend/worker provisioning remain
pending their own prerequisites and approvals; the static baseline is not full TEST.
The [executable handoff](../../docs/operations/PERMANENT_CLOUD_SETUP.md) records exact
resources, costs, security effects and commands. Preparation awaits the owner's
requested concrete provisioning approval; nothing is merged or activated by it.

## November 26, 2026 — permanent cloud diagnostics preparation; Coach success evidence

Operations-only preparation against frozen main `bc602f1ede502f398308ad56f973c4bf7997ff08`.
The [consolidated setup plan](../../docs/operations/PERMANENT_CLOUD_SETUP.md) and
[autonomous triage runbook](../../docs/operations/AUTONOMOUS_TRIAGE.md) preserve PR153,
the existing Codex diagnostic identity and current release/environment controllers.
New source provides offline/default planning, read-only inventory, hash-bound explicit
apply, partial-setup checks, finite IAM audits and sanitized offline request triage.
This is source preparation, not merged, deployed or accepted permanent access.

**Owner-supplied live production evidence:** Gateway Coach POST returned **HTTP 200
at `2026-11-24T14:47:26.454968Z`**. Private Coach POST
`/v1/private-coach/complete` returned **HTTP 200 at
`2026-11-24T14:47:26.650244Z`** on
`factory-coach-private-r-890188092e3f4396dab0`. These temporally correlated
observations establish successful post-deployment HTTP handling across both services.
The Gateway serving revision, trace-level correlation and actual user-visible
response acceptance remain unverified. No paid request was replayed and no rollback
was initiated. Recent Gateway 401s are a separate unresolved investigation; permitted
OPTIONS 204 is preflight success, not evidence of authenticated application success.

**Subsequent owner-reported managed connection verification:** in a separate task,
alias **`GCP`** authenticated effectively as
`jems-codex-diagnostics@family-game-factory-jzw.iam.gserviceaccount.com`. SDK self-check
and full three-service diagnostics exited 0; all three services were Ready,
reconciled and serving intended revisions at 100%. Positive metadata and negative
deployment, IAM, secret, destructive and impersonation checks passed over the tested
resources. Exact source/probe tuples and a sanitized receipt were not supplied here.
This finite separate-task result supersedes an assertion that the existing connection
itself is broken, but does not attach it to this environment.

The canonical SDK client and source preflight now avoid gcloud and writable managed
credential caches, support alias `GCP`, verify effective identity and reuse the existing
redacted reader. The initial checkout `a5f1f41…` lacked the diagnostic script; fetching
current main resolved the legacy tooling discrepancy. Future tasks need the reviewed
operations source containing the SDK additions. This task retried actual SDK self-check
and full/permission diagnostics after the report; both remained
`IDENTITY_NOT_CONFIGURED`, with environment status still reporting no attached identity.
Independent live reproduction from this environment remains blocked; synthetic SDK
regressions and the separate owner's success must not be conflated.

**Access evidence from this task:** managed environment status is current and shows
no outbound identity or secret binding; `OIC_MANIFEST_PATH` is absent. Installed
Google Cloud SDK 594.0.1 and executed both existing `diagnose.py` modes; each stopped
with `IDENTITY_NOT_CONFIGURED`. Effective account, positive reads, denied privileges
and recent request metadata were unverified in this task at that checkpoint; the
separate SDK result above has its own scope. The available environment change API
cannot attach OIDC; reuse the existing connection through environment settings.
The owner's inventory reports the Codex pool/provider ACTIVE and the GitHub diagnostic
provider/pool, broker and dedicated accounts absent. GitHub confirms PR153 merged and
its first live attempt [45323244621](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45323244621)
failed; the recorded `invalid_target` is consistent with the now-reported missing
provider. The owner reports `global/_Default` retained request logs. No new live GCP
inventory, image build, IAM change, deployment, spending or recurring execution took
place. Exact administrator inventory, approved broker image/provenance, effective IAM,
GitHub environment settings and coverage review are still required before apply and
end-to-end acceptance. Current DEV/TEST configuration remains disabled and unset.

Focused synthetic authentication tests passed 29/29 on Node 22. The final local operations suite passed 263/263, including 24 new permanent-access,
SDK and preflight regression tests. An intermediate full run caught the frozen
activation checksum on the legacy diagnostic file; the fix preserved its original
bytes and moved SDK identity selection to an additive module. No release checksum
was refreshed. Final hosted validation is recorded separately in the candidate PR. Live identity and broker acceptance
are blocked independently of those offline results. Learning #218, creative #220 and
CI #219 remain separate; all frozen release identities and production controls are
preserved.

