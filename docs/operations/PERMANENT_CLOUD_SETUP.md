# Permanent cloud operations: executable setup

November 26, 2026 (America/New_York). PR #222 incorporates managed-auth correction
`34fd728919e79e90b63f00933d87a265d6d0ac86`. Direct managed SDK effective-account
qualification remains **incomplete** because supported identity endpoints are
unavailable. Do not retry explicitly denied endpoints, copy credentials, alter the
managed proxy or broaden IAM. That limitation does not gate the independent lanes
below. Frozen application source `bc602f1ede502f398308ad56f973c4bf7997ff08`, release
identities and production services are unchanged.

## Administrator checkpoint and recovery

The administrator reports the six GitHub restrictions applied (independently read
back), project `jems-jzw-nonprod` ACTIVE with number `1092405124984`, matching approved
billing, Terraform 1.13.5 and an intact **unapplied** 28-resource plan. Preserve its
original source `446a245e624f44c36e1e3847ae7779477272d899` and approval hash
`821d722ee140ffdef4c8ae4ba4e1fed89307e6c997153b3a8597f726a8caaad6`.
Do not regenerate, migrate or rebind it to a newer recovery-tool commit. An approval
hash identifies the reviewed plan; it is not evidence that apply occurred.

Existing broker build `7fcac19a-8444-4c17-955a-1a381006069e` is reported SUCCESS,
but source/image/provenance verification is not yet accepted. **Never resubmit it.**
The verifier now names each failed predicate and can run a bounded `--diagnose`
against an existing build. Use `--build-source-sha 446a245e624f44c36e1e3847ae7779477272d899`
with a newer verifier to retain the actual image's original source, labels and archive.
The new launcher fetches sparse, blob-filtered operations source to reduce temporary
disk usage. Current task access has no Google identity or Cloud Build reader; one
administrator probe is required to identify the actual failed provider predicate.
The administrator probe identified only `BUILD_ARTIFACTS_UNEXPECTED`: an exact
provider mirror of the approved images list. The verifier now accepts only that
mirror and still rejects every additional artifact field or destination. Registry
verification remains pending. [Recovery and guarded cleanup](OPERATIONS_RECOVERY.md)
preserves the original build and unapplied Terraform plan; no rebuild is required.

## One verified launcher

Use an existing administrator Cloud Shell session with `gcloud`, `gh`, Python 3 and
Terraform >=1.6,<2. Credentials stay in their supported tools; no keys are created.
The reviewed handoff supplies the full `OPS_SHA` for this candidate. Download once:

```sh
curl -fsSL "https://raw.githubusercontent.com/jzwyrzyk/family-game-factory/$OPS_SHA/scripts/ops/handoffs/operations-bootstrap.sh" -o /tmp/jems-operations.sh
printf '%s  %s\n' fdfefd869abeb1876102e9086ceba26998725ef0cc9a856a43adc7900fb6ddb4 /tmp/jems-operations.sh | sha256sum -c -
bash /tmp/jems-operations.sh "$OPS_SHA" github --check
bash /tmp/jems-operations.sh "$OPS_SHA" broker-build --check
bash /tmp/jems-operations.sh "$OPS_SHA" nonprod --inventory
```

These three checks make no cloud or GitHub changes. The launcher fetches exactly
the selected commit into a temporary clean checkout and accepts only four named
operations. Keep inventories, billing IDs, Terraform plans/state and operational
receipts private, outside the checkout. No direct Codex credential is a prerequisite.
The older request-only launcher remains available; the consolidated launcher is
preferred. A checksum verifies the downloaded launcher against the reviewed handoff;
it does not itself approve the source SHA or a provisioning plan.

## Exact changes requiring approval

| Lane | Proposed change | Cost and security effect |
| --- | --- | --- |
| GitHub | Set selected-branch policies and add only branch `main` on `jems-production-diagnostics`, `jems-nonproduction`, `jems-nonproduction-uat`: six REST changes in the observed inventory | No new credential, OIDC template, release setting, schedule or application change. Restricts diagnostic environment; creates the two missing nonproduction environments. |
| Broker publication | One <=600-second Cloud Build using existing `factory-service-builder`, source bucket `family-game-factory-jzw-service-builds-us-east5`, repository `factory-services`, image `request-broker` | No new builder, bucket, registry or IAM. One build plus image/source/log storage; at an illustrative $0.006/minute, <=$0.06 compute before allowances. Verify actual account/SKU pricing; this is not a quote. |
| PR153 broker infrastructure | Dedicated `jems-github-diagnostics/github-main` pool/provider; `jems-github-log-reader` and `jems-request-broker` keyless accounts; `jemsRequestViewReader` custom role; `global/_Default/views/jems-production-requests`; `jems-request-evidence` Cloud Run service; three exact resource bindings | Caller can impersonate only its account and invoke only broker; broker gets `logging.views.get/access` on only the filtered view. No project log role or secret/data/deploy grants. Min 0, max 1, concurrency 1, 256 MiB, 1 vCPU, 60s. Indicative $1–5/month for sparse manual reads, separate from nonproduction budget; not an approved cap. |
| Nonproduction project | Reserve `jems-jzw-nonprod` only after availability review; link the verified existing billing account | No production data/credential copy. No silent adoption of a hidden or colliding project. Account/parent authority remains an administrator prerequisite. |
| Nonproduction Terraform | 28 expected create instances for an empty project: eight API enables, four keyless SAs, four runtime account bindings, one registry and writer binding, two custom roles and controller binding, IAP service identity and agent binding, disabled pool/provider and two exact federation bindings, one project-filtered $15 monthly budget | Existing architecture; DEV `jems-static-runtime` and TEST `jems-test-runtime` are distinct and have zero application roles. Deployer acts as those two only; UAT has no project role. Federation disabled, registry deletion dry-run, no application deployment, data service, secret, NAT, VM or AI. Initial plans reject updates/replacement/deletion. |

