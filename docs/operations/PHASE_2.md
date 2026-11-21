# Jems operational access and release controls

This change adds a release controller and scoped diagnostic clients. Each production
operation requires a reviewed intent on protected main. The repository opt-ins and
Google grants are initially absent. Existing Pages, sandbox publication, smoke,
worker trust and provider approval retain their current release paths.

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
   job receives the saved image artifact, pushes to the fixed regional repository
   and produces signed GitHub provenance for each digest. It never runs the image.
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
   also supports a maintainer rerun from current main. It takes no arbitrary
   dispatch inputs and fails if main has advanced before the update.
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

Keep PR #107 in draft and leave `JEMS_IMAGE_PUBLISH_ENABLED` and
`JEMS_CLOUD_RUN_RELEASE_ENABLED` unset through this checklist. This setup
authorizes identities and review controls only. The first hosted build,
staging and rollback drill need a separate approved release intent.

### GitHub administration

1. Create an **Active** repository branch ruleset for `refs/heads/main`. Require
   a pull request, one approval, code-owner approval for the paths in
   [.github/CODEOWNERS](../../.github/CODEOWNERS), dismissal of stale approvals,
   approval of the latest reviewable push, resolved conversations, and protection
   against deletion and force pushes. Set no automation bypass. Check that the
   owner and an independent reviewer can approve the privileged files. If the
   current owner is the PR author, add the independently approved reviewer to
   CODEOWNERS in the draft first. Avoid an unreviewable owner-only rule.
2. Require GitHub Actions checks **Jems operations policy**,
   **Documentation references**, **browser**, **learning**, **creative** and
   **private-coach-image**. Select them from the PR's reported status checks.
   These are always scheduled on PRs. Leave path-filtered suites out of the
   global required list. Verify a draft check cannot substitute for the final
   head and inspect the active rule before marking this PR ready.
3. Create `jems-image-publication` and `jems-cloud-run-production` under
   Settings → Environments. Select only `main` as a deployment branch,
   enable required reviewers and prevent self-review. Verify protection by
   inspecting the settings while the workflow opt-ins remain unset. Plan a
   documented, independently authorized emergency rollback path.
4. Publish the Codex egress draft containing `api.github.com` and
   `logging.googleapis.com` alongside the existing Cloud Run hosts. Use a
   repository-scoped GitHub connection with Contents/PR write and check read
   on the application repo, and Actions read on the worker only. No Actions
   write token is needed. Confirm these reads before relying on automated
   incident triage.

### Google Cloud administration

Use project `family-game-factory-jzw` (number `1054529152893`) and region
`us-east5`. First inspect existing resource names, effective IAM, API state,
and the projected Logging ingestion and storage cost. Stop on a name collision
or broader inherited grant. Enable required APIs only under explicit approval.

| Environment | Dedicated pool | Provider | Service account ID | Exact workflow |
| --- | --- | --- | --- | --- |
| `jems-image-publication` | `jems-github-image-publish` | `github-main` | `jems-image-publisher` | `.github/workflows/jems-service-images.yml` |
| `jems-cloud-run-production` | `jems-github-cloud-run` | `github-main` | `jems-cloud-run-release` | `.github/workflows/jems-cloud-run-release.yml` |

For each row create one keyless service account and one pool with a single OIDC
provider. Use issuer `https://token.actions.githubusercontent.com`, Google's
default provider-resource audience, and map `google.subject=assertion.sub`.
The provider condition must be the following with the row's exact environment
and workflow substituted. The repository was created after the immutable
subject rollout cutoff, and both workflows check GitHub's `github.ref_protected`
context before running their privileged jobs. Confirm the exact immutable
subject and selected claim values with GitHub's OIDC settings and a controlled
claims-only test before binding the principal. Never log a token. Stop on any
difference from the reviewed condition.

```text
assertion.repository_id == '1458033181' &&
assertion.repository_owner_id == '356692244' &&
assertion.repository == 'jzwyrzyk/family-game-factory' &&
assertion.ref == 'refs/heads/main' &&
assertion.runner_environment == 'github-hosted' &&
assertion.environment == '<environment>' &&
assertion.workflow_ref == 'jzwyrzyk/family-game-factory/<workflow>@refs/heads/main' &&
assertion.event_name in ['push', 'workflow_dispatch'] &&
assertion.sub == 'repo:jzwyrzyk@356692244/family-game-factory@1458033181:environment:<environment>'
```

Bind `roles/iam.workloadIdentityUser` on each dedicated service account only to
the exact principal

```text
principal://iam.googleapis.com/projects/1054529152893/locations/global/workloadIdentityPools/<pool>/subject/repo:jzwyrzyk@356692244/family-game-factory@1458033181:environment:<environment>
```

- Bind `roles/artifactregistry.writer` for
  `jems-image-publisher@family-game-factory-jzw.iam.gserviceaccount.com` on
  the regional `factory-services` repository only. Bind
  `roles/artifactregistry.reader` there for
  `jems-cloud-run-release@family-game-factory-jzw.iam.gserviceaccount.com`.
- Create the custom role `jemsCloudRunRelease` with `run.services.get`,
  `run.services.update`, and `run.revisions.get`. Bind it on
  `factory-preview`, `factory-gateway`, and `factory-coach-private`
  individually. If operation polling requires `run.operations.get` at the
  project boundary, review and bind a separate one-permission role
  `jemsCloudRunOperationReader`. If Cloud Run requires
  `iam.serviceAccounts.actAs`, bind `roles/iam.serviceAccountUser` only on
  the exact current runtime service accounts after recording and reviewing
  their effective privileges. Service update plus act-as permits config changes
  if the protected workflow is compromised. Approve that trust boundary before
  granting either capability. Keep the publisher free of rollout rights.
- Set `JEMS_PUBLISH_WIF_PROVIDER` and `JEMS_RELEASE_WIF_PROVIDER` in the
  respective GitHub environments to
  `projects/1054529152893/locations/global/workloadIdentityPools/<pool>/providers/github-main`.
  Set `JEMS_PUBLISH_SERVICE_ACCOUNT` or `JEMS_RELEASE_SERVICE_ACCOUNT` to
  the corresponding account email. Leave the two enable flags unset.
- Create the dedicated log bucket and restricted fields described in
  [Diagnostics](#diagnostics), with proposed retention of **7 days**. Create
  view `cloud-run-errors` filtered to `resource.type="cloud_run_revision"`.
  After the synthetic field restriction test succeeds, create project sink
  `jems-cloud-run-errors` to
  `logging.googleapis.com/projects/family-game-factory-jzw/locations/us-east5/buckets/jems-diagnostics`
  with the checked-in [inclusion filter](../../ops/cloud-run-log-filter.txt).
  If the same-project sink reports a writer that needs a grant, bind
  `roles/logging.bucketWriter` on the project with an IAM condition restricted
  to `resource.name == "projects/family-game-factory-jzw/locations/us-east5/buckets/jems-diagnostics"`.
  Verify the condition works for the exact destination. Grant the existing diagnostics account
  `roles/logging.viewAccessor` on this view only. Verify effective reader and
  writer access with the approved synthetic markers before relying on the view.
  Keep existing subscriptions, sinks, log retention and worker trust intact.

Record the active ruleset, eligible reviewer, environment protections, identity
provider conditions, exact resource bindings, and synthetic redaction checks.
After those are reviewed, the first separately approved release should rehearse
staging and rollback on an isolated equivalent before permitting production
canary operations. Keep the coach release blocked while its staged speech
configuration differs from the serving baseline.
