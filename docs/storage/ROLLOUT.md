# Storage migration, rollback, retention and activation boundaries

This is a review/engineering procedure, not authorization to provision, migrate, deploy or delete. No Cloud Shell is needed for repository engineering, offline testing or hosted CI. The available cloud identity/resources have not been inspected.

## Incremental deployment order

1. Review PR166's exact source and mandatory hosted checks. Preserve all old source and release evidence. Do not merge without owner authorization.
2. Release a compatible gateway separately before a frontend that sends `clientRequestId` to revision fork and reads its receipt endpoint. Old fork callers remain supported. A gateway without this route must not receive the dependent frontend; an uncertain request remains pending rather than replaying.
3. Verify saved-game reads, authenticated family/Adult access, no paid invocation, original/source/kept IDs and remote copy acknowledgment loss in isolated TEST. Source assertions and fixture CI do not establish that the deployed gateway has these methods.
4. For the frontend, retain legacy keys and schemas plus the additive `pendingCopy`. Run startup recovery under the existing writer lock before Studio or reward projection. Family profile data loads during module evaluation: a rollback forces a fresh document before any save. Adult recovery occurs after a new valid grant and before entering that namespace.
5. Do not enable split payload encoding, per-record continuity, any cloud scheduler, migration or GC as part of this frontend change. They have no automatic startup/route/config activation here.

## Journal semantics and emergency recovery

The journal contains exact reversible images for only workspace, notebook and family-state keys inside one pinned namespace. Pending means restore the original strings; committed means finish the new strings and cleanup. Compare **all** current values against their old/new images before touching any. Unknown/newer data or malformed/foreign-scope/schema records block recovery. Do not clear an intent to make the application start. An ordinary write is prohibited while it exists. Family backup replacement refuses a pending local journal.

A failure before intent persistence changes no source. A failure during source writes retains original images; quota failure can prevent rollback from finishing, so keep the intent and offer reload. After a durable commit marker, cleanup failure leaves a saved operation and blocks new writes until recovery. This is a recoverable sequence of atomic localStorage calls, not an ACID transaction across independent keys or a power-loss durability promise from the browser.

For a corrupted journal, preserve a private copy of the complete namespace and intent before technical inspection. A graphical raw-recovery download/reconciliation screen remains open work; the present startup recovery surface offers reload. Never export private raw strings into public GitHub evidence. The owner is not asked to run terminal commands.

Old frontend bundles do not understand this journal or the new pending-copy schema. Rollback must use a compatible reader, first reconcile every pending intent, and retain all recorded IDs/bytes. Do not delete newer fields or restore an old backup automatically to satisfy an old reader. Existing native runtime archives are unchanged.

## Indexed-store migration plan — not implemented activation

The new adapter proves record transactions and paging; it is not a complete domain mapping. Before enabling it:

- Define adapters for each native graph, conversation chapter, profile/learning history, scene, APS, reward and Pal domain. Preserve their exact owner, immutable IDs, timestamps, source identity and pending reward/copy/build facts. Keep large images out of metadata records. Map old unknown/corrupt bytes to a preserved recovery object, never an empty workspace.
- Build an explicit resumable migration manifest containing source schema, exact source hashes, owner namespace, intended record IDs, verified batch receipts and a completion marker. Read old sources under the existing writer lock. Commit batches idempotently and validate reconstructed old exports byte-for-byte where serialization is authoritative, structurally with pinned IDs where schema serialization differs.
- Leave all legacy originals intact until complete validation and a reviewed rollback/recovery point. Do not dual-write two competing authoritative stores. Select the new reader only after complete manifest publication; interrupted preparation must continue using old authoritative data. Clear activation marker to return to old sources only while no new-format writes have occurred; otherwise use a compatible forward repair/export conversion.
- Add paginated My Games/history/chat readers and async save acknowledgments throughout the real UI. Bounded page size must not imply discarded history. Model context should retrieve relevant evidence through a bounded projection; source history remains intact.
- Complete real browser quota, eviction, interrupted migration, exact family backup reconstruction, art dependencies and full application startup/navigation acceptance before any actual family migration. Synthetic 50k record timings alone are insufficient.

## Synchronization and conflict protocol

`RecordOperation` captures scope, operation ID and a ≤50-record write plan, each with expected server version. Server transaction reads receipt and touched records, rejects stale versions as a whole, then writes current record, immutable version and receipt atomically. Changed payload under an old operation ID is an error. On lost acknowledgment, read the receipt; never infer failure from a timeout. Repeating this metadata transaction is idempotent, but these APIs must never wrap a paid model request or remote fork POST.

