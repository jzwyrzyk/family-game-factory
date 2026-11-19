# jems decision records

These records explain durable choices without turning chat history into another backlog. They are a compact index of decisions; [product doctrine](../../PRODUCT-DOCTRINE.md) describes intent, [architecture](../../ARCHITECTURE-CURRENT.md) describes the system and [delivery state](../../DELIVERY-STATE.md) records implementation and operational evidence.

## Index

| Record | Decision | Status | Source |
| --- | --- | --- | --- |
| [0001](0001-child-led-creation.md) | Child-led creation and explicit version promotion | Accepted, retrospectively documented | Owner-approved coaching standard |
| [0002](0002-intent-faithful-game-forms.md) | Choose intent-faithful game forms using independent axes | Accepted, retrospectively documented | Game Intelligence standards and Bubble Gum decision |
| [0003](0003-explicit-voice-and-build.md) | Editable dictation, explicit Send and separate Build | Accepted, retrospectively documented | November 18, 2026 push-to-talk decision |
| [0004](0004-separated-private-execution.md) | Separate private generation, untrusted play execution and coaching | Accepted, retrospectively documented | Generation-isolation contracts and PR36's scoped coach exception |
| [0005](0005-temporary-adult-profile.md) | Activate temporary development AI through an authenticated adult profile on the existing site | Accepted for temporary development | Owner's November 18, 2026 same-site/profile-switch direction; PR55 integration |
| [0006](0006-style-diverse-playable-quality.md) | Require presentation and playable quality across distinct art styles | Accepted | Owner's Gem Factory follow-up: improve the real pipeline without uniform-looking games; child art uploads deferred |
| [0007](0007-creation-and-rebuild-practice.md) | Share editable scenes and actions between free creation and behavior-based rebuild practice | Accepted for development | Owner's November 19, 2026 request to implement a separate integrated page in a new PR |

**Accepted describes the choice, not a deployment, feature completion or universal validation.** The first records summarize decisions already present in the repository. They do not invent a new approval. Dates distinguish when a record was written from when a decision was made.

## When to record a decision

Add a short record for a material change to product intent, trust boundaries, architecture, persistence, contracts, learning evidence, game/runtime selection or an important operating method. Routine refactors and bug fixes can simply reference the applicable record. Link a new record from this index and the affected canonical document in the same PR.

Use **Proposed**, **Accepted** or **Superseded by ADR NNNN**. Accept only with an identified decision source or existing documented authority. When replacing a choice, preserve the old rationale, mark it superseded and link both directions. Do not silently overwrite history. A later explicit owner decision can supersede an older review restriction; record its scope rather than asking for the same authorization again.

## Minimal template

```markdown
# NNNN — Short decision title

**Status:** Proposed / Accepted / Superseded by ADR NNNN
**Recorded:** YYYY-MM-DD (timezone)
**Decision source/date:** Link to the actual decision; say unknown if not established

## Context
What problem or constraint made the decision necessary?

## Decision
What was chosen, for what scope, and what remains uncertain?

## Consequences and limits
What does this protect or cost? Which alternatives were explicitly rejected?
Do not invent alternatives, approval or deployed behavior.

## Evidence and related documents
Link the decision source, relevant contracts and acceptance evidence.
Link DELIVERY-STATE.md for implementation and operational status.
```

Never copy private child content, credentials or restricted evidence into this public repository. Link an access-controlled evidence location with a safe description when needed.
