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
`jsonPayload`, `protoPayload`, `httpRequest`, `labels`, `sourceLocation`,
`operation`, `trace`, and `spanId`. In an isolated test bucket with synthetic
markers, test the effective reader can see timestamps, platform resource labels
and severity, while marker values are absent even with an unfiltered direct API
request. Verify the platform accepts the full restriction list. If any required
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

1. Configure a main ruleset requiring pull requests and current, successful
   **Jems operations policy**, **Documentation references**, and the existing
   **browser** application job. Confirm the exact GitHub check names from a PR
   run. Keep path-filtered jobs outside the universal ruleset. Require resolved
   conversations, block force pushes/deletion, and require code-owner review on
   protected release files. Configure the owner or another authorized reviewer
   so authored PRs can receive a valid review. Keep a documented emergency
   rollback path available without granting routine bypass to automation.
2. Create environments `jems-image-publication` and `jems-cloud-run-production`
   restricted to protected main. Choose reviewers for first activation and
   decide whether reviewing each intent PR is sufficient for routine releases.
   Use a repository-scoped GitHub connection that can create branches and PRs,
   read checks, and merge when rules are satisfied. This trigger design requires
   no repo-wide Actions-write token or reusable operator Cloud Shell session.
3. Provision separate, keyless publication and rollout service accounts. For each,
   use a dedicated GitHub OIDC trust restricted to repository ID `1458033181`,
   numeric owner ID verified by the administrator, exact repository, protected
   `refs/heads/main`, the named environment, allowed event types `push` and
   `workflow_dispatch`, and the corresponding exact `workflow_ref` ending
   `@refs/heads/main`. Bind only the matched external subject. The publisher needs
   write access to the fixed Artifact Registry repository. The rollout account
   needs read access to that repository for provenance, revision/service reads,
   service updates on the three existing services, and any operation polling
   permission Google requires at its supported scope. If Cloud Run requires
   `iam.serviceAccounts.actAs`, grant it only on the exact existing runtime
   identities after reviewing their privilege. A workflow with service-update
   and act-as access could change a runtime despite the controller's software
   checks. Review that trust boundary before granting it. No IAM-write,
   Secret Manager accessor, runtime service account keys or worker grants are
   required by this design.
4. Set environment variables `JEMS_PUBLISH_WIF_PROVIDER`,
   `JEMS_PUBLISH_SERVICE_ACCOUNT`, `JEMS_RELEASE_WIF_PROVIDER`, and
   `JEMS_RELEASE_SERVICE_ACCOUNT` in the corresponding protected environments.
   Leave `JEMS_IMAGE_PUBLISH_ENABLED` and `JEMS_CLOUD_RUN_RELEASE_ENABLED` unset
   until separate approval covers registry cost, release scope and the first
   staging and rollback drill. Add only the diagnostic view and read-network
   bindings described above. Keep paid flags, worker OIDC, active revisions
   and secret references outside this setup.
