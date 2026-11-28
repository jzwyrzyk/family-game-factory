# DEV-first administrator setup

**November 28, 2026 — verification and proposed setup only.** The owner accepts the planning assumptions and the existing TEST trial constraint. No project/resource/IAM mutation, paid activation or production promotion is authorized. DEV proceeds independently of TEST DNS. The owner has now created `jems-jzw-dev` (`300049441641`); this package concerns only its remaining setup. This operations-only source is based on protected main `4aec7aa67129ca074671c3cc9e1ae7e23f679fd0`; the held application remains in #223/#226. The previous #226 head `153ee315dce90ab6af317e42275b4a0eef2f3a69` has all 42 active hosted checks passing, with one intentionally disabled check. Those receipts do not establish live DEV acceptance.

## Administrator observations and remaining verification

On November 28 the administrator reported that Google Cloud shows the existing Jems nonproduction and Family Game Factory production projects, no dedicated `jems-jzw-dev`, and an available **Create Project** button. GitHub's `family-game-factory-lab` organization shows only the existing private `family-game-factory-worker`, no separate DEV/TEST worker repositories, and an available **New Repository** button. Do not repeat those inventory questions. The owner subsequently created **Jems DEV**, project ID **`jems-jzw-dev`**, number **`300049441641`**. This supersedes the earlier absent-project observation: project creation and ID availability are no longer setup actions. The identifier is owner-reported; a direct cloud identity, billing, permission and API readback remains pending. Repository visibility and the New Repository button do not prove organization-wide inventory or restricted runner-group permissions.

Read-only API verification through the existing GitHub connection reports `admin: true` for both `jzwyrzyk/family-game-factory` and the existing private worker repository. Organization membership and runner-group reads return HTTP 403, **Resource not accessible by integration**. This limits the connection; it does not establish that the owner lacks those rights. The application environment listing has no `jems-dev-foundation-plan` environment. Protected main remains `4aec7aa67129ca074671c3cc9e1ae7e23f679fd0`. No production settings were changed.

Only these administrator checks remain before binding setup:

1. **Google Cloud → select Jems DEV (`jems-jzw-dev`, `300049441641`) → Billing:** verify whether billing is already linked and enabled. Preserve any approved existing linkage; if unlinked, privately select the intended existing billing account for explicit attachment approval. Do not change another project or infer the target from production. In IAM & Admin and APIs & Services, verify existing administrator authority and enabled services against the finite table below. The assistant has no qualified DEV cloud identity yet, so these live readbacks cannot be inferred from repository access. No project creation, move or parent selection remains necessary.
2. **GitHub organization Settings:** confirm rights to create private repositories and manage GitHub Apps/restricted runner groups under the current subscription. Name an existing independent reviewer for protected planning runs. The workflow dispatcher cannot approve their own run; no protection bypass or paid plan upgrade is approved. Repository admin has been verified and need not be checked again. App/group rights are needed for the later worker activation, so they need not delay separately approved DEV project/planner setup.

**Never paste credentials, App keys or billing-account IDs into chat or the public PR.** The DEV project identity is now supplied. Its billing status/selection remains an administrator verification, not something inferred from production. DEV stays on its native authenticated Cloud Run URL. Wix child-delegation capability has been confirmed and needs no further capability question.

## Bootstrap B1: bounded approval package

**Decision requested: setup only, after the remaining target/permission checks. No execution is authorized by this document.** Review the exact PR #235 source commit and bind it, DEV project `300049441641`, the verified billing status/approved account and administrator/reviewer identities in the private approval receipt. The DEV number is fixed at `300049441641`; use it in the literal federation bindings below. GitHub will allocate new repository IDs, and Google will allocate child-zone nameservers; derive only those values from actual resource readback. If an existing resource/name conflicts, observe it and stop that item rather than adopt, rename, delete or recreate it. Independent DEV setup can continue if the TEST item is blocked.

