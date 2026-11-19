# Creation Studio acceptance evidence

**Development date:** November 19, 2026 (America/New_York).

**Base:** `079978f3034e007e8bbad1f43571aaa7867b5098`, verified remote `main` when the isolated feature branch was created.

**Branch:** `feature/jems-creation-lab-20261119`.

**Disposition:** [PR #62](https://github.com/jzwyrzyk/family-game-factory/pull/62), merge preparation; no merge, deployment, provider activation, or private-worker source change.

The [feature contract](README.md) describes source behavior. [ADR0007](../decisions/0007-creation-and-rebuild-practice.md) records the owner direction. The initial local implementation candidate is `b7e8ec0302b5fdfc89917c97282e5f5823e2a7af`. Build, the 61 creation tests, both creation browser suites, 296 existing unit tests, 31 Studio unit tests, existing Studio browser journeys and the exact-base/head documentation check passed on that candidate. Its later evidence commit changes only documentation, screenshots and review metadata; the resulting tree was published as `f44061fb842380a260f3ca178e6d61f4d5f22a5f`. The learning integration suite passed during initial development before that candidate; it is recorded separately from exact-candidate evidence. The merge-hardening record below supersedes the initial candidate for readiness. Remote CI belongs to the actual PR head.

## Local checks and evidence

| Claim | Check | Observed result and limit |
| --- | --- | --- |
| Strict data model and actual bounded execution | `npm run test:creation` | 61 tests passed: 14 engine, 25 behavioral challenge, 16 storage/observation, 6 generated companion. These are software checks, not learning validation. |
| Existing generation, identity, revisions and product contracts | `npm run test:unit` | 296 tests passed, with no live model calls. |
| Existing Studio ownership and supported edits | `node --import tsx tests/studio-unit.ts` | 31 tests passed. |
| Integrated scene creation | `npm run test:creation-browser` | Production bundle passed at 1440×1080 desktop and 820×1180 touch-emulated tablet. No page errors or paid requests observed. Actual tablets and children were not tested. |
| Family backup and support recovery | `node tests/creation-recovery-browser.cjs` | Seven grouped browser checks passed: actual export, invalid input refusal, corrupt raw preservation, rollback after a write fault, valid recovery, legacy replacement and retired-goal reopening. No page errors or paid requests observed. |
| Existing Studio journey | `node tests/studio-journey.cjs` | Desktop/mobile and remote transport fixture passed: experiments, explicit Keep, source state, undo/fork, profile isolation and failed-change preservation. Remote fixture is not a live provider. |
| Existing trusted learning behavior | `npm run test:learning-integration` | Desktop/mobile native and generated preview checkpoints, pause/resume, pacing, persistence/recovery and parent insights passed. |
| Production compilation | `npm run build` | TypeScript and Vite production build passed. Vite retains a large-bundle advisory; no claim of performance on a physical device. |
| Shared validator image dependencies | Bundle gateway and preview from their Docker COPY source inputs, with installed packages external | Both entrypoints resolved all local dependencies. This is a source-dependency check, not an actual container launch or deployed image test. |

The system Chromium binary could not launch in the command sandbox because its profile singleton socket was denied. The automatic approval policy rejected an outside-sandbox retry. The installed Playwright headless shell ran successfully in the normal sandbox using the existing `CHROMIUM_PATH` test override. No environment policy was changed.

## What the scene browser journey actually does

The browser test edits through the public controls; the `FG.creation` inspection helpers only read results. It verifies:

- Existing Dragon game → Animate & code → source-pinned scene → original game. The original game workspace remains unchanged, and repeating the entrance resumes the same scene.
- Start a blank scene; add/edit movement and speech, reorder actions, undo, build a nested repeat, play, pause, step, keep, reload and reopen the authored version.
- Download the actual editable JSON and a finalized canvas video. The inspected sample video is VP9, 800×450, approximately one second. Recordings are silent; speech bubbles remain visual text.
- Switch players, inspect the absence of the other player's content, and return. The responsive profile menu stays inside the tablet viewport.
- Watch a target without replacing the editable scene. Build a three-bounce solution using blocks; verify success, then change it to two bounces and verify specific feedback.
- Author tap behavior and both branches of a variable condition. Check both successful and incorrect boundary behavior.
- Open a hint, reload, and verify its support flag remains recorded. Observe specific saved checks in the current profile's My Powers panel.
- Open a real host learning checkpoint and verify Play, Step and other scene actions cannot dismiss or bypass it. Leaving uses the existing interruption policy.

Tests deliberately satisfy the ordinary pacing budget for unrelated editing/history steps, then exercise real host checkpoint guards separately. The challenge evaluator tests multiple distinct input cases rather than only the target replay timing.

Screenshots and machine-readable results are generated under `test-results/creation-*`; the existing CI artifact step collects them. Screenshots contain synthetic fixtures and bundled game artwork. They do not contain private child conversations or signed preview capabilities.

## Recovery and compatibility acceptance

The creation store rejects malformed/future schemas, preserves original bytes, prevents stale version writes, and leaves saved revisions intact on write failure. Family backups include the validated creation workspace. A damaged workspace can still be exported as a clearly identified recovery string; it cannot masquerade as a valid restore. Restoring a valid backup can replace damaged scene data, with the original bytes available for rollback. An older family backup with no scene field restores an empty scene workspace rather than attaching unrelated prior scenes to reused profile IDs.

Old generated games continue to validate without a companion manifest. The authenticated companion endpoint returns `null` when one is absent. New manifests have no executable payload or external asset URL, preserve the published value, and are marked assisted. Tests cover foreign-family/adult access denial, revocation and stale browser responses; they do not establish live provider output quality.

## Remaining acceptance boundaries

- This is a first editable creation system, not full Scratch compatibility or arbitrary JavaScript-to-block conversion. Curated adapters preserve supported assets/settings; generated companions are explicit optional data.
- Editing a scene does not rewrite its source game's code, physics or saved revision. Conversation-to-block editing and broader shared game semantics remain future work.
- No actual child study, validated critical-thinking/computational-thinking scale, general mastery score, or educational-growth result is claimed.
- Physical tablet/browser accessibility and usability review, including prolonged sessions and recording support, remain release acceptance work. Touch emulation is scoped software evidence.
- No live model request, deployment or private-worker pin update occurred. Shipping the generation path would require the normal coordinated frontend/gateway/preview/worker release process.

## Initial candidate record

Final build and creation checks: **PASS**, implementation `b7e8ec0302b5fdfc89917c97282e5f5823e2a7af`. The browser journey also verifies that a direct tap on a completed scene opens a newly due host checkpoint, and subsequent Play, Step and target controls preserve that same activity.

- [Creation browser result](evidence/creation-browser-results.json) — desktop and touch-emulated tablet, zero page errors and paid requests.
- [Recovery browser result](evidence/creation-recovery-browser-results.json) — seven grouped recovery checks.
- [Dragon source scene, desktop](evidence/dragon-scene-desktop.png).
- [Rebuilt challenge, desktop](evidence/rebuild-challenge-desktop.png).
- [Conditional scene, touch tablet](evidence/condition-tablet.png).

CI results should be read at the exact PR head; earlier local or historical records do not replace failing current checks. No actual-device, live-provider, merge or deployment claim follows from this record.

## Merge preparation after the initial PR head

At initial published head `f44061fb842380a260f3ca178e6d61f4d5f22a5f`, GitHub passed [documentation](https://github.com/jzwyrzyk/family-game-factory/actions/runs/44471614344), [Game Intelligence contracts](https://github.com/jzwyrzyk/family-game-factory/actions/runs/44471614347), [visual review](https://github.com/jzwyrzyk/family-game-factory/actions/runs/44471614328), and [trusted-family security](https://github.com/jzwyrzyk/family-game-factory/actions/runs/44471614333). In [Arcade journeys run 44471614364](https://github.com/jzwyrzyk/family-game-factory/actions/runs/44471614364), browser, learning and inactive private-coach image jobs passed. The creative job passed creation contracts, creation desktop/tablet/recovery journeys and coach checks, then failed the existing child mobile first-viewport assertion. The initial head was therefore **not ready to merge**.

The focused merge review produced these corrections:

| Reproduced issue | Correction and regression evidence |
| --- | --- |
| The added home card put the first mobile game at y=654 with height=201 in an 844-pixel viewport. | Place the card after the starter shelf, retaining global Create & code navigation. The existing desktop/mobile child journey and build-continuity suite then passed. |
| Reopening an unfinished scene after global navigation and profile switching allowed a new edit to replace the sole recovery draft. | Require Resume my draft or Use saved version before changes, checks, playback, Keep, copy or history. The eighth recovery-browser journey preserves the exact original data through blocked actions and exercises both choices. |
| A scene could pass validation before assisted attribution, exceed the limit after attribution, and fail its next validation; character count also undercounted Unicode bytes. | Apply attribution before the 32,000-byte UTF-8 check. Focused cases cover stable repeated validation, attribution overflow and multibyte text. |
| A 28,000-byte source plus a valid companion produced more than 50,000 bytes and caused the unchanged sandbox worker to exit before testing. | Hold the companion in trusted host state and send executable fields only. Verify the compiled source, reject injected companion/source substitutions, then restore the original manifest. Worker stdin/resource limits and runtime archives remain unchanged. |
| Optional companion overhead made previously admitted 8 KB rule-driven builds, 7 KB repairs, and 6.5 KB physical-game bases exceed the existing 24,000 input bound. | Select the game-only request before key access when optional companion overhead exceeds the input or remaining-spend allowance. Keep the entire game/intent/repair context, count schema bytes, make one selected call, and deny requests that still exceed the unchanged caps. |

The provider and Docker transport regressions use explicit stubs; they do not claim a paid generation or real container launch. Final local candidate and new-head CI evidence are recorded below and in PR #62. The original CI failure remains part of this record.

### Verified local hardening candidate

The local implementation candidate is **`6f5177eff1943c8b6d094162771d35faf17b86d8`**. The production build, **72/72 creation tests**, **296/296 existing unit tests**, desktop and touch-emulated tablet authoring journeys, and **eight recovery journeys** passed against its application changes. The focused budget/pilot/preflight run passed 22 tests (including the eight budget tests already included in the creation total). The existing child-journey/build-continuity suite passed after the mobile card fix, before the final creation-recovery/server changes; final-head CI supplies the complete combined regression gate. Documentation and diff checks passed.

- [Hardening check record](evidence/merge-hardening-results.json).
- [Updated creation browser result](evidence/merge-creation-browser-results.json).
- [Updated recovery browser result](evidence/merge-creation-recovery-results.json).

A later evidence-only commit adds this record without changing application/test behavior. The connected GitHub publication may have a different commit ID; PR #62 records the exact matching tree and its new-head CI. All candidate-specific failures and earlier results above retain their original scope.

### Integration with the latest main

During merge preparation, main advanced to **`8b915b26e1f4be4b1523b6803cb6549d228f3e83`**, merging PR61. This branch retains its private-coach build-verification correction, focused regression and dated image-recovery document. Only the documentation review registry conflicted; the resolution preserves Creation Studio routing/reviews and refreshes the delivery fingerprint against both sets of source changes. No Creation Studio application or test file changed during this main integration. The eight focused private-coach deployment tests pass after integration, including rejection of unexpected executable settings. Final PR-head CI must include this combined tree.


### Integration with Gem Factory and mandatory quality review

Published head `aa60b751eba40f2ff8ff24aacf4c164e389bff46` passed all five workflows and eleven jobs against main `8b915b26e1f4be4b1523b6803cb6549d228f3e83`: [Arcade journeys](https://github.com/jzwyrzyk/family-game-factory/actions/runs/44474316742), [documentation](https://github.com/jzwyrzyk/family-game-factory/actions/runs/44474316727), [family security](https://github.com/jzwyrzyk/family-game-factory/actions/runs/44474316717), [Game Intelligence](https://github.com/jzwyrzyk/family-game-factory/actions/runs/44474316847), and [visual review](https://github.com/jzwyrzyk/family-game-factory/actions/runs/44474316751). During the final readiness check, main advanced again to **`02bdb58d17d5687e39ab20bd884f02a18007ede5`**, merging PR58. Those green runs remain evidence for their earlier base; the integrated candidate requires new-head CI.

The semantic merge preserves the new generation contract rather than selecting either side of its conflicting files:

- Generated assets, production plan, ordinary-input playthrough and optional creation manifest are all validated and preserved. The companion stays outside sandbox stdin; source, assets, plan and playthrough retain their attestations. Requested quality evidence is validated and delivered to the mandatory review/publication path.
- Main's quality runtime archives, 4 MiB worker input and 10 MiB sandbox output limits remain intact. The earlier 50,000-byte regression above describes the earlier runtime; the current creation change does not increase these merged limits.
- Optional companion fallback selects a single **source-generation** request while retaining production/art context, the playthrough schema and required desktop/tablet repair captures. Planning, optional approved art and independent review retain their existing calls, approval and spending checks. The companion adds no call or retry; a whole v2 build is no longer described as one provider call.
- Gem Factory and Hill have no curated scene adapter. Animate & code now reports that limitation in the visible Studio instead of swallowing the error in a hidden Creation page. Source revisions and scene storage remain unchanged, and free creation is still available.
- The still-unmerged Creation decision is renumbered **ADR0007**; merged style-quality **ADR0006** and its rationale are retained.

The combined application build and TypeScript check pass with production bundle **`index-cszUlGZq.js`**. **77 creation tests** and **354 existing unit tests** pass. A focused generation run passes 40 tests (nine budget, fourteen presentation, three illustrations, six pilot and eight preflight; these overlap the larger totals). Thirteen creation-generated checks include real raster bytes with synthetic quality captures, mutation/stale-binding rejection and companion retention through mandatory quality review. They use stubs and do not claim paid generation or a real container launch.

The production Creation browser suite passes 19 listed checks in each of desktop 1440×1080 and touch-emulated tablet 820×1180, with reduced motion. The eight grouped recovery journeys pass. Both preserve zero unhandled page errors and zero paid requests. Source identity, browser results and any additional child/native-game observations are recorded in the integration evidence files and PR62's exact-head checks. Actual devices, live providers, child enjoyment and educational benefit remain outside these results.


**Verified combined implementation:** [`0fc798d8e2131d9ffc1ee42afc1b248d3e04f489`](https://github.com/jzwyrzyk/family-game-factory/commit/0fc798d8e2131d9ffc1ee42afc1b248d3e04f489), whose complete tree `d5afceaaab0563711f91227cc56230e9190be9ee` matches local implementation `5c4717224b08004256706ae79498c24524b752de`. The existing child journey/build-continuity suite passes on desktop/mobile, and Gem Factory passes desktop/tablet/phone plus reduced-motion play. The evidence commit changes documentation/results only; source and test behavior remain identical. Final-head CI is recorded on PR62, separately from these local observations.

- [Combined integration result](evidence/gem-integration-results.json).
- [Desktop/tablet authoring result](evidence/gem-integration-browser-results.json).
- [Recovery result](evidence/gem-integration-recovery-results.json).


### Confirmed source merge

Following the owner’s push-and-merge instruction, the source measurement audit confirmed the scope described in the feature contract. [PR62](https://github.com/jzwyrzyk/family-game-factory/pull/62) merged at **07:50:41 America/New_York on November 19, 2026** as [`c4ce21be410e7fccb16922c4711f4c4172edbc7e`](https://github.com/jzwyrzyk/family-game-factory/commit/c4ce21be410e7fccb16922c4711f4c4172edbc7e). GitHub reports merged/closed, and fetched main's complete tree `256a14cd3d8cb4487da2216b440cc11ffb04623b` exactly equals reviewed head `8e305150b9811479d866bae7e252c59b4045bbbf`.

Final-head [Arcade](https://github.com/jzwyrzyk/family-game-factory/actions/runs/44477137111), [visual](https://github.com/jzwyrzyk/family-game-factory/actions/runs/44477137160), [security](https://github.com/jzwyrzyk/family-game-factory/actions/runs/44477137219), [Game Intelligence](https://github.com/jzwyrzyk/family-game-factory/actions/runs/44477137248), [documentation](https://github.com/jzwyrzyk/family-game-factory/actions/runs/44477137125), and the later [documentation recheck](https://github.com/jzwyrzyk/family-game-factory/actions/runs/44478758824) all passed. The earlier same-head duplicate [push Arcade run](https://github.com/jzwyrzyk/family-game-factory/actions/runs/44477130016) is canceled, not counted as a pass. No review submissions or unresolved threads were present at the merge check.

The merged source provides specific algorithmic challenge checks and history, alongside existing adaptive subject engines. It does not continuously assess general reasoning from conversation/free creation or adapt the five Creation challenges. This receipt changes documentation only and records no deployment, paid call, live-provider result, physical-device acceptance or educational-efficacy claim.
