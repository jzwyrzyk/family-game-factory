# Adaptive Math v1 acceptance record

## Scope of evidence

This is the historical math-component acceptance record for #19. The [integrated child-journey acceptance](../child-journey/acceptance.md) and [draft #21 checks](https://github.com/jzwyrzyk/family-game-factory/pull/21/checks) cover the combined application, newer activity/focus tests, physical-game checkpoints, and the current generated-player protocol.

This record covers the grades 1–4 draft implementation, not the live deployed site. All learner profiles in automated checks are synthetic. No real child learning outcome, independent educator review, paid model execution, cloud deployment, or publication is claimed.

## Checks completed in the development workspace

- Strict TypeScript and Vite production build passed during integration.
- The integrated unit/contract suite passed all 103 checks after the builder-contract additions. The existing Studio suite passed 17 checks; the integrated design-coach suite passed 35 unit checks and eight HTTP contract checks.
- Curriculum tests independently check 6,570 generated samples across all 73 units and additional fraction, line-plot, range, and graph cases.
- Focused learning engine/store checks passed: conservative across-day evidence, exact target mixing, recent support, automatic challenge increase/decrease, grade restrictions, hints before errors, immediate wrong-answer persistence, interruption, duplicate completion, migration and recovery.
- Eleven deployment/configuration regression tests passed. These are dry-run/unit tests and perform no deployment or paid activation.
- The process sandbox blocked local Chromium startup with `socket() failed: Operation not permitted`. A request to run it outside that sandbox was automatically rejected. No attempt was made to bypass the restriction. Browser validation uses the repository's existing authorized CI workflow.

## Full browser acceptance gates

`npm test` includes the original arcade/remix/build/security/offline/touch/private-drawing journeys, the Studio journey, the isolated learning-activity suite, and the new production learning-integration suite.

Required acceptance behaviors:

1. Grades 1–4 are selectable; difficulty and math format do not change the game revision.
2. Math has no Off option; old rate-zero state normalizes into an enabled budget.
3. Written, constructed quantity/fraction, and choice answers are exact and accessible by keyboard/touch.
4. Hints before error, corrected answers, shown solutions, and interruptions retain truthful evidence after reload.
5. Profile changes preserve ownership and suppress stale callbacks.
6. A native mid-play checkpoint freezes the game and resumes the same state.
7. Generated preview round completion triggers the shared service; replay, source validation, duplicate suppression, and pause/watchdog behavior remain correct.
8. Parent reports show uncertainty and separate independent/support counts without invented mastery percentages.
9. Mobile layouts and core controls remain reachable; screenshots are saved as CI evidence.
10. Failed saves preserve drafts/working revisions and report the failure; future/damaged learning records remain exportable.

The [draft review checks](https://github.com/jzwyrzyk/family-game-factory/pull/19/checks) are the source of truth for the tested commit and current complete-gate status. Every required suite runs in its own CI stage after the production build, with learning checks in a parallel job so the longer physics journeys do not delay their diagnostics. A failed stage still fails its job; no browser gate is optional. The `browser-evidence` and `learning-evidence` artifacts contain the rendered desktop/mobile screenshots for visual review.

The isolated activity suite has passed all nine browser checks. The complete production recovery journey has also passed: unsupported stored evidence remains byte-for-byte exportable and cannot silently become a replacement learner record. The Studio and design-coach checks cover the integration with the separate design workflow; the coach's optional help or reflection controls do not remove required math. The final development handoff links the completed CI run and distinguishes executed checks from the human review below.

## Release validation that automated tests cannot substitute for

A qualified elementary-math reviewer should inspect a stratified sample from every skill, all hint ladders, wording, visual accessibility, and curriculum boundaries. The catalog explicitly lists missing coverage; this release is supplemental practice.

Observe representative grade 1–4 children using both checkpoint and construction routes. Check whether they understand the task, ask for help, can leave/resume, and still feel competent after a supported answer. Include children who read or enter symbols slowly; response speed is not the mathematical grade.

Return after one day and after at least a week. Evaluate independent answers on different examples and forms, the amount of help required, and whether the same confusion reappears. Track game checkpoint burden separately from learning. Synthetic multi-day clocks verify scheduling logic only; they cannot demonstrate retention in children.

The initial ratios, challenge thresholds, cadence, and review intervals are product defaults for that pilot, not validated optimums. A release decision should use the observed results and documented coverage, not just green CI.


## November 21, 2026 — profile setup candidate

This candidate adds per-profile grade/difficulty setup and a conservative Grade 1 / Gentle start for unconfigured child profiles. On the local working tree, `tests/learning-repair.test.ts`, `tests/learning-engine.test.ts`, and `tests/language-engine.test.ts` passed **60 checks**, including all three difficulty modes under a grade-1 ceiling, older higher-grade targets/history, explicit saved settings, backup/restore, profile switching, malformed grade/age inputs and a failed setup save. The profile/store regression plus whole-family rewards-backup suite passed **28 checks** (these overlap the 60 and are not additive). TypeScript and a Vite production build passed.

`tests/learning-profile-browser.cjs` covers desktop/phone controls, save/reload, cancellation, profile isolation, grade sampling, viewport/touch geometry and zero remote POSTs. It could not run locally: the pinned Playwright headless shell is absent, and the existing system Chromium exited before opening a page with `socket() failed: Operation not permitted`. No browser screenshot, real-device or child acceptance is claimed; hosted execution on the final integrated source remains required. This records source verification, not a merge or deployment.
