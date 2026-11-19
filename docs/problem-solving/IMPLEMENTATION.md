# Problem-solving implementation and acceptance

**Status:** first source implementation candidate on `feature/jems-problem-solving-evidence-20261119`. This document describes the contract under implementation; the acceptance table records what has actually been checked. It does not claim merged, deployed or child-validated behavior.

## Components

| Area | Source | Responsibility |
| --- | --- | --- |
| Evidence contract | `src/problem-solving/model.ts` | Versioned, allowlisted episode/task/observation/workspace data; six APS dimensions; bounded validation |
| Persistence | `src/problem-solving/storage.ts` | Profile-scoped drafts and immutable completed episodes, duplicate handling, backup/restore, deletion and corrupt-data recovery |
| Source boundary | `src/problem-solving/signals.ts`, `adapters.ts`, `bridge.ts` | Observe saved Math/ELA outcomes, Creation checks and Studio decisions without letting generated games score learners |
| Descriptive summaries and reports | `src/problem-solving/evidence.ts`, `progress.ts` | Separate context from structured responses, count episode-level opportunities, disclose support and missing coverage |
| Authored practice | `src/problem-solving/practice.ts` | Original deterministic tasks, response choices, known result rules and task/version identity |
| Child flow | `src/problem-solving/ui.ts`, `style.css` | Optional practice, visible support, saved progress, keyboard/touch operation and safe profile/navigation changes |
| Existing surfaces | Trusted app entry, My Powers/Parent Controls and `src/legacy/store.js` | Navigation, selected-profile observations, family backup/restore, selected-profile clearing and adult isolation |

Generated source, model replies and iframe messages have no authority to supply a demonstrated APS result. A model can help the child create a game under the existing coach/builder contract; it cannot grade the reasoning ledger.

## Record semantics

The workspace schema is `jems.problem-solving.workspace.v1`, stored at `family-game-factory-problem-solving-v1`. Episodes use `jems.problem-solving.episode.v1`. Each episode has owner/session identity, source, task family/version/variant, exposure, start/end and status. It is either `structured-practice` or `context-only`.

Each observation identifies one dimension and records outcome, authorship, support, elicitation, timestamp and optional response/evidence references. Outcomes are `demonstrated`, `not-yet` or `unobserved`. Context-only records are restricted to `unobserved`; recording that a prediction exists cannot grade its quality. In v1, only source `practice` may carry a structured-practice episode.

| Distinction | Stored meaning |
| --- | --- |
| Authorship | `learner`, `shared`, `helper`, `unknown` |
| Support | `none-observed`, `access-only`, `strategy`, `solution`, `unknown` |
| Elicitation | `prompted`, `spontaneous`, `unknown` |
| Exposure | `first-seen`, `repeat`, `unknown` |
| Episode status | Completed, interrupted or technical-invalid; incomplete drafts have no completion time |

`none-observed` never means verified independence. Authorship records the observable application path, not an authenticated statement about all outside help. A later hint must not rewrite an earlier committed response; it affects the subsequent step. An observed revision has its own criterion, so an initial wrong choice is not a blanket APS failure.

First exposure is limited to retained, known task history; when history is unknown it must not be invented. The start time, response order and result references are prospective observations. Existing legacy saves cannot be backfilled with unseen reasoning, prior help, trial order or a fictional baseline.

The practice families are `robot-stop`, `gem-delivery` and `ready-gate`, each with `g1-2` and `g3-4` variants. Prediction responses are preserved as unobserved APS markers. `evaluatePracticeChoice` checks useful test selection, matching the selected trial's result and selecting a functionally suitable next plan. It does not infer causal justification from a correct revision. A first encounter with a task ID is not proof of novel skill or transfer, especially when a related family/variant has been seen.

## Storage and recovery

The initial bounded policy keeps at most 200 completed episodes per owner: the earliest 12 retained episodes and the latest 188 once the cap is reached. It records the number discarded from the middle. These are storage windows, not a baseline, normative sample requirement or statistical confidence threshold. The workspace also bounds owners, drafts, observations per episode and serialized size through `PROBLEM_SOLVING_LIMITS`.

