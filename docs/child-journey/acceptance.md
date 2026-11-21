# Integrated child journey acceptance

## Automated evidence

All profiles, prompts, and generated examples in tests are synthetic. Remote generation/provider responses are explicitly identified fixtures. No actual child behavior or live paid model output is inferred from them.

Each review's GitHub checks, local receipts and artifacts establish only their tested source. The guided-creation follow-up, corrected after the owner's November 21 clarification, uses local production builds and headless Chromium for its focused and integrated browser suites; [selected captures](previews/README.md) record the exact bundles and fixture limits. The original integrated-journey review could not run Chromium locally and relied on hosted browser evidence; that historical environment limitation does not describe the later run.

| Suite | Important behavior |
| --- | --- |
| `test:unit` | Math content/evidence/pacing, persistence, builder ownership, generated-runtime hashes/containment, physics, fixed clock, overlapping native/manual/math pauses, trusted learning protocol |
| `test:learning-ui` | Answer forms, help/outcomes, keyboard/touch contracts, visible initial focus, support descriptions, automatic announcements, disposed-focus protection |
| `test:learning-integration` | Grades/modes, actual native/generated math, replay/duplicate ownership, compatible v2 and incompatible old protocol, exact recovery export |
| `tests/learning-repair.cjs` | Actual native practice/challenge persistence, hints, and pacing |
| `test:studio` | Durable drafts, independent tests, nonselecting background tests, version promotion/copy/history, construction/ride continuity, profiles, remote fixture readiness |
| `test:coach` | Child/helper provenance, exact-quote decisions, field autosave, newer input during delayed replies, HTTP/auth/moderation/budget boundaries, desktop/mobile journeys |
| `test:guided-creation` | Contextual coach questions retain the child's typed answers and corrections; no supplied-answer or delegation controls; grounded current-state readiness gates explicit first Build; optional details stay collapsed; focused truthful handoff preserves drafts, ownership and explicit play; internal instructions stay out of chat; profile-return transcripts and helper attribution survive |
| `test:quality` | Physical workshop, hill driving, touch/keyboard controls, tablet portrait/landscape selection and held pedals, sound/pause/replay, standalone generated physics and containment |
| `test:child-journey` | Character-first entry and conversational creation, primary target size, current-test help/return, real native math while using mobile panels, explicit ready preview, newer draft retention, visible storage failure and retry |
| Existing browser/deployment gates | Arcade, live remix, builder, five generated revisions, worker security, restored original games, offline shell, touch, private drawings, deployment-policy dry runs |

The original integrated workflow used `browser`, `learning`, and `creative` jobs with corresponding evidence artifacts. Later release checks also use the complete [parallel regression assignment](../assignment-006/RELEASE-CONTINUITY.md#complete-parallel-release-regressions). Production build success is required for each job's suites. Failure in one suite does not turn another job's passing evidence into a complete-run pass.

Before handoff, inspect the complete run and its mobile/desktop screenshots; do not substitute a targeted unit pass or historical #19/#20 run for the integrated result. See the final PR body for the completed run and any unresolved results.

## Required observed review before release claims

Observe representative children in grades 1–4 on the intended touch devices. Use short, neutral tasks and let the child attempt them before helping:

1. Pick and start a game, then find how to play.
2. Complete a math activity with a hint and return to the game.
3. Leave during an activity and explain what happened on return.
4. Make a small change, try another idea, and return to the preferred test.
5. Show which version is the main game and choose one deliberately.
6. Leave an unfinished thought, reopen it, and find a ready build.
7. Recover from an unavailable builder or a simulated save failure with adult supervision.
8. Stop or switch games without pressure to keep playing.

Record observable behavior: whether the next action was found, where an adult helped, whether labels were understood, whether the child confused a test with the main game, and whether math interruption felt excessive. Avoid inferring motivation or feelings from speed, losses, or scores. Ask the child directly and accept that a win can still be boring.

Include keyboard and screen-reader review, small viewports, device-specific browser behavior, slow reading, reduced motion, and comfortable input/audio settings. The 44px target and automated focus checks do not establish complete accessibility.

Math content/hints still require elementary-educator review. Actual delayed retention requires return sessions after real elapsed days, including a week; synthetic clocks only check scheduling. Mobile performance and child enjoyment still require device observation. Activation of a live generated-game worker, real coach, or public deployment remains a separate owner decision under the existing safeguards.
