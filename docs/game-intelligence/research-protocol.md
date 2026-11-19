# Jems Game Intelligence — Research and Acceptance Protocol

**Version:** R&D v1, 2026-11-18. **Scope:** game-form selection, intent fidelity, independent playability and real child experience. Baseline study requires owner approval before actual paid generation or any child participation.

## Research questions and falsifiable hypotheses

**H1 — Form selection.** A dedicated design preflight reduces unjustified rigid-body physics in concepts where the activity can be scripted, without significantly reducing fidelity in concepts that genuinely need physics.

**H2 — Game fidelity.** A traceable intent contract and independent gameplay judge detect more omitted essential mechanics and missing payoffs than syntax/browser success tests alone.

**H3 — Play experience.** Children are more likely to understand and positively evaluate game experiences produced with the improved pipeline, without loss of authorship, more waiting, or a decrease in accessibility.

**H4 — Resource economics.** A lightweight 2D-first pipeline reduces engineering complexity, failed builds and/or inference costs on simpler concepts, after accounting for additional design/review steps.

Explicit null results are possible. Passing isolated fixture tests is not evidence that H1-H4 are true.

## Offline benchmark: 24 distinct ideas, not 24 repetitions of the same genre

Stratify the examples. Record expected form AND what the player must do/see. The first 16 are development/iteration items; the last 8 are a sealed holdout for the first comparative benchmark. Baseline and test groups use identical child wording.

| ID | Example child request | Form hypothesis | Critical fidelity moment |
| --- | --- | --- | --- |
| D01 | Put colorful bubble gum stickers onto a rocket, press launch | 2D / rules / drag | Completed sticker build launches |
| D02 | Assemble a robot from three pieces and make it dance | 2D / rules / drag | Assembly drives a dance animation |
| D03 | Drag socks together with gum and make them blast away | 2D / rules / drag | Actual attachment, then propulsion payoff |
| D04 | Give a robot step-by-step commands to follow a route | 2D / grid | Visible route follows selected commands |
| D05 | Make a maze and tell a robot to avoid obstacles | 2D / grid | Obstacles constrain allowed moves |
| D06 | Make a cat eat donuts on the moon and get giant | 2D / arcade | Visible growth after eating |
| D07 | Cat grows until exploding into stars | 2D / arcade | Requested star transformation exists |
| D08 | Collect stars while flying a colorful spaceship | 2D / arcade | Collectible state actually increments |
| D09 | Drive a little car along a flat racetrack | 2D / scripted or simple movement | Steering/race control feels direct |
| D10 | Drive over bumpy hills with working suspension | 2D / physical | Springs and terrain affect ride |
| D11 | Make a stack that falls over when too heavy | 2D / physical | Mass/load causes toppling |
| D12 | Launch a ball from a catapult with trajectory changes | 2D / physical | Angle/force measurably affect trajectory |
| D13 | Choose among buckets and reveal slime or a prize | 2D / rules | Selection produces immediate reveal |
| D14 | Make a dragon bounce magic spells off a shield | 2D / combat rules | Shield visibly reflects attack |
| D15 | Make a freeform toy where I can decorate a submarine | 2D / open-ended rules | No forced fake win; decoration retained |
| D16 | A ball bounces off walls with realistic gravity | 2D / physical | Contacts/trajectory affect path |
| H01 | A magical airplane loops when I tap it | 2D / scripted | Touch triggers clear looping animation |
| H02 | A balancing bridge collapses when the cart gets too heavy | 2D / physical | Load-bearing produces failure |
| H03 | Make a puzzle where the robot changes color after each move | 2D / grid rules | Per-step color state changes |
| H04 | Draw stars to decorate a castle and make it sparkle | 2D / direct draw | Art remains; payoff is visible |
| H05 | A 3D space game where I can fly in depth and turn around | True 3D request, unsupported | Must not misrepresent 2D as 3D |
| H06 | A game that looks 3D but only uses 2D sticker buttons | 2D styled like 3D / rules | Style does not force a 3D engine |
| H07 | A bubble gum car whose actual gum joints snap under weight | 2D / physical | Gum stress is mechanically real |
| H08 | Make a cat jump on planets and win when it finds candy | 2D / arcade; no automatic physics | Goal is achievable; outcome explicit |

No one-word classifier can decide all of these correctly. Store mismatches as the basis for follow-on research rather than hardcoding this list into a magical score. Child-authored idea sampling beyond Jems' favorites is essential before production.

## Design-review labeling (two independent reviewers)

For each idea, record:

- Child-authored characters/objects and immutable literal premise.
- Requested verbs/actions and their object/target.
- Visible state transitions and expected payoff; which are essential vs proposed.
- Input/interaction model; view mode; simulation model and specific mechanical reason.
- Two lower-complexity alternatives and why each does or does not preserve intent.
- Required learning checkpoints, age-appropriate communication and recoverability.
- Unsupported capability, ambiguity and risks, with confidence, not an invented numeric certainty.

Reviewers label independently, before viewing generated code. Disagreements are adjudicated and preserved. Do not retrofit benchmark labels to match outputs from a favored model. Track inter-rater agreement and report ambiguity.