Completed episodes are immutable. Resuming a draft may append observations and advance the step, but cannot rewrite its already committed prefix. Stable identities make duplicate deliveries idempotent; an attempted rewrite under the same identity must fail. Owner checks apply before reading/joining history, and profile changes must prevent stale writes.

The existing `profileStorage` adapter maintains adult versus child namespaces. Family exports include the evidence workspace; old backups without the new optional section remain valid. Unknown future or damaged data is preserved for recovery rather than replaced with an empty history. Import validates before mutation and follows the existing family rollback/recovery behavior. The parent clear control removes the selected profile’s observations and drafts. Store-level profile removal/reset APIs and source-linked scene/chat deletion remove the relevant retained observations; there is no new family-profile deletion UI. Clear/restore invalidates an open draft so another tab cannot resurrect it. Raw recovery data must not be published in tests or issues.

Source activities own their own save contract. An optional observer records only after the relevant source result exists. An observer save failure is reported on the evidence surface without changing an already completed subject answer or kept game. No observer failure is converted into a child error.

## Summary rules

1. Restrict to the selected owner before summaries or cross-store references.
2. Retain source context separately from structured-practice outcomes.
3. Use the first relevant response for a dimension in an episode; repeated checks do not multiply independent evidence.
4. Distinguish demonstrated, not-yet, unobserved and technically invalid observations. Skipped or absent opportunities never become zero scores.
5. Display task/support/exposure context and counts. Do not combine six dimensions into a single thinking score or pool the other three subjects into APS.
6. Do not label early/recent raw differences as measured growth. Fresh variants target similar demands but are not psychometrically equated.

## Acceptance evidence

| Check | Required observation | Status |
| --- | --- | --- |
| Model/store | Reject unsupported and cross-profile data; preserve immutable records/draft prefixes; deduplicate; bound retention; recover corrupt originals | Checked by the 28 focused problem-solving tests; exact-head CI pending |
| Deterministic tasks | Validate each accepted choice and meaningful alternate; preserve first response and subsequent support; cover both age bands | Checked by the 28 focused problem-solving tests; exact-head CI pending |
| Source integration | Only observed trusted events; no raw transcript duplication, retrospective ability scoring or generated-code grading authority | Checked by the 28 focused problem-solving tests; exact-head CI pending |
| Family data | Old backup compatibility; new backup round trip; profile/reset/deletion coverage; write-failure and invalid-import recovery | Store/adapter failure, recovery, isolation and deletion tests pass. Full UI round trip is in the browser suite; CI pending. |
| Browser journey | Optional entry/exit, keyboard/touch controls, resume, profile switch, support and clear report wording | Desktop/touch suite authored. Local Chromium cannot open its process socket; unrestricted execution was rejected by automatic approval policy. Cloud browser cannot reach the isolated preview. CI pending; no claimed visual or child acceptance. |
| Existing contracts | Production build/typecheck, affected learning/Creation/Studio regression and documentation review | Build/typecheck, core unit suite, 77 Creation contracts, 31 Studio units and 18 documentation checker tests passed locally. Existing learning UI/browser regressions await CI because Chromium is blocked locally. Final documentation review recorded in registry. |
| Educational interpretation | Educator task review, child response-process interviews, support/modality fairness and task comparability | Not established by software tests |

Record the exact candidate and outcomes when available; do not carry PR62's passing tests forward as proof of this changed branch. The implementation author must inspect the final source before updating review fingerprints.

## Deferred measurement work

The six-dimension model is wider than the first three practiced dimensions. Richer free-form evidence extraction, automatic challenge scheduling, cross-device learning history, protected independent benchmarks, calibrated item difficulty, statistical growth estimates, external test imports and causal impact evaluation are separate work. No new model-based grader is required for this version. These limits should guide subsequent increments rather than be hidden by a polished dashboard.
