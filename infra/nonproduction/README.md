# Nonproduction setup and privilege review

**November 26 executable update:** use [the consolidated handoff](../../docs/operations/PERMANENT_CLOUD_SETUP.md)
and `scripts/ops/setup_nonproduction.py` for the owner's selected `jems-jzw-nonprod`
project in `us-east5`. Initial source-bound plans are create-only, saved privately,
and require an approved hash. The owner requested an exact plan before execution.
The baseline adds a second zero-role static runtime `jems-test-runtime` distinct
from DEV `jems-static-runtime`, and a project-filtered $15 monthly notification
budget using the verified existing billing account. Federation stays disabled and
registry cleanup defaults to **dry-run** until a separately reviewed activation.
`enable_registry_cleanup=true` activates the retention policy described below;
it is not enabled by initial setup. One-time Cloud Shell is authorized; subsequent
routine operations remain in the existing controller. IAP owner details remain
private. No project creation, billing link or complete TEST backend is implicit.


The original static DEV/TEST setup was partially applied: the owner reports 25 of
28 planned instances in state. The [guarded recovery](../../docs/operations/NONPRODUCTION_RECOVERY.md)
corrects the two remaining creations and retires the uncreated project IAP binding. It is not evidence of a live project, authenticated preview, full TEST
backend, provider acceptance or production release. `ops/environments.json`
remains disabled and unbound until actual setup is approved and verified.

