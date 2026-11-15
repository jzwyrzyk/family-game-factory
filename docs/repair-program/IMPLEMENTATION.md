# Family Game Factory — Original-Intent Repair Program

Status: implementation assignment and source-recovery preparation. This document is NOT a claim that the game fixes have been implemented or deployed.

## Mandate

Restore Bubble Gum Builders, Splash or Pass, and Dragon Island Rescue to the requested mechanics, then close every shared gap: child-led live changes, learning, coaching, original artwork, revisions, private persistence, reliable generation and delivery. Batching is authorized; silently dropping requirements is not. Work from current main. Preserve the current site, backups, profiles and revision histories until each replacement is proven.

The product acceptance remains: **play -> describe a change -> actually play the changed version -> reflect -> revise -> undo/compare -> keep or save as new**, five consecutive changes, without a child opening GitHub/Codex, copying prompts or waiting for a parent ticket.

## Source hierarchy and recovered inputs

1. Explicit user instructions take precedence over assistant-created prototypes. Later user corrections override earlier conflicting mechanics.
2. User-provided `Pasted text.txt` is the design-intent specification. It specifies free placement/rotation/gum joints and multiple solutions, separate game/math difficulty, shared fact-specific learning, explanatory help, live edits, comparison and persistent versions.
3. The recovered standalone originals are behavioral/art references, not proof that every original requirement is complete:
   - `Dragon_Island_Rescue_SOLO_BALANCED.html`, SHA-256 `bb34ec66824282d70b60d949d48b91332105164694e76d8819d310bc85bf3320` (5,855,554 bytes; 23 embedded original PNGs).
   - `Splash_or_Pass_Choose_or_Randomize.html`, SHA-256 `eda572f39f60bd9ac120c76848c6a5cb4ef7b09f4a7ed24b221ff72b90b6d763` (38,209 bytes).
4. The existing repository games are regressions to repair, NOT acceptance baselines when they contradict those sources.
5. Use `tools/import_original_games.py` with the recovered source pack. It verifies exact originals and extracts PNGs without executing code or altering art. Import does not integrate or deploy a game. Do not replace missing art with invented emoji and call fidelity complete.

Recovered originals and art must be made available to the coding workspace. They are not automatically accessible to Codex merely because this ChatGPT conversation can read them. If unavailable, implement non-asset work and report that exact blocker; do not fabricate access.

## Batching and review discipline

Use one coordinating branch or short-lived batch branches from current main. Keep commits reviewable. Game source restoration and common host-contract changes need a single integration owner; do not have independent agents overwrite `src/legacy/ui.js`, manifests, storage migrations or lifecycle code concurrently.

Every requirement needs: requested behavior, implementing code, automated evidence, visual/play evidence, deployed build SHA, and remaining limitations. Valid states: NOT STARTED / IMPLEMENTED-UNVERIFIED / VERIFIED-LOCAL / VERIFIED-CI / DEPLOYED-VERIFIED / BLOCKED. A mocked request, a documentation commit, a passing launch test, and a real paid generation are different evidence.

## Batch 1 — Restore the three games and bind them to Live Remix

### GUM: genuine construction, not a matching worksheet

- Random household junk with selectable, draggable and rotatable objects. Keyboard and touch alternatives must work.
- A pictured/template goal gives structural constraints, not one required object ID per slot. Multiple assemblies and substitute objects can succeed.
- Ten gum sticks initially. Visible chew/place/connect interaction. Each valid joint consumes the defined amount; invalid attempts do not consume invisibly. Show remaining gum and permit undo/rework.
- Model actual connected components and attachment locations. Test structural completeness, plausible shape/balance and joint strength with explainable rules. Do not pretend a cosmetic shake is a physics simulation.
- Successful rocket launches visibly; an unstable construction produces understandable, funny feedback and a repair path. Ship rocket first within this batch, then the existing submarine/robot sequence and increasing-difficulty constructions before closing it.
- Generate or select object sets with at least one verified solution within the gum budget. Include a seeded solvability test across many generated levels. Do not generate arbitrary impossible levels.
- Difficulty must progress through meaningful construction constraints, not just adding unrelated decoys. Start forgiving; do not require precision placement from a young child.
- Expose gum budget, object-set constraints, joint strength and appropriate launch settings as typed, versioned remix mechanics. Existing highlight/decoy configurations migrate explicitly; do not invalidate saved projects.
- REQUIRED tests: two geometrically different successful rockets; a valid substitute object; disconnected structure rejected with reason; budget enforced; invalid connection leaves balance unchanged; touch drag and rotate; keyboard construction; undo restores gum and joints; each sampled generated level solvable; revision save/reload restores actual construction state.

### SPLASH: recover the original endless game

