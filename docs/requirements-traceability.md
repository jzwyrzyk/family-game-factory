# Requirements traceability — Issues #3/#4 / Assignment 001

Scope: charter phases 1–2 plus a local phase 3 vertical slice. “Implemented” means exercised code, not a design-only promise. Production cloud, arbitrary AI generation and full original-game fidelity remain open; see [gap analysis](gap-analysis.md).

| Requirement | Implementation/evidence | Status |
| --- | --- | --- |
| Audit and baseline | Gap analysis; original `tests/journeys.cjs` passed on charter branch before changes | Complete |
| Modular TypeScript/Vite runtime | `src/runtime/{types,manifests,lifecycle,registry}.ts`, individual `src/games/`, extracted legacy modules, `vite.config.ts`; strict typecheck and production build | Implemented; legacy game internals remain JS |
| Lifecycle start/play/win/lose/retry/next/dispose | Typed lifecycle wraps three engines; duplicate/stale completion guard; old browser journeys and lifecycle unit test; browser tests play bucket win/loss and builder completion/next | Working existing game lifecycle preserved |
| Typed editable mechanics manifest | Validated numeric/boolean allowlist, finite/range/step checks, unknown-key rejection; three plugin manifests | Implemented |
| Separate math and game difficulty | Config never includes math fields; plugins receive config/callback only. Desktop/mobile test preserves fact evidence, age, focus and intensity | Implemented |
| Child-led real natural-language change | Local grammar in `src/factory/interpreter.ts`; examples visible; actual count/clue/duration rendered and played, builder/dragon parameters consumed by engines | Implemented for bounded grammar |
| Five play/change iterations | `tests/live-remix.cjs`, desktop and mobile: four buckets, reveal clue, 400ms splash, hide clue, two buckets; checks runtime state, actual bucket controls and elapsed round duration | Automated |
| Compare and replay versions | Mechanics table and play chosen version without changing head; browser test four-bucket prior version vs two-bucket current | Implemented/tested |
| Undo, branching, fork, reload | Immutable parent DAG, checkout, non-destructive undo, sourceRevisionId fork; browser test alternate future, saved named game reload and replay | Implemented/tested |
| Three revision states | Input/preview is ephemeral, Try commits private local revision; release state not enabled | Partial; tested public release pipeline pending |
| Child-owned design coach | Real `PlayOutcome` + immutable revision; optional one-question reflection/prediction state machine; skip; next play includes hypothesis and “not proof” qualification | Implemented/tested |
| Local durability and migration | Atomic local write before changing memory; versioned workspace migration; original math/profile key untouched; parent backup includes optional workspace | Implemented/tested |
| Invalid or broken changes preserve last working | Reject non-schema values, unsupported/mixed instructions, quota failure, corrupt workspace, invalid DAG; no eval or dynamic generated modules | Implemented/tested for local config |
| Genuine unfamiliar new mechanic | Test-only MockAgent produces a playable star-catching mechanic, browser-gated in a separate-origin sandbox; remote UI labels mock. Unsupported production intents say Needs builder | CI mock implemented; real general AI pending |
| Secure managed-service scaffolding | `server/pipeline/` authenticated reference API, hard application budgets, immutable revisions, durable single-process file queue, idempotency/retry/cancel/audit; `server/openapi.json`; browser and unit tests | Reference implementation tested; cloud/identity/provider deployment pending |
| Generated-code isolation | No arbitrary agent JS accepted; closed declarative artifact validation; distinct-host preview with opaque sandbox and hashed-script/no-network CSP; browser parent-access denial test and static-secret scan | Declarative isolation tested; arbitrary code worker pending |
| Privacy and parent controls | Existing local pseudonymous profiles, hints/focus/rate/settings and export/restore preserved; backup includes optional private workspace; no automatic sharing | Existing regression plus new isolation tests |
| Pages hosting and existing live arcade | `base: './'`, production browser test under `/arcade/`; main-only manual Pages workflow publishes `dist` if owner dispatches after review | Build deployable; no deploy performed |
| Desktop/mobile UI and controls | Existing keyboard/touch controls, added accessible bucket choices, native keyboard form/buttons, 375px touch test, screenshots under `docs/evidence` and CI artifacts | Chromium automated; real-device audit pending |
| Three original playable games | Existing browser regression preserved after extraction and all presets launch; builder win/next, bucket round, math/profile persistence | Existing working behavior preserved |
| Bubble Gum Builders original fidelity | Still fixed blueprint matcher; no freeform construction/gum graph/scoring | Explicitly pending |
| Dragon original fidelity | Existing team meatball battle, no shield-reflected attacks | Explicitly pending |
| Three-bucket original fidelity | Classic three-bucket implementation preserved; full original intended design not verified/reimplemented | Explicitly pending |
| Adaptive math and spaced review | Fact-level evidence, adaptive weakness sampling, hints, parent settings unchanged | Existing behavior preserved; full spacing scheduler pending |
| Drawing provenance/cutout/rigging | Contract type records source and explicit permissions; no upload/transform pipeline | Pending |
| Automated publish, rollback, offline export/PWA | No child experiments published; manual static shell workflow only | Later phases |
| Review, no paid deployment | Existing feature branch; PR to main; no auto merge, no cloud provisioning | Enforced workflow scope |

## Reproduction and evidence

`npm ci && npx playwright install --with-deps chromium && npm test` on Ubuntu 24.04 / Node 22. `npm test` typechecks, builds, runs unit/contract tests, old v0.3 regression and desktop/mobile Live Remix journeys. `test-results/` contains synthetic screenshots and is uploaded by CI. Selected screenshots and validation details are in [evidence](evidence/README.md).

Neither tests nor runtime contact an AI or cloud service. Test evidence contains only synthetic game names and default pseudonymous profiles.

## Issue #4 additions

| Requirement | Implementation/evidence | Status |
| --- | --- | --- |
| One-button self-service | Local and new-game Try It; unsupported requests route only to a configured builder; no child-facing GitHub/Codex/development-copy instructions | Implemented |
| Truthful availability | Static config defaults unavailable; queue status only after acknowledged job ID; test mock clearly labeled | Implemented/tested |
| Job state machine | Draft/queued/building/testing/ready/failed/cancelled, payload-bound idempotency, two retries, cancellation, timeout, private audit and crash recovery | Reference service tested |
| Private auth and spending cutoff | HMAC session verification, family guards, Origin/CSRF policy, parent-controlled allowance, atomic reservation/settlement, disabled paid agents | Reference enforcement tested; enrollment/Firestore adapters pending |
| Novel mocked mechanic | Browser-gated star-catching artifact, distinct gameplay, play/win/replay/revise/compare/keep/undo/fork/reload on desktop/mobile | Implemented in labeled CI mock |
| Failure preservation | Failed/rejected/timed-out/cancelled candidates never update kept active pointer | Unit/browser tested |
| Secure adapter and OpenAPI | Server-only interfaces, private preview capability, typed contract spec, no static secret or mock implementation bundled | Implemented/tested |
| Codex entitlement research | Official noninteractive/auth/pricing docs reviewed; enterprise automation conditional; no account entitlement or funding verified | Recorded; subscription/API adapters unavailable |
| Real-agent smoke | Explicit SKIP: no verified/funded backend. No credential egress code enabled | Not run; production configuration and approval required |

See [agent pipeline](agent-pipeline.md) for precise scaffold/production boundaries and [research](codex-agent-research.md) for sources. No paid service is deployed.
