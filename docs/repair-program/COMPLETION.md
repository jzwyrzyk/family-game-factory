# Issue 7 completion ledger

Partial implementation; no deployment or real-AI completion claim.

| Requirement | Code | Evidence/state | Remaining acceptance |
|---|---|---|---|
| Checksum recovery, 23 original PNGs | committed importer, references/original-games, public/assets/original-dragon | VERIFIED-LOCAL: importer checked 26 outputs | None for source recovery; distinct from integration |
| Native original Dragon artwork / solo reflection | original-dragon.js | VERIFIED-LOCAL: desktop/mobile original art, idle loss and player-controlled reflection win | Remaining: explicit companion-contact probe, real-device touch review |
| Native original Splash rendering/music/endless worlds | original-buckets.js | VERIFIED-LOCAL: seven levels, locked choice, Down randomizer, meatball/pizza particles, five-change loop | Remaining: challenge/practice consequence regression and real-device audio review |
| Free construction / graph / budget / substitutes | construction.js, original-builder.js | VERIFIED-LOCAL: 200 solutions, substitute bodies, rotation geometry, budget, disconnection, UI win/reload | Full drag/rotation effects, progression challenge and geometry acceptance, UI win/reload |
| Typed remix, saved prototype compatibility | manifests, registry, interpreter, workspace | VERIFIED-LOCAL: old configurations route to retained legacy plugins; new settings explicitly control restored games | Desktop/mobile five-change regression passed; CI pending |
| Shared math, profiles, safe results | native adapters, legacy/ui.js | IMPLEMENTED-UNVERIFIED: shared host result path, explicit Splash rules; no independent grade UI | Complete math consequence coverage |
| Construction persistence | lifecycle persistence port, per-profile revision state | IMPLEMENTED-UNVERIFIED | UI reload passed; export/restore and rejected-state coverage remain |
| Fact targeting, due scheduling, assisted evidence | existing shared math | NOT STARTED for remaining repair requirements | Batch 2 |
| Game-specific hypothesis coaching | existing DesignCoach | NOT STARTED for additional repair requirements | Batch 2 |
| Novel live generation / five real changes | merged Assignment 002 pipeline remains disabled | BLOCKED for live acceptance | Cloud configuration paused; verify existing project/resources, environment secrets and OIDC; full gVisor browser gate; then observed bounded real requests. Funding/account creation not required again. |
| Private uploads, validated assets, large artifact storage, sync/PWA/export | existing contracts | NOT STARTED for additional implementation | Batch 4; deployment remains paused |
| Pages release and live gameplay | existing manual main-only workflow | BLOCKED pending reviewed, passing batch | No branch deployment; reviewed merge and passing gates required before Pages dispatch. Current deployed SHA is not this candidate. |

Rollback: current main `dcb887e6a51ba000fda1ccc42b9d198f8b9895f9`; original storage keys and immutable revision records are retained. New construction snapshots are additive profile fields and included in existing backups. Missing `originalRules` explicitly selects the saved legacy engine; new original presets use restored engines. Legacy hearts/breath/slot settings are not silently mapped to unrelated original mechanics.

Original asset files are byte-identical, with no crop/rig changes; rendering uses the recovered hero upper/leg rig and scene scale code. The shield return trajectory removes downward acceleration after reflection so the intended return reaches the dragon. This gameplay change needs explicit behavioral evidence before acceptance.

Local evidence: `npm test` baseline with the revised journeys and five-change suite passed before the final construction-rotation assertion; final complete run is in progress. Expanded `tests/restored-games.cjs` passed both desktop and mobile. Screenshots are Chromium viewport emulation, not real Android/iOS device evidence. No deployment SHA exists for this batch.

## Shared-learning batch (stacked on restoration)

- IMPLEMENTED-UNVERIFIED overall: explicit parent multiplication-fact targets, bounded validation, injected-clock due scheduling, avoidance of immediate repeats when alternatives exist, independent/assisted evidence with attempts and timestamps, and game-specific outcome text in the optional coach.
- VERIFIED-LOCAL: 35 unit tests; targeted browser flow for parent fact override, Practice hint/recovery, Original Challenge ending a run, reload and backup restoration. Full combined regressions/CI pending.
- Additive profile fields: `factTargets`, `learningEvidence` (latest 500 records), `dueAt`, `lastAttempts`, `lastIndependent`, `lastFact`. Existing cumulative skill counts and legacy backups remain readable. These are provisional practice estimates, not certified mastery.
- Still incomplete: prerequisite catalog beyond worked arithmetic hints, general fact targets outside multiplication, a configured real-model coach, real-device accessibility and all cloud/live-generation acceptance.

## Offline/revision usability batch (stacked)

