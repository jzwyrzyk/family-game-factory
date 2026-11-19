# 0004 — Separate generation, play execution and private coaching

**Status:** Accepted, retrospectively documented
**Recorded:** November 18, 2026 (America/New_York)
**Decision source:** Original generation-isolation contracts and the explicit owner-approved private-coach decision in [PR36](https://github.com/jzwyrzyk/family-game-factory/pull/36). This record consolidates their scopes; it is not a new deployment approval.

## Context

Generated game code must be treated as untrusted. The service admitting a family's request, the environment holding a generation credential, the environment compiling/playing generated code, and the child's preview have different trust requirements. Earlier generation-only runbooks prohibited model keys in Cloud Run. Later coaching work needed a separately secured inference service without weakening the original generation boundary.

## Decision

- The browser, gateway and game-preview service remain free of model secrets.
- The existing generation model credential stays in the private Actions generation environment. Compilation, generated-code playtesting and repair evaluation run through the separate approved isolation path without that credential.
- Conversational inference uses a dedicated private coach service and a new coach-only credential under its reviewed identity, network, audience, privacy and budget controls. This is the narrow approved exception to the older blanket Cloud Run prohibition. It does not allow the generation key in Cloud Run or a key in the gateway.
- Speech transcription uses the reviewed private-service route and separate permission/accounting scope. Speech creates an editable draft; conversation and Build remain separate actions as described in [ADR0003](0003-explicit-voice-and-build.md).
- Worker source/tag, sandbox image, trusted runtime and service revisions remain independently identified. Updating public main or publishing Pages does not update the private worker's selected source.

## Consequences and limits

This preserves credential and execution separation while allowing conversation to evolve independently. It also creates explicit integration and operational work: compatible protocols, exact identities, independently verified pins, rollout/rollback evidence and actual network/device checks. A valid IAM grant alone does not establish the private network route; a source default does not inventory a live setting.

Later user authorization can change a release's audience or permitted operational steps. Record that scope in [delivery state](../../DELIVERY-STATE.md) without fabricating consent/provider approval or rewriting this architecture as an automatic activation. Reconcile overlapping safety or alternate-provider branches against this chosen boundary rather than replacing it with older files.

## Evidence and related documents

- [Current architecture](../../ARCHITECTURE-CURRENT.md): executable paths, storage, routes and release identities.
- [Private worker bridge](../assignment-004/private-worker-bridge.md): original generation/execution separation.
- [Historical owner pilot](../assignment-005/OWNER-PILOT.md): earlier generation-only constraint and evidence.
- [Dedicated private coach plan](../issue-28/CLOUD_RUN_OWNER_PLAN.md) and [security/release contract](../issue-28/SECURE_INFERENCE_AND_RELEASE.md): scoped coach exception.
- [Delivery state](../../DELIVERY-STATE.md): actual dated integration and operational evidence.