The local adapter atomically persists current records, immutable history, receipt and outbox. Acknowledgment removes only matching queue/pending entries; it never deletes retained history. Incoming remote pages cannot replace a record with pending local edits or a newer version. An equal version with unequal content is a corruption/conflict error. Offline A and B edits from the same base cannot silently overwrite: download latest, preserve local branch, offer Keep both or an explicit reviewed merge. No last-write-wins clock ordering. IDs and versions, not client wall-clock time, decide ancestry.

**Remaining repository work:** a real continuity gateway route with trusted-device/Adult proof binding, server paginated change feed, dependency-ordered outbox pump, conflict UI, deletion propagation integration and recoverable migration. Remote-copy discovery is integrated through Notifications and Check my copy; that existing gateway capability is separate from the new continuity protocol. The principal callbacks in adapters are not substitutes for those boundaries. Cross-device continuity has not been delivered to the application.

Deletion is a versioned tombstone in preparation tests. It must reach every authorized device before any future physical deletion becomes eligible; missing/offline devices, unknown roots, failed manifests or temporary missing assets prevent an unused verdict. Revoked devices must lose remote access; local data erasure requires its separate policy/UX. No deletion scheduler exists.

## Assets and revisions

Split encoding is **false by default**. `private-game-v2` contains an immutable manifest pointing to separate original asset data strings and compiled code through the existing private store. Small source/game metadata stays a complete snapshot. Reconstruct the exact original object before runtime/quality validation; source/code/assets hashes and provenance are unchanged. No fragile multi-hop revision delta chain, loss of transparency or image processing is introduced. Hash identity is scoped by the existing workspace path and a family/Adult audience envelope; identical art in different audiences receives distinct object identities, and decoding rejects swapped manifests. Never pool unrelated families for savings.

Deploy v2-capable readers before optionally writing v2 manifests. Old inline/whole-object records remain readable. A rollback to older decoder code is unsafe after v2 writes; keep a compatible decoder or complete a verified re-encoding migration first. An interrupted upload leaves only immutable orphan objects; the authoritative metadata transaction must not commit until uploads succeed. A lost immutable-put acknowledgment may verify/reuse the same hash; it is not another paid artwork request.

`traceGameReferences` validates manifest roots and every referenced object and returns `complete:false` on an unavailable/corrupt/unknown root. It is a dry-run graph tracer, **not a complete bucket inventory**. Callers must supply every retained game, job, backup, rollback/recovery point and original-master root; until that integration exists it must not authorize deletion. The original PR13 adapter intentionally still has no delete operation.

## Proposed lifecycle and backup policy — owner decision

| Category | Proposal | What exists now |
|---|---|---|
| Saved creations, retained versions, original artwork and learning/provenance | Retain until explicit owner-directed recoverable deletion; no age-based purge | Existing local/remote saved state and manual exports; no new destructive policy |
| Active/archived conversations and unfinished ideas | Keep exact authored history; archive is visibility only; bounded model context separately | Current chapter scheme and limits remain |
| Failed/abandoned candidates and preview captures | Eligible only after terminal receipt, grace period, complete reference scan and protected recovery roots | Existing active-reference removal; no physical GC or approved grace period |
| Device/static/process caches | Regenerable, bounded by quota/source version; safe eviction must not remove authoritative unsynced writes | Existing static cache and 32 MiB private artifact process cache |
| Operational/recovery receipts | Retain independently from ephemeral candidate data; unresolved receipts never expire by assumption | Existing ledgers/release journals preserved |
| Private backups | Proposed daily incremental manifests and periodic verified recovery points; tentative RPO 24h, RTO one hour for a family; owner must approve | Immutable record history preparation only; no scheduled complete private backup or graphical restore |
| Backup expiry and soft-deletion window | Propose a reviewed 30-day recoverable window; preserve referenced originals and legal/accounting obligations | No policy activated; retention duration remains a decision |

The owner should eventually choose a recovery point, preview affected games/profiles and restore through a GUI. Today the existing Grown-ups export/import and per-owner art bundles remain the supported graphical actions; they still require files. This work does not remove that maintenance burden yet.

## Concrete activation checklist