- IMPLEMENTED-UNVERIFIED: explicit redo of the latest child, preserving alternate futures and profile authorization; installable manifest; content-hashed static-shell cache; user-triggered update activation; build SHA/dirty-state marker.
- VERIFIED-LOCAL: offline browser test loaded the original Dragon art and started native gameplay after network disconnection. Cache keys exclude `factory-config.json`, authenticated APIs and private previews. This adds no cloud storage or public upload endpoint.
- NOT STARTED: private upload/cutout/rigging UI, authenticated sync/object-storage implementation, standalone game export and deletion/retention UX. Those remain real implementation gaps, not owner-action blockers. Real AI activation and deployed-service verification remain blocked by paused configuration and the full isolated-runner gate.

## Approved restoration deployment

PR #8 was explicitly approved by the owner, merged, and deployed through the existing main-only Pages workflow. Deployed merge SHA: `3e9825263da36bcb8fd24bd7def522c3ba1acd5d`. Workflow: https://github.com/jzwyrzyk/family-game-factory/actions/runs/43676271084 . Git tree matches the CI-tested PR head `c71e83953d98a37f184215094c4f78ef50881bfd`.

DEPLOYED-VERIFIED for the tested restoration subset: the actual public URL passed desktop and mobile-sized Chromium gameplay tests (idle Dragon loss/player reflection win, seven Splash levels with locked choice and distinct food particles, construction assembly/win/reload). The published HTML, JS, CSS and all 23 original PNGs match the deployment artifact byte-for-byte; see evidence/live/asset-proof.json and live screenshots. This is viewport emulation, not a physical Android/iOS test. The browser trusted this workspace's inspection proxy using its pinned public key; no production TLS setting was changed. Neither learning PR #9 nor offline PR #10 is part of this deployed SHA.

Issue #7 remains PARTIAL. The residual construction, shared learning, private storage/assets and real-generation requirements remain open. Funding and account creation are not blockers; cloud configuration is paused, resource/identity wiring is unverified, and the full gVisor browser gate is still outstanding.

## Construction fidelity follow-up

- IMPLEMENTED-UNVERIFIED overall: pictured rocket/submarine/robot constraint guides, seeded household-kit variation with mandatory solvable core and optional substitute, proportional colored parts, visible launch/dive/dance and reduced-motion behavior.
- VERIFIED-LOCAL: 500 seeded kits include a solution within ten joints; touch drag/rotate via Chromium touch events, keyboard assembly, undo restoring gum, and actual rocket → submarine → robot progression pass. Screenshots capture the assembled structures, not only the result panel.
- Full combined CI is pending; this follow-up is not part of the approved/deployed restoration SHA above.

## Private on-device drawing batch

- IMPLEMENTED-UNVERIFIED overall: private IndexedDB image library scoped to local profiles, magic-byte/decode/size checks, 5 MiB per-file and 20 MiB device quota, original SHA-256 provenance, explicit separate centre-cutout derivatives, original export, explicit deletion and drawing decoration for newly created construction bodies. Existing constructions retain their selected asset reference.
- VERIFIED-LOCAL targeted browser: upload, cutout preserving original, actual build decoration, profile switching, reload, export/delete, malformed bytes rejection and no network uploads. Full CI pending.
- This is local private storage, not authenticated cloud sync. Existing progress JSON does not embed image bytes; originals have separate exports. Custom rigging, generated-game image/audio capability and private object-storage wiring remain incomplete; no public uploads or cloud calls were added.

## Private artifact storage adapter (disabled configuration)

- IMPLEMENTED-UNVERIFIED overall: an optional `artifactBucket` in the private gateway and preview configuration externalizes game payloads over 16 KiB to workspace-scoped, SHA-256-addressed private GCS objects. Firestore retains transactional jobs, family ownership, budgets and revision metadata. Legacy inline records remain readable. Object reads are bounded and digest checked; immutable writes use generation preconditions. An in-memory 32 MiB cache avoids repeated reads/writes of unchanged objects.
- VERIFIED-LOCAL unit fixtures: a 4+ MiB revision workspace round-trips through <20 KiB metadata; tampered/unsafe/missing-storage references fail closed; a fake GCS transport checks private immutable options and workspace paths. No real cloud or emulator calls are claimed.
- Owner action when configuration resumes: select/verify a private bucket in the existing project, enforce public-access prevention/uniform access, grant the gateway scoped object create/read and preview object read, and set the same bucket/workspace in both private configs. Do not enable a generic age-based deletion policy on referenced live artifacts. Review retention/export/orphan cleanup before activation. No bucket has been created and no deployment or paid request was made.
- Limits remain explicit: 3 MiB metadata, 8 MiB per payload, 100 MiB referenced payloads and 512 references per workspace. This is bounded POC storage, not unlimited storage. Authenticated drawing upload/sync, generated image/audio capabilities and complete deletion/retention APIs are still incomplete.
