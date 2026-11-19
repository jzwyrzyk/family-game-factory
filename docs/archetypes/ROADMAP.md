# Implementation Roadmap — 22 Archetypes to a Real Composable Jems Engine
State: planned; do not equate proposed modules with delivered games. The current
PR establishes vocabulary, honest assessment and headless proof only.

## A. Baseline and upstream prerequisite (current work)
- Finish/stabilize PRs #36 and #43 and existing deployment/security/voice work.
- Confirm the normal child journey, six native games, Math/English checkpoints,
  version history, private builder, trusted devices and paid approvals work.
- Keep PR #48 separate as draft; it should not gate stabilizing production.
- Review research charter and required evidence. Disallow "compile succeeds" as
  an acceptable gameplay-fidelity claim.

## B. Deliver real portable mechanics, not just 77 names
Build a versioned, immutable trusted registry: signature, role schema, state
schema, parameter bounds, engine compatibility, subscriptions, output events,
performance budget, deterministic replay, test suite, trusted digest, status.
Start with these **four** research-prototype concepts and the supporting engine:
- `reflect-projectile` — projectile/defender/attacker roles, collision ordering,
  velocity and ownership changes, optional shield timing.
- `health-damage` — damage once on verified hit, death/victory/lose, immunity.
- `collect-item` — collision pickup with state persistence and score feedback.
- `grow-on-collect` — visible scale/rig/camera/collision-safe change on pickup.

Next build input/renderer/camera, scripted movement, projectile spawning, jump,
winning/retrying, accessible touch controls, sound and celebrations. Then
refactor these modules **once**, not separately for each game.

**Acceptance:** two distinct **rendered playable browser games** in different
archetypes both consume the exact same reflection or collection module version;
touch, keyboard, pause, lose/win, replay, visual payoff and sandbox tests pass.
Headless unit tests alone are insufficient.

## C. First real cross-archetype composition and revision support
- Demo 1: shielded dragon -> reflected fireball -> dragon loses health.
- Demo 2: spaceship with forcefield -> reflected alien laser -> alien loses health.
- Same `reflect-projectile` implementation/digest, different assets, actors,
  optional module parameters and goal/scene configuration.
- Demo 3: moon cat collects -> visibly grows; end when specified goal reached.
- Verify components interact without duplicate collisions, incorrect ownership,
  broken replay, invisible payoffs or regressions when changing input devices.
- Add versioned composed artifacts through the **existing** authenticated
  revision/preview path, isolated trusted runtime and gated migration.
- Failure leaves original saved revision unmodified; Keep/Undo/Fork must be tested.

**Acceptance:** one novel idea successfully uses a previously proven module
without generating that module's source again, with full end-to-end automated
browser and human-observed intent evidence.

## D. Expand by candidate archetype waves (not evidence-based ranking yet)
| Wave | Families | Shared engine investments |
|---|---|---|
| 1 — Simple rule-driven | choice-discovery, grid-navigation, route-programming, drag-creation, matching-sorting | Tile/grid service, drag/drop, reveal/choice state, scene animation |
| 2 — Arcade | endless-runner, platformer, projectile-defense, flight-dodge, roaming-arcade, rhythm-reaction | Character/controller, fixed timestep, projectile, collision/health, collectible |
| 3 — Physical | side-driving, physical-construction, physics-puzzle, sports-ball | Trusted Planck integration, wheels/joints/constraints, physics compatibility tests |
| 4 — Broader rule systems | top-driving, tower-waves, hidden-grid, turn-strategy, words-trivia | AI/timed spawning, turns, hidden cells, assessment-safe rules |
| 5 — Open-ended worlds | interactive-adventure, nurture-management | Story state, inventory, safe dialog, role lifecycle, resource economy |

A wave is not "done" until its essential gameplay can be built, run, repair,
save, compare, replay, and pass its safety/device gates. Each implementation
wave may contain only a few modules/one complete vertical slice per PR.

## E. Future quick-edit optimization (second research question, later)
Only after the playable assembly engine is credible:
- Emit a per-game **installed-mechanics manifest** at initial creation.
- Classify edit requests into parameter patch, preinstalled behavior switch,
  compatible module injection, or novel AI generation.
- Benchmark common spontaneous child edit phrasing and compositions; discover
  demand using consent-appropriate data instead of assuming predictability.
- For highly likely behavior changes, proactively install bounded, disabled
  verified capabilities *without altering the current child's game*.
- Compare the economics and latency of proactive packaging vs on-demand loading.
- Strictly distinguish engine behavior changes from asset swaps and animation
  changes. No unexplained background paid inference.

Target path: **5–10s** typical existing setting adjustment; **10–30s** cached
behavior switch; **up to ~2m** validated module composition; asynchronous
AI fallback for novel mechanics. These are product *targets*, not measured guarantees.

## F. Validation and decision gates
1. Source-backed first-shot fidelity / no silent omitted required payoff.
2. Actual gameplay tested on the production-equivalent tablet/browser.
3. Module compatibility/property tests; resource/security and save versioning.
4. Respect child ownership; no silent edits, forced Keep or unnecessary questions.
5. Preserve learning and parent controls; no changes to mastery signals.
6. Audit real cost, failures, p50/p90/p95 build-to-play, and repair rates.
7. Independent holdout experiment for the 80% hypothesis as documented in
   EVALUATION.md.
8. Owner-authorized feature gate / gradual release only after evidence.

## Critical architectural choices
**Don't** hardcode 22 duplicate games into Jems. **Don't** train a special model
before obtaining enough compliant, representative examples to justify it.
**Do** build a typed behavioral registry, role-binding, dependency checking,
versioned trusted execution, and a thin AI assembly planner around those
verified components. **Do** preserve genuine novel generation as fallback.

If the runtime becomes brittle as the first four mechanics cross game boundaries,
stop adding catalog entries and fix the contracts. If the 80/20 study produces a
lower measured ceiling, optimize for verified child value rather than protecting
the hypothesis.
