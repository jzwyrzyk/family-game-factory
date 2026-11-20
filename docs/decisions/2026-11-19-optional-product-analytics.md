# Optional PostHog pilot for creation and original-art reuse

**Status:** accepted implementation scope; live activation separately unverified.
**Date:** November 19, 2026 (America/New_York).
**Decision source:** the owner's request for useful Figma/PostHog applications to Jems, followed by “Aligned. Move forward with the post host plan.” The approved plan is a narrow PostHog pilot, including separate permission and disabled defaults.

## Context

Jems has local creation, saved experiments, private art and remote generation, but those stores alone do not answer whether a captured first creation reaches play or an original drawing is reused in another game. Installing a ChatGPT integration does not instrument the product. Existing AI/speech permission and adult development access do not themselves authorize another processor's usage reporting.

## Decision

Implement explicit content-free events through the existing authenticated gateway, with a separate family permission that remains pending until independently verified and a separate current-session Adult opt-in. Collection defaults off. Use a strict property allowlist, scoped HMAC identifiers and a bounded consent-checked outbox; do not introduce browser analytics SDKs, autocapture, pageviews, recordings, free text or historical backfill.

Measure one captured creation through its actual accepted attempts and completed result. Count play only after a real trusted running signal, not preview readiness. Measure original-art reuse against distinct stable saved games; correlate played art to the exact bound revision. Keep 24-hour and seven-day follow-up windows mature before including cohorts. These are product observations, with no educational-efficacy, attention or quality claim.

Implementation began on the Art Studio PR23 candidate because immutable derivative lineage and committed art/game bindings are necessary to measure reuse correctly. PR23 subsequently merged as `20ffb350f91091d5cfb64ec6b8c805f4cfd30183`; this branch incorporates current main `90743ab2b1da098188db15dc5e40c3dfd799e291`. This work does not merge the separate first-creation UX PR81. The exact-start signal adds an immutable v2.1.1 runtime while preserving archived v2.1.0 playback; coordinated gateway/preview/worker rollout is necessary for new v2 generation.

## Consequences and limits

This provides reviewable instrumentation and repeatable dashboard definitions before any live project access. Missing permission, outages, queue bounds and older runtime archives can undercount usage. Adult permission expires with its exact grant, so builds or later plays outside that grant are intentionally unobserved. Family permission covers the consented family scope, while local profile labels are not verified identities. Pseudonyms are scoped to the verified device as well as family/audience/profile to avoid conflating default local IDs across browsers.

Browser SDK/autocapture and session replay were excluded by the approved privacy boundary. Linking loose per-profile clicks was rejected because it can connect unrelated games or attempts. Modifying saved runtime bytes was rejected because their hashes and compatibility are authoritative. Revisit the scope only with evidence from the pilot and an explicit purpose/permission update; existing reporting does not justify collecting child content.

Live activation requires an identified PostHog project, private configuration, coordinated deployment, processor retention/deletion arrangements and the applicable actual choice. Neither code tests nor a dashboard definition establishes live processing or valid child permission.

## Related references

- [Pilot contract and operational steps](../analytics/README.md)
- [Dashboard definitions, denominators and setup](../analytics/dashboard.md)
- [Product doctrine](../../PRODUCT-DOCTRINE.md)
- [Current architecture](../../ARCHITECTURE-CURRENT.md)
- [Delivery state](../../DELIVERY-STATE.md)
- [Art Studio decision](2026-11-19-private-art-studio.md)
