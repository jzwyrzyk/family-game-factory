# Creation Studio acceptance evidence

## Responsive coding workspace · November 25, 2026

**Reproduction.** The merged PR134 layout on main `13260750b7771beb024cc6a94bf823ee5a4e29ff` allocated a 255px lower dock on both desktop sizes and the landscape tablet. The fixed-height heading, cast and event rows left 77px for two independently scrolling columns. Smaller screens put the palette below the initial scroll position. A DOM-visible button satisfied the former test even when its center or edges were clipped. The table records initial access without moving a scrollbar.

| Viewport (CSS px) | Before, reachable | Corrected code pane (CSS px) | Corrected, reachable | Actual viewport captures |
| --- | ---: | ---: | ---: | --- |
| 1440 × 900 | 0/6 | 702 × 737 | 6/6 | [Before](evidence/responsive-code/1440x900-before.png) · [Code](evidence/responsive-code/1440x900-code.png) · [Edited](evidence/responsive-code/1440x900-edited.png) |
| 1366 × 768 | 0/6 | 665 × 605 | 6/6 | [Before](evidence/responsive-code/1366x768-before.png) · [Code](evidence/responsive-code/1366x768-code.png) · [Edited](evidence/responsive-code/1366x768-edited.png) |
| 1024 × 768 | 0/6 | 494 × 605 | 6/6 | [Before](evidence/responsive-code/1024x768-before.png) · [Code](evidence/responsive-code/1024x768-code.png) · [Edited](evidence/responsive-code/1024x768-edited.png) |
| 768 × 1024 | 0/6 | 744 × 552 | 6/6 | [Before](evidence/responsive-code/768x1024-before.png) · [Code](evidence/responsive-code/768x1024-code.png) · [Edited](evidence/responsive-code/768x1024-edited.png) |
| 820 × 1180 | 2/6 | 796 × 653 | 6/6 | [Before](evidence/responsive-code/820x1180-before.png) · [Code](evidence/responsive-code/820x1180-code.png) · [Edited](evidence/responsive-code/820x1180-edited.png) |
| 844 × 390 | 0/6 | 828 × 262 | 6/6 | [Before](evidence/responsive-code/844x390-before.png) · [Code](evidence/responsive-code/844x390-code.png) · [Edited](evidence/responsive-code/844x390-edited.png) |
| 390 × 844 | 0/6 | 374 × 564 | 6/6 | [Before](evidence/responsive-code/390x844-before.png) · [Code](evidence/responsive-code/390x844-code.png) · [Edited](evidence/responsive-code/390x844-edited.png) |
| 320 × 667 | 0/6 | 304 × 387 | 6/6 | [Before](evidence/responsive-code/320x667-before.png) · [Code](evidence/responsive-code/320x667-code.png) · [Edited](evidence/responsive-code/320x667-edited.png) |

**Acceptance method.** Use the production build and `npm run test:creation-learner`. The suite checks the pane against the available grid after navigation, intersects each action with its viewport and clipping ancestors, and hit-tests the center and four interior corners. All six tiles must pass immediately. Each subsequent target must pass before activation. Long content is reached using wheel input or Chromium touch swipes. Touch viewports dispatch taps and drags at measured coordinates. Native input and select controls receive keyboard input after the pointer selects them.

Every size exercises the six-action palette, directional and numeric changes, selected-block controls, sequence reordering, Undo, visible authored speech, movement, nested actions, Keep and reopen. The suite also runs challenge correction, More tools with a complex imported scene, learning interruption and fullscreen refusal/native recovery. Phone and landscape tablet additionally exercise a longer double Repeat, removal, Undo and rotation. An isolated Chromium profile exercises 150% browser zoom and restoration. Authoring, storage/recovery, ownership and security assertions in the existing suites still apply.

**Stage sizing.** This updates the November 22 stage-first criterion. On a 1440px-wide desktop, equal panes leave about 698px for the fitted canvas after borders. The former 700px editing minimum would consume the code pane’s share. The new desktop floor is 695 × 390; the landscape tablet floor increases from 440 × 240 to 480 × 270. Portrait tablet tests use explicit 35/65 rows and their own fitted-canvas floors. Phone floors apply in Play. Expanded mode gives the entire grid to the stage, retains its aspect ratio and preserves the project when the browser exits or refuses fullscreen.

