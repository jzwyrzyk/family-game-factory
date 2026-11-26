# Nonproduction setup and activation

**November 26 executable update:** the owner selected `jems-jzw-nonprod`, `us-east5`,
their named Google account for IAP, existing billing subject to verification, and
$15/month with live AI off. They requested preparation and the exact plan **before
provisioning approval**. Use the [consolidated Cloud Shell handoff](../operations/PERMANENT_CLOUD_SETUP.md)
for one-time administrator checks and saved-plan application, superseding the manual
sequence below. No repeated managed SDK qualification is required. Both DEV and TEST
static runtime accounts are now distinct; the initial Terraform baseline leaves
federation disabled and registry deletion dry-run. Complete TEST backend and independent
per-lane hard spending limits are not established by that static baseline.


**Status:** reviewable setup plan, not provisioned infrastructure. The [environment contract](DEV-TEST-PROD.md) governs the result. The foundation is disabled until the actual project, identities, browser audience, costs and trusted workflow bindings are configured and independently verified. No routine operation requires Cloud Shell.

**Owner authorization received:** November 23, 2026, the owner approved the one-time dedicated nonproduction project, restricted GitHub WIF/IAP setup and a $15/month initial disconnected-preview planning budget, with live AI off. The budget is an alert target, not a hard billing cap. Do not request this setup-scope approval again; actual account access, billing selection and scoped activation evidence are still required. This approval does not enable paid AI or production changes.

## What the current access can do

The assessment started from main `28fe3311036f8ef9f3bfc623c522432499c08113`. Authenticated GitHub source and PR access work. The repository-environments read returned the existing generation, sandbox, Pages, image-publication and production-release environments; no nonproduction environment was observed. Reading repository Actions variables returned HTTP 403, `Resource not accessible by integration`. That result does not prove that any particular variable is absent.

The current managed environment reports no outbound identities, secrets or runtime variables. `gcloud` is not installed. Installing a CLI would not create an authorized Google identity. No live project/IAM inventory or nonproduction provisioning is claimed. The existing restricted production WIF identities are not a bootstrap identity and must not be broadened to make this task easier.

The owner subsequently authorized adding the five Console/browser hosts to this task's restricted network allowlist. The updated policy was observed enforced, and Console reached the Google sign-in page. User-controlled account sign-in remains pending; the network change establishes no Google identity or resource permissions.

These are genuine additional-access/setup blockers. They do not prevent source preparation, contract tests, reviewed PR creation or architecture review. Do not ask the owner to paste credentials, tokens, private signing keys or Cloud Shell output into chat.

## Consolidated owner decisions

Before activation, present the exact reviewed infrastructure/configuration diff and these decisions together:

| Decision | Recommended scope | Why it is needed |
| --- | --- | --- |
| Nonproduction project and billing | One dedicated project, recorded project ID and numeric project number; regional resources in `us-east5` unless the reviewed provider/device constraints require another region | Keeps runtime, data, secrets, spending and deployment authority separate from production |
| Infrastructure spending | Approve a stated monthly planning allowance and alert threshold based on [the cost model](COSTS.md); no paid AI initially | Static services and retained artifacts still have metered charges even when minimum instances are zero |
| Browser audience | Exact allowed owner/tester Google principals through IAP, plus a separate UAT principal | Private interactive access on desktop, tablet and phone without exposing application secrets |
| Keyless automation | A dedicated nonproduction controller, separate UAT and zero-role runtime identities, and restricted GitHub WIF | Production grants cannot safely authorize arbitrary preview services |
| Live AI, later | Exact providers/models, maximum per-operation and aggregate allowance, expiry, adult test audience and isolated private worker scope | Fixture success cannot authorize paid requests; production model credentials and budget must not be reused |

The supplied assignment authorizes implementation, not arbitrary new billing or broader production grants. Approval of this concrete setup may cover all subsequent routine operations within its recorded limits. Do not introduce an approval prompt for each preview update.

## One-time graphical setup

Use Google Cloud Console and GitHub Settings for missing bootstrap actions. The exact resource plan lives in [the infrastructure proposal](../../infra/nonproduction/README.md); inspect it before approving it. The initial project/admin actor is separate from the ongoing automation identities and should not leave a persistent broad credential in GitHub.

1. In **Google Cloud Console → project selector**, create or select the dedicated nonproduction project and attach the approved billing account. Record only its non-secret ID/number, region and approved spending scope. Enable only the APIs in the reviewed plan. Do not grant access to `family-game-factory-jzw`.
2. In **IAM & Admin**, use the reviewed plan to create the narrowly scoped service identities and workload identity pool/provider. Bind the immutable GitHub repository/owner IDs, exact trusted workflow path, protected `main`, expected event and named environment. Do not permit `pull_request`, arbitrary branches, forks or a repository-wide subject wildcard to obtain deployment authority. After setup, remove temporary broad bootstrap grants unless independently required for an existing administrator.
3. In **Cloud Run/IAP**, initialize the Google OAuth/IAP configuration when required by the actual project, and grant only the intended browser/UAT principals. Google's direct Cloud Run IAP documentation identifies projects outside an organization where initial OAuth client setup must be completed in Console; OAuth clients cannot simply be provisioned by an arbitrary CLI script. This is a one-time Console action, not a Cloud Shell dependency. Verify denied anonymous access and allowed owner access before advertising any preview.
4. In **GitHub → repository Settings → Environments**, create `jems-nonproduction` and `jems-nonproduction-uat`, each restricted to protected `main`; record the non-secret provider/service-account identifiers in the reviewed `ops/environments.json` configuration. Use an authenticated integration with the needed settings capability or the graphical UI; the current integration's variables permission is insufficient. Keep deployment disabled until the identity and access tests pass. Production environment variables, approvals and WIF policies remain unchanged.

