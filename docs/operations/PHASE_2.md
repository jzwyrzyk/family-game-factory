# Jems operational access and release controls

This change adds a release controller and scoped diagnostic clients. Each production
operation requires a maintainer-reviewed intent on protected main. The repository opt-ins and
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

Follow the [sole-maintainer decision](https://github.com/jzwyrzyk/family-game-factory/pull/107#issuecomment-7057935599).
Keep PR #107 in draft and leave `JEMS_IMAGE_PUBLISH_ENABLED` and
`JEMS_CLOUD_RUN_RELEASE_ENABLED` unset. This procedure is for the one-time
administrator setup. Review the exact grants and any billing impact before
applying them. Keep the existing worker tag ruleset and smoke setup intact.

### GitHub administration

1. In Settings → Rules → Rulesets, apply the
   [reviewed main ruleset](../../ops/github-main-ruleset.json) as an active branch
   ruleset. Confirm these check contexts appear on the exact PR head and are
   published by the GitHub Actions app (ID `15368`). An administrator using
   `gh` can inspect `gh api repos/jzwyrzyk/family-game-factory/commits/<PR-head>/check-runs --jq '.check_runs[] | [.name,.app.id,.app.slug,.conclusion] | @tsv'`.
   If the named ruleset is absent and there is no overlapping branch policy,
   create it with `gh api -X POST repos/jzwyrzyk/family-game-factory/rulesets --input ops/github-main-ruleset.json`
   from the reviewed checkout. If it already exists, compare its fields before
   updating. Do not create a duplicate or replace another ruleset. Verify the
   effective rule for `main` and the repository plan's enforcement support.
2. Require PRs with **zero mandatory human approvals** and strict current-head
   checks. Keep resolved conversations, no deletion, no force push and no
   bypass. Leave stale-approval dismissal, last-push approval and required
   code-owner approval off. [.github/CODEOWNERS](../../.github/CODEOWNERS)
   records sole ownership for review routing. The required GitHub Actions
   checks are **Jems operations policy**, **Documentation references**,
   **browser**, **learning**, **creative**, and **private-coach-image**.
   Path-filtered jobs remain outside the global ruleset.
3. Create `jems-image-publication` and `jems-cloud-run-production` under
   Settings → Environments. Set Deployment branches and tags to **Selected
   branches and tags**, add one branch rule for literal `main`, and add no
   tag rules. Leave required reviewers and prevent self-review off.
   Inspect the environment settings and confirm exact-branch-only deployment.
   Both privileged workflows also require GitHub's protected-ref context.
4. Publish the saved Codex egress draft containing `api.github.com` and
   `logging.googleapis.com` alongside the existing Cloud Run hosts. Use a
   repository-scoped GitHub connection with Contents/PR write and check read
   on the application repo, and Actions read on the worker only. No Actions
   write token is needed. Confirm the reads from Codex before relying on
   automated incident triage.

The maintainer can change source, CI and the privileged workflows through a
PR. A compromised maintainer can therefore change those safeguards. Pinned
actions, scoped keyless grants, signed digests, exact workflow claims and
guarded serving-state transitions reduce exposure. They provide no
independent human review. Permission increases, paid activation,
destructive actions and first release enrollment remain explicit owner decisions.

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

- Create `jems-release-images` as a regional Docker repository with immutable
  tags (`gcloud artifacts repositories create jems-release-images --project=family-game-factory-jzw --location=us-east5 --repository-format=docker --immutable-tags`).
  Verify `dockerConfig.immutableTags == true`. Bind `roles/artifactregistry.writer`
  there only for `jems-image-publisher@family-game-factory-jzw.iam.gserviceaccount.com`.
  Bind `roles/artifactregistry.reader` there only for
  `jems-cloud-run-release@family-game-factory-jzw.iam.gserviceaccount.com`.
  Leave the existing `factory-services` registry, tags and access policy intact.
  No cleanup policy should remove retained rollback images.
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

### Isolated drill and evidence

Run this section with an approved, billed nonproduction project named
`jems-ops-drill-<suffix>` with no production connectivity, application data,
provider secrets or worker trust. Enable the needed APIs only under the approved
budget. Use the exact PR head being reviewed and an authenticated administrator
Cloud Shell. This drill uses fixed synthetic images from [ops/drill](../../ops/drill)
and the [same transition controller](../../scripts/ops/release.py) as production.

1. Create an immutable Docker repository named `jems-drill` in `us-east5`.
   Create `jems-release-drill-runtime` with no workload grants and a separate
   `jems-release-drill-operator` service account. Give the operator a custom
   role on the single synthetic service with `run.services.get`,
   `run.services.getIamPolicy`, `run.services.update` and `run.revisions.get`.
   Scope `iam.serviceAccounts.actAs` to the synthetic runtime account if required.
   If needed, grant `run.operations.get` at the isolated project boundary via a
   separate custom role. The administrator may impersonate only the drill
   operator using its service-account IAM policy for the drill. Use no keys.
2. In the reviewed checkout, set `DRILL_PROJECT` to the approved project ID and
   run the following after the registry and runtime identity are provisioned.
   The deploy command is solely for a **new** synthetic service. If it already
   exists, inspect its state and use the drill's read-only plan rather than
   re-running creation.

   ```bash
   set -euo pipefail
   [[ "$DRILL_PROJECT" =~ ^jems-ops-drill-[a-z0-9]{3,12}$ ]]
   number="$(gcloud projects describe "$DRILL_PROJECT" --format='value(projectNumber)')"
   [[ "$number" =~ ^[0-9]{6,20}$ && "$number" != 1054529152893 ]]
   image="us-east5-docker.pkg.dev/$DRILL_PROJECT/jems-drill/synthetic"
   gcloud auth configure-docker us-east5-docker.pkg.dev --quiet
   for marker in baseline candidate; do
     docker build --platform linux/amd64 --build-arg "DRILL_MARKER=$marker" \
       -t "$image:$marker" ops/drill
     docker push "$image:$marker"
   done
   baseline="$(gcloud artifacts docker images describe "$image:baseline" --project="$DRILL_PROJECT" --format='value(image_summary.digest)')"
   candidate="$(gcloud artifacts docker images describe "$image:candidate" --project="$DRILL_PROJECT" --format='value(image_summary.digest)')"
   [[ "$baseline" =~ ^sha256:[a-f0-9]{64}$ && "$candidate" =~ ^sha256:[a-f0-9]{64}$ && "$baseline" != "$candidate" ]]
   gcloud run deploy jems-release-drill --project="$DRILL_PROJECT" --region=us-east5 \
     --image="$image@$baseline" --ingress=internal --no-allow-unauthenticated \
     --service-account="jems-release-drill-runtime@$DRILL_PROJECT.iam.gserviceaccount.com" \
     --min-instances=0 --max-instances=1 --labels=jems-isolated-drill=true
   ```

3. Read back the service identity, ingress, IAM and immutable baseline. With the
   scoped operator grants confirmed, run the following in the same shell. The
   first command is read-only. The second records stage, 5% canary, promotion
   and rollback. It attempts the same guarded rollback if a canary or
   promotion response is uncertain. Verify the baseline again after completion.

   ```bash
   drill=(python3 scripts/ops/drill.py --project "$DRILL_PROJECT"
     --project-number "$number" --candidate "$image@$candidate")
   export CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT="jems-release-drill-operator@$DRILL_PROJECT.iam.gserviceaccount.com"
   "${drill[@]}"
   "${drill[@]}" --apply
   unset CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT
   ```

4. Record the active ruleset, the two exact-branch environments, OIDC claim
   evidence, grant scope, synthetic log redaction checks and drill receipts.
   Local smoke and fixture tests remain separate from a real Cloud Run drill.
   Return this one evidence set for verification and the readiness recommendation.
   Keep both production flags unset while these checks are outstanding. Keep
   the coach release blocked while its staged speech configuration differs from
   the serving baseline.
