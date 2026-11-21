# Assignment 004 — public gateway bridge to organization-owned private worker

**PR #16 is draft/inactive.** Private companion: `family-game-factory-lab/family-game-factory-worker#1`. Neither has been merged or deployed. The child-facing Family Game Factory, all existing games, revisions, Firestore data, Cloud Run gateway and preview services, origins and signing credentials stay unchanged.

## Immutable trust identities

| Asset | Verified identity |
| --- | --- |
| Public website and trusted source | `jzwyrzyk/family-game-factory`; ID `1458033181`; frozen public worker SHA `dcb887e6a51ba000fda1ccc42b9d198f8b9895f9` |
| Private orchestration repository | `family-game-factory-lab/family-game-factory-worker`; ID `1458899834` (unchanged by transfer) |
| Organization | `family-game-factory-lab`; owner ID `357047835` |
| Selected workflow dispatch ref | protected `main` (`refs/heads/main`) |
| Independent reviewed private code | final owner-approved full private SHA `P`, protected tag `factory-execution-P` pointing to P and `main` also pointing to P |
| Workflow | `.github/workflows/factory-private.yml@refs/heads/main` |

The gateway GitHub App dispatches **opaque job ID and bounded repair attempt only**, never child text, generated code or credentials. Before dispatch, the tag **and** main are independently read via GitHub API and must be exactly approved `P`. The workflow checks its actual `github.sha` equals `P`; a branch move during dispatch fails closed. Private generation retrieves the frozen public source SHA. Worker callbacks carry GitHub-issued signed OIDC; the gateway verifies issuer, audience, private repo and org ID, `ref=refs/heads/main`, `workflow_ref`, `workflow_sha=P`, environment, first run attempt and stage/run identity, and preserves the existing artifact and revision integrity checks.

## Inactive private configuration migration

Do not put any private configuration into GitHub. The existing gateway config retains these frozen source fields:

```json
{"repository":"jzwyrzyk/family-game-factory","repositoryId":"1458033181",
 "workflow":"factory-agent.yml","approvedSha":"dcb887e6a51ba000fda1ccc42b9d198f8b9895f9"}
```

The owner-reviewed, inactive config adds only the following private execution selectors (plus an independently reviewed new GitHub App installation ID when the App is actually installed):

```json
{"workerRepository":"family-game-factory-lab/family-game-factory-worker",
 "workerRepositoryId":"1458899834","workerWorkflow":"factory-private.yml",
 "workerApprovedSha":"FINAL_REVIEWED_PRIVATE_MAIN_SHA"}
```

Owner can use `scripts/deployment/private_worker_config.py --input /secure/old.json --output /secure/new-inactive.json --reviewed-private-sha P` to produce a new 0600 copy **offline**, preserving all existing keys, workspace IDs, Firestore, URLs and family identifiers. Paid execution remains `active:false`, `approval.enabled:false`, and requires the independent gateway runtime `FACTORY_ACTIONS_APPROVED=true` and private workflow variable `FACTORY_ACTIONS_APPROVED=true` only after future owner authorization. All flags remain **false** for Assignment 004.

## Github App and GCP setup (requirements, NOT executed)

- Gateway App: install on only the new organization private worker repository, with Actions write, Contents read and Metadata read. Record its **organization installation ID**, which may differ from the old personal-account installation. The existing GitHub App private key remains privately mounted on the gateway; this PR does not change it. Gateway does not receive runner administration rights.
- Private runner-administration App: repository Administration write and organization Self-hosted runners read, installed only where needed; its private key belongs solely in `factory-infrastructure` environment, not in the browser or runner. `actions/create-github-app-token` mints a short-lived job token for provisioning/cleanup.
- Organization selected-workflow runner group: name `factory-isolated`, Selected repositories **only** `family-game-factory-lab/family-game-factory-worker`; Selected workflows **exactly**
  `family-game-factory-lab/family-game-factory-worker/.github/workflows/factory-private.yml@refs/heads/main`
  and
  `family-game-factory-lab/family-game-factory-worker/.github/workflows/factory-smoke.yml@refs/heads/main`.
  Public repositories disabled; default group forbidden. See private PR `docs/assignment-004/OWNER.md` for complete UI and read-only API audit.
