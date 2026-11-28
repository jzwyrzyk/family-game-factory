# DEV-first administrator setup

**November 28, 2026 — verification and proposed setup only.** The owner accepts the planning assumptions and the existing TEST trial constraint. No project/resource/IAM mutation, paid activation or production promotion is authorized. DEV proceeds independently of TEST's domain decision. This operations-only source is based on protected main `4aec7aa67129ca074671c3cc9e1ae7e23f679fd0`; the held application remains in #223/#226. The previous #226 head `153ee315dce90ab6af317e42275b4a0eef2f3a69` has all 42 active hosted checks passing, with one intentionally disabled check. Those receipts do not establish live DEV acceptance.

## What the owner needs to do now

1. In **Google Cloud Console → project selector**, look for `jems-jzw-dev`. If visible, report its **project ID and project number**. If not visible, report that; it does not prove the ID is globally available. Confirm whether your account can create a project and link an existing billing account. **Do not create it or change billing yet.** Keep billing-account IDs private.
2. In **GitHub → family-game-factory-lab organization → repositories/settings**, verify whether a private DEV worker repository already exists and whether your administrator can manage its GitHub Apps and restricted runner group. The current connection received 404 for the proposed DEV and TEST repository names; that is insufficient evidence to create duplicates. Report only existing/not visible and whether administrator access is available; do not send App keys or tokens.
3. Be ready to approve the bound setup plan and select the authorized adult Google account through the protected setup. Later, install the separate DEV provider key directly into its approved private destination. **Never paste credentials, private configuration or billing details into chat or the public PR.** There is no need to decide TEST DNS now.

A useful reply is: `DEV project: <ID / number, or not visible>; can create/link billing: yes/no; private DEV worker: exists/not visible; GitHub organization admin available: yes/no.` No Cloud Shell commands are requested.

## Work owned by the release operator

Prepare/review the operations-only PR; verify and install its source through protected integration at the applicable approval, without merging the held application. The new GitHub **Jems DEV foundation plan** workflow accepts only the current protected-main SHA. It has **no apply mode**, starts no builds or VMs and invokes no model. It reuses `dev_bootstrap.py` and `dev_contract.py` byte-for-byte from the qualified application candidate. Its new adapter refuses cloud mutation commands and does not require fabricated adult IDs, worker IDs, domain names or model approvals to inspect a foundation.

After approved initial trust/storage setup, the operator dispatches the workflow. It reads actual DEV resource metadata, runs the existing isolation checks and derives the exact additive commands. Missing APIs produce only an API-enablement proposal; it never assumes inaccessible services are empty. An approval for that phase cannot approve later, previously unobserved resources. Re-inventory after approved API enablement, then present the actual foundation plan.

The raw inventory/commands go to the private DEV planning bucket and are read back byte-for-byte. Public logs receive only operator SHA, stage, counts, private object locator, digest and review deadline. No public Actions artifact contains the inventory. An uncertain object write is not retried; a separate new planning run can observe afresh, without replaying infrastructure changes. A proposal is not an approval receipt or a deployment manifest.

The existing DEV helper CLI is not an owner execution path. A protected executor must independently bind an approved plan, fresh inventory and durable uncertainty/readback receipts before any apply; this read-only PR does not install an executor or grant it rights. Image build, runtime configuration, private worker setup, adult enrollment and live acceptance remain distinct later steps. Reuse existing implementations; no TEST spending mechanism is added.

## Initial bootstrap delta to approve after verification

The actual DEV project number, billing target/parent and current resource inventory are still missing. **The table below is a concrete proposed bootstrap scope, not an exact live cloud plan.** Bind those verified facts and the protected operations commit before approval. If the ID is unavailable, review the replacement before creating anything; this workflow intentionally binds `jems-jzw-dev` and will not silently target another project.

| Resource / permission | Proposed exact scope |
| --- | --- |
| DEV project | `jems-jzw-dev`, labels `environment=development`, `application=jems`; independently approved existing billing target; no TEST/production project changes |
| Metadata planner | Keyless `jems-dev-infra-plan@jems-jzw-dev.iam.gserviceaccount.com`; custom project role `jemsDevFoundationPlanner` with exactly [the listed metadata permissions](../../ops/dev-foundation-planner-role.json); no Owner/Editor/Service Account Token Creator role, application database access, model access or secret-version access |
| Planning records | Private regional `jems-jzw-dev-infrastructure-plans` bucket in `us-east5`, uniform bucket-level access, enforced public-access prevention. This is an **additional DEV-only planning bucket**, not TEST storage or application data. No public IAM binding, no deletion/overwrite grant and no automatic deletion of approval evidence |
| Plan object access | Planner gets `roles/storage.objectCreator` and `roles/storage.objectViewer` on this bucket, conditioned on `resource.name.startsWith('projects/_/buckets/jems-jzw-dev-infrastructure-plans/objects/foundation/')`; it writes unique run-ID objects using generation-match zero. Metadata role reads bucket identity. Authorized administrator can review these objects through Cloud Storage Console |
| GitHub federation | Pool `jems-dev-operations`, OIDC provider `github-dev-foundation-plan`, issuer `https://token.actions.githubusercontent.com`, `google.subject=assertion.sub`. Require the exact condition below; grant `roles/iam.workloadIdentityUser` on the planner account only to the exact environment subject in this pool |
| Protected GitHub environment | Public application repository, environment `jems-dev-foundation-plan`; exact `main` branch only, required reviewer, prevent self-review and bypass. Set only variable `DEV_PROJECT_NUMBER` to the verified separate project number. Do not change existing static or production environments |
| Initial APIs | Only those necessary for project/IAM/WIF and private plan storage (`cloudresourcemanager.googleapis.com`, `iam.googleapis.com`, `iamcredentials.googleapis.com`, `sts.googleapis.com`, `storage.googleapis.com`, `serviceusage.googleapis.com`), after exact enabled-state reconciliation. Remaining DEV APIs are proposed by the read-only inventory, not silently enabled |
| Budget | DEV project budget $40/month with 50/80/100% notifications/forecast review. Notification only, not a hard cap. No automatic shutdown/deletion. TEST budget is unchanged by this DEV-only bootstrap |

