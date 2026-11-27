# Nonproduction partial-apply recovery

The owner reports that the original and pre-apply recheck plans matched, with 25
of 28 resource instances recorded. This supersedes the earlier **unapplied**
status, without changing its original receipts. The private directory is
`~/work/jems-nonprod-state`; the saved remaining plan is
`partial-recovery-1795714051.tfplan`. Neither is present on the attached Codex
computer. Actual state, full provider errors, resource inventory and a corrected
cloud plan remain unverified until that directory is accessible to its existing
authorized operator. No approval hash is invented from the source patch.

## Exact proposed correction

1. Change the provider display name from the 37-character
   `Protected main environment controller` to the 30-character
   `Jems protected main controller`. Preserve IDs, exact GitHub issuer/audience,
   mapping, immutable repository/owner IDs, protected-main workflow restrictions
   and `disabled=true`.
2. Bind only `google_billing_budget.nonproduction` to a new Google provider alias
   with `project=billing_project=jems-jzw-nonprod` and
   `user_project_override=true`. Preserve the existing billing account, the
   project-number filter `1092405124984`, USD 15 monthly amount, credit treatment
   and three alert thresholds. This notification budget is not a hard cap.
3. Remove the **uncreated** `google_project_iam_member.iap_agent` declaration.
   Preserve the managed IAP service identity. The existing controller already
   grants and verifies exactly service-level `roles/run.invoker` for that agent,
   plus per-service IAP access for the reviewed adult/UAT allowlist. Do not add a
   project-level invoker role or alter controller privileges. If the obsolete
   binding is actually in state or live IAM, recovery stops rather than deletes it.

With the reported inventory, the expected corrected plan has **2 creations,
25 no-ops, 0 updates, 0 replacements and 0 destructions**, yielding 27 managed
instances. If an uncertain prior create already succeeded, the operator proposes
its exact import; the import must plan as a no-op. Conflicting, duplicate,
soft-deleted or modified resources stop recovery.

## Provider requirements reviewed

The pinned provider is Google/Google Beta **7.46.2**; retain its original lockfile
and Terraform **1.13.5**. The official provider source at this version documents:

| Resource | Requirement and retained behavior |
| --- | --- |
| Workload provider | Pool/provider IDs 4–32 lowercase letters/digits/hyphens, no `gcp-` prefix; display name ≤32; description ≤256. Existing IDs conform. |
| OIDC mapping | Required `google.subject`; expression ≤2,048 characters; at most 50 custom attributes; condition ≤4,096. Existing mapping and condition are unchanged. Mapped subject must be ≤127 characters and evaluated attributes ≤8 KB; live claim qualification remains separate. |
| OIDC issuer/audience | Public HTTPS issuer; fixed GitHub issuer; one explicit canonical provider audience, ≤256 characters (max 10 audiences). No custom keys or issuer expansion. Provider creation still requires Google's validation of issuer discovery, JWKS and CEL. |
| Federation | Both pool and provider disabled. Creation does not qualify actual GitHub claims, denial from untrusted workflows, token exchange or access. Those must pass separately before enablement. |
| Budget | User ADC requires an explicit quota project and `user_project_override=true`; caller needs `serviceusage.services.use` on that project. Budget API enabled there; open/matching billing account; budget list/get/create permission. Display name ≤60; monthly project-number filter; positive USD amount; existing nonnegative thresholds. Billing currency must support the specified USD budget; server rejection stops and is recorded. |
| IAP | Existing managed agent and IAP API; Cloud Run invocation granted on each service. Initial OAuth/consent, programmatic audience and real owner/UAT browser qualification remain separate deployment gates. No Terraform Cloud Run service is created by this recovery. |

