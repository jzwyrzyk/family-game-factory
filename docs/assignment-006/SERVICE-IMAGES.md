# Publish reviewed gateway and preview images

## Pinned sandbox image publication after obsolete OCI contract failure

The application source pin required by the current private worker is `b472c224f7e8ef8ab0986ce6f755728d7cc63d46`. On November 20, production gVisor smoke [run 44830655674](https://github.com/family-game-factory-lab/family-game-factory-worker/actions/runs/44830655674) showed that the previously configured GHCR image built from `31f8c463f95260a2b5c64f442a53adfe603a2228` still uses a bare-game stdin contract, whereas the reviewed worker source sends a `{game,...}` envelope. The resulting `GENERATED_ARTIFACT_REJECTED` is a real incompatible package, not grounds to relax source validation. VM/runner cleanup and smoke authorization reset were both verified.

Use the new [source-pinned, manual GitHub-hosted GHCR publisher](SANDBOX-PUBLISH.md) to build and publish a **replacement immutable OCI digest** through a cloud-to-cloud workflow with no local Docker or workstation upload. The workflow tests bundled source hashes and the envelope protocol before publishing, but **does not run real production gVisor** or activate AI. Retain the old digest for audit/rollback; never keep testing it against an incompatible new source. A separate owner-run, billable sandbox security/gameplay acceptance is still mandatory before enabling adult paid generation.

## Continuity of an approved private adult release

**Do not use `scripts/deployment/deploy.py` for an existing service.** That historical bootstrap intentionally resets AI approvals to inactive and now refuses any existing gateway/preview service or private-config secret before mutations. Use [Adult AI release continuity](RELEASE-CONTINUITY.md) for the preserved-state operating contract and read-only live audit. The service-image publisher in this document only publishes OCI images; it does not deploy them or toggle provider availability. Existing approved Cloud Run settings must be preserved by a separate, verified in-place rollout.

The service path in `scripts/deployment/build.py` uses one regional Cloud Build default-pool job to build the existing gateway and preview Dockerfiles and publish them to the existing Artifact Registry repository. This replaces local Docker publication. No Cloud Shell Docker/Skopeo retry, private pool, GitHub federation or deployment pipeline is needed. Publishing is a release operation, never a per-game requirement.

The publisher does not enable APIs, create cloud resources, grant permissions, deploy services or activate AI. Perform live publication within the existing owner-authorized release scope. Use the private owner handoff for the approved source pins, actual resource names and rollout decisions.

## Commands and source boundary

Run the reviewed publisher code, supplying the separately reviewed **full commit SHA** for image contents. Do not check out an old application commit and accidentally run its obsolete publisher. The default is a deterministic offline JSON plan with no external commands:

```sh
python3 scripts/deployment/build.py --region REGION --reviewed-source-sha FULL_COMMIT_SHA
```

`--preflight` reads prerequisite metadata only. `--execute` uploads the staged archive and submits one billable build. They are mutually exclusive. `--build-id BUILD_UUID` recovers a previous submission by polling and verifying it; it never submits another build. The service modes never invoke local Docker or deploy anything. The existing local sandbox mode remains separate and unchanged.

The source archive contains only committed build inputs selected with `git ls-tree` and `git show` at the supplied SHA. It excludes dirty working-tree edits, untracked files, Git metadata, hidden environment/config directories, key files, private JSON configuration, token files, local dependencies, server test fixtures and unrelated workspace contents. Credentials/build secrets are never supplied. As with any reviewed source, a credential deliberately embedded inside a committed code file must be caught in code review; filename filters are not a general secret scanner.

The gateway and preview compilation inputs include `src/creation/model.ts` and `src/creation/projects.ts` alongside the existing runtime and Studio types. The publisher explicitly includes those two committed paths, `.dockerignore` permits them in the Docker context, and literal local `COPY` inputs are validated against the staged Dockerfiles from the selected source. A missing or unsupported input fails before upload or billable submission. Older reviewed sources remain buildable when their own Dockerfiles do not require Creation inputs; rollback does not require adding new files to an old application commit. This closes the merged-source packaging gap found while preparing the November 19 release at `0dedb7839e17a4a0df84e83ebdde65261056b32d`. The corrected Docker ignore file is itself a committed build input, so new image publication must select a reviewed source SHA that includes this correction; changing only the operator's publisher checkout is insufficient.

The November 21 conversation-readiness change also makes `src/studio/design.ts` import the pure `creation-readiness.ts` and `conversation-view.ts` helpers at runtime. Both must be present in the publication archive, permitted by `.dockerignore`, and copied into the gateway image. The private-coach build uses the same source archive and requires those files during bundling. Archive validation checks the selected gateway, preview and, when present, coach Dockerfiles; older selected sources without a private-coach Dockerfile remain buildable. A successful private-coach build directly from a repository checkout does not certify the narrower publication archive.

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

After verifying the receipt, deployment is a separate operation within the applicable owner-authorized release scope. Update the existing preview first, then gateway, by immutable digest. Save prior revision/traffic metadata; use an image-only update and `--no-traffic`, verify readiness and unchanged identities/URLs/env/secret mounts/data settings/limits, then route traffic and check health. Restore the saved prior traffic split if needed. Do not run the old bootstrap/IAM deployment path merely to update images.

Review/release the compatible website only after backend verification. Preserve the existing approved activation flags and allowances, including a working Adult pilot; publication and image refresh must not enable new paid capabilities or disable an already authorized pilot. Do not repeat accepted sandbox tests or change worker pins merely because the service publisher changed. Existing Math/Language Arts, mouse/touch, replay, physics, generated gameplay and security behavior are unaffected.

## Tests

`npm run test:deployment` covers offline plans, exact source requirements, real Git staging with dirty/untracked/private fixtures, both images in one build, current Dockerfile COPY inputs, missing-input rejection before cloud calls, historical rollback sources, read-only preflight/recovery, inherited IAM rejection, bounded polling, credential-safe diagnostics and failed/partial/unverified digest rejection. Existing sandbox/deployment contracts are preserved. The normal full PR CI runs the application, Math/Language Arts, creative/generated/mobile and security journeys; exact head/run identifiers belong in the release evidence. Offline CI is not a claim of successful live publication.

The scoped [Service image packaging workflow](../../.github/workflows/service-image-contracts.yml) stages the exact CI commit with the publisher and builds gateway, preview and private-coach Dockerfiles from that archive, including its actual `.dockerignore`. It then loads the packaged entry modules as non-root with network access disabled. This catches source/context omissions and missing runtime dependencies without Google Cloud configuration, provider credentials, registry publication or production traffic changes. Record the hosted result for the final correction source before image publication; the earlier application baseline's green checks do not certify a later packaging change.

## Conversation-readiness release scope

The [conversation-led creation change](../decisions/2026-11-20-guided-chat-creation.md) requires a compatible **gateway validator, private coach and website**. The gateway and private executor both validate the new creation context; an old one rejects it. Update the two backends before publishing the new website, while preserving the current serving configuration, mounted secret versions, identities, allowances and worker pins. The new backends retain old-client response shape when the creation context is absent. Do not promote an unrelated staged speech revision or copy its different approvals into this rollout.

This change does not alter the generation worker, sandbox, game runtime or generated-job protocol. Keep their previously accepted source/image identities; a new VM/gVisor smoke is unnecessary solely for this service/web change. Exact-source service packaging, the website's complete hosted regression gate and a bounded authenticated conversation using `creation.version: 1` are still required. Status/health alone cannot establish the new response contract. The general service publisher still publishes gateway and preview together; that does not require replacing the unchanged preview service. The separate coach publisher builds the private coach.

The [PR108 production handoff](../child-journey/PR108-PRODUCTION.md) records the verified published images and the serving/staged configuration difference. Its [scoped staging helper](../../scripts/deployment/pr108_stage.py) accepts only that release's exact source, image and serving-baseline pins. It preserves the serving template, service policies and active numeric secret references; uses API dry-run and original-version conditional writes; keeps old traffic at 100%; and recovers uncertain writes by reads without replay. It is not a general updater or a traffic-promotion tool. A later source, baseline or image needs its own review instead of editing pins merely to bypass a refusal. The original bootstrap restrictions remain in effect.

Before new web traffic, retain the serving backend revisions and verify old-client compatibility. Once the new website saves `design.creationReview`, a bare pre-change frontend rollback cannot read that optional record: its old strict validator rejects it. A frontend fallback must retain the compatible notebook reader or have a separately tested no-loss migration. Never clear saved child notebooks to make an old website work. Backend-only rollback and frontend fallback are therefore distinct actions.

References: [user-managed build identity](https://docs.cloud.google.com/build/docs/securing-builds/configure-user-specified-service-accounts), [gcloud builds submit](https://docs.cloud.google.com/sdk/gcloud/reference/builds/submit), [Cloud Build access](https://docs.cloud.google.com/build/docs/securing-builds/configure-access-to-resources).


## 2026-11-19 — Private coach build verification recovery

The first owner-authorized private coach image publication from merged source `079978f3034e007e8bbad1f43571aaa7867b5098` completed **SUCCESS** in `us-east5`, build ID `384444d1-4555-4b22-9b48-1f1c53e33c4f`. The initial offline verifier incorrectly compared Google Cloud-generated `BuildStep` execution metadata (`status`, `timing`, `pullTiming`) as if it were planned executable configuration. The approved image list, source SHA/tag, build-service identity and actual Docker command all matched.

The verifier now ignores only explicit read-only Cloud Build step execution metadata, while continuing to fail closed on any change to the executable steps, including extra `entrypoint`, environment, secrets, scripts or volumes. The successful publication produced immutable reference:

```text
us-east5-docker.pkg.dev/family-game-factory-jzw/factory-services/coach@sha256:99fe827da073d131470dcbe2a9c5c272fb0873289dc17531353f6a24314de278
```

An already-successful build must **not** be resubmitted when verification fails. Use the original build ID and exact reviewed source SHA with `build_coach.py --build-id BUILD_UUID` after the verifier correction. Recovery must independently confirm the Artifact Registry digest. Image publication does not imply Cloud Run deployment, private gateway reachability, model credentials, approvals, or paid AI activation.

## 2026-11-19 — Manually publish the pinned Adult pilot frontend

The production gateway, preview and private-coach images for the supervised Adult-only Jems pilot were built from merged public source `079978f3034e007e8bbad1f43571aaa7867b5098`. This historical pilot release pin remains a rollback reference; the subsequently authorized coordinated release is tracked in [delivery state](../../DELIVERY-STATE.md). The existing Pages workflow requires a manually entered, immutable 40-character `source_sha`, verifies the commit is already merged into the triggering `main` history, and checks out exactly that source for tests and the public build. Only the reviewed production gateway and preview origins may be published; missing/empty origins fail rather than disconnecting the existing site. The built `dist/jems-release.json` includes the reviewed source SHA for post-deployment inspection.

Once the compatible gateway/preview revisions are checked and deliberately serving, use the existing manual workflow (no automatic main-push deployment):

```sh
gh workflow run pages.yml --repo jzwyrzyk/family-game-factory --ref main \
  -f source_sha=079978f3034e007e8bbad1f43571aaa7867b5098 \
  -f gateway_origin=https://factory-gateway-ola734esta-ul.a.run.app \
  -f preview_origin=https://factory-preview-ola734esta-ul.a.run.app
```

Before and after publication, retain the old Pages artifact/deployment ID and prior Cloud Run traffic splits for rollback. Require the selected source SHA's full test suite to pass and inspect the live `/family-game-factory/jems-release.json` and `factory-config.json`. Confirm the actual browser shows the Adult (development) selector and trusted-device enrollment. Initial API checks may be unavailable until the device is enrolled and granted an Adult permit. Do not claim paid inference, reliable iOS microphone capture or private worker generation from a successful Pages publication alone.

This release workflow is still manual and deploys **only the public static website**; it does not modify Cloud Run, Secret Manager, Firestore, provider credentials, allowance, worker pins, or the private coach.
