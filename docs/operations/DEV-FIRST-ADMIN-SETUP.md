# DEV-first administrator setup

**November 28, 2026 — verification and proposed setup only.** The owner accepts the planning assumptions and the existing TEST trial constraint. No project/resource/IAM mutation, paid activation or production promotion is authorized. DEV proceeds independently of TEST's domain decision. This operations-only source is based on protected main `4aec7aa67129ca074671c3cc9e1ae7e23f679fd0`; the held application remains in #223/#226. The previous #226 head `153ee315dce90ab6af317e42275b4a0eef2f3a69` has all 42 active hosted checks passing, with one intentionally disabled check. Those receipts do not establish live DEV acceptance.

## What the owner needs to do now

1. In **Google Cloud Console → project selector**, look for `jems-jzw-dev`. If visible, report its **project ID and project number**. If not visible, report that; it does not prove the ID is globally available. Confirm whether your account can create a project and link an existing billing account. **Do not create it or change billing yet.** Keep billing-account IDs private.
2. In **GitHub → family-game-factory-lab organization → repositories/settings**, verify whether a private DEV worker repository already exists and whether your administrator can manage its GitHub Apps and restricted runner group. The current connection received 404 for the proposed DEV and TEST repository names; that is insufficient evidence to create duplicates. Report only existing/not visible and whether administrator access is available; do not send App keys or tokens.
3. Be ready to approve the bound setup plan and select the authorized adult Google account through the protected setup. Later, install the separate DEV provider key directly into its approved private destination. **Never paste credentials, private configuration or billing details into chat or the public PR.** TEST's namespace is now selected: `test.myjems.com`, with registration at Wix. Its DNS capability check below is independent of DEV.

A useful reply is: `DEV project: <ID / number, or not visible>; can create/link billing: yes/no; private DEV worker: exists/not visible; GitHub organization admin available: yes/no.` No Cloud Shell commands are requested.

## TEST DNS: Wix verification and records

The owner has selected `test.myjems.com` and reserved `myjems.com` for eventual production. This supersedes the unselected-domain assumption in the November 28 held release package; it does not authorize DNS changes or paid resource creation. DEV keeps its native authenticated Cloud Run URL and requires none of these records.

### What Wix supports and what still needs verification

Wix's [nameserver instructions](https://support.wix.com/en/article/changing-nameserver-ns-records-for-a-wix-domain) document switching the **whole domain** to custom nameservers. Do not use that option or unassign the domain from its site for this task. It is not child-zone delegation.

