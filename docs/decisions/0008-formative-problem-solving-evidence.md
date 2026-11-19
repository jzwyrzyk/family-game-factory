# 0008 — Background problem-solving observations with structured practice

**Status:** Accepted for development. Implementation, merge, deployment and educational validity remain separate.

**Recorded:** November 19, 2026 (America/New_York).

**Decision source:** The owner's development conversation after the PR62 merge requested research and a feasible way to measure problem solving alongside Math, Language Arts and computational thinking without unreliable LLM measurement. After review, the owner accepted the identified corrections to the existing draft assessment research and authorized holistic implementation. The conversation is the decision source; it is not a public issue or a claim of assessment validation.

## Context

PR62 added editable scenes and deterministic checks of specific rebuild goals. Math and Language Arts already retain subject-specific answers and support. Studio retains child/helper origins, predictions, experiments and observations. These are useful components, but a check timestamp, a successful AI build or a nonempty prediction cannot establish a child's general problem-solving ability.

Draft PR54 separately defines independent academic, CT and APS benchmark research. Its human APS rubric and protected assessment plan should remain distinguishable from everyday formative evidence. Missing response scoring, alternate-form assumptions, per-step assistance and the interpretation of valid iteration required clarification before reuse.

## Decision

1. **Add one local formative evidence vocabulary across existing activities.** Preserve source, owner, task/version, episode, authorship, help, exposure and opportunity. Keep the four learning constructs distinct.
2. **Combine quiet context with optional structured practice.** Background events retain relevant facts without scoring arbitrary prose. Three original short task families initially expose test selection, interpretation and revision through known deterministic criteria.
3. **Represent six APS dimensions without fabricating coverage.** Define the problem, compare options, plan a test, interpret evidence, revise and transfer can have different evidence availability. Missing or unoffered opportunities are unknown, not failed.
4. **Keep reasoning with the learner.** Separate helper suggestions from learner decisions, neutral access from reasoning support, and prompted from spontaneous behavior. No recorded in-app hint is not verified independence. A failed prediction followed by a justified revision can be a useful demonstration.
5. **Report concrete observations.** Show specific tasks, outcomes, support, opportunities and limits. Do not publish a global thinking score, uncalibrated mastery probability, grade equivalence or causal improvement claim.
6. **Keep assessment research separate.** Correct PR54's research documents while preserving its independent-benchmark scope. Its proposed 0–36 human rubric is not the everyday background model.
7. **Preserve current product boundaries.** Optional APS practice cannot replace parent-required Math/Language checkpoints or block play. The feature uses the existing profile/adult separation and family data lifecycle. It adds no LLM grading, new paid call, cloud data ingestion or provider activation.

## Consequences and limits

The episode and task versions become a compatibility boundary. Deterministic scores require immutable rules and accurate source identity; model prose cannot create a demonstrated outcome. Repeated actions within one episode are related evidence and cannot be counted as independent samples.

The first bounded local retention policy preserves early and recent records and discloses pruning. It does not create a calibrated baseline or a cross-device research database. Old history cannot be upgraded with unseen help or reasoning steps. Unknown support and technical invalidity remain visible.

Useful formative observations can ship through the normal software review process without claiming an independent benchmark. Educational interpretation still needs educator review, observed response processes, accessibility/fairness checks and task comparability. Stronger growth, transfer and impact claims need their own evidence.

## Reconsideration triggers

Expand the practice bank when observed use shows missing opportunities or narrow task familiarity. Revisit summary rules only with relevant evidence about task comparability and the intended use. Consider a calibrated statistical model or human/LLM evidence coding only after the task/rubric and independent validation data justify it. A new model must retain auditable evidence and explicit unknowns.

## Related documents

- [Feature contract](../problem-solving/README.md), [implementation and acceptance](../problem-solving/IMPLEMENTATION.md), [standards and assessment comparisons](../problem-solving/BENCHMARKS.md).
- [PR54 independent assessment research](https://github.com/jzwyrzyk/family-game-factory/pull/54).
- [Creation practice decision](0007-creation-and-rebuild-practice.md) and [design coaching](../design-coach/GOLD_STANDARD.md).
- [Product doctrine](../../PRODUCT-DOCTRINE.md), [current architecture](../../ARCHITECTURE-CURRENT.md) and [delivery state](../../DELIVERY-STATE.md).
