# Creative Differentiation Standard — Jems Archetype Engine
**Status:** design/CI research standard, not an active production gameplay gate.
**Scope:** 22 reusable engine *families*, 88 curated **design-only** play patterns,
77 mechanic concepts, four portable **headless prototypes**. None of this
asserts 88 playable games or measured child enjoyment.

## The failure we must prevent
A template system can create a purple cat, a green dragon and a blue spaceship
with different screenshots but **exactly the same avoid-and-collect loop**.
A large number of themes, sprites, scenes or descriptions does not guarantee
a large number of *gameplay* experiences. Adding hundreds of new top-level
genre names can hide this problem while making code maintenance worse.

The product contract:
- Reuse the **engine**, not necessarily the **play loop**.
- Preserve the child's essential actions, causal rules, objective and payoff.
- Never insert random mechanics merely to game a diversity score.
- A child asking for a reskin or a small adjustment should receive precisely
  that, even if mechanically similar to the previous game.
- A child asking for a materially new game should not receive the same play
  loop with new art and a misleading "new" label.
- An unfamiliar or radically different action must trigger a truthful
  novel-generation or review path, not be squeezed into the nearest archetype.
- More diversity is not a substitute for working touch input, progress,
  reset, safety, or preserving the child's original idea.

## Structure: 22 x 4 is a starting taxonomy, not a creativity ceiling
- **Archetype family**: a stable engine form such as side-scrolling driving.
- **Play pattern**: a distinct objective and player-action arrangement. For
  driving: rock crawling, egg delivery, timed sprint, and balancing stunts
  reuse common wheels and terrain but seek different goals/actions/payoffs.
- **Mechanic composition**: reflect a projectile, deliver an object, bounce,
  grow, merge, build, program, explore; each requires a real verified module.
- **World/characters/art/narrative**: the child's authored creative identity;
  should be respected, but not counted as mechanical novelty on its own.
- **Emergent dynamics**: what the player must *actually do* once the modules
  interact. This cannot be certified from the design catalog.
- **New inventions**: custom mechanics or modes outside the library; continue
  using existing secure generation/test/repair rather than restricting choice.

The initial catalog contains four **explicitly authored** candidate patterns
per family (88 in total), not auto-generated theme variations. Do not claim
the four patterns are equally likely or have been tested with real children.

## Multi-axis experience fingerprint (not a fun predictor)
`src/archetypes/diversity.ts` compares **proposed** designs across:
1. **Player verb:** steer, reflect, assemble, collect, solve, choose, care, etc.
2. **Control mode:** keyboard, tap, drag, grid, timed, steer, choice.
3. **Source of challenge:** terrain, hazard, enemy, logic, precision, time, etc.
4. **Goal:** deliver, survive, solve, create, score, defeat, grow, etc.
5. **Pacing:** continuous, staged, self-paced, turn-based or timed.
6. **Required gameplay mechanics:** exclude presentation-only effects from
   the novelty calculation.
7. **Observable payoff:** retained in the signature for future fidelity testing
   but differing payoff *text* does not prove different implemented gameplay.

For early **advisory only**, two changed core dimensions yields a candidate
distinct loop; one yields a small variation; none yields a cosmetic or pacing
variation. These counts are engineering heuristics and must be calibrated
against actual observed play, not used as arbitrary production thresholds.

`reviewDiversity(previous,next,relationship)` keeps explicit edit intent:
- `different-game`: if only cosmetic or one gameplay dimension differs,
  surface a **similarity-risk** review, never silently rewrite the child's idea.
- `reskin` or `similar-edit`: intentionally reusing the play loop is welcome;
  never block it for lack of novelty.
- `unspecified`: do not infer a desire for a different game from theme alone.
Every returned result is marked `proposedOnly=true`, with independent browser
and child-observation steps still mandatory.

## Adversarial test matrix that must pass
| Scenario | What automation must verify | What it cannot claim |
|---|---|---|
| Dinosaur car vs unicorn car, identical play | Cosmetic only, even if theme and payoff copy differ | Children will dislike both |
| Hill crawl vs egg-delivery driver | At least two structural requirements differ on paper | Both games are playable |
| Same level at higher speed and louder sound | Not a brand-new game loop | Faster mode is not fun |
| Bow shot -> dragon shield reflection | Changed action/mechanic/goal, not a number-only parameter | Reflection works in the real browser |
| Child explicitly asks to recolor same game | Similarity warning disabled for that intentional edit | Child confirmed they liked it |
| Same collect/dodge game labelled "flight" | Archetype label alone doesn't count as novel play | The flight engine is identical |
| Strange rule absent from the library | Preserve novel request, route to secure generation/review | Template coverage somehow expanded |
| New game compiles but requested change doesn't occur | **Future** browser causal test must fail | Static fingerprint is enough |
| Desktop works, tablet controls broken | **Future** device regression must fail | Responsive CSS means working play |
| "True 3D" constrained into flat 2D | Existing form/intent guards must reject or honestly flag | Faux-depth art is 3D |

