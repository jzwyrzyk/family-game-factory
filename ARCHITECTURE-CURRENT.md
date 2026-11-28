# Jems current architecture

The browser owns play, local creation and the learning host. The family gateway owns authorization and durable job admission. A separate preview origin runs generated content. The private worker and private coach have independent credentials, consent and spending boundaries. The family beta adds per-family workspaces and isolated origins. [Family architecture](docs/family-beta/ARCHITECTURE.md) · [Deployment and acceptance](DELIVERY-STATE.md)

## Component and source map

| Component | Responsibility and source of truth |
| --- | --- |
| Browser entry and curated runtimes | [src/main.ts](src/main.ts), [runtime registry](src/runtime/registry.ts), [manifests](src/runtime/manifests.ts), and [games](src/games/) install existing game implementations. Preserve old saved-game runtime choices when changing defaults. |
| Native Jem Factory | [Game](src/games/gem-factory.ts), [pattern rules](src/games/gem-factory-pattern.ts), [cutter rules](src/games/gem-factory-cut.ts) and [physical sorter](src/games/gem-factory-physics.ts) provide a six/seven-piece repeating clue, one-jem routing through machine-mounted Keep/Return controls, and a broad timing target. A missed cut recycles only the current jem on the paused game clock. The default order contains two gifts; a separate completed-pattern counter raises difficulty every two finished gifts even within custom orders. The existing profile-owned `gem-factory-v1` save gains optional `patternsCompleted`; older saves retain their unlocked tier through a level-based fallback. Wrapping still changes the actual gift and its current-round collection. Required learning, saved revisions and shared rewards keep their existing owners; no new learning score or data store is introduced. See the [feature contract](docs/brand/GEM_FACTORY.md). |
| Studio | [UI](src/studio/ui.ts), [coaching](src/studio/coaching.ts), [creation readiness](src/studio/creation-readiness.ts), [guided planning](src/studio/guided-planning.ts), [adapter](src/studio/adapter.ts), [design records](src/studio/design.ts), and [notebook](src/studio/notebook.ts) coordinate conversation, evidence-bound first-creation readiness, drafts, experiments, play and explicit Keep. Request compilation has no independent generation authority. The adapter reuses existing game engines, learning and revision storage. |
| Shared native Mining and build-wait activity | [Mind Your Jems](src/games/mind-your-jems.ts) and its [native adapter](src/games/mind-your-jems-native.ts) reuse a local layered illustrated game with separate in-memory round state and responsive input in the common player. [Rules](src/games/mind-your-jems-rules.ts) do not alter learning or generated-job progress. Studio keeps the authoritative owner, job readiness, pause and explicit candidate handoff; tests use mocked build statuses, not paid services. [Feature contract](docs/mind-your-jems/README.md). |
| Cosmetic making journey | [Evidence derivation](src/brand/gem-progress.ts), the owner-scoped [maker renderer](src/brand/maker-identity.ts), [journey page and rank thumbnails](src/brand/journey.ts), and [Delight popups](src/brand/delight.ts) use the active owner's validated Studio evidence. The same selected-maker/level mapping chooses the unchanged native Spark/Nova atlas frame for Journey, cards and earned popups. This browser feature adds no backend endpoint, paid request, learning score or independent award database. |
| Lifetime engagement rewards | [Policy and receipts](src/rewards/model.ts), [transactional local ledger](src/rewards/store.ts), [learning source adapter](src/rewards/integration.ts), [source write guard](src/rewards/write-guard.ts), and [Rewards UI](src/rewards/ui.ts) connect saved activities to cumulative nonspendable gems. Source outboxes are projected idempotently; existing maker rank is rendered alongside the total and is never computed from it. See the [Rewards contract](docs/rewards/README.md). |
| Approved visual library | [Brand library v1.2](docs/brand/LIBRARY_V1_2.md) and its [asset/provenance map](docs/brand/art-library/README.md) define the current supplied logo, five Gem companion poses, factory artwork, local fonts and shared interface states. Runtime artwork is served locally from `public/jems-art/`; existing `public/jems-journey/` atlases remain the canonical maker/gem source. Visual assets do not create gameplay or determine progress. |
| Private Art Studio | [Library and entry points](src/drawing/studio.ts), [original storage](src/assets/private-drawings.ts), [atomic art stores](src/drawing/library.ts), [movement editor](src/drawing/lab.ts), [portable bundles](src/drawing/transfer.ts) and [scene adapter](src/creation/private-art.ts) preserve original pixels, exact rig revisions, recovery and profile ownership. Native Rally revisions carry `drawingRigId`; scene actors use validated local hash-bearing references. Generated manifests remain bundled-only. See the [feature contract](docs/drawings/ART_STUDIO.md). |
| Creation Studio | [Scene UI](src/creation/ui.ts), [model](src/creation/model.ts), [deterministic engine](src/creation/engine.ts), [source adapters](src/creation/projects.ts), [challenges](src/creation/challenges.ts), and [observations](src/creation/progress.ts) share editable actions between free scenes and rebuild practice. `?creation=1` and the Studio navigation open the separate page; supported games link exact source revisions through Animate & code. |
| Local changes | [Interpreter](src/factory/interpreter.ts), [routing](src/factory/remix-routing.ts), and [workspace](src/factory/workspace.ts) implement bounded supported edits and immutable local revision history. Unsupported mechanics need the builder; a label change is not a mechanic change. |
| Learning | [Math engine](src/learning/engine.ts), [language engine](src/language/engine.ts), [host](src/learning/host.ts), and [remote adapter](src/learning/remote.ts) keep subject evidence, checkpoint policy and pause/resume in trusted host code. Generated game code does not choose grades or bypass learning. |
| Formative problem-solving observations | [Evidence modules](src/problem-solving/) retain versioned, owner-scoped activity context and structured reasoning choices. Trusted-host signals/adapters observe Math, Language, Creation and Studio; original deterministic practice supplies specific rule outcomes. Try an idea (`?problem-solving=1`) is optional. Parent/My Powers reports preserve source, support and coverage; no LLM or generated-game grader is introduced. |
| Browser remote client | [Builder client](src/builder/client.ts) validates configuration, submits/polls/cancels durable jobs and checks preview origin. [familyFetch](src/builder/session.ts) handles trusted-session checks and renewal. |
| Temporary adult profile | [Profile UI](src/adult-pilot/ui.ts), [tab session](src/adult-pilot/session.ts) and [storage adapter](src/adult-pilot/storage.ts) integrate the switch with the existing selector, cancel stale UI work and isolate local adult records. [Server policy](server/adult-pilot.ts) and [trusted-device routes](server/trusted-devices.ts) issue and verify the revocable grant. |
| Guardian privacy choices | [Parent panel](src/builder/privacy.ts), [consent policy](server/privacy/parent-consent.ts) and [owner verification](server/privacy/owner-verify.ts) separate pending choices from externally verified scope evidence. Both guardian and adult owner commands reuse the configured workspace/artifact bucket. Parent management and adult development authorization are different grants. |
| Gateway | [server/gateway.ts](server/gateway.ts) composes family sessions, trusted devices, job API, worker callbacks, coach and audio routes. [JobService](server/pipeline/service.ts) owns family-scoped jobs, revisions, idempotency and admission. |
| Private generation and review | [Coordinator](server/actions/coordinator.ts), [dispatcher](server/actions/dispatcher.ts), [worker identity](server/actions/identity.ts), [worker CLI](server/actions/worker-cli.ts), and [agent](server/agent/openai.ts) connect authenticated generation/test/review stages. Generation plans, optionally prepares approved art and writes code; review evaluates captured evidence without executing source. |
| Game Intelligence | [server/quality](server/quality/) owns source-grounded intent/form advice, style plans, evidence binding, four-axis acceptance and sanitized repair diagnostics. [Capture](server/sandbox/quality-capture.cjs) observes actual desktop/tablet play; [independent authored playtests](server/sandbox/intent-playtest-v2.cjs) remain a separate optional internal contract. Missing required captured behavior cannot become a review pass. See [current quality contract](docs/game-intelligence/PRESENTATION-QUALITY.md) and [earlier research evidence boundaries](docs/game-intelligence/merge-handoff.md). |
| Generated artwork | [Asset validation](server/agent/game-assets.ts) owns bounded immutable PNG/WebP packs and provenance. [Image production](server/agent/illustrations.ts) needs separate explicit approval and budget; code-native games can use an empty style-bearing pack. The trusted renderer decodes approved bytes; generated source references IDs. Child-art upload/library discovery is not added by this path. |
| Isolation and preview | [Docker gate](server/sandbox/docker-gate.ts), [sandbox worker](server/sandbox/worker.cjs), [trusted runtime archives](server/sandbox/trusted/README.md), [preview server](server/preview-server.ts), and [preview handler](server/pipeline/http.ts) separate untrusted games from credentials and the app origin. |
| Coach and speech | [Coach service](server/coach/service.ts), [speech service](server/coach/speech.ts), [private bridge](server/coach/private-bridge.ts), and [private executor](server/coach/private-executor.ts) enforce separate consent, identity, budgets and provider availability. The [approved input contract](docs/issue-28/PUSH_TO_TALK_MVP.md) is Speak → transcribe → edit → explicit Send; Build remains separate. |
| Deployment tooling | [Deployment scripts](scripts/deployment/) build and configure gateway, preview and private coach; [Pages workflow](.github/workflows/pages.yml) publishes the browser build through manual dispatch. Their presence is not deployment evidence. |

