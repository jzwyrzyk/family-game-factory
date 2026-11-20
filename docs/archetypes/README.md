# Jems Archetype Engine — Gold-Standard Design Charter v1
Status: architecture + first headless reuse experiment, **not production-enabled**.
Established 2026-11-18 from the Jems archetype research and child-led creation objectives.
Source merged from [PR48](https://github.com/jzwyrzyk/family-game-factory/pull/48) into public `main` as `34b5306786c89f94a8f1824b5ded9800a22504e3`. This remains an offline research foundation; it does not activate paid AI, add a production composition engine or change existing child game behavior.

## Product thesis and non-negotiable promise
A child should be able to imagine a game, receive a working version, experiment and return
to playing without waiting for custom code on every edit. The first version should reuse
tested building blocks whenever it can do so **without rewriting the child's idea**.

The gold-standard behavior is: **child intent -> right gameplay form -> compatible tested
archetype and mechanics -> faithful working preview -> play -> change -> compare/Keep**.
Novel rules that cannot be supplied faithfully by trusted components continue through
the existing paid, authenticated, tested and isolated generation path. A catalog match
is never proof that an implementation exists or that a child enjoys the result.

Priorities: (1) works correctly, (2) honors exact child mechanics and payoff, (3) is
understandable and delightful, (4) is fast and cheap. A broken but beautiful game fails.
Do not make every game a rigid-body simulation or infer physics from "rocket"/"car"/"robot".
Honor actual physical causality where it is required. A request for true 3D remains
unsupported by today's generated v2 runtime; 2D visual tricks are not true 3D.

## What was built in this first research change
- `src/archetypes/catalog.ts`: exactly **22** hypothesis archetypes and **77** mechanic
  records; each has a small description, likely controls/simulation and a maturity label.
  Most records are only catalogued and are **not** executable components.
- `src/archetypes/play-patterns.ts`: **88 authored design-only play patterns**, four
  distinct player-action/goal profiles for each engine family. This breadth
  is not equivalent to 88 executable, independently tested games.
- `src/archetypes/diversity.ts`: read-only, structural comparison of player
  actions, goals, challenge, pacing and gameplay rules. A reskin does not count
  as gameplay novelty; a child-requested reskin remains allowed.
- `src/archetypes/native.ts`: read-only bridge to six real curated games and their
  actual numeric/boolean manifest fields. Existing engines, save schemas and learning
  hosts remain authoritative; a similar genre does not make the game a template.
- `src/archetypes/assessment.ts`: structurally-validated, fail-closed candidate
  assessment. It is not a general natural-language classifier. It never deploys,
  edits a game, consumes money, or claims that a game is playable.
- `src/archetypes/prototype.ts`: small shared **headless logic** proof for collision
  pickup, growth, shield reflection and damage across three different scenes.
  There is no rendered/touch gameplay or general assembly engine in this prototype.
- `tests/archetype-diversity.test.ts`: prevent genre pigeonholing, reskin-as-new-game false positives, forced novelty and pattern collapse.
- `tests/archetypes.test.ts`: unit checks for catalog drift, exact native boundaries,
  unsupported 3D, unmet actions, and deterministic cross-game behavior.
- `.github/workflows/archetype-research.yml`: independent typecheck + tests without
  modifying the existing pipeline or the in-flight PR #43.

**NOT built here:** 22 functioning engines or 88 finished game variations, general sprite/layout generation, a
production-ready composed-game artifact, real child telemetry, a capability store,
cross-game build UI, paid model calls, trained models, a proved 80% coverage result
or a new trusted worker release.

## The 22 practical archetypes (not exclusive genres)
| # | Family | ID | Main player interaction | Simulation | Existing Jems example |
|--:|---|---|---|---|---|
| 1 | Action | platformer | Traverse/jump | Rules | Moon is adjacent, not a general platformer |
| 2 | Action | endless-runner | Run/dodge/collect | Rules | Moon Donut Dash |
| 3 | Action | side-driving | Drive over terrain | 2D physics | Junkyard Rally |
| 4 | Action | top-driving | Steer/race | Rules | None |
| 5 | Action | flight-dodge | Fly/dodge | Rules | None |
| 6 | Action | roaming-arcade | Explore/chase | Rules | None |
| 7 | Action | projectile-defense | Fire/deflect/defend | Rules | Dragon Island |
| 8 | Action | sports-ball | Aim/strike/bounce | Either | None |
| 9 | Action | tower-waves | Position defenses | Rules | None |
| 10 | Puzzle | grid-navigation | Move tile-by-tile | Rules | Robot Route Lab |
| 11 | Puzzle | hidden-grid | Reveal hidden tiles | Rules | None |
| 12 | Puzzle | matching-sorting | Match/drag/merge | Rules | None |
| 13 | Puzzle | route-programming | Create instructions | Rules | Robot Route Lab |
| 14 | Puzzle | turn-strategy | Take turns | Rules | None |
| 15 | Puzzle | words-trivia | Answer and progress | Rules | None |
| 16 | Construction | drag-creation | Stick/decorate/launch | Rules | Bubble Gum stickers |
| 17 | Construction | physical-construction | Attach/test/repair | 2D physics | Bubble Gum physics v1 |
| 18 | Construction | physics-puzzle | Adjust forces | 2D physics | None as generic |
| 19 | Action | rhythm-reaction | Act at the right time | Rules | None |
| 20 | Story | choice-discovery | Choose/reveal | Rules | Splash or Pass |
| 21 | Story | interactive-adventure | Explore/choose | Rules | None |
| 22 | Story | nurture-management | Care/manage/upgrade | Rules | None |

A game can blend two or more families. Classification should be multi-label where
needed; one primary archetype is a starting point, not a constraint on creativity.

## Four different things often mislabeled "a library"
1. **Archetype:** broad interaction and loop (e.g. a side-scrolling driver).
2. **Mechanic:** reusable player-visible rule (e.g. projectile reflection).
3. **Engine service:** rendering/input/clock/physics/learning/persistence/safe preview.
4. **Asset/theme:** characters, style, terrain, animations, sound, narrative.

A name in the mechanic catalog is neither implementation nor compatibility proof.
Every portable component must have verified interfaces, ownership and trust boundaries,
resource budgets, observable events, a schema, independently tested behavior and
multiple composition tests before production registration.

## Explicit implementation maturity
- `catalogued`: concept only; cannot be assembled.
- `native-only`: witnessed in a particular existing game, but not extracted or
  independently tested to compose elsewhere.
- `shared-prototype`: logic-only reusable code demonstrated with authored scenes;
  **not playable, browser/worker verified or production-approved**.
- Future states, not yet implemented: `shared-tested`, `integrated-sandbox`,
  `pilot-verified`, `production-approved`. Promotions must be accompanied by
  actual executable evidence, not changes to a string label.

## Design-first illustrated examples
### Example A — Dinosaur egg hill driver
Child: "A monster truck goes over hills and picks up dinosaur eggs."
- Primary form: `side-driving`, 2D physical driving if terrain/collision matters.
- Reuse: wheel suspension, throttle/brake, grip, terrain, collision, collectible,
  counter, finish/celebration.
- Original authorship: dinosaur eggs, monster truck design, goals and requested effects.
- Technical reality: the current `hill` game cannot automatically accept a generic
  collectible module. A new level/composition bridge and end-to-end playtest are needed.
- Verdict today: **generation or future verified assembly required**, not "instant".

### Example B — Growing moon cat
Child: "A cat jumps around eating donuts and grows bigger."
- Primary: `endless-runner` / `platformer`, rule-driven 2D with animation.
- Components: platform movement, jump, collectible, grow-on-collect, level complete.
- Payoff: visible change in the character's size; merely increasing a counter fails.
- Prototype: headless collection and growth works; real browser game assembly does not.

### Example C — Deflect the dragon fireball
Child: "Make the fireball bounce off my shield and hit the dragon."
- Primary: `projectile-defense`; behaviors are `reflect-projectile`,
  `shield-window`, `health-damage`, goal and victory feedback.
- The *mechanic change* matters. Replacing a bow with reflected fire is not a
  "projectile speed" parameter and must not be misrepresented as one.
- Prototype: the same reflection collision behavior operates in a dragon and a
  space-flight scene with different actors and a shared rule implementation.
- Reality: these are headless tests. Visual collision, timing, mobile touch, replay,
  independently verified completion and safe composition remain future work.

## What "80% coverage" will mean
**Unproven research target**, not a product claim. Count an idea as fulfilled only if
its essential player action, triggered state change, objective and requested payoff
have been demonstrated in a playable game, not simply mapped to an archetype.
Always count unsupported, ambiguous and novel requests in the denominator.
Report separately: taxonomy coverage, mechanic composition coverage,
intent-fidelity coverage, reliable playable completion, and end-to-end latency.

## Project dependency order
1. Finish the ongoing PR #43 game-form/child-intent work and stabilize prod.
2. Preserve current six native games, sandbox runtime, adaptive learning, voice,
   revisions, device trust and paid-worker approvals. Do not fork those systems.
3. Establish a versioned typed registry; extract a handful of reusable mechanics
   with actual rendering/input and independent compatibility tests.
4. Prove two cross-archetype compositions where *the same* behavior module runs
   without game-specific code rewrites.
5. Add recipe compilation into the existing private preview/revision pipeline
   under a separate feature flag. No public sharing, no sandbox bypass.
6. Evaluate first-game coverage and holdout fidelity before investing in the
   remaining dozens of components. Use measured demand, not a guessed Pareto curve.

## Related implementation guidance
See [CREATIVE_DIVERSITY.md](CREATIVE_DIVERSITY.md) for creative differentiation,
reskin/repeated-loop guardrails and three-level gameplay testing;
[INTEGRATION.md](INTEGRATION.md) for component interfaces, current-to-future
routes, saved revisions, security and learning boundaries; [EVALUATION.md](EVALUATION.md)
for acceptance and 80/20 protocol, and [ROADMAP.md](ROADMAP.md) for implementation
waves and defensible sequencing.

### External engineering precedents (not claims about Jems)
- [GDevelop: custom behaviors](https://gdevelop.io/page/custom-behaviors) and
  [extension repositories](https://github.com/GDevelopApp/GDevelop-extensions):
  reusable behavior rather than copying game-specific code.
- [Construct 3 behaviors](https://www.construct.net/en/make-games/manuals/construct-3/project-primitives/objects/behaviors),
  [families](https://www.construct.net/en/make-games/manuals/construct-3/project-primitives/objects/families)
  and [shared event sheets](https://www.construct.net/en/make-games/manuals/construct-3/project-primitives/events/event-sheets).
- [General Video Game AI / VGDL](https://gaigresearch.github.io/gvgaibook/PDF/chapters/ch02.pdf):
  separate sprites, interactions, termination and level mappings.
These precedents validate modular composition as an engineering pattern, **not**
the number of Jems archetypes needed or an 80% child-intent completion rate.
