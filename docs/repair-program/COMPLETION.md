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

## Private artifact storage adapter (disabled configuration)

- IMPLEMENTED-UNVERIFIED overall: an optional `artifactBucket` in the private gateway and preview configuration externalizes game payloads over 16 KiB to workspace-scoped, SHA-256-addressed private GCS objects. Firestore retains transactional jobs, family ownership, budgets and revision metadata. Legacy inline records remain readable. Object reads are bounded and digest checked; immutable writes use generation preconditions. An in-memory 32 MiB cache avoids repeated reads/writes of unchanged objects.
- VERIFIED-LOCAL unit fixtures: a 4+ MiB revision workspace round-trips through <20 KiB metadata; tampered/unsafe/missing-storage references fail closed; a fake GCS transport checks private immutable options and workspace paths. No real cloud or emulator calls are claimed.
- Owner action when configuration resumes: select/verify a private bucket in the existing project, enforce public-access prevention/uniform access, grant the gateway scoped object create/read and preview object read, and set the same bucket/workspace in both private configs. Do not enable a generic age-based deletion policy on referenced live artifacts. Review retention/export/orphan cleanup before activation. No bucket has been created and no deployment or paid request was made.
- Limits remain explicit: 3 MiB metadata, 8 MiB per payload, 100 MiB referenced payloads and 512 references per workspace. This is bounded POC storage, not unlimited storage. Authenticated drawing upload/sync, generated image/audio capabilities and complete deletion/retention APIs are still incomplete.
