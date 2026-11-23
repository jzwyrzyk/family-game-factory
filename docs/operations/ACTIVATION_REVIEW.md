# Review the remaining Jems access setup

This is preparation for the operational access in draft [PR107](https://github.com/jzwyrzyk/family-game-factory/pull/107).
It does not authorize a merge, install permissions, enable a workflow or change
production. The [policy foundation](POLICY_FOUNDATION.md) is source validation;
its passing checks do not establish that the accounts are configured.

## One read-only handoff

Use the exact reviewed PR107 commit supplied with the handoff. Work in a clean
checkout of that commit in the owner's existing authenticated Cloud Shell.
Do not run an old apply command or reuse an old review code. The source revision
and live account state are part of every new review.

```bash
(
  set -euo pipefail
  umask 077
  JEMS_ACCESS_REVIEWED_SHA='REPLACE_WITH_THE_REVIEWED_40_CHARACTER_PR107_SHA'

  python3 scripts/ops/access_preflight.py --expected-head "$JEMS_ACCESS_REVIEWED_SHA"
  python3 scripts/ops/admin_setup.py plan
  python3 scripts/ops/admin_setup.py plan-production
)
```

The placeholder deliberately fails validation. A delivered handoff replaces it
with the final reviewed commit; it must not derive approval by trusting whichever
commit happens to be checked out. `access_preflight.py` uses only local Git reads
and tool-presence checks. It reports all missing required tools together, refuses
a changed or dirty checkout, and does not request credentials or contact an API.
Python 3, Git, `gh` and `gcloud` are required. Add `--with-drill` to this local
check when a later plan includes an isolated drill; it checks Docker command
availability, not that the Docker daemon or a cloud project is ready.

The account `plan` performs the bounded reads needed to verify the **current**
draft PR107 head, required checks, main protections, environment restrictions and
cloud preparation. It prints proposed preparation actions with review codes but
does not execute them. It independently records GitHub and GCP blockers, so a
GitHub failure does not conceal a cloud-read failure. A failure exits before the
following production review command. Read the reported blockers; do not chain an
apply automatically after planning or treat partial output as a completed setup.

An account apply can complete before a local report or receipt fails to save.
If output shows applied resources and a successful readback followed by a local
storage error, preserve that output and any existing receipt. Do not repeat the
apply to recreate evidence. Restore writable local storage or select a new
private destination, then run `verify --receipt NEW_PATH` from the reviewed
checkout. That read-only result establishes current preparation state; it does
not reconstruct the original apply receipt or its comparison with earlier
serving metadata. See [receipt storage and recovery](PHASE_2.md#receipt-storage-and-recovery)
for the pending-file guard, bounded reservation and post-action failure behavior.

The optional isolated project and Logging volume remain explicit plan inputs.
Without them, the default plan cannot establish the live drill or privacy proof.
Do not invent an isolated project, silently approve cost, or substitute production
for that drill. Its project must already exist, be billed and be independently
approved for this purpose.

The isolated operator also needs image-download permission to stage the synthetic
candidate. The preparation source now plans Artifact Registry Reader only on the
isolated project's `jems-drill` repository. Planning performs no grant. A later
reviewed apply rechecks that repository's policy, adds only the exact reader
binding, and verifies it. Unexpected existing members or roles fail closed; no
project-wide image role or production registry access is added. Baseline
verification also checks this prerequisite instead of reporting a completed
drill setup while the reader grant is missing.

## What the production review establishes

`plan-production` now provides a structured scope for later owner review. It
reads the production project and fixed service metadata, separates the proposed
publisher, release and polling permissions, and lists the exact identities,
resources and non-secret workflow variables. Its output always has
`activation_ready: false`, no executable actions, and both enable flags marked
`keep_unset`. There is no `apply-production` mode.

| Evidence | Meaning in this report |
| --- | --- |
| Production project and named serving revision metadata | Observed by this invocation, including whether the current template matches the serving configuration |
| Current PR/checks, protected main, restricted environments | Not established by the production review itself; inspect the separate account-plan result |
| Registry, disabled providers and unbound identities | Not established by the production review itself; inspect fresh preparation verification |
| Effective IAM, inherited roles and deny policies | Unverified; missing direct bindings do not prove that access is absent |
| Isolated stage, canary, promotion and rollback | Requires the actual live drill receipt; fixture tests and Docker boots do not substitute |
| Scoped Logging privacy and Codex network access | Requires separate effective-reader and published-environment verification when enrolled |
| Inert merge and exact-main OIDC claim proofs | Separate later steps; this preparation does not perform either |
| Production enrollment and owner approval | Required explicitly; no service is enrolled by this report |

After scoped Logging enrollment and its privacy proof, the managed environment
can use `python3 scripts/ops/log_summary.py --hours 2 --identity-alias jems-diagnostics`.
This is a separate read-only diagnostic, not part of account activation. It uses
the documented managed selectors and normal CLI without extracting a token or
resetting credential/guard settings. The exact-view, fixed-filter request returns
only a private metadata projection; the report contains at most 500 counted
entries and an explicit truncation flag. A successful count still does not verify
the actual account identity or its effective privilege ceiling.

The earlier one-line production permission summary omitted
`run.operations.get`. The controller polls the operation returned by an update,
so the review now identifies that permission as a separate project-level,
read-only scope. This is a proposal for approval, not a newly granted permission.
The [operation API resource](https://docs.cloud.google.com/run/docs/reference/rest/v2/projects.locations.operations/get)
is under the project and location, separately from a service's revisions.

## Exact proposed permission boundaries

The production project is `family-game-factory-jzw`, number `1054529152893`,
and the region is `us-east5`.

| Identity / scope | Proposed capability | Review boundary |
| --- | --- | --- |
| `jems-image-publisher` on `jems-release-images` | Artifact Registry Writer | Only the new immutable image repository; no cloud-service updates |
| `jems-cloud-run-release` on that repository | Artifact Registry Reader | Read images and verify provenance |
| Release identity on each individually enrolled service | Custom permissions `run.services.get`, `run.services.update`, `run.revisions.get` | Exact service bindings for `factory-preview`, `factory-gateway`, or `factory-coach-private`; no project-wide service-update grant |
| Release identity on the production project | Separate custom role containing only `run.operations.get` | Read update-operation status; this can expose operation metadata across the project and requires explicit scope approval |
| Release identity on an enrolled service's existing runtime account | Service Account User | Approve each exact runtime account separately; no project-wide `actAs` or Token Creator grant |
| Each exact GitHub workload subject on its own publisher/release account | Workload Identity User | Preserve the separately reviewed provider condition and exact protected-main workflow, repository IDs, environment, issuer and audience |

Google's [Cloud Run deployment permissions](https://docs.cloud.google.com/run/docs/reference/iam/roles)
include service update/read, operation read, image download and use of the
runtime service account. The controller's additional revision read checks its
candidate and baseline. [Service identity documentation](https://docs.cloud.google.com/run/docs/configuring/services/service-identity)
explains the exact-account `iam.serviceAccounts.actAs` requirement.
[Artifact Registry access control](https://docs.cloud.google.com/artifact-registry/docs/access-control)
supports repository-scoped roles, and the
[federation deployment guidance](https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines)
describes subject-specific impersonation bindings. These references inform the
review scope; the live isolated drill and effective IAM verification remain
necessary evidence for this implementation.

IAM's `run.services.update` permission can change more than images and traffic.
The narrower behavior comes from the protected, reviewed controller and source.
Similarly, deployment under a runtime identity carries the authority of code
running as that identity. Do not describe these grants as technically limited to
harmless image substitutions. Review existing runtime permissions and indirect
or inherited authority before approving enrollment.

## Approval and later completion

The accepted sole-maintainer policy has zero mandatory human PR reviews and no
separate environment-reviewer click. The owner authorizes an exact release intent
before its protected merge; that merge becomes the execution trigger once the
release path is enabled. The preparation report does not add a new approval
system or claim that GitHub independently enforces a second human click.

After reviewed preparation and the isolated drill, a separately authorized inert
merge precedes both actual claims-only proofs. Both release enable flags remain
unset throughout those steps. Only after the owner approves the precise final
permission scope should a future execution procedure bind the exact workload
subjects, enable their providers, install approved scopes and workflow variables,
and enable the agreed release lane. That procedure must re-read account state,
preserve existing grants, fail on unexpected changes, and verify the result.
This source prepares the review; it provides no such activation operation.

First service enrollment still needs fresh serving revision, image digest,
configuration fingerprint, compatibility evidence and an authorized smoke plan.
Configuration drift remains a blocker for the affected service. The initial
sequence is preview, coordinated gateway, and coach separately. Paid-provider
activation, worker trust changes and arbitrary Shell commands are outside this
release controller.
