# O3 — Executable, functional gameplay contract

**Scope:** Research-only implementation in draft PR #43, **not** a new game generator, browser player, production feature, or child data collection. It builds on O1 exact intent text and O2 minimal gameplay-form choice.

## The objective

Jems must deliver a game that actually **works**: player actions cause visible state changes, intended mechanisms and promised payoff occur, controls do not silently fail, and reset/replay retains the expected rules. This comes **before** visual polish or AI-generated claims about enjoyment.

O3 turns this into an **executable acceptance specification** for *authored reference games*, so later generation can be tested against an independently defined target. It cannot automatically infer the correct controls or gameplay from every child's words; authored expectations are explicitly identified as proposals.

## Delivered files

- `server/quality/functional-game-contract.ts`: bounded contract validator and factory. Takes a validated O1 intent contract, the matching O2 form decision and an **authored, source-traceable** list of expected requirements. A step is a press, hold, drag, tap or wait. At named checkpoints, assertions require actual rendered keyed commands, positions, physical world body/joint counts and host game outcome.
- `server/testing/working-game-fixtures.ts`: two intentionally small, hand-authored generated-module-v2 game sources: a sticker rocket and a robot grid puzzle. The car case reuses Jems' existing, previously authored `suspensionChallenge` fixture and real trusted Planck physics.
- `tests/working-game-contract.test.ts`: executes these authored game modules with the existing fixed-tick physics runtime, frame copier and outcome validator. Verifies response to actual pointer/keyboard input, step ordering, invalid actions, replay/reset determinism, rule-driven vs physics worlds, and detection of broken results.
- Mandatory unit workflow includes the above tests via `tests/unit.ts`.

No `src/`, gateway, production game, trusted runtime archive, private worker pin or persistent storage implementation is changed.

## Reference acceptance scenarios

### A. Sticker / gum rocket — direct 2D rules

Child idea: “Drag three bubble gum stickers onto a rocket, then press Launch to blast off.”

An incomplete rocket may not launch. A sticker dropped outside its target may not attach. Real pointer press → move → release on each target attaches a piece. After all three pieces, pressing Action starts the launch, the rocket's rendered Y position changes, and after a bounded elapsed time the outcome becomes *won*. Replaying a fresh instance produces the same initial state and interaction trace, without actual rigid-body objects.

### B. Robot route — 2D grid commands

Child idea: “Program a robot to follow arrows on a grid around a blocked square and reach the star.”

A move into a wall does nothing; arrow input moves only to permitted squares. Holding a direction does not silently advance multiple grid cells. Valid Right→Right→Down reaches the goal and changes the actual outcome to *won*. Replay resets consistently without any physics bodies.

### C. Car with suspension — real 2D physics

Child idea: “Drive a car with working suspension toward a star.”

Use existing `suspensionChallenge` to verify actual physical bodies and wheel joints exist, the car is rendered, driving produces a different physical trajectory from idle, and replay is deterministic for controlled input. This O3 regression covers an authored real-physics fixture, not proof that arbitrary generated hill-driving content is playable or that every goal is reachable.

## Negative controls and integrity

The contract validator refuses forged source quotes, changed source digests, missing requirement coverage, invented approval states, unsupported game-form decisions, unexpected fields, oversize action sequences, invalid controls/targets and excessive time budgets.

The executable tests intentionally introduce:
- Rocket that never sets its launched state.
- Robot with disabled movement handling.
- Nonphysical scripted source pretending to satisfy a physical suspension contract.

Each must fail at an observable checkpoint, not receive a false “passed” just because it compiles. An ungrounded or unclear gameplay requirement remains a proposal for review, never silently becomes a child-approved game design.

## Trust and proof boundaries

The source fixtures are **hand-authored and reviewed**. The Node VM harness is **not a security boundary** and must NEVER run model-generated, user-supplied or hostile code. The later O4/O5 tests must use the existing isolated worker and real browser preview for untrusted generated games.

O3 can legitimately establish **authored fixture logic, actual trusted game-state/physics stepping and test-contract validity**. It cannot yet claim:
- The real private generator consumes O1–O3 or produces faithfully working arbitrary games.
- Real touch devices, browser focus, child learning checkpoints, independent game save/Keep/Undo or provider credentials have been integrated through O3.
- Automatically repaired code has passed. That belongs to O6, which reuses the existing bounded repair coordinator.
- Child enjoyment or educational effectiveness has been measured.

The contract retains these exact three **pending gates**: real isolated browser preview, learning/revision integration, and objective repair/retest.

## Exit criteria

1. TypeScript production build, O1/O2/O3 unit/negative controls and full current browser/learning/creative CI pass at the exact reviewed source head.
2. Authored sticker, robot and physics trajectories are observed via the existing trusted runtime and validated bounded output commands (not a fake status field alone).
3. Broken-control, missing-payoff and fake-physics fixtures fail; replay/reset evidence is repeatable.
4. No production/paid-model/worker change or silent alteration of existing favorite games.

After this engineering gate, **O4** will connect the now-testable contract with the existing authenticated private generation and sandbox preview, rather than creating a new generator.
