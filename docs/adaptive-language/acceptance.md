# Language Arts acceptance and release gates

## Engineering commands

- npm ci
- npm run build
- npm run test:unit
- npm run test:language-ui
- npm run test:language-integration
- npm run test:learning-ui
- npm run test:learning-integration
- npm run test:browser
- npm run test:studio
- npm run test:child-journey

CI in .github/workflows/test.yml runs new ELA UI/integration gates alongside existing math, security, creation, rendering, physics, remixes and recovery suites. Do not claim CI is green unless a completed run for the exact reviewed head confirms that fact.

## Exact automated acceptance

1. **Content:** 48 grade-bound units, 192 authored examples, prerequisite validation (including cycles), hint coverage, exact answer oracles with incorrect distractors, no scoring for creative writing. Tests of randomized choices and working tile construction.
2. **Evidence:** independent first try separated from read-aloud, hint, correction and later work; no single-answer mastery; a reachable delayed-retrieval path to independent and remembered later; due review at least 24 h apart. Separate child profiles and immutable older Math history.
3. **Persistence:** every valid incorrect response saved immediately; unanswered exit is not falsely wrong; malformed/future and forged persisted content rejected without overwriting original recovery data.
4. **Navigation and original games:** parent chooses required subject, no Off. Native Language Arts checkpoints use a full-viewport, readable overlay, not a clipped game-stage card; mobile reading width, contrast, and position are geometry-tested. A visible Back to Play exit records interruption without inventing a mistake. Original game pauses freeze real simulation and inputs; supported continuation returns to the same state, with the existing shared question budget. Changing back to Math retains both learning records.
5. **Generated previews:** trusted sandbox bridge validates event identity, does not expose learner or answer, cannot award proficiency from generated code, and does not create a checkpoint from spoofed messages; older trusted runtime compatibility remains tested.
6. **Child interface:** mobile and desktop responsive layout, keyboard and touch controls, legible text, genuine letter/sentence tiles, feedback and hint actions, visible question-first focus, reduced-motion support and unscored narrative writing.

## Human validation still required

**Educational review:** A qualified elementary literacy teacher/specialist must inspect each of the actual 192 initial tasks and skill prerequisites, and reject ambiguous or misleading phonics/meaning claims. Automated tests only guarantee internal consistency, not pedagogical validity.

**Observed use:** Test Grades 1, 2, 3 and 4 children on actual tablets and computers; observe reading load, comprehension, motor effort, desire to continue playing, confusion, hint usefulness, pause timing, and screen-reader/keyboard accessibility. Use appropriate parent permission and minimize collection.

**Delayed pilot:** Return on real later dates and use unfamiliar examples. Measure independent performance with and without help, and separately assess enjoyment. Simulated timelines do not validate actual learning.

**Privacy/release:** Existing parent page is a configuration area, not secure authentication. Avoid logging children's identifying information or uploading their writing to public issues. Test backup recovery on Math+ELA profiles and verify rollback on an approved target deployment.

The app is a supplementary learning toy, not an IXL/Lexia replacement, normed assessment, reading diagnosis, or proven intervention. Keep the PR draft until the owner explicitly approves merge and release gates have been reviewed.
