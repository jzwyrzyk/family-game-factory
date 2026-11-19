# 0001 — Child-led creation and explicit version promotion

**Status:** Accepted existing product decision, recorded retrospectively.
**Recorded:** November 18, 2026 (America/New_York).
**Decision source/date:** [Owner-approved coaching standard](../design-coach/GOLD_STANDARD.md); its original approval date is not stated in that file. Source reviewed at application `493eb9ce2a98de5f3be8f6d17e63dfe2f6a7e3a7`.

## Context

Removing implementation friction can accidentally remove the child's creative work. A model can also erase an interesting idea by substituting a familiar mechanic, decide that an experiment is better from telemetry, or overwrite a playable version while a replacement is unfinished.

## Decision

The child owns the intention, alternatives and choice of main edition. The coach provides useful questions, explanations and ideas when needed; the builder implements the agreed change; the runtime records observable events and preserves versions. Clear requests do not require a compulsory interview, and optional reflection must not block play.

Support tuning, interaction redesign and a rethink of the objective. Retain the provenance of child ideas and AI suggestions. Keep experiments independently recoverable. Starting a new alternative uses the selected main unless the child explicitly continues a test. Promotion to a main edition and copying into a different project are explicit choices. Autosave and background build completion cannot make those choices.

## Consequences and limits

- Failed or cancelled builds leave the last working game intact; stale responses cannot override later decisions.
- A supported local edit must have a real gameplay effect. A mock helper cannot claim an unimplemented novel mechanic.
- The source standard rejects both AI taking over the design and compulsory educational questioning that prevents play. Withholding requested help is not preservation of authorship.
- Scores, retries and observed events may inform a conversation; they cannot choose the child's favorite or establish enjoyment, intelligence or learning benefit.
- Tests of persistence, ownership and state transitions are necessary engineering evidence. Child ownership, comprehension and enjoyment also require appropriate human observation.

## Evidence and related documents

- [Detailed coaching contract and acceptance scenarios](../design-coach/GOLD_STANDARD.md).
- [Child continuity and background-build contract](../child-continuity/README.md).
- [Product doctrine](../../PRODUCT-DOCTRINE.md).
- [Delivery state](../../DELIVERY-STATE.md) owns current implementation and release evidence. This record does not certify those gates.
