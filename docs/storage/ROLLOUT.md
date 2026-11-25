# Storage migration, rollback and activation boundaries

This is the repository procedure for the combined November 25 candidate. The [completion register](../family-beta/COMPLETION.md) owns requirement dispositions and exact-source acceptance. The [nine-stage activation runbook](../family-beta/ACTIVATION.md#nine-stage-activation-plan) owns future cloud operations. Neither document authorizes provisioning, protected merges, paid calls, real-data migration, invitations or deletion. Routine work uses protected Actions and authenticated APIs; Cloud Shell is not an ordinary prerequisite.

## One authority per domain

The normal build retains existing source formats. The explicitly selected `storage-preview` build can prepare native games, Studio notebooks and Creation records through the existing application and Parent recovery controls. A query string, a persisted marker or beta participation cannot activate this build mode. Preparation is an explicit operation; application adapters select a prepared domain only after its verified completion marker exists. A partially migrated domain remains on its original source.

`NativeWorkspace`, `NotebookWorkspace` and the Creation adapter preserve existing domain validation and owner identity. Native pages load bounded project metadata and selected revisions. Notebook pages load cards, while exact selected conversations follow retained chapter links. Committed presentation summaries supply maker progress, guidance and notification state without pretending a metadata card is a complete conversation. The notebook cache contains the foreground session and at most eight unresolved jobs. Large session/chapter payloads are immutable, hash-verified chunks; they retain exact messages, design and provenance.

Notebook mutations are awaited. A source callback is staged against a validated owner snapshot, then only changed pointers and the new summary/head commit atomically. Reward facts and source evidence publish after commit. A prepared notebook transaction can join native changes in the same scoped IndexedDB transaction. This first implementation still reconstructs and validates the bounded owner notebook for a mutation and computes presentation projections at commit time. That write CPU cost and retained immutable history are explicit tradeoffs; bounded reads do not imply constant-time writes or reduced total retained bytes.

The [inventory](INVENTORY.md) distinguishes these integrated domains from still-existing whole-key profile, learning and evidence sources. Do not describe a domain as migrated because a generic record store exists. A complete recovery export resolves every active authority rather than reading a stale legacy key.

## Preparation, compatibility and rollback

1. Capture a complete verified recovery point before any separately approved real migration. Preserve exact owners, IDs, original artwork, engine versions, pending receipts and provenance. Synthetic preparation is engineering evidence only.
2. Hold the existing origin writer lock and same-tab source maintenance through preparation. Pin the original source string/hash and current profile. Read source data once, validate it, commit resumable bounded batches, and verify reconstructed records. A final source reread must match before publishing authority. Quota, corruption, changed source, revoked scope or incompatible data stops without deleting originals.
3. Keep legacy strings and every previously retained immutable version. Reload after successful preparation so old in-memory readers cannot continue writing a legacy source. Never dual-write competing authorities or acknowledge an asynchronous save before its durable commit.
4. Use only readers that understand the written schema and domain activation. Clearing an activation marker is not a rollback after new-format writes: it would reopen an outdated original. Repair forward or explicitly restore a reviewed compatible recovery point. Unknown fields, missing chunks and conflicting immutable IDs remain visible failures; do not truncate them to satisfy an older reader.
5. Verify actual application startup, library/open/save, pending receipts, parent reports, rewards, export, restored games, quota and interruption. Run the same actual-application fixture before and after, including serialization and retained-byte costs. Adapter-only throughput is insufficient.

An owner profile is local-origin scoped and an Adult profile retains its exact `adult:<workspace>` identity. Cloud synchronization separately maps to the server-issued family/profile scope; neither local origin hashes nor client family IDs grant remote access. Adult recovery still requires a fresh grant.

## Local journal and compound saves

Legacy Studio create/copy operations use the existing reversible journal for exact workspace, notebook and optional profile images. Pending means restore original strings; committed means finish committed strings and cleanup. Compare every captured value with its old/new image before touching any. Unknown/newer bytes, malformed journals and scope mismatches block ordinary writes. An intent-persistence failure changes no source; interrupted cleanup after the commit marker does not report lost work.

Prepared native/notebook changes can share one IndexedDB transaction. Where a compound operation still includes a legacy profile image, its retained intent and startup recovery bridge that explicit cross-store boundary. Do not call a sequence across localStorage and IndexedDB a single browser ACID transaction. Existing writer-lock, maintenance and recovery checks remain required.

Preserve corrupted originals for private recovery export. Do not clear a journal or discard an unavailable asset simply to make startup succeed. Recovery validates the entire covered set before replacement and keeps the original recovery point through acceptance. Browser persistence does not guarantee survival of device loss or origin eviction.

## Authenticated private continuity

The gateway mounts same-origin `POST /v1/storage/{status,commit,lookup,read,changes,page}` behind current family/device/session checks. Operator configuration and current guardian consent select explicit data categories; absent configuration is off. Local-only participation produces no continuity upload. A status epoch binds the current grant, notice, policy and guardian approval; withdrawal, renewal, revocation or profile change invalidates in-flight work.

A record operation has an opaque stable identity and expected versions. Server transactions atomically publish current records, immutable history, reference-only feed/index metadata and receipts. Receipt lookup resolves a lost acknowledgment. Local durable ordering, receipt replay and separate local/server version mapping preserve unuploaded edits and reject stale remote replacements. Conflict handling retains both meaningful histories and requires an explicit choice; wall-clock timestamps never authorize last-write-wins. These operations do not wrap a paid build, coach request or uncertain remote-fork POST.

The integrated application transfer surface is scoped to supported native saved-game graphs. Original-art dependencies need the complete recovery path until that continuity mapping is supported. Generic authenticated feed/tombstone support is not a claim that every local domain is automatically synchronized. Native tombstones remain held for reviewed removal; no automatic physical asset deletion or retention deadline is introduced. Domain mappings and any remaining limitations are recorded in the completion register.

## Immutable assets and decoder order

Split private-game encoding remains off by default. The v2 manifest separates unchanged original asset strings and compiled code while retaining complete small metadata/configuration snapshots. Hash identity is bound to the existing workspace and family/Adult audience. Identical assets from unrelated audiences are not pooled. Reconstruct and validate exact source/code/assets before runtime use; missing or corrupt dependencies fail closed. Existing inline and whole-object encodings remain readable.

Deploy compatible readers before authorizing v2 writes. Keep a compatible decoder for rollback; an old decoder cannot safely consume newly written manifests. Failed uploads may leave immutable orphan objects, but metadata must not commit broken dependencies. Reference tracing returns incomplete for unknown or missing roots. It is a dry run, not deletion authority or a complete bucket inventory. Retained games, jobs, backups, rollback points and original masters must all remain roots.

## Complete recovery and future cloud operation

Parent recovery captures profiles/progress, active native/notebook/Creation records, conversations, learning/evidence, rewards, Pals and original drawing/rig/draft bytes. Immutable chunks are checksummed; the manifest publishes last. The graphical flow lists bounded recovery-point pages, previews the selected point, preserves a complete rollback point, then replaces through the coordinated recovery journal. Duplicate point receipts do not erase work created after an earlier successful restore. Missing originals, mismatched owners/origins, corrupt chunks and unsupported schemas stop replacement.

The local vault protects against an individual source record being removed, not loss of that browser. Download remains available. The prepared cloud route and scheduler require explicit operator/guardian domain authorization, current parent recovery access and a separately approved schedule. A configured scheduler does not prove an operating cloud service. Schedule, retention, RPO/RTO and erasure exclusions remain reviewed configuration; this work invents no deletion deadline and activates no resources.

For actual household origin transfer, follow the one [activation runbook](../family-beta/ACTIVATION.md). Preserve every original browser partition, the authoritative server workspace, mapped source/destination identities and rollback copies. A transfer receipt permits reading its specifically mapped source recovery namespace; it never grants another family or Adult audience.

## Evidence limits

The historical November 24 PR166 test counts and measurements remain in [the preserved implementation record](README.md#preserved-november-24-implementation-record). They are not current-candidate results. The new actual-application benchmark pins source/tree and delivered build digest and records the instrumented browser environment. Hosted CI must bind the published exact head; physical Safari, actual TEST service readback, owner interactive acceptance, live-provider permission and real household migration remain separate evidence.