| Item | Exact proposed setup | Execution owner after approval |
| --- | --- | --- |
| Existing DEV project | **Reuse**, never recreate: `Jems DEV` / `jems-jzw-dev` / `300049441641`. Verify ACTIVE state and actual billing. Proposed additive labels `environment=development`, `application=jems`, preserving any other labels. Retain existing parent; no move. If billing is unlinked, attach only the privately selected existing account after approval; if already correctly linked, no billing mutation | Existing cloud administrator verifies identity/billing and performs only a missing approved delta |
| DEV planning bootstrap | Region `us-east5`; account `jems-dev-infra-plan`; custom role `jemsDevFoundationPlanner`; bucket `jems-jzw-dev-infrastructure-plans`; pool `jems-dev-operations`; provider `github-dev-foundation-plan`; exact API, IAM, bucket and OIDC settings in the table and condition below | Existing cloud administrator or already-approved administrator automation; no new owner terminal/Cloud Shell dependency |
| Protected GitHub planning environment | In `jzwyrzyk/family-game-factory`, create `jems-dev-foundation-plan`; selected branch exactly `main`; required named independent reviewer; prevent self-review; administrator bypass disabled; environment variable `DEV_PROJECT_NUMBER` set to `300049441641` after project identity readback. No credential secret or unrelated environment change | Release operator through GitHub API where current installation permits; administrator only if the specific endpoint is denied |
| Private repository shells | `family-game-factory-lab/family-game-factory-worker-dev` and `family-game-factory-lab/family-game-factory-worker-test`; private, empty, no README/template import, Actions disabled. Record allocated IDs and verify privacy. No production clone, production credentials, App installation, runner registration or paid jobs in this step | Release operator through GitHub API if permitted; otherwise organization administrator creates only these two private empty shells. Recheck nonexistence/visibility before creation |
| DEV notification budget | `jems-dev-monthly-40`; USD 40/calendar month, filter only `projects/300049441641`; actual-spend alerts at 50%, 80%, 100% plus forecast review; existing authorized billing notification recipients; no automatic destructive response | Billing administrator; budget notifications are not a hard spending cap |
| Parallel TEST DNS preparation | Existing project `jems-jzw-nonprod` / `1092405124984`; enable `dns.googleapis.com` only if missing and explicitly included in the observed delta; public managed-zone ID `jems-test-myjems-com`, DNS name `test.myjems.com.`, description `Jems integrated TEST child zone`, labels `environment=test`, `application=jems`; DNSSEC off initially, no private-zone attachment, logging off initially; retain Google-created SOA/NS | Existing TEST administrator or approved automation creates only the missing reviewed zone. Read back its entire assigned nameserver set; do not yet change Wix or create the edge |
| Operations source and first plan | Protected integration of the reviewed operations-only PR #235 after applicable source approval and required CI; dispatch `.github/workflows/jems-dev-foundation-plan.yml` on protected `main`, input `source` equal to the actual installed 40-character main SHA | Release operator through GitHub; no held application merge. The workflow cannot apply resources, build images or invoke AI |

The cloud administrator needs effective permission for the approved operations, not a new blanket grant to automation: `billing.resourceAssociations.create` on the selected billing account and `resourcemanager.projects.createBillingAssignment` on DEV only if attachment is needed; DEV-project API enablement, service-account/custom-role/WIF creation and their narrow IAM bindings; private bucket creation and bucket IAM; budget creation for the project-filtered budget. The TEST item needs zone read/create and, only if missing, DNS API enablement in TEST. Verify these through existing administrator access; if organization policy, quota or billing prevents them, capture that specific denial and revise only the affected item. No production-project role or production billing association is changed.

**Included cost scope:** IAM/WIF and an empty private repository carry no separate resource-hour fee under the existing accounts; subscription entitlement still needs confirmation. The first planner uses public-repository GitHub Actions plus small private plan-storage/operation charges. At 1 GiB-month, the existing storage assumption is about $0.023 plus operations. TEST DNS remains $0.20/zone-month plus $0.40/million regular queries, or about $0.24/month at 100,000 queries. These are usage estimates inside the existing $40 DEV / $60 TEST planning ceilings, not spending authorization or hard caps. No runtime, worker VM, NAT, load balancer, model allowance, GitHub subscription upgrade or domain purchase belongs to B1. The full workload estimates remain $18.97 DEV and $46.97 TEST/month; they are not the price of this narrower bootstrap.

