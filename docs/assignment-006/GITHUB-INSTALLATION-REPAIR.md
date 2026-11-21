# Correct the production gateway's GitHub App installation

## Observed problem

The owner-run diagnostic on November 21, 2026 authenticated the gateway's existing GitHub App key (HTTP 200) and resolved the private worker repository installation as `182382304` (HTTP 200). The installation had Actions write and Contents read access and was not suspended. The mounted production config referenced a different installation; token issuance for that configured installation returned HTTP 404. The submitted game remained before worker dispatch.

This is configuration evidence, not a successful generation receipt. The reviewed public application remains `b472c224f7e8ef8ab0986ce6f755728d7cc63d46`; private worker main/tag remain `52729ad231179d633b2f15fa910aa2b23273a2d6`. The fix does not edit either application or worker source.

### Initial repair preflight correction

The first repair at `e116a2673bf5f42eaeee57aa6826cf89a3115b29` stopped with `SERVICE_TEMPLATE_DRIFT` before cloud writes. The owner's subsequent read-only comparison established that `factory-gateway-00011-vdf` was Ready and the service generation was fully reconciled. The only normalized specification difference was `containers[0].name`: absent from the service template, present on the serving revision. The helper now accepts only this omitted-name versus valid DNS-label representation for the single-container template-to-revision comparison. Explicit template names, all other settings, and subsequent old/new revision names remain strictly compared. Tests reproduce this observed API shape and reject explicit renames and unrelated setting changes. This correction is not evidence of a completed repair.

### Existing staged revision continuation

The owner ran corrected helper `322f773c385ba0595e18cdf709c0dc2d15a61eb6`. Its real corrected-installation connection preflight passed. It read serving revision `factory-gateway-00011-vdf` with config version `6`, created and privately verified corrected config version `7`, and submitted the configuration-only staging update. The subsequent service-level stage check returned `STAGING_NOT_READY`; the helper did not execute a promotion. Its console status alone does not independently establish the final revision or traffic state.

The separate `finish_github_installation.mjs` continuation targets this exact staged repair and reuses config version `7`. It first identifies and verifies the actual existing candidate and complete equality with old config version `6` except the verified installation ID. It checks the exact revision rather than treating the service's latest-ready name as the sole zero-traffic health signal. A unique temporary tag provides an actual `/health` request to that candidate while the existing traffic percentage remains unchanged. Only a verified candidate can receive production traffic. The continuation removes only its own temporary tag; failure to remove a tag after confirmed successful production health is reported separately from rollback.

Google documents direct tag URLs and tag updates that retain traffic percentages in the [Cloud Run traffic command](https://docs.cloud.google.com/sdk/gcloud/reference/run/services/update-traffic). See also [revision readiness conditions](https://docs.cloud.google.com/run/docs/reference/rest/v1/namespaces.revisions) and [service reconciliation fields](https://docs.cloud.google.com/run/docs/reference/rest/v2/projects.locations.services). These docs explain the continuation's checks; the owner-observed outcome is recorded separately below.

### Owner-observed repair completion — November 21, 2026

The owner supplied a successful continuation receipt for existing candidate **`factory-gateway-appfix-mwpzazq8-3406`**, consuming corrected config version **`7`**. The continuation verified the candidate against prior revision `factory-gateway-00011-vdf` and config version `6`, including the complete configuration comparison allowing only `githubInstallationId: "182382304"` to change and the preserved runtime/image checks.

The receipt reported:

- Candidate health through its temporary zero-traffic tag: `READY_ADULT_ENABLED`.
- Promotion of the exact verified candidate to production and canonical gateway health: `READY_ADULT_ENABLED`.
- Correct GitHub App installation: `182382304`.
- Temporary tag cleanup: `VERIFIED`.
- Final result: `REPAIR_STATUS=SUCCESS`.

This establishes the configuration repair, actual candidate and production gateway health, and temporary-tag cleanup. The corrected App's token, workflow and main/tag read preflight had already passed in the preceding staging attempt. The continuation reused the existing staged revision and config version; it did not rebuild application images, rotate worker trust or create another game request.

The original queued adult request was separately observed terminal **`failed`**, with **`WORKER_QUEUE_EXPIRED`** and **`runId: null`**. A fresh private-worker history check found no game-generation workflow run at the time of this receipt. The expired request was not reset or resurrected. **Actual game generation and the adult end-to-end acceptance remain pending.**

### Subsequent real build — separate runner permission failure

Fresh adult build [44872847752](https://github.com/family-game-factory-lab/family-game-factory-worker/actions/runs/44872847752) confirms that the repaired gateway dispatched successfully and that generation completed. The hosted prepare and cleanup jobs then failed while requesting the separate runner App's token (HTTP 422); provisioning, isolated tests and quality review did not run. This does not invalidate the completed gateway installation repair.

The owner's runner App metadata showed installation `182384961` had organization Self-hosted runners read and no Contents permission. [Private PR17](https://github.com/family-game-factory-lab/family-game-factory-worker/pull/17) corrected the explicit token scopes and merged as `ca2989988fd1cd66d9a858cbf167dd4a995640fc` after both hosted checks passed. The [runner permission release](RUNNER-PERMISSION-RELEASE.md) records the installation update and coordinated private-pin rotation; its production receipt and a successful complete game remain pending.

## Targeted repair

`scripts/deployment/repair_github_installation.mjs` reads the actual 100% serving revision and its consumed numeric config/key secret versions. It copies the complete live private config and changes only `githubInstallationId` to the repository-verified installation. Before cloud writes, it verifies the installation, repository-scoped token issuance, active worker workflow and exact token-visible main/tag pins.

Default execution performs these checks and prints a plan. The authorized owner command includes `--apply`. It creates a new version of the existing config secret from stdin, verifies its contents privately, and stages a config-only Cloud Run update with `--update-secrets` and `--no-traffic`. The previous revision continues serving until readiness, config binding, runtime spec, other secret mounts, operational annotations and image digest match expectations. It promotes the exact checked revision and requires `/health` to return `ready: true` and `paidExecution: true`. A failed post-promotion verification attempts a traffic-only rollback to the saved previous revision, and reports if a concurrent traffic change prevents automatic rollback.

The helper prints fixed statuses and revision/version identifiers. It does not log configs, keys, JWTs or access tokens. It submits no game, changes no job or ledger, and preserves all model prices, caps, session keys, adult-only flags, images and worker trust. Old revisions and secret versions remain available for rollback.

## Acceptance and limits

Local mocked tests establish repair control flow and refusal of unplanned changes; they do not establish a live rollout. `CORRECTED_APP_CONNECTION=VERIFIED` establishes the narrow token/read preflight. `REPAIR_STATUS=SUCCESS` additionally establishes the config rollout and gateway health. Actual dispatch and generation still require a real authorized game job.

The completed rollout preserved the session keys and durable job state. The observed expired request remains terminal; polling it cannot restart generation. The next generation acceptance requires a fresh explicit Build under valid adult authorization, after the recorded no-run check. Do not reset budget reservations or timestamps. A new adult unlock can revoke an earlier session grant and must not be used to reauthorize an in-flight job. The old Cloud Shell `active.json` is stale after this repair; future operations must resolve the currently mounted live config.

The gateway configuration repair is complete according to the owner receipt above. The broader deployment acceptance and issue #93 remain open pending a real adult Build → Test → Review → Play → Edit → Keep → Reload journey and the required subsequent frontend-release continuity check. Gateway health and a successful configuration rollout do not establish those user-visible outcomes.
