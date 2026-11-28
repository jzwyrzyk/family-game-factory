# Permanent cloud operations delivery ledger

## November 26, 2026 — strict gcloud hash-encoding compatibility

The administrator's `6f0fd94` source probe stopped before archive download with
`PROVENANCE_SHA256_ENCODING_INVALID`. Review of Google's documented gcloud output
identified URL-safe base64 serialization, whereas the verifier expected standard
base64 text. The approved archive hash includes a character that differs between
these encodings; the historical archive hash did not. This explains the observed
failure pattern but corrected provider readback remains required.

The publisher and inspector now share a strict SHA-256 decoder for canonical,
padded standard or URL-safe base64 only. Equality remains exact 32-byte digest
equality; malformed, ambiguous, duplicate or changed digests fail closed. No
compression normalization or source-hash bypass was added. **360 operations tests
passed**, including both encodings and rejection cases. Earlier `6f0fd94` hosted
operations, environment and documentation checks passed, and its fresh remote
checkout passed source-only preflight; these are not live identity/activation
claims. The corrected tooling still needs existing-build qualification and fresh
remaining-actions review. No new build or cloud mutation is authorized.


## November 26, 2026 — replacement build succeeded; archive qualification blocked

Administrator continuation at `5d98d675510645de26601fcb7b805c0e0f44bfca`
submitted the one approved build. The direct diagnostic for
`a345988d-2c4b-48ab-97d8-06636abb500d` reports `SUCCESS` and exactly one failed
predicate: `SOURCE_ARCHIVE_HASH_MISMATCH`. Expected archive SHA-256 remains
`2f450c0d49fb975326dd0c78c93b8edc20fb36fb4d832a7a73da677b1ffdf4f2`, bound to
approved source `476c2b9793060d30623b16130daeb5e9776640ff`. All other reported
build predicates passed; registry qualification and live acceptance are unverified.
The one-build approval is consumed. No resubmission or deployment is authorized.

A bounded, generation-pinned source inspection is prepared to compare provider
hash, stored gzip, exact TAR bytes and exact known members without extraction,
credential persistence or cloud mutation. It does not relax the existing verifier.
The continuation now preserves fixed failure codes and uses current qualification
tooling with the original approved build source. Failed qualification no longer
causes independent recovery to inventory the obsolete default image.

Validation: **357 operations tests passed**, including source-inspection bounds,
identity/path/generation checks, gzip differences, changed content, redaction,
fixed child-error propagation and independent recovery. Broker runtime files remain
identical to the approved build source.

The same administrator run reports 1,192,248,614 source-cleanup bytes across five
eligible repositories, two blocked repositories, and zero exact-pack deduplication
savings. Git objects and dependency archive candidates are not verified reclaimable
space; do not sum alternative plans. The 2 GiB target remains unverified. No
historical deletion or archival was executed or approved. The original DEV/TEST
plan passed integrity verification again, with no Terraform invocation or state
change. Private manifests and recovery receipts remain in Cloud Shell.


## November 26, 2026 — replacement build approved; guarded continuation prepared

The owner explicitly approved one corrected broker build from
`476c2b9793060d30623b16130daeb5e9776640ff`, with its exact reviewed build-plan hash.
The 600-second E2_MEDIUM build uses the existing build lane; published compute is
up to $0.03 before allowances, with storage/logging/network additional. Approval
does not include remaining infrastructure apply, archival/deletion or another build.

The continuation keeps that source/hash fixed independently of newer tooling.
An exclusive durable intent precedes submission. A recorded build ID resumes reads
only; an uncertain intent cannot automatically resubmit. Bounded status reads and
full provenance qualification precede fresh remaining-actions planning. Independent
cleanup/capacity dry runs and saved Terraform integrity reads proceed even if build
qualification stops. No actual submission or provider acceptance is claimed by this
engineering record. Validation adds seven regression cases for one-time submission,
wrong approval, unknown outcome, recorded-ID resume, pending/failed status, receipt
mismatch and private-error suppression; **348 operations tests passed**.

## November 26, 2026 — provider depth failure identified

