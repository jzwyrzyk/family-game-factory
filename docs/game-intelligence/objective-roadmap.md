# Jems Game Intelligence — Objective-by-objective execution plan

**Method:** Develop one narrowly scoped problem at a time in this conversation. Draft PR #43 is the integration branch; Issue #44 is the single master tracker. This page is the objective-level source of truth. Do not create a parallel umbrella PR or merge/deploy incrementally without separate review.

**Product doctrine:** Choose the simplest coherent game mechanics that faithfully deliver the child's requested experience. Rendering dimension, interaction, physics, art, and learning are separate decisions. The child chooses the version to keep. Automated code tests do not establish real-child enjoyment.

## Working agreement

- **Exactly one active objective.** Don't begin the next until the active objective meets acceptance or a documented blocker is isolated.
- **Scope lock:** for each objective, specify the question, output, tests, affected interfaces, and explicitly excluded work.
- **Finish with evidence:** cite exact commit/checks, remaining risks, and mark COMPLETE, BLOCKED, or IN PROGRESS.
- **Never silently change the idea:** keep original words, game/version ownership, essential mechanics, child-selected Keep action, and the privacy/learning/budget boundaries.
- **Research is not activation:** no new paid model calls, child telemetry, external sharing, provider credentials, private worker trust changes, or production deployment by default.
- **Keep other PRs independent:** parent UX, Bubble Gum toy, coach/voice, safety, drawing and learning must not be conflated or overwritten.
- **One progressive draft:** small, separately reviewable commits on PR #43. Stop and review structure if the accumulated diff or rebase risk becomes too large; do not spontaneously create competing PRs.
- **Conversation continuity:** each completed objective records the *one next objective*, so the user's "continue" resumes without re-litigating resolved decisions.

## Scope and completion gates

| ID | Objective | Core question and tangible deliverable | Done when |
| --- | --- | --- | --- |
| **O0** | Foundation and baseline | Lock initial PR/source, verify checks, preserve existing games/risks and document roadmap | CI for exact head reported accurately; skipped/cancelled checks not claimed successful; scope/ownership documented |
| **O1** | Child intent contract | Versioned source-traceable record of requested action, effect, payoff, characters, constraints, explicit unknowns and revision | Every requirement grounded in verbatim source, nothing invented or lost, ambiguous/negative prompts and legacy edits tested |
| **O2** | Minimal gameplay architecture | Decide rule-driven vs physical simulation, real 2D vs unsupported true 3D, and interaction affordance based on O1 | Contrast benchmarks prove no theme-driven overphysics, no false 3D claim, true physics preserved; uncertainty not overruled |
| **O3** | Child-first experience blueprint | Define input → immediate visible response → progression/exploration → recoverability → meaningful payoff, with age-appropriate art/audio/accessibility | Each essential moment has a verifiable child-visible expectation; no arbitrary forced win or creative overwrite |
| **O4** | Private generator contract | Pass intent and blueprint to existing trusted generation/repair without loosening schema, safety, learning or cost | Mock provider + legacy/novel contract tests; only needed APIs described; no new external provider call without authorization |
| **O5** | Independent rendered game playtests | Exercise real controls in isolated preview, verify the built artifact produces promised effects | Bounded screenshots/traces support per-requirement pass/fail/not-tested; detect missing payoff, broken controls, unreachable goal; no self-grading |
| **O6** | Bounded defect repair and comparison | Fix observable defects, not children's creative preferences, while preserving working versions | Tested repair actually addresses the defect; full safety/learning gates rerun; undo/Keep/version provenance retained |
| **O7** | Cross-vertical integration | Apply standard across drawing, voice/coaching, live remix/DOE, math/English, wait flow, saved games, parent reports, accessibility | Targeted integration/regression journeys pass without turning drawings into accidental colliders or suppressing learning |
| **O8** | Evidence-based quality research | Baseline-vs-research A/B across development and holdout cases, cost/latency, device tests, parent-consented observation | Reproducible metrics and counterexamples; no claim of better enjoyment absent observed child feedback |
| **O9** | Cumulative merge and deployment | Full integrated PR review, conflict resolution, exact-source CI, approved pinned worker, staged production and rollback | Owner-authorized trusted release; secure worker public-source pin updated only by separate review; smoke tests and rollback verified |

## O0: Complete; O1 is the only next active objective

Baseline verified after the initial draft:
- Draft PR #43 remains unmerged.
- Arcade journeys for public app head e4f5e20e5825972f8fc469dd86e57ba6a9e49d11 succeeded, including its browser/learning/creative jobs.
- The visual-review run for the same head was initially cancelled, but its cancelled job was rerun. All four jobs subsequently passed: screenshots, brand contract, Studio journey and joy-contract. [View final successful run](https://github.com/jzwyrzyk/family-game-factory/actions/runs/44320154925).
- The separate private generation worker checks out an older immutable reviewed public-source SHA and will NOT adopt PR #43 merely because the app branch is merged. No private worker/credential/attestation change is included here.
- Existing code is a bounded deterministic game-form advisory plus quality-evidence ledger. It is NOT a generalized intent recognizer, a real gameplay quality evaluator, or a measurement of fun.

**O0 disposition: COMPLETE for the reviewed code-bearing baseline.** [Arcade journeys](https://github.com/jzwyrzyk/family-game-factory/actions/runs/44320155111) and [full visual review](https://github.com/jzwyrzyk/family-game-factory/actions/runs/44320154925) passed at public app code SHA e4f5e20e5825972f8fc469dd86e57ba6a9e49d11. Documentation-only changes on this branch after that SHA do not add runtime behavior, but the final PR still needs its own exact-head checks. **O1 is now the only active next engineering objective.**

## Ready-to-start scope: O1, not O2

**Problem:** Produce a source-traceable experience contract from a child's request without inventing mechanics or taking control of the design.

**Inputs:** exact child words plus optional base revision. **Outputs:** a small typed and versioned contract with child-quoted/source-span entities, actions, causal outcomes, named payoff, explicit “must/avoid” constraints, objective or free-play intent (only if stated), provenance, unknowns and contradictions. Keep model proposals separate from child-authored facts.

**Representative cases:** Gum-stuck socks that blast off (two moments), sticker rocket (no automatic physics), hill-driving suspension (physical), cat eating donuts and growing, a grid robot (no true 3D), real 3-axis navigation (unsupported by current runtime), child drawing with ambiguous wheels, no-physics phrasing and revisions to a saved game.

**Gate:** schema and validator, bounded proposal/annotation, negative and ambiguity tests, retained original request and revision, no new paid inference or runtime behavior change. Do not expand into O2 architecture routing until this contract is validated.

## Supporting references

- [Main design standard](README.md)
- [Independent research / holdout protocol](research-protocol.md)
- [Cross-vertical acceptance matrix](cross-vertical-standard.md)
- [Draft PR #43](https://github.com/jzwyrzyk/family-game-factory/pull/43)
- [Master Issue #44](https://github.com/jzwyrzyk/family-game-factory/issues/44)
