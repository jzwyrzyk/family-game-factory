# Jems operational access and release controls

This change adds a release controller and scoped diagnostic clients. Each production
operation requires a maintainer-reviewed intent on protected main. The repository opt-ins and
Google grants are initially absent. Existing Pages, sandbox publication, smoke,
worker trust and provider approval retain their current release paths.

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
drill remain separate work. The draft hold and all activation requirements below
still apply to that remainder. Merging the policy/game-fix source does not
satisfy them, authorize cloud mutations or validate an old administrator review
code. Preserve both unset release flags and use a fresh plan bound to the current
reviewed PR107 head for any later administrator action.

[PR #100](https://github.com/jzwyrzyk/family-game-factory/pull/100) established the
metadata diagnostics identity. [PR #45](https://github.com/jzwyrzyk/family-game-factory/pull/45)
proposed separate Pages build and publication jobs. This implementation applies that
separation to Cloud Run image publication and traffic control. It uses the current
service publication archive and existing repositories. [Issue #46](https://github.com/jzwyrzyk/family-game-factory/issues/46)
also tracks coordinated Pages restoration, protocol probes, authenticated synthetic
journeys and real-device acceptance. Those remain distinct gates.

## Diagnostics

`python3 scripts/ops/log_summary.py --hours 2` uses the existing managed diagnostic
connection and reads one bounded page from a dedicated Cloud Logging view. It emits
only counts by fixed service, request/system category and severity. A truncated
page is reported explicitly. Cloud Run service and revision metadata can supply
deployment readiness when a revision fails to start.

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
6. Move to `canary` to send 5% to the same candidate. Check readiness, diagnostic
   errors and the authorized synthetic smoke for that candidate before submitting
   a separate `promote` intent. Promote requires the exact canary allocation
   and moves it to 100%. Use preview first for a coordinated preview/gateway
   rollout. Use a separate intent for the coach. The controller verifies the
   resulting allocation and revision metadata after each operation. These
   checks do not prove functional behavior or approve provider spending.
7. Submit `rollback` for the same candidate and serving baseline to restore 100%
   to the verified baseline. Rollback uses traffic-only updates and remains
   available if current application CI or candidate readiness fails. It refuses
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
to Cloud Shell. Completed apply phases save private JSON receipts by default.

| Phase | Scope |
| --- | --- |
| `plan-github` / `apply-github` | Create and verify the [solo-maintainer ruleset](../../ops/github-main-ruleset.json) and exactly-main deployment environments. Require the six successful PR check contexts from GitHub Actions app ID `15368`. Preserve existing tag rules, require PRs with zero mandatory approvals, retain resolved conversations, and allow no bypass. CODEOWNERS remains advisory. |
| `plan-gcp` / `apply-gcp` | Require the GitHub protections and draft PR to verify before applying. Prepare the dedicated immutable `jems-release-images` registry and the two disabled, unbound providers and keyless service accounts. An explicitly approved existing isolated project enables the synthetic drill and optional Logging validation. |
| `verify` | Read back the GitHub protections and GCP preparation. With the same isolated options, verify the exact synthetic baseline image has 100% of its service traffic, verify Logging scope, and check live production serving state. This reads current state. The apply receipt records historical drill and redaction results. |
| `plan-claims` / `dispatch-claims` / `verify-claims` | After the separately reviewed inert merge, check exact protected-main workflow and probe bytes. Run the claims-only dispatch while both release flags are unset. Verify successful exact-head claim jobs and skipped release jobs. |
| `plan-production` | Read-only review of the withheld privilege boundaries. Production identity activation requires separate explicit approval after both claim proofs and the isolated drill. This program has no production activation mode. |

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
grant only to the synthetic runtime account. The keeper of the isolated project
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
inert source and proving the exact GitHub claims. Private coach remains blocked
while the staged speech settings differ from the serving baseline.