- GCP: update Workload Identity Federation trust conditions (only when separately authorized) to organization owner ID `357047835`, repo ID `1458899834`, exact trusted `workflow_ref@refs/heads/main`, `factory-infrastructure` environment and reviewed private SHA. No new credentials or VM provisioned by PRs.
- Future owner-authorized redeployment: update the **existing gateway only** using owner-reviewed immutable image and new private secret version, preserving Cloud Run hostname, service account, request/instance controls, current preview, Firestore workspace and signing secrets. No deployment or configuration change performed here.

## Bounded workflow leases

The coordinator now records deadlines separately from `claimAt`. Previously a valid generation report left generation's 15-minute clock running while infrastructure was provisioned, so 9 minutes generating followed by 7 minutes preparing could expire before test claimed its work. The accepted generation report now enters a bounded preparation/test handoff.

The default budgets reflect the reviewed private workflow's 12-minute generation, 18-minute preparation, 12-minute test and 12-minute review job limits:

| Boundary | Maximum coordinator window | What advances it |
| --- | --- | --- |
| Dispatch queue | 15 minutes | Initial enqueue or one of the two permitted repairs |
| Generation | 12 minutes | Authenticated generation claim |
| Preparation and test handoff | 30 minutes total | Validated generation report |
| Test execution | At most 12 minutes, also bounded by the existing 30-minute handoff deadline | Authenticated test claim |
| Review handoff and execution | 12 minutes total | Validated successful test report; review claim retains that same deadline |
| Whole job, including repairs | 207 minutes: `(15 + 12 + 30 + 12) × 3` | Fixed once; never extended by repair or worker traffic |

The job-wide number is an outer bound, not a target wait. A missed phase deadline, lost grant, disabled paid approval or cancellation can stop work earlier. Existing shorter coordinator lease configuration shortens these windows. Provider input timeout is also capped by the current deadline. A late claim cannot create a new lease, and a late new report cannot publish a candidate. Status reads and duplicate reports never extend time, consent or spending authority. The scheduler settles expired jobs using the existing conservative reservation policy; status can tell an active worker to stop immediately without scheduling or writing from a read.

Persisted executions without the new deadline fields remain readable. Migration derives an absolute deadline from the earliest stored queue/claim/audit time. Because old rows did not record report acceptance time, a pending test handoff is conservatively bounded from the old generation claim plus generation and handoff budgets; it does not restart at migration or polling time.

`tests/worker-lifecycle.test.ts` uses a synthetic clock and synthetic game/evidence fixtures to verify slow valid work, shared setup budgets, non-renewing polls/reports, late callbacks, repair/global limits and legacy migration. It makes no paid calls and proves no live latency or deployment acceptance. This source change does not alter the private workflow, its approved SHA, the public source pin or any live configuration. The coordinator change can serve the existing callback shape; activating revised worker code still requires the separately reviewed cross-repository release process.

## Security evidence and limits

Public CI includes branch/tag-drift and strict organization OIDC negative tests, plus existing child's desktop/mobile mocked creation, repair, play, keep, undo and fork journeys. Private PR supplies `scripts/runner/verify_group_policy.py`: read-only query of actual organization runner-group and selected-repository access; offline tests reject extra repositories, extra workflows, public access and tag-ref substitutions.

**This chat cannot verify live group settings through the exposed GitHub connection, and no registered runner can be scheduled for a real denied-workflow test without separately authorized infrastructure.** No claim of actual unauthorized workflow denial until the owner runs the policy audit and a controlled negative scheduling test. Do not set `FACTORY_ACTIONS_APPROVED=true`; do not merge or deploy automatically.