- Use recovered standalone visual/gameplay reference rather than extending the simplified emoji replacement.
- Three buckets in the ORIGINAL preset. Bucket-count changes are explicit remixes, not silent changes to the original.
- The player chooses manually with left/right, pointer/touch or buttons. DOWN starts the optional randomizer only. It must never randomize the chosen position automatically or move it after confirmation.
- Retain character selection, varied worlds and a persistent best score based on completed levels; no arbitrary two-level ending. Endless progression should remain fair, not become impossible or punish random chance as a skill failure.
- Liquid/food visibly travels from the bucket, covers the character and accumulates; it must not merely appear as an explosion. Include distinct meatball and pizza outcomes, not just text labels. Preserve the original energetic/silly sound direction, with mute and gesture-safe audio startup.
- Explain what counts as a failed run, when math occurs, how a correct answer advances/recovers, and how the best score is updated. Do not silently change these rules while replacing the math module.
- MATH POLICY RESOLUTION: the historical game requested wrong math -> end run, while the later factory spec requires parent-controlled, nonpunitive practice by default. Implement an explicit parent-visible Original Challenge rule for that behavior and a Practice rule for hints/recovery. No global punitive change and no confusing game-speed slider that changes math difficulty. Clearly label the selected rule before play.
- Integrate the shared math engine; do not leave an independent grade selector/question bank that bypasses parent settings. Retain compatible imported high scores.
- REQUIRED tests: classic three buckets; no auto-randomizer; Down-only randomizer plus touch equivalent; locked selection; meatball and pizza animation paths; repeated levels beyond the original short demo; score survives reload/profile switch correctly; both math consequence modes; keyboard/touch parity.

### DRAGON: restore solo shield-reflection combat and original art

- Restore original drawn characters, castle, cave and scene assets from recovered PNGs. Preserve proportions/cutouts; do not substitute stock emoji or redesign the drawings.
- Dragon fireballs start upward, not as direct homing shots at the hero. The player jumps into them using the always-available shield, returning them toward the dragon.
- Only the selected player can damage the dragon by reflection. No autonomous teammate fire, reflection, repairs or passive victory. Background companions may remain decorative.
- Remove direct meatball-shooting as the normal victory mechanism. Adapt instructions, controls, event logs, tests and remix descriptions accordingly.
- Missed fireballs visibly damage the ground/island significantly. On defeat, clouds turn red and sauce visibly pours from them. Ground impact and defeat must be observable and understandable.
- Level 1 is easy but genuinely losable; later levels increase gently. The recovered reference starts with two successful reflections and roughly five ground misses; preserve this as a starting balance, not a universal pedagogical claim.
- Bind health/ground resilience, fireball cadence, timing windows and relevant effects to validated remix settings. Preserve old saved values through documented mappings or retain a clearly labeled legacy version; never silently reinterpret unrelated keys.
- REQUIRED tests: idle play never defeats dragon; companion contact cannot damage it; player's airborne reflection does; unreflected impact damages island; terminal cloud/red/sauce sequence; a simple Level-1 winning route; gentle later-level progression; touch jump/held movement; original image assets load and are visibly used.

### Shared host contract for Batch 1

These are native factory games, not permanently disconnected HTML iframes with separate math/state. Adapt originals to the current plugin lifecycle, shared learning events, revision snapshots and design-coach event stream. Temporary standalone references are for comparison only. Clean up animation frames, listeners, audio and timers on navigation; pause while a math overlay is active. Persist outcome events once, not twice.

Update old tests that encode the wrong design (fixed-slot matching, teammate attacks, etc.). Replace them with stronger behavioral tests; do not simply delete regression coverage or make the new games look old so obsolete tests stay green.

## Batch 2 — Complete shared learning and child-led coaching

- Shared skill/fact catalog and evidence across original and generated games. Parent targets can include individual facts, such as 8x7 rather than all of multiplication.
- Deterministic answer validation, first-attempt evidence, attempts, help used and timestamps. A hinted answer is not equivalent evidence to independent retrieval.
- Due-review scheduling with an injected clock for tests; revisit weak facts over sessions, mix familiar work and stretch questions, avoid endless immediate repeats. Keep learning estimates explicitly provisional; do not use fabricated IXL scores or claim validated mastery.
- Clear prerequisite/support paths and worked hints for repeated errors. No assumptions about a child's diagnosis, emotions or aptitude from a loss or slow response.
- Parent overrides for skills, pacing, pressure and consequences. Preserve all current records and backwards-compatible backups with schema migration/rollback tests.
- Prompt at safe gameplay pauses, not mid-jump. Math stays separate from game difficulty and from the design-coach conversation.
- Coaching: one optional, game-specific question after play; what was enjoyable/unhelpful, child's proposed explanation, child's chosen experiment, comparison against the prediction, keep/revise/undo. Respect skip and free text; avoid leading the child to an adult-preferred answer.
- Use actual runtime evidence: e.g. disconnected joint, two missed fireballs, sauce pacing, rather than generic win/loss only. Describe observations, not inferred feelings.
- Implement real LLM coaching when a verified backend is configured; a local coach remains honestly labeled and functional offline. No pretend model responses.
- REQUIRED tests: weak-fact prioritization and non-repetition; due scheduling across days; independent vs assisted retrieval; hints and parent overrides; wrong-answer interruption safety; continuity across all three games, saved versions and reload; back-up restoration; coach skip and child-led hypothesis/evidence comparison.

