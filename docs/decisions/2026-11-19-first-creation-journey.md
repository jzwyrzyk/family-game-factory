# First creation and contextual journey guidance

**Status:** Accepted for development; implementation and release evidence are separate.
**Recorded:** November 19, 2026 (America/New_York).
**Decision source:** The owner identified the first-login experience as a gap and proposed an exceptionally simple creation entry followed by ready-made play while the requested game builds. After reviewing the broader journey, the owner said: “Aligned! With little hints or boxes to explain your journey or whatever? Will take your judgement, build it out!”

## Context

The application already has creation, ready-made games, background builds, versions, coding scenes, practice, maker progress and rewards. A new child encounters several destinations at once. Existing continuation and ready-result routes do not always foreground the child's unfinished creative intention. The accepted product goal is a recognizable personal creation that the child can try, improve, keep and return to.

## Decision

Build a focused first-creation increment around the existing systems:

- Present one dominant first-visit creation invitation and an optional **Explore first** route.
- Introduce small contextual hints at useful moments instead of a blocking multi-screen tour. Remember dismissals per player and provide Journey help and a way to show tips again.
- Connect an actual acknowledged build to existing play-while-waiting activities and provide a direct, explicit first-ready result action.
- Prioritize ready and unfinished creative work when returning, with recommendations derived from current saved state.
- Provide a **Done for now** exit that saves through existing guards and reports failures truthfully.
- Explain linked scene boundaries, the connection between practice and free creation, and the different meanings of gems, maker rank and learning records.

The child retains choice of entry and next action. Dismissing guidance is a presentation preference, not evidence of creation, learning, consent or achievement. Guidance cannot build, select Keep, bypass a required learning activity, or represent a fixture as real generation.

## Consequences and limits

An optional owner-keyed guidance map extends the existing Studio notebook and backup contract without a new progress store. The initial welcome temporarily simplifies navigation; the complete ordinary library remains available through the child's choice. Its existing first-phone-viewport playable-choice criterion is assessed after Explore first.

At the original decision, this increment did not include integration of the parallel Art Studio or Gem Pal branches. It did not deliver arbitrary same-game code editing or cross-device synchronization. Accepted direction and passing engineering tests do not establish deployment or child acceptance.

### Integration update — November 20, 2026 (UTC)

[Art Studio PR23](https://github.com/jzwyrzyk/family-game-factory/pull/23) subsequently merged, with [PR82](https://github.com/jzwyrzyk/family-game-factory/pull/82) recording that source and its acceptance. The first-creation branch now preserves that merged capability when reconciling with main `90743ab2b1da098188db15dc5e40c3dfd799e291`. This updates the integration scope, not the child's ownership, optional-guidance or explicit-Keep policy. Art Studio remains a creation subdestination in the existing shell, with local private art and supported adapters; it does not imply arbitrary same-game code round trips. Gem Pal runtime/artwork remain separate. The combined source requires its own verification; earlier checks and captures retain their original scope in [delivery state](../../DELIVERY-STATE.md).

### Refinement — November 20, 2026 (America/New_York)

The owner subsequently requested character choice as the first action, selected-character imagery throughout the host, simpler navigation and permanent private parent-session access. [The refinement decision](2026-11-20-character-first-navigation.md) supersedes this record’s Explore-first invitation and avatar-optional opening. Small hints, saved-state recovery, meaningful return, explicit Build/Keep and acknowledged-build play remain in force. The earlier decision and captures retain their historical scope.

## References

- [First-creation contract](../child-journey/FIRST-CREATION.md)
- [Homepage contract](../homepage/README.md)
- [Child ownership and explicit promotion](0001-child-led-creation.md)
- [Creation Studio](../creation-studio/README.md)
- [Rewards](../rewards/README.md)
- [Delivery state](../../DELIVERY-STATE.md)