Actual resource existence can reduce creates or reveal conflicts. The scripts bind
approval to freshly read inventory/source or a saved Terraform plan; no GCP apply
hash is available until the authenticated administrator checks complete. Failed,
inaccessible and absent resources are distinct states, never evidence of denial.
Review effective ancestor/group/resource policies before activation.

## Broker build, provisioning and request evidence

The publisher stages exactly four committed broker files. The Python base is pinned
by digest; every CPython 3.12 Linux x86_64 dependency wheel is version/hash pinned.
It reuses the existing Cloud Build preflight and compares the returned builder,
executable steps/options, source archive SHA256 from provider provenance, resolved
source generation and registry digest. This is source-bound provider evidence, not
an independently signed SLSA attestation. The Docker builder follows the existing
lane's image; record its provider-reported builder digest in the private build
record. No actual broker build has been accepted yet.

After approving the printed build plan:

```sh
bash /tmp/jems-operations.sh "$OPS_SHA" broker-build --submit --approve-plan-sha256 "$BUILD_PLAN_HASH"
# Use the returned existing build ID; do not repeat --submit after timeout.
bash /tmp/jems-operations.sh "$OPS_SHA" broker-build --build-id "$BUILD_ID"
bash /tmp/jems-operations.sh "$OPS_SHA" broker-setup --image "$BROKER_IMAGE" --build-id "$BUILD_ID" --check
# Only after reviewing that exact additive infrastructure plan:
bash /tmp/jems-operations.sh "$OPS_SHA" broker-setup --image "$BROKER_IMAGE" --build-id "$BUILD_ID" --apply --approve-plan-sha256 "$BROKER_PLAN_HASH"
```

`BROKER_IMAGE` is the verified `factory-services/request-broker@sha256:...` result.
Check/apply independently reverify Cloud Build provenance. They never accept a tag,
external image, mutable source or arbitrary build recipe. Setup ends
**CONFIGURED_NOT_ACCEPTED**. It does not install fabricated log coverage or enable
hourly execution. Preserve the [PR153 privacy/coverage procedure](PRODUCTION_DIAGNOSTICS_SETUP.md):
finite settled interval, independent request-count/retention comparison, exact IAM
audit (`audit_request_diagnostics.py`), anonymous denial, effective caller/broker
checks, and a separately reviewed dated coverage revision before complete evidence.
Keep existing exact CEL until signed claims qualify it; a mismatch is a blocker,
not permission to widen claims or change repository OIDC and disrupt release trust.

After the six GitHub changes are approved, apply with:

```sh
bash /tmp/jems-operations.sh "$OPS_SHA" github --apply --approve-plan-sha256 "$GITHUB_PLAN_HASH"
```

`github_operations.py` provides bounded diagnostic dispatch and retrieval. Prepare
an `inputs.json` containing only `service`, `revision` (empty for service-wide),
`start_utc`, `end_utc` for a settled interval of at most one hour. After broker
qualification, dispatch once from the current protected main:

```sh
bash /tmp/jems-operations.sh "$OPS_SHA" github --dispatch --expected-main "$MAIN_SHA" --inputs "$PWD/inputs.json" --dispatch-receipt "$PWD/dispatch-once.json"
gh run list --repo jzwyrzyk/family-game-factory --workflow jems-production-diagnostics.yml --event workflow_dispatch --limit 5
bash /tmp/jems-operations.sh "$OPS_SHA" github --run-id "$RUN_ID" --expected-main "$MAIN_SHA" --inputs "$PWD/inputs.json"
```

Retrieval requires the exact workflow/repository/main/source/attempt/scope, GitHub
artifact digest, a single bounded `report.json`, and strict PR153 schema. It returns
sanitized triage. When the managed CLI cannot follow GitHub's archive redirect, use
the supported GitHub connector download and add `--artifact-zip /private/path.zip`;
the same provider digest, source, attempt and scope checks still apply. This path
was actually qualified with the failed PR153 artifact from run `45323244621` and
correctly returned `UNAVAILABLE/IDENTITY_UNAVAILABLE`, never successful acceptance.
A failed auth report remains unavailable; a successful workflow
alone is not complete request evidence. Recent 401s remain a separate investigation;
never replay a paid POST or infer rollback from them. No private report is committed.