The [Wix DNS API](https://dev.wix.com/docs/api-reference/account-level/domains/domain-dns/update-dns-zone) lists `NS` additions, a `hostName` that can be a subdomain, and multiple values in a record set. It requires an account-level API key with Manage Domains permission. However, the dashboard documentation does not establish a child-NS editing flow, and the API's hostname description also contains an ambiguous domain-name restriction. **The schema is evidence of a possible supported API route, not proof that this account can delegate a child zone.** Do not assert that Wix categorically forbids delegation, create a new Wix integration, or request a broad API key merely to test it.

The one Wix administrator verification is to open **Domains → myjems.com → Domain Actions → Manage DNS records**, inspect the current nameservers, and ask Wix support if child NS editing is unavailable:

> Can you add an NS record set at `test.myjems.com` containing all nameservers assigned to a Google Cloud DNS child zone, while preserving the existing authoritative nameservers and every other record for `myjems.com`? Is this supported through this account's DNS editor, your support team, or the Domain DNS API? If not, can this account add `*.hub.test` as a wildcard A record and three Google-generated certificate-validation CNAME records under `hub.test`, `home.test`, and `preview.test`? Please confirm capability only; do not change records yet.

Registration at Wix does not establish that Wix is currently authoritative. If custom nameservers are already in use, the existing authoritative DNS provider owns this step. Local public DNS lookups failed (resolver errors and an HTTPS resolver proxy rejection); no live NS, CAA or record-absence claim is made. Export the current DNS records before an approved change and preserve them for readback. No root migration, registration transfer or domain purchase is proposed.

### Preferred delegation: exact names, values pending approved allocation

Proposed Cloud DNS managed-zone ID: `jems-test-myjems-com`; public DNS name: `test.myjems.com.`; project: existing `jems-jzw-nonprod`. Neither the zone nor its availability is independently confirmed. After approved creation, obtain the zone's **entire assigned nameserver set**. These values cannot be derived from the zone name and must not be guessed.

| Where | Type | Record name / host | Value | TTL |
| --- | --- | --- | --- | --- |
| Existing parent DNS provider, Wix if authoritative | NS | `test` (full name `test.myjems.com.`) | Every name in the approved child zone's returned `nameServers` set; one record set, retaining all values | 300 if supported, otherwise provider default recorded in the receipt |
| Google child zone, GitHub-managed | A | `hub.test.myjems.com.` | Reviewed TEST edge global IPv4 | 300 |
| Google child zone, GitHub-managed | A | `home.test.myjems.com.` | Same IPv4 | 300 |
| Google child zone, GitHub-managed | A | `preview.test.myjems.com.` | Same IPv4 | 300 |
| Google child zone, GitHub-managed | A | `*.hub.test.myjems.com.` | Same IPv4 | 300 |
| Google child zone, GitHub-managed | CNAME, three records | Exact generated owners from DNS authorizations `jems-test-hub`, `jems-test-household`, `jems-test-preview` | Exact corresponding generated targets | 300 |

The wildcard is deliberately `*.hub.test.myjems.com`, as implemented by the existing workshop router; it is not `*.workshop.test.myjems.com`. The hub DNS authorization also covers its wildcard, so no fourth authorization record is needed. Google uses `PER_PROJECT_RECORD`; copy each returned `dns_resource_record.name`, `.type` and `.data` exactly, including its generated suffix. Do not substitute a guessed `_acme-challenge` name, an A record or a serving CNAME for a validation record. Source: [Google DNS authorization](https://docs.cloud.google.com/certificate-manager/docs/dns-authorizations).

These are exact chosen hostnames, **not yet copy-ready record values**: the global IPv4, assigned nameservers and three validation pairs require actual approved resource allocation/readback. No record is needed at `test.myjems.com` to serve the application. Cloud DNS supplies its zone apex SOA/NS. No new AAAA or DS record is proposed. Check effective CAA, including `issuewild`, before certificate issuance; `PER_PROJECT_RECORD` uses Google Trust Services (`pki.goog`). If restrictive CAA prevents issuance, present the minimal TEST-only addition for approval rather than changing root policy.

### Simplest fallback if Wix cannot delegate this child zone

Keep DNS at its current provider and use Wix's documented [external-subdomain A/CNAME pointing](https://support.wix.com/en/article/connecting-a-subdomain-to-an-external-resource). The existing Google load balancer, hosts, certificate and application routing stay the same. In **Manage DNS records → A → Add Record**, the Wix-relative host fields would be:

| Wix Host Name | Type | Value |
| --- | --- | --- |
| `hub.test` | A | Reviewed TEST global IPv4 |
| `home.test` | A | Same IPv4 |
| `preview.test` | A | Same IPv4 |
| `*.hub.test` | A | Same IPv4; verify Wix accepts this wildcard before choosing the fallback |

Under **CNAME → Add Record**, add the same three generated validation pairs. For each Host Name, remove only the final `.myjems.com.` from the returned full owner; paste the exact target into Value. Check the displayed full name before saving to avoid doubling the domain suffix. Use TTL 300 if offered, otherwise record Wix's default; allow for Wix's documented propagation window of up to 48 hours. Do not add a broad CNAME at `test` or `hub.test`, which would conflict with the required records.

This is a proposed compatibility fallback, not already-qualified automation: #226's current Terraform requires an existing dedicated Cloud DNS zone and writes the A/CNAME records there. An undelegated Cloud DNS zone would not make Wix authoritative records appear. If needed, make only the narrow change that supplies these DNS records for external administration and verifies their public answers; qualify it before TEST apply. Wildcard support remains an account verification item. Do not change hosting or implement that conditional adjustment while delegation remains unresolved.

### Administrator actions after the applicable approval

1. **Operator:** verify existing resources/records, obtain the account capability result, and bind the exact additive setup plan to the protected source, TEST project and cost envelope. The child zone is a prerequisite to the existing TEST plan, not permission to apply the entire TEST stack. Its cost remains about $0.24/month at 100,000 queries, within the existing TEST estimate; no domain purchase is needed. A Wix-hosted fallback avoids this Cloud DNS line only if no child zone is retained. Do not assume a Wix upgrade is needed or authorized.
2. **Administrator, once:** approve the observed setup delta and establish missing narrowly scoped cloud/GitHub trust through existing approved administration. If delegation is supported, after approved zone creation add only the returned NS set at `test` using the confirmed Wix/provider method. With the fallback, enter the four A and three CNAME records only after their actual values and the narrow automation adjustment are approved. Never replace the root nameserver set.
3. **Operator, through protected GitHub automation:** manage the Google child-zone records in the preferred route, verify delegation and every serving/validation answer, certificate readiness, adult authentication and origin separation; record before/after evidence proving unrelated root records are unchanged. Reuse the existing TEST controller and finite acceptance mechanism. DEV activation and acceptance proceed independently on `run.app`.

No DNS mutation, resource allocation, AI activation, application merge or production promotion occurred as part of this verification. External family invitations remain disabled.

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