The checked-in `infra/storage/activation-plan.json` is disabled, creates no resources, grants no IAM and authorizes no migration/deletion. `firestore.indexes.json` exempts the new hashed-record value map from unnecessary indexing; merge this definition into the actual environment configuration rather than replacing unrelated indexes. No authenticated deployment/plan was executed.

Owner decisions: desired retention/deletion window, backup RPO/RTO and recovery-point duration; whether/when to activate cloud continuity and private backups after implementation and TEST acceptance; exact merge/release approval. No new permission is needed to finish ordinary repository work.

Authenticated engineering: inspect real database/bucket region, access and quotas; verify currently configured artifact adapters; review indexes, backup capability and costs; provision only separately authorized missing resources; deploy compatible readers/gateway; exercise actual TEST profile/asset recovery; approve and execute any actual data migration separately. These operations can use approved CI or authenticated APIs; **Cloud Shell is not intrinsically required**.

Actual Cloud Shell dependency: inventory/cleanup of that specific unavailable Cloud Shell filesystem only. Reuse the existing checksum-pinned helper; preserve private receipts, rollback targets, unknown files and active/shared worktrees. No owner terminal relay is requested here.

## Validation and merge disposition

Local build/typecheck and 620 unit cases passed before documentation finalization. Built-app navigation/continuity, coach desktop/mobile and Adult profile desktop/mobile passed with explicit fixtures. Chromium renderer-loss at six boundaries on three layouts and actual IndexedDB contracts passed; latest measured values are retained including noisy samples. Existing security, premium, generated runtime and learning gates are retained. Hosted checks must be observed at the published exact source; this document alone does not assert hosted success.

No Firestore emulator run, authenticated cloud read/write, physical-device run, actual family import, owner interactive acceptance or production activation was performed. New test failures during development (schema allowlist omission, an unsuitable native-base fixture, a key-insensitive localStorage fixture and Chromium crash-reload harness handling) were corrected without weakening assertions. The final named suites establish their own scope.

Merge readiness: draft until full hosted checks and review. Production activation readiness: not ready; no merge/deploy/activation requested or performed. The remaining repository integration work above is real unfinished engineering and is not misclassified as an owner/cloud blocker.

### Executable recovery-point preparation

`server/storage/recovery-points.ts` adds a disabled-service consumer for consistent snapshots supplied by a future maintenance coordinator. Exact raw source strings are split into bounded immutable records; null and empty remain distinct. Only after all chunks reassemble and match their SHA-256 does a final manifest become a recovery point. An interrupted upload can resume with the same identities; a changed source under the same backup ID is rejected. Reads verify every chunk and scope and return exact bytes without applying them to live application stores. Synthetic tests cover interruption, duplicate completion, changed plans, corruption and unauthorized profile access.

This closes repository preparation for a resumable private snapshot format, not complete application backup. It does not capture the live stores itself, include original binary artwork automatically, schedule backups, deduplicate chunks between different recovery points or install a graphical restore. Consistent domain capture, original-art references, whole-family manifest aggregation and explicit restore application remain integration work.

The local pinned Playwright Chromium download failed at the environment network route. Browser measurements and built-app journeys used the installed system Chromium. Hosted CI retains its pinned browser and full assertions; no browser pin was changed to make local checks pass. The storage/browser test is registered in the existing browser-storage shard and release browser-security partition, increasing mandatory command coverage by one. Restored native-game playback also passed on desktop/mobile with the system browser.

The first published implementation (`f654720`) exposed two CI registration errors: the release helper was missing the new browser command, and the product review incorrectly claimed a changed doctrine document. Both were corrected; none of the existing assertions or test commands was removed. The documentation failure also prevented Arcade preparation, so that first run is not browser regression evidence.

The same mandatory storage browser command also runs `tests/storage-copy-browser.cjs` against the built application. On desktop/tablet/phone it verifies the intent exists before POST, aborts that response, reloads, checks an unknown receipt, simulates quota failure during confirmed local completion, and finishes through receipt lookup. It asserts one POST total, retained original/transcript bytes, readable contrast and a visible 48px recovery action. This transport is synthetic; preview availability is deliberately denied and no live remote game is copied.

Final coverage includes all six mutations of a three-source journal (intent, three source writes, committed marker, cleanup) on all three layouts, plus twelve before/after mutation faults and four interrupted rollback boundaries in unit tests. The full 620-case unit suite and combined storage browser command passed locally; prior five-boundary benchmark samples remain preserved separately.
