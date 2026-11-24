# Direct Jems diagnostic access

## November 23: existing GitHub release route for metadata

**Verified live:** [PR151](https://github.com/jzwyrzyk/family-game-factory/pull/151) merged as `5e257a771c69e48ac919d947a4339535af4a934f` after all 21 exact-head checks passed. [Observation run45311130260](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45311130260) succeeded at `2026-11-24T02:16:49.898767Z`, with the effective release identity verified, all mutation jobs skipped, Coach100/Gateway0 verified and current Preview inputs read. [Run45311550910](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45311550910) independently verified the subsequent Gateway95/5 canary and successful lifecycle conditions. This supersedes the preparation-only status below. Cloud Shell is no longer required for these service metadata reads; the identity's existing log-access restriction remains.

The owner confirmed exhaustion of Cloud Shell's 50-hour weekly terminal quota after successful Coach promotion. This does not stop deployed Cloud Run services. The enabled production release identity already has service/revision GET access on the three reviewed services. A new mutually exclusive `observe` input on [the existing release workflow](../../.github/workflows/jems-cloud-run-release.yml) provides those reads through the same protected-main workflow, environment, federation provider and service account. It adds no IAM, trust, spending or runtime scope. See [delivery state](../../DELIVERY-STATE.md) for actual execution evidence; source preparation alone does not establish a working connection.

Dispatch the workflow on main with `observe=true`, `verify_identity=false`, and `verify_access=false`. The identity/access-proof jobs and transition plan explicitly exclude observation, and transition still depends on plan. The observer verifies hosted-runner claims, current main and checked-out workflow identity, plus the effective Google account using the same short-lived access token. It checks service reconciliation, explicit desired/effective traffic, bounded latest/serving revisions, image digests, runtime accounts and in-memory configuration fingerprints; the current release intent must match the observed transition. A second service read and main check reject concurrent change.

Only sanitized metadata is emitted. The GET-only client is limited to Google userinfo and the three exact Cloud Run service/revision namespaces; redirects, permission POSTs and other endpoints are rejected. No logs, application requests, secret payloads, data inventory or paid provider tests are available through this mode. The release account still has its existing deployment privileges: read-only describes this reader's behavior, not a reduced IAM ceiling. No new credential or service-account key is installed in Codex. Gateway lifecycle/metadata inspection can continue through this route; request attribution, saved-game preservation and live acceptance remain separate evidence.

The older managed-environment setup below remains a separate diagnostic option. Its historical no-merge and inactive-release statements do not override the owner's subsequent production-cutover authorization. The original activation executor's approved workflow checksum remains unchanged; offline tests retain the exact old workflow fixture and verify that the later observation workflow cannot replay that historical activation scope.

**Status:** PR100 source reconciled with main `6cc9c3801ccb7ae53d8eb9f708ae851699ac3f2d` for review. Earlier operational discussion reported successful metadata reads in a configured environment; that is prior evidence, not a live check from this task. This task has neither `gcloud` nor a managed outbound identity manifest. A passing local test, merged PR or connection in another task does not activate access here. See [delivery state](../../DELIVERY-STATE.md) for the scoped observations.

## Outcome and operating scope

The owner should not relay routine commands and terminal output between ChatGPT and Cloud Shell. Within an authorized Jems task, the assistant owns investigation, permitted fixes, tests, merge/release follow-through and verification. For a larger fix within that scope, explain the intended change and material effect briefly, then continue. An ordinary error is a reason to investigate, not an automatic handoff.

Engage the owner for initial authentication, a new privilege or trust boundary, increased spending, destructive production-data work, a change in sensitive-data exposure, or a product/strategic choice. An escalation should include the diagnosis, options, recommendation and specific decision needed. Existing authorization remains valid; do not ask again for each implementation step.

A preparation or status-review request is not approval to merge, deploy or expand access. Preserve an explicit hold even after tests pass. The owner's November 21 continuation authorizes source preparation and leaves merging unapproved.

This first implementation enables **Cloud Run metadata diagnostics**. It does not implement log retrieval, private configuration reads, paid provider checks, workflow dispatch, production promotion or rollback. Main now contains the [read-only policy foundation](POLICY_FOUNDATION.md), including testable scoped-log and release-controller modules. The privileged workflow installation, identities, actual claim proofs, restricted Logging access and isolated live rollout drill remain in [PR107](https://github.com/jzwyrzyk/family-game-factory/pull/107). Keep these distinct from this metadata connection. [PR45](https://github.com/jzwyrzyk/family-game-factory/pull/45) and [issue46](https://github.com/jzwyrzyk/family-game-factory/issues/46) retain their separate Pages/continuity scope; do not replay an older release branch.

The assistant runs commands in its selected managed environment and uses the approved cloud APIs. It does not inherit or attach to the owner's existing Cloud Shell session. Cloud Shell remains the initial administrator setup route when the required account authority is unavailable in the assistant's environment.

## One-time connection setup

### 1. Prepare a reusable cloud environment

In ChatGPT, open **Settings → Codex Cloud → Environments → Create environment** (or **Work in → Cloud → Select environment → Create environment**). Include:

- `jzwyrzyk/family-game-factory`
- `family-game-factory-lab/family-game-factory-worker`

Ask the setup task to install the repository's Node 22 toolchain, Python 3 and the Google Cloud CLI, and verify the normal project commands. Use a private Jems environment. Reuse the connected GitHub repository access; no new broad GitHub token is required for source/PR work. Workflow dispatch is a separate capability and is not enabled by this bootstrap.

Configure required network destinations separately from credentials. For these diagnostic reads, review the managed Google authentication routes and `sts.googleapis.com`, `iamcredentials.googleapis.com`, `run.googleapis.com` and `us-east5-run.googleapis.com`. Allow the actual installer/package/source hosts used during setup, including the GitHub/API hosts when needed. Add other hosts only when the actual client identifies a required route. Do not replace existing proxy or certificate settings.

### 2. Obtain the environment's actual OIDC identity

In the saved environment, open **Advanced → OIDC → Add / Create connection**, select Google Cloud, and follow the provider-specific setup. Copy the **Issuer**, **Audience** and **Subject** displayed for this specific connection. These are non-secret identity identifiers. Keep tokens, API keys, private keys and credential files out of chat and the public repository.

Use the following planned Google identity details when the connection setup requests them:

| Field | Value |
| --- | --- |
| Project | `family-game-factory-jzw` |
| Project number | `1054529152893` |
| Diagnostic service account | `jems-codex-diagnostics@family-game-factory-jzw.iam.gserviceaccount.com` |
| Workload identity pool | `jems-codex-diagnostics` |
| Provider | `codex-environment` |
| Full provider resource | `projects/1054529152893/locations/global/workloadIdentityPools/jems-codex-diagnostics/providers/codex-environment` |

Do not substitute an issuer, audience or subject copied from a different environment or from the existing GitHub worker connection. The issuer's claim format must match the script's exact supported values; unsupported claims stop setup rather than broadening trust.

### 3. Run the reviewed bootstrap once in the owner's authenticated Cloud Shell

Use an exact reviewed Git commit of this repository. Fetch it directly in Cloud Shell; no file upload from the owner's computer is needed. The bootstrap uses the existing administrator authentication only for this initial setup. It creates a separate diagnostic identity; the assistant environment never receives the administrator credential.

From that pinned checkout, enter the three **non-secret** values privately in Cloud Shell:

```bash
read -r -p 'Codex OIDC issuer: ' JEMS_OIDC_ISSUER
read -r -p 'Codex OIDC audience: ' JEMS_OIDC_AUDIENCE
read -r -p 'Codex OIDC subject: ' JEMS_OIDC_SUBJECT

python3 scripts/ops/bootstrap_diagnostics.py \
  --issuer "$JEMS_OIDC_ISSUER" \
  --audience "$JEMS_OIDC_AUDIENCE" \
  --subject "$JEMS_OIDC_SUBJECT"
```

The default is an **offline plan** and makes no cloud call. Review the concrete resources and permission list. Add `--check` to perform read-only preflight. Add `--apply` for the one-time additive setup after that plan is accepted. Never interpret a setup error as permission to give the identity Owner, Editor or a broader viewer role.

The bootstrap verifies the live project number, existing APIs, the existence of the three named services and any pre-existing setup resources before writing. Conflicting names, changed trust, unexpected grants or user-managed keys stop it. It creates only missing reviewed resources/bindings and checks the resulting configuration. It does not replace the project's IAM policy, alter the GitHub worker trust, enable paid AI, change Cloud Run traffic, or create a service-account key. A partial/transient failure requires a fresh read-only check before deciding what remains.

### 4. Save, publish and verify in a new task

Complete the connection attachment and use a recognizable alias such as `jems-diagnostics`. Save and **Publish/Republish** the environment. Start a **new task in that environment**; existing chats do not automatically inherit it.

In the connected task, the assistant runs:

```bash
python3 scripts/ops/diagnose.py --self-check --identity-alias jems-diagnostics
python3 scripts/ops/diagnose.py --identity-alias jems-diagnostics
```

The first command must complete an actual gateway metadata read. The second must inspect all three services and their latest/serving revisions. Before accepting the connection, separately establish that the selected credential actually uses `jems-codex-diagnostics@family-game-factory-jzw.iam.gserviceaccount.com` from authenticated provider/connection evidence, and use Google's nonmutating `testIamPermissions` endpoint to verify that identity lacks update/delete/IAM-write permissions on the selected resources. An alias, optional manifest declaration or successful metadata read is not that identity proof. Do not test a boundary by attempting a real deletion or configuration change. The provided CLI does not perform the effective-account or negative-permission audit itself and always reports `identity_account_verification: "not_verified"` and `identity_privilege_ceiling: "not_verified"`.

Record exact observations and limitations in [delivery state](../../DELIVERY-STATE.md). Until those reads succeed, access remains **unverified**. The absence of broader inherited/group/resource permissions is not established solely by inspecting direct project bindings.

## Installed permission scope

The planned custom role is `projects/family-game-factory-jzw/roles/jemsCodexDiagnostics`, bound separately to `factory-gateway`, `factory-preview` and `factory-coach-private` in `us-east5`. Its permissions are:

- `run.services.get`
- `run.services.getIamPolicy`
- `run.revisions.get`
- `run.revisions.list`

The bootstrap grants the exact external subject impersonation of the dedicated diagnostic service account through `roles/iam.workloadIdentityUser`; it does not audit inherited administrator or impersonation rights. The new identity pool is dedicated to this provider. No Token Creator, project-wide Service Account User, secret-payload read, log-content read, service update/delete, IAM administration, resource creation or billing permission is granted to the diagnostic identity.

The bootstrap itself necessarily uses the owner's setup authority to create this role, identity and their bindings. That setup authority is distinct from the rights of the resulting diagnostic identity.

## Diagnostic output and limits

`diagnose.py` accepts `--self-check`, `--identity-alias` and `--json`. It fixes the project, region and three service names; it does not accept arbitrary shell text or cloud resources. It requires a managed version-1 outbound identity manifest with a uniquely selected GCP connection and the documented CLI selectors (`config_dir` and/or `configuration_name`, with `credentials_file` when supplied). It preserves managed authentication/proxy bindings and rejects ambiguous inherited account, token, impersonation or endpoint overrides. It does not manufacture a new credential or fall back to a manual owner login when the managed connection is absent.

The installed provider runtime networking guide (`cloud-environment` 0.2.1, `runtime/references/networking.md`, **Use a configured identity**) documents those selectors, `alias`, `provider_kind`, `is_default` and `setup`. It does not establish a required `service_account_email` manifest field. The earlier mandatory-field check therefore was not a compatible acceptance rule. If that optional declaration is present, the client rejects a value other than `jems-codex-diagnostics@family-game-factory-jzw.iam.gserviceaccount.com`; its absence is supported, and a matching declaration still is not proof of the effective account. Do not edit the managed manifest to make a synthetic schema assumption pass. Keep the separate live selected-account and denied-permission checks above.

Service/revision metadata is read in memory. Only an allowlist is reported: readiness, generation reconciliation status, latest and serving revision names, traffic percentages, image digests, known approval flags as booleans/unknown, and counts/presence of secret references. Raw metadata, credential bindings, secret values, arbitrary environment values and raw command errors are not printed. Secret Manager payloads, application/child data and log entries are not fetched.

| Exit | Meaning |
| --- | --- |
| `0` | The requested metadata checks passed; this does not establish application or paid-provider readiness |
| `1` | Reported service/revision metadata is unhealthy, unknown or unreconciled |
| `2` | CLI/identity selection, authentication, authorization, networking or metadata validation failed |

An absent CLI, missing connection, denied service permission and unhealthy deployment are different failures. Report the specific category instead of requesting a broader credential by default.

## Remaining work after connection

1. Complete source review of PR100 against current main. This preparation preserves the owner's no-merge instruction; it does not install or activate any connection.
2. Reuse the intended managed environment, publish any reviewed environment changes, and verify its actual selected Google account, permitted metadata reads and denied write permissions from a new task there. Earlier verification in another task remains scoped to that observation; the CLI's successful read is not effective-account acceptance.
3. Complete PR107's restricted Logging setup and isolated redaction proof. A view name or merely nonempty filter does not prove narrow access, and a log view alone does not redact payloads.
4. Complete the remaining PR107 account setup, protected-main claim proofs, isolated stage/canary/promote/rollback drill and separately approved release activation. Main's policy check and its six required-check protections already have separate recorded evidence; do not recreate them merely because this earlier PR was unmerged. The diagnostic identity cannot deploy, and the new publication/release enable flags remain unset until the controlled path is accepted.

The end-state acceptance criterion is an ordinary investigation and permitted repair completed without owner-relayed terminal output. This initial metadata connection is one prerequisite, not a claim that the entire goal is already live.

## References

- [OpenAI cloud environment setup, network access and OIDC](https://learn.chatgpt.com/docs/environments/cloud-environments)
- [Google Workload Identity Federation for OIDC](https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-other-providers)
- [Cloud Run roles and permissions](https://docs.cloud.google.com/run/docs/reference/iam/roles)
- [Nonmutating Cloud Run permission test](https://docs.cloud.google.com/run/docs/reference/rest/v2/projects.locations.services/testIamPermissions)
- [Accepted operating decision](../decisions/2026-11-20-direct-operations.md)
