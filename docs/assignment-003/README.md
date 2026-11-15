# Assignment 003 — inactive Cloud Run deployment

This implementation targets the existing project **family-game-factory-jzw**, existing identities **factory-gateway** and **factory-preview**, GitHub App **5765875**, installation **182105358**, and existing Secret Manager PEM **factory-github-app-private-key**. It does not create another project, fund an API, activate a worker, configure a scheduler, alter the website or change the approved worker tag.

No cloud deployment or paid call was performed during implementation. See [security boundaries](security.md) and [evidence](evidence.md). The deployment command is an owner-run, billable action and requires `--execute`. `plan` is offline; `validate` reads metadata only and never retrieves the PEM.

## Minimal owner Cloud Shell steps, after PR review

Use the reviewed PR commit/branch until merged; do not use an arbitrary mutable checkout. Choose the approved Cloud Run region (example below: `europe-west1`; check your existing Firestore location and data residency first). Run commands in the repository root. Docker, Python 3, git and gcloud are required; the operator needs deploy/build/secret-version/IAM authority and permission to act as the two existing service accounts. Runtime identities must not receive those administrative permissions.

```bash
# From your existing clone, check out the reviewed Assignment 003 commit.
export REGION=europe-west1
python3 scripts/deployment/deploy.py plan --region "$REGION"
python3 scripts/deployment/deploy.py validate --region "$REGION"
```

Before the first build, verify an existing Docker Artifact Registry repository `factory-services` in that region. **Only if it does not exist**, the following owner command creates that billable repository; it is never run by the scripts:

```bash
gcloud artifacts repositories create factory-services \
  --project=family-game-factory-jzw --location="$REGION" --repository-format=docker
```

Build/push from the reviewed tracked source, then run the exact digest-pinned deployment command printed by the build tool:

```bash
gcloud auth configure-docker "$REGION-docker.pkg.dev" --quiet
python3 scripts/deployment/build.py --region "$REGION" --execute
# Review the printed image digests; run the printed deploy.py deploy --execute command.
```

No manual JSON or PEM manipulation is needed. The builder copies only committed build inputs into a temporary context, omits key/config/credential files, builds separate Dockerfiles, pushes to the existing project registry and resolves immutable digests. It refuses dirty tracked build inputs. It uses the owner's Docker/registry identity, not a privileged Cloud Build runtime identity. Treat unreviewed source as executable; review the checkout first. No model credential is needed for building or deploying inactive services.

## What deployment does

1. Check enabled APIs, existing Firestore default database, service-account metadata and user-managed keys. Audit direct project and visible ancestor grants, and every project secret's direct bindings for the runtime identities. Refuse broad/unexpected roles, preview write access, public secret access, and preview access to the PEM/gateway secret. Missing required metadata authority is a failure, not an assumed pass.
2. Pin an enabled numeric version of the existing PEM using metadata only. Refuse an existing active gateway config and unknown Cloud Run services. Existing services must have the deployment's `factory-deployment=assignment-003` label; migration of other services needs explicit review.
3. For new services only, deploy a restricted bootstrap revision with **no secrets and no database client**. It serves status only, with `ready:false`; all other paths return 503. Obtain actual canonical HTTPS origins from Cloud Run `status.url`. Never guess project-number/hash URLs, accept a caller-supplied origin or follow a health redirect.
4. Generate random distinct session/preview signing keys in memory on first deployment. Reuse existing signing keys and family/workspace identifiers on reruns. Refuse implicit project/worker/storage-contract migrations. Create/version separate config secrets through stdin; never embed the PEM in JSON, environment variables, arguments, logs or build context. The preview config contains only project/workspace, preview origin and preview signing key. No allowance, invitation or active approval is created.
5. Grant gateway-only access to its config and existing PEM, and preview-only access to its config. Pin numeric secret versions in the revisions. Grant gateway `roles/datastore.user` and preview `roles/datastore.viewer` (see scope limitation below). No runtime gets project Secret Accessor, Editor, Owner, Run Admin, service-account key or model credential.
6. Deploy separate services with separate service identities and hosts, `active:false`, `approval.enabled:false`, `FACTORY_ACTIONS_APPROVED=false`, no scheduler, no artifact bucket, zero minimum instances, **one maximum instance**, concurrency 8, one CPU, 512 MiB, request-based CPU and 60-second timeout. Replace environment and secret mounts to remove stale flags. A TCP startup probe permits infrastructure startup; the separate `/health` endpoint verifies persistence readiness and does not depend on the request's probe Host header.
7. Verify deployed readiness, identities, exact image digests, limits, environment and secret versions; route traffic explicitly to the new inactive revision; permit public **transport** via service-scoped `roles/run.invoker` only after final configuration. Browser/private operations still require the existing session/capability authentication. Check `/health` over HTTPS, requiring `ready:true` and `paidExecution:false` on both services. Reaudit IAM. Print only public origins, worker SHA and numeric secret versions.