Do not turn these steps into routine owner administration. After this setup, trusted Actions workflows build, deploy, report, expire and clean up previews. Additional backend/provider work is activated only after its separate reviewed grants and allowance are concrete.

## Permission boundary to review

| Identity | Minimum ongoing authority | Explicit exclusions |
| --- | --- | --- |
| PR build | Read repository; write its own bounded GitHub artifact | No OIDC/cloud credential, deployment write, environment secret or production access |
| Nonproduction controller | Publish to the dedicated registry; create/update/read static services, manage their IAP/invocation policies and act as the exact zero-role runtime identity; list/delete managed ephemeral previews | No project IAM mutation, role/key creation, production access, application data/secret access or provider credential. Cleanup code excludes TEST and unrecognized resources |
| Static runtime | Run the trusted static server; no project roles | Datastore, storage write, secret access, provider credentials or production service invocation |
| UAT | Access the approved IAP site and upload bounded synthetic evidence through the trusted workflow | Production application access, deployment, private transcripts, unrestricted paid calls |
| TEST runtime/worker, later | Separate reviewed per-service grants for its own data, secret references, callback identities and sandbox execution | Production data/identity/keys, unrestricted generation or impersonation |

The initial static lane combines publication, deployment and cleanup in one restricted controller account; their trusted jobs remain separate from PR execution. UAT and runtime have separate identities. This reduces setup complexity but means controller compromise can affect all resources within its nonproduction grants. Splitting publication/cleanup accounts remains an option if that boundary becomes necessary. Some GCP create/list operations necessarily use a project-level permission. The dedicated project bounds that reach; do not describe a naming convention or application label check as an IAM condition that GCP does not enforce. Cleanup additionally verifies the exact managed labels and service identity. Record the actual role permissions and resource bindings from the final plan, then test both allowed and denied operations using nonmutating permission checks where available.

Cloud Run IAP's service agent needs invocation access to the protected service. Allowed users and the UAT principal need `roles/iap.httpsResourceAccessor` at the narrow supported resource. No `allUsers` or `allAuthenticatedUsers` application invocation grant is acceptable. Direct IAP and service account configuration must be verified on the actual deployed resource, not inferred from successful provisioning.

## Activation sequence and receipts

1. Validate the completed target configuration; it must reject production project identifiers, mismatched service accounts, missing numeric project identity, mutable images, unreasonable retention/concurrency and incomplete IAP setup.
2. Observe the exact GitHub OIDC claims and establish nonproduction impersonation from the trusted workflow. Demonstrate denial from an untrusted PR/fork and absence of production permissions. Save sanitized receipts, never tokens.
3. Build a data-only preview bundle in an unprivileged job. The trusted controller revalidates repository, run/workflow, current open PR head, required checks and artifact contents before packaging or deployment.
4. Deploy two independent PR websites. Verify IAP in actual owner browsers, environment/source markers, interaction, independent browser storage and source updates. Use the same trusted lane to remove one closed preview and expire another; prove that TEST and production remain untouched.
5. Establish the permanent TEST frontend and reconcile the isolated backend/private-worker work. Observe full product journeys and safe synthetic reset before describing TEST as complete.
6. Bind complete deployed UAT, real-provider allowance/receipts and owner acceptance to a sealed manifest. Integrate the gate with the existing production controller after the active cutover. Demonstrate promotion and compatible recovery with actual receipts.

A green source workflow may mark the source foundation ready for review. It cannot mark the environment ready for owner use, complete TEST acceptance or production promotion. Keep missing setup and evidence visible in the environment directory and delivery state.

## Troubleshooting without Cloud Shell

Use workflow summaries and structured deployment receipts first. The controller should report categories such as missing configuration, denied federation, stale PR, artifact rejection, IAP denial, deployment reconciliation failure or expiry cleanup failure without printing raw credentials or arbitrary service environment values. Retry safe reads; do not automatically replay uncertain paid POSTs or a cloud mutation with unknown outcome. Re-read the resource identity before a guarded retry.

Existing production `observe` mode can obtain bounded service/revision metadata through its already authorized identity. It does not grant nonproduction setup, request-log access, provider acceptance or private configuration access. Escalate a new permission only after identifying the exact denied operation, resource and smallest viable grant.

## Provider references

- [Direct Cloud Run IAP](https://docs.cloud.google.com/run/docs/securing/identity-aware-proxy-cloud-run)
- [GitHub Actions workload identity federation](https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines)
- [Cloud Run IAM roles](https://docs.cloud.google.com/run/docs/reference/iam/roles)
- [GitHub deployment environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)
