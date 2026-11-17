# Child continuity & six Factory Favorites — implementation review

**Status:** draft PR #25, not merged or deployed. This batch does not enable paid AI, authorize cloud work, publish a child project, or relax security/learning controls.

## Decision and product promise

Prefer six genuinely different, developer-curated and verified native games to a misleading disposable "instant mock" of a new child's idea. Future crowdsourced favorites require separate privacy, moderation, parental authorization, provenance, consent and abuse-prevention design. There is **no public sharing** in this release.

**Principle:** game construction may take time; the child remains free to play, experiment and learn while it happens. The current playable game and every accepted experiment are safe until the child chooses to promote a new version.

### Curated shelf

| Game | Primary interaction | Design opportunity |
| --- | --- | --- |
| Bubble Gum Builders | Physical construction, trial and repair | Structural reasoning; gum, force, gravity |
| Junkyard Rally | Driving and suspension | Motor/traction/spring experiments |
| Splash or Pass | Reveal, chance and consequences | Bucket count and clue design |
| Dragon Island Rescue | Shield-reflection action | Timing, resilience and risk |
| **Moon Donut Dash** | Run, jump, collect donuts, dodge meteors | Gravity, difficulty and movement |
| **Robot Route Lab** | Author and test an arrow program | Routes, prediction, iteration |

The two new native games have touch/keyboard controls, win/retry/progression hooks, pause/resume contracts and device-local progress persistence. They are not claimed to be externally playtested or equivalent in art fidelity to the older physically authored games.

### Route work before using the AI

1. **Tier 1 (bounded instant edit):** map one known instruction to a validated local mechanic, save an independent test, and immediately play it.
2. **Tier 2 (bounded composition):** split up to four supported changes joined by 'and', 'then', comma or semicolon. These may include actual **prebuilt gameplay behaviors**, such as Moon bounce pads and Robot portals, in addition to parameter tuning. Apply changes transactionally, validate all outcomes, and save one independent test. No partial application, model call or unreviewed executable code.
3. **Tier 3 (novel AI):** explicitly queue one durable remote experiment from a known starting revision, then use the global shelf and favorite library while the builder generates/tests/repairs. Paid activation remains disabled unless the separate owner approval gates are fulfilled.

The default public factory config is still `mode:unavailable`. Novel builds must never pretend to start when the worker is disconnected.

## Async experience contract

- **Acknowledgment:** before a real job ID, say "sending" rather than "building". On acceptance, persist the job ID under the owning child and project.
- **Working:** nonmodal shelf remains visible on every Studio route. Show grounded stages (queued/building/testing/repairing) without fabricated percent or estimated finish time.
- **Keep playing:** children can open any of the six favorites, continue their existing game, or use the clearly optional My Powers practice. Extra practice uses the same learner and never consumes or replaces a required in-game checkpoint.
- **Parallel local edits:** do not block supported local edits while a remote experiment is pending. Keep the original remote job, pending experiment base and metadata; local edits create their own immutable alternatives.
- **While away:** polling continues while navigating projects and the page reattaches to saved current-child jobs after restart. The initially resumed set is bounded to eight active jobs to avoid stampeding the server; other saved jobs remain available when opened.
- **Finish:** save an unselected independent test. The working game remains unchanged. Open the preview only by explicit child action; do not steal keyboard focus, hide math or overwrite a newer draft.
- **Recovery:** failure, cancellation, stale callback, client disconnect or save failure must not overwrite the working revision. A failed status poll is *not* proof of build failure; the client retries from the authoritative job ID.
- **Costs:** poll approximately once a second for the first 15 seconds, then every 3 seconds until the first minute, then about 8 seconds, rather than every 250 ms. Server/backend usage and worker time remain metered separately.
- **Switch child:** disconnect status subscriptions for the prior profile; reopen only the new profile's jobs. Local profiles are not themselves secure parental authentication.

## Learning and design-coach rules

The game's required adaptive math checkpoints retain their existing shared per-child pace, grade boundary, evaluation authority and safe pause. Additional practice is voluntary; it does **not** unlock a build or substitute for a required question. Language Arts will later use the integrated learning host after its independent review. A build completing during math or another game must never switch the active task.

Creative coaching remains child-authored: a clear build request is not turned into a forced interview; an unknown request is not represented as already generated. The child may continue to think, play, compare alternatives and keep the original.

## What this branch does not claim

- No real measured AI generation latency, live model success rate or end-to-end hosted activation
- No general mechanical component graph; Tier 2 currently composes **known parameter edits and two prebuilt behaviors** only
- No universal mid-frame preservation for all original action games; Studio may restart those rounds after design tools, and communicates this
- No automatic merge of a quick-edited experiment into an independently built AI result
- No real-child enjoyment, learning-outcome, screen-reader or actual-device validation
- No release, developer-approved public sharing, cross-device cloud sync, or crowdsourced favorites

## Acceptance and stress tests

Automated tests should exercise: exactly six distinct starter games; native win/retry/pause/resume; atomic multi-edits; a simulated delayed build while a child makes a separate quick edit; testing/ready callback while an unrelated game or math opportunity is active; ready preview stays unselected; background status after navigation and reload; stale preview response; session/profile switches; save failure; timeout and network-unknown states.

Synthetic pending durations to inject: **1s, 5s, 15s, 60s, 180s, 600s**. Simulate failure before server acknowledgement, mid-generation, at test, during repair, during preview and after a device restart. Use isolated fixtures only; no paid AI call is needed to exercise these UX transitions.

For a parent-approved pilot, collect observed **submit-to-ready p50/p95**, time blocked by UI, project return rate, fraction of builds opened after ready, version choice comprehension, task interruption count, save/restore errors, and model/worker cost per completed game. Do not optimize simply for more minutes on screen or more paid AI calls.

**Go/no-go before merging:** production build and all tests green at the exact PR head; real-device touch/keyboard check; separate learning, drawing and language-arts branch integration; source-control review; actual observed sessions with children ages 6–10; owner-approved rollback and paid activation independently if/when desired.
