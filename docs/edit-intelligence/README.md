# Jems Edit Intelligence — First executable slice (stacked on PR #48)

**Status:** headless/native editing adapter, **NOT wired into live Studio**, not merged/deployed, not predictive, and not capable of installing shared components into generated games.

## Ownership and dependency
- PR #48 `src/archetypes/catalog.ts`, `native.ts`: single source of truth for archetype concepts and native-game relationships. Don't copy the 22/77 definitions here.
- Existing `src/runtime/manifests.ts`: authority for real config keys, types, bounds, saved-engine capabilities, defaults and diff.
- Existing `src/factory/interpreter.ts`: local bounded language interpreter; never pretend it understands arbitrary child intent.
- PR #43: source-backed child intent and game-form verification remain upstream for novel builds.
- Existing Studio revision/preview/Keep/Undo/Fork, owner/device/session/budget/learning gates remain untouched.

## Implemented here
1. `makeNativeEditManifest(game, config, baseRevisionId)` intersects three gates: the saved native runtime's actual playable settings, PR #48's verified native links, and current engine-form compatibility. Every property includes an archetype concept label, but that label **does not** mean the mechanic is portable or installed.
2. `planEdit(target, originalRequest)` uses the existing local interpreter to return a validated, immutable **preview proposal**, or a `generation-required`/`review-required`/`unchanged` disposition. It does not write a workspace, call a provider, enqueue a job, or mutate a running game. Compound edits fail atomically.
3. `validatePreviewAgainstCurrent(preview, current)` verifies saved revision identity, original config and a fresh local interpretation before allowing a caller to use the proposed config. A real Studio host must still apply its owner-scoped revision and explicit Keep logic.
4. Negative tests prevent false instant claims for generated source, catalog-only/headless mechanics, original-vs-sticker-vs-physics settings, stale revisions, fabricated plans and arbitrary input.

## Explicit first-family boundary
The #1 research archetype `platformer` is **not** currently a general playable native engine. Moon Donut Dash is a working `endless-runner` and is the first native proof case for this editing adapter. Do not claim that Moon proves full platformer coverage or that the headless PR #48 components can be inserted into existing games.

## What this does NOT do
No new composed-game artifact, cross-game behavior installation, asset/scene replacement, user-facing suggestion buttons, paid calls, background speculative generation, training, telemetry, model authorization, source patching or deployed functionality. A `generation-required` result does not authorize or enqueue a paid request. Current native local editing remains unchanged until separately integrated through existing preview/Keep safeguards.

## Next PR: end-to-end edit manifest in the existing Studio
After PR #48 merge and CI on this PR:
- Have each accepted native-game build/revision materialize a game-specific edit readiness manifest, tied to the exact revision and current engine.
- Wire the preview proposal through the current authenticated Studio revision/experiment path, with no automatic Keep and explicit original child text.
- Prove Create -> Play -> Request supported change -> Compare -> Keep or Undo -> Replay on desktop and tablet, plus unchanged support for Math/English and saved legacy games.
- Measure p50/p95 classification-to-preview and request-to-play, baseline defects, and failed edits; p95 under 10 seconds is a **target**, not a claim.

## Later PRs — gated
- **Portable mechanics**: require Issue #49's real rendered cross-game, sandbox-attested assembly proof before offering module injection, even when a PR #48 concept says `shared-prototype`.
- **Shadow prediction**: rank only edits actually supported by an exact manifest; use explicit, ephemeral game context first. Compare versus non-predictive baseline and measure latency savings, not suggestion clicks alone.
- **Selective prebuild**: only prepackage verified expensive capabilities after measurement; bounded per-game work, no silent paid inference, no child behavioral profiles or retention expansion.
- **Novel AI fallback**: stays on the already authorized provider, independent validation and family-budget route.

Release gates: exact-head CI, owner/revision isolation, atomic edits, backward-compatible saves, input/touch fidelity, gameplay validity, rollback, child-intent fidelity and guardian/privacy approval for any new child data.