Use the attached managed GitHub connection if it permits dispatch. Otherwise a
repository-selected GitHub App needs Actions:write and Contents:read for routine
dispatch/retrieval; initial environment setup separately needs Administration:write.
GitHub Actions:write is **repository-wide**, not per-workflow. The client allowlist
is a software guard, not an IAM boundary. Do not create a broad PAT or persist an
App key here. Manual owner dispatch is the fallback if that capability is unavailable.

## Nonproduction project, budget and IAP

Approved preparation target: `jems-jzw-nonprod`, `us-east5`, $15/month infrastructure,
live AI off. The named owner IAP principal stays in the private configuration until
review; no personal email needs publication in this public repository.

`nonprod --inventory` verifies the production project's existing billing account is
open and, for an existing nonproduction project, checks its number, lifecycle and
billing attachment. It prints exact project-create/link argument arrays if the ID
is not visible. **Not visible does not prove globally available.** Use Cloud Console's
New project ID check before the approved create command; Google atomically reserves
the ID at creation and rejects collision. There is no reservation from this read-only
check. An inaccessible project, uncertain create or billing mismatch stops recovery;
never blindly retry or adopt an unknown project.

After reviewing/approving and executing those two exact project commands, run:

```sh
mkdir -p "$HOME/work/jems-nonprod-state"
chmod 700 "$HOME/work/jems-nonprod-state"
bash /tmp/jems-operations.sh "$OPS_SHA" nonprod --plan --state-dir "$HOME/work/jems-nonprod-state"
# Review the private reviewed.json and saved plan; then approve its printed hash.
bash /tmp/jems-operations.sh "$OPS_SHA" nonprod --apply --state-dir "$HOME/work/jems-nonprod-state" --approve-plan-sha256 "$NONPROD_PLAN_HASH"
```

State is durable/private, never in a temporary checkout or committed. Provider
versions/hashes use the existing lockfile. Apply rechecks project/billing/source,
saved-plan hash and a fresh cloud plan; it records an exclusive started marker to
prevent blind replays after uncertain/partial execution. An initial conflict or
partial apply needs explicit state review; do not delete state/marker to force a
retry. Migrate state to an approved private backend before multiple operators use it.

The $15 budget emits default billing-recipient notifications at 50%, 80% actual and
100% forecast, filtered to this project. Verify the owner receives billing alerts;
IAP access alone does not make them a billing recipient. Budgets do not cap charges.
The static estimate is $2–5 minimal / $6–15 moderate use, with no standing Run
instances; storage/network can exceed it. DEV/TEST share this **nonproduction-only**
aggregate budget and trusted control plane, but distinct runtime identities/origins,
no shared server data or provider credentials. They do not inherit production
spending admission. Independent hard dollar limits for each lane are not implemented.

One-time Console step: select this project, configure the OAuth consent/client for
direct Cloud Run IAP if required (especially a project outside an organization).
Use the approved owner Google account as the sole initial adult IAP user. Record
only the OAuth client ID as `iapAudience`; never copy its secret into source/chat.
Reuse direct IAP, no load balancer. The controller grants owner and dedicated UAT
access on each exact service; reject anonymous and other-user access in real browsers.

After baseline apply, `configuration-identifiers.json` gives both runtime identities,
controller/UAT accounts, numeric project and provider. Prepare a separate reviewed
`ops/environments.json` change with these values, `iapAudience`, exact owner allowlist,
initial `maxPreviews:2`, min 0/max 1 and TTL72h. Keep the current file disabled until
signed claim, permission and IAP tests qualify it. Enable federation/registry cleanup
only through a separately reviewed Terraform update; the initial helper deliberately
rejects updates. The existing trusted environment controller then owns routine
preview, permanent static TEST, cleanup and UAT operations; no routine Cloud Shell.

The static TEST website is **not a complete TEST backend**. Permanent TEST still
requires its own gateway, untrusted generated-game origin, coach, Firestore, artifact
bucket, worker identities/network and reset controls, with production identifiers and
data forbidden. DEV remains disconnected synthetic local data. These additional
billable resources are excluded from this $15 baseline apply: the actual worker/network
choice and full TEST cost must be reviewed before provisioning. Existing
[DEV → TEST → PROD](../development/DEV-TEST-PROD.md) architecture remains authoritative;
do not install NAT/VMs or share the production default database under the static budget.

## Observed qualification

The attached GitHub connection reads workflow/environment metadata and accepted an
explicit read-only `observe=true` dispatch on frozen main. Its source excludes the
plan/transition jobs in that mode. See [delivery ledger](../../DELIVERY-STATE.md) for
run outcome. Request-broker live evidence, administrator cloud inventory, project
availability/billing, actual broker image build, nonproduction apply and IAP acceptance
remain separately unverified. No denied managed identity endpoint was retried.
