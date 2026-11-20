# O2 — Minimum-adequate gameplay architecture

**Status:** Research implementation on draft PR #43. Not a production form router. **Updated priority: a game MUST WORK before visual polish or delight.**

## Why

Bubble Gum Builders was over-engineered with a physics simulation for what should have been an accessible sticker-assembly game and launch animation. A robot-route puzzle is about actions and responses, not real 3D. A hill-driving car with working suspension *does* benefit from 2D physics. We must choose the least complicated method that actually delivers the child's instructions.

## Scope: game form only

The new source is server/quality/game-form.ts, using the validated O1 Child Intent Contract as input. It returns a versioned **proposed-not-child-confirmed** decision with:

- Source SHA and original project/revision provenance.
- Candidate presentation: supported 2D canvas, or true 3D requirement (unsupported by current generated runtime).
- Simulation: rule-driven, real physics-2D, or unresolved.
- Primary and additional input patterns: drag, grid commands, driving, arcade, tapping.
- Disposition: candidate, review-required, or unsupported, including precise blockers and reasons.
- Verbatim source quotes with UTF-16 offsets and overlapping O1 fact IDs.
- Explicit **pending functional checks**, not fictional pass results.

No provider call, telemetry, workspace mutation, approval or runtime activation is performed.

## Cases required to behave correctly

| Request | Decision |
| --- | --- |
| Drag gum stickers onto socks, press launch | 2D scripted placement + launch; no physics |
| Robot commands on a grid | 2D discrete grid logic |
| Cat eats donuts, grows and explodes into stars | 2D arcade rules and transformations |
| Drive over bumpy hills with working suspension | Real 2D physical simulation |
| Tower collapses from its weight | Real 2D physical simulation |
| Robot has 3D-looking art but only 2D buttons | 2D presentation with styled depth |
| True 3D space flight in all axes | Unsupported true-3D requirement; never fake 2D fulfillment |
| No physics but simulate gravity | Conflict, review required; no automatic engine |
| Springy robot with unspecified physical behavior | Ambiguous, review required |
| Saved physical car: make it faster | Preserve verified physical engine; no downgrade |
| Saved physical car: remove physics | Review explicit form migration, preserve original |
| Saved scripted game: add working physics | Review explicit form migration, preserve original |
| Saved revision only identified by opaque ID | Review: cannot infer mechanics without authorized lookup |

Negated terms are removed from positive physics evidence only when they actually overlap. Different positive and negative physical requirements remain a conflict. Too much evidence fails closed instead of silently truncating an important constraint.

## Workability takes priority over delightful first-play

O2 outputs **pending** requirements that downstream implementation MUST check independently:

1. Player input actually changes the visible game state as requested.
2. The essential mechanics and payoff actually occur; no fake win or decorative-only trick.
3. Failure/retry/reset/replay do not freeze, corrupt, or discard the working game.
4. Touch, keyboard, small devices, focus and pause work.
5. Required math/English learning remains functional after pausing/resuming.
6. Saved versions, Keep/Undo and historical formats remain correct.
7. Isolated preview, resource limits and credential boundaries hold.

These checks have NOT been run on novel generated games by O2. O3 defines their testable behavioral contract; O4 safely connects generation; O5 independently exercises the actual rendered game; O6 verifies repairs; O7 validates integrated journeys. Visual enrichment and observed fun remain later concerns.

## Security, ownership and limitations

O1 is revalidated and source evidence is exact. The optional base-game form is **server-verified read-only context**; O2 checks the revision ID matches but is not itself an authorization boundary. Without a trusted base lookup, no saved engine migration can occur. Source quotes do not prove the semantic label is right. The lexical selector can misunderstand unusual language; unresolved is a deliberate outcome, not a failure to please the child.

**Important:** Existing private generation code still uses preliminary O0 advice. O2 is not silently wired into the generator or cloud worker. O4 must review that integration, protect paid/sandbox/learning boundaries, and run actual provider tests. The private worker still pins an audited old public source SHA; merging PR #43 alone would not activate it.

## Objective 2 completion gate

Mandatory source build, O1/O2 unit checks, browser/learning/creative regression and visual checks on the exact reviewed source. All unresolved/unsupported architecture choices remain explicitly so. No claim of playability, repair success, or deployment until O3–O9.