## Batch 3 — End-to-end live creation and revisions

- Preserve the current in-tool loop and make both supported mechanics and genuinely novel safe requests work through one interface.
- Fix routing beyond exact phrase matches using a real server-side interpretation adapter where configured. Typed local operations remain deterministic and validated; no partial application of an unsupported compound request.
- A requested mechanic must visibly change gameplay; editing a label, saving an idea or filing a parent ticket is not success.
- Version game code, assets, config, learning-policy reference and serialized game state separately. Include compare, undo, redo/alternate branches, keep, fork/save-as-new, reopen after reload and immutable provenance.
- A failed generation/test/timeout/cancel never destroys the active revision. Real job state only after durable acknowledgement. Show a useful recovery message; keep playing while generation runs.
- Preserve the chosen GCP gateway -> private Actions generation -> isolated build/test -> private playable preview route. The implemented metered Responses adapter is not an already-verified subscription Codex worker. Do not relabel it or invent entitlements.
- REQUIRED real acceptance: from the deployed child UI generate a mechanically distinct game with the actual configured provider, make five actual changes including at least two non-preset mechanics, play every revision, compare, undo, fork and reopen, without an adult/GitHub/Codex step. Mock fixtures remain useful tests but do not close this gate.

## Batch 4 — Original artwork, audio, app quality and storage

- Reuse recovered originals now; preserve full-resolution source PNGs and record all crop/rig transformations. Asset provenance names must not contain unnecessary child identifiers.
- Build private drawing upload, preview, cutout/rigging and approved supplemental-asset flow. Never silently substitute generated art for a drawing. Do not make original private uploads public merely to let a worker fetch them.
- Generated-game asset/audio capability must not be limited forever to emoji/geometry. Expand the validated asset contract without weakening origin, network, package or credential isolation.
- Large touch targets, readable instructions, keyboard parity, accessible status messages, mute, reduced motion and portrait/landscape checks. Include actual Android Chrome and iOS/Safari checks when available, and label emulated viewport evidence accurately.
- Installable/offline PWA and optional standalone export of saved compatible games. AI generation requires connectivity; cached play must not pretend online builds are running. Service-worker update/version handling must prevent replaying the previous unstyled deployment defect.
- Private synchronized game/revision/profile storage, quotas, export, deletion and retention. Local recovery remains available. A local settings screen is not authenticated parent access.
- Resolve the documented 3 MiB POC family cap before loading source art into it: artifacts/assets belong in private object storage, metadata references in the database. Treat signed preview links as secrets and refresh safely after reload.

## Batch 5 — Activation and real production verification

The user already reports an existing Google Cloud project, linked billing, enabled services and $10 OpenAI API credit. Do NOT ask to create another project or fund the same account again. The exact project identity and deployed resources still need read-only verification through the authorized owner environment; an API being enabled is not a deployed backend. Cloud setup is paused while game repairs proceed.

- Complete the outstanding full gVisor/browser runner test on the approved runner with sufficient disk. Never bypass it, run generated source beside credentials, or treat a mock browser test as equivalent.
- Configure existing resources using the merged owner-setup checklist and least-privilege identities. No credentials in chat, public source, prompts, child JS or public Actions logs.
- Retain authentication, family scope, private drafts, rate/token/repair/concurrency limits and transactional model-usage reservations. Clearly separate model allowance, infrastructure costs and budget alerts; do not promise an absolute whole-cloud hard cap.
- Run one owner-observed paid generation within the configured allowance, record real provider/worker usage and then the full five-change test. Do not activate unlimited public requests.
- Validate original-game, learning, asset and privacy behavior again with the real service connected. Cloud deployment remains blocked wherever required owner access/secrets or sandbox evidence are missing; list exact blockers, not another generic setup tour.

## Deployment and completion for every batch

1. Commit executable implementation and updated tests; a docs-only change is never a completed repair.
2. Run typecheck, production build, unit/contract tests, updated original-game journeys, five-change journeys and security regressions. Preserve the pinned compatible CI runner.
3. Collect production-build desktop/mobile screenshots AND short gameplay evidence for changed mechanics. Inspect the assets and layout, not only HTML text.
4. Open a reviewable PR against current main, with requirements closed and explicit remaining gaps. Respect repository protections and keep security/billing activation gated.
5. After the batch is approved/merged, run the existing reviewed Pages workflow against main, verify published build SHA and actual live assets, then replay the changed behavior at the production URL. A green PR is not deployment proof.
6. Keep a tested rollback to the last working build. Preserve storage schema migrations and export recovery.
7. Continue the next authorized nonblocked batch without proposing a different product or turning remaining scope into vague future polish.

## Final done gate

All three original games match the requested mechanics and artwork; independent math works across them and new games; a child genuinely creates and changes novel games in-tool; coaching is optional and child-led; save/undo/fork/reload and private cross-device recovery work; actual paid generation and isolated execution pass; the live site is verified at the expected commit. Anything less is a labeled partial release, not 'all fixed'.
