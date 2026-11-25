# Automated DEV → TEST → PROD development and release

**Status:** Accepted operating direction; source foundation and live acceptance are separate.
**Recorded:** November 23, 2026 (America/New_York).
**Decision source:** Owner-supplied assignment “Jems — Automated DEV / TEST / PROD Architecture,” sections 1–15, explicitly authorizing assessment and implementation while preserving the active production cutover.

## Context

Parallel development needs interactive per-PR websites and a permanent integrated acceptance environment. The owner should make product decisions without operating infrastructure. Existing main already has restricted GitHub-to-GCP image publication and controlled stage/canary/promotion, while PR106 proposes a separate development workbench and PR45 an older release foundation. Existing browser regression tests predominantly run local fixtures; they do not establish deployed TEST acceptance.

## Decision

Adopt [the DEV → TEST → PROD contract](../development/DEV-TEST-PROD.md) as the authoritative method. Keep `main` as the integration baseline and preserve the merged production release-intent controller. Use independent authenticated per-PR frontend origins and one permanent private TEST installation in a separate nonproduction GCP project. Frontend-only work uses shared infrastructure and no independent backend. Ordinary PR builds have no deployment credentials; a trusted protected-main controller validates bounded artifacts and publishes through a restricted nonproduction identity.

Prefer direct Cloud Run IAP and scale-to-zero services over a load balancer or a separate administration platform. Separate project IAM is preferable to collection-prefix isolation because current Firestore server access is project scoped. Bind owner production approval to the exact tested source, frontend artifact, backend images, worker/runtime identities and configuration. Keep fixture, live-provider, visual, device and observed product-quality evidence distinct.

No routine operation may require Cloud Shell. Any genuinely unavoidable privileged bootstrap should be a small reviewed Console/GitHub action set with purpose, scope and security implications; it must leave routine execution automated. New grants and material spending still require their specific approval. This does not introduce repeat approval for routine authorized implementation decisions.

## Supersession and continuity

The owner's assignment explicitly supersedes earlier unimplemented standalone DEV, frontend-preview, staging and preproduction proposals. PR101/PR106 remain useful design and source history; reuse their validated isolation, packaging and bounded-provider work after reconciliation with current main. Their old shared-DEV topology and owner-run setup are no longer the overall method. PR45's competing production-controller direction is superseded by integration with the merged controller. Historical repair/cutover evidence remains intact.

This decision does not close or merge those PRs, activate infrastructure or amend the current production cutover's acceptance requirements. At assessment baseline `28fe3311036f8ef9f3bfc623c522432499c08113`, PR152 is separate Gateway promotion work and must retain its hold for candidate request acceptance.

## Consequences and limits

A dedicated project requires one-time billing/IAM/IAP setup but provides a clear production data and identity boundary. Individual frontend services preserve browser storage isolation while scaling to zero. Complete TEST still needs its own backend, worker, synthetic-data and authorized provider integration; a static preview is not sufficient. Per-PR live backends are avoided until a concrete development need justifies their cost and isolation requirements.

The source foundation must remain disabled until setup is approved and verified. Completion requires two live concurrent previews, automatic updates/cleanup, complete deployed TEST acceptance, exact production promotion and recovery, owner directory access and zero routine Cloud Shell operations. See [delivery state](../../DELIVERY-STATE.md), [setup](../development/SETUP.md) and [cost assumptions](../development/COSTS.md). Reconsider topology if measured cost, authentication/device compatibility or concurrent isolation cannot satisfy this contract.
