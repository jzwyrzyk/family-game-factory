# Objective 4 — Integrate child intent and game-form decisions into the existing private generator

**Scope:** Draft PR #43, research-only. The existing private worker / gateway / Responses API / sandbox / preview / revision system remains authoritative. **No new generator, repair engine, provider call, public release, keys, worker-image/trust modifications or altered curated games.**

## Problem

O1 preserved what the child requested; O2 chose a proposed minimum adequate game architecture; O3 built executable authored reference scenarios. Until O4, the real private agent used a separate preliminary O0 word-based selector, so passing O1–O3 tests did not mean actual creation would follow them.

**O4's goal:** One existing generation/repair call consumes the O1/O2 recommendation with O3's functional criteria still explicitly `NOT_TESTED`, and the normal authorized pipeline still produces a playable revision with safe Keep/Undo and transparent error states.

## Integration design

**One canonical private preflight:** `server/quality/private-generation-preflight.ts` uses the already-authorized `AgentInput.childIntent` and server-owned base revision. It executes the O1 source/quote validator and O2 form decision, returning a bounded proposal with source SHA-256, exact word spans, unresolved semantics, script-vs-physics decision, input affordance and O3-style pending workability checks. It does not claim a completed game or child confirmation.

**Existing model call unchanged:** `server/agent/openai.ts` now supplies this validated preflight as `gameDesignPreflight` in the existing `Responses API` request, alongside the unaltered `idea`. No additional provider request or external network action. Unneeded physics instructions are omitted for rule-driven ideas; actual physical requirements retain the frozen physics facade. If a design is underdetermined but not contradictory, the recommendation stays provisional rather than inventing child choices. A failed generation candidate does **not** get to decide the engine required for its own repair.

**Verified existing games, not guessed IDs:** `AgentInput.baseRevision` carries additive, server-generated `sourceGame` and `projectId` fields from the existing JobService and Actions coordinator. O4 uses the stored generated module or trusted native source-game/config to protect existing game form. Generated v1 retains its v1 repair contract; native hill and quality-v1 gum remain physical; older gum stays on its prior rules. A saved physical-to-scripted or scripted-to-physical change requires review rather than silently overwriting the prior version. Unknown base identity fails closed. The authenticated revision lookup, not O4's advisory module, still owns resource permissions.

**Honest pre-provider refusal:** true 3D (unsupported), contradictory physical requirements, uninspected bases and material saved-game architecture migrations return typed errors **before reading a provider key or calling a model**. The existing worker report allowlist preserves the new safe error codes; O4 adds no public identifiers or child text to logs. This does not claim that every ambiguous idea is correctly understood.

**No new readiness/publishing route:** Existing job, preview, Keep/Undo/Fork, family session authorization, budget reservation, OIDC/private worker trust and trusted sandbox gates stay unchanged. O4 does not silently flag a game as verified merely because a source compile succeeded.

## Evidence in the draft PR

1. `tests/private-generation-preflight.test.ts` tests exact O1 source-backed proposals, O2 game-form selection, native/saved/legacy version preservation, unsupported/contradictory requests rejected before keys or network, and one-producer mock Responses call for script versus physical instructions.
2. A synthetic, unit-only `JobService` integration tests a child's sticker-rocket Create → testing → *ready* revision → explicit Keep → requested faster launch with changed source → explicit Keep → Undo/Fork. The fixture gate emits synthetic attestations on **whitelisted hand-authored source only**; it is NOT a production security test or evidence of real-browser play.
3. `tests/actions-e2e.ts` extends the existing desktop/mobile real-browser, authenticated Actions fixture journey, with actual authored preview interaction, generation repair, learning and revisions, to confirm the O1/O2 guidance reaches **the existing worker claim/provider transport**. This fixture journey already uses Hopper/Rainbow Trail v1 examples; O3 separately tests new sticker/robot/v2 physics authored logic. These are not real paid model outputs.
4. All tests are wired into existing CI, not into an independent pipeline. The real private isolated worker continues to pin its existing approved public source; **a merge of this draft alone would not activate it.**

## Critical boundaries and unresolved questions

- **No arbitrary new game has been shown to satisfy its exact intent in a real browser.** O5 will run an independent rendered gameplay judge with input and outcome evidence; O6 will prove objective repair, not just invoke a retry.
- **O3's contract is not automatically authored for arbitrary ideas.** The generator gets explicit `workability.status=NOT_TESTED` and pending criteria. False successes require O5 fail-closed play evidence, not a new fabricated model score.
- **Lexical inference may miss unusual language**, speech errors, vague mechanics and mixed styles. We cannot call this validated semantic understanding because test fixtures pass.
- **The trusted base identity is additive private server metadata only.** Clients cannot submit their own native game ID and bypass authenticated ownership; any new persisted fields would need an independent migration/security review.
- **Unsafe/unsupported design requests fail after the original job was acknowledged in the production Actions route.** No model call occurs for an early preflight rejection, but existing conservative job ledger accounting remains in effect and the client currently shows a general failed-job state. More nuanced pre-submit feedback is a separate future usability/operations consideration, not a reason to weaken trust checks.
- Do not change the frozen runtime, public user session, Actions refs, gVisor, WIF, credentials, payment authorization or production flag in this PR.
- No public community, crowdsourced games, behavioral inference or new child telemetry.

## Acceptance criteria

- Strict TypeScript build and all mandatory unit/contract checks pass on the exact reviewed commit.
- Existing desktop/mobile authenticated Actions browser journey still produces a real playable preview with required learning, a changed revision, Keep/Undo, isolation and errors handled; it receives the canonical preflight and never claims `workability` passed.
- Baseline creative/gameplay, learning, Studio and visual regression workflows remain green; no worker trust/source pin change.
- If an error is encountered, retain its evidence and either correct it within O4 scope or report BLOCKED. O4 is **not** complete merely because a preflight object exists.

**Next after O4 acceptance: O5 — independent input-driven validation of actual generated gameplay against child intent, including intentionally broken cases.** O6 then strengthens the existing bounded repair loop using those diagnostics.
