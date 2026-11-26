# Permanent cloud operations: consolidated setup and evidence

Assessment: November 26, 2026, America/New_York. Application base is frozen
`bc602f1ede502f398308ad56f973c4bf7997ff08`. This operations-only candidate does not
merge, promote, alter frozen source pins, enable recurring work or approve spending.
It reuses PR153, the existing managed Codex identity and existing environment and
release controllers. [Delivery state](../../DELIVERY-STATE.md) is the acceptance ledger.

## Verified state and explicit gaps

- GitHub confirms [PR153](https://github.com/jzwyrzyk/family-game-factory/pull/153)
  merged as `2c4751611cbd40ef04a85432845cd260528f5a56`. Its dedicated broker,
  exact provider condition, manual/default-off scheduled workflow and closed report
  schema remain unchanged. [Attempt 1 of run 45323244621](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45323244621)
  failed. The PR receipt records `invalid_target` before a broker query.
- Owner-supplied inventory confirms the GitHub diagnostic provider/pool, broker and
  dedicated accounts are missing. That is consistent with the failure; a failed STS
  exchange alone does not distinguish absent, disabled or deleted resources.
- Owner-supplied inventory reports the existing Codex pool/provider ACTIVE, the
  diagnostic account present, `global/_Default` as the retained destination, Gateway
  `factory-gateway-r-eaf5effa06d031818f52`, Coach
  `factory-coach-private-r-890188092e3f4396dab0` and Preview `factory-preview-00006-5lk`
  latest ready. These were not independently reread from GCP in this task.
- This managed task has enforced Google/GitHub network access, but no outbound
  identity, secret binding or `OIC_MANIFEST_PATH`. Google Cloud SDK 594.0.1 was
  installed in the task's work directory. Both existing diagnostic commands then
  returned `IDENTITY_NOT_CONFIGURED`; installing the CLI did not restore identity.
  The available environment change API cannot attach OIDC. The owner subsequently verified the existing connection in another task under
  actual alias `GCP`; use that connection and the canonical SDK client; do not recreate its pool or grant
  broader roles. [Connection procedure](ASSISTANT_ACCESS.md).
- The owner reports separate-task SDK identity, metadata and finite negative-permission
  verification succeeded under alias `GCP`; all services Ready/reconciled at 100%.
  This task independently retried SDK access but still has no attached manifest.
- No actual administrator inventory diff or production request-evidence artifact
  has been accepted in this task. The missing attachment,
  administrator preflight, approved broker image and coverage review remain blockers.

## Owner setup sequence

One cloud command can apply the reviewed resource diff after its read-only check.
Initial account attachment, GitHub environment settings and an approved immutable
broker image are explicit prerequisites. There is no honest ready-to-run apply
command until those values and the actual inventory hash exist.

1. Reuse the existing Codex identity attachment, actual alias `GCP`. Run the canonical
   `diagnostic_preflight.py --expected-source FULL_REVIEWED_SHA --identity-alias GCP
   --live --verify-permissions` with the task virtual environment. It runs SDK
   self-check, full metadata reads and same-token permission probes without gcloud
   or cache writes. See [SDK/source preflight](ASSISTANT_ACCESS.md).
   The probe covers service read/write/delete/IAM, project administration/data/log
   permissions, named secrets and impersonation/key creation. It does not read secret
   payloads. Verify the named secret resources actually exist using the operator
   inventory; an empty permission response for a nonexistent resource proves nothing.
   A finite check is not a universal privilege-ceiling proof.
2. Review a broker image built from the exact `ops/request-broker/main.py` and pinned
   requirements at the selected source, running Functions Framework with entry point
   `request_evidence`. Use the existing authorized publication/build infrastructure
   and a digest in `us-east5-docker.pkg.dev/family-game-factory-jzw/jems-release-images/`.
   Retain build ID, exact source archive/file hashes, builder identity, base/dependency
   provenance and resulting digest. A registry digest proves immutability, not which
   source it contains. **No image has been built or approved by this task.** The
   bootstrap deliberately does not create a parallel build account, bucket, registry,
   implicit source-build pipeline or API activation. Any missing build prerequisite
   needs its own exact diff under the existing publication method.
3. Pin this operations candidate's full reviewed commit. From a clean checkout run:

   ```sh
   python3 scripts/ops/bootstrap_request_diagnostics.py --source-sha "$REVIEWED_SHA" --image "$BROKER_IMAGE"
   python3 scripts/ops/bootstrap_request_diagnostics.py --source-sha "$REVIEWED_SHA" --image "$BROKER_IMAGE" --check
   ```

   The first is offline. The second uses the owner's existing administrator session,
   reads project/API/account/key/policy/pool/provider/view/bucket/service/image state,
   and prints the additive diff plus `approve_plan_sha256`. Raw policies and metadata
   stay in memory; only hashes and the proposed fixed grants are emitted. The token
   is never printed. Keep this output in the private operational record.
4. Review that exact diff, image provenance, narrow grants and cost. Only after the
   owner approves, add `--apply --approve-plan-sha256 HASH`. The bootstrap repeats
   preflight and rejects changed inventory. It verifies resulting configuration.
   Completion is **CONFIGURED_NOT_ACCEPTED**, until the following acceptance work.
5. Reuse/create only the `jems-production-diagnostics` GitHub environment with exactly
   the main branch allowed. Verify main protection and actual OIDC subject format.
   Keep `JEMS_DIAGNOSTICS_HOURLY_ENABLED` absent/false; do not enable debugging.
   These GitHub settings are separate from the Cloud Shell bootstrap, and no settings
   write or recurring enablement was performed here.
6. Run `python3 scripts/ops/audit_request_diagnostics.py` as the existing operator.
   It checks resource existence and Policy Troubleshooter's **overall** result for
   explicit allow/deny tuples, including inherited policy evaluation. Unknown,
   missing, API-disabled or inaccessible results fail acceptance. It adds no API or
   grant. Retain the dated report privately. Review ancestor visibility, unsupported
   permission/resource combinations, conditional inputs and the legacy diagnostics
   view separately. Actual caller invocation and broker reads remain required. Verify anonymous GET to
   the exact broker URL returns 401/403 with no body capture; a 200 fails private
   invocation acceptance. Review ancestor public grants as well as local policy.
7. Follow the existing [coverage and privacy procedure](PRODUCTION_DIAGNOSTICS_SETUP.md)
   to establish a finite, settled coverage interval, independent request-count
   comparison, retention and effective IAM. Install its dated attestation through a
   separately reviewed broker revision. The bootstrap sets only bucket location;
   it **never manufactures coverage timestamps**. Its later preflight stops on the
   changed environment, preserving the separately reviewed receipt.
8. Manually dispatch the existing protected-main workflow for an already observed,
   free request interval. Verify source/run/attempt, artifact digest, one regular
   `report.json`, strict schema, exact scope, observed rows and completeness. Then
   pass it to `triage_request_evidence.py`. Do not replay a paid application request.
   An initial broker without a receipt may validate private invocation but supplies
   no usable request rows. Publish only the allowlisted report and scoped conclusions.

The optional [Cloud Shell launcher](../../scripts/ops/handoffs/request-diagnostics-bootstrap.sh)
checks out an exact commit in a temporary directory and runs the same bootstrap.
Download it from the reviewed immutable raw GitHub URL, verify its SHA-256 **before
execution**, and pass the reviewed source, image and plan hash. Do not use a mutable
main URL or pipe an unchecked download into a shell. Launcher SHA-256: `816e9abac3527695e9b4b07903738472a9855ba40ef3ac9f4d2027ee98cb62a2`. Its checksum is included in the
candidate handoff; a changed helper requires a new checksum and review.

## Exact intended resource changes

| Resource | Additive setup; conflicting resources stop |
| --- | --- |
| `jems-github-diagnostics/github-main` | Dedicated keyless pool/provider, exact existing CEL, issuer/audience/mapping; no wildcard subject |
| `jems-github-log-reader` | No project roles or user-managed keys; exact WIF subject may impersonate it |
| `jems-request-broker` | No project roles or user-managed keys; runtime of only the new broker |
| `jemsRequestViewReader` | Exactly `logging.views.get` and `logging.views.access` |
| `global/_Default/views/jems-production-requests` | PR153 exact three-service regional platform-request filter; custom role bound to broker only |
| `jems-request-evidence` | Reviewed digest, broker runtime, required IAM authentication, min 0/max 1, concurrency 1, 60 s timeout, 1 CPU/256 MiB; exact caller Invoker grant |

The caller never gets log access. The view selects whole entries and is **not** a
redaction layer: the trusted broker alone projects and sanitizes the output. No sink,
raw log copy, retention extension, Codex grant, shared field-restriction change,
application deployment/traffic change, secret/data read or paid request is included.

## Partial failure, disablement and cost

After any failure preserve the private output, run a new read-only `--check`, inspect
remaining actions and approve its new hash. Existing exact marked resources and
bindings are reused; conflicting names, keys, grants, trust, images or runtime settings
stop. There is no automatic rollback, deletion, privilege widening or rebuild. A
newly deployed but reconciling service must be inspected before a fresh check.

Emergency stop after authorization: leave the scheduling variable false, disable
only `github-main` in `jems-github-diagnostics`, and remove the caller's Invoker binding
from only `jems-request-evidence`. This stops new federation/invocations without
changing application services; issued tokens can remain valid until expiry, so the
Invoker removal is needed as well. Re-read policies and verify denial. Do not remove
the existing Codex pool or production worker/release trust. Full removal is a separate
reviewed plan: broker service, its exact view binding/view, caller WIF binding,
provider/pool and dedicated accounts/role after checking references. Image cleanup
uses the existing registry retention process; never delete shared logs or buckets.

Planning assumption: at most 100 manual queries/month, each <=60 s, one vCPU and
256 MiB, no minimum instances. This bounds planned request execution at about 6,000
vCPU-seconds and 1,500 GiB-seconds/month, before retries/overhead. Illustrative list
rates of $0.000024/vCPU-second and $0.0000025/GiB-second give about **$0.15/month**
compute, before free-tier allocation. This is an estimate, not a current regional
quote. Allow **$1–5/month** provisionally for small manual use plus artifact/platform
log storage; image build, registry storage, network and GitHub Actions/artifacts are
additional and must be priced from actual project usage. This document authorizes
no spend. Max instances is not a spending cap. Hourly work remains off; 720 monthly
queries at the same upper duration would be 43,200 vCPU-seconds before overhead.
Validate actual regional billing rates and set the approved alert/allowance first.

## Subsequent provisioning against frozen main

| Area | Existing controller and next gate |
| --- | --- |
| DEV/TEST | `ops/environments.json` still has `enabled:false`, unset project/identities/IAP. Use `scripts/environments/` and the separate-project/IAP plan, with the existing $15/month planning context; verify actual account, billing and browser audience. #191 directory correction is independent. No production diagnostic role can provision DEV. |
| Storage recovery | Preserve #186/F06, mixed-version recovery and original bytes. Use `docs/storage/ROLLOUT.md`, synthetic copies and exact rollback-reader compatibility. Private configuration, worker/WIF/runner settings and live recovery remain unread in this task. |
| Sandbox publication | Reconcile #169 to frozen `bc602f1…`, exact public package inputs, signed digest and existing sandbox publication workflow. Do not move its source pin or publish during this work. |
| Worker rotation | Private #22 combines #19–21; protected worker baseline in main's ledger is `dddf53dbc76796be19782c1bb5bbb99b86e99909`. Requalify public pin, runner/WIF and compatibility together; verify live private state before rotation. Source acceptance does not authorize trust/pin rotation. |
| Premium generation | Keep disabled. The recorded $3.912 initial reservation/$5 lineage ceiling is a planning envelope, not current entitlement/pricing or a paid trial receipt. Use the existing private worker, isolated TEST, model/rate verification, explicit funded trial and recovery gates. |

Current parallel learning #218, creative #220 and CI #219 remain separate. No feature
branch is merged into this operations candidate. The [triage runbook](AUTONOMOUS_TRIAGE.md)
records the available investigation loop and current authentication evidence limits.

## Candidate validation

Local operations suite: 262/262 passed, including 23 added SDK/preflight/bootstrap/
policy/triage cases. Focused Node 22 authentication suite: 29/29 passed. Actual pinned
Google Auth 2.43.0 and Requests 2.32.5 initialize a synthetic external-account session
without network or writes. Shell syntax, whitespace and documentation checks pass.
These are offline/fixture and source checks. Independent live SDK preflight in this
task stops at the missing managed attachment. The owner's separate-task SDK success
is recorded distinctly. The original diagnostic reader, production workflows,
provider condition, broker source/schema and release intent remain byte-identical.
