# 0010 — Lifetime gems alongside the evidence-based making journey

**Status:** Accepted for development; amounts and thresholds are initial implementation policy.
**Recorded:** November 19, 2026 (America/New_York).
**Decision source:** The owner's November 19 reward-system follow-up explicitly directed immediate development of shared gem increments for developed games, answered learning activities and milestones, a cohesive rewards page, progress and popups using the approved branding. Companion art and the companion system were reserved for another conversation. This record paraphrases that private direction without publishing the conversation. Implementation and release evidence belong in [delivery state](../../DELIVERY-STATE.md).

## Context

[ADR0008](0008-cosmetic-making-journey.md) established four illustrated maker ranks derived from current saved authorship, tests, reflection and Keep receipts. It did not implement a persistent engagement economy. Math, Language Arts and Create & code now have their own trusted source evidence, and the owner wants rewarding progress to connect those activities to the wider Jems experience.

An accumulated reward total and an evidence-derived creator rank serve different purposes. Converting gems directly into maker ranks would redefine the existing criteria. Using rolling source-attempt history as a wallet would lose old grants and invite replay after pruning. Source stores are currently synchronous localStorage documents; a new asynchronous ledger also needs recoverable handoff and concurrency handling.

## Decision

1. Add **lifetime earned gems**, with transparent milestones and one shared Rewards experience. Gems are nonspendable in this revision. Keep the four existing maker ranks and their eligibility independent; do not add a parallel XP level.
2. Award from verified saved host actions, using the explicit [version-1 schedule](../rewards/README.md). Supported corrected answers earn the same activity amount as independent completion. Saved open writing remains unscored. No speed, perfect-answer, streak or model-inferred thinking bonus is introduced.
3. Persist minimal pending reward facts in the same source write as the qualifying action. Project those facts into owner-scoped IndexedDB receipts, then acknowledge the source. Retried facts deduplicate by semantic identity, not by timestamp or rule version.
4. Retain versioned, immutable grant amounts. Later rules do not silently reprice prior grants. No automatic historical backfill scans older learning, projects or ranks; future saved actions and existing durable pending receipts drive the new system.
5. Use one origin-wide source-writing Web Lock for the existing localStorage stores, with an explicit paused second-tab experience. Use native IndexedDB read/write transactions for the independent ledger. Capture family/adult namespace and owner before asynchronous work.
6. Include backup validation, explicit replacement/merge semantics, corrupt-state preservation, retry and scoped owner-removal primitives. Whole-family replacement/reset uses a durable rollback journal across the four source keys and raw reward ledger, resolved at startup before writes or projection. Fail before replacement if originals cannot be preserved losslessly. Previously committed lifetime gems survive chat/project evidence deletion; a current maker rank can still decrease when its evidence is erased. Full reset or an explicit earlier backup replacement can remove reward history.
7. Reuse the approved ray-free identity, gem art and exact selected-maker frames. Companion creation, collectible ownership, stores, spending, trading and cloud synchronization are outside this revision.

## Consequences and limits

The reward model can encourage participation without changing the learning engines' interpretation of assistance or adding unsupported mastery claims. Source eligibility remains separate for each activity; a valid receipt proves only the documented saved action. A nonempty reflection is not an evaluation of reasoning quality, and a successful scene check is not general coding mastery.

The new ledger is an additive engagement store. It does not replace the notebook as the source for maker rank. The earlier no-economy scope in ADR0008 remains the history of that feature; this decision extends the surrounding product while preserving its rank criteria and evidence erasure behavior.

Local storage remains inspectable and device-specific. The new system is not cheat-proof, cross-device synchronized, server-authoritative or a spendable wallet. The source outbox and ledger are separate commits with idempotent recovery. Backup replacement likewise uses validated coordinated writes and a durable rollback journal, not a single transaction across every store. Reload after recovery prevents an older in-memory source from undoing the restored state. Full feature acceptance therefore includes persistence failures, interrupted backups, stale profile callbacks and concurrent tabs as well as the illustrated page.

The fixed numbers are practical starting settings, not established optimal incentives or educational benchmarks. Reconsider them using observed child comprehension, balanced activity participation and learning evidence. Extending to spending, permanent unlocks, companions, profile synchronization or a different deletion policy requires its own explicit contract and implementation review.

## Implementation and acceptance references

- [Rewards contract, schedule and recovery](../rewards/README.md).
- [Model](../../src/rewards/model.ts), [IndexedDB ledger](../../src/rewards/store.ts), [source write guard](../../src/rewards/write-guard.ts), [backup/recovery journal](../../src/rewards/backup.ts), and [learning adapter](../../src/rewards/integration.ts).
- [Existing maker-rank contract](../brand/GEM_PROGRESS.md) and [approved brand library](../brand/LIBRARY_V1_2.md).
- [Core](../../tests/rewards.test.ts), [source integration](../../tests/rewards-integration.test.ts), [backup recovery](../../tests/rewards-backup.test.ts), [component browser](../../tests/rewards-ui-browser.cjs), and [application browser](../../tests/rewards-browser.cjs) checks.
- [Current architecture](../../ARCHITECTURE-CURRENT.md) and [dated delivery evidence](../../DELIVERY-STATE.md).
