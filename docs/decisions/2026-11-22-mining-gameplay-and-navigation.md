# Restore mining gameplay, then unify its navigation

**Status:** Accepted for implementation; phase 1 gameplay and phase 2 navigation have separate evidence.
**Recorded:** November 22, 2026 (America/New_York).
**Decision source:** In the development conversation, the owner described children's response to the existing mining game: the illustrated experience was appealing, but clicking crystals lacked the intended movement, risk, loss, banking and progression. The owner specified the original loop and directed that the game overhaul come first, followed by the entry, exit and default-game organization problems. This record paraphrases that request; it is not a merge, deployment or completed acceptance receipt.

## Context

Mind Your Jems had become a build-wait-only dialog with clickable crystals and a remote banking action. Its artwork matched the desired world, but the actions did not implement the owner's original game: run across the giant's head, collect sporadic jems, respond to shakes and choose whether to cling or carry the bag to a safe bucket. A themed collection screen did not establish the requested playable experience.

The owner also found mining missing from the front-page ready-to-play choices, an inconsistent pop-out presentation, and obsolete default games still present. Fixing those navigation problems requires host/library integration beyond the game's rules. The explicit sequence permits the restored game to be reviewed before that integration changes entry and exit behavior.

## Decision

### Phase 1: restore the game and retain the approved art

Use one deterministic local simulation and one reusable illustrated controller. The player moves left/right into jems; clicking distant objects does not collect or bank them. Depositing requires reaching the bucket. Preserve the approved illustrated giant, miner, crystals, cart, background and brand assets.

A visible warning precedes each shake. While exposed, holding Space or the touch Hold control saves the miner but spills the unbanked bag. Holding must continue throughout the shake. The platform protects the miner and cargo, while its bucket automatically banks the bag. The bridge remains exposed. Shaking clears uncollected head crystals; failing to hold while exposed produces a visible fall and explicit retry. Saved bucket progress survives that retry.

A full bucket completes the level and waits for an explicit Next level. The initial tuning is a 12-jem first target, bag capacity 8, movement at 22 world units/second, 10–14 second first-level calm periods, 3 seconds of warning, a 1.5-second shake and an 850 ms fall. Later levels raise the bucket target and tighten bounded hazard/spawn intervals; warnings never fall below 2 seconds. These values are implementation choices to calibrate through play, not owner-approved numerical requirements or evidence of fun.

Track carried, saved and lost value separately. Keep complete deposited value in the session score even when it exceeds a bucket's target. Do not add learning evidence, lifetime rewards, payments, persistence or another currency. Scores reset on leaving the mining session.

Pause and Help preserve the simulation timers rather than canceling and rerolling an approaching hazard. Clear held input and stop optional sound. Resuming an exposed warning or shake gives a 900 ms preparation grace before its remaining timer continues. Backgrounding requires explicit resume. Disposal releases input state, callbacks, animation/audio and observation resources. Keyboard/touch and reduced-motion behavior remain first-class acceptance requirements.

The current wait dialog remains a temporary wrapper around the reusable controller during phase 1. This phase does not claim the new library placement, common play shell or removal of obsolete default games.

### Phase 2: use the ordinary play journey

After the gameplay overhaul, make mining discoverable with the ready-to-play games and route both ordinary and build-wait entry through the shared native game host. Give the child consistent play, pause and exit behavior. Reconcile obsolete default-game offerings, including the reported cat game, without deleting child-authored work or rewriting saved runtime/revision identities.

Keep build readiness explicit: a finished build can offer an action but cannot interrupt the current game or load a preview on its own. Preserve existing profile boundaries, save/learning guards, generation authority and authored-game continuity. Phase 1's reusable mount is preparation for this follow-on, not evidence that the routing is integrated.

## Consequences and limits

The core loop now has a consequence the child can understand: bank to protect the bag, cling to protect the miner, or fall and retry. Saved progress remains safe so a failed collecting attempt does not erase successful deposits. There are no additional lives, upgrades, combat, payments or reward grants in this decision.

This supersedes the feature contract's former tap-to-mine, remote-bank, 25-jem-star loop and permanent wait-only positioning. The previous illustrated art provenance and scoped validation remain historical records. Artwork approval is preserved; a changed composition still needs visual review.

The owner explicitly rejected the current consequence-free interaction and inconsistent navigation. No alternative engine, physics requirement, reward model or paid service was discussed or approved by this request. Use the simplest implementation that delivers the actual movement and decisions.

Automated rules, screenshots and browser journeys cannot establish whether children enjoy the timing, difficulty or replay loop. Reconsider numerical tuning after observed play, especially reaction time, recognition of the safe platform, clarity of carried versus saved jems, and whether banking competes meaningfully with collecting.

## Acceptance and related documents

The required demonstration is a real-input sequence of collection, successful banking, holding and spilling, falling and retrying, filling the bucket and advancing difficulty. Add lifecycle checks for pause/help during danger, sustained and simultaneous input, key/pointer release, backgrounding, owner changes and close/reopen. Inspect the unchanged art in the new composition on desktop, tablet and narrow/short phone viewports, with normal- and reduced-motion evidence.

The phase 1 rule checkpoint has 14 locally passing focused tests. Full application/build results, revised browser evidence, visual baselines, hosted checks, release state and actual-device/child acceptance remain separately recorded. This decision records scope, not a pass claim for any of those gates.

- [Mind Your Jems feature and verification contract](../mind-your-jems/README.md)
- [Child interface: clear at six](../brand/CHILD_INTERFACE.md)
- [Product doctrine: actual playable experience](../../PRODUCT-DOCTRINE.md#2-deliver-the-actual-playable-experience)
- [Current architecture](../../ARCHITECTURE-CURRENT.md)
- [Delivery state](../../DELIVERY-STATE.md)
