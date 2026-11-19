# Jems Archetype Engine — Integration and Runtime Contracts
**Design-only specification.** The research branch does not alter the live Studio,
private builder, preview format, cloud worker, revision DB, math/language host or child
credentials. The first architecture must integrate into them, not run beside them.

## 1. Canonical game creation sequence
1. **Input:** child types or records a voice message; authenticated Studio owns the
   project and preserves exact text. Do not extract child identity or add a new service.
2. **Intent:** use PR #43's O1 `ChildIntentContract`, source spans, explicit actions,
   state transitions, negatives, goal and payoff. The child's source is authoritative.
3. **Form:** use PR #43's O2 `GameFormDecision` for rendering mode (2D vs true 3D),
   rules/physics, primary interaction and unresolved conflicts. This catalog is
   downstream of that decision. Do not run a second, competing keyword classifier.
4. **Reuse proposal:** recommend one or more archetypes and candidate mechanic
   versions from the registry. Validate exact roles, required child actions and
   payoff before choosing a base engine. Record unknowns instead of pretending.
5. **Route:**
   - **Local native**: existing `src/factory/interpreter.ts` and manifest validators
     for edits genuinely supported by the currently saved game.
   - **Verified composition** (*future*) : recipe compiler + trusted modules + game
     artifact, only if *every* required component and combination is approved.
   - **Novel AI**: existing `JobService` / `AgentAdapter` / sandbox / isolated worker,
     preserving family/budget/moderation and verified revision history.
   - **Review/unsupported**: clear, child-friendly explanation; original saved.
6. **Build and verify:** objective tests for inputs -> state changes -> visible payoff,
   touch/keyboard, frame stability, retry, learning, security and resource budgets.
7. **Play/compare:** existing Studio preview, revision DAG, candidate/Keep/Undo/Fork;
   never overwrite a current working game or auto-Keep an AI-generated result.
8. **Record evidence:** collect consent-appropriate behavioral evidence; do not equate
   LLM opinions, compile success, or play counts with verified child delight.

## 2. Concrete source integration (after PR #43)
| Jems source / subsystem | Owner | Future archetype hook | Prohibited shortcut |
|---|---|---|---|
| `src/studio/voice.ts`, Studio composer | Child input | Preserve voice transcript and original text | Expose secrets or secretly rewrite child request |
| PR #43 `server/quality/child-intent.ts` | O1 intent evidence | Annotate mechanics with exact quoted action/consequence spans | Genre keyword as proof of intent |
| PR #43 `server/quality/game-form.ts` | O2 form | Verify archetype compatible with approved view, input and physics | Force physics everywhere |
| `src/factory/interpreter.ts` | Existing instant edits | Remains first responder for bounded same-game config edits | Bypass config validation |
| `src/runtime/manifests.ts` | Native settings | `src/archetypes/native.ts` read-only compatibility/knob map | Claim cross-game composition already exists |
| `server/pipeline/service.ts` | Auth, cost and job lifecycle | Future behind-flag assembly decision **after** auth and validation | Free route that skips security/usage checks |
| `server/agent/openai.ts` | Existing model requests | Add vetted manifest IDs and exact requirements to **same** generation call | Additional unapproved inference service |
| `server/sandbox/runtime-v2.ts` | Trusted 2D physical capability | Future approved adapter for physics modules | Inject privileged JS or new user-supplied APIs |
| `src/runtime/registry.ts` | Existing native game play | Future versioned `composed-game-v1` plugin, after gated design | Convert existing six-game IDs to new save format |
| `src/studio/adapter.ts` / revision store | Save, compare, fork | Store the immutable recipe/digests in an approved artifact schema | Change active pointer before child Keep |
| `src/learning/*`, `src/language/*` | Learning checkpoints | Continue using host `pause/resume/checkpoint` and evidence | Let generated content modify scores/mastery |
| Family auth/parent controls | Privacy and trust | Keep device/family scope, grants and limits | Share private child data with library or research logs |
| Child coach | Child-led learning | Suggest optional experiments using **available** module affordances | Re-engineer the child's game without consent |

The current `AssemblyAssessment` is read-only and does not call the worker. The
PR #43 intent+game-form structs are **draft interfaces**; bind to their exact
merged versions only after conflict/security review. Do not import an unmerged
draft into a production file.

## 3. Proposed trusted portable module contract (NOT implemented yet)
Each module version will need all of these:
- Stable ID and semantic version; signed/hashed tested implementation reference.
- `engineMode` = rule-driven or physics-2D, render/input device requirements.
- Required **roles** (actor, projectile, defender, collectible, vehicle, etc.).
- Owned state, declared parameters, type, default, min/max/step and migration rules.
- Subscribed/produced typed events, deterministic ordering and lifecycle hooks.
- Dependency/incompatibility graph (e.g. collision before reflection; no duplicate
  projectile-damage handler, no incompatible gravity integrators).
- Observable promises: every included mechanic has a test action and causal outcome.
- Budget: max instances, update operations, memory/time behavior, network isolation.
- Touch/keyboard/accessibility, pause/restart, save/restore compatibility.
- Source provenance and ownership; no unapproved child art or third-party assets.
- Unit, pairwise integration, cross-archetype browser, and human pilot evidence.
- Maturity gate and exact reviewed SHA/digest, not self-declared by the generator.

