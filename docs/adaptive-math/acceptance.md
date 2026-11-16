# Adaptive Math v1 acceptance record

## Scope of evidence

This record covers the grades 1–4 draft implementation, not the live deployed site. All learner profiles in automated checks are synthetic. No real child learning outcome, independent educator review, paid model execution, cloud deployment, or publication is claimed.

## Checks completed in the development workspace

- Strict TypeScript and Vite production build passed during integration.
- The integrated unit/contract suite passed with 98 checks before the final five builder-contract additions. The final count is recorded below after the complete review branch runs.
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

Final CI run, commit, and exact totals will be filled in after the review branch has run.

## Release validation that automated tests cannot substitute for

A qualified elementary-math reviewer should inspect a stratified sample from every skill, all hint ladders, wording, visual accessibility, and curriculum boundaries. The catalog explicitly lists missing coverage; this release is supplemental practice.

Observe representative grade 1–4 children using both checkpoint and construction routes. Check whether they understand the task, ask for help, can leave/resume, and still feel competent after a supported answer. Include children who read or enter symbols slowly; response speed is not the mathematical grade.

Return after one day and after at least a week. Evaluate independent answers on different examples and forms, the amount of help required, and whether the same confusion reappears. Track game checkpoint burden separately from learning. Synthetic multi-day clocks verify scheduling logic only; they cannot demonstrate retention in children.

The initial ratios, challenge thresholds, cadence, and review intervals are product defaults for that pilot, not validated optimums. A release decision should use the observed results and documented coverage, not just green CI.
