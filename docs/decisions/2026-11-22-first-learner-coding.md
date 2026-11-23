# First-learner coding with a larger stage and fewer controls

**Status:** Accepted for implementation; candidate verification and release are separate.
**Recorded:** November 22, 2026 (America/New_York).
**Decision source:** The owner's November 22 request to comprehensively overhaul the coding-learning UI: the scene was too small, the right-side controls were too editable for first learners, the visual finish did not match the updated Jems experience, and white backgrounds around the Pals looked poor in the scene. Preserve computational learning while simplifying the interface.

## Context

Creation Studio already has a bounded scene interpreter, editable ordered actions, recoverable revisions and behavior-based practice. Its dense palette, permanently expanded block parameters and character inspector compete with the scene. Many local CSS rules also reduce child-facing labels below the established readable-type target. The approved Pal portraits include light paper backgrounds that the scene renderer currently paints as rectangles.

The implementation is stacked on [PR125](https://github.com/jzwyrzyk/family-game-factory/pull/125), source `1340d041145ffba4322ccb8262188b7cf2c7b6c4`, to preserve its shared reading, profile and fitted-play work. This records a development dependency, not a merge or deployment.

## Decision

Make **First steps** the ordinary coding view. The stage leads, with a compact action dock below it, readable ordered blocks and an execution highlight. Keep My Games, My scenes, Play/Pause/Reset, Try tap, Undo, Keep and Full screen discoverable within the fitted workspace. Use the existing Jems brand, large type and comfortable touch targets.

The initial palette is Move, Jump, Say, Dance, Wait and Repeat. The condition exercise also exposes If. Only the selected block expands its controls. Direction plus numeric Steps expresses relative movement without requiring x/y coordinates. Friendly jump and time choices preserve an existing custom value until the child deliberately changes it. **More tools** and scene settings expose exact coordinates/timing, variables, extra scripts and signals. The full language stays available; view changes do not rewrite the saved scene schema, remove unsupported-looking blocks or round custom values.

**On Play** and **On tap** select the matching program or create an empty one for that event. They must not convert a different program or silently delete its actions. Children still choose an ordered program, observe its behavior, change it and test again. Repeat remains an actual nested group. The interface must support the exact distances and timing needed by the existing exercises.

Practice leads with one brief, Watch and Check. Longer requirements and the recorded hint sit in Help. Checking keeps its result adjacent to the stage and moves focus without scrolling the page away. It preserves the existing evaluator, equivalent-working-program acceptance, saved checked revision and hint provenance. Readable DOM speech and counter output supplement small canvas text; optional narration retains PR125's explicit, stoppable reading behavior.

For scene Pals, prepare a bounded, cached render surface when the approved image loads. Make border-connected cream paper transparent while retaining original RGB values and immutable approved source references. This is scene-renderer compositing: it adds no generated artwork, replacement source files or global collection redesign. The character's white details, highlights and pale gem anatomy must remain intact. Inspect every supported Base/Grown image against contrasting scene backgrounds before claiming roster-wide quality.

## Consequences and limits

The beginner view reduces simultaneous decisions while retaining actual sequencing, repetition, event response and debugging. The fuller editor remains an explicit choice. The owner requested a usability overhaul, not removal of existing creations or a new compulsory progression ladder.

Scene ownership, source-game and private-art pins, explicit Keep, undo/redo, immutable versions, recovery drafts, required learning checkpoints and bounded execution remain authoritative. Presentation modes do not supply new learning credit or a general computational-thinking score. The image cache is limited to the active scene and cleared on lifecycle changes; original approved assets remain the source of truth.

Acceptance requires real authored interaction and composed captures on desktop, tablet, narrow phone and short landscape, including Help, feedback, custom saved programs, learning overlays and background changes. Compilation and unit checks alone do not establish that the new screen is usable or that every Pal edge is clean. Physical-device behavior, child comprehension and educational efficacy remain distinct evidence.

Reconsider the control grouping if observed use shows that a necessary action is difficult to discover, or that an existing custom scene cannot be inspected or edited faithfully. Preserve the scene and its exact values while resolving that presentation problem.

## Related references

- [Creation Studio contract](../creation-studio/README.md) and [candidate acceptance](../creation-studio/ACCEPTANCE.md).
- [Child interface: clear at six](../brand/CHILD_INTERFACE.md) and [shared read-aloud](../speech/READ_ALOUD.md).
- [Original continuous-creation decision](0007-creation-and-rebuild-practice.md) and [approved Pal collection](2026-11-21-approved-pal-collection.md).
- [Delivery state](../../DELIVERY-STATE.md) records actual source, check, merge and release evidence.
