# 0008 — Four illustrated making levels with cosmetic character choice

**Status:** Accepted owner-directed visual/product scope; the initial Gem Master threshold is an implementation policy within that scope.
**Numbering:** Originally recorded as 0005 on PR57, then locally renumbered 0006 when integrating the merged adult-profile decision. Renumbered to 0008 during the latest-main reconciliation because merged style-diverse quality and Creation Studio decisions own 0006 and 0007. The original decision scope and evidence are retained.
**Recorded:** November 18, 2026, 11:52 p.m. America/New_York (`2026-11-19T04:52Z`).
**Decision source:** [PR #57](https://github.com/jzwyrzyk/family-game-factory/pull/57) and its [making-journey contract](../brand/GEM_PROGRESS.md). The request is paraphrased here; the exact original request timestamp is not independently recorded in the repository. This decision does not approve a deployment or certify educational efficacy.

## Context

The owner requested refinement toward the bright white illustrated reference: developed character art, visual evolution with level, two character choices without gender labels, a dedicated level page, short text and popups. The existing rough/cut/polished progression was to remain, with a fourth overall level named **Gem Master**. The making story must preserve the child's authorship and explicit Keep decision described in [ADR 0001](0001-child-led-creation.md).

## Decision

Use **Gem Maker → Gem Cutter → Gem Polisher → Gem Master** as a cosmetic making journey. Spark and Nova receive equal treatment and the same requirements; the saved choice is a style selection, not a gender record. Use local, coherent character/gem artwork on a bright white page, while preserving the existing jems mark. Let the child preview future stages with an explicit preview label and a separate truthful current-level indicator.

Derive progress from the current owner's retained, validated notebook evidence. Authored design decisions can form a rough jem; a real saved test with linked child reflection can become cut; an explicit confirmed keep of that same reflected test can become polished. The initial implementation grants Gem Master after **three distinct polished projects**, deduplicating project/test/revision evidence. Three is a chosen product threshold for this implementation, not an owner-specified number, calibrated learning benchmark or measure of ability.

Emit one compact, nonblocking achievement when a durable action produces an upward transition. Do not replay earned milestones on page load, preview, avatar change or profile switching. Maintain keyboard access, focus, reduced motion and truthful save failures. Keep learning scores, game results, model availability and paid generation separate.

## Consequences and limits

- The requested fourth overall level extends the prior three-level summary; individual projects retain rough/cut/polished states.
- A separate permanent award ledger is not used. This keeps credit tied to retained evidence: archives preserve it, copies need their own new cycle, and erasure can lower the dependent level. Saved test notes and game versions retain their existing clear-chat behavior.
- Optional notebook fields preserve old version-1 data and backups. Missing historical exact-test keep receipts do not receive invented retrospective credit.
- Currency, streak pressure and rankings are outside this journey. This records the implemented scope; it is not a claim that comparative product trials evaluated those alternatives.
- Local browser checks and sample-profile screenshots establish specific interaction and layout results. They do not establish child comprehension/enjoyment, real-device performance, provider acceptance or learning gains.

Reconsider the threshold or presentation if owner direction or observed usability supports a change. Changes to scoring meaning, stored evidence, erasure semantics or cross-device persistence require an explicit contract/decision update; visual previews must never silently redefine eligibility.

## Evidence and related documents

- [Detailed eligibility, persistence, copy and clear behavior](../brand/GEM_PROGRESS.md).
- [Artwork contract, provenance and review captures](../brand/achievement-art/README.md).
- [Evidence/persistence checks](../../tests/gem-progress.test.ts) and [production-browser checks](../../tests/gem-journey-browser.cjs).
- [Product doctrine](../../PRODUCT-DOCTRINE.md) and [current source architecture](../../ARCHITECTURE-CURRENT.md).
- [Delivery state](../../DELIVERY-STATE.md) records branch, CI and release evidence separately from this accepted design scope.