Administrator recovery from source `2628bd3c29ce5e91c49dbb5fef8b31d71a9c0a43`
matched the failed CreateView audit entry against the original image's exact filter.
A local-only sanitized decoder identified **Filter exceeds the view filter nesting
depth limit of 1**. The fixed diagnostic text matches the supplied audit-message
SHA-256 fingerprint exactly, resolving the initially redacted numeric limit without
publishing a private receipt. This supersedes
the earlier unresolved provider failure; it does not establish that OR or labels
are unsupported. All six existing resources/bindings were rechecked and four actions
remained; no mutations, deletion or archival occurred. Private provider receipts
remain in Cloud Shell.

The correction uses a flat conjunction and an exact anchored RE2 service-name
comparison, retaining all five access restrictions. The existing qualified image
embeds the old literal filter and cannot accept the new one. Preserve the original
build/image; new source requires one separately approved build, full immutable
source/build/archive/digest qualification and a fresh remaining-actions review.
Neither the corrected filter nor a new image has live-provider acceptance. No build
was submitted and no logging, IAM, production service or credential boundary widened.

Source cleanup now found **893,938,345 bytes** across four repositories, with two
blocked roots. Exact-pack dedup savings remain zero. Then-eligible Git objects are
894,881,792 allocated bytes and dependency candidates 103,985,152 allocated bytes.
The locked repository accounts for 732,725,248 Git bytes; the unreadable-HEAD root
accounts for 294,797,312 Git bytes plus 190,636,032 other bytes. Those blocked size
observations are **not verified recoverability**. Discovery now follows the already
registered recovery-named worktree while protecting records per file. No Git lock
is removed, no damaged HEAD is rewritten and no private archive target is approved.
The 2 GiB target remains unverified; do not add alternative plan estimates.

The original 28-resource DEV/TEST plan and binding passed integrity checks again.
No apply-started record was found; Terraform was not invoked and state was not
modified. Its existing source/approval boundary remains independent of the broker.

Correction validation: **341 operations tests** passed, including 891 finite
semantic combinations for unchanged project/log/type/region/service scope, near-match
service denial, old/broader filter rejection, grouped replacement build references
and discovery of registered recovery-named worktrees. These fixtures do not assert
actual provider regex acceptance. The original image/source mismatch remains an
enforced deployment blocker. **122 CI contract tests**, **18 documentation tests**
and the documentation review check also passed. The broader application-browser
timeouts recorded earlier retain their separate scope.

## November 26, 2026 — administrator recovery readback and remaining blockers

Administrator execution of source `057daa43ab9c2f4da5510f6987b0c3743e8cce98`
returned `READ_ONLY_RECOVERY_REPORT_NOT_ACTIVATION`: zero cloud mutations,
deletions or archive uploads. Fresh inventory verified all six prior account,
role and federation resources/bindings and proposed exactly four remaining actions:
create the restricted log view, bind the broker on that view, deploy the immutable
broker, and grant its exact caller invoker access. Remaining-actions hash
`942b23cac4948b74ef16025e9ca50b1eef00cf0add77f143a98506a5da963e07` is review evidence,
**not permission to retry**: the previous view INVALID_ARGUMENT remains unresolved.
Audit reading was unavailable and the bounded local search found no failure detail.
The revised reader fixes projection through the protobuf Any field, exposes only a
sanitized HTTP status on failure, and includes SDK JSON errors in the private probe.
Actual provider diagnosis remains pending; neither OR nor resource labels are
proven to be the rejected clause.

Expanded source cleanup found **595,752,069 bytes**, three eligible repositories
and three blocked repositories (plan `a903d733811456fa2734b87b6d98d21870e7be694e931b4f62bebf15ce7f3eb9`).
Exact Git-pack deduplication found **zero** savings; then-eligible Git objects total
598,904,832 bytes. The 2 GiB goal is not established. One repository has a Git lock,
a historical primary/linked-worktree group was excluded, and another repository
failed a Git read. New tooling validates closed historical worktree groups, captures
all common metadata and counts common objects once; active/outside/missing members
and locks still block cleanup. Stat-only blocked-directory sizing and specific Git
read failure codes improve review without authorizing deletion or lock removal.
No archive destination or archival/deletion approval has been supplied.