## Conversation-led creation, readiness and Build handoff

Speak creates an editable draft. Send requests coaching. Build submits the selected idea using a durable request identity. Recover an uncertain submission through authorized lookup before another charge. Keep and Undo are explicit per-owner revision operations. The original drawings, pinned scene revisions and older games must survive migration and restore. [Creation and recovery](docs/child-continuity/README.md) · [Storage rollout](docs/storage/ROLLOUT.md)

## Validation and delivery

The production browser bundle, disconnected DEV/TEST bundle, offline HTML reviewer and published Pages artifact have separate source and configuration identities. Required Arcade aggregates verify immutable build and command receipts. Release consumers enforce exact reviewed source, artifacts, configuration and environment. The private environment controller reconciles protected source and validates downloaded data before privileged deployment. [Environment contract](docs/development/DEV-TEST-PROD.md) · [CI evidence](docs/evidence/README.md#ci-architecture-and-performance)

The [combined owner-review draft #223](https://github.com/jzwyrzyk/family-game-factory/pull/223) extends these boundaries with shared learning interruption/return and owner-local pinned original artwork, including exact image or rig revisions. Its source and fixture evidence are not current-main or general remote private-art support; see the [delivery gates](DELIVERY-STATE.md). The existing architecture above remains the merged baseline until integration. Merged [#225](https://github.com/jzwyrzyk/family-game-factory/pull/225) adds exact-held-source DEV verification; [#230](https://github.com/jzwyrzyk/family-game-factory/pull/230) installs the bound static environment controller. Static fixture previews remain disconnected and are not integrated TEST. Separate draft [#226](https://github.com/jzwyrzyk/family-game-factory/pull/226) prepares isolated TEST services, named storage, protected UAT receipts and exact-manifest production/recovery gates; [#235](https://github.com/jzwyrzyk/family-game-factory/pull/235) prepares persistent DEV planning only. See [delivery state](DELIVERY-STATE.md) for deployment and acceptance evidence.

Consult the [feature index](docs/README.md) for API, family isolation, learning, drawing, gameplay and operations contracts. The [November 26 architecture record](docs/history/2026-11-26/ARCHITECTURE-CURRENT.md) preserves the full subsystem notes, prior integrations and source identities.

<details>
<summary>Previous section links</summary>

##### [November 22 — unified catalogue and Notifications candidate](docs/history/2026-11-26/ARCHITECTURE-CURRENT.md#record-line-35)

##### [Child experience modernization candidate](docs/history/2026-11-26/ARCHITECTURE-CURRENT.md#record-line-49)

##### [System boundaries](docs/history/2026-11-26/ARCHITECTURE-CURRENT.md#record-line-64)

##### [Bubble Gum assembly candidate — November 22, 2026](docs/history/2026-11-26/ARCHITECTURE-CURRENT.md#record-line-66)

##### [Profile, play and reading candidate — November 21, 2026](docs/history/2026-11-26/ARCHITECTURE-CURRENT.md#record-line-70)

##### [Parent reporting](docs/history/2026-11-26/ARCHITECTURE-CURRENT.md#record-line-78)

##### [Adult Private premium game builder](docs/history/2026-11-26/ARCHITECTURE-CURRENT.md#record-line-106)

##### [Private worker deadlines](docs/history/2026-11-26/ARCHITECTURE-CURRENT.md#record-line-145)

##### [Existing destinations and continuation](docs/history/2026-11-26/ARCHITECTURE-CURRENT.md#record-line-151)

##### [Drawing, art and saved-version continuity](docs/history/2026-11-26/ARCHITECTURE-CURRENT.md#record-line-209)

##### [Functional icon and state-art adapters](docs/history/2026-11-26/ARCHITECTURE-CURRENT.md#record-line-219)

##### [Contracts to consult before changing an API](docs/history/2026-11-26/ARCHITECTURE-CURRENT.md#record-line-225)

##### [Learning presentation and optional narration](docs/history/2026-11-26/ARCHITECTURE-CURRENT.md#record-line-244)

##### [Combined storage and family-beta continuation — source candidate](docs/history/2026-11-26/ARCHITECTURE-CURRENT.md#record-line-250)

##### [Data ownership and persistence](docs/history/2026-11-26/ARCHITECTURE-CURRENT.md#record-line-260)

##### [Shared rewards, source handoff and concurrency](docs/history/2026-11-26/ARCHITECTURE-CURRENT.md#record-line-299)

##### [Collectible companions and editable Pal scenes](docs/history/2026-11-26/ARCHITECTURE-CURRENT.md#record-line-316)

##### [Approved character and expression previews](docs/history/2026-11-26/ARCHITECTURE-CURRENT.md#record-line-328)

##### [Making journey integration and evidence](docs/history/2026-11-26/ARCHITECTURE-CURRENT.md#record-line-340)

##### [Editable creation and generated companions](docs/history/2026-11-26/ARCHITECTURE-CURRENT.md#record-line-356)

##### [Formative problem-solving evidence](docs/history/2026-11-26/ARCHITECTURE-CURRENT.md#record-line-374)

##### [Trust and execution rules](docs/history/2026-11-26/ARCHITECTURE-CURRENT.md#record-line-386)

##### [Adult development and future child authorization](docs/history/2026-11-26/ARCHITECTURE-CURRENT.md#record-line-402)

##### [Cross-repository and release coupling](docs/history/2026-11-26/ARCHITECTURE-CURRENT.md#record-line-418)

##### [Automated development environments: source foundation](docs/history/2026-11-26/ARCHITECTURE-CURRENT.md#record-line-448)

##### [Early learner development stack](docs/history/2026-11-26/ARCHITECTURE-CURRENT.md#record-line-456)

##### [Early-preview verification](docs/history/2026-11-26/ARCHITECTURE-CURRENT.md#record-line-460)

##### [Private family entry and operations](docs/history/2026-11-26/ARCHITECTURE-CURRENT.md#record-line-464)

##### [Standalone UI review adapter](docs/history/2026-11-26/ARCHITECTURE-CURRENT.md#record-line-482)

</details>
