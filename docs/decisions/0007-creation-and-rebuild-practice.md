# 0007 — One creation experience with free scenes and rebuild practice

**Status:** Accepted for development; implementation, merge, deployment, and child acceptance remain separate.

**Recorded:** November 19, 2026 (America/New_York development session).

**Decision source:** The owner's explicit direction in the November 18–19 development conversation. The owner first asked to reason through child-facing computational/critical-thinking practice, then developed the idea of reusing a child's Dragon/Buckets game characters in animated sequences and editable actions, and authorized development of free scene creation plus demonstrated scenes to rebuild. The original instruction is in the development conversation, not a public issue. This supersedes earlier narrower discussion that deferred a block editor; it does not authorize unrelated deployment or provider activation.

## Context

Jems already has child-led game ideas, coaching, generated/curated play, owned revisions, original artwork provenance, and host-owned Math/Language practice. Conversation and successful AI-generated game code alone do not demonstrate what a child can independently specify, predict, test, or debug. A new practice tool should give children meaningful actions and feedback while remaining part of their creation experience.

The owner proposed a continuous path: use the same characters and ideas in a game, arrange their actions in a scene, and gain more control through visual blocks and rules. Creating another isolated programming product would weaken that continuity. Automatically treating existing arbitrary generated JavaScript as a reversible block program would make a promise that the implemented architecture cannot keep.

## Decision

1. **Add an integrated Creation Studio entrance with two modes.** Free creation and rebuilding a demonstrated scene use the same model, action editor, stage, and interpreter. A child can copy a completed practice scene into an unconstrained creation.
2. **Use a versioned data language as the initial common foundation.** Characters reference reviewed assets; programs contain bounded actions, triggers, conditions, and variables. The trusted interpreter executes that data. No arbitrary source or URL is executed by the editor.
3. **Preserve source games and assets.** A supported saved game creates a new editable scene with exact source references. Existing Dragon artwork and reviewed representations of Buckets/Robot characters preserve continuity. The adapter states what it carries over and does not imply complete engine conversion or silent writeback.
4. **Let children control real behavior.** Sequence, move, jump, talk, show/hide, repeat, branch, update a variable, and respond to taps/signals. A visible action must have an actual program effect. New mechanics may extend the model deliberately; the initial vocabulary is not a permanent limit on creative ideas.
5. **Check demonstrated behavior with disclosed finite probes.** Rebuild practice evaluates trajectories, event response, timing/order, and selected variable cases. Equivalent programs can pass. Targets and hints are public practice content, separate from any protected assessment bank.
6. **Keep evidence specific.** Computational thinking and active problem solving remain distinct intended capabilities. A task outcome, hint flag, event trace, or AI-authored block is not a validated thinking score or evidence of independent mastery. No global aptitude score or educational-growth claim is introduced.
7. **Retain explicit ownership and learning boundaries.** Autosave recovers work; Keep selects a version. Scene edits do not spend a generation budget. Math/Language settings and checkpoints stay with the trusted host. Profile ownership, adult isolation, source revisions, private worker credentials, and sandboxed generated-game previews retain their existing controls.

The [feature contract](../creation-studio/README.md) defines the exact first-version model, interpreter, assets, challenge inputs, storage, and acceptance requirements.

## Alternatives considered

### Background observation only

Observation during game creation remains useful context, especially for identifying a child's stated intention, experiment, or design decision. It does not consistently expose sequencing, conditions, event reasoning, or debugging, and AI may perform those operations. The accepted direction therefore adds intentional child-facing actions and practice while keeping background evidence qualified.

### A complete Scratch clone immediately

A full creative-coding platform is a possible future product direction. It would require more than a block surface: a program/runtime model, assets, editing tools, persistence, accessibility, and execution semantics. The owner-facing goal is continuity and meaningful control. The first implementation delivers that through Jems scenes and actions without claiming Scratch compatibility or recreating its entire product.

### A disconnected route puzzle

A route puzzle can teach a useful concept, but a separate narrow game alone does not meet the expanded request. The accepted rebuild activities run inside the same creation system, with the same actions and reusable characters that free creation exposes.

### Automatic two-way conversion of every existing game

The current generated-game path accepts arbitrary source within a constrained runtime contract. That source is not already a universal scene graph. Lossless conversion and round-trip synchronization are not assumed. Supported source adapters and explicitly validated companion manifests establish honest first bridges; future generators can emit richer editable structures from the start.

## Consequences

The project language, its version, and its provenance become a compatibility boundary. Editors, previews, challenges, and any future generator manifest must agree on what a block means and which source revision it represents. Unknown fields and unsupported actions fail explicitly rather than being silently discarded.

The first runtime deliberately bounds nesting, actions, messages, and time. Characters run concurrently, with one active handler per character; retriggering replaces that character's current handler. The UI must make its timing and interruption visible enough for children to reason about. A runtime limit or technical fault is not the child's reasoning failure.

Generated companion manifests are optional data until verified and accepted through the normal revision path. Their presence does not establish source-game parity, live generation readiness, or authority to run generated code on the host origin. Existing game creation remains available when an idea exceeds the scene language.

Practice evaluation accepts behavioral alternatives but only tests its published cases and observation windows. Independent learning measurement would require a separate task design, administration model, assistance controls, and validity evidence; it is not created by adding a challenge checker.

## Reconsideration triggers

Revisit the editor/runtime choice when children need reusable procedures, richer interactions, new asset types, multitrack animation, or compatibility with an established programming format. Revisit the source adapter when the generator emits a trustworthy canonical scene/behavior representation that can survive edits from both conversation and blocks. Revisit instructional progression and scoring only with relevant educator, usability, and learning evidence.

These are reasons to extend the design, not automatic approval of a new provider, public sharing, production release, or assessment claim.

## Related contracts

- [Creation Studio feature contract](../creation-studio/README.md).
- [Child-led creation and explicit Keep](0001-child-led-creation.md).
- [Intent-faithful game forms](0002-intent-faithful-game-forms.md).
- [Explicit voice, Send, and Build](0003-explicit-voice-and-build.md).
- [Separated private execution](0004-separated-private-execution.md).
- [Child-owned design coaching](../design-coach/GOLD_STANDARD.md).
- [Current architecture](../../ARCHITECTURE-CURRENT.md) and [delivery evidence](../../DELIVERY-STATE.md).