The original nonproduction binary plan and source binding were actually checked:
`SAVED_PLAN_INTEGRITY_VERIFIED`, original source `446a245e624f44c36e1e3847ae7779477272d899`,
approval `821d722ee140ffdef4c8ae4ba4e1fed89307e6c997153b3a8597f726a8caaad6`.
No apply-started marker was found, Terraform was not invoked and state was not
modified. DEV/TEST apply preparation remains independent. Private detailed receipts
and local paths stay in Cloud Shell; no production, credential or broker-image
change was made.

Correction validation: **335 operations tests** and **18 documentation tests**
passed; documentation source review passed. New real-Git fixtures cover linked
worktrees, shared-object counting, unique dirty contents, archive/delete/restore,
active/outside/missing worktree refusal and preserved locks. Provider tests cover
Any-field projection, fixed HTTP diagnostics and credential-redacted SDK errors.
The original broker and nonproduction provisioning bytes remain unchanged. These
are local fixture results; the revised administrator read is still required.

## November 26, 2026 — partial broker apply and expanded disk recovery

Administrator evidence from executable source `9072b7d5fe280eb10ffdfe6c3a5ae414ab47c245`
and approval hash `60902e596762643d6d7a1223a3ba95d681d95321ca143ea86c99796cf49098c8`
shows six commands returned successfully: two keyless accounts, exact custom role,
dedicated pool, exact provider and caller federation binding. The next operation,
creating `jems-production-requests`, failed with `INVALID_ARGUMENT`. The view IAM
binding, broker deployment and invoker binding were not reached. Completion of six
commands is administrator evidence, not independent readback or effective-IAM
acceptance. Preserve these resources and the verified image; do not replay the old
apply/hash. Fresh inventory must validate existing settings and propose only the
remaining actions.

