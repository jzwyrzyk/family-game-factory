# Publish reviewed gateway and preview images

The service path in `scripts/deployment/build.py` uses one regional Cloud Build default-pool job to build the existing gateway and preview Dockerfiles and publish them to the existing Artifact Registry repository. This replaces local Docker publication. No Cloud Shell Docker/Skopeo retry, private pool, GitHub federation or deployment pipeline is needed. Publishing is a release operation, never a per-game requirement.

This PR does not enable APIs, create cloud resources, grant permissions, publish images, deploy services or activate AI. First live publication requires separate owner authorization. Use the private owner handoff for the approved source pins, actual resource names and rollout decisions.

## Commands and source boundary

Run the reviewed publisher code, supplying the separately reviewed **full commit SHA** for image contents. Do not check out an old application commit and accidentally run its obsolete publisher. The default is a deterministic offline JSON plan with no external commands:

```sh
python3 scripts/deployment/build.py --region REGION --reviewed-source-sha FULL_COMMIT_SHA
```

`--preflight` reads prerequisite metadata only. `--execute` uploads the staged archive and submits one billable build. They are mutually exclusive. `--build-id BUILD_UUID` recovers a previous submission by polling and verifying it; it never submits another build. The service modes never invoke local Docker or deploy anything. The existing local sandbox mode remains separate and unchanged.

The source archive contains only committed build inputs selected with `git ls-tree` and `git show` at the supplied SHA. It excludes dirty working-tree edits, untracked files, Git metadata, hidden environment/config directories, key files, private JSON configuration, token files, local dependencies, server test fixtures and unrelated workspace contents. Credentials/build secrets are never supplied. As with any reviewed source, a credential deliberately embedded inside a committed code file must be caught in code review; filename filters are not a general secret scanner.

Archive names/content/order/modes/timestamps are stable, yielding a deterministic source hash. The build config is generated separately and is not uploaded as application source. Both Dockerfiles, their non-root ownership, the package lockfile and existing dependency-install restrictions are retained. Cloud Build runs the two builds sequentially so identical layers can be reused.

The existing Node base and supported Google Docker builder use maintained tags. This does not promise identical rebuilt image bytes. The source selection is immutable; **the actual published digest is the release identity**.

## Identity and prerequisite setup

Use a dedicated, keyless service-build identity, distinct from gateway, preview and sandbox runner identities. It needs only:

| Resource scope | Builder role |
| --- | --- |
| Existing service-image Artifact Registry repository | `roles/artifactregistry.writer` |
| Dedicated source-only staging bucket | `roles/storage.objectViewer` |
| Build project | `roles/logging.logWriter` |

The build config specifies this identity explicitly, `CLOUD_LOGGING_ONLY`, `E2_MEDIUM` and a 20-minute timeout. No default Compute Engine/legacy build-account privileges are expanded. Keep Google's separate managed Cloud Build service agent with its standard `roles/cloudbuild.serviceAgent`; do not give that role to the builder. Same-project builds do not need a new Token Creator grant.

One-time setup, separately authorized by the owner, enables missing Cloud Build/IAM/Artifact Registry/Logging/Storage APIs and creates the dedicated account plus a regional source-only bucket. The bucket needs uniform bucket-level access, enforced public access prevention, one-day expiry for `source/` objects and disabled soft deletion for these disposable public sources. Never reuse a data bucket. The owner handoff provides the copy-paste setup sequence; these operations are deliberately absent from the publisher.

The submitting owner needs:

- `cloudbuild.builds.create/get`, `serviceusage.services.use` on the project; `cloudbuild.builds.list` for lost-response recovery. Standard roles: `roles/cloudbuild.builds.editor` and `roles/serviceusage.serviceUsageConsumer`.
- `iam.serviceAccounts.actAs` on the dedicated builder only (`roles/iam.serviceAccountUser`).
- `storage.objects.create/get` on the source bucket (`roles/storage.objectUser`), plus `storage.buckets.get` for metadata.
- `artifactregistry.repositories.get` and `artifactregistry.dockerimages.get` on the existing repository (`roles/artifactregistry.reader`).
- Metadata/IAM reads for preflight: `serviceusage.services.list`, `resourcemanager.projects.get/getIamPolicy`, applicable folder/organization `get/getIamPolicy`, `artifactregistry.repositories.get/getIamPolicy`, `storage.buckets.get/getIamPolicy`, `iam.serviceAccounts.get`.
- `logging.logEntries.list` (`roles/logging.viewer`) to inspect build diagnostics.