Bootstrap and final config loading never calls GitHub or OpenAI. The gateway's health check and preview's health check read Firestore, so owner execution may incur Cloud Run, database, registry, Secret Manager, network and logging costs even with paid generation disabled. Maximum instances and model allowances are not a hard whole-cloud spending cap.

## Repeat deployment, failure and rollback

Rerun the same build/deploy commands for a reviewed change. Signing keys are preserved; numeric secret versions and image digests make revisions reproducible. Services are deployed sequentially, not transactionally. A failure exits nonzero and never reports readiness; a partially completed first deployment stays inactive. Inspect revision metadata and rerun after correcting the reported IAM/resource issue. Do not clear Firestore, browser data, signing keys or existing secret versions to make a retry pass.

Keep the previous image digests and secret version numbers. For rollback, use reviewed Cloud Run traffic changes to the prior **inactive** revisions and recheck both health endpoints. First deployment has no previous ready service; leave it inactive and repair configuration. Old secret versions are intentionally retained for rollback; their eventual disable/destroy policy is an owner-controlled maintenance action, not automatic rotation.

If gcloud fails, raw stdout/stderr is suppressed because it may contain private config. The script prints the operation name only. Diagnose using owner-only resource metadata and IAM, never by enabling `set -x`, printing secret values or pasting private JSON/PEM into chat. No generated config files are left on disk by the deployer.

## Activation remains blocked

The immutable approved worker is still:

```
factory-worker-dcb887e6a51ba000fda1ccc42b9d198f8b9895f9
→ dcb887e6a51ba000fda1ccc42b9d198f8b9895f9
```

The scripts never update this tag, repository variables, workflow environments, public frontend config or scheduler. `FACTORY_ACTIONS_APPROVED` must remain **false**. The connector cannot read its current remote value: GitHub returned **403 Resource not accessible by integration** for the repository-variable endpoint. An owner with repository Actions-variable permission must verify it before later activation; no workflow was dispatched and no variable was changed here.

Deployment health is not activation evidence. On the approved dedicated ephemeral runner with gVisor, overlay-capable Docker and at least 20 GiB free, test the preserved worker checkout and immutable sandbox image. Use the new verification script from the reviewed Assignment 003 checkout:

```bash
python3 /path/to/reviewed-assignment-003/scripts/deployment/verify-sandbox.py \
  --worker-checkout /path/to/approved-worker-checkout \
  --image sha256:REPLACE_WITH_REVIEWED_IMAGE_DIGEST \
  --evidence /private/owner/path/factory-sandbox-evidence.json
```

This command executes only fixture games on that runner. It requires the exact approved worker SHA, clean tracked worker inputs, both full browser fixtures and hostile-source rejection. A missing image, SKIP, nonzero exit or partial output fails. It writes a SHA-bound evidence record; an owner must review it with the runner/image provenance. The record is not a signed attestation or an automatic activation token. There is **no enable/activate command** in this assignment.

Before any separate activation approval: pass that full smoke; resolve all security issues in [security.md](security.md); verify existing GitHub App permissions, approved tag/environment/OIDC bindings, API environment-only key, model/rates and bounded allowance, log redaction, invitation abuse protection and real authenticated preview behavior. Only a later reviewed activation change may enable execution. Do not treat existing API credit, an enabled API, successful deployment, mock tests or a green host browser test as a passed sandbox gate.
