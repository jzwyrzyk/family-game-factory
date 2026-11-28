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
safe to share. It requires actual matching name-limit and unsupported-role errors
before offering an executable plan approval. The budget finding is a documented
ADC requirement; an actual budget error has not been supplied or observed.

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
pool/provider, IAP identity/policy and all budget pages. Permission denial never
means absence. Plan-time imports avoid blind duplicate creates. Full refreshed
Terraform plans must contain every existing address as a no-op, no detected
resource drift, passing checks, no deferred reads, and only the two exact allowed
remaining resources. The receipt includes complete remaining values, source/input
hashes, state lineage/serial, inventory, private-evidence hashes and binary/full
plan hashes. Its canonical SHA-256 is the **approval hash**.

After reviewing that private receipt, invoke the same handoff with
`--apply-receipt /absolute/path/to/reviewed-recovery.json --approve-plan-sha256 HASH`.
An approval for the original 28-resource plan cannot approve this corrected plan.
Apply rechecks the original evidence, source, input bytes, actual inventory and
all refreshed plan fields except generation time. A global, durable O_EXCL marker
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

## Fixed failure codes

| Code | Meaning |
| --- | --- |
| `STATE_DIRECTORY_MISSING`, `ORIGINAL_EVIDENCE_MISSING` | Required private evidence is unavailable; no plan/approval exists. |
| `ORIGINAL_APPROVAL_CHANGED`, `ORIGINAL_PLAN_OR_MARKER_CHANGED`, `PARTIAL_STATE_SCOPE_MISMATCH` | Saved inputs no longer match the exact initial recovery case. |
| `WIF_DISPLAY_NAME_LIMIT`, `IAP_PROJECT_ROLE_INVALID` | Actual provider error matched a specific reviewed cause. |
| `ADC_QUOTA_PROJECT_REQUIRED_OR_DENIED`, `READ_PERMISSION_DENIED`, `REQUIRED_PERMISSION_MISSING` | ADC quota or resource permissions need diagnosis; never auto-grant. |
| `IAM_POLICY_CONTENTION`, `ABORTED` | Concurrent policy change; re-read, never attribute to the role automatically. |
| `AUDIT_DIAGNOSIS_UNCONFIRMED` | Correlated messages did not establish the proposed causes; private review required. |
| `EXISTING_RESOURCE_DRIFT`, `EXISTING_CHANGE_OR_UNEXPECTED_ACTION`, `FULL_PLAN_DRIFT` | Existing infrastructure or reviewed remaining actions changed; no apply. |
| `BUDGET_INVENTORY_AMBIGUOUS`, `PROVIDER_CONFLICT_OR_SOFT_DELETED`, `OBSOLETE_IAP_BINDING_EXISTS` | Actual resources conflict; do not create, delete or adopt blindly. |
| `APPROVAL_HASH_MISMATCH`, `RECOVERY_INPUT_CHANGED`, `RECOVERY_PLAN_CHANGED` | Approval or immutable material differs. |
| `RECOVERY_ALREADY_STARTED_INSPECT_SUCCESSOR_STATE`, `TERRAFORM_APPLY_TIMEOUT_UNCERTAIN` | Preserve all evidence/state; no replay. |

Federation, registry cleanup, application deployment, live AI and production
infrastructure remain outside this recovery. Tests and source review do not
substitute for the missing private-state/cloud reconciliation receipt.
