# Jems operational access and release controls

**Historical prepared CI evidence integration, November 23, 2026:** the separate CI follow-up replaces generic successful-main Arcade acceptance in the read-only release plan with complete source-bound receipt verification. The current cutover has one exact, finite migration receipt; future sources require authenticated full first-attempt evidence and immutable build identity. The operation output is emitted only after verification. Rollback retains its application-CI independence and avoids the added Node setup step; auth, permissions, provenance, concurrency and the actual transition remain unchanged. See the [CI evidence guide](../evidence/README.md#exact-validation-reuse-and-release-integration). At that observation, the privileged edit awaited explicit owner approval and was unmerged. The later owner-approved PR157 merge installs the gate; current full and reuse execution is recorded in delivery state. CI activation did not dispatch a production transition.

This change adds a release controller and scoped diagnostic clients. Each production
operation requires a maintainer-reviewed intent on protected main. The repository opt-ins and
Google grants are initially absent. Existing Pages, sandbox publication, smoke,
worker trust and provider approval retain their current release paths.

**Integration authorization (November 22, 2026):** The November 21
preparation-only hold has been superseded by the owner's explicit instruction to
merge and finish this access-source work, subject to the protected-main checks
and exact reconciled source. This authorizes the inert source integration, not
privileged identity enablement, new IAM bindings, the managed diagnostics connection,
Cloud Logging access, an isolated paid drill, release flags or production traffic.
The seven inactive GCP resources were created and verified; the read-only
verification receipt was recovered under temporary /tmp storage. Live effective
permissions and end-to-end assistant access remain unverified.

## Integration split: policy checks and game fixes

[PR112](https://github.com/jzwyrzyk/family-game-factory/pull/112) carries the
[policy foundation](POLICY_FOUNDATION.md) and the game-quality repair from PR111.
It extracts the real operations workflow, complete operational source/tests and
fixed fixtures from PR107 at `2ced4fb227b94c9ad216ad58aed41b35072e7e23` without
changing their assertions or behavior. This resolves the missing required-check
dependency without installing either privileged release workflow. Keep the
newer application, packaging, quality-repair and documentation changes when
updating this draft from that integration.

PR107 retains the proposed image-publication and Cloud Run release workflows,
advisory CODEOWNERS coverage and this activation runbook. Their account grants,
actual OIDC claim proofs, scoped Logging validation and isolated live rollout
drill remain separate work. All activation requirements below continue to apply independently after the inert source integration. Merging the policy/game-fix source does not
satisfy them, authorize cloud mutations or validate an old administrator review
code. Preserve both unset release flags and use a fresh plan bound to the current
reviewed PR107 head for any later administrator action.

[PR #100](https://github.com/jzwyrzyk/family-game-factory/pull/100) prepares the
metadata diagnostic client and connection runbook. Earlier connected-task
verification was reported separately; it does not mean every chat has that
identity. This combined preparation includes the reconciled diagnostic source
so the two access phases can be tested together before merge.
[PR #45](https://github.com/jzwyrzyk/family-game-factory/pull/45)
proposed separate Pages build and publication jobs. This implementation applies that
separation to Cloud Run image publication and traffic control. It uses the current
service publication archive and existing repositories. [Issue #46](https://github.com/jzwyrzyk/family-game-factory/issues/46)
also tracks coordinated Pages restoration, protocol probes, authenticated synthetic
journeys and real-device acceptance. Those remain distinct gates.

## Additional request-evidence reader

The [GitHub request-evidence workflow](PRODUCTION_DIAGNOSTICS.md) uses a separately approved broker and a dedicated caller. The ERROR sink and its whole-field restrictions below remain specific to the managed error-count client. The [request broker setup](PRODUCTION_DIAGNOSTICS_SETUP.md) explains why a request URL must be sanitized within Google Cloud and why only the broker may read its scoped source view.

## Diagnostics

`python3 scripts/ops/log_summary.py --hours 2 --identity-alias jems-diagnostics`
uses the shared managed-connection selector and normal `gcloud logging read`.
It preserves inherited proxy, certificate, credential and guard bindings; it does
not extract an access token or replace the managed authentication configuration.
The request fixes the dedicated log-view resource and project, error severity,
recent time window, region, three service names and request/system log names.
It requests at most 501 entries, reports counts for the first 500, and marks the
sample truncated when the extra entry exists. The CLI projects only the metadata
needed to validate scope and count categories, with its private-output format;
payloads and raw CLI errors are never printed or written by this client.
Malformed, oversized or unexpectedly long responses fail with sanitized errors.
The shared selector does not require an undocumented service-account field;
account identity and effective privilege limits remain explicitly unverified.
Cloud Run service and revision metadata can supply deployment readiness when a
revision fails to start. See Google's [scoped Logging command](https://docs.cloud.google.com/sdk/gcloud/reference/logging/read)
and [private projected formats](https://docs.cloud.google.com/sdk/gcloud/reference/topic/formats).

This source does not prove that the view exists, its payload restrictions are
effective, or the current managed environment can reach it. The permissions and
privacy proof below remain prerequisites. The client returns exit 0 for a valid
summary and exit 2 for CLI, identity, access, transport or metadata failure.

Provision a regional bucket `jems-diagnostics` in `us-east5`, a dedicated view
`cloud-run-errors`, and a project log-router sink whose inclusion filter is
[the fixed allowlist](../../ops/cloud-run-log-filter.txt). Use short retention
and assess duplicate-ingestion cost before enabling the sink. The sink admits
only request and platform logs for the three named services at ERROR or above.
Avoid application stdout/stderr, worker job logs, audit payloads, other resources
and any project-wide log-view grant.

The filter selects entries, and selected entries can still have sensitive fields.
Before binding the reader, configure bucket restricted fields `textPayload`,
`jsonPayload`, `protoPayload`, `httpRequest`, `labels`, and `sourceLocation`.
Cloud Logging does not support field restrictions for `operation`, `trace`,
or `spanId`, so the sink drops entries containing those fields. This can
exclude request errors with trace correlation. In an isolated test bucket
with synthetic markers, test the effective reader can see timestamps, platform resource labels
and severity, while marker values are absent even with an unfiltered direct API
request. Verify the restrictions and sink exclusions independently using controlled entries. If any required
field cannot be restricted, keep the view inaccessible and use a metadata-only
publisher instead. Separately verify broad log-view and field-access permissions
are absent for the diagnostic identity. Grant only `roles/logging.viewAccessor`
on the dedicated view. Route `logging.googleapis.com` through the managed cloud
allowlist after the grant is approved. Keep all existing routing intact.

`python3 scripts/ops/worker_status.py --workflow factory-smoke.yml` (or
`factory-private.yml`) summarizes recent worker runs and job outcomes from GitHub
Actions metadata. It requires repository-scoped Actions read access and GitHub API
egress. Use the existing private worker runbooks for privileged response. This
lane fetches no worker logs, job names, artifacts, application input or child content.

## Release workflow

1. Merge a reviewed change to `ops/publish-images.txt` to queue the image build at
   that exact main SHA. The application must pass the existing Arcade journeys
   workflow at that SHA before rollout. Image builds use credential-free runners
   and the same narrow committed archive as the existing publisher. The publication
   job receives the saved image artifact, requires immutable tags on the dedicated
   regional `jems-release-images` repository, and produces signed GitHub
   provenance for each digest. Existing `factory-services` digests remain valid
   baselines for traffic rollback. It never runs the image.
2. Read the serving baseline with
   `python3 scripts/ops/release.py --inspect-service factory-preview` in an
   authenticated read-only context. Use the returned baseline revision, digest
   and configuration fingerprint. A differing current template requires separate
   reconciliation. Existing zero-traffic revisions may contain deliberate config
   or approval differences. The controller refuses such a template instead of
   inheriting its settings into the serving configuration.
3. Commit `ops/compatibility.json` with `source`, `service`, `image`, `baseline`,
   `baselineImage` and `evidence`. Use the exact trusted GitHub Arcade journeys
   run URL on main for `evidence`. Review the candidate against the serving peers
   and prior Pages release for protocol, schema and saved-data compatibility.
   The workflow checks CI and image provenance. The evidence link establishes
   exact-source CI coverage, while compatibility with live peers still requires
   review and a release-specific smoke plan.
4. Commit `ops/release.json` with the same five identity fields, `operation`,
   `configuration` (the inspection fingerprint), and `compatibility` (SHA-256
   of the exact compatibility record bytes). CI validates this intent offline.
   Merging the intent on protected main triggers the fixed workflow. The workflow
   also supports a maintainer rerun from current main. Release actions take
   no dispatch arguments and fail if main has advanced before the update.
5. Start with `stage`. The workflow pins existing traffic and changes only the
   image and revision name in the existing template. It verifies the new
   revision is ready, the digest and configuration match, and the old revision
   retains all traffic. Existing zero-percent tags pinned to exact revisions are
   preserved. The etag prevents overwriting a concurrent update.
   Configuration fingerprints exclude revision-only output such as
   `scalingStatus`; the desired `scaling` settings remain part of the reviewed
   configuration. See Google's [Revision schema](https://docs.cloud.google.com/run/docs/reference/rest/v2/projects.locations.services.revisions).
6. Move to `canary` to send 5% to the same candidate. Check readiness, diagnostic
   errors and the authorized synthetic smoke for that candidate before submitting
   a separate `promote` intent. Promote requires the exact canary allocation
   and moves it to 100%. Use preview first for a coordinated preview/gateway
   rollout. Use a separate intent for the coach. The controller verifies the
   resulting allocation and revision metadata after each operation. These
   checks do not prove functional behavior or approve provider spending.
7. Submit `rollback` for the same candidate and serving baseline to restore 100%
   to the verified baseline. The rollback job uses traffic-only updates and skips
   its application-source CI and candidate-readiness gates. A **new rollback
   intent PR still must pass the protected-main required checks**; a broken
   current application can therefore block that automatic path. Preserve the
   existing authenticated operator route under the
   [preserved-state release contract](../assignment-006/RELEASE-CONTINUITY.md)
   for that case; verify the exact retained baseline and current traffic before
   preparing its traffic-only recovery command. Do not bypass branch protection or treat a workflow rerun of a
   previous promotion as a rollback. The controller refuses
   a changed baseline, unknown traffic split or newer revision. Restore Pages
   separately through the existing owner release path if that component changed.

An interrupted update can leave a revision or traffic change in place. Inspect
the actual revision and traffic before restarting a workflow. Retain the prior
compatible revision and immutable image. The controller does not cover data
migrations, paid activation, or privately authenticated runtime smoke.

## Consolidated account-level activation

Follow the [sole-maintainer decision](https://github.com/jzwyrzyk/family-game-factory/pull/107#issuecomment-7057935599).
Keep PR #107 in draft and leave `JEMS_IMAGE_PUBLISH_ENABLED` and
`JEMS_CLOUD_RUN_RELEASE_ENABLED` unset. This procedure is for the one-time
administrator setup. Review the exact grants and any billing impact before
applying them. Keep the existing worker tag ruleset and smoke setup intact.

### One-time owner procedure

Use the [guarded administrator program](../../scripts/ops/admin_setup.py) from a
clean checkout pinned to the reviewed PR head in the owner's authenticated Cloud
Shell. The default action plans both accounts without changing them. It requires
Python 3, `gh` with repository administrator access and `gcloud` with the owner's
existing Google Cloud authentication. The isolated drill also requires Docker.

Start with the [read-only handoff](ACTIVATION_REVIEW.md#one-read-only-handoff),
using the full reviewed PR107 SHA. Its local preflight reports missing tools and
refuses a different or dirty checkout without reading credentials or contacting
an API. The following account plan independently checks the current remote PR,
required checks and live account state. A local preflight pass is not evidence
of authentication, cloud access or setup completion.

```bash
python3 scripts/ops/admin_setup.py
```

Review the two JSON plans. Each offers a copy-ready apply invocation whose
review code binds the exact source, observed account state, target resources,
and actions. Run only the matching invocation after review. A changed plan
requires a new read-only run. The tool refuses unavailable reads, unexpected
grants, unknown protections, a moved PR head or either enable flag present.
If a call fails during apply, rerun the plan to inspect the partial state.
Only the preflighted resources are eligible for reuse. Keep receipts local
to Cloud Shell. Completed apply and dispatch phases save private JSON receipts
by default. A local receipt failure does not undo account changes; follow the
recovery procedure below instead of repeating an apply to recreate its evidence.

| Phase | Scope |
| --- | --- |
| `plan-github` / `apply-github` | Create and verify the [solo-maintainer ruleset](../../ops/github-main-ruleset.json) and exactly-main deployment environments. Require the six successful PR check contexts from GitHub Actions app ID `15368`. Preserve existing tag rules, require PRs with zero mandatory approvals, retain resolved conversations, and allow no bypass. CODEOWNERS remains advisory. |
| `plan-gcp` / `apply-gcp` | Require the GitHub protections and draft PR to verify before applying. Prepare the dedicated immutable `jems-release-images` registry and the two disabled, unbound providers and keyless service accounts. An explicitly approved existing isolated project enables the synthetic drill and optional Logging validation. |
| `verify` | Read back the GitHub protections and GCP preparation. With the same isolated options, verify the exact synthetic baseline image has 100% of its service traffic, verify Logging scope, and check live production serving state. This reads current state. The apply receipt records historical drill and redaction results. |
| `plan-claims` / `dispatch-claims` / `verify-claims` | After the separately reviewed inert merge, check exact protected-main workflow and probe bytes. Run the claims-only dispatch while both release flags are unset. Verify successful exact-head claim jobs and skipped release jobs. |
| `plan-production` | Read-only structured review of the exact proposed identities, resources and withheld privileges, including the separate operation-polling scope. It always reports activation as not ready and labels unverified prerequisites. Production identity activation requires separate explicit approval after both claim proofs and the isolated drill. This program has no production activation mode. |

### Receipt storage and recovery

Before an apply or dispatch reads account state, the program exclusively creates
`RECEIPT_PATH.pending` beside the requested receipt with private permissions
(`0600`). It writes and syncs a one-MiB reservation and syncs the directory entry.
This exercises the actual destination rather than relying on a permission check
or a reported free-space value. Before the first account action it also writes
and syncs the exact plan and review code as an incomplete intent. A storage or
sync failure at either of these steps stops before account mutations. Validation
failures before an action remove the unused reservation when possible.

After the requested actions and checks succeed, the program writes and syncs
the completion receipt, publishes it without replacing an existing path, and
syncs the directory before reporting success. Existing receipt or pending paths,
including symlinks, are never reused or overwritten. A remaining pending path
blocks another attempt using that path. Read-only `verify` and `verify-claims`
also use this storage check when `--receipt` is supplied.

The reservation is bounded to one MiB and is not a transaction with GitHub or
Google Cloud. Later filesystem failures or competing disk use can still prevent
completion. Once an account action starts, the pending evidence is retained on
failure; it may contain an incomplete intent or a partial final write. If the
account checks finish but saving the receipt fails, the status has a `receipt`
blocker and exits nonzero. The final file may already exist if the directory sync
failed. Neither file existence nor a nonzero exit establishes whether the account
changes completed or were undone. The program does not roll back account changes
because receipt storage failed, and a dispatch receipt does not prove that its
workflow jobs have subsequently succeeded.

Preserve earlier receipts and logs, restore writable local storage or select a
new private directory, and use `verify --receipt NEW_PATH` for fresh preparation
readback. Use `verify-claims --receipt NEW_PATH` for completed claims-only jobs.
Do not rerun an apply or dispatch to recover a receipt. The new verification
receipt records current state; it cannot reconstruct historical drill results,
redaction checks or the prior apply's serving-state comparison. A separately
captured shell log must also finish writing successfully; reserving receipt
storage does not establish that `tee` or another report destination succeeded.

### Published execution environment

The program cannot publish Codex environment settings. Publish the saved egress
draft adding `api.github.com` and `logging.googleapis.com` alongside
`run.googleapis.com` and `us-east5-run.googleapis.com`. Verify reachability from
the published **Codex** environment. Cloud Shell does not share that network.
Worker diagnostics use Actions read on the worker only.

A compromised sole maintainer can change source, privileged workflows and CI.
Review from a protected PR with pinned actions, separate scoped identities and
immutable digests. Permission increases, paid activation, destructive operations
and first release enrollment remain explicit owner decisions.

### Google Cloud scopes and cost

The production project is `family-game-factory-jzw` (number `1054529152893`),
region `us-east5`. Preparation refuses unexpected project roles for the named
identities and verifies the serving revisions and runtime identities of the
three fixed Cloud Run services. It never enables APIs, creates a project, changes
existing production registry access, or writes production Cloud Run services.

| Lane | Pool | Provider | Service account ID |
| --- | --- | --- | --- |
| `jems-image-publication` | `jems-github-image-publish` | `github-main` | `jems-image-publisher` |
| `jems-cloud-run-production` | `jems-github-cloud-run` | `github-main` | `jems-cloud-run-release` |

The program derives the exact issuer, audience, immutable individual subject,
repository IDs, environment, main ref and workflow path from the same
[claim validator](../../scripts/ops/oidc_claims.py) used by GitHub. Conditions
allow only GitHub-hosted main push or dispatch events. No principal can impersonate
either new service account through these disabled providers. The dedicated
registry keeps immutable tags and leaves prior digests in `factory-services`
available for rollback. Repository access and Cloud Run update roles remain
withheld.

To include the isolated drill in a plan, add
`--drill-project jems-ops-drill-<suffix> --acknowledge-isolated-cost` using a
pre-existing, approved billed project isolated from production connectivity,
data, secrets and worker trust. The program refuses a production project
identifier or project number. It builds and pulls two fixed SHA-labeled
synthetic images, creates the private single-instance service with a create-only
Cloud Run API method, verifies its dedicated IAM, and performs stage, 5% canary,
promotion and traffic-only rollback using the isolated operator account. The
operator's update rights bind only to the synthetic service and its act-as
grant only to the synthetic runtime account. Its image-download permission is
Artifact Registry Reader on only that isolated project's `jems-drill` repository;
the plan and verification reject extra grants and do not add a production
registry grant. The keeper of the isolated project
owns cost and cleanup. The program never creates or deletes that project.

Add `--log-gib-day <estimated-selected-errors>` only after reviewing the gross
volume and regional price. The read-only estimate shows seven days of retained
volume and 30 days of ingestion at the stated reference rate, without assuming
free tier or that duplicate ingestion is free. A fresh plan is required after
a cost change. Logging setup requires Google IAM Policy Troubleshooter to
return explicit denial for unrestricted project log reads and restricted-field
access by the production diagnostics identity. An unavailable or inconclusive
check blocks log setup. The synthetic proof writes two canary entries only in the
isolated project. It confirms the controls reached the bucket, verifies the
reader can see metadata without restricted fields and checks project-wide read
denial. Only after that proof does the program create or verify the production
seven-day restricted bucket, exact sink, and view-only grant. Existing sinks,
log policy and production account bindings are preserved. The scoped live
diagnostic client can then verify the actual production view through Codex.

Keep PR #107 in draft until the active GitHub protections and isolated drill
receipt have been reviewed. Leave both release flags unset when merging the
inert source and proving the exact GitHub claims. Reinspect the private coach's
actual serving/template state before enrollment; earlier observed speech and
spending drift is a historical finding, not a current live read. Any remaining
configuration difference blocks the affected service until separately reconciled.

## DEV and TEST integration boundary

[DEV → TEST → PROD](../development/DEV-TEST-PROD.md) is the authoritative new environment method. Reuse this merged production controller, provenance, configuration, compatibility and traffic safeguards. The new source foundation does not alter the active cutover intent or production workflow. A later reviewed integration must add exact TEST-manifest/owner-approval prerequisites and reuse immutable artifacts; current source validation alone does not establish that integration. DEV/TEST deployment identities belong in a separate project, and routine operations must not depend on Cloud Shell.