Proposed state progression:
`catalogued -> implemented -> unit-verified -> integration-verified ->
sandbox-attested -> pilot-reviewed -> production-approved`.
An existing game's feature is **not** automatically unit-verified as a standalone
portable module. Reuse the trusted source/asset package by pinned version, never by
having a model copy/paste an unrestricted implementation into its 30 KB source.

### Role-bound composition example
```json
{
  "schema": "proposed-composed-game-v1",
  "archetype": "projectile-defense",
  "renderer": "2d-canvas",
  "engine": "rules",
  "actors": {
    "attacker": "dragon",
    "defender": "child-created-hero",
    "projectile": "fireball"
  },
  "modules": [
    {"id": "reflect-projectile", "version": "to-be-verified"},
    {"id": "shield-window", "version": "to-be-verified"},
    {"id": "health-damage", "version": "to-be-verified"}
  ],
  "requiredPayoff": "reflected fireball damages dragon",
  "approval": "NOT_VERIFIED"
}
```
This JSON is illustrative only. It is **not accepted** by any current API.
The real recipe must include validated original source evidence, actor bindings,
trusted module hashes, event ordering, resources and explicit independent tests.

## 4. What the first requested game receives
A child asks for a cat that jumps, eats donuts and grows on the moon:
1. O1 records `cat`, `jump`, `eat donuts`, `grow larger`.
2. O2 recommends simple 2D rule-driven movement; no automatic Planck world.
3. Planner selects a runner/platformer shell and `collect-item` + `grow-on-collect`
   + goal/payoff, with cat/moon/donut visuals retained.
4. Registry checks that all mechanics and the interaction between them are
   signed, compatible and independently browser-tested.
5. Only then compile a composed preview and connect existing touch/keyboard,
   math/language checkpoint host and Studio revision lifecycle.
6. If any essential behavior is absent or unsafe, use the existing approved
   AI generation pipeline, *not* a misleading substitute game.

Initial build may also prepare a **versioned per-game affordance manifest**
that records which validated changes are safe and cheap in that exact game.
This enables future off-the-shelf edits (separate next research question) without
predictively changing the child's choices. Do not prebuild arbitrary unrequested
functions into games without measured benefit and a resource budget.

## 5. Editing paths and execution budgets
| Route | Product target | Requirements | State today |
|---|---|---|---|
| Native parameter/local change | 5–10 seconds | Bounded manifest + current interpreter | Exists for selected edits |
| Reusable behavior toggle | 5–30 seconds | Mechanic already installed, relevant validation | Not generally available |
| Compose tested modules | Up to ~2 minutes | Trusted module versions, dependencies, assets, tests | Future |
| Generate novel behavior | Async and potentially many minutes | Existing private worker, test/repair/preview | Existing pipeline, not universally instant |

These are **desired human-experience targets**, not observed service SLOs.
Report p50/p90/p95 on actual tablets and end-to-end interaction-to-play time.
Do not confuse server compute latency with the time until the child's game responds.
Fallback to last working game during a pending job; no fake build progress percentages.

## 6. Compatibility, security and ownership checks
- Do not edit the existing `GeneratedGame` / `PlayableGame` union or persistence
  schemas in this research PR. A new `composed-game-v1` type requires a separate
  additive version migration, artifact validation, private preview, authorization,
  repair, safe Keep/Undo and rollback acceptance.
- All user-authored content, sketches, private prompts, learner data and game
  artifacts remain private to the authenticated family unless separately approved.
  Never write real child's prompt/identity to public GitHub, CI logs or vendor
  training datasets. Use synthetic benchmarks by default.
- A trusted module registry must be **server-controlled**, never populated or
  promoted automatically because untrusted generated source says it is verified.
- Browser execution runs in the approved sandbox/isolation boundaries; no
  model-generated DOM or network privileges, cloud keys, storage access or
  parent-data APIs.
- Auth and spend limits apply before any remote job; no second execution channel.
  Local composition must still respect safe preview, device/session and child
  workspace boundaries.
- An error or missing component preserves the current revision; never partially
  apply a set of changes and claim everything worked.
- Nonessential visual optimization must not delete required math/English events.
  Parent-only difficulty settings remain authoritative; educational claims need
  real measurement outside of game telemetry.

## 7. Composition gates before any production activation
G0: Registry integrity and exact version ownership.
G1: Unit and property tests for every behavior and its parameters.
G2: Pairwise/ordered interactions of modules (reflection vs damage; collection
    vs growing; shield timing vs collisions).
G3: Rendered first-action, first-payoff, win/fail/retry, pause, touch + keyboard.
G4: Resource budgets, no runaway frames, device performance, accessibility.
G5: Isolation, auth, privacy, consent, worker immutable hash, rejection of
    untrusted capabilities and safe failure.
G6: Preserved saves, learning host evidence, alternate revisions, rollback.
G7: Child intent traceability and, separately, human observation for enjoyment.
G8: Metered production canary, cost and latency evidence, owner release approval.

A passing G0–G2 headless test does **not** satisfy G3–G8.