Local verification passed on all eight listed viewports, including the menu route back into Coding. The production build, 85 Creation Studio tests, both existing authoring/ownership browser journeys, eight backup-recovery journeys and the problem-solving browser suite also passed. The screenshots use synthetic local scenes. Owner visual and interactive approval, physical-device use and release remain pending.

## Four-experience integration review — November 22, 2026

[PR134](https://github.com/jzwyrzyk/family-game-factory/pull/134) is the consolidated release vehicle for the first-learner UI, approved Pal scene compositing and the three game overhauls. The original candidate records below retain their source scope. The integration's creation recovery test now targets the challenge Help disclosure directly (`#creationChallengeBrief .creation-goal-help > summary`), preserving both Help and its nested **What is checked?** disclosure. Its eight production-browser recovery journeys pass locally, including corrupt export, exact-byte rollback, hint retention, legacy replacement and explicit draft recovery. Current final-head CI, visual acceptance and merge/deployment status belong in [delivery state](../../DELIVERY-STATE.md).

**Current disposition:** the private-art capability below subsequently merged in [PR23](https://github.com/jzwyrzyk/family-game-factory/pull/23). [Delivery state](../../DELIVERY-STATE.md#pr23-art-studio--merged) records that exact-source merge and hosted acceptance. The dated development records below retain their original source and test scope; acceptance of the later first-creation reconciliation with main is recorded separately in the current delivery section.

## First-learner coding UI candidate — November 22, 2026

**Disposition:** implementation candidate; local non-browser checks passed, hosted browser journeys and composed viewport review pending. No merge or deployment is recorded here.
**Stack base:** [PR125](https://github.com/jzwyrzyk/family-game-factory/pull/125), source `1340d041145ffba4322ccb8262188b7cf2c7b6c4`.
**Decision:** [First-learner coding](../decisions/2026-11-22-first-learner-coding.md).

The candidate gives the scene a larger fitted stage, a compact First steps action dock and selected-block controls, while retaining More tools for the full saved language. It keeps exact custom values and start/tap programs, shortens the challenge presentation, places feedback beside the stage, and supplements canvas speech/counters with readable DOM output. Shared PR125 narration, learning/profile guards, scene recovery and explicit Keep remain required integration checks.

Pal paper removal is bounded scene-renderer compositing of approved loaded images. Original RGB, source assets and immutable actor references remain unchanged. There are no generated replacement portraits or new asset files in this scope. Roster-wide visual acceptance requires checking all 48 approved Base/Grown pictures against contrasting backgrounds; that claim remains pending until evidence is recorded.

### Local candidate checks

The following checks passed on the working implementation derived from the stack base above, before its initial hosted candidate. The eventual published source SHA and hosted run identities must be recorded separately; these results do not establish browser rendering or acceptance of a later changed source.

| Check | Observed result and scope |
| --- | --- |
| Production build and TypeScript check | Passed. The application compiles; this does not verify the fitted viewport or actual interaction. |
| `npm run test:creation` | **85/85 passed** across engine, behavioral challenges, storage, generated manifests, generation budgets and the new learner-control contracts. New cases exercise real directional trajectories, no-op movement, exact fractional/custom-value preservation, and intact nested actions/text. |
| `npm run test:unit` | **393/393 passed** in the existing unit suite. These are local software contracts, not live-provider or device observations. |
| Focused `pals-creation.test.ts` and `pal-scene-image.test.ts` checks | **22/22 passed**, including five playback-preparation cases for shared/hidden-actor loads, stale scenes, cancelled/late decodes, timeout/reopen recovery and invalid decoded bitmaps. Other cases cover exact Pal bindings, source/owner/recovery preservation, bounded transient compositing and synthetic alpha/RGB invariants. Simulated image/canvas behavior does not replace the full-roster visual review. |

### Browser and visual acceptance still required

| Acceptance criterion | Required observation | Current evidence |
| --- | --- | --- |
| Stage, readability and navigation | Desktop, tablet, narrow phone and short landscape; useful stage area, readable labels, visible playback/exit/Keep/Undo, no horizontal overflow | Pending |
| Real beginner authoring | Add actions, edit direction/steps, reorder, repeat, choose start/tap, play and inspect execution highlight | Pending |
| Existing programs and storage | Custom values and absolute/nested programs survive mode changes, Keep/reopen, undo/redo, draft recovery and profile changes | Pending |
| Practice and feedback | Watch preserves editable scene; valid and invalid checks stay visible; hint provenance and equivalent-program behavior remain intact | Pending |
| Learning, reading and private artwork | Required checkpoint guards, persistent explicit reading, source-game return, exact private-art references, export/import and recording | Pending |
| Approved Pal rendering | Original RGB/source identity preserved, paper transparency bounded to supported images, all 48 neutral portraits inspected, loading/failure/cache disposal exercised | Pending |
| Remaining release-candidate regression | Existing authoring/recovery journeys and documentation checks on the published candidate; recheck any source changed after the local run | Pending |

The browser/visual table lists pending criteria, not passed checks. Record actual commands, source identity, capture provenance and remaining failures before updating those rows or claiming overall acceptance. Earlier green Creation, Pal or PR125 checks do not establish acceptance of this candidate. Browser emulation remains distinct from physical-device, observed-child, audible-voice and educational-efficacy evidence.

## Art Studio integration candidate — November 19, 2026

The refreshed drawing-to-playable branch integrates current Jems source from main
`df63bc2c7644a26a84a7c7e626b682e7c76c493d`. The checks below were run on the working
integration candidate; final PR-head CI and the combined build remain the merge
authority. The earlier PR62 records below retain their original scope.

| Check | Observed result and limit |
| --- | --- |
| `npm run test:creation` | All 77 existing engine, challenge, storage, generated-manifest and generation-budget checks passed. Private local IDs remain rejected by the generated-manifest validator. |
| `node --import tsx --test tests/creation-private-art.test.ts` | Six additional tests passed: opaque reference restrictions; local versus generated boundaries; immutable reuse in two scenes and copies; no cross-profile access, challenge credit or new execution authority; exact original RGB/maximum-alpha composition; and real CreationStore save/Keep/reload for restored 100-character source IDs while ordinary scene IDs remain capped at 160. |
| TypeScript and production build | Passed through the final Art Studio build, including strict private-reference bounds and the source-aspect follow-up. The [complete Art Studio evidence](../drawings/EVIDENCE.md) records final source/build identities. |
| `tests/creation-private-art-browser.cjs` desktop and tablet | Both full production-browser journeys passed again in the complete art command on `index-C7Ixev09.js`: upload synthetic artwork, save its cutout design, play and record that exact art, reuse the version in a second scene, export with original bytes, reject a changed rig hash before import, import as isolated copies into another profile, reload and render. Zero POSTs and page errors. |
| Failure/recovery assertions in that browser suite | Both devices passed deliberate scene-save quota failure with no orphan art reservation, deliberately delayed image decoding across a profile switch with no late scene/pixel leak, and genuine private-art WebM export. The fixture waits for recorded frames and releases all blocked decodes; earlier incomplete waits were test-fixture failures, not accepted application evidence. |
| Existing `npm run test:creation-browser` | Desktop and touch-emulated tablet authoring journeys passed against the combined production build, including actual block edits and playback, saved ownership, target reconstruction, tap behavior and learning guards. All eight backup-recovery journeys also passed: corrupt export, invalid input, atomic rollback, valid recovery, hint retention, legacy replacement, retired goals and explicit draft recovery. |

The new screenshot outputs are `test-results/art-in-scene-desktop.png` and
`test-results/art-in-scene-tablet.png`. Their stage shows a synthetic purple
character derived from its saved cutout and the real block editor; no child image
or private conversation is used. The review confirms the current Jems shell and
actual canvas artwork rather than a separate design mockup.

Private-art import is additive. The art transaction is all-or-nothing; saving the
separate scene afterward can still fail, in which case the visible message says
the art was imported but the scene was not saved. Usage indexing follows a
successful scene write, while retained scene history remains the authority for
deletion protection. These source/browser checks do not establish production
deployment, arbitrary generated-game art support, real-device performance,
universal drawing recognition, observed child enjoyment or learning efficacy.

## Earlier PR62 implementation and merge evidence

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

At 320 × 667 the regular First steps palette uses short direction labels and a three-column layout. Check all nine actions with the touch-screen reachability fixture while the challenge brief is open, including Jump in the middle row. Direction buttons retain their spoken Move labels.

The connected-universe Chromium journey draws and revises a synthetic crayon picture, selects its exact version from an illustrated world, keeps it as scenery, reuses the scenery with another cast, plays the movement, verifies the decoded pixels and records the stage. The permanent offline review includes editable original fixtures, a kept forest, independent reuse, a picture hunt and a two-part dragon. All fixtures use the private drawing, rig and scene stores in a separate synthetic browser namespace.
