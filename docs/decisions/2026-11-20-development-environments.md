# Lightweight Jems development environments

**Status:** Accepted direction; proposed implementation details. No environment is deployed by this decision.
**Recorded:** November 20, 2026, America/New_York.
**Decision source:** The owner asked whether Jems should have DEV, agreed to lightweight PR previews followed by shared integration DEV, and instructed: "start laying this out." The earlier access-efficiency direction asks the assistant to own routine investigation and permitted execution instead of using the owner as a Cloud Shell relay.

## Context

Local development exists. The temporary Adult (development) profile is an authenticated capability in the existing product; production-image smoke is a test activity. Neither establishes a separate development deployment. The inspected baseline is `aeb3fdb953fd5812e9fec0b4b5f6b1288c45666c`.

The current worker requires its protected main and immutable tag to equal one approved SHA. The gateway and worker verifier bind one production worker identity. Another frontend connected to those services would not provide independently releasable DEV. Existing PR45/issue46 and parallel direct-access work must be reused with their actual limits.

## Decision

Provide distinct-origin application previews for eligible PR heads, then one isolated shared DEV for integrated AI journeys. Reserve shared DEV at a pinned candidate during release verification. Treat smoke as a release check; defer a third permanent staging stack until observed need justifies it. Preserve the existing Adult profile within the same application and existing production work.

The [implementation plan](../development/ENVIRONMENTS.md) proposes Firebase static preview channels for public code and synthetic data; a separate nonproduction GCP project with its own state and identities; and an independently versioned private DEV worker target. Firebase preview links are public, so authenticated static hosting is a separate explicit choice. Exact resources, identities, provider allowances and hosting setup remain to be made concrete in implementation.

Promote verified application assets and image digests with separately identified environment configuration. Validate each environment's worker identity, compatibility and existing authorization. Reconcile release automation with current source and preserve persistent production activation through routine upgrades.

## Consequences and limits

Feature review can happen before merge, while shared DEV exercises the real connected pipeline. Separate origins protect browser-state boundaries; separate cloud/worker authority limits accidental production changes. A shared release reservation can briefly queue DEV deployments, an accepted initial simplicity tradeoff in the proposed design.

The plan adds hosting, lifecycle and identity work. It does not assert current automated dispatch, create a resource, grant credentials, authorize new spend, merge a feature, replace the existing production rollout or promise uptime. New trust/setup choices require a concrete plan under the owner's existing operating rules; ordinary implementation should continue without repeated approvals.

## Evidence and related documents

- [Development environment plan](../development/ENVIRONMENTS.md)
- [Implemented architecture](../../ARCHITECTURE-CURRENT.md)
- [Release continuity](../assignment-006/RELEASE-CONTINUITY.md)
- [Temporary adult profile](0005-temporary-adult-profile.md)
- [Existing release foundation PR45](https://github.com/jzwyrzyk/family-game-factory/pull/45) and [full release issue46](https://github.com/jzwyrzyk/family-game-factory/issues/46)
- [Delivery evidence](../../DELIVERY-STATE.md)
