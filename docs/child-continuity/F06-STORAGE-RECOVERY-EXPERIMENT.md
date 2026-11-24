# F06 storage recovery — first engineering slice

**Draft; offline experiment only.** Starting main `13260750b7771beb024cc6a94bf823ee5a4e29ff` includes premium PR139. No production imports, storage schema change, live data, cloud operations or provider calls. This is a first slice of the broader storage assignment, not F06 completion.

## Observed source boundary

- `src/studio/local-project.ts` stages native workspace and notebook writes in memory, validates both and compensates synchronous failures. It explicitly does not provide crash-safe multi-key writes.
- `src/factory/workspace.ts` and `src/studio/notebook.ts` remain the canonical readers. Native workspace v2 currently limits projects/revisions/plays to 50/500/1000; notebook limits include 80 sessions and 200 messages per writable page. Do not change limits in this slice.
- `src/adult-pilot/storage.ts` dynamically namespaces family versus temporary Adult storage; the authenticated Adult identity is not restored on reload. A recovery adapter must pin the exact authorized namespace; a journal cannot grant authentication.
- `src/rewards/write-guard.ts` already owns a browser origin-wide writer lock. Do not install a competing lock or recover before that lock is held.
- The production reliability contract is `docs/child-continuity/RELIABILITY-2026-11-23.md`. PR123 protects synchronous writes and Build acknowledgment; no new provider or remote replay path is permitted.

## Experiment

The prototype accepts only the exact two known local source keys, a pinned family/adult scope, an explicit exclusive-writer assertion, exact original and proposed values. It persists a complete bounded intent before any target write; a restart rolls forward only when every value is either its exact preimage or postimage. Unknown newer bytes, malformed journals, mismatched scope and a missing writer assertion fail closed. It refuses to replace pending intents. The journal is removed only after all postimages verify. No data is logged by the implementation. Individual storage operations are assumed atomic; this experiment does not provide database transaction isolation or validate arbitrary source schemas.

Reproduce: `node tools/storage-journal-prototype.test.mjs`. 19 synthetic cases ran against the same function bodies in a JS execution isolate before publication (not full repository or hosted CI). Cases include failure before and after each of four mutations, stale values, conflicting recovery, pending intents, malformed records, cross-scope access, lock denial, invalid keys, null preimage and oversized intent.

## Integration gates

Full before/after strings may double or triple local storage usage: the 2,000,000 UTF-16 code-unit experiment cap is NOT a browser capacity guarantee or proposed product cap. Quota failure must preserve existing records. Benchmark actual large synthetic workspaces; consider IndexedDB journal/transaction or compact versioned write plans rather than storing duplicate complete records. Compare recovery semantics and costs before choosing. Validate schema, immutable IDs, owner and namespace provenance before writes, including journal corruption and tampering. Ensure authorized recovery runs after obtaining the existing writer lock and before source readers, separately for family and reauthorized Adult. Integrate with reset, backup/restore, quota UI, notification/reward outboxes, old-client compatibility, rollback, and real browser process termination tests. Unknown outcomes must never trigger a paid remote replay. No cross-device or cloud migration is authorized.

## Remaining F06 work packages

1. Inventory actual stores and source/owner/schema/capacity/backup boundaries (including art, learning, rewards, caches, Firestore and private artifacts); quantify synthetic load.
2. Select and integrate durable cross-key recovery; test browser process interruption and old reader compatibility.
3. Transactional capacity and profile/construction copy recovery; remote-copy identity and read-only reconciliation; atomic conversation reply/evidence recovery.
4. Scalable paginated provenance and bounded context; preserve IDs, authored text, artwork, learning evidence and existing saved games.
5. Cloud-backed persistence and private backup: evaluate existing Firestore/artifact adapter, synchronization, retention, migration, privacy, estimated cost and rollback with emulator/synthetic tests; keep disabled pending approval. Do not delete any actual records.
6. Independent exact-source hosted tests, documentation review and release gates. Coordinate shared storage contracts with PR139 and avoid codebase-refactor overlap. Actual Cloud Shell disk cleanup remains a separate blocked operations task.

Preserve Splash or Pass and Dragon, all existing saved versions and private artwork. No new retention/deletion policy, spending, IAM or production activation authorized.