Google's November 25 [flexible-filter guide](https://docs.cloud.google.com/logging/docs/logs-views#filters)
permits OR and resource labels; its [LogView REST reference](https://docs.cloud.google.com/logging/docs/reference/v2/rest/v2/projects.locations.buckets.views)
still describes the older conjunction-only subset. Documentation alone does not
identify this project's rejection. The consolidated read-only recovery command
collects bounded CreateView Admin Activity evidence and the corresponding existing
local gcloud error, preserving exact messages privately and printing only redacted
vocabulary/hints. No alternative view is created to probe syntax.

The downstream API review corrected log-view getIamPolicy to POST with
`options.requestedPolicyVersion=3`, preserving setIamPolicy POST/etag and narrow
view-only grants. Cloud Run validation distinguishes service and revision scaling,
checks request-based CPU billing, generation reconciliation and latest-revision
traffic representation. The original four broker files and immutable image are
unchanged. The broker embeds the exact view filter: changing even equivalent filter
syntax requires reviewed broker source, a newly authorized build/digest and full
qualification; widening access or removing service/region clauses is not authorized.

The administrator's earlier cleanup dry-run proposed only **430,985 bytes**, with
one eligible repository and three blocked repositories; no deletion was reported.
Discovery now recognizes bounded generated suffixes on the known checkout families.
The additional capacity lane inventories exact duplicate Git pack files (including
unreachable/local-commit objects) for low-space, byte-preserving hardlink deduplication.
Unique object files and local records are never discarded. A separate off-home-
filesystem private archive path can preserve selected Git-object/dependency bytes,
including local modifications, with full round-trip hashes before a separately
approved deletion. Credentials, Terraform and operational records remain in place;
opaque Git objects may contain historical sensitive material, so archival has its
own explicit privacy/storage approval. A lockfile alone never proves dependencies
reproducible. No archive/upload/deletion has run on Cloud Shell.

The target is **2 GiB (2,147,483,648 bytes)** where inventory supports it, not a
promised reclaimed amount. Allocated-byte estimates may exceed actual gains on an
already-sharing filesystem; alternative plans must not be summed. Exact private
plans, changed-file refusal, capture-before-unlink journals, inactive-checkout
confirmation and no-overwrite restoration guard destructive phases. The verified
image, original DEV/TEST source/plan/state and frozen activation dependencies remain
unchanged. Live provider failure details, existing-resource verification, recoverable
capacity and saved-plan integrity remain pending the consolidated administrator read.

Validation: operations regressions cover the partial six-resource inventory, four
remaining actions, POST view IAM/etag behavior, archive integrity and approval
separation, dirty/unpublished Git contents, changed-file captures and restoration.
Local CI/documentation/environment checks also passed; earlier application-browser
timeouts retain their separate scope. No actual cloud/storage acceptance is inferred.


## November 26, 2026 — actual inventory blocker identified

The administrator reran the instrumented check at `9e598d7…`. It stopped at
`BROKER_SERVICE` with `GCLOUD_COMMAND_FAILED`, no structured provider codes and
`CANNOT_FIND_SERVICE_MESSAGE`. Project metadata, enabled APIs, project IAM, image
metadata and the log bucket were read. The two dedicated accounts, view role,
federation pool and log view were explicitly `NOT_PROVISIONED`. The service's CLI
message is not authoritative absence proof, so no plan/hash was emitted and no
resource was created. This identifies the previous generic failure as a Cloud Run
CLI absence-reporting compatibility issue, not a failed build/provenance predicate.

The correction uses one fixed Cloud Run v2 GET for the exact project/region/broker
only after that exact CLI failure without any structured denial/error code. It
uses the existing administrator token in memory, verified TLS and no redirects.
Only HTTP 404 confirms absence. HTTP 200 (including null/malformed bodies), denial,
redirects, transport and other HTTP errors stop without a plan. Response bodies
are never read or emitted. The approval evidence records this explicit 404 basis;
all existing source, provenance, IAM, service and approval gates remain enforced.
No new cloud permission, endpoint bypass or service deployment is introduced.

Correction source: `9072b7d5fe280eb10ffdfe6c3a5ae414ab47c245`.
**315 operations tests passed**, including exact endpoint/same-token checks,
HTTP 404 planning, 200/redirect/denial/transient-error refusal and redaction.
Source-only preflight passed with identity/live access unchecked. Hosted
[operations](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45849529811),
[environment](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45849529834)
and [documentation](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45849529991)
checks passed at this source. Administrator REST confirmation and the actual
additive plan remain pending.
The original verified image and saved nonproduction Terraform plan are unchanged.

Broader local `check:changed` did **not** pass: the unchanged Actions browser test
stopped waiting for `Score: 1` at `tests/actions-e2e.ts:66`. One isolated retry moved
past that path but stopped waiting for the V2 game's `data-frames` surface at line
106. Both used local fixtures and system Chromium, without paid provider requests.
These browser failures remain separate from the passing operations/environment
checks; no full local regression or application acceptance is claimed.


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


## November 26 — partial Terraform recovery and live broker check

The owner's current report supersedes the earlier unapplied Terraform status:
25/28 original instances were recorded; original/recheck plans matched. The
private `~/work/jems-nonprod-state` and `partial-recovery-1795714051.tfplan` are
unavailable on the attached computer. Specific original provider causes and a
corrected live plan are not independently verified here. Source review confirms
the display-name limit, budget ADC quota requirement and direct-IAP architecture.
[Exact changes, provider requirements and guarded operator](NONPRODUCTION_RECOVERY.md).
No recovery apply or activation was performed.

Live [diagnostic run 45869033203](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45869033203),
at protected main `652bf9e312fc0776e37b7ef7893835e0fd8136d4`, passed protected-main
verification, workload token acquisition and private broker invocation. The report
at `2026-11-26T17:35:52Z` returned `UNAVAILABLE/COVERAGE_UNVERIFIED` with null counts,
no rows and `permissions_verified=false`. Artifact SHA-256:
`6b46985b95af3e71218e5a53e8fa567073c528549fd34e06394f966337bccf19`.
Its empty revision request was replaced by the workflow's historical default;
strict retrieval correctly rejected the resulting scope mismatch. Prepared source
removes that default and additionally checks the exact attempt's successful job
and mandatory steps. Full acceptance still needs effective IAM and genuine dated
coverage evidence. No raw request logs, tokens, child content or application
secrets were printed. Private dispatch intent, artifact and receipt are preserved.

Direct GitHub inventory confirmed exact-main restrictions for all three operational
environments with zero setup actions. No second query, permission expansion,
production deployment, scheduler activation or paid AI request was issued.
