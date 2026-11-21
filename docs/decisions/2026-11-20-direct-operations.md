# Direct diagnostics and fewer operational handoffs

**Status:** Accepted operating intent; initial connection tooling prepared, cloud access and automated release operation unverified.
**Recorded:** November 20, 2026, America/New_York.
**Decision source:** Owner's access-efficiency discussion: routine development/merges/deployments should be less constrained while preserving protection from external compromise and large accidents; the owner should not copy commands/results between ChatGPT and Cloud Shell. For a bigger fix within scope, give a brief heads-up and continue. Owner involvement remains appropriate for initial credentials, major consequential decisions and strategy.

## Context

The connected GitHub tools can operate source/PRs and inspect workflow evidence, but the current chat has no configured Google Cloud outbound identity. The shell has no `gcloud` CLI and its `gh` command is unauthenticated. Existing Cloud Shell authentication does not automatically transfer. This is a connection/capability gap, not something a repeated conversational approval fixes.

## Decision

Prepare a reusable Jems cloud environment and a dedicated, short-lived Google Cloud identity. Start with bounded Cloud Run metadata reads and a safe diagnostic command. Create the new trust through one reviewed, additive bootstrap using the owner's existing authenticated setup environment. Select the exact issuer/audience/subject displayed by the new environment; do not guess or reuse unrelated worker trust.

Within an authorized task, the assistant investigates errors, prepares permitted corrections, verifies results and completes routine implementation steps. Explain larger in-scope changes briefly and continue. Escalate for expanded authority/trust, increased spending, destructive production-data actions, expanded sensitive-data exposure or a product/strategic decision. Preserve prior explicit authorization and current safety boundaries.

Broader release automation follows through the existing [PR45](https://github.com/jzwyrzyk/family-game-factory/pull/45)/[issue46](https://github.com/jzwyrzyk/family-game-factory/issues/46) work after reconciliation with current main. No ordinary application change should silently gain authority to redefine the privileged release verifier.

## Consequences and limits

- Setup still needs the actual non-secret connection identifiers and an initial administrator-authorized run. No permanent cloud key is requested or created.
- A PR or successful fixture test does not establish a live connection. Publish the configured environment and verify from a new task.
- Initial tooling reads service/revision metadata only. Scoped logs, workflow dispatch, promotion and compatible rollback remain separate work.
- Runtime credentials, child content, paid-execution authorization, existing worker trust and production traffic are outside this bootstrap's mutations.
- A narrow grant reduces accident scope; it does not prove that unrelated inherited access is absent. A live nonmutating permission check must qualify the actual boundary.

## Evidence and related documents

- [Setup and operating runbook](../operations/ASSISTANT_ACCESS.md)
- [Agent entry point](../../AGENTS.md)
- [Delivery evidence](../../DELIVERY-STATE.md)