**Excluded until the next exact plan/approval:** DEV runtime/storage/network resources beyond the planning bootstrap, worker source import/Apps/groups/credentials, image builds, paid AI, TEST edge and services, Wix delegation, held application integration and production promotion. The DEV helper's next inventory may propose API enablement first and needs re-inventory before a foundation plan. The protected apply executor is not installed by PR #235; qualify it using existing helpers before any later apply. DEV AI remains planned at $25 cumulative/30 days with explicit renewal and one concurrent paid operation, premium lineage $5; TEST retains its existing finite mechanism without a new spending controller.

### Minimum consolidated execution handoff

After explicit B1 approval, the owner performs one cloud administrator setup session for the existing DEV project's billing verification, scoped planning trust/storage/budget and parallel TEST zone, or uses an already-approved administrator automation. The release operator performs permitted GitHub source/environment/repository setup; the owner is involved only for denied administrator endpoints, selecting the reviewer and approving the exact run. The operator verifies each returned resource ID, effective IAM and protection settings before dispatch. No routine Cloud Shell commands are part of the handoff.

The next Wix handoff is a single NS record set at `test.myjems.com.` containing every actual assigned Google nameserver. Supply its literal values and obtain explicit DNS-change approval before asking the owner to proceed. Preserve `ns7.wixdns.net`, `ns6.wixdns.net`, root A records, `www` and all unrelated records. Google child-zone serving/validation records are subsequently managed through protected TEST automation. External family invitations stay disabled.

## TEST DNS: Wix verification and records

The owner has selected `test.myjems.com` and reserved `myjems.com` for eventual production. This supersedes the unselected-domain assumption in the November 28 held release package; it does not authorize DNS changes or paid resource creation. DEV keeps its native authenticated Cloud Run URL and requires none of these records.

### Child-delegation capability confirmed; no change authorized

On November 28 the owner supplied confirmation that an NS delegation can be added for `test.myjems.com` only, using Google Cloud DNS nameservers while leaving root nameservers and every other DNS record unchanged. The confirmation explicitly states that no changes will be made without a further instruction to proceed. Record this as **owner-supplied capability confirmation**, not an observed DNS change, a cloud setup approval or a successful live delegation. The preferred child-zone route is selected; no fallback implementation or further wildcard-support investigation is needed unless this route actually fails.

The supplied Wix screenshots show existing root nameservers `ns7.wixdns.net` and `ns6.wixdns.net`, three root A records (`185.230.63.171`, `185.230.63.186`, `185.230.63.107`), and `www.myjems.com` CNAME `cdn3.wixdns.net`, with the A/CNAME TTLs shown as one hour. Preserve these and all other existing records. These are dashboard observations, not a fresh authoritative DNS query or a complete zone export.

Wix's [nameserver instructions](https://support.wix.com/en/article/changing-nameserver-ns-records-for-a-wix-domain) document switching the **whole domain** to custom nameservers. Do not use that option or unassign the domain from its site for this task. It is not child-zone delegation.