The consolidated method supersedes PR106's standalone shared DEV topology.
[PR106](https://github.com/jzwyrzyk/family-game-factory/pull/106), reviewed at
`8734e9b2bd19756f2801365619376c2ce5697d9d`, contributes the disconnected-build,
separate-project, IAP adult-access, synthetic-data and no-production-credentials
design. Its backend policy and private worker companion require reconciliation
with current main before a full TEST deployment; they are not silently merged
or activated here. Its former command-driven deployment is not the routine
owner workflow. The production canary/release-intent path stays independent.

## Proposed scope

Use one existing, separately approved project with billing enabled. Both the
production ID `family-game-factory-jzw` and number `1054529152893` are rejected.
No project ID, account email, billing account, owner identity or OAuth client is
invented in the committed configuration. Terraform creates no keys, provider
secrets, production permissions, backend state or continuously running service.

| Principal/resource | Proposed authority and purpose |
| --- | --- |
| `jems-static-runtime` | No project/application roles. Serves verified static bytes only. No model key, GCS, Firestore, secret, dispatch or deploy access. |
| `jems-nonprod-deploy` | The listed custom Cloud Run controller permissions in the dedicated project; exact runtime `actAs` and identity/key metadata read; Artifact Registry writer on only `jems-environments`; exact-service IAP policy management. Builds never execute with this identity. |
| `jems-nonprod-uat` | Per-service IAP accessor, granted by the trusted controller. No deployment, IAM, storage, provider or production rights. Browser UAT receives an audience-bound ID token, not deploy credentials. |
| IAP managed service agent | Direct Cloud Run IAP uses per-service `roles/run.invoker`, granted and verified by the controller. No project-wide IAP agent role or public invoker grant. |
| GitHub federation | One dedicated pool/provider, disabled by default; immutable repository/owner IDs; protected `main`; exactly `jems-environments.yml`; GitHub-hosted runners; only `workflow_run`, `workflow_dispatch`, `schedule`. Exact distinct environment subjects bind deployment and UAT to their respective accounts. |
| Registry | Regional static-site images addressed by digest. CI versions expire after 30 days; two moving `keep-test-current`/`keep-test-previous` tags protect current TEST and one recovery version. No production registry use or cleanup. |

The deployer necessarily creates and deletes services and manages their IAP
policies inside this isolated project. This is broader than the existing
production account's permissions on three existing services, and is the new
privileged scope requiring review. It cannot modify project IAM, create keys,
grant itself roles, assume runtime identities other than the two static accounts, or
access production through any binding in this plan. Do not bind production
accounts or move unrelated resources into this project.

`roles/iam.workloadIdentityUser` on each exact account supplies short-lived
token/ID-token generation to its own subject. No `roles/iam.serviceAccountTokenCreator`
or long-lived key is proposed. The current repository uses immutable-ID OIDC
subjects; perform a claims-only proof before enabling federation. A mismatch
blocks activation; do not widen the provider condition.
Protected-branch enforcement is the workflow's `github.ref_protected` guard
and GitHub environment deployment-branch policy; `ref_protected` is a GitHub
context value, not a documented OIDC claim, so it is not invented in CEL.

## Smallest owner setup sequence

1. In Google Cloud Console, select/create the dedicated nonproduction project
   and confirm billing plus a monthly alert envelope. Review the concrete
   Terraform plan after supplying its real project ID. Execute setup through
   an existing approved keyless administrator integration or a one-time
   reviewed GitHub setup identity. The ordinary deployer cannot bootstrap
   itself. No suitable administrator connection has been established by this
   source change; that is a blocker, not an instruction to use Cloud Shell.
2. In Cloud Console, enable direct Cloud Run IAP and configure the initial
   OAuth client/consent if needed. Google explicitly requires initial Console
   setup for some projects without an organization because OAuth clients cannot
   be created programmatically. Record the client ID as `iapAudience`; never
   place its secret in this public repository. Allow only named adult tester
   users. This one-time Console operation is the only browser-auth setup; new
   previews subsequently inherit the reviewed IAP setup through automation.
3. In GitHub settings, create `jems-nonproduction` and
   `jems-nonproduction-uat`, each restricted to protected `main`. Retain the
   existing repository OIDC subject template. Review the exact claims and
   Google role bindings, then enable the dedicated federation and fill the
   identifiers/owner allowlist in the reviewed environment configuration.
   Verify owner browser login, unapproved-browser rejection, UAT account
   access, and denial of deployment rights by that account before opening
   the lane for ordinary development.

Setup tools may execute Terraform from an approved GitHub workflow; this
directory intentionally contains no automatically executing privileged setup
workflow. A concrete `terraform plan` using the actual project is required
before any apply. Preserve encrypted/private Terraform state in an approved
backend; never commit `.terraform`, state, plan payloads or credentials. API
enablement and custom-role creation need the initial administrator, not the
runtime or deployer. Do not disable APIs on teardown.

If the project inherits organization/folder policies, deployment preflight
reads those policies and refuses unreadable evidence. The plan grants no
ancestor permissions. An existing approved read path or separately reviewed
read-only ancestor permission may be needed; do not add broad project roles
to bypass that limitation. Setup must also inspect effective/group/resource
grants and verify the zero-role runtime has no inherited or separately bound
data access. The routine preflight checks direct project/ancestor assignments
and user-managed keys; it rejects public, group, domain and principal-set grants
whose membership could include that runtime or an unexpected viewer. It also
rejects inherited Cloud Run invoker or IAP accessor grants outside the exact
allowlist. Unknown group membership is a setup blocker, not evidence of denied
access. This is conservative and is not a complete effective-IAM simulator.

## Automated operation

`python3 scripts/environments/cloud.py --config ops/environments.json plan`
is offline and works with the committed disabled template. The trusted
controller invokes `deploy` only after independently verifying the triggering
run, PR/head, checks and data-only artifact. It supplies the immutable static
image, source and frontend hashes. The library never evaluates PR commands.

Each `jems-dev-pr-N` has its own origin and expires 72 hours after its latest
eligible update. The controller deletes only marked DEV resources for a
GitHub-confirmed closed PR or an elapsed expiry; it rechecks ownership and
labels before deleting and verifies absence afterward. A single workflow
concurrency group must serialize cleanup with deploy. The CLI has no
conditional-delete etag flag, so out-of-band administrators must not mutate
managed previews during cleanup. TEST and unrecognized services are never
eligible for cleanup.

The library confirms IAP, exact runtime/image/environment, readiness, 100%
traffic, URL, invoker policy and tester allowlist before reporting deployment.
This metadata receipt still needs the separate deployed-browser test against
the served identity and actual interactions. A failure after mutation is an
uncertain/failed deployment; inspect before retrying and never report the prior
URL as the new version. Cloud errors suppress raw CLI output to protect
credentials. No routine operation uses Cloud Shell.

The TEST static shell is a first slice. A complete production-like TEST still
needs the reviewed nonproduction gateway/generated-game origin/coach/worker,
data reset and explicitly capped real-provider acceptance. Do not describe a
disconnected fixture shell as complete Jems backend acceptance.

## Spending and retention

All services use request billing, minimum zero and maximum one instance.
Preview count is bounded to ten. Basic direct IAP requires no load balancer.
There is no committed-use discount, minimum-instance reservation, paid model
activation or scheduled paid request. Billing alerts are notifications, not
hard spending caps; runtime limits and retention constrain consumption but do
not guarantee a dollar ceiling. Registry cleanup is limited to this new
nonproduction repository. The controller moves `keep-test-current` to
`keep-test-previous` before assigning the new current TEST digest. Reassigning
the previous tag retires the older recovery image from this exemption so the
30-day CI cleanup can collect it. These mutable tags are retention pointers,
never approval/artifact identities; manifests and deployments use exact image
digests. Approved production releases need their separate retained artifacts.

Official references checked November 23, 2026 (America/New_York):
[direct Cloud Run IAP](https://docs.cloud.google.com/run/docs/securing/identity-aware-proxy-cloud-run),
[IAP access permissions](https://docs.cloud.google.com/iap/docs/managing-access),
[IAP pricing](https://cloud.google.com/iap/pricing),
[Cloud Run pricing](https://cloud.google.com/run/pricing),
[Artifact Registry pricing](https://cloud.google.com/artifact-registry/pricing).

## Partial-apply recovery

Use `scripts/ops/recover_nonproduction.py` through the `nonprod-recover` launcher
lane. The initial setup helper deliberately cannot replay an apply-started plan.
The recovery uses the existing private state directory, preserves every original
plan/receipt/marker, and prepares a private successor state. Budget user ADC quota
is explicitly `jems-jzw-nonprod` on an alias used only by the budget. No existing
resource update, replacement, deletion, project IAM grant or federation activation
is permitted. See [provider requirements and exact guards](../../docs/operations/NONPRODUCTION_RECOVERY.md).

## Integrated TEST candidate

The separate [family TEST Terraform root](family-beta/terraform) reuses the recovered project's deployer, UAT identity and existing protected environment controllers. Its own state owns a named Firestore database, private bucket, identities, image repository, signed-worker trust and four services. The [phased operating notes](family-beta/TEST.md) describe plan inputs, audience binding, secret handling, isolation, cost, negative controls and recovery. Static TEST and the partial-apply recovery maintain their separate state and receipts.
