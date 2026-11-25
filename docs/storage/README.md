# Storage reliability and continuity — PR166

**Current-main completion continuation, November 25:** the application now combines protected main `0f459f5` with the preserved storage and family-beta/audit source. The [combined acceptance register](../family-beta/COMPLETION.md) records current requirements and dispositions; the [nine-stage runbook](../family-beta/ACTIVATION.md#nine-stage-activation-plan) is the consolidated future cloud plan. The dated PR166 measurements and implementation record below remain historical evidence for their original tree. Final-source implementation/evidence must not be inferred from those old results.

## Current integrated implementation

The combined candidate now selects actual `NativeWorkspace`, `NotebookWorkspace` and Creation record authorities in the explicitly built `storage-preview` application, after user-invoked resumable preparation. Ordinary builds retain compatible legacy sources. Cards, selected records and committed notebook presentation summaries avoid reading every conversation or revision during navigation; saves await durable commit. Whole-owner notebook reconstruction still occurs during writes, and retained legacy originals, immutable payloads/history and recovery copies increase occupied bytes. These tradeoffs are measured rather than hidden behind the earlier isolated-record throughput result. Profiles, Math/English and APS retain their bounded atomic source formats; lazy Parent capture avoids an unnecessary startup report scan.

Actual same-origin continuity routes and the native private-copy controls bind current device, guardian, profile and category consent. Local/server versions are separate, uncertain acknowledgments use receipt lookup, and explicit Keep both preserves a playable branch before resolving the original conflict. Complete Parent recovery captures active sources and original drawing/rig/draft bytes; preview, rollback, interrupted recovery and private cloud-copy controls are integrated. The private schedule, split encoder, remote continuity and migrations remain off unless explicitly selected and authorized. [Rollout and compatibility](ROLLOUT.md) gives the current operational contract; the November 24 section below is preserved history.

The source-backed acceptance includes real IndexedDB notebook tests (ten scenario groups: resumed migration, metadata-only pages, exact oversized Unicode/chapter recovery, projection parity, concurrency/quota, backup/duplicate restore, awaited facade/rewards, compound commit and source guard, scope revocation, corruption); actual ordinary and prepared Studio desktop/phone journeys; native continuity conflict/receipt/Keep both fixtures; and complete Parent recovery desktop/tablet/phone controls. The [combined register](../family-beta/COMPLETION.md) distinguishes those component receipts from the final exact-head hosted gate, physical devices and live TEST.

### Comparable application benchmark v2

The [v2 main baseline](evidence/application-main-0f459f5-v2.json) adds actual visible draft editing and durable flush, IDB request/payload counters, per-key source occupancy, current/history/vault logical footprint, startup CPU observations and a delivered-build digest. It uses protected main `0f459f5`, Chromium `156.0.8078.79`, five samples and the same 5/25/50-project and 100/2,500/14,000-message libraries as the earlier receipt. Original-art bytes are unchanged. Baseline medians are 966/1,832/2,191 ms to application readiness, 329/676/1,571 ms to open the saved game, and 45/138/211 ms for the real draft/flush interaction. These supersede no historical observation: the older v1 run used fewer counters and shared-host conditions differed.

Use `STORAGE_BENCHMARK_AUTHORITY=indexed` only against a `storage-preview` build. The harness invokes the actual application preparation API, reloads, verifies both active authorities, and exercises their real domain methods and visible UI. Run the default build separately. The comparable candidate v2 receipt is pending final-source measurement; no improvement percentage or overall readiness score is claimed from the baseline alone. The fixture's profile source is 1,134 UTF-8 bytes and has no populated learning/APS history: its 0–0.1 ms profile-save median is not a worst-case profile/learning result. Bounded source limits remain in the inventory.

## Actual application measurements on current main

`CHROMIUM_PATH=/usr/bin/chromium node tools/storage-application-benchmark.cjs TARGET OUTPUT.json` runs the built application with only loopback requests. It creates records through the actual `RevisionStore`, `StudioNotebook` and original-drawing store, reloads the real Studio, opens a saved game from its visible card, and measures source operations in real browser storage. The [main baseline JSON](evidence/application-main-0f459f5.json) pins the full source/tree, Chromium version, five samples per size, counters and process metrics. It is distinct from the older isolated 50,000-record adapter benchmark.

| Scenario | Small | Medium | Large |
| --- | ---: | ---: | ---: |
| Projects / retained initial revisions | 5 / 5 | 25 / 100 | 50 / 450 |
| Notebook sessions / messages | 5 / 100 | 25 / 2,500 | 70 / 14,000 |
| Original PNGs / original bytes | 2 / 336,612 | 5 / 3,146,610 | 8 / 9,260,556 |
| Derived preview bytes | 336,612 | 684,427 | 1,517,028 |
| Persisted localStorage bytes after first measured save | 29,004 | 608,121 | 3,315,149 |
| Reload to application ready, median ms | 918.48 | 766.38 | 1,283.35 |
| Home library visible, median ms | 134.83 | 145.03 | 314.61 |
| Saved-game card to open Studio, median ms | 364.65 | 335.97 | 1,018.71 |
| Source list / saved revision lookup, median ms | 0.4 / <0.1 | 3.6 / 0.1 | 16.6 / 0.1 |
| Draft save / immutable revision save, median ms | 1.6 / 0.6 | 13.8 / 1.7 | 71.1 / 13.3 |
| Legacy progress JSON export / restore, median ms | 0.5 / 0.7 | 4.7 / 9.7 | 28.8 / 64.2 |
| Original-art bundle export / idempotent restore, median ms | 1,227.9 / 716.1 | 882.8 / 786.4 | 2,012.6 / 1,577.5 |

These are main-baseline measurements, not before/after improvement claims. The full combined-candidate run is required after source integration. The legacy progress measurement excludes artwork, rewards and Pals; original artwork is measured separately. The complete recovery handler must be measured separately once integrated so a progress-only JSON operation cannot be presented as a complete family backup. All original PNG hashes are distinct in this fixture; original/preview copies are deliberate and not counted as redundant art revisions.

The browser is desktop emulation on a shared Linux host, with warm HTTP cache and instrumented `JSON`/localStorage operations. The nonmonotonic small/medium startup and artwork samples are retained; CPU scheduling, decoder/cache state and other concurrent tests affect them. The raw report retains median/p95 and every sample rather than hiding slow runs. Each sample adds a retained revision, preserving the final-source caps. Heap and CDP Task/ScriptDuration are observations, not isolated peak memory or physical-device CPU estimates. localStorage counters count cumulative UTF-16 code units read/written, not network bytes or billed database operations. Final comparison uses the same fixture, browser and instrumentation.

### Cost and scaling interpretation

The retained [cost model](evidence/cost-model.json) projects a five-person family's end-of-year-five monthly storage/metadata/object/network run rate of approximately **$0.023 / $0.295 / $2.581** for its low/typical/high assumptions. It includes one sizing allowance for a recovery copy. It excludes Cloud Run, load balancing, NAT/IP/worker compute, provider calls, support, logs, CI, taxes, discounts and free tiers. Rates are historical planning inputs, not newly verified pricing or observed bills; the target region and architecture must be read back before activation. The [environment cost model](../development/COSTS.md) supplies separate infrastructure/worker assumptions and warns about standing NAT/IP charges.

The storage projection cannot be called the total beta cost or a spending ceiling. Content sharing can reduce retained object bytes while increasing hashing, conditional puts, dependency reads and backup verification work. Full-workspace reads, serial reconciliation and a globally contended ledger can dominate latency before raw storage charges are significant. Keep metadata-only reads and bounded concurrent scans separate from the global atomic admission transaction: strict family/global spending enforcement must not be weakened for throughput. No cloud billing savings or production capacity result was observed in this assignment.

## Preserved November 24 implementation record

**November 24, 2026, America/New_York. Branch implementation, not deployed.** Continues PR166 head `1743c9e6560ae9416ec08a23cb660eb06af68351`, based on refreshed main `13260750b7771beb024cc6a94bf823ee5a4e29ff`. Main includes premium #139, environment preparation #155 and the CI work. No competing open storage PR was found. Other open branches include operations/evidence #143/#138/#116/#113/#110/#109/#105, historical environment #106/#45, test #84, optional analytics #83 and research #60/#54/#50/#31/#29. Their work remains untouched. A separate efficiency PR was not visible in that inventory; this work avoids static artwork and CI selection policy.

This package improves real application persistence and prepares additional adapters. **It does not complete the assignment's entire definition of done.** The existing application still has bounded whole-workspace stores, and the new indexed/cloud adapters have no application migration or live synchronization route. Those are remaining repository engineering, not Cloud Shell dependencies. [Inventory](INVENTORY.md), [implementation and activation](ROLLOUT.md), measured [baseline](evidence/baseline.json), [browser evidence](evidence/browser.json) and [cost model](evidence/cost-model.json) distinguish source, fixtures and projections.

### Selected architecture and alternatives

Retain the existing hybrid: synchronous local state for the current application, IndexedDB for transactional records and binary artwork, authenticated gateway/Firestore for authoritative remote metadata and private workspace-scoped GCS for immutable payloads; new split blobs also bind the family/Adult audience. Never make an AI prompt proportional to retained history. No new vendor, database service, synchronization framework or public object URL is needed.

| Alternative | Evidence and decision |
|---|---|
| PR166 full before/after journal | Exact and easy to inspect, but duplicates both complete records. In the 14,000-message fixture, two images occupy 9,078,695 UTF-8 bytes, excluding live sources. Reject as the default new implementation. |
| Compact reversible string journal | Common prefix/suffix stored once; exact original strings reconstruct without hashes or normalization. Same fixture needs 4,539,411 bytes. Selected for current synchronous create/copy APIs; still roughly one extra source copy and can exceed real quota. Fail before source mutation if intent cannot fit. This is recovery, not an unlimited-capacity solution. |
| IndexedDB transactional records | Browser benchmark supports indexed paging and small writes at 50,000 records. Implemented as an isolated adapter with atomic history/receipt/outbox. Preferred future authoritative device store after domain mapping, migration and all reader/export integration. Do not synchronously fake IndexedDB or migrate implicitly. |
| Whole Firestore workspace | Preserve current production contract. Its 3 MiB logical limit and repeated chunk reads/writes make it unsuitable as the eventual unbounded history store. New per-record adapter remains disabled and unmounted. |
| Per-record Firestore metadata + immutable private payloads | Version compare-and-swap, independently recoverable receipts, retained versions and soft tombstones. Selected preparation; gateway grant binding, sync orchestration, account provisioning/readback and migration still required. |
| Full cloud replacement | Reject: offline gameplay, latency and unnecessary operations are worse; it does not make local unsynchronized data durable. |
| Long revision delta chains / cross-family asset pooling / destructive TTL | Reject: fragile reconstruction, isolation changes and unauthorized deletion. Keep complete small definitions with shared immutable payloads. |

### Current architecture

```mermaid
flowchart LR
  UI[Trusted profile and game host] --> LS[localStorage: profiles, native graph, notebook, scenes, evidence]
  UI --> IDB[IndexedDB: original artwork, rigs, rewards, Pals]
  LS --> Files[Explicit family backup files]
  IDB --> ArtFiles[Explicit art bundles]
  UI --> GW[Authenticated gateway]
  GW --> FS[Firestore: bounded workspace chunks, jobs and receipts]
  FS --> GCS[Optional private immutable artifact objects]
  UI --> SW[Regenerable static shell cache]
  CI[GitHub CI] --> Artifacts[Build archives and evidence with configured retention]
```

### Proposed future architecture

```mermaid
flowchart LR
  Host[Trusted host and responsive bounded views] --> Cache[IndexedDB records, immutable versions, pending outbox]
  Cache --> Sync[Authenticated incremental synchronization]
  Sync --> Gate[Gateway: current device, family, profile authorization]
  Gate --> Records[Firestore per-record versions and receipts]
  Gate --> Objects[Existing private workspace-scoped immutable payload store]
  Records --> Points[Versioned recovery manifests]
  Objects --> Points
  Points --> Recovery[Proposed graphical recovery]
  Cache --> View[Bounded AI context projection]
  Audit[Non-destructive reference and capacity reports] --> Records
  Audit --> Objects
```

The arrows beyond the current host are a target, not a deployed capability. Browser principal callbacks and server `ContinuityPrincipal` are integration contracts, not authentication implementations. The server adapter must only receive a principal produced by the current trusted-device/Adult/family authorization path. It exposes no HTTP route.

### Ranked implementation register

| Priority/category | Change | State and benefit | Remaining constraint |
|---|---|---|---|
| 1 / A | Exact reversible creation/copy journal | Integrated with staged workspace/notebook/profile bytes, writer lock, startup and authenticated Adult entry; pending rollback or committed cleanup before readers | localStorage physical quota; older readers cannot safely ignore an intent |
| 1 / A | Construction and learning-format copy | Stage profile alongside game and conversation; update live profile only after durable commit | Other legacy Keep/preview flows retain their existing compensation and are not all covered by this journal |
| 1 / A | Atomic coach reply/evidence | One notebook write contains plan, provenance, reply messages and source reward outbox | Capacity or quota can still reject the entire reply; no durable overflow inbox or paid replay |
| 1 / A | Remote copy uncertainty | Persist request identity before POST; retained intent uses GET-only reconciliation; gateway duplicate identity returns same revision; local completion clears intent atomically | Backend-first rollout; an unadmitted uncertain intent remains unresolved, never automatically retried |
| 2 / A | Revision validation indexes | Maps and memoized ancestry retain cycle/owner validation without repeated graph scans | Existing project/revision/play caps unchanged |
| 2 / A | Notebook validation cache | Reuse validation only for exact unchanged raw bytes; return independent copies and observe external changes | Still parses/clones a whole notebook; not paginated application UI |
| 3 / B | Indexed record persistence | Atomic records/history/receipts/outbox; indexed pages; conflict rejection, acknowledgment and remote application | Isolated preparation; complete schema migration and application adapters remain |
| 4 / B | Shared artwork/code payloads | Opt-in v2 private manifest; same asset bytes stored once across mechanic-only revisions; exact legacy decode | Disabled by default; compatible reader rollout and real-art acceptance required |
| 5 / B/C | Firestore continuity | Per-record CAS, immutable history, idempotent receipts, default-off service, memory and Firestore adapters | Gateway route, verified principals, paginated server pull and application sync orchestration remain |
| 6 / C | Automated backups / retention | Reference tracing, versioned history and resumable hash-verified recovery-point manifests; proposed recovery policy and activation plan | Complete backup scheduler/manifest restore UI and owner retention/RPO/RTO decisions |
| 7 / D | Automatic user-record GC | No delete API or job added | Reconsider only after complete reference roots, retention approval and recovery evidence |

### F06 disposition

- Browser termination between local create/copy writes: integrated rollback before use. Current journal has pending and committed phases; after the committed marker, cleanup failure does not report lost work. All key images are checked before recovery writes. Unknown bytes, corruption or wrong scope stop recovery without erasing data.
- Profile/construction copies: the staged host cannot directly call the legacy save. Its profile image joins the transaction. Copy learning mode joins it as well. Existing data formats and engine IDs remain unchanged.
- Concurrent tabs: existing origin-wide `jems-source-writer-v1` remains the only lock. Recovery asserts lock ownership but can run while ordinary source writes are paused. Any pending journal blocks normal source saves and backup replacement. Adult journals are only read after a fresh authenticated grant.
- Remote copy: request ID persists with source, name and API origin; unknown acknowledgment never causes another POST. Notifications and a visible Check my copy action expose pending copies after reload. Duplicate server identity is family/Adult audience scoped. Unknown request lookup does not prove a failed admission. No paid operation is introduced.
- Conversation: a reply's design/provenance and up to three message entries save as one notebook write. Capacity validation rejects the entire transition. Existing child draft remains; durable overflow and independently stored provenance are open.
- Backup/restore: existing family undo journal remains authoritative for its stores. It cannot start over a pending project journal. Existing backups and original image bundles retain their separate formats. Coordinated arbitrary-store backups have not been replaced with a new untested protocol.
- Saved games/art: full definitions, original bytes, rig hashes, Keep/Undo/Fork identities and frozen engines remain. No real Splash or Pass/Dragon family records were accessed; preservation evidence is synthetic and existing regression coverage, not actual-data acceptance.

### Capacity and performance evidence

`node --import tsx tools/storage-benchmark.ts` reproduces a warm-process comparison with the original PR166 source. It does not measure physical-device startup. `node tests/storage-browser.cjs` uses actual Chromium localStorage, Web Locks, IndexedDB and renderer termination; desktop/tablet/phone are emulated layouts.

| Metric | Before | After | Scope |
|---|---:|---:|---|
| Validate 500 native revisions, median | 136.64 ms | 1.29 ms | Synthetic Node, 25 samples; same 500 cap |
| Retrieve one session from 14,000-message notebook, median | 32.91 ms | 20.38 ms | Warm cached validation; whole notebook still cloned |
| Recovery image encoding | 9,078,695 bytes | 4,539,411 bytes | Common-content sharing; UTF-8 measurement, browser accounting varies |
| 50 revisions with identical 450 KB artwork/code | 23,928,030 object bytes | 525,358 object bytes | Opt-in encoder; synthetic bytes, 97.8% less; objects increase 50→52 |
| Same encoding CPU | 222.00 ms | 316.96 ms | Cold synthetic encoding; savings trade off more puts/hashing; not network latency |
| 100-record IndexedDB page, 1k→50k records | Whole-store design not applicable | 7.4 / 4.2 / 4.2 ms median (1k / 10k / 50k) | Isolated browser adapter; latest exact samples in JSON |
| Small IndexedDB save, 1k→50k records | Whole-store design not applicable | 2.2 / 1.3 / 1.4 ms (1k / 10k / 50k) | Isolated browser adapter, not current production saves |
| Application conversation capacity | 80 sessions/chapters; 200/page | Same | No caps inflated and no history silently discarded |
| Recovery reliability | 19 offline prototype cases | Additional fault tests and 18 renderer boundaries | Passing fixtures are not a field reliability percentage |

The 4.31 MB notebook plus even the compact journal can exceed a browser's localStorage budget. A smaller journal reduces amplification; it does **not** close structural capacity. The indexed adapter can store 50,000 independent records without scanning all of them for a page, but the application has not been migrated to it. Multi-year fixture counts model five profiles × five years × 2,000 metadata records; the separate conversation fixture models retained text. They do not substitute for a realistic entire family import with large decoded images and every domain.

### Economics

`node tools/storage-cost-model.mjs` generates low/typical/high assumptions for five people over five years and linear 100/1,000-family sensitivities. It includes assets, revision/conversation metadata, a recovery-copy allowance, database operations, object operations and network allowance. It excludes model inference, compute, logs, CI, tax and support. No spending was activated.

Rates were read from official [Firestore Standard pricing](https://cloud.google.com/firestore/pricing) and [Cloud Storage pricing](https://cloud.google.com/storage/pricing) on November 24, 2026. Reference location is **us-central1**, not a claimed live configuration. Use $0.03/100k reads, $0.09/100k writes; hourly GiB rates ×730 produce about $0.15 database storage, $0.03 backup storage and $0.02 Standard objects per month. The $0.12/GiB egress sensitivity is an explicit assumption; verify the actual route and allowances before activation. Free tier is excluded from gross estimates. Index overhead, retries and retained versions can materially change cost. Lookup/hash documents avoid field indexes; the provided exemption must be merged with the actual index configuration.

The main drivers are original/derived artwork accumulation, revision duplication, device downloads and full-workspace amplification. Sharing unchanged art reduces retained bytes but adds immutable-object reads/puts; a process cache and per-operation deduplication are future optimizations if measurements justify them. No image recompression or quality reduction is proposed. Masters and runtime derivatives remain separate approved objects. Archiving only changes visibility.

Gross projected end-of-year-five storage/operations/network monthly subtotals are **$0.02 / $0.30 / $2.58** for low/typical/high, before the excluded services. These unusually small storage-only figures must not be presented as the total Jems bill. Typical retained assets are 4.69 GiB and metadata 0.41 GiB; high assets are 42.19 GiB and metadata 2.36 GiB. A full independent asset copy per revision would multiply the asset portion by 5 / 20 / 50 in the model. Actual duplication rates are unknown.

Chromium measurements overlap other local work: the [prior run](evidence/browser-prior.json) includes a 10k-record latency spike, and the [five-boundary run](evidence/browser-five-boundaries.json) includes a 1k-record spike. The final six-boundary run is also retained rather than selecting favorable samples. No stable throughput SLA or complete-application startup claim follows from this single run.