## Three experiments, staged deliberately

### E1 — Offline form decision only (no model calls)

Apply local advisory to D01-D16, then the sealed H01-H08 once. Compare to independent reviewed form choices. Report confusion matrix for scripted vs physical, false physics positives, missed necessary physics, true-3D representation errors, and interaction mismatch. A false positive for physics on a sticker game is a first-class error even if it is technically playable.

Do not ship a hard blocker based on E1; regex and limited manual fixtures are not validated intent understanding.

### E2 — Generation A/B in the private sandbox

Two versions use the *same child prompt, base revision, model, budget, platform, seeds when supported and available assets*:

- **A: Baseline** — original generic generation instructions, no preflight.
- **B: Research** — form guidance and appropriately scoped runtime instructions.

Use the same curated evaluation rubric blind to condition; first compare D01-D16, then evaluate H01-H08 untouched. Each condition should attempt multiple independent generations where budget permits; save each request and response in approved private storage only. Never put child prompts/source in public GitHub Actions logs or artifacts.

Log: generated game type, compile pass, runtime safety pass, actual object interaction, essential feature completion, missing requested payoff, number of repairs, paid tokens, time to first playable preview, median/p95 first-interaction latency, and memory/motion issues on target devices. A concise design can win even if it has less physics.

A generator never reviews its own code as proof of fidelity. Independent reviewers and, in R3, an isolated GUI judge must use actual player input/visible state. Unverifiable requirements are not passes.

### E3 — Real child pilot, only with parent consent

After E2 safety and objective quality pass, run short, age-appropriate observational sessions on real family devices. Begin with a small feasibility pilot, then a larger balanced study if results justify it. Children should be free to stop and should not receive deceptive feedback about what is being evaluated. Use neutral tasks and counterbalance order.

Observe: discovers first action without help; understands game goal; notices requested payoff; can retry; can state whether the experience matched their idea; voluntarily chooses to play, edit, or switch. Ask simple direct questions about most/least liked part, without leading toward physics or the tested condition.

Avoid compulsory retention loops, behavioral advertisements, public community features, automated emotional labeling, and speculative profiles. Store only necessary, consented evidence; no default recording of voice/video or generated personal-data dossiers. Provide deletion/retention controls before collecting any research data beyond existing local operations.

## Practical decision criteria for next-phase investment

These are **proposed engineering acceptance targets**, not achieved results:

- Zero known case in which the classifier's advice silently replaces an explicit child requirement.
- All known true-3D holdouts are flagged as capability gaps, not falsely fulfilled.
- Meaningful reduction of unjustified physics decisions vs baseline, with no equivalent rise in missed essential physics; report counts and confidence intervals, not only percentages.
- Fidelity judged per *essential requirement*. A candidate does not pass merely for being interactive; a game missing a required payoff is a failure.
- No regression in sandbox isolation, math/language checkpoint protocol, replay, device controls, auth, production spend guardrails or child-selected version semantics.
- Comparable or lower median build time and measured per-job cost for simpler games, or an explicit justified tradeoff for fidelity.
- Human pilot outcomes determine UX investment, not a single auto-generated scalar. Report counterexamples and accessibility-specific barriers.

Acceptance to activate an autonomous quality repair or production gate is a **separate** reviewed decision; there is no automatic release in this research.

## Future QA harness design

1. Capture expected actions and state changes as a typed, versioned, source-traceable contract.
2. Generate and validate an isolated game package under existing runner conditions.
3. Have an independent test controller issue real input (tap/drag/keys) into the *rendered* preview using an approved scoped environment.
4. Collect bounded event and screenshot evidence for each requirement. An event must correspond to a visible outcome, not a fake self-reported "success" flag from generated code.
5. Validate play progression: a child can start, interact, see effect, recover from mistakes, replay and remain in open-ended play when chosen.
6. Evaluate with simple, deterministic per-genre scripts first. Only add GUI agents after their false-positive/false-negative rate is measured on holdout games.
7. Distinguish objective defect (eligible for bounded code repair) from creative choice (return to child for optional change). Retest all safety, learning and resource gates after repair.

No score based on duration, number of attempts, answer speed, winning, or probability of returning may be presented as a child's enjoyment or learning mastery.

## Research methods and benchmarks

- GameFlow identifies goals, feedback, skill and control as candidate evaluation dimensions (Sweetser & Wyeth, 2005): https://doi.org/10.1145/1077246.1077253
- A formal PCG benchmark illustrates distinct quality, controllability and diversity axes: https://arxiv.org/abs/2503.21474
- GUI play agents can evaluate some in-game rubric behaviors but not general enjoyment: https://aclanthology.org/2026.findings-emnlp.1100/
- Game-specification fidelity studies support requirements linked to executable evidence: https://arxiv.org/abs/2609.39564
- Observed children should see self-explanatory interactions and reduced cognitive burden: https://www.nngroup.com/articles/kids-cognition/

Research findings from other games, genres and participant populations are hypotheses to test for Jems, not proof of generalization.