Sources: [pinned billing-budget documentation](https://github.com/hashicorp/terraform-provider-google/blob/v7.46.2/website/docs/r/billing_budget.html.markdown),
[pinned workload-provider documentation](https://github.com/hashicorp/terraform-provider-google/blob/v7.46.2/website/docs/r/iam_workload_identity_pool_provider.html.markdown),
[Google provider REST contract](https://docs.cloud.google.com/iam/docs/reference/rest/v1/projects.locations.workloadIdentityPools.providers),
[direct Cloud Run IAP](https://docs.cloud.google.com/run/docs/securing/identity-aware-proxy-cloud-run),
[current IAP role reference](https://docs.cloud.google.com/iam/docs/roles-permissions/iap).

The reported `CreateWorkloadIdentityPoolProvider` code 3 is consistent with the
invalid display name but is insufficient by itself to confirm that cause.
`SetIamPolicy` code 3 requires the actual message; code 10 is contention/aborted,
not proof of an invalid role. The operator reads correlated administrative errors
and retains messages privately. Fixed diagnostic codes and message hashes are
safe to share. The invalid project role requires a correlated code 3 role error. If no workload-provider failure was observed, the operator must independently verify the exact 37-character name for the disabled `github-main` provider create in the approved binary plan, its matching recheck and the saved partial plan. IAM permits 32 characters. The receipt records the confirmed invalid input and leaves the historical provider response unobserved. An unmatched provider error blocks this evidence path. The refreshed plan still must prove the exact correction and the full no-drift scope. [IAM provider field contract](https://docs.cloud.google.com/iam/docs/reference/rest/v1/projects.locations.workloadIdentityPools.providers#WorkloadIdentityPoolProvider) The budget finding is a documented
ADC requirement; an actual budget error has not been supplied or observed.

## IAP evidence and DEV activation

The November 27 operator observed a 404 when IAM looked up the IAP service agent in the consumer project. Google hosts this agent. Recovery validates the single root managed `google_project_service_identity.iap` in the original state, including the Google Beta provider, resource ID, project, service, email and IAM member. Its evidence is bound to the original state hash and the recovery receipt. Live reads independently verify the active project ID and number, IAP API enablement and the absence of the obsolete project grant. The pinned provider implements service identity refresh as a no-op. [Service agents](https://docs.cloud.google.com/iam/docs/service-account-types) · [Google Beta 7.46.2 implementation](https://github.com/hashicorp/terraform-provider-google-beta/blob/v7.46.2/google-beta/services/resourcemanager/resource_project_service_identity.go)

**Release blocker.** Recovery must produce the scoped plan from the preserved state. DEV activation separately requires verification on the actual Cloud Run service of IAP enforcement, the exact agent's service-level `roles/run.invoker`, the approved IAP accessor policy, unauthenticated denial, and a successful audience-bound UAT invocation returning the expected source and bundle. Keep DEV acceptance pending until the existing [service policy checks](../../scripts/environments/cloud.py) and [deployed browser gate](../../.github/workflows/jems-environments.yml) pass and access denials are verified. The recovery receipt records this requirement as `REQUIRED_BEFORE_DEV`.

**Nonblocking limitation.** Service Usage v1beta1 `GenerateServiceIdentity` can create the agent and requires separate approval if ever needed. It produces no Service Usage audit log. Recovery does not invoke it or request a creation log. The existing audit checks concern the historical workload-provider and project-policy errors. [Service Usage audit logging](https://docs.cloud.google.com/service-usage/docs/audit-logging)

The remaining read contracts were checked against Google REST discovery on November 27. Logging v2 lists scoped entries. Resource Manager v1 reads the project, tests permissions and retrieves the version-3 allow policy. Cloud Billing v1 reads the project billing link and account, and tests account permissions. Service Usage v1 reads individual service states. IAM v1 gets the pool and pages providers with deleted entries included. Billing Budgets v1 pages account budgets using the billing account parent, `pageSize`, `pageToken` and `nextPageToken`. Required permissions and complete inventory remain mandatory.

## One executable handoff, two guarded modes

Use the checksum-verified `operations-bootstrap.sh` from the final reviewed
source with lane `nonprod-recover`. The delivered handoff pins that immutable
source and launcher checksum. It performs read-only planning by default. This is
a one-time partial bootstrap recovery under the existing operator's user ADC,
not a new routine owner-mediated diagnostic lane. Managed Codex credentials must
not fall back to owner ADC. Do not paste tokens, state or private error prose.

Planning checks the original source binding, original approval hash, saved-plan
bytes, apply marker, 25-instance state, original/recheck action equality and saved
three-action partial plan. It rejects missing evidence, changed provider locks,
symlinks, tainted/deposed resources and unrelated input. It copies state into a
new private `partial-recovery/attempt-*` directory and writes only new files.
Original state, configuration, receipts, plans and marker remain unchanged.

Live reconciliation reads the exact project/billing, APIs, permissions, disabled
pool/provider, project IAM policy and all budget pages. Permission denial never
means absence. Plan-time imports avoid blind duplicate creates. Full refreshed
Terraform plans must contain every existing address as a no-op, passing
checks, no deferred reads, and only the two exact allowed remaining resources.
Two refresh differences can qualify on this preserved state. On the static
registry, `labels` may go from null to an empty map. On the runtime act-as
member, only the policy etag may change. The operator reads the named runtime
account's policy with requested version 3, matches its etag and verifies the deployer is the
sole member of both unconditional grants (Service Account User and the project
runtime inspector). Both resources must have identical refreshed and planned
values. Other drift stops recovery. The full refresh stays in the plan hash and
the same checks run on the fresh pre-apply plan.
[Google IAM service account policy read](https://cloud.google.com/iam/docs/reference/rest/v1/projects.serviceAccounts/getIamPolicy).

The locked Google provider 7.46.2 can represent the configured monthly period
as `calendar_period: null` in its create plan. Planning binds the three filter
expressions in the saved configuration to the literal month, all credits and the
verified project number. Both a known null and `MONTH` express the reviewed
cadence. A missing or unknown planned period, another cadence, or a custom
period stops recovery. Google Billing defaults an unset usage period to monthly.
For an existing budget (including the post-apply inventory), the operator also
checks the actual project, effective cadence, credits and absence of additional
scope filters in the existing list response. [Pinned provider implementation](https://github.com/hashicorp/terraform-provider-google/blob/v7.46.2/google/services/billingbudgets/resource_billing_budget.go) · [Google Billing usage period contract](https://github.com/googleapis/googleapis/blob/master/google/cloud/billing/budgets/v1/budget_model.proto)

The receipt includes complete remaining values, source/input
hashes, state lineage/serial, inventory, private-evidence hashes and binary/full
plan hashes. Its canonical SHA-256 is the **approval hash**.

After reviewing that private receipt, invoke the same handoff with
`--apply-receipt /absolute/path/to/reviewed-recovery.json --approve-plan-sha256 HASH`.
An approval for the original 28-resource plan cannot approve this corrected plan.
Apply rechecks the original evidence, source, input bytes, actual inventory and
all refreshed plan fields except generation time. For `relevant_attributes` it
sorts the outer list only. Terraform 1.13.5 can reorder that list on otherwise
identical plans. Entries, duplicates, nested path order, resource changes,
state, and the approved binary checksum are all bound.
[Terraform 1.13.5 plan serializer](https://github.com/hashicorp/terraform/blob/v1.13.5/internal/command/jsonplan/plan.go#L810-L816)

For a pre-apply `FULL_PLAN_DRIFT` from operator `cb98b1dc`, run the new
launcher in `--plan` mode with `--compare-recheck ATTEMPT PRIOR_RECEIPT_SHA256`.
It verifies the old receipt and saved plan, then compares the unique recheck in
that attempt. A difference beyond metadata order and generation time stops
before cloud planning. An order-only difference permits a fresh reviewed plan
in a new directory. The new receipt carries the comparison evidence and
requires its own approval.

A global, durable O_EXCL marker
precedes the first mutation; parallel operators and repeated applies stop. It
applies the approved binary once, using serial provider operations, then requires
27 managed instances, disabled federation and a full zero-change plan.

After success, the receipt's **successor state** is the authoritative state for
future work. Preserve the original as evidence and never run its old apply again.
A partial failure or timeout preserves successor state and the started marker.
Do not delete either marker, run `state rm`, force-unlock, target resources, retry
an uncertain mutation or reuse an older attempt. Reconcile that successor state
in a separately reviewed follow-up; this first-recovery operator intentionally
refuses automatic replay.

## Completion after the observed budget refresh

The administrator reported 27 managed no-ops, three passing checks and no
deferred actions, data changes or output changes in the saved post-apply plan.
The budget refresh materialized empty `credit_types`, `resource_ancestors` and
`subaccounts` lists. The applied operator stopped before its final original-file
integrity check and completion receipt.

The existing operations bootstrap accepts a `nonprod-verify` lane with the
approved receipt digest and the diagnosed post-apply binary digest. It locks
the same recovery operator, verifies the marked successor generation, original
manifest and exact saved plan, and permits only those three null-to-empty
changes with all 27 managed resources at no-op. It uses `terraform show` on the
saved plan and writes the private `completed.json` once. Repeated verification
checks an existing receipt for equality. The successor remains authoritative.
The optional `--audit-broker` runs the existing finite read-only IAM audit as a
separate step after receipt verification and saves its detailed output privately.
Broker coverage, federation activation and deployment retain their own gates.

The administrator subsequently reported `RECOVERED_DISABLED_NOT_ACTIVATED`,
27 instances, `NO_CHANGES` and disabled federation. The successor's private
completion receipt closes the Terraform recovery. The separate broker audit
returned `NOT_ACCEPTED` with all 77 checks failed or unknown.

## Broker IAM follow-up

The administrator's second broker audit established all three expected grants
and 62 expected denials. Twelve expected denials remained unknown. Rows
29/35/65/71 concern access-token creation on the release and diagnostic service
accounts. Rows 38/39/74/75 received HTTP 400 on the Gateway secret tuple.
Rows 40/41/76/77 stopped at HTTP 404 on the historical Coach secret name.

Use the standalone `broker-iam --unresolved-first` lane. It checks those 12
rows first with the protected project's quota and the paced v3 client. If any
remain unresolved or differ from expectation, it returns their original row
numbers and stops. If they pass, it evaluates the other 65 during the same run.
Only 77 current matching observations pass finite IAM qualification.

Global secret tuples use the numeric project and exact name returned by Secret
Manager metadata. If the historical Coach name returns 404, the operator checks
the single 100%-serving Coach revision for a distinct same-project secret reference
and checks the revision again. Missing or ambiguous targets keep the gate closed.
The private report distinguishes the original selector, evaluated target and
serving revision. A 404 supplies no permission evidence. The reader requests
only reference metadata. Unknown policy results retain selected allow, deny
and membership enums. Service invocation and settled broker coverage require
their own evidence after the finite audit passes.
[Google asset names](https://docs.cloud.google.com/asset-inventory/docs/asset-names) ·
[Cloud Run secret references](https://docs.cloud.google.com/run/docs/configuring/services/secrets) ·
[Policy Troubleshooter v3](https://docs.cloud.google.com/policy-intelligence/docs/reference/policytroubleshooter/rest/v3/iam/troubleshoot)

### Four outstanding access-token checks

The next administrator run confirmed eight secret denials. The four remaining
rows (29, 35, 65 and 71) returned `UNKNOWN_INFO` with unsupported individual
principal membership. The summaries contain 73 matching observations across two
runs. They cannot be combined into a current acceptance receipt.

The optional `broker-iam --check-as-diagnostic-accounts` mode verifies these
four first. If the same membership limitation persists, it verifies the four
account identities and the operator's existing issuance authority on each needed
diagnostic identity. The terminal asks for explicit approval before requesting
up to two five-minute IAM-scoped bearer tokens. Credentials stay in process
memory. Each actual diagnostic identity calls IAM `testIamPermissions` on the
verified numeric IDs of the release and managed diagnostics accounts. The only
permission queried is `iam.serviceAccounts.getAccessToken`. Each API response
must be valid and each target must retain its identity. A reported grant stops
the audit immediately. The private report retains the original Troubleshooter
outcome and records the basis for the independent determination.

Declining the prompt, missing existing authority, another unresolved policy
condition, or a failed API request keeps qualification open. Successful checks
continue through the remaining 73 tuples in the same invocation. The result is
scoped to the observed accounts, permissions, time and request context. Broker
runtime invocation and settled coverage still require separate acceptance.
[Google IAM permission check](https://docs.cloud.google.com/iam/docs/reference/rest/v1/projects.serviceAccounts/testIamPermissions) ·
[Short-lived credential issuance](https://docs.cloud.google.com/iam/docs/reference/credentials/rest/v1/projects.serviceAccounts/generateAccessToken)

### Administrator preflight and native controller

The administrator returned `ADMIN_ISSUANCE_AUTHORITY_ABSENT` with zero issuance
requests. The preflight stopped on the first missing permission. All four target
checks remain unknown. The one-time Terraform approval has already been consumed.

An operator who already has issuance authority on both diagnostic identities can
use the preceding direct check. That lane needs an authenticated account, a private
receipt directory and the immutable launcher. It has no dependency on the Terraform
directory. No such alternative operator has been verified.

The draft native route uses the existing protected `jems-production-diagnostics`
workflow and private `jems-request-evidence` service. Only a manual
`token-boundary` dispatch can select the fixed probes. GitHub uses the existing
log-reader federation for a five-minute IAM-scoped caller credential and the
broker's audience-bound invocation token. The broker verifies its runtime email
and uses its own metadata credential. Both clients test the sole permission
`iam.serviceAccounts.getAccessToken` on the release and managed diagnostics
accounts. Empty permission sets require independent account inventory before
and after the run. The native report alone cannot qualify a denial.

**Activation requiring separate approval**

1. Review the protected workflow, its `scripts/ops/native_broker_probe.py`,
   `scripts/ops/request_evidence.py`, `scripts/ops/diagnose.py` and the broker's
   `ops/request-broker/main.py` at the selected source. Integrate the reviewed
   controller on protected main. The operator checks the five blob identities.
2. Use the existing `broker-build` publication lane's exact-source plan and
   approval for one new build. Verify the completed build ID, source archive,
   builder, repository and immutable result digest. The previous verified build
   and rollback revision remain historical assets. See [publication cost and
   verification](PERMANENT_CLOUD_SETUP.md).
3. Read back the serving broker revision, digest, configuration, traffic and
   IAM. Record the rollback revision. Stage the verified new digest on the
   existing broker with zero traffic. Compare service account, invocation IAM,
   environment, ingress, resource limits and scaling with the baseline.
   With explicit broker traffic approval, route to the candidate, then verify
   the single 100% serving revision and authenticated invocation. If verification
   fails, restore the captured traffic assignment to the old revision.
4. For initial acceptance use one operator session with the existing Cloud
   metadata reader and authorized GitHub dispatch/readback. Supply the reviewed
   protected commit and verified new broker digest to the pinned operations
   bootstrap. After steps 1–3 the command is
   `bash "$launcher" "$ops_sha" broker-iam --native-controller "$approved_main" "$broker_digest"`,
   where the digest is `sha256:` plus 64 hex digits. The operator verifies
   account IDs, broker runtime identity, single serving revision and digest,
   records a private challenge, and dispatches once. It checks the exact run,
   first attempt, source, required steps, artifact hash, challenge and observation
   time. It repeats the cloud inventory before accepting the four results and
   completing all 77 current checks. A lost dispatch response retains the
   challenge for run reconciliation. An unexpected grant, stale result or
   incomplete run leaves acceptance open.
5. The protected workflow can perform subsequent native observations directly
   from GitHub. A separate settled-source and request-count receipt is required
   before the broker supplies production canary coverage.

### One-time authorized broker execution

The diagnostics-only integration from #227 passed all six required checks and entered protected main through [#228](https://github.com/jzwyrzyk/family-game-factory/pull/228). The integrated main is `7576543a68d92e78ab74884dbd34a78f84c46029`. The reviewed broker build source is `bca6b5c383ed741e252793e468776921e32ff67f`.

Use the pinned operator launcher's `broker-execute PROTECTED_MAIN_SHA` lane in the existing authenticated administrator session. It records the serving revision, digest, traffic, and private invoker policy before the single bounded build. It verifies provenance, stages the digest with zero traffic, checks the 5% canary allocation, promotes, verifies a fresh protected GitHub run and all 77 permission checks, and restores the retained revision on a failed live qualification. Preserve its private receipts on a disconnect. A recorded submission intent prevents an uncertain build from being submitted again.

After IAM acceptance the same lane collects an hour of settled counts from the existing log view and Cloud Monitoring. A coverage decision requires matching independent traffic and dated evidence of routing, exclusions, retention and availability. The [source verification procedure](PRODUCTION_DIAGNOSTICS_SETUP.md) governs the dated attestation and its end-to-end verification. The nonproduction provider remains disabled through these checks.

## Fixed failure codes

| Code | Meaning |
| --- | --- |
| `STATE_DIRECTORY_MISSING`, `ORIGINAL_EVIDENCE_MISSING` | Required private evidence is unavailable; no plan/approval exists. |
| `ORIGINAL_APPROVAL_CHANGED`, `ORIGINAL_PLAN_OR_MARKER_CHANGED`, `PARTIAL_STATE_SCOPE_MISMATCH` | Saved inputs no longer match the exact initial recovery case. |
| `WIF_DISPLAY_NAME_LIMIT`, `IAP_PROJECT_ROLE_INVALID` | Actual provider error matched a specific reviewed cause. |
| `ADC_QUOTA_PROJECT_REQUIRED_OR_DENIED`, `READ_PERMISSION_DENIED`, `REQUIRED_PERMISSION_MISSING` | ADC quota or resource permissions need diagnosis; never auto-grant. |
| `IAM_POLICY_CONTENTION`, `ABORTED` | Concurrent policy change; re-read, never attribute to the role automatically. |
| `IAP_ROLE_AUDIT_UNCONFIRMED`, `UNRESOLVED_PROVIDER_AUDIT_ERROR`, `PROVIDER_PLAN_EVIDENCE_MISMATCH` | The required role audit, provider error diagnosis or exact saved provider inputs failed verification. Preserve the attempt for review. |
| `EXISTING_RESOURCE_DRIFT`, `EXISTING_CHANGE_OR_UNEXPECTED_ACTION`, `FULL_PLAN_DRIFT` | Existing infrastructure or reviewed remaining actions changed; no apply. |
| `REGISTRY_LABEL_REFRESH_MISMATCH`, `RUNTIME_MEMBER_REFRESH_MISMATCH`, `RUNTIME_POLICY_ETAG_MISMATCH`, `RUNTIME_POLICY_BINDINGS_CHANGED` | The reported metadata refresh could not be bound to the exact registry or runtime account policy. |
| `BUDGET_INVENTORY_AMBIGUOUS`, `PROVIDER_CONFLICT_OR_SOFT_DELETED`, `OBSOLETE_IAP_BINDING_EXISTS` | Actual resources conflict; do not create, delete or adopt blindly. |
| `APPROVAL_HASH_MISMATCH`, `RECOVERY_INPUT_CHANGED`, `RECOVERY_PLAN_CHANGED` | Approval or immutable material differs. |
| `RECOVERY_ALREADY_STARTED_INSPECT_SUCCESSOR_STATE`, `TERRAFORM_APPLY_TIMEOUT_UNCERTAIN` | Preserve all evidence/state; no replay. |

Federation, registry cleanup, application deployment, live AI and production
infrastructure remain outside this recovery. Tests and source review do not
substitute for the missing private-state/cloud reconciliation receipt.
