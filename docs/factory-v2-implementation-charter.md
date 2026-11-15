# Family Game Factory 2.0 — Implementation Charter

Status: implementation branch created; requirements and architecture established. NOT a completed feature.
Source: original Family_Game_Factory_Development_Plan.md (2026-11-14), superseded only where its interim parent-mediated workflow conflicts with child-led live iteration.

## Product acceptance
Child can play -> describe change -> preview real mechanic change -> play -> repeat five times -> compare -> undo -> save as new -> reload without GitHub, parent or manual file transfer. A new unfamiliar game concept must ultimately generate a genuinely playable distinct mechanic. Never pass off a saved idea or ticket as generated game.

## Preserve original requirements
- Arbitrary natural-language ideas, reusable primitives plus new plugins when needed.
- Full start/play/win/lose/retry/progression; keyboard, touch and mobile controls; accessible tutorials.
- Original three games' intended mechanics and progression, including three-bucket Splash or Pass, Dragon game shield-reflected attacks, and Bubble Gum Builders free placement, gum joints, connection graph, structural scoring, randomized solvable object sets.
- Faithful child-drawing asset provenance, optional cutout/rigging with permission.
- Shared adaptive math: pseudonymous profiles, fact-level evidence, spaced review, hints, parent skill focus, separate math/game difficulty, no claims of certified mastery.
- Revision diffs, regression tests, rollback, save-as-new, optional offline HTML export, parent settings and privacy.
- No real child identifiers, photos or learning data in public GitHub; do not leak API keys.

## Chosen deployment
- Existing GitHub Pages hosts static PWA shell and published approved game packages.
- Managed Google Cloud backend: Cloud Run API, Firestore metadata, private Cloud Storage artifacts; separately isolated build worker.
- Server-side AI provider adapter, API keys in Secret Manager. Do not deploy paid services or assume Google Cloud account access without owner setup.
- Anonymous public arcade can play released content; authenticated family workspace for drafts, generation, private data.
- No arbitrary generated JS executing with main app origin or access to child credentials; sandboxed preview, isolated origin, strict CSP, limited network, time/memory budgets and artifact validation.
- Three revision states: ephemeral try, private saved version, tested published release. No GitHub commit required for each experiment.

## Development phases
1. Audit repository; create requirements traceability and gap analysis, test baseline.
2. Modular TypeScript/Vite game plugin runtime and mechanics manifest; preserve current working behavior, math data and Pages deploy.
3. Instant local Remix: validated parameter changes with honest natural-language interpreter, actual visible gameplay effect; revision DAG, undo, compare, fork, reload; child design-coach postplay state machine.
4. Cloud service: authenticated family sessions, private version store, rate/budget limits, generation job queue, idempotency and cancellation.
5. LLM routing: deterministic changes first, then isolated generated modules and assets; compile/test/repair, playable preview, child feedback.
6. Automated safe publishing, restore, privacy QA; full original-game fidelity work; cross-device validation.

## API contracts (proposed, versioned)
POST /v1/sessions -> scoped design session
POST /v1/interpret -> typed intent, confidence, supported vs generation-needed
POST /v1/revisions -> immutable config revision
POST /v1/generations -> job id (asynchronous)
GET /v1/generations/{id} -> queued|running|validating|ready|failed|cancelled
GET /v1/revisions/{id} -> private revision metadata and authorized preview reference
POST /v1/revisions/{id}/fork -> independent new game
POST /v1/revisions/{id}/publish -> gated release job
POST /v1/coach -> age-appropriate suggestion anchored to game event; skip supported

## Security/operations acceptance
- Child-generated prompts cannot modify factory security code or deployment pipeline.
- Private artifacts cannot be fetched without authorized family scope.
- No arbitrary internet, credentials or cloud metadata available to untrusted game build/preview.
- Application quotas and budget kill-switch; cloud budget alerts are not hard spending caps.
- Rejected or broken changes preserve last working revision.
- Tests: desktop/mobile gameplay, actual mechanics mutations, five iterations, undo, fork, save/reload, math migration, novel plugin, generated code isolation, publish and rollback.

## First Codex assignment
Implement phase 1 and phase 2 plus an end-to-end phase 3 vertical slice in this branch; do not simulate LLM integration as production AI. Write docs/gap-analysis.md and docs/requirements-traceability.md. Add tests and PR against main; never auto-merge. Cloud resources are NOT provisioned yet. Preserve existing live arcade until acceptance.
