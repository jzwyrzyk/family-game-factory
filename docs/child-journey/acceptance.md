# Integrated child journey acceptance

## Automated evidence

All profiles, prompts, and generated examples in tests are synthetic. Remote generation/provider responses are explicitly identified fixtures. No actual child behavior or live paid model output is inferred from them.

The current review's GitHub checks and artifacts are the authority for its tested commit. Local production compilation and targeted unit/contract checks were executed. Local Chromium is unavailable under this workspace's process policy; browser evidence is collected by the existing GitHub Actions workflow without bypassing that restriction.

| Suite | Important behavior |
| --- | --- |
| `test:unit` | Math content/evidence/pacing, persistence, builder ownership, generated-runtime hashes/containment, physics, fixed clock, overlapping native/manual/math pauses, trusted learning protocol |
| `test:learning-ui` | Answer forms, help/outcomes, keyboard/touch contracts, visible initial focus, support descriptions, automatic announcements, disposed-focus protection |
| `test:learning-integration` | Grades/modes, actual native/generated math, replay/duplicate ownership, compatible v2 and incompatible old protocol, exact recovery export |
| `tests/learning-repair.cjs` | Actual native practice/challenge persistence, hints, and pacing |
| `test:studio` | Durable drafts, independent tests, nonselecting background tests, version promotion/copy/history, construction/ride continuity, profiles, remote fixture readiness |
| `test:coach` | Child/helper provenance, exact-quote decisions, field autosave, newer input during delayed replies, HTTP/auth/moderation/budget boundaries, desktop/mobile journeys |
| `test:quality` | Physical workshop, hill driving, touch/keyboard controls, tablet portrait/landscape selection and held pedals, sound/pause/replay, standalone generated physics and containment |
| `test:child-journey` | First-screen play, primary target size, current-test help/return, real native math while using mobile panels, explicit ready preview, newer draft retention, visible storage failure and retry |
| Existing browser/deployment gates | Arcade, live remix, builder, five generated revisions, worker security, restored original games, offline shell, touch, private drawings, deployment-policy dry runs |

The workflow has `browser`, `learning`, and `creative` jobs. Production build success is required for each job's suites. Failure in one suite does not hide the independent evidence from later suites, and a failed suite still fails the job. Artifacts are `browser-evidence`, `learning-evidence`, and `creative-evidence`.

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
