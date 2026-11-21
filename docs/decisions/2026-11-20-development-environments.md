# Lightweight Jems development environments

**Status:** Accepted direction and implementation refinement; local/source validation is separate from unobserved cloud deployment and real-provider acceptance.
**Recorded:** November 20, 2026, America/New_York.
**Decision source:** The owner asked whether Jems should have DEV, agreed to lightweight PR previews followed by shared integration DEV, and instructed: "start laying this out." The earlier access-efficiency direction asks the assistant to own routine investigation and permitted execution instead of using the owner as a Cloud Shell relay.

**Subsequent authorization:** The owner asked for quick iteration and play, both child and adult AI in DEV with adults as the only testers, then said to proceed in full without interfering with current production smoke or deployments. That request authorizes implementation and ordinary bounded DEV operation; it does not supply missing cloud credentials or establish live acceptance.

## Context

Local development exists. The temporary Adult (development) profile is an authenticated capability in the existing product; production-image smoke is a test activity. Neither establishes a separate development deployment. The inspected baseline is `aeb3fdb953fd5812e9fec0b4b5f6b1288c45666c`.

The current worker requires its protected main and immutable tag to equal one approved SHA. The gateway and worker verifier bind one production worker identity. Another frontend connected to those services would not provide independently releasable DEV. Existing PR45/issue46 and parallel direct-access work must be reused with their actual limits.

## Decision

Provide distinct-origin application previews for eligible PR heads, then one isolated shared DEV for integrated AI journeys. Reserve shared DEV at a pinned candidate during release verification. Treat smoke as a release check; defer a third permanent staging stack until observed need justifies it. Preserve the existing Adult profile within the same application and existing production work.

The concrete first implementation uses fast disconnected local HMR and opt-in PR artifacts, one separate nonproduction GCP project, and an independently versioned private DEV worker repository. Shared DEV uses Cloud Run IAP for the site and generated preview, an exact verified adult allowlist, and a same-origin browser API proxy. Adults can test the child UI under distinct synthetic test grants and the adult workspace under its existing permit/unlock rules. No guardian or ZDR evidence is invented; production child access remains unchanged.

The initial private manifest uses a $5 aggregate AI admission ceiling, one active paid request, independent per-request caps and no automatic refill. Cloud costs are separate. Public Firebase preview publishing remains optional later work because its public URLs do not satisfy the authenticated shared-DEV requirement. The full artwork artifact is about 234 MB; hot reload avoids repeated uploads during ordinary editing.

Promote verified application assets and image digests with separately identified environment configuration. Validate each environment's worker identity, compatibility and existing authorization. Reconcile release automation with current source and preserve persistent production activation through routine upgrades.

## Consequences and limits

Feature review can happen before merge, while shared DEV exercises the real connected pipeline. Separate origins protect browser-state boundaries; separate cloud/worker authority limits accidental production changes. A shared release reservation can briefly queue DEV deployments, an accepted initial simplicity tradeoff in the proposed design.

The implementation adds hosting, lifecycle and identity work while preserving the ongoing production release. The source and local tests do not assert cloud account access, created resources, active providers or a live usable site. Initial account/OAuth/identity setup and actual browser/provider/cleanup evidence are concrete remaining dependencies. Routine authorized implementation continues without another approval request. Native cross-site preview login requires acceptance in the actual adult test browser before launch; restricted-cookie/mobile support is not implied.

## Evidence and related documents

- [Development environment plan](../development/ENVIRONMENTS.md)
- [Implemented DEV workbench and setup](../development/DEV-WORKBENCH.md)
- [Implemented architecture](../../ARCHITECTURE-CURRENT.md)
- [Release continuity](../assignment-006/RELEASE-CONTINUITY.md)
- [Temporary adult profile](0005-temporary-adult-profile.md)
- [Existing release foundation PR45](https://github.com/jzwyrzyk/family-game-factory/pull/45) and [full release issue46](https://github.com/jzwyrzyk/family-game-factory/issues/46)
- [Delivery evidence](../../DELIVERY-STATE.md)
