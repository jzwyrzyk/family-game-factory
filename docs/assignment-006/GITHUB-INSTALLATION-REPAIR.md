# Correct the production gateway's GitHub App installation

## Observed problem

The owner-run diagnostic on November 21, 2026 authenticated the gateway's existing GitHub App key (HTTP 200) and resolved the private worker repository installation as `182382304` (HTTP 200). The installation had Actions write and Contents read access and was not suspended. The mounted production config referenced a different installation; token issuance for that configured installation returned HTTP 404. The submitted game remained before worker dispatch.

This is configuration evidence, not a successful generation receipt. The reviewed public application remains `b472c224f7e8ef8ab0986ce6f755728d7cc63d46`; private worker main/tag remain `52729ad231179d633b2f15fa910aa2b23273a2d6`. The fix does not edit either application or worker source.

## Targeted repair

`scripts/deployment/repair_github_installation.mjs` reads the actual 100% serving revision and its consumed numeric config/key secret versions. It copies the complete live private config and changes only `githubInstallationId` to the repository-verified installation. Before cloud writes, it verifies the installation, repository-scoped token issuance, active worker workflow and exact token-visible main/tag pins.

Default execution performs these checks and prints a plan. The authorized owner command includes `--apply`. It creates a new version of the existing config secret from stdin, verifies its contents privately, and stages a config-only Cloud Run update with `--update-secrets` and `--no-traffic`. The previous revision continues serving until readiness, config binding, runtime spec, other secret mounts, operational annotations and image digest match expectations. It promotes the exact checked revision and requires `/health` to return `ready: true` and `paidExecution: true`. A failed post-promotion verification attempts a traffic-only rollback to the saved previous revision, and reports if a concurrent traffic change prevents automatic rollback.

The helper prints fixed statuses and revision/version identifiers. It does not log configs, keys, JWTs or access tokens. It submits no game, changes no job or ledger, and preserves all model prices, caps, session keys, adult-only flags, images and worker trust. Old revisions and secret versions remain available for rollback.

## Acceptance and limits

Local mocked tests establish repair control flow and refusal of unplanned changes; they do not establish a live rollout. `CORRECTED_APP_CONNECTION=VERIFIED` establishes the narrow token/read preflight. `REPAIR_STATUS=SUCCESS` additionally establishes the config rollout and gateway health. Actual dispatch and generation still require a real authorized game job.

Keep the user's current adult tab/session open during the repair. An expired queued job is not resurrected, and a new adult unlock can revoke the original session grant. Inspect the existing job and worker history after repair before asking for a fresh Build. Do not reset budget reservations or timestamps. The old Cloud Shell `active.json` is stale after this repair; future operations must resolve the currently mounted live config.

The deployment receipt and issue #93 remain open pending actual repair output and the adult Build → Test → Review → Play → Edit → Keep → Reload acceptance. This note must not be treated as proof that the helper was run.
