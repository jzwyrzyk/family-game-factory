# Direct Jems diagnostic access

**Status:** connection tooling and operating method; an account connection and live verification are still required. A passing local test or a merged PR does not activate Google Cloud access.

## Outcome and operating scope

The owner should not relay routine commands and terminal output between ChatGPT and Cloud Shell. Within an authorized Jems task, the assistant owns investigation, permitted fixes, tests, merge/release follow-through and verification. For a larger fix within that scope, explain the intended change and material effect briefly, then continue. An ordinary error is a reason to investigate, not an automatic handoff.

Engage the owner for initial authentication, a new privilege or trust boundary, increased spending, destructive production-data work, a change in sensitive-data exposure, or a product/strategic choice. An escalation should include the diagnosis, options, recommendation and specific decision needed. Existing authorization remains valid; do not ask again for each implementation step.

This first implementation enables **Cloud Run metadata diagnostics**. It does not implement log retrieval, private configuration reads, paid provider checks, workflow dispatch, production promotion or rollback. Those capabilities require their own verified connection and controls. The existing release-automation work in [PR45](https://github.com/jzwyrzyk/family-game-factory/pull/45) and [issue46](https://github.com/jzwyrzyk/family-game-factory/issues/46) remains the follow-on integration point; do not merge or deploy that older branch blindly.

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

The first command must complete an actual gateway metadata read. The second must inspect all three services and their latest/serving revisions. Also use Google's nonmutating `testIamPermissions` endpoint to verify that the diagnostic identity lacks update/delete/IAM-write permissions on the selected resources. Do not test a boundary by attempting a real deletion or configuration change. The provided CLI does not perform this negative-permission audit itself.

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

`diagnose.py` accepts `--self-check`, `--identity-alias` and `--json`. It fixes the project, region and three service names; it does not accept arbitrary shell text or cloud resources. It requires a managed version-1 outbound identity manifest and fails when the requested identity cannot be selected. It does not manufacture a new credential or fall back to a manual owner login when the managed connection is absent.

Service/revision metadata is read in memory. Only an allowlist is reported: readiness, generation reconciliation status, latest and serving revision names, traffic percentages, image digests, known approval flags as booleans/unknown, and counts/presence of secret references. Raw metadata, credential bindings, secret values, arbitrary environment values and raw command errors are not printed. Secret Manager payloads, application/child data and log entries are not fetched.

| Exit | Meaning |
| --- | --- |
| `0` | The requested metadata checks passed; this does not establish application or paid-provider readiness |
| `1` | Reported service/revision metadata is unhealthy, unknown or unreconciled |
| `2` | CLI/identity selection, authentication, authorization, networking or metadata validation failed |

An absent CLI, missing connection, denied service permission and unhealthy deployment are different failures. Report the specific category instead of requesting a broader credential by default.

## Remaining work after connection

1. Inspect actual logging configuration and add a reviewed log-access path. A view name or a merely nonempty filter does not prove narrow access, and a log view does not redact payloads.
2. Integrate the existing release-controller work with a separate deployment identity and a callable, restricted trigger. This diagnostic identity cannot deploy.
3. Enforce required branch checks and protect privileged release changes through the appropriate administrator path.
4. Verify permitted diagnostic operations and denied write permissions from the new environment, then prove the controlled release path separately.

The end-state acceptance criterion is an ordinary investigation and permitted repair completed without owner-relayed terminal output. This initial metadata connection is one prerequisite, not a claim that the entire goal is already live.

## References

- [OpenAI cloud environment setup, network access and OIDC](https://learn.chatgpt.com/docs/environments/cloud-environments)
- [Google Workload Identity Federation for OIDC](https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-other-providers)
- [Cloud Run roles and permissions](https://docs.cloud.google.com/run/docs/reference/iam/roles)
- [Nonmutating Cloud Run permission test](https://docs.cloud.google.com/run/docs/reference/rest/v2/projects.locations.services/testIamPermissions)
- [Accepted operating decision](../decisions/2026-11-20-direct-operations.md)