Proposed provider condition (numeric GitHub identities are already verified; the GCP project number is not):

```text
assertion.repository == 'jzwyrzyk/family-game-factory' &&
assertion.repository_id == '1458033181' &&
assertion.repository_owner_id == '356692244' &&
assertion.repository_visibility == 'public' &&
assertion.ref == 'refs/heads/main' &&
assertion.event_name == 'workflow_dispatch' &&
assertion.environment == 'jems-dev-foundation-plan' &&
assertion.workflow_ref == 'jzwyrzyk/family-game-factory/.github/workflows/jems-dev-foundation-plan.yml@refs/heads/main'
```

The IAM principal subject is `repo:jzwyrzyk/family-game-factory:environment:jems-dev-foundation-plan`, under **the verified DEV project number's** `jems-dev-operations` pool. Bind no wildcard repository, arbitrary branch or production principal. Before dispatch, verify effective permissions including inherited organization/folder grants: the planner must be denied resource creation/deletion, project IAM changes, secret payload access and application data access. Bucket writes are limited to the private plan-record prefix. The workflow's pinned action credential and active-account checks do not replace this administrator privilege verification.

This once-only bootstrap is the genuinely administrator-owned boundary. Use the Google Cloud/GitHub settings consoles or an existing approved administrator automation. The operator supplies the bound values and reviewed permission manifest; the owner does not run the foundation CLI or routine terminal commands. Broad temporary roles are not a substitute for the exact setup.

## Cost and spending boundaries

Carry forward the accepted planning ceilings: DEV infrastructure $40/month; TEST infrastructure including static hosting $60/month; DEV AI $25 cumulative for 30 days with explicit renewal and one concurrent paid operation; TEST AI outer envelope $10/seven days with the existing initial at-most-$5/24-hour session; premium lineage at most $5. These remain **planning limits**, not activation. All allowances start at the separately approved actual activation time. No new TEST mechanism, ledger reset or automatic renewal.

The added planning bucket is charged by bytes/operations, not a per-bucket standing fee. Its objects are included in the existing DEV scenario's 10-GiB GCS retained-storage allocation; 1 GiB-month within that allocation is approximately $0.023 plus operations. If retention grows beyond the scenario, account for it within the existing $21.03 DEV reserve; no cap increase is requested. The previously estimated totals remain approximately $18.97 DEV and $46.97 TEST/month for their stated workload, subject to actual billing/SKU verification. The complete cost scenario remains in the [held release package](https://github.com/jzwyrzyk/family-game-factory/blob/153ee315dce90ab6af317e42275b4a0eef2f3a69/docs/operations/RELEASE-EXECUTION-2026-11-28.md#completed-planning-cost-model), with this additional bucket as a disclosed inventory amendment.

## Approval and live acceptance order

1. Owner supplies the minimal verification above. Operator binds the initial bootstrap delta to actual target/current state and exact reviewed operations source; request its explicit approval. **No executable cloud plan exists yet.**
2. After approved bootstrap, run GitHub DEV inventory/plan. Review the exact private plan digest, target, source, current state and missing-resource delta. Approve only that observed phase; the existing helper's staged API observation prevents approving unknown foundations. Finish/qualify the protected executor before apply. Never paste saved commands into Cloud Shell to bypass the gate.
3. Approve the actual DEV resources/configuration/builds and separate AI allowance, deploy the accepted application candidate, and observe adult login/denials, ordinary live coach/build/edit/Keep/reload, saved-work recovery, allowance expiry/exhaustion, month-boundary behavior and worker cleanup. Record exact artifacts/configuration/worker identities and owner/device acceptance.
4. Only then protected application integration, integrated TEST fixture/live acceptance using the existing trial, and separately approved exact-manifest production promotion. TEST DNS may be resolved in parallel; it is not a DEV prerequisite. External invitations remain disabled.