Reuse existing owner permissions; the publisher never grants them. One-time setup requires API enablement, service-account creation, bucket creation/configuration and scoped IAM-policy editing. Builder permissions exclude Cloud Run, Firestore, Secret Manager, model credentials, GitHub and runner administration.

Preflight verifies enabled APIs, the existing standard Docker repository, an enabled dedicated builder, the regional private source bucket and the expected scoped grants. It rejects unexpected direct grants to the builder, including ancestor grants. An empty repository IAM policy alone does not establish effective access. Group/domain grants and impersonation policy require an owner review at setup; this is not a general IAM/deny-policy simulator. The first authorized build proves submission/upload/actAs and registry connectivity.

## Successful publication and recovery

On complete success stdout is a JSON receipt containing the reviewed source SHA, build ID, source archive hash, resolved source object/generation and **both immutable image references**. Progress, build ID and the Cloud Build console URL go to stderr. Save the receipt as private release evidence outside the checkout. Tags identify builds for discovery; deployment authorization must use only `image@sha256:…` references.

The publisher verifies successful build status, expected identity/source tags/build commands/image names, both digest results, and independently checks each digest against Artifact Registry using its immutable reference. A failed/partial build or missing/mismatched digest does not produce a successful receipt.

If polling disconnects or times out, recover without paying for another build:

```sh
python3 scripts/deployment/build.py --region REGION --reviewed-source-sha FULL_COMMIT_SHA \
  --build-id BUILD_UUID > service-images.json
```

Recovery reports `null` for the local archive hash because it does not restage source; retain the original submission log. If submission response is lost, inspect Cloud Build history for its `source-FULL_COMMIT_SHA` tag before attempting another submission. If registry verification fails after build success, recover by that same ID to repeat metadata verification only. If the build actually fails, inspect its console diagnostics, fix the specific prerequisite and authorize a fresh build as needed. A failed push may leave a partial image: do not deploy it. There is no automatic retry/resubmission, privilege escalation or local Docker fallback.

Cloud Build removes its disposable worker. The client removes local staging on normal completion/failure; bucket lifecycle expiry handles uploaded source and failed-upload remnants. Lifecycle processing is asynchronous. Existing Cloud Logging/build metadata retention preserves diagnostics. Publication cleanup never deletes service images, prior revisions, services, data or accepted sandbox artifacts.

## Costs and separate rollout

[Cloud Build pricing](https://cloud.google.com/build/pricing), checked November 17, 2026, lists `E2_MEDIUM` at $0.003/build-minute in the supported US region. A 5–10 minute combined build is approximately $0.015–$0.030 compute; the 20-minute execution timeout is approximately $0.060 per submission, excluding storage, logging, network, taxes and exceptional billing behavior. No free tier is assumed. Repeated publications retain additional image versions; no image-deletion policy is introduced.

After owner review of the receipt, deployment remains a **separate authorization**. Update the existing preview first, then gateway, by immutable digest. Save prior revision/traffic metadata; use an image-only update and `--no-traffic`, verify readiness and unchanged identities/URLs/env/secret mounts/data settings/limits, then route traffic and check health. Restore the saved prior traffic split if needed. Do not run the old bootstrap/IAM deployment path merely to update images.

Review/release the compatible website only after backend verification. Preserve disabled paid execution throughout publication and inactive rollout. A later owner-only pilot has its own explicit authorization and allowance. Do not repeat accepted sandbox tests or change worker pins merely because the service publisher changed. Existing Math/Language Arts, mouse/touch, replay, physics, generated gameplay and security behavior are unaffected.

## Tests

`npm run test:deployment` covers offline plans, exact source requirements, real Git staging with dirty/untracked/private fixtures, both images in one build, read-only preflight/recovery, inherited IAM rejection, bounded polling, credential-safe diagnostics and failed/partial/unverified digest rejection. Existing sandbox/deployment contracts are preserved. The normal full PR CI runs the application, Math/Language Arts, creative/generated/mobile and security journeys; exact head/run identifiers are recorded on the draft PR. Offline CI is not a claim of successful live publication.

References: [user-managed build identity](https://docs.cloud.google.com/build/docs/securing-builds/configure-user-specified-service-accounts), [gcloud builds submit](https://docs.cloud.google.com/sdk/gcloud/reference/builds/submit), [Cloud Build access](https://docs.cloud.google.com/build/docs/securing-builds/configure-access-to-resources).