## Three levels of testing
### Level A — Static design tests (implemented in PR #48)
- All 22 archetypes retain four differently authored play patterns; no
  duplicate signatures, no missing mechanic IDs, no accidental production
  readiness status.
- Pairwise comparisons distinguish true mechanic/goal/verb changes from
  reskins, timings, celebratory animations and archetype labels.
- A small edit is never obstructed by a general "more novelty" policy.
- Source of truth remains the PR #43 original-child-intent contract, which
  is *not* yet imported in this research branch.

### Level B — Real gameplay diversity tests (required before enabling assembly)
- On the **actual sandboxed browser build**, drive a stable scripted user
  input through an independent playtest and retain observed state changes:
  action -> effect -> payoff, plus win/fail/retry and expected differences.
- Cross-archetype same-implementation evidence: different scenes reuse the
  *same trusted module digest*, but different input/goals result in materially
  different game-state transitions.
- Use both matched-theme/different-mechanics and changed-theme/same-mechanics
  pairs. The first pair must produce different causal traces; the second
  cannot be labeled an intrinsically new mechanic.
- Real device matrix: desktop mouse/keyboard, Android tablet/touch and iPad/
  Safari as available; game events, focus, scaling, pause and math/language
  callbacks survive.
- Include child intent and negative constraints. A novel rule that is
  unimplemented or silently removed is a functional and fidelity failure,
  regardless of novelty score.
- Compare artifact package sizes, startup and p95 interaction-to-payoff.
  Never improve visual novelty at the cost of crashes or serious slowdown.

### Level C — Consented child experience (required for delight claims)
Blind paired playtest: same-looking games with different mechanics, versus
different-looking games with identical mechanics. Rotate order; let children
play and explain in their own words what they did, what changed, and whether
the games felt like different experiences. Include first-play comprehension,
repeated sessions, fairness, delight, fatigue and age/device differences.
Children may like similar games; **similarity itself is not an automatic
failure**, and the child controls whether to Keep. Do not treat engagement
duration alone as a fun measure. Use parent consent and school-specific review
before any live child data collection.

## Preregistered diversity metrics (future, not measured)
- **Exact-duplicate causal trace rate**, grouped by intended gameplay family.
- **Meaningful gameplay differentiation rate:** child-perceived differences
  anchored to observed input, state changes, goals and outcomes.
- **Unrequested-change rate:** how often an algorithm inserted mechanics not
  asked for to make a game "more different" (target zero).
- **Unsupported novel-action omission rate** and explicit honest-fallback rate.
- **Cross-game code reuse:** same implementation SHA, compatible scenes and
  separately verified events; count no copy-and-paste clones as shared modules.
- **Coverage by gameplay pattern**, not only top-level archetype counts.
- **p50/p90/p95 time-to-play and time-to-payoff**, errors and repair rate.
- **Perceived repetition** via blind human comparisons and qualitative notes.
- **Quality split:** workability, source fidelity, diversity, presentation,
  accessibility, learning and child delight are separate axes. No composite
  "fun" score is asserted by a model or static rule.

The study must include all novel/uncovered ideas, not just successful
templates. Measure repeated versions separately from independently requested
new games; otherwise the repetition rate will be biased.

## Existing Jems integration when downstream components are real
1. PR #43 extracts child actions and appropriate 2D rules/physics. Preserve
   source spans and explicit positive/negative constraints.
2. A future assembly planner selects potential archetype, play pattern and
   compatible module versions; does not force the child into one family.
3. `reviewDiversity` compares *design proposals only* with a relevant,
   authorized prior version when the requested relationship is explicit.
   Never retrieve or compare other children's work.
4. A future independent sandbox playtest validates actions, consequences and
   payoffs. If failing, repair/re-generate safely via the existing worker.
5. Revision preview and Keep/Undo/Fork remain controlled by the child; local
   builds do not bypass family auth, private scope, learning or budget guards.
6. The release QA evaluates repetition only after workability and fidelity.
   It reports risk to the human reviewer; no uncalibrated model may override
   a child's requested design.
7. A growing library may acquire additional patterns and new engine families
   based on measured **novel coverage gaps**, not arbitrary category counts.

## Engineering precedents / cautions
- [MDA: Mechanics, Dynamics, Aesthetics](https://www.cs.northwestern.edu/~hunicke/pubs/MDA.pdf)
  explains why rules, actual play and player experience must be evaluated
  separately.
- [Expanding Expressive Range — Summerville, AIIDE 2018](https://ojs.aaai.org/index.php/AIIDE/article/view/13012)
  advocates measuring generator output distributions rather than cherry-picking
  striking examples.
- [GDevelop reusable custom behaviors](https://wiki.gdevelop.io/gdevelop5/behaviors/events-based-behaviors/)
  show how reusable code can be independent of a single game scene.
- [Game design ontology review](https://www.mdpi.com/2078-2489/12/10/395)
  warns that over-rigid taxonomies can impede creative choices; structure
  should serve implementation rather than dictate the player's ideas.