The [Wix DNS API](https://dev.wix.com/docs/api-reference/account-level/domains/domain-dns/update-dns-zone) lists `NS` additions, a `hostName` that can be a subdomain, and multiple values in a record set. It requires an account-level API key with Manage Domains permission. However, the dashboard documentation does not establish a child-NS editing flow, and the API's hostname description also contains an ambiguous domain-name restriction. **The schema is evidence of a possible supported API route, not proof that this account can delegate a child zone.** Do not assert that Wix categorically forbids delegation, create a new Wix integration, or request a broad API key merely to test it.

The earlier capability question is now answered by the owner's confirmation; do not ask it again. After approved zone creation, provide one copy-ready NS record set containing every returned Google nameserver for the confirmed child-only operation. Explicit approval for that exact DNS change is still required before asking the administrator to proceed. Local public DNS lookups previously failed (resolver errors and an HTTPS resolver proxy rejection); no live NS, CAA or record-absence claim is made. Export the complete current DNS configuration before an approved change and preserve it for readback. No root migration, registration transfer or domain purchase is proposed.

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

### Contingency only: not selected after capability confirmation

Keep DNS at its current provider and use Wix's documented [external-subdomain A/CNAME pointing](https://support.wix.com/en/article/connecting-a-subdomain-to-an-external-resource). The existing Google load balancer, hosts, certificate and application routing stay the same. In **Manage DNS records → A → Add Record**, the Wix-relative host fields would be:

| Wix Host Name | Type | Value |
| --- | --- | --- |
| `hub.test` | A | Reviewed TEST global IPv4 |
| `home.test` | A | Same IPv4 |
| `preview.test` | A | Same IPv4 |
| `*.hub.test` | A | Same IPv4; verify Wix accepts this wildcard before choosing the fallback |

Under **CNAME → Add Record**, add the same three generated validation pairs. For each Host Name, remove only the final `.myjems.com.` from the returned full owner; paste the exact target into Value. Check the displayed full name before saving to avoid doubling the domain suffix. Use TTL 300 if offered, otherwise record Wix's default; allow for Wix's documented propagation window of up to 48 hours. Do not add a broad CNAME at `test` or `hub.test`, which would conflict with the required records.

This is a proposed compatibility fallback, not already-qualified automation: #226's current Terraform requires an existing dedicated Cloud DNS zone and writes the A/CNAME records there. An undelegated Cloud DNS zone would not make Wix authoritative records appear. Only a demonstrated failure of the confirmed delegation route would justify revisiting this alternative, verifying Wix wildcard support and qualifying a narrow external-record adjustment. No such change is currently needed or being implemented.

### Administrator actions after the applicable approval

1. **Operator:** verify existing resources/records and bind the exact additive setup plan to the protected source, TEST project and cost envelope, using the confirmed child-delegation route. The child zone is a prerequisite to the existing TEST plan, not permission to apply the entire TEST stack. Its cost remains about $0.24/month at 100,000 queries, within the existing TEST estimate; no domain purchase is needed. Do not assume a Wix upgrade is needed or authorized.
2. **Administrator, once:** approve the observed setup delta and establish missing narrowly scoped cloud/GitHub trust through existing approved administration. After approved zone creation and explicit approval of the returned NS record set, add only that set at `test` through the confirmed child-delegation route. The release operator supplies every literal value before asking you to proceed. Never replace the root nameserver set. The four serving A records and three certificate CNAMEs belong in the Google child zone, not Wix.
3. **Operator, through protected GitHub automation:** manage the Google child-zone records in the preferred route, verify delegation and every serving/validation answer, certificate readiness, adult authentication and origin separation; record before/after evidence proving unrelated root records are unchanged. Reuse the existing TEST controller and finite acceptance mechanism. DEV activation and acceptance proceed independently on `run.app`.

No DNS mutation, resource allocation, AI activation, application merge or production promotion occurred as part of this verification. External family invitations remain disabled.

## Work owned by the release operator

Prepare/review the operations-only PR; verify and install its source through protected integration at the applicable approval, without merging the held application. The new GitHub **Jems DEV foundation plan** workflow accepts only the current protected-main SHA. It has **no apply mode**, starts no builds or VMs and invokes no model. It reuses `dev_bootstrap.py` and `dev_contract.py` byte-for-byte from the qualified application candidate. Its new adapter refuses cloud mutation commands and does not require fabricated adult IDs, worker IDs, domain names or model approvals to inspect a foundation.

After approved initial trust/storage setup, the operator dispatches the workflow. It reads actual DEV resource metadata, runs the existing isolation checks and derives the exact additive commands. Missing APIs produce only an API-enablement proposal; it never assumes inaccessible services are empty. An approval for that phase cannot approve later, previously unobserved resources. Re-inventory after approved API enablement, then present the actual foundation plan.

The raw inventory/commands go to the private DEV planning bucket and are read back byte-for-byte. Public logs receive only operator SHA, stage, counts, private object locator, digest and review deadline. No public Actions artifact contains the inventory. An uncertain object write is not retried; a separate new planning run can observe afresh, without replaying infrastructure changes. A proposal is not an approval receipt or a deployment manifest.

The existing DEV helper CLI is not an owner execution path. A protected executor must independently bind an approved plan, fresh inventory and durable uncertainty/readback receipts before any apply; this read-only PR does not install an executor or grant it rights. Image build, runtime configuration, private worker setup, adult enrollment and live acceptance remain distinct later steps. Reuse existing implementations; no TEST spending mechanism is added.

## Initial bootstrap delta to approve after verification

The owner has supplied DEV project `jems-jzw-dev` / `300049441641`. **The table below is the finite proposed bootstrap scope; actual current resource/API/IAM and billing readback remain pending.** Bind the observed missing-only delta and reviewed operations commit before approval. Never recreate this project, move it, attach a different project or infer that a new project is empty.

| Resource / permission | Proposed exact scope |
| --- | --- |
| Existing DEV project | `jems-jzw-dev` / `300049441641`; additive labels `environment=development`, `application=jems`; preserve parent, other labels and correct existing billing. Only a separately approved missing billing attachment may be made; no project creation or TEST/production project changes |
| Metadata planner | Keyless `jems-dev-infra-plan@jems-jzw-dev.iam.gserviceaccount.com`; custom project role `jemsDevFoundationPlanner` with exactly [the listed metadata permissions](../../ops/dev-foundation-planner-role.json); no Owner/Editor/Service Account Token Creator role, application database access, model access or secret-version access |
| Planning records | Private regional `jems-jzw-dev-infrastructure-plans` bucket in `us-east5`, uniform bucket-level access, enforced public-access prevention. This is an **additional DEV-only planning bucket**, not TEST storage or application data. No public IAM binding, no deletion/overwrite grant and no automatic deletion of approval evidence |
| Plan object access | Planner gets `roles/storage.objectCreator` and `roles/storage.objectViewer` on this bucket, conditioned on `resource.name.startsWith('projects/_/buckets/jems-jzw-dev-infrastructure-plans/objects/foundation/')`; it writes unique run-ID objects using generation-match zero. Metadata role reads bucket identity. Authorized administrator can review these objects through Cloud Storage Console |
| GitHub federation | Pool `jems-dev-operations`, OIDC provider `github-dev-foundation-plan`, issuer `https://token.actions.githubusercontent.com`, `google.subject=assertion.sub`. Require the exact condition below; grant `roles/iam.workloadIdentityUser` on the planner account only to the exact environment subject in this pool |
| Protected GitHub environment | Public application repository, environment `jems-dev-foundation-plan`; exact `main` branch only, required reviewer, prevent self-review and bypass. Set environment variable `DEV_PROJECT_NUMBER=300049441641` after live identity verification. Do not change existing static or production environments |
| Initial APIs | Only those necessary for project/IAM/WIF and private plan storage (`cloudresourcemanager.googleapis.com`, `iam.googleapis.com`, `iamcredentials.googleapis.com`, `sts.googleapis.com`, `storage.googleapis.com`, `serviceusage.googleapis.com`), after exact enabled-state reconciliation. Remaining DEV APIs are proposed by the read-only inventory, not silently enabled |
| Budget | DEV project budget $40/month with 50/80/100% notifications/forecast review. Notification only, not a hard cap. No automatic shutdown/deletion. TEST budget is unchanged by this DEV-only bootstrap |

Exact DEV federation values, bound to the owner-supplied project number (verify live identity before setup):

| Field | Exact value |
| --- | --- |
| Provider resource | `projects/300049441641/locations/global/workloadIdentityPools/jems-dev-operations/providers/github-dev-foundation-plan` |
| Service account | `jems-dev-infra-plan@jems-jzw-dev.iam.gserviceaccount.com` |
| Custom project role binding | `projects/jems-jzw-dev/roles/jemsDevFoundationPlanner` granted to `serviceAccount:jems-dev-infra-plan@jems-jzw-dev.iam.gserviceaccount.com` on DEV only |
| OIDC issuer | `https://token.actions.githubusercontent.com` |
| Attribute mapping | `google.subject=assertion.sub` |
| Audience | Provider's default canonical audience; no additional custom audience |
| Service-account IAM member | `principal://iam.googleapis.com/projects/300049441641/locations/global/workloadIdentityPools/jems-dev-operations/subject/repo:jzwyrzyk/family-game-factory:environment:jems-dev-foundation-plan` |
| Role on that service account | `roles/iam.workloadIdentityUser` for only the principal above |
| GitHub environment variable | `DEV_PROJECT_NUMBER` = `300049441641` |

Provider condition (GitHub numeric identities have been independently verified):

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

The IAM principal subject is `repo:jzwyrzyk/family-game-factory:environment:jems-dev-foundation-plan`, under project **`300049441641`** and its `jems-dev-operations` pool. Bind no wildcard repository, arbitrary branch or production principal. Before dispatch, verify effective permissions including inherited organization/folder grants: the planner must be denied resource creation/deletion, project IAM changes, secret payload access and application data access. Bucket writes are limited to the private plan-record prefix. The workflow's pinned action credential and active-account checks do not replace this administrator privilege verification.

This once-only bootstrap is the genuinely administrator-owned boundary. Use the Google Cloud/GitHub settings consoles or an existing approved administrator automation. The operator supplies the bound values and reviewed permission manifest; the owner does not run the foundation CLI or routine terminal commands. Broad temporary roles are not a substitute for the exact setup.

## Cost and spending boundaries

Carry forward the accepted planning ceilings: DEV infrastructure $40/month; TEST infrastructure including static hosting $60/month; DEV AI $25 cumulative for 30 days with explicit renewal and one concurrent paid operation; TEST AI outer envelope $10/seven days with the existing initial at-most-$5/24-hour session; premium lineage at most $5. These remain **planning limits**, not activation. All allowances start at the separately approved actual activation time. No new TEST mechanism, ledger reset or automatic renewal.

The added planning bucket is charged by bytes/operations, not a per-bucket standing fee. Its objects are included in the existing DEV scenario's 10-GiB GCS retained-storage allocation; 1 GiB-month within that allocation is approximately $0.023 plus operations. If retention grows beyond the scenario, account for it within the existing $21.03 DEV reserve; no cap increase is requested. The previously estimated totals remain approximately $18.97 DEV and $46.97 TEST/month for their stated workload, subject to actual billing/SKU verification. The complete cost scenario remains in the [held release package](https://github.com/jzwyrzyk/family-game-factory/blob/153ee315dce90ab6af317e42275b4a0eef2f3a69/docs/operations/RELEASE-EXECUTION-2026-11-28.md#completed-planning-cost-model), with this additional bucket as a disclosed inventory amendment.

## Approval and live acceptance order

1. Owner-supplied DEV project identity and Wix capability are now recorded. Complete only billing/current-state/remaining administrator verification above. Operator binds the missing-only B1 bootstrap delta to `jems-jzw-dev` / `300049441641` and the exact reviewed operations source; request its explicit approval. **No executable cloud plan or resource-mutation approval exists yet.**
2. After approved bootstrap, run GitHub DEV inventory/plan. Review the exact private plan digest, target, source, current state and missing-resource delta. Approve only that observed phase; the existing helper's staged API observation prevents approving unknown foundations. Finish/qualify the protected executor before apply. Never paste saved commands into Cloud Shell to bypass the gate.
3. Approve the actual DEV resources/configuration/builds and separate AI allowance, deploy the accepted application candidate, and observe adult login/denials, ordinary live coach/build/edit/Keep/reload, saved-work recovery, allowance expiry/exhaustion, month-boundary behavior and worker cleanup. Record exact artifacts/configuration/worker identities and owner/device acceptance.
4. Only then protected application integration, integrated TEST fixture/live acceptance using the existing trial, and separately approved exact-manifest production promotion. TEST DNS may be resolved in parallel; it is not a DEV prerequisite. External invitations remain disabled.
