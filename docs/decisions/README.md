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
| [0008](0008-cosmetic-making-journey.md) | Four illustrated making levels with cosmetic character choice | Accepted visual/product scope; initial threshold documented as implementation policy | Owner-directed refinement tracked in PR57 |
| [0009](0009-approved-brand-library-v1-2.md) | Approved visual library with original selected-maker rank portraits | Accepted visual scope; integration and release separate | Owner-approved v1.2 and PR57 merge-readiness request |
| [0010](0010-lifetime-gems-and-shared-rewards.md) | Shared lifetime engagement gems with durable receipts, independent maker ranks and recoverable local persistence | Accepted for development; initial award schedule is implementation policy | Owner's November 19 reward-system implementation direction; companions deferred |
| [Parent evidence reporting](2026-11-19-parent-evidence-reporting.md) | Give parents inspectable observations, separate learning areas and useful next steps | Accepted; implementation merged in PR65 | Owner's November 19, 2026 request for benchmarked holistic parent dashboards |
| [0011](0011-formative-problem-solving-evidence.md) | Combine background activity context with optional structured reasoning observations, preserving assistance and missingness | Accepted for development | Owner's November 19, 2026 post-PR62 review and authorization to correct research assumptions and begin holistic implementation |
| [Gem Pal base designs](2026-11-19-pal-base-design-adoption.md) | Adopt six approved base designs into the 22-design selected roster while growth remains paused | Accepted for base artwork; runtime binding deferred | Owner's November 19, 2026 approval of S–X and explicit growth hold |

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
