# Archetype Coverage Research — Preregistered Evaluation Plan
Status: proposed study protocol; **no child observations or 80% result yet**.
Do not label template matching as validated creation.

## Research questions
- Q1: Is 80% of the naturally expressed, intended Jems game space coverable by
  a manageable set of archetypes and verified mechanics?
- Q2: How much can be fulfilled **without additional generated code** while
  preserving essential actions, outcome, first payoff, and child authorship?
- Q3: Which new engine primitives provide the largest marginal coverage per
  dollar, per integration complexity and per maintenance burden?
- Q4: Does reuse actually decrease end-to-end time and failed builds versus
  the existing tested generation pipeline, without harming novelty?

All results must be reported for real executable games. Classifier accuracy is
a separate metric and must not be conflated with actual completion.

## Sampling and holdout
- Plan 200–300 independent *ideas* before implementation-based tuning. Sample
  across grades/ages, familiar and unfamiliar games, creative and rule-driven
  ideas, mixed genres, accessibility, and unusual phrasing.
- Use synthetic/test ideas to develop the engine. Obtain separate parent/guardian
  approval before collecting real child ideas; do not upload real identifiers,
  voice, drawings, analytics or learning records to public repositories or CI.
- The first 24 examples in PR #43 are development/regression examples only,
  not a convincing independent holdout. Reserve a sealed set of entirely unseen
  ideas for final comparison and log any repeats/near-duplicates.
- Label at least two independent reviews for essential child-authored actions,
  state changes, goals, presentation wishes, negatives, and required payoff.
  Resolve disagreement without changing original wording.
- Explicitly retain unsupported, contradictory, ambiguous and multi-mechanic
  requests in the total denominator. Report separate stratified results.

## Every sample receives these distinct evaluations
**F1 — Taxonomy assignment:** Did the primary and secondary categories match
the essential gameplay form (not theme or nouns)?
**F2 — Portable coverage:** Did registered and **verified** modules supply
every essential mechanic and compatibility/renderer/input requirement?
**F3 — First-shot working game:** Did the built artifact function in a real
browser on touch and keyboard, demonstrate the intended interaction and payoff,
and support completion/retry?
**F4 — Fidelity:** Independent reviewer verifies the child's source-backed
requirements against observed gameplay. No omitted major action; no invented
replacement mechanics. Requiring child confirmation remains separate.
**F5 — Child experience:** Consented, observed user understands first action,
can complete an interaction, finds the result worth continuing and can choose
whether to Keep. Do not infer fun from a model or bot.
**F6 — Safety and continuity:** Paid job boundaries, privacy, sandbox limits,
learning checkpoints, cancellation, version safety and durable saved work.

## Metrics
| Metric | Correct denominator and interpretation |
|---|---|
| Archetype coverage | All input ideas; matching a category alone |
| Mechanic implementation coverage | All input ideas; every requested behavior has verified code |
| Composed completion | All input ideas; works with only approved shared modules |
| First-revision faithful play | All input ideas; proven requirements visibly met |
| First-attempt working success | All attempted builds; playable without repair |
| Retry/repair recovery | All initially failing builds; subsequent safe success |
| Time-to-first-action | Submit to responding playable game, p50/p90/p95 |
| Time-to-requested-payoff | Submit to observable user-desired consequence |
| True composition reuse | Number of distinct tested game archetypes using the **same** implementation SHA |
| Maintenance cost | Tests, compatibility work, integration failures, asset load, bug fixes |
| Child autonomy | Actions/changes attempted vs successful, Keep vs reject, time waiting |
| Teacher/parent learning | Separate longitudinal evidence; no mastery from activity volume alone |

Use uncertainty intervals (e.g. Wilson 95% for proportions), disclose sample
sizes, and report results by genre, age range and complexity. Do not report
tiny per-subgroup samples as strong conclusions.

## Counterfactual
Run identical holdout requests through:
A) existing prompt->LLM generation->sandbox repair pathway;
B) archetype lookup + verified module assembly, with the same permitted
novel-generation fallback for missing essential mechanics.
For both, measure actual first playable and intent fidelity, not cached test
fixtures. Blind game-quality assessors to which method created the artifact.
Count time spent building/testing modules and any additional assembly overhead.

### No-credit conditions
- A classifying model returns `side-driving` but game not built.
- A game renders and compiles, but a dragon fireball is never reflected.
- A model adds beautiful animations but omits an essential requested action.
- A game is adapted from a template by manual engineer intervention.
- A mock fixture is mistakenly described as a real paid generation.
- A game works on desktop but not the relevant family tablet.
- An edit overwrites the child's earlier working revision or loses learning.
- The analysis excludes requests that cannot be covered.

## Planning targets, not confirmed results
- Long-term **80% of naturally sampled in-scope ideas** fully coverable without
  new gameplay code: *research hypothesis*, not acceptance of this PR.
- 100% of tested essential mechanics demonstrable with causal in-browser
  evidence, not merely source inspection.
- No regression in auth/privacy/usage safeguards; keep/rollback always works.
- Measurable reductions in p90/p95 first-game latency and operational cost
  on the same device cohort versus baseline.
- No meaningful reduction in source-backed child-intent fidelity, workability,
  accessibility or child agency.

### Decision method for the next component
For each proposed component record:
1. Number of remaining unique ideas it would unlock, using current **holdout**
   and a separate development cohort (avoid tuning the holdout).
2. Direct engineering cost, QA combinations, security/physics integration risk,
   visual asset dependencies, and future maintenance.
3. Whether it can provide a complete action+consequence+payoff without another
   missing engine service.
4. Whether it can be used across at least two different archetypes with the same
   reviewed implementation.
5. Strongest reason not to build it yet.

Do not simply multiply independent component counts to claim thousands of
working combinations: compatibility and causal completeness are restrictive.

## Pilot privacy
Children's ideas and outcomes are sensitive contextual data. Default to
synthetic cases and aggregate counters. Any real research needs family
authorization, retention/deletion rules, separation of analytics from identity,
and school-specific legal review before in-school collection.
